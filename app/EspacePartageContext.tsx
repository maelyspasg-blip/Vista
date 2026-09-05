import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import {
  CategorieFusionnee,
  chargerDonneesPartenaire,
  chargerEvenementsPartenaire,
  chargerHistoriqueMoisPartenaire,
  DonneesPartenaire,
  EvenementPartenaire,
  fusionnerCategoriesParNom,
  getMembreEspace,
  ModeBalance,
  modifierModeBalanceEspace,
  SnapshotMoisPartenaire,
} from "../utils/espacePartage";
import { useObjectifs } from "./store";

// RÈGLE À NE JAMAIS CASSER — RESTE DERRIÈRE estEspacePartageActif : ce
// Provider n'est monté dans app/_layout.tsx que si
// utils/premium.ts:estEspacePartageActif(isAdmin) est vrai (ESPACE_PARTAGE_ACTIF
// pour tout le monde, ou compte admin même en bêta) — pour tout autre
// compte, ce contexte n'existe pas du tout dans l'arbre, aucun écran ne
// peut donc en dépendre par accident. Un écran qui utilise useEspacePartage()
// hors de ce Provider retombe silencieusement sur les valeurs par défaut
// ci-dessous (estDansUnEspace: false) plutôt que de planter — jamais de
// throw, cf. RÈGLE générale du projet (CLAUDE.md).

export type VueEspacePartage = "personnel" | "partage";

export type MembrePartenaire = {
  id: string;
  prenom: string | null;
};

type EspacePartageContextType = {
  estDansUnEspace: boolean;
  espaceId: string | null;
  membrePartenaire: MembrePartenaire | null;
  vueActive: VueEspacePartage;
  setVueActive: (vue: VueEspacePartage) => void;
  // RÈGLE : recharge impérative de estDansUnEspace/espaceId/membrePartenaire
  // depuis Supabase — nécessaire car le Provider ne les charge qu'au
  // montage/changement de userId (cf. useEffect plus bas) ; un événement
  // qui change l'appartenance à un espace APRÈS le montage (rejoindre/
  // quitter depuis profil.tsx, ou l'app qui revient au premier plan après
  // que le partenaire a rejoint pendant qu'elle était en arrière-plan) ne
  // déclenche jamais cet effet tout seul. À appeler explicitement après ce
  // type d'action plutôt que d'attendre un remount.
  rafraichirEspace: () => Promise<void>;
  // RÈGLE À NE JAMAIS CASSER — CHARGÉES UNE SEULE FOIS, ICI, JAMAIS PAR
  // ÉCRAN : vueActive est désormais un switcher global (cf. correction qui
  // a retiré le doublon de Budget) — les données du partenaire doivent donc
  // suivre la même logique : un seul chargement partagé par tout l'arbre
  // (Aperçu, Stats, futur Planning) plutôt qu'un fetch dupliqué par écran à
  // chaque changement d'onglet. `null` tant que non chargé/vue "personnel".
  donneesPartenaire: DonneesPartenaire | null;
  chargementPartenaire: boolean;
  // RÈGLE : chargés EN MÊME TEMPS que donneesPartenaire (même effet, même
  // chargementPartenaire) plutôt qu'un second cycle de chargement séparé —
  // cf. app/(tabs)/planning.tsx, seul consommateur actuel. Tableau vide hors
  // vue "partage"/hors espace actif, jamais `null`.
  evenementsPartenaire: EvenementPartenaire[];
  // RÈGLE : à appeler après une fusion/modification/suppression d'un
  // événement du partenaire (app/(tabs)/planning.tsx) — ces écritures
  // passent par utils/espacePartage.ts (modifierEvenementPartenaire/
  // supprimerEvenementPartenaire/fusionnerEvenements), jamais par le store
  // local, donc rien ne redéclenche l'effet de chargement ci-dessus tout
  // seul. Recharge uniquement les événements (pas les enveloppes), plus
  // léger qu'attendre un aller-retour complet de vueActive.
  rafraichirEvenementsPartenaire: () => Promise<void>;
  // RÈGLE À NE JAMAIS CASSER — SOURCE UNIQUE DE LA FUSION PAR NOM, CALCULÉE
  // ICI ET NULLE PART AILLEURS : cf. RÈGLE détaillée sur
  // fusionnerCategoriesParNom (utils/espacePartage.ts). Mémoïsée, recalculée
  // uniquement quand ses entrées changent — jamais recalculée localement par
  // un écran consommateur (Aperçu, Budget...). Tableau vide hors vue
  // "partage"/hors espace actif, jamais `null` (simplifie les consommateurs :
  // toujours un tableau à mapper).
  categoriesFusionnees: CategorieFusionnee[];
  // RÈGLE : chargé EN MÊME TEMPS que donneesPartenaire/evenementsPartenaire
  // (même Promise.all, même chargementPartenaire) — cf. RÈGLE détaillée sur
  // chargerHistoriqueMoisPartenaire (utils/espacePartage.ts). Tableau vide
  // hors vue "partage"/hors espace actif, jamais `null`, même convention que
  // evenementsPartenaire/categoriesFusionnees.
  historiqueMoisPartenaire: SnapshotMoisPartenaire[];
  // RÈGLE À NE JAMAIS CASSER : réglage DU COUPLE (posé sur espaces_partages),
  // jamais par compte — cf. RÈGLE détaillée sur ModeBalance (utils/
  // espacePartage.ts). "50_50" par défaut tant que non chargé/hors espace.
  modeBalance: ModeBalance;
  ratioPersonnalise: number;
  // RÈGLE : passe par la RPC modifier_mode_balance_espace (jamais un update
  // direct) — met à jour l'état local de façon optimiste après succès,
  // jamais avant (pour ne pas afficher un mode qui pourrait échouer à
  // s'enregistrer côté serveur).
  changerModeBalance: (mode: ModeBalance, ratio: number) => Promise<boolean>;
};

const EspacePartageContext = createContext<EspacePartageContextType>({
  estDansUnEspace: false,
  espaceId: null,
  membrePartenaire: null,
  vueActive: "personnel",
  setVueActive: () => {},
  rafraichirEspace: async () => {},
  donneesPartenaire: null,
  chargementPartenaire: false,
  evenementsPartenaire: [],
  rafraichirEvenementsPartenaire: async () => {},
  categoriesFusionnees: [],
  historiqueMoisPartenaire: [],
  modeBalance: "50_50",
  ratioPersonnalise: 0.5,
  changerModeBalance: async () => false,
});

function cleVueActive(userId: string): string {
  return `vista_vue_active_${userId}`;
}

export function EspacePartageProvider({
  userId,
  children,
}: {
  // RÈGLE : `null` tant que la session n'est pas résolue (même convention
  // que etat.userId dans app/store.ts) — le Provider attend un userId
  // réel avant d'aller chercher quoi que ce soit, jamais un appel
  // Supabase à l'aveugle.
  userId: string | null;
  children: React.ReactNode;
}) {
  const [estDansUnEspace, setEstDansUnEspace] = useState(false);
  const [espaceId, setEspaceId] = useState<string | null>(null);
  const [membrePartenaire, setMembrePartenaire] =
    useState<MembrePartenaire | null>(null);
  const [vueActive, setVueActiveState] = useState<VueEspacePartage>("personnel");
  const [donneesPartenaire, setDonneesPartenaire] =
    useState<DonneesPartenaire | null>(null);
  const [evenementsPartenaire, setEvenementsPartenaire] = useState<
    EvenementPartenaire[]
  >([]);
  const [historiqueMoisPartenaire, setHistoriqueMoisPartenaire] = useState<
    SnapshotMoisPartenaire[]
  >([]);
  const [chargementPartenaire, setChargementPartenaire] = useState(false);
  const [modeBalance, setModeBalance] = useState<ModeBalance>("50_50");
  const [ratioPersonnalise, setRatioPersonnalise] = useState(0.5);
  const objStore = useObjectifs();

  // RÈGLE À NE JAMAIS CASSER — TOUT RÉINITIALISER SI userId CHANGE (jamais
  // seulement au premier montage) : un changement de userId signifie soit
  // une déconnexion (userId → null : tout doit revenir aux valeurs par
  // défaut, jamais laisser les données de l'ancien compte visibles) soit
  // une reconnexion sur un AUTRE compte — même risque de fuite entre
  // comptes déjà traité pour etat.userId dans app/store.ts
  // (reinitialiserEtatUtilisateur). `annule` protège contre une réponse
  // tardive d'un ancien effet qui écraserait l'état du nouveau compte.
  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation synchrone volontaire à la déconnexion (userId passe à null), même besoin que reinitialiserEtatUtilisateur dans app/store.ts : jamais laisser les données d'un compte précédent visibles, même une frame.
      setEstDansUnEspace(false);
      setEspaceId(null);
      setMembrePartenaire(null);
      setVueActiveState("personnel");
      setModeBalance("50_50");
      setRatioPersonnalise(0.5);
      return;
    }

    let annule = false;

    AsyncStorage.getItem(cleVueActive(userId))
      .then((valeur) => {
        if (annule) return;
        if (valeur === "partage" || valeur === "personnel") {
          setVueActiveState(valeur);
        }
      })
      .catch(() => {
        // Best-effort : une erreur de lecture locale retombe simplement
        // sur "personnel" (déjà la valeur par défaut de ce state).
      });

    getMembreEspace()
      .then((etat) => {
        if (annule) return;
        // RÈGLE À NE JAMAIS CASSER : "en_attente" (créateur seul, personne
        // n'a encore rejoint) compte comme PAS ENCORE dans un espace pour
        // le reste de l'app — le switcher "Partagé" et toute la logique de
        // fusion n'ont aucun sens tant qu'il n'y a personne avec qui
        // fusionner. Seul "actif" (2 membres) active estDansUnEspace.
        if (!etat || etat.statut === "en_attente") {
          setEstDansUnEspace(false);
          setEspaceId(null);
          setMembrePartenaire(null);
          setModeBalance("50_50");
          setRatioPersonnalise(0.5);
          return;
        }
        setEstDansUnEspace(true);
        setEspaceId(etat.espaceId);
        const autreMembre = etat.membres.find((m) => m.userId !== userId);
        setMembrePartenaire(
          autreMembre
            ? { id: autreMembre.userId, prenom: autreMembre.prenom }
            : null,
        );
        setModeBalance(etat.modeBalance);
        setRatioPersonnalise(etat.ratioPersonnalise);
      })
      .catch(() => {
        // getMembreEspace() ne throw déjà jamais (cf. RÈGLE dans
        // utils/espacePartage.ts) — filet de sécurité pur.
      });

    return () => {
      annule = true;
    };
  }, [userId]);

  // RÈGLE : recharge impérative — volontairement une fonction SÉPARÉE de
  // l'effet de montage ci-dessus (qui reste protégé par `annule` contre une
  // réponse tardive lors d'un changement rapide de compte) plutôt qu'une
  // factorisation complète : un appel impératif (après une action locale,
  // ou depuis le listener AppState ci-dessous) n'a pas besoin de ce
  // garde-fou — l'appelant sait déjà que `userId` est le bon au moment de
  // l'appel. Même logique de statut "en_attente"/"actif" que l'effet de
  // montage, cf. RÈGLE juste au-dessus. Enveloppée dans useCallback([userId])
  // pour garder une identité stable entre deux rendus tant que userId ne
  // change pas — nécessaire pour satisfaire exhaustive-deps sur l'effet
  // AppState ci-dessous sans le re-abonner à chaque rendu.
  const rafraichirEspace = useCallback(async () => {
    if (!userId) return;
    try {
      const etat = await getMembreEspace();
      if (!etat || etat.statut === "en_attente") {
        setEstDansUnEspace(false);
        setEspaceId(null);
        setMembrePartenaire(null);
        setModeBalance("50_50");
        setRatioPersonnalise(0.5);
        return;
      }
      setEstDansUnEspace(true);
      setEspaceId(etat.espaceId);
      const autreMembre = etat.membres.find((m) => m.userId !== userId);
      setMembrePartenaire(
        autreMembre
          ? { id: autreMembre.userId, prenom: autreMembre.prenom }
          : null,
      );
      setModeBalance(etat.modeBalance);
      setRatioPersonnalise(etat.ratioPersonnalise);
    } catch (e) {
      // getMembreEspace() ne throw déjà jamais (cf. RÈGLE dans
      // utils/espacePartage.ts) — filet de sécurité pur.
      console.error("rafraichirEspace a échoué :", e);
    }
  }, [userId]);

  // Recharge automatiquement quand l'app revient au premier plan — cas
  // typique : le partenaire rejoint l'espace pendant que cette app est en
  // arrière-plan, rien ne le saurait sinon avant un remount complet. Même
  // pattern etatAppRef que app/(tabs)/budget.tsx (réalignement sur le mois
  // courant au retour au premier plan) — repris ici à l'identique.
  const etatAppRef = useRef(AppState.currentState);
  useEffect(() => {
    const abonnement = AppState.addEventListener("change", (etatSuivant) => {
      if (
        etatAppRef.current.match(/inactive|background/) &&
        etatSuivant === "active"
      ) {
        rafraichirEspace();
      }
      etatAppRef.current = etatSuivant;
    });
    return () => abonnement.remove();
  }, [rafraichirEspace]);

  // Charge les enveloppes/transactions ET les événements 'commun' (ou
  // 'personnel' non masqué) du partenaire au passage en vue "Partagé"
  // (jamais en vue "Moi", jamais sans espace actif) — cf.
  // utils/espacePartage.ts::chargerDonneesPartenaire/
  // chargerEvenementsPartenaire, seules fonctions autorisées à lire les
  // données d'un autre compte. Centralisé ici (plutôt que dans chaque
  // écran) pour ne charger qu'une fois par passage en vue Partagé, partagé
  // ensuite par Aperçu/Budget/Stats/Planning. Un seul Promise.all, un seul
  // chargementPartenaire pour les deux — jamais deux cycles de chargement
  // séparés qui pourraient laisser l'un des deux visiblement en retard.
  useEffect(() => {
    if (vueActive !== "partage" || !estDansUnEspace || !membrePartenaire) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation synchrone volontaire en quittant la vue Partagé, même précédent que la remise à zéro de userId plus haut dans ce fichier.
      setDonneesPartenaire(null);
      setEvenementsPartenaire([]);
      setHistoriqueMoisPartenaire([]);
      return;
    }
    let annule = false;
    (async () => {
      setChargementPartenaire(true);
      const [donnees, evenements, historique] = await Promise.all([
        chargerDonneesPartenaire(membrePartenaire.id),
        chargerEvenementsPartenaire(membrePartenaire.id),
        chargerHistoriqueMoisPartenaire(membrePartenaire.id),
      ]);
      if (annule) return;
      setDonneesPartenaire(donnees);
      setEvenementsPartenaire(evenements);
      setHistoriqueMoisPartenaire(historique);
      setChargementPartenaire(false);
    })();
    return () => {
      annule = true;
    };
  }, [vueActive, estDansUnEspace, membrePartenaire]);

  // RÈGLE : cf. RÈGLE détaillée sur rafraichirEvenementsPartenaire
  // ci-dessus. useCallback pour une identité stable (même besoin que
  // rafraichirEspace) — évite de re-déclencher un effet consommateur à
  // chaque rendu si un écran l'ajoute un jour à un tableau de dépendances.
  const rafraichirEvenementsPartenaire = useCallback(async () => {
    if (!membrePartenaire) return;
    const evenements = await chargerEvenementsPartenaire(membrePartenaire.id);
    setEvenementsPartenaire(evenements);
  }, [membrePartenaire]);

  // RÈGLE : mAj locale UNIQUEMENT après succès de la RPC, jamais avant
  // (optimiste mais pas aveugle) — un échec réseau ne doit jamais laisser
  // l'UI afficher un mode différent de ce qui est réellement enregistré.
  const changerModeBalance = useCallback(
    async (mode: ModeBalance, ratio: number) => {
      const ok = await modifierModeBalanceEspace(mode, ratio);
      if (ok) {
        setModeBalance(mode);
        setRatioPersonnalise(ratio);
      }
      return ok;
    },
    [],
  );

  // RÈGLE À NE JAMAIS CASSER : cf. RÈGLE détaillée sur categoriesFusionnees
  // ci-dessus — calculée UNE SEULE FOIS ici, jamais dans un écran
  // consommateur. `maintenant` lu directement dans le corps du composant
  // (jamais Date.now() mémorisé dans un state) — même convention que
  // `maintenant`/`MOIS_ACTUEL` dans app/(tabs)/index.tsx, purement pour
  // dériver annee/mois, aucun effet de bord.
  const categoriesFusionnees = useMemo<CategorieFusionnee[]>(() => {
    if (vueActive !== "partage" || !estDansUnEspace || !donneesPartenaire) {
      return [];
    }
    const maintenant = new Date();
    return fusionnerCategoriesParNom(
      objStore.enveloppes,
      donneesPartenaire.enveloppes,
      membrePartenaire?.prenom ?? null,
      maintenant.getFullYear(),
      maintenant.getMonth(),
    );
  }, [
    vueActive,
    estDansUnEspace,
    donneesPartenaire,
    objStore.enveloppes,
    membrePartenaire,
  ]);

  const setVueActive = (vue: VueEspacePartage) => {
    setVueActiveState(vue);
    if (userId) {
      AsyncStorage.setItem(cleVueActive(userId), vue).catch(() => {
        // Best-effort : une erreur d'écriture locale ne doit jamais
        // empêcher le changement de vue lui-même (déjà appliqué en
        // mémoire ci-dessus), juste faire perdre la persistance.
      });
    }
  };

  return (
    <EspacePartageContext.Provider
      value={{
        estDansUnEspace,
        espaceId,
        membrePartenaire,
        vueActive,
        setVueActive,
        rafraichirEspace,
        donneesPartenaire,
        chargementPartenaire,
        evenementsPartenaire,
        rafraichirEvenementsPartenaire,
        categoriesFusionnees,
        historiqueMoisPartenaire,
        modeBalance,
        ratioPersonnalise,
        changerModeBalance,
      }}
    >
      {children}
    </EspacePartageContext.Provider>
  );
}

export function useEspacePartage() {
  return useContext(EspacePartageContext);
}

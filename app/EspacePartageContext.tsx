import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import {
  chargerDonneesPartenaire,
  DonneesPartenaire,
  getMembreEspace,
} from "../utils/espacePartage";

// RÈGLE À NE JAMAIS CASSER — RESTE DERRIÈRE ESPACE_PARTAGE_ACTIF : ce
// Provider n'est monté dans app/_layout.tsx que si
// utils/premium.ts:ESPACE_PARTAGE_ACTIF est `true` — tant qu'il reste
// `false`, ce contexte n'existe pas du tout dans l'arbre, aucun écran ne
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
  const [chargementPartenaire, setChargementPartenaire] = useState(false);

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

  // Charge les enveloppes/transactions 'commun' du partenaire au passage en
  // vue "Partagé" (jamais en vue "Moi", jamais sans espace actif) — cf.
  // utils/espacePartage.ts::chargerDonneesPartenaire, seule fonction
  // autorisée à lire les données d'un autre compte. Centralisé ici (plutôt
  // que dans chaque écran) pour ne charger qu'une fois par passage en vue
  // Partagé, partagé ensuite par Aperçu/Stats/futur Planning.
  useEffect(() => {
    if (vueActive !== "partage" || !estDansUnEspace || !membrePartenaire) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation synchrone volontaire en quittant la vue Partagé, même précédent que la remise à zéro de userId plus haut dans ce fichier.
      setDonneesPartenaire(null);
      return;
    }
    let annule = false;
    (async () => {
      setChargementPartenaire(true);
      const donnees = await chargerDonneesPartenaire(membrePartenaire.id);
      if (annule) return;
      setDonneesPartenaire(donnees);
      setChargementPartenaire(false);
    })();
    return () => {
      annule = true;
    };
  }, [vueActive, estDansUnEspace, membrePartenaire]);

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
      }}
    >
      {children}
    </EspacePartageContext.Provider>
  );
}

export function useEspacePartage() {
  return useContext(EspacePartageContext);
}

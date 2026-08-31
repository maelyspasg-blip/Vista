import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
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
        if (!etat) {
          setEstDansUnEspace(false);
          setEspaceId(null);
          setMembrePartenaire(null);
          return;
        }
        setEstDansUnEspace(true);
        setEspaceId(etat.espace.id);
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

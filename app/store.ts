import { useState } from "react";

export type Objectif = {
  id: number;
  nom: string;
  cible: number;
  actuel: number;
  couleur: string;
};

export type Enveloppe = {
  id: number;
  nom: string;
  depense: number;
  budget: number;
  couleur: string;
  recurrente: boolean;
  frequenceJours?: number;
  type: "Fixe" | "Variable";
  dateFixe?: string;
  payee?: boolean;
  repeteChaqueMois?: boolean;
};

export type DepensePrevue = {
  id: number;
  nom: string;
  montant: number;
  type: "Fixe" | "Non courante";
  statut: "Payé" | "À venir" | "Planifié";
  couleur: string;
};

export type Evenement = {
  id: number;
  nom: string;
  jour: number;
  heure: string;
  duree: number;
  couleur: string;
  estFinancier: boolean;
  montant?: number;
  categorieLiee?: string;
};

export type Transaction = {
  id: number;
  nom: string;
  montant: number;
  enveloppeId: number;
  date: string;
};

const ENVELOPPES_INIT: Enveloppe[] = [
  {
    id: 1,
    nom: "Courses",
    depense: 0,
    budget: 250,
    couleur: "#5DC8A0",
    recurrente: true,
    frequenceJours: 30,
    type: "Variable",
  },
  {
    id: 2,
    nom: "Restaurants",
    depense: 0,
    budget: 200,
    couleur: "#F4956A",
    recurrente: false,
    type: "Variable",
  },
  {
    id: 3,
    nom: "Transport",
    depense: 0,
    budget: 80,
    couleur: "#4A90D9",
    recurrente: true,
    frequenceJours: 30,
    type: "Variable",
  },
  {
    id: 4,
    nom: "Loisirs",
    depense: 0,
    budget: 200,
    couleur: "#D94A8C",
    recurrente: false,
    type: "Variable",
  },
  {
    id: 5,
    nom: "Abonnements",
    depense: 0,
    budget: 50,
    couleur: "#5BC0BE",
    recurrente: true,
    frequenceJours: 30,
    type: "Fixe",
  },
  {
    id: 6,
    nom: "Logement",
    depense: 0,
    budget: 850,
    couleur: "#9B5DE5",
    recurrente: true,
    frequenceJours: 30,
    type: "Fixe",
  },
];

const DEPENSES_PREVUES_INIT: DepensePrevue[] = [
  {
    id: 1,
    nom: "Loyer",
    montant: 850,
    type: "Fixe",
    statut: "Planifié",
    couleur: "#9B5DE5",
  },
  {
    id: 2,
    nom: "Salle de sport",
    montant: 30,
    type: "Fixe",
    statut: "Payé",
    couleur: "#5DC8A0",
  },
  {
    id: 3,
    nom: "Spotify",
    montant: 10,
    type: "Fixe",
    statut: "À venir",
    couleur: "#F4956A",
  },
  {
    id: 4,
    nom: "Vacances Italie",
    montant: 600,
    type: "Non courante",
    statut: "Planifié",
    couleur: "#F4956A",
  },
];

const EVENEMENTS_INIT: Evenement[] = [
  {
    id: 1,
    nom: "Standup équipe",
    jour: 16,
    heure: "9h00",
    duree: 1,
    couleur: "#8B6FE8",
    estFinancier: false,
  },
  {
    id: 2,
    nom: "Déjeuner Sophie",
    jour: 16,
    heure: "12h30",
    duree: 1.5,
    couleur: "#5DC8A0",
    estFinancier: false,
  },
  {
    id: 3,
    nom: "Présentation Q2",
    jour: 17,
    heure: "14h00",
    duree: 2,
    couleur: "#F4956A",
    estFinancier: false,
  },
  {
    id: 4,
    nom: "Yoga",
    jour: 18,
    heure: "18h30",
    duree: 1,
    couleur: "#5DC8A0",
    estFinancier: false,
  },
  {
    id: 5,
    nom: "Réunion client",
    jour: 19,
    heure: "10h00",
    duree: 1.5,
    couleur: "#8B6FE8",
    estFinancier: false,
  },
  {
    id: 6,
    nom: "Sport",
    jour: 20,
    heure: "8h00",
    duree: 1,
    couleur: "#F4956A",
    estFinancier: false,
  },
  {
    id: 7,
    nom: "Dentiste",
    jour: 20,
    heure: "15h00",
    duree: 1,
    couleur: "#5DC8A0",
    estFinancier: false,
  },
];

const TRANSACTIONS_INIT: Transaction[] = [];

type EtatStore = {
  objectifs: Objectif[];
  epargneMois: number;
  enveloppes: Enveloppe[];
  argentDisponible: number;
  depensesPrevues: DepensePrevue[];
  transactions: Transaction[];
  evenements: Evenement[];
};

let etat: EtatStore = {
  objectifs: [],
  epargneMois: 0,
  enveloppes: ENVELOPPES_INIT,
  argentDisponible: 1800,
  depensesPrevues: DEPENSES_PREVUES_INIT,
  transactions: TRANSACTIONS_INIT,
  evenements: EVENEMENTS_INIT,
};

type Ecouteur = (etat: EtatStore) => void;
let ecouteurs: Ecouteur[] = [];

function setEtat(nouvelEtat: Partial<EtatStore>) {
  etat = { ...etat, ...nouvelEtat };
  ecouteurs.forEach((fn) => fn(etat));
}

export function useObjectifs() {
  const [local, setLocal] = useState<EtatStore>(etat);

  useState(() => {
    const ecouteur: Ecouteur = (nouvelEtat) => setLocal({ ...nouvelEtat });
    ecouteurs.push(ecouteur);
  });

  return {
    objectifs: local.objectifs,
    epargneMois: local.epargneMois,
    enveloppes: local.enveloppes,
    argentDisponible: local.argentDisponible,
    depensesPrevues: local.depensesPrevues,
    transactions: local.transactions,
    evenements: local.evenements,

    ajouterObjectif: (
      nom: string,
      cible: number,
      montantInitial: number,
      couleur: string,
    ) => {
      const nouvel: Objectif = {
        id: Date.now(),
        nom,
        cible,
        actuel: montantInitial,
        couleur,
      };
      setEtat({ objectifs: [...etat.objectifs, nouvel] });
    },
    modifierEpargneMois: (montant: number) => {
      setEtat({ epargneMois: montant });
    },
    supprimerObjectif: (id: number) => {
      setEtat({ objectifs: etat.objectifs.filter((o) => o.id !== id) });
    },

    modifierEnveloppes: (enveloppes: Enveloppe[]) => {
      setEtat({ enveloppes });
    },
    modifierArgentDisponible: (montant: number) => {
      setEtat({ argentDisponible: montant });
    },
    verifierEcheancesFixes: () => {
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);

      const enveloppesMaj = etat.enveloppes.map((env) => {
        if (env.type === "Fixe" && env.dateFixe && !env.payee) {
          const dateEcheance = new Date(env.dateFixe);
          dateEcheance.setHours(0, 0, 0, 0);
          if (dateEcheance <= aujourdhui) {
            if (env.repeteChaqueMois) {
              const prochaine = new Date(dateEcheance);
              prochaine.setMonth(prochaine.getMonth() + 1);
              const prochaineStr = `${prochaine.getFullYear()}-${String(prochaine.getMonth() + 1).padStart(2, "0")}-${String(prochaine.getDate()).padStart(2, "0")}`;
              return {
                ...env,
                depense: env.depense + env.budget,
                payee: false,
                dateFixe: prochaineStr,
              };
            }
            return { ...env, depense: env.budget, payee: true };
          }
        }
        return env;
      });

      const aChange = enveloppesMaj.some(
        (env, i) =>
          env.payee !== etat.enveloppes[i].payee ||
          env.dateFixe !== etat.enveloppes[i].dateFixe,
      );
      if (aChange) {
        setEtat({ enveloppes: enveloppesMaj });
      }
    },

    ajouterEvenement: (
      nom: string,
      jour: number,
      heure: string,
      duree: number,
      couleur: string,
      estFinancier: boolean,
      montant?: number,
      categorieLiee?: string,
    ) => {
      const nouvelEvenement: Evenement = {
        id: Date.now(),
        nom,
        jour,
        heure,
        duree,
        couleur,
        estFinancier,
        montant,
        categorieLiee,
      };
      setEtat({ evenements: [...etat.evenements, nouvelEvenement] });

      if (estFinancier && montant) {
        if (categorieLiee && categorieLiee !== "Aucune") {
          const enveloppesMaj = etat.enveloppes.map((e) =>
            e.nom === categorieLiee
              ? { ...e, depense: e.depense + montant }
              : e,
          );
          setEtat({ enveloppes: enveloppesMaj });
        } else {
          const nouvelleDepensePrevue: DepensePrevue = {
            id: Date.now() + 1,
            nom,
            montant,
            type: "Non courante",
            statut: "Planifié",
            couleur,
          };
          setEtat({
            depensesPrevues: [...etat.depensesPrevues, nouvelleDepensePrevue],
          });
        }
      }
    },

    supprimerEvenement: (id: number) => {
      setEtat({ evenements: etat.evenements.filter((e) => e.id !== id) });
    },

    ajouterTransaction: (
      nom: string,
      montant: number,
      enveloppeId: number,
      date: string,
    ) => {
      const nouvelleTransaction: Transaction = {
        id: Date.now(),
        nom,
        montant,
        enveloppeId,
        date,
      };
      const enveloppesMaj = etat.enveloppes.map((e) =>
        e.id === enveloppeId ? { ...e, depense: e.depense + montant } : e,
      );
      setEtat({
        transactions: [...etat.transactions, nouvelleTransaction],
        enveloppes: enveloppesMaj,
      });
    },

    supprimerTransaction: (id: number) => {
      const tx = etat.transactions.find((t) => t.id === id);
      if (!tx) return;
      const enveloppesMaj = etat.enveloppes.map((e) =>
        e.id === tx.enveloppeId
          ? { ...e, depense: Math.max(0, e.depense - tx.montant) }
          : e,
      );
      setEtat({
        transactions: etat.transactions.filter((t) => t.id !== id),
        enveloppes: enveloppesMaj,
      });
    },
  };
}

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
};

export type DepensePrevue = {
  id: number;
  nom: string;
  montant: number;
  type: "Fixe" | "Non courante";
  statut: "Payé" | "À venir" | "Planifié";
  couleur: string;
};

export type Transaction = {
  id: number;
  nom: string;
  montant: number;
  categorie: string;
  couleur: string;
  date: string;
};

const ENVELOPPES_INIT: Enveloppe[] = [
  {
    id: 1,
    nom: "Courses",
    depense: 157,
    budget: 250,
    couleur: "#5DC8A0",
    recurrente: true,
    frequenceJours: 30,
    type: "Variable",
  },
  {
    id: 2,
    nom: "Restaurants",
    depense: 66,
    budget: 200,
    couleur: "#F4956A",
    recurrente: false,
    type: "Variable",
  },
  {
    id: 3,
    nom: "Transport",
    depense: 34,
    budget: 80,
    couleur: "#4A90D9",
    recurrente: true,
    frequenceJours: 30,
    type: "Variable",
  },
  {
    id: 4,
    nom: "Loisirs",
    depense: 179,
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

const TRANSACTIONS_INIT: Transaction[] = [
  {
    id: 1,
    nom: "Carrefour",
    montant: 64,
    categorie: "Courses",
    couleur: "#5DC8A0",
    date: "26 mai",
  },
  {
    id: 2,
    nom: "Le Petit Bistrot",
    montant: 38,
    categorie: "Restaurants",
    couleur: "#F4956A",
    date: "25 mai",
  },
  {
    id: 3,
    nom: "Métro 10x",
    montant: 16,
    categorie: "Transport",
    couleur: "#4A90D9",
    date: "22 mai",
  },
  {
    id: 4,
    nom: "Cinéma",
    montant: 14,
    categorie: "Loisirs",
    couleur: "#D94A8C",
    date: "24 mai",
  },
  {
    id: 5,
    nom: "Picard",
    montant: 42,
    categorie: "Courses",
    couleur: "#5DC8A0",
    date: "23 mai",
  },
];

type EtatStore = {
  objectifs: Objectif[];
  epargneMois: number;
  enveloppes: Enveloppe[];
  argentDisponible: number;
  depensesPrevues: DepensePrevue[];
  transactions: Transaction[];
};

let etat: EtatStore = {
  objectifs: [],
  epargneMois: 0,
  enveloppes: ENVELOPPES_INIT,
  argentDisponible: 1800,
  depensesPrevues: DEPENSES_PREVUES_INIT,
  transactions: TRANSACTIONS_INIT,
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
  };
}

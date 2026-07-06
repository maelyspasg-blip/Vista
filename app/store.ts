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
  afficherDansPlanning?: boolean;
};

export type DepensePrevue = {
  id: number;
  nom: string;
  montant: number;
  type: "Fixe" | "Non courante";
  statut: "Payé" | "À venir" | "Planifié";
  couleur: string;
};

export type PaiementHistorique = {
  id: number;
  enveloppeId: number;
  nom: string;
  montant: number;
  date: string;
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

export type SnapshotEnveloppe = {
  id: number;
  nom: string;
  depense: number;
  budget: number;
  couleur: string;
  type: "Fixe" | "Variable";
};

export type SnapshotMois = {
  mois: number;
  annee: number;
  enveloppes: SnapshotEnveloppe[];
  epargne: number;
  disponible: number;
  totalDepense: number;
};

const ENVELOPPES_INIT: Enveloppe[] = [
  {
    id: 1,
    nom: "Courses",
    depense: 0,
    budget: 0,
    couleur: "#5DC8A0",
    recurrente: true,
    frequenceJours: 30,
    type: "Variable",
  },
  {
    id: 2,
    nom: "Logement",
    depense: 0,
    budget: 0,
    couleur: "#9B5DE5",
    recurrente: false,
    type: "Fixe",
    repeteChaqueMois: true,
    afficherDansPlanning: true,
  },
];

const DEPENSES_PREVUES_INIT: DepensePrevue[] = [];
const EVENEMENTS_INIT: Evenement[] = [];
const TRANSACTIONS_INIT: Transaction[] = [];

type EtatStore = {
  objectifs: Objectif[];
  epargneMois: number;
  enveloppes: Enveloppe[];
  argentDisponible: number;
  depensesPrevues: DepensePrevue[];
  transactions: Transaction[];
  evenements: Evenement[];
  historiquePaiements: PaiementHistorique[];
  historiquesMois: SnapshotMois[];
  dernierMoisArchive: { mois: number; annee: number } | null;
};

let etat: EtatStore = {
  objectifs: [],
  epargneMois: 0,
  enveloppes: ENVELOPPES_INIT,
  argentDisponible: 0,
  depensesPrevues: DEPENSES_PREVUES_INIT,
  transactions: TRANSACTIONS_INIT,
  evenements: EVENEMENTS_INIT,
  historiquePaiements: [],
  historiquesMois: [],
  dernierMoisArchive: null,
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
    historiquePaiements: local.historiquePaiements,
    historiquesMois: local.historiquesMois,
    dernierMoisArchive: local.dernierMoisArchive,

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

    archiverMoisActuel: (mois: number, annee: number) => {
      const dejaArchive = etat.historiquesMois.some(
        (s) => s.mois === mois && s.annee === annee,
      );
      if (dejaArchive) return;

      const snapshot: SnapshotMois = {
        mois,
        annee,
        enveloppes: etat.enveloppes.map((e) => ({
          id: e.id,
          nom: e.nom,
          depense: e.depense,
          budget: e.budget,
          couleur: e.couleur,
          type: e.type,
        })),
        epargne: etat.epargneMois,
        disponible: etat.argentDisponible,
        totalDepense:
          etat.enveloppes.reduce((acc, e) => acc + e.depense, 0) +
          etat.epargneMois,
      };

      const enveloppesMaj = etat.enveloppes.map((e) => ({
        ...e,
        depense: 0,
        payee: e.type === "Fixe" ? false : e.payee,
      }));

      setEtat({
        historiquesMois: [...etat.historiquesMois, snapshot],
        dernierMoisArchive: { mois, annee },
        enveloppes: enveloppesMaj,
        epargneMois: 0,
        transactions: [],
      });
    },

    verifierEcheancesFixes: () => {
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);

      const nouveauxPaiements: PaiementHistorique[] = [];

      const enveloppesMaj = etat.enveloppes.map((env) => {
        if (env.type === "Fixe" && env.dateFixe && !env.payee) {
          const dateEcheance = new Date(env.dateFixe);
          dateEcheance.setHours(0, 0, 0, 0);
          if (dateEcheance <= aujourdhui) {
            nouveauxPaiements.push({
              id: Date.now() + Math.random(),
              enveloppeId: env.id,
              nom: env.nom,
              montant: env.budget,
              date: env.dateFixe,
              couleur: env.couleur,
            });
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
        setEtat({
          enveloppes: enveloppesMaj,
          historiquePaiements: [
            ...etat.historiquePaiements,
            ...nouveauxPaiements,
          ],
        });
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

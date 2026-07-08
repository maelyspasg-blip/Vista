import { useState } from "react";

export type Objectif = {
  id: number;
  nom: string;
  cible: number;
  actuel: number;
  couleur: string;
  recurrent?: boolean;
  montantMensuel?: number;
  jourDuMois?: number;
  dernierVersement?: { mois: number; annee: number } | null;
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
  date: string;
  heure: string;
  duree: number;
  couleur: string;
  estFinancier: boolean;
  montant?: number;
  categorieLiee?: string;
  recurrent?: boolean;
  frequence?: "jour" | "semaine" | "mois" | "an";
  touteLaJournee?: boolean;
  notifierActif?: boolean;
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

export type SnapshotObjectif = {
  id: number;
  nom: string;
  actuel: number;
  cible: number;
};

export type SnapshotMois = {
  mois: number;
  annee: number;
  enveloppes: SnapshotEnveloppe[];
  objectifs: SnapshotObjectif[];
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
      recurrent: boolean,
      montantMensuel?: number,
      jourDuMois?: number,
    ) => {
      const nouvel: Objectif = {
        id: Date.now(),
        nom,
        cible,
        actuel: montantInitial,
        couleur,
        recurrent,
        montantMensuel: recurrent ? montantMensuel : undefined,
        jourDuMois: recurrent ? jourDuMois : undefined,
        dernierVersement: null,
      };
      setEtat({ objectifs: [...etat.objectifs, nouvel] });
    },

    modifierEpargneMois: (montant: number) => {
      setEtat({ epargneMois: montant });
    },

    modifierObjectif: (
      id: number,
      champs: Partial<
        Pick<
          Objectif,
          "nom" | "cible" | "couleur" | "recurrent" | "montantMensuel" | "jourDuMois"
        >
      >,
    ) => {
      setEtat({
        objectifs: etat.objectifs.map((o) =>
          o.id === id ? { ...o, ...champs } : o,
        ),
      });
    },

    ajouterFondsObjectif: (id: number, montant: number) => {
      setEtat({
        objectifs: etat.objectifs.map((o) =>
          o.id === id ? { ...o, actuel: o.actuel + montant } : o,
        ),
        epargneMois: etat.epargneMois + montant,
      });
    },

    verifierVersementsObjectifs: () => {
      const aujourdhui = new Date();
      const jourActuel = aujourdhui.getDate();
      const moisActuel = aujourdhui.getMonth();
      const anneeActuelle = aujourdhui.getFullYear();

      let totalVerse = 0;
      const objectifsMaj = etat.objectifs.map((o) => {
        const dejaVerseCeMois =
          o.dernierVersement?.mois === moisActuel &&
          o.dernierVersement?.annee === anneeActuelle;
        if (
          o.recurrent &&
          o.montantMensuel &&
          o.jourDuMois &&
          jourActuel >= o.jourDuMois &&
          !dejaVerseCeMois
        ) {
          totalVerse += o.montantMensuel;
          return {
            ...o,
            actuel: o.actuel + o.montantMensuel,
            dernierVersement: { mois: moisActuel, annee: anneeActuelle },
          };
        }
        return o;
      });

      const aChange = objectifsMaj.some(
        (o, i) => o.actuel !== etat.objectifs[i].actuel,
      );
      if (aChange) {
        setEtat({
          objectifs: objectifsMaj,
          epargneMois: etat.epargneMois + totalVerse,
        });
      }
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
        objectifs: etat.objectifs.map((o) => ({
          id: o.id,
          nom: o.nom,
          actuel: o.actuel,
          cible: o.cible,
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

      const dejaPayeeCeMois = (enveloppeId: number, dateEcheance: Date) =>
        etat.historiquePaiements.some((p) => {
          if (p.enveloppeId !== enveloppeId) return false;
          const d = new Date(p.date);
          return (
            d.getMonth() === dateEcheance.getMonth() &&
            d.getFullYear() === dateEcheance.getFullYear()
          );
        });

      const nouveauxPaiements: PaiementHistorique[] = [];

      const enveloppesMaj = etat.enveloppes.map((env) => {
        if (env.type === "Fixe" && env.dateFixe && !env.payee) {
          const dateEcheance = new Date(env.dateFixe);
          dateEcheance.setHours(0, 0, 0, 0);
          if (dateEcheance <= aujourdhui) {
            const dejaEnregistree = dejaPayeeCeMois(env.id, dateEcheance);
            if (!dejaEnregistree) {
              nouveauxPaiements.push({
                id: Date.now() + Math.random(),
                enveloppeId: env.id,
                nom: env.nom,
                montant: env.budget,
                date: env.dateFixe,
                couleur: env.couleur,
              });
            }
            if (env.repeteChaqueMois) {
              const prochaine = new Date(dateEcheance);
              prochaine.setMonth(prochaine.getMonth() + 1);
              const prochaineStr = `${prochaine.getFullYear()}-${String(prochaine.getMonth() + 1).padStart(2, "0")}-${String(prochaine.getDate()).padStart(2, "0")}`;
              return {
                ...env,
                depense: dejaEnregistree ? env.depense : env.budget,
                payee: false,
                dateFixe: prochaineStr,
              };
            }
            return {
              ...env,
              depense: dejaEnregistree ? env.depense : env.budget,
              payee: true,
            };
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
      id: number,
      nom: string,
      date: string,
      heure: string,
      duree: number,
      couleur: string,
      estFinancier: boolean,
      montant?: number,
      categorieLiee?: string,
      recurrent?: boolean,
      frequence?: "jour" | "semaine" | "mois" | "an",
      touteLaJournee?: boolean,
      notifierActif?: boolean,
    ) => {
      const nouvelEvenement: Evenement = {
        id,
        nom,
        date,
        heure,
        duree,
        couleur,
        estFinancier,
        montant,
        categorieLiee,
        recurrent,
        frequence: recurrent ? frequence : undefined,
        touteLaJournee,
        notifierActif,
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

    modifierEvenement: (id: number, champs: Partial<Omit<Evenement, "id">>) => {
      setEtat({
        evenements: etat.evenements.map((e) =>
          e.id === id ? { ...e, ...champs } : e,
        ),
      });
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

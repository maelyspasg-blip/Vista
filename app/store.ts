import { useState } from "react";
import { supabase } from "../supabaseClient";

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
  id: string;
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
  enveloppeId: string;
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
  enveloppeId: string;
  date: string;
};

export type SnapshotEnveloppe = {
  id: string;
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
  erreurSync: string | null;
};

let etat: EtatStore = {
  objectifs: [],
  epargneMois: 0,
  enveloppes: [],
  argentDisponible: 0,
  depensesPrevues: DEPENSES_PREVUES_INIT,
  transactions: TRANSACTIONS_INIT,
  evenements: EVENEMENTS_INIT,
  historiquePaiements: [],
  historiquesMois: [],
  dernierMoisArchive: null,
  erreurSync: null,
};

type Ecouteur = (etat: EtatStore) => void;
let ecouteurs: Ecouteur[] = [];

function setEtat(nouvelEtat: Partial<EtatStore>) {
  etat = { ...etat, ...nouvelEtat };
  ecouteurs.forEach((fn) => fn(etat));
}

let minuteurErreurSync: ReturnType<typeof setTimeout> | null = null;

function signalerErreurSync(message: string) {
  setEtat({ erreurSync: message });
  if (minuteurErreurSync) clearTimeout(minuteurErreurSync);
  minuteurErreurSync = setTimeout(() => {
    setEtat({ erreurSync: null });
  }, 5000);
}

type EnveloppeRow = {
  id: string;
  user_id: string;
  nom: string;
  depense: number;
  budget: number;
  couleur: string;
  recurrente: boolean;
  frequence_jours: number | null;
  type: "Fixe" | "Variable";
  date_fixe: string | null;
  payee: boolean | null;
  repete_chaque_mois: boolean | null;
  afficher_dans_planning: boolean | null;
};

function enveloppeDepuisLigne(l: EnveloppeRow): Enveloppe {
  return {
    id: l.id,
    nom: l.nom,
    depense: l.depense,
    budget: l.budget,
    couleur: l.couleur,
    recurrente: l.recurrente,
    frequenceJours: l.frequence_jours ?? undefined,
    type: l.type,
    dateFixe: l.date_fixe ?? undefined,
    payee: l.payee ?? undefined,
    repeteChaqueMois: l.repete_chaque_mois ?? undefined,
    afficherDansPlanning: l.afficher_dans_planning ?? undefined,
  };
}

function enveloppeVersColonnes(e: Omit<Enveloppe, "id">) {
  return {
    nom: e.nom,
    depense: e.depense,
    budget: e.budget,
    couleur: e.couleur,
    recurrente: e.recurrente,
    frequence_jours: e.frequenceJours ?? null,
    type: e.type,
    date_fixe: e.dateFixe ?? null,
    payee: e.payee ?? null,
    repete_chaque_mois: e.repeteChaqueMois ?? null,
    afficher_dans_planning: e.afficherDansPlanning ?? null,
  };
}

function enveloppesEgales(a: Enveloppe, b: Enveloppe): boolean {
  return (
    a.nom === b.nom &&
    a.depense === b.depense &&
    a.budget === b.budget &&
    a.couleur === b.couleur &&
    a.recurrente === b.recurrente &&
    a.frequenceJours === b.frequenceJours &&
    a.type === b.type &&
    a.dateFixe === b.dateFixe &&
    a.payee === b.payee &&
    a.repeteChaqueMois === b.repeteChaqueMois &&
    a.afficherDansPlanning === b.afficherDansPlanning
  );
}

function appliquerEnveloppes(nouvellesEnveloppes: Enveloppe[]) {
  const anciennes = etat.enveloppes;
  setEtat({ enveloppes: nouvellesEnveloppes });

  const idsNouvelles = new Set(nouvellesEnveloppes.map((e) => e.id));
  anciennes
    .filter((e) => !idsNouvelles.has(e.id))
    .forEach((e) => {
      supabase
        .from("enveloppes")
        .delete()
        .eq("id", e.id)
        .then(({ error }) => {
          if (error) {
            console.error("Supabase delete enveloppe a échoué :", error);
            signalerErreurSync(
              `Impossible de supprimer l'enveloppe : ${error.message}`,
            );
          }
        });
    });

  nouvellesEnveloppes.forEach((e) => {
    const ancienne = anciennes.find((a) => a.id === e.id);
    if (!ancienne || enveloppesEgales(ancienne, e)) return;
    supabase
      .from("enveloppes")
      .update(enveloppeVersColonnes(e))
      .eq("id", e.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase update enveloppe a échoué :", error);
          signalerErreurSync(
            `Impossible de sauvegarder l'enveloppe : ${error.message}`,
          );
        }
      });
  });
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
    erreurSync: local.erreurSync,

    effacerErreurSync: () => {
      if (minuteurErreurSync) clearTimeout(minuteurErreurSync);
      setEtat({ erreurSync: null });
    },

    chargerEnveloppes: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("enveloppes")
        .select("*")
        .eq("user_id", user.id);

      if (error) {
        console.error("Supabase select enveloppes a échoué :", error);
        signalerErreurSync(
          `Impossible de charger tes enveloppes : ${error.message}`,
        );
        return;
      }

      setEtat({ enveloppes: (data ?? []).map(enveloppeDepuisLigne) });
    },

    ajouterEnveloppe: async (
      champs: Omit<Enveloppe, "id">,
    ): Promise<Enveloppe | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.error(
          "Création d'enveloppe refusée : aucun utilisateur connecté (supabase.auth.getUser() a renvoyé null).",
        );
        signalerErreurSync("Tu dois être connecté pour créer une enveloppe.");
        return null;
      }

      const { data, error } = await supabase
        .from("enveloppes")
        .insert({ ...enveloppeVersColonnes(champs), user_id: user.id })
        .select()
        .single();

      if (error || !data) {
        console.error("Supabase insert enveloppe a échoué :", error);
        signalerErreurSync(
          error
            ? `Impossible de créer l'enveloppe : ${error.message}`
            : "Impossible de créer l'enveloppe : réponse vide de Supabase.",
        );
        return null;
      }

      const nouvelle = enveloppeDepuisLigne(data);
      setEtat({ enveloppes: [...etat.enveloppes, nouvelle] });
      return nouvelle;
    },

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
      appliquerEnveloppes(enveloppes);
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
        epargneMois: 0,
        transactions: [],
      });
      appliquerEnveloppes(enveloppesMaj);
    },

    verifierEcheancesFixes: () => {
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);

      const dejaPayeeCeMois = (enveloppeId: string, dateEcheance: Date) =>
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
          historiquePaiements: [
            ...etat.historiquePaiements,
            ...nouveauxPaiements,
          ],
        });
        appliquerEnveloppes(enveloppesMaj);
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
          appliquerEnveloppes(enveloppesMaj);
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
      enveloppeId: string,
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
      });
      appliquerEnveloppes(enveloppesMaj);
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
      });
      appliquerEnveloppes(enveloppesMaj);
    },
  };
}

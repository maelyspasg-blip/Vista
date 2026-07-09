import { useState } from "react";
import { supabase } from "../supabaseClient";

export type Objectif = {
  id: string;
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

export type PaiementHistorique = {
  id: string;
  enveloppeId: string;
  nom: string;
  montant: number;
  date: string;
  couleur: string;
};

export type Evenement = {
  id: string;
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
  montantApplique?: boolean;
};

export type Transaction = {
  id: string;
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
  id: string;
  nom: string;
  actuel: number;
  cible: number;
};

export type SnapshotMois = {
  id: string;
  mois: number;
  annee: number;
  enveloppes: SnapshotEnveloppe[];
  objectifs: SnapshotObjectif[];
  epargne: number;
  disponible: number;
  totalDepense: number;
};

const EVENEMENTS_INIT: Evenement[] = [];
const TRANSACTIONS_INIT: Transaction[] = [];

type EtatStore = {
  objectifs: Objectif[];
  epargneMois: number;
  enveloppes: Enveloppe[];
  argentDisponible: number;
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

type ObjectifRow = {
  id: string;
  user_id: string;
  nom: string;
  cible: number;
  actuel: number;
  couleur: string;
  recurrent: boolean | null;
  montant_mensuel: number | null;
  jour_du_mois: number | null;
  dernier_versement_mois: number | null;
  dernier_versement_annee: number | null;
};

function objectifDepuisLigne(l: ObjectifRow): Objectif {
  return {
    id: l.id,
    nom: l.nom,
    cible: l.cible,
    actuel: l.actuel,
    couleur: l.couleur,
    recurrent: l.recurrent ?? undefined,
    montantMensuel: l.montant_mensuel ?? undefined,
    jourDuMois: l.jour_du_mois ?? undefined,
    dernierVersement:
      l.dernier_versement_mois !== null && l.dernier_versement_annee !== null
        ? { mois: l.dernier_versement_mois, annee: l.dernier_versement_annee }
        : null,
  };
}

function objectifVersColonnes(o: Omit<Objectif, "id">) {
  return {
    nom: o.nom,
    cible: o.cible,
    actuel: o.actuel,
    couleur: o.couleur,
    recurrent: o.recurrent ?? null,
    montant_mensuel: o.montantMensuel ?? null,
    jour_du_mois: o.jourDuMois ?? null,
    dernier_versement_mois: o.dernierVersement?.mois ?? null,
    dernier_versement_annee: o.dernierVersement?.annee ?? null,
  };
}

function majObjectifSupabase(id: string, colonnes: Record<string, unknown>) {
  supabase
    .from("objectifs")
    .update(colonnes)
    .eq("id", id)
    .then(({ error }) => {
      if (error) {
        console.error("Supabase update objectif a échoué :", error);
        signalerErreurSync(
          `Impossible de sauvegarder l'objectif : ${error.message}`,
        );
      }
    });
}

type EvenementRow = {
  id: string;
  user_id: string;
  nom: string;
  date: string;
  heure: string;
  duree: number;
  couleur: string;
  est_financier: boolean;
  montant: number | null;
  categorie_liee: string | null;
  recurrent: boolean | null;
  frequence: "jour" | "semaine" | "mois" | "an" | null;
  toute_la_journee: boolean | null;
  notifier_actif: boolean | null;
  montant_applique: boolean | null;
};

function heureDepuisColonneSupabase(heure: string): string {
  const [hStr, mStr] = heure.split(":");
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function heureVersColonneSupabase(heure: string): string {
  const [hStr, mStr] = heure.split(/[h:]/);
  const h = Math.min(23, Math.max(0, parseInt(hStr, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mStr, 10) || 0));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function evenementDepuisLigne(l: EvenementRow): Evenement {
  return {
    id: l.id,
    nom: l.nom,
    date: l.date,
    heure: heureDepuisColonneSupabase(l.heure),
    duree: l.duree,
    couleur: l.couleur,
    estFinancier: l.est_financier,
    montant: l.montant ?? undefined,
    categorieLiee: l.categorie_liee ?? undefined,
    recurrent: l.recurrent ?? undefined,
    frequence: l.frequence ?? undefined,
    touteLaJournee: l.toute_la_journee ?? undefined,
    notifierActif: l.notifier_actif ?? undefined,
    montantApplique: l.montant_applique ?? undefined,
  };
}

function evenementVersColonnes(e: Omit<Evenement, "id">) {
  return {
    nom: e.nom,
    date: e.date,
    heure: heureVersColonneSupabase(e.heure),
    duree: e.duree,
    couleur: e.couleur,
    est_financier: e.estFinancier,
    montant: e.montant ?? null,
    categorie_liee: e.categorieLiee ?? null,
    recurrent: e.recurrent ?? null,
    frequence: e.frequence ?? null,
    toute_la_journee: e.touteLaJournee ?? null,
    notifier_actif: e.notifierActif ?? null,
    montant_applique: e.montantApplique ?? null,
  };
}

function majEvenementSupabase(id: string, colonnes: Record<string, unknown>) {
  supabase
    .from("evenements")
    .update(colonnes)
    .eq("id", id)
    .then(({ error }) => {
      if (error) {
        console.error("Supabase update evenement a échoué :", error);
        signalerErreurSync(
          `Impossible de sauvegarder l'événement : ${error.message}`,
        );
      }
    });
}

type TransactionRow = {
  id: string;
  user_id: string;
  enveloppe_id: string;
  nom: string;
  montant: number;
  date: string;
};

function transactionDepuisLigne(l: TransactionRow): Transaction {
  return {
    id: l.id,
    nom: l.nom,
    montant: l.montant,
    enveloppeId: l.enveloppe_id,
    date: l.date,
  };
}

type PaiementHistoriqueRow = {
  id: string;
  user_id: string;
  enveloppe_id: string;
  nom: string;
  montant: number;
  date: string;
  couleur: string;
};

function paiementHistoriqueDepuisLigne(
  l: PaiementHistoriqueRow,
): PaiementHistorique {
  return {
    id: l.id,
    enveloppeId: l.enveloppe_id,
    nom: l.nom,
    montant: l.montant,
    date: l.date,
    couleur: l.couleur,
  };
}

function paiementHistoriqueVersColonnes(p: Omit<PaiementHistorique, "id">) {
  return {
    enveloppe_id: p.enveloppeId,
    nom: p.nom,
    montant: p.montant,
    date: p.date,
    couleur: p.couleur,
  };
}

async function ajouterPaiementHistoriqueInterne(
  champs: Omit<PaiementHistorique, "id">,
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error(
        "Historisation du paiement refusée : aucun utilisateur connecté.",
      );
      signalerErreurSync("Tu dois être connecté pour historiser un paiement.");
      return;
    }

    const { data, error } = await supabase
      .from("historique_paiements")
      .insert({ ...paiementHistoriqueVersColonnes(champs), user_id: user.id })
      .select()
      .single();

    if (error || !data) {
      console.error("Supabase insert historique_paiements a échoué :", error);
      signalerErreurSync(
        error
          ? `Impossible d'enregistrer le paiement : ${error.message}`
          : "Impossible d'enregistrer le paiement : réponse vide de Supabase.",
      );
      return;
    }

    const nouveau = paiementHistoriqueDepuisLigne(data);
    setEtat({ historiquePaiements: [...etat.historiquePaiements, nouveau] });
  } catch (e) {
    console.error("Historisation du paiement a échoué :", e);
    signalerErreurSync(
      "Impossible d'enregistrer le paiement : problème de connexion.",
    );
  }
}

function transactionVersColonnes(t: Omit<Transaction, "id">) {
  return {
    enveloppe_id: t.enveloppeId,
    nom: t.nom,
    montant: t.montant,
    date: t.date,
  };
}

function majDernierMoisArchiveSupabase(mois: number, annee: number) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({
        dernier_mois_archive_mois: mois,
        dernier_mois_archive_annee: annee,
      })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error(
            "Supabase update dernier_mois_archive a échoué :",
            error,
          );
          signalerErreurSync(
            `Impossible de sauvegarder l'état d'archivage : ${error.message}`,
          );
        }
      });
  });
}

async function enregistrerSnapshotMoisSupabase(params: {
  mois: number;
  annee: number;
  epargne: number;
  disponible: number;
  totalDepense: number;
  enveloppes: SnapshotEnveloppe[];
  objectifs: SnapshotObjectif[];
}): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("Archivage du mois refusé : aucun utilisateur connecté.");
      signalerErreurSync("Tu dois être connecté pour archiver le mois.");
      return null;
    }

    const { data, error } = await supabase
      .from("snapshots_mois")
      .insert({
        user_id: user.id,
        mois: params.mois,
        annee: params.annee,
        epargne: params.epargne,
        disponible: params.disponible,
        total_depense: params.totalDepense,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("Supabase insert snapshots_mois a échoué :", error);
      signalerErreurSync(
        error
          ? `Impossible d'archiver le mois : ${error.message}`
          : "Impossible d'archiver le mois : réponse vide de Supabase.",
      );
      return null;
    }

    const snapshotId: string = data.id;

    if (params.enveloppes.length > 0) {
      const { error: erreurEnv } = await supabase
        .from("snapshot_enveloppes")
        .insert(
          params.enveloppes.map((e) => ({
            snapshot_mois_id: snapshotId,
            enveloppe_id: e.id,
            nom: e.nom,
            depense: e.depense,
            budget: e.budget,
            couleur: e.couleur,
            type: e.type,
          })),
        );
      if (erreurEnv) {
        console.error(
          "Supabase insert snapshot_enveloppes a échoué :",
          erreurEnv,
        );
        signalerErreurSync(
          `Impossible d'archiver le détail des enveloppes : ${erreurEnv.message}`,
        );
      }
    }

    if (params.objectifs.length > 0) {
      const { error: erreurObj } = await supabase
        .from("snapshot_objectifs")
        .insert(
          params.objectifs.map((o) => ({
            snapshot_mois_id: snapshotId,
            objectif_id: o.id,
            nom: o.nom,
            actuel: o.actuel,
            cible: o.cible,
          })),
        );
      if (erreurObj) {
        console.error(
          "Supabase insert snapshot_objectifs a échoué :",
          erreurObj,
        );
        signalerErreurSync(
          `Impossible d'archiver le détail des objectifs : ${erreurObj.message}`,
        );
      }
    }

    return snapshotId;
  } catch (e) {
    console.error("Archivage du mois a échoué :", e);
    signalerErreurSync(
      "Impossible d'archiver le mois : problème de connexion.",
    );
    return null;
  }
}

async function archiverMoisActuelInterne(mois: number, annee: number) {
  const dejaArchive = etat.historiquesMois.some(
    (s) => s.mois === mois && s.annee === annee,
  );
  if (dejaArchive) return;

  const enveloppesSnapshot: SnapshotEnveloppe[] = etat.enveloppes.map(
    (e) => ({
      id: e.id,
      nom: e.nom,
      depense: e.depense,
      budget: e.budget,
      couleur: e.couleur,
      type: e.type,
    }),
  );
  const objectifsSnapshot: SnapshotObjectif[] = etat.objectifs.map((o) => ({
    id: o.id,
    nom: o.nom,
    actuel: o.actuel,
    cible: o.cible,
  }));
  const epargne = etat.epargneMois;
  const disponible = etat.argentDisponible;
  const totalDepense =
    etat.enveloppes.reduce((acc, e) => acc + e.depense, 0) + etat.epargneMois;

  const enveloppesMaj = etat.enveloppes.map((e) => ({
    ...e,
    depense: 0,
    payee: e.type === "Fixe" ? false : e.payee,
  }));

  const snapshotId = await enregistrerSnapshotMoisSupabase({
    mois,
    annee,
    epargne,
    disponible,
    totalDepense,
    enveloppes: enveloppesSnapshot,
    objectifs: objectifsSnapshot,
  });

  const snapshot: SnapshotMois = {
    id: snapshotId ?? `local-${Date.now()}`,
    mois,
    annee,
    enveloppes: enveloppesSnapshot,
    objectifs: objectifsSnapshot,
    epargne,
    disponible,
    totalDepense,
  };

  setEtat({
    historiquesMois: [...etat.historiquesMois, snapshot],
    dernierMoisArchive: { mois, annee },
    epargneMois: 0,
    transactions: [],
  });
  appliquerEnveloppes(enveloppesMaj);
  majEpargneMoisSupabase(0);
  majDernierMoisArchiveSupabase(mois, annee);
}

function verifierArchivageMoisInterne() {
  const maintenant = new Date();
  const moisActuel = maintenant.getMonth();
  const anneeActuelle = maintenant.getFullYear();
  const dernier = etat.dernierMoisArchive;

  if (dernier === null) {
    const moisCourant = 5;
    const anneeCourante = 2026;
    if (moisActuel > moisCourant || anneeActuelle > anneeCourante) {
      archiverMoisActuelInterne(moisCourant, anneeCourante);
    }
    return;
  }

  // `dernier` est le dernier mois déjà archivé : on regarde si le mois
  // suivant est lui aussi terminé, auquel cas on l'archive à son tour.
  // Ça fait avancer le curseur d'un mois à chaque appel jusqu'à rattraper
  // le mois en cours (jamais archivé tant qu'il n'est pas terminé).
  const prochain = new Date(dernier.annee, dernier.mois + 1, 1);
  const moisAArchiver = prochain.getMonth();
  const anneeAArchiver = prochain.getFullYear();
  const estMoisEnCours =
    moisAArchiver === moisActuel && anneeAArchiver === anneeActuelle;

  if (!estMoisEnCours) {
    archiverMoisActuelInterne(moisAArchiver, anneeAArchiver);
  }
}

function verifierEvenementsFinanciersInterne() {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);

  const aAppliquer = etat.evenements.filter((e) => {
    if (!e.estFinancier || !e.montant) return false;
    if (!e.categorieLiee || e.categorieLiee === "Aucune") return false;
    if (e.montantApplique) return false;
    const dateEvenement = new Date(e.date);
    dateEvenement.setHours(0, 0, 0, 0);
    return dateEvenement <= aujourdhui;
  });

  if (aAppliquer.length === 0) return;

  let enveloppesMaj = etat.enveloppes;
  aAppliquer.forEach((e) => {
    enveloppesMaj = enveloppesMaj.map((env) =>
      env.nom === e.categorieLiee
        ? { ...env, depense: env.depense + (e.montant ?? 0) }
        : env,
    );
  });

  const idsAAppliquer = new Set(aAppliquer.map((e) => e.id));
  setEtat({
    evenements: etat.evenements.map((e) =>
      idsAAppliquer.has(e.id) ? { ...e, montantApplique: true } : e,
    ),
  });
  appliquerEnveloppes(enveloppesMaj);

  aAppliquer.forEach((e) => {
    majEvenementSupabase(e.id, { montant_applique: true });
  });
}

async function verifierEcheancesFixesInterne() {
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

  const nouveauxPaiements: Omit<PaiementHistorique, "id">[] = [];

  const enveloppesMaj = etat.enveloppes.map((env) => {
    if (env.type === "Fixe" && env.dateFixe && !env.payee) {
      const dateEcheance = new Date(env.dateFixe);
      dateEcheance.setHours(0, 0, 0, 0);
      if (dateEcheance <= aujourdhui) {
        const dejaEnregistree = dejaPayeeCeMois(env.id, dateEcheance);
        if (!dejaEnregistree) {
          nouveauxPaiements.push({
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
  if (!aChange) return;

  appliquerEnveloppes(enveloppesMaj);

  for (const champs of nouveauxPaiements) {
    await ajouterPaiementHistoriqueInterne(champs);
  }
}

function majEpargneMoisSupabase(montant: number) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({ epargne_mois: montant })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase update epargne_mois a échoué :", error);
          signalerErreurSync(
            `Impossible de sauvegarder l'épargne du mois : ${error.message}`,
          );
        }
      });
  });
}

function majArgentDisponibleSupabase(montant: number) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({ argent_disponible: montant })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error(
            "Supabase update argent_disponible a échoué :",
            error,
          );
          signalerErreurSync(
            `Impossible de sauvegarder le montant disponible : ${error.message}`,
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
      try {
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
      } catch (e) {
        console.error("Chargement des enveloppes a échoué :", e);
        signalerErreurSync(
          "Impossible de charger tes enveloppes : problème de connexion.",
        );
      }
    },

    ajouterEnveloppe: async (
      champs: Omit<Enveloppe, "id">,
    ): Promise<Enveloppe | null> => {
      try {
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
      } catch (e) {
        console.error("Création d'enveloppe a échoué :", e);
        signalerErreurSync(
          "Impossible de créer l'enveloppe : problème de connexion.",
        );
        return null;
      }
    },

    chargerObjectifs: async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const [{ data, error }, { data: profil, error: erreurProfil }] =
          await Promise.all([
            supabase.from("objectifs").select("*").eq("user_id", user.id),
            supabase
              .from("profils")
              .select(
                "epargne_mois, argent_disponible, dernier_mois_archive_mois, dernier_mois_archive_annee",
              )
              .eq("user_id", user.id)
              .single(),
          ]);

        if (error) {
          console.error("Supabase select objectifs a échoué :", error);
          signalerErreurSync(
            `Impossible de charger tes objectifs : ${error.message}`,
          );
          return;
        }
        if (erreurProfil) {
          console.error("Supabase select profil a échoué :", erreurProfil);
          signalerErreurSync(
            `Impossible de charger ton épargne du mois : ${erreurProfil.message}`,
          );
        }

        const dernierMoisArchive =
          profil?.dernier_mois_archive_mois !== undefined &&
          profil?.dernier_mois_archive_mois !== null &&
          profil?.dernier_mois_archive_annee !== undefined &&
          profil?.dernier_mois_archive_annee !== null
            ? {
                mois: profil.dernier_mois_archive_mois,
                annee: profil.dernier_mois_archive_annee,
              }
            : etat.dernierMoisArchive;

        setEtat({
          objectifs: (data ?? []).map(objectifDepuisLigne),
          epargneMois: profil?.epargne_mois ?? etat.epargneMois,
          argentDisponible: profil?.argent_disponible ?? etat.argentDisponible,
          dernierMoisArchive,
        });
      } catch (e) {
        console.error("Chargement des objectifs a échoué :", e);
        signalerErreurSync(
          "Impossible de charger tes objectifs : problème de connexion.",
        );
      }
    },

    ajouterObjectif: async (
      nom: string,
      cible: number,
      montantInitial: number,
      couleur: string,
      recurrent: boolean,
      montantMensuel?: number,
      jourDuMois?: number,
    ): Promise<Objectif | null> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.error(
            "Création d'objectif refusée : aucun utilisateur connecté (supabase.auth.getUser() a renvoyé null).",
          );
          signalerErreurSync("Tu dois être connecté pour créer un objectif.");
          return null;
        }

        const champs: Omit<Objectif, "id"> = {
          nom,
          cible,
          actuel: montantInitial,
          couleur,
          recurrent,
          montantMensuel: recurrent ? montantMensuel : undefined,
          jourDuMois: recurrent ? jourDuMois : undefined,
          dernierVersement: null,
        };

        const { data, error } = await supabase
          .from("objectifs")
          .insert({ ...objectifVersColonnes(champs), user_id: user.id })
          .select()
          .single();

        if (error || !data) {
          console.error("Supabase insert objectif a échoué :", error);
          signalerErreurSync(
            error
              ? `Impossible de créer l'objectif : ${error.message}`
              : "Impossible de créer l'objectif : réponse vide de Supabase.",
          );
          return null;
        }

        const nouvel = objectifDepuisLigne(data);
        setEtat({ objectifs: [...etat.objectifs, nouvel] });
        return nouvel;
      } catch (e) {
        console.error("Création d'objectif a échoué :", e);
        signalerErreurSync(
          "Impossible de créer l'objectif : problème de connexion.",
        );
        return null;
      }
    },

    chargerEvenements: async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("evenements")
          .select("*")
          .eq("user_id", user.id);

        if (error) {
          console.error("Supabase select evenements a échoué :", error);
          signalerErreurSync(
            `Impossible de charger tes événements : ${error.message}`,
          );
          return;
        }

        setEtat({ evenements: (data ?? []).map(evenementDepuisLigne) });
      } catch (e) {
        console.error("Chargement des événements a échoué :", e);
        signalerErreurSync(
          "Impossible de charger tes événements : problème de connexion.",
        );
      }
    },

    chargerTransactions: async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id);

        if (error) {
          console.error("Supabase select transactions a échoué :", error);
          signalerErreurSync(
            `Impossible de charger tes dépenses : ${error.message}`,
          );
          return;
        }

        setEtat({ transactions: (data ?? []).map(transactionDepuisLigne) });
      } catch (e) {
        console.error("Chargement des dépenses a échoué :", e);
        signalerErreurSync(
          "Impossible de charger tes dépenses : problème de connexion.",
        );
      }
    },

    chargerHistoriquePaiements: async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("historique_paiements")
          .select("*")
          .eq("user_id", user.id);

        if (error) {
          console.error(
            "Supabase select historique_paiements a échoué :",
            error,
          );
          signalerErreurSync(
            `Impossible de charger l'historique des paiements : ${error.message}`,
          );
          return;
        }

        setEtat({
          historiquePaiements: (data ?? []).map(paiementHistoriqueDepuisLigne),
        });
      } catch (e) {
        console.error("Chargement de l'historique des paiements a échoué :", e);
        signalerErreurSync(
          "Impossible de charger l'historique des paiements : problème de connexion.",
        );
      }
    },

    chargerHistoriquesMois: async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: snapshots, error } = await supabase
          .from("snapshots_mois")
          .select("*")
          .eq("user_id", user.id);

        if (error) {
          console.error("Supabase select snapshots_mois a échoué :", error);
          signalerErreurSync(
            `Impossible de charger l'historique mensuel : ${error.message}`,
          );
          return;
        }

        if (!snapshots || snapshots.length === 0) {
          setEtat({ historiquesMois: [] });
          return;
        }

        const snapshotIds = snapshots.map((s) => s.id);

        const [
          { data: enveloppesRows, error: erreurEnv },
          { data: objectifsRows, error: erreurObj },
        ] = await Promise.all([
          supabase
            .from("snapshot_enveloppes")
            .select("*")
            .in("snapshot_mois_id", snapshotIds),
          supabase
            .from("snapshot_objectifs")
            .select("*")
            .in("snapshot_mois_id", snapshotIds),
        ]);

        if (erreurEnv) {
          console.error(
            "Supabase select snapshot_enveloppes a échoué :",
            erreurEnv,
          );
          signalerErreurSync(
            `Impossible de charger le détail des enveloppes archivées : ${erreurEnv.message}`,
          );
        }
        if (erreurObj) {
          console.error(
            "Supabase select snapshot_objectifs a échoué :",
            erreurObj,
          );
          signalerErreurSync(
            `Impossible de charger le détail des objectifs archivés : ${erreurObj.message}`,
          );
        }

        const historiquesMois: SnapshotMois[] = snapshots.map((s) => ({
          id: s.id,
          mois: s.mois,
          annee: s.annee,
          epargne: s.epargne,
          disponible: s.disponible,
          totalDepense: s.total_depense,
          enveloppes: (enveloppesRows ?? [])
            .filter((e) => e.snapshot_mois_id === s.id)
            .map((e) => ({
              id: e.enveloppe_id,
              nom: e.nom,
              depense: e.depense,
              budget: e.budget,
              couleur: e.couleur,
              type: e.type,
            })),
          objectifs: (objectifsRows ?? [])
            .filter((o) => o.snapshot_mois_id === s.id)
            .map((o) => ({
              id: o.objectif_id,
              nom: o.nom,
              actuel: o.actuel,
              cible: o.cible,
            })),
        }));

        setEtat({ historiquesMois });
      } catch (e) {
        console.error("Chargement de l'historique mensuel a échoué :", e);
        signalerErreurSync(
          "Impossible de charger l'historique mensuel : problème de connexion.",
        );
      }
    },

    modifierEpargneMois: (montant: number) => {
      setEtat({ epargneMois: montant });
      majEpargneMoisSupabase(montant);
    },

    modifierObjectif: (
      id: string,
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

      const colonnes: Record<string, unknown> = {};
      if ("nom" in champs) colonnes.nom = champs.nom;
      if ("cible" in champs) colonnes.cible = champs.cible;
      if ("couleur" in champs) colonnes.couleur = champs.couleur;
      if ("recurrent" in champs) colonnes.recurrent = champs.recurrent ?? null;
      if ("montantMensuel" in champs)
        colonnes.montant_mensuel = champs.montantMensuel ?? null;
      if ("jourDuMois" in champs)
        colonnes.jour_du_mois = champs.jourDuMois ?? null;

      majObjectifSupabase(id, colonnes);
    },

    ajouterFondsObjectif: (id: string, montant: number) => {
      const objectif = etat.objectifs.find((o) => o.id === id);
      if (!objectif) return;
      const nouveauActuel = objectif.actuel + montant;
      const nouvelleEpargneMois = etat.epargneMois + montant;

      setEtat({
        objectifs: etat.objectifs.map((o) =>
          o.id === id ? { ...o, actuel: nouveauActuel } : o,
        ),
        epargneMois: nouvelleEpargneMois,
      });

      majObjectifSupabase(id, { actuel: nouveauActuel });
      majEpargneMoisSupabase(nouvelleEpargneMois);
    },

    verifierVersementsObjectifs: () => {
      const aujourdhui = new Date();
      const jourActuel = aujourdhui.getDate();
      const moisActuel = aujourdhui.getMonth();
      const anneeActuelle = aujourdhui.getFullYear();

      let totalVerse = 0;
      const objectifsVerses: Objectif[] = [];
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
          const maj: Objectif = {
            ...o,
            actuel: o.actuel + o.montantMensuel,
            dernierVersement: { mois: moisActuel, annee: anneeActuelle },
          };
          objectifsVerses.push(maj);
          return maj;
        }
        return o;
      });

      if (objectifsVerses.length > 0) {
        const nouvelleEpargneMois = etat.epargneMois + totalVerse;
        setEtat({
          objectifs: objectifsMaj,
          epargneMois: nouvelleEpargneMois,
        });

        objectifsVerses.forEach((o) => {
          majObjectifSupabase(o.id, {
            actuel: o.actuel,
            dernier_versement_mois: o.dernierVersement!.mois,
            dernier_versement_annee: o.dernierVersement!.annee,
          });
        });
        majEpargneMoisSupabase(nouvelleEpargneMois);
      }
    },

    supprimerObjectif: (id: string) => {
      setEtat({ objectifs: etat.objectifs.filter((o) => o.id !== id) });
      supabase
        .from("objectifs")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("Supabase delete objectif a échoué :", error);
            signalerErreurSync(
              `Impossible de supprimer l'objectif : ${error.message}`,
            );
          }
        });
    },

    modifierEnveloppes: (enveloppes: Enveloppe[]) => {
      appliquerEnveloppes(enveloppes);
    },

    modifierArgentDisponible: (montant: number) => {
      setEtat({ argentDisponible: montant });
      majArgentDisponibleSupabase(montant);
    },

    archiverMoisActuel: (mois: number, annee: number) => {
      archiverMoisActuelInterne(mois, annee);
    },

    verifierArchivageMois: () => {
      verifierArchivageMoisInterne();
    },

    verifierEvenementsFinanciers: () => {
      verifierEvenementsFinanciersInterne();
    },

    verifierEcheancesFixes: () => {
      verifierEcheancesFixesInterne();
    },

    ajouterEvenement: async (
      champs: Omit<Evenement, "id">,
    ): Promise<Evenement | null> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.error(
            "Création d'événement refusée : aucun utilisateur connecté (supabase.auth.getUser() a renvoyé null).",
          );
          signalerErreurSync("Tu dois être connecté pour créer un événement.");
          return null;
        }

        const { data, error } = await supabase
          .from("evenements")
          .insert({ ...evenementVersColonnes(champs), user_id: user.id })
          .select()
          .single();

        if (error || !data) {
          console.error("Supabase insert evenement a échoué :", error);
          signalerErreurSync(
            error
              ? `Impossible de créer l'événement : ${error.message}`
              : "Impossible de créer l'événement : réponse vide de Supabase.",
          );
          return null;
        }

        const nouvel = evenementDepuisLigne(data);
        setEtat({ evenements: [...etat.evenements, nouvel] });

        if (
          nouvel.estFinancier &&
          nouvel.montant &&
          nouvel.categorieLiee &&
          nouvel.categorieLiee !== "Aucune"
        ) {
          verifierEvenementsFinanciersInterne();
        }

        return nouvel;
      } catch (e) {
        console.error("Création d'événement a échoué :", e);
        signalerErreurSync(
          "Impossible de créer l'événement : problème de connexion.",
        );
        return null;
      }
    },

    supprimerEvenement: (id: string) => {
      const ev = etat.evenements.find((e) => e.id === id);
      setEtat({ evenements: etat.evenements.filter((e) => e.id !== id) });

      if (
        ev?.estFinancier &&
        ev.montantApplique &&
        ev.montant &&
        ev.categorieLiee &&
        ev.categorieLiee !== "Aucune"
      ) {
        const enveloppesMaj = etat.enveloppes.map((e) =>
          e.nom === ev.categorieLiee
            ? { ...e, depense: Math.max(0, e.depense - ev.montant!) }
            : e,
        );
        appliquerEnveloppes(enveloppesMaj);
      }

      supabase
        .from("evenements")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("Supabase delete evenement a échoué :", error);
            signalerErreurSync(
              `Impossible de supprimer l'événement : ${error.message}`,
            );
          }
        });
    },

    modifierEvenement: (id: string, champs: Partial<Omit<Evenement, "id">>) => {
      const ancien = etat.evenements.find((e) => e.id === id);

      setEtat({
        evenements: etat.evenements.map((e) =>
          e.id === id ? { ...e, ...champs } : e,
        ),
      });

      const colonnes: Record<string, unknown> = {};
      if ("nom" in champs) colonnes.nom = champs.nom;
      if ("date" in champs) colonnes.date = champs.date;
      if ("heure" in champs)
        colonnes.heure = champs.heure
          ? heureVersColonneSupabase(champs.heure)
          : champs.heure;
      if ("duree" in champs) colonnes.duree = champs.duree;
      if ("couleur" in champs) colonnes.couleur = champs.couleur;
      if ("estFinancier" in champs) colonnes.est_financier = champs.estFinancier;
      if ("montant" in champs) colonnes.montant = champs.montant ?? null;
      if ("categorieLiee" in champs)
        colonnes.categorie_liee = champs.categorieLiee ?? null;
      if ("recurrent" in champs) colonnes.recurrent = champs.recurrent ?? null;
      if ("frequence" in champs) colonnes.frequence = champs.frequence ?? null;
      if ("touteLaJournee" in champs)
        colonnes.toute_la_journee = champs.touteLaJournee ?? null;
      if ("notifierActif" in champs)
        colonnes.notifier_actif = champs.notifierActif ?? null;

      const champsFinanciers =
        "estFinancier" in champs ||
        "montant" in champs ||
        "categorieLiee" in champs ||
        "date" in champs;

      if (ancien?.montantApplique && champsFinanciers) {
        if (
          ancien.estFinancier &&
          ancien.montant &&
          ancien.categorieLiee &&
          ancien.categorieLiee !== "Aucune"
        ) {
          const enveloppesMaj = etat.enveloppes.map((env) =>
            env.nom === ancien.categorieLiee
              ? { ...env, depense: Math.max(0, env.depense - ancien.montant!) }
              : env,
          );
          appliquerEnveloppes(enveloppesMaj);
        }
        colonnes.montant_applique = null;
        setEtat({
          evenements: etat.evenements.map((e) =>
            e.id === id ? { ...e, montantApplique: undefined } : e,
          ),
        });
      }

      majEvenementSupabase(id, colonnes);

      if (champsFinanciers) {
        verifierEvenementsFinanciersInterne();
      }
    },

    ajouterTransaction: async (
      nom: string,
      montant: number,
      enveloppeId: string,
      date: string,
    ): Promise<Transaction | null> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.error(
            "Création de dépense refusée : aucun utilisateur connecté (supabase.auth.getUser() a renvoyé null).",
          );
          signalerErreurSync("Tu dois être connecté pour ajouter une dépense.");
          return null;
        }

        const champs: Omit<Transaction, "id"> = {
          nom,
          montant,
          enveloppeId,
          date,
        };

        const { data, error } = await supabase
          .from("transactions")
          .insert({ ...transactionVersColonnes(champs), user_id: user.id })
          .select()
          .single();

        if (error || !data) {
          console.error("Supabase insert transaction a échoué :", error);
          signalerErreurSync(
            error
              ? `Impossible d'ajouter la dépense : ${error.message}`
              : "Impossible d'ajouter la dépense : réponse vide de Supabase.",
          );
          return null;
        }

        const nouvelle = transactionDepuisLigne(data);
        const enveloppesMaj = etat.enveloppes.map((e) =>
          e.id === enveloppeId ? { ...e, depense: e.depense + montant } : e,
        );
        setEtat({ transactions: [...etat.transactions, nouvelle] });
        appliquerEnveloppes(enveloppesMaj);
        return nouvelle;
      } catch (e) {
        console.error("Ajout de dépense a échoué :", e);
        signalerErreurSync(
          "Impossible d'ajouter la dépense : problème de connexion.",
        );
        return null;
      }
    },

    supprimerTransaction: (id: string) => {
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
      supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("Supabase delete transaction a échoué :", error);
            signalerErreurSync(
              `Impossible de supprimer la dépense : ${error.message}`,
            );
          }
        });
    },
  };
}

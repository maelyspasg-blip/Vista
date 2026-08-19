import { Enveloppe, SnapshotMois } from "../app/store";

// Forme minimale nécessaire pour résoudre le mois de comptage et calculer le
// total "Entrées" d'un mois — satisfaite structurellement à la fois par
// `Enveloppe` (app/store.ts) et par `CategorieExport` (utils/exportExcel.ts).
// Permet à l'export Excel et au résumé visuel de réutiliser exactement le
// même calcul que l'app plutôt que de le dupliquer avec leur propre type.
export type EnveloppeComptable = {
  type: "Fixe" | "Variable" | "Entrée";
  dateFixe?: string;
  payee?: boolean;
  moisComptage?: string;
  depense: number;
  budget: number;
};

// Mois auquel une enveloppe "Entrée" est comptée : moisComptage si défini,
// sinon le mois calendaire de dateFixe (compat des lignes créées avant
// l'introduction de ce champ). Même logique que côté store — dupliquée ici
// car utils/ ne doit pas dépendre de la logique interne de store.ts, mais
// le calcul lui-même reste identique.
export function moisComptageEffectif(env: EnveloppeComptable): string | undefined {
  if (env.moisComptage) return env.moisComptage;
  if (env.dateFixe) {
    const d = new Date(env.dateFixe);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return undefined;
}

export type EntreesBudgetMois<T extends EnveloppeComptable = Enveloppe> = {
  entrees: T[];
  recu: number;
  attendu: number;
  total: number;
};

/**
 * "Budget" du mois en cours (ou de tout mois pas encore archivé) : la somme
 * des enveloppes type "Entrée" comptées pour ce mois — reçues (payee) et
 * encore attendues confondues. Remplace le calcul dupliqué indépendamment
 * dans index.tsx/budget.tsx/analytics.tsx, et dans l'export Excel/résumé
 * visuel (cf. utils/exportExcel.ts, utils/rapportVisuel.ts).
 */
export function entreesBudgetDuMois<T extends EnveloppeComptable>(
  enveloppes: T[],
  annee: number,
  mois: number,
): EntreesBudgetMois<T> {
  const moisISO = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
  const entrees = enveloppes.filter(
    (e) => e.type === "Entrée" && moisComptageEffectif(e) === moisISO,
  );
  const recu = entrees
    .filter((e) => e.payee)
    .reduce((acc, e) => acc + e.depense, 0);
  const attendu = entrees
    .filter((e) => !e.payee)
    .reduce((acc, e) => acc + e.budget, 0);
  return { entrees, recu, attendu, total: recu + attendu };
}

/**
 * "Budget" d'un mois déjà archivé : pré-calculé au moment de l'archivage
 * (cf. archiverMoisActuelInterne dans store.ts) et stocké dans
 * SnapshotMois.disponible — pas besoin de re-dériver depuis les enveloppes
 * archivées, qui ne portent plus l'information de mois de comptage.
 */
export function budgetDuMoisArchive(snapshot: SnapshotMois): number {
  return snapshot.disponible;
}

/**
 * Une catégorie (tout type confondu) est-elle active pour le mois donné ?
 * "Active" = doit apparaître dans les listes courantes (Tes catégories
 * d'Aperçu/Budget). Une catégorie permanente (Variable récurrente, Fixe qui
 * se répète chaque mois) est toujours active, quel que soit le mois — c'est
 * le comportement historique, inchangé. Une catégorie ponctuelle (non
 * récurrente) n'est active que pour son propre mois — Entrée via
 * moisComptage, Fixe via dateFixe (jamais avancée pour une facture qui ne se
 * répète pas, donc fiable comme "mois auquel elle appartient"), Variable via
 * moisComptage (fixé à la création, pas de date naturelle sinon).
 */
// RÈGLE À NE JAMAIS CASSER : toute liste qui affiche "les catégories du mois
// courant" (Aperçu "Tes catégories", Budget) doit filtrer avec CETTE
// fonction, pas avec un simple `.filter(e => e.type !== "Entrée")` — ce
// dernier laisserait passer des catégories Variable/Fixe ponctuelles dont le
// mois est déjà passé ou pas encore arrivé. À l'inverse, ne PAS l'appliquer
// aux agrégations qui portent volontairement sur toute une période
// (analytics.tsx séries/comparaisons, score.ts, conseils.ts, series.ts) :
// ces calculs ont besoin de voir les catégories de tous les mois concernés,
// pas seulement celles actives "aujourd'hui".
export function estCategorieActiveCeMois(
  env: Enveloppe,
  annee: number,
  mois: number,
): boolean {
  const moisISO = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
  if (env.type === "Entrée") {
    return moisComptageEffectif(env) === moisISO;
  }
  const estPermanente =
    env.type === "Fixe" ? !!env.repeteChaqueMois : !!env.recurrente;
  if (estPermanente) return true;
  return moisComptageEffectif(env) === moisISO;
}

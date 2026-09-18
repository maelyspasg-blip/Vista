import { Enveloppe, SnapshotMois } from "../app/store";
import { parseDateFixeLocale } from "./dateOnly";

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
    const d = parseDateFixeLocale(env.dateFixe);
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
  // RÈGLE À NE JAMAIS CASSER — SUPPRESSION DOUCE (décision produit du
  // 2026-09-18, P052) : une catégorie "supprimée" (env.supprimeeLe non nul,
  // cf. app/store.ts::supprimerEnveloppe) ne doit plus jamais apparaître
  // dans "Tes catégories"/un picker de création, quel que soit son type ou
  // sa récurrence — c'est la SEULE porte de sortie de ce type de catégorie,
  // vérifiée AVANT toute autre règle ci-dessous. Sa dépense réelle du mois
  // où elle a été supprimée reste néanmoins comptabilisée ailleurs, cf.
  // calculerResteEstimeCourant/estSupprimeeCeMois plus bas — ce filtre-ci
  // ne gère QUE la visibilité dans les listes/le budget prévu restant,
  // jamais le total dépensé.
  if (env.supprimeeLe) return false;
  const moisISO = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
  if (env.type === "Entrée") {
    return moisComptageEffectif(env) === moisISO;
  }
  const estPermanente =
    env.type === "Fixe" ? !!env.repeteChaqueMois : !!env.recurrente;
  if (estPermanente) return true;
  return moisComptageEffectif(env) === moisISO;
}

// RÈGLE À NE JAMAIS CASSER — COMPLÉMENT DE estCategorieActiveCeMois
// (décision produit du 2026-09-18, P052) : une catégorie supprimée est
// TOUJOURS exclue de estCategorieActiveCeMois (ci-dessus), y compris pour
// le mois où la suppression a eu lieu — mais sa dépense réelle DE CE
// MOIS-LÀ doit rester comptabilisée dans les totaux (décision produit :
// "toujours comptabilisées dans les totaux et statistiques"). Cette
// fonction répond à une question différente et complémentaire : "cette
// catégorie a-t-elle été supprimée PENDANT le mois `annee`/`mois` ?" — vrai
// un seul mois dans la vie d'une catégorie (celui de sa suppression),
// jamais avant ni après. `supprimeeLe` est un timestamp Supabase complet
// (pas une date seule façon "YYYY-MM-DD") : `new Date(...)` natif est donc
// sûr ici, aucun risque du bug de parsing UTC/local qui touche les dates
// seules (cf. utils/dateOnly.ts) — un timestamp complet porte son propre
// fuseau, `getFullYear()`/`getMonth()` le restituent déjà en heure locale.
// RÈGLE : `id` inclus dans le Pick uniquement pour satisfaire la détection
// TypeScript des "types faibles" (un type entièrement composé de champs
// optionnels comme `{ supprimeeLe?: ... }` seul est rejeté par TS s'il n'a
// AUCUN champ en commun avec le type réellement passé, ex. EnveloppePartenaire,
// utils/espacePartage.ts — erreur TS2559) — jamais utilisé dans le corps de
// la fonction, ni un vrai besoin fonctionnel.
export function estSupprimeeCeMois(
  env: Pick<Enveloppe, "id" | "supprimeeLe">,
  annee: number,
  mois: number,
): boolean {
  if (!env.supprimeeLe) return false;
  const d = new Date(env.supprimeeLe);
  return d.getFullYear() === annee && d.getMonth() === mois;
}

export type ResteEstimeCourant = {
  disponibleEffectif: number;
  totalDepenseEnveloppes: number;
  totalDepensePrevue: number;
  resteEstime: number;
};

// RÈGLE À NE JAMAIS CASSER : SEULE source du "Reste estimé en fin de mois"
// du mois en cours — Aperçu (app/(tabs)/index.tsx) et le bloc coach de
// Stats ("Ce que Vista a remarqué"/"Ta prochaine décision",
// app/(tabs)/analytics.tsx) doivent TOUS LES DEUX appeler cette fonction,
// jamais reconstruire la formule indépendamment. Deux copies de la même
// formule finissent toujours par diverger silencieusement au premier
// changement fait dans une seule des deux — c'est exactement ce qui
// produisait des chiffres incohérents entre Aperçu et les conseils de
// Stats. Même filtre que "Tes catégories" (estCategorieActiveCeMois) :
// une catégorie ponctuelle d'un autre mois ne doit compter ni dans les
// totaux financiers, ni fausser "Reste estimé".
export function calculerResteEstimeCourant(
  enveloppes: Enveloppe[],
  epargneMois: number,
  annee: number,
  mois: number,
): ResteEstimeCourant {
  const enveloppesActivesSansEntree = enveloppes.filter(
    (e) => e.type !== "Entrée" && estCategorieActiveCeMois(e, annee, mois),
  );
  // RÈGLE À NE JAMAIS CASSER — CATÉGORIES SUPPRIMÉES CE MOIS-CI (décision
  // produit du 2026-09-18, P052) : exclues de enveloppesActivesSansEntree
  // ci-dessus (via estCategorieActiveCeMois, jamais visibles dans "Tes
  // catégories" ni dans le budget prévu restant) — mais leur dépense RÉELLE
  // déjà engagée ce mois-ci doit rester comptabilisée dans le total
  // dépensé, sans quoi "Reste estimé" afficherait plus d'argent disponible
  // qu'il n'y en a réellement. `estSupprimeeCeMois` (pas juste
  // `e.supprimeeLe`) borne cet ajout au SEUL mois de la suppression — un
  // mois plus tard, cette catégorie est déjà "vestigiale" (cf. RÈGLE dans
  // archiverMoisActuelInterneCoeur, app/store.ts) et ne doit plus compter
  // nulle part dans le mois courant.
  const enveloppesSupprimeesCeMois = enveloppes.filter(
    (e) => e.type !== "Entrée" && estSupprimeeCeMois(e, annee, mois),
  );
  const totalDepenseEnveloppes =
    enveloppesActivesSansEntree.reduce((acc, e) => acc + e.depense, 0) +
    enveloppesSupprimeesCeMois.reduce((acc, e) => acc + e.depense, 0);
  const totalDepensePrevue = enveloppesActivesSansEntree.reduce(
    (acc, e) => acc + Math.max(0, e.budget - e.depense),
    0,
  );
  const disponibleEffectif = entreesBudgetDuMois(enveloppes, annee, mois).total;
  const resteEstime =
    disponibleEffectif - totalDepenseEnveloppes - totalDepensePrevue - epargneMois;
  return { disponibleEffectif, totalDepenseEnveloppes, totalDepensePrevue, resteEstime };
}

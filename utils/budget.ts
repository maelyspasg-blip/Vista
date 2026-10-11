import { Enveloppe, SnapshotMois } from "../app/store";
import { parseDateFixeLocale } from "./dateOnly";

// Forme minimale nécessaire pour résoudre le mois de comptage et calculer le
// total "Entrées" d'un mois — satisfaite structurellement à la fois par
// `Enveloppe` (app/store.ts) et par `CategorieExport` (utils/exportExcel.ts).
// Permet à l'export Excel et au résumé visuel de réutiliser exactement le
// même calcul que l'app plutôt que de le dupliquer avec leur propre type.
// `id`/`supprimeeLe` ajoutés le 2026-09-18 (bug trouvé : une catégorie
// "Entrée" supprimée continuait d'être comptée comme "à venir" dans Reste
// estimé) — nécessaires pour appeler estSupprimeeCeMois depuis
// entreesBudgetDuMois ci-dessous. `CategorieExport` n'a pas `supprimeeLe`
// (optionnel, donc compatible structurellement : traité comme "jamais
// supprimée", correct pour des données déjà archivées/figées).
export type EnveloppeComptable = {
  id: string;
  type: "Fixe" | "Variable" | "Entrée";
  dateFixe?: string;
  payee?: boolean;
  moisComptage?: string;
  depense: number;
  budget: number;
  supprimeeLe?: string | null;
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
  // RÈGLE À NE JAMAIS CASSER — CATÉGORIE "ENTRÉE" SUPPRIMÉE = NE COMPTE PLUS
  // DU TOUT (décision de Maëlys du 2026-10-11, P075 — remplace l'exception
  // du 2026-09-18 qui gardait le montant déjà REÇU d'une entrée supprimée
  // ce mois-ci) : supprimer une entrée, c'est le plus souvent retirer un
  // doublon (ex. salaire saisi deux fois) — la garder dans le total
  // affichait ~4000 € au lieu de ~2000 €, alors que la liste (statut
  // "masquee", cf. statutAffichageEntree) ne la montrait déjà plus. Le
  // total suit donc exactement la liste. NE S'APPLIQUE QU'AUX ENTRÉES : la
  // dépense réelle d'une catégorie Fixe/Variable supprimée ce mois-ci reste
  // comptée (P052, calculerResteEstimeCourant) — de l'argent réellement
  // sorti, lui.
  const entrees = enveloppes.filter(
    (e) =>
      e.type === "Entrée" &&
      !e.supprimeeLe &&
      moisComptageEffectif(e) === moisISO,
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

// RÈGLE À NE JAMAIS CASSER — MARGE D'UN MOIS ARCHIVÉ, SOURCE UNIQUE (bug
// P067 corrigé le 2026-10-09) : `totalDepense` d'un snapshot CONTIENT DÉJÀ
// l'épargne du mois (`totalDepense = depenseReelle + epargneMois`,
// app/store.ts::archiverMoisActuelInterneCoeur — et le seed invité suit la
// même convention). Les 3 copies locales (conseils, trophées, Ton bilan)
// calculaient `disponible − totalDepense − epargne` : l'épargne était
// retirée DEUX fois, pénalisant à tort un utilisateur qui épargne. Même
// valeur que `resteReel` à la clôture du mois. Ne jamais réécrire cette
// formule localement.
export function margeMoisArchive(
  snapshot: Pick<SnapshotMois, "disponible" | "totalDepense">,
): number {
  return snapshot.disponible - snapshot.totalDepense;
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

// RÈGLE À NE JAMAIS CASSER — LIGNES D'ENTRÉES AFFICHÉES (demande du
// 2026-10-09) : SOURCE UNIQUE des lignes vertes "entrées d'argent" d'Aperçu
// ET de Budget — pour les mêmes catégories en entrée, une entrée absente de
// l'un ne doit jamais apparaître dans l'autre, donc jamais de filtre
// réinventé localement dans l'un des deux écrans. (En vue partagée, Aperçu
// passe ses catégories fusionnées et Budget les siennes : divergence de
// SOURCE antérieure à cette règle, pas de filtre.) Règle exacte demandée,
// conditions cumulatives :
//   - mois de comptage = mois affiché (entreesAffichablesDuMois)
//   - catégorie NON supprimée (supprimeeLe null) → sinon masquée, même avec
//     un montant reçu (demande du 2026-10-10 : elle disparaît
//     immédiatement du listing)
//   - depense > 0                    → "recue"
//   - depense = 0, date future       → "a_venir" (section "À venir" seule)
//   - depense = 0, pas de date       → masquée
//   - depense = 0, date atteinte     → masquée (attendue mais non reçue),
//     SAUF date dans un mois antérieur au mois de comptage → "a_venir"
//     (P068, cf. RÈGLE dans statutAffichageEntree)
// Écart assumé : `depense !== 0` plutôt que `> 0` pour "recue" — le seul
// cas négatif est "Report du mois précédent" en déficit (archivage), un vrai
// montant du mois qu'on ne doit pas cacher. Les totaux (entreesBudgetDuMois, calculerResteEstime-
// Courant, Stats, Budget) ne sont pas filtrés par cette fonction — SEULE
// exception voulue : les chiffres du hero d'Aperçu (demande du 2026-10-09),
// calculés à partir de ces mêmes lignes via revenusDuMoisHero, pour que le
// hero et la liste "entrées ce mois-ci" partent toujours des mêmes entrées.
// Limite connue (vue partagée) : une ligne fusionnée à moitié reçue est
// listée une seule fois "reçue", alors que le hero compte aussi sa part
// encore attendue dans "à recevoir" (ventilation part par part).
export type StatutAffichageEntree = "recue" | "a_venir" | "masquee";

export function statutAffichageEntree(
  env: Enveloppe,
  aujourdhui: Date,
): StatutAffichageEntree {
  if (env.supprimeeLe) return "masquee";
  if (env.depense !== 0) return "recue";
  if (!env.dateFixe) return "masquee";
  const dateReception = parseDateFixeLocale(env.dateFixe);
  dateReception.setHours(0, 0, 0, 0);
  const debutJour = new Date(aujourdhui);
  debutJour.setHours(0, 0, 0, 0);
  if (dateReception > debutJour) return "a_venir";
  // RÈGLE (décision de Maëlys du 2026-10-10, P068) : une entrée dont la
  // date de réception tombe dans un mois ANTÉRIEUR à son mois de comptage
  // (créée avec une date passée, comptée pour le mois en cours) reste
  // visible dans "À venir" avec sa date tant que rien n'est reçu —
  // "l'utilisateur a créé cette entrée, il doit la voir quelque part".
  // Une date déjà passée DANS le mois de comptage reste masquée (règle
  // ci-dessus inchangée).
  const moisComptageEntree = moisComptageEffectif(env)?.slice(0, 7);
  if (moisComptageEntree && env.dateFixe.slice(0, 7) < moisComptageEntree) {
    return "a_venir";
  }
  return "masquee";
}

// Entrées du mois `annee`/`mois` à afficher (Aperçu et Budget), avec leur
// statut — cf. RÈGLE ci-dessus.
export function entreesAffichablesDuMois<T extends Enveloppe>(
  enveloppes: T[],
  annee: number,
  mois: number,
  aujourdhui: Date,
): { env: T; statut: Exclude<StatutAffichageEntree, "masquee"> }[] {
  // RÈGLE À NE JAMAIS CASSER — FILTRE MOIS + ANNÉE (vérifié le 2026-10-10) :
  // comparaison des 7 premiers caractères "AAAA-MM" du mois de comptage
  // (mois ET année), jamais `new Date(moisComptage)` : une date seule
  // "AAAA-MM-JJ" est lue en UTC par `new Date`, et sur un appareil à
  // décalage négatif le 1er du mois devient le dernier jour du mois
  // précédent (cf. utils/dateOnly.ts). `.slice(0, 7)` tolère aussi un
  // éventuel format horodaté ("2026-09-01T00:00:00").
  const moisCible = `${annee}-${String(mois + 1).padStart(2, "0")}`;
  const resultat: { env: T; statut: Exclude<StatutAffichageEntree, "masquee"> }[] =
    [];
  enveloppes.forEach((env) => {
    if (env.type !== "Entrée") return;
    const moisEntree = moisComptageEffectif(env)?.slice(0, 7);
    const statut =
      moisEntree === moisCible
        ? statutAffichageEntree(env, aujourdhui)
        : "masquee";
    if (statut !== "masquee") resultat.push({ env, statut });
  });
  return resultat;
}

// Une "part" d'une ligne d'Entrée : la ligne elle-même en vue personnelle,
// ou chacune des entrées (la mienne, celle du partenaire) réunies dans une
// ligne fusionnée en vue partagée (utils/espacePartage.ts::
// fusionnerCategoriesParNom, champ partsEntree) — chaque part garde SA
// date de réception et SON montant reçu/attendu.
export type PartEntree = {
  depense: number;
  budget: number;
  dateFixe?: string;
};

// Date "représentative" d'une ligne d'Entrée fusionnée (2026-10-09) : la
// plus proche date FUTURE d'une part encore attendue (depense 0) s'il y en
// a une — la ligne reste alors "à venir" tant qu'une part l'est —, sinon la
// plus ancienne date connue. `undefined` si aucune part n'est datée.
export function dateRepresentativeEntree(
  parts: PartEntree[],
  aujourdhui: Date,
): string | undefined {
  const debutJour = new Date(aujourdhui);
  debutJour.setHours(0, 0, 0, 0);
  const datees = parts.filter((p) => !!p.dateFixe);
  const futuresAttendues = datees
    .filter(
      (p) => p.depense === 0 && parseDateFixeLocale(p.dateFixe!) > debutJour,
    )
    .map((p) => p.dateFixe!)
    .sort();
  if (futuresAttendues.length > 0) return futuresAttendues[0];
  return datees.map((p) => p.dateFixe!).sort()[0];
}

// RÈGLE À NE JAMAIS CASSER — REVENUS DU HERO D'APERÇU (demande du
// 2026-10-09) : ventile, PART PAR PART (cf. PartEntree), les lignes
// d'entrées affichées (entreesAffichablesDuMois) en :
//   - recu       : somme des montants reçus (depense ≠ 0) ;
//   - aRecevoir  : somme des montants attendus (budget) des parts non reçues
//                  dont la date de réception est FUTURE et DANS le mois
//                  civil de `aujourdhui` — jamais un mois suivant — ou
//                  dans un mois ANTÉRIEUR (entrée créée avec une date passée
//                  et comptée pour ce mois, P068) ;
//   - aRecevoirDetail : ces mêmes parts une à une (nom de la ligne, date,
//                  montant), dans l'ordre des dates — sert à la ligne de
//                  précision du hero ("En comptant Salaire du 25 octobre").
// Seul usage voulu : le hero d'Aperçu (RESTE ESTIMÉ FIN DE MOIS et sa
// ligne de précision « En comptant… »). Les autres totaux (entreesBudgetDuMois, calculerResteEstime-
// Courant, Stats, Budget) n'en dépendent pas.
export function revenusDuMoisHero(
  lignes: { env: Enveloppe & { partsEntree?: PartEntree[] } }[],
  aujourdhui: Date,
): {
  recu: number;
  aRecevoir: number;
  aRecevoirDetail: { nom: string; dateFixe: string; montant: number }[];
} {
  const debutJour = new Date(aujourdhui);
  debutJour.setHours(0, 0, 0, 0);
  let recu = 0;
  let aRecevoir = 0;
  const aRecevoirDetail: { nom: string; dateFixe: string; montant: number }[] =
    [];
  lignes.forEach(({ env }) => {
    const parts: PartEntree[] = env.partsEntree ?? [
      { depense: env.depense, budget: env.budget, dateFixe: env.dateFixe },
    ];
    parts.forEach((p) => {
      if (p.depense !== 0) {
        recu += p.depense;
        return;
      }
      if (!p.dateFixe) return;
      const d = parseDateFixeLocale(p.dateFixe);
      const dateFutureCeMois =
        d > debutJour &&
        d.getFullYear() === debutJour.getFullYear() &&
        d.getMonth() === debutJour.getMonth();
      // P068 (2026-10-10) : part datée d'un mois ANTÉRIEUR au mois en cours
      // mais comptée pour lui (les lignes reçues ici sont celles du mois
      // affiché) — attendue ce mois-ci, comme dans "À venir".
      const dateMoisAnterieur =
        d.getFullYear() * 12 + d.getMonth() <
        debutJour.getFullYear() * 12 + debutJour.getMonth();
      if (dateFutureCeMois || dateMoisAnterieur) {
        aRecevoir += p.budget;
        aRecevoirDetail.push({
          nom: env.nom,
          dateFixe: p.dateFixe,
          montant: p.budget,
        });
      }
    });
  });
  aRecevoirDetail.sort((a, b) => a.dateFixe.localeCompare(b.dateFixe));
  return { recu, aRecevoir, aRecevoirDetail };
}

// RÈGLE À NE JAMAIS CASSER — GARDE-FOU ANTI-DOUBLON DE NOM (2026-10-09,
// cf. P021/P027/P033 et objStore.ajouterEnveloppe) : une catégorie existante
// "réserve" son nom SAUF si elle est supprimée, ou si c'est une ENTRÉE
// rattachée à un mois entièrement PASSÉ (les lignes "Salaire" des mois
// précédents laissées par chaque reconduction mensuelle — le bug réel).
// Une Variable/Fixe non supprimée réserve TOUJOURS son nom, même ponctuelle
// et passée : plusieurs traitements relient les catégories PAR NOM sans
// filtre de mois (verifierEvenementsFinanciersInterne et la suppression
// d'événement ajoutent/retirent un montant à TOUTES les lignes du même
// nom, ajusterForecastEvenementsFinanciers prend le premier `find`,
// renommerCategoriePartout réécrit les snapshots, dédup Fixe de Planning) —
// les y exposer modifierait la `depense` d'une ligne archivée (trouvé en
// revue le 2026-10-09). Une Entrée d'un mois FUTUR reste réservée ; mois
// inconnu → réservé par prudence. COPIE CONFORME dans app/store.ts
// (nomReserveParInterne) : toute modification doit être reportée là-bas.
export function nomReservePar(
  env: Enveloppe,
  annee: number,
  mois: number,
): boolean {
  if (env.supprimeeLe) return false;
  if (env.type !== "Entrée") return true;
  const moisCategorie = moisComptageEffectif(env);
  if (!moisCategorie) return true;
  const moisISO = `${annee}-${String(mois + 1).padStart(2, "0")}-01`;
  return moisCategorie >= moisISO;
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

// RÈGLE À NE JAMAIS CASSER — LES TROIS CHIFFRES DU MOIS EN COURS (règles
// incassables de Maëlys, 2026-10-11, P076) : SEULES formules de ces trois
// valeurs, jamais recalculées localement dans un écran.
//   1. Reste estimé fin de mois (hero d'Aperçu) =
//      revenus reçus − dépenses actuelles − argent immobilisé
//      − dépenses prévues + entrées à venir ce mois-ci
//   2. Disponible maintenant (carte Budget) =
//      revenus reçus − dépenses actuelles − argent immobilisé
//      (jamais les dépenses prévues ni les entrées à venir)
//   3. Total "Dépenses et argent immobilisé" (Budget) =
//      dépenses actuelles + argent immobilisé (épargne + objectifs)
// Définitions des termes : revenus reçus / entrées à venir =
// revenusDuMoisHero (recu / aRecevoir) ; dépenses actuelles /
// dépenses prévues = calculerResteEstimeCourant (totalDepenseEnveloppes /
// totalDepensePrevue) ; argent immobilisé = epargneMois du mois (épargne +
// versements aux objectifs).
export type ChiffresDuMois = {
  revenusRecus: number;
  depensesActuelles: number;
  argentImmobilise: number;
  depensesPrevues: number;
  entreesAVenir: number;
};

export function calculerResteEstimeFinDeMois(c: ChiffresDuMois): number {
  return (
    c.revenusRecus -
    c.depensesActuelles -
    c.argentImmobilise -
    c.depensesPrevues +
    c.entreesAVenir
  );
}

export function calculerDisponibleMaintenant(
  c: Pick<ChiffresDuMois, "revenusRecus" | "depensesActuelles" | "argentImmobilise">,
): number {
  return c.revenusRecus - c.depensesActuelles - c.argentImmobilise;
}

export function calculerTotalDepensesEtImmobilise(
  c: Pick<ChiffresDuMois, "depensesActuelles" | "argentImmobilise">,
): number {
  return c.depensesActuelles + c.argentImmobilise;
}

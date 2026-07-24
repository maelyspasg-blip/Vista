import { Serie } from "./series";

// Moyenne simple, protégée contre les tableaux vides (appelant responsable
// de ne jamais en fournir, mais évite un NaN silencieux en cas d'oubli).
function moyenne(valeurs: number[]): number {
  return valeurs.length > 0
    ? valeurs.reduce((acc, v) => acc + v, 0) / valeurs.length
    : 0;
}

// Écart type population (pas d'échantillon) : suffisant ici, on ne fait pas
// d'inférence statistique, juste une mesure descriptive de dispersion sur
// les mois affichés.
function ecartType(valeurs: number[], moy: number): number {
  if (valeurs.length === 0) return 0;
  const variance =
    valeurs.reduce((acc, v) => acc + (v - moy) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

// Compare la moyenne de la 1ère moitié de la période à celle de la 2ème
// moitié — nécessite au moins 2 mois de données réelles pour être
// significatif. Retourne le delta en % (positif = hausse), ou null si non
// calculable (pas assez de données, ou moyenne de départ nulle).
function tendance(valeurs: number[]): number | null {
  if (valeurs.length < 2) return null;
  const milieu = Math.floor(valeurs.length / 2);
  const premiereMoitie = valeurs.slice(0, milieu);
  const secondeMoitie = valeurs.slice(milieu);
  const moy1 = moyenne(premiereMoitie);
  const moy2 = moyenne(secondeMoitie);
  if (moy1 <= 0) return null;
  return ((moy2 - moy1) / moy1) * 100;
}

const SEUIL_TENDANCE = 15;
const SEUIL_VOLATILITE_HAUTE = 35;
const SEUIL_VOLATILITE_BASSE = 10;
const NB_MOIS_MIN_VOLATILITE = 3;
const NB_MOIS_MIN_RECORD = 3;

const LABEL_SERIE: Record<Serie["type"], string> = {
  "epargne-croissante": "d'épargne croissante",
  "budget-respecte": "de budget respecté",
  "epargne-constante": "d'épargne constante",
};

// Insights de "Ce qu'il faut retenir" (Stats) — volontairement distincts de
// "Nos conseils" (Aperçu) : ici tout est calculé sur la PÉRIODE sélectionnée
// (tendances, records, régularité sur plusieurs mois), jamais sur le seul
// mois en cours, pour ne pas dupliquer le coaching mensuel d'Aperçu.
export function genererInsightsPeriode(params: {
  // Dépenses/épargne/budget prévu par mois sur la période affichée, du plus
  // ancien au plus récent, alignés avec `labels` — y compris les mois sans
  // historique réel (zéro-remplis en tête par l'appelant).
  donneesReelles: number[];
  donneesEpargne: number[];
  donneesPrevisionnelles: number[];
  labels: string[];
  // Nombre de mois, en partant de la fin de ces tableaux, qui ont de
  // vraies données (les mois plus anciens sont zéro-remplis parce que
  // l'app n'existait pas encore) — sert à ignorer ce padding dans les
  // calculs de tendance.
  nbMoisAvecDonnees: number;
  series: Serie[];
  maxInsights?: number;
}): string[] {
  const {
    donneesReelles,
    donneesEpargne,
    donneesPrevisionnelles,
    labels,
    nbMoisAvecDonnees,
    series,
    maxInsights = 3,
  } = params;

  const debut = donneesReelles.length - nbMoisAvecDonnees;
  const reelles = donneesReelles.slice(debut);
  const epargne = donneesEpargne.slice(debut);
  const prevues = donneesPrevisionnelles.slice(debut);
  const labelsUtiles = labels.slice(debut);

  const candidats: (string | undefined)[] = [];

  // 1. Tendance des dépenses sur la période.
  const tendanceDepenses = tendance(reelles);
  candidats.push(
    tendanceDepenses !== null && Math.abs(tendanceDepenses) >= SEUIL_TENDANCE
      ? tendanceDepenses > 0
        ? `Tes dépenses ont augmenté de ${Math.round(tendanceDepenses)}% entre le début et la fin de cette période.`
        : `Tes dépenses ont baissé de ${Math.round(Math.abs(tendanceDepenses))}% entre le début et la fin de cette période.`
      : undefined,
  );

  // 2. Tendance de l'épargne sur la période.
  const tendanceEpargne = tendance(epargne);
  candidats.push(
    tendanceEpargne !== null && Math.abs(tendanceEpargne) >= SEUIL_TENDANCE
      ? tendanceEpargne > 0
        ? `Ton épargne a progressé de ${Math.round(tendanceEpargne)}% entre le début et la fin de cette période.`
        : `Ton épargne a reculé de ${Math.round(Math.abs(tendanceEpargne))}% entre le début et la fin de cette période.`
      : undefined,
  );

  // 3. Mois le plus dépensier de la période.
  let indexMax = -1;
  let maxDepense = 0;
  reelles.forEach((v, i) => {
    if (v > maxDepense) {
      maxDepense = v;
      indexMax = i;
    }
  });
  candidats.push(
    indexMax >= 0
      ? `Ton mois le plus dépensier sur cette période a été ${labelsUtiles[indexMax]} avec ${Math.round(maxDepense)}€.`
      : undefined,
  );

  // 4. Respect du budget sur la période (parmi les mois où un budget était
  // réellement défini — un mois sans budget n'est ni un succès ni un échec).
  const moisAvecBudget = prevues.filter((p) => p > 0).length;
  const moisRespectes = reelles.filter(
    (r, i) => prevues[i] > 0 && r <= prevues[i],
  ).length;
  candidats.push(
    moisAvecBudget >= 2
      ? `Tu as respecté ton budget ${moisRespectes} mois sur ${moisAvecBudget} sur cette période.`
      : undefined,
  );

  // 5. Record de régularité tout juste battu (ou en train de l'être) : la
  // série en cours égale le record historique — remonte naturellement
  // chaque mois tant que la série continue (ex. "4 mois" puis "5 mois" le
  // mois suivant), ce qui est voulu : chaque mois de plus est un nouveau
  // record, pas une répétition.
  const serieRecord = series.find(
    (s) => s.enCours >= NB_MOIS_MIN_RECORD && s.enCours === s.record,
  );
  candidats.push(
    serieRecord
      ? `Tu viens d'établir ton record de ${serieRecord.enCours} mois ${LABEL_SERIE[serieRecord.type]} d'affilée.`
      : undefined,
  );

  // 6. Stabilité ou volatilité des dépenses sur la période.
  if (reelles.length >= NB_MOIS_MIN_VOLATILITE) {
    const moy = moyenne(reelles);
    const cv = moy > 0 ? (ecartType(reelles, moy) / moy) * 100 : 0;
    candidats.push(
      cv >= SEUIL_VOLATILITE_HAUTE
        ? "Tes dépenses ont beaucoup varié d'un mois à l'autre sur cette période."
        : cv <= SEUIL_VOLATILITE_BASSE
          ? "Tes dépenses sont restées stables sur cette période."
          : undefined,
    );
  } else {
    candidats.push(undefined);
  }

  const insights = candidats.filter((c): c is string => c !== undefined);

  if (insights.length === 0) {
    return [
      "Pas encore assez d'historique sur cette période pour dégager une tendance.",
    ];
  }
  return insights.slice(0, maxInsights);
}

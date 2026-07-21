import { calculerSeries, DonneesSeries } from "./series";

export type ObjectifScore = {
  actuel: number;
  cible: number;
  ferme?: boolean;
};

export type DonneesScore = DonneesSeries & {
  objectifs: ObjectifScore[];
};

export type MotCleScore = "Solide" | "À surveiller" | "Attention";

export type ScoreSante = {
  score: number;
  mot: MotCleScore;
  details: {
    budget: number | null;
    tendanceEpargne: number | null;
    objectifs: number | null;
  };
};

function scoreBudgetMois(donnees: DonneesScore): number | null {
  const pertinentes = donnees.enveloppes.filter((e) => e.type !== "Entrée");
  const budgetTotal = pertinentes.reduce((acc, e) => acc + e.budget, 0);
  const depenseTotal = pertinentes.reduce((acc, e) => acc + e.depense, 0);
  if (budgetTotal <= 0) return null;
  const ratio = depenseTotal / budgetTotal;
  if (ratio <= 1) return 100;
  return Math.max(0, 100 - (ratio - 1) * 200);
}

function scoreTendanceEpargne(donnees: DonneesScore): number | null {
  const series = calculerSeries(donnees);
  const epargneCroissante = series.find(
    (s) => s.type === "epargne-croissante",
  );
  if (!epargneCroissante) return null;
  return (Math.min(epargneCroissante.enCours, 6) / 6) * 100;
}

function scoreObjectifs(donnees: DonneesScore): number | null {
  const actifs = donnees.objectifs.filter((o) => !o.ferme && o.cible > 0);
  if (actifs.length === 0) return null;
  const moyenne =
    actifs.reduce((acc, o) => acc + Math.min(o.actuel / o.cible, 1), 0) /
    actifs.length;
  return moyenne * 100;
}

export function calculerScoreSante(donnees: DonneesScore): ScoreSante {
  const budget = scoreBudgetMois(donnees);
  const tendanceEpargne = scoreTendanceEpargne(donnees);
  const objectifs = scoreObjectifs(donnees);

  const signaux = (
    [
      { valeur: budget, poids: 0.4 },
      { valeur: tendanceEpargne, poids: 0.3 },
      { valeur: objectifs, poids: 0.3 },
    ] as { valeur: number | null; poids: number }[]
  ).filter(
    (s): s is { valeur: number; poids: number } => s.valeur !== null,
  );

  const poidsTotal = signaux.reduce((acc, s) => acc + s.poids, 0);
  const score =
    poidsTotal > 0
      ? Math.round(
          signaux.reduce((acc, s) => acc + s.valeur * s.poids, 0) /
            poidsTotal,
        )
      : 0;

  const mot: MotCleScore =
    score >= 75 ? "Solide" : score >= 50 ? "À surveiller" : "Attention";

  return { score, mot, details: { budget, tendanceEpargne, objectifs } };
}

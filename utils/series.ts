import { formaterMontant } from "./montant";

export type EnveloppeSerie = {
  depense: number;
  budget: number;
  type: "Fixe" | "Variable" | "Entrée";
};

export type SnapshotMoisSerie = {
  mois: number;
  annee: number;
  enveloppes: EnveloppeSerie[];
  epargne: number;
};

export type DonneesSeries = {
  enveloppes: EnveloppeSerie[];
  epargneMois: number;
  historiquesMois: SnapshotMoisSerie[];
  seuilEpargneConstante: number | null;
};

export type TypeSerie = "epargne-croissante" | "budget-respecte" | "epargne-constante";

export type Serie = {
  type: TypeSerie;
  titre: string;
  description: string;
  enCours: number;
  record: number;
  historique: number[];
  parMois: boolean[];
};

type PointMois = {
  mois: number;
  annee: number;
  epargne: number;
  depenseTotal: number;
  budgetTotal: number;
};

function totauxDuMois(envs: EnveloppeSerie[]) {
  // RÈGLE : décision produit du 2026-09-18 (même RÈGLE que utils/score.ts::
  // scoreBudget) — une catégorie à budget=0€ ne représente rien de réel,
  // exclue des analyses (alimente le score de santé et le trophée "Série
  // Budget respecté"). Sans ce filtre, sa dépense réelle éventuelle
  // gonflait depenseTotal sans jamais contribuer à budgetTotal.
  const pertinentes = envs.filter((e) => e.type !== "Entrée" && e.budget > 0);
  return {
    depenseTotal: pertinentes.reduce((acc, e) => acc + e.depense, 0),
    budgetTotal: pertinentes.reduce((acc, e) => acc + e.budget, 0),
  };
}

function construirePointsMois(donnees: DonneesSeries): PointMois[] {
  const maintenant = new Date();

  const historique = [...donnees.historiquesMois]
    .sort((a, b) => a.annee * 12 + a.mois - (b.annee * 12 + b.mois))
    .map((s) => ({
      mois: s.mois,
      annee: s.annee,
      epargne: s.epargne,
      ...totauxDuMois(s.enveloppes),
    }));

  const moisActuel: PointMois = {
    mois: maintenant.getMonth(),
    annee: maintenant.getFullYear(),
    epargne: donnees.epargneMois,
    ...totauxDuMois(donnees.enveloppes),
  };

  return [...historique, moisActuel];
}

// Découpe la série de mois en runs consécutifs qui valident `satisfait`.
// Renvoie la longueur de chaque run, dans l'ordre chronologique.
function calculerRuns(satisfaitParMois: boolean[]): number[] {
  const runs: number[] = [];
  let courant = 0;
  for (const ok of satisfaitParMois) {
    if (ok) {
      courant += 1;
    } else if (courant > 0) {
      runs.push(courant);
      courant = 0;
    }
  }
  if (courant > 0) runs.push(courant);
  return runs;
}

function construireSerie(
  type: TypeSerie,
  titre: string,
  description: string,
  satisfaitParMois: boolean[],
): Serie {
  const runs = calculerRuns(satisfaitParMois);
  // Le mois le plus récent est en fin de tableau : la série en cours est le
  // dernier run seulement s'il touche la fin (sinon elle est rompue = 0).
  const enCours =
    satisfaitParMois.length > 0 && satisfaitParMois[satisfaitParMois.length - 1]
      ? runs[runs.length - 1]
      : 0;
  const record = runs.length > 0 ? Math.max(...runs) : 0;
  const historique = enCours > 0 ? runs.slice(0, -1) : runs;

  return {
    type,
    titre,
    description,
    enCours,
    record,
    historique: [...historique].reverse(),
    parMois: satisfaitParMois,
  };
}

export function calculerSeries(donnees: DonneesSeries): Serie[] {
  const points = construirePointsMois(donnees);

  const epargneCroissanteParMois = points.map(
    (p, i) => i > 0 && p.epargne > points[i - 1].epargne,
  );

  // RÈGLE À NE JAMAIS CASSER — TOLÉRANCE EPSILON (bug P014, corrigé le
  // 2026-09-17) : `depense` s'accumule transaction par transaction sans
  // jamais être ré-arrondi (ex. 19.99+15.50+7.33+42.10+3.33+8.88+12.34 =
  // 109.46999999999998, pas 109.47, dérive flottante JS classique). Sans
  // cette tolérance, un total "logiquement" égal au budget pouvait tomber
  // juste au-dessus par un epsilon invisible à l'affichage, faisant
  // basculer à tort ce trophée à "non respecté". 0.005 = un demi-centime,
  // largement sous le seuil de toute vraie dépassement, jamais assez pour
  // masquer un dépassement réel (arrondi à 2 décimales à l'affichage).
  const budgetRespecteParMois = points.map(
    (p) => p.budgetTotal > 0 && p.depenseTotal <= p.budgetTotal + 0.005,
  );

  const seuil = donnees.seuilEpargneConstante;
  const epargneConstanteParMois = points.map((p) =>
    seuil !== null ? p.epargne >= seuil : false,
  );

  return [
    construireSerie(
      "epargne-croissante",
      "Épargne croissante",
      "Mois consécutifs où l'épargne progresse par rapport au mois précédent.",
      epargneCroissanteParMois,
    ),
    construireSerie(
      "budget-respecte",
      "Budget respecté",
      "Mois consécutifs où les dépenses sont restées sous le budget prévu.",
      budgetRespecteParMois,
    ),
    construireSerie(
      "epargne-constante",
      "Épargne constante",
      seuil !== null
        ? `Mois consécutifs où l'épargne a atteint ${formaterMontant(seuil)} €.`
        : "Définis un seuil pour suivre cette série.",
      epargneConstanteParMois,
    ),
  ];
}

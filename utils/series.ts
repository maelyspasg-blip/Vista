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
  const pertinentes = envs.filter((e) => e.type !== "Entrée");
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

  const budgetRespecteParMois = points.map(
    (p) => p.budgetTotal > 0 && p.depenseTotal <= p.budgetTotal,
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

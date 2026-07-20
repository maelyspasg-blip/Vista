export type EnveloppeBadge = {
  depense: number;
  budget: number;
  type: "Fixe" | "Variable" | "Entrée";
};

export type ObjectifBadge = {
  actuel: number;
  cible: number;
};

export type SnapshotMoisBadge = {
  mois: number;
  annee: number;
  enveloppes: EnveloppeBadge[];
  objectifs: ObjectifBadge[];
  epargne: number;
};

export type DonneesBadges = {
  enveloppes: EnveloppeBadge[];
  objectifs: ObjectifBadge[];
  epargneMois: number;
  historiquesMois: SnapshotMoisBadge[];
};

export type Badge = {
  id: string;
  emoji: string;
  titre: string;
  description: string;
  obtenu: boolean;
};

type PointMois = {
  mois: number;
  annee: number;
  epargne: number;
  depenseTotal: number;
  budgetTotal: number;
};

function totauxDuMois(envs: EnveloppeBadge[]) {
  const pertinentes = envs.filter((e) => e.type !== "Entrée");
  return {
    depenseTotal: pertinentes.reduce((acc, e) => acc + e.depense, 0),
    budgetTotal: pertinentes.reduce((acc, e) => acc + e.budget, 0),
  };
}

function construirePointsMois(donnees: DonneesBadges): PointMois[] {
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

export function calculerBadges(donnees: DonneesBadges): Badge[] {
  const points = construirePointsMois(donnees);

  const objectifAtteint = [
    ...donnees.objectifs,
    ...donnees.historiquesMois.flatMap((s) => s.objectifs),
  ].some((o) => o.cible > 0 && o.actuel >= o.cible);

  const epargnantDuMois = points.some((p) => p.epargne > 0);

  const epargneEnProgression = points.some(
    (p, i) => i > 0 && p.epargne > points[i - 1].epargne,
  );

  const budgetRespecteParMois = points.map(
    (p) => p.budgetTotal > 0 && p.depenseTotal <= p.budgetTotal,
  );
  const budgetRespecte = budgetRespecteParMois.some(Boolean);

  const troisMoisDeSuite = budgetRespecteParMois.some(
    (v, i) => v && budgetRespecteParMois[i - 1] && budgetRespecteParMois[i - 2],
  );

  const moisMieuxGere = points.some(
    (p, i) => i > 0 && p.depenseTotal < points[i - 1].depenseTotal,
  );

  const nbMoisSuivis = points.length;

  return [
    {
      id: "objectif-atteint",
      emoji: "🎯",
      titre: "Objectif atteint",
      description: "Un objectif d'épargne a atteint sa cible.",
      obtenu: objectifAtteint,
    },
    {
      id: "epargnant-du-mois",
      emoji: "🏦",
      titre: "Épargnant du mois",
      description: "De l'épargne mise de côté sur au moins un mois.",
      obtenu: epargnantDuMois,
    },
    {
      id: "epargne-progression",
      emoji: "📈",
      titre: "Épargne en progression",
      description: "Épargne d'un mois supérieure à celle du mois précédent.",
      obtenu: epargneEnProgression,
    },
    {
      id: "budget-respecte",
      emoji: "✅",
      titre: "Budget respecté",
      description: "Dépenses totales d'un mois restées sous le budget prévu.",
      obtenu: budgetRespecte,
    },
    {
      id: "budget-3-mois",
      emoji: "🔥",
      titre: "3 mois de suite dans le budget",
      description: "Budget respecté 3 mois consécutifs.",
      obtenu: troisMoisDeSuite,
    },
    {
      id: "mois-mieux-gere",
      emoji: "📉",
      titre: "Mois mieux géré",
      description: "Dépenses d'un mois inférieures à celles du mois précédent.",
      obtenu: moisMieuxGere,
    },
    {
      id: "anciennete-3",
      emoji: "🌱",
      titre: "3 mois avec Vista",
      description: "3 mois suivis dans l'application.",
      obtenu: nbMoisSuivis >= 3,
    },
    {
      id: "anciennete-6",
      emoji: "🌳",
      titre: "6 mois avec Vista",
      description: "6 mois suivis dans l'application.",
      obtenu: nbMoisSuivis >= 6,
    },
    {
      id: "anciennete-12",
      emoji: "🏆",
      titre: "1 an avec Vista",
      description: "12 mois suivis dans l'application.",
      obtenu: nbMoisSuivis >= 12,
    },
  ];
}

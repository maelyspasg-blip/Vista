import { calculerSeries, DonneesSeries } from "./series";

type EnveloppeAvecNom = {
  nom: string;
  depense: number;
  budget: number;
  type: "Fixe" | "Variable" | "Entrée";
};

type ObjectifAvecNom = {
  nom: string;
  actuel: number;
  cible: number;
  ferme?: boolean;
};

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

export type ExplicationScore = { texte: string; positif: boolean };

function trouverCategorieDepassee(
  enveloppes: EnveloppeAvecNom[],
): EnveloppeAvecNom | undefined {
  return enveloppes
    .filter((e) => e.type !== "Entrée" && e.depense > e.budget)
    .sort((a, b) => b.depense - b.budget - (a.depense - a.budget))[0];
}

// Seuil de bascule positif/négatif partagé par tendanceEpargne et objectifs —
// aligné sur celui déjà utilisé pour le mot-clé global ("À surveiller" à
// partir de 50, voir calculerScoreSante) pour qu'un sous-score et sa puce ne
// se contredisent jamais. Le budget n'utilise volontairement pas ce seuil :
// son propre calcul ne vaut 100 que si tu n'as pas dépassé ton budget, donc
// n'importe quel score en dessous de 100 signifie déjà un dépassement réel —
// y appliquer un seuil à 50 masquerait les dépassements légers.
const SEUIL_POSITIF = 50;
const SEUIL_ELEVE = 75;

// Traduit en phrases concrètes, mois par mois, ce qui fait gagner ou perdre
// des points sur chacun des 3 signaux de calculerScoreSante — jamais une
// liste statique : chaque phrase découle de la valeur réelle du signal ce
// mois-ci (details.budget/tendanceEpargne/objectifs), avec un texte et une
// couleur qui reflètent fidèlement le niveau du sous-score (pas seulement sa
// tendance), pour ne jamais afficher une puce positive sur un score bas.
// Un signal absent (details.* === null, ex. aucun objectif actif) ne
// produit aucune puce.
export function genererExplicationsScore(
  donnees: {
    enveloppes: EnveloppeAvecNom[];
    objectifs: ObjectifAvecNom[];
  } & DonneesSeries,
  details: ScoreSante["details"],
): ExplicationScore[] {
  const { enveloppes, objectifs, epargneMois, historiquesMois, seuilEpargneConstante } =
    donnees;
  const explications: ExplicationScore[] = [];

  if (details.budget !== null) {
    if (details.budget >= 100) {
      explications.push({
        texte: "Tu respectes ton budget ce mois-ci.",
        positif: true,
      });
    } else {
      const categorie = trouverCategorieDepassee(enveloppes);
      const nom = categorie ? categorie.nom : null;
      const severe = details.budget < SEUIL_POSITIF;
      explications.push({
        texte: nom
          ? severe
            ? `Tu as largement dépassé ton budget sur ${nom}.`
            : `Tu as dépassé ton budget sur ${nom}.`
          : severe
            ? "Tu as largement dépassé ton budget total ce mois-ci."
            : "Tu as dépassé ton budget total ce mois-ci.",
        positif: false,
      });
    }
  }

  if (details.tendanceEpargne !== null) {
    const streak =
      calculerSeries({ enveloppes, epargneMois, historiquesMois, seuilEpargneConstante }).find(
        (s) => s.type === "epargne-croissante",
      )?.enCours ?? 0;
    const positif = details.tendanceEpargne >= SEUIL_POSITIF;
    if (positif) {
      explications.push({
        texte:
          details.tendanceEpargne >= SEUIL_ELEVE
            ? `Ton épargne progresse très régulièrement depuis ${streak} mois.`
            : `Ton épargne progresse depuis ${streak} mois.`,
        positif: true,
      });
    } else if (streak > 0) {
      // Une petite série existe (l'épargne a progressé au moins une fois
      // récemment) mais reste trop courte pour peser positivement — il
      // faut le dire sans pour autant afficher une puce verte trompeuse.
      explications.push({
        texte: `Ton épargne ne progresse que depuis ${streak} mois, pas encore assez régulière.`,
        positif: false,
      });
    } else if (epargneMois <= 0) {
      explications.push({
        texte: "Aucun versement d'épargne ce mois-ci.",
        positif: false,
      });
    } else {
      explications.push({
        texte: "Ton épargne n'a pas progressé par rapport au mois dernier.",
        positif: false,
      });
    }
  }

  if (details.objectifs !== null) {
    const actifs = objectifs
      .filter((o) => !o.ferme && o.cible > 0)
      .map((o) => ({ ...o, pct: Math.min(o.actuel / o.cible, 1) }));
    if (actifs.length > 0) {
      if (details.objectifs >= SEUIL_POSITIF) {
        const meilleur = [...actifs].sort((a, b) => b.pct - a.pct)[0];
        explications.push({
          texte:
            details.objectifs >= SEUIL_ELEVE
              ? `Tu es proche de ton objectif ${meilleur.nom}.`
              : `Ton objectif ${meilleur.nom} avance plutôt bien.`,
          positif: true,
        });
      } else {
        const pireCas = [...actifs].sort((a, b) => a.pct - b.pct)[0];
        explications.push({
          texte:
            details.objectifs < 25
              ? `Ton objectif ${pireCas.nom} n'avance presque pas ce mois-ci.`
              : `Ton objectif ${pireCas.nom} avance doucement.`,
          positif: false,
        });
      }
    }
  }

  return explications;
}

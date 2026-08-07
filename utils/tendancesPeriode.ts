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

const SEUIL_HAUSSE_CATEGORIE = 20; // % — en dessous, la hausse n'est pas assez marquante pour être signalée
const MONTANT_MIN_CATEGORIE_SIGNIFICATIVE = 30; // €/mois en moyenne — sous ce seuil, un pourcentage de hausse peut être spectaculaire sur un montant négligeable (ex: 3€ → 6€ = +100%)
const SEUIL_MOIS_MIN_EPARGNE_STREAK = 2; // "depuis X mois" n'a de sens qu'à partir de 2
const SEUIL_MOIS_MIN_TENDANCE = 3; // mois — une tendance sur 2 points n'est pas assez fiable
const SEUIL_BAISSE_CONFIRMEE = 15; // % de baisse entre début et fin de période
const SEUIL_VOLATILITE = 35; // % — coefficient de variation (écart-type / moyenne)

// Insights de "Ce qu'il faut retenir" (Stats) — coaching : observation +
// contexte, jamais une simple statistique brute. Distincts par construction
// de "Nos conseils" (Aperçu) : ici tout est calculé sur la PÉRIODE
// sélectionnée (tendances, pics, régularité, volatilité sur plusieurs mois),
// jamais sur le seul mois en cours isolément — Aperçu couvre déjà ce
// terrain-là avec sa propre conscience du jour du mois.
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
  // Dépense de chaque catégorie (hors Entrée d'argent) sur les mêmes mois
  // que donneesReelles, même longueur, même alignement.
  depensesParCategorie: { nom: string; parMois: number[] }[];
  // Objectifs actifs avec leur rythme déjà calculé (calculerRythmeObjectif).
  objectifs: {
    nom: string;
    cible: number;
    ferme?: boolean;
    moisRestants: number | null;
    rythmeInsuffisant: boolean;
  }[];
  maxInsights?: number;
}): string[] {
  const {
    donneesReelles,
    donneesPrevisionnelles,
    labels,
    nbMoisAvecDonnees,
    series,
    depensesParCategorie,
    objectifs,
    maxInsights = 3,
  } = params;

  const debut = donneesReelles.length - nbMoisAvecDonnees;
  const reelles = donneesReelles.slice(debut);
  const prevues = donneesPrevisionnelles.slice(debut);
  const labelsUtiles = labels.slice(debut);

  const candidats: (string | undefined)[] = [];

  // S1. Catégorie qui accélère le plus sur la période — parmi celles qui
  // pèsent assez pour que la hausse soit réelle, pas un artefact de petits
  // montants.
  let meilleureAcceleration: { nom: string; hausse: number } | null = null;
  for (const cat of depensesParCategorie) {
    const serieCat = cat.parMois.slice(debut);
    const hausse = tendance(serieCat);
    if (hausse === null || hausse < SEUIL_HAUSSE_CATEGORIE) continue;
    if (moyenne(serieCat) < MONTANT_MIN_CATEGORIE_SIGNIFICATIVE) continue;
    if (!meilleureAcceleration || hausse > meilleureAcceleration.hausse) {
      meilleureAcceleration = { nom: cat.nom, hausse };
    }
  }
  candidats.push(
    meilleureAcceleration
      ? `${meilleureAcceleration.nom} a augmenté de ${Math.round(meilleureAcceleration.hausse)}% sur cette période — c'est ta dépense qui progresse le plus vite.`
      : undefined,
  );

  // S2. Régularité budgétaire sur la période — un bilan sur la durée, pas
  // une projection du mois en cours (celle-ci existe déjà sur Aperçu).
  // Parmi les mois où un budget était réellement défini seulement — un mois
  // sans budget n'est ni un succès ni un échec.
  const moisAvecBudget = prevues.filter((p) => p > 0).length;
  const moisRespectes = reelles.filter(
    (r, i) => prevues[i] > 0 && r <= prevues[i],
  ).length;
  const ratioRespect = moisAvecBudget > 0 ? moisRespectes / moisAvecBudget : 0;
  const commentaireRegularite =
    ratioRespect >= 0.8
      ? "une belle régularité à maintenir"
      : ratioRespect >= 0.5
        ? "tu progresses, continue comme ça"
        : "encore de la marge pour mieux cadrer tes dépenses";
  candidats.push(
    moisAvecBudget >= 2
      ? `Tu as respecté ton budget ${moisRespectes} mois sur ${moisAvecBudget} sur cette période — ${commentaireRegularite}.`
      : undefined,
  );

  // S3. Épargne qui progresse régulièrement + objectif atteignable au
  // rythme actuel (calculerRythmeObjectif, calculé par l'appelant). Parmi
  // les objectifs éligibles, celui dont l'échéance est la plus proche —
  // l'insight le plus concret à donner en premier. Distinct de R5 (Aperçu),
  // qui parle d'un état ponctuel (% déjà atteint), pas d'un rythme mesuré
  // sur plusieurs mois.
  const serieEpargneCroissante = series.find(
    (s) => s.type === "epargne-croissante",
  );
  let objectifCandidat: { nom: string; moisRestants: number } | null = null;
  if (
    serieEpargneCroissante &&
    serieEpargneCroissante.enCours >= SEUIL_MOIS_MIN_EPARGNE_STREAK
  ) {
    const eligibles = objectifs
      .filter(
        (o) =>
          !o.ferme &&
          o.cible > 0 &&
          o.moisRestants !== null &&
          !o.rythmeInsuffisant,
      )
      .sort((a, b) => (a.moisRestants ?? Infinity) - (b.moisRestants ?? Infinity));
    if (eligibles.length > 0) {
      objectifCandidat = {
        nom: eligibles[0].nom,
        moisRestants: eligibles[0].moisRestants as number,
      };
    }
  }
  candidats.push(
    serieEpargneCroissante && objectifCandidat
      ? `Tu épargnes régulièrement depuis ${serieEpargneCroissante.enCours} mois — à ce rythme, ton objectif ${objectifCandidat.nom} sera atteint dans environ ${objectifCandidat.moisRestants} mois.`
      : undefined,
  );

  // S4. Mois le plus dépensier de la période, avec la catégorie qui
  // explique le mieux ce dépassement (celle dont l'excès par rapport à sa
  // propre moyenne sur les autres mois de la période est le plus grand).
  let indexPic = -1;
  let depensePic = 0;
  reelles.forEach((v, i) => {
    if (v > depensePic) {
      depensePic = v;
      indexPic = i;
    }
  });
  let categorieExplicative: { nom: string; exces: number } | null = null;
  if (indexPic >= 0) {
    for (const cat of depensesParCategorie) {
      const serieCat = cat.parMois.slice(debut);
      if (serieCat.length < 2) continue;
      const valeurPic = serieCat[indexPic];
      const autresMois = serieCat.filter((_, i) => i !== indexPic);
      const exces = valeurPic - moyenne(autresMois);
      if (!categorieExplicative || exces > categorieExplicative.exces) {
        categorieExplicative = { nom: cat.nom, exces };
      }
    }
  }
  candidats.push(
    indexPic >= 0 && categorieExplicative && categorieExplicative.exces > 0
      ? `${labelsUtiles[indexPic]} est ton mois le plus dépensier sur cette période — principalement à cause de ${categorieExplicative.nom} (+${Math.round(categorieExplicative.exces)}€ vs ta moyenne habituelle).`
      : undefined,
  );

  // S5. Tendance globale à la baisse, confirmée sur au moins 3 mois.
  let baisseConfirmee: { deltaEurosParMois: number } | null = null;
  if (reelles.length >= SEUIL_MOIS_MIN_TENDANCE) {
    const t = tendance(reelles);
    if (t !== null && t <= -SEUIL_BAISSE_CONFIRMEE) {
      baisseConfirmee = {
        deltaEurosParMois:
          (reelles[reelles.length - 1] - reelles[0]) / (reelles.length - 1),
      };
    }
  }
  candidats.push(
    baisseConfirmee
      ? `Tes dépenses sont en baisse régulière depuis ${reelles.length} mois (${Math.round(baisseConfirmee.deltaEurosParMois)}€/mois en moyenne) — tu gagnes en maîtrise de ton budget.`
      : undefined,
  );

  // S6. Volatilité détectée : dépenses très irrégulières d'un mois à
  // l'autre sur la période (coefficient de variation élevé), avec le mois
  // le plus haut et le plus bas pour rendre l'écart concret.
  let volatilite: { moisHaut: string; moisBas: string; ecart: number } | null =
    null;
  if (reelles.length >= SEUIL_MOIS_MIN_TENDANCE) {
    const moy = moyenne(reelles);
    const coefficientVariation = moy > 0 ? (ecartType(reelles, moy) / moy) * 100 : 0;
    if (coefficientVariation >= SEUIL_VOLATILITE) {
      let iMax = 0;
      let iMin = 0;
      reelles.forEach((v, i) => {
        if (v > reelles[iMax]) iMax = i;
        if (v < reelles[iMin]) iMin = i;
      });
      volatilite = {
        moisHaut: labelsUtiles[iMax],
        moisBas: labelsUtiles[iMin],
        ecart: reelles[iMax] - reelles[iMin],
      };
    }
  }
  candidats.push(
    volatilite
      ? `Tes dépenses varient beaucoup d'un mois à l'autre sur cette période — ${volatilite.moisHaut} vs ${volatilite.moisBas} avec un écart de ${Math.round(volatilite.ecart)}€. Identifier tes dépenses exceptionnelles pourrait t'aider à mieux planifier.`
      : undefined,
  );

  // Jamais deux insights identiques (garde-fou défensif — les 6 règles
  // ci-dessus portent sur des sujets distincts, donc une vraie collision
  // ne devrait arriver que par coïncidence de formulation).
  const insights = [
    ...new Set(candidats.filter((c): c is string => c !== undefined)),
  ];

  // S7. Repli si aucune règle ne s'applique (pas assez d'historique).
  if (insights.length === 0) {
    return [
      "Pas encore assez d'historique sur cette période pour dégager une tendance — continue à enregistrer tes dépenses.",
    ];
  }
  return insights.slice(0, maxInsights);
}

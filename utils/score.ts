// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — calcul pur à partir de données déjà chargées,
// toute écriture vit dans app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de
// ce fichier).
import { DonneesSeries } from "./series";

type EnveloppeAvecNom = {
  nom: string;
  depense: number;
  budget: number;
  type: "Fixe" | "Variable" | "Entrée";
};

// Sans `nom` — utilisé par les fonctions de calcul pur (scoreBudget,
// scoreStabilite), qui n'ont besoin que des montants, jamais du nom des
// catégories. Permet de leur passer indifféremment des Enveloppe[] vivantes
// ou des EnveloppeSerie[]/SnapshotEnveloppe[] (mêmes champs pertinents).
type EnveloppeMontants = {
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

// Sans `nom` — utilisé par scoreObjectifs, mêmes raisons que
// EnveloppeMontants ci-dessus.
type ObjectifMontants = {
  actuel: number;
  cible: number;
  ferme?: boolean;
};

export type ObjectifScore = {
  actuel: number;
  cible: number;
  ferme?: boolean;
};

// Forme minimale nécessaire pour dater une transaction/un paiement — permet
// de calculer la "régularité" aussi bien depuis les vraies transactions
// (app/store.ts::Transaction) que depuis n'importe quelle autre source qui
// porte une date, sans coupler ce fichier au type concret.
type EvenementDate = { date: string };

export type DonneesScore = DonneesSeries & {
  objectifs: ObjectifScore[];
  transactions: EvenementDate[];
  historiquePaiements: EvenementDate[];
};

export type MotCleScore = "Solide" | "À surveiller" | "Attention";

// --- RÈGLE À NE JAMAIS CASSER : architecture signal → pondération ----------
//
// SignauxScore porte 5 valeurs normalisées sur 100 (ou null si le signal
// n'est pas calculable — jamais 0, qui pénaliserait à tort une donnée
// absente). calculerScoreDepuisSignaux est le SEUL endroit qui pondère et
// additionne ces signaux — à la fois calculerScoreSante (score du mois en
// cours, données live) et calculerScoreHistorique (score reconstruit pour
// un mois archivé, cf. plus bas) passent par cette même fonction, pour
// garantir qu'un score "aujourd'hui" et un score "tel qu'il était en mars"
// restent strictement comparables (même formule, mêmes poids).
export type SignauxScore = {
  budget: number | null;
  regularite: number | null;
  epargne: number | null;
  objectifs: number | null;
  stabilite: number | null;
};

export type DecompositionScore = {
  budget: number | null; // sur 25 pts
  regularite: number | null; // sur 20 pts
  epargne: number | null; // sur 25 pts
  objectifs: number | null; // sur 20 pts
  stabilite: number | null; // sur 10 pts
};

export type ScoreSante = {
  score: number;
  mot: MotCleScore;
  details: DecompositionScore;
};

const POIDS: Record<keyof SignauxScore, number> = {
  budget: 25,
  regularite: 20,
  epargne: 25,
  objectifs: 20,
  stabilite: 10,
};

// RÈGLE À NE JAMAIS CASSER : un signal absent (null) ne pénalise jamais le
// score — son poids est redistribué proportionnellement sur les signaux
// disponibles (ex: pas d'objectif actif → les 20 pts "Objectifs" sont
// répartis sur les 4 autres critères selon leurs poids respectifs). Le
// détail affiché (`details.X`) reste toujours exprimé sur l'échelle FIXE
// (ex: /25 pour le budget) — seule l'agrégation dans `score` (0-100)
// applique la redistribution, pour que l'utilisateur voie toujours les
// mêmes échelles de critères d'un mois à l'autre.
function calculerScoreDepuisSignaux(signaux: SignauxScore): ScoreSante {
  const cles = Object.keys(POIDS) as (keyof SignauxScore)[];
  const disponibles = cles.filter((cle) => signaux[cle] !== null);
  const poidsTotalDisponible = disponibles.reduce(
    (acc, cle) => acc + POIDS[cle],
    0,
  );

  const details: DecompositionScore = {
    budget: null,
    regularite: null,
    epargne: null,
    objectifs: null,
    stabilite: null,
  };
  let score = 0;
  disponibles.forEach((cle) => {
    const valeur = signaux[cle] as number;
    details[cle] = (valeur / 100) * POIDS[cle];
    const poidsEffectif =
      poidsTotalDisponible > 0 ? POIDS[cle] * (100 / poidsTotalDisponible) : 0;
    score += (valeur / 100) * poidsEffectif;
  });
  score = Math.round(score);

  const mot: MotCleScore =
    score >= 75 ? "Solide" : score >= 50 ? "À surveiller" : "Attention";

  return { score, mot, details };
}

// --- Calcul de chaque signal (0-100), réutilisable en live comme en
// historique — chaque fonction accepte une forme structurelle minimale, pas
// les types concrets Enveloppe/Objectif, pour fonctionner indifféremment
// sur des données live (app/store.ts) ou des snapshots archivés
// (SnapshotEnveloppe/SnapshotObjectif, mêmes champs pertinents). ---------

function scoreBudget(enveloppes: EnveloppeMontants[]): number | null {
  const pertinentes = enveloppes.filter((e) => e.type !== "Entrée");
  const budgetTotal = pertinentes.reduce((acc, e) => acc + e.budget, 0);
  const depenseTotal = pertinentes.reduce((acc, e) => acc + e.depense, 0);
  if (budgetTotal <= 0) return null;
  const ratio = depenseTotal / budgetTotal;
  if (ratio <= 1) return 100;
  return Math.max(0, 100 - (ratio - 1) * 200);
}

function scoreObjectifs(objectifs: ObjectifMontants[]): number | null {
  const actifs = objectifs.filter((o) => !o.ferme && o.cible > 0);
  if (actifs.length === 0) return null;
  const moyenne =
    actifs.reduce((acc, o) => acc + Math.min(o.actuel / o.cible, 1), 0) /
    actifs.length;
  return moyenne * 100;
}

// Séquence chronologique des montants épargnés (mois archivés triés, puis
// le mois en cours) — même construction que
// series.ts::construirePointsMois, mais on n'a besoin ici que du montant
// épargné (le score ne dépend pas de depenseTotal/budgetTotal).
function sequenceEpargne(
  historiquesMois: { mois: number; annee: number; epargne: number }[],
  epargneMois: number,
): number[] {
  const historique = [...historiquesMois]
    .sort((a, b) => a.annee * 12 + a.mois - (b.annee * 12 + b.mois))
    .map((s) => s.epargne);
  return [...historique, epargneMois];
}

// RÈGLE À NE JAMAIS CASSER — "CAPACITÉ D'ÉPARGNE" TOLÈRE LE PLATEAU,
// CONTRAIREMENT À LA SÉRIE "epargne-croissante" (utils/series.ts, stricte
// hausse `>`, utilisée pour les trophées/Séries — ne JAMAIS modifier son
// seuil, sa définition ("progresse") est correcte telle quelle pour ce
// qu'elle mesure) : une épargne MAINTENUE d'un mois sur l'autre (ex: 150€
// puis à nouveau 150€) reste une bonne habitude financière — la pénaliser à
// 0 comme si l'épargne s'était arrêtée est un faux négatif. `>=` remplace
// donc le `>` strict UNIQUEMENT ici, plus une garde de positivité (une
// épargne nulle ne prolonge jamais la série, même "maintenue" à 0). Même
// construction "run touchant la fin" que series.ts::calculerRuns (dupliquée
// ici volontairement : la sémantique diffère, ce n'est pas la même série),
// donc directement comparable à l'ancienne échelle (le plafond "6 mois" en
// dessous reste calibré pareil).
function streakEpargneMaintenue(sequence: number[]): number {
  const satisfaitParMois = sequence.map(
    (v, i) => i > 0 && v > 0 && v >= sequence[i - 1],
  );
  let courant = 0;
  for (const ok of satisfaitParMois) {
    courant = ok ? courant + 1 : 0;
  }
  return courant;
}

// Fraction des jours d'une fenêtre glissante (jusqu'à 90 jours) où au moins
// une transaction/un paiement est daté(e) ce jour-là — proxy de régularité
// d'usage en l'absence de tout tracking d'ouverture d'app. Le dénominateur
// est plafonné à l'ancienneté réelle du compte (nbMoisConnus × 30) pour ne
// jamais pénaliser un compte encore jeune qui n'a simplement pas encore 90
// jours d'existence.
const NB_JOURS_FENETRE_REGULARITE = 90;

function scoreRegularite(
  transactions: EvenementDate[],
  historiquePaiements: EvenementDate[],
  dateFin: Date,
  nbMoisConnus: number,
): number | null {
  const denominateur = Math.min(
    NB_JOURS_FENETRE_REGULARITE,
    Math.max(1, nbMoisConnus * 30),
  );
  const dateDebut = new Date(dateFin);
  dateDebut.setDate(dateDebut.getDate() - NB_JOURS_FENETRE_REGULARITE + 1);

  const joursActifs = new Set<string>();
  [...transactions, ...historiquePaiements].forEach((e) => {
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) return;
    if (d >= dateDebut && d <= dateFin) {
      joursActifs.add(
        `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      );
    }
  });
  if (joursActifs.size === 0) return null;
  return Math.min(100, (joursActifs.size / denominateur) * 100);
}

// 100 - coefficient de variation des dépenses totales sur les mois fournis
// (déjà réduits à la fenêtre voulue par l'appelant) — des dépenses stables
// d'un mois sur l'autre donnent un CV bas donc un score élevé.
function scoreStabilite(
  moisPourStabilite: { enveloppes: EnveloppeMontants[] }[],
): number | null {
  if (moisPourStabilite.length < 2) return null;
  const depenses = moisPourStabilite.map((m) =>
    m.enveloppes
      .filter((e) => e.type !== "Entrée")
      .reduce((acc, e) => acc + e.depense, 0),
  );
  const moyenne = depenses.reduce((acc, v) => acc + v, 0) / depenses.length;
  if (moyenne <= 0) return null;
  const variance =
    depenses.reduce((acc, v) => acc + (v - moyenne) ** 2, 0) / depenses.length;
  const coefficientVariation = (Math.sqrt(variance) / moyenne) * 100;
  return Math.max(0, 100 - coefficientVariation);
}

export function calculerScoreSante(donnees: DonneesScore): ScoreSante {
  const signaux: SignauxScore = {
    budget: scoreBudget(donnees.enveloppes),
    regularite: scoreRegularite(
      donnees.transactions,
      donnees.historiquePaiements,
      new Date(),
      donnees.historiquesMois.length + 1,
    ),
    epargne:
      (Math.min(
        streakEpargneMaintenue(
          sequenceEpargne(donnees.historiquesMois, donnees.epargneMois),
        ),
        6,
      ) /
        6) *
      100,
    objectifs: scoreObjectifs(donnees.objectifs),
    stabilite: scoreStabilite(donnees.historiquesMois.slice(-3)),
  };
  return calculerScoreDepuisSignaux(signaux);
}

// Reconstruit le score "tel qu'il était" pour un mois archivé donné
// (`indexMois` dans `historiquesMois`, trié chronologiquement) — en ne
// regardant que ce qui était connu jusqu'à ce mois inclus (jamais les mois
// suivants). Utilisé pour le delta "+6 pts ce mois" et la timeline de
// l'onglet Note. Passe par calculerScoreDepuisSignaux, exactement comme
// calculerScoreSante — même formule, seule la source des signaux change.
export function calculerScoreHistorique(
  indexMois: number,
  historiquesMoisTries: { mois: number; annee: number; enveloppes: EnveloppeMontants[]; objectifs: ObjectifMontants[]; epargne: number }[],
  transactions: EvenementDate[],
  historiquePaiements: EvenementDate[],
): ScoreSante {
  const snap = historiquesMoisTries[indexMois];
  const fenetrePrecedente = historiquesMoisTries.slice(0, indexMois);
  const finDeMois = new Date(snap.annee, snap.mois + 1, 0);

  const signaux: SignauxScore = {
    budget: scoreBudget(snap.enveloppes),
    regularite: scoreRegularite(
      transactions,
      historiquePaiements,
      finDeMois,
      indexMois + 1,
    ),
    // Même construction que calculerScoreSante (cf. RÈGLE sur
    // streakEpargneMaintenue) : la fenêtre précédente + `snap.epargne` donne
    // le streak "tel qu'il était" à ce mois archivé, jamais les mois
    // suivants.
    epargne:
      (Math.min(
        streakEpargneMaintenue(
          sequenceEpargne(fenetrePrecedente, snap.epargne),
        ),
        6,
      ) /
        6) *
      100,
    objectifs: scoreObjectifs(snap.objectifs),
    stabilite: scoreStabilite([...fenetrePrecedente.slice(-2), snap]),
  };
  return calculerScoreDepuisSignaux(signaux);
}

export type ExplicationScore = { texte: string; positif: boolean };

function trouverCategorieDepassee(
  enveloppes: EnveloppeAvecNom[],
): EnveloppeAvecNom | undefined {
  return enveloppes
    .filter((e) => e.type !== "Entrée" && e.depense > e.budget)
    .sort((a, b) => b.depense - b.budget - (a.depense - a.budget))[0];
}

// Seuil de bascule positif/négatif partagé par plusieurs critères — aligné
// sur celui déjà utilisé pour le mot-clé global ("À surveiller" à partir de
// 50, voir calculerScoreDepuisSignaux) pour qu'un sous-score et sa puce ne
// se contredisent jamais. Le budget n'utilise volontairement pas ce seuil :
// son propre calcul ne vaut 100 que si tu n'as pas dépassé ton budget, donc
// n'importe quel score en dessous de 100 signifie déjà un dépassement réel —
// y appliquer un seuil à 50 masquerait les dépassements légers.
const SEUIL_POSITIF = 50;
const SEUIL_ELEVE = 75;

// RÈGLE À NE JAMAIS CASSER — SEUIL DÉDIÉ À "RÉGULARITÉ", PAS SEUIL_POSITIF :
// details.regularite mesure une fraction de jours actifs sur une fenêtre
// glissante (scoreRegularite, jusqu'à 90 jours) — même des dépenses
// réparties tout le long du mois (ex: 16 jours actifs sur les ~22 jours
// écoulés) restent loin de couvrir toute la fenêtre de 90 jours, donc
// loin des 50% de SEUIL_POSITIF, sans que ce soit réellement irrégulier.
// Le message "irrégulière" ne doit se déclencher que pour une concentration
// VRAIMENT extrême (1-2 jours actifs sur toute la fenêtre) — 10% en est une
// approximation raisonnable quel que soit l'âge du compte (fenêtre 30 à 90
// jours selon nbMoisConnus dans scoreRegularite).
const SEUIL_IRREGULARITE = 10;

// Traduit en phrases concrètes ce qui fait gagner ou perdre des points sur
// chacun des 5 signaux — jamais une liste statique : chaque phrase découle
// de la valeur réelle du signal ce mois-ci, avec un texte et une couleur
// qui reflètent fidèlement le niveau du sous-score (pas seulement sa
// tendance), pour ne jamais afficher une puce positive sur un score bas. Un
// signal absent (details.* === null) ne produit aucune puce.
export function genererExplicationsScore(
  donnees: {
    enveloppes: EnveloppeAvecNom[];
    objectifs: ObjectifAvecNom[];
  } & DonneesSeries,
  details: ScoreSante["details"],
): ExplicationScore[] {
  const { enveloppes, objectifs, epargneMois, historiquesMois } = donnees;
  const explications: ExplicationScore[] = [];

  if (details.budget !== null) {
    if (details.budget >= 25) {
      explications.push({
        texte: "Tu respectes ton budget ce mois-ci.",
        positif: true,
      });
    } else {
      const categorie = trouverCategorieDepassee(enveloppes);
      const nom = categorie ? categorie.nom : null;
      const severe = details.budget < (SEUIL_POSITIF / 100) * 25;
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

  if (details.regularite !== null) {
    const pct = Math.round((details.regularite / 20) * 100);
    if (pct >= SEUIL_ELEVE) {
      explications.push({
        texte: "Tu enregistres tes dépenses très régulièrement.",
        positif: true,
      });
    } else if (pct < SEUIL_IRREGULARITE) {
      explications.push({
        texte: "Tes dépenses sont enregistrées de façon irrégulière ces derniers temps.",
        positif: false,
      });
    }
  }

  if (details.epargne !== null) {
    const streak = streakEpargneMaintenue(
      sequenceEpargne(historiquesMois, epargneMois),
    );
    const positif = details.epargne >= (SEUIL_POSITIF / 100) * 25;
    if (positif) {
      explications.push({
        texte:
          details.epargne >= (SEUIL_ELEVE / 100) * 25
            ? `Ton épargne progresse ou se maintient très régulièrement depuis ${streak} mois.`
            : `Ton épargne progresse ou se maintient depuis ${streak} mois.`,
        positif: true,
      });
    } else if (streak > 0) {
      explications.push({
        texte: `Ton épargne se maintient seulement depuis ${streak} mois, pas encore assez régulière.`,
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
      const pct = Math.round((details.objectifs / 20) * 100);
      if (pct >= SEUIL_POSITIF) {
        const meilleur = [...actifs].sort((a, b) => b.pct - a.pct)[0];
        explications.push({
          texte:
            pct >= SEUIL_ELEVE
              ? `Tu es proche de ton objectif ${meilleur.nom}.`
              : `Ton objectif ${meilleur.nom} avance plutôt bien.`,
          positif: true,
        });
      } else {
        const pireCas = [...actifs].sort((a, b) => a.pct - b.pct)[0];
        explications.push({
          texte:
            pct < 25
              ? `Ton objectif ${pireCas.nom} n'avance presque pas ce mois-ci.`
              : `Ton objectif ${pireCas.nom} avance doucement.`,
          positif: false,
        });
      }
    }
  }

  if (details.stabilite !== null) {
    const pct = Math.round((details.stabilite / 10) * 100);
    if (pct >= SEUIL_ELEVE) {
      explications.push({
        texte: "Tes dépenses sont stables d'un mois sur l'autre.",
        positif: true,
      });
    } else if (pct < SEUIL_POSITIF) {
      explications.push({
        texte: "Tes dépenses varient beaucoup d'un mois sur l'autre.",
        positif: false,
      });
    }
  }

  return explications;
}

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — moteur de lecture pur, toute écriture vit dans
// app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
// RÈGLE À NE JAMAIS CASSER — CARTOGRAPHIE DES 3 ZONES DE COACHING :
// Nos conseils (utils/conseils.ts) = MOIS EN COURS / Ce qu'il faut retenir
// (ce fichier) = PÉRIODE SÉLECTIONNÉE par l'utilisateur sur Stats / Vista
// Bilan (utils/bilanVista.ts) = TOUT L'HISTORIQUE disponible. Cette zone
// couvre la PÉRIODE SÉLECTIONNÉE — ne jamais y mettre un insight sur le
// seul mois en cours isolément (ça, c'est le terrain d'Aperçu) ni un
// insight qui ne aurait de sens que sur tout l'historique (ça, c'est le
// terrain de Vista Bilan). Tous les chiffres affichés doivent venir des
// paramètres reçus en entrée de genererInsightsPeriode
// (donneesReelles/donneesEpargne/donneesPrevisionnelles/depensesParCategorie/
// objectifs, déjà alignés sur la période sélectionnée par l'appelant) —
// jamais relus depuis le store ou recalculés à partir d'une autre source.
// Les fonctions locales (moyenne, ecartType, tendance, streakHausseConsecutive)
// sont de pures agrégations statistiques SUR ces paramètres, pas une
// resaisie d'une valeur qui existe déjà ailleurs (ex: resteEstime,
// enveloppe.depense) : ça reste conforme à la règle. Le risque à éviter est
// d'introduire un accès direct à objStore ou une formule qui duplique un
// calcul déjà fait côté Aperçu (utils/conseils.ts) ou Vista Bilan
// (utils/bilanVista.ts) — toute nouvelle famille d'insight doit rester
// ancrée sur les tableaux déjà tronqués à la période, jamais sur un
// recalcul indépendant du mois en cours ni sur tout l'historique.
//
// RÈGLE À NE JAMAIS CASSER : une catégorie de type "Fixe" (loyer,
// assurance...) ne doit JAMAIS être citée INDIVIDUELLEMENT dans un insight
// — ni en observation d'évolution, ni en recommandation. Un loyer fixe est
// par définition constant et prévu : "X est ta catégorie la plus variable"
// ou "X augmente depuis 3 mois" n'a pas de sens s'il s'agit d'une Fixe (bug
// confirmé, cf. historique). Toutes les détections PAR CATÉGORIE ci-dessous
// partent de `depensesParCategorieVariable` (filtré une seule fois en tête
// de fonction), jamais de `depensesParCategorie` brut — cf. RÈGLE identique
// dans utils/conseils.ts.
//
// RÈGLE À NE JAMAIS CASSER : anti-répétition — DEUX niveaux. (1) Le
// dédoublonnage par `cle` en fin de genererInsightsPeriode reste la seule
// protection contre deux candidats qui diraient la même chose sous une
// autre formulation ; toute nouvelle famille doit choisir une `cle`
// suffisamment spécifique. (2) Inter-zones : `situationsExclues` (rempli
// par l'appelant via utils/situationsSession.ts à partir de ce que "Nos
// conseils" a déjà affiché ce mois-ci) retire tout candidat dont la
// catégorie correspond à une situation déjà citée par Zone 1 — jamais
// l'inverse (cette zone ne marque rien elle-même, cf. RÈGLE symétrique
// dans app/(tabs)/index.tsx et app/(tabs)/analytics.tsx).
//
// RÈGLE À NE JAMAIS CASSER : validerConseil (utils/conseils.ts) est
// appliqué à chaque candidat qui porte une catégorie ou un objectif précis
// — jamais de référence à une catégorie supprimée/inactive ou un objectif
// clôturé, jamais un pourcentage aberrant. Silencieux + console.warn en cas
// d'échec, jamais de crash.
import { Enveloppe } from "../app/store";
import { validerConseil } from "./conseils";
import { Serie } from "./series";

// Moyenne simple, protégée contre les tableaux vides (appelant responsable
// de ne jamais en fournir, mais évite un NaN silencieux en cas d'oubli).
export function moyenne(valeurs: number[]): number {
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
export function tendance(valeurs: number[]): number | null {
  if (valeurs.length < 2) return null;
  const milieu = Math.floor(valeurs.length / 2);
  const premiereMoitie = valeurs.slice(0, milieu);
  const secondeMoitie = valeurs.slice(milieu);
  const moy1 = moyenne(premiereMoitie);
  const moy2 = moyenne(secondeMoitie);
  if (moy1 <= 0) return null;
  return ((moy2 - moy1) / moy1) * 100;
}

// Nombre de mois consécutifs, en partant de la fin de la série, où la
// valeur a strictement augmenté par rapport au mois précédent — 0 si le
// dernier mois n'a pas augmenté vs l'avant-dernier. Une "hausse sur 3 mois
// consécutifs" correspond à un streak de 2 (2 augmentations, donc 3 points
// de données impliqués : streak + 1).
function streakHausseConsecutive(valeurs: number[]): number {
  let streak = 0;
  for (let i = valeurs.length - 1; i > 0; i--) {
    if (valeurs[i] > valeurs[i - 1]) streak += 1;
    else break;
  }
  return streak;
}

const MONTANT_MIN_CATEGORIE_SIGNIFICATIVE = 30; // €/mois en moyenne — sous ce seuil, un % peut être spectaculaire sur un montant négligeable
const SEUIL_MOIS_MIN_TENDANCE = 3; // mois — un bilan sur 2 points n'est pas assez fiable
const SEUIL_BILAN_SIGNIFICATIF = 10; // % — delta 1ère/2e moitié de période en dessous duquel on parle de "stable"
const SEUIL_CV_DOMINANTE = 20; // % — coefficient de variation minimum pour qu'une catégorie soit "la plus variable"
const SEUIL_HAUSSE_MENSUELLE_EUR = 15; // €/mois — hausse moyenne minimum pour signaler une dérive (corrélation ou point d'attention)
const SEUIL_PROGRES_EPARGNE_PP = 3; // points de %, taux d'épargne — progression minimum pour être valorisée
const SEUIL_MOIS_MIN_EPARGNE_STREAK = 2; // "depuis X mois" n'a de sens qu'à partir de 2

type CandidatInsight = {
  famille: string;
  cle: string; // dédoublonnage : nom de catégorie, ou clé globale
  priorite: number; // ordre d'affichage si plusieurs qualifient (0 = en premier)
  texte: string;
  categorieId?: string;
  objectifId?: string;
  pourcentages?: number[];
};

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
  // Nombre de mois sélectionné par l'utilisateur (peut différer de
  // nbMoisAvecDonnees pour un compte récent) — pilote UNIQUEMENT le style
  // de formulation (peu de recul / premières tendances / tendances
  // confirmées / profil annuel), jamais la fenêtre de calcul elle-même.
  nbMoisSelectionne: number;
  series: Serie[];
  // Dépense de chaque catégorie (hors Entrée d'argent) sur les mêmes mois
  // que donneesReelles, même longueur, même alignement. `type` sert à
  // filtrer les Fixe avant toute détection par catégorie (cf. RÈGLE en tête
  // de fichier) — l'appelant doit fournir Fixe ET Variable ici (le filtre
  // vit dans cette fonction, pas côté appelant), `id` permet ensuite le
  // passage par validerConseil (catégorie active+existante).
  depensesParCategorie: { id: string; nom: string; type: "Fixe" | "Variable"; parMois: number[] }[];
  // Objectifs actifs avec leur rythme déjà calculé (calculerRythmeObjectif).
  objectifs: {
    id: string;
    nom: string;
    cible: number;
    ferme?: boolean;
    moisRestants: number | null;
    rythmeInsuffisant: boolean;
  }[];
  // Nécessaires pour validerConseil (catégorie active ce mois-ci) — l'état
  // COURANT des enveloppes/mois, pas un recalcul de données de période.
  enveloppes: Enveloppe[];
  moisActuel: number;
  anneeActuelle: number;
  situationsExclues?: Set<string>;
  maxInsights?: number;
}): string[] {
  const {
    donneesReelles,
    donneesEpargne,
    donneesPrevisionnelles,
    labels,
    nbMoisAvecDonnees,
    nbMoisSelectionne,
    series,
    depensesParCategorie,
    objectifs,
    enveloppes,
    moisActuel,
    anneeActuelle,
    situationsExclues,
    maxInsights = 3,
  } = params;

  const debut = donneesReelles.length - nbMoisAvecDonnees;
  const reelles = donneesReelles.slice(debut);
  const prevues = donneesPrevisionnelles.slice(debut);
  const epargneUtile = donneesEpargne.slice(debut);
  const labelsUtiles = labels.slice(debut);
  // RÈGLE À NE JAMAIS CASSER : cf. RÈGLE en tête de fichier — base commune
  // à TOUTE détection par catégorie ci-dessous (profil annuel, tendance
  // dominante, corrélation, point d'attention). Une catégorie Fixe n'est
  // jamais candidate individuellement.
  const depensesParCategorieVariable = depensesParCategorie.filter((c) => c.type === "Variable");

  const categoriesDejaCitees = new Set<string>();
  const candidats: CandidatInsight[] = [];

  // === 1. Bilan de la période — formulation adaptée à nbMoisSelectionne =======
  // 1-2 mois : observation courte, pas de tendance affirmée (peu de recul).
  // 3 mois : "premières tendances" (évolution + mois où le budget a été
  // respecté). 4-11 mois : "tendances confirmées" (taux d'épargne).
  // 12 mois+ : "profil annuel" (catégorie dominante en moyenne/mois).
  if (nbMoisSelectionne <= 2) {
    if (reelles.length > 0) {
      const moyennePeriode = moyenne(reelles);
      candidats.push({
        famille: "bilan_periode",
        cle: "bilan",
        priorite: 0,
        texte: `Sur ${reelles.length === 1 ? "ce mois" : "ces 2 derniers mois"}, vous avez dépensé en moyenne ${Math.round(moyennePeriode)}€. Pas encore assez de recul pour dégager une vraie tendance — regardez sur 3 mois ou plus pour ça.`,
      });
    }
  } else if (reelles.length >= SEUIL_MOIS_MIN_TENDANCE) {
    const milieu = Math.floor(reelles.length / 2);
    const avant = moyenne(reelles.slice(0, milieu));
    const apres = moyenne(reelles.slice(milieu));
    const deltaPct = avant > 0 ? ((apres - avant) / avant) * 100 : 0;

    if (nbMoisSelectionne === 3) {
      const moisRespectes = reelles.filter(
        (r, i) => prevues[i] > 0 && r <= prevues[i],
      ).length;
      const direction =
        deltaPct <= -SEUIL_BILAN_SIGNIFICATIF
          ? "diminuent"
          : deltaPct >= SEUIL_BILAN_SIGNIFICATIF
            ? "augmentent"
            : "restent stables";
      candidats.push({
        famille: "bilan_periode",
        cle: "bilan",
        priorite: 0,
        texte: `Premières tendances : vos dépenses ${direction} progressivement sur ces 3 mois (environ ${Math.round(avant)}€ à ${Math.round(apres)}€). Vous avez respecté votre budget ${moisRespectes} mois sur 3.`,
      });
    } else if (nbMoisSelectionne >= 4 && nbMoisSelectionne < 12) {
      const tauxParMoisConfirme = reelles.map((_, i) =>
        prevues[i] > 0 ? (epargneUtile[i] / prevues[i]) * 100 : null,
      );
      const tauxValidesConfirme = tauxParMoisConfirme.filter(
        (t): t is number => t !== null,
      );
      if (tauxValidesConfirme.length >= SEUIL_MOIS_MIN_TENDANCE) {
        const milieuTaux = Math.floor(tauxValidesConfirme.length / 2);
        const tauxAvant = moyenne(tauxValidesConfirme.slice(0, milieuTaux));
        const tauxApres = moyenne(tauxValidesConfirme.slice(milieuTaux));
        candidats.push({
          famille: "bilan_periode",
          cle: "bilan",
          priorite: 0,
          texte: `Tendance confirmée sur ${reelles.length} mois : votre capacité d'épargne évolue de ${Math.round(tauxAvant)}% à ${Math.round(tauxApres)}% de votre budget.`,
          pourcentages: [Math.round(Math.abs(tauxAvant)), Math.round(Math.abs(tauxApres))],
        });
      } else if (deltaPct <= -SEUIL_BILAN_SIGNIFICATIF) {
        candidats.push({
          famille: "bilan_periode",
          cle: "bilan",
          priorite: 0,
          texte: `Tendance confirmée sur ${reelles.length} mois : vos dépenses ont diminué d'environ ${Math.round(avant)}€ à ${Math.round(apres)}€ — une amélioration durable.`,
        });
      } else if (deltaPct >= SEUIL_BILAN_SIGNIFICATIF) {
        candidats.push({
          famille: "bilan_periode",
          cle: "bilan",
          priorite: 0,
          texte: `Tendance confirmée sur ${reelles.length} mois : vos dépenses sont passées d'environ ${Math.round(avant)}€ à ${Math.round(apres)}€ — un point à surveiller.`,
        });
      } else {
        candidats.push({
          famille: "bilan_periode",
          cle: "bilan",
          priorite: 0,
          texte: `Tendance confirmée sur ${reelles.length} mois : vos dépenses restent stables (environ ${Math.round(avant)}€ contre ${Math.round(apres)}€).`,
        });
      }
    } else {
      // Profil annuel (12 mois et plus) : catégorie la plus dépensière en
      // moyenne mensuelle sur toute la période sélectionnée.
      let dominanteAnnuelle: { id: string; nom: string; moy: number } | null = null;
      for (const cat of depensesParCategorieVariable) {
        const serieCat = cat.parMois.slice(debut);
        if (serieCat.length === 0) continue;
        const moy = moyenne(serieCat);
        if (!dominanteAnnuelle || moy > dominanteAnnuelle.moy) {
          dominanteAnnuelle = { id: cat.id, nom: cat.nom, moy };
        }
      }
      if (dominanteAnnuelle && dominanteAnnuelle.moy > 0) {
        candidats.push({
          famille: "bilan_periode",
          cle: "bilan",
          priorite: 0,
          texte: `Profil annuel : sur les ${reelles.length} derniers mois, vous dépensez en moyenne ${Math.round(dominanteAnnuelle.moy)}€/mois en ${dominanteAnnuelle.nom}, votre poste le plus important.`,
          categorieId: dominanteAnnuelle.id,
        });
      }
    }
  }

  // === 2. Tendance dominante : catégorie la plus variable sur la période ======
  let dominante: { id: string; nom: string; min: number; max: number; cv: number } | null = null;
  for (const cat of depensesParCategorieVariable) {
    const serieCat = cat.parMois.slice(debut);
    if (serieCat.length < SEUIL_MOIS_MIN_TENDANCE) continue;
    const moy = moyenne(serieCat);
    if (moy < MONTANT_MIN_CATEGORIE_SIGNIFICATIVE) continue;
    const cv = moy > 0 ? (ecartType(serieCat, moy) / moy) * 100 : 0;
    if (cv < SEUIL_CV_DOMINANTE) continue;
    if (!dominante || cv > dominante.cv) {
      dominante = { id: cat.id, nom: cat.nom, min: Math.min(...serieCat), max: Math.max(...serieCat), cv };
    }
  }
  if (dominante) {
    categoriesDejaCitees.add(dominante.nom);
    candidats.push({
      famille: "tendance_dominante",
      cle: dominante.nom,
      priorite: 1,
      texte: `${dominante.nom} est votre catégorie la plus variable sur cette période — elle oscille entre ${Math.round(dominante.min)}€ et ${Math.round(dominante.max)}€ selon les mois. C'est le poste qui influence le plus votre budget global.`,
      categorieId: dominante.id,
    });
  }

  // === 3. Corrélation entre catégories =========================================
  // Deux catégories en hausse consécutive simultanée, dont l'excès combiné
  // vs leur propre moyenne sur la période est significatif.
  const candidatesHausse = depensesParCategorieVariable
    .filter((cat) => !categoriesDejaCitees.has(cat.nom))
    .map((cat) => {
      const serieCat = cat.parMois.slice(debut);
      const moy = moyenne(serieCat);
      const streak = streakHausseConsecutive(serieCat);
      const dernierMois = serieCat.length > 0 ? serieCat[serieCat.length - 1] : 0;
      const excesVsMoyenne = dernierMois - moy;
      const hausseMoyenneParMois =
        streak > 0 ? (dernierMois - serieCat[serieCat.length - 1 - streak]) / streak : 0;
      return { cat, serieCat, moy, streak, excesVsMoyenne, hausseMoyenneParMois };
    })
    .filter(
      ({ moy, streak, hausseMoyenneParMois }) =>
        moy >= MONTANT_MIN_CATEGORIE_SIGNIFICATIVE &&
        streak >= 1 &&
        hausseMoyenneParMois >= SEUIL_HAUSSE_MENSUELLE_EUR,
    )
    .sort((a, b) => b.excesVsMoyenne - a.excesVsMoyenne);
  if (candidatesHausse.length >= 2) {
    const [a, b] = candidatesHausse;
    categoriesDejaCitees.add(a.cat.nom);
    categoriesDejaCitees.add(b.cat.nom);
    const moisEnsemble = Math.min(a.streak, b.streak) + 1;
    candidats.push({
      famille: "correlation_categories",
      cle: `${a.cat.nom}+${b.cat.nom}`,
      priorite: 2,
      texte: `Vos dépenses ${a.cat.nom} et ${b.cat.nom} augmentent simultanément depuis ${moisEnsemble} mois. Ensemble, elles représentent environ ${Math.round(a.excesVsMoyenne + b.excesVsMoyenne)}€ supplémentaires par rapport à votre moyenne habituelle sur cette période.`,
      // Une seule catégorie peut être validée à la fois par validerConseil —
      // on choisit la plus significative des deux (a), l'autre reste sous
      // le seul filet du dédoublonnage par cle.
      categorieId: a.cat.id,
    });
  }

  // === 4. Projection sur la période suivante ===================================
  // "Vivante" dans le sens où elle est recalculée à partir des vraies
  // valeurs de chaque rendu, jamais mise en cache — extrapolation linéaire
  // simple à partir des deux derniers mois de marge (disponible - dépensé -
  // épargné), comparée à la moyenne récente pour donner un repère.
  if (reelles.length >= 2 && prevues[prevues.length - 1] > 0) {
    const marges = reelles.map((r, i) => (prevues[i] ?? 0) - r - (epargneUtile[i] ?? 0));
    const dernier = marges[marges.length - 1];
    const avantDernier = marges[marges.length - 2];
    const projection = dernier + (dernier - avantDernier);
    const fenetre = Math.min(3, marges.length);
    const moyenneRecente = moyenne(marges.slice(-fenetre));
    const diffPct =
      moyenneRecente !== 0
        ? ((projection - moyenneRecente) / Math.abs(moyenneRecente)) * 100
        : 0;
    const qualif =
      Math.abs(diffPct) < 10
        ? "proche de"
        : diffPct > 0
          ? "légèrement au-dessus de"
          : "légèrement en dessous de";
    candidats.push({
      famille: "projection_suivante",
      cle: "projection",
      priorite: 3,
      texte: `Si votre rythme actuel continue, vous devriez terminer le mois prochain avec environ ${Math.round(projection)}€ de marge — ${qualif} votre moyenne des ${fenetre} derniers mois (${Math.round(moyenneRecente)}€).`,
    });
  }

  // === 5. Point fort à valoriser ===============================================
  // Priorité au taux d'épargne (le plus parlant), repli sur le streak
  // d'épargne régulière + objectif atteignable au rythme actuel si le taux
  // d'épargne n'a pas assez progressé.
  let pointFortAjoute = false;
  const tauxParMois = reelles.map((_, i) =>
    prevues[i] > 0 ? (epargneUtile[i] / prevues[i]) * 100 : null,
  );
  const tauxValides = tauxParMois.filter((t): t is number => t !== null);
  if (tauxValides.length >= SEUIL_MOIS_MIN_TENDANCE) {
    const milieu = Math.floor(tauxValides.length / 2);
    const tauxAvant = moyenne(tauxValides.slice(0, milieu));
    const tauxApres = moyenne(tauxValides.slice(milieu));
    if (tauxApres - tauxAvant >= SEUIL_PROGRES_EPARGNE_PP) {
      candidats.push({
        famille: "point_fort_epargne",
        cle: "point_fort",
        priorite: 4,
        texte: `Votre taux d'épargne a progressé de ${Math.round(tauxAvant)}% à ${Math.round(tauxApres)}% sur cette période. C'est une évolution significative qui mérite d'être maintenue.`,
        pourcentages: [Math.round(Math.abs(tauxAvant)), Math.round(Math.abs(tauxApres))],
      });
      pointFortAjoute = true;
    }
  }
  if (!pointFortAjoute) {
    const serieEpargneCroissante = series.find((s) => s.type === "epargne-croissante");
    if (serieEpargneCroissante && serieEpargneCroissante.enCours >= SEUIL_MOIS_MIN_EPARGNE_STREAK) {
      const eligibles = objectifs
        .filter(
          (o) => !o.ferme && o.cible > 0 && o.moisRestants !== null && !o.rythmeInsuffisant,
        )
        .sort((a, b) => (a.moisRestants ?? Infinity) - (b.moisRestants ?? Infinity));
      if (eligibles.length > 0) {
        candidats.push({
          famille: "point_fort_objectif",
          cle: "point_fort",
          priorite: 4,
          texte: `Vous épargnez régulièrement depuis ${serieEpargneCroissante.enCours} mois — à ce rythme, votre objectif ${eligibles[0].nom} sera atteint dans environ ${eligibles[0].moisRestants} mois.`,
          objectifId: eligibles[0].id,
        });
      }
    }
  }

  // === 6. Point d'attention ====================================================
  // Menace principale sur la trajectoire : catégorie en hausse consécutive
  // depuis au moins 3 mois, avec l'impact chiffré sur la capacité
  // d'épargne. Repli sur le mois le plus dépensier de la période si aucune
  // catégorie n'a une vraie dérive sur 3 mois.
  const menaceHausse = depensesParCategorieVariable
    .filter((cat) => !categoriesDejaCitees.has(cat.nom))
    .map((cat) => {
      const serieCat = cat.parMois.slice(debut);
      const moy = moyenne(serieCat);
      const streak = streakHausseConsecutive(serieCat);
      const hausseMoyenneParMois =
        streak >= 2
          ? (serieCat[serieCat.length - 1] - serieCat[serieCat.length - 1 - streak]) / streak
          : 0;
      return { cat, moy, streak, hausseMoyenneParMois };
    })
    .filter(
      ({ moy, streak, hausseMoyenneParMois }) =>
        moy >= MONTANT_MIN_CATEGORIE_SIGNIFICATIVE &&
        streak >= 2 &&
        hausseMoyenneParMois >= SEUIL_HAUSSE_MENSUELLE_EUR,
    )
    .sort((a, b) => b.hausseMoyenneParMois - a.hausseMoyenneParMois)[0];
  if (menaceHausse) {
    categoriesDejaCitees.add(menaceHausse.cat.nom);
    const moisConsecutifs = menaceHausse.streak + 1;
    candidats.push({
      famille: "point_attention_hausse",
      cle: "point_attention",
      priorite: 5,
      texte: `${menaceHausse.cat.nom} augmente depuis ${moisConsecutifs} mois consécutifs (+${Math.round(menaceHausse.hausseMoyenneParMois)}€/mois en moyenne). Si cette tendance continue, elle réduira votre capacité d'épargne d'environ ${Math.round(menaceHausse.hausseMoyenneParMois)}€ par mois.`,
      categorieId: menaceHausse.cat.id,
    });
  } else {
    let indexPic = -1;
    let depensePic = 0;
    reelles.forEach((v, i) => {
      if (v > depensePic) {
        depensePic = v;
        indexPic = i;
      }
    });
    if (indexPic >= 0) {
      let categorieExplicative: { id: string; nom: string; exces: number } | null = null;
      for (const cat of depensesParCategorieVariable) {
        if (categoriesDejaCitees.has(cat.nom)) continue;
        const serieCat = cat.parMois.slice(debut);
        if (serieCat.length < 2) continue;
        const valeurPic = serieCat[indexPic];
        const autresMois = serieCat.filter((_, i) => i !== indexPic);
        const exces = valeurPic - moyenne(autresMois);
        if (!categorieExplicative || exces > categorieExplicative.exces) {
          categorieExplicative = { id: cat.id, nom: cat.nom, exces };
        }
      }
      if (categorieExplicative && categorieExplicative.exces > 0) {
        categoriesDejaCitees.add(categorieExplicative.nom);
        candidats.push({
          famille: "point_attention_pic",
          cle: "point_attention",
          priorite: 5,
          texte: `${labelsUtiles[indexPic]} a été votre mois le plus dépensier sur cette période — principalement à cause de ${categorieExplicative.nom} (+${Math.round(categorieExplicative.exces)}€ vs votre moyenne habituelle). Un repère utile si un mois similaire se représente.`,
          categorieId: categorieExplicative.id,
        });
      }
    }
  }

  // Dédoublonnage final par `cle` (categoriesDejaCitees couvre déjà
  // l'essentiel pendant la détection, ceci couvre les clés globales
  // partagées par plusieurs variantes d'une même famille — ex: point_fort,
  // point_attention) puis tri par priorité (l'ordre de la vision d'origine :
  // bilan → tendance dominante → corrélation → projection → point fort →
  // point d'attention).
  const clesVues = new Set<string>();
  const insights = candidats
    .filter((c) => {
      if (clesVues.has(c.cle)) return false;
      clesVues.add(c.cle);
      return true;
    })
    .sort((a, b) => a.priorite - b.priorite)
    // Anti-répétition inter-zones : retire tout candidat dont la catégorie
    // est déjà citée par une situation de "Nos conseils" ce mois-ci — le
    // format des clés de Zone 1 est toujours `famille:id` (ou
    // `famille:id1+id2`), donc "l'id apparaît dans une clé déjà affichée"
    // est un test fiable sans avoir à connaître le détail des familles de
    // utils/conseils.ts.
    .filter((c) => {
      if (!c.categorieId || !situationsExclues) return true;
      return ![...situationsExclues].some((cle) => cle.includes(c.categorieId!));
    })
    .filter((c) =>
      validerConseil(
        {
          categorieId: c.categorieId,
          objectifId: c.objectifId,
          pourcentages: c.pourcentages,
        },
        {
          resteEstime: 0,
          enveloppes,
          objectifsAvecRythme: objectifs.map((o) => ({ objectif: { id: o.id } })),
          moisActuel,
          anneeActuelle,
        },
      ),
    )
    .map((c) => c.texte);

  if (insights.length === 0) {
    return [
      "Pas encore assez d'historique sur cette période pour dégager une tendance — continuez à enregistrer vos dépenses.",
    ];
  }
  return insights.slice(0, maxInsights);
}

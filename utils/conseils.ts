// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — c'est un moteur de lecture pur (déduction de
// texte à partir de données déjà chargées), toute écriture doit vivre dans
// app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
// RÈGLE À NE JAMAIS CASSER : cette zone couvre LE MOIS EN COURS
// uniquement — "Que dois-je faire maintenant ?". Ne jamais y mettre des
// insights des autres zones. Cartographie : Nos conseils (ici) = mois en
// cours / Ce qu'il faut retenir (utils/tendancesPeriode.ts) = période
// sélectionnée par l'utilisateur sur Stats / Vista Bilan
// (utils/bilanVista.ts) = tout l'historique disponible.
//
// RÈGLE À NE JAMAIS CASSER : tous les chiffres affichés dans un conseil
// (reste estimé, montant/pourcentage dépensé d'une catégorie, budget
// prévu, moyenne historique, rythme d'objectif...) doivent venir des
// paramètres reçus en entrée de genererConseils — enveloppe.depense /
// enveloppe.budget depuis le store, resteEstime/disponibleEffectif passés
// en paramètre depuis app/(tabs)/index.tsx (voir
// utils/budget.ts::calculerResteEstimeCourant, la seule source), historique
// depuis historiquesMois uniquement. Jamais recalculés localement ici avec
// une formule dupliquée — une seule formule qui diverge en silence est
// exactement ce qui produit des chiffres incohérents entre Aperçu, Stats et
// les conseils. validerConseil (plus bas) est le filet de sécurité qui
// retire silencieusement un conseil si cette règle est violée par erreur —
// mais elle ne remplace pas la discipline : ne recalculez rien ici,
// utilisez ce qui est passé en paramètre.
//
// RÈGLE À NE JAMAIS CASSER : une catégorie de type "Fixe" (loyer, assurance,
// abonnement fixe...) ne doit JAMAIS être citée INDIVIDUELLEMENT dans un
// conseil — ni en observation d'évolution/dépassement, ni en
// recommandation d'action. Un loyer fixe est par définition constant et
// prévu : "le loyer a dépassé 0€" ou "le loyer augmente" n'a pas de sens
// actionnable (bug confirmé, cf. historique). Seules les catégories
// Variable alimentent les détections PAR CATÉGORIE de detecterSituations
// (cf. `enveloppesVariables` ci-dessous, filtré une seule fois en tête de
// fonction) ; une catégorie Fixe ne peut apparaître que dans un montant
// GLOBAL agrégeant Fixe+Variable (ex: totalDepenses), jamais nommée seule.
//
// RÈGLE À NE JAMAIS CASSER : anti-répétition entre zones — "Nos conseils"
// (ici) est la source PRIORITAIRE, toujours affiché en entier, JAMAIS
// filtré (genererConseils n'accepte donc `situationsExclues` que pour
// permettre aux DEUX AUTRES zones de s'exclure PAR RAPPORT À celle-ci,
// jamais l'inverse — ne jamais passer ce paramètre depuis
// app/(tabs)/index.tsx). Après affichage, l'appelant marque les
// situations montrées via utils/situationsSession.ts (mémoire de session
// en RAM, jamais persistée) ; "Ce qu'il faut retenir"
// (utils/tendancesPeriode.ts) et "Vista Bilan" (utils/bilanVista.ts) lisent
// ensuite ce marquage pour ne jamais répéter la même situation. Le repli
// générique ("tout va bien"/"données insuffisantes") est volontairement
// épargné, ce n'est pas un insight qui "se répète".
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Enveloppe,
  Objectif,
  PaiementHistorique,
  SnapshotEnveloppe,
  SnapshotMois,
  Transaction,
} from "../app/store";
import { depenseCumuleeAuJour, joursDansMois, MOIS_LABELS, moisPrecedent } from "./exportExcel";
import { estCategorieActiveCeMois } from "./budget";

export type NiveauConseil = "bon" | "attention" | "alerte";

// --- États persistés (voir section "Moteur de coaching" plus bas pour le
// détail de leur logique) --------------------------------------------------

export type EtatInsight =
  | "NOUVEAU"
  | "A_SURVEILLER"
  | "CONFIRME"
  | "AMELIORATION"
  | "RESOLU"
  | "STABLE"
  | "DEGRADATION"
  | "RISQUE"
  | "ACTION"
  | "RETABLISSEMENT";

export const LIBELLES_ETAT_INSIGHT: Record<EtatInsight, string> = {
  NOUVEAU: "Nouveau",
  A_SURVEILLER: "À surveiller",
  CONFIRME: "Confirmé",
  AMELIORATION: "Amélioration",
  RESOLU: "Résolu",
  STABLE: "Stable",
  DEGRADATION: "Dégradation",
  RISQUE: "Risque",
  ACTION: "Action",
  RETABLISSEMENT: "Rétablissement",
};

export type Conseil = {
  texte: string;
  niveau: NiveauConseil;
  // null uniquement pour les 2 replis "tout va bien" / "données
  // insuffisantes" — ce ne sont pas des situations suivies dans le temps.
  etat: EtatInsight | null;
  // Renseigné uniquement pour les situations qui portent sur UNE catégorie
  // précise (budget/tendance/dépense inhabituelle/récurrente/nouvelle
  // catégorie) — permet à un bouton "Simuler" de présélectionner
  // directement la bonne catégorie dans l'onglet Simulateur de "Ton bilan"
  // sans avoir à reparser le texte du conseil.
  categorieId?: string;
  // Même principe que categorieId, pour les situations qui portent sur UN
  // objectif précis — utilisé par validerConseil pour vérifier que
  // l'objectif mentionné existe toujours (cf. RÈGLE en tête de fichier).
  objectifId?: string;
  // Identifiant stable de la situation (même valeur que EtatInsightPersiste
  // .situationId quand la situation est suivie dans le temps) — permet à
  // l'appelant de coordonner l'anti-répétition entre "Nos conseils"
  // (Aperçu) et "Vista" (Ton bilan, Stats) via
  // utils/situationsSession.ts : jamais montrer deux fois la même situation
  // dans des blocs différents au cours de la même session.
  cle: string;
};

export type EtatInsightPersiste = {
  situationId: string;
  etat: EtatInsight;
  // Valeur de gravité (voir plus bas) au moment de la toute première
  // détection — conservée pour référence, jamais réécrite ensuite.
  valeurReference: number;
  // Valeur de gravité à la dernière mise à jour — c'est elle qui sert à
  // détecter une amélioration (comparée à la valeur du jour).
  derniereValeur: number;
  nbPointsConfirmes: number;
  datePremiereDetection: string; // "AAAA-MM-JJ"
  dateDerniereMiseAJour: string; // "AAAA-MM-JJ"
};

export type EtatsInsightsMap = Record<string, EtatInsightPersiste>;

// --- Signaux réutilisés tels quels par le moteur de conseils d'Aperçu et
// par les KPI de Stats, pour ne garder qu'un seul endroit qui sait calculer
// ces pourcentages.

// Delta de la dépense moyenne par jour de ce mois-ci vs le mois dernier, en
// % et en €. Le mois dernier est ramené à une moyenne sur 30 jours fixes
// (pas son nombre réel de jours) : approximation historique conservée telle
// quelle pour ne pas changer un chiffre déjà affiché aux utilisateurs.
export function calculerDeltaDepenseJournaliere(
  depenseMoisActuel: number,
  depenseMoisPrec: number,
  joursEcoules: number,
): { pct: number; deltaEuros: number } {
  const depenseMoyJour =
    joursEcoules > 0 ? Math.round(depenseMoisActuel / joursEcoules) : 0;
  const depenseMoyJourPrec =
    depenseMoisPrec > 0 ? Math.round(depenseMoisPrec / 30) : 0;
  const pct =
    depenseMoyJourPrec > 0
      ? Math.round(
          ((depenseMoyJour - depenseMoyJourPrec) / depenseMoyJourPrec) * 100,
        )
      : 0;
  return { pct, deltaEuros: depenseMoyJour - depenseMoyJourPrec };
}

export function calculerTauxEpargne(
  epargneMois: number,
  disponible: number,
): number {
  return disponible > 0 ? Math.round((epargneMois / disponible) * 100) : 0;
}

export function calculerDeltaTotal(
  depenseMoisActuel: number,
  depenseMoisPrec: number,
): number {
  return depenseMoisPrec > 0
    ? Math.round(((depenseMoisActuel - depenseMoisPrec) / depenseMoisPrec) * 100)
    : 0;
}

// Plus grosse dépense du mois (Budget) — comparée sur toutes les catégories
// de dépense (Fixe + Variable, hors Entrée d'argent) passées par l'appelant.
export function trouverDepenseDominante(
  enveloppesSansEntree: Enveloppe[],
): Enveloppe | undefined {
  return [...enveloppesSansEntree].sort((a, b) => b.depense - a.depense)[0];
}

// Rythme d'un objectif d'épargne (Stats) — montant mensuel récurrent si
// l'objectif est récurrent (signal le plus fiable), sinon moyenne des
// versements réels des derniers mois reconstruite depuis les "actuel"
// archivés, avec repli sur le seul versement de ce mois-ci si pas assez
// d'historique.
const NB_MOIS_MOYENNE_RYTHME = 3;

export type RythmeObjectif = {
  pct: number;
  delta: number | null;
  moisRestants: number | null;
  rythmeInsuffisant: boolean;
  rythmeMensuel: number;
  objectifAtteint: boolean;
};

// Objectif actif accompagné de son rythme — c'est CETTE forme que
// validerConseil attend dans params.objectifsAvecRythme (cf. RÈGLE en tête
// de fichier) : ne jamais valider un conseil contre `objectifs` brut, qui
// contient aussi les objectifs fermés/inactifs.
export type ObjectifAvecRythme = { objectif: Objectif; rythme: RythmeObjectif };

export function calculerRythmeObjectif(
  obj: Objectif,
  historiquesMois: SnapshotMois[],
  snapshotMoisPrecedent: SnapshotMois | undefined,
): RythmeObjectif {
  const pct = obj.cible > 0 ? Math.min((obj.actuel / obj.cible) * 100, 100) : 0;
  const objPrecedent = snapshotMoisPrecedent?.objectifs.find(
    (o) => o.id === obj.id,
  );
  const delta = objPrecedent ? obj.actuel - objPrecedent.actuel : null;

  let rythmeMensuel: number;
  if (obj.recurrent && obj.montantMensuel && obj.montantMensuel > 0) {
    rythmeMensuel = obj.montantMensuel;
  } else {
    const actuelsRecents = historiquesMois
      .slice(-NB_MOIS_MOYENNE_RYTHME)
      .map((s) => s.objectifs.find((o) => o.id === obj.id)?.actuel)
      .filter((v): v is number => v !== undefined);
    const sequence = [...actuelsRecents, obj.actuel];
    rythmeMensuel =
      sequence.length >= 2
        ? sequence
            .slice(1)
            .map((v, i) => v - sequence[i])
            .reduce((acc, d) => acc + d, 0) /
          (sequence.length - 1)
        : obj.contributionMois;
  }
  const objectifAtteint = obj.actuel >= obj.cible;
  const moisRestants =
    !objectifAtteint && rythmeMensuel > 0
      ? Math.ceil((obj.cible - obj.actuel) / rythmeMensuel)
      : null;
  const rythmeInsuffisant = !objectifAtteint && rythmeMensuel <= 0;

  return { pct, delta, moisRestants, rythmeInsuffisant, rythmeMensuel, objectifAtteint };
}

// --- Persistance des états (AsyncStorage) ----------------------------------
//
// RÈGLE À NE JAMAIS CASSER : les états d'insights sont des métadonnées
// locales à l'appareil (AsyncStorage), pas une table Supabase — elles ne
// changent la trajectoire d'aucun calcul financier (budgets, transactions,
// objectifs restent la seule source de vérité, toujours en base), elles ne
// font que se souvenir "depuis quand on suit tel sujet" pour raconter une
// évolution. Perdre ce fichier (désinstallation, changement d'appareil) est
// donc sans risque réel : au pire, l'historique narratif repart de NOUVEAU,
// rien d'autre n'est affecté. Ne jamais promouvoir ces données vers
// Supabase sans réévaluer cette hypothèse.

const PREFIXE_CLE_ETATS_INSIGHTS = "vista_etats_insights_";

export async function chargerEtatsInsights(userId: string): Promise<EtatsInsightsMap> {
  try {
    const brut = await AsyncStorage.getItem(`${PREFIXE_CLE_ETATS_INSIGHTS}${userId}`);
    return brut ? (JSON.parse(brut) as EtatsInsightsMap) : {};
  } catch {
    return {};
  }
}

export async function sauvegarderEtatsInsights(
  userId: string,
  etats: EtatsInsightsMap,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${PREFIXE_CLE_ETATS_INSIGHTS}${userId}`,
      JSON.stringify(etats),
    );
  } catch {
    // Best-effort : une erreur d'écriture ne doit jamais empêcher l'affichage
    // des conseils, juste faire perdre l'historique d'état la prochaine fois.
  }
}

// RÈGLE À NE JAMAIS CASSER — PRÉFIXES situationId QUI PORTENT SUR UNE (OU
// DEUX, séparées par "+") CATÉGORIE(S) DE DÉPENSE : cf. les `situationId`
// posés plus bas dans detecterSituations. Sert UNIQUEMENT à
// nettoyerEtatsInsightsObsoletes ci-dessous, pour savoir quelles entrées
// comparer aux enveloppes actuelles — ne JAMAIS y ajouter un préfixe
// objectif/global (deficit:, objectif:, marge:, comportement:,
// meilleurmois:, projection:, suggestion:, atteint:, modifie:, proche:,
// versement:) : leur "id" ne correspond par définition à aucune enveloppe,
// ce n'est pas une preuve d'obsolescence, ça viderait ces entrées à tort. Si
// un nouveau situationId par catégorie est ajouté dans detecterSituations,
// ajouter son préfixe ICI, sinon les entrées obsolètes de ce type ne seront
// simplement jamais nettoyées (repli sûr — jamais de faux positif).
const PREFIXES_SITUATION_CATEGORIE = [
  "budget",
  "tendance",
  "baisse",
  "inhabituelle",
  "recurrente",
  "nouvelle",
  "compensation",
  "correlation",
];

// RÈGLE À NE JAMAIS CASSER — NETTOYAGE SILENCIEUX, UNE SEULE FOIS AU
// CHARGEMENT : retire toute entrée par catégorie dont AUCUNE référence
// (deux pour compensation/correlation) ne correspond plus à une enveloppe
// active aujourd'hui — l'appelant décide du "une seule fois" (cf. RÈGLE côté
// app/(tabs)/index.tsx), cette fonction est pure et peut être rappelée sans
// risque, elle ne fait qu'un filtrage. Comparaison par id ET par nom
// trimmé (pas seulement id) : des entrées legacy antérieures à l'usage d'un
// id stable comme situationId ont pu être écrites avec le nom de la
// catégorie à la place — même filtre "actif ce mois-ci" que validerConseil
// (estCategorieActiveCeMois), pour ne jamais garder une entrée que
// validerConseil aurait de toute façon rejetée à chaque rendu (c'est
// exactement le warning en boucle que ce nettoyage doit faire disparaître).
export function nettoyerEtatsInsightsObsoletes(
  etats: EtatsInsightsMap,
  enveloppes: Enveloppe[],
  anneeActuelle: number,
  moisActuel: number,
): EtatsInsightsMap {
  const nettoye: EtatsInsightsMap = {};
  Object.entries(etats).forEach(([situationId, etatPersiste]) => {
    const [prefixe, reste] = situationId.split(":");
    if (!PREFIXES_SITUATION_CATEGORIE.includes(prefixe)) {
      nettoye[situationId] = etatPersiste;
      return;
    }
    const references = (reste ?? "").split("+");
    const toutesActives = references.every((ref) =>
      enveloppes.some(
        (e) =>
          (e.id === ref || e.nom.trim() === ref) &&
          estCategorieActiveCeMois(e, anneeActuelle, moisActuel),
      ),
    );
    if (toutesActives) {
      nettoye[situationId] = etatPersiste;
    }
  });
  return nettoye;
}

// Compteur cumulatif du nombre de situations passées par RESOLU/STABLE au
// moins une fois — alimente les trophées "Insight en action"/"Discipline
// douce" (utils/trophees.ts). Contrairement à EtatsInsightsMap (qui purge
// les entrées résolues, cf. RÈGLE #3 plus bas), ce compteur ne fait
// qu'augmenter : c'est un historique de "combien de fois", pas un état
// courant.
const PREFIXE_CLE_AMELIORATIONS = "vista_ameliorations_count_";

export async function chargerNbAmeliorations(userId: string): Promise<number> {
  try {
    const brut = await AsyncStorage.getItem(`${PREFIXE_CLE_AMELIORATIONS}${userId}`);
    return brut ? Number(brut) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function sauvegarderNbAmeliorations(
  userId: string,
  total: number,
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PREFIXE_CLE_AMELIORATIONS}${userId}`, String(total));
  } catch {
    // Best-effort, même logique que sauvegarderEtatsInsights ci-dessus.
  }
}

// RÈGLE À NE JAMAIS CASSER — ISOLATION ENTRE COMPTES : ces deux clés sont
// déjà namespacées par userId (donc un NOUVEAU compte ne peut techniquement
// pas les lire), mais on les purge quand même explicitement à la
// déconnexion du compte SORTANT — appelée par
// reinitialiserEtatUtilisateur (app/store.ts) avec le userId qui vient de
// se déconnecter, jamais laisser cet historique narratif traîner
// indéfiniment sur l'appareil après un logout.
export async function purgerDonneesInsights(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      `${PREFIXE_CLE_ETATS_INSIGHTS}${userId}`,
      `${PREFIXE_CLE_AMELIORATIONS}${userId}`,
    ]);
  } catch {
    // Best-effort, même logique que sauvegarderEtatsInsights ci-dessus.
  }
}

// --- Moteur de coaching "Nos conseils" (Aperçu) ----------------------------
//
// RÈGLE À NE JAMAIS CASSER — à lire avant de toucher à ce qui suit :
//
// 1. SUIVRE UNE SITUATION, PAS SEULEMENT LA DÉTECTER. Chaque sujet suivi
//    (une catégorie qui dérive, un objectif qui décroche, une marge qui se
//    dégrade...) a un `situationId` stable (ex: "tendance:idCatégorie",
//    "objectif:idObjectif") et un état persisté (EtatInsightPersiste,
//    AsyncStorage) qui survit entre les sessions. determinerEtatInsight
//    fait progresser cet état à partir de sa "valeur de gravité" du jour
//    (plus bas = mieux, quelle que soit la famille) : NOUVEAU/DEGRADATION
//    (1ère détection) → A_SURVEILLER/RISQUE (confirmé une 2e fois) →
//    CONFIRME/ACTION (3e fois ou plus) → AMELIORATION/RETABLISSEMENT (la
//    gravité baisse nettement) → RESOLU/STABLE (la situation n'est plus
//    active du tout). Les deux vocabulaires (observation vs dégradation)
//    partagent exactement cette même mécanique à 5 crans — seuls les mots
//    affichés diffèrent, choisis selon `priorite` de la situation
//    ("critique" → vocabulaire dégradation, sinon → observation).
//
// 2. AU PLUS UNE TRANSITION PAR JOUR CALENDAIRE. determinerEtatInsight
//    compare `dateDerniereMiseAJour` à la date du jour : si déjà mis à jour
//    aujourd'hui, l'état persisté est retourné TEL QUEL, sans avancer. Sans
//    cette garde, rouvrir l'app plusieurs fois dans la même journée ferait
//    défiler tous les états en quelques minutes — le principe même de
//    "suivre dans le temps" perdrait son sens. C'est aussi ce qui garantit
//    qu'un même jour, le texte affiché reste identique à chaque ouverture.
//
// 3. RÉSOLUTION EXPLICITE, PAS UN SILENCE. Quand une situation suivie
//    n'est plus active, on l'annonce une fois (RESOLU/STABLE) puis on
//    arrête de la suivre (l'entrée est supprimée de la map persistée) —
//    une réapparition ultérieure du même sujet repart de zéro (NOUVEAU),
//    volontairement : on ne fait pas semblant de se souvenir d'un épisode
//    clos pour ne pas fausser une nouvelle observation avec un vieux
//    contexte. Seules les familles qui représentent un vrai "problème
//    réversible" (budget de catégorie, tendance à la hausse, déficit
//    global, trajectoire d'objectif, marge qui se dégrade, comportement en
//    dégradation — via ajouterSituationSuivie) suivent cet arc complet
//    jusqu'à la résolution ; les situations ponctuelles/informatives (ex:
//    nouvelle catégorie, objectif atteint — via ajouterSituationPonctuelle)
//    n'ont pas de notion de "résolution" et disparaissent simplement quand
//    elles ne sont plus vraies, sans message de clôture.
//
// 4. TON JAMAIS MORALISATEUR. Aucun texte ci-dessous ne doit contenir de
//    jugement ("vous dépensez trop", "vous devez arrêter") ni d'impératif
//    culpabilisant — observation factuelle → explication chiffrée → impact
//    chiffré → action formulée comme un choix, jamais un ordre.

type PrioriteSituation = "critique" | "evolutive" | "positive" | "neutre";
type VocabulaireEtat = "observation" | "degradation";

type SituationDetectee = {
  // Sert à la fois de clé de dédoublonnage (categoriesDejaCitees s'appuie
  // sur l'id de catégorie/objectif, pas sur `cle`) et de situationId pour
  // les situations suivies dans le temps.
  cle: string;
  priorite: PrioriteSituation;
  etat: EtatInsight | null;
  texteParEtat: (etat: EtatInsight) => string;
  niveauConseil: (etat: EtatInsight) => NiveauConseil;
  // Voir Conseil.categorieId/objectifId — propagés tels quels jusqu'au
  // Conseil final.
  categorieId?: string;
  objectifId?: string;
  // Champs "témoins" utilisés uniquement par validerConseil (jamais exposés
  // sur le Conseil final) : la valeur exacte de resteEstime affichée dans le
  // texte de cette situation (uniquement pour les familles qui l'affichent
  // littéralement), et les pourcentages affichés. Comme ce sont les mêmes
  // variables que celles passées à texteParEtat (pas une resaisie), une
  // divergence ne peut apparaître qu'en cas de vraie régression de calcul.
  resteEstimeAffiche?: number;
  pourcentagesAffiches?: number[];
};

function journeeISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function libelleEtape(
  vocabulaire: VocabulaireEtat,
  etape: "premiere" | "confirmation" | "forte" | "amelioration" | "resolu",
): EtatInsight {
  if (etape === "resolu") return vocabulaire === "observation" ? "RESOLU" : "STABLE";
  if (vocabulaire === "observation") {
    if (etape === "premiere") return "NOUVEAU";
    if (etape === "confirmation") return "A_SURVEILLER";
    if (etape === "forte") return "CONFIRME";
    return "AMELIORATION";
  }
  if (etape === "premiere") return "DEGRADATION";
  if (etape === "confirmation") return "RISQUE";
  if (etape === "forte") return "ACTION";
  return "RETABLISSEMENT";
}

const SEUIL_AMELIORATION_RELATIVE = 0.15; // baisse relative de gravité pour parler d'amélioration
const NB_POINTS_POUR_ETAT_FORT = 3; // nb de vérifications (jours distincts) où la situation reste active

// Fait progresser (ou éteint) l'état persisté d'une situation suivie —
// cf. RÈGLES #1/#2/#3 ci-dessus. `valeurGravite` : plus bas = mieux, quelle
// que soit la famille appelante (ratio de dépassement, € de déficit, % de
// hausse projeté...). Retourne null quand il n'y a plus rien à suivre
// (jamais actif, ou déjà annoncé résolu un jour précédent).
function determinerEtatInsight(
  estActive: boolean,
  valeurGraviteActuelle: number,
  vocabulaire: VocabulaireEtat,
  etatPrecedent: EtatInsightPersiste | undefined,
  situationId: string,
  aujourdHui: string,
): EtatInsightPersiste | null {
  if (!estActive && !etatPrecedent) return null;

  if (!etatPrecedent) {
    return {
      situationId,
      etat: libelleEtape(vocabulaire, "premiere"),
      valeurReference: valeurGraviteActuelle,
      derniereValeur: valeurGraviteActuelle,
      nbPointsConfirmes: 1,
      datePremiereDetection: aujourdHui,
      dateDerniereMiseAJour: aujourdHui,
    };
  }

  if (etatPrecedent.dateDerniereMiseAJour === aujourdHui) return etatPrecedent;

  if (!estActive) {
    if (etatPrecedent.etat === "RESOLU" || etatPrecedent.etat === "STABLE") return null;
    return {
      ...etatPrecedent,
      etat: libelleEtape(vocabulaire, "resolu"),
      derniereValeur: 0,
      dateDerniereMiseAJour: aujourdHui,
    };
  }

  const etaitEnAmelioration =
    etatPrecedent.etat === "AMELIORATION" || etatPrecedent.etat === "RETABLISSEMENT";
  if (etaitEnAmelioration) {
    // Toujours actif après une amélioration : pas fini de se résoudre — on
    // reste sur ce cran plutôt que de régresser à un stade antérieur à
    // chaque petite fluctuation.
    return { ...etatPrecedent, derniereValeur: valeurGraviteActuelle, dateDerniereMiseAJour: aujourdHui };
  }

  const enAmelioration =
    etatPrecedent.derniereValeur > 0 &&
    valeurGraviteActuelle < etatPrecedent.derniereValeur * (1 - SEUIL_AMELIORATION_RELATIVE);
  if (enAmelioration) {
    return {
      ...etatPrecedent,
      etat: libelleEtape(vocabulaire, "amelioration"),
      derniereValeur: valeurGraviteActuelle,
      dateDerniereMiseAJour: aujourdHui,
    };
  }

  const nbPointsConfirmes = etatPrecedent.nbPointsConfirmes + 1;
  return {
    ...etatPrecedent,
    etat: libelleEtape(
      vocabulaire,
      nbPointsConfirmes >= NB_POINTS_POUR_ETAT_FORT ? "forte" : "confirmation",
    ),
    nbPointsConfirmes,
    derniereValeur: valeurGraviteActuelle,
    dateDerniereMiseAJour: aujourdHui,
  };
}

function niveauConseilParDefaut(etat: EtatInsight): NiveauConseil {
  if (etat === "ACTION") return "alerte";
  if (etat === "RESOLU" || etat === "STABLE" || etat === "AMELIORATION" || etat === "RETABLISSEMENT") {
    return "bon";
  }
  return "attention";
}

// Enregistre une situation avec l'arc complet (détection → confirmation →
// amélioration → résolution) — réservé aux familles qui représentent un
// vrai problème réversible, cf. RÈGLE #3.
function ajouterSituationSuivie(
  situations: SituationDetectee[],
  etatsAJour: EtatsInsightsMap,
  args: {
    situationId: string;
    estActive: boolean;
    valeurGravite: number;
    vocabulaire: VocabulaireEtat;
    priorite: PrioriteSituation;
    etatsPrecedents: EtatsInsightsMap;
    aujourdHui: string;
    texteParEtat: (etat: EtatInsight) => string;
    niveauConseil?: (etat: EtatInsight) => NiveauConseil;
    categorieId?: string;
    objectifId?: string;
    resteEstimeAffiche?: number;
    pourcentagesAffiches?: number[];
    // Muté (compteur.count++) chaque fois qu'une situation atteint
    // RESOLU/STABLE pour la première fois — alimente le trophée "Insight en
    // action"/"Discipline douce" (utils/trophees.ts). Optionnel : les
    // appelants qui ne suivent pas ce compteur peuvent l'omettre.
    compteurResolutions?: { count: number };
  },
): void {
  const etatPrecedentAvant = args.etatsPrecedents[args.situationId];
  const resultat = determinerEtatInsight(
    args.estActive,
    args.valeurGravite,
    args.vocabulaire,
    etatPrecedentAvant,
    args.situationId,
    args.aujourdHui,
  );
  if (!resultat) {
    delete etatsAJour[args.situationId];
    return;
  }
  etatsAJour[args.situationId] = resultat;

  const etaitDejaResolu =
    etatPrecedentAvant?.etat === "RESOLU" || etatPrecedentAvant?.etat === "STABLE";
  const estMaintenantResolu = resultat.etat === "RESOLU" || resultat.etat === "STABLE";
  if (estMaintenantResolu && !etaitDejaResolu && args.compteurResolutions) {
    args.compteurResolutions.count += 1;
  }

  situations.push({
    cle: args.situationId,
    priorite: args.priorite,
    etat: resultat.etat,
    texteParEtat: args.texteParEtat,
    niveauConseil: args.niveauConseil ?? niveauConseilParDefaut,
    categorieId: args.categorieId,
    objectifId: args.objectifId,
    resteEstimeAffiche: args.resteEstimeAffiche,
    pourcentagesAffiches: args.pourcentagesAffiches,
  });
}

// Enregistre une situation ponctuelle/informative, sans notion de
// résolution — le badge évolue (NOUVEAU → A_SURVEILLER → CONFIRME) si le
// même sujet reste vrai sur plusieurs vérifications, mais disparaît
// simplement (pas de message de clôture) dès qu'il ne l'est plus plus.
function ajouterSituationPonctuelle(
  situations: SituationDetectee[],
  etatsAJour: EtatsInsightsMap,
  args: {
    situationId: string;
    estActive: boolean;
    priorite: PrioriteSituation;
    etatsPrecedents: EtatsInsightsMap;
    aujourdHui: string;
    texte: string;
    niveauConseil?: NiveauConseil;
    categorieId?: string;
    objectifId?: string;
    resteEstimeAffiche?: number;
    pourcentagesAffiches?: number[];
  },
): void {
  if (!args.estActive) {
    delete etatsAJour[args.situationId];
    return;
  }
  const resultat = determinerEtatInsight(
    true,
    0,
    "observation",
    args.etatsPrecedents[args.situationId],
    args.situationId,
    args.aujourdHui,
  );
  if (!resultat) return;
  etatsAJour[args.situationId] = resultat;
  situations.push({
    cle: args.situationId,
    priorite: args.priorite,
    etat: resultat.etat,
    texteParEtat: () => args.texte,
    niveauConseil: () => args.niveauConseil ?? "bon",
    categorieId: args.categorieId,
    objectifId: args.objectifId,
    resteEstimeAffiche: args.resteEstimeAffiche,
    pourcentagesAffiches: args.pourcentagesAffiches,
  });
}

function genererTexteConseil(situation: SituationDetectee, etat: EtatInsight): string {
  return situation.texteParEtat(etat);
}

const SEUIL_DEPASSEMENT_CATEGORIE = 1.3; // budget dépassé, ≥30% au-delà
const SEUIL_CATEGORIE_IMMINENT_MIN = 0.8; // budget imminent, ≥80% consommé
const SEUIL_HAUSSE_CATEGORIE = 0.15; // tendance catégorie, +15% projeté vs moyenne récente
const MONTANT_MIN_CATEGORIE = 20; // € — plancher anti-bruit sur les signaux catégorie
const NB_MOIS_MOYENNE_CATEGORIE = 3;
const SEUIL_SPIKE_PONCTUEL = 2; // dépense inhabituelle, ×moyenne 3 mois
const TOLERANCE_RECURRENCE = 0.1; // catégorie récurrente, ±10% considéré "même montant"
const SEUIL_COMPENSATION_ECART = 0.25; // compensation, tolérance entre écarts opposés
const SEUIL_MARGE_DEGRADATION = 0.15; // recul du ratio de marge vs mois précédent
const SEUIL_MARGE_VERSEMENT = 0.25; // ratioReste minimum pour suggérer un versement
const SEUIL_OBJECTIF_PROCHE_MIN = 75; // %
const SEUIL_OBJECTIF_PROCHE_MAX = 95; // %
const NB_MOIS_MEILLEUR_MOIS = 3;
const SEUIL_JOUR_MIN_MEILLEUR_MOIS = 5; // évite un "meilleur mois" trivial dès le 1er jour
// RÈGLE À NE JAMAIS CASSER — DÉLAI MINIMUM AVANT COMPARAISON AU MOIS
// PRÉCÉDENT : demande du 2026-09-01 — un conseil qui compare `e.depense`/
// resteEstime du mois EN COURS (encore partiel, forcément petit tôt dans le
// mois) à une donnée du mois précédent OU d'une moyenne historique (mois
// COMPLETS) produit un ratio artificiellement énorme et non représentatif
// avant que suffisamment de jours se soient écoulés (ex: "baisse de 95%"
// le 2 du mois, simplement parce que rien n'a encore été dépensé). Distinct
// de SEUIL_JOUR_MIN_MEILLEUR_MOIS ci-dessus (protection différente, déjà
// bien calibrée pour sa propre famille "meilleur mois", non concernée par
// cette demande) : ne pas fusionner les deux seuils.
const SEUIL_JOUR_COMPARAISON_MOIS_PRECEDENT = 10;

// --- Textes des familles à arc complet (ajouterSituationSuivie) -----------

function texteBudgetCategorie(
  e: Enveloppe,
  jourActuel: number,
  joursRestantsDansMois: number,
  moisActuel: number,
  anneeActuelle: number,
  etat: EtatInsight,
): string {
  if (etat === "STABLE" || etat === "RETABLISSEMENT") {
    return etat === "STABLE"
      ? `${e.nom} est repassé sous son budget et s'y maintient — situation stabilisée.`
      : `${e.nom} est repassé sous son budget ce mois-ci après avoir été sous tension récemment. Bon signe, à confirmer.`;
  }
  const ratio = e.budget > 0 ? e.depense / e.budget : 0;
  const pct = Math.round(ratio * 100);
  const rythmeJournalier = jourActuel > 0 ? e.depense / jourActuel : 0;
  const projectionFinMois = rythmeJournalier * joursDansMois(moisActuel, anneeActuelle);
  const depassementProjete = Math.round(projectionFinMois - e.budget);
  const budgetJournalierRestant =
    joursRestantsDansMois > 0 ? Math.max(0, (e.budget - e.depense) / joursRestantsDansMois) : 0;

  const constat =
    ratio >= 1
      ? `${e.nom} a dépassé son budget de ${Math.round(e.depense - e.budget)}€ ce mois-ci.`
      : `${e.nom} a déjà consommé ${pct}% de son budget et il reste ${joursRestantsDansMois} jour${joursRestantsDansMois > 1 ? "s" : ""} ce mois-ci.`;
  // RÈGLE : cette fonction n'est appelée que pour des catégories Variable
  // (candidatsBudget filtre sur enveloppesVariables, cf. RÈGLE en tête de
  // fichier) — une catégorie Fixe n'atteint jamais ce texte, donc l'action
  // de réduction est toujours pertinente ici, sans condition sur `e.type`.
  const action =
    depassementProjete > 0
      ? ` À ce rythme, le dépassement atteindrait ${depassementProjete}€ — limiter ce poste à environ ${budgetJournalierRestant.toFixed(1)}€/jour permettrait de rester dans votre budget.`
      : "";
  const suggestionRevision =
    " Si votre objectif d'épargne reste prioritaire, ce budget mérite peut-être d'être révisé.";

  if (etat === "DEGRADATION") return `${constat}${action}`;
  if (etat === "RISQUE") return `${constat} Cette tension se confirme d'une vérification à l'autre.${action}`;
  return `${constat} Cette situation dure depuis plusieurs vérifications maintenant.${action}${suggestionRevision}`;
}

function texteTendanceCategorie(e: Enveloppe, pctProjete: number, etat: EtatInsight): string {
  const pct = Math.round(Math.max(0, pctProjete));
  if (etat === "NOUVEAU") {
    return `Votre rythme de dépenses ${e.nom} augmente ce mois-ci (+${pct}% vs votre moyenne).`;
  }
  if (etat === "A_SURVEILLER") {
    return `Cette hausse se confirme. Vous êtes désormais à +${pct}% sur ${e.nom}.`;
  }
  if (etat === "CONFIRME") {
    return `Depuis plusieurs vérifications, vos dépenses ${e.nom} dépassent votre moyenne habituelle (+${pct}% actuellement). Ce poste mérite attention.`;
  }
  if (etat === "AMELIORATION") {
    return `Votre rythme de dépenses ${e.nom} ralentit. L'écart est redescendu à +${pct}%.`;
  }
  return `Situation stabilisée — vos dépenses ${e.nom} sont revenues à seulement +${pct}% de votre moyenne.`;
}

function texteDeficitGlobal(
  resteEstime: number,
  joursRestantsDansMois: number,
  etat: EtatInsight,
): string {
  // RÈGLE À NE JAMAIS CASSER : le signe RÉEL et ACTUEL de resteEstime fait
  // toujours autorité sur le texte affiché — jamais le seul `etat`. `etat`
  // n'est mis à jour qu'une fois par jour calendaire (cf. RÈGLE #2 en tête
  // de fichier) : si resteEstime redevient positif PLUS TARD le même jour
  // (l'utilisateur ajuste un budget, encaisse une entrée...), `etat` peut
  // rester figé sur DEGRADATION/RISQUE/ACTION jusqu'au lendemain alors que
  // resteEstime, recalculé à chaque rendu, est déjà positif. Sans ce garde,
  // on affichait "vous êtes en passe de dépasser votre budget de 333€" avec
  // 333€ = un reste estimé en réalité POSITIF (bug confirmé) — le montant
  // était juste, mais le sens (dépassement) était l'inverse de la réalité.
  if (resteEstime >= 0) {
    return etat === "STABLE"
      ? "Vous êtes revenu dans votre budget — situation stabilisée."
      : "Vous êtes repassé dans votre budget ce mois-ci après un dépassement récent.";
  }
  const montant = Math.round(Math.abs(resteEstime));
  const base = `Avec vos dépenses actuelles, vous êtes en passe de dépasser votre budget de ${montant}€ ce mois-ci.`;
  if (etat === "DEGRADATION") return base;
  if (etat === "RISQUE") {
    return `${base} Il reste ${joursRestantsDansMois} jour${joursRestantsDansMois > 1 ? "s" : ""} pour corriger le tir.`;
  }
  return `Le dépassement se confirme d'une vérification à l'autre (${montant}€ actuellement). Si votre objectif d'épargne reste prioritaire, ce serait le bon moment pour revoir le budget de vos catégories principales.`;
}

function texteObjectifTrajectoire(objectif: Objectif, etat: EtatInsight): string {
  // RÈGLE À NE JAMAIS CASSER : même garde que texteDeficitGlobal — si
  // l'objectif est déjà atteint MAINTENANT (fait réel et actuel), ne jamais
  // afficher "il reste Xu20ac" même si `etat` est encore figé sur une valeur
  // d'avant l'atteinte (mise à jour au plus 1x/jour).
  if (etat === "STABLE" || etat === "RETABLISSEMENT" || objectif.actuel >= objectif.cible) {
    return etat === "STABLE"
      ? `${objectif.nom} a repris un rythme régulier — situation stabilisée.`
      : `${objectif.nom} a reçu un nouveau versement ce mois-ci après une période sans progression. Bon signe.`;
  }
  const manque = Math.round(Math.max(0, objectif.cible - objectif.actuel));
  if (etat === "DEGRADATION") {
    return `Aucun versement sur ${objectif.nom} ce mois-ci. Il reste ${manque}€ pour l'atteindre.`;
  }
  if (etat === "RISQUE") {
    return `${objectif.nom} n'avance plus depuis plusieurs vérifications. Il reste ${manque}€ pour l'atteindre.`;
  }
  return `${objectif.nom} est à l'arrêt depuis un moment (${manque}€ restants) — sans jugement, ça arrive. Trois options quand vous serez prêt : reprendre un petit versement régulier, réduire temporairement la cible, ou laisser l'objectif de côté encore un peu et y revenir plus tard.`;
}

function texteMargeEvolution(
  resteEstime: number,
  resteEstimePrecedent: number,
  moisPrec: number,
  etat: EtatInsight,
): string {
  // RÈGLE À NE JAMAIS CASSER : même garde que texteDeficitGlobal — si la
  // marge ne se dégrade plus MAINTENANT (fait réel, recalculé à chaque
  // rendu), ne jamais afficher "se réduit" même si `etat` reste
  // temporairement figé sur DEGRADATION/RISQUE/ACTION (mise à jour au plus
  // 1x/jour, cf. RÈGLE #2 en tête de fichier).
  if (etat === "STABLE" || etat === "RETABLISSEMENT" || resteEstime >= resteEstimePrecedent) {
    return etat === "STABLE"
      ? "Votre marge de fin de mois s'est stabilisée."
      : "Votre marge de fin de mois s'est redressée récemment — bon signe.";
  }
  const base = `Votre marge de fin de mois se réduit par rapport à ${MOIS_LABELS[moisPrec]} (${Math.round(resteEstimePrecedent)}€ contre une projection actuelle de ${Math.round(resteEstime)}€).`;
  if (etat === "DEGRADATION") return `${base} Rien d'alarmant, mais un signal à surveiller.`;
  if (etat === "RISQUE") return `${base} Ce recul se confirme d'une vérification à l'autre.`;
  return `${base} Ce recul dure depuis un moment — un point à regarder de plus près.`;
}

function texteComportementDegradation(nbMois: number, etat: EtatInsight): string {
  if (etat === "STABLE" || etat === "RETABLISSEMENT") {
    return etat === "STABLE"
      ? "Votre marge de fin de mois s'est stabilisée après une période de recul."
      : "Votre marge de fin de mois se redresse après plusieurs mois de recul — bon signe.";
  }
  return `Votre marge de fin de mois recule depuis ${nbMois} mois consécutifs. Ce n'est pas encore critique, mais ça mérite un point d'attention avant que ça ne s'installe.`;
}

// Détecte TOUTES les situations pertinentes, fait progresser leur état
// persisté et retourne le tout — `etatsAJour` part d'une copie de
// `etatsPrecedents` (les sujets non retouchés cette fois-ci restent
// inchangés) et les 2 fonctions ajouterSituation* la mettent à jour.
function detecterSituations(
  params: {
    enveloppes: Enveloppe[];
    objectifs: Objectif[];
    historiquesMois: SnapshotMois[];
    transactions: Transaction[];
    historiquePaiements: PaiementHistorique[];
    epargneMois: number;
    resteEstime: number;
    resteEstimePrecedent: number | null;
    disponibleEffectif: number;
    moisActuel: number;
    anneeActuelle: number;
  },
  etatsPrecedents: EtatsInsightsMap,
): {
  situations: SituationDetectee[];
  etatsAJour: EtatsInsightsMap;
  nouvellesResolutions: number;
  objectifsAvecRythme: ObjectifAvecRythme[];
} {
  const {
    enveloppes,
    objectifs,
    historiquesMois,
    transactions,
    historiquePaiements,
    resteEstime,
    resteEstimePrecedent,
    disponibleEffectif,
    moisActuel,
    anneeActuelle,
  } = params;

  const aujourdHui = journeeISO(new Date());
  const etatsAJour: EtatsInsightsMap = { ...etatsPrecedents };

  // RÈGLE À NE JAMAIS CASSER — ANTI-DOUBLON PAR MOIS_COMPTAGE : `enveloppes`
  // (le paramètre reçu, cf. objStore.enveloppes côté appelant) n'est PAS
  // scopé au mois en cours — il contient aussi des enveloppes taguées pour
  // un AUTRE mois via mois_comptage tant qu'elles n'ont pas été archivées
  // (ex: une entrée d'argent datée le mois précédent mais comptant pour
  // celui-ci). Filtré ici par estCategorieActiveCeMois avant tout calcul —
  // toute la détection ci-dessous (budget, tendance, spike, corrélation...)
  // part de enveloppesSansEntree/enveloppesVariables, jamais de `enveloppes`
  // brut, donc ce seul filtre suffit à protéger toute la fonction.
  const enveloppesSansEntree = enveloppes
    .filter((e) => e.type !== "Entrée")
    .filter((e) => estCategorieActiveCeMois(e, anneeActuelle, moisActuel));
  const totalDepenses = enveloppesSansEntree.reduce((acc, e) => acc + e.depense, 0);
  // RÈGLE À NE JAMAIS CASSER : cf. RÈGLE en tête de fichier — base commune à
  // TOUTE détection par catégorie ci-dessous (budget, tendance, spike,
  // corrélation, compensation, récurrente, nouvelle catégorie). Une
  // catégorie Fixe n'est jamais candidate individuellement, seul
  // `totalDepenses` (global, ci-dessus) peut encore l'inclure.
  const enveloppesVariables = enveloppesSansEntree.filter((e) => e.type === "Variable");
  const jourActuel = new Date().getDate();
  const joursRestantsDansMois = joursDansMois(moisActuel, anneeActuelle) - jourActuel;
  const ratioReste = disponibleEffectif > 0 ? resteEstime / disponibleEffectif : 0;
  // RÈGLE À NE JAMAIS CASSER — cf. SEUIL_JOUR_COMPARAISON_MOIS_PRECEDENT plus
  // haut : gate TOUTE situation qui compare une donnée du mois EN COURS
  // (encore partielle) à une donnée du mois précédent ou à une moyenne
  // historique de mois complets — jamais une famille qui ne fait QUE
  // comparer des mois déjà archivés entre eux, ni une alerte sur le mois en
  // cours seul (budget dépassé, déficit projeté...), qui reste légitime dès
  // le 1er du mois.
  const comparaisonMoisPrecedentDisponible = jourActuel >= SEUIL_JOUR_COMPARAISON_MOIS_PRECEDENT;

  const { mois: moisPrec, annee: anneePrec } = moisPrecedent(moisActuel, anneeActuelle);
  const snapshotMoisPrecedent = historiquesMois.find(
    (s) => s.mois === moisPrec && s.annee === anneePrec,
  );

  const margeSnapshot = (s: SnapshotMois) => s.disponible - s.totalDepense - s.epargne;
  const derniersMoisArchives = historiquesMois.slice(-NB_MOIS_MOYENNE_CATEGORIE);

  const objectifsActifs = objectifs.filter((o) => !o.ferme);
  const objectifsAvecRythme = objectifsActifs.map((o) => ({
    objectif: o,
    rythme: calculerRythmeObjectif(o, historiquesMois, snapshotMoisPrecedent),
  }));

  const categoriesDejaCitees = new Set<string>();
  const objectifsDejaCites = new Set<string>();
  const situations: SituationDetectee[] = [];
  // Compte les transitions RESOLU/STABLE de ce rendu — alimente les
  // trophées "Insight en action"/"Discipline douce" (utils/trophees.ts).
  const compteurResolutions = { count: 0 };

  const snapshotEnv = (
    snap: SnapshotMois,
    id: string,
  ): SnapshotEnveloppe | undefined => snap.enveloppes.find((e) => e.id === id);

  const moyenneRecenteCategorie = (id: string) => {
    if (derniersMoisArchives.length === 0) return 0;
    return (
      derniersMoisArchives.reduce((acc, p) => acc + (snapshotEnv(p, id)?.depense ?? 0), 0) /
      derniersMoisArchives.length
    );
  };

  // === Budget de catégorie (dépassé/imminent, arc complet) ===================
  // RÈGLE : plancher MONTANT_MIN_CATEGORIE appliqué ici comme sur toutes les
  // autres familles de signaux catégorie du fichier (cf. lignes 1019/1045/
  // 1051/1078/1110/1142/1192) — bug confirmé : un budget > 0 mais minuscule
  // (ex: 1€) produisait un ratio depense/budget totalement disproportionné
  // (ex: 412%), rejeté in extremis par validerConseil (garde-fou > 300%,
  // qui a fonctionné comme prévu) mais jamais généré proprement. `e.budget
  // >= MONTANT_MIN_CATEGORIE` (au lieu de `> 0`) évite de calculer un
  // pourcentage sur une base non significative en premier lieu, plutôt que
  // de compter sur le filet de sécurité en aval pour rattraper le résultat.
  const candidatsBudget = enveloppesVariables
    .filter((e) => e.budget >= MONTANT_MIN_CATEGORIE && !categoriesDejaCitees.has(e.id))
    .map((e) => {
      const ratio = e.depense / e.budget;
      const situationId = `budget:${e.id}`;
      return { e, ratio, estActive: ratio >= SEUIL_CATEGORIE_IMMINENT_MIN, situationId };
    })
    .filter(({ estActive, situationId }) => estActive || etatsPrecedents[situationId] !== undefined)
    .sort((a, b) => b.ratio - a.ratio);
  if (candidatsBudget.length > 0) {
    const { e, ratio, estActive, situationId } = candidatsBudget[0];
    categoriesDejaCitees.add(e.id);
    ajouterSituationSuivie(situations, etatsAJour, {
      situationId,
      estActive,
      valeurGravite: ratio,
      vocabulaire: "degradation",
      priorite: "critique",
      etatsPrecedents,
      aujourdHui,
      texteParEtat: (etat) =>
        texteBudgetCategorie(e, jourActuel, joursRestantsDansMois, moisActuel, anneeActuelle, etat),
      categorieId: e.id,
      pourcentagesAffiches: [Math.round(ratio * 100)],
      compteurResolutions,
    });
  }

  // === Déficit global projeté (toutes catégories confondues) =================
  ajouterSituationSuivie(situations, etatsAJour, {
    situationId: "deficit:global",
    estActive: resteEstime < 0,
    valeurGravite: Math.max(0, -resteEstime),
    vocabulaire: "degradation",
    priorite: "critique",
    etatsPrecedents,
    aujourdHui,
    texteParEtat: (etat) => texteDeficitGlobal(resteEstime, joursRestantsDansMois, etat),
    resteEstimeAffiche: resteEstime,
    compteurResolutions,
  });

  // === Objectifs : trajectoire dégradée (arc complet) =========================
  const candidatsObjectifTrajectoire = objectifsAvecRythme
    .filter(({ objectif }) => !objectifsDejaCites.has(objectif.id))
    .map(({ objectif, rythme }) => ({
      objectif,
      situationId: `objectif:${objectif.id}`,
      estActive: !rythme.objectifAtteint && rythme.rythmeInsuffisant,
    }))
    .filter(({ estActive, situationId }) => estActive || etatsPrecedents[situationId] !== undefined)
    .sort(
      (a, b) =>
        a.objectif.cible - a.objectif.actuel - (b.objectif.cible - b.objectif.actuel),
    );
  if (candidatsObjectifTrajectoire.length > 0) {
    const { objectif, situationId, estActive } = candidatsObjectifTrajectoire[0];
    objectifsDejaCites.add(objectif.id);
    ajouterSituationSuivie(situations, etatsAJour, {
      situationId,
      estActive,
      valeurGravite: estActive ? Math.max(1, objectif.cible - objectif.actuel) : 0,
      vocabulaire: "degradation",
      priorite: "critique",
      etatsPrecedents,
      aujourdHui,
      texteParEtat: (etat) => texteObjectifTrajectoire(objectif, etat),
      objectifId: objectif.id,
      compteurResolutions,
    });
  }

  // === Compensation entre catégories ==========================================
  if (snapshotMoisPrecedent && comparaisonMoisPrecedentDisponible) {
    const deltasCategories = enveloppesVariables
      .filter((e) => !categoriesDejaCitees.has(e.id))
      .map((e) => {
        const prec = snapshotEnv(snapshotMoisPrecedent, e.id);
        return { e, delta: e.depense - (prec?.depense ?? 0) };
      })
      .filter(({ delta }) => Math.abs(delta) >= MONTANT_MIN_CATEGORIE);
    const hausses = deltasCategories.filter(({ delta }) => delta > 0).sort((a, b) => b.delta - a.delta);
    const baisses = deltasCategories.filter(({ delta }) => delta < 0).sort((a, b) => a.delta - b.delta);
    if (hausses.length > 0 && baisses.length > 0) {
      const hausse = hausses[0];
      const baisse = baisses.find(
        (b) => Math.abs(Math.abs(b.delta) - hausse.delta) <= hausse.delta * SEUIL_COMPENSATION_ECART,
      );
      if (baisse) {
        categoriesDejaCitees.add(hausse.e.id);
        categoriesDejaCitees.add(baisse.e.id);
        ajouterSituationPonctuelle(situations, etatsAJour, {
          situationId: `compensation:${hausse.e.id}+${baisse.e.id}`,
          estActive: true,
          priorite: "positive",
          etatsPrecedents,
          aujourdHui,
          texte: `${hausse.e.nom} a augmenté de ${Math.round(hausse.delta)}€ ce mois-ci, mais ${baisse.e.nom} a baissé d'à peu près autant (${Math.round(Math.abs(baisse.delta))}€) — votre budget global reste équilibré malgré ce déplacement.`,
        });
      }
    }
  }

  // === Deux catégories qui évoluent ensemble ==================================
  if (snapshotMoisPrecedent && comparaisonMoisPrecedentDisponible) {
    const hausseCorrelees = enveloppesVariables
      .filter((e) => e.depense >= MONTANT_MIN_CATEGORIE && !categoriesDejaCitees.has(e.id))
      .map((e) => {
        const depensePrec = snapshotEnv(snapshotMoisPrecedent, e.id)?.depense ?? 0;
        const pct = depensePrec > 0 ? (e.depense - depensePrec) / depensePrec : 0;
        return { e, pct, delta: e.depense - depensePrec };
      })
      .filter(({ pct, delta }) => pct >= SEUIL_HAUSSE_CATEGORIE && delta >= MONTANT_MIN_CATEGORIE)
      .sort((a, b) => b.pct - a.pct);
    if (hausseCorrelees.length >= 2) {
      const [a, b] = hausseCorrelees;
      categoriesDejaCitees.add(a.e.id);
      categoriesDejaCitees.add(b.e.id);
      ajouterSituationPonctuelle(situations, etatsAJour, {
        situationId: `correlation:${a.e.id}+${b.e.id}`,
        estActive: true,
        priorite: "evolutive",
        etatsPrecedents,
        aujourdHui,
        texte: `${a.e.nom} et ${b.e.nom} augmentent en même temps ce mois-ci (+${Math.round(a.pct * 100)}% et +${Math.round(b.pct * 100)}% vs ${MOIS_LABELS[moisPrec]}) — ensemble, ça représente environ ${Math.round(a.delta + b.delta)}€ de plus qu'habituellement.`,
        niveauConseil: "attention",
      });
    }
  }

  // === Tendance individuelle : hausse (arc complet, projection fin de mois) ===
  // RÈGLE : bloc entier sauté (pas juste estActive forcé à false) avant
  // SEUIL_JOUR_COMPARAISON_MOIS_PRECEDENT — situation "arc complet" suivie
  // dans etatsAJour (ajouterSituationSuivie) : passer estActive=false alors
  // qu'un mois précédent l'avait laissée CONFIRMÉE déclencherait à tort une
  // transition RESOLU ("c'est corrigé !"), alors que la vraie raison est
  // juste "pas encore assez de jours écoulés pour la recalculer" — sauter
  // l'appel entier laisse etatsAJour intact (recopié de etatsPrecedents en
  // tête de fonction), donc simplement "en pause" jusqu'au 10 du mois.
  if (comparaisonMoisPrecedentDisponible) {
    const candidatsTendance = enveloppesVariables
      .filter((e) => !categoriesDejaCitees.has(e.id))
      .map((e) => {
        const moyenne = moyenneRecenteCategorie(e.id);
        const rythmeJournalier = jourActuel > 0 ? e.depense / jourActuel : 0;
        const projection = rythmeJournalier * joursDansMois(moisActuel, anneeActuelle);
        const pctProjete = moyenne > 0 ? ((projection - moyenne) / moyenne) * 100 : 0;
        const situationId = `tendance:${e.id}`;
        const estActive = moyenne >= MONTANT_MIN_CATEGORIE && pctProjete >= SEUIL_HAUSSE_CATEGORIE * 100;
        return { e, pctProjete, estActive, situationId };
      })
      .filter(({ estActive, situationId }) => estActive || etatsPrecedents[situationId] !== undefined)
      .sort((a, b) => b.pctProjete - a.pctProjete);
    if (candidatsTendance.length > 0) {
      const { e, pctProjete, estActive, situationId } = candidatsTendance[0];
      categoriesDejaCitees.add(e.id);
      ajouterSituationSuivie(situations, etatsAJour, {
        situationId,
        estActive,
        valeurGravite: Math.max(0, pctProjete),
        vocabulaire: "observation",
        priorite: "evolutive",
        etatsPrecedents,
        aujourdHui,
        texteParEtat: (etat) => texteTendanceCategorie(e, pctProjete, etat),
        categorieId: e.id,
        pourcentagesAffiches: [Math.round(Math.max(0, pctProjete))],
        compteurResolutions,
      });
    }
  }

  // === Tendance individuelle : baisse (bonne nouvelle, ponctuelle) ============
  if (snapshotMoisPrecedent && comparaisonMoisPrecedentDisponible) {
    const candidatBaisse = enveloppesVariables
      .filter((e) => !categoriesDejaCitees.has(e.id))
      .map((e) => {
        const depensePrec = snapshotEnv(snapshotMoisPrecedent, e.id)?.depense ?? 0;
        const pct = depensePrec > 0 ? (depensePrec - e.depense) / depensePrec : 0;
        return { e, pct, delta: depensePrec - e.depense, depensePrec };
      })
      .filter(({ pct, depensePrec }) => pct >= SEUIL_HAUSSE_CATEGORIE && depensePrec >= MONTANT_MIN_CATEGORIE)
      .sort((a, b) => b.pct - a.pct)[0];
    if (candidatBaisse) {
      categoriesDejaCitees.add(candidatBaisse.e.id);
      ajouterSituationPonctuelle(situations, etatsAJour, {
        situationId: `baisse:${candidatBaisse.e.id}`,
        estActive: true,
        priorite: "positive",
        etatsPrecedents,
        aujourdHui,
        texte: `Vos dépenses ${candidatBaisse.e.nom} ont baissé de ${Math.round(candidatBaisse.pct * 100)}% par rapport à ${MOIS_LABELS[moisPrec]}, soit environ ${Math.round(candidatBaisse.delta)}€ économisés ce mois-ci.`,
        categorieId: candidatBaisse.e.id,
      });
    }
  }

  // === Dépense inhabituelle ponctuelle =========================================
  const sommeParCategorie = new Map<string, number>();
  const comptesParCategorie = new Map<string, number>();
  historiquesMois.slice(-NB_MOIS_MOYENNE_CATEGORIE).forEach((snap) => {
    snap.enveloppes.forEach((e) => {
      if (e.type === "Entrée") return;
      sommeParCategorie.set(e.id, (sommeParCategorie.get(e.id) ?? 0) + e.depense);
      comptesParCategorie.set(e.id, (comptesParCategorie.get(e.id) ?? 0) + 1);
    });
  });
  const candidatSpike = enveloppesVariables
    .filter((e) => !categoriesDejaCitees.has(e.id) && (comptesParCategorie.get(e.id) ?? 0) >= 2)
    .map((e) => ({
      e,
      moyenne: (sommeParCategorie.get(e.id) ?? 0) / (comptesParCategorie.get(e.id) ?? 1),
    }))
    .filter(({ moyenne }) => moyenne >= MONTANT_MIN_CATEGORIE)
    .filter(({ e, moyenne }) => e.depense > moyenne * SEUIL_SPIKE_PONCTUEL)
    .sort((a, b) => b.e.depense - b.moyenne - (a.e.depense - a.moyenne))[0];
  if (candidatSpike) {
    categoriesDejaCitees.add(candidatSpike.e.id);
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: `inhabituelle:${candidatSpike.e.id}`,
      estActive: true,
      priorite: "evolutive",
      etatsPrecedents,
      aujourdHui,
      texte: `${candidatSpike.e.nom} est nettement plus élevé ce mois-ci (${Math.round(candidatSpike.e.depense)}€ vs ${Math.round(candidatSpike.moyenne)}€ en moyenne sur ${NB_MOIS_MOYENNE_CATEGORIE} mois). Si c'est une dépense exceptionnelle, rien à faire — sinon, c'est un poste à surveiller le mois prochain.`,
      niveauConseil: "attention",
      categorieId: candidatSpike.e.id,
    });
  }

  // === Dépense récurrente détectée =============================================
  const candidatRecurrente = enveloppesVariables
    .filter((e) => !categoriesDejaCitees.has(e.id) && !e.recurrente)
    .map((e) => {
      const montants = historiquesMois
        .slice(-NB_MOIS_MOYENNE_CATEGORIE)
        .map((snap) => snapshotEnv(snap, e.id)?.depense)
        .filter((v): v is number => v !== undefined && v > 0);
      return { e, montants };
    })
    .filter(({ montants }) => montants.length >= NB_MOIS_MOYENNE_CATEGORIE)
    .filter(({ montants }) => {
      const moyenne = montants.reduce((a, b) => a + b, 0) / montants.length;
      return moyenne > 0 && montants.every((m) => Math.abs(m - moyenne) <= moyenne * TOLERANCE_RECURRENCE);
    })[0];
  if (candidatRecurrente) {
    categoriesDejaCitees.add(candidatRecurrente.e.id);
    const moyenne = Math.round(
      candidatRecurrente.montants.reduce((a, b) => a + b, 0) / candidatRecurrente.montants.length,
    );
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: `recurrente:${candidatRecurrente.e.id}`,
      estActive: true,
      priorite: "neutre",
      etatsPrecedents,
      aujourdHui,
      texte: `${candidatRecurrente.e.nom} revient à un montant très stable depuis ${candidatRecurrente.montants.length} mois (environ ${moyenne}€). Vous pourriez la marquer comme récurrente pour un suivi plus précis.`,
      categorieId: candidatRecurrente.e.id,
    });
  }

  // === Nouvelle catégorie apparue ==============================================
  const candidatNouvelle = enveloppesVariables
    .filter((e) => !categoriesDejaCitees.has(e.id) && e.depense >= MONTANT_MIN_CATEGORIE)
    .find(
      (e) =>
        historiquesMois.length > 0 &&
        !historiquesMois.some((snap) => (snapshotEnv(snap, e.id)?.depense ?? 0) > 0),
    );
  if (candidatNouvelle) {
    categoriesDejaCitees.add(candidatNouvelle.id);
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: `nouvelle:${candidatNouvelle.id}`,
      estActive: true,
      priorite: "neutre",
      etatsPrecedents,
      aujourdHui,
      texte: `${candidatNouvelle.nom} est une nouvelle catégorie ce mois-ci, avec déjà ${Math.round(candidatNouvelle.depense)}€ dépensés. Elle sera intégrée à vos comparaisons dès le mois prochain.`,
      categorieId: candidatNouvelle.id,
    });
  }

  // === Objectif atteint =========================================================
  const objectifNouvellementAtteint = objectifsAvecRythme.find(({ objectif, rythme }) => {
    if (!rythme.objectifAtteint || objectifsDejaCites.has(objectif.id)) return false;
    const precedent = snapshotMoisPrecedent?.objectifs.find((o) => o.id === objectif.id);
    return !precedent || precedent.actuel < objectif.cible;
  });
  if (objectifNouvellementAtteint) {
    objectifsDejaCites.add(objectifNouvellementAtteint.objectif.id);
    const { objectif } = objectifNouvellementAtteint;
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: `atteint:${objectif.id}`,
      estActive: true,
      priorite: "positive",
      etatsPrecedents,
      aujourdHui,
      texte: `Objectif atteint : ${objectif.nom} est à ${Math.round(objectif.actuel)}€ sur ${Math.round(objectif.cible)}€. Vous pourriez définir un nouvel objectif pour donner une direction à vos prochaines économies.`,
      objectifId: objectif.id,
    });
  }

  // === Objectif modifié (cible changée) =========================================
  if (snapshotMoisPrecedent) {
    const objectifModifie = objectifsAvecRythme.find(({ objectif }) => {
      if (objectifsDejaCites.has(objectif.id)) return false;
      const precedent = snapshotMoisPrecedent.objectifs.find((o) => o.id === objectif.id);
      return precedent !== undefined && precedent.cible !== objectif.cible;
    });
    if (objectifModifie) {
      objectifsDejaCites.add(objectifModifie.objectif.id);
      const { objectif, rythme } = objectifModifie;
      const precedent = snapshotMoisPrecedent.objectifs.find((o) => o.id === objectif.id)!;
      const sens = objectif.cible > precedent.cible ? "revue à la hausse" : "revue à la baisse";
      const trajectoire =
        rythme.moisRestants !== null ? `, environ ${rythme.moisRestants} mois restants à ce rythme` : "";
      ajouterSituationPonctuelle(situations, etatsAJour, {
        situationId: `modifie:${objectif.id}`,
        estActive: true,
        priorite: "neutre",
        etatsPrecedents,
        aujourdHui,
        texte: `La cible de ${objectif.nom} a été ${sens} (${Math.round(precedent.cible)}€ → ${Math.round(objectif.cible)}€). Nouvelle trajectoire recalculée${trajectoire}.`,
        objectifId: objectif.id,
      });
    }
  }

  // === Objectif proche de la cible ==============================================
  const objectifProche = objectifsAvecRythme
    .filter(
      ({ objectif, rythme }) =>
        !rythme.objectifAtteint &&
        rythme.pct >= SEUIL_OBJECTIF_PROCHE_MIN &&
        rythme.pct < SEUIL_OBJECTIF_PROCHE_MAX &&
        !objectifsDejaCites.has(objectif.id),
    )
    .sort((a, b) => b.rythme.pct - a.rythme.pct)[0];
  if (objectifProche) {
    objectifsDejaCites.add(objectifProche.objectif.id);
    const { objectif, rythme } = objectifProche;
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: `proche:${objectif.id}`,
      estActive: true,
      priorite: "positive",
      etatsPrecedents,
      aujourdHui,
      texte: `${objectif.nom} est à ${Math.round(rythme.pct)}% de sa cible — il ne manque que ${Math.round(objectif.cible - objectif.actuel)}€ pour l'atteindre.`,
      objectifId: objectif.id,
      pourcentagesAffiches: [Math.round(rythme.pct)],
    });
  }

  // === Marge disponible → versement sur un objectif ==============================
  const objectifPourVersement = objectifsAvecRythme
    .filter(({ objectif, rythme }) => !rythme.objectifAtteint && !objectifsDejaCites.has(objectif.id))
    .sort(
      (a, b) =>
        a.objectif.cible - a.objectif.actuel - (b.objectif.cible - b.objectif.actuel),
    )[0];
  if (objectifPourVersement && resteEstime > 0 && ratioReste > SEUIL_MARGE_VERSEMENT) {
    objectifsDejaCites.add(objectifPourVersement.objectif.id);
    const { objectif } = objectifPourVersement;
    const montant = Math.min(
      Math.round(resteEstime * 0.3),
      Math.round(objectif.cible - objectif.actuel),
    );
    const nouveauPct = Math.round(((objectif.actuel + montant) / objectif.cible) * 100);
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: `versement:${objectif.id}`,
      estActive: true,
      priorite: "positive",
      etatsPrecedents,
      aujourdHui,
      texte: `Vous avez ${Math.round(resteEstime)}€ de marge ce mois-ci. Un versement de ${montant}€ sur ${objectif.nom} l'amènerait à ${nouveauPct}% de la cible.`,
      objectifId: objectif.id,
      resteEstimeAffiche: resteEstime,
    });
  }

  // === Aucun objectif actif, marge positive répétée ===============================
  if (objectifsActifs.length === 0 && derniersMoisArchives.length >= 2) {
    const deuxDerniers = derniersMoisArchives.slice(-2);
    if (deuxDerniers.every((s) => margeSnapshot(s) > 0) && resteEstime > 0) {
      ajouterSituationPonctuelle(situations, etatsAJour, {
        situationId: "suggestion:objectif",
        estActive: true,
        priorite: "positive",
        etatsPrecedents,
        aujourdHui,
        texte: `Vous terminez régulièrement le mois avec de la marge. Envisagez de créer un objectif d'épargne — même un petit montant mensuel fait une vraie différence sur la durée.`,
      });
    }
  }

  // === Marge qui se dégrade (arc complet) ==========================================
  // RÈGLE : même raisonnement que "Tendance individuelle : hausse" plus
  // haut — bloc entier sauté (jamais estActive forcé à false) pour ne pas
  // déclencher à tort une RESOLU sur une situation "marge:global" déjà
  // CONFIRMÉE simplement parce qu'on ne peut pas encore comparer au mois
  // précédent.
  if (
    resteEstimePrecedent !== null &&
    disponibleEffectif > 0 &&
    comparaisonMoisPrecedentDisponible
  ) {
    const ratioRestePrecedent = resteEstimePrecedent / disponibleEffectif;
    const degradation = ratioRestePrecedent - ratioReste;
    ajouterSituationSuivie(situations, etatsAJour, {
      situationId: "marge:global",
      estActive: degradation >= SEUIL_MARGE_DEGRADATION,
      valeurGravite: Math.max(0, degradation),
      vocabulaire: "observation",
      priorite: "evolutive",
      etatsPrecedents,
      aujourdHui,
      texteParEtat: (etat) => texteMargeEvolution(resteEstime, resteEstimePrecedent, moisPrec, etat),
      niveauConseil: (etat) => (etat === "CONFIRME" ? "alerte" : niveauConseilParDefaut(etat)),
      resteEstimeAffiche: resteEstime,
      compteurResolutions,
    });
  }

  // === Comportement global : tendance sur plusieurs mois ============================
  // RÈGLE : le sous-cas "comportement:degradation" est un arc complet suivi
  // (ajouterSituationSuivie) — même raisonnement de bloc entier sauté que
  // "Marge qui se dégrade" ci-dessus. resteEstime (mois en cours, encore
  // partiel) intervient dans enAmelioration/enDegradation/retour_normale,
  // donc comparaisonMoisPrecedentDisponible gate le bloc en entier plutôt
  // que chaque branche séparément.
  if (
    derniersMoisArchives.length === NB_MOIS_MOYENNE_CATEGORIE &&
    comparaisonMoisPrecedentDisponible
  ) {
    const marges = derniersMoisArchives.map(margeSnapshot);
    const enAmelioration =
      marges[0] < marges[1] && marges[1] < marges[2] && resteEstime >= marges[2];
    const enDegradation =
      marges[0] > marges[1] && marges[1] > marges[2] && resteEstime <= marges[2];
    if (enAmelioration) {
      ajouterSituationPonctuelle(situations, etatsAJour, {
        situationId: "comportement:amelioration",
        estActive: true,
        priorite: "positive",
        etatsPrecedents,
        aujourdHui,
        texte: `Votre marge de fin de mois s'améliore depuis ${NB_MOIS_MOYENNE_CATEGORIE} mois consécutifs. Une vraie tendance de fond, pas un hasard ponctuel.`,
      });
    } else {
      ajouterSituationSuivie(situations, etatsAJour, {
        situationId: "comportement:degradation",
        estActive: enDegradation,
        valeurGravite: enDegradation ? Math.max(1, marges[0] - marges[2]) : 0,
        vocabulaire: "observation",
        priorite: "evolutive",
        etatsPrecedents,
        aujourdHui,
        texteParEtat: (etat) => texteComportementDegradation(NB_MOIS_MOYENNE_CATEGORIE, etat),
        compteurResolutions,
      });
      if (!enDegradation) {
        const dernierMois = derniersMoisArchives[derniersMoisArchives.length - 1];
        const margeDernierMois = margeSnapshot(dernierMois);
        const moyenneAnterieure =
          derniersMoisArchives.slice(0, -1).reduce((acc, s) => acc + margeSnapshot(s), 0) /
          Math.max(1, derniersMoisArchives.length - 1);
        if (
          derniersMoisArchives.length > 1 &&
          margeDernierMois < 0 &&
          moyenneAnterieure > 0 &&
          resteEstime >= moyenneAnterieure * 0.8
        ) {
          ajouterSituationPonctuelle(situations, etatsAJour, {
            situationId: "comportement:retour_normale",
            estActive: true,
            priorite: "positive",
            etatsPrecedents,
            aujourdHui,
            texte: `Après un mois plus difficile en ${MOIS_LABELS[dernierMois.mois]}, vous êtes revenu à un rythme proche de votre habitude ce mois-ci.`,
          });
        }
      }
    }
  }

  // === Meilleur mois depuis X mois (comparaison à date égale) =======================
  let meilleurMoisDepuis: number | null = null;
  const moisRecentsMeilleur = historiquesMois.slice(-NB_MOIS_MEILLEUR_MOIS);
  if (moisRecentsMeilleur.length >= 2 && jourActuel >= SEUIL_JOUR_MIN_MEILLEUR_MOIS) {
    let nbBattus = 0;
    for (const snap of [...moisRecentsMeilleur].reverse()) {
      const jourAligne = Math.min(jourActuel, joursDansMois(snap.mois, snap.annee));
      const depenseSnapAuJour = depenseCumuleeAuJour(
        transactions,
        historiquePaiements,
        snap.mois,
        snap.annee,
        jourAligne,
      );
      if (totalDepenses < depenseSnapAuJour) nbBattus += 1;
      else break;
    }
    if (nbBattus >= 2) meilleurMoisDepuis = nbBattus;
  }
  if (meilleurMoisDepuis !== null) {
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: "meilleurmois:global",
      estActive: true,
      priorite: "positive",
      etatsPrecedents,
      aujourdHui,
      texte: `Vous êtes en train de réaliser votre meilleur mois depuis ${meilleurMoisDepuis} mois. Continuez comme ça.`,
    });
  }

  // === Projection de fin de mois =====================================================
  if (resteEstime >= 0 && joursRestantsDansMois > 0) {
    const allocationJour = resteEstime / joursRestantsDansMois;
    let comparaison = "";
    if (resteEstimePrecedent !== null) {
      const joursMoisPrec = joursDansMois(moisPrec, anneePrec);
      const allocationJourPrec = joursMoisPrec > 0 ? resteEstimePrecedent / joursMoisPrec : 0;
      comparaison =
        allocationJourPrec !== 0
          ? ` C'est ${allocationJour >= allocationJourPrec ? "mieux" : "un peu moins bien"} qu'en ${MOIS_LABELS[moisPrec]} en moyenne par jour.`
          : "";
    }
    ajouterSituationPonctuelle(situations, etatsAJour, {
      situationId: "projection:finmois",
      estActive: true,
      priorite: "positive",
      etatsPrecedents,
      aujourdHui,
      texte: `Si vous continuez à ce rythme, vous devriez terminer le mois avec environ ${Math.round(resteEstime)}€ de marge — soit ${Math.round(allocationJour)}€/jour disponibles jusqu'à la fin du mois.${comparaison}`,
      resteEstimeAffiche: resteEstime,
    });
  }

  // === Replis : données insuffisantes / tout va bien (non suivis dans le temps) =====
  const totalTransactionsHistorique = transactions.length + historiquePaiements.length;
  if (situations.length === 0 && totalDepenses === 0 && totalTransactionsHistorique === 0) {
    situations.push({
      cle: "repli",
      priorite: "neutre",
      etat: null,
      texteParEtat: () =>
        "Nous avons besoin de davantage de données avant d'identifier une tendance fiable. Enregistrez vos dépenses au fil de l'eau pour des conseils personnalisés.",
      niveauConseil: () => "bon",
    });
  }
  if (situations.length === 0) {
    situations.push({
      cle: "repli",
      priorite: "neutre",
      etat: null,
      texteParEtat: () => "Votre mois est bien maîtrisé, rien de particulier à corriger.",
      niveauConseil: () => "bon",
    });
  }

  // RÈGLE À NE JAMAIS CASSER — NETTOYAGE IMMÉDIAT DES CATÉGORIES DISPARUES :
  // contrairement à la purge par ancienneté juste en dessous, celle-ci ne
  // peut PAS attendre 30 jours. Les familles liées à une catégorie
  // (situationId = "budget:<id>" ou "tendance:<id>") gardent souvent
  // `estActive` vrai en interne (basé sur le dernier depense/budget connu
  // de la ligne), donc `dateDerniereMiseAJour` continue d'être rafraîchie
  // chaque jour tant que la situation "semble" active — la purge par
  // ancienneté ne se déclenche alors JAMAIS. Sans ce nettoyage, une
  // catégorie supprimée (ou une catégorie ponctuelle expirée, toujours
  // présente dans `enveloppes` mais inactive ce mois-ci) reste indéfiniment
  // dans le cache : validerConseil (plus bas dans genererConseils) rejette
  // alors le même conseil à CHAQUE appel, produisant le warning "catégorie
  // ... inactive ou introuvable ce mois-ci" en boucle. On supprime donc ici
  // toute situation de catégorie dont l'id ne correspond plus à une
  // enveloppe active ce mois-ci — même test que validerConseil, appliqué en
  // amont plutôt que rejeté en aval à chaque rendu.
  const FAMILLES_CATEGORIE = ["budget", "tendance"];
  Object.keys(etatsAJour).forEach((situationId) => {
    const [famille, idCategorie] = situationId.split(":");
    if (!FAMILLES_CATEGORIE.includes(famille)) return;
    const enveloppe = enveloppes.find((e) => e.id === idCategorie);
    if (!enveloppe || !estCategorieActiveCeMois(enveloppe, anneeActuelle, moisActuel)) {
      delete etatsAJour[situationId];
    }
  });

  // Purge des entrées jamais retouchées depuis longtemps (ex: catégorie
  // supprimée entre-temps) — hygiène, évite une croissance illimitée du
  // stockage local.
  const seuilOubli = new Date();
  seuilOubli.setDate(seuilOubli.getDate() - 30);
  const seuilOubliISO = journeeISO(seuilOubli);
  Object.keys(etatsAJour).forEach((id) => {
    if (etatsAJour[id].dateDerniereMiseAJour < seuilOubliISO) delete etatsAJour[id];
  });

  return {
    situations,
    etatsAJour,
    nouvellesResolutions: compteurResolutions.count,
    objectifsAvecRythme,
  };
}

// --- Garde-fou anti-incohérence -------------------------------------------
//
// RÈGLE À NE JAMAIS CASSER : validerConseil est le dernier filet avant
// affichage. Un conseil ne doit JAMAIS montrer à l'utilisateur un chiffre
// qui ne correspond plus à la réalité (catégorie supprimée/expirée entre la
// détection et l'affichage, objectif clôturé, pourcentage aberrant issu
// d'une régression de calcul...). En cas de doute, on retire silencieusement
// le conseil plutôt que de risquer d'afficher une incohérence — jamais de
// crash, jamais d'exception qui remonte à l'appelant.

type ConseilValidable = {
  categorieId?: string;
  objectifId?: string;
  resteEstimeMentionne?: number;
  pourcentages?: number[];
};

export type ParamsValidationConseil = {
  resteEstime: number;
  enveloppes: Enveloppe[];
  // Type volontairement allégé (juste l'id) plutôt que ObjectifAvecRythme
  // complet — validerConseil ne lit jamais rien d'autre que .objectif.id,
  // et ça permet à d'autres zones (utils/tendancesPeriode.ts,
  // utils/bilanVista.ts) de valider sans avoir à reconstruire un
  // RythmeObjectif complet juste pour satisfaire ce paramètre.
  objectifsAvecRythme: { objectif: { id: string } }[];
  moisActuel: number;
  anneeActuelle: number;
};

export function validerConseil(
  conseil: ConseilValidable,
  params: ParamsValidationConseil,
): boolean {
  try {
    if (conseil.categorieId !== undefined) {
      const enveloppe = params.enveloppes.find((e) => e.id === conseil.categorieId);
      if (!enveloppe || !estCategorieActiveCeMois(enveloppe, params.anneeActuelle, params.moisActuel)) {
        console.warn(
          `[conseils] Conseil retiré : catégorie "${conseil.categorieId}" inactive ou introuvable ce mois-ci.`,
        );
        return false;
      }
    }

    if (conseil.objectifId !== undefined) {
      const existe = params.objectifsAvecRythme.some((o) => o.objectif.id === conseil.objectifId);
      if (!existe) {
        console.warn(
          `[conseils] Conseil retiré : objectif "${conseil.objectifId}" introuvable dans objectifsAvecRythme.`,
        );
        return false;
      }
    }

    if (conseil.resteEstimeMentionne !== undefined) {
      if (!Number.isFinite(conseil.resteEstimeMentionne) || !Number.isFinite(params.resteEstime)) {
        console.warn("[conseils] Conseil retiré : reste estimé non numérique (division par zéro suspectée).");
        return false;
      }
      if (Math.abs(conseil.resteEstimeMentionne - params.resteEstime) > 5) {
        console.warn(
          `[conseils] Conseil retiré : reste estimé incohérent (${conseil.resteEstimeMentionne}€ affiché vs ${params.resteEstime}€ attendu).`,
        );
        return false;
      }
    }

    if (conseil.pourcentages) {
      const invalide = conseil.pourcentages.some(
        (p) => !Number.isFinite(p) || p < 0 || p > 300,
      );
      if (invalide) {
        console.warn(
          `[conseils] Conseil retiré : pourcentage hors plage 0-300% (${JSON.stringify(conseil.pourcentages)}).`,
        );
        return false;
      }
    }

    return true;
  } catch (err) {
    console.warn("[conseils] validerConseil a levé une exception, conseil retiré par sécurité.", err);
    return false;
  }
}

// Orchestre detecterSituations → genererTexteConseil, applique l'ordre de
// priorité métier (critique > évolutive > positive > neutre) et dédoublonne
// par `cle` en dernier recours. Retourne à la fois les conseils à afficher
// ET la map d'états à jour — c'est à l'appelant (composant React) de la
// persister (chargerEtatsInsights/sauvegarderEtatsInsights), cette fonction
// reste pure et synchrone.
export function genererConseils(params: {
  enveloppes: Enveloppe[];
  objectifs: Objectif[];
  historiquesMois: SnapshotMois[];
  transactions: Transaction[];
  historiquePaiements: PaiementHistorique[];
  epargneMois: number;
  resteEstime: number;
  resteEstimePrecedent: number | null;
  disponibleEffectif: number;
  moisActuel: number;
  anneeActuelle: number;
  maxConseils?: number;
  etatsPrecedents: EtatsInsightsMap;
  // RÈGLE À NE JAMAIS CASSER : anti-répétition inter-écrans — clés de
  // situations déjà affichées ailleurs dans la session (ex: "Nos conseils"
  // sur Aperçu) à ne pas montrer une seconde fois ici (ex: "Vista" sur Ton
  // bilan). Voir utils/situationsSession.ts, mémoire de session
  // uniquement (jamais persistée). Le repli générique ("repli", "tout va
  // bien"/"données insuffisantes") est volontairement épargné par ce
  // filtre — ce n'est pas un insight qui "se répète", c'est un état vide
  // légitime sur chaque écran qui n'a rien à montrer.
  situationsExclues?: Set<string>;
}): { conseils: Conseil[]; etatsAJour: EtatsInsightsMap; nouvellesResolutions: number } {
  const { maxConseils = 3, etatsPrecedents, situationsExclues } = params;

  const { situations, etatsAJour, nouvellesResolutions, objectifsAvecRythme } = detecterSituations(
    params,
    etatsPrecedents,
  );

  const prioriteScore: Record<PrioriteSituation, number> = {
    critique: 0,
    evolutive: 1,
    positive: 2,
    neutre: 3,
  };

  const clesVues = new Set<string>();
  const situationsUniques = situations
    .filter((s) => {
      if (clesVues.has(s.cle)) return false;
      clesVues.add(s.cle);
      return true;
    })
    .sort((a, b) => prioriteScore[a.priorite] - prioriteScore[b.priorite])
    .filter((s) =>
      validerConseil(
        {
          categorieId: s.categorieId,
          objectifId: s.objectifId,
          resteEstimeMentionne: s.resteEstimeAffiche,
          pourcentages: s.pourcentagesAffiches,
        },
        {
          resteEstime: params.resteEstime,
          enveloppes: params.enveloppes,
          objectifsAvecRythme,
          moisActuel: params.moisActuel,
          anneeActuelle: params.anneeActuelle,
        },
      ),
    )
    .filter((s) => s.cle === "repli" || !situationsExclues?.has(s.cle));

  const conseils: Conseil[] = situationsUniques.slice(0, maxConseils).map((s) => {
    const etat = s.etat ?? "NOUVEAU";
    return {
      texte: genererTexteConseil(s, etat),
      niveau: s.niveauConseil(etat),
      etat: s.etat,
      categorieId: s.categorieId,
      objectifId: s.objectifId,
      cle: s.cle,
    };
  });

  return { conseils, etatsAJour, nouvellesResolutions };
}

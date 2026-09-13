// RÈGLE À NE JAMAIS CASSER — require() DANS UN try/catch, JAMAIS UN IMPORT
// STATIQUE : react-native-google-mobile-ads est un module natif qui
// nécessite un rebuild EAS (cf. RÈGLE dans InsightVerrouille.tsx) — sur le
// dev client actuel (pas rebuild), le module natif RNGoogleMobileAdsModule
// est absent, et l'évaluation du module JS de la librairie plante
// immédiatement à l'IMPORT. Un `import { ... } from
// "react-native-google-mobile-ads"` statique est hissé et évalué AU
// CHARGEMENT DU BUNDLE, hors de portée de tout try/catch — seul un
// require() explicite, lui un appel de fonction normal exécuté à l'endroit
// où il est écrit, peut être intercepté.
//
// RÈGLE À NE JAMAIS CASSER — FICHIER SÉPARÉ EN PAIRE .ts/.web.ts POUR LE
// WEB, LE try/catch NE SUFFIT PAS : ce try/catch protège le RUNTIME natif
// (dev client sans rebuild EAS) mais PAS la résolution STATIQUE du bundler
// web — react-native-google-mobile-ads importe en interne des internals
// React Native (codegenNativeComponent) non supportés sur web, qui font
// échouer le BUNDLING avant même l'exécution de ce fichier. Metro résout
// automatiquement adMobModule.web.ts (jamais ce fichier-ci) pour toute
// build web, qui ne référence JAMAIS le package — c'est cette paire de
// fichiers, pas le try/catch, qui protège le web. Ne jamais fusionner ces
// deux fichiers en un seul avec un `if (Platform.OS === "web")` : Metro
// analyse les require() de façon statique, un tel garde runtime ne
// l'empêche pas de tenter (et d'échouer) la résolution du module pour le
// web.
//
// RÈGLE À NE JAMAIS CASSER — RÉINTÉGRATION DU 2026-09-13, DEMANDE EXPLICITE
// MALGRÉ UN HISTORIQUE DE CRASH CONNU : ce SDK avait été entièrement retiré
// le 2026-09-01 (commit 899a64a) suite à un crash natif SILENCIEUX au
// démarrage en production TestFlight, dont la cause exacte n'a jamais été
// confirmée — NSUserTrackingUsageDescription seul (userTrackingUsageDescription
// dans app.json) avait déjà été essayé à l'époque et n'avait PAS suffi à le
// résoudre. Un crash "au démarrage" peut survenir dès l'initialisation
// native du SDK par le pont Expo config-plugin, INDÉPENDAMMENT de
// ADMOB_ACTIF (utils/premium.ts) — qui ne gouverne que la logique JS
// (require()/appels), jamais l'initialisation native au lancement de
// l'app. Réintégré ici sur demande explicite de l'utilisateur, qui a
// confirmé vouloir procéder malgré ce risque documenté et gérer lui-même
// la validation sur un vrai build EAS avant toute diffusion large — jamais
// une décision prise seul par une prochaine session sans revalider ce
// contexte.
let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
let TestIds: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admob = require("react-native-google-mobile-ads");
  RewardedAd = admob.RewardedAd;
  RewardedAdEventType = admob.RewardedAdEventType;
  AdEventType = admob.AdEventType;
  TestIds = admob.TestIds;
} catch {
  // AdMob non disponible (dev client sans rebuild natif EAS) — les 4 exports
  // restent `null`, InsightVerrouille retombe systématiquement sur l'Alert
  // simulé, jamais de crash.
}

// RÈGLE À NE JAMAIS CASSER — CE try/catch NE SUFFIT PAS À LUI SEUL : il ne
// protège que le require() du package lui-même. `RewardedAd` étant un objet
// JS valide dès que le require() réussit, un appel ultérieur comme
// `RewardedAd.createForAdRequest(...)` peut ENCORE planter avec "Module
// XXX not found" si le module natif n'est pas linké dans ce build (dev
// client sans rebuild EAS) — cette erreur survient à un point du code hors
// de portée de CE try/catch. Voir la RÈGLE dans InsightVerrouille.tsx : le
// try/catch qui entoure createForAdRequest()/load() dans son useEffect est
// tout aussi indispensable, pas redondant.
export { RewardedAd, RewardedAdEventType, AdEventType, TestIds };

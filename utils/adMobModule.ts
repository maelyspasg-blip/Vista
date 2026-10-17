// [Les RÈGLE ci-dessous, jusqu'au bloc P079, décrivent le module tel qu'il
// doit être RESTAURÉ le jour où le SDK est réintégré — elles ne
// s'appliquent pas à la version vide actuelle.]
//
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
// RÈGLE À NE JAMAIS CASSER (à la réactivation) — CE try/catch NE SUFFIT
// PAS À LUI SEUL : il ne protège que le require() du package lui-même.
// `RewardedAd` étant un objet JS valide dès que le require() réussit, un
// appel ultérieur comme `RewardedAd.createForAdRequest(...)` peut ENCORE
// planter avec "Module XXX not found" si le module natif n'est pas linké
// dans ce build (dev client sans rebuild EAS) — cette erreur survient à un
// point du code hors de portée de CE try/catch. Voir la RÈGLE dans
// InsightVerrouille.tsx : le try/catch qui entoure createForAdRequest()/
// load() dans son useEffect est tout aussi indispensable, pas redondant.
//
// RÈGLE À NE JAMAIS CASSER — SDK ADMOB RETIRÉ DU BUILD (P079, 2026-10-17,
// drop V1 sans publicité) : ce module ne charge PLUS le package. Le SDK
// natif est exclu de l'autolinking (package.json → expo.autolinking.exclude)
// et son plugin retiré d'app.json : un require() ici tenterait d'atteindre
// un module natif absent du binaire. Les 4 exports restent `null` (comme
// adMobModule.web.ts) — useDeblocagePub (InsightVerrouille.tsx) sort avant
// tout appel au SDK tant que ADMOB_ACTIF est false ou RewardedAd null.
//
// PROCÉDURE DE RÉACTIVATION DES PUBS (dans cet ordre) :
//   1. package.json : retirer "react-native-google-mobile-ads" de
//      expo.autolinking.exclude.
//   2. app.json : remettre le plugin tel qu'il était avant P079 —
//      source exacte : `git show 5eab7e0:app.json` (androidAppId, iosAppId,
//      userTrackingUsageDescription).
//   3. Ce fichier : restaurer le bloc try/require() — source exacte :
//      `git show 5eab7e0:utils/adMobModule.ts`.
//   4. utils/premium.ts : ADMOB_ACTIF = true — remet aussi les cadenas
//      (contenuLibreSansPub() redevient faux).
//   5. Build EAS "preview" testé sur un appareil physique AVANT tout build
//      "production" (crash natif au démarrage du 2026-09-01 jamais
//      diagnostiqué, cf. RÈGLE plus haut et utils/premium.ts).
//   6. Redéclarer publicité et identifiant de l'appareil dans App Store
//      Connect (confidentialité) et dans la Data safety du Play Store.
const RewardedAd: any = null;
const RewardedAdEventType: any = null;
const AdEventType: any = null;
const TestIds: any = null;

export { RewardedAd, RewardedAdEventType, AdEventType, TestIds };

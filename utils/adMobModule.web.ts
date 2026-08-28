// RÈGLE À NE JAMAIS CASSER — NE JAMAIS require/import
// "react-native-google-mobile-ads" DANS CE FICHIER : c'est la moitié .web
// de la paire adMobModule.ts/adMobModule.web.ts — Metro résout ce fichier
// pour toute build web (jamais adMobModule.ts), donc le package natif
// n'est ni référencé ni résolu par le bundle web. react-native-google-
// mobile-ads importe en interne des internals React Native
// (codegenNativeComponent) non supportés sur web, qui font échouer le
// bundling avant même l'exécution de tout try/catch — voir la RÈGLE
// détaillée dans adMobModule.ts pour le contexte complet.
export const RewardedAd: any = null;
export const RewardedAdEventType: any = null;
export const AdEventType: any = null;
export const TestIds: any = null;

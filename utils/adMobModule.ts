// RÈGLE À NE JAMAIS CASSER — AdMob DÉSACTIVÉ EN ENTIER POUR CETTE BÊTA,
// AUCUN require() TENTÉ : décision du 2026-09-01 suite à un crash natif
// silencieux au démarrage en production TestFlight, la correction
// NSUserTrackingUsageDescription seule n'ayant pas suffi à le résoudre. Le
// SDK react-native-google-mobile-ads n'est PLUS référencé du tout ici (ni
// require(), ni import) tant que la cause exacte du crash n'est pas
// confirmée — priorité à une bêta qui démarre. Les 4 exports restent
// `null`, exactement comme sur le web (cf. adMobModule.web.ts) :
// InsightVerrouille retombe systématiquement sur l'Alert simulé, sans
// jamais toucher au pont natif. Pour réintégrer AdMob proprement plus tard :
// restaurer le plugin "react-native-google-mobile-ads" dans app.json (cf.
// historique git) ET le require() protégé par try/catch qui existait ici
// avant cette désactivation — jamais l'un sans l'autre.
export const RewardedAd: any = null;
export const RewardedAdEventType: any = null;
export const AdEventType: any = null;
export const TestIds: any = null;

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — seul AsyncStorage (stockage LOCAL à
// l'appareil, jamais synchronisé en base) est utilisé ici, cf. RÈGLE
// juste en dessous.
//
// RÈGLE À NE JAMAIS CASSER — METTRE À false AVANT LA PUBLICATION APP STORE
// OFFICIELLE : tant que true, tout NON-ADMIN (y compris les testeurs
// TestFlight externes, qui n'ont ni objStore.isAdmin ni accès aux toggles
// admin) a accès à 100% des fonctionnalités Premium sans restriction — voir
// estComptePremium ci-dessous. Ne court-circuite PLUS le cas admin : un
// admin garde le contrôle total (y compris "Simuler compte non-premium")
// même pendant la période TestFlight, cf. RÈGLE détaillée sur
// estComptePremium. Aucun mécanisme de rappel automatique ne repasse ce
// flag à false : une vérification manuelle avant soumission App Store est
// nécessaire.
export const TESTFLIGHT_MODE = true;

// RÈGLE À NE JAMAIS CASSER — FONDATIONS ESPACE PARTAGÉ (renommé depuis
// MODE_COUPLE_ACTIF) : tant que `false`, aucun écran de l'app ne doit
// rendre la section "Espace partagé" ni aucun élément d'UI/modale qui en
// dépend — cf. site d'appel dans app/profil.tsx. Le schéma Supabase
// (espaces_partages, membres_espace, enveloppes.attribue_a,
// transactions.attribue_a — cf.
// supabase/migrations/20260830120000_mode_couple_fondations.sql) et
// utils/espacePartage.ts existent déjà et sont désormais appelés depuis la
// modale de app/profil.tsx, mais UNIQUEMENT depuis du JSX gardé par ce
// flag.
//
// RÈGLE : passé à `true` le 2026-09-13 — DEMANDE EXPLICITE, "pour les
// tests" (diagnostic de l'écran onboarding "Vista à deux", qui ne peut
// jamais s'afficher tant que ce flag est `false`). Active désormais TOUTE
// la fonctionnalité Espace partagé dans l'app entière (pas seulement
// l'onboarding) : section Profil, Planning/Budget/Stats/Aperçu en vue
// partagée, etc. — jamais un flag à portée limitée à un seul écran.
// REPASSER À `false` AVANT TOUTE BUILD DE PRODUCTION tant que la V1 n'est
// pas prête.
//
// RÈGLE — CORRECTIF DU 2026-09-13 (revue sécurité) : l'ancien commentaire
// ici affirmait que "créer un espace n'insère pas encore de ligne
// espaces_partages" — FAUX au vu du code actuel : creerEspacePartage()
// (utils/espacePartage.ts) appelle bien le RPC creer_espace_partage()
// (security definer, supabase/migrations/
// 20260831130000_creer_espace_partage_reutilise_en_attente.sql), qui
// insère dans espaces_partages ET membres_espace. Soit ce commentaire
// était déjà obsolète (jamais mis à jour après l'implémentation du RPC),
// soit — cet environnement n'a pas d'accès CLI Supabase pour vérifier —
// cette migration n'a jamais été appliquée manuellement dans le dashboard
// de production et la base tourne encore sur une version antérieure du
// RPC. À VÉRIFIER dans le dashboard Supabase (SQL Editor) avant de
// considérer un test du parcours "créer un espace" comme concluant.
export const ESPACE_PARTAGE_ACTIF = true;

// RÈGLE À NE JAMAIS CASSER — REFONTE MONÉTISATION V1 (2026-09-12, demande
// explicite) : Premium est retiré du modèle économique de la V1, remplacé
// par 3 emplacements de pub récompensée (session-scoped) — cf. RÈGLE sur
// chacun à son site : Ton bilan (verrou consolidé, app/(tabs)/analytics.tsx),
// Insights Vista dans Aperçu (app/(tabs)/index.tsx), période au-delà d'1 mois
// dans Stats (app/(tabs)/analytics.tsx). Le code Premium existant
// (estComptePremium ci-dessous, PremiumContext, PremiumVerrou, la section
// "PASSER PREMIUM" de profil.tsx, les 2 toggles admin "Simuler
// Premium"/"Simuler compte non-premium"...) reste EN PLACE, jamais
// supprimé — seulement masqué derrière ce flag, pour permettre une
// réactivation rapide si le modèle économique change à nouveau. Un compte
// admin voit toujours tout sans restriction, quel que soit ce flag (cf.
// RÈGLE existante sur estComptePremium — jamais un besoin de vérifier
// PREMIUM_ACTIF en plus de isAdmin dans un site déjà gardé par isAdmin).
export const PREMIUM_ACTIF = false;

// RÈGLE : point d'entrée UNIQUE pour savoir si l'UI Premium (badges, section
// "PASSER PREMIUM", mentions "Premium"/"Abonnement") doit être visible —
// jamais PREMIUM_ACTIF directement dans un site gardé, même raison que
// estEspacePartageActif ci-dessus (un compte admin doit toujours voir cette
// UI, y compris pour les outils de simulation, même si elle est masquée
// pour tout le monde d'autre).
export function premiumUIVisible(isAdmin: boolean): boolean {
  return PREMIUM_ACTIF || isAdmin;
}

// RÈGLE À NE JAMAIS CASSER — AdMob RÉINTÉGRÉ LE 2026-09-13 (demande
// explicite, malgré l'historique de crash du 2026-09-01 — cf. RÈGLE
// détaillée dans utils/adMobModule.ts, confirmé par l'utilisateur qui gère
// ce risque lui-même). Package + plugin natif + require() protégé
// restaurés (utils/adMobModule.ts) — passé à `true` ici pour que
// useDeblocagePub (app/InsightVerrouille.tsx) tente réellement le SDK.
//
// RÈGLE À NE JAMAIS CASSER — CE FLAG SEUL NE SUFFIT PAS À VOIR DE VRAIES
// PUBS TANT QUE TESTFLIGHT_MODE=true : useDeblocagePub court-circuite sur
// `TESTFLIGHT_MODE || !ADMOB_ACTIF || ...` — TESTFLIGHT_MODE est vérifié
// EN PREMIER et prioritaire, donc tant qu'il reste `true` (bêta en cours),
// la pub simulée (Alert) continue de s'afficher, EXACTEMENT comme avant ce
// changement. C'est voulu : ADMOB_ACTIF=true prépare le terrain (build EAS
// avec le SDK linké, prêt à être testé) sans changer le comportement
// visible pendant la bêta — les vraies pubs ne se déclencheront qu'au jour
// où TESTFLIGHT_MODE repassera à `false` pour la sortie publique. Ne
// jamais interpréter "aucune pub réelle visible en bêta" comme un signe
// que ce flag n'a pas d'effet ou que la réintégration a échoué.
export const ADMOB_ACTIF = true;

// RÈGLE À NE JAMAIS CASSER — SEUL POINT D'ENTRÉE POUR SAVOIR SI L'ESPACE
// PARTAGÉ DOIT ÊTRE VISIBLE, JAMAIS ESPACE_PARTAGE_ACTIF DIRECTEMENT DANS UN
// SITE GARDÉ : décision du 2026-09-05 — un compte admin doit pouvoir tester
// la fonctionnalité même pendant la bêta (ESPACE_PARTAGE_ACTIF=false), sans
// jamais l'exposer aux utilisateurs bêta non-admin. `ESPACE_PARTAGE_ACTIF`
// lui-même reste une constante évaluée au chargement du module, bien avant
// qu'un utilisateur (et donc isAdmin) ne soit connu — c'est pour ça qu'il
// ne peut pas dépendre de isAdmin directement (un `const X = isAdmin ? ... `
// au niveau module n'aurait aucune valeur d'isAdmin à lire). Cette fonction
// est donc TOUJOURS appelée avec le isAdmin déjà résolu de l'utilisateur
// courant, jamais l'inverse.
export function estEspacePartageActif(isAdmin: boolean): boolean {
  return ESPACE_PARTAGE_ACTIF || isAdmin;
}

// RÈGLE : Ad Unit ID de la pub récompensée AdMob — sélectionné une seule
// fois ici selon la plateforme (Platform.OS), jamais dupliqué ailleurs dans
// le code (InsightVerrouille.tsx l'importe directement).
//
// RÈGLE À NE JAMAIS CASSER — BASCULÉ SUR LES ID DE TEST GOOGLE LE
// 2026-09-13, DEMANDE EXPLICITE (réintégration AdMob après le crash du
// 2026-09-01, cf. RÈGLE dans utils/adMobModule.ts) : les vrais ID de
// production de ce projet (compte ca-app-pub-4645298475525932, cf.
// historique git — commit 899a64a et les 2 valeurs juste en dessous en
// commentaire) sont DIFFÉRENTS des ID donnés dans cette demande
// (ca-app-pub-3940256099942544, les ID PUBLICS de test documentés par
// Google eux-mêmes, communs à tous les développeurs, jamais liés à un
// compte AdMob précis). Utiliser les ID de test ici est délibéré et plus
// sûr le temps de valider que le crash de 2026-09-01 ne se reproduit pas —
// aucune requête publicitaire réelle, aucun revenu, aucun risque de
// violation de policy AdMob pendant cette phase de validation. Anciens ID
// réels (production) à restaurer une fois la stabilité confirmée sur un
// vrai build EAS :
//   ios: "ca-app-pub-4645298475525932/3811187805"
//   android: "ca-app-pub-4645298475525932/6067589553"
export const AD_UNIT_ID_REWARDED =
  Platform.OS === "ios"
    ? "ca-app-pub-3940256099942544/1712485313"
    : "ca-app-pub-3940256099942544/5224354917";
// RÈGLE À NE JAMAIS CASSER : simulation locale en attendant l'intégration
// RevenueCat — ce flag ne représente aucun abonnement réel, il ne doit
// jamais être positionné à true ailleurs que via le toggle "Simuler
// Premium" de la section admin de Profil (lui-même déjà réservé à
// objStore.isAdmin). Le jour où RevenueCat sera branché, ce fichier devient
// la seule chose à remplacer par une vraie vérification d'abonnement actif
// — usePremium()/PremiumContext n'ont pas besoin de changer.
const CLE_PREMIUM_SIMULE = "vista_premium_simule";

export async function chargerPremiumSimule(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLE_PREMIUM_SIMULE)) === "1";
  } catch {
    return false;
  }
}

export async function sauvegarderPremiumSimule(actif: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_PREMIUM_SIMULE, actif ? "1" : "0");
  } catch {
    // Best-effort : une erreur d'écriture ne doit jamais empêcher l'usage
    // de l'app, juste faire perdre le réglage de simulation.
  }
}

// RÈGLE À NE JAMAIS CASSER — ISOLATION ENTRE COMPTES : CLE_PREMIUM_SIMULE
// n'est PAS namespacée par userId (contrairement aux caches insights/
// backups) — sans purge explicite à la déconnexion, un admin qui active
// "Simuler Premium" puis se déconnecte laisserait ce flag survivre en
// AsyncStorage ET dans le state React de PremiumContext (qui ne se
// réinitialise pas tout seul, cf. PremiumContext.tsx), faisant apparaître
// le badge/anneau Premium sur le PROCHAIN compte connecté sur le même
// appareil (invité ou non). Appelée par PremiumContext sur l'événement
// SIGNED_OUT — même mécanisme réactif que reinitialiserEtatUtilisateur
// dans app/store.ts.
export async function purgerPremiumSimule(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLE_PREMIUM_SIMULE);
  } catch {
    // Best-effort, cf. sauvegarderPremiumSimule.
  }
}

// RÈGLE À NE JAMAIS CASSER : point d'entrée UNIQUE pour savoir si un compte
// a accès aux fonctionnalités Premium — ne jamais dupliquer cette logique
// ailleurs dans le code, toujours passer par cette fonction (un seul
// endroit à changer le jour où RevenueCat remplace la simulation).
//
// Ordre des vérifications, DÉLIBÉRÉMENT dans cet ordre précis :
//   0. isGuest → false, INCONDITIONNELLEMENT, avant même TESTFLIGHT_MODE. Un
//      compte invité (essai 7 jours, cf. GuestContext) ne doit jamais voir
//      le badge/anneau Premium ni bénéficier de l'accès Premium, même
//      pendant la période TestFlight — sinon un simple visiteur en mode
//      découverte se retrouve visuellement indiscernable d'un vrai compte
//      Premium/admin. Un compte invité n'est jamais admin (isAdmin est
//      toujours false pour une session anonyme), donc ce cas n'a pas besoin
//      d'être recroisé avec les branches isAdmin ci-dessous.
//   1. isAdmin && simulerNonPremium → false. Un admin qui active "Simuler
//      compte non-premium" doit voir EXACTEMENT ce que voit un utilisateur
//      gratuit, y compris pendant la période TestFlight — ce cas doit donc
//      être tranché AVANT TESTFLIGHT_MODE, jamais après.
//   2. isAdmin (sans simulerNonPremium) → true. Un admin a toujours accès à
//      tout, y compris ce qui est exclusif à Premium.
//   3. TESTFLIGHT_MODE → true. Ne s'applique qu'aux comptes NON-ADMIN à ce
//      stade (les cas admin sont déjà tranchés ci-dessus) — tout testeur
//      TestFlight externe (jamais admin, jamais invité) a accès à 100% des
//      fonctionnalités Premium sans restriction. Cf. RÈGLE sur
//      TESTFLIGHT_MODE plus haut.
//   4. estPremium — le flag simulé (toggle "Simuler Premium", admin
//      uniquement) pour prévisualiser le rendu premium sans être soi-même
//      admin, en dehors de toute période TestFlight.
//
// RÈGLE À NE JAMAIS CASSER : ne jamais remonter TESTFLIGHT_MODE avant les
// deux checks isAdmin — c'est exactement le bug corrigé ici (TESTFLIGHT_MODE
// court-circuitait TOUT, y compris simulerNonPremium, empêchant un admin de
// prévisualiser la vue non-premium pendant la période TestFlight).
export function estComptePremium(
  isAdmin: boolean,
  estPremium: boolean,
  simulerNonPremium: boolean,
  isGuest: boolean,
): boolean {
  if (isGuest) return false;
  if (isAdmin && simulerNonPremium) return false;
  if (isAdmin) return true;
  if (TESTFLIGHT_MODE) return true;
  return estPremium;
}

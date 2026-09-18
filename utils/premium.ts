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
//
// RÈGLE — PASSÉ À `false` LE 2026-09-14 (préparation build V1 production,
// demande explicite) : première fois que ce flag repasse à false dans ce
// projet. Conséquence directe : les 3 emplacements de pub (Ton bilan,
// Insights Aperçu, période Stats) et le clamp de période gratuite
// s'appliquent désormais RÉELLEMENT à tout compte non-admin — plus de
// bypass automatique. Combiné à ADMOB_ACTIF=true et un build EAS avec le
// SDK natif linké, de VRAIES pubs AdMob peuvent maintenant se déclencher
// (cf. RÈGLE sur ADMOB_ACTIF plus bas) — d'où l'importance d'avoir aussi
// restauré les vrais ID de production (AD_UNIT_ID_REWARDED, plus bas) avant
// ce même commit : des ID de test servis à de vrais utilisateurs violent la
// policy AdMob.
export const TESTFLIGHT_MODE = false;

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
// RÈGLE : passé à `true` le 2026-09-13 pour les tests (diagnostic de
// l'écran onboarding "Vista à deux"), REPASSÉ À `false` LE 2026-09-14 pour
// le build V1 production, puis REPASSÉ À `true` LE 2026-09-18 (demande
// explicite, pour de vrai cette fois — visible désormais par TOUS les
// comptes connectés via estEspacePartageActif(isAdmin), plus seulement
// les admin, cf. RÈGLE sur cette fonction plus bas). Espace partagé est
// donc désormais visible pour tous les vrais utilisateurs de ce build —
// pas seulement dans Profil (le seul écran explicitement demandé) :
// TOUT le code gardé par ce flag/estEspacePartageActif (le switcher
// Moi/Partagé d'Aperçu/Budget/Planning/Stats, le Planning partagé, la
// fusion GraphiqueFlux consolidée) devient également visible d'un coup,
// c'est le même flag partout, jamais un sous-ensemble.
//
// RÈGLE — DES 2 POINTS RESTÉS NON VÉRIFIÉS DEPUIS LA REVUE SÉCURITÉ DU
// 2026-09-13, SEUL LE (2) EST TRAITÉ À CE JOUR :
// (1) NON VÉRIFIÉ — confirmer dans le dashboard Supabase (SQL Editor) que
// le RPC creer_espace_partage() déployé correspond bien à la version
// 20260831130000_creer_espace_partage_reutilise_en_attente.sql — toujours
// impossible à vérifier directement depuis cet environnement (pas d'accès
// CLI Supabase). Élément de preuve indirect en faveur du (1), à défaut
// d'une vérification directe : un test en direct du 2026-09-18 (2 vrais
// comptes, création réelle d'espace + jonction par code + lecture mutuelle
// + dissolution, cf. AUDIT_V1.md §6.11) s'est comporté exactement comme
// cette version l'attend (code généré côté serveur, expire_at bascule sur
// 2099-12-31 à la jonction) — un signal fort, pas une confirmation
// formelle du numéro de version déployé.
// (2) CORRIGÉ LE 2026-09-18 — journaliserOperationAuditEspace
// (utils/espacePartage.ts) journalise désormais creerEspacePartage/
// rejoindreEspacePartage/quitterEspacePartage dans audit_operations,
// best-effort, même pattern que journaliserOperationAudit (app/store.ts).
// Cf. AUDIT_V1.md §5.1/§2 (P012/P025, toujours ouverts, désormais avec un
// impact utilisateur réel — plus seulement théorique) pour le reste du
// périmètre espace partagé encore imparfait à ce jour.
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
// RÈGLE — TESTFLIGHT_MODE REPASSÉ À `false` LE 2026-09-14 (build V1
// production) : le court-circuit `TESTFLIGHT_MODE || !ADMOB_ACTIF || ...`
// dans useDeblocagePub ne bloque donc plus sur son premier terme — de
// VRAIES requêtes AdMob peuvent désormais être tentées dès qu'un build EAS
// a le SDK natif linké (cf. RÈGLE dans utils/adMobModule.ts sur le risque
// de crash natif jamais définitivement diagnostiqué depuis le 2026-09-01 —
// à valider sur un vrai device via un build "preview" AVANT tout profil
// "production").
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
// RÈGLE À NE JAMAIS CASSER — VRAIS ID DE PRODUCTION RESTAURÉS LE
// 2026-09-14 (build V1 production, demande explicite) : les ID de test
// Google (ca-app-pub-3940256099942544/..., utilisés du 2026-09-13 au
// 2026-09-14 le temps de valider que le crash natif du 2026-09-01 ne se
// reproduisait pas) sont volontairement retirés ici — servir des ID de
// test à de vrais utilisateurs externes violerait la policy AdMob (aucun
// revenu, risque de suspension du compte). Ne JAMAIS repasser sur les ID
// de test `ca-app-pub-3940256099942544/...` dans ce fichier une fois
// committé pour un build destiné à de vrais utilisateurs — uniquement
// pour un test interne isolé, jamais laissé en l'état au commit.
export const AD_UNIT_ID_REWARDED =
  Platform.OS === "ios"
    ? "ca-app-pub-4645298475525932/3811187805"
    : "ca-app-pub-4645298475525932/6067589553";
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

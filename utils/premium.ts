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

// RÈGLE À NE JAMAIS CASSER — FONDATIONS ESPACE PARTAGÉ, DÉSACTIVÉ POUR LA
// BÊTA (renommé depuis MODE_COUPLE_ACTIF) : tant que `false`, aucun écran
// de l'app ne doit rendre la section "Espace partagé" ni aucun élément
// d'UI/modale qui en dépend — cf. site d'appel dans app/profil.tsx. Le
// schéma Supabase (espaces_partages, membres_espace, enveloppes.attribue_a,
// transactions.attribue_a — cf.
// supabase/migrations/20260830120000_mode_couple_fondations.sql) et
// utils/espacePartage.ts existent déjà et sont désormais appelés depuis la
// modale de app/profil.tsx, mais UNIQUEMENT depuis du JSX gardé par ce
// flag : zéro effet sur la bêta TestFlight tant qu'il reste `false`.
// Repasser à `false` avant toute build de production tant que la V1 n'est
// pas prête (rejoindre un espace fonctionne déjà ; créer un espace
// n'insère pas encore de ligne espaces_partages, cf. RÈGLE dans
// app/profil.tsx).
export const ESPACE_PARTAGE_ACTIF = true;

// RÈGLE : Ad Unit ID de la pub récompensée AdMob — sélectionné une seule
// fois ici selon la plateforme (Platform.OS), jamais dupliqué ailleurs dans
// le code (InsightVerrouille.tsx l'importe directement).
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

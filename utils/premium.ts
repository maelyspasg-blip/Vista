import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — seul AsyncStorage (stockage LOCAL à
// l'appareil, jamais synchronisé en base) est utilisé ici, cf. RÈGLE
// juste en dessous.
//
// RÈGLE À NE JAMAIS CASSER — METTRE À false AVANT LA PUBLICATION APP STORE
// OFFICIELLE : tant que true, tout le monde (y compris les testeurs
// TestFlight externes, qui n'ont ni objStore.isAdmin ni accès au toggle
// "Simuler Premium") a accès à 100% des fonctionnalités Premium sans
// restriction — voir estComptePremium ci-dessous, qui court-circuite TOUT
// le reste de sa logique (y compris simulerNonPremium) dès que ce flag est
// actif. Aucun mécanisme de rappel automatique ne le repasse à false : une
// vérification manuelle avant soumission App Store est nécessaire.
export const TESTFLIGHT_MODE = true;

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

// RÈGLE À NE JAMAIS CASSER : point d'entrée UNIQUE pour savoir si un compte
// a accès aux fonctionnalités Premium — un compte admin est toujours
// considéré premium (il a accès à tout, y compris ce qui est exclusif à
// Premium), ET le flag simulé (toggle "Simuler Premium", admin uniquement)
// compte aussi, pour pouvoir prévisualiser le rendu premium sans être
// soi-même admin. `simulerNonPremium` (toggle "Simuler compte non-premium",
// admin uniquement) prend le dessus sur tout le reste — y compris isAdmin —
// pour qu'un admin puisse voir exactement ce que voit un utilisateur
// gratuit. Ne jamais dupliquer cette logique ailleurs dans le code —
// toujours passer par cette fonction, pour n'avoir qu'un seul endroit à
// changer le jour où RevenueCat remplace la simulation.
export function estComptePremium(
  isAdmin: boolean,
  estPremium: boolean,
  simulerNonPremium: boolean,
): boolean {
  if (TESTFLIGHT_MODE) return true;
  if (simulerNonPremium) return false;
  return isAdmin || estPremium;
}

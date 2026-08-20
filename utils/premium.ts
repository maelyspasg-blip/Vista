import AsyncStorage from "@react-native-async-storage/async-storage";

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
  if (simulerNonPremium) return false;
  return isAdmin || estPremium;
}

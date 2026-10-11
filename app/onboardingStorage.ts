import AsyncStorage from "@react-native-async-storage/async-storage";

// RÈGLE À NE JAMAIS CASSER — PRÉSENTATION DE VISTA (slides,
// app/onboarding/index.tsx), décision de Maëlys du 2026-10-10 : affichée
// UNE SEULE FOIS PAR COMPTE ET PAR APPAREIL, juste après la création du
// compte et avant l'onboarding de configuration — jamais à la déconnexion,
// reconnexion d'un compte déjà configuré ou suppression de compte. Clé
// namespacée par userId (l'ancienne clé globale "vista_onboarding_vu",
// commune à tout l'appareil, est abandonnée). Un compte jamais configuré
// qui se reconnecte sur un NOUVEL appareil revoit les slides (voulu :
// nouveau départ).
function cleePresentation(userId: string): string {
  return `vista_presentation_vue_${userId}`;
}

export async function marquerPresentationVue(userId: string): Promise<void> {
  await AsyncStorage.setItem(cleePresentation(userId), "1");
}

export async function getPresentationVue(userId: string): Promise<boolean> {
  const valeur = await AsyncStorage.getItem(cleePresentation(userId));
  return valeur === "1";
}

// RÈGLE À NE JAMAIS CASSER — SOURCE UNIQUE de la clé de la découverte de
// Profil (bulles au premier accès à Profil, app/profil.tsx) : lue/écrite par
// Profil ET marquée vue par app/_layout.tsx (croix/"Passer" d'un tutoriel =
// tous les tutoriels vus). Écrite en dur à deux endroits, elle pouvait
// diverger silencieusement — toujours passer par cette fonction.
export function cleDecouverteProfil(userId: string): string {
  return `vista_profil_onboarding_vu_${userId}`;
}

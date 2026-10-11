import type { useRouter } from "expo-router";

type Routeur = ReturnType<typeof useRouter>;

// RÈGLE À NE JAMAIS CASSER (bug corrigé le 2026-10-10 : "les slides de
// présentation réapparaissent au hasard") : aux grandes transitions
// (arrivée sur les onglets après connexion/inscription/onboarding, retour
// à la connexion après déconnexion/suppression de compte), la pile de
// navigation est VIDÉE avant le replace — un `replace` seul ne remplace que
// l'écran du dessus et laissait dessous les écrans d'onboarding précédents,
// qu'un retour arrière (geste iOS, bouton Android) faisait réapparaître.
export function remplacerSansHistorique(
  router: Routeur,
  destination: Parameters<Routeur["replace"]>[0],
): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace(destination);
}

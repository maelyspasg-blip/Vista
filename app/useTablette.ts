import { useWindowDimensions } from "react-native";

// RÈGLE À NE JAMAIS CASSER — SEUIL DE LARGEUR, PAS DE PLATEFORME : 768px est
// la largeur logique du plus petit iPad en portrait (iPad mini) — tout ce
// qui dépasse ce seuil est une tablette, quelle que soit la plateforme
// (fonctionne aussi pour un iPhone en mode Split View sur un Mac, ou le web
// dans une fenêtre large). useWindowDimensions() (jamais Dimensions.get,
// qui ne réagit PAS aux changements) pour suivre en direct une rotation
// d'écran ou un redimensionnement de fenêtre (iPad multitâche Split View).
const SEUIL_LARGEUR_TABLETTE = 768;

export function useEstTablette(): boolean {
  const { width } = useWindowDimensions();
  return width > SEUIL_LARGEUR_TABLETTE;
}

// RÈGLE : largeur confortable pour un formulaire/modale sur tablette — ni
// un mur de texte en pleine largeur d'iPad (illisible), ni aussi étriqué
// qu'un iPhone. 600px par défaut ; certaines modales plus riches en contenu
// (ex: "Ton bilan") passent une largeur plus généreuse en second argument.
export const LARGEUR_MODALE_TABLETTE = 600;

// À spreader dans le tableau de style du CONTENEUR DE CONTENU d'une modale
// déjà existante (jamais remplacer tout son style) — renvoie `null` sur
// iPhone (aucun effet, RN ignore les entrées null d'un tableau de style),
// donc jamais besoin d'un `if (estTablette)` séparé au site d'appel.
export function styleModaleTablette(
  estTablette: boolean,
  largeur: number = LARGEUR_MODALE_TABLETTE,
) {
  return estTablette
    ? { width: largeur, maxWidth: largeur, alignSelf: "center" as const }
    : null;
}

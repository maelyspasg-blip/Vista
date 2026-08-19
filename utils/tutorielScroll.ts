// Calcule le nouvel offset de scroll nécessaire pour amener `rect` (mesuré
// en coordonnées absolues d'écran, via measureInWindow) dans une bande
// visible sûre de l'écran — ou `null` si `rect` y est déjà entièrement
// contenu, pour ne déclencher aucun scroll inutile (évite un micro-scroll
// perceptible à chaque étape du tutoriel qui n'en a pas besoin).
//
// `rect.y` reste en coordonnées ABSOLUES tout du long : scroller de Δ fait
// passer la position absolue d'un élément de contenu à `y − Δ` (scroller
// vers le bas rapproche le contenu du haut de l'écran), donc pas besoin de
// connaître la position du contenu relative au ScrollView — juste sa
// position absolue actuelle et l'offset de scroll courant.
export function calculerScrollAutoTutoriel(
  rect: { y: number; height: number },
  offsetActuel: number,
  hauteurEcran: number,
  margeHaut: number,
  margeBas: number,
): number | null {
  const limiteHaut = margeHaut;
  const limiteBas = hauteurEcran - margeBas;

  let delta = 0;
  if (rect.y < limiteHaut) {
    delta = rect.y - limiteHaut;
  } else if (rect.y + rect.height > limiteBas) {
    delta = rect.y + rect.height - limiteBas;
  } else {
    return null;
  }

  return Math.max(0, offsetActuel + delta);
}

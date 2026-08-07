// Distance perceptuelle approximative entre deux couleurs hex (#RRGGBB), en
// HSL — la teinte (h, périodique sur 360°) domine la perception d'une
// pastille pleine, saturation et luminosité affinent. Les trois composantes
// sont normalisées sur [0,1] avant combinaison pour être comparables.
function hexVersHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function distanceCouleur(a: string, b: string): number {
  const ca = hexVersHsl(a);
  const cb = hexVersHsl(b);
  let deltaH = Math.abs(ca.h - cb.h);
  if (deltaH > 180) deltaH = 360 - deltaH;
  const deltaS = ca.s - cb.s;
  const deltaL = ca.l - cb.l;
  return Math.sqrt((deltaH / 180) ** 2 + deltaS ** 2 + deltaL ** 2);
}

// Couleur de `palette` qui maximise sa distance minimale à toutes les
// `couleursUtilisees` — pas juste "une couleur pas encore prise", mais la
// plus éloignée visuellement de l'ensemble déjà en usage. Sans couleur
// utilisée, retourne la première de la palette (comportement de départ
// inchangé pour la toute première catégorie).
export function couleurLaPlusDistincte(
  palette: string[],
  couleursUtilisees: string[],
): string {
  if (couleursUtilisees.length === 0) return palette[0];

  let meilleure = palette[0];
  let meilleureDistanceMin = -Infinity;
  for (const candidate of palette) {
    const distanceMin = Math.min(
      ...couleursUtilisees.map((u) => distanceCouleur(candidate, u)),
    );
    if (distanceMin > meilleureDistanceMin) {
      meilleureDistanceMin = distanceMin;
      meilleure = candidate;
    }
  }
  return meilleure;
}

// Même palette, réordonnée pour présenter en premier les couleurs les plus
// distinctes de `couleursUtilisees` — pour le sélecteur manuel (ColorPicker),
// où l'utilisateur doit pouvoir repérer d'un coup d'œil les choix les moins
// susceptibles de se confondre avec ses catégories existantes.
export function trierParDistinction(
  palette: string[],
  couleursUtilisees: string[],
): string[] {
  if (couleursUtilisees.length === 0) return palette;
  return [...palette].sort((a, b) => {
    const distA = Math.min(...couleursUtilisees.map((u) => distanceCouleur(a, u)));
    const distB = Math.min(...couleursUtilisees.map((u) => distanceCouleur(b, u)));
    return distB - distA;
  });
}

import type { Theme } from "../app/ThemeContext";

// RÈGLE À NE JAMAIS CASSER — LOGO AVEC TEXTE (logo officiel du 2026-10-11) :
// texte sombre sur fond clair, texte clair sur fond sombre — jamais
// l'inverse (illisible). Réservé aux écrans où le logo est seul (connexion,
// inscription, essai expiré). Là où le mot "Vista" est déjà écrit à côté
// (en-tête d'Aperçu, splash interne), on garde le symbole seul
// (vista-logo-mark.png) pour ne pas doubler le nom.
// Proportions des fichiers : 919 x 1024.
export const RATIO_LOGO_AVEC_TEXTE = 919 / 1024;

export function sourceLogoAvecTexte(theme: Theme) {
  return theme === "sombre"
    ? require("../assets/images/logo-light-text.png")
    : require("../assets/images/logo-dark-text.png");
}

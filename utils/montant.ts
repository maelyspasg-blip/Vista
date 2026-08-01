// Les champs de saisie de montant acceptent la virgule et le point comme séparateur décimal
// (le clavier "decimal-pad" affiche la virgule sur les appareils configurés en français).

export function sanitizeMontantInput(text: string): string {
  let sanitized = text.replace(/[^0-9.,]/g, '');

  const firstSepIndex = sanitized.search(/[.,]/);
  if (firstSepIndex !== -1) {
    const before = sanitized.slice(0, firstSepIndex + 1);
    const after = sanitized.slice(firstSepIndex + 1).replace(/[.,]/g, '');
    sanitized = before + after;
  }

  return sanitized;
}

export function parseMontant(text: string): number {
  return parseFloat(text.replace(',', '.'));
}

// Point central d'arrondi pour tout montant affiché : l'arithmétique flottante
// JS produit régulièrement des valeurs comme 32.019999999999996 après une
// suite d'additions/soustractions/pourcentages — jamais visible dans le
// calcul lui-même, seulement à l'affichage. À appeler sur toute valeur
// numérique interpolée directement dans du texte (ex: `${formaterMontant(x)} €`),
// sauf si elle est déjà passée par Math.round (ou par NombreAnime, qui arrondit
// en interne).
export function formaterMontant(montant: number): number {
  return Math.round((montant + Number.EPSILON) * 100) / 100;
}

// Les champs de saisie de montant acceptent la virgule et le point comme séparateur décimal
// (le clavier "decimal-pad" affiche la virgule sur les appareils configurés en français).

export function sanitizeMontantInput(text: string): string {
  const sanitized = text.replace(/[^0-9.,]/g, '');

  const separateurs = [...sanitized.matchAll(/[.,]/g)];

  // Frappe incrémentale normale (0 ou 1 séparateur) : comportement INCHANGÉ
  // — un seul séparateur est toujours traité comme décimal, quel que soit
  // le nombre de chiffres qui suit (ex. "1,234" tapé au clavier decimal-pad
  // reste "1.234", pas "1234" — ambiguïté assumée, hors périmètre de P010).
  if (separateurs.length <= 1) {
    const sepIndex = sanitized.search(/[.,]/);
    if (sepIndex === -1) return sanitized;
    const before = sanitized.slice(0, sepIndex + 1);
    const after = sanitized.slice(sepIndex + 1).replace(/[.,]/g, '');
    return before + after;
  }

  // RÈGLE À NE JAMAIS CASSER — 2+ séparateurs = montant COLLÉ déjà formaté
  // avec séparateur de milliers (bug trouvé le 2026-09-16, P010), PAS une
  // frappe normale (personne ne tape 2 virgules/points à la main). L'ancien
  // code traitait toujours le PREMIER séparateur comme décimal et
  // supprimait les suivants sans les traiter comme des milliers — un
  // montant collé "2,500.00" (US) ou "1.234,56" (EU) devenait "2.5"/"1.23456"
  // au lieu de 2500/1234.56, silencieusement (aucune erreur, 2.5€ est une
  // valeur "valide"). Le DERNIER séparateur est le séparateur décimal s'il
  // est suivi d'au plus 2 chiffres (formats FR/EU/US usuels) ; sinon (3
  // chiffres après, ex. "12.345.678") il n'y a pas de partie décimale du
  // tout, tous les séparateurs sont des milliers.
  const dernier = separateurs[separateurs.length - 1];
  const dernierIndex = dernier.index ?? sanitized.length;
  const chiffresApresDernier = sanitized.length - (dernierIndex + 1);

  if (chiffresApresDernier > 2) {
    return sanitized.replace(/[.,]/g, '');
  }

  const partieEntiere = sanitized.slice(0, dernierIndex).replace(/[.,]/g, '');
  const partieDecimale = sanitized.slice(dernierIndex + 1).replace(/[.,]/g, '');
  return `${partieEntiere}.${partieDecimale}`;
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

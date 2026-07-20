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

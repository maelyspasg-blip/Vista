export function getInitiales(prenom: string, nom: string): string {
  const p = prenom.trim().charAt(0).toUpperCase();
  const n = nom.trim().charAt(0).toUpperCase();
  return `${p}${n}` || "?";
}

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase (ni même AsyncStorage, cf. RÈGLE juste en
// dessous : mémoire RAM de session uniquement) — toute écriture persistée
// vit dans app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
// RÈGLE À NE JAMAIS CASSER : mémoire de SESSION uniquement (variable de
// module en RAM, jamais AsyncStorage) — "ne pas répéter un conseil déjà
// affiché" ne vaut que pour la session en cours (l'app ouverte), jamais
// d'une ouverture à l'autre. Sert à coordonner "Nos conseils" (Aperçu,
// app/(tabs)/index.tsx) et "Vista" (Ton bilan, app/(tabs)/analytics.tsx) —
// tous deux appellent genererConseils indépendamment sur les mêmes données
// sous-jacentes et peuvent donc détecter la même situation ; ce module leur
// permet de savoir "qui l'a déjà montrée" pour que l'autre écran ne la
// répète jamais dans la même session, quel que soit l'ordre de navigation.
let situationsAffichees = new Set<string>();

export function situationsDejaAffichees(): Set<string> {
  return situationsAffichees;
}

export function marquerSituationsAffichees(cles: string[]): void {
  cles.forEach((cle) => situationsAffichees.add(cle));
}

// Utilisé à la déconnexion : la session suivante (même le même compte) ne
// doit pas hériter des situations déjà montrées à la session précédente.
export function reinitialiserSituationsAffichees(): void {
  situationsAffichees = new Set<string>();
}

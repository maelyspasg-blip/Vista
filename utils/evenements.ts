// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — calcul pur (expansion de dates), toute
// écriture vit dans app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce
// fichier).
//
// Extrait de app/(tabs)/planning.tsx pour être partagé avec
// utils/widgetsSync.ts (widget Planning, agenda du jour incluant les
// événements récurrents) — logique d'expansion des occurrences identique
// des deux côtés, jamais deux implémentations qui pourraient diverger.

export type FrequenceEvenement = "jour" | "semaine" | "mois" | "an";

// Calcule toutes les occurrences d'un événement récurrent tombant dans
// [debutFenetre, finFenetre] (bornes incluses), à partir de sa date de
// départ — jamais de recalcul de la logique de récurrence ailleurs.
export function genererOccurrencesEvenement(
  dateDebut: Date,
  frequence: FrequenceEvenement,
  debutFenetre: Date,
  finFenetre: Date,
): Date[] {
  const occurrences: Date[] = [];
  const debut = new Date(dateDebut);
  debut.setHours(0, 0, 0, 0);

  if (frequence === "jour") {
    const cursor = new Date(Math.max(debut.getTime(), debutFenetre.getTime()));
    while (cursor <= finFenetre) {
      occurrences.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
  }

  const cursor = new Date(debut);
  let iterations = 0;
  while (cursor <= finFenetre && iterations < 1000) {
    if (cursor >= debutFenetre) occurrences.push(new Date(cursor));
    if (frequence === "semaine") cursor.setDate(cursor.getDate() + 7);
    else if (frequence === "mois") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setFullYear(cursor.getFullYear() + 1);
    iterations++;
  }
  return occurrences;
}

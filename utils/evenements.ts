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

  // RÈGLE À NE JAMAIS CASSER — CLAMPING AU DERNIER JOUR DU MOIS (bug P026,
  // corrigé le 2026-09-17) : `jourAncrage` retient le jour-du-mois ORIGINAL
  // (celui de `dateDebut`), jamais celui du cursor déjà avancé. Sans ça,
  // `setMonth`/`setFullYear` sur un cursor dont le jour n'existe pas dans
  // le mois cible (ex. le 31 en février) débordait silencieusement sur le
  // mois suivant (JS normalise plutôt que de rejeter, ex. 31 janvier + 1
  // mois -> 3 mars), et l'itération suivante repartait de ce jour déjà
  // dérivé — la récurrence glissait définitivement (31 janvier -> 3 mars
  // -> 3 avril -> ...) au lieu de se stabiliser sur "fin de mois". Chaque
  // occurrence est désormais reconstruite depuis `jourAncrage` clampé au
  // nombre de jours réels du mois cible (31 janvier -> 28/29 février -> 31
  // mars -> 30 avril -> 31 mai...), jamais depuis le jour potentiellement
  // déjà dérivé d'une itération précédente.
  //
  // Décision autonome (2026-09-17, cf. AUDIT_V1.md §2.1) : un événement
  // ANNUEL créé un 29 février retombe sur le 28 février les années non
  // bissextiles — même règle de clamping que le cas mensuel, pas de
  // traitement spécial. À reconsidérer si Maëlys préfère un report au 1er
  // mars pour ce cas précis.
  const jourAncrage = debut.getDate();
  const dernierJourDuMois = (annee: number, moisIndex0: number) =>
    new Date(annee, moisIndex0 + 1, 0).getDate();
  const avancerDe = (base: Date, nbMois: number): Date => {
    const moisCible = base.getMonth() + nbMois;
    const anneeCible = base.getFullYear() + Math.floor(moisCible / 12);
    const moisIndex0 = ((moisCible % 12) + 12) % 12;
    const jourClampe = Math.min(
      jourAncrage,
      dernierJourDuMois(anneeCible, moisIndex0),
    );
    return new Date(anneeCible, moisIndex0, jourClampe);
  };

  let cursor = new Date(debut);
  let iterations = 0;
  while (cursor <= finFenetre && iterations < 1000) {
    if (cursor >= debutFenetre) occurrences.push(new Date(cursor));
    if (frequence === "semaine") {
      const suivant = new Date(cursor);
      suivant.setDate(suivant.getDate() + 7);
      cursor = suivant;
    } else if (frequence === "mois") {
      cursor = avancerDe(cursor, 1);
    } else {
      cursor = avancerDe(cursor, 12);
    }
    iterations++;
  }
  return occurrences;
}

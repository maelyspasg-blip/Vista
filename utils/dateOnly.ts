// RÈGLE À NE JAMAIS CASSER — module volontairement SANS AUCUNE DÉPENDANCE
// (ni `store.ts`, ni aucun autre fichier du projet) : `parseDateFixeLocale`
// est utilisée à la fois par `app/store.ts` et par `app/notifications.ts`
// (qui importe lui-même des choses depuis `store.ts`) — la définir ici
// plutôt que dans `store.ts` évite un cycle d'imports CommonJS entre les
// deux (store.ts → notifications.ts → store.ts), qui aurait exposé l'un des
// deux à recevoir un export encore `undefined` selon l'ordre d'évaluation
// Metro. Par la même occasion, `utils/budget.ts` peut aussi l'importer
// directement au lieu d'en garder une copie dupliquée.
//
// Toujours parser une chaîne date-only ("YYYY-MM-DD", sans heure —
// dateFixe/evenement.date/historique_paiements.date) avec cette fonction,
// JAMAIS `new Date(chaineISO)` directement (bug trouvé le 2026-09-16,
// P004/P005/P023/P032) : ces chaînes sont ÉCRITES avec des composants
// LOCAUX, mais `new Date("YYYY-MM-DD")` est spécifié par JS comme minuit
// UTC — toute relecture avec des accesseurs locaux (getMonth/getFullYear/
// getDate, toLocaleDateString) décale alors d'un jour en arrière pour tout
// fuseau à décalage négatif sur UTC (Amériques, DOM-TOM français inclus).
export function parseDateFixeLocale(chaineISO: string): Date {
  const [annee, mois, jour] = chaineISO.split("-").map(Number);
  const d = new Date(annee, (mois || 1) - 1, jour || 1);
  // Fail-safe (revue sécurité du 2026-09-16) : `new Date(y, m, d)` ne
  // valide jamais ses bornes (ex. "2026-13-40" ferait silencieusement un
  // roll-over vers une autre date, contrairement à `new Date(chaineISO)`
  // qui échouait proprement en `Invalid Date` sur une entrée corrompue).
  // Le round-trip ci-dessous restaure ce fail-safe : une chaîne malformée
  // ou hors bornes redevient explicitement `Invalid Date` plutôt qu'une
  // date arbitraire acceptée silencieusement.
  if (
    !Number.isFinite(annee) ||
    !Number.isFinite(mois) ||
    !Number.isFinite(jour) ||
    d.getFullYear() !== annee ||
    d.getMonth() !== (mois || 1) - 1 ||
    d.getDate() !== (jour || 1)
  ) {
    return new Date(NaN);
  }
  return d;
}

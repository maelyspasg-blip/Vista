-- Extension du filtre "actif ce mois-ci" (déjà appliqué aux entrées
-- Budget/Entrée d'argent) aux catégories de dépense Variable non
-- récurrentes : passé leur mois, elles ne doivent plus apparaître dans
-- "Tes catégories" (app/(tabs)/index.tsx, app/(tabs)/budget.tsx), via
-- utils/budget.ts:estCategorieActiveCeMois. Les catégories Fixe utilisent
-- déjà date_fixe pour ce même calcul (jamais avancée pour une facture qui
-- ne se répète pas), donc aucun backfill n'est nécessaire pour ce type.
--
-- Backfill non destructif : les catégories Variable non récurrentes déjà en
-- base n'ont pas de mois_comptage — sans ce backfill, le nouveau filtre les
-- ferait disparaître immédiatement de "Tes catégories" au déploiement,
-- alors qu'on ne sait pas réellement à quel mois elles appartenaient (pas
-- de date de création trackée). On les rattache donc au mois calendaire en
-- cours au moment de cette migration : elles restent visibles jusqu'à la
-- fin de ce mois-ci, puis expirent normalement à partir du mois suivant,
-- comme n'importe quelle catégorie ponctuelle créée à partir de maintenant.

update public.enveloppes
set mois_comptage = date_trunc('month', now())::date
where type = 'Variable'
  and recurrente = false
  and mois_comptage is null;

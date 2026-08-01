-- "Compter pour le mois de : X" (feature Budget en liste d'entrées) : une
-- enveloppe de type Entrée a désormais un mois de comptage indépendant de
-- sa date réelle (date_fixe) — ex. un salaire reçu le 28 juillet peut être
-- explicitement compté pour août. Stocké comme le 1er jour du mois cible
-- pour des comparaisons d'égalité simples côté application.
--
-- Backfill : toutes les lignes Entrée existantes prennent le mois calendaire
-- de leur date_fixe actuelle, pour ne rien faire disparaître du calcul du
-- mois en cours au déploiement de cette migration.

alter table public.enveloppes
  add column if not exists mois_comptage date;

update public.enveloppes
set mois_comptage = date_trunc('month', date_fixe)::date
where type = 'Entrée'
  and date_fixe is not null
  and mois_comptage is null;

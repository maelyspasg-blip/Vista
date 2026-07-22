-- Détection de motifs de dépenses récurrentes : mémorise, par enveloppe,
-- si la suggestion "convertir en récurrente" a déjà été rejetée par
-- l'utilisateur, pour ne jamais la reproposer pour cette catégorie précise.

alter table public.enveloppes
  add column if not exists suggestion_recurrence_ignoree boolean not null default false;

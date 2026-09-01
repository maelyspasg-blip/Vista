-- LOG PERMANENT DES OPÉRATIONS DESTRUCTIVES — point 5 de la RÈGLE
-- "Sécurité maximale" du 2026-09-01. Journalise archivage mensuel (succès
-- et échec), remises à zéro en masse bloquées, et suppressions d'enveloppes
-- — cf. journaliserOperationAudit() dans app/store.ts pour tous les sites
-- d'appel. Schéma volontairement minimal (repris tel quel de la demande) :
-- pas de FK vers une table métier précise, `details` en jsonb absorbe la
-- forme spécifique à chaque type d'opération.

create table if not exists public.audit_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  operation varchar(50),
  details jsonb,
  created_at timestamptz default now()
);

alter table public.audit_operations enable row level security;

-- RÈGLE À NE JAMAIS CASSER — JAMAIS SUPPRIMÉ NI MODIFIÉ, MÊME PAR SON
-- PROPRE AUTEUR : volontairement AUCUNE policy "for update"/"for delete" —
-- un log d'audit qu'on peut soi-même corriger ou effacer après coup ne
-- prouve plus rien. Seuls select (pour se relire) et insert (pour
-- journaliser) sont exposés au client anon key ; toute suppression
-- éventuelle (rétention, RGPD) doit passer par le dashboard Supabase /
-- service_role, jamais par ce client.
create policy "audit_operations_select_own" on public.audit_operations
  for select using (auth.uid() = user_id);

create policy "audit_operations_insert_own" on public.audit_operations
  for insert with check (auth.uid() = user_id);

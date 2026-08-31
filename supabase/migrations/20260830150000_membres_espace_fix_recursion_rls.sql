-- Corrige l'erreur Postgres 42P17 "infinite recursion detected in policy
-- for relation membres_espace" — diagnostic confirmé : la policy
-- membres_espace_select_own_or_cospace (cf.
-- 20260830120000_mode_couple_fondations.sql) contient une sous-requête
-- `select 1 from public.membres_espace m2 where ...` qui interroge LA
-- MÊME TABLE que celle sur laquelle la policy s'applique. Cette
-- sous-requête est elle-même soumise à RLS, donc évaluer la policy exige
-- de ré-évaluer la policy pour évaluer la sous-requête, qui doit
-- elle-même être ré-évaluée, etc. — un piège RLS Postgres classique et
-- documenté par Supabase (une policy ne doit jamais interroger
-- directement la table sur laquelle elle porte).
--
-- RÈGLE À NE JAMAIS CASSER — SEUL MOYEN CORRECT DE CASSER LA RÉCURSION :
-- une fonction `security definer` (contrairement à une requête normale,
-- elle s'exécute avec les privilèges de son propriétaire, qui BYPASS RLS
-- sur ses propres requêtes internes) — jamais une simple sous-requête
-- inline, qui resterait soumise à RLS et recréerait la même récursion.
-- `set search_path = public` : même convention que setup_guest_account()
-- (cf. 20260722100100_guest_mode_triggers.sql), pour ne jamais dépendre du
-- search_path de l'appelant.
drop policy if exists "membres_espace_select_own_or_cospace" on public.membres_espace;

create or replace function public.est_membre_espace(p_espace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membres_espace
    where espace_id = p_espace_id
      and user_id = auth.uid()
  );
$$;

create policy "membres_espace_select_own_or_cospace" on public.membres_espace
  for select using (
    user_id = auth.uid()
    or public.est_membre_espace(espace_id)
  );

-- Audit de sécurité : active Row Level Security (RLS) sur toutes les tables
-- applicatives et crée les policies "propriétaire uniquement" (user_id =
-- auth.uid()). Aucune migration précédente ne contenait de CREATE POLICY —
-- si RLS est déjà activé/configuré manuellement depuis le dashboard
-- Supabase, ce script est conçu pour rester SANS DANGER à rejouer (DROP
-- POLICY IF EXISTS avant chaque CREATE POLICY, ENABLE ROW LEVEL SECURITY
-- est lui-même idempotent).
--
-- RÈGLE À NE JAMAIS CASSER — POURQUOI CE N'EST PAS OPTIONNEL : le client
-- (app/../supabaseClient.ts) utilise UNIQUEMENT la clé anon
-- (EXPO_PUBLIC_SUPABASE_ANON_KEY), jamais la service_role key — la SEULE
-- barrière server-side entre "l'app filtre par user_id de son côté" et "un
-- appel direct à l'API REST Supabase peut lire/écrire les données de
-- n'importe quel autre utilisateur" est RLS. Sans policies, le filtrage
-- .eq("user_id", ...) déjà présent partout dans app/store.ts n'est qu'une
-- convention côté client, pas une protection réelle.
--
-- RÈGLE À NE JAMAIS CASSER — COMPATIBILITÉ AVEC LES EDGE FUNCTIONS ET
-- TRIGGERS EXISTANTS : delete-account et cleanup-expired-guests
-- (supabase/functions/) utilisent tous les deux la SERVICE ROLE KEY
-- (createClient(url, serviceRoleKey)), qui bypass RLS par construction —
-- ces deux fonctions continuent de fonctionner sans changement. Les
-- triggers setup_guest_account et clear_guest_status (migration
-- 20260722100100) sont `security definer`, exécutés avec les privilèges de
-- leur propriétaire (le rôle migrateur, qui bypass RLS) — inchangés eux
-- aussi. Le trigger de création de profil à l'inscription normale
-- mentionné dans cette même migration comme "non versionné dans ce repo"
-- N'A PAS PU être vérifié ici : à confirmer manuellement dans le dashboard
-- qu'il tourne bien lui aussi en security definer (ou avec un rôle
-- bypassant RLS) avant d'appliquer cette migration en production.

-- === enveloppes ==============================================================
alter table public.enveloppes enable row level security;

drop policy if exists "enveloppes_select_own" on public.enveloppes;
create policy "enveloppes_select_own" on public.enveloppes
  for select using (auth.uid() = user_id);

drop policy if exists "enveloppes_insert_own" on public.enveloppes;
create policy "enveloppes_insert_own" on public.enveloppes
  for insert with check (auth.uid() = user_id);

drop policy if exists "enveloppes_update_own" on public.enveloppes;
create policy "enveloppes_update_own" on public.enveloppes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "enveloppes_delete_own" on public.enveloppes;
create policy "enveloppes_delete_own" on public.enveloppes
  for delete using (auth.uid() = user_id);

-- === transactions =============================================================
alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- === objectifs =================================================================
alter table public.objectifs enable row level security;

drop policy if exists "objectifs_select_own" on public.objectifs;
create policy "objectifs_select_own" on public.objectifs
  for select using (auth.uid() = user_id);

drop policy if exists "objectifs_insert_own" on public.objectifs;
create policy "objectifs_insert_own" on public.objectifs
  for insert with check (auth.uid() = user_id);

drop policy if exists "objectifs_update_own" on public.objectifs;
create policy "objectifs_update_own" on public.objectifs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "objectifs_delete_own" on public.objectifs;
create policy "objectifs_delete_own" on public.objectifs
  for delete using (auth.uid() = user_id);

-- === evenements =================================================================
alter table public.evenements enable row level security;

drop policy if exists "evenements_select_own" on public.evenements;
create policy "evenements_select_own" on public.evenements
  for select using (auth.uid() = user_id);

drop policy if exists "evenements_insert_own" on public.evenements;
create policy "evenements_insert_own" on public.evenements
  for insert with check (auth.uid() = user_id);

drop policy if exists "evenements_update_own" on public.evenements;
create policy "evenements_update_own" on public.evenements
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "evenements_delete_own" on public.evenements;
create policy "evenements_delete_own" on public.evenements
  for delete using (auth.uid() = user_id);

-- === profils ====================================================================
-- RÈGLE : profils.user_id référence auth.users.id (1 ligne par compte,
-- jamais plusieurs) — mêmes 4 policies que les autres tables, mais
-- l'INSERT réel ne passe jamais par le client (toujours par un trigger
-- security definer, cf. RÈGLE en tête de fichier) : la policy insert reste
-- posée par cohérence/défense en profondeur, jamais utilisée en pratique
-- par l'app cliente elle-même.
alter table public.profils enable row level security;

drop policy if exists "profils_select_own" on public.profils;
create policy "profils_select_own" on public.profils
  for select using (auth.uid() = user_id);

drop policy if exists "profils_insert_own" on public.profils;
create policy "profils_insert_own" on public.profils
  for insert with check (auth.uid() = user_id);

drop policy if exists "profils_update_own" on public.profils;
create policy "profils_update_own" on public.profils
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profils_delete_own" on public.profils;
create policy "profils_delete_own" on public.profils
  for delete using (auth.uid() = user_id);

-- === snapshots_mois =============================================================
alter table public.snapshots_mois enable row level security;

drop policy if exists "snapshots_mois_select_own" on public.snapshots_mois;
create policy "snapshots_mois_select_own" on public.snapshots_mois
  for select using (auth.uid() = user_id);

drop policy if exists "snapshots_mois_insert_own" on public.snapshots_mois;
create policy "snapshots_mois_insert_own" on public.snapshots_mois
  for insert with check (auth.uid() = user_id);

drop policy if exists "snapshots_mois_update_own" on public.snapshots_mois;
create policy "snapshots_mois_update_own" on public.snapshots_mois
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "snapshots_mois_delete_own" on public.snapshots_mois;
create policy "snapshots_mois_delete_own" on public.snapshots_mois
  for delete using (auth.uid() = user_id);

-- === snapshot_enveloppes ========================================================
-- RÈGLE À NE JAMAIS CASSER : PAS de colonne user_id directe sur cette table
-- (cf. RÈGLE dans supabase/functions/_shared/tables.ts) — scopée
-- exclusivement via snapshot_mois_id -> snapshots_mois.user_id. Policies en
-- EXISTS plutôt qu'une comparaison directe, pour cette raison précise.
alter table public.snapshot_enveloppes enable row level security;

drop policy if exists "snapshot_enveloppes_select_own" on public.snapshot_enveloppes;
create policy "snapshot_enveloppes_select_own" on public.snapshot_enveloppes
  for select using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_enveloppes.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

drop policy if exists "snapshot_enveloppes_insert_own" on public.snapshot_enveloppes;
create policy "snapshot_enveloppes_insert_own" on public.snapshot_enveloppes
  for insert with check (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_enveloppes.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

drop policy if exists "snapshot_enveloppes_update_own" on public.snapshot_enveloppes;
create policy "snapshot_enveloppes_update_own" on public.snapshot_enveloppes
  for update using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_enveloppes.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_enveloppes.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

drop policy if exists "snapshot_enveloppes_delete_own" on public.snapshot_enveloppes;
create policy "snapshot_enveloppes_delete_own" on public.snapshot_enveloppes
  for delete using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_enveloppes.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

-- === snapshot_objectifs =========================================================
-- Même RÈGLE que snapshot_enveloppes ci-dessus : pas de user_id direct.
alter table public.snapshot_objectifs enable row level security;

drop policy if exists "snapshot_objectifs_select_own" on public.snapshot_objectifs;
create policy "snapshot_objectifs_select_own" on public.snapshot_objectifs
  for select using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_objectifs.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

drop policy if exists "snapshot_objectifs_insert_own" on public.snapshot_objectifs;
create policy "snapshot_objectifs_insert_own" on public.snapshot_objectifs
  for insert with check (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_objectifs.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

drop policy if exists "snapshot_objectifs_update_own" on public.snapshot_objectifs;
create policy "snapshot_objectifs_update_own" on public.snapshot_objectifs
  for update using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_objectifs.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_objectifs.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

drop policy if exists "snapshot_objectifs_delete_own" on public.snapshot_objectifs;
create policy "snapshot_objectifs_delete_own" on public.snapshot_objectifs
  for delete using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_objectifs.snapshot_mois_id
        and sm.user_id = auth.uid()
    )
  );

-- === historique_paiements =======================================================
alter table public.historique_paiements enable row level security;

drop policy if exists "historique_paiements_select_own" on public.historique_paiements;
create policy "historique_paiements_select_own" on public.historique_paiements
  for select using (auth.uid() = user_id);

drop policy if exists "historique_paiements_insert_own" on public.historique_paiements;
create policy "historique_paiements_insert_own" on public.historique_paiements
  for insert with check (auth.uid() = user_id);

drop policy if exists "historique_paiements_update_own" on public.historique_paiements;
create policy "historique_paiements_update_own" on public.historique_paiements
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "historique_paiements_delete_own" on public.historique_paiements;
create policy "historique_paiements_delete_own" on public.historique_paiements
  for delete using (auth.uid() = user_id);

-- === modeles_depenses ============================================================
-- RÈGLE : table absente de la liste fournie dans la demande d'audit, mais
-- utilisée par l'app (app/store.ts, "raccourcis" de dépense) avec une
-- colonne user_id directe — ajoutée ici pour ne pas laisser un trou de
-- sécurité identique aux 8 autres tables sur une table oubliée.
alter table public.modeles_depenses enable row level security;

drop policy if exists "modeles_depenses_select_own" on public.modeles_depenses;
create policy "modeles_depenses_select_own" on public.modeles_depenses
  for select using (auth.uid() = user_id);

drop policy if exists "modeles_depenses_insert_own" on public.modeles_depenses;
create policy "modeles_depenses_insert_own" on public.modeles_depenses
  for insert with check (auth.uid() = user_id);

drop policy if exists "modeles_depenses_update_own" on public.modeles_depenses;
create policy "modeles_depenses_update_own" on public.modeles_depenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "modeles_depenses_delete_own" on public.modeles_depenses;
create policy "modeles_depenses_delete_own" on public.modeles_depenses
  for delete using (auth.uid() = user_id);

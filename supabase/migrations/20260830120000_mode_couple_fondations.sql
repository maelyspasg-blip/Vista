-- FONDATIONS DU MODE COUPLE — schéma seul, RIEN DE BRANCHÉ CÔTÉ APP.
--
-- RÈGLE À NE JAMAIS CASSER — AUCUN IMPACT SUR LA BÊTA TESTFLIGHT ACTUELLE :
-- cette migration est purement additive.
-- 1. Deux tables NOUVELLES (espaces_partages, membres_espace) : aucun code
--    existant ne les lit/écrit, donc leur simple existence ne change rien.
-- 2. Deux colonnes NOUVELLES (enveloppes.attribue_a,
--    transactions.attribue_a), avec DEFAULT et jamais NOT NULL sans
--    défaut : les INSERT/UPDATE existants (app/store.ts,
--    enveloppeVersColonnes et équivalent transactions) n'incluent PAS ces
--    colonnes dans leurs payloads — Postgres applique alors
--    automatiquement le DEFAULT ('personnel') sans qu'aucune ligne de code
--    applicatif n'ait besoin de changer. Un SELECT * existant (chargement
--    normal) reçoit juste un champ de plus, ignoré par le mapping actuel
--    (enveloppeDepuisLigne etc. ne lisent que les colonnes qu'ils
--    connaissent).
-- Le flag utils/premium.ts:MODE_COUPLE_ACTIF reste à `false` tant que le
-- reste de l'app ne consomme pas ce schéma — cf. ce fichier pour le detail
-- de ce qui est volontairement laissé "non branché".

create table if not exists public.espaces_partages (
  id uuid primary key default gen_random_uuid(),
  code varchar(12) unique not null,
  created_at timestamptz default now(),
  expire_at timestamptz default now() + interval '24 hours'
);

create table if not exists public.membres_espace (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid references public.espaces_partages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role varchar(20) default 'membre',
  created_at timestamptz default now()
);

alter table public.enveloppes
add column if not exists attribue_a varchar(20) default 'personnel';

alter table public.transactions
add column if not exists attribue_a varchar(20) default 'personnel';

-- RÈGLE À NE JAMAIS CASSER — RLS ACTIVÉE MÊME SUR UNE TABLE NON BRANCHÉE :
-- cf. supabase/migrations/20260825120000_rls_policies.sql — la seule
-- barrière server-side réelle dans cette app (client anon key uniquement,
-- jamais service_role côté app) est RLS, jamais un filtre côté client.
-- Poser les policies DÈS la création de la table, jamais "plus tard au
-- moment de brancher" : une table sans RLS est lisible/écrivable par
-- n'importe quel utilisateur authentifié via un appel REST direct, même
-- si aucun écran de l'app ne l'utilise encore.
--
-- Modèle d'accès (DRAFT — à revalider avant de brancher MODE_COUPLE_ACTIF
-- en V1, cf. utils/coupleMode.ts) :
-- - espaces_partages : SELECT ouvert à tout utilisateur authentifié — sans
--   ça, rejoindreEspacePartage(code) ne peut jamais résoudre un code pour
--   un utilisateur qui n'est pas encore membre (poule/œuf). Le `code`
--   lui-même (12 caractères, cf. genererCodeInvitation) joue le rôle de
--   secret partagé ; la table ne contient aucune donnée personnelle.
--   INSERT ouvert (créer un espace) ; UPDATE/DELETE réservés aux membres
--   ayant le rôle 'proprietaire' de CET espace.
-- - membres_espace : un utilisateur voit ses propres lignes, et celles des
--   AUTRES membres du/des espace(s) dont il fait partie (pour afficher
--   qui est dans son espace couple) — jamais celles d'un espace auquel il
--   n'appartient pas.
alter table public.espaces_partages enable row level security;

drop policy if exists "espaces_partages_select_auth" on public.espaces_partages;
create policy "espaces_partages_select_auth" on public.espaces_partages
  for select using (auth.uid() is not null);

drop policy if exists "espaces_partages_insert_auth" on public.espaces_partages;
create policy "espaces_partages_insert_auth" on public.espaces_partages
  for insert with check (auth.uid() is not null);

drop policy if exists "espaces_partages_update_proprietaire" on public.espaces_partages;
create policy "espaces_partages_update_proprietaire" on public.espaces_partages
  for update using (
    exists (
      select 1 from public.membres_espace m
      where m.espace_id = espaces_partages.id
        and m.user_id = auth.uid()
        and m.role = 'proprietaire'
    )
  )
  with check (
    exists (
      select 1 from public.membres_espace m
      where m.espace_id = espaces_partages.id
        and m.user_id = auth.uid()
        and m.role = 'proprietaire'
    )
  );

drop policy if exists "espaces_partages_delete_proprietaire" on public.espaces_partages;
create policy "espaces_partages_delete_proprietaire" on public.espaces_partages
  for delete using (
    exists (
      select 1 from public.membres_espace m
      where m.espace_id = espaces_partages.id
        and m.user_id = auth.uid()
        and m.role = 'proprietaire'
    )
  );

alter table public.membres_espace enable row level security;

drop policy if exists "membres_espace_select_own_or_cospace" on public.membres_espace;
create policy "membres_espace_select_own_or_cospace" on public.membres_espace
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.membres_espace m2
      where m2.espace_id = membres_espace.espace_id
        and m2.user_id = auth.uid()
    )
  );

drop policy if exists "membres_espace_insert_own" on public.membres_espace;
create policy "membres_espace_insert_own" on public.membres_espace
  for insert with check (user_id = auth.uid());

drop policy if exists "membres_espace_delete_own" on public.membres_espace;
create policy "membres_espace_delete_own" on public.membres_espace
  for delete using (user_id = auth.uid());

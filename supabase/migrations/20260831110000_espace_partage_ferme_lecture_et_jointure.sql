-- Corrige les deux trous de sécurité identifiés avant de brancher l'étape 3
-- du mode espace partagé (lecture cross-utilisateur des enveloppes/
-- transactions) :
--
-- 1. espaces_partages_select_auth ("auth.uid() is not null") permettait à
--    N'IMPORTE QUEL utilisateur authentifié de lister TOUS les codes
--    d'invitation actifs (et désormais le prénom du créateur) de TOUS les
--    comptes, sans jamais avoir besoin de connaître un code.
-- 2. membres_espace_insert_own ("user_id = auth.uid()") permettait à
--    N'IMPORTE QUI de s'auto-ajouter comme membre de N'IMPORTE QUEL espace
--    (espace_id arbitraire dans le payload), sans jamais avoir connu son
--    code — l'appartenance elle-même n'était donc pas protégée du tout.
--
-- RÈGLE À NE JAMAIS CASSER — DEUX ÉCARTS ASSUMÉS PAR RAPPORT AU SQL FOURNI,
-- NÉCESSAIRES POUR NE PAS CASSER L'EXISTANT :
--
-- (a) Pas de fonction `trouver_espace_par_code` séparée : sa seule raison
--     d'être était de préparer un lookup pour `rejoindre_espace_par_code`
--     — inutile de l'exposer comme fonction publique à part si
--     `rejoindre_espace_par_code` fait déjà tout le travail en interne
--     (lookup + vérif expiration + vérif déjà-membre + insert), en une
--     seule fonction atomique. Le SQL fourni pour `trouver_espace_par_code`
--     filtrait aussi `expire_at > now()` DANS le lookup, ce qui aurait
--     rendu "code invalide" et "code expiré" indiscernables (les deux
--     retournent 0 ligne) — cf. RÈGLE "5 CAS DISTINGUÉS" dans
--     utils/espacePartage.ts, en place depuis une tâche précédente. Le SQL
--     ci-dessous sépare explicitement les deux vérifications pour préserver
--     cette distinction. Même chose pour "déjà membre" : le SQL fourni
--     utilisait `on conflict ... do nothing` (échec silencieux,
--     indiscernable d'un succès côté client) — ci-dessous, vérifié
--     explicitement et retourné comme un statut distinct.
--
-- (b) Nouvelle fonction `creer_espace_partage()`, NON demandée mais
--     nécessaire : creerEspacePartage() (utils/espacePartage.ts) fait
--     aujourd'hui un .insert().select() direct sur espaces_partages. Une
--     fois la policy SELECT restreinte aux membres (ci-dessous), ce
--     .select() ne pourrait plus jamais lire la ligne qu'il vient de créer
--     — au moment de l'insert, son auteur n'est PAS ENCORE membre
--     (l'insert dans membres_espace est une étape séparée juste après).
--     Sans cette fonction, la création d'espace serait purement et
--     simplement cassée par ce correctif. `security definer` bypass RLS en
--     interne, donc l'ordre insert-espace / insert-membre n'a plus
--     d'importance vis-à-vis de la lecture.

-- === 1. espaces_partages : lecture restreinte aux membres ==================
drop policy if exists "espaces_partages_select_auth" on public.espaces_partages;
create policy "espaces_partages_select_membres" on public.espaces_partages
  for select using (
    public.est_membre_espace(id)
  );

-- Plus aucun code client ne doit insérer directement dans cette table —
-- creer_espace_partage() (security definer, ci-dessous) est désormais le
-- SEUL chemin de création, et bypass cette policy par construction. La
-- retirer ferme une voie d'écriture directe désormais inutile.
drop policy if exists "espaces_partages_insert_auth" on public.espaces_partages;

-- === 2. membres_espace : plus d'auto-ajout direct ===========================
drop policy if exists "membres_espace_insert_own" on public.membres_espace;

-- === 3. Fonctions security definer — seuls points d'entrée pour créer un
-- espace ou en rejoindre un ================================================

create or replace function public.creer_espace_partage()
returns table (
  id uuid,
  code varchar,
  created_at timestamptz,
  expire_at timestamptz,
  cree_par_prenom varchar
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prenom varchar(50);
  v_code varchar(12);
  v_espace_id uuid;
  v_tentatives int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select p.prenom into v_prenom from public.profils p where p.user_id = auth.uid();

  loop
    v_code := 'VISTA-' || (
      select string_agg(
        substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1),
        ''
      )
      from generate_series(1, 6)
    );
    begin
      insert into public.espaces_partages (code, cree_par_prenom)
      values (v_code, v_prenom)
      returning espaces_partages.id into v_espace_id;
      exit;
    exception when unique_violation then
      v_tentatives := v_tentatives + 1;
      if v_tentatives > 8 then
        raise exception 'code_generation_failed';
      end if;
    end;
  end loop;

  insert into public.membres_espace (espace_id, user_id, role, prenom)
  values (v_espace_id, auth.uid(), 'proprietaire', v_prenom);

  return query
    select e.id, e.code, e.created_at, e.expire_at, e.cree_par_prenom
    from public.espaces_partages e
    where e.id = v_espace_id;
end;
$$;

-- RÈGLE À NE JAMAIS CASSER — 5 STATUTS DISTINGUÉS, JAMAIS UN SEUL ÉCHEC
-- GÉNÉRIQUE : cf. utils/espacePartage.ts, ResultatRejoindreEspace. Chaque
-- branche retourne un `statut` texte propre, jamais une exception pour un
-- cas métier normal (code invalide/expiré/déjà membre) — une exception
-- PostgREST devient une erreur HTTP générique côté client, qui perdrait la
-- distinction déjà construite pour les 4 messages utilisateur différents.
create or replace function public.rejoindre_espace_par_code(p_code text)
returns table (
  statut text,
  espace_id uuid,
  code varchar,
  created_at timestamptz,
  expire_at timestamptz,
  cree_par_prenom varchar
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espace public.espaces_partages;
  v_deja_membre boolean;
  v_prenom varchar(50);
begin
  if auth.uid() is null then
    return query select 'erreur_reseau'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  select * into v_espace from public.espaces_partages e where e.code = p_code;

  if v_espace.id is null then
    return query select 'code_invalide'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  if v_espace.expire_at <= now() then
    return query select 'code_expire'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  select exists(
    select 1 from public.membres_espace m
    where m.espace_id = v_espace.id and m.user_id = auth.uid()
  ) into v_deja_membre;

  if v_deja_membre then
    return query select 'deja_membre'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  select p.prenom into v_prenom from public.profils p where p.user_id = auth.uid();

  insert into public.membres_espace (espace_id, user_id, role, prenom)
  values (v_espace.id, auth.uid(), 'membre', v_prenom);

  return query
    select 'succes'::text, v_espace.id, v_espace.code, v_espace.created_at, v_espace.expire_at, v_espace.cree_par_prenom;
end;
$$;

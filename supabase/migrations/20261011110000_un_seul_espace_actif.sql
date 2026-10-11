-- P074 (suite, AUDIT_V1.md, 2026-10-11) — décision de Maëlys : chaque
-- utilisateur appartient à UN SEUL espace partagé ACTIF (2 membres) à la
-- fois. Avant : un membre d'un couple pouvait rejoindre l'espace en attente
-- d'une 3e personne, ou en créer un nouveau (creer_espace_partage en créait
-- un second dès que le premier était actif) — l'app choisissait alors un
-- des espaces, la notification pouvait partir au mauvais partenaire.
--
-- Un espace "en attente" (l'utilisateur seul dedans) ne bloque PAS : les
-- deux partenaires peuvent avoir généré chacun un code, l'un rejoint
-- ensuite celui de l'autre — getMembreEspace (utils/espacePartage.ts)
-- préfère déjà l'espace actif dans ce cas.
--
-- Les deux côtés sont vérifiés (correctif trouvé en revue) : celui qui
-- rejoint, ET les membres de l'espace visé. Sans ce second contrôle : A et
-- B génèrent chacun un code, A rejoint l'espace de B — l'espace en attente
-- de A garde un code valide 24 h ; une 3e personne qui le rejoint mettait
-- A dans deux espaces actifs. Ce code est désormais traité comme expiré
-- ('code_expire', message existant côté app).
--
-- Nouveau statut 'deja_dans_un_espace' (aperçu + adhésion) ; la création
-- lève l'exception 'deja_dans_un_espace'. Ordre des contrôles :
-- deja_membre (même espace) avant deja_dans_un_espace, avant le plafond.
--
-- Additive : une nouvelle fonction + CREATE OR REPLACE (mêmes signatures,
-- droits conservés) des 3 fonctions existantes. Aucune donnée modifiée :
-- un utilisateur déjà dans deux espaces actifs le reste (cas à corriger
-- à la main s'il existe, cf. requête de contrôle en fin de fichier).

-- Interne : appelée uniquement depuis les fonctions security definer
-- ci-dessous, jamais en RPC directe (droits retirés à tous les rôles
-- clients). auth.uid() lu en interne, jamais un paramètre.
create or replace function public.est_dans_un_espace_actif()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.membres_espace m
    where m.user_id = auth.uid()
      and (
        select count(*) from public.membres_espace m2
        where m2.espace_id = m.espace_id
      ) >= 2
  );
$$;

revoke execute on function public.est_dans_un_espace_actif() from public, anon, authenticated;

-- Interne, même régime que ci-dessus : vrai si un membre de p_espace_id
-- appartient déjà à un AUTRE espace actif (2 membres).
create or replace function public.espace_a_un_membre_deja_actif_ailleurs(p_espace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.membres_espace m
    join public.membres_espace autre
      on autre.user_id = m.user_id and autre.espace_id <> p_espace_id
    where m.espace_id = p_espace_id
      and (
        select count(*) from public.membres_espace m2
        where m2.espace_id = autre.espace_id
      ) >= 2
  );
$$;

revoke execute on function public.espace_a_un_membre_deja_actif_ailleurs(uuid) from public, anon, authenticated;

create or replace function public.apercu_espace_par_code(p_code text)
returns table (
  statut text,
  cree_par_prenom varchar
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_espace public.espaces_partages;
  v_nb_membres integer;
begin
  if auth.uid() is null then
    return query select 'erreur_reseau'::text, null::varchar;
    return;
  end if;

  select * into v_espace from public.espaces_partages e where e.code = p_code;

  if v_espace.id is null then
    return query select 'code_invalide'::text, null::varchar;
    return;
  end if;

  if v_espace.expire_at <= now() then
    return query select 'code_expire'::text, null::varchar;
    return;
  end if;

  if exists(
    select 1 from public.membres_espace m
    where m.espace_id = v_espace.id and m.user_id = auth.uid()
  ) then
    return query select 'deja_membre'::text, null::varchar;
    return;
  end if;

  if public.est_dans_un_espace_actif() then
    return query select 'deja_dans_un_espace'::text, null::varchar;
    return;
  end if;

  -- Invitation périmée : un membre de l'espace visé (son créateur) est
  -- déjà dans un AUTRE espace actif — cf. en-tête. Traité comme expiré.
  if public.espace_a_un_membre_deja_actif_ailleurs(v_espace.id) then
    return query select 'code_expire'::text, null::varchar;
    return;
  end if;

  select count(*) into v_nb_membres
  from public.membres_espace m
  where m.espace_id = v_espace.id;

  if v_nb_membres >= 2 then
    return query select 'espace_complet'::text, null::varchar;
    return;
  end if;

  return query select 'ok'::text, v_espace.cree_par_prenom;
end;
$$;

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
  v_nb_membres integer;
  v_prenom varchar(50);
begin
  if auth.uid() is null then
    return query select 'erreur_reseau'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  select * into v_espace from public.espaces_partages e where e.code = p_code for update;

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

  -- RÈGLE À NE JAMAIS CASSER — UN SEUL ESPACE ACTIF (cf. en-tête).
  if public.est_dans_un_espace_actif() then
    return query select 'deja_dans_un_espace'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  -- Invitation périmée (cf. en-tête) : traitée comme expirée.
  if public.espace_a_un_membre_deja_actif_ailleurs(v_espace.id) then
    return query select 'code_expire'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  -- RÈGLE À NE JAMAIS CASSER — PLAFOND DE 2 MEMBRES (P074, cf. en-tête).
  select count(*) into v_nb_membres
  from public.membres_espace m
  where m.espace_id = v_espace.id;

  if v_nb_membres >= 2 then
    return query select 'espace_complet'::text, null::uuid, null::varchar, null::timestamptz, null::timestamptz, null::varchar;
    return;
  end if;

  select p.prenom into v_prenom from public.profils p where p.user_id = auth.uid();

  insert into public.membres_espace (espace_id, user_id, role, prenom)
  values (v_espace.id, auth.uid(), 'membre', v_prenom);

  -- Liaison désormais permanente entre les deux comptes — cf.
  -- 20260831140000_espace_partage_liaison_permanente.sql.
  perform public.desactiver_expiration_espace(v_espace.id);
  select * into v_espace from public.espaces_partages e where e.id = v_espace.id;

  return query
    select 'succes'::text, v_espace.id, v_espace.code, v_espace.created_at, v_espace.expire_at, v_espace.cree_par_prenom;
end;
$$;

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
  v_espace_existant_id uuid;
  v_nb_membres int;
  v_expire_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- RÈGLE À NE JAMAIS CASSER — UN SEUL ESPACE ACTIF (P074, cf. en-tête).
  if public.est_dans_un_espace_actif() then
    raise exception 'deja_dans_un_espace';
  end if;

  select m.espace_id into v_espace_existant_id
  from public.membres_espace m
  where m.user_id = auth.uid()
  limit 1;

  if v_espace_existant_id is not null then
    select count(*) into v_nb_membres
    from public.membres_espace m
    where m.espace_id = v_espace_existant_id;

    select e.expire_at into v_expire_at
    from public.espaces_partages e
    where e.id = v_espace_existant_id;

    if v_nb_membres < 2 and v_expire_at is not null and v_expire_at > now() then
      return query
        select e.id, e.code, e.created_at, e.expire_at, e.cree_par_prenom
        from public.espaces_partages e
        where e.id = v_espace_existant_id;
      return;
    end if;
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

-- Remplace la version de 20260831140000 : identique, sauf le choix de
-- l'espace à quitter (cf. RÈGLE dans le corps).
create or replace function public.quitter_espace_partage()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espace_id uuid;
  v_nb_membres int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- RÈGLE À NE JAMAIS CASSER (P074) : quitter l'espace ACTIF en priorité
  -- (celui que l'app affiche, cf. getMembreEspace), jamais un vieil espace
  -- en attente gardé à côté — avant, `limit 1` sans ordre pouvait dissoudre
  -- l'espace en attente et laisser l'utilisateur dans son espace actif.
  select me.espace_id into v_espace_id
  from public.membres_espace me
  where me.user_id = auth.uid()
  order by (
    select count(*) from public.membres_espace m2
    where m2.espace_id = me.espace_id
  ) desc
  limit 1;

  if v_espace_id is null then
    return;
  end if;

  select count(*) into v_nb_membres
  from public.membres_espace
  where espace_id = v_espace_id;

  if v_nb_membres <= 2 then
    delete from public.espaces_partages where id = v_espace_id;
  else
    delete from public.membres_espace
    where user_id = auth.uid() and espace_id = v_espace_id;
  end if;
end;
$$;

-- Contrôle (lecture seule, à lancer à la main) : utilisateurs déjà dans
-- plus d'un espace actif avant cette migration.
-- select m.user_id, count(*) as nb_espaces_actifs
-- from public.membres_espace m
-- where (select count(*) from public.membres_espace m2 where m2.espace_id = m.espace_id) >= 2
-- group by m.user_id
-- having count(*) > 1;

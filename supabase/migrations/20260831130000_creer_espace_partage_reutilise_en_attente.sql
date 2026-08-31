-- Corrige creer_espace_partage() pour ne pas générer un nouveau code à
-- chaque appel : si l'utilisateur courant a déjà un espace "en attente"
-- (lui seul comme membre, code pas encore expiré), on retourne CET espace
-- au lieu d'en créer un nouveau. Sans ce correctif, rouvrir la modale
-- "Créer un espace" (ex: après avoir quitté l'écran puis y être revenu)
-- générait un code différent à chaque fois, ce qui invaliderait
-- silencieusement un code déjà partagé au partenaire alors qu'il restait
-- valide 24h.
--
-- RÈGLE À NE JAMAIS CASSER — RÉUTILISATION SCOPÉE À "EN ATTENTE ET NON
-- EXPIRÉ" UNIQUEMENT : un espace où l'utilisateur a déjà un partenaire (2
-- membres) n'est jamais retourné ici (l'appelant ne devrait de toute façon
-- jamais atteindre ce chemin depuis l'UI dans ce cas — hors périmètre de ce
-- correctif) ; un espace dont le code a expiré (`expire_at <= now()`) n'est
-- pas non plus réutilisé — un nouveau est créé normalement, cf. demande
-- explicite "le code reste valide 24h depuis sa création, pas besoin de
-- changer la durée d'expiration" (donc jamais de UPDATE expire_at pour
-- "prolonger" un code existant).
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

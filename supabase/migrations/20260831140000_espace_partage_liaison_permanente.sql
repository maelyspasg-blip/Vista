-- Rend la liaison entre deux comptes PERMANENTE une fois établie : le code
-- d'invitation (et son expiration 24h) ne sert qu'à établir la connexion
-- initiale, jamais à la maintenir. RÈGLE À NE JAMAIS CASSER — décision
-- explicite de l'utilisateur : une fois 2 membres dans un espace, plus
-- aucune expiration ne doit jamais s'appliquer, jamais de renouvellement à
-- prévoir côté client.

-- RÈGLE : sql simple (pas plpgsql) — une seule instruction, pas besoin de
-- plus. security definer car appelée depuis rejoindre_espace_par_code()
-- (elle-même security definer) sur un espace dont l'appelant vient tout
-- juste de devenir membre — cohérent avec le reste de ce fichier de
-- fonctions (aucune ne s'appuie sur RLS pour ses propres écritures
-- internes).
create or replace function public.desactiver_expiration_espace(p_espace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.espaces_partages
  set expire_at = '2099-12-31'::timestamptz
  where id = p_espace_id;
$$;

-- Remplace rejoindre_espace_par_code() (migration 20260831110000) pour
-- appeler desactiver_expiration_espace() juste après l'insertion du second
-- membre — RÈGLE À NE JAMAIS CASSER : uniquement à CE moment précis (le
-- code vient de servir à établir la liaison), jamais avant (un espace
-- encore "en attente", un seul membre, doit continuer à expirer
-- normalement après 24h si personne ne rejoint, cf.
-- utils/espacePartage.ts::getMembreEspace statut "en_attente"). Le reste
-- de la fonction est inchangé (mêmes 5 statuts distingués, cf. RÈGLE dans
-- la migration d'origine) — seule la valeur d'expire_at retournée change,
-- puisqu'elle reflète maintenant l'espace après désactivation.
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

  -- Liaison désormais permanente entre les deux comptes — cf. RÈGLE en
  -- tête de fichier.
  perform public.desactiver_expiration_espace(v_espace.id);
  select * into v_espace from public.espaces_partages e where e.id = v_espace.id;

  return query
    select 'succes'::text, v_espace.id, v_espace.code, v_espace.created_at, v_espace.expire_at, v_espace.cree_par_prenom;
end;
$$;

-- RÈGLE À NE JAMAIS CASSER — QUITTER UN ESPACE, LOGIQUE ATOMIQUE CÔTÉ
-- SERVEUR : cf. utils/espacePartage.ts::quitterEspacePartage. Deux cas
-- distincts selon le nombre de membres AU MOMENT DU DÉPART (compté ici,
-- jamais fait confiance à une valeur passée depuis le client, qui pourrait
-- être périmée) :
-- - 2 membres (ou moins, filet de sécurité) : l'espace entier est dissous
--   (delete sur espaces_partages, qui cascade sur membres_espace via la FK
--   `on delete cascade` posée dans la migration de fondations) — les deux
--   comptes sont déliés, pas seulement celui qui quitte.
-- - 3 membres ou plus : seule la ligne membres_espace de l'appelant est
--   supprimée, l'espace continue pour les autres.
-- security definer nécessaire : la policy espaces_partages_delete_proprietaire
-- (migration de fondations) ne permet qu'au PROPRIÉTAIRE de supprimer
-- l'espace — un membre non-propriétaire qui quitte un espace à 2 doit
-- pourtant pouvoir le dissoudre lui aussi (règle métier "l'un ou l'autre"),
-- ce que RLS seule ne permettrait pas.
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

  select espace_id into v_espace_id
  from public.membres_espace
  where user_id = auth.uid()
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

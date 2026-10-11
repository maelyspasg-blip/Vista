-- P074 (AUDIT_V1.md, 2026-10-11) : confirmation avant de rejoindre un espace
-- partagé + plafond de 2 membres.
--
-- 1. FAILLE CORRIGÉE — PLAFOND DE 2 MEMBRES : depuis 20260831140000, le code
--    d'un espace reste valide jusqu'en 2099 une fois le partenaire entré
--    (desactiver_expiration_espace), et rejoindre_espace_par_code ne
--    comptait pas les membres. Une 3e personne connaissant le code (vieille
--    capture d'écran, message transféré...) pouvait donc rejoindre l'espace
--    actif d'un couple et accéder à toutes ses données partagées. Décision
--    de Maëlys du 2026-10-11 : un espace = 2 membres maximum. Les espaces
--    existants ne sont pas modifiés.
--
-- 2. APERÇU AVANT ADHÉSION : nouvelle RPC apercu_espace_par_code(), en
--    lecture seule, pour afficher "Rejoindre l'espace de [Prénom] ?" AVANT
--    toute écriture.
--
-- Additive : CREATE OR REPLACE FUNCTION (même signature pour
-- rejoindre_espace_par_code, droits existants conservés) + une nouvelle
-- fonction. Aucune table, colonne ni donnée modifiée.

-- RÈGLE À NE JAMAIS CASSER — APERÇU SANS EFFET DE BORD : aucune écriture.
-- auth.uid() revalidé en interne (jamais un user_id reçu du client). Le
-- prénom du créateur n'est renvoyé QUE si l'adhésion est possible
-- (statut 'ok') — jamais pour un espace complet, expiré ou déjà rejoint.
-- Mêmes statuts que rejoindre_espace_par_code, pour des messages
-- identiques côté app.
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

revoke execute on function public.apercu_espace_par_code(text) from public;
revoke execute on function public.apercu_espace_par_code(text) from anon;
grant execute on function public.apercu_espace_par_code(text) to authenticated;

-- Remplace la version de 20260831140000 : identique, plus (a) le verrou
-- `for update` sur la ligne de l'espace (deux adhésions simultanées avec le
-- même code sont sérialisées : la seconde voit 2 membres) et (b) le statut
-- 'espace_complet'.
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

-- Défense en profondeur (revue sécurité P074) : rejoindre_espace_par_code
-- n'avait jamais eu de revoke/grant explicite (PUBLIC et anon gardaient
-- EXECUTE — sans effet, un appel anonyme renvoie 'erreur_reseau').
revoke execute on function public.rejoindre_espace_par_code(text) from public, anon;
grant execute on function public.rejoindre_espace_par_code(text) to authenticated;

-- desactiver_expiration_espace n'a qu'un appelant légitime :
-- rejoindre_espace_par_code (security definer, donc exécutée avec les droits
-- du propriétaire — ce revoke ne la gêne pas). En RPC directe, le créateur
-- d'un espace encore en attente pouvait rendre son code valide jusqu'en 2099.
revoke execute on function public.desactiver_expiration_espace(uuid) from public, anon, authenticated;

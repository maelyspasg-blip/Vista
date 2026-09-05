-- PLANNING PARTAGÉ — RPC DE FUSION. Étape 3/3, après 20260905090000
-- (schéma) et 20260905091000 (RLS).
--
-- RÈGLE À NE JAMAIS CASSER — ATOMIQUE ET IDEMPOTENTE, JAMAIS UN DOUBLE
-- INSERT/DELETE CÔTÉ CLIENT : les deux comptes d'un même espace peuvent
-- exécuter la détection de doublons EN MÊME TEMPS (chacun charge son propre
-- planning + celui du partenaire, cf. app/(tabs)/planning.tsx) — sans cette
-- RPC security definer, une vraie course est possible (les deux tentent de
-- fusionner la même paire, produisant potentiellement deux événements
-- "commun" au lieu d'un, ou une erreur de ligne déjà supprimée). Même
-- convention que creer_espace_partage/rejoindre_espace_par_code/
-- quitter_espace_partage : un statut texte distingué est retourné pour
-- chaque cas métier, JAMAIS une exception PostgREST générique — un appel
-- concurrent qui arrive après coup reçoit 'deja_fusionne' proprement plutôt
-- que de planter.
--
-- RÈGLE À NE JAMAIS CASSER — REVALIDATION D'AUTORISATION DANS LA FONCTION,
-- JAMAIS FAIT CONFIANCE AU CLIENT : security definer contourne RLS en
-- interne, donc cette fonction revérifie elle-même que l'appelant possède
-- p_mon_evenement_id ET que le propriétaire de p_evenement_partenaire_id
-- partage bien un espace avec l'appelant — jamais une simple lecture des
-- deux lignes sans ce contrôle explicite.
create or replace function public.fusionner_evenements(
  p_mon_evenement_id uuid,
  p_evenement_partenaire_id uuid
)
returns table (statut text, nouvel_evenement_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mon_event record;
  v_event_partenaire record;
  v_espace_id uuid;
  v_nouvel_id uuid;
begin
  select * into v_mon_event
  from public.evenements
  where id = p_mon_evenement_id and user_id = auth.uid();

  if not found then
    return query select 'introuvable'::text, null::uuid;
    return;
  end if;

  select * into v_event_partenaire
  from public.evenements
  where id = p_evenement_partenaire_id;

  if not found then
    -- Déjà fusionné (ou supprimé) par l'autre compte entre-temps — pas une
    -- erreur, cf. RÈGLE en tête de fichier.
    return query select 'deja_fusionne'::text, null::uuid;
    return;
  end if;

  if not public.partage_un_espace_avec(v_event_partenaire.user_id) then
    return query select 'non_autorise'::text, null::uuid;
    return;
  end if;

  -- RÈGLE À NE JAMAIS CASSER — REVALIDATION DU MASQUAGE, MÊME EN SECURITY
  -- DEFINER : security definer contourne RLS, donc cette fonction lirait
  -- v_event_partenaire même si son propriétaire a activé
  -- masquer_evenements_personnels et que la ligne est 'personnel' (jamais
  -- censée être visible ni son id jamais transmis au client, cf. RÈGLE dans
  -- evenements_select_espace_partage, migration 20260905091000) — sans ce
  -- contrôle, fusionner_evenements deviendrait un moyen de contourner le
  -- masquage (fuite du nom/date/heure/montant d'un événement personnel
  -- masqué via un id deviné/obtenu autrement). Même formule que la policy
  -- SELECT, gardée strictement identique.
  if v_event_partenaire.visibilite <> 'commun' and coalesce(
    (select masquer_evenements_personnels from public.profils where profils.user_id = v_event_partenaire.user_id),
    false
  ) then
    return query select 'non_autorise'::text, null::uuid;
    return;
  end if;

  select m1.espace_id into v_espace_id
  from public.membres_espace m1
  join public.membres_espace m2 on m1.espace_id = m2.espace_id
  where m1.user_id = auth.uid() and m2.user_id = v_event_partenaire.user_id
  limit 1;

  insert into public.evenements (
    user_id, nom, date, date_fin, heure, duree, couleur,
    est_financier, montant, categorie_liee, recurrent, frequence,
    toute_la_journee, notifier_actif, montant_applique, visibilite, espace_id
  ) values (
    auth.uid(), v_mon_event.nom, v_mon_event.date, v_mon_event.date_fin,
    v_mon_event.heure, v_mon_event.duree, v_mon_event.couleur,
    v_mon_event.est_financier, v_mon_event.montant, v_mon_event.categorie_liee,
    v_mon_event.recurrent, v_mon_event.frequence, v_mon_event.toute_la_journee,
    v_mon_event.notifier_actif, v_mon_event.montant_applique, 'commun', v_espace_id
  )
  returning id into v_nouvel_id;

  delete from public.evenements where id = p_mon_evenement_id;
  delete from public.evenements where id = p_evenement_partenaire_id;

  return query select 'succes'::text, v_nouvel_id;
end;
$$;

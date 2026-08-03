-- Enrichit les données de démo du compte invité (setup_guest_account) :
-- - 2 catégories supplémentaires (Santé, Téléphone & Internet) pour une
--   répartition plus variée dans Aperçu/Stats.
-- - Plus de transactions détaillées sur le mois en cours.
-- - Un historique de 3 mois archivés (snapshots_mois + snapshot_enveloppes)
--   pour que les graphiques d'évolution et les comparaisons "mois dernier"
--   ne soient plus vides dès la création du compte invité — jamais de
--   transactions ré-insérées pour un mois déjà archivé (même convention que
--   archiverMoisActuelInterne côté app : le détail ligne à ligne d'un mois
--   passé ne survit que sous forme agrégée dans snapshot_enveloppes).
-- - Une épargne mensuelle (profils.epargne_mois + snapshots_mois.epargne)
--   qui progresse sur les 3 mois passés, jusqu'au mois en cours.
--
-- Les catégories du mois en cours et des mois archivés partagent le même
-- enveloppe_id (continuité budget/mois-à-mois), exactement comme pour les
-- catégories déjà en place (Salaire/Logement/Alimentation/Transport/Loisirs).

create or replace function public.setup_guest_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alimentation_id uuid;
  v_transport_id uuid;
  v_logement_id uuid;
  v_loisirs_id uuid;
  v_salaire_id uuid;
  v_sante_id uuid;
  v_telecom_id uuid;
  v_mois_debut date := date_trunc('month', now())::date;
  v_mois_m1 date := (date_trunc('month', now()) - interval '1 month')::date;
  v_mois_m2 date := (date_trunc('month', now()) - interval '2 months')::date;
  v_mois_m3 date := (date_trunc('month', now()) - interval '3 months')::date;
  v_snap_m1_id uuid;
  v_snap_m2_id uuid;
  v_snap_m3_id uuid;
begin
  insert into public.profils
    (user_id, prenom, argent_disponible, is_guest, guest_expires_at, onboarding_complete, epargne_mois)
  values
    (new.id, 'Invité', 850, true, now() + interval '7 days', true, 150)
  on conflict (user_id) do update
    set is_guest = true,
        guest_expires_at = now() + interval '7 days',
        onboarding_complete = true,
        epargne_mois = 150;

  -- Catégories (mois en cours) — mêmes ids réutilisés dans les snapshots
  -- archivés ci-dessous.
  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois, date_fixe, payee, mois_comptage)
  values
    (new.id, 'Salaire', 1800, 1800, '#845EC2', true, 'Entrée', true, v_mois_debut, true, v_mois_debut)
  returning id into v_salaire_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Logement', 750, 750, '#6BCB77', true, 'Fixe', true)
  returning id into v_logement_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Téléphone & Internet', 45, 45, '#5C6BC0', true, 'Fixe', true)
  returning id into v_telecom_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Alimentation', 265, 400, '#FF6B6B', false, 'Variable', false)
  returning id into v_alimentation_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Transport', 62, 150, '#4D96FF', false, 'Variable', false)
  returning id into v_transport_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Loisirs', 48, 120, '#FFD93D', false, 'Variable', false)
  returning id into v_loisirs_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Santé', 38, 60, '#FF9F43', false, 'Variable', false)
  returning id into v_sante_id;

  -- Transactions détaillées du mois en cours.
  insert into public.transactions (user_id, enveloppe_id, nom, montant, date) values
    (new.id, v_salaire_id, 'Salaire', 1800, v_mois_debut + 1),
    (new.id, v_logement_id, 'Loyer', 750, v_mois_debut + 2),
    (new.id, v_alimentation_id, 'Supermarché', 84, v_mois_debut + 3),
    (new.id, v_transport_id, 'Essence', 45, v_mois_debut + 4),
    (new.id, v_telecom_id, 'Forfait mobile + box internet', 45, v_mois_debut + 5),
    (new.id, v_sante_id, 'Pharmacie', 22, v_mois_debut + 6),
    (new.id, v_alimentation_id, 'Marché', 37, v_mois_debut + 8),
    (new.id, v_loisirs_id, 'Cinéma', 24, v_mois_debut + 9),
    (new.id, v_alimentation_id, 'Supermarché', 91, v_mois_debut + 15),
    (new.id, v_transport_id, 'Transports en commun', 17, v_mois_debut + 16),
    (new.id, v_loisirs_id, 'Abonnement streaming', 14, v_mois_debut + 18),
    (new.id, v_sante_id, 'Médecin', 16, v_mois_debut + 19),
    (new.id, v_alimentation_id, 'Boulangerie', 53, v_mois_debut + 20),
    (new.id, v_loisirs_id, 'Restaurant', 10, v_mois_debut + 21);

  -- Mois M-3 : épargne encore modeste, quelques postes plus serrés.
  insert into public.snapshots_mois (user_id, mois, annee, epargne, disponible, total_depense)
  values (
    new.id,
    extract(month from v_mois_m3)::int - 1,
    extract(year from v_mois_m3)::int,
    90, 1800, 1507
  )
  returning id into v_snap_m3_id;

  insert into public.snapshot_enveloppes (snapshot_mois_id, enveloppe_id, nom, depense, budget, couleur, type) values
    (v_snap_m3_id, v_salaire_id, 'Salaire', 1800, 1800, '#845EC2', 'Entrée'),
    (v_snap_m3_id, v_logement_id, 'Logement', 750, 750, '#6BCB77', 'Fixe'),
    (v_snap_m3_id, v_telecom_id, 'Téléphone & Internet', 42, 45, '#5C6BC0', 'Fixe'),
    (v_snap_m3_id, v_alimentation_id, 'Alimentation', 378, 400, '#FF6B6B', 'Variable'),
    (v_snap_m3_id, v_transport_id, 'Transport', 132, 150, '#4D96FF', 'Variable'),
    (v_snap_m3_id, v_loisirs_id, 'Loisirs', 95, 120, '#FFD93D', 'Variable'),
    (v_snap_m3_id, v_sante_id, 'Santé', 20, 60, '#FF9F43', 'Variable');

  -- Mois M-2 : quelques dépassements de budget (Alimentation, Loisirs).
  insert into public.snapshots_mois (user_id, mois, annee, epargne, disponible, total_depense)
  values (
    new.id,
    extract(month from v_mois_m2)::int - 1,
    extract(year from v_mois_m2)::int,
    120, 1800, 1658
  )
  returning id into v_snap_m2_id;

  insert into public.snapshot_enveloppes (snapshot_mois_id, enveloppe_id, nom, depense, budget, couleur, type) values
    (v_snap_m2_id, v_salaire_id, 'Salaire', 1800, 1800, '#845EC2', 'Entrée'),
    (v_snap_m2_id, v_logement_id, 'Logement', 750, 750, '#6BCB77', 'Fixe'),
    (v_snap_m2_id, v_telecom_id, 'Téléphone & Internet', 45, 45, '#5C6BC0', 'Fixe'),
    (v_snap_m2_id, v_alimentation_id, 'Alimentation', 410, 400, '#FF6B6B', 'Variable'),
    (v_snap_m2_id, v_transport_id, 'Transport', 148, 150, '#4D96FF', 'Variable'),
    (v_snap_m2_id, v_loisirs_id, 'Loisirs', 130, 120, '#FFD93D', 'Variable'),
    (v_snap_m2_id, v_sante_id, 'Santé', 55, 60, '#FF9F43', 'Variable');

  -- Mois M-1 : retour dans les clous, épargne en hausse.
  insert into public.snapshots_mois (user_id, mois, annee, epargne, disponible, total_depense)
  values (
    new.id,
    extract(month from v_mois_m1)::int - 1,
    extract(year from v_mois_m1)::int,
    150, 1800, 1623
  )
  returning id into v_snap_m1_id;

  insert into public.snapshot_enveloppes (snapshot_mois_id, enveloppe_id, nom, depense, budget, couleur, type) values
    (v_snap_m1_id, v_salaire_id, 'Salaire', 1800, 1800, '#845EC2', 'Entrée'),
    (v_snap_m1_id, v_logement_id, 'Logement', 750, 750, '#6BCB77', 'Fixe'),
    (v_snap_m1_id, v_telecom_id, 'Téléphone & Internet', 45, 45, '#5C6BC0', 'Fixe'),
    (v_snap_m1_id, v_alimentation_id, 'Alimentation', 395, 400, '#FF6B6B', 'Variable'),
    (v_snap_m1_id, v_transport_id, 'Transport', 141, 150, '#4D96FF', 'Variable'),
    (v_snap_m1_id, v_loisirs_id, 'Loisirs', 108, 120, '#FFD93D', 'Variable'),
    (v_snap_m1_id, v_sante_id, 'Santé', 34, 60, '#FF9F43', 'Variable');

  return new;
end;
$$;

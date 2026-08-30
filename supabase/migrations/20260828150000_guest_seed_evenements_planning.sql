-- Ajoute des événements Planning réalistes au seed du compte invité
-- (setup_guest_account) : jusqu'ici aucun événement n'était semé, l'onglet
-- Planning d'un compte invité fraîchement créé était donc entièrement vide.
--
-- Événements financiers (liés à une catégorie du mois en cours par
-- categorie_liee, comparé par NOM — cf. app/(tabs)/planning.tsx:579) :
-- Loyer/Forfait mobile/Box internet/Netflix récurrents mensuels (montant et
-- catégorie alignés sur les enveloppes déjà semées par
-- 20260828140000_guest_seed_fix_mois_courant.sql), Courses récurrent
-- hebdomadaire (tous les mercredis), Médecin ponctuel.
--
-- Événements non financiers : Réunion équipe et Rendez-vous coiffeur
-- (ponctuels), Sport (récurrent, 2x/semaine via deux lignes distinctes),
-- Anniversaire ami et Appel famille (ponctuels). Les dates "un lundi",
-- "un samedi", "un dimanche" sont calculées par rapport au 1er du mois en
-- cours (jamais codées en dur sur un mois calendaire précis, puisque ce
-- trigger s'exécute à la création de CHAQUE nouveau compte invité, à
-- n'importe quel mois).
--
-- Le mois suivant n'a pas besoin de recevoir les événements récurrents en
-- double : genererOccurrencesEvenement (utils/evenements.ts) les étend déjà
-- automatiquement (frequence='mois'/'semaine' avancent respectivement de 1
-- mois / 7 jours depuis leur date de base) — seuls Rendez-vous coiffeur et
-- Appel famille (ponctuels) reçoivent une seconde ligne pour le mois
-- suivant, pour qu'il ne paraisse pas vide.

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
  v_telephonie_id uuid;
  v_internet_id uuid;
  v_remboursement_sante_id uuid;
  v_prime_id uuid;
  v_allocation_id uuid;
  v_virement_id uuid;
  v_mois_debut date := date_trunc('month', now())::date;
  v_mois_m1 date := (date_trunc('month', now()) - interval '1 month')::date;
  v_mois_m2 date := (date_trunc('month', now()) - interval '2 months')::date;
  v_mois_m3 date := (date_trunc('month', now()) - interval '3 months')::date;
  v_mois_suivant date := (date_trunc('month', now()) + interval '1 month')::date;
  -- Premier lundi/mardi/mercredi/jeudi/samedi/dimanche sur ou après
  -- v_mois_debut — extract(dow from ...) : 0=dimanche .. 6=samedi.
  v_premier_lundi date := v_mois_debut + ((1 - extract(dow from v_mois_debut)::int + 7) % 7);
  v_premier_mardi date := v_mois_debut + ((2 - extract(dow from v_mois_debut)::int + 7) % 7);
  v_premier_mercredi date := v_mois_debut + ((3 - extract(dow from v_mois_debut)::int + 7) % 7);
  v_premier_jeudi date := v_mois_debut + ((4 - extract(dow from v_mois_debut)::int + 7) % 7);
  v_premier_samedi date := v_mois_debut + ((6 - extract(dow from v_mois_debut)::int + 7) % 7);
  v_premier_dimanche date := v_mois_debut + ((0 - extract(dow from v_mois_debut)::int + 7) % 7);
  v_samedi_suivant date := v_mois_suivant + ((6 - extract(dow from v_mois_suivant)::int + 7) % 7);
  v_dimanche_suivant date := v_mois_suivant + ((0 - extract(dow from v_mois_suivant)::int + 7) % 7);
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

  -- Entrées d'argent ponctuelles supplémentaires (non récurrentes) : même
  -- convention de colonnes que Salaire ci-dessus, sans repete_chaque_mois.
  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, date_fixe, payee, mois_comptage)
  values
    (new.id, 'Remboursement santé', 45, 45, '#20C997', false, 'Entrée', v_mois_debut + 7, true, v_mois_debut)
  returning id into v_remboursement_sante_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, date_fixe, payee, mois_comptage)
  values
    (new.id, 'Prime', 200, 200, '#F4A261', false, 'Entrée', v_mois_debut + 10, true, v_mois_debut)
  returning id into v_prime_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, date_fixe, payee, mois_comptage)
  values
    (new.id, 'Allocation (CAF)', 180, 180, '#4D96FF', false, 'Entrée', v_mois_debut + 13, true, v_mois_debut)
  returning id into v_allocation_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, date_fixe, payee, mois_comptage)
  values
    (new.id, 'Virement reçu', 100, 100, '#9B5DE5', false, 'Entrée', v_mois_debut + 17, true, v_mois_debut)
  returning id into v_virement_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Logement', 700, 700, '#6BCB77', true, 'Fixe', true)
  returning id into v_logement_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Téléphonie', 30, 30, '#5C6BC0', true, 'Fixe', true)
  returning id into v_telephonie_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Internet', 40, 40, '#3D5AFE', true, 'Fixe', true)
  returning id into v_internet_id;

  -- "Téléphone & Internet" combinée : conservée UNIQUEMENT pour que les 3
  -- snapshots archivés (M-1/M-2/M-3, déjà écrits) continuent de résoudre
  -- leur clé étrangère enveloppe_id — repete_chaque_mois = false et aucun
  -- mois_comptage courant, donc estCategorieActiveCeMois() l'exclut du mois
  -- en cours (remplacée par Téléphonie + Internet ci-dessus).
  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois, mois_comptage)
  values
    (new.id, 'Téléphone & Internet', 45, 45, '#5C6BC0', false, 'Fixe', false, v_mois_m1)
  returning id into v_telecom_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois, mois_comptage)
  values
    (new.id, 'Alimentation', 180, 300, '#FF6B6B', false, 'Variable', false, v_mois_debut)
  returning id into v_alimentation_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois, mois_comptage)
  values
    (new.id, 'Transport', 95, 150, '#4D96FF', false, 'Variable', false, v_mois_debut)
  returning id into v_transport_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois, mois_comptage)
  values
    (new.id, 'Loisirs', 75, 120, '#FFD93D', false, 'Variable', false, v_mois_debut)
  returning id into v_loisirs_id;

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois, mois_comptage)
  values
    (new.id, 'Santé', 45, 80, '#FF9F43', false, 'Variable', false, v_mois_debut)
  returning id into v_sante_id;

  -- Transactions détaillées du mois en cours.
  insert into public.transactions (user_id, enveloppe_id, nom, montant, date) values
    (new.id, v_salaire_id, 'Salaire', 1800, v_mois_debut + 1),
    (new.id, v_logement_id, 'Loyer', 700, v_mois_debut + 2),
    (new.id, v_alimentation_id, 'Carrefour', 65, v_mois_debut + 3),
    (new.id, v_transport_id, 'SNCF', 60, v_mois_debut + 4),
    (new.id, v_telephonie_id, 'Forfait mobile', 30, v_mois_debut + 5),
    (new.id, v_internet_id, 'Box internet', 40, v_mois_debut + 5),
    (new.id, v_sante_id, 'Pharmacie', 25, v_mois_debut + 6),
    (new.id, v_remboursement_sante_id, 'Remboursement santé', 45, v_mois_debut + 7),
    (new.id, v_alimentation_id, 'Marché', 45, v_mois_debut + 8),
    (new.id, v_loisirs_id, 'Cinéma', 25, v_mois_debut + 9),
    (new.id, v_prime_id, 'Prime', 200, v_mois_debut + 10),
    (new.id, v_allocation_id, 'Allocation (CAF)', 180, v_mois_debut + 13),
    (new.id, v_alimentation_id, 'Auchan', 70, v_mois_debut + 15),
    (new.id, v_transport_id, 'Essence', 35, v_mois_debut + 16),
    (new.id, v_virement_id, 'Virement reçu', 100, v_mois_debut + 17),
    (new.id, v_sante_id, 'Médecin', 20, v_mois_debut + 19),
    (new.id, v_loisirs_id, 'Restaurant', 50, v_mois_debut + 21);

  -- Événements Planning du mois en cours — categorie_liee comparé par NOM
  -- (jamais par id) côté client, cf. app/(tabs)/planning.tsx:579. Les
  -- événements récurrents (recurrent=true) s'étendent automatiquement au(x)
  -- mois suivant(s) côté client (genererOccurrencesEvenement,
  -- utils/evenements.ts) — jamais besoin de semer une ligne par occurrence.
  insert into public.evenements
    (user_id, nom, date, heure, duree, couleur, est_financier, montant, categorie_liee, recurrent, frequence, toute_la_journee, notifier_actif) values
    -- Financiers, liés aux catégories du mois en cours.
    (new.id, 'Loyer', v_mois_debut, '00:00', 1, '#6BCB77', true, 700, 'Logement', true, 'mois', true, false),
    (new.id, 'Forfait mobile', v_mois_debut + 4, '00:00', 1, '#5C6BC0', true, 30, 'Téléphonie', true, 'mois', true, false),
    (new.id, 'Box internet', v_mois_debut + 4, '00:00', 1, '#3D5AFE', true, 40, 'Internet', true, 'mois', true, false),
    (new.id, 'Courses', v_premier_mercredi, '10:00', 1, '#FF6B6B', true, 55, 'Alimentation', true, 'semaine', false, false),
    (new.id, 'Abonnement Netflix', v_mois_debut + 14, '00:00', 1, '#FFD93D', true, 13, 'Loisirs', true, 'mois', true, false),
    (new.id, 'Médecin', v_mois_debut + 17, '14:30', 0.5, '#FF9F43', true, 25, 'Santé', false, null, false, false),
    -- Non financiers.
    (new.id, 'Réunion équipe', v_premier_lundi, '09:00', 1.5, '#1982C4', false, null, null, false, null, false, false),
    (new.id, 'Sport', v_premier_mardi, '19:00', 1.5, '#3AA655', false, null, null, true, 'semaine', false, false),
    (new.id, 'Sport', v_premier_jeudi, '19:00', 1.5, '#3AA655', false, null, null, true, 'semaine', false, false),
    (new.id, 'Anniversaire ami', v_premier_samedi + 7, '00:00', 1, '#8B6FE8', false, null, null, false, null, true, false),
    (new.id, 'Appel famille', v_premier_dimanche, '11:00', 1, '#4ECDC4', false, null, null, false, null, false, false),
    (new.id, 'Rendez-vous coiffeur', v_premier_samedi, '10:00', 1, '#E8A33D', false, null, null, false, null, false, false),
    -- Quelques événements ponctuels du mois suivant, pour que Planning n'y
    -- paraisse pas vide (en plus des récurrents ci-dessus qui s'y étendent
    -- déjà automatiquement).
    (new.id, 'Rendez-vous coiffeur', v_samedi_suivant, '10:00', 1, '#E8A33D', false, null, null, false, null, false, false),
    (new.id, 'Appel famille', v_dimanche_suivant, '11:00', 1, '#4ECDC4', false, null, null, false, null, false, false);

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

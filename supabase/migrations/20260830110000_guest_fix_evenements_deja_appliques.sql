-- ROOT CAUSE TROUVÉE (cf. investigation demandée, résumée ici) : ce n'est PAS
-- un problème de données ni de setup_guest_account() lui-même (ses valeurs
-- depense/budget pour Logement/Internet/Téléphonie sont déjà correctes
-- depuis 20260830100000 : 700/700, 40/40, 30/30). Le coupable est
-- verifierEvenementsFinanciersInterne() (app/store.ts, ~ligne 1311, appelée
-- via objStore.verifierEvenementsFinanciers() dans app/(tabs)/_layout.tsx —
-- même verifierEtat() que verifierEcheancesFixes, exécutée au montage + à
-- chaque intervalle + à chaque retour au premier plan) :
--
--   const aAppliquer = etat.evenements.filter((e) => {
--     if (!e.estFinancier || !e.montant) return false;
--     if (!e.categorieLiee || e.categorieLiee === "Aucune") return false;
--     if (e.montantApplique) return false;
--     const dateEvenement = new Date(e.date);
--     dateEvenement.setHours(0, 0, 0, 0);
--     return dateEvenement <= aujourdhui;
--   });
--   ...
--   enveloppesMaj = enveloppesMaj.map((env) =>
--     env.nom === e.categorieLiee
--       ? { ...env, depense: env.depense + (e.montant ?? 0) }
--       : env,
--   );
--
-- Elle ADDITIONNE `e.montant` à `depense` pour TOUT événement financier
-- (est_financier=true) lié par NOM à une catégorie (categorie_liee), dont la
-- date est passée et qui n'a pas encore été "appliqué" (montant_applique).
-- AUCUN filtre sur le type de catégorie ici (contrairement à
-- ajusterForecastEvenementsFinanciers, qui est explicitement réservée aux
-- catégories Variable pour le FORECAST de budget — un mécanisme séparé) :
-- c'est un comportement VOULU et utilisé par de vrais utilisateurs (cf.
-- app/(tabs)/planning.tsx:1888-1893, le sélecteur de catégorie d'un
-- événement financier "dépense" propose explicitement `env.type !==
-- "Entrée"`, donc Fixe ET Variable) — retirer cette capacité serait une
-- régression fonctionnelle, pas un correctif.
--
-- Le vrai bug est dans les DONNÉES DE SEED : setup_guest_account() insère 6
-- événements financiers récurrents/ponctuels (Loyer/Forfait mobile/Box
-- internet liés à Logement/Téléphonie/Internet ; Courses/Abonnement
-- Netflix/Médecin liés à Alimentation/Loisirs/Santé) dont le montant est
-- DÉJÀ intégralement compté dans le `depense` seedé de leur catégorie (700/
-- 30/40 pour les 3 Fixe ; 180/75/45 pour les 3 Variable, exactement égal à
-- la somme des transactions détaillées insérées) — mais SANS jamais mettre
-- `montant_applique = true` sur ces 6 lignes. Résultat : dès la première
-- exécution de verifierEcheancesFixesInterne/verifierEvenementsFinanciers
-- après la création du compte (v_mois_debut = le 1er du mois, TOUJOURS
-- <= aujourd'hui pour un compte fraîchement créé ce mois-ci), ces 6
-- événements sont considérés "non encore appliqués" et leur montant est
-- ADDITIONNÉ une seconde fois à la dépense déjà seedée — d'où 700+700=1400,
-- 30+30=60, 40+40=80 pour les 3 catégories Fixe (exactement les valeurs
-- rapportées), et potentiellement le même problème (non encore rapporté)
-- sur Alimentation/Loisirs/Santé selon la date du jour vs la date de
-- l'événement (premier mercredi / jour 15 / jour 18 du mois). C'est
-- pourquoi une correction SQL sur `enveloppes.depense` seule "revient" à
-- chaque nouveau compte invité créé pour tester : le code client est
-- CORRECT et rejoue fidèlement les événements non marqués appliqués à
-- chaque nouveau compte, ce n'est jamais le même compte qui se re-corrompt
-- tout seul.
--
-- appliquerEnveloppes() (vérifié, app/store.ts:490) ne fait QUE pousser vers
-- Supabase le tableau qu'on lui donne (+ diff de suppression) — aucun
-- recalcul interne. chargerEnveloppes() (vérifié, app/store.ts:1676) est un
-- simple SELECT * sans transformation — ne "réécrase" rien, il reflète
-- fidèlement Supabase. Le rechargement n'est pas la cause : c'est le calcul
-- qui s'exécute JUSTE APRÈS le chargement, dans le même verifierEtat().
--
-- CORRECTIF : marquer ces 6 événements `montant_applique = true` dès leur
-- insertion (leur montant est déjà reflété dans le `depense` seedé, ils
-- n'ont donc plus rien à "appliquer") — aucun changement de code
-- applicatif nécessaire, verifierEvenementsFinanciersInterne() reste
-- inchangée et continue de fonctionner normalement pour de vrais
-- événements créés par l'utilisateur.

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
  v_objectif_vacances_id uuid;
  v_objectif_urgence_id uuid;
  v_objectif_telephone_id uuid;
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

  -- RÈGLE À NE JAMAIS CASSER — VALEURS EXACTES VÉRIFIÉES : depense = budget
  -- pour toute catégorie Fixe du compte invité (700 pour Logement, 30 pour
  -- Téléphonie, 40 pour Internet) — jamais un multiple de ces valeurs. Une
  -- catégorie Fixe est toujours entièrement dépensée, son montant ne varie
  -- jamais tout seul.
  if exists (
    select 1 from public.enveloppes where user_id = new.id and nom = 'Logement'
  ) then
    select id into v_logement_id
    from public.enveloppes
    where user_id = new.id and nom = 'Logement'
    order by (type = 'Fixe') desc
    limit 1;
  else
    insert into public.enveloppes
      (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
    values
      (new.id, 'Logement', 700, 700, '#6BCB77', true, 'Fixe', true)
    returning id into v_logement_id;
  end if;

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

  -- Objectifs d'épargne — cohérents avec le salaire de 1800€ (450+1200+600
  -- = 2250€ de progression cumulée sur plusieurs mois, jamais une seule
  -- fois sur un seul salaire) et avec l'épargne mensuelle du compte
  -- (epargne_mois = 150€ ci-dessus, cf. profils) : chaque objectif ci-
  -- dessous a son propre rythme mensuel indépendant de epargne_mois — les
  -- deux mécanismes coexistent déjà ailleurs dans l'app (une contribution
  -- d'objectif n'est pas comptée dans epargneMois, cf. epargneGenerique
  -- dans app/(tabs)/index.tsx).
  insert into public.objectifs
    (user_id, nom, cible, actuel, couleur, recurrent, montant_mensuel, jour_du_mois, dernier_versement_mois, dernier_versement_annee, contribution_mois, ferme)
  values
    (new.id, 'Vacances', 1500, 450, '#4ECDC4', true, 150, 5,
     extract(month from v_mois_debut)::int - 1, extract(year from v_mois_debut)::int, 150, false)
  returning id into v_objectif_vacances_id;

  insert into public.objectifs
    (user_id, nom, cible, actuel, couleur, recurrent, montant_mensuel, jour_du_mois, dernier_versement_mois, dernier_versement_annee, contribution_mois, ferme)
  values
    (new.id, 'Fonds d''urgence', 3000, 1200, '#2E86AB', true, 200, 10,
     extract(month from v_mois_debut)::int - 1, extract(year from v_mois_debut)::int, 200, false)
  returning id into v_objectif_urgence_id;

  insert into public.objectifs
    (user_id, nom, cible, actuel, couleur, recurrent, montant_mensuel, jour_du_mois, dernier_versement_mois, dernier_versement_annee, contribution_mois, ferme)
  values
    (new.id, 'Nouveau téléphone', 800, 600, '#8B6FE8', true, 150, 15,
     extract(month from v_mois_debut)::int - 1, extract(year from v_mois_debut)::int, 150, false)
  returning id into v_objectif_telephone_id;

  -- Événements Planning du mois en cours — categorie_liee comparé par NOM
  -- (jamais par id) côté client, cf. app/(tabs)/planning.tsx:579. Les
  -- événements récurrents (recurrent=true) s'étendent automatiquement au(x)
  -- mois suivant(s) côté client (genererOccurrencesEvenement,
  -- utils/evenements.ts) — jamais besoin de semer une ligne par occurrence.
  --
  -- RÈGLE À NE JAMAIS CASSER — ÉVÉNEMENTS FINANCIERS DÉJÀ COMPTÉS,
  -- montant_applique = true OBLIGATOIRE : les 6 événements ci-dessous dont
  -- `est_financier = true` (Loyer/Forfait mobile/Box internet/Courses/
  -- Abonnement Netflix/Médecin) ont leur montant DÉJÀ intégralement reflété
  -- dans le `depense` seedé de leur catégorie liée (700/30/40 pour les 3
  -- Fixe ; 180/75/45 pour les 3 Variable, cf. transactions ci-dessus). Sans
  -- `montant_applique = true` ici, verifierEvenementsFinanciersInterne()
  -- (app/store.ts) les considère "non encore appliqués" dès que leur date
  -- (toujours <= aujourd'hui pour un compte fraîchement créé) est passée et
  -- RÉ-ADDITIONNE leur montant à la dépense déjà seedée — bug confirmé
  -- (Logement 700→1400, Téléphonie 30→60, Internet 40→80). Ne JAMAIS
  -- retirer `true` ici sans recalculer `depense` des catégories liées en
  -- conséquence.
  insert into public.evenements
    (user_id, nom, date, heure, duree, couleur, est_financier, montant, categorie_liee, recurrent, frequence, toute_la_journee, notifier_actif, montant_applique) values
    -- Financiers, liés aux catégories du mois en cours — DÉJÀ appliqués
    -- (montant_applique = true), cf. RÈGLE ci-dessus.
    (new.id, 'Loyer', v_mois_debut, '00:00', 1, '#6BCB77', true, 700, 'Logement', true, 'mois', true, false, true),
    (new.id, 'Forfait mobile', v_mois_debut + 4, '00:00', 1, '#5C6BC0', true, 30, 'Téléphonie', true, 'mois', true, false, true),
    (new.id, 'Box internet', v_mois_debut + 4, '00:00', 1, '#3D5AFE', true, 40, 'Internet', true, 'mois', true, false, true),
    (new.id, 'Courses', v_premier_mercredi, '10:00', 1, '#FF6B6B', true, 55, 'Alimentation', true, 'semaine', false, false, true),
    (new.id, 'Abonnement Netflix', v_mois_debut + 14, '00:00', 1, '#FFD93D', true, 13, 'Loisirs', true, 'mois', true, false, true),
    (new.id, 'Médecin', v_mois_debut + 17, '14:30', 0.5, '#FF9F43', true, 25, 'Santé', false, null, false, false, true),
    -- Non financiers.
    (new.id, 'Réunion équipe', v_premier_lundi, '09:00', 1.5, '#1982C4', false, null, null, false, null, false, false, null),
    (new.id, 'Sport', v_premier_mardi, '19:00', 1.5, '#3AA655', false, null, null, true, 'semaine', false, false, null),
    (new.id, 'Sport', v_premier_jeudi, '19:00', 1.5, '#3AA655', false, null, null, true, 'semaine', false, false, null),
    (new.id, 'Anniversaire ami', v_premier_samedi + 7, '00:00', 1, '#8B6FE8', false, null, null, false, null, true, false, null),
    (new.id, 'Appel famille', v_premier_dimanche, '11:00', 1, '#4ECDC4', false, null, null, false, null, false, false, null),
    (new.id, 'Rendez-vous coiffeur', v_premier_samedi, '10:00', 1, '#E8A33D', false, null, null, false, null, false, false, null),
    -- Quelques événements ponctuels du mois suivant, pour que Planning n'y
    -- paraisse pas vide (en plus des récurrents ci-dessus qui s'y étendent
    -- déjà automatiquement).
    (new.id, 'Rendez-vous coiffeur', v_samedi_suivant, '10:00', 1, '#E8A33D', false, null, null, false, null, false, false, null),
    (new.id, 'Appel famille', v_dimanche_suivant, '11:00', 1, '#4ECDC4', false, null, null, false, null, false, false, null);

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

  insert into public.snapshot_objectifs (snapshot_mois_id, objectif_id, nom, actuel, cible) values
    (v_snap_m3_id, v_objectif_vacances_id, 'Vacances', 0, 1500),
    (v_snap_m3_id, v_objectif_urgence_id, 'Fonds d''urgence', 600, 3000),
    (v_snap_m3_id, v_objectif_telephone_id, 'Nouveau téléphone', 150, 800);

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

  insert into public.snapshot_objectifs (snapshot_mois_id, objectif_id, nom, actuel, cible) values
    (v_snap_m2_id, v_objectif_vacances_id, 'Vacances', 150, 1500),
    (v_snap_m2_id, v_objectif_urgence_id, 'Fonds d''urgence', 800, 3000),
    (v_snap_m2_id, v_objectif_telephone_id, 'Nouveau téléphone', 300, 800);

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

  insert into public.snapshot_objectifs (snapshot_mois_id, objectif_id, nom, actuel, cible) values
    (v_snap_m1_id, v_objectif_vacances_id, 'Vacances', 300, 1500),
    (v_snap_m1_id, v_objectif_urgence_id, 'Fonds d''urgence', 1000, 3000),
    (v_snap_m1_id, v_objectif_telephone_id, 'Nouveau téléphone', 450, 800);

  return new;
end;
$$;

-- Réparation des comptes invités déjà créés et déjà touchés par le bug :
-- 1) les 3 catégories Fixe reviennent à depense = budget (déjà la
--    convention établie, idempotent si déjà correct).
-- 2) les 3 catégories Variable reviennent à leur valeur seedée exacte,
--    UNIQUEMENT si leur depense correspond exactement à "valeur seedée +
--    montant de l'événement" (235 = 180+55, 88 = 75+13, 70 = 45+25) — jamais
--    un `!=` large, pour ne jamais écraser une vraie dépense supplémentaire
--    qu'un compte invité aurait ajoutée lui-même pendant son essai.
-- 3) TOUS les événements financiers connus de ce seed sont marqués
--    montant_applique = true pour ne plus jamais se réappliquer, sur
--    n'importe quel compte invité existant (qu'il ait déjà été touché ou
--    non par le bug).
-- Scopée à profils.is_guest = true dans les 3 cas, jamais un vrai compte.
update public.enveloppes e
set depense = e.budget
from public.profils p
where p.user_id = e.user_id
  and p.is_guest = true
  and e.type = 'Fixe'
  and e.depense != e.budget;

update public.enveloppes e
set depense = 180
from public.profils p
where p.user_id = e.user_id
  and p.is_guest = true
  and e.nom = 'Alimentation'
  and e.depense = 235;

update public.enveloppes e
set depense = 75
from public.profils p
where p.user_id = e.user_id
  and p.is_guest = true
  and e.nom = 'Loisirs'
  and e.depense = 88;

update public.enveloppes e
set depense = 45
from public.profils p
where p.user_id = e.user_id
  and p.is_guest = true
  and e.nom = 'Santé'
  and e.depense = 70;

update public.evenements ev
set montant_applique = true
from public.profils p
where p.user_id = ev.user_id
  and p.is_guest = true
  and ev.est_financier = true
  and ev.categorie_liee in ('Logement', 'Téléphonie', 'Internet', 'Alimentation', 'Loisirs', 'Santé')
  and ev.nom in ('Loyer', 'Forfait mobile', 'Box internet', 'Courses', 'Abonnement Netflix', 'Médecin')
  and (ev.montant_applique is null or ev.montant_applique = false);

-- Nouveau parcours d'onboarding en 6 écrans (remplace l'ancien écran unique
-- app/onboarding/preferences.tsx) : on a besoin de savoir si un utilisateur
-- l'a déjà complété, pour ne pas le lui reproposer à chaque connexion, et
-- pour ne jamais l'imposer aux comptes invités (qui ont déjà des données de
-- démo pré-remplies via setup_guest_account).
--
-- Défaut `false` pour les nouvelles inscriptions réelles (elles doivent voir
-- le questionnaire), mais on rétablit `true` juste après pour toutes les
-- lignes déjà existantes à la date de cette migration : ces comptes (réels
-- déjà onboardés via l'ancien écran, ou invités déjà provisionnés avant ce
-- déploiement) ne doivent pas se retrouver renvoyés dans le nouveau
-- questionnaire au premier lancement qui suit la mise à jour de l'app.
alter table public.profils
  add column if not exists onboarding_complete boolean not null default false;

update public.profils
set onboarding_complete = true
where onboarding_complete = false;

-- Comptes invités (is_guest = true, créés via supabase.auth.signInAnonymously()
-- dans app/onboarding/invite.tsx) : onboarding_complete doit être vrai dès la
-- création, pour qu'ils ne voient jamais le nouveau questionnaire — y compris
-- après une conversion ultérieure en vrai compte (cf. clear_guest_status,
-- volontairement inchangée : elle ne touche pas onboarding_complete, donc un
-- compte converti le conserve à true pour toujours).
--
-- Reprend le corps exact de la fonction tel que défini dans
-- 20260731100200_guest_seed_salaire_mois_comptage.sql (dernière version en
-- date), en n'ajoutant que onboarding_complete à l'upsert du profil — aucun
-- autre changement.
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
  v_mois_debut date := date_trunc('month', now())::date;
begin
  insert into public.profils (user_id, prenom, argent_disponible, is_guest, guest_expires_at, onboarding_complete)
  values (new.id, 'Invité', 850, true, now() + interval '7 days', true)
  on conflict (user_id) do update
    set is_guest = true,
        guest_expires_at = now() + interval '7 days',
        onboarding_complete = true;

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

  insert into public.transactions (user_id, enveloppe_id, nom, montant, date) values
    (new.id, v_salaire_id, 'Salaire', 1800, v_mois_debut + 1),
    (new.id, v_logement_id, 'Loyer', 750, v_mois_debut + 2),
    (new.id, v_alimentation_id, 'Supermarché', 84, v_mois_debut + 3),
    (new.id, v_transport_id, 'Essence', 45, v_mois_debut + 4),
    (new.id, v_alimentation_id, 'Marché', 37, v_mois_debut + 8),
    (new.id, v_loisirs_id, 'Cinéma', 24, v_mois_debut + 9),
    (new.id, v_alimentation_id, 'Supermarché', 91, v_mois_debut + 15),
    (new.id, v_transport_id, 'Transports en commun', 17, v_mois_debut + 16),
    (new.id, v_loisirs_id, 'Abonnement streaming', 14, v_mois_debut + 18),
    (new.id, v_alimentation_id, 'Boulangerie', 53, v_mois_debut + 20),
    (new.id, v_loisirs_id, 'Restaurant', 10, v_mois_debut + 21);

  return new;
end;
$$;

-- Mode invité : mise en place du compte + données de démo à la création
-- d'un utilisateur Supabase Auth anonyme (auth.signInAnonymously()), et
-- nettoyage du statut invité une fois la conversion (email confirmé) effective.
--
-- IMPORTANT : ce projet a déjà (très probablement) un trigger sur
-- `auth.users` qui crée la ligne `profils` à l'inscription normale (les
-- écrans onboarding font uniquement des UPDATE sur profils, jamais
-- d'INSERT). Sa définition exacte n'est pas versionnée dans ce repo, donc
-- pour ne rien casser sans la voir :
--   1. `setup_guest_account` est un trigger AJOUTÉ, indépendant, qui utilise
--      ON CONFLICT (user_id) DO UPDATE — s'il tourne avant OU après le
--      trigger existant, le résultat final est le même (upsert).
--   2. Le nom `zzz_...` le fait trier après la plupart des conventions de
--      nommage usuelles (`on_auth_user_created`, `handle_new_user`, ...),
--      pour que le trigger existant s'exécute en premier et crée sa ligne
--      normalement — celui-ci vient ensuite compléter/écraser les champs
--      invité + semer les données de démo, sans jamais provoquer de conflit
--      côté trigger existant.
-- À vérifier une fois déployé : si le trigger existant échoue sur un profil
-- déjà créé par celui-ci (peu probable vu l'ordre alphabétique, mais à
-- confirmer en environnement réel), il faudra soit le renommer pour qu'il
-- trie avant, soit lui ajouter ON CONFLICT DO NOTHING.

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
  insert into public.profils (user_id, prenom, argent_disponible, is_guest, guest_expires_at)
  values (new.id, 'Invité', 850, true, now() + interval '7 days')
  on conflict (user_id) do update
    set is_guest = true,
        guest_expires_at = now() + interval '7 days';

  insert into public.enveloppes
    (user_id, nom, depense, budget, couleur, recurrente, type, repete_chaque_mois)
  values
    (new.id, 'Salaire', 1800, 1800, '#845EC2', true, 'Entrée', true)
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

drop trigger if exists zzz_guest_account_setup_trigger on auth.users;
create trigger zzz_guest_account_setup_trigger
  after insert on auth.users
  for each row
  when (new.is_anonymous)
  execute function public.setup_guest_account();

-- Conversion invité -> vrai compte : dès que is_anonymous passe à false
-- (email confirmé après supabase.auth.updateUser({ email, password })),
-- on nettoie le statut invité. Indépendant du client : robuste même si
-- l'app est fermée juste après la confirmation.
create or replace function public.clear_guest_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_anonymous and not new.is_anonymous then
    update public.profils
      set is_guest = false,
          guest_expires_at = null
      where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists zzz_guest_account_conversion_trigger on auth.users;
create trigger zzz_guest_account_conversion_trigger
  after update on auth.users
  for each row
  execute function public.clear_guest_status();

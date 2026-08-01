-- "Budget" (ex-argent_disponible) est désormais une liste d'entrées
-- (public.enveloppes, type = 'Entrée') affichées via date_fixe/mois_comptage
-- — la ligne "Salaire" semée pour les comptes invités n'avait ni l'une ni
-- l'autre, elle n'apparaissait donc pas dans la liste "Budget" d'Aperçu
-- (bien qu'elle comptait déjà dans le total via depense). On lui ajoute les
-- deux colonnes pour qu'elle s'affiche correctement dès la création du
-- compte de démo. profils.argent_disponible = 850 reste seedé mais devient
-- inerte côté app (colonne conservée comme filet de sécurité, cf.
-- 20260731100100_migrer_budget_vers_entrees.sql).

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

-- COULEUR PERSONNELLE DANS L'ESPACE PARTAGÉ — RPC DE LECTURE CROSS-COMPTE.
-- Étape unique après 20260906090000 (colonne seule), aucune RLS séparée.
--
-- RÈGLE À NE JAMAIS CASSER — RPC ÉTROITE PLUTÔT QU'UNE POLICY
-- profils_select_espace_partage : même raison que epargne_mois_partenaire()
-- (migration 20260905110000) — `profils` n'a jamais eu de lecture
-- cross-compte ouverte en RLS dans ce projet. couleur_espace_partage n'est
-- disponible NULLE PART ailleurs (contrairement à prenom, dénormalisé sur
-- membres_espace) — une RPC security definer qui ne renvoie QUE ce seul
-- champ, jamais le reste du profil, est le choix le plus étroit possible.
create or replace function public.couleur_espace_partage_partenaire()
returns varchar(7)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partenaire_id uuid;
  v_couleur varchar(7);
begin
  if auth.uid() is null then
    return null;
  end if;

  select m2.user_id into v_partenaire_id
  from public.membres_espace m1
  join public.membres_espace m2 on m1.espace_id = m2.espace_id
  where m1.user_id = auth.uid() and m2.user_id != auth.uid()
  limit 1;

  if v_partenaire_id is null then
    return null;
  end if;

  select p.couleur_espace_partage into v_couleur
  from public.profils p
  where p.user_id = v_partenaire_id;

  return v_couleur;
end;
$$;

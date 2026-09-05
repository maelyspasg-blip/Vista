-- ÉVOLUTION CONSOLIDÉE — RPC DE LECTURE DE L'ÉPARGNE COURANTE DU
-- PARTENAIRE. Étape unique (pas de schéma/RLS séparés, aucune nouvelle
-- table/colonne).
--
-- RÈGLE À NE JAMAIS CASSER — RPC ÉTROITE PLUTÔT QU'UNE POLICY
-- profils_select_espace_partage : contrairement à enveloppes/transactions/
-- evenements/snapshots_*, `profils` n'a JAMAIS eu de lecture cross-compte
-- ouverte en RLS dans ce projet — cf. MembreEspace.prenom (utils/
-- espacePartage.ts), dénormalisé sur membres_espace précisément pour éviter
-- d'avoir à lire le profil d'un autre utilisateur. epargne_mois n'est
-- disponible NULLE PART ailleurs pour le mois en cours (contrairement à
-- l'historique, dans snapshots_mois.epargne, déjà lisible par le partenaire
-- depuis la migration 20260905101000) — une RPC security definer qui ne
-- renvoie QUE ce seul champ, jamais le reste du profil, est le choix le
-- plus étroit possible plutôt que d'ouvrir toute la table.
create or replace function public.epargne_mois_partenaire()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partenaire_id uuid;
  v_epargne numeric;
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

  select p.epargne_mois into v_epargne
  from public.profils p
  where p.user_id = v_partenaire_id;

  return v_epargne;
end;
$$;

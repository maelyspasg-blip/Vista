-- STATS COUPLE — RPC DE CHANGEMENT DE MODE DE BALANCE. Étape 3/3, après
-- 20260905100000 (schéma) et 20260905101000 (RLS).
--
-- RÈGLE À NE JAMAIS CASSER — RPC SECURITY DEFINER PLUTÔT QU'ÉLARGIR LA
-- POLICY UPDATE : espaces_partages_update_proprietaire (migration
-- 20260830120000) restreint déjà l'UPDATE de cette table au créateur de
-- l'espace (role='proprietaire') — c'est voulu pour code/expire_at, mais
-- mode_balance/ratio_personnalise doivent être modifiables par N'IMPORTE
-- QUEL membre. Élargir la policy RLS ouvrirait aussi code/expire_at à
-- n'importe qui ; une RPC contourne RLS en interne et ne touche QUE ces 2
-- colonnes, même idiome que fusionner_evenements/creer_espace_partage/
-- rejoindre_espace_par_code/quitter_espace_partage (déjà utilisé partout
-- ailleurs dans ce projet pour ce genre de cas).
--
-- RÈGLE À NE JAMAIS CASSER — ESPACE DÉRIVÉ DE L'APPELANT, JAMAIS UN
-- espace_id PASSÉ PAR LE CLIENT : même précédent que quitter_espace_partage()
-- — un espace_id arbitraire fourni par le client ne serait jamais vérifié
-- comme "le mien" avant d'être utilisé, ouvrant la possibilité de modifier
-- le mode de balance d'un AUTRE couple. En résolvant l'espace via
-- membres_espace + auth.uid(), cette question ne se pose plus.
create or replace function public.modifier_mode_balance_espace(
  p_mode text,
  p_ratio_personnalise numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espace_id uuid;
  v_ratio numeric;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_mode not in ('50_50', 'revenus', 'personnalise') then
    raise exception 'mode_invalide';
  end if;

  select espace_id into v_espace_id
  from public.membres_espace
  where user_id = auth.uid()
  limit 1;

  if v_espace_id is null then
    raise exception 'aucun_espace';
  end if;

  -- Défense en profondeur : un slider client ne peut physiquement pas
  -- produire une valeur hors [0, 1], mais cette fonction ne fait jamais
  -- confiance à ce que l'appelant a déjà validé côté UI.
  v_ratio := greatest(0, least(1, coalesce(p_ratio_personnalise, 0.5)));

  update public.espaces_partages
  set mode_balance = p_mode,
      ratio_personnalise = v_ratio
  where id = v_espace_id;
end;
$$;

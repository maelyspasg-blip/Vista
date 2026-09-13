-- Notifications push pour les événements partagés du Planning (demande du
-- 2026-09-13) : quand un membre d'un espace partagé crée un événement
-- visibilite='commun', l'autre membre reçoit une notification push Expo.

-- Colonne additive, jamais lue/écrite cross-compte directement par le
-- client (RLS de `profils` n'expose aucune lecture cross-compte, cf. RÈGLE
-- existante sur MembreEspace.prenom, utils/espacePartage.ts) — seule la
-- fonction security definer ci-dessous y accède pour un autre utilisateur
-- que l'appelant.
alter table public.profils
  add column if not exists push_token text;

-- RÈGLE À NE JAMAIS CASSER — RPC ÉTROITE, JAMAIS UNE POLICY SELECT
-- OUVERTE SUR profils : ce projet n'a et n'aura jamais de lecture
-- cross-compte ouverte sur `profils` (même raison que MembreEspace.prenom,
-- dénormalisé exprès pour l'éviter) — une RPC security definer, qui
-- revalide elle-même le partage d'espace via partage_un_espace_avec()
-- (jamais faire confiance à l'appelant sur l'identité du partenaire), est
-- la façon établie d'exposer un seul champ précis du partenaire. Ne
-- retourne QUE push_token, rien d'autre de la ligne profils.
create or replace function public.push_token_partenaire(p_partenaire_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.partage_un_espace_avec(p_partenaire_user_id) then
    return null;
  end if;

  select push_token into v_token
  from public.profils
  where user_id = p_partenaire_user_id;

  return v_token;
end;
$$;

-- RÈGLE : défense en profondeur (revue sécurité du 2026-09-13) —
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut à la création d'une
-- fonction, sauf revoke explicite. Sans conséquence pratique ici (un appel
-- anonyme a auth.uid() = null, donc partage_un_espace_avec() retourne déjà
-- false et la fonction renvoie null), mais retiré explicitement plutôt que
-- de compter uniquement sur cette garantie indirecte.
revoke execute on function public.push_token_partenaire(uuid) from public;
grant execute on function public.push_token_partenaire(uuid) to authenticated;

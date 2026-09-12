-- Audit sécurité données du 2026-09-12 — durcissement défensif de
-- desactiver_expiration_espace(p_espace_id uuid).
--
-- Contexte : cette fonction (introduite dans
-- 20260831140000_espace_partage_liaison_permanente.sql) n'est aujourd'hui
-- appelée QUE depuis l'intérieur de rejoindre_espace_par_code() — jamais
-- exposée en RPC directe au client — donc sans risque réel en l'état.
-- Mais son corps ne revalidait aucune appartenance sur p_espace_id : si
-- elle venait un jour à être appelée directement (RPC publique, nouveau
-- point d'appel ajouté sans repenser ce détail), n'importe quel
-- utilisateur authentifié aurait pu désactiver l'expiration d'un
-- espace_partages arbitraire.
--
-- Cette migration est additive et non destructive : CREATE OR REPLACE
-- FUNCTION sur une fonction déjà existante, même signature, même usage
-- pour son unique appelant actuel (rejoindre_espace_par_code) — comportement
-- inchangé pour ce chemin (l'appelant est déjà, à ce stade, membre légitime
-- de l'espace qu'il vient de rejoindre). Seul ajout : la fonction revalide
-- désormais elle-même que l'appelant (auth.uid()) est membre de
-- p_espace_id avant d'agir, comme le fait déjà chaque autre fonction
-- security definer de ce projet (cf. RÈGLE dans CLAUDE.md — "Vérifier que
-- les fonctions security definer revalident toujours auth.uid()").

create or replace function public.desactiver_expiration_espace(p_espace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.espaces_partages
  set expire_at = '2099-12-31'::timestamptz
  where id = p_espace_id
    and exists (
      select 1
      from public.membres_espace m
      where m.espace_id = p_espace_id
        and m.user_id = auth.uid()
    );
$$;

-- Dénormalise le prénom de CHAQUE membre sur sa propre ligne membres_espace
-- — nécessaire pour app/EspacePartageContext.tsx (membrePartenaire.prenom) :
-- un membre ne peut pas lire le profil Supabase d'un autre utilisateur
-- (profils_select_own limite la lecture à auth.uid() = user_id, cf.
-- 20260825120000_rls_policies.sql), même s'ils sont dans le même espace.
-- Même raisonnement, même solution que espaces_partages.cree_par_prenom
-- (cf. 20260830140000_espace_partage_prenom_et_doublon.sql) : chaque
-- utilisateur peut toujours lire SON PROPRE profil au moment où IL insère
-- sa propre ligne membres_espace (creerEspacePartage/rejoindreEspacePartage,
-- cf. utils/espacePartage.ts) — c'est la seule fenêtre fiable. Une fois la
-- ligne écrite, elle est lisible par les CO-membres du même espace via la
-- policy membres_espace_select_own_or_cospace (déjà corrigée contre la
-- récursion RLS, cf. 20260830150000_membres_espace_fix_recursion_rls.sql).
alter table public.membres_espace
add column if not exists prenom varchar(50);

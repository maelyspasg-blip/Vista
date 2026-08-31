-- Deux ajouts pour l'espace partagé (cf. utils/espacePartage.ts) :
--
-- 1. cree_par_prenom : dénormalisé sur espaces_partages, renseigné à la
--    création (creerEspacePartage()) avec le prénom du créateur. Nécessaire
--    pour afficher "Tu as rejoint l'espace partagé de [Prénom] !" à un
--    utilisateur qui REJOINT — celui-ci n'est pas encore membre de
--    l'espace au moment de la lecture, donc ne peut PAS lire le profil
--    Supabase du créateur (profils_select_own limite la lecture à
--    auth.uid() = user_id, cf. 20260825120000_rls_policies.sql). Stocker
--    le prénom directement sur la ligne espaces_partages (déjà lisible par
--    tout utilisateur authentifié, cf. espaces_partages_select_auth) évite
--    d'élargir la policy RLS de la table profils pour ce seul besoin.
alter table public.espaces_partages
add column if not exists cree_par_prenom varchar(50);

-- 2. Contrainte unique (espace_id, user_id) sur membres_espace : défense en
--    profondeur pour le cas "déjà membre" (rejoindreEspacePartage vérifie
--    déjà côté client avant d'insérer, mais sans contrainte DB, deux
--    requêtes concurrentes du même utilisateur pourraient créer deux
--    lignes d'appartenance pour le même espace).
create unique index if not exists membres_espace_espace_user_key
  on public.membres_espace (espace_id, user_id);

-- COULEUR PERSONNELLE DANS L'ESPACE PARTAGÉ — colonne seule, RPC de lecture
-- cross-compte dans la migration suivante (20260906091000).
--
-- Choisie par l'utilisateur parmi une palette fixe de 8 teintes (déjà
-- utilisées ailleurs dans Vista) via le sélecteur dans app/profil.tsx,
-- section ESPACE PARTAGÉ. Remplace les couleurs "Moi"/"Partenaire" fixes
-- (#60a5fa/#c084fc) partout où la vue partagée distingue les deux comptes
-- (Aperçu, Budget, Stats, Planning) — cf. EspacePartageContext.couleurMoi/
-- couleurPartenaire. Défaut #1D9E75 (teal) : identique à la couleur fixe
-- "Commun" utilisée pour les catégories/événements fusionnés — un compte qui
-- garde ce défaut sans le changer explicitement se confondra visuellement
-- avec "Commun" jusqu'à ce qu'il choisisse une autre teinte (comportement
-- volontaire de la palette fournie, pas un bug à corriger ici).
alter table public.profils
add column if not exists couleur_espace_partage varchar(7) default '#1D9E75';

-- Compte administrateur : flag manuel, jamais positionné par l'app elle-même
-- (aucun code n'écrit is_admin — seule une mise à jour manuelle depuis le
-- dashboard Supabase peut l'activer). default false pour tout le monde,
-- comptes existants comme nouveaux.
alter table public.profils
  add column if not exists is_admin boolean not null default false;

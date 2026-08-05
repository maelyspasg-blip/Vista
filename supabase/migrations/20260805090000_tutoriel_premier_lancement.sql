-- Tutoriel de premier lancement (coach marks in-app) : 4 flags "déjà vu"
-- par page. default true = "déjà vu, ne rien afficher" pour tout le monde
-- par défaut (comptes existants backfillés, invités via setup_guest_account
-- qui n'insère pas ces colonnes). Seul terminerOnboarding (app/onboarding/
-- preferences.tsx) les repasse explicitement à false, uniquement pour une
-- inscription qui vient réellement de se terminer pour la première fois.
alter table public.profils
  add column if not exists tutoriel_apercu_vu boolean not null default true,
  add column if not exists tutoriel_budget_vu boolean not null default true,
  add column if not exists tutoriel_planning_vu boolean not null default true,
  add column if not exists tutoriel_stats_vu boolean not null default true;

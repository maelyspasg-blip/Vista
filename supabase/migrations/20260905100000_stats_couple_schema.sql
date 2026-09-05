-- STATS COUPLE — SCHÉMA : mode de calcul de la balance (couple, pas par
-- compte) + table de remboursements. Étape 1/3 (schéma), suivie de
-- 20260905101000 (RLS) et 20260905102000 (RPC de changement de mode) —
-- exécuter les trois dans l'ordre.
--
-- RÈGLE À NE JAMAIS CASSER — mode_balance/ratio_personnalise SUR
-- espaces_partages, JAMAIS profils : c'est un réglage DU COUPLE (les deux
-- membres doivent voir et utiliser exactement le même mode/ratio), pas un
-- réglage individuel — le poser sur profils créerait une désynchronisation
-- possible (chacun des deux comptes avec sa propre valeur). L'écriture ne
-- passe jamais par un update client direct (cf. RPC
-- modifier_mode_balance_espace, migration 20260905102000) : la policy UPDATE
-- existante sur espaces_partages (espaces_partages_update_proprietaire)
-- reste inchangée et continue de protéger code/expire_at.
alter table public.espaces_partages
  add column if not exists mode_balance varchar(20) default '50_50';
alter table public.espaces_partages
  add column if not exists ratio_personnalise numeric default 0.5;

-- RÈGLE À NE JAMAIS CASSER — TABLE APPEND-ONLY, PAS DE CONTRAINTE UNIQUE :
-- "Marquer comme remboursé" est un simple insert (cf. RÈGLE dans
-- utils/espacePartage.ts::marquerRembourse) — l'existence d'au moins une
-- ligne pour (espace_id, mois, annee) suffit à considérer le mois réglé
-- côté client, jamais besoin d'un upsert/d'une contrainte d'unicité ici.
create table if not exists public.remboursements_espace (
  id uuid primary key default gen_random_uuid(),
  espace_id uuid references public.espaces_partages(id) on delete cascade,
  mois int not null,
  annee int not null,
  montant numeric not null,
  rembourse_par uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.remboursements_espace enable row level security;

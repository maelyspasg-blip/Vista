-- Mode invité : colonnes de suivi sur profils.
-- is_guest / guest_expires_at pilotent à la fois le bandeau (jours restants)
-- et le nettoyage automatique (cleanup-expired-guests) après 7 jours.

alter table public.profils
  add column if not exists is_guest boolean not null default false,
  add column if not exists guest_expires_at timestamptz;

-- Index partiel : la fonction de nettoyage ne scanne que les invités expirés.
create index if not exists profils_guest_expires_at_idx
  on public.profils (guest_expires_at)
  where is_guest;

-- Réglages d'accessibilité persistés par utilisateur : taille de texte
-- (indépendante du réglage système), contraste renforcé, réduction des
-- animations. Chargés dans app/_layout.tsx avant le premier rendu, au même
-- endroit que `theme`, pour piloter l'app entière dès le départ.

alter table public.profils
  add column if not exists taille_texte text not null default 'normal',
  add column if not exists contraste_renforce boolean not null default false,
  add column if not exists reduire_animations boolean not null default false;

alter table public.profils
  drop constraint if exists profils_taille_texte_check;

alter table public.profils
  add constraint profils_taille_texte_check
  check (taille_texte in ('petit', 'normal', 'grand', 'tres_grand'));

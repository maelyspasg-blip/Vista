-- snapshot_enveloppes.enveloppe_id et snapshot_objectifs.objectif_id étaient
-- en ON DELETE SET NULL : supprimer une catégorie ou un objectif (action
-- normale et définitive, voir supprimerEnveloppe/supprimerObjectif dans
-- store.ts) mettait silencieusement ces colonnes à null dans TOUS les
-- snapshots archivés qui les référençaient encore, cassant les clés de
-- rendu (VueMoisArchive) et les comparaisons mois à mois
-- (depenseEnveloppeDansSnapshot).
--
-- Passer en ON DELETE NO ACTION fait que Postgres refuse désormais la
-- suppression d'une catégorie/d'un objectif tant qu'un snapshot y fait
-- encore référence — ce qui concerne quasiment toute catégorie ayant
-- survécu à une fin de mois. supprimerEnveloppe et supprimerObjectif
-- (store.ts) ont été adaptés en conséquence : la suppression Supabase est
-- tentée avant tout changement d'état local, et un rejet (code Postgres
-- 23503) affiche "Cette catégorie/cet objectif a été archivé(e) dans un
-- mois passé et ne peut plus être supprimé(e)" sans désynchroniser l'UI.

alter table public.snapshot_enveloppes
  drop constraint if exists snapshot_enveloppes_enveloppe_id_fkey;

alter table public.snapshot_enveloppes
  add constraint snapshot_enveloppes_enveloppe_id_fkey
  foreign key (enveloppe_id) references public.enveloppes(id) on delete no action;

alter table public.snapshot_objectifs
  drop constraint if exists snapshot_objectifs_objectif_id_fkey;

alter table public.snapshot_objectifs
  add constraint snapshot_objectifs_objectif_id_fkey
  foreign key (objectif_id) references public.objectifs(id) on delete no action;

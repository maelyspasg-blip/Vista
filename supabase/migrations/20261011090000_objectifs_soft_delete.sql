-- P071 (AUDIT_V1.md, 2026-10-11) : impossible de supprimer un objectif déjà
-- archivé dans un mois passé — le DELETE de supprimerObjectif (app/store.ts)
-- était rejeté par Postgres (23503, snapshot_objectifs_objectif_id_fkey,
-- ON DELETE NO ACTION).
--
-- Même principe que les enveloppes (P052, 20260918090000_enveloppes_soft_delete.sql) :
-- suppression "douce". supprimerObjectif fait désormais un UPDATE
-- supprime_le = now() (filtré id + user_id) ; la ligne reste en base, les
-- snapshots passés restent intacts, et l'objectif est masqué au chargement
-- (app/store.ts::chargerObjectifs filtre les lignes où supprime_le n'est
-- pas nul).
--
-- Additive, nullable, défaut NULL (objectif actif) : conforme à la RÈGLE
-- migrations du projet (CLAUDE.md, "additive uniquement"). La policy RLS
-- existante objectifs_update_own (20260825120000_rls_policies.sql) couvre
-- déjà cet UPDATE — aucune policy à modifier.
alter table public.objectifs
  add column if not exists supprime_le timestamptz null;

comment on column public.objectifs.supprime_le is
  'NULL = objectif actif. Non-NULL = objectif "supprimé" par l''utilisateur (masqué de l''app), jamais réellement effacé : les archives mensuelles (snapshot_objectifs) qui le référencent restent intactes. Voir app/store.ts::supprimerObjectif et chargerObjectifs.';

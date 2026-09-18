-- Décision produit du 2026-09-18 (P052, AUDIT_V1.md) : une catégorie
-- supprimée ne doit plus faire disparaître ses transactions des totaux et
-- statistiques du mois où elles ont eu lieu. Jusqu'ici, supprimerEnveloppe
-- (app/store.ts) faisait un vrai DELETE sur la ligne `enveloppes` — ses
-- transactions restaient alors "orphelines" (enveloppe_id ne correspondant
-- plus à rien), invisibles de tous les calculs du projet (quasiment tous
-- sommant `enveloppe.depense`, jamais une re-somme des transactions brutes).
--
-- Cette colonne remplace le DELETE par une suppression "douce" : la ligne
-- reste en base (nom réel conservé, transactions toujours valablement liées,
-- dépense réelle toujours comptée dans tous les totaux existants), mais est
-- masquée de "Tes catégories"/tout picker de création — cf.
-- utils/budget.ts::estCategorieActiveCeMois, mis à jour pour exclure toute
-- ligne où supprimee_le n'est pas nul.
--
-- Additive, nullable, défaut NULL (catégorie active) : conforme à la RÈGLE
-- migrations du projet (CLAUDE.md, "additive uniquement").
alter table public.enveloppes
  add column if not exists supprimee_le timestamptz null;

comment on column public.enveloppes.supprimee_le is
  'NULL = catégorie active. Non-NULL = catégorie "supprimée" par l''utilisateur (masquée de l''UI, plus réutilisable), mais jamais réellement effacée : ses transactions restent valablement liées et sa dépense réelle continue de compter dans les totaux du mois où elle a été supprimée. Voir app/store.ts::supprimerEnveloppe et utils/budget.ts::estCategorieActiveCeMois.';

-- Montant habituel pour une catégorie "Entrée" récurrente (demande
-- explicite du 2026-10-02) : sépare désormais deux notions qui n'en
-- faisaient qu'une — "cette entrée se répète chaque mois" (déjà géré par
-- recurrente/repete_chaque_mois) et "le montant reçu est toujours le même,
-- pas besoin de le confirmer chaque mois".
--
-- NULL = montant variable (comportement historique inchangé : à la
-- reconduction mensuelle, depense repart à 0, payee à false, l'utilisateur
-- confirme/saisit le montant reçu lui-même).
-- Valeur = montant pré-rempli AUTOMATIQUEMENT (depense ET payee) à la
-- reconduction mensuelle côté app (archiverMoisActuelInterne, app/store.ts)
-- — pour un salaire fixe qui ne nécessite jamais de confirmation manuelle.
--
-- Additive uniquement, conforme à CLAUDE.md : aucune ligne existante
-- affectée (toutes restent à NULL = comportement actuel inchangé pour
-- toutes les catégories déjà créées).
alter table public.enveloppes
  add column if not exists montant_habituel numeric null;

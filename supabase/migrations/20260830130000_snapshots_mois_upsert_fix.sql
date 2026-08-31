-- Corrige le crash "duplicate key" sur snapshots_mois : deux appels
-- concurrents à l'archivage mensuel pour le MÊME mois (course au démarrage,
-- verifierArchivageMoisInterne tourne au montage + à intervalle régulier +
-- à chaque retour au premier plan, cf. app/store.ts) provoquaient un INSERT
-- en doublon sur (user_id, mois, annee). Le code (app/store.ts,
-- enregistrerSnapshotMoisSupabase) passe désormais par .upsert(...,
-- { onConflict: "user_id,mois,annee" }) — ceci exige qu'une contrainte
-- unique existe RÉELLEMENT sur ces 3 colonnes côté base pour que l'upsert
-- fonctionne (sinon Postgres répond "no unique or exclusion constraint
-- matching the ON CONFLICT specification"). La table snapshots_mois n'a
-- jamais été créée par une migration versionnée dans ce repo (créée hors
-- bande, cf. constat similaire déjà fait sur plusieurs autres tables) —
-- impossible de confirmer depuis ce repo qu'une contrainte de ce nom/forme
-- existe déjà en prod. Cette migration la pose explicitement, de façon
-- idempotente (safe à rejouer), pour ne jamais dépendre de l'état actuel
-- inconnu de la base.
create unique index if not exists snapshots_mois_user_mois_annee_key
  on public.snapshots_mois (user_id, mois, annee);

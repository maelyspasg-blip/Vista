-- STATS COUPLE — RLS. Étape 2/3, après 20260905100000 (schéma).
--
-- RÈGLE À NE JAMAIS CASSER — POLICIES ADDITIVES, JAMAIS UN REMPLACEMENT DE
-- snapshots_mois_select_own/snapshot_enveloppes_select_own : même
-- convention que enveloppes_select_espace_partage/
-- transactions_select_espace_partage (migration 20260831160000) —
-- plusieurs policies permissives pour la même commande se combinent en OR
-- côté Postgres. Nécessaire pour Graphique 2 (évolution 6 mois des
-- dépenses communes) : ce graphique lit l'archive mensuelle par catégorie
-- du PARTENAIRE (snapshots_mois + snapshot_enveloppes), qui sans ceci
-- reste strictement invisible depuis mon compte.
create policy "snapshots_mois_select_espace_partage" on public.snapshots_mois
  for select using (public.partage_un_espace_avec(user_id));

-- RÈGLE : snapshot_enveloppes n'a pas de colonne user_id directe (cf. RÈGLE
-- dans 20260825120000_rls_policies.sql) — scopée via snapshot_mois_id ->
-- snapshots_mois.user_id, donc une policy EXISTS plutôt qu'une comparaison
-- directe, exactement la même forme que snapshot_enveloppes_select_own.
create policy "snapshot_enveloppes_select_espace_partage" on public.snapshot_enveloppes
  for select using (
    exists (
      select 1 from public.snapshots_mois sm
      where sm.id = snapshot_enveloppes.snapshot_mois_id
        and public.partage_un_espace_avec(sm.user_id)
    )
  );

-- RÈGLE À NE JAMAIS CASSER — est_membre_espace(espace_id), JAMAIS
-- partage_un_espace_avec(user_id) : remboursements_espace est scopée par
-- espace_id directement (contrairement à enveloppes/transactions/
-- evenements/snapshots_*, scopées par user_id) — est_membre_espace est le
-- helper déjà utilisé pour ce cas exact (cf. espaces_partages_select_membres/
-- membres_espace_select_own_or_cospace, migration 20260830150000).
create policy "remboursements_espace_select_membres" on public.remboursements_espace
  for select using (public.est_membre_espace(espace_id));

-- RÈGLE : n'importe quel membre peut enregistrer un remboursement, mais
-- uniquement en son propre nom (rembourse_par = auth.uid()) — jamais au nom
-- de l'autre membre. Pas de policy UPDATE/DELETE : cette table est
-- append-only, cf. RÈGLE dans la migration de schéma.
create policy "remboursements_espace_insert_membres" on public.remboursements_espace
  for insert with check (
    public.est_membre_espace(espace_id) and rembourse_par = auth.uid()
  );

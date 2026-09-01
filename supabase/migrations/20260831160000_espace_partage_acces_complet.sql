-- Ouvre l'accès complet aux données d'un partenaire du même espace partagé —
-- RÈGLE À NE JAMAIS CASSER : décision explicite de l'utilisateur (question
-- posée avant cette migration, confirmée) qui REVIENT sur le choix fait à
-- l'étape 3 de ce chantier ("scopé à commun/partage uniquement"). Une fois
-- deux comptes liés dans un espace partagé, chacun voit TOUTES les
-- catégories (enveloppes) ET TOUTES les transactions de l'autre —
-- `enveloppes.partage` n'est plus une barrière d'ACCÈS, seulement une
-- préférence d'AFFICHAGE côté client (quel badge montrer sur une carte,
-- cf. app/(tabs)/index.tsx et app/(tabs)/budget.tsx).
--
-- Remplace les policies posées par la migration 20260831150000
-- (espace_partage_partage_par_categorie.sql), qui exigeaient
-- `partage = true` en plus de la co-appartenance à un espace.

drop policy if exists "enveloppes_select_espace_partage" on public.enveloppes;
create policy "enveloppes_select_espace_partage" on public.enveloppes
  for select using (
    user_id = auth.uid()
    or public.partage_un_espace_avec(user_id)
  );

drop policy if exists "transactions_select_espace_partage" on public.transactions;
create policy "transactions_select_espace_partage" on public.transactions
  for select using (
    user_id = auth.uid()
    or public.partage_un_espace_avec(user_id)
  );

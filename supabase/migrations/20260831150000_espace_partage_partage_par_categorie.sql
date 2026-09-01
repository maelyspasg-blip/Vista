-- Nouvelle approche du mode espace partagé — RÈGLE À NE JAMAIS CASSER :
-- LE PARTAGE SE DÉCIDE MAINTENANT AU NIVEAU DE LA CATÉGORIE (enveloppes),
-- JAMAIS AU NIVEAU DE LA TRANSACTION. L'ancien modèle (transactions.attribue_a
-- + enveloppes.attribue_a, migrations 20260830120000/20260831120000) exigeait
-- que enveloppes.attribue_a = 'commun' pour qu'une catégorie soit visible du
-- partenaire, mais AUCUNE UI n'a jamais permis de régler ce champ sur les
-- enveloppes (seul un sélecteur Personnel/Commun sur les TRANSACTIONS
-- existait) — en pratique, une enveloppe entière n'était donc jamais visible
-- du partenaire, quoi que l'utilisateur fasse. C'est la cause probable du
-- bug "aucune donnée du partenaire n'apparaît" observé en vue "Partagé".
--
-- Colonnes/policies `attribue_a` (transactions/enveloppes) volontairement
-- CONSERVÉES telles quelles (pas de drop column) — plus utilisées par la
-- nouvelle logique de partage, mais les supprimer serait une migration
-- destructive non demandée ; elles deviennent simplement inertes.

alter table public.enveloppes
add column if not exists partage boolean default false;

-- === enveloppes : lecture cross-utilisateur scopée à partage = true =======
drop policy if exists "enveloppes_select_espace_partage" on public.enveloppes;
create policy "enveloppes_select_espace_partage" on public.enveloppes
  for select using (
    user_id = auth.uid()
    or (partage = true and public.partage_un_espace_avec(user_id))
  );

-- === transactions : lisibles si leur ENVELOPPE est partagée ===============
-- RÈGLE À NE JAMAIS CASSER : la transaction elle-même ne porte plus aucune
-- information de partage (son ancien attribue_a est ignoré) — c'est
-- exclusivement l'appartenance à une enveloppe `partage = true` qui décide.
drop policy if exists "transactions_select_espace_partage" on public.transactions;
create policy "transactions_select_espace_partage" on public.transactions
  for select using (
    user_id = auth.uid()
    or (
      public.partage_un_espace_avec(user_id)
      and enveloppe_id in (
        select id from public.enveloppes
        where partage = true
      )
    )
  );

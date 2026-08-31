-- Étape 3 du mode espace partagé : un membre peut lire les enveloppes et
-- transactions d'un autre membre du MÊME espace partagé, UNIQUEMENT celles
-- marquées attribue_a = 'commun'.
--
-- RÈGLE À NE JAMAIS CASSER — 'commun' EST UNE BARRIÈRE D'ACCÈS, PAS UN
-- SIMPLE BADGE D'AFFICHAGE : décision explicite de l'utilisateur (question
-- posée avant cette migration) — le SQL initialement proposé pour cette
-- étape donnait accès à 100% des enveloppes/transactions du partenaire,
-- sans filtrer sur attribue_a. Ça aurait rendu le choix "Personnel/Commun"
-- prévu à l'ajout d'une dépense (étape 1 de ce chantier) purement
-- cosmétique : un partenaire aurait pu lire l'intégralité des dépenses
-- personnelles de l'autre dès qu'ils rejoignent le même espace, y compris
-- tout ce qui existait AVANT de le rejoindre — irréversible une fois vu.
-- Chaque policy ci-dessous exige explicitement `attribue_a = 'commun'` EN
-- PLUS de l'appartenance au même espace : ne jamais retirer cette
-- condition, même pour "simplifier".
--
-- Limite connue, acceptée : une TRANSACTION 'commun' dont l'ENVELOPPE
-- parente est 'personnel' reste lisible pour le partenaire (transactions
-- et enveloppes ont chacune leur propre attribue_a, cf. étape 1), mais le
-- partenaire ne pourra pas résoudre son enveloppe_id (bloqué par la policy
-- enveloppes ci-dessous) — un rattachement de catégorie manquant côté
-- client, pas une fuite de données au-delà de ce qui est explicitement
-- marqué commun. Pas corrigé ici, hors périmètre de cette migration.

-- RÈGLE : security definer, même raison que est_membre_espace (évite toute
-- dépendance à ce que l'appelant puisse déjà lire membres_espace lui-même,
-- et toute question de récursion en étant utilisée dans une policy d'une
-- AUTRE table).
create or replace function public.partage_un_espace_avec(p_autre_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membres_espace m1
    join public.membres_espace m2
      on m1.espace_id = m2.espace_id
    where m1.user_id = auth.uid()
      and m2.user_id = p_autre_user_id
      and m1.user_id != m2.user_id
  );
$$;

-- Remplace enveloppes_select_own (20260825120000_rls_policies.sql) plutôt
-- que de coexister avec elle — la nouvelle policy couvre déjà "own"
-- (première branche du OR), inutile de garder les deux.
drop policy if exists "enveloppes_select_own" on public.enveloppes;
drop policy if exists "enveloppes_select_espace_partage" on public.enveloppes;
create policy "enveloppes_select_espace_partage" on public.enveloppes
  for select using (
    user_id = auth.uid()
    or (attribue_a = 'commun' and public.partage_un_espace_avec(user_id))
  );

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_select_espace_partage" on public.transactions;
create policy "transactions_select_espace_partage" on public.transactions
  for select using (
    user_id = auth.uid()
    or (attribue_a = 'commun' and public.partage_un_espace_avec(user_id))
  );

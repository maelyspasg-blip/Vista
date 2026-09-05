-- PLANNING PARTAGÉ — RLS. Étape 2/3, après 20260905090000 (schéma).
--
-- RÈGLE À NE JAMAIS CASSER — POLICIES ADDITIVES, JAMAIS UN REMPLACEMENT DE
-- evenements_select_own/update_own/delete_own : même convention que
-- enveloppes_select_espace_partage/transactions_select_espace_partage
-- (migration 20260831160000) — plusieurs policies permissives pour la même
-- commande se combinent en OR côté Postgres. Les policies "own" d'origine
-- (20260825120000_rls_policies.sql) restent donc intactes et continuent de
-- s'appliquer normalement pour un compte hors espace partagé ; celles-ci
-- ne font qu'ÉLARGIR l'accès, jamais le restreindre.
--
-- RÈGLE À NE JAMAIS CASSER — LECTURE : un événement du partenaire est
-- visible si `commun`, OU si `personnel` ET que le PROPRIÉTAIRE (pas le
-- lecteur) n'a pas activé masquer_evenements_personnels — cf. RÈGLE sur ce
-- champ dans 20260905090000_planning_partage_schema.sql.
create policy "evenements_select_espace_partage" on public.evenements
  for select using (
    public.partage_un_espace_avec(user_id)
    and (
      visibilite = 'commun'
      or not coalesce(
        (select masquer_evenements_personnels from public.profils where profils.user_id = evenements.user_id),
        false
      )
    )
  );

-- RÈGLE À NE JAMAIS CASSER — ÉCRITURE OUVERTE UNIQUEMENT POUR visibilite =
-- 'commun' : PREMIÈRE fois que ce projet ouvre une écriture cross-compte
-- (enveloppes/transactions n'ouvrent que la lecture, cf. RÈGLE dans
-- 20260831160000) — nécessaire pour que les deux membres d'un espace
-- puissent modifier/supprimer un événement commun (RÈGLE app/(tabs)/
-- planning.tsx : "Les deux peuvent modifier un événement commun"). Un
-- événement 'personnel' du partenaire reste strictement intouchable en
-- écriture, quel que soit masquer_evenements_personnels (ce flag ne
-- contrôle QUE la lecture).
create policy "evenements_update_espace_partage" on public.evenements
  for update
  using (visibilite = 'commun' and public.partage_un_espace_avec(user_id))
  with check (visibilite = 'commun' and public.partage_un_espace_avec(user_id));

create policy "evenements_delete_espace_partage" on public.evenements
  for delete using (visibilite = 'commun' and public.partage_un_espace_avec(user_id));

-- Aucune policy INSERT ajoutée : insérer "en tant que" quelqu'un d'autre
-- reste strictement interdit, evenements_insert_own (user_id = auth.uid())
-- suffit et ne doit jamais être élargi.

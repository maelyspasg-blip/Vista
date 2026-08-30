-- CONSTAT AVANT CORRECTION : la définition actuelle de
-- public.setup_guest_account() (dernière version : migration
-- 20260828150000_guest_seed_evenements_planning.sql, déjà en place) ne crée
-- QU'UNE SEULE enveloppe "Logement", type = 'Fixe', repete_chaque_mois =
-- true, 700€/700€ (une seule ligne "insert into public.enveloppes... 'Logement'"
-- dans tout le corps de la fonction). Il n'y a donc PAS de doublon ni de
-- mauvais type dans la définition du trigger elle-même — CREATE OR REPLACE
-- FUNCTION remplace intégralement le corps à chaque migration, il ne peut
-- pas exister deux versions actives en même temps.
--
-- Le doublon observé (1400€, type Variable) ne peut donc venir que de
-- DONNÉES DÉJÀ CRÉÉES avant l'application de cette dernière version du
-- trigger — soit un compte invité de test créé sous une version antérieure
-- (avant que "Logement" soit fixé à 700€/Fixe), soit une éventuelle
-- deuxième source de seed non versionnée dans ce repo (cf. RÈGLE en tête de
-- 20260722100100_guest_mode_triggers.sql : un trigger `on_auth_user_created`
-- préexistant, dont la définition exacte n'est pas versionnée ici, pourrait
-- semer une catégorie par défaut à l'inscription). Cette migration RÉPARE
-- donc les DONNÉES des comptes invités déjà créés, en plus de confirmer
-- que le trigger lui-même n'a besoin d'aucun changement.
--
-- RÈGLE DE SÉCURITÉ — JAMAIS DE COMPTE RÉEL TOUCHÉ : toute la réparation
-- ci-dessous est scopée par `profils.is_guest = true` — un vrai compte qui
-- aurait par coïncidence une catégorie nommée "Logement" n'est jamais
-- affecté, quel que soit son état.

do $$
declare
  r record;
  v_garder_id uuid;
  v_a_supprimer uuid[];
begin
  for r in
    select p.user_id
    from public.profils p
    where p.is_guest = true
  loop
    -- Enveloppe "Logement" à conserver pour ce compte : parmi les lignes
    -- actives ce mois-ci (même définition que estCategorieActiveCeMois
    -- côté client, utils/budget.ts — permanente si Fixe + repete_chaque_mois,
    -- sinon mois_comptage = mois en cours), on préfère une ligne déjà Fixe
    -- s'il en existe une (la version correcte), sinon on garde la première
    -- rencontrée pour la corriger ensuite.
    select e.id into v_garder_id
    from public.enveloppes e
    where e.user_id = r.user_id
      and e.nom = 'Logement'
      and (
        (e.type = 'Fixe' and e.repete_chaque_mois = true)
        or e.mois_comptage = date_trunc('month', now())::date
      )
    order by (e.type = 'Fixe') desc
    limit 1;

    if v_garder_id is null then
      continue;
    end if;

    -- Toutes les AUTRES lignes "Logement" actives ce mois-ci pour ce
    -- compte (le ou les doublons à éliminer).
    select array_agg(e.id) into v_a_supprimer
    from public.enveloppes e
    where e.user_id = r.user_id
      and e.nom = 'Logement'
      and e.id <> v_garder_id
      and (
        (e.type = 'Fixe' and e.repete_chaque_mois = true)
        or e.mois_comptage = date_trunc('month', now())::date
      );

    if v_a_supprimer is not null then
      -- Réaffecte au lieu de compter sur un éventuel ON DELETE CASCADE non
      -- documenté : aucune transaction historique n'est perdue, elle se
      -- retrouve simplement rattachée à l'enveloppe conservée.
      update public.transactions
        set enveloppe_id = v_garder_id
        where enveloppe_id = any(v_a_supprimer);

      delete from public.enveloppes
        where id = any(v_a_supprimer);
    end if;

    -- Normalise la ligne conservée : Fixe, récurrente chaque mois, 700€.
    update public.enveloppes
      set type = 'Fixe',
          recurrente = true,
          repete_chaque_mois = true,
          budget = 700,
          depense = 700
      where id = v_garder_id;
  end loop;
end $$;

-- Cohérence avec les 3 mois archivés (M-1/M-2/M-3) : ils affichaient encore
-- 750€ de "Logement" (montant d'origine, avant que le mois en cours passe
-- à 700€) — alignés à 700€ pour ne plus contredire le mois en cours.
update public.snapshot_enveloppes se
set depense = 700,
    budget = 700
from public.snapshots_mois sm
join public.profils p on p.user_id = sm.user_id
where se.snapshot_mois_id = sm.id
  and p.is_guest = true
  and se.nom = 'Logement';

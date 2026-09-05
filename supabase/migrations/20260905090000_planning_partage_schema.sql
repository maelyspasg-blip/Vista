-- PLANNING PARTAGÉ — SCHÉMA : visibilité par événement + rattachement
-- optionnel à un espace + réglage de masquage personnel. Étape 1/3
-- (schéma), suivie de 20260905091000 (RLS) et 20260905092000 (RPC de
-- fusion) — exécuter les trois dans l'ordre.
--
-- RÈGLE À NE JAMAIS CASSER — visibilite PAR DÉFAUT 'commun' : dans un
-- espace partagé, un événement créé sans y penser doit rester visible par
-- le partenaire par défaut (décision explicite de l'utilisateur) — jamais
-- 'personnel' par défaut, qui isolerait silencieusement tout événement créé
-- avant que ce champ n'existe côté client.
--
-- RÈGLE À NE JAMAIS CASSER — espace_id EST DU BOOKKEEPING, JAMAIS LE
-- MÉCANISME D'ACCÈS RLS : contrairement à ce que son nom pourrait suggérer,
-- l'accès entre membres d'un même espace continue de passer par
-- partage_un_espace_avec(user_id) (le même mécanisme que enveloppes/
-- transactions, cf. migration 20260831160000), jamais par une comparaison
-- d'espace_id — ce champ n'est posé QUE par la RPC fusionner_evenements
-- (20260905092000), pour tracer de quel espace vient un événement commun né
-- d'une fusion. Ne jamais l'utiliser dans une policy RLS.
alter table public.evenements
  add column if not exists visibilite varchar(20) default 'commun';

alter table public.evenements
  add column if not exists espace_id uuid references public.espaces_partages(id);

-- RÈGLE À NE JAMAIS CASSER — masquer_evenements_personnels PAR COMPTE,
-- DÉFAUT false : contrôle si LES événements 'personnel' DE CE COMPTE sont
-- visibles par son partenaire (jamais l'inverse — chacun ne contrôle que
-- la visibilité de SES PROPRES événements personnels, cf. RLS SELECT dans
-- 20260905091000 qui lit ce flag sur le PROPRIÉTAIRE de la ligne, jamais
-- sur le lecteur).
alter table public.profils
  add column if not exists masquer_evenements_personnels boolean default false;

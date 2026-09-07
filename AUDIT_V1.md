# Audit V1 — Vista

Suivi de l'audit défini dans `CLAUDE.md` (section "CONTEXTE MAÎTRE — VISTA V1").
Ce fichier est le document vivant : chaque problème trouvé y est classé et documenté
au fur et à mesure, jamais seulement résumé en fin de parcours.

**Statut global actuel : EN COURS — aucune conclusion possible tant que l'audit n'a
pas couvert l'ensemble des points listés dans CLAUDE.md.**

---

## 0. Méthodologie de cette session

Cet environnement n'a pas d'accès direct à Supabase (pas de clé `service_role`, pas
de CLI Supabase) ni de device/simulateur déjà lancé. En conséquence :

- Les **comptes de test** sont créés via un script que *toi* dois exécuter (section 1) —
  je ne peux pas appeler `auth.admin.createUser` moi-même (nécessite la clé
  `service_role`, jamais présente côté app par convention CLAUDE.md), et insérer
  directement dans `auth.users` par SQL brut est fragile/non supporté par Supabase
  (colonnes internes GoTrue non documentées, risque de comptes inutilisables).
- Le premier passage d'audit ci-dessous (section 3) est fait par **lecture de code
  et traçage des calculs** (`store.ts`, `utils/*.ts`, écrans), pas par manipulation
  live de l'app — je le signale explicitement à chaque fois que c'est le cas, pour
  ne jamais faire passer une hypothèse de lecture de code pour un test réellement
  reproduit. Un passage complet nécessitera de rejouer certains scénarios une fois
  les comptes de test créés (via le skill `run`, ou par toi directement).

---

## 1. Comptes de test

Table de suivi — statut `À CRÉER` tant que le compte n'existe pas réellement dans
Supabase. Les UUID réels seront renseignés une fois le script de la section 1.1 exécuté.

| # | Profil | Comportement visé | UUID | Statut |
|---|--------|--------------------|------|--------|
| 1 | Utilisateur simple | Peu de catégories, peu de dépenses | — | À CRÉER |
| 2 | Utilisateur très actif | Nombreuses dépenses quotidiennes | — | À CRÉER |
| 3 | Beaucoup de catégories | Noms variés, montants très différents | — | À CRÉER |
| 4 | Dépenses récurrentes | Loyer, abonnements, transports | — | À CRÉER |
| 5 | Revenus variables | Plusieurs entrées d'argent différentes | — | À CRÉER |
| 6 | Dépenses très élevées | Gros montants | — | À CRÉER |
| 7 | Petites dépenses répétées | Micro-transactions fréquentes | — | À CRÉER |
| 8 | Utilisateur Planning | Nombreux événements | — | À CRÉER |
| 9 | Utilisateur partagé | Vision partagée avec deux personnes | — | À CRÉER |
| 10 | Utilisateur chaotique | Comportement irrégulier volontaire | — | À CRÉER |

### 1.1 Création des comptes (auth.users) — à exécuter par toi

`setup_guest_account()` (trigger `zzz_guest_account_setup_trigger`) ne se déclenche
que sur un insert dans `auth.users` avec `is_anonymous = true` — c'est-à-dire
exactement ce que fait `supabase.auth.signInAnonymously()` côté client. C'est la
seule méthode qui produit un compte Auth réellement valide (GoTrue gère des colonnes
internes qu'un `insert` SQL manuel reproduirait mal). Le script ci-dessous appelle
directement l'endpoint REST Auth de ton projet avec la clé anon (déjà dans `.env`,
jamais la service_role) pour créer les 10 comptes et te rendre leurs UUID :

```bash
#!/bin/bash
# scripts/audit-creer-comptes-test.sh
# Crée 10 comptes anonymes de test (mêmes droits qu'un compte invité réel) et
# affiche leur UUID. Seed automatique par setup_guest_account() (trigger existant) —
# chaque compte démarre donc avec les données de démo standard ; la section 1.2
# fournit le SQL pour les faire diverger vers les 10 profils demandés.
source .env
for i in $(seq 1 10); do
  reponse=$(curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')
  uuid=$(echo "$reponse" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Compte test $i : $uuid"
done
```

Lance-le (`bash scripts/audit-creer-comptes-test.sh`) et colle-moi les 10 UUID
affichés — je m'en sers pour écrire le SQL de la section 1.2 (personnalisation de
chaque profil) avec les bonnes valeurs de `user_id`, et pour mettre à jour la table
ci-dessus.

### 1.2 Personnalisation de chaque profil (SQL)

**En attente des UUID de la section 1.1.** Une fois reçus, je fournis ici un fichier
`supabase/migrations/[timestamp]_audit_v1_comptes_test.sql` avec le contenu SQL complet
(profils, enveloppes, transactions, événements par profil) à exécuter manuellement
dans le dashboard — même convention que toutes les migrations de ce projet.

---

## 2. Journal des problèmes trouvés

### P001 — Modèles de dépense orphelins après suppression d'une catégorie

- **Gravité** : 🟡 MINEUR
- **Description** : `supprimerEnveloppe()` (`app/store.ts`) supprimait la
  catégorie, ses transactions liées, et détachait les événements Planning
  liés — mais ne touchait jamais `modeles_depenses` (les raccourcis "Ajout
  rapide" de Budget, `ModeleDepense.enveloppeId`). Un modèle rattaché à une
  catégorie supprimée restait en base indéfiniment.
- **Reproduction** : créer une catégorie Variable, lui ajouter un modèle de
  dépense rapide (Budget → catégorie dépliée → raccourci), supprimer la
  catégorie. Le modèle restait dans `modeles_depenses` côté Supabase.
- **Compte concerné** : tous (chemin de code général, pas spécifique à un profil).
- **Résultat attendu** : le modèle de dépense est supprimé en même temps que
  sa catégorie, comme les transactions.
- **Résultat obtenu** : le modèle restait en base, orphelin.
- **Cause racine** : `supprimerEnveloppe()` n'avait jamais été mis à jour
  quand les modèles de dépense rapide ont été ajoutés au projet — seule la
  suppression des transactions/le détachement des événements avaient été
  traités.
- **Impact utilisateur réel** : aucun symptôme visible — `budget.tsx` filtre
  déjà l'affichage des modèles par `enveloppeId === env.id` sur la liste des
  catégories *existantes*, donc un modèle orphelin n'apparaît jamais nulle
  part et ne peut jamais planter l'app. C'est une fuite de données
  silencieuse en base (lignes qui s'accumulent sans jamais pouvoir être
  supprimées par l'utilisateur), pas un bug fonctionnel visible — d'où la
  gravité 🟡 plutôt que 🟠.
- **Correction appliquée** : `supprimerEnveloppe()` filtre maintenant
  `etat.modelesDepenses` localement (même geste que pour `transactions`) et
  supprime les lignes correspondantes de `modeles_depenses` côté Supabase
  (`.eq("enveloppe_id", id)`), avec le même traitement d'erreur que les
  transactions liées.
- **Statut** : CORRIGÉ (2026-09-07) — tsc/lint vérifiés propres après coup
  (10 lignes / 50 problèmes, baseline inchangée). Pas encore retesté en
  conditions réelles (pas de compte de test disponible) — à confirmer une
  fois les comptes créés : supprimer une catégorie qui a un modèle de
  dépense rapide et vérifier dans le dashboard Supabase que la ligne
  `modeles_depenses` correspondante disparaît bien.

### P002 — Ordre de suppression enveloppe/transactions non vérifiable statiquement

- **Gravité** : 🔵 SUGGESTION (limite de méthodologie, pas un bug confirmé)
- **Description** : `supprimerEnveloppe()` supprime la ligne `enveloppes`
  AVANT ses `transactions` liées (commentaire dans le code : ordre choisi
  pour laisser la contrainte `snapshot_enveloppes` (`ON DELETE NO ACTION`)
  rejeter proprement une catégorie déjà archivée). Je n'ai pas pu vérifier
  si `transactions.enveloppe_id` a lui-même une contrainte de clé étrangère
  bloquante (`RESTRICT`/`NO ACTION`) qui ferait échouer cette suppression
  pour TOUTE catégorie ayant des transactions, pas seulement les archivées —
  le `CREATE TABLE transactions` d'origine n'est pas versionné dans
  `supabase/migrations/` (schéma initial antérieur au suivi des migrations).
- **Pourquoi ce n'est pas classé plus haut** : le code function tel quel en
  pratique (le chemin est manifestement déjà utilisé sans rapport de
  blocage) — c'est un vrai trou de vérifiabilité statique, pas un
  comportement observé comme cassé.
- **Correction proposée** : aucune pour l'instant — vérifier directement
  dans le dashboard Supabase (Table Editor → transactions → colonne
  enveloppe_id → contrainte) plutôt que de deviner.
- **Statut** : NOUVEAU — nécessite un accès Supabase que je n'ai pas.

Une fois qu'un problème est confirmé (reproduit, pas seulement suspecté à la
lecture), il est ajouté ci-dessus avec ce gabarit :

### [ID] Titre court

- **Gravité** : 🔴/🟠/🟡/🔵
- **Description** :
- **Reproduction** :
- **Compte concerné** :
- **Résultat attendu** :
- **Résultat obtenu** :
- **Cause racine** (si identifiée) :
- **Correction proposée** :
- **Statut** : NOUVEAU / EN COURS / CORRIGÉ / REMONTÉ (attente validation) / ACCEPTÉ (non bloquant)

### 2.1 Décisions autonomes

Journal des choix faits seul pendant une session/loop, quand la règle de
décision de CLAUDE.md ("Règles du loop autonome") s'applique — toujours la
solution la plus conservative en cas de doute, jamais un arrêt qui bloque
la boucle. Rien pour l'instant.

Gabarit :

### [Date/heure] Contexte court

- **Doute rencontré** :
- **Décision prise** (la plus conservative) :
- **Pourquoi** :
- **Fichiers concernés** :
- **À reconsidérer si** : (ce qui justifierait de revenir dessus avec validation)

### 2.2 Questions pour Maëlys

Questions de direction produit qui ne peuvent pas être tranchées seul —
posées ici plutôt que de bloquer le loop en attendant une réponse. Rien pour
l'instant.

Gabarit :

### [Date/heure] Question courte

- **Contexte** :
- **Options envisagées** :
- **Ce que je ferais par défaut si aucune réponse d'ici la fin de l'audit** :

---

## 3. Vision individuelle — parcours principaux

### 3.1 Aperçu (`app/(tabs)/index.tsx`)

*(en cours — lecture de code/traçage, pas encore rejoué sur compte réel : les
constats ci-dessous sont donc des vérifications statiques, à confirmer une fois
les comptes de test disponibles.)*

**Traçage 1 — "Reste estimé en fin de mois" (`calculerResteEstimeCourant`,
`utils/budget.ts`).**
Formule : `disponibleEffectif − totalDepenseEnveloppes − totalDepensePrevue − epargneMois`,
où `totalDepensePrevue = Σ max(0, budget − depense)` sur les catégories actives
non-Entrée (jamais négatif — une catégorie dépassée ne "rembourse" pas le
reste estimé au-delà de sa dépense réelle déjà comptée dans
`totalDepenseEnveloppes`). Rejoué à la main sur un exemple (revenus 2000€,
Loyer 750/750 payé, Alimentation 400 budget/265 dépensé, épargne 200€) → 650€,
cohérent avec "argent non alloué restant, une fois tout le budgété du mois
couvert et l'épargne mise de côté". **Aucune anomalie trouvée sur cette
formule.** Statut : VÉRIFIÉ (lecture de code seule).

**Traçage 2 — création d'une catégorie ne devient jamais fantôme
(`estCategorieActiveCeMois` / `moisComptageEffectif`, `utils/budget.ts`, vs.
`ajouterEnveloppe`, `app/(tabs)/index.tsx`).**
Contexte : un vrai bug a déjà existé sur ce point précis côté seed invité
(catégories sans `mois_comptage`, cf. migration
`20260828140000_guest_seed_fix_mois_courant.sql`, déjà corrigée) — vérifié ici
si le chemin de création NORMAL (utilisateur réel, pas le seed) est concerné :
- **Variable** : `moisComptage` posé explicitement à la création (`premierJourMoisISO(new Date())`),
  qu'elle soit récurrente ou non — inutile mais inoffensif pour une récurrente
  (court-circuitée par `estPermanente` avant même de lire ce champ).
- **Fixe** : `moisComptage` non posé à la création, mais `dateFixe` l'est
  toujours — `moisComptageEffectif` retombe dessus, résultat correct.
- **Entrée** : idem Fixe, `dateFixe` toujours posé à la création.

**Aucune anomalie trouvée sur les 3 chemins de création.** Statut : VÉRIFIÉ
(lecture de code seule — à rejouer en conditions réelles : créer une catégorie
Variable ponctuelle sur un compte de test et vérifier qu'elle disparaît bien de
"Tes catégories" le mois suivant, jamais avant).

**Traçage 3 — suppression d'une catégorie (`supprimerEnveloppe`,
`app/store.ts`).** Voir P001 et P002 (section 2) — un vrai bug de fuite de
données trouvé et corrigé (modèles de dépense orphelins), et une limite de
vérifiabilité documentée (contrainte FK `transactions.enveloppe_id` non
versionnée dans ce repo). Confirmé au passage : le détachement des
événements Planning liés (`categorieLiee`) fonctionne correctement, la
gestion d'erreur `23503` (catégorie déjà archivée) est bien en place.

**Reste à faire sur cet écran** (pas encore tracé) : bloc objectifs, badges de
catégorie récurrente/payée, formulaire d'édition (`sauvegarderEnveloppe`),
sections collapsables (persistance AsyncStorage), pull-to-refresh, vue
partagée (bloc contribution, badges Commun/Moi/[Prénom]).

### 3.2 Budget (`app/(tabs)/budget.tsx`)

*(pas commencé)*

### 3.3 Planning (`app/(tabs)/planning.tsx`)

*(pas commencé)*

### 3.4 Stats / Ton bilan (`app/(tabs)/analytics.tsx`)

*(pas commencé)*

---

## 4. Vision partagée

*(pas commencé — dépend des comptes 9/10 créés en section 1)*

---

## 5. Audit transverse

- [ ] Persistance (reset/seed/migrations, cf. CLAUDE.md)
- [ ] Doublons (catégories, transactions, événements)
- [ ] Sécurité (RLS, suppressions avec filtre `user_id`)
- [ ] Ergonomie (questions UX de CLAUDE.md, à rejouer écran par écran)

---

## 6. Recommandation finale

**Pas encore atteignable.** Section à remplir uniquement une fois les points 1 à 5
couverts, selon le format défini dans CLAUDE.md ("Format du rapport final attendu").

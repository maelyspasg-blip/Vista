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

### P003 — Archivage rétroactif d'un mois codé en dur (épargne + payée wipées en plein mois)

- **Gravité** : 🔴 CRITIQUE (perte de données réelle sur un compte de production)
- **Description** : `verifierArchivageMoisInterne()` (`app/store.ts`)
  utilisait `const moisCourant = 5; const anneeCourante = 2026;` (juin
  2026, le mois où cette fonction a été écrite à l'origine, commit
  `b7ff904`) comme hypothèse de "premier mois jamais archivé" dès que
  `etat.dernierMoisArchive` valait `null` pour un compte. Si ce cas se
  représentait pour un compte DÉJÀ utilisé depuis des mois (chargement du
  profil pas encore terminé, `dernier_mois_archive_mois/annee` `NULL` côté
  Supabase pour une raison quelconque, etc.), la fonction archivait
  automatiquement ce juin 2026 figé — quel que soit le mois réel en cours —
  via `archiverMoisActuelInterne`, qui remet `epargneMois` à 0 ET remet à
  zéro `depense`/`payee` de toutes les catégories permanentes (Fixe
  récurrente / Variable récurrente), EN PLEIN MILIEU du mois réel.
- **Reproduction** : sur un compte existant utilisé depuis plusieurs mois,
  faire en sorte que `dernierMoisArchive` redevienne `null` en mémoire au
  moment où `verifierArchivageMoisInterne` s'exécute (ex. profil pas encore
  chargé) — l'archivage du mois codé en dur se déclenche silencieusement,
  sans rapport avec la date réelle.
- **Compte concerné** : Maëlys (`c80c78f3-fd9e-4d85-a4e5-c49bf0a624fa`),
  remonté le 2026-09-11. Chemin de code général — potentiellement tout
  compte, pas spécifique à ce profil.
- **Résultat attendu** : l'épargne du mois en cours reste intacte tant
  qu'aucun vrai changement de mois n'a eu lieu ; les catégories Fixe
  récurrentes (Loyer, Abonnements) restent marquées `payee: true` une fois
  réglées, jusqu'au vrai mois suivant.
- **Résultat obtenu** : `epargne_mois` remis à 0 sans que l'argent n'ait
  été réellement dépensé ; Loyer/Abonnements repassés à `payee: false`,
  `depense: 0` en plein mois — et comme `verifierEcheancesFixesInterne`
  avait déjà avancé leur `dateFixe` au mois suivant AVANT ce reset, plus
  aucune re-détection d'échéance n'était possible pour ce mois-ci ensuite
  (d'où le symptôme "les échéances ne se déclenchent pas").
- **Cause racine** : bootstrap codé en dur jamais rendu dynamique,
  introduit dans le commit `b7ff904` ("Complete Supabase persistence:
  historique paiements, archivage mensuel, argent disponible") et jamais
  modifié depuis (confirmé via `git log --all -S "const moisCourant = 5"`).
- **Correction appliquée** : suppression totale de l'archivage rétroactif
  d'un mois arbitraire. Quand `dernierMoisArchive` est `null`, la fonction
  pose désormais le curseur au mois réel précédent (`new Date(anneeActuelle,
  moisActuel - 1, 1)`), persisté via `majDernierMoisArchiveSupabase`, SANS
  jamais appeler `archiverMoisActuelInterne` sur une date devinée — aucun
  snapshot créé, aucune donnée live touchée. Commit `137c564`, revu par
  code-reviewer + security-auditor (agents dédiés, 0 bloquant), tsc/lint
  vérifiés propres avant/après (10 lignes / 50 problèmes, baseline
  inchangée).
- **Point résiduel noté par le code-reviewer** (non bloquant, à surveiller) :
  si `chargerObjectifs()` échoue de façon transitoire juste avant cette
  branche sur un compte ayant un VRAI retard d'archivage de plusieurs mois,
  le nouveau code déduit un mois précédent et l'écrit en base — écrasant
  silencieusement un éventuel vrai curseur de retard. Strictement moins
  grave que l'ancien bug (aucun reset destructeur sur le mois en cours),
  mais à garder en tête si un futur compte présente un historique
  d'archivage réellement en retard.
- **Non corrigé par moi (hors accès DB)** : la valeur d'épargne perdue sur
  le compte de Maëlys n'est pas récupérable — aucun enregistrement de sa
  valeur avant le reset. SQL manuel fourni à l'utilisatrice pour la
  restaurer si elle se souvient du montant, et pour corriger manuellement
  les enveloppes Fixe impactées (`payee`/`depense`) en attendant que la
  cause racine soit corrigée (voir réponse du 2026-09-11).
- **Statut** : CORRIGÉ (2026-09-11, commit `137c564`) côté cause racine
  applicative. Données déjà perdues sur le compte de Maëlys : correction
  manuelle SQL transmise, épargne non récupérable.

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
posées ici plutôt que de bloquer le loop en attendant une réponse.

### 2026-09-13 — Pubs en vue partagée : contenu flouté "Ton bilan → Vista" (insights)

- **Contexte** : demande "le contenu flouté derrière le cadenas doit
  refléter les données partagées (pas les données individuelles)" pour les
  3 emplacements de pub. Investigation : le cadenas lui-même (useDeblocagePub)
  s'applique déjà IDENTIQUEMENT en vue perso et en vue partagée sur les 3
  emplacements (aucun des 3 gates ne teste `vueActive`) — rien n'est
  bypassé. L'écart réel est le contenu affiché une fois débloqué. Pour
  l'onglet Vista de "Ton bilan" (`genererInsightsPeriode`,
  `app/(tabs)/analytics.tsx`), une vraie consolidation couple demanderait
  de fusionner aussi `series` (calculerSeries, `utils/series.ts`) — utilisé
  aussi par `scoreSante`/`explicationsScore` — pas seulement les totaux
  agrégés (`donneesReellesConsolidees` etc., déjà prêts). Consolider
  seulement les totaux sans `series` produirait des insights incohérents
  (mélange couple/individuel).
- **Options envisagées** : (a) reporter et documenter ; (b) aller jusqu'au
  bout maintenant (consolider `calculerSeries`, chantier plus large,
  touche un utilitaire partagé avec Santé).
- **Réponse de Maëlys (2026-09-13)** : reporter, documenter ici. Non traité
  cette session — `genererInsightsPeriode`/`series` restent personnels
  même en vue partagée pour l'onglet Vista de "Ton bilan".

### 2026-09-13 — Pubs en vue partagée : "Nos conseils" (Aperçu)

- **Contexte** : la section "Nos conseils" (`app/(tabs)/index.tsx`) a déjà
  une RÈGLE explicite qui la garde DÉLIBÉRÉMENT personnelle même en vue
  partagée — `genererConseils` fait correspondre ses situations à des
  lignes réelles de `historiquesMois` PAR COMPTE ; une catégorie fusionnée
  synthétique ne correspondrait à aucun snapshot réel. Le cadenas
  (`InsightVerrouille`) s'applique déjà pareil des deux côtés.
- **Options envisagées** : (a) laisser personnel (statu quo) ; (b) rendre
  couple malgré la contrainte technique (dégraderait certaines des 5
  règles d'insights).
- **Réponse de Maëlys (2026-09-13)** : laisser personnel. Aucun changement
  — RÈGLE existante confirmée, pas contredite.

### 2026-09-13 — Pubs en vue partagée : Trophées / Simulateur ("Ton bilan")

- **Contexte** : ces 2 des 4 onglets de "Ton bilan" n'ont AUCUNE logique
  "vue partagée" aujourd'hui (contenu toujours personnel, quelle que soit
  la vue) — le cadenas d'entrée est déjà identique des deux côtés, mais
  rien à consolider n'existe encore derrière. Les rendre "couple" est une
  vraie nouvelle fonctionnalité (trophées du couple ? simulateur sur une
  catégorie fusionnée, avec quelle sémantique d'application côté
  Supabase ?) plutôt qu'une correction.
- **Options envisagées** : (a) reporter, documenter (pas de spec donnée) ;
  (b) donner une spec précise pour ces 2 onglets et l'implémenter.
- **Réponse de Maëlys (2026-09-13)** : reporter, documenter ici. Aucune
  spec fournie pour l'instant — Trophées et Simulateur restent personnels
  quelle que soit la vue, dans les deux onglets de "Ton bilan".
- **À reconsidérer si** : une spec produit précise est donnée pour l'un ou
  l'autre onglet (ex: définition d'un "trophée du couple", ou sémantique
  d'un budget simulé partagé).

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
- [x] Sécurité (RLS, suppressions avec filtre `user_id`) — voir 5.1 ci-dessous
- [ ] Ergonomie (questions UX de CLAUDE.md, à rejouer écran par écran)

### 5.1 Audit sécurité données (2026-09-12)

Audit à 4 niveaux demandé explicitement (code destructif / sauvegardes /
RLS / migrations), réalisé par deux passes de lecture exhaustive : tout
`app/store.ts`, `app/EspacePartageContext.tsx`, `utils/espacePartage.ts`,
`app/profil.tsx`, les 3 Edge Functions, et les 48 fichiers de
`supabase/migrations/` en ordre chronologique.

#### A. Inventaire des opérations destructives (code applicatif)

| Fonction | Table(s) | Filtre `user_id` avant correctif | Confirmation UI | Log `audit_operations` avant correctif |
|---|---|---|---|---|
| `appliquerEnveloppes` (interne) | `enveloppes` (DELETE), `enveloppes` (UPDATE) | ✅ (DELETE) / ❌ (UPDATE, RLS seule) | implicite (édition catégorie) | ✅ |
| `majObjectifSupabase`/`majEvenementSupabase` (internes, UPDATE) | `objectifs`, `evenements` | ❌ (RLS seule) | implicite | n/a (UPDATE, pas destructif au sens strict) |
| `enregistrerSnapshotMoisSupabase` (interne) | `snapshots_mois` (upsert), `snapshot_enveloppes`/`snapshot_objectifs` (DELETE post-insert vérifié) | ✅ | n/a (automatique, protégé par garde-fou anti-écrasement) | n/a |
| `archiverMoisActuelInterne` | remise à zéro `depense` en mémoire + Supabase | ✅ (via les fonctions ci-dessus) | n/a (automatique, mensuel) | ✅ (succès et échec) |
| `supprimerObjectif` | `objectifs` | ✅ | à confirmer visuellement (3 sites d'appel repérés sans `Alert.alert` tracé autour) | ❌ → **corrigé** |
| **`supprimerEnveloppe`** | `enveloppes`, `transactions` liées, `modeles_depenses` liés | ❌ sur les 3 → **corrigé** | ✅ (`Alert.alert` explicite, irréversibilité mentionnée) | ❌ → **corrigé** |
| `supprimerEnveloppe` — dissociation `evenements` (categorie_liee) | `evenements` | RLS seule, **volontairement** — voir note ⚠️ ci-dessous | idem | ❌ → **corrigé** (log seul, sans filtre) |
| `supprimerEvenement` | `evenements` | RLS seule, **volontairement** — voir note ⚠️ ci-dessous | ✅ pour un événement "commun" en espace partagé ; personnel non tracé | ❌ → **corrigé** |
| `supprimerTransaction` | `transactions` | ❌ → **corrigé** | ✅ (`Alert.alert`, montant affiché) | ❌ → **corrigé** |
| `supprimerModeleDepense` | `modeles_depenses` | ❌ → **corrigé** (filtre seulement, log volontairement omis, cf. CLAUDE.md) | non tracée (raccourci UI mineur) | n/a par choix documenté |
| `renommerCategoriePartout` | `enveloppes`, `snapshot_enveloppes` (rétroactif, volontaire) | ✅ | implicite | n/a (renommage, pas une suppression) |
| `televerserAvatar` | `profils` (avatar_url) | ✅ | n/a | n/a |
| RPC espace partagé (`creer_espace_partage`, `rejoindre_espace_par_code`, `quitter_espace_partage`, `modifier_mode_balance_espace`, `fusionner_evenements`) | — | `security definer`, identité toujours dérivée de `auth.uid()` côté serveur | ✅ (ex. `quitter_espace_partage` côté `profil.tsx`) | n/a |
| `supprimerDonneesUtilisateur` (Edge Function partagée) | `transactions`, `evenements`, `historique_paiements`, `snapshots_mois` (+ enfants), `objectifs`, `enveloppes`, `profils` | ✅ toutes scopées `user_id` | n/a (déclenché par `delete-account`/`cleanup-expired-guests`) | n/a |

**Corrections appliquées** (commit de ce jour) :
- `supprimerEnveloppe` : ajout du filtre `.eq("user_id", user.id)` sur 3 des 4 écritures (enveloppes, transactions, modeles_depenses — **pas** `evenements`, voir note ⚠️ ci-dessous), ajout d'un backup `sauvegarderEnveloppesSupprimees` avant suppression (absent sur ce chemin précis — n'existait que dans `appliquerEnveloppes`), ajout d'un log `journaliserOperationAudit("suppression_enveloppe", ...)`.
- `supprimerObjectif` : ajout du log `journaliserOperationAudit("suppression_objectif", ...)` (le filtre `user_id` et le backup existaient déjà).
- `supprimerEvenement` : log `journaliserOperationAudit("suppression_evenement", ...)` ajouté, **sans** filtre `user_id` (voir note ⚠️ ci-dessous).
- `supprimerTransaction` : filtre `user_id` + log `journaliserOperationAudit("suppression_transaction", ...)`.
- `supprimerModeleDepense` : filtre `user_id` ajouté ; log volontairement omis (raccourci UI, pas une donnée financière — cf. P001).

**⚠️ Correctif appliqué PUIS PARTIELLEMENT REVERTÉ en revue (2026-09-12), avant tout commit** — régression trouvée par le code-reviewer, jamais publiée : la première version de ce correctif ajoutait `.eq("user_id", user.id)` aux 2 écritures `evenements` (`supprimerEvenement`, et la dissociation `categorie_liee` dans `supprimerEnveloppe`). C'est incorrect pour cette table précise : `evenements` est la SEULE table du projet avec une écriture cross-compte RLS volontaire (`evenements_update_espace_partage`/`evenements_delete_espace_partage`, `20260905091000_planning_partage_rls.sql`) — un événement `commun` créé par le partenaire A doit rester supprimable/dissociable par le partenaire B, alors que `evenements.user_id` vaut A, pas B. Un filtre `.eq("user_id", B)` aurait exclu silencieusement ces lignes (0 ligne affectée, Supabase ne renvoie aucune erreur pour un DELETE/UPDATE qui ne matche rien) alors que l'état local avait déjà été mis à jour côté UI — recréant exactement les bugs "événement fantôme qui réapparaît" / "catégorie fantôme" interdits par CLAUDE.md. **Corrigé avant commit** : le filtre `user_id` a été retiré de ces 2 écritures précises (retour à RLS seule, comme avant cet audit) ; le log `audit_operations` et le reste du correctif restent en place.

**Non corrigé dans cette passe (documenté, pas oublié)** :
- 🟡 `delete-account` ne fait aucun export/sauvegarde des données avant suppression définitive du compte (contrairement à l'archivage mensuel/aux suppressions de catégorie-objectif, qui ont toutes un filet de secours). Identité de l'appelant vérifiée correctement (JWT via `auth.getUser()`, jamais un `user_id` de body) — pas une faille d'accès, une absence de filet de récupération en cas de suppression accidentelle.
- 🟡 Confirmation UI non tracée avec certitude pour `supprimerObjectif` (3 sites d'appel dans `index.tsx`) et pour un événement personnel (non "commun") dans `supprimerEvenement` — à vérifier visuellement dans l'app plutôt que supposer une régression à partir d'un simple grep.
- 🟡 La plupart des `UPDATE` (objectifs, evenements, transactions, modeles_depenses) n'ont toujours pas de filtre `user_id` client explicite — protégés uniquement par RLS. Risque théorique si une policy RLS venait à régresser ; non corrigé ici pour rester proportionné (ce sont des mises à jour, pas des suppressions, et RLS est vérifiée saine en section suivante).
- 🟡 `supprimerEnveloppe` : en cas d'échec du DELETE `transactions`/`modeles_depenses` liés APRÈS que l'état local les ait déjà retirés, l'UI et la base peuvent diverger (transactions orphelines invisibles côté client) — erreur seulement logguée, jamais réconciliée automatiquement. Pas corrigé (nécessiterait une vraie logique de rollback/retry, hors scope d'un audit).

**2026-09-13 — Exposition accrue d'un gap déjà connu** : `ESPACE_PARTAGE_ACTIF` passé à `true` "pour les tests" (diagnostic onboarding "Vista à deux", cf. `utils/premium.ts`) — les RPC espace partagé (`creer_espace_partage`/`rejoindre_espace_par_code`/`quitter_espace_partage`, ligne du tableau ci-dessus, colonne Log = `n/a`) restent sans trace `audit_operations`. Jusqu'ici seuls Maëlys/Louis (admin) pouvaient atteindre ce chemin (`estEspacePartageActif = ESPACE_PARTAGE_ACTIF || isAdmin`) ; désormais TOUT compte de test le peut. Aucune faille RLS (policies vérifiées saines par le security-auditor), mais `quitter_espace_partage` fait un vrai DELETE non journalisé — à ajouter (`journaliserOperationAudit`) avant un usage prolongé par plusieurs comptes de test, et à revoir avant que ce flag ne devienne permanent pour la V1. Repasser `ESPACE_PARTAGE_ACTIF` à `false` avant toute build de production reste impératif tant que ce point n'est pas traité.

#### B. Statut RLS par table

Les 48 migrations ont été lues intégralement. **Toutes les tables trouvées ont RLS activée**, aucune table sans RLS détectée :

| Table | RLS | Policies |
|---|---|---|
| `enveloppes`, `transactions`, `objectifs`, `evenements`, `profils`, `snapshots_mois`, `historique_paiements`, `modeles_depenses` | ✅ | SELECT/INSERT/UPDATE/DELETE toutes `auth.uid() = user_id`, symétriques |
| `snapshot_enveloppes`, `snapshot_objectifs` | ✅ | scopées via `snapshots_mois.user_id`, cohérent sur les 4 commandes |
| `espaces_partages`, `membres_espace` | ✅ | scopées via `est_membre_espace()` / rôle propriétaire — historique de 2 policies trop larges, **corrigées avant l'état actuel** (voir points de vulnérabilité) |
| `audit_operations` | ✅ | SELECT/INSERT `user_id`, **aucune UPDATE/DELETE** (voulu — journal immuable) |
| `remboursements_espace` | ✅ | SELECT/INSERT scopées `est_membre_espace()`, pas d'UPDATE/DELETE (append-only, voulu) |
| `enveloppes`/`transactions` — lecture partenaire | ✅ | `enveloppes_select_espace_partage`/`transactions_select_espace_partage` : accès en LECTURE complet une fois lié (décision produit assumée et documentée, jamais l'écriture) |
| `evenements` — écriture partenaire | ✅ | UPDATE/DELETE cross-compte restreints à `visibilite = 'commun'`, plus étroit que la policy SELECT correspondante |

**Fonctions `security definer`** (`est_membre_espace`, `creer_espace_partage`, `rejoindre_espace_par_code`, `quitter_espace_partage`, `partage_un_espace_avec`, `fusionner_evenements`, `modifier_mode_balance_espace`, `epargne_mois_partenaire`, `couleur_espace_partage_partenaire`) : **toutes revalident `auth.uid()` en interne**, aucune ne fait confiance à un `user_id`/`espace_id` fourni par le client pour établir l'identité de l'appelant. Un seul cas nuancé : `desactiver_expiration_espace(p_espace_id)`, jamais exposée en RPC publique (appelée uniquement en interne par `rejoindre_espace_par_code`, déjà validée) mais sans revalidation propre — **corrigé** (voir Points de vulnérabilité).

Aucune récursion RLS active aujourd'hui (`membres_espace_select_own_or_cospace` en a eu une, corrigée dès `20260830150000` en extrayant la sous-requête dans `est_membre_espace()`).

#### C. Points de vulnérabilité identifiés

- 🟡 **`desactiver_expiration_espace(p_espace_id)` sans revalidation d'appartenance** — sans risque en l'état (jamais appelée directement par le client), mais fragile si un jour exposée en RPC publique sans y repenser. **Corrigé** : migration `20260912100000_desactiver_expiration_espace_defense_profondeur.sql` (SQL fourni ci-dessous, à exécuter manuellement dans le dashboard Supabase — aucun accès CLI depuis cet environnement) ajoute `and exists (select 1 from membres_espace where espace_id = p_espace_id and user_id = auth.uid())` à la clause `where` de l'`UPDATE`. Comportement inchangé pour son unique appelant actuel.
- 🟡 **Accès lecture complet du partenaire sur `enveloppes`/`transactions`** une fois deux comptes liés (`20260831160000_espace_partage_acces_complet.sql`) — décision produit déjà assumée et documentée dans la migration elle-même, pas un bug. Signalé pour confirmation explicite avant la V1 grand public : `ESPACE_PARTAGE_ACTIF = false` limite le risque actuel en bêta.
- 🟡 **Historique de 2 policies temporairement trop larges** (`espaces_partages_select_auth` : tout utilisateur authentifié pouvait lister tous les codes d'invitation ; `membres_espace_insert_own` : auto-ajout à un `espace_id` arbitraire) — **toutes deux corrigées** dans une migration ultérieure (`20260831110000`), avant l'état actuel du schéma. Si les migrations ont été appliquées en production de façon échelonnée, il y a pu avoir une fenêtre d'exposition réelle entre les deux — à vérifier côté dashboard (date de déploiement), pas déductible depuis ce repo seul.
- 🔵 10 tables (`enveloppes`, `transactions`, `objectifs`, `evenements`, `profils`, `snapshots_mois`, `snapshot_enveloppes`, `snapshot_objectifs`, `historique_paiements`, `modeles_depenses`) n'ont jamais de `CREATE TABLE` versionné — créées hors bande (dashboard). Pas une faille RLS (RLS bien vérifiée dessus), mais une zone aveugle documentaire pour tout futur audit (contraintes/triggers non versionnés invérifiables depuis ce repo seul).

**Aucun 🔴 critique trouvé** — ni côté opérations destructives applicatives, ni côté RLS/migrations.

#### D. Migrations — sécurité additive

Aucun `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` dans les 48 migrations. Les 6 `DELETE FROM` trouvés sont tous étroits et sûrs : 2 réparations de doublons scopées `profils.is_guest = true` (jamais un vrai compte), 4 dans des RPC `security definer` où l'id supprimé est systématiquement dérivé de `auth.uid()`/d'une vérification d'appartenance déjà faite dans la même transaction. `DROP POLICY IF EXISTS` suivi d'un `CREATE POLICY` (idiome bénin de remplacement) est le seul "DROP" fréquent du corpus. Convention additive (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`) respectée de façon quasi systématique — **déjà conforme à la règle demandée, désormais documentée explicitement dans CLAUDE.md** ("Migrations Supabase — additive uniquement").

#### E. Ce qui est déjà solide (à ne pas casser)

- `archiverMoisActuelInterne` : snapshot créé et validé AVANT toute remise à zéro, abandon total si la validation échoue, backup AsyncStorage avec rotation, log succès **et** échec — un modèle de robustesse pour toute future fonction destructive.
- `delete-account`/`cleanup-expired-guests` : identité vérifiée par JWT (`auth.getUser()`), jamais un `user_id` de body ; double condition réelle (`is_guest` + expiration) vérifiée par `SELECT` avant toute suppression en masse ; secret cron obligatoire sans bypass silencieux.
- `audit_operations` : journal immuable (aucune policy UPDATE/DELETE exposée).
- Toutes les fonctions `security definer` cross-compte dérivent l'identité de `auth.uid()`, jamais d'un paramètre client — y compris `fusionner_evenements()` qui revalide même une règle métier fine (masquage des événements personnels) malgré le bypass RLS.

---

## 6. Recommandation finale

**Pas encore atteignable.** Section à remplir uniquement une fois les points 1 à 5
couverts, selon le format défini dans CLAUDE.md ("Format du rapport final attendu").

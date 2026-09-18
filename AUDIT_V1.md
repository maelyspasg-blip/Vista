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

### P004 — `moisComptageEffectif` : parsing UTC/local incohérent sur `dateFixe` (2 copies identiques)

- **Gravité** : 🔴 CRITIQUE (mauvais rattachement au mois pour des catégories Fixe ponctuelles)
- **Trouvé par** : audit calculs financiers ET audit architecture statique, indépendamment (2026-09-16) — convergence qui renforce la confiance dans le diagnostic.
- **Fichiers** : `utils/budget.ts:22-29`, copie volontaire dans `app/store.ts:127-134`.
- **Description** : `dateFixe` est écrit avec des composants **locaux**
  (`dateVersISOInterne`) → chaîne `"YYYY-MM-DD"` sans heure. `moisComptageEffectif`
  la relit avec `new Date(env.dateFixe)`, que JS interprète comme **minuit UTC**,
  puis appelle `getFullYear()/getMonth()` (accesseurs **locaux**) dessus. Pour tout
  fuseau à décalage négatif sur UTC (Amériques, y compris DOM-TOM français —
  Martinique/Guadeloupe/Guyane), ceci décale la date d'un jour en arrière.
- **Repro vérifiée (Node, `TZ=America/New_York`)** : `new Date("2026-09-01")` →
  `getMonth()=7` (août) au lieu de 8 (septembre).
- **Impact** : c'est le SEUL mécanisme de rattachement au mois pour toute catégorie
  "Fixe" ponctuelle (`moisComptage` jamais renseigné à la création pour ce type,
  seulement pour "Variable", cf. `index.tsx` ~ligne 1101). Une facture ponctuelle
  datée du 1er du mois disparaît de "Tes catégories"/Budget pour son propre mois,
  fausse `entreesBudgetDuMois`/`calculerResteEstimeCourant`.
- **Cause racine** : mélange écriture-locale / lecture-UTC sur une chaîne
  `date`-only, alors que `dateVersISOInterne`/`premierJourMoisISO` (mêmes fichiers)
  font déjà ce parsing correctement à l'écriture — le bug est dans la relecture.
- **Piste de correction** : parser `dateFixe` avec des composants explicites
  (`new Date(y, m-1, d)` via split manuel de la chaîne) dans les 2 copies, au lieu
  de laisser `new Date(chaineISO)` interpréter en UTC.
- **Statut** : **CORRIGÉ (2026-09-16)** — nouvelle fonction partagée
  `parseDateFixeLocale` créée dans `utils/dateOnly.ts` (module volontairement
  SANS AUCUNE dépendance, ni vers `store.ts` ni ailleurs — nécessaire car
  `app/notifications.ts` importe des choses depuis `store.ts` ET avait besoin
  de cette fonction : la définir dans `store.ts` aurait créé un cycle
  d'imports `store.ts → notifications.ts → store.ts`). `app/store.ts`
  l'importe et la ré-exporte (compat des sites qui l'importaient déjà depuis
  `"../store"`) ; `utils/budget.ts` l'importe directement (utils→utils, ne
  viole pas la règle "utils/ ne dépend pas de store.ts"). Round-trip
  fail-safe ajouté après revue sécurité : une chaîne malformée/hors bornes
  (ex. "2026-13-40") redevient explicitement `Invalid Date` plutôt que de
  rouler silencieusement vers une autre date. Revu par code-reviewer +
  security-auditor (2 rounds — 2 points bloquants trouvés au 1er round sur
  des sites d'affichage non couverts par le lot initial, corrigés avant
  commit, voir P040). tsc/lint vérifiés propres (10 lignes / 49 problèmes,
  sous la baseline).

### P005 — `journeeISO` (`utils/conseils.ts`) décale le "jour du jour" pour les utilisateurs Europe

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Fichier** : `utils/conseils.ts:546-548` — `date.toISOString().slice(0, 10)`.
- **Description** : bug miroir de P004. `.toISOString()` convertit en UTC ; pour un
  utilisateur à Frankfurt/Paris (UTC+1/+2), l'heure locale est **en avance** sur
  UTC. Entre minuit local et ~1h-2h du matin, la date UTC est encore celle de la
  veille → `journeeISO(new Date())` renvoie la date d'hier pendant cette fenêtre,
  **chaque jour**, pour TOUS les utilisateurs du fuseau du projet.
- **Repro** : ouvrir l'app à 0h15 en été (UTC+2) → `new Date()` = 2026-09-16T00:15
  local = 2026-09-15T22:15 UTC → `journeeISO` renvoie `"2026-09-15"`.
- **Impact** : `aujourdHui` (ligne 969) sert de clé pour `detecterSituations` (streaks,
  comptage de jours consécutifs pour faire évoluer un conseil de "NOUVEAU" à
  "CONFIRMÉ") — peut dédupliquer à tort deux vraies journées ou fausser un
  comptage de jours consécutifs pour tout utilisateur ouvrant l'app tôt le matin.
- **Cause racine** : la bonne implémentation existe déjà ailleurs dans le code
  (`dateVersISOInterne`, `app/store.ts:116-118`, accesseurs locaux) mais
  `utils/conseils.ts` ne peut pas l'importer (règle d'architecture : `utils/` ne
  doit pas dépendre de `store.ts`, cf. P015) — d'où une réécriture locale, incorrecte.
- **Piste de correction** : reconstruire `journeeISO` avec des accesseurs locaux
  (`${y}-${pad(m+1)}-${pad(d)}`) directement dans `utils/conseils.ts`, sans
  dépendre de `store.ts`.
- **Statut** : **CORRIGÉ (2026-09-16)** — reconstruite avec des accesseurs
  locaux, même geste que `dateVersISOInterne`. tsc/lint vérifiés propres.

### P006 — Archivage mensuel : double insertion des "Entrées" reconduites en cas d'exécution concurrente

- **Gravité** : 🔴 CRITIQUE (double comptage silencieux et permanent du revenu du mois)
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Fichiers** : `app/store.ts:1445-1755` (spécifiquement 1642-1708), déclenché
  depuis `app/(tabs)/_layout.tsx:123-160`.
- **Description** : `verifierEtat()` est appelée depuis 3 sources indépendantes
  (montage, `setInterval` 60s, retour au premier plan `AppState`) sans exclusion
  mutuelle. Le garde-fou anti-doublon `dejaArchive` (`store.ts:1454`) teste
  `etat.historiquesMois`, mis à jour seulement en **toute fin** de fonction, après
  plusieurs `await` réseau (5+ aller-retours pour le snapshot). Deux exécutions
  concurrentes pour le même mois passent donc toutes les deux ce garde-fou. Le
  snapshot lui-même est protégé (upsert `onConflict`), mais la reconduction des
  "Entrées" récurrentes (lignes 1642-1708) et l'entrée "Report du mois précédent"
  (1667-1679) font un `insert` **nu**, sans upsert ni vérification d'existence.
- **Scénario concret** : app restée fermée à cheval sur un changement de mois
  (cas déjà identifié comme fréquent par le code, commentaire ligne 1757-1776) —
  au relancement, montage ET retour au premier plan peuvent tous deux déclencher
  `verifierEtat()` pendant que le premier archivage réseau est encore en cours
  → double insertion de chaque Entrée récurrente (ex. salaire compté deux fois).
- **Piste de correction** : verrou en mémoire par `(mois, annee)` (Set/Map des
  clés en cours de traitement) au tout début de `archiverMoisActuelInterne`,
  libéré en `finally` ; et/ou contrainte unique côté `enveloppes` sur les
  reconductions avec upsert `onConflict`.
- **Statut** : **CORRIGÉ (2026-09-17)** — exactement la piste ci-dessus :
  `archiverMoisActuelInterne` (nom d'origine) devient un thin wrapper qui
  pose un verrou synchrone (`Set<string>` module-level, clé `${annee}-${mois}`)
  AVANT le premier `await`, appelle le corps original (renommé
  `archiverMoisActuelInterneCoeur`) dans un `try`, libère le verrou en
  `finally`. Ferme la fenêtre de course entièrement (JS mono-thread — aucune
  ré-entrance possible entre le test et la pose). Revu par code-reviewer sur
  2 rounds (voir P008 pour le détail — les 2 bugs ont été corrigés et revus
  ensemble dans le même changement) : APPROUVÉ, les 2 appelants existants
  (`verifierArchivageMoisInterne`, l'action publique `archiverMoisActuel`)
  passent par ce wrapper sans aucune modification nécessaire de leur côté.

### P007 — Duplication de `historique_paiements` par la même race que P006

- **Gravité** : 🟠 MAJEUR (n'affecte pas `depense`/`budget`, juste l'historique affiché en double)
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Fichiers** : `app/store.ts:2099-2188` (garde `dejaPayeeCeMois`, 2103-2111),
  `ajouterPaiementHistoriqueInterne` (1022-1061).
- **Description** : même mécanisme que P006 — `dejaPayeeCeMois` compare l'état
  **en mémoire**, mis à jour seulement après l'`insert` ; `insert` nu, sans upsert.
  Deux exécutions concurrentes de `verifierEcheancesFixesInterne()` sur une
  échéance Fixe en retard (ex. loyer) ajoutent chacune une ligne identique.
- **Piste de correction** : même verrou que P006 appliqué à `verifierEtat()`, ou
  contrainte unique `(user_id, enveloppe_id, mois, annee)` sur `historique_paiements`.
- **Statut** : **CORRIGÉ (2026-09-17)** — même pattern que P006 : la fonction
  (nom d'origine `verifierEcheancesFixesInterne`) devient un thin wrapper
  avec un booléen module-level `verificationEcheancesEnCours` (pas un `Set`
  comme P006 — cette fonction traite toutes les échéances en un seul appel,
  pas une entité scopée par clé), posé avant le premier `await`, corps
  original renommé `verifierEcheancesFixesInterneCoeur`. Revu par
  code-reviewer (APPROUVÉ) : scénario de course tracé à la main (2e
  invocation bloquée avant toute lecture de `etat.historiquePaiements`),
  unique appelant confirmé passer par le wrapper, cas normal strictement
  inchangé. tsc/lint vérifiés propres (10 lignes / 49 problèmes, sous la
  baseline).

### P008 — Archivage mensuel interrompu après validation du snapshot : curseur figé définitivement, sans retry possible

- **Gravité** : 🔴 CRITIQUE (perte/incohérence de données silencieuse ET permanente, bloque tous les mois suivants)
- **Trouvé par** : audit persistance / suivi sécurité (2026-09-16), angle explicitement
  demandé (fenêtre d'interruption APRÈS succès du snapshot) — non couvert par
  l'audit du 2026-09-12, qui n'avait vérifié que le cas "snapshot invalide → abandon total".
- **Fichiers** : `app/store.ts:1445-1755` (`archiverMoisActuelInterne`),
  `app/store.ts:1777-1849` (`verifierArchivageMoisInterne`).
- **Description** : une fois le snapshot confirmé (ligne 1599), toutes les
  écritures suivantes sont en *fire-and-forget*, jamais `await`-ées par la
  fonction qui retourne immédiatement : `appliquerEnveloppes(...)` (remise à
  zéro `depense`, ligne 1730-1732), `majEpargneMoisSupabase(0)` (1733),
  `majDernierMoisArchiveSupabase(mois, annee)` (1734, le curseur lui-même),
  `objectifsMaj.forEach(majObjectifSupabase(...))` (1735-1737).
- **Scénario concret** : fermeture forcée / crash / coupure réseau juste après la
  confirmation du snapshot, pendant que ces écritures sont encore en vol. Au
  prochain lancement : le snapshot existe déjà (rechargé depuis Supabase), mais
  `dernier_mois_archive_*` n'a jamais avancé. `verifierArchivageMoisInterne`
  recalcule le même mois → `archiverMoisActuelInterne` est rappelée → la garde
  `dejaArchive` (basée sur la seule présence du snapshot) **retourne
  immédiatement**, avant même de retenter la remise à zéro. Le filet anti-boucle
  infinie masque l'échec sans erreur visible.
- **Conséquence** : `enveloppes.depense` des catégories permanentes n'est jamais
  remis à zéro (double comptage du mois suivant), `epargneMois`/`objectifs.contribution_mois`
  jamais remis à zéro côté Supabase, et — le plus grave — **`dernier_mois_archive`
  n'avance plus jamais** : le curseur d'archivage reste figé indéfiniment sur le
  mois précédent celui interrompu, donc **plus aucun mois ultérieur ne sera
  jamais correctement archivé pour ce compte**, sans qu'aucune erreur ne soit
  jamais montrée à l'utilisateur.
- **Piste de correction** : ne considérer `dejaArchive` vrai qu'après confirmation
  du `UPDATE profils.dernier_mois_archive_*` (déjà la source de vérité du
  curseur), pas seulement la présence du snapshot ; réellement `await` les
  écritures de remise à zéro avant de considérer l'archivage terminé, avec retry
  au prochain lancement tant que le curseur n'a pas avancé même si un snapshot
  existe déjà (l'upsert du snapshot est déjà idempotent, donc rejouer la suite
  ne recrée pas de doublon).
- **Statut** : **CORRIGÉ (2026-09-17)**, en 2 rounds de revue (voir historique
  détaillé ci-dessous — ce fut le correctif le plus délicat de toute la
  session, exactement à la hauteur de la gravité de ce bug). Trois
  changements liés :
  1. `dejaArchive` teste maintenant `etat.dernierMoisArchive` (le curseur,
     déjà la source de vérité lue par `verifierArchivageMoisInterne`) au
     lieu de la seule présence d'un snapshot dans `etat.historiquesMois` —
     permet une vraie reprise après interruption.
  2. **Round 1 de revue (BLOQUANT)** : le code-reviewer a trouvé qu'un
     retry naïf recalculant/réécrivant le snapshot depuis l'état live
     pouvait ÉCRASER un snapshot déjà validé par une version DÉGRADÉE (des
     0 au lieu des vraies valeurs Entrée/Fixe déjà archivées, si l'état
     live avait déjà été partiellement remis à zéro par la tentative
     interrompue) — violation directe de la règle CLAUDE.md "jamais
     écraser un snapshot existant avec des données moins complètes". Le
     garde-fou anti-régression d'`enregistrerSnapshotMoisSupabase` ne
     compare que le NOMBRE de lignes, jamais leur valeur — ne protégeait
     pas contre ce cas. **Corrigé par une restructuration** : la fonction
     détecte maintenant explicitement `snapshotExistant` (reprise) vs.
     première tentative — en reprise, le snapshot n'est JAMAIS recalculé
     ni renvoyé à `enregistrerSnapshotMoisSupabase`, réutilisé tel quel
     (`resteReel` dérivé algébriquement de `disponible - totalDepense` du
     snapshot existant, jamais recalculé depuis l'état live) ; seules la
     remise à zéro (idempotente par nature) et la reconduction (rendue
     idempotente, voir ci-dessous) sont rejouées.
  3. La reconduction des revenus récurrents est rendue idempotente : avant
     insertion, exclut celles dont le nom existe déjà parmi les enveloppes
     `Entrée` du mois suivant dans `etat.enveloppes` — nécessaire pour
     qu'une reprise ne duplique pas ce que P006 corrige déjà pour le cas
     concurrent (ici garanti à chaque reprise, pas seulement en cas de
     vraie concurrence).
  4. `majDernierMoisArchiveSupabase` (le curseur) retourne maintenant sa
     promesse et est explicitement `await`-ée en dernier — réduit (sans
     l'éliminer, un kill dur reste possible) la fenêtre de risque.
  En me relisant après le round 1, j'ai moi-même trouvé et corrigé un bug
  supplémentaire avant le round 2 : le `setEtat` final dupliquait le
  snapshot dans `etat.historiquesMois` en reprise (`snapshot === snapshotExistant`,
  déjà présent) — corrigé (`historiquesMois: snapshotExistant ? etat.historiquesMois : [...etat.historiquesMois, snapshot]`).
  **Round 2 de revue : APPROUVÉ** — le point bloquant du round 1 confirmé
  résolu (aucun autre chemin ne réécrit le snapshot en reprise), le fix de
  duplication confirmé correct, le scénario normal (sans interruption)
  confirmé strictement inchangé, un second scénario de reprise plus subtil
  (interruption AVANT toute création de snapshot) confirmé sans risque.
  tsc/lint vérifiés propres (10 lignes / 49 problèmes, sous la baseline)
  après chacun des 2 rounds. **Bug le plus grave de cette vague d'audit** :
  contrairement à P006/P007 (qui nécessitent une vraie concurrence),
  celui-ci se déclenche sur un simple crash/fermeture forcée au mauvais
  moment — scénario nettement plus probable en usage réel, et sans aucune
  façon pour l'utilisateur de s'en rendre compte.
  **Point résiduel trouvé au round 2, non bloquant** : voir P051 — une
  fenêtre plus étroite existe encore si l'interruption survient DANS
  `enregistrerSnapshotMoisSupabase` elle-même, entre l'upsert du parent
  `snapshots_mois` et l'insertion des lignes `snapshot_enveloppes` : le
  snapshot repris serait alors trouvé "existant" mais avec un détail par
  catégorie vide, définitivement (pas de réparation automatique). Ce n'est
  pas un écrasement au sens de la règle CLAUDE.md (rien n'est dégradé,
  juste jamais complété), et strictement moins grave que l'ancien bug
  (pas de gel du curseur pour tout le compte) — documenté pour un futur
  correctif plutôt que traité dans ce lot.

### P009 — Race entre le fetch initial de session et `onAuthStateChange('INITIAL_SESSION')`

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Fichier** : `app/_layout.tsx:208-283` (IIFE async) vs `:291-356` (listener).
- **Description** : `supabase-js` v2 émet un événement `INITIAL_SESSION` dès
  l'abonnement à `onAuthStateChange`, indépendamment de tout appel explicite à
  `getSession()`. L'IIFE de montage (ligne 208) appelle `getSession()` puis fetch
  `profils` avant de poser `dernierUserIdRef.current` (ligne 223), après
  plusieurs `await` (dont 2 lectures AsyncStorage). Le listener posé juste après
  (ligne 291) reçoit son propre `INITIAL_SESSION` et ne se protège que par
  `if (nouvelleSession.user.id === dernierUserIdRef.current) return`
  (ligne 323) — si ce ref est encore `null` quand le listener réagit (plausible),
  le listener démarre SON PROPRE fetch `profils` en parallèle de l'IIFE.
- **Conséquence** : requête `profils` dupliquée à chaque démarrage à froid ; les
  deux fetches écrivent sur les mêmes states sans coordination (dernier arrivé
  écrase l'autre, pas de "réponse la plus fraîche gagne") ; cas plus grave — si
  l'IIFE détecte entre-temps un compte invité expiré et fait
  `signOut()`/`reinitialiserEtatUtilisateur()`, le `.then()` du listener,
  toujours en vol, peut ensuite raccrocher l'UI à une session déjà invalidée.
- **Piste de correction** : appliquer le pattern `annule`/flag déjà utilisé
  ailleurs dans le projet (`EspacePartageContext.tsx:216,345`) à cette IIFE, ou
  fusionner en un seul point d'entrée (laisser `onAuthStateChange` être la SEULE
  source, y compris pour `INITIAL_SESSION`, sans `getSession()` séparé).
- **Statut** : **CORRIGÉ (2026-09-17)** — `if (event === "INITIAL_SESSION")
  return;` ajouté en toute première ligne du callback `onAuthStateChange`,
  avant `setSession`. Sûr car l'IIFE de montage appelle déjà
  `setSession(data.session)` inconditionnellement à sa fin (session null ou
  non) — le cas couvert par `INITIAL_SESSION` est donc déjà entièrement
  traité côté IIFE. Revu par code-reviewer (APPROUVÉ), qui a tracé le SDK
  jusqu'au bout : `getSession()` (IIFE) et `_emitInitialSession()` (source
  de l'événement `INITIAL_SESSION`) appellent tous deux la MÊME méthode
  interne `_useSession()`/`__loadSession()` — ce ne sont pas deux sources
  indépendantes, littéralement le même appel dédoublé, donc aucun scénario
  où `INITIAL_SESSION` porterait une information que l'IIFE n'aurait pas
  déjà. Confirmé aussi que les vrais logins (`signUp`/`signInWithPassword`/
  `signInAnonymously`, grep des 3 call sites du projet) émettent tous
  `SIGNED_IN`, jamais `INITIAL_SESSION` — le guard ne bloque donc jamais un
  vrai login/logout/refresh après le montage. tsc/lint vérifiés propres (10
  lignes / 49 problèmes, sous la baseline).

### P010 — `sanitizeMontantInput`/`parseMontant` mal-interprètent un montant collé avec séparateur de milliers

- **Gravité** : 🔴 CRITIQUE (saisie utilisateur tronquée silencieusement d'un facteur ~1000, aucune erreur affichée)
- **Trouvé par** : audit calculs financiers (2026-09-16).
- **Fichier** : `utils/montant.ts:4-19`.
- **Description** : traite le PREMIER séparateur rencontré comme LE séparateur
  décimal et supprime tous les suivants sans les traiter comme des milliers.
- **Repro vérifiée** : `sanitizeMontantInput("2,500.00")` → `"2,50000"` →
  `parseMontant` → `2.5` (au lieu de 2500). `sanitizeMontantInput("1.234,56")` →
  `1.23456` (au lieu de 1234.56).
- **Impact** : un utilisateur qui colle un montant copié depuis une fiche de
  paie/relevé bancaire au format à milliers voit sa saisie tronquée sans le
  savoir — un salaire de 2500€ devient 2.5€, faussant `disponibleEffectif`/
  `resteEstime` d'un facteur ~1000, silencieusement (2.5€ est une valeur "valide",
  aucune validation ne détecte l'anomalie).
- **Piste de correction** : détecter/gérer un format à milliers (regex sur le
  nombre de chiffres après chaque séparateur, ou n'accepter que le DERNIER
  séparateur comme décimal s'il est suivi d'exactement 1-2 chiffres), et/ou
  avertir si le résultat semble aberrant.
- **Statut** : **CORRIGÉ (2026-09-16)** — `sanitizeMontantInput` distingue
  maintenant la frappe normale (0 ou 1 séparateur, comportement strictement
  inchangé) d'un montant collé au format à milliers (2+ séparateurs) : dans
  ce second cas, le DERNIER séparateur est traité comme décimal s'il est
  suivi d'au plus 2 chiffres, sinon tous les séparateurs sont des milliers.
  Testé sur 10+ cas (`2,500.00`→2500, `1.234,56`→1234.56, `12.345.678`→12345678,
  `1,234,567.89`→1234567.89, saisie normale `12,50`→12.5 inchangée) et
  confirmé par code-reviewer (comparaison ancien/nouveau code byte-pour-byte
  sur ~28 entrées pour la branche ≤1 séparateur, aucune divergence). Limite
  assumée et documentée : un montant collé à 3+ décimales (`2,500.005`) est
  traité comme purement milliers plutôt que 2500.005 — cohérent avec
  l'hypothèse "devise = max 2 décimales", hors périmètre de ce correctif.
  tsc/lint vérifiés propres (10 lignes / 49 problèmes, sous la baseline).

### P011 — `pct = depense/budget` produit `NaN` si `budget === 0` (non protégé, dupliqué dans 2 écrans)

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit calculs financiers (2026-09-16).
- **Fichiers** : `app/(tabs)/index.tsx:1329`, `app/(tabs)/budget.tsx:1022` — non
  protégés, alors que la MÊME formule est déjà protégée ailleurs dans le même
  projet (`budget.tsx:525` : `item.budget > 0 ? ... : 0` ; `analytics.tsx:4687/4752` :
  `env.budget > 0 ? ... : 0`).
- **Description** : `env.budget === 0` est un état atteignable en pratique, pas
  théorique — `budget.tsx:915` (`budget: parseMontant(montantTx) || 0`, création
  de catégorie sans montant saisi) et `index.tsx:986` (édition avec champ vidé)
  produisent tous deux `budget: 0`.
- **Scénario concret** : catégorie créée via "Nouvelle dépense → créer une
  catégorie" sans taper de montant → `budget=0, depense=0` → `pct = NaN` →
  `Math.min(NaN, 100) = NaN` → passé à `<BarreProgression pourcentage={NaN}>`
  (dont le commentaire dit explicitement "déjà clampé par l'appelant") →
  comportement non défini du rendu (`Animated.Value` interpolé avec NaN).
- **Piste de correction** : `env.budget > 0 ? Math.min((env.depense/env.budget)*100, 100) : 0` —
  exactement le pattern déjà utilisé ailleurs dans le même fichier, à appliquer
  aux 2 occurrences non protégées.
- **Statut** : **CORRIGÉ (2026-09-16)** — `env.budget > 0 ? Math.min(...) : 0`
  appliqué aux 2 sites (`budget.tsx:1027`, `index.tsx:1329`), exactement le
  pattern déjà utilisé ailleurs dans les mêmes fichiers. Confirmé par
  code-reviewer qu'il n'existe aucun autre site non protégé (grep sur
  l'intégralité du repo : les 4 autres occurrences de `depense/budget`
  étaient déjà protégées). tsc/lint vérifiés propres (10 lignes / 49
  problèmes, sous la baseline).

### P012 — `getDisponibleMoisPartenaire` sous-compte les entrées non reçues du partenaire (formule différente de celle utilisée pour "moi")

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit calculs financiers (2026-09-16).
- **Fichier** : `app/(tabs)/analytics.tsx:2634-2645`.
- **Description** : pour "moi", un mois archivé utilise `budgetDuMoisArchive(snap)`
  → renvoie `snapshot.disponible`, un champ PRÉ-CALCULÉ à l'archivage (reçu +
  attendu). `SnapshotMoisPartenaire` (`utils/espacePartage.ts:949-964`) n'expose
  PAS ce champ (la requête Supabase ne sélectionne que `id, mois, annee, epargne`)
  → `getDisponibleMoisPartenaire` est contraint de resommer `.depense` des lignes
  "Entrée" du snapshot, or `depense` d'une Entrée NON reçue à l'archivage vaut 0
  (`store.ts:2149-2169` : `depense: env.budget` seulement quand `payee` devient
  `true`) → l'attendu disparaît entièrement.
- **Scénario concret** : le partenaire a un "Salaire" (budget 2000€) non encore
  marqué reçu au moment de l'archivage → `getDisponibleMoisPartenaire` renvoie 0€
  pour ce mois au lieu de 2000€ → fausse `tauxEpargne` (vue "Santé du couple") et
  le graphique "Évolution dans le temps" consolidé.
- **Piste de correction** : exposer `disponible` dans `SnapshotMoisPartenaire`/la
  requête Supabase et l'utiliser directement, comme `budgetDuMoisArchive`, plutôt
  que de re-dériver depuis des champs qui n'ont plus cette sémantique une fois
  archivés.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code). Concerne uniquement la vue
  partagée (masquée en prod tant que `ESPACE_PARTAGE_ACTIF=false`) — pas
  bloquant pour le build V1 en cours, mais à corriger avant réactivation.

### P013 — Sous-poste "Objectifs" peut afficher plus que son total parent "Argent immobilisé" (dupliqué dans 2 écrans)

- **Gravité** : 🟡 MINEUR (incohérence d'affichage, pas de perte de données)
- **Trouvé par** : audit calculs financiers (2026-09-16).
- **Fichiers** : `app/(tabs)/index.tsx:846-868`, `app/(tabs)/budget.tsx:847-861`
  (formule dupliquée à l'identique).
- **Description** : `pctObjectifsEstime = (contributionObjectifsTotal/epargneMoisAffiche) * pctEpargneEstime`
  n'est cohérent que si `contributionObjectifsTotal ≤ epargneMoisAffiche` — or
  `objStore.modifierEpargneMois` (`store.ts:2926-2929`) permet de fixer
  `epargneMois` à une valeur absolue arbitraire, déconnectée de la somme des
  contributions objectifs.
- **Scénario concret** : versements automatiques d'objectifs = 200€, puis
  correction manuelle d'"Épargne du mois" à 50€ → légende affiche "Argent
  immobilisé 50€" puis, dépliée, "Objectifs 200€" — sous-poste supérieur à son
  total parent (pas de débordement visuel, `useLargeurAnimee` clampe à 100%, mais
  incohérence des € affichés).
- **Piste de correction** : clamper `contributionObjectifsTotal` à
  `epargneMoisAffiche` avant calcul des pourcentages, ou afficher un état
  distinct si `contributionObjectifsTotal > epargneMoisAffiche`.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code), correction non encore appliquée.

### P014 — Dérive flottante non ré-arrondie avant comparaisons internes (`<=`, `<0`, `===`)

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit calculs financiers (2026-09-16).
- **Fichiers** : `app/store.ts:2010,3811,3859` (accumulation `depense`),
  `utils/series.ts:125` (`p.depenseTotal <= p.budgetTotal`, série "Budget
  respecté" utilisée pour les trophées).
- **Description** : `depense` s'incrémente transaction par transaction, jamais
  re-arrondi à 2 décimales avant une comparaison stricte. Exemple vérifié :
  `19.99+15.50+7.33+42.10+3.33+8.88+12.34 = 109.46999999999998` (pas 109.47).
- **Impact** : un total "logiquement" égal à un budget peut tomber juste en
  dessous/au-dessus par un epsilon flottant, faisant basculer à tort une
  comparaison stricte (ex. un trophée "budget respecté" non débloqué alors qu'il
  aurait dû l'être).
- **Piste de correction** : comparer des valeurs passées par `formaterMontant`
  (arrondi centimes) avant tout `<=`/`<`/`===`, ou tolérance epsilon explicite.
- **Statut** : **CORRIGÉ (2026-09-17)** — tolérance epsilon appliquée sur le
  site identifié (`utils/series.ts`, série "Budget respecté") :
  `p.depenseTotal <= p.budgetTotal + 0.005` (demi-centime, aligné sur le
  seuil d'arrondi d'affichage). Revu par code-reviewer (APPROUVÉ) : marge
  vérifiée confortable (dérive flottante réelle ≈ 1e-13, tolérance 0.005 —
  plusieurs ordres de grandeur d'écart), aucun vrai dépassement significatif
  masqué (retracé à la main). tsc/lint vérifiés propres.

### P015 — Violation de la règle d'architecture "`utils/` ne doit pas dépendre de `store.ts`, et l'inverse non plus"

- **Gravité** : 🟡 MINEUR (fragile, pas encore un bug actif)
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Description** : la règle est énoncée en commentaire dans `store.ts` (~ligne
  1535) mais déjà violée dans les deux sens : `store.ts:9-13` importe des
  VALEURS (`purgerDonneesInsights`, `synchroniserWidget*`) depuis `utils/conseils.ts`/
  `utils/widgetsSync.ts` ; `utils/budget.ts:1`, `utils/trophees.ts:6`,
  `utils/tendancesPeriode.ts:55`, `utils/bilanVista.ts:10` importent des types
  de `store.ts` SANS `import type` (contrairement à `utils/espacePartage.ts`,
  `utils/joursFeries.ts`, `utils/widgetsSync.ts`, qui le font correctement).
- **Impact actuel** : aucun — Babel élague ces imports non typés à la
  transpilation tant qu'ils ne servent qu'à de l'annotation TypeScript, donc pas
  de cycle `require()` réel en runtime Metro aujourd'hui. Risque latent : tout
  futur ajout d'un usage runtime d'un de ces noms importés transformerait
  silencieusement ceci en un vrai cycle CommonJS (bug d'initialisation difficile
  à diagnostiquer, potentiellement un crash au démarrage).
- **Piste de correction** : uniformiser `import type` partout où seul le typage
  est utilisé ; casser le cycle `store.ts → utils/conseils.ts`/`widgetsSync.ts`
  en extrayant `purgerDonneesInsights`/`synchroniserWidget*` vers un module tiers
  neutre, ou via injection plutôt qu'import statique direct.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code), correction non encore appliquée.

### P016 — Flash d'état vide possible sur Budget/Planning/Stats au démarrage à froid

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Description** : `EtatStore.chargementInitialTermine` (`store.ts:318-329`,
  introduit précisément pour ce risque, cf. commentaire "bug confirmé en revue le
  2026-09-12") n'est câblé que dans `utils/conseils.ts:1815` via
  `app/(tabs)/index.tsx:916` (message de bienvenue "compte neuf"). `budget.tsx`,
  `planning.tsx`, `analytics.tsx` lisent directement `objStore.enveloppes`/
  `transactions` sans vérifier ce flag ni afficher de spinner le temps du
  premier `Promise.all` (`(tabs)/_layout.tsx:132-141`).
- **Scénario concret** : démarrage à froid, swipe rapide vers Budget avant la
  résolution du chargement initial → écran "aucune catégorie" affiché
  brièvement avant les vraies données.
- **Piste de correction** : propager `chargementInitialTermine` (déjà
  disponible via `useObjectifs()`) aux gardes d'affichage "vide" de
  Budget/Planning/Stats, comme déjà fait pour les insights.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code), correction non encore appliquée.

### P017 — Logique dupliquée : 13 copies quasi identiques du pattern "getUser → update 1 colonne profils"

- **Gravité** : 🟢 SUGGESTION (dette technique, pas un bug)
- **Trouvé par** : audit architecture statique (2026-09-16).
- **Fichiers** : `app/store.ts:2190-2371` (9 fonctions), `app/ThemeContext.tsx:114-130`,
  `app/AccessibiliteContext.tsx:51-103` (3 fonctions).
- **Description** : chaque fonction répète la même structure (`getUser()` →
  `update({colonne: valeur}).eq("user_id", user.id)` → gestion d'erreur), seule
  la colonne et le message changent — source garantie de divergence future si un
  correctif de gestion d'erreur n'est appliqué qu'à une copie.
- **Piste de correction** : factoriser en `majColonneProfilSupabase(colonne, valeur, messageErreur)`.
- **Statut** : NOUVEAU — amélioration non bloquante, pas nécessaire à la V1.

### P018 — Pubs récompensées : tout échec de `.show()` (réseau/indisponibilité/SDK) débloque gratuitement en production

- **Gravité** : 🔴 CRITIQUE (vide l'intérêt économique du modèle "3 emplacements de pub récompensée" de la V1, trivialement déclenchable sans utilisateur malveillant)
- **Trouvé par** : audit dédié pubs récompensées (2026-09-16).
- **Fichier** : `app/InsightVerrouille.tsx:139-174` (`demanderDeblocageSimule`/`declencherPub`).
- **Description** : `demanderDeblocageSimule()` a été écrit à l'origine comme
  fallback de développement ("AdMob n'est pas encore réintégré") pour la
  période où le SDK natif n'était pas encore linké. Il n'a jamais été mis à
  jour depuis que `ADMOB_ACTIF=true`/`TESTFLIGHT_MODE=false` sont devenues les
  valeurs de PRODUCTION. Cette fonction est appelée sans distinction dans 3
  cas : pub pas chargée au moment du tap (ligne 174), `.show()` qui rejette
  sa promesse — ex. perte réseau pendant l'affichage (163-166), ou `.show()`
  qui lève une exception synchrone — ex. double-appel (167-170). Dans les 3
  cas, popup "Pub simulée" ("AdMob n'est pas encore réintégré", faux en prod)
  avec un bouton "Fermer" qui débloque **sans qu'aucune pub n'ait été vue**.
- **Reproduction (triviale)** : activer le mode avion avant que la pub ait fini
  de charger (fenêtre large : `rewarded.load()` prend un aller-retour réseau),
  taper "Regarder une pub" → `pubChargee` encore `false` →
  `demanderDeblocageSimule()` direct → "Fermer" → débloqué. Zéro pub servie.
  Même chemin atteignable sans mode avion : simple aléa réseau mobile, fill
  rate AdMob &lt; 100% sur une unité neuve, ou expiration de l'annonce chargée
  (~1h sans être montrée).
- **Impact** : touche les 3 emplacements de pub de la V1 (Insights Aperçu, Ton
  bilan, période Stats), qui partagent tous `declencherPub`.
- **Piste de correction** : ne jamais offrir de déblocage gratuit sur un échec
  AdMob. Remplacer par un message d'erreur honnête + retry ("Aucune publicité
  disponible, réessaie plus tard"), sans bouton qui débloque. Garder le
  fallback "Pub simulée" uniquement derrière `__DEV__` (ou un flag dev dédié,
  distinct de `ADMOB_ACTIF`/`TESTFLIGHT_MODE`) — jamais atteignable en prod.
- **Statut** : **CORRIGÉ (2026-09-16)** — `demanderDeblocageSimule` renommée
  `demanderDeblocageFallback`, branche maintenant sur `__DEV__` : en dev
  local, comportement inchangé (Alert "Pub simulée" qui débloque, utile sans
  rebuild EAS) ; en production, nouvelle Alert "Publicité indisponible" avec
  un seul bouton "OK" sans `onPress` — `onDeverrouille()` n'est plus jamais
  atteignable via ce chemin en production, vérifié ligne par ligne par
  code-reviewer sur les 3 sites d'appel. `RewardedAdEventType.EARNED_REWARD`
  (le seul déclencheur légitime) non touché. tsc/lint vérifiés propres (10
  lignes / 49 problèmes, sous la baseline).

### P019 — Pubs récompensées : double-tap non protégé sur le chip de période Stats

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit dédié pubs récompensées (2026-09-16).
- **Fichier** : `app/(tabs)/analytics.tsx:1433-1436` (déclaration), `4358-4373` (usage).
- **Description** : `useDeblocagePub` retourne `{declencherPub, enCoursDeblocage}`,
  mais seul `declencherPub` est extrait ici — `enCoursDeblocage` jamais câblé
  sur le `disabled` du chip. Les 2 AUTRES emplacements de pub
  (`InsightVerrouille.tsx:236-241`, `TonBilanVerrou.tsx:44-48`) le font
  correctement (`disabled={enCoursDeblocage}`).
- **Impact** : un double-tap peut déclencher `declencherPub` deux fois de
  suite ; combiné à P018, un second appel `.show()` pendant que la pub réelle
  est déjà affichée peut lever une exception → ouvrirait une seconde popup
  "Pub simulée" par-dessus la vraie pub, déblocage sans vue complète.
- **Piste de correction** : `disabled={!o.disponible || enCoursDeblocage}`,
  même pattern que les 2 autres emplacements.
- **Statut** : **CORRIGÉ (2026-09-16)** — `enCoursDeblocage` extrait des 2
  hooks (perso/partagé), résolu selon `vueActive` (même pattern que
  `declencherPubPeriodeStats`). Raffinement par rapport à la piste de
  correction initiale : `disabled={!o.disponible || (o.verrouillePub &&
  enCoursDeblocagePeriodeStats)}` — restreint la désactivation au SEUL chip
  verrouillé, pour ne jamais bloquer un chip déjà débloqué pendant qu'une
  pub charge pour un autre. Revu par code-reviewer (APPROUVÉ). tsc/lint
  vérifiés propres (10 lignes / 49 problèmes, sous la baseline).

### P020 — Pubs récompensées : jusqu'à 4-5 `RewardedAd` chargées en parallèle sur le même ad unit sans geste utilisateur

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit dédié pubs récompensées (2026-09-16).
- **Fichiers** : `app/(tabs)/analytics.tsx:1433,1444` (chargement inconditionnel
  au montage de l'écran Stats), `6020-6023`/`6055-6065` (composants de la
  modale "Ton bilan" restant montés en permanence dès l'ouverture, cf. RÈGLE
  "TOUJOURS MONTÉ, visibilité via `display`" — leurs `useDeblocagePub`
  chargent une pub indépendamment de l'onglet réellement affiché).
- **Description** : contrairement aux 3 autres onglets de "Ton bilan"
  (Santé/Trophées/Simulateur, correctement gardés par `vueModalStats === "X"`),
  le `TonBilanVerrou` du graphique de flux (onglet Vista) et l'`InsightVerrouille`
  de "Ce que Vista a remarqué" ne sont gardés que par `tonBilanVisible` — pas
  par l'onglet actif — donc chargent une pub dès l'ouverture de "Ton bilan"
  même si l'utilisateur atterrit directement sur un autre onglet.
- **Impact** : gaspillage de quota/fill AdMob, risque de conflit natif non
  documenté si le SDK ne supporte pas plusieurs `RewardedAd` simultanées sur
  la même unit (à valider sur device réel).
- **Piste de correction** : charger à la demande (premier tap) plutôt qu'au
  montage pour les composants "toujours montés indépendamment de l'onglet" ;
  ou un seul `useDeblocagePub` partagé au niveau de la modale "Ton bilan"
  (cohérent avec l'intention produit déjà documentée en commentaire : "une
  seule pub débloque les 4 onglets").
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code), correction non encore appliquée.

### P021 — GraphiqueFlux : catégories homonymes de types différents peuvent fusionner/mal classer leurs montants

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Stats/Ton bilan (2026-09-16).
- **Fichiers** : `app/(tabs)/analytics.tsx:3169-3223` (`construireRepartitionSurPeriode`,
  agrégation par nom trimmé, sans filtre de type), `3409-3431`
  (`idsPourNomCategorieFlux`, aucun filtre de type), `3529-3543`
  (`classificationsFlux`, lookup du type par `.find()` — premier match).
- **Description** : rien n'empêche 2 catégories actives de partager le même
  nom trimmé avec des types différents (vérifié : `ajouterEnveloppe`,
  `sauvegarderEnveloppe`/`renommerCategoriePartout` n'ont aucun contrôle de
  doublon ; aucune contrainte `UNIQUE` sur `enveloppes.nom` dans les 50
  migrations). Le graphique de flux fusionne alors leurs montants par nom
  seul, et le type utilisé pour la classification (Cas 1-4) dépend de l'ordre
  d'itération de l'array, pas d'une correspondance garantie.
- **Scénario rejoué à la main** : catégorie A "Abonnements" (Fixe, payée,
  `depense=750`, sans transaction nommée) + catégorie B "Abonnements"
  (Variable, transactions "Netflix" 15€ + "Spotify" 12€, `depense=27`) →
  nœud fusionné "Abonnements" = 777€. Si le type retenu est celui de B
  (Variable) → Cas 1 → détail des transactions nommées = 27€ → nœud "Autre"
  de 750€ apparaît sous "Abonnements", faisant croire que 750€ de dépenses
  Variable non détaillées appartiennent à cette catégorie, alors qu'il s'agit
  en réalité d'une catégorie Fixe homonyme totalement distincte absorbée
  silencieusement. Le total (777€) reste arithmétiquement exact, mais la
  provenance affichée est trompeuse.
- **Piste de correction** : interdire les noms de catégorie dupliqués parmi
  les catégories actives (validation à la création/au renommage — corrige
  aussi tout autre endroit du code qui agrège par nom, ex. `bilanVista.ts`),
  ou faire grouper `construireRepartitionSurPeriode`/`classificationsFlux`/
  `idsPourNomCategorieFlux` par `(nom, type)` plutôt que par nom seul.
- **Statut** : **CORRIGÉ (2026-09-18)** — décision produit reçue (voir §2.2) :
  un utilisateur ne peut plus créer/renommer une catégorie sur un nom déjà
  pris (comparaison trim+lowercase, `ajouterEnveloppe`/
  `renommerCategoriePartout`, `app/store.ts`) — élimine la précondition à
  la racine des 3 findings P021/P027/P033. tsc/lint vérifiés propres.

### P022 — GraphiqueFlux : le MONTANT (pas le nom) peut être tronqué avec "…" en colonne étroite

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit écran Stats/Ton bilan (2026-09-16).
- **Fichier** : `app/GraphiqueFlux.tsx:290-293` (`tronquerSelonLargeur`), appliqué
  au montant ligne 1290.
- **Description** : la règle "jamais de troncature '...'" (CLAUDE.md, corrigée
  le 2026-09-16 pour préciser sa portée réelle) ne couvre explicitement, dans
  le code, que le NOM du nœud — le montant a sa propre fonction de troncature
  avec "…". Sur une colonne étroite (~60px, petit écran, 3 colonnes actives),
  un montant à 6 chiffres (`"123456.78 €"`, 11 car.) dépasse le seuil de
  ~10 caractères → `"123456.7…"`, le "€" et une partie des centimes disparaissent.
- **Impact** : purement visuel — le montant exact reste accessible au tap sur
  le nœud (panneau de détail non tronqué).
- **Piste de correction** : étendre le word-wrap 2-lignes déjà utilisé pour le
  nom au montant, pour rester cohérent avec la règle telle qu'énoncée.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code), non rejoué sur device.

### P023 — Planning : parsing UTC/local incohérent sur `evenement.date`/`dateFin`, cette fois écrit en base (pas seulement relu)

- **Gravité** : 🔴 CRITIQUE
- **Trouvé par** : audit écran Planning (2026-09-16) — variante de P004/P005, mais plus grave car l'ÉCRITURE elle-même est affectée, pas seulement une relecture interne.
- **Fichiers** : `app/(tabs)/planning.tsx:2646,2763,2799` (retour du `Calendar`), `1159,1161` (édition, `new Date(ev.date)`), `539-541` (boucle de rendu des 3 vues), `394` (bannière in-app), `app/notifications.ts:70`, `app/store.ts:1999,2068`.
- **Description** : même mécanisme que P004 (`new Date("YYYY-MM-DD")` = minuit UTC, relu avec des accesseurs locaux), mais ici c'est le calendrier de sélection lui-même : `day.dateString` (`"YYYY-MM-DD"`, fourni par `react-native-calendars`) est passé directement à `new Date(...)`.
- **Repro tracée à la main** (fuseau négatif, ex. Amériques/DOM-TOM) : l'utilisateur tape "16" dans le calendrier → `day.dateString="2026-09-16"` → `new Date(...)` = `2026-09-16T00:00Z` = **15 septembre 20h en heure locale** → le champ de date affiché juste en dessous montre immédiatement "15 septembre" alors que l'utilisateur vient de taper 16 → à l'enregistrement, `dateVersISO` (accesseurs locaux sur ce Date déjà décalé) persiste `"2026-09-15"` en base. **La mauvaise date est écrite, pas seulement mal affichée.**
- **Portée** : création, édition (au chargement du formulaire), affichage dans les 3 vues Planning, jour d'application d'un événement financier (`verifierEvenementsFinanciersInterne`), texte des notifications push. N'affecte pas les utilisateurs Europe (décalage positif) dans ce sens précis.
- **Piste de correction** : même correctif que P004 (parsing par composants explicites), à traiter dans le même lot puisque c'est la même cause racine — liste de sites plus large ici (au moins 9 sites entre Planning et Budget, cf. P032).
- **Statut** : **CORRIGÉ (2026-09-16)** — les 7 sites `planning.tsx` corrigés avec
  `parseDateFixeLocale` (`utils/dateOnly.ts`, cf. P004), y compris les 3
  callbacks `Calendar.onDayPress` (la cause d'écriture, pas seulement de
  relecture) et `app/notifications.ts:70` (corrigé lors de la revue —
  premier round bloquant : cette ligne, explicitement listée par ce P023,
  n'avait pas été traitée dans le 1er lot, créant une divergence entre la
  bannière in-app déjà corrigée et le texte de la notification push ; les
  deux affichent maintenant la même date). Non rejoué sur device.

### P024 — Renommer une catégorie casse silencieusement `categorieLiee` des événements Planning : l'argent prévu disparaît sans jamais être compté

- **Gravité** : 🔴 CRITIQUE (calcul budgétaire faux, silencieux, définitif)
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichiers** : `app/store.ts` `renommerCategoriePartout` (~3151-3229, ne touche jamais `evenements.categorie_liee`) ; `app/store.ts:1991-2026` (`verifierEvenementsFinanciersInterne`).
- **Description** : `categorieLiee` est un lien par NOM, pas par id (fragilité déjà notée en P021/P027). `renommerCategoriePartout` met à jour `enveloppes.nom`/`snapshot_enveloppes.nom` mais jamais `evenements.categorie_liee` — l'événement garde l'ancien nom, qui ne correspond plus à rien. Pire : `verifierEvenementsFinanciersInterne` (appelée au montage, toutes les 60s, à chaque retour au premier plan) sélectionne tout événement financier passé avec `categorieLiee` non vide, tente de créditer l'enveloppe par nom (no-op silencieux si aucun match), **puis marque `montantApplique: true` pour TOUS les événements sélectionnés, y compris ceux qui n'ont matché aucune enveloppe** — plus aucune nouvelle tentative possible ensuite.
- **Repro concrète** : catégorie "Loisirs", événement financier 50€ lié, planifié le 20. Renommage "Loisirs"→"Sorties" dans Budget. Dans la minute qui suit : événement sélectionné, aucune enveloppe "Loisirs" ne matche, `depense` de "Sorties" jamais incrémentée, `montantApplique=true` posé quand même → **perte silencieuse et définitive du forecast**. Le formulaire d'édition continue en plus d'afficher "sera ajouté à ta dépense 'Loisirs'" (texte mensonger), sans jamais forcer une correction.
- **Cause racine** : (1) `renommerCategoriePartout` incomplet, (2) `verifierEvenementsFinanciersInterne` marque `montantApplique=true` même sans match réel — défaut de robustesse indépendant qui aggrave toute autre cause de `categorieLiee` orphelin.
- **Piste de correction** : ajouter la mise à jour `evenements.categorie_liee` dans `renommerCategoriePartout` (même geste que pour `enveloppes`) ; ne marquer `montantApplique=true` que si le match a réellement eu lieu.
- **Statut** : **CORRIGÉ (2026-09-16)** — les deux causes racines traitées :
  (1) `renommerCategoriePartout` fait désormais aussi `UPDATE evenements SET
  categorie_liee = nom WHERE categorie_liee = ancienNom` (sans filtre
  `user_id`, volontaire — même doctrine RLS-only que le reste de la table),
  + état local synchronisé ; (2) `verifierEvenementsFinanciersInterne` ne
  marque plus `montantApplique: true` que pour les événements ayant
  réellement trouvé une enveloppe à créditer — un événement orphelin reste
  retentable au lieu d'être abandonné pour toujours. Revu par code-reviewer
  (APPROUVÉ, cas nominal et cas sans match tracés à la main) ET
  security-auditor (APPROUVÉ — confirmé sur le SQL réel des policies RLS
  `evenements_update_own`/`evenements_update_espace_partage` qu'un
  utilisateur non lié ne peut pas être affecté par ce nouvel UPDATE, quel
  que soit le WHERE côté client ; confirmé non destructif, un seul champ
  texte modifié). **Suppression de catégorie** vérifiée saine sur ce point
  précis dès le diagnostic initial (pas de régression). tsc/lint vérifiés
  propres (10 lignes / 49 problèmes, sous la baseline).

### P025 — Planning partagé : fusion automatique sans confirmation, signal de détection faible (nom+date+heure grossière)

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichiers** : `app/(tabs)/planning.tsx:854-910` (détection), RPC `fusionner_evenements` (`20260905092000_planning_partage_fusion_rpc.sql`).
- **Description** : quand un événement à moi et un événement du partenaire partagent le même nom (trim+lowercase) et la même date, ET (même heure exacte OU l'un "toute la journée"), la fusion se déclenche AUTOMATIQUEMENT sans confirmation — contrairement au cas "écart &lt;60min" qui propose "Fusionner"/"Garder séparé". Deux événements homonymes mais réellement distincts (ex. deux "Anniversaire" différents le même jour) sont fusionnés de force ; la RPC supprime les 2 lignes d'origine et ne garde que les champs de l'APPELANT (celui des 2 comptes qui détecte en premier "gagne", l'autre perd montant/catégorie/couleur/durée silencieusement).
- **Nuance vérifiée, pas un bug** : la RPC elle-même est robuste contre une vraie course entre les 2 comptes (revalidation de propriété à chaque appel, un second appel concurrent échoue proprement sans créer de doublon) — le problème est l'agressivité du critère de déclenchement client, pas la protection serveur.
- **Nuance additionnelle** : `pairesFusionIgnorees` ("Garder séparé") n'est vérifiée que sur la branche "suggestion", jamais sur la branche auto-fusion — une paire mise en "Garder séparé" peut quand même fusionner de force si une heure change plus tard pour coïncider exactement.
- **Piste de correction** : ne jamais fusionner sans confirmation explicite (même pour le signal "fort"), ou ajouter un signal supplémentaire (montant identique) + faire respecter `pairesFusionIgnorees` sur les deux branches.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code + traçage de la RPC). Masqué en prod (`ESPACE_PARTAGE_ACTIF=false`), actif pour les comptes admin dès aujourd'hui.

### P026 — Récurrence mensuelle/annuelle : dérive silencieuse et permanente sur les jours 29/30/31 et le 29 février

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichier** : `utils/evenements.ts:36-44` (`genererOccurrencesEvenement`).
- **Description** : `cursor.setMonth(cursor.getMonth()+1)`/`setFullYear(...+1)` souffrent du débordement classique de `Date` JS — si le jour cible n'existe pas dans le mois/l'année visée, JS reporte automatiquement sur le(s) jour(s) suivant(s), sans erreur.
- **Repro tracée à la main** : événement récurrent mensuel créé le 31 janvier 2026 → février n'a que 28 jours en 2026 → `setMonth` normalise en **3 mars** (pas "fin de mois") → itération suivante pousse encore d'un mois depuis le 3 → la récurrence glisse définitivement du 31 au 3, sans jamais se stabiliser. Même mécanisme pour un événement annuel créé un 29 février : l'année suivante (non bissextile) déborde sur le 1er mars, décalage qui reste ensuite figé.
- **Impact** : loyer/abonnement/anniversaire planifié le 31 (ou 29/30) d'un mois, ou événement annuel un 29 février, voit sa date effective dériver silencieusement au fil des occurrences.
- **Piste de correction** : calculer explicitement le dernier jour du mois cible (`new Date(year, month+1, 0).getDate()`) et clamper, plutôt que laisser `setMonth`/`setFullYear` déborder ; décider explicitement d'une règle produit pour le 29 février.
- **Statut** : **CORRIGÉ (2026-09-17)** — chaque occurrence reconstruite
  depuis `jourAncrage` (le jour-du-mois original, capturé une fois) clampé
  au nombre de jours réels du mois cible, jamais depuis le jour
  potentiellement déjà dérivé d'une itération précédente. Règle de
  clamping uniforme pour mensuel ET annuel (décision autonome documentée
  en §2.1 pour le cas du 29 février — retombe sur le 28, revient au 29
  l'année bissextile suivante). Revu par code-reviewer (APPROUVÉ) : a
  rejoué l'ANCIEN code sur le cas "31 janvier" pour confirmer formellement
  le bug (`31/01 → 03/03 → 03/04...`), puis le nouveau (`31/01 → 28/02 →
  31/03 → 30/04...`) ; cas du 29 février bissextile tracé sur 6 ans ; cas
  normal (jour 15) confirmé strictement inchangé ; les 2 appelants
  (`planning.tsx`, `utils/widgetsSync.ts` — le widget) confirmés
  bénéficier du correctif sans modification de leur côté (signature
  inchangée). tsc/lint vérifiés propres.

### P027 — Deux catégories Fixe/Entrée vivantes homonymes : la déduplication par nom masque silencieusement l'échéance de l'une des deux dans Planning (extension de P021)

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichier** : `app/(tabs)/planning.tsx:599-604` (`enveloppesFixesUniques`), `664-669` (`enveloppesEntreesUniques`).
- **Description** : déduplication volontaire par nom (pour gérer "catégorie supprimée puis recréée sous un nouvel id, même nom"). Comme établi par P021, rien n'empêche 2 catégories réellement différentes de partager le même nom — dans ce cas, seule la PREMIÈRE rencontrée dans `objStore.enveloppes` génère son échéance dans Planning, la seconde est silencieusement absente en permanence.
- **Différence avec P021** : P021 documentait une fusion visuelle trompeuse (Stats) — ici c'est une omission pure, un vrai rendez-vous financier qui devrait apparaître et n'apparaît jamais.
- **Piste de correction** : même cause commune que P021 (interdire les doublons de nom parmi les catégories actives) — résoudrait les deux symptômes d'un coup.
- **Statut** : **CORRIGÉ (2026-09-18)** — même correctif que P021 (contrôle
  de doublon de nom à la création/au renommage, voir §2.2) : la précondition
  (2 catégories vivantes homonymes) ne peut plus se produire.

### P028 — Tap en dehors de la modale d'événement = enregistrement silencieux, contrairement au "X" qui annule

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichier** : `app/(tabs)/planning.tsx:1436-1439` (`fermerModalCreationAvecSauvegarde`, tap sur le fond) vs `2578-2585` (bouton "X", ferme sans sauvegarder).
- **Description** : deux comportements de fermeture incohérents, sans commentaire documentant un choix intentionnel — tap sur le fond appelle `validerInfos()` (crée/enregistre si `nomEvent` renseigné) puis ferme ; le "X" ferme sans rien enregistrer.
- **Impact** : un utilisateur qui tape un nom par erreur/pour essayer puis referme en tapant à côté (geste réflexe pour "annuler") se retrouve avec un événement créé sans l'avoir voulu, silencieusement.
- **Piste de correction** : uniformiser (les deux annulent, ou bouton "Enregistrer" explicite distinct) — à confirmer côté produit si l'auto-save était voulu.
- **Statut** : **COMPORTEMENT CONFIRMÉ VOULU (2026-09-18)** — décision
  produit reçue (§2.2) : "tap en dehors = sauvegarde, l'annulation explicite
  se fait uniquement via le bouton de fermeture". Revérifié sur le code
  actuel (`planning.tsx:2597-2634`) : c'est exactement le comportement déjà
  en place ici (tap sur le fond → `fermerModalCreationAvecSauvegarde` ;
  icône "X" du header → ferme sans enregistrer, rôle du bouton "Annuler" de
  la décision). Aucun changement de code nécessaire — le finding décrivait
  une incohérence qui s'avère être le design voulu, maintenant documenté
  explicitement au lieu d'être un choix implicite non commenté.

### P029 — Double-tap non protégé sur "Enregistrer les modifications" (édition), contrairement à la création

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichier** : `app/(tabs)/planning.tsx:1222-1282` (`sauvegarderModificationEvenement`, aucun garde-fou), `3285-3306` (bouton toujours actif).
- **Description** : la création est bien protégée (`creationEvenementEnCours`), l'édition non. Impact limité : `modifierEvenement`/`modifierEvenementPartenaire` sont des `UPDATE` idempotents (jamais de doublon d'événement) — le seul risque réel est un entrelacement de `annulerNotificationsEvenement`/`programmerNotificationsEvenement` (notification incohérente/absente, jamais un événement dupliqué).
- **Piste de correction** : réutiliser `creationEvenementEnCours` (ou un état dédié) autour de la sauvegarde d'édition.
- **Statut** : **CORRIGÉ (2026-09-17)** — même pattern que
  `finaliserCreationEvenement` : `creationEvenementEnCours` réutilisé (pas
  un nouveau flag), posé/relâché sur les 2 points de sortie de
  `sauvegarderModificationEvenement`. Revu par code-reviewer (APPROUVÉ) :
  aucun chemin (appels internes tous protégés par try/catch ou retour
  d'erreur, sauf un risque latent préexistant déjà présent côté création)
  ne peut laisser le flag bloqué à `true` — vérifié appel par appel.
  Confirmé que le bouton "Enregistrer" est bien partagé entre les 2 modes
  et que la création n'est pas affectée. tsc/lint vérifiés propres.

### P030 — Notification push "événement commun" jamais envoyée si un événement personnel devient commun via édition

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichier** : `app/store.ts:3579-3583` (`ajouterEvenement`, seul site d'appel de `envoyerNotificationEvenementCommun`) vs `modifierEvenement` (aucun appel).
- **Description** : basculer un événement de "personnel" à "commun" via édition ne notifie jamais le partenaire (seule la création le fait) — il ne le découvre qu'en rouvrant Planning (la bannière in-app, elle, fonctionne dans ce cas).
- **Piste de correction** : appeler `envoyerNotificationEvenementCommun` aussi dans `modifierEvenement` quand `visibilite` passe de `personnel` à `commun`.
- **Statut** : **CORRIGÉ (2026-09-17)** — exactement la piste ci-dessus,
  même geste best-effort (pas de `await`) que `ajouterEvenement`. Revu par
  code-reviewer (APPROUVÉ) : `ancien` confirmé capturé avant le `setEtat`
  (comparaison correcte), les 4 cas d'exclusion tracés à la main (déjà
  commun, redevient personnel, `visibilite` non touché, `userId` absent),
  signature de `envoyerNotificationEvenementCommun` vérifiée, isolation du
  chemin partenaire (`modifierEvenementPartenaire`, jamais affecté)
  confirmée. tsc/lint vérifiés propres.

### P031 — Le switch "Événement commun" reste interactif sur un événement du partenaire, mais son changement n'est jamais persisté

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit écran Planning (2026-09-16).
- **Fichier** : `utils/espacePartage.ts:885-918` (`modifierEvenementPartenaire`, n'inclut jamais `visibilite` dans l'`.update()`), `app/(tabs)/planning.tsx:3251-3274`.
- **Description** : en éditant un événement commun du partenaire, le switch bascule visuellement mais le changement n'est jamais envoyé à Supabase — no-op silencieux. Rouvrir l'événement montre à nouveau "commun" sans explication (le commentaire RÈGLE du code invoque la RLS, mais en pratique le champ n'est même pas envoyé — l'effet perçu est correct, juste sans retour explicite).
- **Piste de correction** : masquer/désactiver ce switch quand l'événement en édition appartient au partenaire, avec un texte explicatif.
- **Statut** : **CORRIGÉ (2026-09-17)** — `disabled={evenementEnEditionEstPartenaire}`
  + texte explicatif ("Seul·e {prénom} peut rendre cet événement personnel").
  Revu par code-reviewer (APPROUVÉ) : a tracé tout le chemin d'édition pour
  confirmer qu'un événement `personnel` du partenaire n'est jamais
  atteignable en édition (garde `if (ev.visibilite !== "commun") return;`
  dans `gererClicEvenement`) — l'hypothèse implicite du nouveau texte
  ("l'événement EST actuellement commun") tient toujours ; cas normal (mon
  propre événement) confirmé strictement inchangé. tsc/lint vérifiés propres.

### P032 — Budget : parsing UTC/local incorrect répliqué 3 fois de plus (variante de P004/P023, non catalogué jusqu'ici)

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichiers** : `app/(tabs)/budget.tsx:622-626` (`enveloppesAVenir`), `684-699` (`autresDepensesPayees`/`autresDepensesAVenir`), `459-464` (`paiementsDuMois`).
- **Description** : même cause racine que P004/P023, réimplémentée indépendamment 3 fois de plus dans `budget.tsx`, sur des champs qui n'utilisent PAS `moisComptageEffectif` : `new Date(dateOnlyString).getMonth()/.getFullYear()` sur `dateFixe`, `evenement.date`, `historique_paiements.date` — tous écrits en local, relus en UTC.
- **Impact** : pour un fuseau à décalage négatif, une échéance Fixe due le 1er du mois disparaît de "À venir ce mois-ci" pour son propre mois, un paiement historisé disparaît de la carte "payée" du bon mois, une "Autre dépense" bascule dans la mauvaise colonne payée/à venir. `formaterDateCourte`/`formaterDateLongue`/`dateAffichee` souffrent du même défaut pour l'AFFICHAGE des libellés.
- **Piste de correction** : même correctif que P004/P023 (parsing par composants explicites), même lot de correction — porte le total à au moins 9 sites entre `store.ts`/`utils/budget.ts`/`planning.tsx`/`budget.tsx`.
- **Statut** : **CORRIGÉ (2026-09-16)** — les 3 sites de filtrage/comparaison
  ET les fonctions d'AFFICHAGE (`formaterDateCourte`/`formaterDateLongue`/
  `dateAffichee`) corrigées avec `parseDateFixeLocale` (2e round de revue :
  le 1er lot n'avait traité que le filtrage, pas l'affichage — bloquant levé
  avant commit). Le tri par `.getTime()` (ligne ~698, non modifié) confirmé
  correct par le code-reviewer : un tri relatif sur deux `new Date(dateOnlyString)`
  n'est pas affecté par le décalage UTC constant, aucune correction requise
  là. Non rejoué sur device.

### P033 — Budget : aucun contrôle de doublon de nom de catégorie au chemin de création réel (extension de P021/P027)

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichiers** : `app/(tabs)/budget.tsx:908-928` (`creerNouvelleCategorieInline`, seul chemin de création sur cet écran), `app/store.ts:2504-2545` (`ajouterEnveloppe`, aucune vérification de nom).
- **Description** : confirme explicitement la précondition de P021/P027 sur le chemin de création RÉEL de Budget — "Nouvelle dépense → Créer une nouvelle catégorie" avec un nom déjà utilisé crée une seconde ligne `enveloppes` identique sans avertissement.
- **Conséquence supplémentaire, non documentée jusqu'ici** : en vue partagée, `construireCategoriesFusionnees` (`utils/espacePartage.ts:625-627`) fusionne par nom trimmé (le commentaire d'origine des développeurs anticipait déjà ce cas : *"plusieurs [ids] seulement si j'ai par erreur deux catégories du même nom"*), et `basculerPartageCategorie` bascule alors le flag `partage` des DEUX catégories homonymes d'un seul tap sur une carte fusionnée — impossible de les régler indépendamment. Masqué en prod (`ESPACE_PARTAGE_ACTIF=false`).
- **Piste de correction** : identique à P021/P027 — interdire les noms dupliqués parmi les catégories actives, à la création (Budget) et au renommage (`index.tsx`) — corrige P021/P027/P033 d'un seul coup.
- **Statut** : **CORRIGÉ (2026-09-18)** — même correctif que P021/P027 :
  contrôle de doublon de nom (trim+lowercase) ajouté à `ajouterEnveloppe`
  ET `renommerCategoriePartout` (`app/store.ts`), donc au chemin de création
  réel de Budget (`creerNouvelleCategorieInline` passe par
  `ajouterEnveloppe`). Message d'erreur : "Ce nom de catégorie existe déjà."
  La conséquence espace partagé documentée ci-dessus reste théoriquement
  vraie pour un compte déjà en doublon AVANT ce correctif, mais ne peut
  plus se (re)produire pour un nouveau doublon. tsc/lint vérifiés propres
  (10 lignes / 49 problèmes).

### P034 — `enveloppes.depense` et `transactions` écrits de façon non-atomique : dérive silencieuse permanente possible sur interruption

- **Gravité** : 🟠 MAJEUR (mitigation partielle déjà en place — sans elle, serait 🔴 au même titre que P008)
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichiers** : `app/store.ts:3766-3827` (`ajouterTransaction`), `3829-3888` (`modifierTransaction`), `3890-3932` (`supprimerTransaction`), `769-776` (`appliquerEnveloppes`, écriture enveloppe en fire-and-forget).
- **Description** : la ligne `transactions` et le compteur `enveloppes.depense` sont écrits par 2 requêtes Supabase indépendantes, jamais dans le même ordre d'une fonction à l'autre, la seconde jamais `await`-ée par l'appelant. Une interruption entre les deux désynchronise durablement les deux sources de vérité, sans erreur visible.
- **Repro tracée à la main** : catégorie "Courses" 265€/400€ ; ajouter "Boulangerie" 4,50€ ; quitter l'app immédiatement après le tap, avant résolution de l'`UPDATE enveloppes` → au relancement, "Boulangerie" apparaît dans la liste dépliée mais le total reste "265€/400€" (sous-compté), sans erreur. Cette valeur fausse est ensuite ARCHIVÉE telle quelle au changement de mois (`archiverMoisActuelInterne` ne recalcule jamais depuis les transactions) — dérive permanente dans l'historique.
- **Mitigation partielle déjà existante, vérifiée insuffisante pour le cas général** : `chargerEnveloppes` restaure depuis un cache AsyncStorage récent, mais uniquement pour `type==="Variable"` ET uniquement quand la base indique `depense===0` exactement (le commentaire du code le dit explicitement : une valeur non nulle reste toujours la source de vérité) — ne couvre pas l'incrément partiel du quotidien, le cas d'usage le plus fréquent.
- **Manifestation UI concrète de P007** (échéances Fixe) : sur cet écran précis, deux lignes `historique_paiements` dupliquées par P007 s'affichent comme deux cartes "payée" identiques empilées.
- **Piste de correction** : soit `await` réellement l'écriture de l'enveloppe avant de considérer l'opération terminée (retry au prochain lancement si échec), soit — plus robuste — recalculer `enveloppes.depense` comme `SUM(transactions.montant)` à chaque chargement plutôt que de faire confiance à un compteur incrémental non atomique.
- **Statut** : **CORRIGÉ (2026-09-17)** — découverte importante en creusant
  le correctif : le fichier a DÉJÀ une fonction de réconciliation
  `verifierIntegriteDepensesInterne` (existante avant cette session,
  commentaire daté du 2026-09-01, "chantier espace partagé"), qui recalcule
  exactement `depense = SUM(transactions du mois)` pour les catégories
  Variable et corrige toute dérive détectée — **mais seulement pour "le
  mois actuel" au moment où elle tourne** (câblée dans
  `verifierEtat()`/`app/(tabs)/_layout.tsx`, après chargement complet
  enveloppes+transactions, à chaque montage/retour au premier plan/60s).
  Cette fonction n'avait pas été repérée par l'audit initial (Budget,
  2026-09-16) qui avait donc caractérisé P034 comme largement non mitigé —
  en réalité déjà bien mitigé pour le cas courant. Le seul vrai résiduel :
  si l'app n'est jamais rouverte entre l'écriture interrompue et le
  changement de mois suivant, l'archivage capturerait la valeur encore
  dérivée dans le snapshot de façon permanente. Fermé en étendant la MÊME
  formule (vérifiée identique bit-à-bit par code-reviewer) à
  `archiverMoisActuelInterneCoeur`, juste avant le calcul du snapshot —
  voir le détail complet du correctif combiné dans P008 (les 2 bugs ont été
  corrigés et revus ensemble, sur le même fichier, la même fonction).
  Revu par code-reviewer sur 2 rounds : APPROUVÉ, formule confirmée
  identique à `verifierIntegriteDepensesInterne`, couverture des catégories
  inchangée (mapping 1:1, aucun filtre), commentaire sur la persistance de
  la correction pour une catégorie Variable ponctuelle vérifié exact après
  réécriture (round 1 avait noté un commentaire trompeur sur ce point,
  corrigé et reconfirmé exact au round 2). tsc/lint vérifiés propres.

### P051 — Archivage mensuel : détail par catégorie du snapshot peut rester vide si l'interruption survient DANS enregistrerSnapshotMoisSupabase

- **Gravité** : 🟡 MINEUR (strictement moins grave que P008 : pas de gel du
  curseur pour tout le compte, pas d'écrasement d'une donnée déjà bonne —
  juste une incomplétude jamais réparée automatiquement)
- **Trouvé par** : code-reviewer, en revue (round 2) du correctif P008 (2026-09-17).
- **Fichier** : `app/store.ts` (`enregistrerSnapshotMoisSupabase`) : l'upsert
  du parent `snapshots_mois` (totaux : épargne/disponible/total_depense) et
  l'insertion des lignes `snapshot_enveloppes` (détail par catégorie) sont
  2 écritures séquentielles, pas une transaction unique.
- **Description** : si l'app est tuée précisément entre ces 2 écritures, le
  snapshot existe déjà (totaux corrects) mais sans aucune ligne de détail.
  Au relancement, la nouvelle branche "reprise" de `archiverMoisActuelInterneCoeur`
  (correctif P008) trouve ce snapshot et le considère "déjà validé" —
  elle ne rappelle jamais `enregistrerSnapshotMoisSupabase` pour compléter
  le détail manquant. Le mois reste archivé avec un détail par catégorie
  vide, de façon permanente (visible dans `VueMoisArchive`), sans
  réparation automatique — `sauvegarderBackupArchivage` est un filet
  AsyncStorage manuel, pas un mécanisme de réparation auto.
- **Piste de correction** (à valider, pas appliquée) : dans la branche
  reprise, si `snapshotExistant.enveloppes.length === 0` alors qu'il
  devrait y avoir des catégories, retomber sur le recalcul/renvoi normal
  plutôt que de faire confiance aveuglément au stub.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code), correction non
  appliquée (fenêtre de course étroite, jugée non bloquante pour committer
  le correctif P008 qui reste, dans l'ensemble, une amélioration nette).

### P035 — Budget : aucun état "vide" pour "Tes catégories" (aggrave P016)

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichier** : `app/(tabs)/budget.tsx:1920-1922`.
- **Description** : contrairement à "À venir ce mois-ci" et à la liste de transactions d'une carte dépliée (qui ont un vrai état vide), la liste principale de catégories n'a AUCUN message de repli — ni pour un compte réellement sans catégorie, ni pour le flash de chargement initial (P016). Gap confirmé partagé avec `index.tsx` par grep, pas une régression isolée.
- **Piste de correction** : ajouter un état vide explicite distinct d'un état "chargement en cours" (lui-même à câbler sur `chargementInitialTermine`, cf. P016).
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code).

### P036 — Budget : tap en dehors de la modale d'ajout enregistre, bouton retour Android annule (incohérence de geste)

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichier** : `app/(tabs)/budget.tsx:962-965` (`fermerModalAjoutAvecSauvegarde`) vs `2160-2164` (`onRequestClose`, retour matériel).
- **Description** : même famille que P028 (Planning) — tap en dehors tente d'enregistrer si le formulaire est valide, le bouton retour Android ferme sans jamais tenter d'enregistrer. Pattern `AvecSauvegarde` volontaire et cohérent dans tout le projet, mais son incohérence spécifique avec `onRequestClose` (qui, lui, n'a jamais ce comportement) peut surprendre sur Android.
- **Piste de correction** : question de direction produit (le pattern "tap-outside = sauvegarde" est déjà établi partout) plutôt qu'un bug certain — à trancher explicitement plutôt qu'à corriger unilatéralement sur ce seul écran.
- **Statut** : **CORRIGÉ (2026-09-18)** — décision produit reçue (§2.2) :
  "tap en dehors = sauvegarde, appliqué de manière cohérente sur toutes les
  modales" tranche explicitement en faveur du pattern déjà établi. Le retour
  matériel Android (`onRequestClose`, `budget.tsx:2182`) est maintenant
  câblé sur la MÊME fonction que le tap en dehors
  (`fermerModalAjoutAvecSauvegarde`) au lieu d'un reset silencieux distinct
  — élimine l'incohérence exacte décrite par ce finding. Reste, à l'audit,
  un exemplaire d'un survol plus large des modales du projet (VueMoisArchive
  "Renommer la catégorie" corrigé de la même façon le même jour, seul autre
  vrai gap trouvé) — tsc/lint vérifiés propres.

### P037 — Budget : bouton "Ajouter la dépense" silencieux sur formulaire incomplet

- **Gravité** : 🔵 SUGGESTION
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichier** : `app/(tabs)/budget.tsx:930-931,2392-2396`.
- **Description** : taper sur "Ajouter la dépense" sans nom/montant/catégorie renseignés ne produit aucun retour visuel (bouton toujours actif, pas de message).
- **Piste de correction** : désactiver le bouton tant que le formulaire est incomplet, ou afficher une erreur explicite.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code).

### P038 — Budget : nom de catégorie très long tronqué silencieusement à 50 caractères sans avertissement

- **Gravité** : 🔵 SUGGESTION
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichier** : `app/(tabs)/budget.tsx:2284-2300` (champ nom, pas de `maxLength`), `app/store.ts:505-507` (`texteSecurise`, troncature serveur à 50 car.).
- **Description** : comportement déjà présent ailleurs dans le projet (pas une régression Budget), mais jamais documenté — aucun compteur de caractères côté client. Confirme aussi que P010 (montant collé avec séparateur de milliers) touche les 3 champs montant de cet écran.
- **Piste de correction** : `maxLength={50}` + compteur visuel sur le champ nom.
- **Statut** : NOUVEAU (mineur) — VÉRIFIÉ (lecture de code).

### P039 — Budget : recalcul non mémoïsé par carte de catégorie sur l'intégralité des transactions à chaque rendu

- **Gravité** : 🔵 SUGGESTION (perf, non mesurée sur device)
- **Trouvé par** : audit écran Budget (2026-09-16).
- **Fichier** : `app/(tabs)/budget.tsx:476-482,1058-1072,1076-1087`.
- **Description** : coût O(catégories × transactions/événements), recalculé à chaque rendu de l'écran entier (pas de `useMemo`) — même pattern déjà noté pour `analytics.tsx` en §3.4. Potentiellement perceptible pour un profil "très actif" + "beaucoup de catégories" (profils de test #2/#3/#7).
- **Piste de correction** : mémoïser par catégorie, ou indexer `transactions` par `enveloppeId` une seule fois au niveau de l'écran.
- **Statut** : **DÉCISION PRODUIT REÇUE (2026-09-18, §2.2), DOCUMENTÉ, NON
  CORRIGÉ** — pas de limite imposée au nombre de catégories par compte.
  Le point de vigilance perf décrit par ce finding reste réel et non
  mémoïsé : documenté explicitement en commentaire juste avant
  `categoriesAffichees` (`app/(tabs)/budget.tsx`) comme dégradation
  possible au-delà d'environ 50 catégories actives, sans rien bloquer côté
  produit. Reste ouvert comme point de vigilance perf pur (pas de correctif
  de mémoïsation appliqué dans ce lot).

### P040 — Parsing UTC/local (P004/P005/P023/P032) : 6 sites supplémentaires trouvés en revue de code, non encore corrigés

- **Gravité** : 🟠 MAJEUR (même mécanisme que P004/P023/P032, déjà corrigé ailleurs)
- **Trouvé par** : code-reviewer, en revue du correctif P004/P005/P023/P032 (2026-09-16) — grep exhaustif du même pattern hors du périmètre initialement audité par les agents.
- **Fichiers/sites** :
  - `app/(tabs)/index.tsx:722-726` (`new Date(e.date)` puis `.getMonth()/.getFullYear()`, filtre `depensesNonCategorisees`) et `:2516` (`premierJourMoisISO(new Date(day.dateString))`, même défaut sur le retour du calendrier que P023 côté Planning).
  - `app/(tabs)/index.tsx:92-95` (`formaterDateLongue`, affichage, utilisée ligne ~2088).
  - `app/VueMoisArchive.tsx:25-28` (`formaterDateCourte`, affichage ligne ~261 — la ligne 175, un tri par `.getTime()`, est elle correcte, même raisonnement que le tri non touché dans `budget.tsx`).
  - `app/(tabs)/analytics.tsx:3282-3294` vs `:3483` — `debutPeriodeFlux`/`finPeriodeFlux` construits avec des composants LOCAUX (`new Date(annee, mois, jour)`) alors que `t.date` (transaction) est parsé en UTC (`new Date(t.date)`) puis comparé — mélange des deux conventions dans `construireRepartitionSurPeriode`, utilisée par GraphiqueFlux.
  - `utils/score.ts:236` et `utils/trophees.ts:37` — mêmes accesseurs locaux sur `new Date(e.date)` pour bâtir les clés de streak ("Régularité") — même classe de bug que P005 (comptage de jours consécutifs faussé).
  - `utils/widgetsSync.ts:122` (`genererOccurrencesEvenement(new Date(e.date), ...)`) puis `.setHours(0,0,0,0)` interne (`utils/evenements.ts:25`) — décale le jour effectif affiché sur le widget Planning pour un fuseau négatif.
- **Description** : même cause racine que P004/P005/P023/P032 — `new Date(dateOnlyString)` (UTC) mélangé à des accesseurs locaux. `utils/score.ts`/`utils/trophees.ts`/`utils/widgetsSync.ts` sont des fichiers `utils/`, donc à corriger via `utils/dateOnly.ts` (déjà créé, zéro dépendance, importable directement) plutôt qu'une nouvelle copie locale.
- **Piste de correction** : même correctif (`parseDateFixeLocale` de `utils/dateOnly.ts`), à traiter dans un lot dédié plutôt que d'élargir davantage le commit en cours — ce report suit explicitement la recommandation du code-reviewer ("documenter et traiter dans un lot ultérieur, cohérent avec la philosophie du loop autonome").
- **Statut** : **CORRIGÉ (2026-09-17)** — les 8 sites (7 emplacements distincts,
  `index.tsx` en comptant 3) corrigés avec `parseDateFixeLocale`, importée
  depuis `"../store"` pour les fichiers `app/*.tsx` (déjà ré-exportée) et
  depuis `"./dateOnly"` pour les fichiers `utils/*.ts` (jamais depuis
  `store.ts`, règle d'architecture respectée). Revu par code-reviewer
  (APPROUVÉ) : grep exhaustif confirmant zéro site résiduel du même motif
  sur tout le repo, `debutPeriodeFlux`/`finPeriodeFlux` (analytics.tsx)
  confirmées non touchées par erreur (déjà correctes), comportement Europe
  vérifié inchangé (simulation `TZ=Europe/Paris`). tsc/lint vérifiés propres
  (10 lignes / 49 problèmes, sous la baseline).

### P041 — Aperçu : suppression d'un objectif d'épargne sans AUCUNE confirmation (3 sites)

- **Gravité** : 🔴 CRITIQUE (violation directe de la règle CLAUDE.md sur les confirmations destructives)
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichiers** : `app/(tabs)/index.tsx:3605-3609` (liste objectifs actifs), `:3700-3707` (liste "Objectifs clôturés"), `:4033-4041` (bouton "Supprimer l'objectif" en modale d'édition) ; `app/store.ts:3104-3146` (`supprimerObjectif`, aucun `Alert.alert` dans la fonction ni ses 3 appelants).
- **Description** : CLAUDE.md est explicite — "confirmation utilisateur explicite avant déclenchement (`Alert.alert`...) pour toute suppression visible de l'utilisateur — catégorie, transaction, **objectif**, événement". Les 3 points d'entrée appellent `objStore.supprimerObjectif(obj.id)` directement au tap, sans Alert. Contraste net avec toutes les autres suppressions de l'app (catégorie `index.tsx:1045`, transaction `budget.tsx:973`, compte `profil.tsx:866`), qui respectent toutes cette règle.
- **Aggravants** : (1) le premier site est un "X" de 16px imbriqué dans une carte dont le tap principal ouvre l'édition — cible minuscule collée à un comportement totalement différent, sur une carte financière ; (2) pour "Objectifs clôturés", l'`InfoBulle` juste au-dessus dit explicitement qu'il n'existe "aucun moyen de rouvrir" l'objectif — la suppression non confirmée est donc la SEULE sortie possible ; (3) `sauvegarderObjectifsSupprimes` fait bien un backup AsyncStorage, mais invisible pour l'utilisateur (pas de bouton "Annuler"/snackbar) — perçu comme une suppression instantanée et sans recours.
- **Piste de correction** : envelopper les 3 sites dans un `Alert.alert` ("Supprimer l'objectif '{nom}' ? Cette action est définitive.", `style: "destructive"`), même gabarit que les autres suppressions de l'app. Agrandir aussi la cible tactile du "X" (`hitSlop`).
- **Statut** : **CORRIGÉ (2026-09-17)** — nouvelle fonction
  `confirmerSuppressionObjectif(id, nom, apresSuppression?)` (`index.tsx`,
  juste avant `ajouterEnveloppe`), appelée aux 3 sites, `hitSlop` ajouté sur
  les 2 boutons "X". Un round de revue a trouvé le fix initialement
  INCOMPLET (le 3e site, "Objectifs clôturés", non touché — indentation JSX
  différente du 1er site, un `replace_all` n'avait matché que 2 des 3
  occurrences textuellement différentes) — corrigé avant commit, les 3
  sites vérifiés par grep. tsc/lint vérifiés propres (10 lignes / 49
  problèmes, sous la baseline).

### P042 — Planning : suppression d'un événement PERSONNEL sans aucune confirmation

- **Gravité** : 🔴 CRITIQUE (même violation que P041, touche 100% des événements en production actuelle)
- **Trouvé par** : audit UX écran par écran (2026-09-17) — confirme et durcit un point qu'AUDIT_V1.md §5.1 (audit du 2026-09-12) avait laissé "🟡 non tracé avec certitude, à vérifier visuellement".
- **Fichier** : `app/(tabs)/planning.tsx:1289-1320` (`supprimerEvenementEnEdition`), bouton "Supprimer l'événement" `:3331-3339`.
- **Description** : le code ne demande une confirmation `Alert.alert` QUE si l'événement est `commun` ET que l'utilisateur est dans un espace partagé (`:1305-1319`). Pour tout événement PERSONNEL — donc la quasi-totalité des événements en production, puisque `ESPACE_PARTAGE_ACTIF=false` — `executerSuppression()` est appelé directement, sans Alert, sans "Annuler".
- **Repro** : ouvrir un événement personnel, taper "Supprimer l'événement" → suppression instantanée, aucun message.
- **Piste de correction** : appliquer le même `Alert.alert` que pour le cas "commun" (texte adapté : "Supprimer cet événement ?"), à toute suppression d'événement, pas seulement les "commun".
- **Statut** : **CORRIGÉ (2026-09-17)** — `Alert.alert("Supprimer cet
  événement ?", ...)` ajouté sur le chemin par défaut (événement personnel),
  même gabarit que le cas "commun" existant. Confirmé par code-reviewer :
  relecture complète de la fonction, aucun chemin de contournement restant
  (un seul point d'appel dans tout le fichier). tsc/lint vérifiés propres.

### P050 — Budget : suppression d'un événement (panneau "gestion événement") sans confirmation, même famille que P041/P042

- **Gravité** : 🔴 CRITIQUE
- **Trouvé par** : code-reviewer, en revue du correctif P042 (2026-09-17) — grep exhaustif d'autres suppressions non protégées.
- **Fichier** : `app/(tabs)/budget.tsx:2489-2499` (bouton "Supprimer" du panneau de gestion d'un événement affiché sur Budget, ouvert depuis un tap sur une entrée "À venir"/"Autre dépense").
- **Description** : `objStore.supprimerEvenement(gestionEvenement.id)` appelée directement au tap, sans `Alert.alert` — même violation que P042, sur un 3e point d'entrée vers la même fonction de suppression.
- **Statut** : **CORRIGÉ (2026-09-17)** — même geste que P042 (`Alert.alert` Annuler/Supprimer destructive) avant l'appel à `objStore.supprimerEvenement`. tsc/lint vérifiés propres (10 lignes / 49 problèmes, sous la baseline).

### P043 — Onboarding : 4 des 6 écrans ignorent totalement le thème sombre et l'accessibilité "contraste renforcé"

- **Gravité** : 🟠 MAJEUR
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichiers** : `onboarding/connexion.tsx`, `invite.tsx`, `inscription.tsx`, `essai-expire.tsx` — aucun n'importe `useTheme()`/`useAccessibilite()`, toutes leurs couleurs sont codées en dur (`#FFFFFF`, `#1A1A1A`, `#888`...). Contraste : `onboarding/preferences.tsx` + `components/OnboardingEtape.tsx` utilisent bien `useTheme()`.
- **Conséquence concrète** : (a) un utilisateur en mode sombre qui se déconnecte (flux réel : `profil.tsx:766` → `router.replace("/onboarding/connexion")`) revoit un écran blanc forcé, rupture visuelle nette ; (b) le réglage "Contraste renforcé" (`AccessibiliteContext`) n'a AUCUN effet sur ces 4 écrans. **Contraste mesuré sous le seuil WCAG AA** : `#888888` sur `#FFFFFF` ≈ 3.5:1, `#AAAAAA` sur `#FFFFFF` ≈ 2.3:1 (seuil AA texte : 4.5:1) — problème de lisibilité réel sur les tout premiers écrans vus par un utilisateur, pas seulement esthétique.
- **Piste de correction** : câbler `useTheme()`/`useAccessibilite()` sur ces 4 écrans, remplacer les gris hardcodés par `C.texteMuted`, cohérent avec `preferences.tsx`.
- **Statut** : **CORRIGÉ (2026-09-17)** — les 4 écrans importent `useTheme()`,
  `const fond = theme === "sombre" ? C.fond : C.fondPage;` (même pattern que
  `OnboardingEtape.tsx`), toutes les couleurs codées en dur remplacées par
  les tokens `C.*` correspondants (`texte`/`texteMuted`/`carte`/`purple`/
  `purpleLight`/`purpleText`/`rougeText`). Les `#FFFFFF` restants (texte/
  spinner sur bouton violet) volontairement laissés fixes — confirmé par
  code-reviewer que `C.purple` a la même valeur hex en clair et en sombre.
  Revu par code-reviewer (APPROUVÉ) : tokens vérifiés existants et bien
  choisis, aucune logique métier touchée (diff filtré confirmé). tsc/lint
  vérifiés propres (10 lignes / 49 problèmes, sous la baseline).

### P044 — Planning : navigation `‹`/`›` sans accessibilité, aucun raccourci "revenir à aujourd'hui"

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichier** : `planning.tsx:1848-1862` (glyphes texte `‹`/`›` sans `accessibilityLabel`/`accessibilityRole`).
- **Description** : un lecteur d'écran énonce le caractère brut plutôt qu'une action compréhensible. Par ailleurs, grep exhaustif sur "Aujourd'hui" comme libellé de bouton → aucune occurrence : un utilisateur qui navigue plusieurs semaines/mois doit retaper `‹` autant de fois pour revenir à aujourd'hui — trop de clics pour une action fréquente.
- **Piste de correction** : `accessibilityLabel="Période précédente"/"Période suivante"` ; ajouter un tap sur le titre de période ou un bouton dédié "Aujourd'hui".
- **Statut** : **CORRIGÉ (2026-09-17)** — labels ajoutés sur les 2 flèches ;
  titre de période enveloppé dans un `TouchableOpacity` (`setDateActuelle(new
  Date())`, `accessibilityLabel="Revenir à aujourd'hui"`), sans nouveau
  bouton visuel. Revu par code-reviewer (APPROUVÉ) : layout `dayHeader`
  inchangé, `dateActuelle` confirmée être la seule source dérivant
  Jour/Semaine/Mois, aucun conflit de geste avec `gesteSwipeVue` (zone
  différente). tsc/lint vérifiés propres.

### P045 — Planning : bouton "+" du header sans accessibilité (contrairement au FAB équivalent)

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichier** : `planning.tsx:1702-1707` (`btnPlus`, sans `accessibilityLabel`) vs `:2144-2151` (`fabPlanning`, vue Jour, avec `accessibilityLabel="Créer un événement"` correct) — même action (`ouvrirCreationComplete`), un seul étiqueté.
- **Piste de correction** : ajouter `accessibilityRole="button"` + `accessibilityLabel="Créer un événement"` sur `btnPlus`.
- **Statut** : **CORRIGÉ (2026-09-17)** — `accessibilityRole="button"` +
  `accessibilityLabel="Créer un événement"` ajoutés (identique au libellé
  déjà présent sur le FAB équivalent de la vue Jour). Revu par
  code-reviewer (APPROUVÉ). tsc/lint vérifiés propres.

### P046 — Profil : ordre navigation/confirmation inversé sur la suppression de compte, et boutons "Se déconnecter"/"Supprimer mon compte" peu différenciés

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichiers** : `profil.tsx:836-849` (séquence `signOut()` → `reinitialiserEtatUtilisateur()` → `router.replace("/onboarding/connexion")` → **puis** `Alert.alert("Compte supprimé", ...)`) ; `profil.tsx:1687-1719` (les 2 boutons partagent le même style `btnSecondaire`, seule différence : couleur du texte `#E24B4A` sur "Supprimer mon compte").
- **Description** : le message de confirmation finale s'affiche APRÈS avoir déjà navigué vers l'écran de connexion — récit utilisateur illogique (pas bloquant, l'Alert natif s'affiche quand même). Par ailleurs, les 2 boutons de fin de section (déconnexion vs suppression définitive) sont visuellement quasi identiques — seule la couleur de texte distingue une action réversible d'une action irréversible.
- **Piste de correction** : afficher l'Alert de confirmation AVANT `router.replace(...)` (navigation déclenchée depuis le `onPress` du bouton "OK") ; ajouter un espacement/fond teinté plus marqué sur le bouton de suppression.
- **Statut** : **CORRIGÉ (2026-09-17)** — Alert affichée avant la navigation
  (`router.replace` déplacé dans le `onPress` du bouton "OK") ; bouton
  "Supprimer mon compte" avec fond teinté `C.rougeLight` + `marginTop: 24`
  (au lieu de 12) pour le distinguer de "Se déconnecter" au-dessus. Revu
  par code-reviewer (APPROUVÉ) : ordre métier `signOut`/
  `reinitialiserEtatUtilisateur` confirmé inchangé, `C.rougeLight` vérifié
  pour les 2 thèmes, aucun conflit de style. Point mineur noté hors scope
  (texte du bouton en `#E24B4A` codé en dur plutôt que `C.rougeText` —
  préexistant, pas introduit par ce correctif). tsc/lint vérifiés propres.

### P047 — Onboarding : aucun bouton retour sur `invite.tsx`, incohérence de skippabilité entre les 4 premières étapes de `preferences.tsx`

- **Gravité** : 🟡 MINEUR
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichiers** : `onboarding/invite.tsx` (aucun bouton retour visible, contrairement à `components/OnboardingEtape.tsx:80-90` qui en a un avec `accessibilityLabel="Étape précédente"`) ; `onboarding/preferences.tsx:122-220` (étapes Salaire/Loyer/Courses skippables silencieusement — champ vide + "Continuer" = no-op — mais bouton toujours pleine opacité, sans mention "optionnel") vs `:504-522` (étape "Autres dépenses", SEULE à afficher un bouton secondaire explicite "Passer cette étape").
- **Piste de correction** : bouton retour discret sur `invite.tsx` ; même `boutonSecondaireLabel="Passer cette étape"` (ou texte d'aide "Laisse vide si non applicable") sur les 3 premières étapes du questionnaire.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code).

### P048 — Budget/Stats : 2 boutons icône sans `accessibilityLabel` (raccourci de dépense, info balance)

- **Gravité** : 🔵 SUGGESTION
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichiers** : `budget.tsx:1284-1301` (bouton "+ Raccourci" sans info-bulle expliquant le concept à un novice, alors que `InfoBulle` est déjà utilisée ailleurs dans le même fichier, ex. `:2099`) ; `analytics.tsx:4903-4909` (icône "i" des chips de mode de balance, sans `accessibilityRole`/`accessibilityLabel`, contraste avec le reste de l'écran globalement bien traité sur ce point — ex. boutons "Fermer" des modales de détail).
- **Piste de correction** : `InfoBulle` sur le bouton "+ Raccourci" ; `accessibilityRole="button"` + `accessibilityLabel` sur l'icône "i".
- **Statut** : **CORRIGÉ (2026-09-17)** — `InfoBulle` (composant existant)
  ajoutée dans `modelesRow` ; `accessibilityRole`/`accessibilityLabel`
  ajoutés sur l'icône "i" des chips de balance. Revu par code-reviewer
  (APPROUVÉ, 2 points mineurs relevés et corrigés avant commit :
  `alignItems: "center"` manquant sur `modelesRow` — ajouté, cohérent avec
  les autres rows du fichier utilisant `InfoBulle` ; commentaires
  initialement marqués "RÈGLE À NE JAMAIS CASSER" repassés en "RÈGLE :"
  simple, cohérent avec la convention du fichier pour un ajout additif
  mineur sans piège de régression). tsc/lint vérifiés propres.

### P049 — Onboarding : pas de retour explicite sur la contrainte de mot de passe (8 caractères)

- **Gravité** : 🔵 SUGGESTION
- **Trouvé par** : audit UX écran par écran (2026-09-17).
- **Fichier** : `onboarding/inscription.tsx:171-179` (`disabled={!formulaireValide || chargement}`, `formulaireValide` exige `motDePasse.length >= 8`) — le bouton passe à opacité 0.5 sans texte explicatif (seul le placeholder "Au moins 8 caractères" le suggère indirectement). Moins grave que P037 (Budget, bouton silencieux ACTIF) car ici au moins visuellement désactivé — mais reste un frein potentiel sur l'écran le plus critique du funnel.
- **Piste de correction** : afficher dynamiquement "Encore N caractères" ou une coche verte dès 8 caractères atteints.
- **Statut** : NOUVEAU — VÉRIFIÉ (lecture de code).

### P052 — Aucune UI pour consulter/gérer les transactions orphelines après suppression d'une catégorie

- **Gravité** : 🔵 SUGGESTION (aucune perte de donnée : les transactions
  restent en base — c'est leur consultation qui manque)
- **Trouvé par** : implémentation de la décision produit du 2026-09-18 sur
  P028 (voir §2.2) — "les transactions restent visibles dans l'archivage
  mensuel, consultables/modifiables/supprimables définitivement depuis
  l'historique".
- **Fichiers** : `app/store.ts` (`supprimerEnveloppe`, ne supprime plus les
  transactions liées côté Supabase depuis ce correctif), `app/VueMoisArchive.tsx`
  (seul écran "historique" existant, n'affiche que des agrégats
  `SnapshotEnveloppe` par catégorie, jamais de transactions individuelles).
- **Description** : une transaction dont la catégorie a été supprimée (donc
  jamais archivée — une catégorie déjà présente dans un snapshot ne peut de
  toute façon plus être supprimée, `ON DELETE NO ACTION` sur
  `snapshot_enveloppes.enveloppe_id`) reste désormais en base, orpheline,
  mais **n'apparaît plus nulle part dans l'app** : invisible dans l'état
  local (retirée volontairement pour éviter tout affichage incohérent, cf.
  RÈGLE dans `supprimerEnveloppe`), et `VueMoisArchive.tsx` ne sait de toute
  façon afficher que des totaux par catégorie archivée, jamais une liste de
  transactions individuelles ni une catégorie qui n'a jamais existé dans un
  snapshot.
- **Impact** : la donnée n'est plus perdue (améliore l'ancien comportement),
  mais la promesse "consultable/modifiable/supprimable depuis l'historique"
  de la décision produit n'est pas encore honorée à 100% — un utilisateur
  ne peut aujourd'hui ni voir ni supprimer définitivement ces transactions
  orphelines lui-même.
- **Piste de correction** : nouvel écran (ou section dédiée dans
  `VueMoisArchive.tsx`/`profil.tsx`) listant les transactions dont
  `enveloppeId` ne correspond à aucune catégorie actuelle, avec actions
  consulter/modifier la catégorie de rattachement/supprimer définitivement
  — chantier UI à part entière, pas un simple correctif.
- **Statut** : NOUVEAU — décision produit déjà appliquée pour la partie
  "ne plus supprimer" (conservateur), cette UI de consultation reste à
  construire.

### P053 — `depenseCumuleeAuJour` (insight "meilleur mois") peut inclure une transaction orpheline datée dans un mois déjà archivé

- **Gravité** : 🔵 SUGGESTION (edge case rare, message positif non financier)
- **Trouvé par** : code-reviewer, en revue du correctif P028 "transactions
  après suppression de catégorie" (2026-09-18).
- **Fichiers** : `utils/exportExcel.ts:89-110` (`depenseCumuleeAuJour`,
  somme `transactions` sans jamais vérifier que `enveloppeId` correspond à
  une catégorie encore existante), appelée sans `enveloppeId` par
  `utils/conseils.ts:1559` ("Meilleur mois depuis X mois").
- **Description** : une transaction dont la catégorie a été supprimée reste
  en base (cf. P028) avec sa `date` d'origine — normalement toujours dans
  le mois courant non archivé (une catégorie déjà archivée ne peut plus être
  supprimée, `ON DELETE NO ACTION`). Mais rien n'empêche une transaction
  d'être créée avec une date ANTIDATÉE vers un mois déjà archivé (le
  sélecteur de date de "Nouvelle dépense" n'a pas de borne minimale connue)
  pour une catégorie elle-même créée et supprimée dans le mois courant —
  cette transaction orpheline, datée dans le passé, est alors comptée par
  `depenseCumuleeAuJour` lors d'une comparaison "au même jour" avec un mois
  archivé, alors que le total du mois courant (`totalDepenses`, basé sur
  `enveloppe.depense`) ne peut structurellement pas l'inclure — comparaison
  légèrement faussée.
- **Piste de correction** : filtrer `transactions` sur les `enveloppeId`
  actuellement connus avant de les passer à `depenseCumuleeAuJour` pour les
  usages "somme toutes catégories" (sans `enveloppeId` explicite), ou faire
  porter le filtre dans la fonction elle-même via un paramètre optionnel
  d'ids valides.
- **Statut** : NOUVEAU — non corrigé (nécessite de faire circuler la liste
  des enveloppes valides jusqu'à `depenseCumuleeAuJour`/`utils/conseils.ts`,
  hors périmètre du lot de décisions produit du 2026-09-18 ; impact limité
  à un message positif d'insight, jamais un calcul financier affiché).

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
la boucle.

### 2026-09-17 — Incident process : édits perdus sur `planning.tsx` par une course entre agents de revue

- **Doute rencontré** : aucun doute produit — un incident d'outillage. Après
  2 rounds de revue (code-reviewer, security-auditor) sur le correctif de
  parsing de dates (P004/P005/P023/P032), `app/(tabs)/planning.tsx` s'est
  retrouvé strictement identique à HEAD au moment de stager pour commit —
  les 7 sites corrigés dans ce fichier avaient disparu, sans trace dans
  `git status`, `git stash list`, `git reflog`, ni dans aucun blob dangling
  (`git fsck`). Cause la plus probable : au moins un agent de revue
  dispatché en tâche de fond a exécuté `git stash`/`git stash pop` pour
  comparer tsc/lint avant/après (mentionné explicitement dans son propre
  rapport) — sans isolation de worktree (`isolation: "worktree"` non
  spécifiée pour ces agents), ce `stash` a opéré sur le MÊME répertoire de
  travail que mes propres modifications non commitées. Deux agents de revue
  ont tourné avec des fenêtres qui se chevauchent ; un `git stash`/`pop`
  concurrent d'un second processus peut faire disparaître le contenu d'un
  premier stash sans laisser de trace récupérable — explication cohérente
  avec tous les symptômes observés, bien que non confirmée avec certitude
  absolue (impossible de rejouer l'incident après coup).
- **Décision prise (la plus conservative)** : reconstruire les 7 édits
  perdus à l'identique (retrouvés dans le propre historique de cette
  conversation), revérifier tsc/lint, et NE PAS redispatcher d'agent
  Bash-capable en tâche de fond tant que ce lot précis n'est pas commité —
  éviter une seconde occurrence du même risque plutôt que de la diagnostiquer
  une seconde fois.
- **Pourquoi** : aucune donnée UTILISATEUR perdue (c'est du code applicatif
  non commité, entièrement reconstructible depuis la conversation) — mais le
  principe reste "ne jamais assumer qu'un outil a réussi sans vérifier",
  appliqué ici après coup plutôt qu'avant.
- **Fichiers concernés** : `app/(tabs)/planning.tsx` uniquement — tous les
  autres fichiers touchés par ce même correctif (`app/store.ts`,
  `app/(tabs)/budget.tsx`, `app/notifications.ts`, `utils/budget.ts`,
  `utils/conseils.ts`, `utils/dateOnly.ts`) vérifiés intacts par grep ciblé
  avant de committer.
- **À reconsidérer si** : Maëlys constate un autre cas de travail non
  commité disparu après un tour d'agents de fond — signe qu'il faudrait
  systématiquement lancer les agents de revue avec `isolation: "worktree"`
  plutôt que de partager le répertoire de travail principal, ou éviter tout
  `git stash` dans les prompts donnés aux agents de revue (leur demander
  `git diff`/`git show` en lecture seule suffit pour comparer, sans jamais
  modifier l'état du working tree).

### 2026-09-17 — P026 : règle de clamping pour un événement annuel créé un 29 février

- **Doute rencontré** : en corrigeant la dérive de récurrence (31 janvier
  mensuel qui glissait indéfiniment, jamais stable sur "fin de mois"), le
  même mécanisme de clamping s'applique naturellement à un événement ANNUEL
  créé un 29 février — mais son comportement dans une année non bissextile
  est un choix produit, pas juste un bug : retomber sur le 28 février, ou
  reporter au 1er mars ?
- **Décision prise** (la plus conservative) : retombe sur le 28 février —
  même règle de clamping ("dernier jour valide du mois cible") appliquée
  uniformément au cas mensuel et au cas annuel, sans traitement spécial
  pour le 29 février. Revient naturellement au 29 février l'année
  bissextile suivante (vérifié : 2024→2025→2026→2027→28 fév, 2028→29 fév).
- **Pourquoi** : c'est le comportement le plus prévisible et le plus
  standard (aligné sur Google Calendar/la plupart des calendriers grand
  public) ; un report au 1er mars aurait été tout aussi défendable mais
  introduisait un cas spécial dans le code pour une seule occurrence sur
  365, alors que le clamping uniforme couvre les deux cas (mensuel/annuel)
  avec une seule règle simple à auditer.
- **Fichiers concernés** : `utils/evenements.ts` (`genererOccurrencesEvenement`).
- **À reconsidérer si** : Maëlys préfère explicitement un report au 1er mars
  pour un anniversaire/événement annuel du 29 février — changement d'une
  ligne (cas spécial dans `avancerDe` pour `nbMois === 12` uniquement).

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

### 2026-09-18 — Réponses reçues sur 6 décisions produit — précision sur la numérotation

**Note de clarification (à lire avant le reste de cette entrée)** : les
décisions reçues référençaient des identifiants (P021/P025/P027/P028/P033/P036)
qui ne correspondent PAS aux mêmes sujets que ces mêmes identifiants dans
ce fichier (ex. le "P021" de ce fichier est un bug d'affichage GraphiqueFlux,
pas la création de catégorie). Mappage fait par CONTENU plutôt que par
numéro, documenté explicitement ci-dessous pour chaque décision — aucun
finding existant n'a été renuméroté ni son contenu modifié.

**1. Doublons de noms de catégorie** (correspond à **P021/P027/P033** de ce
fichier, tous liés à l'absence de contrainte d'unicité sur `enveloppes.nom`) :
- **Décision** : un utilisateur ne peut pas créer deux catégories avec le
  même nom sur son propre compte — erreur "Ce nom de catégorie existe
  déjà" si le nom est déjà pris. En vue partagée, la fusion par nom reste
  le comportement voulu (pas de doublon possible par construction).
- **Implémenté** : vérification côté client (nom trimmé, insensible à la
  casse — même convention que `fusionnerCategoriesParNom`) ajoutée à
  `ajouterEnveloppe` ET à `renommerCategoriePartout` (`app/store.ts`) — la
  décision dit "à la création", étendue au renommage par cohérence (un
  renommage vers un nom déjà pris recréerait exactement le même problème).
  Vérification CLIENT uniquement — pas de contrainte SQL unique côté
  Supabase (couvre le cas réel : un utilisateur, un appareil ; n'élimine
  pas une vraie course entre 2 appareils simultanés). SQL disponible en
  option si une garantie serveur est souhaitée plus tard :
  `create unique index if not exists enveloppes_user_nom_actif_idx on enveloppes (user_id, lower(trim(nom))) where <condition d'activité à définir>;`
  — non fourni précisément ni exécuté, la définition de "catégorie active"
  nécessiterait une réflexion dédiée (catégories archivées/vestigiales à
  exclure ou non de la contrainte).

**2. Tap en dehors d'une modale** (correspond à **P028/P036** de ce
fichier, et à l'entrée "2026-09-16" plus bas dans cette section) :
- **Décision** : tap en dehors = sauvegarde (déjà le comportement établi
  dans la majorité des modales via le pattern `fermerModal*AvecSauvegarde`
  — cf. `index.tsx`/`budget.tsx`/`planning.tsx`/`profil.tsx`) ; annulation
  explicite uniquement via le bouton "Annuler". Appliqué de façon cohérente
  partout.
- **Implémenté** : audit de TOUTES les modales de l'app (`grep` exhaustif
  des `onRequestClose`/overlays tap-to-close) — un seul écart trouvé :
  `app/VueMoisArchive.tsx` (modale "Renommer la catégorie"), dont le tap
  en dehors annulait sans sauvegarder. Corrigé (`onPress={confirmerRenommage}`
  au lieu de `onPress={() => setRenommageAncienNom(null)}`). Les autres
  modales sans ce pattern ont été vérifiées une par une et sont
  **volontairement exemptées**, chacune pour une raison distincte déjà
  correcte : sélection à application immédiate sans étape de sauvegarde
  séparée (`modalCouleurEspacePartageVisible`, `modalMoisVisible` —
  "Fermeture automatique après sélection", RÈGLE déjà documentée), panneau
  d'actions sans champ de formulaire (`gestionEvenement`), modale
  informative/actions déjà effectuées côté serveur au moment du tap
  (`modalEspacePartageVisible`, RÈGLE déjà documentée : "un rejoint/une
  création déjà effectuée reste effectuée"), ou vues de détail en lecture
  seule sans tap-outside du tout pour une raison technique documentée
  (`modalSeriesVisible` — conflit de geste avec un `ScrollView`, RÈGLE
  existante, surtout ne pas y toucher).
- **Complément du 2026-09-18 (suite)** : re-vérification du code réel de
  P028/P036 (au-delà de l'audit tap-outside-vs-overlay ci-dessus) a
  confirmé un écart distinct sur chacun — traité séparément :
  - **P028** (Planning, modale événement) : tap en dehors = sauvegarde,
    icône "X" du header = annule sans enregistrer. C'est EXACTEMENT le
    comportement que la décision demande (l'icône "X" joue le rôle du
    bouton "Annuler"). Aucun changement de code — finding refermé comme
    comportement confirmé voulu, pas comme bug corrigé.
  - **P036** (Budget, modale d'ajout de dépense) : le retour matériel
    Android (`onRequestClose`) fermait la modale via un reset direct, SANS
    jamais tenter d'enregistrer — contrairement au tap en dehors juste à
    côté, qui appelle déjà `fermerModalAjoutAvecSauvegarde`. Corrigé :
    `onRequestClose` appelle désormais la même fonction que le tap en
    dehors (`app/(tabs)/budget.tsx:2182`), pour que les deux gestes de
    fermeture "non explicites" restent identiques, conformément à "appliqué
    de façon cohérente sur toutes les modales".

**3. Espace partagé dissous pendant qu'un utilisateur est actif** — ne
correspond à AUCUN finding existant de ce fichier, sujet neuf.
- **Décision** : retour automatique en vue individuelle, le switcher Moi/
  Partagé disparaît, aucun message d'erreur agressif — juste une transition
  douce avec une notification in-app discrète : "L'espace partagé a été
  dissous".
- **Investigation** : aucun listener Supabase Realtime n'existe dans ce
  projet — `EspacePartageContext.tsx` ne se rafraîchit qu'à 3 moments
  (montage/changement d'utilisateur, retour `AppState` "background→active",
  actions locales explicites join/create/leave). Un utilisateur resté actif
  en premier plan sans jamais mettre l'app en arrière-plan ne détectait donc
  JAMAIS une dissolution déclenchée par l'autre membre — il continuait de
  voir un partenaire/des données figés indéfiniment (RLS renvoie
  silencieusement `data: []`, pas une erreur, donc aucun symptôme visible
  autre qu'un solde qui ne bouge plus).
- **Implémenté** : `rafraichirEspace` (`EspacePartageContext.tsx`) détecte
  désormais la transition "était dans un espace → n'y est plus" et bascule
  `vueActive` sur "personnel" + pose `espaceVientDEtreDissous=true` (état
  neuf, exposé par le contexte avec `acquitterDissolutionEspace`). Ce
  rafraîchissement est maintenant aussi appelé depuis
  `app/(tabs)/_layout.tsx::verifierEtat` (déjà exécuté au montage, toutes
  les 60s, et à chaque retour au premier plan) — comble le délai de
  détection pour une session restée active en continu. Nouveau composant
  `EspaceDissousBanner.tsx` (même gabarit que `SyncErrorBanner.tsx` :
  bannière discrète, auto-effacée après 5s), couleur teal neutre (#1D9E75)
  plutôt que le rouge d'alerte des erreurs de sync, monté juste après
  `<SyncErrorBanner />` dans `_layout.tsx`. tsc/lint vérifiés propres.

**4. Catégorie supprimée avec transactions existantes** — ne correspond à
AUCUN finding existant. **Point important** : ceci change un comportement
DÉJÀ EN PLACE, déjà audité et documenté comme volontaire — `supprimerEnveloppe`
supprimait jusqu'ici les transactions liées (cf. §5.1 plus bas, tableau
"Inventaire des opérations destructives", et P001 qui documente la
suppression en cascade des modèles de dépense liés au même geste).
- **Décision** : ne jamais supprimer automatiquement les transactions
  liées. Elles restent visibles dans l'archivage mensuel, consultables/
  modifiables/supprimables définitivement depuis l'historique.
- **Portée réelle, vérifiée sur le schéma** : `snapshot_enveloppes.enveloppe_id`
  est en `ON DELETE NO ACTION` (migration `20260723090000_snapshot_fk_no_action.sql`)
  — Postgres refuse déjà la suppression d'une catégorie tant qu'un snapshot
  archivé y fait référence (message existant : "cette catégorie a été
  archivée dans un mois passé et ne peut plus être supprimée"). Cette
  décision ne peut donc concrètement s'appliquer qu'à une catégorie créée
  ET supprimée dans le MÊME mois, jamais encore archivée — le cas "vieille
  catégorie avec un historique de plusieurs mois" était déjà, avant même
  cette décision, protégé contre la suppression par ce garde-fou distinct.
- **Implémenté** : le `DELETE` Supabase sur `transactions` a été retiré de
  `supprimerEnveloppe` (`app/store.ts`) — les transactions restent en base,
  orphelines (`enveloppe_id` continue de pointer vers l'id de la catégorie
  supprimée, jamais mis à null, pour préserver l'info "à quelle catégorie ça
  appartenait" en vue d'une future UI de récupération). Elles sont en
  revanche bien retirées de l'état local en mémoire au même moment que la
  catégorie, car AUCUN écran actuel ne sait afficher une transaction dont
  l'`enveloppeId` ne correspond à aucune catégorie existante (vérifié par
  audit de code : tous les filtres du projet partent d'une catégorie connue
  vers ses transactions, jamais l'inverse — donc pas de risque de crash/
  plantage, la transaction orpheline devient simplement invisible plutôt que
  perdue). `chargerTransactions` les recharge telles quelles (orphelines)
  à chaque rafraîchissement, sans conséquence : `enveloppe.depense` reste la
  seule source de vérité des totaux affichés dans toute l'app (jamais une
  re-somme de `transactions` brute), donc une transaction orpheline n'est
  comptée nulle part par erreur.
- **Limite assumée, à traiter comme un chantier séparé** : "consulter,
  modifier ou supprimer définitivement depuis l'historique" décrit une UI
  de consultation qui **n'existe pas encore** — `VueMoisArchive.tsx`
  n'affiche que des agrégats `SnapshotEnveloppe` par catégorie, jamais de
  transactions individuelles, et une transaction orpheline (catégorie
  supprimée dans le mois courant, jamais archivée) n'apparaît de toute
  façon dans AUCUN snapshot. Nouveau finding **P052** ouvert ci-dessous
  pour cette UI manquante — solution conservative appliquée ici en
  attendant (ne plus perdre la donnée, sans encore construire l'écran pour
  la consulter), conforme à la règle du loop autonome ("en cas de doute,
  solution la plus conservative"). tsc/lint vérifiés propres.

**5. Limite de catégories par compte** (ferme **P039** de ce fichier,
perf non mémoïsée) :
- **Décision** : pas de limite imposée. Documenter dans le code qu'une
  performance dégradée est possible au-delà de 50 catégories actives.
- **Implémenté** : commentaire ajouté dans `app/(tabs)/budget.tsx`, juste
  avant `categoriesAffichees`.

**6. Simulateur avec catégorie à budget 0€** — ne correspond à AUCUN
finding existant.
- **Décision** : dans les analyses/insights → ignorer les catégories à
  budget 0€. Dans le simulateur/forecast → les inclure quand même. Protéger
  contre la division par zéro dans tous les calculs de ratio/pourcentage.
- **Investigation** : une catégorie à `budget=0€` avec une dépense réelle
  non nulle vérifiait trivialement `depense > budget` — sans filtre, elle
  gonflait artificiellement les totaux d'analyse (score de santé, "catégorie
  la plus dépassée"), pouvait à elle seule faire échouer le trophée "Mois
  maîtrisé"/la série "Budget respecté" pour tout le compte, sans qu'aucune
  division par zéro ne soit jamais atteinte dans le code existant (calculs
  déjà protégés ou non applicables à ce cas précis).
- **Implémenté** — côté analyses/insights, catégories à budget=0€ exclues :
  `utils/score.ts` (`scoreBudget`, `trouverCategorieDepassee` — ajout
  `&& e.budget > 0` au filtre `pertinentes`), `utils/series.ts`
  (`totauxDuMois`, alimente le score de santé ET la série "Budget
  respecté"), `utils/trophees.ts` (`moisMaitrise` — filtre appliqué
  seulement à la liste passée à `.every(...)`, JAMAIS à celle utilisée pour
  le garde-fou `enveloppesSansEntree.length > 0`, pour ne pas transformer
  "aucune catégorie" en faux "mois maîtrisé" si toutes les catégories du
  compte sont, par coïncidence, à budget=0€).
- **Simulateur** : non modifié — vérifié qu'il n'applique déjà AUCUN filtre
  de ce type (les catégories à budget=0€ y sont déjà incluses par défaut,
  conforme tel quel à la décision "les inclure quand même").
- **Division par zéro** : recherche des calculs de ratio/pourcentage
  n'ayant pas déjà de garde — aucune division par zéro non protégée trouvée
  dans les fichiers concernés au moment de cette revue (les usages existants
  de `depense/budget` sont soit déjà gardés par un `budget > 0` explicite,
  soit hors du périmètre de ces 3 fichiers). Point de vigilance à
  revérifier si un nouveau calcul de ratio est ajouté plus tard dans
  `utils/score.ts`/`utils/series.ts`/`utils/trophees.ts`. tsc/lint vérifiés
  propres.

**Revue code-reviewer (2026-09-18)** : APPROUVÉ AVEC RÉSERVES sur la
première passe du lot ci-dessus, 3 points réels corrigés avant commit —
- 🔴 **Bug logique confirmé dans `utils/trophees.ts::moisMaitrise`** :
  le garde `.length > 0` portait sur la liste NON filtrée
  (`enveloppesSansEntree`) alors que `.every(...)` s'appliquait à la liste
  filtrée (`budget > 0`) — `[].every(...)` renvoie `true` par vacuité en
  JS, donc un compte dont TOUTES les catégories étaient à budget=0€
  obtenait quand même `moisMaitrise=true` (faux positif), exactement le
  bug que le commentaire d'origine prétendait déjà empêcher. Corrigé :
  garde déplacé sur la liste filtrée elle-même.
- 🔴 **Gap réel dans le contrôle de doublon de nom** : `renommerCategoriePartout`
  (contrôle ajouté côté §1 ci-dessus) est appelé en fire-and-forget
  (jamais attendu) par `sauvegarderEnveloppe` (`app/(tabs)/index.tsx`,
  modale principale "Modifier une catégorie") — EN PARALLÈLE de
  `modifierEnveloppes`/`appliquerEnveloppes`, qui écrit la ligne éditée
  directement sur Supabase SANS aucun contrôle de doublon. Un renommage
  vers un nom déjà pris pouvait donc échouer côté `renommerCategoriePartout`
  (aucun événement/snapshot mis à jour) tout en réussissant quand même côté
  `modifierEnveloppes` (la ligne `enveloppes` elle-même renommée en
  doublon) — réintroduisant P021/P027/P033 par ce chemin précis, le
  parcours de renommage le plus emprunté de l'app. Corrigé : même contrôle
  de doublon ajouté en amont, synchrone, dans `sauvegarderEnveloppe`
  elle-même (bloque avant tout appel si collision).
- ⚠️ **Faux positif possible sur la dissolution d'espace** (item 3
  ci-dessus) : `getMembreEspace()` retournait `null` aussi bien pour "pas
  d'espace" que pour une erreur Supabase/réseau transitoire — un simple
  hoquet réseau pendant qu'un espace est réellement actif aurait donc pu
  déclencher à tort "L'espace partagé a été dissous" + bascule forcée en
  vue personnelle. Corrigé : nouveau statut `{statut:"erreur"}` distinct
  dans `EtatEspacePartage` (`utils/espacePartage.ts`), explicitement exclu
  de la logique de détection de dissolution dans `EspacePartageContext.tsx`
  (`rafraichirEspace` et l'effet de montage) — sur erreur, on ne touche à
  rien, on réessaiera au prochain appel.
- Note secondaire non bloquante sur `utils/conseils.ts::depenseCumuleeAuJour`
  (edge case transactions orphelines datées dans un mois déjà archivé) —
  documentée comme nouveau finding **P053**, non corrigée (impact limité à
  un message positif d'insight).
tsc/lint revérifiés propres après ces 3 corrections (10 lignes / 49
problèmes, 39 erreurs / 10 warnings — sous la baseline).

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

### 2026-09-14 — Widgets iOS (expo-widgets/@expo/ui) : réactivation reportée après le crash natif du 2026-09-01

- **Contexte** : demande de réactiver les widgets iOS (retirés le
  2026-09-01, cf. RÈGLE dans utils/widgetsSync.ts) dans le cadre de la
  préparation du build V1 production. Investigation : le commentaire RÈGLE
  du fichier révèle que le crash natif silencieux au démarrage (celui qui
  avait aussi motivé le retrait d'AdMob le même jour, cf. RÈGLE dans
  utils/adMobModule.ts) **persistait après la désactivation d'AdMob
  seule** — expo-widgets/@expo/ui (l'autre module à code natif réel du
  projet) a été retiré ENSUITE, comme "prochaine piste". Rien dans
  l'historique ne confirme que retirer les widgets a réellement résolu le
  crash — les deux modules ont simplement été retirés par précaution, sans
  qu'aucun des deux soit formellement innocenté ni confirmé coupable.
  AdMob a été réintégré le 2026-09-13 (ID de test) puis basculé sur les
  vrais ID de production le 2026-09-14, avec un build "preview" en cours
  de validation au moment de cette demande (voir commit "AdMob réintégré"
  et celui du build V1 production) — encore aucun résultat de validation
  disponible.
- **Options envisagées** : (a) attendre le résultat du build preview AdMob
  avant de toucher aux widgets, puis les réactiver séparément avec leur
  propre build preview dédié — isole clairement lequel des deux modules
  (s'il y en a un) cause un éventuel crash ; (b) réactiver maintenant,
  cumulé avec AdMob dans le même build en cours de validation.
- **Réponse de Maëlys (2026-09-14)** : (a) — attendre la validation AdMob
  d'abord. Widgets NON réactivés dans cette session, packages
  expo-widgets/@expo/ui non réinstallés, widgets/PlanningWidget.tsx et
  widgets/AjoutRapideWidget.tsx non restaurés.
- **À reconsidérer si** : le build preview AdMob (cf. commits du
  2026-09-14) est confirmé stable sur device réel par Maëlys — à ce
  moment, réactiver les widgets dans un commit séparé, suivi d'un nouveau
  build preview dédié aux widgets seuls (pas cumulé avec d'autres
  changements natifs), avant tout profil "production".

### 2026-09-14 — ESPACE_PARTAGE_ACTIF reconfirmé à `false` pour la production

- **Contexte** : redemandé à `true` pour le build V1 production, un tour
  après avoir été explicitement reverté à `false` (cf. commit "V1
  production — TESTFLIGHT_MODE=false, ESPACE_PARTAGE_ACTIF=false, vrais ID
  AdMob") suite au conflit avec sa propre RÈGLE et aux 2 points de sécurité
  toujours ouverts (RPC creer_espace_partage() non confirmé côté dashboard
  Supabase, absence de log audit_operations — cf. entrée du 2026-09-13
  ci-dessus dans ce même journal, section audit sécurité §5.1).
- **Réponse de Maëlys (2026-09-14)** : laisser à `false`. Les 2 points
  n'ont pas changé depuis la veille.
- **À reconsidérer si** : les 2 points sont traités (RPC vérifié côté
  dashboard, log audit_operations ajouté).

### 2026-09-14 — Widgets Home Screen : visibilité potentielle sur écran verrouillé (accès "Aujourd'hui")

- **Contexte** : revue sécurité de la réactivation des widgets (ci-dessus)
  — PlanningWidget/AjoutRapideWidget affichent des données financières
  réelles (montants, noms de dépenses/événements). Les familles déclarées
  dans app.json sont restreintes à systemSmall/Medium/Large (Home Screen),
  jamais accessoryCircular/Rectangular/Inline (familles StandBy/écran
  verrouillé) — rien dans le code ne force un affichage verrouillé. Mais
  si l'utilisateur a activé Réglages > Face ID et code > "Autoriser
  l'accès verrouillé" > Aujourd'hui, un widget Home Screen reste visible
  sans déverrouiller l'appareil (comportement iOS standard, comparable à
  n'importe quel widget d'app bancaire/finance).
- **Évaluation** : pas un défaut de code — réglage côté utilisateur/OS,
  cohérent avec l'intention même de la fonctionnalité ("ajout rapide"/
  "planning" en un coup d'œil). Risque déjà implicite à ce type de widget,
  pas spécifique à Vista.
- **Statut** : signalé pour information/confirmation produit, non traité
  (pas d'action code attendue). Aucune décision prise à ce stade.
- **À reconsidérer si** : Maëlys souhaite explicitement masquer les
  montants sur le widget (ex: mode "pudeur"/blur optionnel) — nouvelle
  fonctionnalité, pas une correction.

### 2026-09-16 — Planning : tap en dehors de la modale d'événement enregistre silencieusement (P028)

- **Contexte** : audit écran Planning — `fermerModalCreationAvecSauvegarde`
  (tap sur le fond de la modale de création/édition d'événement) appelle
  `validerInfos()` (crée/enregistre si `nomEvent` est rempli) avant de
  fermer, alors que le bouton "X" ferme sans jamais enregistrer. Même famille
  de choix sur Budget (P036, modale d'ajout de dépense) — le pattern
  `fermerModal*AvecSauvegarde` est appliqué de façon cohérente dans tout le
  projet (`index.tsx` ×4, `planning.tsx`, `budget.tsx`, `profil.tsx`).
- **Question** : ce comportement (tap en dehors = tentative de sauvegarde
  silencieuse si le formulaire est valide) est-il un choix produit assumé
  ("brouillon toujours sauvegardé"), ou un oubli à corriger vers "tap en
  dehors = toujours annuler", comme le "X" ?
- **Évaluation** : appliqué de façon si systématique dans le code qu'il
  ressemble à un choix délibéré plutôt qu'à un bug isolé — mais rien ne
  documente cette intention, et le geste "tap à côté pour annuler" est un
  réflexe UI très courant, potentiellement surprenant ici pour une saisie
  financière (Budget) ou un événement (Planning).
- **Statut** : **RÉPONDUE (2026-09-18)** — décision produit reçue, voir
  l'entrée "2026-09-18 — Réponses reçues sur 6 décisions produit" plus haut
  dans cette section : "tap en dehors = sauvegarde" est bien le choix
  produit assumé, appliqué de façon cohérente. P036 (Budget) avait un
  écart réel (retour Android) corrigé le même jour ; P028 (Planning)
  s'avère déjà conforme tel quel, aucun changement de code nécessaire.

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

*(lecture de code/traçage complet le 2026-09-16, pas encore rejoué sur compte
réel — vérifications statiques à confirmer une fois les comptes de test
disponibles.)*

**Bugs trouvés** : P032 (parsing UTC/local, 3 occurrences supplémentaires,
🟠), P033 (doublon de nom catégorie à la création, extension P021, 🟠), P034
(écriture non atomique transaction/`depense` sur interruption, 🟠), P035
(aucun état vide "Tes catégories", 🟡), P036 (incohérence tap-outside/retour
Android, 🟡), P037/P038/P039 (🔵, formulaire silencieux / nom long / perf non
mémoïsée). Détail complet en §2.

**Points vérifiés SANS bug trouvé (justification incluse)** :
- **P001 tient toujours** : `supprimerEnveloppe` nettoie bien `modeles_depenses`
  (filtre local + `DELETE` scopé `enveloppe_id`/`user_id`), reconfirmé.
- **Double-tap** : les 3 actions d'écriture principales (création catégorie,
  création modèle, ajout dépense) sont toutes gardées par un état `EnCours` +
  bouton `disabled` correctement câblé.
- **Suppression concurrente transaction/modèle** : idempotente par
  construction (recherche en mémoire avant d'agir, no-op si déjà retiré).
- **P006/P007 (course archivage/échéances)** : Budget n'a aucun chemin
  d'écriture propre sur ce sujet, écran purement passif en lecture — hérite
  de l'exposition déjà documentée, avec manifestation UI désormais identifiée
  (cartes "payée" dupliquées si P007 se produit).
- **Vision partagée** : `renderCarteCategoriePartagee` correctement gardée
  par `affichagePartage`, n'écrit que sur `item.moiIds`, jamais les ids du
  partenaire — pas de risque d'écriture cross-compte (hormis P033, homonymie).
  Masqué en prod (`ESPACE_PARTAGE_ACTIF=false`).
- **Divisions par zéro/NaN** : grep exhaustif de toutes les divisions du
  fichier — toutes protégées sauf la ligne déjà cataloguée sous P011.

### 3.3 Planning (`app/(tabs)/planning.tsx`)

*(lecture de code/traçage complet le 2026-09-16, pas encore rejoué sur compte
réel — vérifications statiques à confirmer une fois les comptes de test
disponibles.)*

**Bugs trouvés** : P023 (parsing UTC/local du calendrier, écrit en base, 🔴),
P024 (renommage de catégorie casse `categorieLiee`, argent prévu perdu, 🔴),
P025 (fusion auto planning partagé sans confirmation, 🟠), P026 (dérive de
récurrence 29/30/31 et 29 février, 🟠), P027 (catégories homonymes → échéance
masquée, extension P021, 🟠), P028 (tap hors modale = sauvegarde silencieuse,
🟠 — question produit, voir §2.2), P029/P030/P031 (🟡, double-tap édition,
notification push manquante, switch inopérant côté partenaire). Détail
complet en §2.

**Points vérifiés SANS bug trouvé (justification incluse)** :
- **Cohérence stricte Jour/Semaine/Mois** : les 3 vues consomment le MÊME
  tableau `tousLesEvenementsValides`, recalculé une fois par rendu — pas de
  state séparé par vue, donc pas de duplication possible en changeant de vue.
- **Suppression de catégorie → détachement `categorieLiee`** : reconfirmé
  sain (contrairement au RENOMMAGE, cf. P024).
- **Fermeture de l'app pendant la CRÉATION d'un événement** : l'état local
  n'est mis à jour qu'après confirmation de l'insert Supabase — jamais de
  duplication ni de fantôme possible.
- **RPC `fusionner_evenements` face à une vraie course entre 2 comptes** :
  revalidation de propriété garantit qu'un seul appel concurrent aboutit —
  vraie protection serveur atomique, pas un simple filtre client.
- **Minuit exact, 100+ événements le même jour** : gérés correctement (vue
  Mois plafonne à 3+badge, zone "toute la journée" wrap) — dégradation
  visuelle possible sur la grille horaire à volume extrême, pas un bug de
  données.
- **Fenêtre de récurrence (-2/+3 mois)** : recalculée depuis la navigation
  courante, jamais figée sur "aujourd'hui" au montage.

### 3.4 Stats / Ton bilan (`app/(tabs)/analytics.tsx`)

*(lecture de code/traçage complet le 2026-09-16, pas encore rejoué sur compte
réel — vérifications statiques à confirmer une fois les comptes de test
disponibles.)*

**Points vérifiés SANS bug trouvé (tracés à la main, justification incluse)** :
- **Score/Bilan** (`utils/score.ts`) : rejoué à la main (Loyer 750/750,
  Alimentation 400/265, 1 objectif 400/1000, 15j actifs/90, épargne
  [150,180,200]) → score=54 "À surveiller", détail par critère cohérent avec
  chaque sous-score. La différence apparente entre `calculerScoreSante`
  (exclut le mois courant) et `calculerScoreHistorique` (inclut le mois
  archivé) n'est PAS une incohérence — c'est la même règle "3 derniers mois
  COMPLETS" appliquée aux deux cas.
- **GraphiqueFlux — conformité CLAUDE.md** : `ESPACEMENT_MIN=14`,
  `totalReference` partagé, police 11px uniforme, nom jamais tronqué —
  conformes. Voir P022 pour la nuance trouvée sur le MONTANT (pas le nom).
- **Comparaison de périodes** (`utils/tendancesPeriode.ts`) : premier mois
  d'utilisation (aucun mois précédent) correctement géré, aucune comparaison
  contre du padding à zéro ; tous les pourcentages protégés contre une
  moyenne nulle/négative.
- **Sélecteur de période 1/3/6/12 mois** : `getDepenseMois`/`getBudgetMois`/
  etc. sont des lookups purs par `(mois,annee)` — un mois inclus dans "3 mois"
  donne exactement le même total que ce même mois affiché seul, vérifié par
  lecture du code (pas de mutation d'état partagée entre appels).
- **Déblocage pub / `useDeblocagePub`** : `onDeverrouille()` n'est appelé QUE
  sur `EARNED_REWARD`, jamais sur `CLOSED` seul — aucun moyen trouvé de
  débloquer sans avoir réellement complété la pub (early-close, backgrounding,
  perte réseau tous correctement bloqués côté callback). Voir toutefois P018
  (audit dédié pubs) pour le vrai trou trouvé : le FALLBACK d'échec, pas le
  callback de succès.
- **Modale "Ton bilan"** : hauteur `* 0.88` conforme, aucune autre occurrence
  qui la modifierait.
- **Cas limites Stats** : mois sans transaction, transactions à 0€, montants
  très élevés — tous protégés/filtrés correctement (hors P022, la troncature
  visuelle du montant).

**Bugs trouvés** : voir P021 (catégories homonymes mal classées dans
GraphiqueFlux, 🟠 MAJEUR) et P022 (troncature du montant, 🟡 MINEUR) en §2.
Voir aussi P018/P019/P020 (audit dédié pubs récompensées, §2) — trouvés en
auditant les 3 emplacements de pub dont 2 sont sur cet écran (période Stats,
"Ton bilan").

**Point de vigilance perf, non mesuré** : `classificationsFlux`/
`transactionsGroupeesParNomFlux` itèrent l'intégralité des transactions à
chaque rendu, par choix de design (jamais mémoïsées, pour réagir
immédiatement à tout changement) — à profiler sur un compte à 10 000+
transactions une fois disponible, pas supposé cassé à tort.

**Reste à faire sur cet écran** : rejouer en conditions réelles (comptes de
test), audit UX (questions CLAUDE.md), vue partagée (masquée en prod tant que
`ESPACE_PARTAGE_ACTIF=false`).

---

## 4. Vision partagée

**Fonctionnel (parcours utilisateur, doublons, test à 2 comptes réels)** : pas
commencé — dépend des comptes 9/10 créés en section 1.

**Isolation/sécurité (RLS, IDOR)** : audit statique complet réalisé le 2026-09-16
(lecture des 50 migrations + `EspacePartageContext.tsx` + `utils/espacePartage.ts` +
les 2 Edge Functions à `service_role`) — **VÉRIFIÉ (lecture de code seule)**, pas
encore testé live avec 2 vrais comptes distincts (manque toujours les comptes 9/10).

**Verdict** : **aucune faille IDOR exploitable trouvée.** Le projet applique de
façon cohérente sur 46 migrations la doctrine "RLS est la seule barrière réelle"
(jamais un filtre frontend seul) :

- **RLS, table par table (état final)** : `enveloppes`/`transactions`/
  `snapshots_mois`/`snapshot_enveloppes` — SELECT own OR `partage_un_espace_avec(user_id)`,
  écriture toujours own uniquement. `evenements` — SELECT own OR (lié ET
  (`commun` OU masquage désactivé)), UPDATE/DELETE cross-compte strictement
  limité à `visibilite='commun'`, INSERT toujours own. `profils` — **own
  uniquement, sans aucune exception**, jamais élargi ; chaque champ cross-compte
  nécessaire (prénom, couleur, épargne du mois, push_token) passe par une RPC
  étroite dédiée plutôt que d'élargir la policy. `espaces_partages`/`membres_espace` —
  lecture via `est_membre_espace()`, INSERT fermé (passe uniquement par RPC),
  UPDATE/DELETE réservés au propriétaire/à soi-même. `remboursements_espace` —
  append-only, INSERT vérifie `rembourse_par = auth.uid()` (impossible d'insérer
  "au nom de" l'autre membre). `objectifs`/`snapshot_objectifs` — restent 100%
  privés, jamais partagés (confirmé, aucune migration ne les élargit).
  **Point notable assumé, pas une faille** : `enveloppes`/`transactions` ont un
  accès LECTURE complet entre membres liés (pas de filtre `partage`/`attribue_a`)
  — décision produit documentée explicitement dans la migration
  (`20260831160000_espace_partage_acces_complet.sql`), à faire reconfirmer côté
  produit si ce n'est plus le comportement voulu, mais pas un bug d'isolation
  entre comptes NON liés.
- **Fonctions `security definer` (10 au total)** : toutes dérivent l'identité de
  l'appelant de `auth.uid()` en interne, AUCUNE ne fait confiance à un
  `user_id`/`espace_id` fourni en paramètre pour établir l'identité de
  l'appelant — vérifié individuellement pour les 10 (`est_membre_espace`,
  `partage_un_espace_avec`, `creer_espace_partage`, `rejoindre_espace_par_code`,
  `quitter_espace_partage`, `fusionner_evenements`, `modifier_mode_balance_espace`,
  `epargne_mois_partenaire`, `couleur_espace_partage_partenaire`,
  `push_token_partenaire`). `desactiver_expiration_espace` (seule à avoir eu un
  gap historique, cf. §5.1) confirmée toujours corrigée, pas de régression.
- **Rupture de lien (`quitter_espace_partage`/expiration)** : tout accès
  cross-compte (`partage_un_espace_avec`, `est_membre_espace`) interroge
  `membres_espace` EN DIRECT à chaque évaluation de policy RLS, jamais de cache
  ni de matérialisation — dès que la ligne `membres_espace` de l'ex-partenaire
  est supprimée, l'accès est coupé immédiatement pour toute requête suivante.
  Aucune fenêtre où les anciennes données restent visibles.
- **Frontend (`EspacePartageContext.tsx`, `utils/espacePartage.ts`)** : ne
  contient AUCUNE décision d'autorisation — le pattern "je passe l'id, RLS
  tranche" est appliqué uniformément ; un `partenaireId` altéré par un attaquant
  reçoit un tableau vide, jamais les données d'un tiers non lié.
- **Régression sur les 3 failles déjà corrigées par le passé** (récursion RLS
  `membres_espace`, policies `espaces_partages_select_auth`/`membres_espace_insert_own`
  trop permissives, `desactiver_expiration_espace` sans revalidation) : AUCUNE —
  vérifié qu'aucune migration ultérieure (par date de fichier) ne recrée une
  policy/fonction vulnérable d'origine.

**Points ouverts, non bloquants** :
- 🟢 LOW — seule `push_token_partenaire` a un `revoke/grant` explicite
  restreignant l'exécution à `authenticated` ; les 9 autres fonctions
  `security definer` gardent le GRANT EXECUTE PUBLIC implicite de Postgres —
  sans conséquence pratique vérifiée (chacune gère `auth.uid() is null`), mais
  recommandé d'harmoniser pour cohérence défensive.
- 🟢 LOW — `espaces_partages`/`remboursements_espace` non nettoyées par
  `supprimerDonneesUtilisateur` lors d'une suppression de compte (hors flux
  `quitter_espace_partage`) ; `remboursements_espace.rembourse_par` sans
  `ON DELETE CASCADE` pourrait bloquer `auth.admin.deleteUser` par violation de
  contrainte FK si des lignes existent. Pas un risque d'accès cross-compte (la
  ligne `membres_espace` cascade bien, coupant l'accès), mais un risque
  fonctionnel/hygiène de données à vérifier.

**Reste à faire pour clore cette section** : test fonctionnel réel à 2 comptes
(invite/accept/visibilité mutuelle/suppression/isolation stricte), doublons
d'événements en Planning partagé, et confirmation produit sur le point "accès
lecture complet enveloppes/transactions" — tout ceci nécessite les comptes de
test 9/10 (section 1).

---

## 5. Audit transverse

- [ ] Persistance (reset/seed/migrations, cf. CLAUDE.md) — voir addendum 2026-09-16 dans 5.1
- [x] Doublons (catégories, transactions, événements) — voir P006/P007/P021/P027/P033 (§2) ; cause racine commune identifiée (aucun contrôle d'unicité de nom de catégorie), pas encore corrigée
- [x] Sécurité (RLS, suppressions avec filtre `user_id`) — voir 5.1 ci-dessous
- [x] Isolation vision partagée (RLS/IDOR) — voir §4 ci-dessus (2026-09-16)
- [x] Calculs financiers — voir P004, P010-P014 (§2, 2026-09-16)
- [x] Architecture statique (races, listeners, cycles, fuseaux horaires) — voir P004-P009, P015-P017 (§2, 2026-09-16)
- [x] Pubs récompensées (early-close, backgrounding, perte réseau, double-tap) — voir P018-P020 (§2, 2026-09-16) ; scénario "arrière-plan pendant la pub" non vérifiable statiquement (dépend du SDK natif), à tester sur device
- [x] Écrans Budget/Planning — voir P023-P039 (§2, 2026-09-16) et §3.2/§3.3
- [x] Ergonomie (questions UX de CLAUDE.md) — voir P041-P049 (§2, 2026-09-17) ; lecture de code écran par écran (Aperçu/Budget/Planning/Stats/Profil/Onboarding), pas encore rejoué sur device

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

#### F. Suivi 2026-09-16 — persistance et régressions depuis le 09-12

Audit de suivi ciblé : (a) l'inventaire des opérations destructives ci-dessus a-t-il
régressé depuis le 09-12 ? (b) que couvre le code ajouté depuis (notifications
push, widgets) ? (c) un angle non couvert le 09-12 — interruption de
`archiverMoisActuelInterne` APRÈS succès du snapshot mais AVANT la fin des
écritures de remise à zéro.

- **(a) Aucune régression** : inventaire du tableau A ci-dessus identique ligne
  par ligne dans le code actuel (mêmes filtres `user_id`, mêmes logs
  `audit_operations`, même exception RLS-only volontaire sur `evenements`,
  désormais aussi documentée pour `supprimerEvenementPartenaire`,
  `utils/espacePartage.ts:925`). La seule nouvelle migration depuis le 09-12
  (`20260913120000_planning_partage_push_notifications.sql`) reste additive
  (`ADD COLUMN IF NOT EXISTS`, RPC étroite avec `REVOKE`/`GRANT` explicite).
  `ESPACE_PARTAGE_ACTIF = false` confirmé actuel.
- **(b) Code neuf conforme** : `app/notifications.ts` (push) ne lit jamais
  `profils.push_token` du partenaire directement — passe systématiquement par
  la RPC `push_token_partenaire` (revalide `partage_un_espace_avec()` côté
  serveur), notification en fire-and-forget sans impact sur l'intégrité des
  données. `utils/widgetsSync.ts` : aucune écriture Supabase (règle du fichier
  respectée), confirmé par grep — rien à appliquer de la checklist
  filtre/confirmation/log, il n'y a pas d'écriture serveur du tout.
- **(c) Nouveau 🔴 CRITICAL trouvé, non couvert le 09-12** — voir **P008** (§2) :
  la fenêtre d'interruption après validation du snapshot laisse le curseur
  `dernier_mois_archive` figé indéfiniment, sans retry possible, sans erreur
  visible. C'est un vrai trou dans la robustesse d'archivage documentée comme
  "modèle" en (E) ci-dessus — le modèle est solide pour le cas "snapshot
  invalide", pas pour le cas "snapshot valide mais suite interrompue".

**Points déjà documentés en 🟡 en (C)/(non corrigé) ci-dessus, toujours ouverts,
sans changement de statut** : `delete-account` sans export avant suppression ;
confirmation UI non tracée avec certitude pour `supprimerObjectif`/événement
personnel ; RPC espace partagé sans log `audit_operations` (sans risque tant que
`ESPACE_PARTAGE_ACTIF=false`) ; pas de réconciliation auto si le DELETE
`transactions`/`modeles_depenses` lié à `supprimerEnveloppe` échoue après retrait
local.

---

## 6. Recommandation finale

**Pas encore atteignable.** Section à remplir uniquement une fois les points 1 à 5
couverts, selon le format défini dans CLAUDE.md ("Format du rapport final attendu").

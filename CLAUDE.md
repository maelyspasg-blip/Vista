# Vista — Contexte projet pour Claude Code

## Identité du projet
App mobile de gestion de budget personnel et partagé.
- Stack : React Native / Expo SDK 56, TypeScript, Supabase (Frankfurt EU)
- Bundle ID : `com.maelyspasgvista.vista`
- EAS project : `@maelyspasg-vista/vista`
- GitHub : https://github.com/maelyspasg-blip/Vista.git
- Co-développeurs : Maëlys Pasgrimaud (admin) + Louis Vedel (admin)

## Baseline qualité — ne jamais dégrader
- `npx tsc --noEmit` → 10 lignes maximum
- `npx expo lint` → 50-51 problèmes maximum (39 erreurs, 11 warnings)
- Vérifier après CHAQUE modification

## Stack technique
- React Native / Expo SDK 56
- TypeScript strict
- Supabase : URL `https://pbsaufvjriudauddimjn.supabase.co` (Frankfurt EU)
- Expo Router (navigation par fichiers)
- react-native-svg (graphiques)
- AsyncStorage (cache local)
- EAS Build (builds de production)

## Architecture des données
- Source de vérité : Supabase
- État en mémoire : `app/store.ts` (variable de module `let etat`)
- Cache AsyncStorage : fraîcheur 24h sur `depense`
- RLS activé sur toutes les tables — toujours utiliser des fonctions `security definer` pour les requêtes cross-utilisateur

## Tables principales Supabase
- `enveloppes` : catégories budget (type: Entrée/Fixe/Variable)
- `transactions` : dépenses détaillées
- `evenements` : événements Planning
- `objectifs` : objectifs d'épargne
- `snapshots_mois` + `snapshot_enveloppes` : archives mensuelles
- `profils` : préférences utilisateur
- `espaces_partages` + `membres_espace` : mode partagé
- `audit_operations` : log permanent des opérations destructives

## Règles critiques — NE JAMAIS ENFREINDRE

### Données
- `depense` sur une enveloppe ne peut être modifié que par :
  1. `ajouterTransaction`/`modifierTransaction`/`supprimerTransaction`
  2. `archiverMoisActuelInterne` (remise à zéro en fin de mois)
  3. Action explicite de l'utilisateur
  4. Jamais par un rechargement, reconnexion ou hot-reload
- `archiverMoisActuelInterne` doit TOUJOURS créer et valider le snapshot AVANT toute remise à zéro
- Jamais écraser un snapshot existant avec des données moins complètes

### Sécurité
- Toute suppression Supabase doit avoir un filtre `user_id` explicite
- `appliquerEnveloppes()` ne doit jamais recevoir un tableau vide accidentellement
- 13 fichiers utilitaires marqués "aucune écriture Supabase autorisée" — ne jamais y ajouter d'appels Supabase en écriture :
  - `utils/conseils.ts`, `utils/tendancesPeriode.ts`, `utils/bilanVista.ts`
  - `utils/score.ts`, `utils/trophees.ts`, `utils/situationsSession.ts`
  - `utils/premium.ts`, `GraphiqueFlux.tsx`, `app/InsightVerrouille.tsx`
  - `app/PremiumVerrou.tsx`, `utils/widgetsSync.ts`

### RLS
- Ne jamais créer de policy SELECT qui se référence elle-même (récursion infinie)
- Toujours utiliser des fonctions `security definer` pour les requêtes cross-utilisateur
- Tester : `partage_un_espace_avec()`, `est_membre_espace()`, `fusionner_evenements()`

### GraphiqueFlux
- `ESPACEMENT_MIN = 14` — validé sur device physique
- `totalReference = sum(entrées)` — partagé entre les 3 colonnes
- Hauteur max : `Dimensions.get('window').height * 0.45`
- Police uniforme 11px, word wrap si trop long, jamais de troncature '...'

### Modale Ton bilan
- Hauteur : `Dimensions.get('window').height * 0.88`
- Ne jamais modifier lors de corrections sur d'autres fonctionnalités

## Flags de feature
```typescript
// utils/premium.ts
TESTFLIGHT_MODE = true        // bêta : bypass premium
ESPACE_PARTAGE_ACTIF = false  // désactivé en bêta, activer pour V1
```

## Palette de couleurs Vista
- Navy : `#2D3A4A` (mode clair)
- Night : `#0D1B2A` (mode sombre)
- Teal : `#1D9E75` (accent principal)
- Bleu : `#60a5fa` (Moi en vue partagée)
- Violet : `#c084fc` (Partenaire en vue partagée)

## Navigation
- Aperçu → Budget → Planning → Stats
- Expo Router, scheme `vista://`
- Deep link ajout rapide : `vista://ajout-rapide`

## Compte invité
- Seed via `setup_guest_account()` dans Supabase
- `montant_applique = true` sur tous les événements financiers du seed
- Mode lecture seule — pop-up "Créer mon compte" sur toute action d'écriture

## Comptes de développement
- Maëlys (admin) : `c80c78f3-fd9e-4d85-a4e5-c49bf0a624fa`
- Louis (admin) : `0cc21b63-51e6-454e-b569-4a98f09f04d2`

## Migrations Supabase
- Toujours créer un fichier `supabase/migrations/[timestamp]_nom.sql`
- Toujours fournir le contenu SQL complet pour exécution manuelle dans le dashboard
- L'accès CLI Supabase n'est pas disponible depuis cet environnement

## Processus de développement
1. Lire les RÈGLE À NE JAMAIS CASSER en tête des fichiers concernés
2. Modifier le code
3. Vérifier `tsc` et `lint`
4. Fournir le SQL des migrations si nécessaire
5. Ne jamais commiter sans baseline propre

## Ce qui est en cours
- Refonte Timeline Planning (étapes A/B/C)
- Espace partagé V1 (désactivé en bêta)
- AdMob à réintégrer après stabilisation bêta
- RevenueCat à intégrer pour le Premium réel

---

# CONTEXTE MAÎTRE — VISTA V1 / PHASE DE TEST, AUDIT ET FINALISATION

## Mission

Terminer, tester, challenger, corriger et valider l'ensemble de la V1 existante afin de déterminer si elle est réellement prête à être utilisée par des utilisateurs humains.

Objectif final : une application fonctionnelle, cohérente, fiable, ergonomique, compréhensible, stable, sécurisée, sans bugs connus, sans incohérences de calcul, sans doublons inutiles, sans comportements anormaux, suffisamment robuste face à des utilisations différentes.

À la fin du processus, produire une conclusion : **V1 VALIDÉE** ou **V1 NON VALIDÉE — problèmes restant à corriger**.

Ne jamais considérer la V1 comme validée simplement parce que les fonctionnalités principales semblent fonctionner.

---

## Principe fondamental

Tester comme si de vrais utilisateurs allaient utiliser l'application demain sans aucune connaissance de son fonctionnement interne.

Tester :
- les parcours normaux
- les parcours inhabituels
- les erreurs humaines
- les mauvaises manipulations
- les données inhabituelles
- les volumes importants
- les changements de comportement
- les modifications successives
- les cas limites

Ne pas chercher uniquement à vérifier que "ça fonctionne". Chercher également : "Est-ce que c'est vraiment la meilleure manière de fonctionner ?"

---

## Comptes de test à créer (minimum 10)

| Compte | Profil | Comportement |
|--------|--------|--------------|
| 1 | Utilisateur simple | Peu de catégories, peu de dépenses |
| 2 | Utilisateur très actif | Nombreuses dépenses quotidiennes |
| 3 | Beaucoup de catégories | Noms variés, montants très différents |
| 4 | Dépenses récurrentes | Loyer, abonnements, transports |
| 5 | Revenus variables | Plusieurs entrées d'argent différentes |
| 6 | Dépenses très élevées | Gros montants |
| 7 | Petites dépenses répétées | Micro-transactions fréquentes |
| 8 | Utilisateur Planning | Nombreux événements |
| 9 | Utilisateur partagé | Vision partagée avec deux personnes |
| 10 | Utilisateur chaotique | Comportement irrégulier volontaire |

---

## Points critiques à surveiller

### Calculs
Ne jamais considérer qu'un graphique ou un total est correct simplement parce que l'interface l'affiche. Recalculer indépendamment et comparer :
**Données sources → calcul → affichage**

Vérifier : total entrées, total dépenses, soldes, répartition, pourcentages, graphiques, statistiques, évolution temporelle, données partagées, contributions, score/bilan.

### Catégories
Ne doit jamais apparaître : catégorie fantôme, catégorie dupliquée, dépense qui change de catégorie sans raison, perte de données, calcul incorrect après modification.

### Planning
Ne doit jamais apparaître : rendez-vous fantôme, rendez-vous dupliqué, événement créé deux fois, événement qui réapparaît après suppression, incohérence entre les vues.

### Persistance
Une mise à jour, un build, un changement d'interface ou une modification de code ne doit jamais supprimer ou réinitialiser les données utilisateurs.

Surveiller particulièrement : reset, seed, mock data, initialize, delete, clear, insert, upsert, migrations, logique de synchronisation.

### Doublons
Rechercher activement et provoquer volontairement des situations susceptibles de créer des doublons.

---

## Règle de décision — autonomie vs validation

### Corriger directement
- Bugs évidents
- Erreurs d'affichage
- Incohérences UX mineures
- Textes incorrects
- Éléments mal alignés
- Comportements clairement incorrects
- Répétitions inutiles évidentes
- Erreurs de calcul dont la correction est certaine

### Demander validation à l'administrateur
- Modification importante du fonctionnement
- Suppression d'une fonctionnalité
- Modification du modèle de données
- Modification importante de l'architecture
- Modification du système de partage
- Changement du comportement métier
- Problème de sécurité critique
- Doute sur l'intention produit

**En cas de doute : ne décide pas seul. Remonte le problème.**

---

## Règles du loop autonome (session sans intervention, ajouté le 2026-09-07)

Un loop autonome (`/loop`, routine cloud planifiée) qui s'arrête pour
attendre une validation ne fait plus aucun progrès jusqu'au retour de
Maëlys — l'objectif ci-dessous prime sur la règle générale "en cas de
doute, remonte le problème" (qui suppose une réponse rapide, pas vraie ici) :
**ne jamais s'arrêter, toujours avancer sur autre chose.**

- **Doute sur une correction** → appliquer la solution la plus conservative
  (le moins de changements possible), documenter dans `AUDIT_V1.md` section
  "Décisions autonomes", continuer.
- **Bug 🔴 trouvé** → documenter dans `AUDIT_V1.md`, ne pas bloquer dessus,
  passer à autre chose.
- **tsc ou lint dépasse la baseline après une modification** → annuler cette
  modification précise, documenter, continuer sur autre chose.
- **Migration SQL nécessaire** → générer le SQL complet dans `AUDIT_V1.md`
  (ou un fichier `supabase/migrations/...`, cf. section dédiée), **ne
  jamais l'exécuter** — cohérent avec l'absence d'accès Supabase direct
  depuis cet environnement.
- **Doute sur une direction produit** (pas juste technique) → écrire la
  question dans `AUDIT_V1.md` section "Questions pour Maëlys", continuer
  sur autre chose — jamais attendre la réponse pour avancer.

---

## Système de classification des problèmes

🔴 **CRITIQUE** — Empêche l'utilisation, perte de données, problème de sécurité, calcul fondamental faux

🟠 **MAJEUR** — Fonction importante incorrecte ou UX suffisamment mauvaise pour empêcher une utilisation normale

🟡 **MINEUR** — Problème d'affichage, ergonomie ou comportement secondaire

🔵 **SUGGESTION** — Amélioration potentielle non nécessaire à la V1

Pour chaque problème documenter : description, reproduction, compte concerné, résultat attendu, résultat obtenu, gravité, correction proposée, statut.

---

## Processus obligatoire pour chaque problème

1. Reproduire — vérifier que le problème est réel
2. Identifier la cause — ne pas corriger uniquement le symptôme
3. Évaluer les conséquences — vérifier si le problème existe ailleurs
4. Corriger si autorisé
5. Retester
6. Tester les régressions
7. Documenter

**Ne jamais considérer un bug comme isolé trop rapidement. Chercher la cause racine.**

---

## Critères de validation V1

La V1 ne peut être validée que lorsque :
- Les parcours principaux fonctionnent
- Les comptes de test ont été suffisamment utilisés
- Les calculs ont été vérifiés
- Les catégories, dépenses, planning ont été testés
- Les deux visions ont été testées
- Les graphiques ont été vérifiés
- Les interactions entre fonctionnalités ont été vérifiées
- La persistance des données a été vérifiée
- Les doublons ont été recherchés
- Les problèmes de sécurité ont été examinés
- L'ergonomie a été challengée
- Les bugs critiques sont résolus
- Les bugs majeurs sont résolus ou explicitement acceptés
- Aucune anomalie importante connue ne reste sans décision
- Les modifications n'ont pas introduit de régression

---

## Questions UX à poser à chaque écran

- Est-ce que je comprends immédiatement ce que je dois faire ?
- Est-ce que l'information importante ressort ?
- Est-ce qu'il y a trop d'informations ?
- Est-ce que quelque chose est répétitif ?
- Est-ce que je dois faire trop de clics ?
- Est-ce qu'un utilisateur novice pourrait se tromper ?
- Est-ce que la hiérarchie visuelle est logique ?

---

## Philosophie

Ne pas chercher à terminer rapidement. La qualité prime sur la vitesse.

Se demander constamment :
- "Si cette application était utilisée par 1 000 personnes demain, qu'est-ce qui pourrait casser ?"
- "Si j'étais un utilisateur qui découvre Vista pour la première fois, qu'est-ce qui pourrait me frustrer ?"
- "Est-ce que ce résultat est réellement cohérent avec les données ou est-ce simplement ce que l'interface prétend afficher ?"

---

## Format du rapport final attendu

1. Résultat global : V1 VALIDÉE / V1 NON VALIDÉE
2. Tests effectués (comptes, scénarios, fonctionnalités)
3. Bugs trouvés et statut
4. Corrections réalisées
5. Problèmes remontés à l'administrateur
6. Audit UX
7. Audit données/calculs
8. Audit persistance/sécurité
9. Risques résiduels
10. Recommandation finale

**La V1 est terminée uniquement lorsque l'ensemble de l'application a été réellement utilisé, challengé, vérifié, corrigé et jugé suffisamment fiable et ergonomique pour être présenté à des utilisateurs réels.**

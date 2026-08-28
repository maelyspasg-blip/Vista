@AGENTS.md

# Vista — guide du projet

Vista est une app de finances personnelles en français (Expo Router, TypeScript strict), backée par Supabase. Ce document sert de point d'entrée : stack, structure des dossiers, commandes de vérification obligatoires, et conventions de code observées dans le repo.

## Stack technique

- **Expo SDK 56**, **React Native 0.85**, **React 19.2**, **TypeScript strict** (`tsconfig.json`, `strict: true`).
- **Routing** : `expo-router` (routing par fichiers, dossier `app/`), navigation par onglets via `@react-navigation/material-top-tabs`.
- **État applicatif** : pas de Redux/Zustand/Context externe — un store maison en pub-sub dans `app/store.ts` (`let etat`, un tableau d'écouteurs, `setEtat()` qui notifie tout le monde, exposé aux composants via le hook `useObjectifs()`).
- **Backend** : Supabase (Postgres + Auth + Storage + Edge Functions Deno). Client unique dans `supabaseClient.ts` (clé anon uniquement — jamais la service_role côté app). Row Level Security activée sur toutes les tables (`supabase/migrations/`).
- **Notifications** : `expo-notifications`, wrapper dans `app/notifications.ts`.
- **Widgets iOS natifs** : `expo-widgets` (bridge SwiftUI via `@expo/ui/swift-ui`), dossier `widgets/`.
- Pas de framework de test configuré (aucun script `test` dans `package.json`) — la vérification de non-régression repose sur `tsc` + `expo lint` (voir plus bas).

## Structure des dossiers

Le découpage n'est **pas** un `screens/components/hooks/services` classique — c'est plus près d'un monolithe applicatif par domaine :

- **`app/`** — écrans (routing par fichiers d'expo-router) **et** le cœur applicatif partagé, au même niveau :
  - `app/(tabs)/` : les 4 onglets principaux — `index.tsx` (Aperçu), `budget.tsx`, `planning.tsx`, `analytics.tsx` ("Ton bilan").
  - `app/onboarding/` : connexion, inscription, invité, préférences, essai expiré.
  - `app/store.ts` : **le store applicatif complet** (types, chargement/écriture Supabase, actions exposées), ~2800 lignes. Le fichier le plus long du repo est en réalité `app/(tabs)/analytics.tsx` (~6300 lignes, l'écran "Ton bilan" avec ses 4 sous-onglets).
  - Contextes et composants partagés directement à la racine de `app/` : `ThemeContext.tsx`, `AccessibiliteContext.tsx`, `GuestContext.tsx`, `PremiumContext.tsx`, `TutorielContext.tsx`/`TutorielOverlay.tsx`/`CibleTutoriel.tsx` (système de tutoriel in-app), `InfoBulle.tsx`, `SplashScreen.tsx`, `notifications.ts`, etc.
- **`components/`**, **`hooks/`**, **`constants/`** — essentiellement le squelette par défaut d'Expo, **non utilisé** par l'app réelle (`themed-text.tsx`, `themed-view.tsx`, `use-color-scheme.ts`, `use-theme-color.ts`, `constants/theme.ts`, `components/ui/` : zéro référence depuis `app/`). Seule exception réellement utilisée : `components/OnboardingEtape.tsx` (consommé par `app/onboarding/preferences.tsx`).
- **`utils/`** — logique métier partagée, pure ou quasi-pure : `score.ts`, `conseils.ts`, `trophees.ts`, `series.ts`, `evenements.ts` (expansion des récurrences), `widgetsSync.ts` (prépare les snapshots poussés aux widgets iOS), `exportExcel.ts`, `premium.ts`, etc.
- **`widgets/`** — widgets iOS (`PlanningWidget.tsx`, `AjoutRapideWidget.tsx`) : tournent dans une extension native séparée via `expo-widgets`, **aucun accès direct à Supabase** (les données leur sont poussées par `utils/widgetsSync.ts`), et leur corps de fonction est sérialisé par un plugin babel — voir les commentaires `RÈGLE` en tête de ces fichiers avant d'y toucher.
- **`supabase/`** :
  - `migrations/` : SQL versionné (RLS, schéma).
  - `functions/` : Edge Functions Deno (`delete-account`, `cleanup-expired-guests`, `confirmation-compte`, `_shared/` pour le code partagé entre elles).
- **`supabaseClient.ts`** (racine) — client Supabase unique de l'app.
- **`scripts/`** — utilitaires ponctuels (`reset-project.js`, extraction d'assets).

## Commandes de vérification (obligatoires avant de considérer un changement terminé)

```bash
npx tsc --noEmit   # baseline actuelle : 10 lignes d'erreurs pré-existantes
npx expo lint      # baseline actuelle : 51 problèmes (39 erreurs, 12 warnings)
```

Autres commandes utiles (`package.json`) : `npm run start`, `npm run ios`, `npm run android`, `npm run web`, `npm run lint` (= `expo lint`). **Aucun script `test`** n'existe dans ce projet.

**Règle de baseline — la plus importante de ce fichier** : `tsc` et `expo lint` ne sont **pas** censés remonter zéro problème — le repo a un passif d'erreurs pré-existantes (essentiellement dans le code généré par le template Expo par défaut : `components/ui`, `hooks/use-theme-color.ts`, etc.), qu'il n'est pas dans le périmètre de corriger sauf demande explicite. Ce qui compte : **le nombre de lignes/problèmes ne doit jamais augmenter** après une modification.

- Toujours lancer les deux commandes AVANT de commencer (noter le nombre de lignes exact) et APRÈS chaque changement.
- Si le nombre augmente, identifier si la nouvelle erreur vient du fichier qu'on vient de modifier (`grep` le nom du fichier dans la sortie) — si oui, corriger avant de considérer la tâche terminée.
- Ne jamais utiliser `--fix` automatique sans relire le diff : certains fichiers utilisent des patterns volontaires (voir conventions ci-dessous) qu'un fix automatique pourrait dégrader.

## Conventions de code observées

- **Nommage entièrement en français** : noms de variables, fonctions, types, fichiers de commentaires — `enveloppes`, `depense`, `epargneMois`, `synchroniserWidgetPlanning`, `verifierEtNotifierBudgets`, etc. Les seuls termes anglais sont ceux imposés par les APIs externes (React Native, Supabase, Expo). Tout nouveau code doit suivre cette convention, y compris les noms de props et de fichiers internes.
- **Commentaires `RÈGLE À NE JAMAIS CASSER`** : marqueur récurrent dans tout le repo, posé au-dessus d'un bout de code qui encode une contrainte non évidente — souvent la trace d'un bug réel déjà rencontré et corrigé (course de state, race au démarrage, contrainte d'une lib tierce, ordre de rendu obligatoire...). **Toujours lire ces commentaires avant de modifier le code qu'ils annotent** ; ils expliquent le POURQUOI, pas le COMMENT, et leur absence de lecture est la cause la plus fréquente de régression dans ce repo. En ajouter un nouveau quand on corrige un bug non évident est la norme, pas l'exception.
- **Défense en profondeur plutôt que confiance en un seul point de contrôle** : les fonctions sensibles (écriture Supabase, notifications, widgets) revalident leurs propres préconditions même quand l'appelant est censé déjà l'avoir fait (ex. plusieurs gardes redondantes contre un `userId` non résolu au démarrage).
- **Jamais de `throw` qui remonte jusqu'à l'UI** : les fonctions asynchrones qui touchent Supabase/AsyncStorage/notifications encapsulent systématiquement leur corps dans un `try/catch`, loguent en `console.error`, et retombent sur un état sûr (`null`, tableau vide, `return` silencieux) plutôt que de laisser une exception non gérée remonter — en particulier pour les appels "fire-and-forget" (jamais `await`és par leur appelant).
- **Fonctions asynchrones jamais awaitées explicitement gardées sûres** : toute fonction appelée sans `await` (synchronisation de widgets, notifications) doit avoir un `try/catch` englobant tout son corps, sinon une erreur devient une promesse rejetée non gérée.
- **Sérialisation stricte vers les widgets** : les valeurs passées à `updateSnapshot`/`updateTimeline` (widgets iOS) ne doivent jamais être `null` explicite sur un champ optionnel ni `NaN`/`Infinity` — un helper de sanitisation (`nombreSur`) est utilisé systématiquement plutôt que de faire confiance au pont natif.

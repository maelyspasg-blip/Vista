# Travail autonome sur la roadmap (`ROADMAP_5JOURS.md`)

## Ce qui marche vraiment, et pourquoi c'est différent de la demande initiale

Un script shell ne peut pas "lancer une session Claude Code autonome" — il
n'existe pas de commande pour ça dans cet environnement, et un script qui
prétendrait le faire échouerait silencieusement ou donnerait une fausse
impression que le travail continue alors que non. La reprise périodique sans
intervention se fait par la fonctionnalité **native** `/loop` de Claude Code,
à lancer une fois dans une session ouverte. `scripts/start_loop.sh` et
`scripts/stop_loop.sh` gèrent uniquement la partie machine (veille, dev
server, log) — pas la partie Claude Code, qui se lance à la main.

Autre différence assumée : les scripts ne commitent jamais automatiquement.
Ce repo a un hook de pré-commit (`.claude/hooks/pre-commit-review.sh`) qui
bloque tout commit tant qu'une relecture (code-reviewer + security-auditor)
n'a pas été faite sur le diff exact — un script non supervisé qui commiterait
seul irait à l'encontre de cette protection. Les commits de la roadmap
restent faits par Claude Code, à l'intérieur de la session, après cette
relecture.

## Utilisation

**Le matin, avant de partir :**

1. `bash scripts/start_loop.sh` — empêche la mise en veille, lance le dev
   server Expo, journalise l'heure de démarrage.
2. Dans une session Claude Code ouverte (terminal ou app), lance :
   ```
   /loop 45m Continue la roadmap (ROADMAP_5JOURS.md). Documente chaque
   problème dans AUDIT_V1.md, commite après chaque étape validée (jamais
   sans repasser par la revue), et journalise ta progression dans
   scripts/loop_log.txt.
   ```
   (ajuste l'intervalle `45m` selon ce qui te convient — `/loop` sans
   intervalle laisse Claude se caler lui-même). C'est CETTE étape qui rend
   le travail autonome, pas `start_loop.sh` seul.
3. L'ordinateur doit rester allumé et le terminal/l'app Claude Code ouvert —
   l'écran peut s'éteindre, mais le process ne doit pas être fermé ni
   l'ordinateur mis en veille (d'où `caffeinate`).

**Le soir, en rentrant :**

1. Regarde `scripts/loop_log.txt` pour voir ce qui a été fait.
2. Regarde `AUDIT_V1.md` pour les problèmes trouvés/corrigés.
3. `bash scripts/stop_loop.sh` — arrête `caffeinate`, journalise l'heure
   d'arrêt. Arrête aussi la boucle Claude Code (`/loop` avec `stop: true`,
   ou simplement en lui disant d'arrêter).

## Fichiers

- `start_loop.sh` — à lancer le matin (machine uniquement, pas Claude Code).
- `stop_loop.sh` — à lancer le soir.
- `loop_autonome.sh` — aide de vérification, appelée par Claude Code pendant
  la boucle (vérifie tsc/lint, journalise le résultat) — pas destiné à être
  lancé manuellement, mais rien n'empêche de le faire pour un point de
  contrôle ponctuel.
- `loop_log.txt` — journal en texte brut, généré par les scripts ci-dessus.

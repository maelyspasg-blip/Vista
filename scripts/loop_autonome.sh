#!/bin/bash
# Aide de vérification pour une session de travail autonome sur la roadmap
# (cf. ROADMAP_5JOURS.md) — appelé par Claude Code à chaque étape/reprise,
# jamais par un cron/process externe.
#
# IMPORTANT — ce que ce script NE FAIT PAS, volontairement :
# - Il ne "lance" pas Claude Code : il n'existe pas de commande shell pour
#   démarrer une session Claude Code autonome depuis un script externe dans
#   cet environnement. La reprise périodique et sans intervention se fait
#   par la fonctionnalité native `/loop` de Claude Code (à lancer une fois,
#   dans une session ouverte, cf. scripts/README.md) — jamais un succédané
#   ici, qui ne ferait qu'échouer silencieusement ou donner une fausse
#   impression de fonctionnement.
# - Il ne commite rien lui-même. Un commit sans passer par le hook de revue
#   (.claude/hooks/pre-commit-review.sh, code-reviewer + security-auditor)
#   serait bloqué de toute façon — et le contourner depuis un script non
#   supervisé irait à l'encontre de cette protection existante. Les commits
#   de la roadmap restent faits par Claude Code lui-même, à l'intérieur
#   d'une session, après revue.
#
# Ce que ce script fait réellement : vérifie la baseline tsc/lint et
# journalise le résultat dans scripts/loop_log.txt, pour que tu puisses
# suivre l'avancement même sans relire toute la conversation.

set -euo pipefail
cd "$(dirname "$0")/.."

horodatage=$(date)
# RÈGLE : `|| true` obligatoire sur ces deux pipelines — `tsc --noEmit`
# (baseline 10 lignes d'erreurs pré-existantes) et `expo lint` (baseline
# 50-51 problèmes) sortent TOUJOURS en code non-zéro dans ce projet, même
# quand tout va bien : c'est le comportement attendu (cf. CLAUDE.md), pas
# une vraie erreur. Sans `|| true`, `set -e` faisait avorter ce script
# silencieusement dès la toute première vérification, sans jamais écrire
# dans scripts/loop_log.txt — trouvé en exécutant réellement ce script
# (audit V1 du 2026-09-07), pas seulement en le relisant.
nb_lignes_tsc=$( (npx tsc --noEmit 2>&1 | wc -l | tr -d ' ') || true)
# RÈGLE : grep sur la ligne "✖ N problems" plutôt que `tail -1` — la sortie
# d'expo lint se termine par une ligne vide, que `tail -1` capturait à la
# place du vrai résumé (trouvé en exécutant réellement ce script).
resume_lint=$( (npx expo lint 2>&1 | grep -E "✖|problems" | tail -1) || true)
resume_lint="${resume_lint:-aucun problème (0 erreur)}"

{
  echo "--- Vérification $horodatage ---"
  echo "tsc --noEmit : $nb_lignes_tsc ligne(s) (baseline attendue : 10)"
  echo "expo lint : $resume_lint"
  echo ""
} >> scripts/loop_log.txt

echo "Vérification journalisée dans scripts/loop_log.txt."

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
nb_lignes_tsc=$(npx tsc --noEmit 2>&1 | wc -l | tr -d ' ')
resume_lint=$(npx expo lint 2>&1 | tail -1)

{
  echo "--- Vérification $horodatage ---"
  echo "tsc --noEmit : $nb_lignes_tsc ligne(s) (baseline attendue : 10)"
  echo "expo lint : $resume_lint"
  echo ""
} >> scripts/loop_log.txt

echo "Vérification journalisée dans scripts/loop_log.txt."

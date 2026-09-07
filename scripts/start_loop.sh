#!/bin/bash
# À lancer le matin avant de partir (cf. scripts/README.md).
# Empêcher la mise en veille
caffeinate -i &
# Lancer le dev client en arrière-plan
npx expo start --dev-client &
# Ouvrir Claude Code sur la roadmap
echo "Loop Vista démarré — $(date)" >> scripts/loop_log.txt
echo "Prêt. Claude Code peut maintenant travailler de manière autonome."

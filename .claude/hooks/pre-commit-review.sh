#!/usr/bin/env bash
# RÈGLE À NE JAMAIS CASSER — POURQUOI CE SCRIPT NE FAIT PAS PLUS QUE ÇA :
# ce hook ne lance JAMAIS lui-même les agents security-auditor/code-reviewer
# (ça exigerait une session Claude headless avec les permissions désactivées,
# --dangerously-skip-permissions, un vrai risque accepté volontairement comme
# HORS scope). Il se contente de BLOQUER `git commit` tant que le diff staged
# actuel ne correspond pas à l'empreinte du dernier diff explicitement validé
# (fichier marqueur ci-dessous) — la revue elle-même est faite par Claude,
# dans la session en cours, via l'outil Agent normal (permissions visibles).
#
# Toute commande Bash passe par ce hook (matcher "Bash" dans settings.json) —
# on sort immédiatement (exit 0) pour tout ce qui n'est pas un `git commit`,
# jamais de ralentissement sur le reste.

set -uo pipefail

MARKER_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/.last-review-ok"

# Repli défensif : si jq est absent, on ne bloque jamais tous les commits à
# l'aveugle pour un problème d'outillage local — on laisse passer avec un
# avertissement visible plutôt qu'un hook qui casse silencieusement tout.
if ! command -v jq >/dev/null 2>&1; then
  echo "[pre-commit-review] jq introuvable — hook désactivé pour cette commande." >&2
  exit 0
fi

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"

# Ne concerne que les invocations de `git commit` (avec ou sans `&&`/`;`
# devant) — tout le reste du trafic Bash n'est jamais retardé ni inspecté.
if ! printf '%s' "$COMMAND" | grep -qE '(^|[;&|]) *git commit( |$)'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Rien de staged : rien à relire, `git commit` échouera de lui-même sur ce
# cas, pas la peine de bloquer en plus.
if git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

CURRENT_HASH="$(git diff --cached | shasum -a 256 | cut -d' ' -f1)"

if [ -f "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$CURRENT_HASH" ]; then
  exit 0
fi

cat >&2 <<EOF
Commit bloqué : les changements actuellement staged n'ont pas (encore) été relus par security-auditor et code-reviewer, ou ont changé depuis la dernière relecture validée.

Avant de retenter ce commit :
1. Lance les agents security-auditor et code-reviewer (outil Agent) sur le diff staged actuel (git diff --cached).
2. Si l'un des deux remonte un statut 🔴 Bloquant, corrige avant de continuer.
3. Une fois les deux agents sans 🔴 Bloquant, marque la relecture comme faite :
   git diff --cached | shasum -a 256 | cut -d' ' -f1 > "$MARKER_FILE"
4. Retente le commit.
EOF
exit 2

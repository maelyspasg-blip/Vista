#!/bin/bash
# Audit V1 (cf. AUDIT_V1.md, section 1.1) — crée 10 comptes de test anonymes,
# mêmes droits qu'un compte invité réel (supabase.auth.signInAnonymously()),
# jamais la clé service_role. Seed automatique par le trigger existant
# zzz_guest_account_setup_trigger (setup_guest_account()) : chaque compte
# démarre avec les données de démo standard, personnalisées ensuite par le
# SQL de la section 1.2 une fois les UUID ci-dessous connus.
#
# Usage : bash scripts/audit-creer-comptes-test.sh
# (depuis la racine du projet, .env doit contenir EXPO_PUBLIC_SUPABASE_URL
# et EXPO_PUBLIC_SUPABASE_ANON_KEY)

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Erreur : .env introuvable à la racine du projet." >&2
  exit 1
fi
source .env

if [ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  echo "Erreur : EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquants dans .env." >&2
  exit 1
fi

echo "Création de 10 comptes de test anonymes sur $EXPO_PUBLIC_SUPABASE_URL..."
echo ""

for i in $(seq 1 10); do
  reponse=$(curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')
  uuid=$(echo "$reponse" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$uuid" ]; then
    # RÈGLE : ne jamais logguer $reponse en clair — le corps d'une réponse
    # /auth/v1/signup réussie contient un access_token/refresh_token du
    # compte fraîchement créé (jamais la clé anon elle-même, mais un token
    # de session tout de même), qu'un échec de parsing de l'uuid afficherait
    # sinon en clair sur stderr (audit sécurité du 2026-09-07). Seul le
    # message d'erreur, s'il existe, est affiché.
    erreur=$(echo "$reponse" | grep -o '"msg":"[^"]*"\|"message":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "Compte test $i : ÉCHEC — ${erreur:-réponse inattendue, uuid introuvable}" >&2
  else
    echo "Compte test $i : $uuid"
  fi
  # Petite pause pour rester raisonnable vis-à-vis du rate limiting Auth.
  sleep 1
done

echo ""
echo "Colle ces 10 UUID (dans l'ordre) à Claude Code pour générer le SQL de"
echo "personnalisation (AUDIT_V1.md, section 1.2)."

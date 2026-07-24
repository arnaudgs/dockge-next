#!/usr/bin/env bash
#
# check-upstream.sh — Vérifie l'écart entre notre fork et l'upstream louislam/dockge
#                     SANS jamais écraser le tag local 1.5.0 (retagué par notre workflow de déploiement).
#
# Usage : ./extra/check-upstream.sh
#
set -euo pipefail

REMOTE="upstream"
LOCAL_BRANCH="master"
BRANCHES=("master" "1.5.X")   # branches upstream à surveiller

# Vérifie que le remote upstream existe
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
    echo "❌ Le remote '$REMOTE' n'existe pas."
    echo "   Ajoute-le : git remote add $REMOTE https://github.com/louislam/dockge.git"
    exit 1
fi

echo "🔄 Fetch de '$REMOTE' (sans les tags — le tag local 1.5.0 est préservé)…"
# --no-tags : ne récupère AUCUN tag, donc impossible d'écraser notre 1.5.0 local.
for b in "${BRANCHES[@]}"; do
    git fetch --no-tags "$REMOTE" "$b" >/dev/null 2>&1 || echo "   (branche $b introuvable sur $REMOTE, ignorée)"
done
echo ""

LOCAL_HEAD=$(git log -1 --format='%h %ci %s' "$LOCAL_BRANCH")
echo "📍 Notre $LOCAL_BRANCH : $LOCAL_HEAD"
echo ""

any_behind=0
for b in "${BRANCHES[@]}"; do
    ref="$REMOTE/$b"
    if ! git rev-parse --verify --quiet "$ref" >/dev/null; then
        continue
    fi
    behind=$(git rev-list --count "$LOCAL_BRANCH..$ref")
    ahead=$(git rev-list --count "$ref..$LOCAL_BRANCH")
    up_head=$(git log -1 --format='%h %ci' "$ref")
    echo "── $ref (dernier : $up_head)"
    echo "   ↓ $behind commit(s) à intégrer   |   ↑ $ahead commit(s) d'avance (nos devs)"
    if [ "$behind" -gt 0 ]; then
        any_behind=1
        echo "   Nouveautés upstream :"
        git log --oneline "$LOCAL_BRANCH..$ref" | sed 's/^/     /'
    fi
    echo ""
done

if [ "$any_behind" -eq 0 ]; then
    echo "✅ À jour : rien à intégrer depuis l'upstream. Tes devs ne risquent rien."
else
    echo "⚠️  Des commits upstream sont disponibles (voir ci-dessus)."
    echo "   Pour les intégrer prudemment :  git merge $REMOTE/master   (ou rebase)"
    echo "   → Fais-le sur une branche dédiée et teste avant de pousser."
fi

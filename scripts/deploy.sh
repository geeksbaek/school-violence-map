#!/usr/bin/env bash
# Build web/ + force-push dist to gh-pages branch.
# 사용: bash scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ data 빌드"
bun src/build_web_data.ts

echo "→ web 빌드"
(cd web && bun run build)

echo "→ gh-pages 배포"
DIST=web/dist
[ -d "$DIST" ] || { echo "no dist"; exit 1; }

# .nojekyll → 모든 파일 그대로 서빙
touch "$DIST/.nojekyll"

cd "$DIST"
git init -q -b gh-pages
git add -A
git -c user.name="deploy-bot" -c user.email="deploy@local" commit -qm "deploy $(date -u +%FT%TZ)"
git remote add origin "$(cd ../.. && git remote get-url origin)"
git push -qf origin gh-pages

cd ../..
rm -rf "$DIST/.git"

echo "✓ deployed"

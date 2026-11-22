#!/usr/bin/env bash
# Runs the Playwright suite against an isolated API+SPA instance.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -d "${ROOT}/apps/web/node_modules" ]]; then
    (cd "${ROOT}/apps/web" && npm ci --no-audit --no-fund --cache "${ROOT}/.staging/npm-cache")
fi

echo "building SPA..."
npm --prefix "${ROOT}/apps/web" run build
echo "building API..."
cargo build --release -p jey-api --bin jey-api

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${ROOT}/.staging/pw-browsers}"
cd "${ROOT}/apps/web"
exec npx playwright test "$@"

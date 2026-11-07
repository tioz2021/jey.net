#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}/apps/web"
npm run build
rm -rf "${ROOT}/frontend/public/spa"
mkdir -p "${ROOT}/frontend/public/spa"
cp -R dist/. "${ROOT}/frontend/public/spa/"
echo "SPA preview: /spa/index.html"

#!/usr/bin/env bash
# Dependency audit: Rust advisories plus production npm packages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

echo "==> cargo audit"
cargo audit

echo "==> npm audit (production dependencies)"
(
    cd "${ROOT}/apps/web"
    npm audit --omit=dev --audit-level=high
)

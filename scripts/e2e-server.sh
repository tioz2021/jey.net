#!/usr/bin/env bash
# Starts an isolated API+SPA instance for Playwright.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ -z "${DATABASE_URL:-}" && -r "${ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "${ROOT}/.env"
    set +a
fi
: "${DATABASE_URL:?DATABASE_URL is required}"

BASE="${DATABASE_URL%%\?*}"
SCHEMA="jey_e2e"
psql "${BASE}" -v ON_ERROR_STOP=1 \
    -c "drop schema if exists ${SCHEMA} cascade" \
    -c "create schema ${SCHEMA}" >/dev/null
E2E_DATABASE_URL="${BASE}?options=-c%20search_path%3D${SCHEMA}%2Cpublic"

if [[ ! -x "${ROOT}/target/release/jey-api" ]]; then
    echo "building API for e2e..."
    cargo build --release -p jey-api --bin jey-api
fi
if [[ ! -f "${ROOT}/apps/web/dist/index.html" ]]; then
    echo "building SPA for e2e..."
    npm --prefix "${ROOT}/apps/web" run build
fi

rm -rf "${ROOT}/.staging/e2e-media" "${ROOT}/.staging/e2e-mail"
mkdir -p "${ROOT}/.staging/e2e-media" "${ROOT}/.staging/e2e-mail"

exec env \
    APP_ENV=dev \
    BIND_ADDR=127.0.0.1:8091 \
    DATABASE_URL="${E2E_DATABASE_URL}" \
    PUBLIC_URL=http://127.0.0.1:8091 \
    ALLOWED_ORIGINS=http://127.0.0.1:8091 \
    SPA_DIR="${ROOT}/apps/web/dist" \
    MEDIA_DIR="${ROOT}/.staging/e2e-media" \
    MAIL_DIR="${ROOT}/.staging/e2e-mail" \
    RUN_MIGRATIONS=true \
    SESSION_TTL_DAYS=30 \
    LOG_FORMAT=pretty \
    ANALYTICS_SALT=e2e-salt \
    "${ROOT}/target/release/jey-api"

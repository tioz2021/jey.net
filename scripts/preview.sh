#!/usr/bin/env bash
# Local preview environment for UX work.
#
# Separate schema, separate port and separate media dir. Production and the
# E2E database are never touched. Browser: http://127.0.0.1:8092
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

BUILD=0
FRESH=0
for arg in "$@"; do
  case "${arg}" in
    --build) BUILD=1 ;;
    --fresh) FRESH=1 ;;
    *) echo "usage: $0 [--build] [--fresh]" >&2; exit 2 ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" && -r "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "${ROOT}/.env"
  set +a
fi
: "${DATABASE_URL:?DATABASE_URL is required}"

BASE="${DATABASE_URL%%\?*}"
SCHEMA="jey_preview"
PORT="${PREVIEW_PORT:-8092}"

if (( FRESH )); then
  psql "${BASE}" -v ON_ERROR_STOP=1 \
    -c "drop schema if exists ${SCHEMA} cascade" \
    -c "create schema ${SCHEMA}" >/dev/null
else
  psql "${BASE}" -v ON_ERROR_STOP=1 -c "create schema if not exists ${SCHEMA}" >/dev/null
fi

if (( BUILD )) || [[ ! -x "${ROOT}/target/release/jey-api" ]]; then
  echo "building API..."
  "${ROOT}/.toolchain/cargo/bin/cargo" build --release -p jey-api --bin jey-api
fi
if (( BUILD )) || [[ ! -f "${ROOT}/apps/web/dist/index.html" ]]; then
  echo "building SPA..."
  npm --prefix "${ROOT}/apps/web" run build
fi

rm -rf "${ROOT}/.staging/preview-media" "${ROOT}/.staging/preview-mail"
mkdir -p "${ROOT}/.staging/preview-media" "${ROOT}/.staging/preview-mail"

echo "preview: http://127.0.0.1:${PORT}"
exec env \
  APP_ENV=dev \
  BIND_ADDR="127.0.0.1:${PORT}" \
  DATABASE_URL="${BASE}?options=-c%20search_path%3D${SCHEMA}%2Cpublic" \
  PUBLIC_URL="http://127.0.0.1:${PORT}" \
  ALLOWED_ORIGINS="http://127.0.0.1:${PORT}" \
  SPA_DIR="${ROOT}/apps/web/dist" \
  MEDIA_DIR="${ROOT}/.staging/preview-media" \
  MAIL_DIR="${ROOT}/.staging/preview-mail" \
  RUN_MIGRATIONS=true \
  SESSION_TTL_DAYS=7 \
  LOG_FORMAT=pretty \
  ANALYTICS_SALT=preview-salt \
  "${ROOT}/target/release/jey-api"

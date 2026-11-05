#!/usr/bin/env bash
# Local staging: separate DB, API :8081 and web :3001. No Docker required.
#
#   cp .env.staging.example .env.staging
#   bash scripts/staging.sh setup
#   bash scripts/staging.sh up
#   bash scripts/staging.sh down
#   bash scripts/staging.sh reset
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.staging}"
STATE="${ROOT}/.staging"
API_PID="${STATE}/api.pid"
WEB_PID="${STATE}/web.pid"

say() { printf '[staging] %s\n' "$*"; }
die() { printf '[staging] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -r "${ENV_FILE}" ]] || die "missing ${ENV_FILE}; copy .env.staging.example"
set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BIND_ADDR:?BIND_ADDR is required}"
: "${PUBLIC_URL:?PUBLIC_URL is required}"

BASE_DATABASE_URL="${DATABASE_URL%%\?*}"
if [[ -n "${STAGING_SCHEMA:-}" ]]; then
    DB_NAME="${STAGING_SCHEMA}"
    DATABASE_URL="${BASE_DATABASE_URL}?options=-c%20search_path%3D${STAGING_SCHEMA}%2Cpublic"
else
    ADMIN_URL="${DATABASE_URL%/*}/postgres"
    DB_NAME="${DATABASE_URL##*/}"
    DB_NAME="${DB_NAME%%\?*}"
fi
mkdir -p "${STATE}/logs" "${MEDIA_DIR}" "${MAIL_DIR}"

db_exists() {
    if [[ -n "${STAGING_SCHEMA:-}" ]]; then
        psql "${BASE_DATABASE_URL}" -Atc             "select 1 from information_schema.schemata where schema_name = '${STAGING_SCHEMA}'"             2>/dev/null | grep -qx 1
        return
    fi
    psql "${ADMIN_URL}" -Atc "select 1 from pg_database where datname = '${DB_NAME}'" 2>/dev/null | grep -qx 1
}

create_db() {
    if db_exists; then
        say "staging ${DB_NAME} already exists"
    elif [[ -n "${STAGING_SCHEMA:-}" ]]; then
        psql "${BASE_DATABASE_URL}" -v ON_ERROR_STOP=1             -c "create schema \"${STAGING_SCHEMA}\""
        say "created schema ${STAGING_SCHEMA}"
    else
        psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "create database ${DB_NAME}"
        say "created database ${DB_NAME}"
    fi
}

migrate() {
    say "applying migrations"
    (cd "${ROOT}" && cargo run --quiet -p jey-api -- migrate)
}

stop_pid() {
    local file="$1"
    if [[ -f "$file" ]]; then
        local pid
        pid="$(cat "$file")"
        if kill -0 "${pid}" 2>/dev/null; then
            say "stopping pid ${pid}"
            kill "${pid}" 2>/dev/null || true
            for _ in $(seq 1 20); do
                kill -0 "${pid}" 2>/dev/null || break
                sleep 0.25
            done
        fi
        rm -f "$file"
    fi
}

down() {
    stop_pid "${WEB_PID}"
    stop_pid "${API_PID}"
}

setup() {
    down
    create_db
    migrate
}

up() {
    down
    create_db
    [[ -x "${ROOT}/target/debug/jey-api" ]] || cargo build -p jey-api
    say "starting API at ${BIND_ADDR}"
    (
        cd "${ROOT}"
        nohup env \
            APP_ENV="${APP_ENV:-dev}" \
            BIND_ADDR="${BIND_ADDR}" \
            DATABASE_URL="${DATABASE_URL}" \
            PUBLIC_URL="${PUBLIC_URL}" \
            ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-${PUBLIC_URL}}" \
            MEDIA_DIR="${MEDIA_DIR}" \
            MAIL_DIR="${MAIL_DIR}" \
            RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}" \
            SESSION_TTL_DAYS="${SESSION_TTL_DAYS:-30}" \
            LOG_FORMAT="${LOG_FORMAT:-pretty}" \
            ANALYTICS_SALT="${ANALYTICS_SALT:-local-staging-salt}" \
            ./target/debug/jey-api >"${STATE}/logs/api.log" 2>&1 &
        echo $! >"${API_PID}"
    )

    for _ in $(seq 1 40); do
        curl -fsS "http://127.0.0.1:${BIND_ADDR##*:}/health" >/dev/null && break
        sleep 0.25
    done
    curl -fsS "http://127.0.0.1:${BIND_ADDR##*:}/health" >/dev/null || {
        tail -30 "${STATE}/logs/api.log" || true
        die "API did not start"
    }
    say "API is ready"

    say "building web for ${PUBLIC_URL}"
    (
        cd "${ROOT}/frontend"
        BACKEND_URL="http://${BIND_ADDR}" PUBLIC_URL="${PUBLIC_URL}" npm run build
        # next build uses output: standalone; run that server rather than the
        # unsupported `next start` path.
        rm -rf .next/standalone/.next/static .next/standalone/public
        cp -R .next/static .next/standalone/.next/static
        cp -R public .next/standalone/public
        nohup env             NODE_ENV=production             HOSTNAME=127.0.0.1             PORT="${PUBLIC_URL##*:}"             BACKEND_URL="http://${BIND_ADDR}"             PUBLIC_URL="${PUBLIC_URL}"             node .next/standalone/server.js >"${STATE}/logs/web.log" 2>&1 &
        echo $! >"${WEB_PID}"
    )

    for _ in $(seq 1 60); do
        curl -fsS "${PUBLIC_URL}/login" >/dev/null && break
        sleep 0.5
    done
    curl -fsS "${PUBLIC_URL}/login" >/dev/null || {
        tail -30 "${STATE}/logs/web.log" || true
        die "web did not start"
    }
    say "ready: ${PUBLIC_URL}"
    say "logs: ${STATE}/logs/"
}

reset() {
    down
    if [[ -n "${STAGING_SCHEMA:-}" ]]; then
        say "dropping schema ${STAGING_SCHEMA}"
        psql "${BASE_DATABASE_URL}" -v ON_ERROR_STOP=1             -c "drop schema if exists \"${STAGING_SCHEMA}\" cascade"
        create_db
        migrate
    else
        say "dropping database ${DB_NAME}"
        psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "drop database if exists ${DB_NAME} with (force)"
        create_db
        migrate
    fi
}

case "${1:-}" in
    setup) setup ;;
    up) up ;;
    down) down ;;
    reset) reset ;;
    *) die "usage: $0 {setup|up|down|reset}" ;;
esac

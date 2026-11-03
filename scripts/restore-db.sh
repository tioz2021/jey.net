#!/usr/bin/env bash
#
# Restores an encrypted jey database dump over the live database.
#
#   jey-restore-db /var/backups/jey/jey-20261103-033000.dump.gpg --yes
#
# Intended for a deliberate recovery, not for routine deploys. It stops the
# API, decrypts the archive, recreates the database and checks /health/ready.

set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DUMP="${1:-}"
CONFIRM="${2:-}"
ENV_FILE="${ENV_FILE:-/etc/jey/api.env}"

say() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || fail "run as root"
[[ -f "${DUMP}" ]] || fail "usage: jey-restore-db <dump.gpg> --yes"
[[ "${CONFIRM}" == "--yes" ]] || fail "refusing without --yes"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a
: "${DATABASE_URL:?DATABASE_URL is not set}"

DB_NAME="$(psql "${DATABASE_URL}" -Atc 'select current_database()')"
DB_USER="$(psql "${DATABASE_URL}" -Atc 'select current_user')"
plain="$(mktemp)"
trap 'rm -f "${plain}"' EXIT

say "decrypting ${DUMP}"
gpg --batch --yes --decrypt --output "${plain}" "${DUMP}"
pg_restore --list "${plain}" >/dev/null || fail "archive is not readable"

say "stopping jey-api"
systemctl stop jey-api

say "terminating connections to ${DB_NAME}"
runuser -u postgres -- psql -d postgres -Atc \
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}' and pid <> pg_backend_pid()" \
    >/dev/null

say "recreating ${DB_NAME}"
runuser -u postgres -- dropdb --if-exists "${DB_NAME}"
runuser -u postgres -- createdb --owner="${DB_USER}" "${DB_NAME}"

say "restoring data"
pg_restore --dbname="${DATABASE_URL}" --no-owner --exit-on-error "${plain}"

say "starting jey-api"
systemctl start jey-api
healthy=0
for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:8080/health/ready 2>/dev/null; then
        healthy=1
        break
    fi
    sleep 1
done
[[ "${healthy}" -eq 1 ]] || fail "API did not become ready after restore"

say "restore ok: ${DB_NAME}"

#!/usr/bin/env bash
#
# Restore the newest encrypted backup into a throwaway database and verify it.
# Never touches the live database. Safe to run at any time.
#
#   jey-restore-drill [path/to/dump.gpg]
#
# Local dry-run of an unencrypted archive:
#   ALLOW_NONROOT=1 PLAIN_DUMP=/tmp/jey.dump jey-restore-drill
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jey}"
ENV_FILE="${ENV_FILE:-/etc/jey/api.env}"
STATUS_FILE="${STATUS_FILE:-/var/lib/jey/restore-drill-status.json}"
ALLOW_NONROOT="${ALLOW_NONROOT:-0}"
PLAIN_DUMP="${PLAIN_DUMP:-}"
COUNTS_FILE="${COUNTS_FILE:-}"

say() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

if [[ "${ALLOW_NONROOT}" != "1" && "${EUID}" -ne 0 ]]; then
    fail "run as root (or ALLOW_NONROOT=1 for a local plain-archive drill)"
fi
[[ -r "${ENV_FILE}" ]] || fail "missing ${ENV_FILE}"
command -v pg_restore >/dev/null || fail "pg_restore is not installed"
command -v psql >/dev/null || fail "psql is not installed"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a
: "${DATABASE_URL:?DATABASE_URL is not set}"

SOURCE_DB="$(psql "${DATABASE_URL}" -Atc 'select current_database()')"
TEMP_DB="jey_drill_$(date +%Y%m%d%H%M%S)_$$"
PLAIN="$(mktemp /tmp/jey-drill-XXXXXX.dump)"
STARTED_AT="$(date +%s)"
RESULT="failed"
COUNTS="{}"

cleanup() {
    rm -f "${PLAIN}" "${PLAIN}.pg"
    if [[ "${ALLOW_NONROOT}" == "1" ]]; then
        dropdb --if-exists "${TEMP_DB}" >/dev/null 2>&1 || true
    else
        runuser -u postgres -- dropdb --if-exists "${TEMP_DB}" >/dev/null 2>&1 || true
    fi
}
write_status() {
    local finished elapsed rpo
    finished="$(date -Is)"
    elapsed=$(( $(date +%s) - STARTED_AT ))
    if [[ -n "${DUMP:-}" && -f "${DUMP}" ]]; then
        rpo=$(( $(date +%s) - $(stat -c %Y "${DUMP}") ))
    else
        rpo=0
    fi
    install -d -m 755 "$(dirname "${STATUS_FILE}")"
    printf '{"ok":%s,"finished_at":"%s","duration_seconds":%s,"rpo_seconds":%s,"source_db":"%s","temp_db":"%s","dump":"%s","counts":%s}\n' \
        "$([[ "${RESULT}" == "ok" ]] && echo true || echo false)" \
        "${finished}" "${elapsed}" "${rpo}" "${SOURCE_DB}" "${TEMP_DB}" "${DUMP:-}" "${COUNTS}" \
        > "${STATUS_FILE}.tmp"
    chmod 644 "${STATUS_FILE}.tmp"
    mv "${STATUS_FILE}.tmp" "${STATUS_FILE}"
}
trap 'write_status; cleanup' EXIT

if [[ -n "${PLAIN_DUMP}" ]]; then
    DUMP="${PLAIN_DUMP}"
    [[ -r "${DUMP}" ]] || fail "plain dump is not readable: ${DUMP}"
    say "using plain drill archive ${DUMP}"
elif [[ -n "${1:-}" ]]; then
    DUMP="$1"
    [[ -r "${DUMP}" ]] || fail "backup is not readable: ${DUMP}"
else
    DUMP="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'jey-*.dump.gpg' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
    [[ -n "${DUMP}" && -r "${DUMP}" ]] || fail "no encrypted backup in ${BACKUP_DIR}"
fi

if [[ -z "${PLAIN_DUMP}" && -z "${COUNTS_FILE}" ]]; then
    for candidate in "${DUMP%.gpg}.counts.json" "${DUMP%.dump.gpg}.counts.json" "${DUMP}.counts.json"; do
        if [[ -r "${candidate}" ]]; then
            COUNTS_FILE="${candidate}"
            break
        fi
    done
fi

if [[ -z "${PLAIN_DUMP}" ]]; then
    CHECKSUM="${DUMP}.sha256"
    [[ -r "${CHECKSUM}" ]] || fail "missing checksum ${CHECKSUM}"
    (cd "$(dirname "${DUMP}")" && sha256sum -c "$(basename "${CHECKSUM}")")
    say "decrypting ${DUMP}"
    gpg --batch --yes --decrypt --output "${PLAIN}" "${DUMP}"
else
    cp "${DUMP}" "${PLAIN}"
fi
pg_restore --list "${PLAIN}" >/dev/null || fail "archive is not readable"

say "creating ${TEMP_DB} and restoring"
if [[ "${ALLOW_NONROOT}" == "1" ]]; then
    createdb "${TEMP_DB}"
    pg_restore --dbname="${TEMP_DB}" --no-owner --no-privileges --exit-on-error "${PLAIN}" >/dev/null
else
    install -m 600 -o postgres -g postgres "${PLAIN}" "${PLAIN}.pg"
    runuser -u postgres -- createdb "${TEMP_DB}"
    runuser -u postgres -- pg_restore --dbname="${TEMP_DB}" --no-owner --no-privileges --exit-on-error "${PLAIN}.pg" >/dev/null
fi

say "checking restored tables"
if [[ -n "${COUNTS_FILE}" && -r "${COUNTS_FILE}" ]]; then
    say "comparing counts with ${COUNTS_FILE}"
else
    say "no counts sidecar; checking schema and migrations only"
fi

counts_json="{"
first=1
for table in users items _sqlx_migrations; do
    if [[ "${ALLOW_NONROOT}" == "1" ]]; then
        dst="$(psql -d "${TEMP_DB}" -Atc "select count(*) from ${table}")"
    else
        dst="$(runuser -u postgres -- psql -d "${TEMP_DB}" -Atc "select count(*) from ${table}")"
    fi
    [[ "${dst}" =~ ^[0-9]+$ ]] || fail "restored table ${table} is missing"
    if [[ "${table}" == "_sqlx_migrations" && "${dst}" -lt 1 ]]; then
        fail "restored archive has no migrations"
    fi
    if [[ -n "${COUNTS_FILE}" && -r "${COUNTS_FILE}" ]]; then
        expected="$(python3 - "${COUNTS_FILE}" "${table}" <<'PY'
import json, sys
value = json.load(open(sys.argv[1], encoding="utf-8")).get(sys.argv[2])
print(value if isinstance(value, int) else "")
PY
)"
        [[ -z "${expected}" || "${expected}" == "${dst}" ]] || fail "count mismatch for ${table}: ${expected} != ${dst}"
    fi
    [[ ${first} -eq 1 ]] || counts_json+=","
    counts_json+="\"${table}\":${dst}"
    first=0
done
counts_json+="}"
COUNTS="${counts_json}"
RESULT="ok"
say "restore drill ok for ${SOURCE_DB}: ${COUNTS}"

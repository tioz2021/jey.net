#!/usr/bin/env bash
#
# Daily PostgreSQL dump with a restore check and GPG encryption.
#
# Runs on the VPS as root from jey-backup.timer. The plaintext dump exists
# only in a private temporary file while it is verified; only the encrypted
# archive and its checksum stay on disk.

set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jey}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-/etc/jey/api.env}"
RECIPIENT_FILE="${RECIPIENT_FILE:-/etc/jey/backup-recipient}"

say() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || fail "run as root"
[[ -r "${ENV_FILE}" ]] || fail "missing ${ENV_FILE}"
[[ -s "${RECIPIENT_FILE}" ]] || fail "missing GPG recipient in ${RECIPIENT_FILE}"
command -v pg_dump >/dev/null || fail "pg_dump is not installed"
command -v gpg >/dev/null || fail "gpg is not installed"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a
: "${DATABASE_URL:?DATABASE_URL is not set}"

RECIPIENT="$(tr -d '[:space:]' < "${RECIPIENT_FILE}")"
[[ -n "${RECIPIENT}" ]] || fail "empty GPG recipient"

install -d -m 700 "${BACKUP_DIR}"

DB_NAME="$(psql "${DATABASE_URL}" -Atc 'select current_database()')"
DB_BYTES="$(psql "${DATABASE_URL}" -Atc 'select pg_database_size(current_database())')"
AVAIL_KB="$(df -Pk "${BACKUP_DIR}" | awk 'NR==2 {print $4}')"
# Keep room for the dump, its encrypted copy and future dailies.
NEED_KB=$(( DB_BYTES / 1024 * 2 + 1024 * 200 ))
if (( AVAIL_KB < NEED_KB )); then
    fail "not enough disk: ${AVAIL_KB} KiB free, need ${NEED_KB} KiB"
fi

stamp="$(date +%Y%m%d-%H%M%S)"
plain="$(mktemp "${BACKUP_DIR}/.jey-${stamp}.XXXXXX.dump")"
verify="$(mktemp /tmp/jey-verify-XXXXXX.dump)"
encrypted="${BACKUP_DIR}/jey-${stamp}.dump.gpg"
checksum="${encrypted}.sha256"
tmp_db="jey_restore_${stamp//-/}"

cleanup() {
    rm -f "${plain}" "${verify}"
    runuser -u postgres -- dropdb --if-exists "${tmp_db}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

exec 9>"${BACKUP_DIR}/.backup.lock"
flock -n 9 || fail "another backup is already running"

say "dumping ${DB_NAME} (${DB_BYTES} bytes)"
pg_dump --format=custom --compress=9 --file="${plain}" "${DATABASE_URL}"
pg_restore --list "${plain}" >/dev/null || fail "dump archive is not readable"

say "verifying restore into ${tmp_db}"
# postgres must be able to read the archive, while the real dump stays 600 root.
install -m 600 -o postgres -g postgres "${plain}" "${verify}"
runuser -u postgres -- createdb "${tmp_db}"
runuser -u postgres -- pg_restore \
    --dbname="${tmp_db}" \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    "${verify}" >/dev/null
rm -f "${verify}"

for table in users items tags _sqlx_migrations; do
    src="$(psql "${DATABASE_URL}" -Atc "select count(*) from ${table}")"
    dst="$(runuser -u postgres -- psql -d "${tmp_db}" -Atc "select count(*) from ${table}")"
    if [[ "${src}" != "${dst}" ]]; then
        fail "restore check failed for ${table}: ${src} != ${dst}"
    fi
done

say "encrypting for ${RECIPIENT}"
gpg --batch --yes --trust-model always \
    --recipient "${RECIPIENT}" \
    --output "${encrypted}" \
    --encrypt "${plain}"
chmod 600 "${encrypted}"
(
    cd "${BACKUP_DIR}"
    sha256sum "$(basename "${encrypted}")" > "$(basename "${checksum}")"
)
chmod 600 "${checksum}"

rm -f "${plain}"

say "pruning backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -type f \
    \( -name 'jey-*.dump.gpg' -o -name 'jey-*.dump.gpg.sha256' \) \
    -mtime +"${RETENTION_DAYS}" -delete

say "backup ok: ${encrypted} ($(du -h "${encrypted}" | cut -f1))"

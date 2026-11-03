#!/usr/bin/env bash
#
# Pulls encrypted database dumps and media from the VPS to this machine.
# Runs from a systemd user timer; safe to run by hand.
#
#   scripts/pull-backup.sh
#
# The GPG private key stays on this machine. The server only has the public
# key, so a stolen server cannot decrypt the archives.

set -euo pipefail

CONFIG="${JEY_BACKUP_CONFIG:-$HOME/.config/jey-backup.conf}"
if [[ -r "${CONFIG}" ]]; then
    # shellcheck disable=SC1090
    . "${CONFIG}"
fi

VPS_HOST="${VPS_HOST:-129.121.149.16}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/jey_vps}"
REMOTE_DB_DIR="${REMOTE_DB_DIR:-/var/backups/jey}"
REMOTE_MEDIA_DIR="${REMOTE_MEDIA_DIR:-/var/lib/jey/media}"
LOCAL_DIR="${LOCAL_DIR:-$HOME/jey-backups}"
HC_PING_URL_PULL="${HC_PING_URL_PULL:-}"

say() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
fail() { printf '[%s] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

# External heartbeat for the computer-side pull. A separate Healthchecks
# check is important: it must not keep the VPS heartbeat alive.
finish() {
    local code=$?
    trap - EXIT

    if [[ -n "${HC_PING_URL_PULL}" ]]; then
        local base="${HC_PING_URL_PULL%/}"
        local url="${base}"
        local payload="pull ok"
        if (( code != 0 )); then
            url="${base}/fail"
            payload="pull failed"
        fi
        if ! curl -fsS --max-time 10 -o /dev/null -X POST \
            --data-raw "${payload}" "${url}"; then
            printf '[%s] WARN: pull heartbeat failed\n' "$(date -Is)" >&2
        fi
    fi

    exit "${code}"
}
trap finish EXIT

command -v rsync >/dev/null || fail "rsync is not installed"
command -v gpg >/dev/null || fail "gpg is not installed"
[[ -r "${SSH_KEY}" ]] || fail "SSH key not found: ${SSH_KEY}"

mkdir -p "${LOCAL_DIR}/db" "${LOCAL_DIR}/media"
chmod 700 "${LOCAL_DIR}" "${LOCAL_DIR}/db"

exec 9>"${LOCAL_DIR}/.pull.lock"
flock -n 9 || { say "already running"; exit 0; }

SSH_CMD="ssh -F /dev/null -i ${SSH_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
say "pulling database dumps"
rsync -az --partial --human-readable \
    --include='jey-*.dump.gpg' \
    --include='jey-*.dump.gpg.sha256' \
    --exclude='*' \
    -e "${SSH_CMD}" \
    "${VPS_USER}@${VPS_HOST}:${REMOTE_DB_DIR}/" "${LOCAL_DIR}/db/"

say "pulling media"
rsync -az --partial --human-readable \
    -e "${SSH_CMD}" \
    "${VPS_USER}@${VPS_HOST}:${REMOTE_MEDIA_DIR}/" "${LOCAL_DIR}/media/"

latest="$(find "${LOCAL_DIR}/db" -maxdepth 1 -type f -name 'jey-*.dump.gpg' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "${latest}" ]] || fail "no database backup was downloaded"

say "checking checksum: $(basename "${latest}")"
(
    cd "${LOCAL_DIR}/db"
    sha256sum --check "$(basename "${latest}").sha256" >/dev/null
)

if command -v pg_restore >/dev/null; then
    say "checking that the archive decrypts and lists"
    tmp="$(mktemp)"
    trap 'rm -f "${tmp}"' EXIT
    gpg --batch --yes --decrypt --output "${tmp}" "${latest}"
    pg_restore --list "${tmp}" >/dev/null || fail "archive is not readable"
    rm -f "${tmp}"
    trap - EXIT
fi

say "pruning local dumps (latest per week for 8 weeks, latest per month for 3 months)"
python3 - "${LOCAL_DIR}/db" <<'PY'
import datetime as dt
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
files = sorted(root.glob("jey-*.dump.gpg"))
now = dt.datetime.now()
records = []
for path in files:
    match = re.match(r"jey-(\d{8})-(\d{6})\.dump\.gpg$", path.name)
    if not match:
        continue
    try:
        when = dt.datetime.strptime(match.group(1) + match.group(2), "%Y%m%d%H%M%S")
    except ValueError:
        continue
    records.append((when, path))

keep = set()
if records:
    keep.add(max(records, key=lambda item: item[0])[1])

# One newest dump per ISO week for the last 8 weeks.
weeks = {}
for when, path in records:
    if (now.date() - when.date()).days <= 56:
        key = when.isocalendar()[:2]
        if key not in weeks or when > weeks[key][0]:
            weeks[key] = (when, path)
keep.update(path for _, path in weeks.values())

# One newest dump per month for the current and two previous months.
months = {}
for when, path in records:
    if (now.year, now.month) >= (when.year, when.month) and (
        (now.year - when.year) * 12 + now.month - when.month
    ) <= 2:
        key = (when.year, when.month)
        if key not in months or when > months[key][0]:
            months[key] = (when, path)
keep.update(path for _, path in months.values())

removed = 0
for _, path in records:
    if path in keep:
        continue
    path.unlink(missing_ok=True)
    pathlib.Path(str(path) + ".sha256").unlink(missing_ok=True)
    removed += 1

print(f"local dumps kept: {len(keep)}, removed: {removed}")
PY

say "done: ${LOCAL_DIR}"

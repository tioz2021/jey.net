#!/usr/bin/env bash
#
# Installs the daily pull on this Linux machine as a systemd user timer.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${JEY_BACKUP_CONFIG:-$HOME/.config/jey-backup.conf}"
UNIT_DIR="$HOME/.config/systemd/user"

mkdir -p "$(dirname "${CONFIG}")" "${UNIT_DIR}"

if [[ ! -f "${CONFIG}" ]]; then
    cat > "${CONFIG}" <<CONF
# jey.net backup pull configuration
VPS_HOST=129.121.149.16
VPS_USER=root
SSH_KEY=$HOME/.ssh/jey_vps
REMOTE_DB_DIR=/var/backups/jey
REMOTE_MEDIA_DIR=/var/lib/jey/media
LOCAL_DIR=$HOME/jey-backups
CONF
    chmod 600 "${CONFIG}"
    echo "wrote ${CONFIG}"
fi

# Load LOCAL_DIR for the cron log path.
# shellcheck disable=SC1090
. "${CONFIG}"

cat > "${UNIT_DIR}/jey-backup-pull.service" <<UNIT
[Unit]
Description=Pull jey.net encrypted backups to this machine

[Service]
Type=oneshot
ExecStart=${ROOT}/scripts/pull-backup.sh
Nice=10
IOSchedulingClass=idle
UNIT

cat > "${UNIT_DIR}/jey-backup-pull.timer" <<UNIT
[Unit]
Description=Daily pull of jey.net backups

[Timer]
OnCalendar=*-*-* 04:15:00
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIT

# Cron works in headless sessions too; the systemd user timer is a bonus and
# is intentionally not required.
if command -v crontab >/dev/null 2>&1; then
    marker="# jey.net backup pull"
    current="$(crontab -l 2>/dev/null || true)"
    filtered="$(printf '%s\n' "${current}" | grep -vF "${marker}" || true)"
    {
        printf '%s\n' "${filtered}"
        printf '15 4 * * * /bin/bash %s/scripts/pull-backup.sh >> %s/pull.log 2>&1 %s\n' \
            "${ROOT}" "${LOCAL_DIR}" "${marker}"
    } | crontab -
    echo "installed user cron job:"
    crontab -l | tail -3
else
    echo "crontab is unavailable; install a scheduler manually:" >&2
    echo "15 4 * * * /bin/bash ${ROOT}/scripts/pull-backup.sh" >&2
fi

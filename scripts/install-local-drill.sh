#!/usr/bin/env bash
#
# Install the local restore drill for the current user.
# Run as the normal desktop user (jenya), not as root:
#
#   bash scripts/install-local-drill.sh
#
# The script creates ~/.config/jey-drill.env (0600), installs user units and
# prints the one SQL command needed to create the PostgreSQL role. The role
# must be created by a PostgreSQL superuser; the script never elevates itself.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
UNIT_DIR="${CONFIG_DIR}/systemd/user"
CONFIG="${CONFIG_DIR}/jey-drill.env"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/jey"
STATUS="${STATE_DIR}/restore-drill-status.json"

[[ "${EUID}" -ne 0 ]] || { echo "run as the desktop user, not root" >&2; exit 1; }
[[ -d "${ROOT}/apps/web" ]] || { echo "run from the jey.net checkout" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }
command -v gpg >/dev/null || { echo "gpg is required" >&2; exit 1; }

mkdir -p "${CONFIG_DIR}" "${UNIT_DIR}" "${STATE_DIR}"
chmod 700 "${UNIT_DIR}" "${STATE_DIR}"

if [[ -f "${CONFIG}" ]]; then
    echo "keeping existing ${CONFIG}"
else
    password="$(openssl rand -hex 24)"
    cat > "${CONFIG}" <<CFG
# Local restore-drill connection. Never commit this file.
DATABASE_URL=postgresql://jey_drill:${password}@127.0.0.1:5432/postgres
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=jey_drill
PGPASSWORD=${password}
BACKUP_DIR=${HOME}/jey-backups/db
STATUS_FILE=${STATUS}
ALLOW_NONROOT=1
GNUPGHOME=${HOME}/.gnupg
CFG
    chmod 600 "${CONFIG}"
    echo "created ${CONFIG}"
fi

cat > "${UNIT_DIR}/jey-restore-drill.service" <<UNIT
[Unit]
Description=jey.net encrypted backup restore drill
After=network-online.target

[Service]
Type=oneshot
Environment=ENV_FILE=${CONFIG}
WorkingDirectory=${ROOT}
ExecStart=/bin/bash ${ROOT}/scripts/restore-drill.sh
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=30min
UNIT

cat > "${UNIT_DIR}/jey-restore-drill.timer" <<'UNIT'
[Unit]
Description=Weekly jey.net restore drill

[Timer]
OnCalendar=Sun *-*-* 05:00:00
Persistent=true
RandomizedDelaySec=30min

[Install]
WantedBy=timers.target
UNIT

chmod 644 "${UNIT_DIR}/jey-restore-drill.service" "${UNIT_DIR}/jey-restore-drill.timer"
echo "installed user units in ${UNIT_DIR}"

password="$(sed -n 's/^PGPASSWORD=//p' "${CONFIG}")"
role_sql="$(mktemp /tmp/jey-drill-role-XXXXXX.sql)"
chmod 600 "${role_sql}"
cat > "${role_sql}" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jey_drill') THEN
    EXECUTE format('CREATE ROLE jey_drill LOGIN CREATEDB PASSWORD %L', '${password}');
  ELSE
    EXECUTE format('ALTER ROLE jey_drill LOGIN CREATEDB PASSWORD %L', '${password}');
  END IF;
END
\$\$;
SQL
cat <<MSG

Role creation (run once, as a PostgreSQL superuser):

  sudo -u postgres psql -v ON_ERROR_STOP=1 -f ${role_sql}
  rm -f ${role_sql}

The password is in ${CONFIG} (0600), not in this output.

Then verify and enable:

  systemctl --user daemon-reload
  systemctl --user start jey-restore-drill.service
  cat ${STATUS}
  systemctl --user enable --now jey-restore-drill.timer
  systemctl --user list-timers jey-restore-drill.timer

If the role already exists, use ALTER ROLE instead of CREATE ROLE.
MSG

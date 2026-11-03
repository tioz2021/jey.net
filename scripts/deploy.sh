#!/usr/bin/env bash
#
# Deploys jey.net to the server: build, upload, migrations, binary swap,
# health check, rollback on failure.
#
#   DEPLOY_HOST=129.121.149.16 bash scripts/deploy.sh
#   DEPLOY_HOST=129.121.149.16 bash scripts/deploy.sh --rollback
#
# Environment:
#   DEPLOY_HOST   server address (required)
#   DEPLOY_USER   ssh user, default root
#   SSH_KEY       private key, default ~/.ssh/jey_vps
#   BACKUP_DIR    if set, pg_dump is written there before migrations
#
# Order matters: migrations run while the old binary is still serving, the new
# binary replaces it only after migrations succeed, and the service is checked
# with /health/ready before the deploy is considered done.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

DEPLOY_HOST="${DEPLOY_HOST:?set DEPLOY_HOST, for example 129.121.149.16}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/jey_vps}"
BACKUP_DIR="${BACKUP_DIR:-}"

SSH_OPTS=(-F /dev/null -i "${SSH_KEY}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SSH=(ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}")
SCP=(scp "${SSH_OPTS[@]}")

say() { printf '\n==> %s\n' "$*"; }

if [[ "${1:-}" == "--rollback" ]]; then
    say "rolling back to the previous release"
    "${SSH[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail

if [[ -f /opt/jey/jey-api.prev ]]; then
    mv /opt/jey/jey-api /opt/jey/jey-api.bad
    mv /opt/jey/jey-api.prev /opt/jey/jey-api
    systemctl restart jey-api
fi

if [[ -d /opt/jey/web.prev ]]; then
    rm -rf /opt/jey/web.bad
    mv /opt/jey/web /opt/jey/web.bad
    mv /opt/jey/web.prev /opt/jey/web
    systemctl restart jey-web
fi

sleep 3
curl -fsS http://127.0.0.1:8080/api/v1/health
echo
curl -fsS -o /dev/null -w "web: %{http_code}\n" http://127.0.0.1:3000/login
REMOTE
    say "rollback done"
    exit 0
fi

say "building API"
# `sqlx::migrate!` embeds migrations at compile time and does not track new
# files, so a fresh migration would be skipped by the cached build.
touch crates/api/src/db.rs
cargo build --release -p jey-api --bin jey-api

say "building web"
(
    cd frontend
    BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8080}" npm run build
    cp -R .next/static .next/standalone/.next/static
    # Standalone does not include public assets (screenshots, icons).
    cp -R public .next/standalone/public
    tar -C .next/standalone -czf ../jey-web.tar.gz .
)

say "uploading artifacts"
"${SCP[@]}" target/release/jey-api "${DEPLOY_USER}@${DEPLOY_HOST}:/opt/jey/jey-api.new"
"${SCP[@]}" jey-web.tar.gz "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/jey-web.tar.gz"
"${SCP[@]}" scripts/backup-db.sh "${DEPLOY_USER}@${DEPLOY_HOST}:/usr/local/bin/jey-backup-db.new"
"${SCP[@]}" scripts/restore-db.sh "${DEPLOY_USER}@${DEPLOY_HOST}:/usr/local/bin/jey-restore-db.new"
"${SCP[@]}" deploy/jey-backup.service "${DEPLOY_USER}@${DEPLOY_HOST}:/etc/systemd/system/jey-backup.service"
"${SCP[@]}" deploy/jey-backup.timer "${DEPLOY_USER}@${DEPLOY_HOST}:/etc/systemd/system/jey-backup.timer"
"${SCP[@]}" deploy/healthcheck.sh "${DEPLOY_USER}@${DEPLOY_HOST}:/usr/local/bin/jey-healthcheck.new"
"${SCP[@]}" deploy/jey-healthcheck.service "${DEPLOY_USER}@${DEPLOY_HOST}:/etc/systemd/system/jey-healthcheck.service"
"${SCP[@]}" deploy/jey-healthcheck.timer "${DEPLOY_USER}@${DEPLOY_HOST}:/etc/systemd/system/jey-healthcheck.timer"
rm -f jey-web.tar.gz

say "activating"
"${SSH[@]}" "BACKUP_DIR='${BACKUP_DIR}' bash -s" <<'REMOTE'
set -euo pipefail

set -a
. /etc/jey/api.env
set +a

if [[ -n "${BACKUP_DIR}" ]]; then
    mkdir -p "${BACKUP_DIR}"
    stamp=$(date +%Y%m%d-%H%M%S)
    pg_dump --format=custom --file="${BACKUP_DIR}/jey-${stamp}.dump" "${DATABASE_URL}"
    echo "backup: ${BACKUP_DIR}/jey-${stamp}.dump"
else
    echo "warning: BACKUP_DIR is not set, migrations run without a database dump"
fi

# 1. Migrations first, while the old binary is still serving.
/opt/jey/jey-api.new migrate

# 2. Swap the API binary and restart.
mv /opt/jey/jey-api /opt/jey/jey-api.prev
mv /opt/jey/jey-api.new /opt/jey/jey-api
systemctl restart jey-api

healthy=0
for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:8080/health/ready 2>/dev/null; then
        healthy=1
        break
    fi
    sleep 1
done

if [[ "${healthy}" -ne 1 ]]; then
    echo "API is not ready after deploy, rolling back" >&2
    mv /opt/jey/jey-api /opt/jey/jey-api.bad
    mv /opt/jey/jey-api.prev /opt/jey/jey-api
    systemctl restart jey-api
    exit 1
fi

# 3. Backup tooling. The GPG public key is installed once, out of band.
install -m 700 /usr/local/bin/jey-backup-db.new /usr/local/bin/jey-backup-db
install -m 700 /usr/local/bin/jey-restore-db.new /usr/local/bin/jey-restore-db
install -m 700 /usr/local/bin/jey-healthcheck.new /usr/local/bin/jey-healthcheck
rm -f /usr/local/bin/jey-backup-db.new /usr/local/bin/jey-restore-db.new /usr/local/bin/jey-healthcheck.new
systemctl daemon-reload
systemctl enable --now jey-healthcheck.timer
if [[ -s /etc/jey/backup-recipient ]]; then
    systemctl enable --now jey-backup.timer
    echo "backup timer enabled"
else
    echo "warning: /etc/jey/backup-recipient is missing, backup timer not enabled" >&2
fi

# 4. Web client: keep the previous bundle for rollback.
rm -rf /opt/jey/web.prev
mv /opt/jey/web /opt/jey/web.prev
install -d -o jey -g jey -m 750 /opt/jey/web
tar -xzf /tmp/jey-web.tar.gz -C /opt/jey/web
rm -f /tmp/jey-web.tar.gz
install -d -o jey -g jey -m 750 /opt/jey/web/.next/cache
chown -R jey:jey /opt/jey/web
systemctl restart jey-web

sleep 2
curl -fsS -o /dev/null -w "web: %{http_code}\n" http://127.0.0.1:3000/login
curl -fsS http://127.0.0.1:8080/api/v1/health
echo
REMOTE

say "deploy finished"

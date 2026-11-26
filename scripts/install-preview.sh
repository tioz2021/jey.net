#!/usr/bin/env bash
# Installs the external basic-auth preview on the VPS.
#
# Usage: PREVIEW_PASSWORD='...' bash scripts/install-preview.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "run as root" >&2
    exit 1
fi
: "${PREVIEW_PASSWORD:?set PREVIEW_PASSWORD}"
PREVIEW_HOST="${PREVIEW_HOST:-preview.129-121-149-16.sslip.io}"
PREVIEW_PORT="${PREVIEW_PORT:-8094}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
. /etc/jey/api.env
set +a
: "${DATABASE_URL:?DATABASE_URL is required}"
BASE="${DATABASE_URL%%\?*}"

psql "${BASE}" -v ON_ERROR_STOP=1 \
    -c "create schema if not exists jey_preview" \
    -c "create table if not exists jey_preview._preview_ready (ok boolean)" >/dev/null

install -d -o jey -g jey -m 700 /var/lib/jey/preview-media /var/lib/jey/preview-mail

cat > /etc/jey/preview.env <<ENV
APP_ENV=dev
BIND_ADDR=127.0.0.1:${PREVIEW_PORT}
DATABASE_URL=${BASE}?options=-c%20search_path%3Djey_preview%2Cpublic
PUBLIC_URL=https://${PREVIEW_HOST}
ALLOWED_ORIGINS=https://${PREVIEW_HOST}
MEDIA_DIR=/var/lib/jey/preview-media
MAIL_DIR=/var/lib/jey/preview-mail
RUN_MIGRATIONS=true
SESSION_TTL_DAYS=7
DB_POOL_MAX=4
LOG_FORMAT=json
ANALYTICS_SALT=preview-salt
ENV
chmod 640 /etc/jey/preview.env
chown root:jey /etc/jey/preview.env

install -m 644 "${ROOT}/deploy/jey-api-preview.service" /etc/systemd/system/jey-api-preview.service
systemctl daemon-reload
systemctl enable --now jey-api-preview.service

HASH="$(caddy hash-password --plaintext "${PREVIEW_PASSWORD}")"
cat > /etc/caddy/preview.caddy <<CADDY
${PREVIEW_HOST} {
    basic_auth {
        preview ${HASH}
    }
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Frame-Options "DENY"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        Cross-Origin-Opener-Policy "same-origin"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-bbDjrROHH0WJVm5VGhQOF6CdSZCPLjxjMpesOM9zKjM='; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
        -Server
        -X-Powered-By
    }
    reverse_proxy 127.0.0.1:${PREVIEW_PORT}
}
CADDY
chmod 644 /etc/caddy/preview.caddy

if ! grep -q 'preview.caddy' /etc/caddy/Caddyfile; then
    printf '\nimport /etc/caddy/preview.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl --no-pager --full status jey-api-preview.service | head -12
echo "preview installed: https://${PREVIEW_HOST}"

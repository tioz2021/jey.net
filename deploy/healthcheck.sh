#!/usr/bin/env bash
#
# Health check for jey.net: API, web, disk and memory.
#
# Runs from a systemd timer every five minutes. Alerts only when the state
# changes, so a long outage sends one message instead of hundreds.
#
# Configuration lives in /etc/jey/health.env (600 root):
#
#   BASE_URL=https://example.org
#   ALERT_WEBHOOK=https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>
#   DISK_WARN=80
#   MEM_WARN_MB=100
#   CERT_WARN_DAYS=14
#   BACKUP_MAX_HOURS=30

set -uo pipefail

ENV_FILE="${HEALTH_ENV:-/etc/jey/health.env}"
if [[ -r "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
fi

LOG_TAG="jey-health"
BASE_URL="${BASE_URL:-https://129-121-149-16.sslip.io}"
DISK_WARN="${DISK_WARN:-80}"
MEM_WARN_MB="${MEM_WARN_MB:-100}"
STATE_FILE="${STATE_FILE:-/var/lib/jey/health.state}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
CERT_WARN_DAYS="${CERT_WARN_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jey}"
BACKUP_MAX_HOURS="${BACKUP_MAX_HOURS:-30}"

problems=()

check_http() {
    local name="$1" url="$2"

    if ! curl -fsS --max-time 10 -o /dev/null "${url}"; then
        problems+=("${name} недоступен")
    fi
}

send_alert() {
    local text="$1"

    logger -t "${LOG_TAG}" "ALERT: ${text}"

    if [[ -z "${ALERT_WEBHOOK}" ]]; then
        return 0
    fi

    local payload
    payload=$(printf '%s' "${text}" | sed 's/\\/\\\\/g; s/"/\\"/g')

    if ! curl -fsS --max-time 10 -X POST \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"${payload}\"}" \
        "${ALERT_WEBHOOK}" >/dev/null; then
        logger -t "${LOG_TAG}" "alert delivery failed"
    fi
}

check_http "API" "${BASE_URL}/api/v1/health"
check_http "Веб" "${BASE_URL}/login"

if command -v pg_isready >/dev/null 2>&1; then
    if ! pg_isready -q -h 127.0.0.1; then
        problems+=("PostgreSQL не принимает подключения")
    fi
fi

if command -v systemctl >/dev/null 2>&1; then
    for unit in jey-api jey-web; do
        if ! systemctl is-active --quiet "${unit}"; then
            problems+=("${unit} не запущен")
        fi
    done
fi

# Recent server errors are easy to spot in the structured API log.
if command -v journalctl >/dev/null 2>&1; then
    if journalctl -u jey-api --since "15 min ago" --no-pager 2>/dev/null \
        | grep -qE 'status=5[0-9][0-9]|"status":5[0-9][0-9]'; then
        problems+=("в API были ошибки 5xx за последние 15 минут")
    fi
fi

if [[ -d "${BACKUP_DIR}" ]]; then
    newest_backup="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'jey-*.dump.gpg' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
    if [[ -z "${newest_backup}" ]]; then
        problems+=("нет свежих бэкапов БД")
    else
        backup_age_h=$(( ( $(date +%s) - $(stat -c %Y "${newest_backup}") ) / 3600 ))
        if (( backup_age_h > BACKUP_MAX_HOURS )); then
            problems+=("последний бэкап БД старше ${BACKUP_MAX_HOURS} ч")
        fi
    fi
fi

if [[ "${BASE_URL}" == https://* ]] && command -v openssl >/dev/null 2>&1; then
    host="${BASE_URL#https://}"
    host="${host%%/*}"
    end_date="$(echo | openssl s_client -servername "${host}" -connect "${host}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2-)"
    if [[ -n "${end_date}" ]]; then
        expires_at="$(date -d "${end_date}" +%s 2>/dev/null || true)"
        if [[ -n "${expires_at}" ]]; then
            days_left=$(( (expires_at - $(date +%s)) / 86400 ))
            if (( days_left < CERT_WARN_DAYS )); then
                problems+=("TLS-сертификат истекает через ${days_left} дн.")
            fi
        fi
    else
        problems+=("не удалось проверить TLS-сертификат")
    fi
fi

disk_used=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [[ -n "${disk_used}" ]] && (( disk_used >= DISK_WARN )); then
    problems+=("диск занят на ${disk_used}%")
fi

memory_available=$(free -m | awk '/^Mem:/ {print $7}')
if [[ -n "${memory_available}" ]] && (( memory_available < MEM_WARN_MB )); then
    problems+=("свободной памяти ${memory_available} МБ")
fi

mkdir -p "$(dirname "${STATE_FILE}")" 2>/dev/null || true

if (( ${#problems[@]} == 0 )); then
    current="ok"
else
    current=$(printf '%s; ' "${problems[@]}")
    current="${current%; }"
fi

previous=""
if [[ -r "${STATE_FILE}" ]]; then
    previous=$(cat "${STATE_FILE}")
fi

if [[ "${current}" != "${previous}" ]]; then
    if [[ "${current}" == "ok" ]]; then
        # No "recovered" message on the very first run.
        if [[ -n "${previous}" ]]; then
            send_alert "jey.net снова в порядке"
        fi
    else
        send_alert "jey.net: ${current}"
    fi
    printf '%s' "${current}" > "${STATE_FILE}"
    logger -t "${LOG_TAG}" "state: ${current}"
fi

if [[ "${1:-}" == "--verbose" ]]; then
    echo "state: ${current} (previous: ${previous:-none})"
fi

[[ "${current}" == "ok" ]]

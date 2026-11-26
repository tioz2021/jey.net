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
#   HC_PING_URL=https://hc-ping.com/<uuid>

set -uo pipefail

API_ENV="${API_ENV:-/etc/jey/api.env}"
if [[ -r "${API_ENV}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${API_ENV}"
    set +a
fi

ENV_FILE="${HEALTH_ENV:-/etc/jey/health.env}"
if [[ -r "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
fi

LOG_TAG="jey-health"
BASE_URL="${BASE_URL:-https://j3ynet.site}"
DISK_WARN="${DISK_WARN:-80}"
MEM_WARN_MB="${MEM_WARN_MB:-100}"
STATE_FILE="${STATE_FILE:-/var/lib/jey/health.state}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
CERT_WARN_DAYS="${CERT_WARN_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jey}"
BACKUP_MAX_HOURS="${BACKUP_MAX_HOURS:-30}"
P95_WARN_MS="${P95_WARN_MS:-200}"
P95_MIN_REQUESTS="${P95_MIN_REQUESTS:-20}"
SSE_DISCONNECT_WARN="${SSE_DISCONNECT_WARN:-25}"
SSE_STATE_FILE="${SSE_STATE_FILE:-/var/lib/jey/sse.state}"
HC_PING_URL="${HC_PING_URL:-}"

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

ready_body=""
if ! ready_body="$(curl -fsS --max-time 10 "${BASE_URL}/health/ready")"; then
    problems+=("API readiness недоступен")
fi
check_http "SPA" "${BASE_URL}/"

if command -v pg_isready >/dev/null 2>&1; then
    if ! pg_isready -q -h 127.0.0.1; then
        problems+=("PostgreSQL не принимает подключения")
    fi
fi

if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
    if ! psql "${DATABASE_URL}" -Atc 'select 1' >/dev/null 2>&1; then
        problems+=("PostgreSQL не отвечает на select 1")
    fi
fi

if command -v systemctl >/dev/null 2>&1; then
    for unit in jey-api; do
        if ! systemctl is-active --quiet "${unit}"; then
            problems+=("${unit} не запущен")
        fi
    done
fi

# One pass over the structured request log gives both 5xx count and p95.
# This is deliberately independent of the admin API: the check must work even
# when authentication or the database is degraded.
if command -v journalctl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    metrics="$(journalctl -u jey-api --since "15 min ago" --no-pager -o cat 2>/dev/null | python3 -c '
import json, sys
latencies = []
errors = 0
for line in sys.stdin:
    try:
        event = json.loads(line)
    except Exception:
        continue
    fields = event.get("fields", {})
    if fields.get("message") != "request completed":
        continue
    status = fields.get("status")
    if isinstance(status, int) and status >= 500:
        errors += 1
    latency = fields.get("latency_ms")
    if isinstance(latency, (int, float)):
        latencies.append(float(latency))
latencies.sort()
if not latencies:
    print("0 0 0")
else:
    p95 = latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))]
    print(len(latencies), round(p95, 1), errors)
')"
    read -r request_count p95 errors <<< "${metrics}"
    if (( ${errors:-0} > 0 )); then
        problems+=("в API были ошибки 5xx за последние 15 минут")
    fi
    if (( ${request_count:-0} >= P95_MIN_REQUESTS )) &&        awk -v value="${p95:-0}" -v limit="${P95_WARN_MS}" 'BEGIN { exit !(value > limit) }'; then
        problems+=("p95 API ${p95} ms > ${P95_WARN_MS} ms")
    fi
elif command -v journalctl >/dev/null 2>&1; then
    if journalctl -u jey-api --since "15 min ago" --no-pager 2>/dev/null \
        | grep -qE 'status=5[0-9][0-9]|"status":5[0-9][0-9]'; then
        problems+=("в API были ошибки 5xx за последние 15 минут")
    fi
fi

if [[ ! -d "${BACKUP_DIR}" ]]; then
    problems+=("каталог бэкапов ${BACKUP_DIR} отсутствует")
else
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

if [[ -n "${ready_body}" ]] && command -v python3 >/dev/null 2>&1; then
    sse_values="$(printf '%s' "${ready_body}" | python3 -c '
import json, sys
try:
    sse = json.load(sys.stdin)["sse"]
    print(
        sse["notifications"]["closed"],
        sse["chat"]["closed"],
        sse["notifications"]["active"],
        sse["chat"]["active"],
    )
except Exception:
    print("")
')"
    if [[ -n "${sse_values}" ]]; then
        read -r notif_closed chat_closed notif_active chat_active <<< "${sse_values}"
        mkdir -p "$(dirname "${SSE_STATE_FILE}")" 2>/dev/null || true
        if [[ -r "${SSE_STATE_FILE}" ]]; then
            read -r prev_notif prev_chat _prev_at < "${SSE_STATE_FILE}" || true
            notif_delta=$(( ${notif_closed:-0} - ${prev_notif:-0} ))
            chat_delta=$(( ${chat_closed:-0} - ${prev_chat:-0} ))
            (( notif_delta < 0 )) && notif_delta=0
            (( chat_delta < 0 )) && chat_delta=0
            total_delta=$((notif_delta + chat_delta))
            if (( total_delta > SSE_DISCONNECT_WARN )); then
                problems+=("SSE: ${total_delta} отключений за интервал (порог ${SSE_DISCONNECT_WARN})")
            fi
        fi
        printf '%s %s %s %s\n' "${notif_closed}" "${chat_closed}" "${notif_active}" "${chat_active}" > "${SSE_STATE_FILE}"
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

# Dead-man's switch: ping an external service on every run. When the VPS or
# this script disappears, the pings stop and the service raises an alert.
if [[ -n "${HC_PING_URL}" ]]; then
    hc_url="${HC_PING_URL%/}"
    if [[ "${current}" != "ok" ]]; then
        hc_url="${hc_url}/fail"
    fi

    if ! curl -fsS --max-time 10 -o /dev/null -X POST \
        --data-raw "${current}" "${hc_url}"; then
        logger -t "${LOG_TAG}" "healthchecks.io ping failed"
    fi
fi

if [[ "${1:-}" == "--verbose" ]]; then
    echo "state: ${current} (previous: ${previous:-none})"
fi

[[ "${current}" == "ok" ]]

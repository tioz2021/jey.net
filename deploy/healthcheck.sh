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

disk_used=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [[ -n "${disk_used}" ]] && (( disk_used >= DISK_WARN )); then
    problems+=("диск занят на ${disk_used}%")
fi

memory_available=$(free -m | awk '/^Mem:/ {print $7}')
if [[ -n "${memory_available}" ]] && (( memory_available < MEM_WARN_MB )); then
    problems+=("свободной памяти ${memory_available} МБ")
fi

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

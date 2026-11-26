#!/usr/bin/env bash
# Daily retention for structured browser errors (T214).
set -euo pipefail
API_ENV="${API_ENV:-/etc/jey/api.env}"
if [[ -r "${API_ENV}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${API_ENV}"
    set +a
fi
: "${DATABASE_URL:?DATABASE_URL is required}"
DAYS="${CLIENT_ERROR_RETENTION_DAYS:-30}"
if ! [[ "${DAYS}" =~ ^[0-9]+$ ]]; then
    echo "invalid CLIENT_ERROR_RETENTION_DAYS" >&2
    exit 2
fi
deleted="$(psql "${DATABASE_URL}" -Atc "with deleted as (
    delete from client_errors
    where created_at < now() - make_interval(days => ${DAYS})
    returning 1
) select count(*) from deleted;")"
logger -t jey-client-errors "retention=${DAYS}d deleted=${deleted}"
printf 'client_errors retention: %s days, deleted %s\n' "${DAYS}" "${deleted}"

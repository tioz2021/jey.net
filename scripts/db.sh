#!/usr/bin/env bash
#
# Database helpers for local development.
#
# Usage: bash scripts/db.sh {create|migrate|drop|reset}
#
# `create` and `drop` need superuser rights, because they create the role,
# the database and the extensions; they call sudo. `migrate` runs the API
# binary, which carries the migrations inside it.

set -euo pipefail

DB_NAME="${DB_NAME:-jey}"
DB_USER="${DB_USER:-jey}"
DB_PASSWORD="${DB_PASSWORD:-jey_dev_password}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql_super() {
    sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"
}

create_role() {
    if psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" | grep -q 1; then
        echo "role ${DB_USER} already exists"
    else
        psql_super -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}'"
    fi
}

create_database() {
    if psql_super -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
        echo "database ${DB_NAME} already exists"
    else
        psql_super -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"
    fi
}

cmd_create() {
    create_role
    create_database
    # citext is used for case-insensitive emails, pg_trgm for search.
    psql_super -d "${DB_NAME}" -c \
        "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    echo "database ${DB_NAME} is ready"
}

cmd_drop() {
    psql_super -c "DROP DATABASE IF EXISTS ${DB_NAME}"
    echo "database ${DB_NAME} dropped"
}

cmd_migrate() {
    # `sqlx::migrate!` embeds migrations at compile time and tracks only the
    # files it already knows about, so a newly added .sql file alone does not
    # trigger a rebuild. Touching the module that calls the macro forces one.
    touch "${ROOT_DIR}/crates/api/src/db.rs"
    RUST_LOG=error cargo run --quiet --manifest-path "${ROOT_DIR}/crates/api/Cargo.toml" -- migrate
}

cmd_reset() {
    cmd_drop
    cmd_create
    cmd_migrate
}

case "${1:-}" in
    create) cmd_create ;;
    drop) cmd_drop ;;
    migrate) cmd_migrate ;;
    reset) cmd_reset ;;
    *)
        echo "usage: $0 {create|migrate|drop|reset}" >&2
        exit 2
        ;;
esac

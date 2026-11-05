#!/usr/bin/env bash
#
# Local verification: the checks CI runs, plus a release build.
#
# Usage: bash scripts/check.sh
#
# Every step stops the script, so the first failure is the one reported.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# Integration tests use their own schema so local demo data cannot affect the
# result. TEST_DATABASE_URL may be supplied by the caller; otherwise create a
# disposable schema inside the local database from .env.
if [[ -z "${TEST_DATABASE_URL:-}" && -r "${ROOT_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . "${ROOT_DIR}/.env"
    set +a
    if [[ -n "${DATABASE_URL:-}" ]]; then
        base_db="${DATABASE_URL%%\?*}"
        psql "${base_db}" -v ON_ERROR_STOP=1 \
            -c "drop schema if exists jey_test cascade" \
            -c "create schema jey_test" >/dev/null
        TEST_DATABASE_URL="${base_db}?options=-c%20search_path%3Djey_test%2Cpublic"
        export TEST_DATABASE_URL
    fi
fi

started_at=$(date +%s)

step() {
    printf '\n==> %s\n' "$1"
}

fail() {
    printf '\nFAILED: %s\n' "$1" >&2
    exit 1
}

step "cargo fmt --check"
cargo fmt --all -- --check || fail "formatting (run: cargo fmt)"

step "cargo clippy --all-targets -- -D warnings"
cargo clippy --locked --workspace --all-targets -- -D warnings || fail "clippy"

step "cargo test"
# Integration tests share one PostgreSQL database. Running them in parallel
# makes rate-limit and registration tests race each other, so keep this
# preflight deterministic even though it takes a little longer.
cargo test --locked --workspace -- --test-threads=1 || fail "tests"

step "cargo build --release"
cargo build --locked --release --workspace || fail "release build"

elapsed=$(( $(date +%s) - started_at ))
printf '\nAll checks passed in %ss\n' "${elapsed}"

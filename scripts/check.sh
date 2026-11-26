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

step "check CSP hash"
bash scripts/check-csp.sh || fail "CSP hash"

step "audit silent catches"
bash scripts/check-silent-catches.sh || fail "silent catches"

step "check generated TS types"
bash scripts/generate-types.sh || fail "generate TS types"
git diff --exit-code -- frontend/lib/generated || fail "generated TS types are stale"

step "cargo clippy --all-targets -- -D warnings"
cargo clippy --locked --workspace --all-targets -- -D warnings || fail "clippy"

step "npm ci"
(
    cd "${ROOT_DIR}/apps/web"
    npm ci --no-audit --no-fund --cache "${ROOT_DIR}/.staging/npm-cache"
) || fail "npm ci"

step "npm test"
(
    cd "${ROOT_DIR}/apps/web"
    npm test
) || fail "frontend tests"

step "npm run build"
(
    cd "${ROOT_DIR}/apps/web"
    npm run build
) || fail "frontend build"

step "bundle budget"
bash scripts/check-bundle-budget.sh || fail "bundle budget"

step "cargo test"
# Test uploads are disposable and must not leak between runs.
rm -rf "${ROOT_DIR}/var/test-media"
# Integration tests share one PostgreSQL database. Running them in parallel
# makes rate-limit and registration tests race each other, so keep this
# preflight deterministic even though it takes a little longer.
cargo test --locked --workspace -- --test-threads=1 || fail "tests"

step "cargo migrate"
# The API embeds migrations; run the real command against the configured DB.
if [[ -n "${DATABASE_URL:-}" ]]; then
    cargo run --locked --quiet -p jey-api -- migrate || fail "migrations"
else
    printf 'DATABASE_URL is not set; migration check skipped\n'
fi

step "cargo build --release (API)"
cargo build --locked --release -p jey-api --bin jey-api || fail "release build"

if [[ "${CHECK_E2E:-0}" == "1" ]]; then
    step "Playwright E2E"
    bash "${ROOT_DIR}/scripts/e2e.sh" || fail "e2e"
fi

elapsed=$(( $(date +%s) - started_at ))
printf '\nAll checks passed in %ss\n' "${elapsed}"

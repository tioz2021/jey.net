#!/usr/bin/env bash
#
# Local verification: the checks CI runs, plus a release build.
#
# Usage: bash scripts/check.sh
#
# Every step stops the script, so the first failure is the one reported.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/backend"

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
cargo clippy --locked --all-targets -- -D warnings || fail "clippy"

step "cargo test"
cargo test --locked || fail "tests"

step "cargo build --release"
cargo build --locked --release || fail "release build"

elapsed=$(( $(date +%s) - started_at ))
printf '\nAll checks passed in %ss\n' "${elapsed}"

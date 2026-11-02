#!/usr/bin/env bash
#
# Fills the development database with a demo account and 200 records.
#
# Usage: bash scripts/seed.sh
#
# Reads the same .env as the API (DATABASE_URL, APP_ENV); refuses to run when
# APP_ENV=production. Re-running is safe: an account that already has records
# is left untouched.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

exec cargo run --quiet --package jey-api --bin seed

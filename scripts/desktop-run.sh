#!/usr/bin/env bash
# Launch the already-built desktop binary, building it first if needed.
#
#   bash scripts/desktop-run.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/target/release/jey-desktop"

# Always rebuild: Vite and Cargo are incremental, and launching a stale binary
# after source changes is more confusing than a short build.
echo "Building the desktop app before launch..."
bash "${ROOT}/scripts/desktop-build.sh"

# A writable per-run home avoids dconf/runtime errors in restricted sessions.
export HOME="${JEY_DESKTOP_HOME:-${HOME}}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-${ROOT}/.staging/runtime}"
mkdir -p "${XDG_RUNTIME_DIR}"
chmod 700 "${XDG_RUNTIME_DIR}"

exec "${BIN}"

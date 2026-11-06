#!/usr/bin/env bash
# Launch the already-built desktop binary, building it first if needed.
#
#   bash scripts/desktop-run.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/target/release/jey-desktop"

if [[ ! -x "${BIN}" ]]; then
    echo "Desktop binary not found; building first..." >&2
    bash "${ROOT}/scripts/desktop-build.sh"
fi

# A writable per-run home avoids dconf/runtime errors in restricted sessions.
export HOME="${JEY_DESKTOP_HOME:-${HOME}}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-${ROOT}/.staging/runtime}"
mkdir -p "${XDG_RUNTIME_DIR}"
chmod 700 "${XDG_RUNTIME_DIR}"

exec "${BIN}"

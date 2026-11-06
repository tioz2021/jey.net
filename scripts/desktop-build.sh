#!/usr/bin/env bash
# Build the Tauri desktop app with the project-local Rust/Tauri toolchain.
#
#   bash scripts/desktop-build.sh
#   bash scripts/desktop-build.sh --bundles appimage
#
# The sandbox may not allow installing cargo-tauri into ~/.cargo; the CLI is
# kept in .toolchain/cargo/bin next to the project toolchain.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI="${ROOT}/.toolchain/cargo/bin/cargo-tauri"

if [[ ! -x "${TAURI}" ]]; then
    echo "cargo-tauri not found at ${TAURI}" >&2
    echo "Install it with: cargo install tauri-cli --version '^2' --locked" >&2
    exit 1
fi

export PATH="${ROOT}/.toolchain/cargo/bin:${HOME}/.cargo/bin:${PATH}"
export CARGO_HOME="${CARGO_HOME:-${ROOT}/.toolchain/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-${HOME}/.rustup}"
# AppImage bundling needs a writable temporary directory in restricted
# environments; normal desktops can ignore this.
export TMPDIR="${TMPDIR:-${ROOT}/.staging/tmp}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${ROOT}/.staging/cache}"
mkdir -p "${TMPDIR}" "${XDG_CACHE_HOME}"

echo "Building the desktop UI..."
(
  cd "${ROOT}/apps/desktop"
  npm run build
)

cd "${ROOT}/crates/desktop"
exec "${TAURI}" build --features tauri "$@"

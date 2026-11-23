#!/usr/bin/env bash
# Build the desktop binary and run the WebKit smoke suite.
# Requires: tauri-driver, WebKitWebDriver and a graphical/Xvfb DISPLAY.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
export PATH="${ROOT}/.toolchain/cargo/bin:${HOME}/.cargo/bin:${PATH}"
export CARGO_HOME="${CARGO_HOME:-${ROOT}/.toolchain/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-${HOME}/.rustup}"
if [[ ! -x "${ROOT}/target/release/jey-desktop" ]]; then
  cargo build --release -p jey-desktop --features tauri
fi
exec python3 scripts/desktop-smoke.py "$@"

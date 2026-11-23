#!/usr/bin/env bash
# Regenerate the committed TypeScript DTOs from Rust.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
export PATH="${ROOT}/.toolchain/cargo/bin:${HOME}/.cargo/bin:${PATH}"
export CARGO_HOME="${CARGO_HOME:-${ROOT}/.toolchain/cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-${HOME}/.rustup}"
export TS_RS_EXPORT_DIR="${ROOT}/frontend/lib/generated"
cargo test -p jey-core --lib export_bindings >/dev/null

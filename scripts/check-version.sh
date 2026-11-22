#!/usr/bin/env bash
# Release guard: all app versions and the git tag must agree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

cargo_version="$(awk '/^\[workspace.package\]/{flag=1;next}/^\[/{flag=0}flag&&/^version/{gsub(/"/,"",$3);print $3;exit}' Cargo.toml)"
web_version="$(node -p "require('./apps/web/package.json').version")"
desktop_version="$(node -p "require('./crates/desktop/tauri.conf.json').version")"
tag="${GITHUB_REF_NAME:-}"

printf 'cargo=%s web=%s desktop=%s tag=%s\n' "${cargo_version}" "${web_version}" "${desktop_version}" "${tag:-<none>}"

if [[ -z "${cargo_version}" || "${cargo_version}" != "${web_version}" || "${cargo_version}" != "${desktop_version}" ]]; then
    echo "Version mismatch: Cargo.toml, package.json and tauri.conf.json must match" >&2
    exit 1
fi

if [[ -n "${tag}" && "${tag}" == v* && "${tag}" != "v${cargo_version}" ]]; then
    echo "Tag ${tag} does not match version v${cargo_version}" >&2
    exit 1
fi

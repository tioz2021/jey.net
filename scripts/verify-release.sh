#!/usr/bin/env bash
# Verify a desktop release on the public VPS channel.
#
#   bash scripts/verify-release.sh v0.7.3
#   BASE_URL=https://j3ynet.site REQUIRE_WINDOWS=1 bash scripts/verify-release.sh v0.7.3
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

RAW_VERSION="${1:-${VERSION:-}}"
if [[ -z "${RAW_VERSION}" ]]; then
    echo "usage: bash scripts/verify-release.sh vX.Y.Z" >&2
    exit 1
fi
VERSION="${RAW_VERSION#v}"
BASE_URL="${BASE_URL:-https://j3ynet.site}"
BASE_URL="${BASE_URL%/}"
REQUIRE_WINDOWS="${REQUIRE_WINDOWS:-1}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

VERSION="${VERSION}" BASE_URL="${BASE_URL}" REQUIRE_WINDOWS="${REQUIRE_WINDOWS}" TMP="${TMP}" python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import sys
import urllib.request

version = os.environ["VERSION"]
base = os.environ["BASE_URL"]
require_windows = os.environ["REQUIRE_WINDOWS"] == "1"
tmp = pathlib.Path(os.environ["TMP"])


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "jey-release-verify/1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise SystemExit(f"{url}: HTTP {response.status}")
        return response.read()


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


manifest_url = f"{base}/downloads/desktop/latest.json"
manifest = json.loads(get(manifest_url))
print(f"manifest: {manifest_url}")

if manifest.get("version") != version:
    fail(f"manifest version {manifest.get('version')!r} != {version!r}")

files = manifest.get("files") or {}
required = ["linux-x86_64", "linux-x86_64-deb"]
if require_windows:
    required.append("windows-x86_64")
for key in required:
    if key not in files:
        fail(f"missing file entry: {key}")

platforms = manifest.get("platforms") or {}
for key in ["linux-x86_64"] + (["windows-x86_64"] if require_windows else []):
    entry = platforms.get(key)
    if not entry:
        fail(f"missing updater platform: {key}")
    signature = entry.get("signature", "")
    if len(signature) < 100:
        fail(f"missing/short updater signature: {key}")
    url = entry.get("url", "")
    if not url.startswith(base + "/downloads/desktop/"):
        fail(f"unexpected updater URL for {key}: {url}")

for key, entry in files.items():
    url = entry.get("url", "")
    expected_size = entry.get("size")
    expected_sha = entry.get("sha256")
    if not url.startswith(base + "/downloads/desktop/"):
        fail(f"unexpected asset URL for {key}: {url}")
    data = get(url)
    if expected_size is not None and len(data) != int(expected_size):
        fail(f"{key}: size {len(data)} != manifest {expected_size}")
    actual_sha = hashlib.sha256(data).hexdigest()
    if actual_sha != expected_sha:
        fail(f"{key}: sha256 {actual_sha} != manifest {expected_sha}")
    print(f"ok {key}: {len(data)} bytes, sha256={actual_sha}")

health = json.loads(get(f"{base}/api/v1/health"))
if health.get("version") != version:
    fail(f"health version {health.get('version')!r} != {version!r}")
print(f"ok health: {health.get('version')}")
print(f"release {version} verified")
PY

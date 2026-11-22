#!/usr/bin/env bash
# Publish one desktop release to the VPS download channel.
#
#   VERSION=0.7.1 DEPLOY_HOST=... bash scripts/publish-desktop.sh
#
# GitHub Actions supplies DEPLOY_HOST/DEPLOY_USER/SSH_KEY. Without them the
# script only stages and validates the manifest locally (DRY_RUN=1 is implied).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

VERSION="${VERSION:?set VERSION, for example 0.7.1}"
VERSION="${VERSION#v}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-target/release/bundle}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/jey_vps}"
RELEASE_URL_BASE="${RELEASE_URL_BASE:-https://j3ynet.site/downloads/desktop}"
KEEP="${KEEP:-2}"
NOTES="${NOTES:-Обновление jey.net ${VERSION}}"
STAGE=".staging/desktop-release/${VERSION}"

rm -rf "${STAGE}"
mkdir -p "${STAGE}"
find "${ARTIFACTS_DIR}" -type f \( -name "*${VERSION}*.AppImage" -o -name "*${VERSION}*.deb" -o -name "*${VERSION}*.exe" -o -name "*${VERSION}*.sig" \) -exec cp -v {} "${STAGE}/" \;
files=("${STAGE}"/*)
if [[ ${#files[@]} -eq 0 ]]; then
    echo "No desktop artifacts found under ${ARTIFACTS_DIR}" >&2
    exit 1
fi
if ! find "${STAGE}" -maxdepth 1 -type f -name '*.AppImage' | grep -q .; then
    echo "AppImage is required for the Linux download channel" >&2
    exit 1
fi
if [[ "${REQUIRE_WINDOWS:-0}" == "1" ]] && ! find "${STAGE}" -maxdepth 1 -type f -name '*.exe' | grep -q .; then
    echo "Windows NSIS installer is required for the Windows download channel" >&2
    exit 1
fi

(
  cd "${STAGE}"
  sha256sum * > SHA256SUMS.txt
)

VERSION="${VERSION}" STAGE="${STAGE}" RELEASE_URL_BASE="${RELEASE_URL_BASE}" NOTES="${NOTES}" REQUIRE_SIGNATURES="${REQUIRE_SIGNATURES:-0}" python3 - <<'PY'
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

stage = Path(os.environ["STAGE"])
version = os.environ["VERSION"]
base = os.environ["RELEASE_URL_BASE"].rstrip("/")
notes = os.environ["NOTES"]
require_signatures = os.environ.get("REQUIRE_SIGNATURES") == "1"
files = {}
platforms = {}
for path in sorted(stage.iterdir()):
    if not path.is_file() or path.name in {"latest.json", "SHA256SUMS.txt"} or path.name.endswith(".sig"):
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.suffix == ".AppImage":
        key = "linux-x86_64"
    elif path.suffix == ".exe":
        key = "windows-x86_64"
    elif path.suffix == ".deb":
        key = "linux-x86_64-deb"
    else:
        continue
    url = f"{base}/releases/{version}/{path.name}"
    files[key] = {
        "name": path.name,
        "url": url,
        "sha256": digest,
        "size": path.stat().st_size,
    }
    sig_path = stage / f"{path.name}.sig"
    if sig_path.is_file():
        platforms[key] = {
            "signature": sig_path.read_text(encoding="utf-8").strip(),
            "url": url,
        }
    elif key != "linux-x86_64-deb":
        print(f"warning: missing updater signature for {path.name}")

if require_signatures:
    missing = [key for key in files if key != "linux-x86_64-deb" and key not in platforms]
    if missing:
        raise SystemExit(f"missing updater signatures for {', '.join(missing)}")

manifest = {
    "version": version,
    "notes": notes,
    "pub_date": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "published_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "files": files,
    "platforms": platforms,
}
(stage / "latest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
PY

if [[ -z "${DEPLOY_HOST}" ]]; then
    if [[ "${REQUIRE_VPS:-0}" == "1" ]]; then
        echo "DEPLOY_HOST is empty; configure VPS_HOST/VPS_USER/VPS_SSH_KEY" >&2
        exit 1
    fi
    echo "DEPLOY_HOST is empty; manifest staged in ${STAGE}"
    exit 0
fi

SSH_OPTS=(-F /dev/null -i "${SSH_KEY}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SSH=(ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}")
SCP=(scp "${SSH_OPTS[@]}")
REMOTE_ROOT="/opt/jey/downloads/desktop"
REMOTE_STAGE="${REMOTE_ROOT}/.staging-${VERSION}-$$"

"${SSH[@]}" "mkdir -p '${REMOTE_ROOT}/releases' '${REMOTE_STAGE}'"
"${SCP[@]}" "${STAGE}"/* "${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_STAGE}/"

"${SSH[@]}" bash -s -- "${REMOTE_ROOT}" "${REMOTE_STAGE}" "${VERSION}" "${KEEP}" <<'REMOTE'
set -euo pipefail
root="$1"
stage="$2"
version="$3"
keep="$4"
cd "$stage"
sha256sum -c SHA256SUMS.txt
mkdir -p "$root/releases"
dest="$root/releases/$version"
rm -rf "$dest"
mv "$stage" "$dest"
ln -sfn "releases/$version" "$root/current.new"
mv -Tf "$root/current.new" "$root/current"
install -m 644 "$dest/latest.json" "$root/latest.json.new"
mv -f "$root/latest.json.new" "$root/latest.json"
# Keep the current and one previous release for rollback.
cd "$root/releases"
find . -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | head -n -"$keep" | xargs -r rm -rf
ls -1
REMOTE

echo "Published ${VERSION} to ${RELEASE_URL_BASE}"

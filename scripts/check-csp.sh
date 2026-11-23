#!/usr/bin/env bash
# Keep the Caddy script CSP hash in sync with the Vite theme bootstrap.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
python3 - <<'PY'
import base64
import hashlib
import pathlib
import re

html = pathlib.Path("apps/web/index.html").read_text(encoding="utf-8")
match = re.search(r"<script>(.*?)</script>", html, re.S)
if not match:
    raise SystemExit("inline theme script not found")
# Hash the exact textContent the browser sees, including surrounding newlines.
digest = base64.b64encode(hashlib.sha256(match.group(1).encode()).digest()).decode()
caddy = pathlib.Path("deploy/Caddyfile").read_text(encoding="utf-8")
expected = f"'sha256-{digest}'"
if expected not in caddy:
    raise SystemExit(f"Caddy CSP is stale: expected {expected}")
if "script-src 'self' 'unsafe-inline'" in caddy:
    raise SystemExit("Caddy CSP still allows inline scripts")
if "style-src 'self' 'unsafe-inline'" in caddy:
    raise SystemExit("Caddy CSP still allows inline styles")
print(f"csp ok: {expected}")
PY

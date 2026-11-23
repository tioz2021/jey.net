#!/usr/bin/env bash
# Fail on a catch block with neither code nor an explanatory comment.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"
python3 - <<'PY'
import pathlib
import re
import sys

bad = []
for root in ("frontend", "apps/web/src"):
    for path in pathlib.Path(root).rglob("*"):
        if path.suffix not in {".ts", ".tsx"} or "node_modules" in path.parts:
            continue
        source = path.read_text(encoding="utf-8", errors="ignore")
        for match in re.finditer(r"catch\s*(?:\([^)]*\))?\s*\{", source):
            index = match.end()
            depth = 1
            while index < len(source) and depth:
                if source[index] == "{":
                    depth += 1
                elif source[index] == "}":
                    depth -= 1
                index += 1
            body = source[match.end() : index - 1]
            has_comment = "//" in body or "/*" in body
            code = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
            code = re.sub(r"//[^\n]*", "", code).strip()
            if not code and not has_comment:
                line = source[: match.start()].count("\n") + 1
                bad.append(f"{path}:{line}")
if bad:
    print("catch without code/comment: " + ", ".join(bad), file=sys.stderr)
    raise SystemExit(1)
print("silent catch audit ok")
PY

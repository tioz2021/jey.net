#!/usr/bin/env bash
# Ratchet for critical Rust modules. Run after cargo llvm-cov --lcov.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LCOV="${COVERAGE_LCOV:-${ROOT}/coverage/lcov.info}"
BASELINE="${ROOT}/scripts/rust-coverage-baseline.json"
[[ -r "${LCOV}" ]] || { echo "rust coverage: missing ${LCOV}" >&2; exit 1; }
python3 - "${ROOT}" "${LCOV}" "${BASELINE}" <<'PY'
import json, pathlib, sys
root, lcov_path, baseline_path = map(pathlib.Path, sys.argv[1:])
baseline = json.load(open(baseline_path, encoding="utf-8"))
cur = {}; sf = None
for line in open(lcov_path, encoding="utf-8", errors="ignore"):
    line = line.rstrip("\n")
    if line.startswith("SF:"): sf = line[3:]; cur[sf] = {}
    elif sf and line.startswith(("LF:", "LH:", "FNF:", "FNH:")):
        k, v = line.split(":", 1); cur[sf][k] = int(v)

def pct(d, found, total):
    return 0.0 if not d.get(total) else d.get(found, 0) / d[total] * 100
failed = False
def check(label, lines, functions, want):
    global failed
    for metric, actual in (("lines", lines), ("functions", functions)):
        expected = float(want[metric])
        if actual + 0.01 < expected:
            print(f"rust coverage: {label} {metric} {actual:.2f}% < {expected:.2f}%")
            failed = True

lf = sum(d.get("LF", 0) for d in cur.values()); lh = sum(d.get("LH", 0) for d in cur.values())
ff = sum(d.get("FNF", 0) for d in cur.values()); fh = sum(d.get("FNH", 0) for d in cur.values())
check("total", pct({"LF": lf, "LH": lh}, "LH", "LF"), pct({"FNF": ff, "FNH": fh}, "FNH", "FNF"), baseline["total"])
by_rel = {}
for f, d in cur.items():
    try: rel = pathlib.Path(f).resolve().relative_to(root).as_posix()
    except ValueError: continue
    by_rel[rel] = d
for rel, want in baseline["files"].items():
    d = by_rel.get(rel)
    if not d:
        print(f"rust coverage: missing file {rel}"); failed = True; continue
    check(rel, pct(d, "LH", "LF"), pct(d, "FNH", "FNF"), want)
raise SystemExit(1 if failed else 0)
PY

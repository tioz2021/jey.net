#!/usr/bin/env bash
# Ratchet: critical frontend modules must not lose line/branch coverage.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUMMARY="${ROOT}/apps/web/coverage/coverage-summary.json"
BASELINE="${ROOT}/frontend/coverage-baseline.json"
[[ -r "${SUMMARY}" ]] || { echo "coverage: run npm run test:coverage first" >&2; exit 1; }
[[ -r "${BASELINE}" ]] || { echo "coverage: missing ${BASELINE}" >&2; exit 1; }

python3 - "${ROOT}" "${SUMMARY}" "${BASELINE}" <<'PY'
import json, os, sys
root, summary_path, baseline_path = sys.argv[1:]
summary = json.load(open(summary_path, encoding="utf-8"))
baseline = json.load(open(baseline_path, encoding="utf-8"))
metrics = ("statements", "branches", "functions", "lines")
failed = False

def pct(entry, metric):
    value = entry.get(metric, {}).get("pct", 0)
    return 100.0 if value == "Unknown" else float(value)

current = {}
for key, value in summary.items():
    if key == "total":
        continue
    rel = os.path.relpath(key, root)
    current[rel] = value

def check(label, entry, expected):
    global failed
    for metric in metrics:
        actual = pct(entry, metric)
        want = float(expected[metric])
        if actual + 0.01 < want:
            print(f"coverage: {label} {metric} {actual:.2f}% < baseline {want:.2f}%")
            failed = True
        else:
            print(f"coverage: {label} {metric} {actual:.2f}%")

check("total", summary["total"], baseline["total"])
for rel, expected in baseline["files"].items():
    if rel not in current:
        print(f"coverage: missing file {rel}")
        failed = True
        continue
    check(rel, current[rel], expected)
raise SystemExit(1 if failed else 0)
PY

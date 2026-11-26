#!/usr/bin/env bash
# Fails when the SPA entry/chunks grow past the agreed budget.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${ROOT}/apps/web/dist"
ENTRY_LIMIT_KB="${ENTRY_LIMIT_KB:-220}"
CHUNK_LIMIT_KB="${CHUNK_LIMIT_KB:-650}"
CSS_LIMIT_KB="${CSS_LIMIT_KB:-250}"

[[ -f "${DIST}/index.html" ]] || { echo "bundle: dist is missing" >&2; exit 1; }

entry_rel="$(python3 - "${DIST}/index.html" <<'PY'
import re, sys
html = open(sys.argv[1], encoding="utf-8").read()
match = re.search(r'assets/[^" ]+\.js', html)
print(match.group(0) if match else "")
PY
)"
[[ -n "${entry_rel}" ]] || { echo "bundle: entry script not found" >&2; exit 1; }
entry_file="${DIST}/${entry_rel}"
entry_kb=$(( $(gzip -9 -c "${entry_file}" | wc -c) / 1024 ))
printf 'bundle: entry %s KB gzip (budget %s)\n' "${entry_kb}" "${ENTRY_LIMIT_KB}"
(( entry_kb <= ENTRY_LIMIT_KB )) || { echo "bundle: entry exceeds budget" >&2; exit 1; }

largest_kb=0
largest=""
for file in "${DIST}"/assets/*.js; do
  kb=$(( $(stat -c %s "${file}") / 1024 ))
  if (( kb > largest_kb )); then largest_kb="${kb}"; largest="$(basename "${file}")"; fi
done
printf 'bundle: largest chunk %s KB (budget %s)\n' "${largest_kb}" "${CHUNK_LIMIT_KB}"
(( largest_kb <= CHUNK_LIMIT_KB )) || { echo "bundle: chunk ${largest} exceeds budget" >&2; exit 1; }

css_kb=0
for file in "${DIST}"/assets/*.css; do
  kb=$(( $(stat -c %s "${file}") / 1024 ))
  (( kb > css_kb )) && css_kb="${kb}"
done
printf 'bundle: css %s KB (budget %s)\n' "${css_kb}" "${CSS_LIMIT_KB}"
(( css_kb <= CSS_LIMIT_KB )) || { echo "bundle: css exceeds budget" >&2; exit 1; }

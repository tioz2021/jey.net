#!/usr/bin/env python3
"""Turn cargo JSON messages into GitHub annotations (CI diagnostics)."""
import json
import sys

for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    try:
        item = json.loads(line)
    except json.JSONDecodeError:
        continue
    message = item.get("message", {})
    if message.get("level") != "error":
        continue
    spans = message.get("spans") or []
    text = message.get("message", "clippy error").replace("\n", " ")
    if spans:
        span = spans[0]
        print(f"::error file={span['file_name']},line={span['line_start']},col={span['column_start']}::{text}")
    else:
        print(f"::error::{text}")

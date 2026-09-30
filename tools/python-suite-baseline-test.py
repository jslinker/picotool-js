#!/usr/bin/env python3
"""Validate the pinned upstream test baseline and reject unexpected drift."""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASELINE = json.loads((ROOT / "tools" / "python-suite-baseline.json").read_text())
PIN = json.loads((ROOT / "tools" / "oracle-pin.json").read_text())
PICOTOOL_ROOT = pathlib.Path(os.environ.get("PICOTOOL_ROOT", ROOT / "vendor" / "picotool"))
reporter = ROOT / "tools" / "python_suite_report.py"
result = subprocess.run([sys.executable, str(reporter)], env={**os.environ, "PICOTOOL_ROOT": str(PICOTOOL_ROOT), "PYTHONPATH": str(PICOTOOL_ROOT)}, text=True, capture_output=True)
if result.returncode:
    raise SystemExit(result.stderr or "python suite reporter failed")
report = json.loads(result.stdout)
revision = subprocess.check_output(["git", "-C", str(PICOTOOL_ROOT), "rev-parse", "HEAD"], text=True).strip()
if revision != PIN["revision"] or revision != BASELINE["revision"]:
    raise SystemExit(f"upstream revision mismatch: expected {PIN['revision']}, got {revision}")
summary = report["summary"]
if summary["total"] != BASELINE["total"]:
    raise SystemExit(f"upstream suite count drift: expected {BASELINE['total']}, got {summary['total']}")
for key in ("failures", "errors"):
    actual = sorted(item["id"] for item in report[key])
    expected = sorted(BASELINE["expectedFailures" if key == "failures" else "expectedErrors"])
    if actual != expected:
        raise SystemExit(f"unexpected upstream {key}: expected {expected}, got {actual}")
if report["skipped"]:
    raise SystemExit(f"unexpected upstream skips: {report['skipped']}")
expected_messages = {item: "AttributeError: 'Game' object has no attribute 'to_p8_file'" for item in BASELINE["expectedErrors"]}
for item in report["errors"]:
    if item["message"] != expected_messages[item["id"]]:
        raise SystemExit(f"unexpected baseline error for {item['id']}: {item['message']}")
print(f"upstream baseline passed: {summary['total']} tests, {len(report['errors'])} expected errors")

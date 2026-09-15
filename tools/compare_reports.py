#!/usr/bin/env python3
"""Compare JavaScript and Python picotool parity JSON reports."""

from __future__ import annotations

import argparse
import json
import pathlib


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("python_report", type=pathlib.Path)
    parser.add_argument("javascript_report", type=pathlib.Path)
    args = parser.parse_args()
    python_report = json.loads(args.python_report.read_text())
    javascript_report = json.loads(args.javascript_report.read_text())
    python_cases = {case["id"]: case for case in python_report["parity"]["cases"]}
    javascript_cases = {case["id"]: case for case in javascript_report["parity"]["cases"]}
    identifiers = sorted(set(python_cases) | set(javascript_cases))
    mismatches = [identifier for identifier in identifiers if python_cases.get(identifier) != javascript_cases.get(identifier)]
    print(json.dumps({
        "schema": "picotool-parity-comparison/1",
        "matched": not mismatches,
        "caseCount": len(identifiers),
        "mismatches": mismatches,
        "javascriptTests": javascript_report.get("tests", {}).get("summary"),
    }, indent=2))
    if mismatches:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run picotool's existing unittest suite and emit a concise JSON report."""

from __future__ import annotations

import io
import json
import os
import pathlib
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout


PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_PICOTOOL_ROOT = (PACKAGE_ROOT / "vendor" / "picotool"
                         if (PACKAGE_ROOT / "vendor" / "picotool").exists()
                         else PACKAGE_ROOT.parents[1] / "vendor" / "picotool")
PICOTOOL_ROOT = pathlib.Path(os.environ.get("PICOTOOL_ROOT", DEFAULT_PICOTOOL_ROOT))
TEST_ROOT = PICOTOOL_ROOT / "tests"
sys.path.insert(0, str(PICOTOOL_ROOT))

from pico8 import util  # noqa: E402


def issue(test, traceback: str) -> dict[str, str]:
    lines = [line for line in traceback.rstrip().splitlines() if line]
    return {
        "id": test.id(),
        "message": lines[-1] if lines else "unknown test error",
    }


def main() -> None:
    suite = unittest.defaultTestLoader.discover(
        start_dir=str(TEST_ROOT),
        pattern="*_test.py",
        top_level_dir=str(PICOTOOL_ROOT),
    )
    detail = io.StringIO()
    test_stdout = io.StringIO()
    test_stderr = io.StringIO()
    prior_write_stream = util._write_stream
    prior_error_stream = util._error_stream
    util._write_stream = test_stdout
    util._error_stream = test_stderr
    try:
        with redirect_stdout(test_stdout), redirect_stderr(test_stderr):
            result = unittest.TextTestRunner(stream=detail, verbosity=1).run(suite)
    finally:
        util._write_stream = prior_write_stream
        util._error_stream = prior_error_stream
    report = {
        "schema": "picotool-python-suite/1",
        "implementation": "python-picotool",
        "summary": {
            "total": result.testsRun,
            "passed": result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
            "failed": len(result.failures),
            "errors": len(result.errors),
            "skipped": len(result.skipped),
            "successful": result.wasSuccessful(),
        },
        "failures": [issue(test, traceback) for test, traceback in result.failures],
        "errors": [issue(test, traceback) for test, traceback in result.errors],
        "skipped": [{"id": test.id(), "reason": reason} for test, reason in result.skipped],
        "capturedOutput": test_stdout.getvalue() + test_stderr.getvalue(),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

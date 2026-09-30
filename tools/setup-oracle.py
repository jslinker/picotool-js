#!/usr/bin/env python3
"""Create and verify the pinned Python picotool oracle environment."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys

PACKAGE_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_ROOT = PACKAGE_ROOT / "vendor" / "picotool"
PIN = json.loads((PACKAGE_ROOT / "tools" / "oracle-pin.json").read_text())


def run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, **kwargs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path(os.environ.get("PICOTOOL_ROOT", DEFAULT_ROOT)))
    parser.add_argument("--venv", type=pathlib.Path, default=PACKAGE_ROOT / ".oracle-venv")
    parser.add_argument("--no-install", action="store_true", help="only verify the checkout and existing environment")
    args = parser.parse_args()
    args.venv = args.venv.resolve()
    root = args.root.resolve()
    if args.no_install and not (root / "pico8").exists():
        raise SystemExit(f"oracle checkout not found: {root}")
    if not (root / "pico8").exists():
        root.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", "--no-checkout", PIN["repository"], str(root)])
        run(["git", "-C", str(root), "checkout", PIN["revision"]])
    revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if revision != PIN["revision"]:
        raise SystemExit(f"picotool revision mismatch: expected {PIN['revision']}, got {revision}")
    dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain"], text=True).strip()
    if dirty:
        raise SystemExit(f"picotool checkout is dirty: {root}")
    if not args.no_install:
        run([sys.executable, "-m", "venv", str(args.venv)])
        python = args.venv / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
        run([str(python), "-m", "pip", "install", "--disable-pip-version-check", PIN["pypng"]])
    python = args.venv / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
    if not python.exists():
        raise SystemExit(f"oracle interpreter not found: {python}; run setup without --no-install")
    env = {**os.environ, "PICOTOOL_ROOT": str(root), "PYTHONPATH": str(root)}
    run([str(python), "-c", "import importlib.metadata; actual=importlib.metadata.version('pypng'); "
        f"assert actual == {PIN['pypng'].split('==')[1]!r}, actual; print('pypng', actual)"], env=env)
    print(f"verified picotool {revision} with {PIN['pypng']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

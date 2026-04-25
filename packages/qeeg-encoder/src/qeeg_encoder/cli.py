"""qeeg-encoder CLI: utilities for local dev and CI."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import load_settings
from .licensing.lockcheck import check_lockfile


def main() -> int:
    parser = argparse.ArgumentParser(prog="qeeg-encoder")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_lock = sub.add_parser("lockcheck", help="Validate models.lock.yaml")
    p_lock.add_argument("--path", default="configs/models.lock.yaml")

    p_cfg = sub.add_parser("config", help="Print resolved settings as JSON")
    p_cfg.add_argument("--path", default="configs/default.yaml")

    args = parser.parse_args()

    if args.cmd == "lockcheck":
        violations = check_lockfile(Path(args.path))
        if violations:
            for v in violations:
                print(f"FAIL: {v}", file=sys.stderr)
            return 1
        print(f"OK: {args.path}")
        return 0

    if args.cmd == "config":
        s = load_settings(args.path)
        print(s.model_dump_json(indent=2))
        return 0

    return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


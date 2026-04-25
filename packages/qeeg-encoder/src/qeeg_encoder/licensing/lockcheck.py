"""CI gate: validate configs/models.lock.yaml.

Fails the build if any model has a non-permissive license, or if any banned
model is present.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

PERMISSIVE = {"Apache-2.0", "MIT", "BSD-3-Clause", "BSD-2-Clause", "ISC"}
BANNED_LICENSE_TOKENS = ("NC", "NonCommercial", "GPL-3", "AGPL")
BANNED_MODELS = {"tribe-v2"}


class LockfileViolation(RuntimeError):
    pass


def check_lockfile(path: Path) -> list[str]:
    """Return a list of violation messages. Empty list = pass."""
    if not path.exists():
        return [f"missing lockfile: {path}"]

    data = yaml.safe_load(path.read_text())
    violations: list[str] = []

    for entry in data.get("models", []):
        mid = entry.get("id", "<unknown>")
        license_str = str(entry.get("license", ""))
        if mid in BANNED_MODELS:
            violations.append(f"banned model present: {mid}")
        if license_str not in PERMISSIVE:
            violations.append(f"{mid}: non-permissive license '{license_str}'")
        for token in BANNED_LICENSE_TOKENS:
            if token in license_str:
                violations.append(f"{mid}: license contains banned token '{token}'")

    for banned in data.get("banned", []):
        # Sanity: banned section must list known offenders
        if banned.get("id") not in BANNED_MODELS:
            violations.append(f"banned-list entry not in deny set: {banned.get('id')}")

    return violations


def main() -> int:  # pragma: no cover - CLI
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("configs/models.lock.yaml")
    violations = check_lockfile(path)
    if violations:
        for v in violations:
            print(f"FAIL: {v}", file=sys.stderr)
        return 1
    print(f"OK: {path} passes license lock check")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


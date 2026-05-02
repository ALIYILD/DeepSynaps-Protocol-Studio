#!/usr/bin/env python3
"""Lint rule: routers may not import ``app.persistence.models`` directly.

Architect Rec #8 PR-A. Routers should fetch persistence data through
``app.repositories`` instead of touching SQLAlchemy models directly. This
script walks every ``apps/api/app/routers/*.py`` file with the standard
``ast`` module and fails (exit code 1) when a violation is found.

Allowed patterns
----------------
* Imports inside ``if TYPE_CHECKING:`` guards. These are erased at runtime
  and are the canonical Python idiom for type-only references; banning
  them would force routers to repeat type stubs and add no architectural
  value.
* Files explicitly listed in ``tools/router_no_models_allowlist.txt``.
  The allowlist is frozen at the current set of violators so the lint
  passes on day one. Future PRs migrate routers off the list one-by-one;
  removing a router from the file is part of that PR.

The script is intentionally dependency-free so it can run in any minimal
CI image (and locally) without requiring a virtualenv.
"""

from __future__ import annotations

import ast
import sys
from collections.abc import Iterable, Iterator
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTERS_DIR = REPO_ROOT / "apps" / "api" / "app" / "routers"
ALLOWLIST_PATH = REPO_ROOT / "tools" / "router_no_models_allowlist.txt"

BANNED_MODULE = "app.persistence.models"


def load_allowlist(path: Path) -> set[str]:
    """Read the frozen allowlist into a set of POSIX-style relative paths."""
    if not path.exists():
        return set()
    entries: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        entries.add(line)
    return entries


def iter_router_files(routers_dir: Path) -> Iterator[Path]:
    """Yield every ``*.py`` router file (sorted for stable output)."""
    if not routers_dir.exists():
        return
    for path in sorted(routers_dir.rglob("*.py")):
        if path.name == "__init__.py":
            continue
        yield path


def _is_banned_import(node: ast.AST) -> bool:
    """Return True if ``node`` is a runtime import of ``app.persistence.models``."""
    if isinstance(node, ast.ImportFrom):
        # ``from app.persistence.models import X`` (level == 0)
        if node.level == 0 and node.module == BANNED_MODULE:
            return True
    elif isinstance(node, ast.Import):
        # ``import app.persistence.models`` (possibly with alias)
        for alias in node.names:
            if alias.name == BANNED_MODULE:
                return True
    return False


def _is_type_checking_guard(node: ast.AST) -> bool:
    """Return True if ``node`` is an ``if TYPE_CHECKING:`` block.

    Recognises both ``TYPE_CHECKING`` (the common ``from typing import
    TYPE_CHECKING`` style) and ``typing.TYPE_CHECKING`` (the qualified
    style). The guard's contents are not linted.
    """
    if not isinstance(node, ast.If):
        return False
    test = node.test
    if isinstance(test, ast.Name) and test.id == "TYPE_CHECKING":
        return True
    if (
        isinstance(test, ast.Attribute)
        and test.attr == "TYPE_CHECKING"
        and isinstance(test.value, ast.Name)
        and test.value.id == "typing"
    ):
        return True
    return False


def find_violations(path: Path) -> list[tuple[int, str]]:
    """Return ``(lineno, source_snippet)`` tuples for each violation in ``path``."""
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        # A syntax error is itself a problem worth surfacing, but it is
        # not what this lint is about — let the normal test suite catch
        # it. Skip the file rather than crashing the whole lint run.
        print(f"warning: could not parse {path}: {exc}", file=sys.stderr)
        return []

    violations: list[tuple[int, str]] = []
    source_lines = source.splitlines()

    def walk(nodes: Iterable[ast.AST]) -> None:
        for node in nodes:
            if _is_type_checking_guard(node):
                # Skip the body of TYPE_CHECKING blocks entirely; still
                # walk the ``orelse`` branch (the ``else:``), which IS
                # runtime code.
                walk(node.orelse)
                continue
            if _is_banned_import(node):
                snippet = (
                    source_lines[node.lineno - 1].strip()
                    if 0 < node.lineno <= len(source_lines)
                    else ""
                )
                violations.append((node.lineno, snippet))
            # Recurse so we also catch imports nested inside functions,
            # try/except blocks, etc. (but not inside TYPE_CHECKING
            # guards — handled above).
            walk(ast.iter_child_nodes(node))

    walk(ast.iter_child_nodes(tree))
    return violations


def relative_posix(path: Path) -> str:
    """Return ``path`` relative to the repo root in POSIX form.

    Falls back to the absolute POSIX path when ``path`` lives outside the
    repo (e.g. inside a pytest tmp directory used by the test suite).
    """
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    routers_dir = ROUTERS_DIR
    allowlist_path = ALLOWLIST_PATH

    # Optional ``--routers-dir`` / ``--allowlist`` overrides exist for the
    # test suite, which exercises the linter against synthetic fixtures.
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--routers-dir" and i + 1 < len(argv):
            routers_dir = Path(argv[i + 1]).resolve()
            i += 2
            continue
        if arg == "--allowlist" and i + 1 < len(argv):
            allowlist_path = Path(argv[i + 1]).resolve()
            i += 2
            continue
        if arg in ("-h", "--help"):
            print(__doc__)
            return 0
        print(f"unknown argument: {arg}", file=sys.stderr)
        return 2

    allowlist = load_allowlist(allowlist_path)

    failures: list[str] = []
    checked = 0
    for path in iter_router_files(routers_dir):
        checked += 1
        rel = relative_posix(path)
        violations = find_violations(path)
        if not violations:
            continue
        if rel in allowlist:
            # Frozen allowlist — known-bad routers we have not migrated
            # yet. Do not fail the build for them.
            continue
        for lineno, snippet in violations:
            failures.append(f"{rel}:{lineno}: {snippet}")

    if failures:
        print(
            "router-no-models lint: routers must import via app.repositories,\n"
            "not directly from app.persistence.models. The following imports\n"
            "are not on the frozen allowlist (tools/router_no_models_allowlist.txt):\n",
            file=sys.stderr,
        )
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        print(
            f"\n{len(failures)} violation(s) in {checked} router file(s).",
            file=sys.stderr,
        )
        return 1

    print(
        f"router-no-models lint: OK ({checked} router file(s) checked, "
        f"{len(allowlist)} on frozen allowlist).",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

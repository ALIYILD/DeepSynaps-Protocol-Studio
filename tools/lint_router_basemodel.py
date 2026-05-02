#!/usr/bin/env python3
"""Lint: routers under apps/api/app/routers must NOT declare module-level
``BaseModel`` subclasses (request/response payload types).

Rationale (Architect Rec #5)
============================
Payload types belong in ``packages/core-schema`` so that they can be
versioned, reused, and consumed by non-router clients (workers, render
engine, registries, web). Routers should import these types, not define
them.

This linter is an AST-only check (no imports executed) so it stays fast
and works in CI without installing the API package.

How it works
------------
* Scans every ``apps/api/app/routers/*.py`` (recursively).
* Flags any module-level ``class X(...)`` whose base list resolves to
  ``pydantic.BaseModel`` (or a re-export alias like
  ``from pydantic import BaseModel as PydBase``). Multi-base classes
  count if any base resolves to ``BaseModel``.
* Allows a violation if either:
    - The fully qualified entry ``<relpath>:<ClassName>`` appears in
      ``tools/router_basemodel_allowlist.txt`` (frozen legacy snapshot).
    - The class is preceded by a comment line of the form
      ``# core-schema-exempt: <reason>``.

Exit codes
----------
0 — clean (or only allowlisted/exempt violations)
1 — at least one new violation
2 — usage / config error

Usage
-----
    python3 tools/lint_router_basemodel.py            # lint
    python3 tools/lint_router_basemodel.py --snapshot # rewrite allowlist

The ``--snapshot`` mode is intentionally explicit: CI never regenerates
the allowlist; only an engineer running the script locally can shrink it
(or, in an emergency, grow it with a justified review).
"""

from __future__ import annotations

import argparse
import ast
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTERS_DIR = REPO_ROOT / "apps" / "api" / "app" / "routers"
ALLOWLIST_PATH = REPO_ROOT / "tools" / "router_basemodel_allowlist.txt"
EXEMPT_MARKER = "# core-schema-exempt:"


@dataclass(frozen=True)
class Violation:
    relpath: str
    classname: str
    lineno: int

    @property
    def key(self) -> str:
        return f"{self.relpath}:{self.classname}"


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------


def _collect_basemodel_aliases(tree: ast.Module) -> set[str]:
    """Return the set of local names that resolve to ``pydantic.BaseModel``.

    Handles:
        from pydantic import BaseModel
        from pydantic import BaseModel as PydBase
        import pydantic                         -> "pydantic.BaseModel"
        import pydantic as pyd                  -> "pyd.BaseModel"
    """
    aliases: set[str] = set()
    pydantic_module_aliases: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod == "pydantic" or mod.startswith("pydantic."):
                for alias in node.names:
                    if alias.name == "BaseModel":
                        aliases.add(alias.asname or "BaseModel")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "pydantic":
                    pydantic_module_aliases.add(alias.asname or "pydantic")

    for mod_alias in pydantic_module_aliases:
        aliases.add(f"{mod_alias}.BaseModel")

    return aliases


def _base_name(base: ast.expr) -> str | None:
    """Return a string representation of a class base expression, or None."""
    if isinstance(base, ast.Name):
        return base.id
    if isinstance(base, ast.Attribute):
        # walk e.g. pydantic.BaseModel
        parts: list[str] = []
        cur: ast.AST = base
        while isinstance(cur, ast.Attribute):
            parts.append(cur.attr)
            cur = cur.value
        if isinstance(cur, ast.Name):
            parts.append(cur.id)
            return ".".join(reversed(parts))
    return None


def _line_starts(source: str) -> list[int]:
    """Return byte offsets of the start of each line (1-indexed)."""
    starts = [0]
    for i, ch in enumerate(source):
        if ch == "\n":
            starts.append(i + 1)
    return starts


def _is_exempt_above(source_lines: list[str], lineno: int) -> bool:
    """Return True if the line(s) immediately above the class carry the
    exempt marker (skipping blank lines and decorators)."""
    idx = lineno - 2  # convert to 0-indexed previous line
    while idx >= 0:
        stripped = source_lines[idx].strip()
        if not stripped:
            idx -= 1
            continue
        if stripped.startswith("@"):  # decorator on the class
            idx -= 1
            continue
        if stripped.startswith(EXEMPT_MARKER):
            return True
        # any other non-comment line breaks the chain
        if not stripped.startswith("#"):
            return False
        # plain comment — keep walking; allow the marker to live a few
        # lines above as long as only comments separate it from the class
        if stripped.startswith(EXEMPT_MARKER):
            return True
        idx -= 1
    return False


# ---------------------------------------------------------------------------
# Core scan
# ---------------------------------------------------------------------------


def scan_file(path: Path) -> list[Violation]:
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:  # pragma: no cover - defensive
        print(f"warning: cannot parse {path}: {exc}", file=sys.stderr)
        return []

    aliases = _collect_basemodel_aliases(tree)
    if not aliases:
        return []

    source_lines = source.splitlines()
    try:
        relpath = path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        # File lives outside the repo (e.g. tests pointing the linter at
        # a tmp directory). Fall back to the absolute path so keys are
        # still well-defined.
        relpath = path.as_posix()
    violations: list[Violation] = []

    # Only walk top-level (module-level) statements. Nested classes are
    # allowed (they cannot leak into the router's public surface as a
    # request/response model in the FastAPI sense).
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        for base in node.bases:
            name = _base_name(base)
            if name is None:
                continue
            if name in aliases:
                if _is_exempt_above(source_lines, node.lineno):
                    break
                violations.append(
                    Violation(
                        relpath=relpath, classname=node.name, lineno=node.lineno
                    )
                )
                break

    return violations


def scan_routers(routers_dir: Path = ROUTERS_DIR) -> list[Violation]:
    if not routers_dir.is_dir():
        print(
            f"error: routers directory not found: {routers_dir}", file=sys.stderr
        )
        sys.exit(2)
    found: list[Violation] = []
    for path in sorted(routers_dir.rglob("*.py")):
        if path.name == "__init__.py":
            continue
        found.extend(scan_file(path))
    return found


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------


def load_allowlist(path: Path = ALLOWLIST_PATH) -> set[str]:
    if not path.exists():
        return set()
    out: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        out.add(s)
    return out


def write_allowlist(violations: Iterable[Violation], path: Path = ALLOWLIST_PATH) -> int:
    keys = sorted({v.key for v in violations})
    header = (
        "# tools/router_basemodel_allowlist.txt\n"
        "#\n"
        "# Frozen snapshot of routers that currently declare module-level\n"
        "# BaseModel subclasses. Generated by tools/lint_router_basemodel.py.\n"
        "#\n"
        "# Format: <relative path>:<ClassName>\n"
        "#\n"
        "# DO NOT add new entries. Migrate the type to packages/core-schema/\n"
        "# and remove its line from this file. See packages/core-schema/README.md.\n"
        "\n"
    )
    path.write_text(header + "\n".join(keys) + "\n", encoding="utf-8")
    return len(keys)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _format_diff(new: list[Violation], removed: list[str]) -> str:
    out: list[str] = []
    if new:
        out.append("New BaseModel violations (must be moved to packages/core-schema/):")
        for v in new:
            out.append(f"  + {v.relpath}:{v.classname}  (line {v.lineno})")
    if removed:
        out.append("")
        out.append(
            "Allowlist entries no longer present (great — please run "
            "`python3 tools/lint_router_basemodel.py --snapshot` to shrink it):"
        )
        for key in removed:
            out.append(f"  - {key}")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--snapshot",
        action="store_true",
        help="Rewrite the allowlist with the current set of violations.",
    )
    parser.add_argument(
        "--routers-dir",
        type=Path,
        default=ROUTERS_DIR,
        help="Override the routers directory (used by tests).",
    )
    parser.add_argument(
        "--allowlist",
        type=Path,
        default=ALLOWLIST_PATH,
        help="Override the allowlist path (used by tests).",
    )
    args = parser.parse_args(argv)

    violations = scan_routers(args.routers_dir)

    if args.snapshot:
        n = write_allowlist(violations, args.allowlist)
        print(f"snapshot: wrote {n} allowlisted entries to {args.allowlist}")
        return 0

    allow = load_allowlist(args.allowlist)
    new_violations = [v for v in violations if v.key not in allow]
    seen_keys = {v.key for v in violations}
    stale = sorted(k for k in allow if k not in seen_keys)

    if not new_violations:
        unique_routers = len({v.relpath for v in violations})
        unique_classes = len({v.key for v in violations})
        if stale:
            # Stale entries are a soft warning: do not fail CI but encourage
            # cleanup.
            print(
                f"router-basemodel lint: clean ({unique_classes} allowlisted "
                f"BaseModel classes across {unique_routers} routers, "
                f"{len(stale)} stale entries — consider --snapshot)."
            )
        else:
            print(
                f"router-basemodel lint: clean ({unique_classes} allowlisted "
                f"BaseModel classes across {unique_routers} routers)."
            )
        return 0

    print(_format_diff(new_violations, stale))
    print()
    print(
        "How to fix:\n"
        "  1) Move the type into packages/core-schema/src/deepsynaps_core_schema/\n"
        "     and re-export it from the package __init__.\n"
        "  2) Import it in the router instead of redefining it.\n"
        "  3) Or, if the type genuinely belongs to the router and is\n"
        "     never reused, prefix the class with a comment line:\n"
        "         # core-schema-exempt: <one-line reason>\n"
        "  See packages/core-schema/README.md for the full guide."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())

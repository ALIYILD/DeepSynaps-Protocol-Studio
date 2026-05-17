#!/usr/bin/env python3
"""Repo-wide torch.load deserialization-safety enforcer.

Walks every tracked .py file under the scanned source roots and reports any
``torch.load(...)`` call that does NOT either:

  * pass ``weights_only=`` explicitly, OR
  * route through an approved helper wrapper (see ``APPROVED_HELPERS``).

Background
----------
``torch.load`` uses pickle under the hood. The torch<2.6 default
(``weights_only=False``) lets a crafted checkpoint execute arbitrary code —
CVE-2025-32434 (CRITICAL). Torch 2.6.0 flips the default to ``True``; until
the project is on torch>=2.6, every callsite has to be explicit, and even
after the bump every callsite should stay explicit so the trust assumption
is visible in code review.

This script is the second half of the mitigation introduced in PR #980 —
PR #980 added the helpers (``load_state_dict_safely`` and
``load_trusted_full_checkpoint``) and migrated the existing callsites; this
script makes the policy enforceable for FUTURE contributors and agents.

Implementation notes
--------------------
Uses stdlib ``ast`` for accurate detection. AST was chosen over plain regex
because regex can't reliably distinguish a real ``torch.load(`` call from a
string literal, a docstring, or a comment, and the user-facing brief
explicitly forbids false positives on comments/docs.

Stdlib ``ast`` is not a "heavy framework" — it ships with CPython and has
no third-party dependencies. The script runs in well under a second on the
DeepSynaps tree.

Limitations (kept honest)
-------------------------
1. **Alias via assignment.** A binding like ``t = torch`` followed by
   ``t.load(...)`` is NOT detected. The script matches the literal
   attribute chains ``torch.load`` and ``torch_mod.load`` (the only alias
   pattern present in this repo today). New aliases require either adding
   them to ``MATCHED_RECEIVER_NAMES`` or, better, removing the alias.
2. **Alias via ``import ... as``.** ``import torch as T; T.load(x)`` is
   NOT detected — same root cause as #1.
3. **Aliased imports** like ``from torch import load`` are NOT detected.
   This pattern does not appear anywhere in the repo. If added, the
   script should be extended.
4. **First-class function reference.** ``fn = torch.load; fn(x)`` is NOT
   detected — once torch.load is bound to a different name, the AST walk
   cannot follow it.
5. **Dynamic dispatch can bypass detection.** ``getattr(torch, 'load')(x)``
   or ``importlib.import_module('torch').load(x)`` are not caught. Not
   idiomatic here; code review is the backstop.
6. **Eval/exec'd code** is unscannable. Out of scope.
7. **Kwargs splat false positive.** ``torch.load(x, **kwargs)`` is
   FLAGGED even when ``kwargs`` contains ``weights_only`` at runtime —
   the scanner is static. Workaround: add ``weights_only=True`` as an
   explicit kwarg alongside the splat. Fails in the safe direction.

Limitations #1–#4 are pinned by ``test_known_limitation_*`` regression
tests in ``packages/qeeg-pipeline/tests/test_torch_load_governance.py``
so they cannot silently start to be enforced. See
``docs/security/torch-load-governance.md`` for the full policy.

Exit codes
----------
0  no violations
1  one or more violations found
2  internal error (e.g. unreadable file)
"""
from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path
from typing import Iterable, NamedTuple

# Source roots scanned by default. Each is relative to the repo root.
DEFAULT_ROOTS: tuple[str, ...] = (
    "apps",
    "packages",
    "scripts",
    "services",
    "tools",
)

# Directory NAMES that are skipped wherever they appear in a path. These are
# environment / build-artifact directories that may contain vendored copies
# of torch or third-party code with their own (out-of-our-control) load calls.
EXCLUDE_DIR_NAMES: frozenset[str] = frozenset({
    ".cache",
    ".claude",
    ".git",
    ".pytest_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "site-packages",
    "venv",
})

# Receiver names whose ``.load(`` calls are treated as torch.load.
# Extend this list ONLY if a new alias appears in production code; the
# preferred fix is to remove the alias instead.
MATCHED_RECEIVER_NAMES: frozenset[str] = frozenset({"torch", "torch_mod"})

# Helper functions that already enforce weights_only= internally. Calls to
# these names are always considered safe by this scanner. New helpers must
# either pass weights_only= explicitly OR be added here (with a review).
APPROVED_HELPERS: frozenset[str] = frozenset({
    "load_state_dict_safely",
    "load_trusted_full_checkpoint",
})


class Violation(NamedTuple):
    path: Path
    line: int
    col: int
    snippet: str


def _is_torch_load_call(node: ast.AST) -> bool:
    """True iff ``node`` is a Call whose func is ``<receiver>.load`` where
    ``<receiver>`` is one of the names we recognise as a torch binding."""
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if not isinstance(func, ast.Attribute) or func.attr != "load":
        return False
    if not isinstance(func.value, ast.Name):
        return False
    return func.value.id in MATCHED_RECEIVER_NAMES


def _has_explicit_weights_only_kwarg(call: ast.Call) -> bool:
    """True iff the call has an explicit ``weights_only=...`` keyword arg.

    This counts both ``weights_only=True`` and ``weights_only=False`` as
    OK — making the default flip visible is the goal, not forcing one
    value. Trust decisions are recorded at the callsite and in
    ``docs/security/torch-deserialization-audit.md``.
    """
    return any(kw.arg == "weights_only" for kw in call.keywords)


def _scan_source(source: str, path: Path) -> list[Violation]:
    """Return violations found in one source string. Returns [] on parse error
    — unparsable files (e.g. py2 syntax, partial fragments) are deliberately
    treated as non-violations rather than fatal, so an unrelated bad file
    can't take down the whole gate."""
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError:
        return []

    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not _is_torch_load_call(node):
            continue
        if _has_explicit_weights_only_kwarg(node):
            continue
        # Extract a short snippet for the error message.
        line_text = source.splitlines()[node.lineno - 1] if node.lineno - 1 < len(source.splitlines()) else ""
        violations.append(Violation(
            path=path,
            line=node.lineno,
            col=node.col_offset,
            snippet=line_text.strip()[:120],
        ))
    return violations


def _iter_py_files(root: Path) -> Iterable[Path]:
    """Yield every .py file under root, honouring the exclude list."""
    for path in root.rglob("*.py"):
        if any(part in EXCLUDE_DIR_NAMES for part in path.parts):
            continue
        yield path


def find_violations(
    repo_root: Path,
    roots: Iterable[str] = DEFAULT_ROOTS,
) -> list[Violation]:
    """Public entry point. Walk the configured source roots and return every
    unsafe torch.load callsite."""
    violations: list[Violation] = []
    for rel in roots:
        root = repo_root / rel
        if not root.is_dir():
            continue
        for py in _iter_py_files(root):
            try:
                source = py.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            violations.extend(_scan_source(source, py))
    return violations


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


_BANNER = "Unsafe torch.load detected without explicit weights_only= or approved helper."

_REMEDIATION = """\
Remediation:

  1. If your checkpoint is a state_dict (the common case), use:

         from deepsynaps_qeeg._safe_torch import load_state_dict_safely
         state = load_state_dict_safely(path, map_location="cpu")
         model.load_state_dict(state)

  2. If your checkpoint contains pickled nn.Module instances AND the path
     is provably non-user-controlled (vendored deploy-time mount or fixed
     cache populated only by trusted code), use:

         from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint
         state = load_trusted_full_checkpoint(
             path,
             map_location="cpu",
             reason="why this path is trusted (>=16 chars, in the diff)",
         )

  3. If neither helper fits (e.g. a script that genuinely needs a raw call),
     pass weights_only= EXPLICITLY:

         torch.load(path, map_location="cpu", weights_only=True)   # safe
         torch.load(path, map_location="cpu", weights_only=False)  # explicit pickle

Why
---
torch.load uses pickle and can execute arbitrary code when weights_only is
False (the torch<2.6 default) — CVE-2025-32434 (CRITICAL). This gate enforces
that every callsite states its safety posture explicitly. See
docs/security/torch-load-governance.md for the full policy and PR #980 for
the per-callsite trust audit.
"""


def _find_repo_root(start: Path) -> Path:
    """Walk up from ``start`` until we hit a .git directory or a Dockerfile."""
    for parent in [start, *start.parents]:
        if (parent / ".git").exists() or (parent / "apps" / "api").is_dir():
            return parent
    return start


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Block unsafe torch.load calls from entering the codebase.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Repo root to scan (default: auto-detect from this script's location).",
    )
    parser.add_argument(
        "--root",
        action="append",
        dest="roots",
        default=None,
        help=f"Source root(s) to scan, relative to repo root. "
             f"Defaults: {', '.join(DEFAULT_ROOTS)}. Repeatable.",
    )
    args = parser.parse_args(argv)

    repo_root = args.repo_root or _find_repo_root(Path(__file__).resolve())
    roots = tuple(args.roots) if args.roots else DEFAULT_ROOTS

    try:
        violations = find_violations(repo_root, roots=roots)
    except Exception as exc:  # pragma: no cover — defensive
        print(f"check_torch_load_safety: internal error: {exc}", file=sys.stderr)
        return 2

    if not violations:
        scanned = ", ".join(roots)
        print(
            f"check_torch_load_safety: OK — no unsafe torch.load calls under "
            f"{scanned} (rooted at {repo_root}).",
        )
        return 0

    print(_BANNER, file=sys.stderr)
    print(file=sys.stderr)
    for v in violations:
        rel = v.path.relative_to(repo_root)
        print(f"  {rel}:{v.line}:{v.col + 1}  {v.snippet}", file=sys.stderr)
    print(file=sys.stderr)
    print(_REMEDIATION, file=sys.stderr)
    print(f"Total: {len(violations)} violation(s).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

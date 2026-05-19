#!/usr/bin/env python3
"""Concurrent-session policy enforcement — wholesale-rewrite gate.

Closes the automation gap called out in
``docs/engineering/runtime-critical-surface-protection.md``: "stabilization-
sensitive subset is enforced by human review at the PR gate, not by CI."

Triggered by the 2026-05-18 Intelligent Synaps v4 incident, where a single
direct-to-main commit (``6d495ce4``) rewrote ``apps/api/app/main.py``
(-1153 +557, 96% file rewrite), removed ``/healthz`` and ``/api/v1/health``,
and silently activated a parallel 38-file adapter codebase. Recovery
required 4 PRs (#1041–#1044) and ~29 000 line deletions.

What this checker enforces
==========================

For every commit in the PR range (``<base>..<head>``) the script flags
any commit that, on a *protected runtime file*, deletes both:

  * at least ``REWRITE_THRESHOLD_DELETIONS`` lines (default 400) AND
  * at least ``REWRITE_THRESHOLD_PCT`` of the file's previous line count
    (default 40%).

Combined deletions ≥ 40% of a 1700-line file is a wholesale rewrite, not
a maintenance edit. ``main.py`` history shows healthy changes sit well
under both thresholds.

How to override
===============

If a wholesale rewrite is genuinely intended (e.g., a planned migration
to FastAPI v3 lifespan, an architecture-reversal scope), add the marker
``concurrent-session-policy: allow=wholesale-rewrite`` to the commit
message body. The script honours the marker per commit. Reviewers see
the marker in the diff and can reject if the override is not justified.

Stdlib only. Invokes ``git`` via subprocess.

Local use
=========

    # Default: scan the current branch against origin/main
    python3 scripts/check_concurrent_session_policy.py

    # Scan a specific range
    python3 scripts/check_concurrent_session_policy.py --base origin/main --head HEAD

    # Scan one commit (used by tests)
    python3 scripts/check_concurrent_session_policy.py --commit 6d495ce4
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Iterable, List, Optional


# Protected runtime files. Single-commit wholesale rewrites of these have
# repeatedly broken production. The list is intentionally narrow — every
# entry here MUST have an incident behind it; speculative protection
# causes false-positive friction without value.
PROTECTED_RUNTIME_FILES: frozenset = frozenset(
    {
        # Backend HTTP root; v4 incident (2026-05-18).
        "apps/api/app/main.py",
        # Frontend bootstrap router; concurrent-session reverter incidents
        # (2026-05-18 hotfix #1034).
        "apps/web/src/app.js",
        # API client; cursor-buffer-revert + dedup hotfix (2026-05-18).
        "apps/web/src/api.js",
        # Stabilization-sensitive page renderers explicitly named as
        # "freeze" candidates in the post-salvage governance work.
        "apps/web/src/pages-knowledge-explorer.js",
        "apps/web/src/pages-brain-twin.js",
        "apps/web/src/pages-agents.js",
    }
)


# Tunables. Conservative defaults — calibrated against the v4 commit
# (1153 deletions / 96% of file) and ordinary maintenance edits in
# the last 60 days (none hit either threshold).
REWRITE_THRESHOLD_DELETIONS = 400
REWRITE_THRESHOLD_PCT = 0.40


ALLOW_MARKER_RE = re.compile(
    r"concurrent-session-policy:\s*allow=([a-z0-9,\-]+)", re.IGNORECASE
)


@dataclass(frozen=True)
class Violation:
    commit: str
    file_path: str
    deletions: int
    prev_line_count: int
    pct_deleted: float

    def render(self) -> str:
        return (
            f"  FAIL {self.commit[:10]} {self.file_path}\n"
            f"        deletions={self.deletions}  prev_lines={self.prev_line_count}  "
            f"pct={self.pct_deleted:.0%}\n"
            f"        Threshold: >={REWRITE_THRESHOLD_DELETIONS} deletions AND "
            f">={int(REWRITE_THRESHOLD_PCT * 100)}% of file."
        )


def _git(*args: str) -> str:
    """Run ``git`` with the given args, return stdout text. Raises on non-zero."""
    proc = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout


def _git_text_or_empty(*args: str) -> str:
    """Run ``git``; return empty string on non-zero exit rather than raising.

    Used for queries that legitimately fail (e.g., a file didn't exist
    at the parent commit, ``git show <sha>^:<path>`` errors)."""
    proc = subprocess.run(
        ["git", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout


def _list_commits(base: str, head: str) -> List[str]:
    """Return commit SHAs in ``<base>..<head>`` in chronological order."""
    out = _git_text_or_empty("log", "--format=%H", "--reverse", f"{base}..{head}")
    if not out.strip():
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]


def _commit_message(sha: str) -> str:
    return _git_text_or_empty("log", "-1", "--format=%B", sha)


def _allowed_rules(commit_msg: str) -> set:
    rules: set = set()
    for match in ALLOW_MARKER_RE.finditer(commit_msg):
        for token in match.group(1).split(","):
            token = token.strip().lower()
            if token:
                rules.add(token)
    return rules


def _changed_files_with_stats(sha: str) -> List[tuple]:
    """Return [(adds, dels, path), ...] for the named commit using --numstat."""
    out = _git_text_or_empty("show", "--numstat", "--format=", sha)
    rows: List[tuple] = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        adds_s, dels_s, path = parts[0], parts[1], "\t".join(parts[2:])
        # Binary files show '-' for both counts; skip.
        try:
            adds = int(adds_s)
            dels = int(dels_s)
        except ValueError:
            continue
        rows.append((adds, dels, path))
    return rows


def _file_line_count_before(sha: str, path: str) -> int:
    """Return the line count of ``path`` at commit ``sha^`` (the parent).

    Returns 0 if the file did not exist at the parent (i.e., this commit
    added the file). 0 short-circuits the percentage check because there
    is nothing to "rewrite" — adding a new file is not a rewrite.
    """
    text = _git_text_or_empty("show", f"{sha}^:{path}")
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def scan_commit(sha: str) -> List[Violation]:
    """Detect wholesale-rewrite violations introduced by a single commit."""
    commit_msg = _commit_message(sha)
    allowed = _allowed_rules(commit_msg)
    if "wholesale-rewrite" in allowed:
        return []

    violations: List[Violation] = []
    for _adds, dels, path in _changed_files_with_stats(sha):
        if path not in PROTECTED_RUNTIME_FILES:
            continue
        if dels < REWRITE_THRESHOLD_DELETIONS:
            continue
        prev_lines = _file_line_count_before(sha, path)
        if prev_lines <= 0:
            # File added in this commit (no prior version) — not a rewrite.
            continue
        pct = dels / prev_lines
        if pct >= REWRITE_THRESHOLD_PCT:
            violations.append(
                Violation(
                    commit=sha,
                    file_path=path,
                    deletions=dels,
                    prev_line_count=prev_lines,
                    pct_deleted=pct,
                )
            )
    return violations


def scan_range(base: str, head: str) -> List[Violation]:
    violations: List[Violation] = []
    for sha in _list_commits(base, head):
        violations.extend(scan_commit(sha))
    return violations


def _parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Concurrent-session policy: wholesale-rewrite gate."
    )
    p.add_argument(
        "--base",
        default="origin/main",
        help="Base ref to compare from (default: origin/main)",
    )
    p.add_argument(
        "--head",
        default="HEAD",
        help="Head ref to compare to (default: HEAD)",
    )
    p.add_argument(
        "--commit",
        default=None,
        help="Scan a single commit SHA instead of a range (used by tests).",
    )
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])

    if args.commit:
        commits = [args.commit]
        violations = scan_commit(args.commit)
    else:
        commits = _list_commits(args.base, args.head)
        violations = scan_range(args.base, args.head)

    if not commits:
        print("concurrent-session-policy: nothing to scan.", file=sys.stderr)
        return 0

    if violations:
        print(
            "Concurrent-session policy — VIOLATIONS "
            "(wholesale rewrites of protected runtime files):",
            file=sys.stderr,
        )
        for v in violations:
            print(v.render(), file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Why this matters: single-commit wholesale rewrites of these "
            "files have repeatedly broken production (most recently the "
            "2026-05-18 Intelligent Synaps v4 incident — see "
            "docs/engineering/concurrent-session-policy.md).",
            file=sys.stderr,
        )
        print("", file=sys.stderr)
        print(
            "Fix: split the change into incremental commits, OR if the "
            "rewrite is intentional add\n"
            "    concurrent-session-policy: allow=wholesale-rewrite\n"
            "to the commit message body. Reviewers will see the marker "
            "in the diff and can approve or reject.",
            file=sys.stderr,
        )
        return 1

    print(
        f"concurrent-session-policy: clean ({len(commits)} commits scanned, "
        f"{len(PROTECTED_RUNTIME_FILES)} protected files).",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Runtime-hygiene gate.

Enforces docs/engineering/runtime-hygiene-policy.md: test-only imports and
test scaffolding must not appear at module scope in runtime code paths.
This script is invoked by .github/workflows/runtime-hygiene-check.yml on
every PR.

Stdlib only. Walks the configured runtime roots, filters out test/excluded
paths, and reports any forbidden pattern as `path:line:pattern -> snippet`.
Exits 1 on any violation.

Local use:

    python3 scripts/check_runtime_hygiene.py            # check whole repo
    python3 scripts/check_runtime_hygiene.py path1 ...  # check specific files

Honoured opt-out: a line containing `# runtime-hygiene: allow=<pattern>`
is skipped for that pattern only. See policy doc for when to use it.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent

# Runtime roots — only these are scanned. Anything outside is ignored.
RUNTIME_ROOTS = [
    REPO_ROOT / "apps" / "api" / "app",
    REPO_ROOT / "apps" / "web" / "src",
]

# Any path that contains one of these segments is treated as test/excluded
# territory. Mirrors the policy doc.
EXCLUDED_PATH_SEGMENTS = {
    "tests",
    "__tests__",
    "e2e",
    "test_data",
    "fixtures",
    "migrations",
}

# Two-segment excludes (checked as a sliding window over path parts).
EXCLUDED_PATH_PAIRS = {
    ("alembic", "versions"),
}

# Filename prefixes that mark a file as test-only regardless of location.
EXCLUDED_FILENAME_PREFIXES = ("test_",)

# Filename suffixes that mark a file as test-only regardless of location.
EXCLUDED_FILENAME_SUFFIXES = (
    ".test.js",
    ".test.jsx",
    ".test.ts",
    ".test.tsx",
    ".spec.js",
    ".spec.jsx",
    ".spec.ts",
    ".spec.tsx",
)

# Only these file extensions are scanned. Avoids the lint hitting fixtures,
# JSON snapshots, generated bundles, etc.
SCANNED_SUFFIXES = (".py", ".js", ".jsx", ".ts", ".tsx")


@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern[str]
    severity: str  # "error" or "warn"
    description: str


# Forbidden patterns (error-level). Each entry is keyed by a short name that
# can be referenced in an `# runtime-hygiene: allow=<name>` marker.
RULES: tuple[Rule, ...] = (
    Rule(
        name="import-pytest",
        pattern=re.compile(r"^\s*import\s+pytest\b"),
        severity="error",
        description=(
            "pytest is a dev-only dependency; importing it at module scope "
            "crashes the production container at startup (2026-05-18 outage)."
        ),
    ),
    Rule(
        name="from-pytest",
        pattern=re.compile(r"^\s*from\s+pytest\b"),
        severity="error",
        description="Same: pytest is dev-only.",
    ),
    Rule(
        name="pytest-mark",
        pattern=re.compile(r"@pytest\.mark\."),
        severity="error",
        description=(
            "Decorator only meaningful inside tests. Its presence in runtime "
            "code means a test class was glued onto a runtime file."
        ),
    ),
    Rule(
        name="pytest-fail",
        pattern=re.compile(r"\bpytest\.(fail|skip|xfail|exit)\("),
        severity="error",
        description="pytest control-flow call — test scaffolding leaking into runtime.",
    ),
    Rule(
        name="import-unittest",
        pattern=re.compile(r"^\s*import\s+unittest\b"),
        severity="error",
        description=(
            "unittest is stdlib so it does not crash imports, but no production "
            "module legitimately needs it. Indicates a test class was embedded."
        ),
    ),
    Rule(
        name="from-unittest",
        pattern=re.compile(r"^\s*from\s+unittest(\.|\s+import)"),
        severity="error",
        description="unittest.mock primitives (MagicMock/AsyncMock/patch) do not belong in runtime.",
    ),
    Rule(
        name="testclient",
        pattern=re.compile(r"\bTestClient\s*\("),
        severity="error",
        description="FastAPI TestClient is a test-only fixture, not a runtime HTTP client.",
    ),
    Rule(
        name="magicmock",
        pattern=re.compile(r"\b(?:MagicMock|AsyncMock|NonCallableMock)\s*\("),
        severity="error",
        description="Mock objects do not belong in runtime modules.",
    ),
    Rule(
        name="mock-patch",
        pattern=re.compile(r"\bmock\.patch\s*\("),
        severity="error",
        description="unittest.mock.patch is test scaffolding; remove from runtime code.",
    ),
    Rule(
        name="monkeypatch",
        # Identifier-only — function calls, attribute access, or as a parameter.
        # Deliberately avoids matching the bare word inside string literals or
        # comments (those uses tend to document test behaviour in docstrings).
        pattern=re.compile(r"(?:^|[\s(,])monkeypatch(?:\s*[\.\(]|\s*[:=])"),
        severity="error",
        description="pytest monkeypatch fixture; only legal inside test functions.",
    ),
    Rule(
        name="sys-modules-assign",
        pattern=re.compile(r"sys\.modules\[[^\]]+\]\s*="),
        severity="warn",
        description=(
            "Direct sys.modules mutation. Legitimate uses exist (dynamic plugin "
            "loading, lazy imports); reviewers must confirm intent."
        ),
    ),
)


# Files that contain known violations from before this policy landed. They are
# scheduled for cleanup in scoped follow-up PRs (one file per PR). Listing
# them here lets the gate land NOW so no *new* violations slip in while the
# existing ones are removed file-by-file.
#
# Each entry is a repo-relative path. Removing a file from this set after its
# cleanup PR merges is part of the cleanup checklist.
KNOWN_VIOLATIONS: frozenset[str] = frozenset(
    {
        # Triggered the 2026-05-18 outage; pytest import already env-guarded
        # by PR #1035, decorators + pytest.fail body still resident.
        "apps/api/app/routers/health_dashboard.py",
        # Kimi-authored "v2" knowledge-layer files with inline unittest classes.
        # Imported via try/except from lifespan_wiring.py + knowledge_router_v2.py.
        "apps/api/app/knowledge/multimodal_synthesizer_v2.py",
        "apps/api/app/knowledge/knowledge_cache.py",
        "apps/api/app/knowledge/uptime_monitor.py",
        "apps/api/app/knowledge/alerting_engine.py",
        # Real test file with Go-style `_test.py` suffix, misplaced in the
        # runtime tree. apps/api pytest config (`python_files = test_*.py`)
        # doesn't even collect it — it is dead test code. Cleanup: move to
        # apps/api/tests/qeeg/test_phi_redaction.py.
        "apps/api/app/qeeg/services/phi_redaction_test.py",
    }
)


ALLOW_MARKER_RE = re.compile(r"#\s*runtime-hygiene:\s*allow=([a-z0-9,\-]+)")


@dataclass(frozen=True)
class Finding:
    path: str
    line_no: int
    rule: Rule
    snippet: str


def _is_excluded_path(rel_path: Path) -> bool:
    parts = rel_path.parts
    name = rel_path.name

    if name.startswith(EXCLUDED_FILENAME_PREFIXES):
        return True
    if name.endswith(EXCLUDED_FILENAME_SUFFIXES):
        return True
    if any(part in EXCLUDED_PATH_SEGMENTS for part in parts):
        return True
    for i in range(len(parts) - 1):
        if (parts[i], parts[i + 1]) in EXCLUDED_PATH_PAIRS:
            return True
    return False


def _allowed_rules_on_line(line: str) -> set[str]:
    match = ALLOW_MARKER_RE.search(line)
    if not match:
        return set()
    return {token.strip() for token in match.group(1).split(",") if token.strip()}


def _is_under_any(path: Path, roots: Iterable[Path]) -> bool:
    for root in roots:
        try:
            path.relative_to(root)
        except ValueError:
            continue
        return True
    return False


def _iter_files(roots: Iterable[Path]) -> Iterable[Path]:
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in SCANNED_SUFFIXES:
                continue
            rel = path.relative_to(REPO_ROOT)
            if _is_excluded_path(rel):
                continue
            yield path


def _scan_file(path: Path) -> list[Finding]:
    rel = path.relative_to(REPO_ROOT).as_posix()
    findings: list[Finding] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return findings
    for line_no, line in enumerate(text.splitlines(), start=1):
        allowed = _allowed_rules_on_line(line)
        for rule in RULES:
            if rule.name in allowed:
                continue
            if rule.pattern.search(line):
                findings.append(
                    Finding(
                        path=rel,
                        line_no=line_no,
                        rule=rule,
                        snippet=line.rstrip()[:200],
                    )
                )
    return findings


def _resolve_targets(args: list[str]) -> list[Path]:
    if not args:
        return list(_iter_files(RUNTIME_ROOTS))
    targets: list[Path] = []
    for arg in args:
        p = Path(arg).resolve()
        if not p.exists():
            continue
        try:
            rel = p.relative_to(REPO_ROOT)
        except ValueError:
            continue
        if _is_excluded_path(rel):
            continue
        if p.suffix not in SCANNED_SUFFIXES:
            continue
        if not _is_under_any(p, RUNTIME_ROOTS):
            continue
        targets.append(p)
    return targets


def main(argv: list[str]) -> int:
    targets = _resolve_targets(argv[1:])

    errors: list[Finding] = []
    warnings: list[Finding] = []
    grandfathered: list[Finding] = []

    for path in targets:
        rel = path.relative_to(REPO_ROOT).as_posix()
        for finding in _scan_file(path):
            if finding.rule.severity == "warn":
                warnings.append(finding)
            elif rel in KNOWN_VIOLATIONS:
                grandfathered.append(finding)
            else:
                errors.append(finding)

    if warnings:
        print("Runtime hygiene — warnings (review only, do not fail):", file=sys.stderr)
        for f in warnings:
            print(
                f"  WARN {f.path}:{f.line_no} [{f.rule.name}] {f.snippet}",
                file=sys.stderr,
            )
        print("", file=sys.stderr)

    if grandfathered:
        print(
            "Runtime hygiene — grandfathered findings (tracked for cleanup, "
            "do not fail; see KNOWN_VIOLATIONS in this script):",
            file=sys.stderr,
        )
        for f in grandfathered:
            print(
                f"  KNOWN {f.path}:{f.line_no} [{f.rule.name}] {f.snippet}",
                file=sys.stderr,
            )
        print("", file=sys.stderr)

    if errors:
        print("Runtime hygiene — VIOLATIONS (failing the gate):", file=sys.stderr)
        for f in errors:
            print(
                f"  FAIL {f.path}:{f.line_no} [{f.rule.name}] {f.snippet}",
                file=sys.stderr,
            )
            print(f"        {f.rule.description}", file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Fix: move the test code under a `tests/` tree, or add an inline "
            "`# runtime-hygiene: allow=<rule-name>` marker if the runtime use "
            "is legitimate. See docs/engineering/runtime-hygiene-policy.md.",
            file=sys.stderr,
        )
        return 1

    print(
        f"runtime-hygiene: clean ({len(targets)} files scanned, "
        f"{len(warnings)} warnings, {len(grandfathered)} grandfathered).",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

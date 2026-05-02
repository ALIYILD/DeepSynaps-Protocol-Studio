"""Tests for ``tools/lint_router_basemodel.py``.

These tests do *not* import the linter as a module (it lives in ``tools/``
which is not on the Python path). Instead they shell out to the script,
which is the same call shape used by CI.
"""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
LINTER = REPO_ROOT / "tools" / "lint_router_basemodel.py"
ALLOWLIST = REPO_ROOT / "tools" / "router_basemodel_allowlist.txt"


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(LINTER), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_linter_passes_on_main() -> None:
    """The current routers + frozen allowlist must produce a clean lint."""
    result = _run([])
    assert result.returncode == 0, (
        f"Linter unexpectedly failed on main.\nstdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
    assert "router-basemodel lint: clean" in result.stdout


def test_allowlist_is_present_and_non_empty() -> None:
    """Day-one allowlist must exist and contain entries (legacy snapshot)."""
    assert ALLOWLIST.exists(), f"missing allowlist at {ALLOWLIST}"
    lines = [
        ln for ln in ALLOWLIST.read_text(encoding="utf-8").splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    assert len(lines) > 50, (
        "allowlist looks too small — did the snapshot run? "
        f"got {len(lines)} entries"
    )


def test_synthetic_violator_fails(tmp_path: Path) -> None:
    """A synthetic router with a new BaseModel and an empty allowlist must fail."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    (routers_dir / "__init__.py").write_text("", encoding="utf-8")
    (routers_dir / "synthetic_violator_router.py").write_text(
        textwrap.dedent(
            """
            from pydantic import BaseModel

            class BadRequestModel(BaseModel):
                name: str
            """
        ).lstrip(),
        encoding="utf-8",
    )

    empty_allowlist = tmp_path / "allowlist.txt"
    empty_allowlist.write_text("# empty\n", encoding="utf-8")

    result = _run([
        "--routers-dir", str(routers_dir),
        "--allowlist", str(empty_allowlist),
    ])
    assert result.returncode == 1, (
        f"Linter should have flagged synthetic violator.\nstdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
    assert "BadRequestModel" in result.stdout
    assert "synthetic_violator_router.py" in result.stdout


def test_exempt_marker_suppresses_violation(tmp_path: Path) -> None:
    """A class preceded by the exempt marker is allowed even without allowlist."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    (routers_dir / "__init__.py").write_text("", encoding="utf-8")
    (routers_dir / "exempt_router.py").write_text(
        textwrap.dedent(
            """
            from pydantic import BaseModel

            # core-schema-exempt: router-private debug payload, never reused
            class DebugPing(BaseModel):
                ts: int
            """
        ).lstrip(),
        encoding="utf-8",
    )

    empty_allowlist = tmp_path / "allowlist.txt"
    empty_allowlist.write_text("# empty\n", encoding="utf-8")

    result = _run([
        "--routers-dir", str(routers_dir),
        "--allowlist", str(empty_allowlist),
    ])
    assert result.returncode == 0, (
        f"Exempt marker should have suppressed violation.\nstdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )


def test_alias_import_is_detected(tmp_path: Path) -> None:
    """``from pydantic import BaseModel as PydBase`` must still be caught."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    (routers_dir / "__init__.py").write_text("", encoding="utf-8")
    (routers_dir / "alias_router.py").write_text(
        textwrap.dedent(
            """
            from pydantic import BaseModel as PydBase

            class AliasedModel(PydBase):
                value: int
            """
        ).lstrip(),
        encoding="utf-8",
    )

    empty_allowlist = tmp_path / "allowlist.txt"
    empty_allowlist.write_text("# empty\n", encoding="utf-8")

    result = _run([
        "--routers-dir", str(routers_dir),
        "--allowlist", str(empty_allowlist),
    ])
    assert result.returncode == 1
    assert "AliasedModel" in result.stdout


def test_nested_class_is_not_flagged(tmp_path: Path) -> None:
    """Only module-level classes should be flagged."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    (routers_dir / "__init__.py").write_text("", encoding="utf-8")
    (routers_dir / "nested_router.py").write_text(
        textwrap.dedent(
            """
            from pydantic import BaseModel

            def factory():
                class NestedOnly(BaseModel):
                    x: int
                return NestedOnly
            """
        ).lstrip(),
        encoding="utf-8",
    )

    empty_allowlist = tmp_path / "allowlist.txt"
    empty_allowlist.write_text("# empty\n", encoding="utf-8")

    result = _run([
        "--routers-dir", str(routers_dir),
        "--allowlist", str(empty_allowlist),
    ])
    assert result.returncode == 0


def test_snapshot_writes_allowlist(tmp_path: Path) -> None:
    """``--snapshot`` rewrites the allowlist with the current violations."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    (routers_dir / "__init__.py").write_text("", encoding="utf-8")
    (routers_dir / "snap_router.py").write_text(
        textwrap.dedent(
            """
            from pydantic import BaseModel

            class Snap(BaseModel):
                v: int
            """
        ).lstrip(),
        encoding="utf-8",
    )

    allow = tmp_path / "snap_allowlist.txt"
    result = _run([
        "--snapshot",
        "--routers-dir", str(routers_dir),
        "--allowlist", str(allow),
    ])
    assert result.returncode == 0
    body = allow.read_text(encoding="utf-8")
    # Path is relative to repo root, but with a tmp routers dir we get an
    # absolute key. Just assert the class name shows up.
    assert "Snap" in body

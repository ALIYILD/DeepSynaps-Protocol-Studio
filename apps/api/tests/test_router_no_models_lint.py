"""Tests for ``tools/lint_router_no_models.py``.

These tests pin three behaviours of Architect Rec #8 PR-A's lint:

1. The repo's current ``main`` (with the frozen allowlist applied) is
   clean — exit code 0.
2. A synthetic router file that imports ``app.persistence.models`` and
   is NOT on the allowlist fails — exit code 1, with the offending file
   named in stderr.
3. A synthetic router that puts the ban behind an
   ``if TYPE_CHECKING:`` guard is treated as compliant — exit code 0.

The lint script is invoked as a subprocess so we test the same entry
point that CI uses.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
LINT_SCRIPT = REPO_ROOT / "tools" / "lint_router_no_models.py"


def _run_lint(*args: str) -> subprocess.CompletedProcess[str]:
    """Run the lint script with the given CLI arguments."""
    return subprocess.run(
        [sys.executable, str(LINT_SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.skipif(
    not LINT_SCRIPT.exists(),
    reason="lint script must exist for this test",
)
def test_repo_main_passes_lint() -> None:
    """The current repo state (allowlist applied) must lint clean."""
    result = _run_lint()
    assert result.returncode == 0, (
        f"Expected clean lint on main, got exit {result.returncode}.\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert "OK" in result.stdout


def test_synthetic_violator_fails_lint(tmp_path: Path) -> None:
    """A new router with a runtime import of persistence.models must fail."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    bad = routers_dir / "bad_new_router.py"
    bad.write_text(
        "from app.persistence.models import Patient\n"
        "\n"
        "def get_patients():\n"
        "    return Patient\n",
        encoding="utf-8",
    )
    # Empty allowlist — nothing is exempted.
    allowlist = tmp_path / "allowlist.txt"
    allowlist.write_text("# empty\n", encoding="utf-8")

    result = _run_lint(
        "--routers-dir",
        str(routers_dir),
        "--allowlist",
        str(allowlist),
    )
    assert result.returncode == 1, (
        f"Expected lint failure for synthetic violator, got exit "
        f"{result.returncode}.\nstdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
    assert "bad_new_router.py" in result.stderr


def test_type_checking_guarded_import_is_allowed(tmp_path: Path) -> None:
    """``if TYPE_CHECKING:`` blocks are erased at runtime and stay legal."""
    routers_dir = tmp_path / "routers"
    routers_dir.mkdir()
    ok = routers_dir / "ok_type_checking_router.py"
    ok.write_text(
        "from __future__ import annotations\n"
        "from typing import TYPE_CHECKING\n"
        "\n"
        "if TYPE_CHECKING:\n"
        "    from app.persistence.models import Patient\n"
        "\n"
        "def get_patient() -> 'Patient':\n"
        "    raise NotImplementedError\n",
        encoding="utf-8",
    )
    allowlist = tmp_path / "allowlist.txt"
    allowlist.write_text("# empty\n", encoding="utf-8")

    result = _run_lint(
        "--routers-dir",
        str(routers_dir),
        "--allowlist",
        str(allowlist),
    )
    assert result.returncode == 0, (
        f"Expected TYPE_CHECKING-guarded import to pass, got exit "
        f"{result.returncode}.\nstdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )

"""Repo-wide regression tests for the torch.load safety scanner.

Companion to ``scripts/check_torch_load_safety.py`` and PR #980's
``_safe_torch`` helpers. See ``docs/security/torch-load-governance.md`` for
the policy this enforces.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Load the scanner as a module without requiring it to be on PYTHONPATH.
# It lives at scripts/check_torch_load_safety.py at the repo root.
# ---------------------------------------------------------------------------


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".git").exists() or (parent / "scripts").is_dir():
            return parent
    raise RuntimeError("repo root not found")


@pytest.fixture(scope="module")
def scanner():
    """Import scripts/check_torch_load_safety.py as a module."""
    repo = _repo_root()
    script_path = repo / "scripts" / "check_torch_load_safety.py"
    assert script_path.exists(), (
        f"scanner script missing at {script_path} — was PR #980's follow-up "
        "merged? See docs/security/torch-load-governance.md."
    )
    spec = importlib.util.spec_from_file_location(
        "check_torch_load_safety", script_path,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["check_torch_load_safety"] = module
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Allowed patterns (must produce 0 violations)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "snippet",
    [
        # Bare safe call
        "import torch\ntorch.load('x.pt', weights_only=True)\n",
        # Explicit unsafe (allowed — visibility is the goal)
        "import torch\ntorch.load('x.pt', weights_only=False)\n",
        # Aliased receiver name that the scanner recognises
        "import torch as torch_mod\ntorch_mod.load('x.pt', weights_only=True)\n",
        # Approved helper — does not call torch.load directly
        "from deepsynaps_qeeg._safe_torch import load_state_dict_safely\n"
        "state = load_state_dict_safely('x.pt')\n",
        # Approved helper #2
        "from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint\n"
        "load_trusted_full_checkpoint('x.pt', reason='vendored model checkpoint')\n",
        # weights_only=True with map_location and multiline
        "import torch\n"
        "state = torch.load(\n"
        "    'x.pt',\n"
        "    map_location='cpu',\n"
        "    weights_only=True,\n"
        ")\n",
        # torch.load mention inside a docstring — must be ignored
        '"""See torch.load(x) for unsafe pickle behaviour."""\n',
        # torch.load mention inside a string literal — must be ignored
        "msg = 'do not call torch.load(x) without weights_only=' \n",
        # torch.load mention in a hash comment — must be ignored
        "# torch.load(x) is dangerous without weights_only=\n",
        # A different .load — NOT torch — must be ignored
        "import torchaudio\ntorchaudio.load('x.wav')\n",
        # Empty file
        "",
    ],
)
def test_allowed_patterns_produce_no_violations(tmp_path, scanner, snippet):
    """All approved / unrelated patterns must scan clean."""
    root = tmp_path
    pkg = root / "packages"
    pkg.mkdir()
    (pkg / "sample.py").write_text(snippet, encoding="utf-8")
    violations = scanner.find_violations(root, roots=("packages",))
    assert violations == [], (
        f"Snippet should have been accepted but produced violations: {violations}\n"
        f"Snippet:\n{snippet}"
    )


# ---------------------------------------------------------------------------
# Blocked patterns (must produce >=1 violation)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "snippet,expected_line",
    [
        # Plain naked call
        ("import torch\ntorch.load('x.pt')\n", 2),
        # Naked with map_location but no weights_only
        ("import torch\ntorch.load('x.pt', map_location='cpu')\n", 2),
        # Multiline naked call
        (
            "import torch\n"
            "state = torch.load(\n"
            "    'x.pt',\n"
            "    map_location='cpu',\n"
            ")\n",
            2,
        ),
        # Aliased receiver naked
        (
            "import torch as torch_mod\n"
            "torch_mod.load('x.pt', map_location='cpu')\n",
            2,
        ),
        # Naked call deeper in the file
        (
            "import torch\n"
            "\n"
            "def loader(path):\n"
            "    return torch.load(path)\n",
            4,
        ),
    ],
)
def test_blocked_patterns_produce_violations(tmp_path, scanner, snippet, expected_line):
    """Every naked torch.load (no weights_only=) must be flagged."""
    root = tmp_path
    pkg = root / "packages"
    pkg.mkdir()
    target = pkg / "bad.py"
    target.write_text(snippet, encoding="utf-8")
    violations = scanner.find_violations(root, roots=("packages",))
    assert len(violations) == 1, (
        f"Expected exactly 1 violation, got {len(violations)}:\n{violations}\n"
        f"Snippet:\n{snippet}"
    )
    v = violations[0]
    assert v.path == target
    assert v.line == expected_line


# ---------------------------------------------------------------------------
# Real-repo invariant: the current branch must be clean.
# This is the gate — it ensures the codebase stays compliant over time.
# ---------------------------------------------------------------------------


def test_real_repo_has_zero_unsafe_torch_load(scanner):
    """The actual repo must contain no unsafe torch.load callsites.

    If this test fails after your change, route the new call through
    ``deepsynaps_qeeg._safe_torch`` (or pass ``weights_only=`` explicitly).
    Run the scanner directly for the exact remediation guidance:

        python scripts/check_torch_load_safety.py
    """
    repo = _repo_root()
    violations = scanner.find_violations(repo)
    if violations:
        formatted = "\n".join(
            f"  {v.path.relative_to(repo)}:{v.line}  {v.snippet}"
            for v in violations
        )
        pytest.fail(
            "Unsafe torch.load call(s) found in repo:\n" + formatted +
            "\n\nSee docs/security/torch-load-governance.md and "
            "scripts/check_torch_load_safety.py for the remediation policy."
        )


# ---------------------------------------------------------------------------
# Excluded directories must not be scanned
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "excluded_dir",
    [".venv", "venv", "node_modules", "dist", "build", "site-packages",
     "__pycache__", ".pytest_cache"],
)
def test_excluded_dirs_are_skipped(tmp_path, scanner, excluded_dir):
    """Vendored / build-artifact dirs must be skipped even if they contain
    naked torch.load calls (which they typically do — e.g. site-packages
    bundles its own torch examples)."""
    root = tmp_path
    pkg = root / "packages" / "real-package" / excluded_dir
    pkg.mkdir(parents=True)
    (pkg / "vendored.py").write_text(
        "import torch\ntorch.load('x.pt')\n",
        encoding="utf-8",
    )
    violations = scanner.find_violations(root, roots=("packages",))
    assert violations == [], (
        f"Scanner should skip dirs named {excluded_dir!r}, "
        f"but found {len(violations)} violation(s)."
    )


# ---------------------------------------------------------------------------
# Honesty test — limitations documented in the script must be observable
# ---------------------------------------------------------------------------


def test_known_limitation_alias_via_assignment_is_NOT_detected(tmp_path, scanner):
    """Documented limitation: a binding like ``t = torch`` followed by
    ``t.load(...)`` is NOT detected. This test exists to make the
    limitation explicit — if the scanner is ever extended to catch this,
    flip the assertion."""
    root = tmp_path
    pkg = root / "packages"
    pkg.mkdir()
    (pkg / "aliased.py").write_text(
        "import torch\nt = torch\nt.load('x.pt')\n",
        encoding="utf-8",
    )
    violations = scanner.find_violations(root, roots=("packages",))
    # We DO NOT expect this to fire — alias detection is intentionally limited.
    # See docs/security/torch-load-governance.md "Known limitations".
    assert violations == [], (
        "Scanner unexpectedly detected an aliased torch binding. If alias "
        "detection was added, update this test AND update the Known Limitations "
        "section of docs/security/torch-load-governance.md."
    )


def test_known_limitation_from_torch_import_load_is_NOT_detected(tmp_path, scanner):
    """Documented limitation: ``from torch import load`` then a bare
    ``load(x)`` is NOT detected."""
    root = tmp_path
    pkg = root / "packages"
    pkg.mkdir()
    (pkg / "fromimport.py").write_text(
        "from torch import load\nload('x.pt')\n",
        encoding="utf-8",
    )
    violations = scanner.find_violations(root, roots=("packages",))
    assert violations == [], (
        "Scanner unexpectedly detected `from torch import load`. If this was "
        "added, update this test AND the docs."
    )

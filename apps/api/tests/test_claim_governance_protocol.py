"""Conformance tests for the modality claim-governance contract.

Locks in the cross-modality invariant from
``apps/api/app/services/safety/claim_governance.py``: every catalogued
modality safety module exposes ``_BLOCKED_PATTERNS``, ``_BANNED_WORDS``,
and ``scan_for_banned_words`` in the documented shape. Pins the
contract so future modality modules (Protocol Selector, Safety Monitor,
etc.) ship with the same surface — the gap surfaced by the 4-agent
audit in PR #1073.
"""
from __future__ import annotations

import importlib

import pytest

from app.services.safety.claim_governance import (
    MODALITY_GOVERNORS,
    conformance_diagnostics,
    is_conformant,
    list_modality_governors,
    register_modality_governor,
    resolve_modality_governor,
)


# ---------------------------------------------------------------------------
# Canonical modalities that must always have a governor
# ---------------------------------------------------------------------------
#
# Adding a modality here means: a claim-governance module at
# `app.services.<modality>_claim_governance` must exist AND must
# conform to the protocol. Removing a modality means: no claim
# governance is required for that modality. The default list
# matches the canonical pair documented in the protocol module.

REQUIRED_MODALITIES = ("qeeg", "mri")


def _reset_registry():
    MODALITY_GOVERNORS.clear()
    # Force auto-import to repopulate on next access
    import app.services.safety.claim_governance as cg

    cg._auto_imported = False


# ---------------------------------------------------------------------------
# Auto-import + registry
# ---------------------------------------------------------------------------


def test_canonical_governors_are_auto_imported():
    """list_modality_governors triggers the canonical auto-import."""
    _reset_registry()
    keys = list_modality_governors()
    for required in REQUIRED_MODALITIES:
        assert required in keys, (
            f"required modality {required!r} not in registry; expected the "
            f"canonical auto-import to populate it"
        )


def test_resolve_modality_governor_returns_module():
    _reset_registry()
    qeeg = resolve_modality_governor("qeeg")
    assert qeeg is not None
    # Verify it's actually the qeeg module by checking a known symbol
    assert hasattr(qeeg, "scan_for_banned_words")


def test_resolve_modality_governor_unknown_returns_none():
    _reset_registry()
    assert resolve_modality_governor("does-not-exist-modality") is None


def test_register_modality_governor_is_idempotent():
    _reset_registry()
    list_modality_governors()  # populate via auto-import
    qeeg = resolve_modality_governor("qeeg")
    # Re-register the same module — must not raise
    register_modality_governor("qeeg", qeeg)


def test_register_modality_governor_refuses_silent_swap():
    """A different module trying to register under an existing name must
    raise — silent swaps would defeat the audit trail."""
    _reset_registry()
    list_modality_governors()  # populate
    fake_module = type("Fake", (), {})()  # arbitrary sentinel
    with pytest.raises(ValueError, match="refusing to silently swap"):
        register_modality_governor("qeeg", fake_module)


# ---------------------------------------------------------------------------
# Conformance — the central invariant
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("modality", REQUIRED_MODALITIES)
def test_required_modality_governor_is_conformant(modality):
    """Every required modality's governor module must satisfy the
    ClaimGovernor protocol. This is the central invariant — if it
    fails, a modality's safety module is missing a contract surface."""
    _reset_registry()
    list_modality_governors()  # trigger auto-import
    module = resolve_modality_governor(modality)
    assert module is not None, f"modality {modality!r} missing from registry"

    diagnostics = conformance_diagnostics(module)
    assert not diagnostics, (
        f"{modality} claim-governance module is non-conformant:\n  "
        + "\n  ".join(diagnostics)
    )


def test_is_conformant_wrapper_matches_diagnostics():
    _reset_registry()
    list_modality_governors()
    qeeg = resolve_modality_governor("qeeg")
    mri = resolve_modality_governor("mri")
    assert is_conformant(qeeg)
    assert is_conformant(mri)


# ---------------------------------------------------------------------------
# Diagnostics — verify the failure path actually surfaces useful info
# ---------------------------------------------------------------------------


def test_conformance_diagnostics_flags_missing_blocked_patterns():
    """A module missing _BLOCKED_PATTERNS surfaces a clear diagnostic."""

    class _NoPatternsModule:
        _BANNED_WORDS: list = []

        @staticmethod
        def scan_for_banned_words(text):
            return []

    issues = conformance_diagnostics(_NoPatternsModule)
    assert any("_BLOCKED_PATTERNS" in i for i in issues)


def test_conformance_diagnostics_flags_wrong_pattern_shape():
    """A module with wrongly-shaped _BLOCKED_PATTERNS gets per-entry
    diagnostics, not a single opaque failure."""

    class _BadPatternsModule:
        _BLOCKED_PATTERNS = ["not-a-tuple"]  # type: ignore[assignment]
        _BANNED_WORDS: list = []

        @staticmethod
        def scan_for_banned_words(text):
            return []

    issues = conformance_diagnostics(_BadPatternsModule)
    assert any("_BLOCKED_PATTERNS[0]" in i for i in issues)


def test_conformance_diagnostics_flags_missing_scan_callable():
    class _NoScanModule:
        _BLOCKED_PATTERNS: list = []
        _BANNED_WORDS: list = []
        # No scan_for_banned_words attribute

    issues = conformance_diagnostics(_NoScanModule)
    assert any("scan_for_banned_words" in i for i in issues)


def test_conformance_diagnostics_flags_non_callable_scan():
    class _NotCallableModule:
        _BLOCKED_PATTERNS: list = []
        _BANNED_WORDS: list = []
        scan_for_banned_words = "definitely not callable"

    issues = conformance_diagnostics(_NotCallableModule)
    assert any("not callable" in i for i in issues)


def test_conformance_diagnostics_flags_wrong_scan_return_type():
    class _WrongReturnModule:
        _BLOCKED_PATTERNS: list = []
        _BANNED_WORDS: list = []

        @staticmethod
        def scan_for_banned_words(text):
            return "should be a list"  # wrong return type

    issues = conformance_diagnostics(_WrongReturnModule)
    assert any("return list[str]" in i for i in issues)


def test_conformant_module_with_minimal_surface_passes():
    """A trivially-conformant module passes. Smoke test for the
    diagnostic engine — ensures it doesn't false-positive on a
    minimal-but-valid governor."""
    import re

    class _MinimalGovernor:
        _BLOCKED_PATTERNS = [(re.compile(r"forbidden", re.IGNORECASE), "BLOCKED")]
        _BANNED_WORDS = ["badword"]

        @staticmethod
        def scan_for_banned_words(text):
            return [w for w in _MinimalGovernor._BANNED_WORDS if w in text.lower()]

    diagnostics = conformance_diagnostics(_MinimalGovernor)
    assert diagnostics == [], (
        f"minimal-but-valid governor incorrectly flagged: {diagnostics}"
    )
    assert is_conformant(_MinimalGovernor)

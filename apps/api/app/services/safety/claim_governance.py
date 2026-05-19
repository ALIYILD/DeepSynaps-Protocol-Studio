"""Cross-modality contract for claim-governance modules.

DeepSynaps Studio already ships modality-specific claim-governance
modules:

* ``apps.services.qeeg_claim_governance``
* ``apps.services.mri_claim_governance``

Each labels AI-generated narrative statements and blocks unsafe claims
per ``docs/qeeg-safety-governance.md``. They were written independently
and have diverged on shape; the structure is similar but not identical.

This module exists to:

1. **Document the shape** future modality modules must implement (the
   :class:`ClaimGovernor` Protocol). The qEEG Audit (PR #1073)
   identified this as the cross-cutting "must-have" before any of the
   12 proposed Clinician Workflow OS modules can ship.
2. **Provide a registry** so observability surfaces (``/health``,
   admin governance routers) can enumerate which modalities have
   active claim governance.
3. **Carry the test invariant** that fails if a modality module is
   added without conforming — see
   ``apps/api/tests/test_claim_governance_protocol.py``.

This module does **NOT**:

* Own the banned-language tables — those live in each modality module.
  ``runtime-critical-surface-protection.md`` § "do not touch unless
  explicitly tasked" item 1 lists those tables as off-limits.
* Refactor or replace the two existing modules — the contract is
  duck-typed via :class:`typing.Protocol`, so existing modules satisfy
  it without code changes.
* Run any I/O at import time. The registry is populated lazily on
  first call to :func:`list_modality_governors`.
"""

from __future__ import annotations

import importlib
import re
import threading
from typing import Any, Callable, Dict, List, Optional, Protocol, runtime_checkable


# ---------------------------------------------------------------------------
# The contract
# ---------------------------------------------------------------------------


@runtime_checkable
class ClaimGovernor(Protocol):
    """Structural contract for a modality-specific claim-governance module.

    A conforming module must export, at module scope:

    * ``_BLOCKED_PATTERNS: list[tuple[re.Pattern, str]]`` — ordered list
      of regex patterns to forbid in AI-generated narratives, paired
      with a stable block-reason code. Existing modules use codes like
      ``BLOCKED_DIAGNOSIS``, ``BLOCKED_CONFIRMATION``, etc.
    * ``_BANNED_WORDS: list[str]`` — case-insensitive word/phrase
      blacklist for any clinical-facing output.
    * ``scan_for_banned_words(text: str) -> list[str]`` — return the
      list of banned words found in ``text``. Existing modules implement
      this; the protocol just pins the signature.

    A conforming module SHOULD ALSO export (recommended, not strictly
    required):

    * ``CLAIM_TYPES: tuple[str, ...]`` — claim classification taxonomy
      (OBSERVED / COMPUTED / INFERRED / PROTOCOL_LINKED / etc).
    * ``classify_<modality>_claims(ai_narrative: dict) -> list[dict]``
      — walks an AI narrative and labels each statement. The function
      name varies by modality (``classify_claims`` for qEEG,
      ``classify_mri_claims`` for MRI), so the protocol does not pin
      the exact callable name — only the required helpers above.

    This is a :class:`Protocol`, so existing modules satisfy it
    structurally without modification.
    """

    _BLOCKED_PATTERNS: List[Any]  # list[tuple[re.Pattern, str]] — checked at runtime
    _BANNED_WORDS: List[str]

    def scan_for_banned_words(self, text: str) -> List[str]:  # pragma: no cover — protocol
        ...


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


# Canonical list of modality keys whose claim-governance modules are
# expected to exist. New modalities (e.g., "protocol_selector",
# "safety_monitor") get added here when their modules ship.
#
# Keep keys URL-safe and stable; observability surfaces will quote them.
_EXPECTED_MODALITIES: Dict[str, str] = {
    "qeeg": "app.services.qeeg_claim_governance",
    "mri": "app.services.mri_claim_governance",
}


# Process-wide registry. Modules can self-register via
# register_modality_governor(); the lazy-populator below also
# auto-imports the canonical pair on first call.
MODALITY_GOVERNORS: Dict[str, Any] = {}
_lock = threading.RLock()
_auto_imported = False


def register_modality_governor(name: str, module: Any) -> None:
    """Register a modality-specific claim-governance module.

    Idempotent: re-registering the same name with the same module is a
    no-op. Re-registering with a *different* module raises ``ValueError``
    — silently swapping the governor would defeat the audit trail.
    """
    with _lock:
        existing = MODALITY_GOVERNORS.get(name)
        if existing is module:
            return
        if existing is not None:
            raise ValueError(
                f"Claim governor for modality {name!r} already registered "
                f"to {existing!r}; refusing to silently swap to {module!r}."
            )
        MODALITY_GOVERNORS[name] = module


def _auto_import_canonical() -> None:
    """Auto-import the canonical pair (qeeg, mri) so the registry is
    populated even when no caller has explicitly registered them.

    Failures here are surfaced rather than swallowed: a missing
    canonical governor is a deployment incident, not a soft warning.
    """
    global _auto_imported
    with _lock:
        if _auto_imported:
            return
        for name, dotted_path in _EXPECTED_MODALITIES.items():
            if name in MODALITY_GOVERNORS:
                continue
            module = importlib.import_module(dotted_path)
            register_modality_governor(name, module)
        _auto_imported = True


def list_modality_governors() -> List[str]:
    """Return modality keys with a registered claim governor.

    Triggers the canonical auto-import on first call so observability
    callers (``/health``, admin routers, audits) see the expected pair
    even if no other module has touched the registry yet.
    """
    _auto_import_canonical()
    with _lock:
        return sorted(MODALITY_GOVERNORS.keys())


def resolve_modality_governor(name: str) -> Optional[Any]:
    """Return the registered governor module for ``name``, or ``None``.

    Triggers the canonical auto-import (same as
    :func:`list_modality_governors`).
    """
    _auto_import_canonical()
    with _lock:
        return MODALITY_GOVERNORS.get(name)


# ---------------------------------------------------------------------------
# Conformance check (used by the CI test invariant)
# ---------------------------------------------------------------------------


def conformance_diagnostics(module: Any) -> List[str]:
    """Return human-readable diagnostics for any way ``module`` deviates
    from :class:`ClaimGovernor`. Empty list = fully conforming.

    Used by the test invariant in
    ``apps/api/tests/test_claim_governance_protocol.py`` so failures
    point to the specific missing attribute rather than a generic
    ``isinstance`` boolean.
    """
    issues: List[str] = []

    # _BLOCKED_PATTERNS — list of (compiled regex, block-reason) tuples
    patterns = getattr(module, "_BLOCKED_PATTERNS", None)
    if patterns is None:
        issues.append("missing module attribute `_BLOCKED_PATTERNS`")
    elif not isinstance(patterns, list):
        issues.append(
            f"`_BLOCKED_PATTERNS` must be a list, got {type(patterns).__name__}"
        )
    else:
        for i, entry in enumerate(patterns):
            if not isinstance(entry, tuple) or len(entry) != 2:
                issues.append(
                    f"`_BLOCKED_PATTERNS[{i}]` must be a (pattern, reason) "
                    f"2-tuple"
                )
                continue
            pattern, reason = entry
            if not isinstance(pattern, re.Pattern):
                issues.append(
                    f"`_BLOCKED_PATTERNS[{i}][0]` must be a compiled "
                    f"re.Pattern, got {type(pattern).__name__}"
                )
            if not isinstance(reason, str) or not reason:
                issues.append(
                    f"`_BLOCKED_PATTERNS[{i}][1]` must be a non-empty "
                    f"block-reason string"
                )

    # _BANNED_WORDS — list of strings
    words = getattr(module, "_BANNED_WORDS", None)
    if words is None:
        issues.append("missing module attribute `_BANNED_WORDS`")
    elif not isinstance(words, list):
        issues.append(
            f"`_BANNED_WORDS` must be a list, got {type(words).__name__}"
        )
    elif not all(isinstance(w, str) for w in words):
        issues.append("`_BANNED_WORDS` entries must all be strings")

    # scan_for_banned_words — callable signature (text: str) -> list[str]
    scan = getattr(module, "scan_for_banned_words", None)
    if scan is None:
        issues.append("missing module-level callable `scan_for_banned_words`")
    elif not callable(scan):
        issues.append("`scan_for_banned_words` is not callable")
    else:
        # Quick smoke probe — feed a clearly-safe string, expect a list.
        try:
            result = scan("hello, world")
        except Exception as exc:  # noqa: BLE001 — diagnostic, not production code
            issues.append(
                f"`scan_for_banned_words('hello, world')` raised "
                f"{type(exc).__name__}: {exc}"
            )
        else:
            if not isinstance(result, list):
                issues.append(
                    f"`scan_for_banned_words` must return list[str], "
                    f"got {type(result).__name__}"
                )

    return issues


def is_conformant(module: Any) -> bool:
    """Convenience wrapper around :func:`conformance_diagnostics`."""
    return not conformance_diagnostics(module)


__all__ = [
    "ClaimGovernor",
    "MODALITY_GOVERNORS",
    "conformance_diagnostics",
    "is_conformant",
    "list_modality_governors",
    "register_modality_governor",
    "resolve_modality_governor",
]

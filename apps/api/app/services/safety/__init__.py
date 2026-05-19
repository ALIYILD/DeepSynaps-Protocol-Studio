"""Cross-modality safety primitives for DeepSynaps Studio.

This package holds shared safety-governance infrastructure that
modality-specific safety modules (qEEG, MRI, future Protocol Selector,
Safety Monitor) must conform to. It does **not** own the modality-
specific banned-language tables — those live in the existing modality
modules (``app.services.qeeg_claim_governance``,
``app.services.mri_claim_governance``) and remain the canonical source
of truth per ``docs/qeeg-safety-governance.md``.

What lives here:

* :mod:`.claim_governance` — the cross-modality contract every claim-
  governance module must satisfy, plus a registry future modules
  self-register against.
"""

from app.services.safety.claim_governance import (
    ClaimGovernor,
    MODALITY_GOVERNORS,
    list_modality_governors,
    register_modality_governor,
    resolve_modality_governor,
)

__all__ = [
    "ClaimGovernor",
    "MODALITY_GOVERNORS",
    "list_modality_governors",
    "register_modality_governor",
    "resolve_modality_governor",
]

"""
DeepSynaps MRI / fMRI / DTI Analyzer
====================================

See docs/MRI_ANALYZER.md for the authoritative spec.
"""
from .safety import (
    build_finding,
    findings_from_structural,
    safe_brain_age,
    to_fusion_payload,
)
from .schemas import (
    DiffusionMetrics,
    FunctionalMetrics,
    Modality,
    MRIReport,
    QCMetrics,
    StimTarget,
    StructuralMetrics,
)
from .validation import (
    ValidationResult,
    validate_nifti_header,
    validate_upload_blob,
)
from .registration import (
    ApplyTransformResult,
    InvertTransformResult,
    MniRegistrationBundle,
    RegistrationQCReport,
    apply_transform,
    compute_registration_qc,
    invert_transform,
    register_to_mni,
)

__version__ = "0.1.0"
__all__ = [
    "StimTarget", "MRIReport", "StructuralMetrics", "FunctionalMetrics",
    "DiffusionMetrics", "QCMetrics", "Modality",
    # Safety / interpretation helpers (added 2026-04-26 night).
    "build_finding", "findings_from_structural",
    "safe_brain_age", "to_fusion_payload",
    # Validation entry points.
    "ValidationResult", "validate_upload_blob", "validate_nifti_header",
    # MNI registration — see docs/REGISTRATION.md.
    "register_to_mni",
    "apply_transform",
    "invert_transform",
    "compute_registration_qc",
    "MniRegistrationBundle",
    "ApplyTransformResult",
    "InvertTransformResult",
    "RegistrationQCReport",
]

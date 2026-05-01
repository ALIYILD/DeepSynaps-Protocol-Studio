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
from .cortical_thickness import (
    CorticalThicknessComputeResult,
    RegionalThicknessSummary,
    ThicknessQCReport,
    compute_cortical_thickness,
    compute_thickness_qc,
    summarize_regional_thickness,
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
    # Cortical thickness — see docs/CORTICAL_THICKNESS.md.
    "compute_cortical_thickness",
    "summarize_regional_thickness",
    "compute_thickness_qc",
    "CorticalThicknessComputeResult",
    "RegionalThicknessSummary",
    "ThicknessQCReport",
]

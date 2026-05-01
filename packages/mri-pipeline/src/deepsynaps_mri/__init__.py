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

# Ingestion layer (optional — requires neuro extras for full DICOM paths).
from .ingestion import (
    ConversionResult,
    ImportDicomResult,
    MRIValidationEnvelope,
    SeriesMetadata,
    convert_to_nifti,
    detect_series_metadata,
    import_dicom_series,
    validate_mri_input,
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
    # Ingestion layer (see docs/INGESTION.md).
    "SeriesMetadata",
    "ConversionResult",
    "ImportDicomResult",
    "MRIValidationEnvelope",
    "import_dicom_series",
    "detect_series_metadata",
    "convert_to_nifti",
    "validate_mri_input",
]

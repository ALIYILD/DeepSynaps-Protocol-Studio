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
from .workflow_orchestration import (
    ArtifactRecord,
    PipelineNode,
    PipelineRun,
    collect_provenance,
    execute_pipeline,
    load_pipeline_run,
    resume_pipeline,
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
    # Workflow orchestration — see docs/WORKFLOW_ORCHESTRATION.md.
    "execute_pipeline",
    "resume_pipeline",
    "collect_provenance",
    "load_pipeline_run",
    "PipelineNode",
    "PipelineRun",
    "ArtifactRecord",
]

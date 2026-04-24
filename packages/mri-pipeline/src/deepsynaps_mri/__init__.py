"""
DeepSynaps MRI / fMRI / DTI Analyzer
====================================

See docs/MRI_ANALYZER.md for the authoritative spec.
"""
from .schemas import (
    StimTarget, MRIReport, StructuralMetrics, FunctionalMetrics,
    DiffusionMetrics, QCMetrics, Modality,
)

__version__ = "0.1.0"
__all__ = [
    "StimTarget", "MRIReport", "StructuralMetrics", "FunctionalMetrics",
    "DiffusionMetrics", "QCMetrics", "Modality",
]

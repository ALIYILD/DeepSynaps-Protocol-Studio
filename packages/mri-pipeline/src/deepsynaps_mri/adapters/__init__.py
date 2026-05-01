"""External neuroimaging CLI adapters (subprocess boundaries)."""

from .fsl_fast import FASTRunResult, fast_available, run_fast_tissue_segmentation
from .fsl_first import FIRSTRunResult, first_available, run_first_subcortical

__all__ = [
    "FASTRunResult",
    "fast_available",
    "run_fast_tissue_segmentation",
    "FIRSTRunResult",
    "first_available",
    "run_first_subcortical",
]

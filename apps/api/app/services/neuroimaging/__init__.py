"""Phase 1 neuroimaging I/O wrappers.

Each optional library is guarded in its own try/except block so a single
missing dependency does not suppress availability of the others.
"""
from __future__ import annotations

try:
    import nibabel as _nibabel  # noqa: F401
    HAS_NIBABEL: bool = True
except ImportError:
    HAS_NIBABEL = False

try:
    import bids as _bids  # noqa: F401
    HAS_PYBIDS: bool = True
except ImportError:
    HAS_PYBIDS = False

try:
    import pynwb as _pynwb  # noqa: F401
    HAS_PYNWB: bool = True
except ImportError:
    HAS_PYNWB = False

from .nibabel_io import load_nifti, nifti_header_summary
from .pybids_query import open_layout, summarise_layout, query_files
from .pynwb_io import write_minimal_nwb, read_nwb_summary
from .schemas import (
    NiftiSummary,
    LayoutSummary,
    BIDSFileRef,
    NwbSummary,
    NeuroimagingHealth,
)

__all__ = [
    "HAS_NIBABEL",
    "HAS_PYBIDS",
    "HAS_PYNWB",
    "load_nifti",
    "nifti_header_summary",
    "open_layout",
    "summarise_layout",
    "query_files",
    "write_minimal_nwb",
    "read_nwb_summary",
    "NiftiSummary",
    "LayoutSummary",
    "BIDSFileRef",
    "NwbSummary",
    "NeuroimagingHealth",
]

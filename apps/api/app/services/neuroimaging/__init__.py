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

try:
    import nilearn as _nilearn  # noqa: F401
    HAS_NILEARN: bool = True
except ImportError:
    HAS_NILEARN = False

try:
    import dipy.reconst.dti as _dti_check  # noqa: F401
    HAS_DIPY: bool = True
except ImportError:
    HAS_DIPY = False

from .nibabel_io import load_nifti, nifti_header_summary
from .pybids_query import open_layout, summarise_layout, query_files
from .pynwb_io import write_minimal_nwb, read_nwb_summary
from .neurokit_physio import HAS_NEUROKIT, process_ecg, process_eda, process_rsp
from .nilearn_io import mask_nifti, extract_atlas_timeseries, compute_connectome
from .dipy_dwi import load_dwi, fit_dti
from .schemas import (
    NiftiSummary,
    LayoutSummary,
    BIDSFileRef,
    NwbSummary,
    NeuroimagingHealth,
    EcgFeatures,
    EdaFeatures,
    RspFeatures,
    MaskerSummary,
    AtlasTimeseriesSummary,
    ConnectomeSummary,
    DwiSummary,
    DtiScalarSummary,
    EegModelSummary,
)

__all__ = [
    "HAS_NIBABEL",
    "HAS_PYBIDS",
    "HAS_PYNWB",
    "HAS_NEUROKIT",
    "HAS_NILEARN",
    "HAS_DIPY",
    "load_nifti",
    "nifti_header_summary",
    "open_layout",
    "summarise_layout",
    "query_files",
    "write_minimal_nwb",
    "read_nwb_summary",
    "process_ecg",
    "process_eda",
    "process_rsp",
    "mask_nifti",
    "extract_atlas_timeseries",
    "compute_connectome",
    "load_dwi",
    "fit_dti",
    "NiftiSummary",
    "LayoutSummary",
    "BIDSFileRef",
    "NwbSummary",
    "NeuroimagingHealth",
    "EcgFeatures",
    "EdaFeatures",
    "RspFeatures",
    "MaskerSummary",
    "AtlasTimeseriesSummary",
    "ConnectomeSummary",
    "DwiSummary",
    "DtiScalarSummary",
    "EegModelSummary",
    "build_eegnet",
    "forward_pass",
    "HAS_BRAINDECODE",
    "HAS_TORCH",
]

"""Phase 1 neuroimaging I/O endpoints.

Dark-launch: only mounted when DEEPSYNAPS_ENABLE_NEUROIMAGING=1.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.errors import ApiServiceError
from app.services.neuroimaging import (
    HAS_NIBABEL,
    HAS_PYBIDS,
    HAS_PYNWB,
    nifti_header_summary,
    open_layout,
    read_nwb_summary,
    summarise_layout,
)
from app.services.neuroimaging.schemas import (
    BIDSFileRef,
    LayoutSummary,
    NeuroimagingHealth,
    NiftiSummary,
    NwbSummary,
)

router = APIRouter(prefix="/api/v1/neuroimaging", tags=["neuroimaging"])

_503 = ApiServiceError(
    code="neuroimaging_library_unavailable",
    message="Required neuroimaging library is not installed in this environment.",
    status_code=503,
)


class _BIDSSummariseRequest(BaseModel):
    root_path: str


@router.get("/health", response_model=NeuroimagingHealth)
def get_health() -> NeuroimagingHealth:
    """Return availability of each Phase 1 neuroimaging library."""
    versions: dict[str, str | None] = {}
    if HAS_NIBABEL:
        import nibabel
        versions["nibabel"] = nibabel.__version__
    else:
        versions["nibabel"] = None
    if HAS_PYBIDS:
        import bids
        versions["pybids"] = bids.__version__
    else:
        versions["pybids"] = None
    if HAS_PYNWB:
        import pynwb
        versions["pynwb"] = pynwb.__version__
    else:
        versions["pynwb"] = None
    return NeuroimagingHealth(
        nibabel=HAS_NIBABEL,
        pybids=HAS_PYBIDS,
        pynwb=HAS_PYNWB,
        versions=versions,
    )


@router.post("/nifti/inspect", response_model=NiftiSummary)
async def inspect_nifti(
    file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NiftiSummary:
    """Upload a NIfTI file and return header summary."""
    if not HAS_NIBABEL:
        raise _503
    suffix = Path(file.filename or "upload.nii").suffix or ".nii"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    return nifti_header_summary(tmp_path)


@router.post("/bids/summarise", response_model=LayoutSummary)
def summarise_bids(
    body: _BIDSSummariseRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> LayoutSummary:
    """Open a server-side BIDS dataset root and return layout summary."""
    if not HAS_PYBIDS:
        raise _503
    layout = open_layout(body.root_path)
    return summarise_layout(layout)


@router.post("/nwb/inspect", response_model=NwbSummary)
async def inspect_nwb(
    file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NwbSummary:
    """Upload an NWB file and return summary."""
    if not HAS_PYNWB:
        raise _503
    with tempfile.NamedTemporaryFile(suffix=".nwb", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    return read_nwb_summary(tmp_path)

"""Phase 1 neuroimaging I/O endpoints.

Dark-launch: only mounted when DEEPSYNAPS_ENABLE_NEUROIMAGING=1.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, Request, UploadFile
from pydantic import BaseModel

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.errors import ApiServiceError
from app.limiter import limiter
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

_MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MiB

_NIFTI_EXTS = frozenset({".nii", ".nii.gz"})
_NWB_EXTS = frozenset({".nwb"})

# NIfTI-1 uncompressed magic at byte offset 344
_NIFTI1_MAGIC = b"n+1\x00"
# gzip magic for .nii.gz
_GZIP_MAGIC = b"\x1f\x8b"
# HDF5 magic for .nwb
_HDF5_MAGIC = b"\x89HDF\r\n\x1a\n"


def _bids_allow_list() -> list[Path]:
    """Return the list of allowed BIDS root prefixes.

    Priority: DEEPSYNAPS_BIDS_ROOTS env (colon-separated absolute paths),
    then /data/bids (Fly volume destination from fly.toml [[mounts]]) and
    /tmp/deepsynaps_bids as fallback.
    """
    raw = os.environ.get("DEEPSYNAPS_BIDS_ROOTS", "").strip()
    if raw:
        return [Path(p) for p in raw.split(":") if p]
    return [Path("/data/bids"), Path("/tmp/deepsynaps_bids")]


async def _stream_upload_to_file(file: UploadFile, dest: Path, max_bytes: int) -> None:
    """Stream *file* to *dest*, raising 413 if *max_bytes* is exceeded."""
    total = 0
    with open(dest, "wb") as fh:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ApiServiceError(
                    status_code=413,
                    code="file_too_large",
                    message=f"File exceeds maximum size of {max_bytes // (1024 * 1024)} MB",
                )
            fh.write(chunk)


class _BIDSSummariseRequest(BaseModel):
    root_path: str


@router.get("/health", response_model=NeuroimagingHealth)
def get_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NeuroimagingHealth:
    """Return availability of each Phase 1 neuroimaging library."""
    require_minimum_role(actor, "clinician")
    return NeuroimagingHealth(
        nibabel=HAS_NIBABEL,
        pybids=HAS_PYBIDS,
        pynwb=HAS_PYNWB,
        versions={},
    )


@router.post("/nifti/inspect", response_model=NiftiSummary)
@limiter.limit("10/minute")
async def inspect_nifti(
    request: Request,
    file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NiftiSummary:
    """Upload a NIfTI file and return header summary."""
    if not HAS_NIBABEL:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="nibabel is not installed",
        )
    require_minimum_role(actor, "clinician")

    name = file.filename or "upload.nii"
    suffix = "".join(Path(name).suffixes[-2:]) or Path(name).suffix
    if suffix not in _NIFTI_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"Unsupported extension '{suffix}'. Accepted: {', '.join(sorted(_NIFTI_EXTS))}",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "upload.nii.gz"
        await _stream_upload_to_file(file, tmp_path, _MAX_UPLOAD_BYTES)
        with open(tmp_path, "rb") as fh:
            header_bytes = fh.read(352)
        if suffix == ".nii.gz":
            if header_bytes[:2] != _GZIP_MAGIC:
                raise ApiServiceError(
                    status_code=415,
                    code="invalid_file_signature",
                    message="File does not appear to be a valid gzip-compressed NIfTI (.nii.gz)",
                )
        else:
            if len(header_bytes) >= 348 and header_bytes[344:348] != _NIFTI1_MAGIC:
                raise ApiServiceError(
                    status_code=415,
                    code="invalid_file_signature",
                    message="File does not appear to be a valid NIfTI-1 file (bad magic bytes at offset 344)",
                )
        return nifti_header_summary(str(tmp_path))


@router.post("/bids/summarise", response_model=LayoutSummary)
def summarise_bids(
    body: _BIDSSummariseRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> LayoutSummary:
    """Open a server-side BIDS dataset root and return layout summary."""
    if not HAS_PYBIDS:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="pybids is not installed",
        )
    require_minimum_role(actor, "clinician")

    try:
        resolved = Path(body.root_path).resolve(strict=True)
    except (OSError, ValueError):
        raise ApiServiceError(
            status_code=403,
            code="bids_root_not_allowed",
            message="The provided BIDS root path does not exist or is not accessible.",
        )

    allow_list = _bids_allow_list()
    if not any(
        resolved == prefix or resolved.is_relative_to(prefix)
        for prefix in allow_list
    ):
        raise ApiServiceError(
            status_code=403,
            code="bids_root_not_allowed",
            message="The provided BIDS root path is not in the server allow-list.",
        )

    layout = open_layout(str(resolved))
    return summarise_layout(layout)


@router.post("/nwb/inspect", response_model=NwbSummary)
@limiter.limit("10/minute")
async def inspect_nwb(
    request: Request,
    file: UploadFile,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NwbSummary:
    """Upload an NWB file and return summary."""
    if not HAS_PYNWB:
        raise ApiServiceError(
            status_code=503,
            code="neuroimaging_library_unavailable",
            message="pynwb is not installed",
        )
    require_minimum_role(actor, "clinician")

    name = file.filename or "upload.nwb"
    suffix = Path(name).suffix.lower()
    if suffix not in _NWB_EXTS:
        raise ApiServiceError(
            status_code=415,
            code="unsupported_media_type",
            message=f"Unsupported extension '{suffix}'. Accepted: .nwb",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "upload.nwb"
        await _stream_upload_to_file(file, tmp_path, _MAX_UPLOAD_BYTES)
        with open(tmp_path, "rb") as fh:
            magic = fh.read(8)
        if magic != _HDF5_MAGIC:
            raise ApiServiceError(
                status_code=415,
                code="invalid_file_signature",
                message="File does not appear to be a valid HDF5/NWB file (bad magic bytes)",
            )
        return read_nwb_summary(str(tmp_path))

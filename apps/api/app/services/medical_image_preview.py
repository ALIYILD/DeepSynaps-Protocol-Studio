"""Medical Imaging Preview service — MIQ-inspired, web-native.

Inspired by https://github.com/marcoduering/MIQ (a macOS Quick Look extension
for medical volume images: NIfTI / FreeSurfer / MRtrix). The DeepSynaps build
mirrors MIQ's product principles:

* Quick orthogonal preview (axial / coronal / sagittal mid-slice).
* Metadata panel (dimensions, voxel size, datatype, orientation note).
* Raw orientation by default — no forced reorientation.
* For 4D data, preview the first volume.
* Strong non-diagnostic disclaimer.

It is NOT a clinical AI model and NOT a diagnostic engine. It does not infer
pathology and never produces lesion / atrophy / tumour / connectivity claims.

Hard safety contract — see :data:`PREVIEW_DISCLAIMER` and
:data:`build_safe_report_sentence`. ``build_medical_image_context_for_report``
is the only entry-point that report-generation code may use; it is guaranteed
to never include diagnostic interpretation.
"""
from __future__ import annotations

import gzip
import io
import logging
import os
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

_log = logging.getLogger(__name__)


# ── Public safety strings — referenced by router + frontend ──────────────────

PREVIEW_DISCLAIMER = (
    "Medical image preview only. Not diagnostic. Verify against the original "
    "imaging study and the formal radiology / clinical report."
)

NON_DIAGNOSTIC_WARNINGS: tuple[str, ...] = (
    "Preview only; not diagnostic.",
    "Automated MRI interpretation not performed.",
    "Raw orientation preview; not reoriented.",
)

# Safe sentences emitted into AI / templated reports. Deterministic strings —
# the report layer must NOT post-process these into stronger language.
SAFE_REPORT_SENTENCES = {
    "unavailable": (
        "No MRI / medical imaging file was available in this workspace at "
        "the time of generation."
    ),
    "metadata_only": (
        "MRI / medical imaging metadata was available, but no automated "
        "image interpretation was performed."
    ),
    "preview_ready": (
        "A non-diagnostic preview of the uploaded medical volume was "
        "generated for clinician navigation. Automated diagnostic "
        "interpretation was not performed. Findings should be verified "
        "against the original scan and formal radiology / clinical report."
    ),
    "clinician_note": (
        "Clinician-entered imaging note is included verbatim and is not "
        "re-interpreted by the AI report."
    ),
    "refuse_diagnosis": (
        "Automated diagnostic MRI interpretation is outside the current "
        "validated scope. Please use a radiologist / qualified clinician "
        "report."
    ),
}


# ── Format detection ─────────────────────────────────────────────────────────

# Order matters: longer suffixes first so .nii.gz wins over .gz.
_SUPPORTED_SUFFIXES: tuple[tuple[str, str], ...] = (
    (".nii.gz", "NIfTI"),
    (".nii", "NIfTI"),
    (".mgh.gz", "FreeSurfer"),
    (".mgz", "FreeSurfer"),
    (".mgh", "FreeSurfer"),
    (".mif.gz", "MRtrix"),
    (".mif", "MRtrix"),
)


def supported_formats() -> list[dict[str, Any]]:
    """Public registry of preview-eligible formats.

    Tier "primary" = implemented end-to-end (preview slices generated).
    Tier "metadata" = format detected but no slice rendering yet.

    FreeSurfer rendering requires nibabel; when nibabel is not installed at
    runtime FreeSurfer falls back to ``"metadata"`` so callers don't promise
    slices the worker cannot deliver. MRtrix stays at ``"metadata"`` because
    nibabel does not ship a ``.mif`` reader.
    """
    has_nibabel = _try_import_nibabel() is not None
    return [
        {"format": "NIfTI", "extensions": [".nii", ".nii.gz"], "tier": "primary"},
        {
            "format": "FreeSurfer",
            "extensions": [".mgh", ".mgz", ".mgh.gz"],
            "tier": "primary" if has_nibabel else "metadata",
        },
        {"format": "MRtrix", "extensions": [".mif", ".mif.gz"], "tier": "metadata"},
    ]


def is_supported_medical_volume(filename: str) -> bool:
    return detect_medical_volume_format(filename) is not None


def detect_medical_volume_format(filename: str) -> Optional[str]:
    """Return the format name (NIfTI / FreeSurfer / MRtrix) or ``None``."""
    if not filename:
        return None
    lower = filename.lower().strip()
    for suffix, fmt in _SUPPORTED_SUFFIXES:
        if lower.endswith(suffix):
            return fmt
    return None


def _is_compressed(filename: str) -> bool:
    return filename.lower().endswith(".gz") or filename.lower().endswith(".mgz")


# ── Metadata structures ──────────────────────────────────────────────────────


@dataclass
class MedicalVolumeMetadata:
    """Structured, PHI-safe metadata extracted from a medical volume.

    Fields are intentionally narrow — anything that might encode patient
    identifiers (DICOM tags, study description, patient name) is dropped.
    """

    filename: str
    format: str
    dimensions: list[int] = field(default_factory=list)
    voxel_size_mm: list[float] = field(default_factory=list)
    volumes: int = 1
    datatype: Optional[str] = None
    orientation_note: str = (
        "Raw orientation preview; not reoriented. Anatomical labels not "
        "guaranteed without a clinician verifying against the source scan."
    )
    file_size_bytes: Optional[int] = None
    compressed: bool = False
    qform_code: Optional[int] = None
    sform_code: Optional[int] = None
    intensity_min: Optional[float] = None
    intensity_max: Optional[float] = None
    warnings: list[str] = field(default_factory=lambda: list(NON_DIAGNOSTIC_WARNINGS))

    def as_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "format": self.format,
            "dimensions": list(self.dimensions),
            "voxel_size_mm": list(self.voxel_size_mm),
            "volumes": self.volumes,
            "datatype": self.datatype,
            "orientation_note": self.orientation_note,
            "file_size_bytes": self.file_size_bytes,
            "compressed": self.compressed,
            "qform_code": self.qform_code,
            "sform_code": self.sform_code,
            "intensity_min": self.intensity_min,
            "intensity_max": self.intensity_max,
            "warnings": list(self.warnings),
        }


@dataclass
class MedicalVolumePreview:
    """Result of preview generation."""

    metadata: MedicalVolumeMetadata
    axial_path: Optional[str] = None
    coronal_path: Optional[str] = None
    sagittal_path: Optional[str] = None
    status: str = "ready"  # ready | metadata_only | unsupported | error
    error: Optional[str] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "metadata": self.metadata.as_dict(),
            "axial_path": self.axial_path,
            "coronal_path": self.coronal_path,
            "sagittal_path": self.sagittal_path,
            "status": self.status,
            "error": self.error,
        }


# ── nibabel-optional loaders ─────────────────────────────────────────────────

# Limit synchronous request-response work. Larger uploads should be queued by
# the existing MRI pipeline (see app.services.mri_pipeline).
MAX_PREVIEW_BYTES = 256 * 1024 * 1024  # 256 MB


def _try_import_nibabel():
    try:
        import nibabel as nib  # type: ignore[import-not-found]

        return nib
    except Exception:  # pragma: no cover — thin install
        return None


# NIfTI-1 datatype codes → human label.
_NIFTI_DATATYPE_NAMES = {
    2: "uint8",
    4: "int16",
    8: "int32",
    16: "float32",
    32: "complex64",
    64: "float64",
    128: "rgb24",
    256: "int8",
    512: "uint16",
    768: "uint32",
    1024: "int64",
    1280: "uint64",
}

# struct.unpack format → numpy-readable byte size.
_NIFTI_DTYPE_LAYOUT = {
    2: ("u1", 1),
    4: ("i2", 2),
    8: ("i4", 4),
    16: ("f4", 4),
    64: ("f8", 8),
    256: ("i1", 1),
    512: ("u2", 2),
    768: ("u4", 4),
    1024: ("i8", 8),
    1280: ("u8", 8),
}


def _open_volume_bytes(file_path: str) -> bytes:
    if file_path.lower().endswith(".gz"):
        with gzip.open(file_path, "rb") as fh:
            return fh.read()
    with open(file_path, "rb") as fh:
        return fh.read()


def _parse_nifti1_header(raw: bytes) -> dict[str, Any]:
    """Manual NIfTI-1 header parse — used as a nibabel-free fallback.

    Only fields needed for preview + metadata are returned. Big-endian
    NIfTI files are detected via the ``sizeof_hdr`` magic and parsed
    accordingly.
    """
    if len(raw) < 348:
        raise ValueError("file shorter than NIfTI-1 header")

    sizeof_hdr = struct.unpack_from("<i", raw, 0)[0]
    endian = "<"
    if sizeof_hdr != 348:
        sizeof_hdr_be = struct.unpack_from(">i", raw, 0)[0]
        if sizeof_hdr_be == 348:
            endian = ">"
        else:
            raise ValueError(f"not a NIfTI-1 header (sizeof_hdr={sizeof_hdr})")

    magic = bytes(raw[344:348])
    if magic not in (b"n+1\x00", b"ni1\x00"):
        raise ValueError(f"NIfTI magic missing (got {magic!r})")

    # dim[0..7] — 8 shorts at offset 40.
    dims = struct.unpack_from(endian + "8h", raw, 40)
    ndim = max(0, min(int(dims[0]), 7))
    shape = [int(d) for d in dims[1 : 1 + ndim] if d > 0] or [int(d) for d in dims[1:4]]

    datatype = struct.unpack_from(endian + "h", raw, 70)[0]
    bitpix = struct.unpack_from(endian + "h", raw, 72)[0]

    pixdims = struct.unpack_from(endian + "8f", raw, 76)
    voxel_size = [float(p) for p in pixdims[1:4]]

    vox_offset = float(struct.unpack_from(endian + "f", raw, 108)[0])
    qform_code = int(struct.unpack_from(endian + "h", raw, 252)[0])
    sform_code = int(struct.unpack_from(endian + "h", raw, 254)[0])

    return {
        "endian": endian,
        "shape": shape,
        "ndim": ndim,
        "datatype": int(datatype),
        "bitpix": int(bitpix),
        "voxel_size": voxel_size,
        "vox_offset": vox_offset,
        "qform_code": qform_code,
        "sform_code": sform_code,
        "magic": magic.rstrip(b"\x00").decode("ascii", errors="replace"),
    }


def _read_nifti1_volume_array(file_path: str):
    """Read first volume of a NIfTI-1 file as a 3-D numpy array.

    Falls back from nibabel when the package is not installed. Returns
    (numpy.ndarray, header_dict). The numpy array is always float32 and
    rescaled to its native value range; downstream PNG generation handles
    the windowing.
    """
    import numpy as np  # local — keep service import-time cheap

    raw = _open_volume_bytes(file_path)
    header = _parse_nifti1_header(raw)
    layout = _NIFTI_DTYPE_LAYOUT.get(header["datatype"])
    if layout is None:
        raise ValueError(f"unsupported NIfTI datatype code {header['datatype']}")
    dtype_str, _bytes_per_voxel = layout

    shape = header["shape"]
    if len(shape) < 3:
        raise ValueError(f"need 3-D or 4-D volume, got shape {shape}")
    nx, ny, nz = shape[0], shape[1], shape[2]
    nt = shape[3] if len(shape) >= 4 else 1

    offset = int(header["vox_offset"])
    voxels_per_volume = nx * ny * nz
    endian = header["endian"]
    np_dtype = np.dtype(endian + dtype_str)

    needed = offset + voxels_per_volume * np_dtype.itemsize
    if len(raw) < needed:
        raise ValueError(
            f"NIfTI body shorter than expected ({len(raw)} < {needed})"
        )

    flat = np.frombuffer(
        raw, dtype=np_dtype, count=voxels_per_volume, offset=offset
    )
    # NIfTI is Fortran-order (x fastest). Reshape accordingly so the axes
    # match dim[1..3] = (X, Y, Z).
    volume = flat.reshape((nz, ny, nx)).transpose(2, 1, 0)
    return volume.astype("float32", copy=False), header, nt


# ── Metadata extraction ──────────────────────────────────────────────────────


def extract_medical_volume_metadata(file_path: str) -> MedicalVolumeMetadata:
    """Return safe metadata for a supported medical volume.

    NIfTI files use either nibabel (when installed) or the pure-Python
    fallback header parse. Other formats return a ``metadata`` skeleton
    (no shape until nibabel is available).
    """
    filename = os.path.basename(file_path)
    fmt = detect_medical_volume_format(filename) or "unknown"
    md = MedicalVolumeMetadata(filename=filename, format=fmt)
    try:
        md.file_size_bytes = os.path.getsize(file_path)
    except OSError:
        md.file_size_bytes = None
    md.compressed = _is_compressed(filename)

    if fmt == "NIfTI":
        try:
            _populate_nifti_metadata(md, file_path)
        except Exception as exc:
            md.warnings.append(f"Metadata parse failed: {type(exc).__name__}.")
            _log.warning("nifti metadata parse failed: %s", exc)
    elif fmt in ("FreeSurfer", "MRtrix"):
        nib = _try_import_nibabel()
        if nib is None:
            md.warnings.append(
                f"{fmt} metadata extraction requires the nibabel package."
            )
        else:
            try:
                img = nib.load(file_path)  # type: ignore[union-attr]
                shape = list(getattr(img, "shape", ()) or [])
                md.dimensions = [int(d) for d in shape[:3]]
                md.volumes = int(shape[3]) if len(shape) >= 4 else 1
                zooms = list(getattr(img.header, "get_zooms", lambda: ())() or [])
                md.voxel_size_mm = [float(z) for z in zooms[:3]]
                md.datatype = str(getattr(img.header, "get_data_dtype", lambda: "")())
            except Exception as exc:  # pragma: no cover — nibabel-specific
                md.warnings.append(
                    f"{fmt} metadata parse failed: {type(exc).__name__}."
                )
                _log.warning("%s metadata parse failed: %s", fmt, exc)

    if md.volumes > 1:
        md.warnings.append(
            "4-D volume — preview shows the first volume only."
        )
    return md


def _populate_nifti_metadata(md: MedicalVolumeMetadata, file_path: str) -> None:
    nib = _try_import_nibabel()
    if nib is not None:
        try:
            img = nib.load(file_path)  # type: ignore[union-attr]
            shape = list(img.shape)
            md.dimensions = [int(d) for d in shape[:3]]
            md.volumes = int(shape[3]) if len(shape) >= 4 else 1
            zooms = list(img.header.get_zooms() or [])
            md.voxel_size_mm = [float(z) for z in zooms[:3]]
            md.datatype = str(img.header.get_data_dtype())
            md.qform_code = int(img.header["qform_code"])
            md.sform_code = int(img.header["sform_code"])
            return
        except Exception as exc:  # pragma: no cover — fall through
            _log.info("nibabel parse failed, using fallback: %s", exc)

    raw = _open_volume_bytes(file_path)
    header = _parse_nifti1_header(raw)
    md.dimensions = list(header["shape"][:3])
    md.volumes = header["shape"][3] if len(header["shape"]) >= 4 else 1
    md.voxel_size_mm = list(header["voxel_size"])
    md.datatype = _NIFTI_DATATYPE_NAMES.get(header["datatype"], f"code{header['datatype']}")
    md.qform_code = header["qform_code"]
    md.sform_code = header["sform_code"]


# ── Slice generation ─────────────────────────────────────────────────────────


def normalize_slice_for_preview(slice_array) -> "Image.Image":  # noqa: F821 — Pillow
    """Window-level normalize a 2-D array → 8-bit greyscale Pillow image.

    Uses a robust min-max stretch (1st / 99th percentile when possible) so
    a bright datatype range does not crush mid-tones. Returns a Pillow
    ``Image`` in mode ``L``.
    """
    import numpy as np
    from PIL import Image

    arr = np.asarray(slice_array, dtype="float32")
    if arr.ndim != 2:
        raise ValueError(f"normalize_slice_for_preview expects 2-D, got {arr.shape}")

    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return Image.new("L", arr.shape[::-1], 0)

    lo = float(np.percentile(finite, 1.0))
    hi = float(np.percentile(finite, 99.0))
    if hi <= lo:
        lo = float(finite.min())
        hi = float(finite.max())
    if hi <= lo:
        return Image.new("L", arr.shape[::-1], 0)

    scaled = ((np.clip(arr, lo, hi) - lo) / (hi - lo) * 255.0).astype("uint8")
    # Flip vertically so anatomical "up" matches how a radiologist expects to
    # see an image, without claiming any reorientation has happened.
    scaled = scaled[::-1, :]
    return Image.fromarray(scaled, mode="L")


def _reduce_to_first_3d_slab(data):
    """Collapse anything past the 3rd axis to a single 3-D slab.

    ``nibabel`` data arrays for non-NIfTI formats can be 3-D (anatomical),
    4-D (time series, or DWI volume index), or even 5-D (vector / tensor
    field — e.g. some MRtrix or extended FreeSurfer outputs). For preview
    we always render a single 3-D slab. The function returns
    ``(slab_3d, total_volumes_along_axis3, extra_axes_count)`` so the
    caller can emit a clear warning when more than one trailing axis was
    folded away. ``total_volumes_along_axis3`` mirrors the NIfTI semantics
    (axis-3 length) so 4-D-time-series previews still report the correct
    volume count.
    """
    import numpy as np

    arr = np.asarray(data)
    if arr.ndim <= 3:
        # Pad degenerate trailing 1-axes (e.g. shape (X, Y, 1)) to a 2-D
        # slice — only meaningful when ndim == 3. We just return as-is and
        # let the caller's 3-D check handle truly degenerate shapes.
        return arr, 1, 0
    total = int(arr.shape[3]) if arr.ndim >= 4 else 1
    # Take index 0 along every axis past the 3rd until we have a 3-D slab.
    extra = arr.ndim - 3
    slab = arr
    while slab.ndim > 3:
        slab = slab[..., 0] if slab.ndim > 4 else slab[..., 0]
    return slab, total, extra - 1  # extra-1 because the first folded axis is the "volumes" axis


def safe_load_first_volume(file_path: str):
    """Return (volume_3d, metadata, total_volumes) — nibabel or fallback.

    Refuses files larger than :data:`MAX_PREVIEW_BYTES` to keep the
    request-response path safe.
    """
    size = os.path.getsize(file_path)
    if size > MAX_PREVIEW_BYTES:
        raise ValueError(
            f"file too large for synchronous preview ({size} bytes); use the "
            "background MRI pipeline instead"
        )

    fmt = detect_medical_volume_format(os.path.basename(file_path))
    if fmt != "NIfTI":
        nib = _try_import_nibabel()
        if nib is None:
            raise NotImplementedError(
                f"{fmt} preview requires the nibabel package"
            )
        img = nib.load(file_path)  # type: ignore[union-attr]
        data = img.get_fdata()
        slab, total, _extra = _reduce_to_first_3d_slab(data)
        return slab, img.header, total

    nib = _try_import_nibabel()
    if nib is not None:
        try:
            img = nib.load(file_path)  # type: ignore[union-attr]
            data = img.get_fdata()
            slab, total, _extra = _reduce_to_first_3d_slab(data)
            return slab, img.header, total
        except Exception as exc:  # pragma: no cover
            _log.info("nibabel volume read failed, using fallback: %s", exc)

    volume, header, total = _read_nifti1_volume_array(file_path)
    return volume, header, total


def generate_orthogonal_preview_slices(
    file_path: str,
    output_dir: str,
) -> MedicalVolumePreview:
    """Render axial / coronal / sagittal mid-slice PNGs.

    Always saves all three planes (or none) — partial successes are flagged
    as ``error`` so the caller can decide whether to expose them.
    """
    metadata = extract_medical_volume_metadata(file_path)
    fmt = metadata.format
    if fmt == "unknown":
        return MedicalVolumePreview(
            metadata=metadata,
            status="unsupported",
            error="File extension not recognised as a medical volume.",
        )

    # nibabel availability gate. NIfTI has a pure-Python fallback, so it can
    # always render. FreeSurfer needs nibabel. MRtrix has no Python reader in
    # nibabel, so it stays metadata-only regardless.
    nib = _try_import_nibabel()
    if fmt == "MRtrix":
        return MedicalVolumePreview(
            metadata=metadata,
            status="metadata_only",
            error=(
                "MRtrix (.mif) slice rendering is not yet supported; "
                "metadata only. Use the original viewer for visual review."
            ),
        )
    if fmt == "FreeSurfer" and nib is None:
        return MedicalVolumePreview(
            metadata=metadata,
            status="metadata_only",
            error=f"{fmt} preview requires the nibabel package.",
        )

    try:
        import numpy as np

        volume, _hdr, total_volumes = safe_load_first_volume(file_path)
        # Track whether nibabel handed us a >4-D array (e.g. a DWI tensor
        # field) so we can warn — generation still proceeds against the
        # collapsed first 3-D slab, never claiming diagnostic interpretation.
        original_ndim = None
        if nib is not None and fmt != "NIfTI":
            try:
                _img = nib.load(file_path)  # type: ignore[union-attr]
                original_ndim = int(_img.ndim) if hasattr(_img, "ndim") else len(
                    list(getattr(_img, "shape", ()) or [])
                )
            except Exception:  # pragma: no cover — best-effort warning only
                original_ndim = None

        if volume.ndim != 3:
            raise ValueError(f"expected 3-D volume, got shape {volume.shape}")

        nx, ny, nz = volume.shape
        cx, cy, cz = nx // 2, ny // 2, nz // 2

        sagittal = np.rot90(volume[cx, :, :])
        coronal = np.rot90(volume[:, cy, :])
        axial = np.rot90(volume[:, :, cz])

        os.makedirs(output_dir, exist_ok=True)
        axial_path = os.path.join(output_dir, "axial.png")
        coronal_path = os.path.join(output_dir, "coronal.png")
        sagittal_path = os.path.join(output_dir, "sagittal.png")

        normalize_slice_for_preview(axial).save(axial_path)
        normalize_slice_for_preview(coronal).save(coronal_path)
        normalize_slice_for_preview(sagittal).save(sagittal_path)

        finite = volume[np.isfinite(volume)]
        if finite.size:
            metadata.intensity_min = float(finite.min())
            metadata.intensity_max = float(finite.max())

        if total_volumes and total_volumes > 1 and metadata.volumes <= 1:
            metadata.volumes = int(total_volumes)
            metadata.warnings.append(
                "4-D volume — preview shows the first volume only."
            )

        # If the source array carried more than 4 dims (e.g. a DWI tensor
        # field stored as 5-D), we collapsed every trailing axis to index 0.
        # Surface that fact loudly; never imply we interpreted the rest.
        if original_ndim is not None and original_ndim > 4:
            metadata.warnings.append(
                f"{fmt} volume has {original_ndim} dimensions; preview "
                "shows the first 3-D slab only and is not a tensor / "
                "vector visualisation."
            )

        return MedicalVolumePreview(
            metadata=metadata,
            axial_path=axial_path,
            coronal_path=coronal_path,
            sagittal_path=sagittal_path,
            status="ready",
        )
    except Exception as exc:
        _log.warning("preview generation failed: %s", exc)
        return MedicalVolumePreview(
            metadata=metadata,
            status="error",
            error=f"{type(exc).__name__}: {exc}",
        )


# ── Report-context helper ────────────────────────────────────────────────────

# Words the report-context layer must NEVER emit when assembling MRI / qEEG
# narrative. Used both as a positive contract for tests and as a runtime
# scrub on clinician notes that happen to contain them.
DIAGNOSTIC_FORBIDDEN_TERMS: tuple[str, ...] = (
    "lesion",
    "atrophy",
    "tumour",
    "tumor",
    "neuroinflammation",
    "neuro-inflammation",
    "infarct",
    "stroke confirmed",
    "demyelination",
    "white-matter disease",
    "cortical thinning",
    "perfusion deficit",
    "tractography finding",
)


def _has_diagnostic_terms(text: Optional[str]) -> bool:
    if not text:
        return False
    lower = text.lower()
    return any(term in lower for term in DIAGNOSTIC_FORBIDDEN_TERMS)


def build_safe_report_sentence(
    *,
    available: bool,
    preview_ready: bool,
    has_clinician_note: bool,
) -> str:
    if not available:
        return SAFE_REPORT_SENTENCES["unavailable"]
    if preview_ready:
        sentence = SAFE_REPORT_SENTENCES["preview_ready"]
    else:
        sentence = SAFE_REPORT_SENTENCES["metadata_only"]
    if has_clinician_note:
        sentence = sentence + " " + SAFE_REPORT_SENTENCES["clinician_note"]
    return sentence


def build_medical_image_context_for_report(
    *,
    metadata: Optional[MedicalVolumeMetadata] = None,
    preview_status: Optional[str] = None,
    source: str = "uploaded_nifti",
    clinician_imaging_note: Optional[str] = None,
    patient_id: Optional[str] = None,
    image_id: Optional[str] = None,
) -> dict[str, Any]:
    """Return the ``medical_image_context`` block consumed by report
    generators.

    Hard contract: this function NEVER emits diagnostic claims and ALWAYS
    sets ``automated_interpretation_performed = false``. If the caller
    passes a clinician note that contains a diagnostic-forbidden term it
    is preserved verbatim (so the clinician's words are not silently
    rewritten) but flagged in ``warnings`` so the report layer can label
    it as clinician-entered rather than AI-derived.
    """
    available = metadata is not None
    preview_ready = preview_status == "ready"
    has_note = bool(clinician_imaging_note and clinician_imaging_note.strip())

    warnings = list(NON_DIAGNOSTIC_WARNINGS)
    if has_note and _has_diagnostic_terms(clinician_imaging_note):
        warnings.append(
            "Clinician-entered note contains diagnostic terms; render "
            "verbatim and label as clinician-entered."
        )

    context: dict[str, Any] = {
        "available": available,
        "source": source if available else None,
        "preview_status": preview_status if available else "unavailable",
        "automated_interpretation_performed": False,
        "clinician_imaging_note": clinician_imaging_note if has_note else None,
        "image_id": image_id,
        "patient_id": patient_id,
        "warnings": warnings,
        "safe_report_sentence": build_safe_report_sentence(
            available=available,
            preview_ready=preview_ready,
            has_clinician_note=has_note,
        ),
        "disclaimer": PREVIEW_DISCLAIMER,
    }

    if metadata is not None:
        md = metadata.as_dict()
        # Only project the safe subset into the report — voxel size,
        # dimensions, format, datatype, volumes. Intentionally omits the
        # filename (PHI risk) and intensity stats (could be over-interpreted
        # as "abnormal contrast").
        context["format"] = md["format"]
        context["dimensions"] = md["dimensions"]
        context["voxel_size_mm"] = md["voxel_size_mm"]
        context["volumes"] = md["volumes"]
        context["datatype"] = md["datatype"]

    return context


__all__ = [
    "PREVIEW_DISCLAIMER",
    "NON_DIAGNOSTIC_WARNINGS",
    "SAFE_REPORT_SENTENCES",
    "DIAGNOSTIC_FORBIDDEN_TERMS",
    "MAX_PREVIEW_BYTES",
    "MedicalVolumeMetadata",
    "MedicalVolumePreview",
    "supported_formats",
    "is_supported_medical_volume",
    "detect_medical_volume_format",
    "extract_medical_volume_metadata",
    "normalize_slice_for_preview",
    "safe_load_first_volume",
    "generate_orthogonal_preview_slices",
    "build_safe_report_sentence",
    "build_medical_image_context_for_report",
]

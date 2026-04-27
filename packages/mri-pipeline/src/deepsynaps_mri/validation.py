"""NIfTI / upload validation helpers for the MRI Analyzer.

These checks run BEFORE the heavy pipeline kicks off so we can reject
malformed scans with a clear error rather than crashing inside ``nibabel``
or producing silent garbage downstream.

All functions return :class:`ValidationResult` envelopes (never raise) so
the FastAPI router can map them to clean HTTP 422 responses.

Decision-support tool only — these checks are about safety + sanity, not
diagnosis.

References
----------
* NIfTI-1 magic bytes (offset 344, 4 bytes): ``n+1\\0`` (single-file) /
  ``ni1\\0`` (paired). NIfTI-2 magic at the same offset: ``n+2\\0...``.
* nibabel ``get_zooms()`` / ``get_data_shape()`` / ``get_data_dtype()``.
* DICOM zip sanity: ``zipfile.ZipFile.testzip()`` on whole archive.
"""
from __future__ import annotations

import gzip
import io
import logging
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)


# Allowed upload extensions. Lower-case, with leading dot.
ALLOWED_EXTENSIONS: tuple[str, ...] = (".nii", ".nii.gz", ".zip")

# Sanity bounds on voxel sizes (mm). Anything outside these is treated as a
# header error, not a real scan. 0.1 mm is finer than any clinical MR; 10 mm
# is coarser than the worst tolerable low-field scan.
_MIN_VOXEL_MM: float = 0.1
_MAX_VOXEL_MM: float = 10.0

# NIfTI-1 / NIfTI-2 header magic bytes at offset 344.
_NIFTI1_MAGIC = (b"n+1\x00", b"ni1\x00")
_NIFTI2_MAGIC = (b"n+2\x00\r\n\x1a\n",)
_NIFTI_MAGIC_OFFSET_N1 = 344
_NIFTI_HEADER_PROBE_BYTES = 360


@dataclass
class ValidationResult:
    """Envelope for one validation pass.

    Attributes
    ----------
    ok
        True iff *all* checks passed.
    code
        Stable machine-readable failure code, e.g. ``"nifti_bad_magic"``.
        Empty when ``ok=True``.
    message
        Human-readable explanation. Always populated for failures.
    details
        Optional structured payload of what was checked (dim, dtype,
        voxel_size_mm, etc.) for logging / debugging.
    """

    ok: bool
    code: str = ""
    message: str = ""
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "code": self.code,
            "message": self.message,
            "details": dict(self.details),
        }


def normalised_extension(filename: str) -> str:
    """Return the canonical lower-cased extension including any ``.gz``.

    >>> normalised_extension("scan.NII.GZ")
    '.nii.gz'
    >>> normalised_extension("scan.nii")
    '.nii'
    >>> normalised_extension("bundle.zip")
    '.zip'
    >>> normalised_extension("scan.dcm")
    '.dcm'
    """
    name = filename.lower()
    for ext in (".nii.gz",):
        if name.endswith(ext):
            return ext
    suffix = Path(name).suffix
    return suffix


def validate_extension(filename: str) -> ValidationResult:
    """Reject anything outside the allowed-upload whitelist."""
    ext = normalised_extension(filename or "")
    if ext in ALLOWED_EXTENSIONS:
        return ValidationResult(ok=True, details={"extension": ext})
    return ValidationResult(
        ok=False,
        code="unsupported_extension",
        message=(
            f"Unsupported MRI upload extension {ext!r}. "
            f"Accepted: {', '.join(ALLOWED_EXTENSIONS)}."
        ),
        details={"extension": ext},
    )


def _read_first_bytes(blob: bytes, limit: int = _NIFTI_HEADER_PROBE_BYTES) -> bytes:
    """Return up to ``limit`` raw bytes from the front of ``blob``.

    Handles gzip-compressed NIfTI by decompressing the head only — we don't
    materialise the whole volume just to check the magic.
    """
    if not blob:
        return b""
    # gzip magic is 1f 8b
    if blob[:2] == b"\x1f\x8b":
        try:
            with gzip.GzipFile(fileobj=_BytesIOLike(blob)) as gz:
                return gz.read(limit)
        except (OSError, EOFError) as exc:
            log.info("gzip head decompress failed (%s)", exc)
            return b""
    return blob[:limit]


class _BytesIOLike:
    """Minimal BytesIO replacement to avoid an import for one method."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self._pos = 0

    def read(self, n: int = -1) -> bytes:
        if n == -1 or n is None:
            chunk = self._payload[self._pos:]
            self._pos = len(self._payload)
            return chunk
        chunk = self._payload[self._pos:self._pos + n]
        self._pos += len(chunk)
        return chunk

    def close(self) -> None:  # gzip calls .close
        pass


def validate_nifti_magic(blob: bytes) -> ValidationResult:
    """Check NIfTI-1 / NIfTI-2 magic bytes at offset 344.

    Accepts both ``.nii`` (uncompressed) and ``.nii.gz`` payloads; the
    helper transparently decompresses the head of a gzip stream.
    """
    head = _read_first_bytes(blob)
    if len(head) < _NIFTI_MAGIC_OFFSET_N1 + 4:
        return ValidationResult(
            ok=False,
            code="nifti_too_short",
            message=(
                f"NIfTI header too short ({len(head)} bytes < "
                f"{_NIFTI_MAGIC_OFFSET_N1 + 4} required for magic check)."
            ),
            details={"head_bytes": len(head)},
        )
    magic1 = head[_NIFTI_MAGIC_OFFSET_N1:_NIFTI_MAGIC_OFFSET_N1 + 4]
    magic2 = head[_NIFTI_MAGIC_OFFSET_N1:_NIFTI_MAGIC_OFFSET_N1 + 8]
    if magic1 in _NIFTI1_MAGIC:
        return ValidationResult(ok=True, details={"variant": "nifti1", "magic": magic1.decode("ascii", "replace")})
    if magic2 in _NIFTI2_MAGIC:
        return ValidationResult(ok=True, details={"variant": "nifti2"})
    return ValidationResult(
        ok=False,
        code="nifti_bad_magic",
        message=(
            "NIfTI magic bytes missing — payload is not a valid NIfTI-1 or "
            "NIfTI-2 file. Re-export from your scanner / dcm2niix."
        ),
        details={"magic_seen": magic1.hex()},
    )


def validate_zip_archive(blob: bytes) -> ValidationResult:
    """Sanity-check a DICOM bundle .zip — non-empty, no corrupt members."""
    if not blob:
        return ValidationResult(
            ok=False,
            code="zip_empty",
            message="Uploaded zip archive is empty.",
        )
    try:
        # zipfile needs a real seekable stream — _BytesIOLike doesn't
        # implement seek(), so use io.BytesIO for the zip path.
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            members = zf.infolist()
            bad = zf.testzip()
    except zipfile.BadZipFile as exc:
        return ValidationResult(
            ok=False,
            code="zip_corrupt",
            message=f"Uploaded file is not a valid zip archive: {exc}",
        )
    except Exception as exc:  # noqa: BLE001
        log.info("zip introspection failed: %s", exc)
        return ValidationResult(
            ok=False,
            code="zip_unreadable",
            message=f"Could not read zip archive: {exc}",
        )
    if not members:
        return ValidationResult(
            ok=False,
            code="zip_empty",
            message="Zip archive contains no files.",
        )
    if bad:
        return ValidationResult(
            ok=False,
            code="zip_member_corrupt",
            message=f"Zip member is corrupt: {bad}",
            details={"bad_member": bad},
        )
    return ValidationResult(
        ok=True,
        details={"member_count": len(members)},
    )


def validate_nifti_header(path: Path | str) -> ValidationResult:
    """Use ``nibabel`` to verify dim, dtype, affine, voxel sizes are sane.

    Falls back to ``ok`` with a ``warning`` detail when nibabel is missing
    so the pipeline isn't blocked in slim environments — but the magic-byte
    check above already gates obvious garbage.
    """
    try:
        import nibabel as nib  # type: ignore[import-not-found]
        import numpy as np  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001
        log.info("nibabel not available for header validation (%s)", exc)
        return ValidationResult(
            ok=True,
            code="header_check_skipped",
            message="nibabel not installed — skipping deep header validation.",
            details={"reason": str(exc)},
        )

    p = Path(path)
    if not p.exists():
        return ValidationResult(
            ok=False,
            code="nifti_missing",
            message=f"NIfTI file not found at {p}.",
        )

    try:
        img = nib.load(str(p))
    except Exception as exc:  # noqa: BLE001
        return ValidationResult(
            ok=False,
            code="nifti_load_failed",
            message=f"nibabel failed to load NIfTI: {exc}",
        )

    details: dict = {}
    try:
        shape = tuple(int(s) for s in img.shape)
        details["shape"] = shape
        if len(shape) < 3:
            return ValidationResult(
                ok=False,
                code="nifti_low_dim",
                message=f"NIfTI has only {len(shape)} dim(s); need at least 3.",
                details=details,
            )
        if any(s <= 0 for s in shape):
            return ValidationResult(
                ok=False,
                code="nifti_zero_dim",
                message=f"NIfTI has a zero / negative dim: {shape}.",
                details=details,
            )

        dtype = str(img.get_data_dtype())
        details["dtype"] = dtype

        zooms = tuple(float(z) for z in img.header.get_zooms()[:3])
        details["voxel_size_mm"] = zooms
        for z in zooms:
            if not np.isfinite(z) or z <= 0:
                return ValidationResult(
                    ok=False,
                    code="nifti_bad_voxel",
                    message=f"NIfTI voxel size invalid: {zooms}.",
                    details=details,
                )
            if z < _MIN_VOXEL_MM or z > _MAX_VOXEL_MM:
                return ValidationResult(
                    ok=False,
                    code="nifti_voxel_out_of_range",
                    message=(
                        f"NIfTI voxel size {zooms} mm outside plausible "
                        f"range [{_MIN_VOXEL_MM}, {_MAX_VOXEL_MM}] mm."
                    ),
                    details=details,
                )

        # Affine sanity — at least one of sform / qform should be set.
        sform_code = int(img.header["sform_code"])
        qform_code = int(img.header["qform_code"])
        details["sform_code"] = sform_code
        details["qform_code"] = qform_code
        if sform_code == 0 and qform_code == 0:
            return ValidationResult(
                ok=False,
                code="nifti_no_orientation",
                message=(
                    "NIfTI has neither sform nor qform set — orientation "
                    "is unknown. Re-export with proper orientation tags."
                ),
                details=details,
            )

        # Reject a degenerate / singular affine.
        affine = np.asarray(img.affine, dtype=float)
        if not np.all(np.isfinite(affine)):
            return ValidationResult(
                ok=False,
                code="nifti_bad_affine",
                message="NIfTI affine contains non-finite values.",
                details=details,
            )
        det = float(np.linalg.det(affine[:3, :3]))
        if abs(det) < 1e-9:
            return ValidationResult(
                ok=False,
                code="nifti_singular_affine",
                message=f"NIfTI affine is singular (det={det:g}).",
                details=details,
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("nifti header validation crashed: %s", exc)
        return ValidationResult(
            ok=False,
            code="header_check_crashed",
            message=f"Unexpected error during NIfTI header check: {exc}",
            details=details,
        )

    return ValidationResult(ok=True, details=details)


def validate_upload_blob(filename: str, blob: bytes) -> ValidationResult:
    """One-shot validation for an in-memory upload.

    Pipes the blob through the extension whitelist first, then either
    NIfTI magic-byte check or zip sanity depending on extension.

    Returns the *first* failure; ``details`` always carries the raw byte
    count for downstream logging.
    """
    if not blob:
        return ValidationResult(
            ok=False,
            code="file_empty",
            message="Uploaded MRI file is empty.",
        )

    ext_check = validate_extension(filename)
    if not ext_check.ok:
        ext_check.details["bytes"] = len(blob)
        return ext_check

    ext = ext_check.details["extension"]
    if ext in (".nii", ".nii.gz"):
        magic_check = validate_nifti_magic(blob)
        magic_check.details.setdefault("bytes", len(blob))
        return magic_check

    if ext == ".zip":
        zip_check = validate_zip_archive(blob)
        zip_check.details.setdefault("bytes", len(blob))
        return zip_check

    # Should be unreachable — the whitelist is the source of truth.
    return ValidationResult(
        ok=False,
        code="unsupported_extension",
        message=f"Unsupported extension {ext!r}.",
        details={"bytes": len(blob)},
    )


__all__ = [
    "ALLOWED_EXTENSIONS",
    "ValidationResult",
    "normalised_extension",
    "validate_extension",
    "validate_nifti_magic",
    "validate_nifti_header",
    "validate_upload_blob",
    "validate_zip_archive",
]

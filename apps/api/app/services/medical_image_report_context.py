"""Safe MRI/medical-image context plumb-in for report generators.

Bridges the file-based ``medical_image_previews`` sidecar store into report
payloads via the non-diagnostic contract in
:mod:`app.services.medical_image_preview`. All consumer-facing strings come
from ``preview_service.SAFE_REPORT_SENTENCES`` or
``preview_service.build_medical_image_context_for_report`` — this module
never invents diagnostic language.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from app.services import medical_image_preview as preview_service

_log = logging.getLogger(__name__)


_PREVIEW_SUBDIR = "medical_image_previews"
_SIDECAR_NAME = "sidecar.json"


def _resolve_settings(settings: Any) -> Any:
    if settings is not None:
        return settings
    from app.settings import get_settings

    return get_settings()


def _previews_root(media_storage_root: str) -> Path:
    return Path(media_storage_root) / _PREVIEW_SUBDIR


def _read_sidecar_safe(path: Path) -> Optional[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        _log.info("medical_image_report_context: skip unreadable sidecar %s (%s)", path, exc)
        return None
    if not isinstance(data, dict):
        return None
    return data


def load_latest_medical_image_for_patient(
    patient_id: str, *, media_storage_root: str
) -> Optional[dict]:
    """Return the most recent sidecar dict whose ``patient_id`` matches.

    Reads ``<media_storage_root>/medical_image_previews/<image_id>/
    sidecar.json``. Returns ``None`` when the directory does not exist or no
    sidecar matches. Never raises on missing dir / unreadable sidecar — the
    bad sidecar is logged and skipped.
    """
    if not patient_id:
        return None
    root = _previews_root(media_storage_root)
    if not root.exists() or not root.is_dir():
        return None

    candidates: list[tuple[str, dict[str, Any]]] = []
    try:
        entries = list(root.iterdir())
    except OSError as exc:
        _log.info("medical_image_report_context: cannot list %s (%s)", root, exc)
        return None
    for entry in entries:
        if not entry.is_dir():
            continue
        sidecar_path = entry / _SIDECAR_NAME
        if not sidecar_path.exists():
            continue
        sidecar = _read_sidecar_safe(sidecar_path)
        if sidecar is None:
            continue
        if sidecar.get("patient_id") != patient_id:
            continue
        created_at = str(sidecar.get("created_at") or "")
        candidates.append((created_at, sidecar))

    if not candidates:
        return None
    candidates.sort(key=lambda t: t[0], reverse=True)
    return candidates[0][1]


def _metadata_from_sidecar(
    sidecar: dict[str, Any],
) -> Optional[preview_service.MedicalVolumeMetadata]:
    md_dict = sidecar.get("metadata") or {}
    if not md_dict:
        return None
    try:
        return preview_service.MedicalVolumeMetadata(
            filename=md_dict.get("filename") or sidecar.get("filename") or "",
            format=md_dict.get("format") or sidecar.get("format") or "unknown",
            dimensions=list(md_dict.get("dimensions") or []),
            voxel_size_mm=list(md_dict.get("voxel_size_mm") or []),
            volumes=int(md_dict.get("volumes") or 1),
            datatype=md_dict.get("datatype"),
            orientation_note=md_dict.get("orientation_note")
            or "Raw orientation preview; not reoriented.",
            file_size_bytes=md_dict.get("file_size_bytes"),
            compressed=bool(md_dict.get("compressed") or False),
            qform_code=md_dict.get("qform_code"),
            sform_code=md_dict.get("sform_code"),
            intensity_min=md_dict.get("intensity_min"),
            intensity_max=md_dict.get("intensity_max"),
            warnings=list(md_dict.get("warnings") or []),
        )
    except Exception as exc:  # pragma: no cover — defensive
        _log.info("medical_image_report_context: metadata rebuild failed (%s)", exc)
        return None


def _empty_context_block() -> dict[str, Any]:
    """Return the no-imaging-available block — uses ``unavailable`` sentence."""
    return preview_service.build_medical_image_context_for_report(
        metadata=None,
        preview_status=None,
        clinician_imaging_note=None,
        patient_id=None,
        image_id=None,
    )


def attach_medical_image_context_to_payload(
    payload: dict,
    *,
    patient_id: Optional[str],
    db=None,
    settings=None,
    clinician_imaging_note: Optional[str] = None,
) -> dict:
    """Mutate ``payload`` in place by adding a ``medical_image_context`` key.

    Idempotent — when the key already exists with the same ``image_id`` it
    is left untouched. The caller wins when a different ``image_id`` is
    pre-attached. Never includes diagnostic claims; sets ``available=false``
    when no imaging exists. The ``db`` parameter is reserved for a future
    DB-backed sidecar read and is intentionally unused today.
    """
    del db  # reserved for future DB-backed lookup
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dict")

    existing = payload.get("medical_image_context")
    if isinstance(existing, dict) and existing.get("image_id"):
        # Caller-supplied context wins.
        return payload

    cfg = _resolve_settings(settings)
    media_root = getattr(cfg, "media_storage_root", None) or "./media_uploads"

    sidecar: Optional[dict[str, Any]] = None
    if patient_id:
        try:
            sidecar = load_latest_medical_image_for_patient(
                patient_id, media_storage_root=media_root
            )
        except Exception as exc:  # pragma: no cover — defensive
            _log.warning(
                "medical_image_report_context: latest-sidecar lookup failed (%s)", exc
            )
            sidecar = None

    if sidecar is None:
        payload["medical_image_context"] = _empty_context_block()
        return payload

    metadata = _metadata_from_sidecar(sidecar)
    note = clinician_imaging_note
    if note is None:
        note = sidecar.get("clinician_imaging_note")
    fmt = (sidecar.get("format") or "volume").lower()
    context = preview_service.build_medical_image_context_for_report(
        metadata=metadata,
        preview_status=sidecar.get("status"),
        source="uploaded_" + fmt,
        clinician_imaging_note=note,
        patient_id=sidecar.get("patient_id"),
        image_id=sidecar.get("id"),
    )
    payload["medical_image_context"] = context
    return payload


def build_qeeg_cross_modal_section(
    patient_id: Optional[str], *, settings=None
) -> dict:
    """Return cross-modal availability flags for the qEEG report layer.

    Output keys: ``has_mri``, ``mri_image_id``, ``mri_preview_status``,
    ``safe_sentence``, ``disclaimer``. The ``safe_sentence`` always comes
    from ``preview_service.SAFE_REPORT_SENTENCES`` (or is composed by
    ``build_medical_image_context_for_report``) and never claims that qEEG
    implies anatomical disease. When MRI is available, the section
    explicitly states the MRI was NOT used to infer the qEEG findings —
    the cross-reference is a clinician-review handoff, not a diagnostic
    claim.
    """
    cfg = _resolve_settings(settings)
    media_root = getattr(cfg, "media_storage_root", None) or "./media_uploads"

    sidecar: Optional[dict[str, Any]] = None
    if patient_id:
        try:
            sidecar = load_latest_medical_image_for_patient(
                patient_id, media_storage_root=media_root
            )
        except Exception as exc:  # pragma: no cover — defensive
            _log.warning(
                "medical_image_report_context: cross-modal lookup failed (%s)", exc
            )
            sidecar = None

    cross_modal_disclaimer = (
        "Structural imaging was not used to infer the qEEG findings; this "
        "section is a clinician-review handoff only and is not diagnostic."
    )

    if sidecar is None:
        return {
            "has_mri": False,
            "mri_image_id": None,
            "mri_preview_status": None,
            "safe_sentence": preview_service.SAFE_REPORT_SENTENCES["unavailable"],
            "disclaimer": cross_modal_disclaimer,
        }

    preview_status = sidecar.get("status")
    metadata = _metadata_from_sidecar(sidecar)
    context = preview_service.build_medical_image_context_for_report(
        metadata=metadata,
        preview_status=preview_status,
        source="uploaded_" + (sidecar.get("format") or "volume").lower(),
        clinician_imaging_note=sidecar.get("clinician_imaging_note"),
        patient_id=sidecar.get("patient_id"),
        image_id=sidecar.get("id"),
    )
    return {
        "has_mri": True,
        "mri_image_id": sidecar.get("id"),
        "mri_preview_status": preview_status,
        "safe_sentence": context["safe_report_sentence"],
        "disclaimer": cross_modal_disclaimer,
    }


__all__ = [
    "load_latest_medical_image_for_patient",
    "attach_medical_image_context_to_payload",
    "build_qeeg_cross_modal_section",
]

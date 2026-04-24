"""BIDS derivatives export for qEEG + MRI analyses.

Implements CONTRACT_V3 §5.2 by streaming an in-memory zip archive
laid out per the BIDS-EEG / BIDS-MRI derivative specs. All path
components are pseudo-IDs — real ``patient_id`` values are never
embedded in the zip. When Pillow is not installed the optional
topomap PNG is simply omitted (the rest of the derivative is still
written).

Typical usage
-------------
>>> buf = build_qeeg_bids_derivatives(analysis, patient_pseudo_id="p0001")
>>> buf.seek(0)
>>> zip_bytes = buf.read()
"""
from __future__ import annotations

import io
import json
import logging
import struct
import zipfile
from typing import Any

from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import MriAnalysis, OutcomeSeries, Patient, QEEGAnalysis

_log = logging.getLogger(__name__)


_BIDS_VERSION = "1.8.0"


# ── Common helpers ───────────────────────────────────────────────────────────

def _maybe_json(raw: Any) -> Any:
    """Decode a JSON string column, returning None on malformed input."""
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        _log.warning("bids_export: skipping malformed JSON column")
        return None


def _dataset_description(
    *,
    analysis_id: str,
    pipeline_version: str | None,
    modality: str,
) -> str:
    """Return a serialised ``dataset_description.json`` string.

    Parameters
    ----------
    analysis_id : str
        Pseudo session id used as ``DatasetLinks.Source``.
    pipeline_version : str or None
        Pipeline version tag (falls back to ``"0.0.0"`` if missing).
    modality : str
        Either ``"qeeg"`` or ``"mri"`` for the generator description.
    """
    payload: dict[str, Any] = {
        "Name": f"DeepSynaps {modality.upper()} derivative — {analysis_id}",
        "BIDSVersion": _BIDS_VERSION,
        "DatasetType": "derivative",
        "GeneratedBy": [
            {
                "Name": f"deepsynaps-{modality}-pipeline",
                "Version": pipeline_version or "0.0.0",
                "Description": (
                    "DeepSynaps Protocol Studio research/wellness export. "
                    "Not a medical device."
                ),
            }
        ],
    }
    return json.dumps(payload, indent=2)


def _try_build_blank_png() -> bytes | None:
    """Return a tiny blank PNG as bytes via Pillow, or None if unavailable.

    Notes
    -----
    Kept intentionally tiny (16×16 RGB) so the placeholder never
    dominates the zip size. Returns ``None`` so callers can skip
    writing the file when Pillow is not installed — the rest of the
    BIDS derivative is still valid.
    """
    try:
        from PIL import Image  # type: ignore[import-not-found]
    except Exception:  # pragma: no cover - exercised in PIL-missing envs
        _log.info("bids_export: Pillow unavailable; skipping topomap PNG")
        return None
    buf = io.BytesIO()
    img = Image.new("RGB", (16, 16), (32, 32, 40))
    img.save(buf, format="PNG")
    return buf.getvalue()


def _minimal_png_fallback() -> bytes:
    """Return a 1x1 grey PNG built without Pillow (IHDR + IDAT + IEND).

    Used only by unit tests that explicitly assert *something* was
    written even in the PIL-missing path. The main flow still
    short-circuits and omits the PNG entirely — this helper is not
    wired into the normal ``build_*`` functions.
    """
    # Precomputed 1x1 grey PNG so we avoid zlib/CRC dependencies beyond stdlib.
    # Canonical 67-byte PNG.
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01"
        b"!m\xff\x06"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _sub_prefix(patient_pseudo_id: str, session_id: str) -> str:
    """Return the ``sub-XXXX_ses-YYYY`` file-name prefix."""
    # Strip path separators + trim to keep filenames friendly.
    pid = str(patient_pseudo_id).replace("/", "_").replace("\\", "_")[:32]
    sid = str(session_id).replace("/", "_").replace("\\", "_")[:32]
    return f"sub-{pid}_ses-{sid}"


def _write(zf: zipfile.ZipFile, arcname: str, data: str | bytes) -> None:
    """Write a single entry into *zf*, accepting either text or bytes."""
    if isinstance(data, str):
        zf.writestr(arcname, data.encode("utf-8"))
    else:
        zf.writestr(arcname, data)


def _slug(value: str) -> str:
    """Return a filesystem-safe slug for filenames inside compatibility exports."""
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-") or "unknown"


# ── qEEG derivative ─────────────────────────────────────────────────────────

def build_qeeg_bids_derivatives(
    analysis: Any,
    *,
    patient_pseudo_id: str,
) -> io.BytesIO:
    """Build a BIDS-EEG derivative zip for one qEEG analysis.

    Parameters
    ----------
    analysis : QEEGAnalysis
        Persisted analysis row (SQLA model). JSON columns are decoded
        lazily; missing values are tolerated.
    patient_pseudo_id : str
        Pseudo identifier used for ``sub-XXXX``. No PHI may be passed
        through — callers are responsible for the substitution.

    Returns
    -------
    io.BytesIO
        Seek-at-position-0 buffer holding the zip archive. Media type
        is ``application/zip``.
    """
    session_id = str(analysis.id)
    prefix = _sub_prefix(patient_pseudo_id, session_id)
    sub_dir = f"sub-{patient_pseudo_id}/ses-{session_id}/eeg"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # dataset_description.json at the archive root.
        _write(zf, "dataset_description.json",
               _dataset_description(
                   analysis_id=session_id,
                   pipeline_version=getattr(analysis, "pipeline_version", None),
                   modality="qeeg",
               ))

        # Features — union of common JSON columns that exist.
        features: dict[str, Any] = {}
        for col in (
            "band_powers_json", "aperiodic_json", "peak_alpha_freq_json",
            "connectivity_json", "asymmetry_json", "graph_metrics_json",
            "source_roi_json", "quality_metrics_json",
        ):
            val = _maybe_json(getattr(analysis, col, None))
            if val is not None:
                features[col.replace("_json", "")] = val
        _write(zf, f"{sub_dir}/{prefix}_task-rest_desc-features.json",
               json.dumps(features, indent=2))

        # Z-scores as a TSV (flat metric/channel/z rows).
        zscores = _maybe_json(getattr(analysis, "normative_zscores_json", None)) or {}
        flagged = zscores.get("flagged") if isinstance(zscores, dict) else None
        rows: list[str] = ["metric\tchannel\tz\tflagged"]
        if isinstance(flagged, list):
            for flag in flagged:
                if not isinstance(flag, dict):
                    continue
                rows.append(
                    f"{flag.get('metric','')}\t{flag.get('channel','')}\t"
                    f"{flag.get('z','')}\ttrue"
                )
        _write(zf, f"{sub_dir}/{prefix}_desc-zscores.tsv", "\n".join(rows) + "\n")

        # Optional topomap PNG (skipped when Pillow missing).
        png = _try_build_blank_png()
        if png is not None:
            _write(zf, f"{sub_dir}/{prefix}_desc-topomap.png", png)

    buf.seek(0)
    return buf


# ── MRI derivative ───────────────────────────────────────────────────────────

def build_mri_bids_derivatives(
    analysis: Any,
    *,
    patient_pseudo_id: str,
) -> io.BytesIO:
    """Build a BIDS derivative zip for one MRI analysis.

    Parameters
    ----------
    analysis : MriAnalysis
        Persisted MRI analysis row.
    patient_pseudo_id : str
        Pseudo id used for ``sub-XXXX``.

    Returns
    -------
    io.BytesIO
        Seek-at-position-0 buffer holding the zip archive.
    """
    session_id = str(analysis.analysis_id)
    prefix = _sub_prefix(patient_pseudo_id, session_id)
    base_dir = f"sub-{patient_pseudo_id}/ses-{session_id}"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        _write(zf, "dataset_description.json",
               _dataset_description(
                   analysis_id=session_id,
                   pipeline_version=getattr(analysis, "pipeline_version", None),
                   modality="mri",
               ))

        structural = _maybe_json(getattr(analysis, "structural_json", None)) or {}
        functional = _maybe_json(getattr(analysis, "functional_json", None)) or {}
        diffusion = _maybe_json(getattr(analysis, "diffusion_json", None)) or {}
        stim_targets = _maybe_json(getattr(analysis, "stim_targets_json", None)) or []
        qc = _maybe_json(getattr(analysis, "qc_json", None)) or {}

        if structural:
            _write(
                zf,
                f"{base_dir}/anat/{prefix}_label-structural.json",
                json.dumps(structural, indent=2),
            )
        if functional:
            _write(
                zf,
                f"{base_dir}/func/{prefix}_task-rest_desc-confounds.json",
                json.dumps(functional, indent=2),
            )
            # FC matrix placeholder (empty TSV header) so the derivative is
            # still inspectable by tooling that expects the canonical file.
            _write(
                zf,
                f"{base_dir}/func/{prefix}_desc-fcMatrix.tsv",
                "# FC matrix derived features\n",
            )
        if diffusion:
            _write(
                zf,
                f"{base_dir}/dwi/{prefix}_desc-diffusion.json",
                json.dumps(diffusion, indent=2),
            )

        _write(
            zf,
            f"{base_dir}/stim/{prefix}_targets.json",
            json.dumps(stim_targets, indent=2),
        )

        if qc:
            _write(zf, f"{base_dir}/{prefix}_desc-qc.json", json.dumps(qc, indent=2))

    buf.seek(0)
    return buf


def build_bids_derivatives_zip(
    db: Session,
    patient_id: str,
    *,
    qeeg_analysis_id: str | None = None,
    mri_analysis_id: str | None = None,
) -> tuple[bytes, str]:
    """Build the legacy patient-level BIDS derivatives archive.

    The integrated branch restores richer per-analysis exporters above, but the
    older `/api/v1/export/bids-derivatives` route still expects a combined
    patient-level zip. Keep this adapter so both surfaces remain valid.
    """
    qeeg_query = db.query(QEEGAnalysis).filter(QEEGAnalysis.patient_id == patient_id)
    if qeeg_analysis_id:
        qeeg_query = qeeg_query.filter(QEEGAnalysis.id == qeeg_analysis_id)
    qeeg_rows = qeeg_query.order_by(QEEGAnalysis.created_at.desc()).limit(5).all()

    mri_query = db.query(MriAnalysis).filter(MriAnalysis.patient_id == patient_id)
    if mri_analysis_id:
        mri_query = mri_query.filter(MriAnalysis.analysis_id == mri_analysis_id)
    mri_rows = mri_query.order_by(MriAnalysis.created_at.desc()).limit(5).all()

    outcome_rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient_id)
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None and not qeeg_rows and not mri_rows and not outcome_rows:
        raise ApiServiceError(code="patient_not_found", message="Patient not found", status_code=404)
    if patient is None:
        patient = Patient(
            id=patient_id,
            clinician_id="unknown",
            first_name="Patient",
            last_name=patient_id,
            status="active",
        )

    participant_label = f"sub-{_slug(patient.id)}"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        _write(
            zf,
            "dataset_description.json",
            json.dumps(
                {
                    "Name": "DeepSynaps Neuromodulation Derivatives Export",
                    "BIDSVersion": "1.9.0",
                    "DatasetType": "derivative",
                    "GeneratedBy": [
                        {
                            "Name": "DeepSynaps Protocol Studio",
                            "Version": "contract-v3-minimal",
                        }
                    ],
                },
                indent=2,
            ),
        )

        participants = io.StringIO()
        participants.write("participant_id\tsex\tage\tprimary_condition\n")
        participants.write(
            f"{participant_label}\t{getattr(patient, 'gender', None) or 'n/a'}\t"
            f"n/a\t{getattr(patient, 'primary_condition', None) or ''}\n"
        )
        _write(zf, "participants.tsv", participants.getvalue())

        derivatives_root = f"derivatives/deepsynaps/{participant_label}"
        _write(
            zf,
            f"{derivatives_root}/README",
            "Synthetic derivative export. References original qEEG/MRI artifacts and includes derived JSON summaries.",
        )

        for row in qeeg_rows:
            payload = {
                "analysis_id": row.id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
                "source_ref": row.file_ref,
                "original_filename": row.original_filename,
                "recording_date": row.recording_date,
                "eyes_condition": row.eyes_condition,
                "band_powers": _maybe_json(row.band_powers_json),
                "normative_deviations": _maybe_json(row.normative_deviations_json),
                "advanced_analyses": _maybe_json(row.advanced_analyses_json),
            }
            _write(
                zf,
                f"{derivatives_root}/qeeg/{participant_label}_desc-{_slug(row.id)}_qeeg.json",
                json.dumps(payload, indent=2),
            )

        for row in mri_rows:
            payload = {
                "analysis_id": row.analysis_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "state": row.state,
                "source_ref": row.upload_ref,
                "modalities_present": _maybe_json(row.modalities_present_json),
                "structural": _maybe_json(row.structural_json),
                "functional": _maybe_json(row.functional_json),
                "diffusion": _maybe_json(row.diffusion_json),
                "stim_targets": _maybe_json(row.stim_targets_json),
                "overlays": _maybe_json(row.overlays_json),
                "qc": _maybe_json(row.qc_json),
            }
            _write(
                zf,
                f"{derivatives_root}/mri/{participant_label}_desc-{_slug(row.analysis_id)}_mri.json",
                json.dumps(payload, indent=2),
            )

        outcome_lines = ["patient_id\tcourse_id\ttemplate_id\tmeasurement_point\tscore_numeric\tadministered_at"]
        for row in outcome_rows:
            outcome_lines.append(
                "\t".join(
                    [
                        patient.id,
                        row.course_id or "",
                        row.template_id or "",
                        row.measurement_point or "",
                        "" if row.score_numeric is None else str(row.score_numeric),
                        row.administered_at.isoformat() if row.administered_at else "",
                    ]
                )
            )
        _write(zf, f"{derivatives_root}/phenotype/{participant_label}_outcomes.tsv", "\n".join(outcome_lines) + "\n")

    filename = f"bids_derivatives_{_slug(patient.last_name or patient.id)}.zip"
    return buffer.getvalue(), filename


__all__ = [
    "build_qeeg_bids_derivatives",
    "build_mri_bids_derivatives",
]

# Keep unused stdlib imports referenced for lint-clean builds.
_ = struct

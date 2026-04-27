"""Patient-facing simplified qEEG / MRI summary endpoints (CONTRACT_V3 §9).

Endpoints
---------
GET /api/v1/patient-portal/qeeg-summary/{analysis_id}
GET /api/v1/patient-portal/mri-summary/{analysis_id}

Role gating
-----------
The authenticated actor must hold role ``patient`` AND be bound to the
same ``patient_id`` as the target analysis. Clinicians and admins are
403'd here (they use the full clinical pages).

LLM usage
---------
Plain-language rewrites use a graceful template-based fallback when no
LLM helper is available. Every rewritten string is filtered through the
banned-word sanitiser (``_sanitise_banned_words``) and capped at 200
characters per finding.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterable, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    Annotation,
    MriAnalysis,
    Patient,
    QEEGAnalysis,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/patient-portal", tags=["Patient Portal"])


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_MAX_FINDING_LEN = 200
_REGULATORY_FOOTER = "Research/wellness use — not diagnostic."


# ── Banned-word sanitiser (CONTRACT §6) ──────────────────────────────────────

_BANNED_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\btreatment\s+recommendations?\b", re.IGNORECASE), "protocol consideration"),
    (re.compile(r"\bdiagnoses\b", re.IGNORECASE), "findings"),
    (re.compile(r"\bdiagnosis\b", re.IGNORECASE), "finding"),
    (re.compile(r"\bdiagnostic\b", re.IGNORECASE), "finding-oriented"),
    (re.compile(r"\bdiagnose(s|d)?\b", re.IGNORECASE), "identify"),
]


def _sanitise_banned_words(text: Optional[str]) -> str:
    """Scrub banned phrases from ``text`` and return the cleaned copy."""
    if not text:
        return ""
    out = str(text)
    for pat, repl in _BANNED_PATTERNS:
        out = pat.sub(repl, out)
    return out


# ── Jargon → plain-language dictionary ───────────────────────────────────────

_JARGON_MAP: dict[str, str] = {
    "theta/beta": "attention-related brainwave ratio",
    "theta_beta_ratio": "attention-related brainwave ratio",
    "alpha peak": "resting brainwave rhythm",
    "alpha_peak_frequency_hz": "resting brainwave rhythm",
    "frontal alpha asymmetry": "left/right frontal activity balance",
    "frontal_alpha_asymmetry": "left/right frontal activity balance",
    "z-score": "how your result compares to typical",
    "percentile": "comparison to typical",
    "hippocampus": "a memory-related brain region",
    "amygdala": "an emotion-related brain region",
    "dlpfc": "a decision-making brain region",
    "sgacc": "a mood-regulation brain region",
    "acc": "a self-monitoring brain region",
    "fa": "white-matter integrity measure",
    "md": "water diffusion measure",
    "connectivity": "communication between brain areas",
    "sef50": "spectral midpoint",
    "sef95": "spectral edge",
    "fooof": "spectral decomposition",
    "rci": "reliable change index",
}


def _plain_language_rewrite(raw: str) -> str:
    """Template-based jargon-to-plain-language rewrite used as LLM fallback.

    Replaces known jargon tokens from ``_JARGON_MAP`` and truncates to
    ``_MAX_FINDING_LEN`` characters. Always scrubs banned words.

    Parameters
    ----------
    raw : str

    Returns
    -------
    str
    """
    out = str(raw or "")
    for jargon, plain in _JARGON_MAP.items():
        out = re.sub(
            r"\b" + re.escape(jargon) + r"\b",
            plain,
            out,
            flags=re.IGNORECASE,
        )
    out = _sanitise_banned_words(out)
    out = re.sub(r"\s+", " ", out).strip()
    if len(out) > _MAX_FINDING_LEN:
        out = out[: _MAX_FINDING_LEN - 1].rstrip() + "…"
    return out


def _llm_rewrite(raw: str) -> str:
    """Attempt to call the optional LLM rewriter; fall back to template.

    The LLM helper is imported lazily and guarded — any failure falls
    back to ``_plain_language_rewrite`` so the endpoint never hard-errs
    when the model is offline.
    """
    try:
        from app.services import chat_service  # type: ignore[import-not-found]

        if hasattr(chat_service, "plain_language_rewrite"):
            val = chat_service.plain_language_rewrite(raw)  # type: ignore[attr-defined]
            if isinstance(val, str) and val.strip():
                return _plain_language_rewrite(val)
    except Exception as exc:  # pragma: no cover — offline fallback
        _log.info("plain-language LLM unavailable (%s); using template", exc)
    return _plain_language_rewrite(raw)


# ── Schemas ──────────────────────────────────────────────────────────────────


class FindingOut(BaseModel):
    title: str
    body: str
    severity_hint: str = Field(pattern=r"^(gentle|moderate|discuss_with_clinician)$")


class PatientSummaryOut(BaseModel):
    analysis_id: str
    recorded_on: Optional[str] = None
    findings_plain_language: list[FindingOut] = Field(default_factory=list)
    next_steps_generic: list[str] = Field(default_factory=list)
    clinician_note_public: Optional[str] = None
    regulatory_footer: str = _REGULATORY_FOOTER


# ── Authorisation helper ─────────────────────────────────────────────────────


def _require_patient_bound_to(
    actor: AuthenticatedActor,
    patient_id: str,
    db: Session,
) -> None:
    """403 unless ``actor`` is a patient bound to ``patient_id``.

    The binding is done via the ``Patient.email`` → ``User.email`` join
    mirroring ``patient_portal_router._require_patient``. Demo patient
    actor is accepted when the patient record exists with the known
    demo email.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="forbidden",
            message="Patient portal access only.",
            status_code=403,
        )

    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        demo_pt = (
            db.query(Patient)
            .filter(Patient.email.in_(["patient@deepsynaps.com", "patient@demo.com"]))
            .first()
        )
        if demo_pt and demo_pt.id == patient_id:
            return
        raise ApiServiceError(
            code="forbidden",
            message="Analysis does not belong to the authenticated patient.",
            status_code=403,
        )

    try:
        from app.persistence.models import User

        user = db.query(User).filter_by(id=actor.actor_id).first()
    except Exception as exc:  # pragma: no cover — defensive
        _log.warning("user lookup failed: %s", exc)
        user = None
    if user is None:
        raise ApiServiceError(
            code="forbidden",
            message="User account not found.",
            status_code=403,
        )
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None or patient.id != patient_id:
        raise ApiServiceError(
            code="forbidden",
            message="Analysis does not belong to the authenticated patient.",
            status_code=403,
        )


# ── Finding extraction ───────────────────────────────────────────────────────


def _severity_hint(z: Optional[float]) -> str:
    """Map a z-score magnitude to a gentle severity bucket.

    Parameters
    ----------
    z : float, optional

    Returns
    -------
    str
        One of ``"gentle"``, ``"moderate"``, ``"discuss_with_clinician"``.
    """
    if z is None:
        return "gentle"
    az = abs(float(z))
    if az >= 2.58:
        return "discuss_with_clinician"
    if az >= 1.96:
        return "moderate"
    return "gentle"


def _extract_qeeg_findings(row: QEEGAnalysis) -> list[FindingOut]:
    """Build up to 5 plain-language findings from a qEEG analysis row."""
    findings: list[FindingOut] = []
    try:
        z_by_channel = json.loads(row.normative_zscores_json or "null")
    except (TypeError, ValueError):
        z_by_channel = None

    # Flatten (channel, band, z) tuples and sort by |z| descending.
    flagged: list[tuple[str, str, float]] = []
    if isinstance(z_by_channel, dict):
        for ch, bands in z_by_channel.items():
            if not isinstance(bands, dict):
                continue
            for band, z in bands.items():
                try:
                    zf = float(z)
                except (TypeError, ValueError):
                    continue
                if abs(zf) >= 1.5:
                    flagged.append((str(ch), str(band), zf))
    flagged.sort(key=lambda t: abs(t[2]), reverse=True)

    for ch, band, zf in flagged[:5]:
        title = f"{band.title()} activity"
        direction = "higher" if zf > 0 else "lower"
        body = _llm_rewrite(
            f"At channel {ch}, {band} activity is {direction} than typical "
            f"(z-score {zf:+.1f})."
        )
        findings.append(
            FindingOut(title=title, body=body, severity_hint=_severity_hint(zf))
        )

    if not findings:
        findings.append(
            FindingOut(
                title="Recording summary",
                body=_llm_rewrite(
                    "Your brainwave recording was processed successfully. "
                    "No strong outliers were detected."
                ),
                severity_hint="gentle",
            )
        )
    return findings


def _extract_mri_findings(row: MriAnalysis) -> list[FindingOut]:
    """Build up to 5 plain-language findings from an MRI analysis row."""
    findings: list[FindingOut] = []
    try:
        structural = json.loads(row.structural_json or "null")
    except (TypeError, ValueError):
        structural = None

    flagged: list[tuple[str, str, float]] = []
    if isinstance(structural, dict):
        for group_name in ("cortical_thickness_mm", "subcortical_volume_mm3"):
            group = structural.get(group_name)
            if not isinstance(group, dict):
                continue
            for region, entry in group.items():
                if not isinstance(entry, dict):
                    continue
                z = entry.get("z")
                try:
                    zf = float(z) if z is not None else None
                except (TypeError, ValueError):
                    zf = None
                if zf is not None and abs(zf) >= 1.5:
                    flagged.append((str(region), group_name, zf))
    flagged.sort(key=lambda t: abs(t[2]), reverse=True)

    for region, group_name, zf in flagged[:5]:
        title = region.replace("_", " ").title()
        metric = (
            "thickness"
            if group_name == "cortical_thickness_mm"
            else "volume"
        )
        direction = "larger" if zf > 0 else "smaller"
        body = _llm_rewrite(
            f"The {region} {metric} appears {direction} than typical "
            f"(z-score {zf:+.1f})."
        )
        findings.append(
            FindingOut(title=title, body=body, severity_hint=_severity_hint(zf))
        )

    if not findings:
        findings.append(
            FindingOut(
                title="Scan summary",
                body=_llm_rewrite(
                    "Your MRI was processed successfully. "
                    "No standout structural measurements were flagged."
                ),
                severity_hint="gentle",
            )
        )
    return findings


def _patient_facing_clinician_note(
    db: Session,
    analysis_id: str,
    analysis_type: str,
) -> Optional[str]:
    """Fetch the most-recent ``patient_facing``-tagged annotation text.

    Only non-deleted annotations whose ``tags`` include the string
    ``"patient_facing"`` are returned. All other annotations are
    clinician-private.
    """
    rows: Iterable[Annotation] = (
        db.query(Annotation)
        .filter(
            Annotation.analysis_id == analysis_id,
            Annotation.analysis_type == analysis_type,
            Annotation.deleted_at.is_(None),
        )
        .order_by(Annotation.created_at.desc())
        .all()
    )
    for ann in rows:
        try:
            tags = json.loads(ann.tags_json) if ann.tags_json else []
        except (TypeError, ValueError):
            tags = []
        if isinstance(tags, list) and "patient_facing" in tags:
            return _sanitise_banned_words(ann.text)[: _MAX_FINDING_LEN * 2]
    return None


_DEFAULT_NEXT_STEPS = [
    "Discuss this summary with your clinician.",
    "Share any new symptoms or questions at your next visit.",
    "Your clinician will explain what, if anything, these findings mean for you.",
]


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/qeeg-summary/{analysis_id}", response_model=PatientSummaryOut)
def get_patient_qeeg_summary(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientSummaryOut:
    """Return the simplified, jargon-free qEEG summary for a patient.

    Parameters
    ----------
    analysis_id : str
    actor : AuthenticatedActor
        Must be role ``patient`` bound to the analysis's patient_id.

    Returns
    -------
    PatientSummaryOut
    """
    row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message="qEEG analysis not found",
            status_code=404,
        )
    _require_patient_bound_to(actor, row.patient_id, db)

    recorded_on = row.recording_date or (
        row.analyzed_at.isoformat() if row.analyzed_at else None
    )
    findings = _extract_qeeg_findings(row)
    note = _patient_facing_clinician_note(db, analysis_id, "qeeg")

    return PatientSummaryOut(
        analysis_id=analysis_id,
        recorded_on=recorded_on,
        findings_plain_language=findings,
        next_steps_generic=list(_DEFAULT_NEXT_STEPS),
        clinician_note_public=note,
        regulatory_footer=_REGULATORY_FOOTER,
    )


@router.get("/mri-summary/{analysis_id}", response_model=PatientSummaryOut)
def get_patient_mri_summary(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientSummaryOut:
    """Return the simplified, jargon-free MRI summary for a patient.

    See :func:`get_patient_qeeg_summary` for contract.
    """
    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message="MRI analysis not found",
            status_code=404,
        )
    _require_patient_bound_to(actor, row.patient_id, db)

    recorded_on = row.created_at.isoformat() if row.created_at else None
    findings = _extract_mri_findings(row)
    note = _patient_facing_clinician_note(db, analysis_id, "mri")

    return PatientSummaryOut(
        analysis_id=analysis_id,
        recorded_on=recorded_on,
        findings_plain_language=findings,
        next_steps_generic=list(_DEFAULT_NEXT_STEPS),
        clinician_note_public=note,
        regulatory_footer=_REGULATORY_FOOTER,
    )

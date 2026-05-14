"""Aggregate patient intervention course + multimodal context for the Intervention Analyzer UI.

Decision-support only. Associations shown are temporal, not causal proof.
Not a calibrated prediction model. Requires clinician review.

Enrichment layers (best-effort, never fail the endpoint):
- Neuromodulation research CSV bundle (~87k-class ingestion via ai_ingestion dataset)
- Live evidence SQLite corpus (same DB as /api/v1/evidence/*)
- Patient evidence intelligence overview (clinician/admin only; same engine as /evidence/patient/.../overview)
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.logging_setup import get_logger
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    AudioAnalysis,
    BiometricsSnapshot,
    ClinicalSession,
    MriAnalysis,
    OutcomeSeries,
    Patient,
    PatientMedication,
    PatientMediaUpload,
    QEEGAnalysis,
    TreatmentCourse,
    VideoAssessmentSession,
    WearableDailySummary,
)
from app.repositories.audit import create_audit_event
from app.services.medication_interactions import (
    normalize_therapy_tokens,
    run_interaction_check,
)

_logger = get_logger(__name__)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _collect_ids(rows: list[Any], attr: str = "id") -> list[str]:
    ids: list[str] = []
    for row in rows:
        value = getattr(row, attr, None)
        if value:
            ids.append(str(value))
    return ids


def _phase_from_course(course: TreatmentCourse) -> str:
    st = (course.status or "").lower()
    if st in {"completed", "ended"}:
        return "maintenance"
    if st in {"paused", "hold"}:
        return "continuation"
    if course.sessions_delivered and course.planned_sessions_total:
        ratio = course.sessions_delivered / max(course.planned_sessions_total, 1)
        if ratio < 0.35:
            return "acute"
        if ratio < 0.85:
            return "continuation"
        return "maintenance"
    return "acute"


def _missed_from_sessions(rows: list[ClinicalSession]) -> int:
    missed = 0
    for s in rows:
        st = (s.status or "").lower()
        if st in {"no_show", "cancelled"}:
            missed += 1
    return missed


def _response_label(course: TreatmentCourse | None) -> dict[str, Any]:
    """Heuristic label only -- not a validated response classification.

    Decision-support only. Requires clinician review.
    Not a calibrated prediction model.
    """
    if course is None:
        return {
            "label": "insufficient_data",
            "provenance": "no_course",
            "note": "No course data available.",
        }

    if course.sessions_delivered >= course.planned_sessions_total * 0.85:
        label = "on_track_heuristic"
    elif course.sessions_delivered >= 4:
        label = "partial_heuristic"
    else:
        label = "unclear_heuristic"

    return {
        "label": label,
        "provenance": "rule_based_heuristic",
        "note": (
            "Label based on session counts only. "
            "Not a validated clinical response classification. "
            "Requires clinician review. Not a calibrated prediction model."
        ),
        "sessions_delivered": course.sessions_delivered,
        "sessions_planned": course.planned_sessions_total,
    }


def _slug_hint(text: str | None) -> str | None:
    if not text:
        return None
    t = re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")
    return t[:80] if t else None


def _evidence_db_counts() -> dict[str, Any]:
    """Lightweight live corpus stats (same file as evidence_router).

    Decision-support only. Not a calibrated prediction model.
    """
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        path = override
    else:
        here = Path(__file__).resolve()
        repo_guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
        path = str(repo_guess) if repo_guess.exists() else "/app/evidence.db"
    if not os.path.exists(path):
        return {"available": False, "db_path": path, "counts": {}}
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.execute("PRAGMA query_only = 1")
        counts: dict[str, int] = {}
        for t in ("papers", "trials", "devices", "indications"):
            try:
                counts[t] = conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            except sqlite3.OperationalError:
                counts[t] = 0
        conn.close()
        return {"available": True, "db_path": path, "counts": counts}
    except Exception as exc:
        _logger.debug("evidence_db_counts failed: %s", exc)
        return {"available": False, "db_path": path, "counts": {}, "error": str(exc)}


def _research_bundle_summary(
    indication_slug: str | None, modality_slug: str | None
) -> dict[str, Any]:
    """Neuromodulation CSV bundle stats for protocol intelligence panel.

    Decision-support only. Requires clinician review.
    Associations shown are temporal, not causal proof.
    """
    try:
        from app.services.neuromodulation_research import (
            bundle_exists,
            build_research_summary,
            bundle_root_or_none,
        )

        if not bundle_exists():
            return {
                "available": False,
                "bundle_root": str(bundle_root_or_none() or ""),
                "filters": {"indication": indication_slug, "modality": modality_slug},
                "paper_count": 0,
                "note": "Research bundle not installed -- set DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT or add data/research/neuromodulation.",
            }
        summary = build_research_summary(
            indication=indication_slug,
            modality=modality_slug,
            limit=5,
        )
        summary["available"] = True
        summary["bundle_root"] = str(bundle_root_or_none() or "")
        return summary
    except Exception as exc:
        _logger.debug("research_bundle_summary failed: %s", exc)
        return {
            "available": False,
            "error": str(exc),
            "filters": {"indication": indication_slug, "modality": modality_slug},
        }


def _serialize_evidence_overview(overview: Any) -> dict[str, Any]:
    """Pydantic v2 compatible model_dump."""
    if hasattr(overview, "model_dump"):
        return overview.model_dump(mode="json")
    if hasattr(overview, "dict"):
        return overview.dict()
    return dict(overview)


def build_intervention_analyzer_payload(
    db: Session,
    patient_id: str,
    actor: AuthenticatedActor,
) -> dict[str, Any]:
    """Build InterventionAnalyzerPagePayload (dict, JSON-serializable).

    Decision-support only. Not a calibrated prediction model.
    Requires clinician review. Associations shown are temporal, not causal proof.
    """
    generated_at = _now_iso()

    # --- Scoped queries (mirror patients_router session/course access) ---
    cq = db.query(TreatmentCourse).filter(TreatmentCourse.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        cq = cq.filter(TreatmentCourse.clinician_id == actor.actor_id)
    courses: list[TreatmentCourse] = cq.order_by(TreatmentCourse.created_at.desc()).all()

    sq = db.query(ClinicalSession).filter(ClinicalSession.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        sq = sq.filter(ClinicalSession.clinician_id == actor.actor_id)
    sessions: list[ClinicalSession] = sq.order_by(ClinicalSession.scheduled_at).all()

    primary_course = courses[0] if courses else None
    patient_row = db.query(Patient).filter_by(id=patient_id).first()
    modality = (
        (primary_course.modality_slug if primary_course else None)
        or (patient_row.primary_modality if patient_row else None)
        or "unknown"
    )
    indication_slug = None
    if primary_course and getattr(primary_course, "condition_slug", None):
        indication_slug = (primary_course.condition_slug or "").strip() or None
    if not indication_slug and patient_row and patient_row.primary_condition:
        indication_slug = _slug_hint(patient_row.primary_condition)

    missed = _missed_from_sessions(sessions)
    _completed = sum(
        1 for s in sessions if (s.status or "").lower() == "completed"
    )

    # --- Linked analyzer IDs (lightweight) ---
    mri_rows = (
        db.query(MriAnalysis)
        .filter(MriAnalysis.patient_id == patient_id)
        .order_by(MriAnalysis.created_at.desc())
        .limit(5)
        .all()
    )
    qeeg_q = db.query(QEEGAnalysis).filter(QEEGAnalysis.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        qeeg_q = qeeg_q.filter(QEEGAnalysis.clinician_id == actor.actor_id)
    qeeg_rows = qeeg_q.order_by(QEEGAnalysis.created_at.desc()).limit(5).all()

    aq = db.query(AssessmentRecord).filter(AssessmentRecord.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        aq = aq.filter(AssessmentRecord.clinician_id == actor.actor_id)
    assessment_rows = aq.order_by(AssessmentRecord.created_at.desc()).limit(12).all()

    outcome_rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient_id)
        .order_by(OutcomeSeries.administered_at.desc())
        .limit(24)
        .all()
    )

    ae_q = db.query(AdverseEvent).filter(AdverseEvent.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        ae_q = ae_q.filter(AdverseEvent.clinician_id == actor.actor_id)
    ae_rows = ae_q.order_by(AdverseEvent.reported_at.desc()).limit(20).all()

    med_q = db.query(PatientMedication).filter(PatientMedication.patient_id == patient_id)
    if actor.role not in ("admin", "patient"):
        med_q = med_q.filter(PatientMedication.clinician_id == actor.actor_id)
    medication_rows = med_q.order_by(PatientMedication.created_at.desc()).limit(80).all()

    audio_analysis_rows = (
        db.query(AudioAnalysis)
        .filter(AudioAnalysis.patient_id == patient_id)
        .order_by(AudioAnalysis.created_at.desc())
        .limit(5)
        .all()
    )
    media_upload_rows = (
        db.query(PatientMediaUpload)
        .filter(
            PatientMediaUpload.patient_id == patient_id,
            PatientMediaUpload.deleted_at.is_(None),
        )
        .order_by(PatientMediaUpload.created_at.desc())
        .limit(24)
        .all()
    )
    voice_upload_rows = [r for r in media_upload_rows if (r.media_type or "").lower() == "voice"][:5]
    text_upload_rows = [r for r in media_upload_rows if (r.media_type or "").lower() == "text"][:5]
    video_upload_rows = [r for r in media_upload_rows if (r.media_type or "").lower() == "video"][:5]
    video_session_rows = (
        db.query(VideoAssessmentSession)
        .filter(VideoAssessmentSession.patient_id == patient_id)
        .order_by(VideoAssessmentSession.updated_at.desc())
        .limit(5)
        .all()
    )
    wearable_daily_rows = (
        db.query(WearableDailySummary)
        .filter(WearableDailySummary.patient_id == patient_id)
        .order_by(WearableDailySummary.date.desc())
        .limit(5)
        .all()
    )
    biometrics_snapshot_rows = (
        db.query(BiometricsSnapshot)
        .filter(BiometricsSnapshot.patient_id == patient_id)
        .order_by(BiometricsSnapshot.recorded_at.desc())
        .limit(5)
        .all()
    )

    voice_artifact_ids = list(
        dict.fromkeys(
            [
                *_collect_ids(audio_analysis_rows, "analysis_id"),
                *_collect_ids(voice_upload_rows),
            ]
        )
    )
    video_artifact_ids = list(
        dict.fromkeys(
            [
                *_collect_ids(video_session_rows),
                *_collect_ids(video_upload_rows),
            ]
        )
    )
    text_artifact_ids = _collect_ids(text_upload_rows)
    biometrics_artifact_ids = list(
        dict.fromkeys(
            [
                *_collect_ids(wearable_daily_rows),
                *_collect_ids(biometrics_snapshot_rows),
            ]
        )
    )

    therapy_tokens = normalize_therapy_tokens(
        modality if modality != "unknown" else None,
        primary_course.protocol_id if primary_course else None,
        [s.modality or "" for s in sessions[-12:]],
    )
    med_tokens: list[str] = []
    med_summaries: list[dict[str, Any]] = []
    for m in medication_rows:
        if not getattr(m, "active", True):
            continue
        med_summaries.append(
            {
                "id": m.id,
                "name": m.name,
                "generic_name": m.generic_name,
                "drug_class": m.drug_class,
                "dose": m.dose,
                "active": bool(m.active),
            }
        )
        for field in (m.name, m.generic_name, m.drug_class):
            if field and str(field).strip():
                med_tokens.append(str(field).strip())

    check_tokens = list(dict.fromkeys([*med_tokens, *therapy_tokens]))
    interaction_rows, severity_worst = run_interaction_check(check_tokens)
    enrich_medication_interactions: dict[str, Any] = {
        "medications_on_file": len(med_summaries),
        "therapy_modality_tokens": therapy_tokens,
        "tokens_checked": check_tokens[:60],
        "interactions": interaction_rows,
        "severity_summary": severity_worst,
        "rules_engine": "medication_interactions_v1",
        "note": (
            "Drug-drug and drug-therapy rules match Medication Safety check-interactions. "
            "Not a substitute for pharmacy/clinical interaction databases. "
            "Decision-support only. Requires clinician review."
        ),
    }

    linked = {
        "mri": [r.analysis_id for r in mri_rows],
        "qeeg": [r.id for r in qeeg_rows],
        "assessments": [r.id for r in assessment_rows],
        "outcomes": [r.id for r in outcome_rows],
        "medications": [m.id for m in medication_rows],
        "video": video_artifact_ids,
        "voice": voice_artifact_ids,
        "text": text_artifact_ids,
        "biometrics": biometrics_artifact_ids,
    }

    # --- Evidence & research enrichment (live DB + CSV bundle + intelligence overview) ---
    intelligence_overview: dict[str, Any] | None = None
    if actor.role in ("admin", "clinician"):
        try:
            from app.services.evidence_intelligence import build_patient_overview

            intelligence_overview = _serialize_evidence_overview(
                build_patient_overview(patient_id, db)
            )
        except Exception as exc:
            _logger.debug("intervention_analyzer intelligence overview skipped: %s", exc)

    live_evidence_corpus = _evidence_db_counts()
    research_bundle = _research_bundle_summary(indication_slug, modality if modality != "unknown" else None)

    enrich_evidence: dict[str, Any] = {
        "patient_evidence_overview": intelligence_overview,
        "live_evidence_corpus": live_evidence_corpus,
        "neuromodulation_research_bundle": research_bundle,
        "filters_used": {
            "indication_slug": indication_slug,
            "modality_slug": modality if modality != "unknown" else None,
        },
    }

    uncertainty_drivers: list[str] = []
    if not qeeg_rows:
        uncertainty_drivers.append("no_qeeg_in_chart")
    if not mri_rows:
        uncertainty_drivers.append("no_mri_in_chart")
    if len(sessions) < 4:
        uncertainty_drivers.append("sparse_session_history")
    if missed > 2:
        uncertainty_drivers.append("missed_sessions")

    data_gaps: list[dict[str, str]] = []
    if not qeeg_rows:
        data_gaps.append(
            {"domain": "qeeg", "impact": "protocol_stratification_wide_ci"}
        )
    if not mri_rows:
        data_gaps.append(
            {"domain": "mri", "impact": "target_hypothesis_lower_confidence"}
        )
    data_gaps.append(
        {"domain": "forecasting", "impact": "no_calibrated_response_or_session_count_model"}
    )

    # --- Multimodal contributors (11 domains: qEEG/EEG, MRI/fMRI, Assessments, Biometrics,
    #                                Medications, Video/movement, Voice/speech, Text/notes,
    #                                Wearables, Risk analyzer, Digital phenotyping) ---
    contributors: list[dict[str, Any]] = [
        {
            "id": "mmc_qeeg",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "qeeg",
            "signal_type": "qEEG/EEG",
            "timestamp": generated_at,
            "biomarker_role": "predictive",
            "summary": (
                "qEEG features may inform response probability when curated mappings exist. "
                "Decision-support only. Requires clinician review."
                if qeeg_rows
                else "No qEEG analyses linked -- predictive stratification is limited."
            ),
            "relevance_score": 0.5 if qeeg_rows else 0.2,
            "confidence": 0.55 if qeeg_rows else 0.3,
            "data_quality": "good" if qeeg_rows else "missing",
            "clinical_caveat": (
                "Use predictive vs responsive framing per acquisition timing. "
                "Not a calibrated prediction model. Associations shown are temporal, not causal proof."
            ),
            "linked_artifact_ids": linked["qeeg"][:3],
            "deep_link": "/?page=qeeg-analysis",
            "impacted_predictions": ["response_probability"],
            "caveats": ["Use predictive vs responsive framing per acquisition timing."],
        },
        {
            "id": "mmc_mri",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "mri",
            "signal_type": "MRI/fMRI",
            "timestamp": generated_at,
            "biomarker_role": "predictive",
            "summary": (
                "Structural / functional imaging supports target localization when available. "
                "Decision-support only."
                if mri_rows
                else "No MRI Analyzer runs linked -- add imaging for stronger targeting context."
            ),
            "relevance_score": 0.55 if mri_rows else 0.15,
            "confidence": 0.6 if mri_rows else 0.25,
            "data_quality": "good" if mri_rows else "missing",
            "clinical_caveat": (
                "Acquisition and test-retest reliability vary by metric. "
                "Not a calibrated prediction model."
            ),
            "linked_artifact_ids": linked["mri"][:3],
            "deep_link": "/?page=mri-analysis",
            "impacted_predictions": ["response_probability", "target_hypothesis"],
            "caveats": ["Acquisition and test-retest reliability vary by metric."],
        },
        {
            "id": "mmc_assessments",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "assessments",
            "signal_type": "Assessments",
            "timestamp": generated_at,
            "biomarker_role": "responsive",
            "summary": (
                "Longitudinal scales anchor outcome trajectories and response labeling. "
                "Decision-support only. Requires clinician review."
            ),
            "relevance_score": 0.65 if assessment_rows else 0.25,
            "confidence": 0.6 if assessment_rows else 0.35,
            "data_quality": "good" if len(assessment_rows) > 1 else "sparse",
            "clinical_caveat": (
                "Scale scores are adjunctive. Associations shown are temporal, not causal proof. "
                "Not a validated response classification."
            ),
            "linked_artifact_ids": [a.id for a in assessment_rows[:3]],
            "deep_link": "/?page=assessments-v2",
            "impacted_predictions": ["trajectory", "nonresponse_detection"],
            "caveats": [],
        },
        {
            "id": "mmc_biometrics",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": (
                    "wearable_daily_summaries"
                    if wearable_daily_rows
                    else "biometrics_snapshots"
                    if biometrics_snapshot_rows
                    else "wearable_daily_summaries"
                ),
                "extracted_at": generated_at,
            },
            "domain": "biometrics",
            "signal_type": "Biometrics",
            "timestamp": generated_at,
            "biomarker_role": "responsive",
            "summary": (
                f"{len(biometrics_artifact_ids)} biometric artifact(s) linked to this patient. "
                "Decision-support only."
                if biometrics_artifact_ids
                else "No wearable summaries or biometrics snapshots linked for this patient."
            ),
            "relevance_score": 0.45 if biometrics_artifact_ids else 0.2,
            "confidence": 0.5 if biometrics_artifact_ids else 0.25,
            "data_quality": "good" if biometrics_artifact_ids else "missing",
            "clinical_caveat": (
                "Consumer wearable data remains adjunctive and may lag source systems. "
                "Associations shown are temporal, not causal proof."
            ),
            "linked_artifact_ids": linked["biometrics"][:5],
            "deep_link": "/?page=wearables",
            "impacted_predictions": ["dropout_risk"],
            "caveats": (
                ["Consumer wearable data remains adjunctive and may lag source systems."]
                if biometrics_artifact_ids
                else ["Connect wearables or biometrics feeds for session-adjacent physiology context."]
            ),
        },
        {
            "id": "mmc_meds",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "patient_medications+therapy_tokens",
                "extracted_at": generated_at,
            },
            "domain": "medications",
            "signal_type": "Medications",
            "timestamp": generated_at,
            "biomarker_role": "unknown",
            "summary": (
                f"{len(med_summaries)} active medication(s) on file; "
                f"interaction screen: {severity_worst}."
                if med_summaries
                else "No active medications on file -- drug-therapy screens use modality context only."
            ),
            "relevance_score": 0.55 if med_summaries else 0.25,
            "confidence": 0.55 if med_summaries else 0.35,
            "data_quality": "good" if med_summaries else "missing",
            "clinical_caveat": (
                "Review flagged drug-drug or drug-therapy pairs in Medication Safety. "
                "Decision-support only. Requires clinician review."
            ),
            "linked_artifact_ids": [m["id"] for m in med_summaries[:5]],
            "deep_link": "/?page=med-interactions",
            "impacted_predictions": ["confound_risk", "seizure_threshold"],
            "caveats": (
                ["Review flagged drug-drug or drug-therapy pairs in Medication Safety."]
                if interaction_rows
                else []
            ),
        },
        {
            "id": "mmc_video",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": (
                    "video_assessment_sessions"
                    if video_session_rows
                    else "patient_media_uploads:video"
                ),
                "extracted_at": generated_at,
            },
            "domain": "video",
            "signal_type": "Video/movement",
            "timestamp": generated_at,
            "biomarker_role": "responsive",
            "summary": (
                f"{len(video_artifact_ids)} video artifact(s) linked across assessment sessions or uploads."
                if video_artifact_ids
                else "No video assessment sessions or patient video uploads are linked."
            ),
            "relevance_score": 0.42 if video_artifact_ids else 0.18,
            "confidence": 0.48 if video_artifact_ids else 0.22,
            "data_quality": "good" if video_artifact_ids else "missing",
            "clinical_caveat": (
                "Video findings remain adjunctive and require clinician interpretation. "
                "Not a calibrated prediction model."
            ),
            "linked_artifact_ids": linked["video"][:5],
            "deep_link": "/?page=video-assessments",
            "impacted_predictions": [],
            "caveats": (
                ["Video findings remain adjunctive and require clinician interpretation."]
                if video_artifact_ids
                else ["Upload or complete a video assessment session to add motor/affect context."]
            ),
        },
        {
            "id": "mmc_voice",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": (
                    "audio_analyses"
                    if audio_analysis_rows
                    else "patient_media_uploads:voice"
                ),
                "extracted_at": generated_at,
            },
            "domain": "voice",
            "signal_type": "Voice/speech",
            "timestamp": generated_at,
            "biomarker_role": "responsive",
            "summary": (
                f"{len(voice_artifact_ids)} voice artifact(s) linked across analyzer runs or uploads."
                if voice_artifact_ids
                else "No voice analyzer reports or patient voice uploads are linked."
            ),
            "relevance_score": 0.4 if voice_artifact_ids else 0.16,
            "confidence": 0.46 if voice_artifact_ids else 0.2,
            "data_quality": "good" if voice_artifact_ids else "missing",
            "clinical_caveat": (
                "Prosody signals are adjunctive and should be reviewed with transcript/source audio. "
                "Decision-support only."
            ),
            "linked_artifact_ids": linked["voice"][:5],
            "deep_link": "/?page=voice-analyzer",
            "impacted_predictions": [],
            "caveats": (
                ["Prosody signals are adjunctive and should be reviewed with transcript/source audio."]
                if voice_artifact_ids
                else ["Run the voice analyzer or attach a voice sample to add session-adjacent prosody context."]
            ),
        },
        {
            "id": "mmc_text",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "patient_media_uploads:text",
                "extracted_at": generated_at,
            },
            "domain": "text",
            "signal_type": "Text/notes",
            "timestamp": generated_at,
            "biomarker_role": "unknown",
            "summary": (
                f"{len(text_artifact_ids)} text artifact(s) linked for NLP/context review."
                if text_artifact_ids
                else "No patient text uploads are linked for NLP/context review."
            ),
            "relevance_score": 0.34 if text_artifact_ids else 0.15,
            "confidence": 0.44 if text_artifact_ids else 0.2,
            "data_quality": "good" if text_artifact_ids else "missing",
            "clinical_caveat": (
                "Structured session records still outrank free text for treatment analytics. "
                "Decision-support only."
            ),
            "linked_artifact_ids": linked["text"][:5],
            "deep_link": "/?page=text-analyzer",
            "impacted_predictions": ["confound_risk"],
            "caveats": (
                ["Structured session records still outrank free text for treatment analytics."]
                if text_artifact_ids
                else ["Upload text content or notes if NLP/context review is expected here."]
            ),
        },
        {
            "id": "mmc_wearables",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "wearables",
            "signal_type": "Wearables",
            "timestamp": generated_at,
            "biomarker_role": "responsive",
            "summary": (
                f"{len(wearable_daily_rows)} wearable daily summary row(s) available. "
                "Provides continuous physiological context between sessions."
                if wearable_daily_rows
                else "No wearable daily summaries available. Connect a wearable device for continuous monitoring context."
            ),
            "relevance_score": 0.4 if wearable_daily_rows else 0.15,
            "confidence": 0.45 if wearable_daily_rows else 0.2,
            "data_quality": "good" if wearable_daily_rows else "missing",
            "clinical_caveat": (
                "Consumer wearable data remains adjunctive and may lag source systems. "
                "Not a calibrated prediction model. Decision-support only."
            ),
            "linked_artifact_ids": linked["biometrics"][:5],
            "deep_link": "/?page=wearables",
            "impacted_predictions": ["dropout_risk", "adherence_pattern"],
            "caveats": (
                ["Consumer wearable data remains adjunctive and may lag source systems."]
                if wearable_daily_rows
                else ["Connect wearables for session-adjacent physiology and adherence context."]
            ),
        },
        {
            "id": "mmc_risk_analyzer",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "risk_analyzer",
            "signal_type": "Risk analyzer",
            "timestamp": generated_at,
            "biomarker_role": "predictive",
            "summary": (
                "Risk analyzer signals (suicidality, decompensation, safety flags) when available. "
                "Decision-support only. Requires clinician review."
            ),
            "relevance_score": 0.35,
            "confidence": 0.3,
            "data_quality": "placeholder",
            "clinical_caveat": (
                "Risk scores are heuristic and not validated prediction instruments. "
                "Always follow clinical risk protocols. Associations shown are temporal, not causal proof."
            ),
            "linked_artifact_ids": [],
            "deep_link": "/?page=risk-analyzer",
            "impacted_predictions": ["safety_flag", "dropout_risk"],
            "caveats": ["Risk scores require clinician review. Not a substitute for clinical risk assessment."],
        },
        {
            "id": "mmc_digital_phenotyping",
            "updated_at": generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "domain": "digital_phenotyping",
            "signal_type": "Digital phenotyping",
            "timestamp": generated_at,
            "biomarker_role": "responsive",
            "summary": (
                "Digital phenotyping signals (phone sensor patterns, app usage, keystroke dynamics) "
                "when available. Decision-support only."
            ),
            "relevance_score": 0.3,
            "confidence": 0.25,
            "data_quality": "placeholder",
            "clinical_caveat": (
                "Digital phenotyping is experimental and not a validated clinical measure. "
                "Privacy and consent must be established before use. "
                "Not a calibrated prediction model. Associations shown are temporal, not causal proof."
            ),
            "linked_artifact_ids": [],
            "deep_link": "/?page=digital-phenotyping",
            "impacted_predictions": ["response_probability", "adherence_pattern"],
            "caveats": ["Digital phenotyping requires explicit patient consent. Experimental feature."],
        },
    ]

    phq_points: list[dict[str, Any]] = []
    for a in assessment_rows:
        data: dict[str, Any] = {}
        try:
            data = json.loads(a.data_json or "{}")
        except Exception:
            pass
        score = data.get("total") or data.get("score") or a.score_numeric
        if score is None and a.score:
            try:
                score = float(a.score)
            except Exception:
                score = None
        title_l = (a.template_title or "").lower()
        if "phq" in title_l or (a.template_id or "").lower().startswith("phq"):
            phq_points.append(
                {
                    "t": a.created_at.isoformat(),
                    "value": float(score) if score is not None else None,
                    "assessment_id": a.id,
                }
            )

    outcome_trends: list[dict[str, Any]] = []
    if phq_points:
        outcome_trends.append(
            {
                "id": "tot_phq9_proxy",
                "measure_key": "PHQ-9 (from assessments)",
                "provenance": {
                    "source": "assessments",
                    "source_ref": "assessment_records",
                    "extracted_at": generated_at,
                },
                "points": sorted(phq_points, key=lambda x: x["t"] or ""),
                "trajectory_class": "mixed",
                "expected_band": {"model_version": "trajectory_rules_v0"},
                "last_recalibrated_at": generated_at,
                "confidence": 0.5,
            }
        )

    side_effect_events: list[dict[str, Any]] = []
    for ae in ae_rows:
        side_effect_events.append(
            {
                "id": ae.id,
                "occurred_at": ae.reported_at.isoformat(),
                "provenance": {
                    "source": "clinical",
                    "source_ref": "adverse_events",
                    "extracted_at": generated_at,
                },
                "category": ae.event_type or "other",
                "severity": 3 if (ae.severity or "").lower() == "serious" else 2,
                "related_session_id": ae.session_id,
                "related_protocol_change": None,
                "urgency": "high" if ae.is_serious else "low",
                "sa_flag": bool(ae.is_serious),
                "confidence": 0.85,
                "notes": (ae.description or "")[:500],
            }
        )

    optimization_prompts: list[dict[str, Any]] = []
    if interaction_rows:
        worst_rank = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}.get(
            severity_worst or "none", 0
        )
        if worst_rank >= 2:
            hit = interaction_rows[0]
            optimization_prompts.append(
                {
                    "id": "pop_med_therapy_interaction",
                    "created_at": generated_at,
                    "provenance": {
                        "source": "rules_engine",
                        "source_ref": "medication_interactions_v1",
                        "extracted_at": generated_at,
                    },
                    "prompt_type": "medication_review",
                    "severity": severity_worst or "moderate",
                    "urgency": "urgent" if worst_rank >= 3 else "routine",
                    "title": "Medication-therapy interaction flags",
                    "detail": (
                        f"{hit.get('description', '')} "
                        f"Suggested action: {hit.get('recommendation', '')}"
                    ).strip(),
                    "suggested_actions": [
                        {
                            "label": "Medication Safety -- interaction check",
                            "type": "navigate",
                            "target": "med-interactions",
                        }
                    ],
                    "deterministic": True,
                    "evidence_link_ids": [],
                    "requires_clinician_review": True,
                    "confidence": 0.85 if worst_rank >= 3 else 0.65,
                }
            )

    if missed >= 2:
        optimization_prompts.append(
            {
                "id": "pop_adherence",
                "created_at": generated_at,
                "provenance": {
                    "source": "rules_engine",
                    "source_ref": "adherence_threshold_v1",
                    "extracted_at": generated_at,
                },
                "prompt_type": "spacing_review",
                "severity": "moderate",
                "urgency": "routine",
                "title": "Review adherence pattern",
                "detail": f"{missed} missed or cancelled visits detected -- consider barriers and scheduling.",
                "suggested_actions": [
                    {"label": "Open adherence hub", "type": "navigate", "target": "clinician-adherence"}
                ],
                "deterministic": True,
                "evidence_link_ids": [],
                "requires_clinician_review": True,
                "confidence": 0.75,
            }
        )

    recommendations: list[dict[str, Any]] = [
        {
            "id": "irec_review",
            "created_at": generated_at,
            "provenance": {
                "source": "rules_engine",
                "source_ref": "intervention_analyzer/v1",
                "extracted_at": generated_at,
            },
            "kind": "clinician_review",
            "title": "Confirm protocol and targets in Protocol Studio",
            "body": (
                "All dose and targeting changes require clinician review and documentation. "
                "Decision-support only. Not a calibrated prediction model."
            ),
            "priority": "medium",
            "decision_support_only": True,
            "clinician_review_required": True,
            "structured": {},
            "evidence_link_ids": [],
            "confidence": 1.0,
            "time_horizon": "ongoing",
        }
    ]

    evidence_links: list[dict[str, Any]] = [
        {
            "id": "tel_multimodal_planning",
            "created_at": generated_at,
            "provenance": {
                "source": "literature",
                "source_ref": "internal_registry",
                "extracted_at": generated_at,
            },
            "evidence_type": "literature",
            "title": "Multimodal planning context",
            "snippet": (
                "Combining imaging, electrophysiology, and clinical features can improve "
                "individualized planning versus single-modality views alone. "
                "Decision-support only. Associations shown are temporal, not causal proof."
            ),
            "strength": "moderate",
            "confidence": 0.55,
            "uri": "",
            "expand_behavior": "drawer_full_abstract",
            "related_domains": ["mri", "eeg", "clinical"],
        }
    ]

    # Merge corpus-backed rows into evidence_links for UI drawers (cap size).
    tel_seq = 100
    try:
        rs_mod = research_bundle.get("filters") or {}
        rs_mod_slug = (rs_mod.get("modality") or modality or "").strip()
        rs_ind = (rs_mod.get("indication") or indication_slug or "").strip()
        for row in (research_bundle.get("top_evidence_links") or [])[:5]:
            tel_seq += 1
            title = (row.get("title") or row.get("paper_key") or "Research graph edge")[:240]
            snippet = (row.get("research_summary") or row.get("abstract") or "")[:320]
            evidence_links.append(
                {
                    "id": f"tel_rs_graph_{tel_seq}",
                    "created_at": generated_at,
                    "provenance": {
                        "source": "guideline",
                        "source_ref": "neuromodulation_research_bundle/evidence_graph",
                        "extracted_at": generated_at,
                    },
                    "evidence_type": "literature",
                    "title": title,
                    "snippet": snippet or "Neuromodulation research bundle edge (CSV corpus).",
                    "strength": str(row.get("evidence_tier") or "moderate"),
                    "confidence": 0.5,
                    "uri": row.get("record_url") or "",
                    "expand_behavior": "drawer_full_abstract",
                    "related_domains": ["modality:" + rs_mod_slug, "indication:" + rs_ind],
                }
            )
    except Exception as exc:
        _logger.debug("evidence graph merge skipped: %s", exc)

    if intelligence_overview and intelligence_overview.get("highlights"):
        for idx, h in enumerate(intelligence_overview["highlights"][:5]):
            hl = h if isinstance(h, dict) else {}
            claim = (hl.get("claim") or hl.get("label") or "")[:400]
            evidence_links.append(
                {
                    "id": f"tel_intel_{idx}",
                    "created_at": generated_at,
                    "provenance": {
                        "source": "model_card",
                        "source_ref": "evidence_intelligence/patient_overview",
                        "extracted_at": generated_at,
                    },
                    "evidence_type": "literature",
                    "title": hl.get("label") or "Evidence intelligence highlight",
                    "snippet": claim,
                    "strength": str(hl.get("evidence_level") or "moderate"),
                    "confidence": float(hl.get("confidence_score") or 0.5),
                    "uri": "",
                    "expand_behavior": "drawer_full_abstract",
                    "related_domains": [str(hl.get("context_type") or "clinical")],
                }
            )

    if actor.role in ("admin", "clinician"):
        recommendations.append(
            {
                "id": "irec_med_safety",
                "created_at": generated_at,
                "provenance": {
                    "source": "rule",
                    "source_ref": "navigation/med-interactions",
                    "extracted_at": generated_at,
                },
                "kind": "navigation",
                "title": "Open Medication Safety (interactions + neuromodulation context)",
                "body": "Run the full interaction check and edit the med list on file.",
                "priority": "medium" if interaction_rows else "low",
                "decision_support_only": True,
                "clinician_review_required": False,
                "structured": {"navigate_page": "med-interactions"},
                "evidence_link_ids": [],
                "confidence": 1.0,
                "time_horizon": "n/a",
            }
        )

    if actor.role in ("admin", "clinician"):
        recommendations.append(
            {
                "id": "irec_research_evidence",
                "created_at": generated_at,
                "provenance": {
                    "source": "rule",
                    "source_ref": "navigation/research-evidence",
                    "extracted_at": generated_at,
                },
                "kind": "navigation",
                "title": "Open Research Evidence for live corpus search",
                "body": (
                    "Browse PubMed-scale ingestion, trials, and devices -- same pipeline "
                    "as Protocol Studio evidence helpers."
                ),
                "priority": "low",
                "decision_support_only": True,
                "clinician_review_required": False,
                "structured": {"navigate_page": "research-evidence"},
                "evidence_link_ids": [],
                "confidence": 1.0,
                "time_horizon": "n/a",
            }
        )

    audit_events: list[dict[str, Any]] = []

    session_records: list[dict[str, Any]] = []
    for s in sessions[-40:]:  # cap payload size
        st = (s.status or "").lower()
        if st == "completed" or st == "in_progress":
            mapped_status = "completed" if st == "completed" else "planned"
        elif st in {"no_show", "cancelled"}:
            mapped_status = "missed"
        elif st in {"scheduled", "confirmed", "checked_in"}:
            mapped_status = "planned"
        else:
            mapped_status = "planned"
        session_records.append(
            {
                "id": s.id,
                "session_index": s.session_number,
                "started_at": s.scheduled_at,
                "ended_at": s.completed_at,
                "timezone": "UTC",
                "provenance": {
                    "source": "api",
                    "source_ref": "clinical_sessions",
                    "extracted_at": generated_at,
                },
                "modality": s.modality or modality,
                "protocol_label": s.protocol_ref or (primary_course.protocol_id if primary_course else ""),
                "target": {
                    "label": primary_course.target_region if primary_course else "",
                    "confidence": 0.5,
                },
                "parameters": {
                    "duration_minutes": s.duration_minutes,
                    "provenance": {
                        "source": "api",
                        "source_ref": "clinical_sessions",
                        "extracted_at": generated_at,
                    },
                    "confidence": 0.7,
                },
                "duration_minutes": s.duration_minutes,
                "status": mapped_status,
                "attendance": "full" if mapped_status == "completed" else "none",
                "patient_experience": {},
                "acute_side_effects": [],
                "linked_pre_measures": [],
                "linked_post_measures": [],
                "linked_analyzers_impacted": [],
                "severity_for_monitoring": "routine",
                "urgency": "none",
            }
        )

    course_payload: dict[str, Any] | None = None
    if primary_course:
        course_payload = {
            "id": primary_course.id,
            "updated_at": _iso(primary_course.updated_at) or generated_at,
            "provenance": {
                "source": "api",
                "source_ref": "treatment_courses",
                "extracted_at": generated_at,
            },
            "modality": primary_course.modality_slug or modality,
            "indication_context": {
                "type": "clinical",
                "condition_codes": [primary_course.condition_slug],
            },
            "wellness_mode": False,
            "protocol_status": {
                "name": primary_course.protocol_id,
                "version": "",
                "started_on": _iso(primary_course.started_at),
            },
            "phase": _phase_from_course(primary_course),
            "planned_sessions": primary_course.planned_sessions_total,
            "completed_sessions": primary_course.sessions_delivered,
            "missed_sessions": missed,
            "last_session_at": session_records[-1]["started_at"] if session_records else None,
            "response_status": _response_label(primary_course),
            "side_effect_burden": {
                "score": min(1.0, len(ae_rows) * 0.08),
                "tier": "low",
            },
            "concurrent_meds": len(med_summaries),
            "target_region": primary_course.target_region,
            "linked_analyzer_ids": linked,
        }

    planning_snapshot = {
        "updated_at": generated_at,
        "provenance": {
            "source": "rules_engine",
            "source_ref": "intervention_analyzer/v1",
            "extracted_at": generated_at,
        },
        "modality": modality,
        "candidate_protocols": [
            {
                "id": "cpr_primary",
                "created_at": generated_at,
                "provenance": {
                    "source": "rules_engine",
                    "source_ref": "course.protocol_id",
                    "extracted_at": generated_at,
                },
                "modality": modality,
                "protocol_key": primary_course.protocol_id if primary_course else "unspecified",
                "label": (primary_course.protocol_id if primary_course else "Define protocol in Protocol Studio"),
                "waveform_family": "unspecified",
                "evidence_strength": (
                    (primary_course.evidence_grade or "unknown")
                    if primary_course
                    else "unknown"
                ),
                "confidence": 0.55,
                "rank": 1,
                "rationale_bullets": [
                    "Derived from the active intervention course on file.",
                    "Compare with evidence-backed templates in Research Evidence.",
                    "Decision-support only. Requires clinician review.",
                ],
                "evidence_link_ids": ["tel_multimodal_planning"],
                "contraindication_hits": [],
                "requires_clinician_review": True,
            }
        ],
        "candidate_targets": [
            {
                "id": "tr_course_target",
                "created_at": generated_at,
                "provenance": {
                    "source": "rules_engine",
                    "source_ref": "treatment_course.target_region",
                    "extracted_at": generated_at,
                },
                "modality": modality,
                "anatomical_target": (
                    (primary_course.target_region or "unspecified")
                    if primary_course
                    else "unspecified"
                ),
                "coordinate_space": "",
                "coordinates_mm": [],
                "confidence": 0.45 if mri_rows else 0.25,
                "mri_anchor_study_id": linked["mri"][0] if linked["mri"] else None,
                "uncertainty_mm": None,
                "biomarker_role": "predictive",
                "notes": (
                    "Hypothesis from course + imaging when available -- verify clinically. "
                    "Decision-support only. Not a calibrated prediction model."
                ),
            }
        ],
        "forecast_status": {
            "available": False,
            "reason": "no_calibrated_model",
            "note": (
                "Forecast numbers are withheld until a calibrated response/session-count model "
                "is validated for this workflow. Decision-support only."
            ),
        },
        "response_probability": {
            "available": False,
            "point": None,
            "ci": [],
            "horizon": "12_weeks",
            "reason": "no_calibrated_model",
        },
        "session_count_estimate": {
            "available": False,
            "median": None,
            "range": [],
            "unit": "sessions",
            "reason": "no_calibrated_model",
        },
        "modality_suitability": {
            "status": "unknown_without_full_intake",
            "flags": [],
        },
        "uncertainty": {
            "level": "high",
            "drivers": [*uncertainty_drivers, "no_calibrated_forecast_model"],
        },
        "why_summary": (
            "Protocol and target suggestions reflect course data plus linked multimodal context. "
            "Forecast numbers are intentionally withheld until a calibrated model is validated. "
            "Decision-support only. Not a calibrated prediction model. "
            "Associations shown are temporal, not causal proof."
        ),
        "biomarker_roles_used": {
            "predictive": ["mri", "qeeg"] if (mri_rows or qeeg_rows) else [],
            "responsive": ["assessments"] if assessment_rows else [],
        },
        "confidence": 0.3,
    }

    if actor.role in ("admin", "clinician"):
        now_utc = _now_iso()
        ev_id = f"ia-mlfb-{patient_id}-{uuid.uuid4().hex[:12]}"
        learn_note = json.dumps(
            {
                "surface": "intervention_analyzer",
                "interaction_severity": severity_worst,
                "interaction_hits": len(interaction_rows),
                "medication_count": len(med_summaries),
                "modality": modality,
            },
            separators=(",", ":"),
        )[:1024]
        audit_events.append(
            {
                "id": ev_id,
                "at": now_utc,
                "actor": {"user_id": actor.actor_id, "role": actor.role},
                "action": "aggregated_view_for_feedback",
                "subject": {"type": "patient", "id": patient_id},
                "rationale": "Training/analytics signal -- payload snapshot hashed server-side for cohort learning.",
                "ml_feedback": True,
            }
        )
        try:
            create_audit_event(
                db,
                event_id=ev_id,
                target_id=patient_id,
                target_type="intervention_analyzer",
                action="intervention_analyzer.view",
                role=actor.role,
                actor_id=actor.actor_id,
                note=learn_note,
                created_at=now_utc,
            )
        except Exception as exc:
            _logger.debug("intervention_analyzer audit skipped: %s", exc)

    return {
        "schema_version": "1.3.0",
        "generated_at": generated_at,
        "patient_id": patient_id,
        "provenance": {
            "source": "api",
            "source_ref": "intervention_analyzer/v1",
            "extracted_at": generated_at,
        },
        "page_title": "Intervention Analyzer + Protocol Intelligence",
        "disclaimer_refs": ["policy://decision-support-v1"],
        "planning_snapshot": planning_snapshot,
        "course": course_payload,
        "sessions": session_records,
        "multimodal_contributors": contributors,
        "outcome_trends": outcome_trends,
        "side_effect_events": side_effect_events,
        "optimization_prompts": optimization_prompts,
        "recommendations": recommendations,
        "evidence_links": evidence_links,
        "audit_events": audit_events,
        "data_gaps": data_gaps,
        "enrich_evidence": enrich_evidence,
        "enrich_medication_interactions": enrich_medication_interactions,
        "prediction_horizon": {
            "label": "acute_plus_12_weeks",
            "start": generated_at,
            "end": generated_at,
        },
        "meta": {
            "rules_engine_version": "intervention_analyzer_v1",
            "forecast_note": (
                "Forecast numbers are withheld because no calibrated response/session-count model "
                "is configured for this workflow. Decision-support only. Not a calibrated prediction model."
            ),
            "enrichment": "live_evidence_db + neuromodulation_research_bundle + evidence_intelligence overview (clinician)",
            "learning_feedback": "clinician views append audit_events + audit trail row intervention_analyzer.view",
        },
    }

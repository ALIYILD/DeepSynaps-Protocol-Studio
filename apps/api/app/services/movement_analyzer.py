"""Movement Analyzer — assemble multimodal movement workspace payload (v0.2).

Decision-support only. Fuses video_analysis, wearable_daily_summaries,
biometrics_snapshots (VC stress/steps), voice_analysis (stress/energy during calls),
wellness_checkins + symptom_journal_entries (mood/pain context), treatment_courses,
clinical_sessions, DeepTwin runs, medications, and risk — for multimodal review.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.persistence.models import (
    ClinicalSession,
    DeepTwinAnalysisRun,
    MovementAnalyzerAudit,
    MovementAnalyzerSnapshot,
    PatientMedication,
    RiskStratificationResult,
    SymptomJournalEntry,
    TreatmentCourse,
    WellnessCheckin,
)
from app.persistence.models.devices import (
    BiometricsSnapshot,
    VideoAnalysis,
    VoiceAnalysis,
    WearableDailySummary,
)

PIPELINE_VERSION = "0.2.0"
SCHEMA_VERSION = "1"


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _level_from_posture(score: Optional[float]) -> tuple[str, float]:
    """video_analysis.posture_score is 0–100 style integer; higher = better posture proxy."""
    if score is None:
        return "unknown", 0.35
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "unknown", 0.35
    if s >= 70:
        return "within_expected", 0.55
    if s >= 45:
        return "mild_limitation", 0.5
    return "notable_concern", 0.45


def _activity_from_steps(avg_steps: Optional[float]) -> tuple[str, float]:
    if avg_steps is None:
        return "unknown", 0.4
    if avg_steps >= 6500:
        return "active", 0.55
    if avg_steps >= 3500:
        return "moderate", 0.55
    return "low", 0.5


def _avg_nums(vals: list[Optional[float]]) -> Optional[float]:
    xs = [float(v) for v in vals if v is not None]
    if not xs:
        return None
    return float(mean(xs))


def _mood_stress_axis_label(
    avg_vc_stress: Optional[float],
    vc_voice_stress: Optional[float],
    mood: Optional[float],
    anxiety: Optional[float],
    pain: Optional[float],
    symptom_sev: Optional[float],
) -> str:
    parts: list[str] = []
    if mood is not None:
        parts.append(f"shared mood ~{mood:.1f}/10")
    if anxiety is not None and anxiety >= 5:
        parts.append(f"anxiety ~{anxiety:.1f}/10")
    if avg_vc_stress is not None:
        parts.append(f"VC biometrics stress ~{avg_vc_stress:.0f}")
    if vc_voice_stress is not None and vc_voice_stress >= 4:
        parts.append(f"voice-call stress signal avg ~{vc_voice_stress:.1f}")
    if pain is not None and pain >= 5:
        parts.append(f"pain ~{pain:.1f}/10 (may limit activity)")
    if symptom_sev is not None:
        parts.append(f"shared symptom journal severity ~{symptom_sev:.1f}")
    if not parts:
        return "No shared wellness / VC biometrics in lookback — correlate mood & stress clinically."
    return "; ".join(parts[:4])


# ── PR #452 frontend contract adapter ────────────────────────────────────────
# The Movement Analyzer page (apps/web/src/pages-movement-analyzer.js) was
# shipped in PR #452 and reads a flatter shape than this service emits natively.
# We expose BOTH shapes so the rich workspace data is preserved AND the page
# renders without falling back to the demo-only branch.
#
# Frontend reads (per PR #452):
#   patient_id, patient_name, captured_at,
#   modalities: { bradykinesia|tremor|gait|posture|monitoring:
#       { score:0-100, severity:'green'|'amber'|'red',
#         confidence:0-1, contributing_factors:string[] } },
#   source_video?: { recording_id, captured_at, duration_seconds },
#   prior_scores?: [{ captured_at, modality, score }]

_AXIS_TO_MODALITY = {
    "bradykinesia": "bradykinesia",
    "tremor": "tremor",
    "gait": "gait",
    "posture_balance": "posture",
    "activity": "monitoring",
}


def _severity_from_axis_level(level: Optional[str]) -> str:
    """Map cursor's axis 'level' vocabulary onto PR #452's severity colours."""
    if not level:
        return "amber"
    lv = str(level).lower()
    if lv in ("within_expected", "active", "available"):
        return "green"
    if lv in ("notable_concern", "low", "worsening"):
        return "red"
    # `not_assessed`, `indirect`, `sparse`, `mild_limitation`, `moderate`, `unknown` → amber
    return "amber"


def _score_from_severity_and_completeness(severity: str, completeness: float) -> int:
    """Coarse 0–100 score used by the PR #452 modality cards.

    Decision-support only; this is a UI heuristic so the page can render a
    progress bar consistent with the severity colour. The richer numeric
    detail lives in the full ``snapshot`` and ``domains`` blocks.
    """
    base = {"green": 25, "amber": 55, "red": 80}.get(severity, 50)
    # Nudge by inverse completeness so very-sparse inputs show a slightly
    # softened bar even when severity defaults to amber.
    nudge = int((1.0 - max(0.0, min(1.0, completeness))) * 8)
    return max(0, min(100, base + (nudge if severity != "green" else -nudge)))


def _build_modalities_block(snapshot_axes: dict[str, dict[str, Any]], by_domain: dict[str, float]) -> dict[str, dict[str, Any]]:
    """Project cursor's per-axis snapshot into the PR #452 modality shape."""
    out: dict[str, dict[str, Any]] = {}
    for axis_key, modality_key in _AXIS_TO_MODALITY.items():
        axis = snapshot_axes.get(axis_key) or {}
        severity = _severity_from_axis_level(axis.get("level"))
        completeness = float(by_domain.get(axis_key, by_domain.get(modality_key, 0.3)) or 0.3)
        confidence = float(axis.get("confidence") or 0.3)
        label = axis.get("label") or ""
        contributing: list[str] = []
        if label:
            contributing.append(str(label))
        out[modality_key] = {
            "score": _score_from_severity_and_completeness(severity, completeness),
            "severity": severity,
            "confidence": _clamp01(confidence),
            "contributing_factors": contributing,
        }
    # Always include all five modality keys the frontend renders, even if axis missing.
    for k in ("bradykinesia", "tremor", "gait", "posture", "monitoring"):
        out.setdefault(k, {
            "score": 50,
            "severity": "amber",
            "confidence": 0.3,
            "contributing_factors": ["No structured signal available yet."],
        })
    return out


def _safe_json_summary(blob: Optional[str], max_len: int = 240) -> str:
    if not blob:
        return ""
    try:
        d = json.loads(blob)
        if isinstance(d, dict):
            for k in ("headline", "summary", "title", "message", "text"):
                if k in d and d[k]:
                    s = str(d[k]).strip()
                    return s[:max_len] + ("…" if len(s) > max_len else "")
            return (json.dumps(d, default=str))[:max_len] + "…"
        if isinstance(d, list) and d:
            return str(d[0])[:max_len]
        return str(d)[:max_len]
    except json.JSONDecodeError:
        s = blob.strip()
        return s[:max_len] + ("…" if len(s) > max_len else "")


def build_movement_workspace_payload(patient_id: str, db: Session) -> dict[str, Any]:
    """Build serialisable Movement Analyzer page payload from DB signals."""
    now = datetime.now(timezone.utc)
    generated_at = _iso(now)

    # ── Patient name for PR #452 frontend contract ────────────────────────────
    from app.persistence.models import Patient as _Patient

    patient_name: Optional[str] = None
    pat_row = db.execute(
        select(_Patient.first_name, _Patient.last_name).where(_Patient.id == patient_id)
    ).first()
    if pat_row:
        first = (pat_row[0] or "").strip()
        last = (pat_row[1] or "").strip()
        joined = f"{first} {last}".strip()
        patient_name = joined or None

    # ── Video analysis aggregates ─────────────────────────────────────────────
    vid_rows = db.execute(
        select(VideoAnalysis.posture_score, VideoAnalysis.created_at)
        .where(VideoAnalysis.patient_id == patient_id)
        .order_by(VideoAnalysis.created_at.desc())
        .limit(20)
    ).all()
    posture_scores = [float(r[0]) for r in vid_rows if r[0] is not None]
    last_video_at = _iso(vid_rows[0][1]) if vid_rows else None
    posture_mean = sum(posture_scores) / len(posture_scores) if posture_scores else None
    posture_level, posture_conf = _level_from_posture(posture_mean)

    # ── Wearable steps (activity proxy) ───────────────────────────────────────
    since = (now - timedelta(days=14)).date().isoformat()
    step_rows = db.execute(
        select(WearableDailySummary.steps, WearableDailySummary.date, WearableDailySummary.synced_at)
        .where(WearableDailySummary.patient_id == patient_id)
        .where(WearableDailySummary.date >= since)
        .where(WearableDailySummary.steps.isnot(None))
    ).all()
    step_vals = [int(r[0]) for r in step_rows if r[0] is not None]
    avg_steps = sum(step_vals) / len(step_vals) if step_vals else None
    last_wearable_at = None
    if step_rows:
        latest_sync = max((r[2] for r in step_rows if r[2] is not None), default=None)
        if latest_sync:
            last_wearable_at = _iso(latest_sync)
    activity_level, activity_conf = _activity_from_steps(avg_steps)

    # ── Medications (motor-relevant hint only) ────────────────────────────────
    med_rows = db.execute(
        select(PatientMedication.name, PatientMedication.generic_name)
        .where(PatientMedication.patient_id == patient_id)
        .where(PatientMedication.active.is_(True))
    ).all()
    has_meds = bool(med_rows)
    motor_keywords = (
        "levodopa", "carbidopa", "sinemet", "madopar", "stalevo", "ropinirole",
        "pramipexole", "rotigotine", "amantadine", "propranolol", "primidone",
        "haloperidol", "quetiapine", "olanzapine", "aripiprazole", "tramadol",
    )
    motor_meds = []
    for name, generic in med_rows:
        blob = f"{name or ''} {generic or ''}".lower()
        if any(k in blob for k in motor_keywords):
            motor_meds.append(name or generic or "medication")

    # ── Risk link (clinical deterioration category) ──────────────────────────
    risk_row = db.execute(
        select(RiskStratificationResult.level, RiskStratificationResult.confidence)
        .where(RiskStratificationResult.patient_id == patient_id)
        .where(RiskStratificationResult.category == "clinical_deterioration")
    ).first()
    risk_level = risk_row[0] if risk_row else None

    # ── Virtual-care biometrics (stress, steps during visits, sleep proxy) ─────
    bio_since = now - timedelta(days=90)
    bio_rows = db.execute(
        select(
            BiometricsSnapshot.stress_score,
            BiometricsSnapshot.steps_today,
            BiometricsSnapshot.sleep_hours_last_night,
            BiometricsSnapshot.recorded_at,
        )
        .where(BiometricsSnapshot.patient_id == patient_id)
        .where(BiometricsSnapshot.recorded_at >= bio_since)
        .order_by(BiometricsSnapshot.recorded_at.desc())
        .limit(40)
    ).all()
    stress_vals = [int(r[0]) for r in bio_rows if r[0] is not None]
    bio_steps_vals = [int(r[1]) for r in bio_rows if r[1] is not None]
    sleep_vals = [float(r[2]) for r in bio_rows if r[2] is not None]
    avg_vc_stress = _avg_nums([float(x) for x in stress_vals]) if stress_vals else None
    last_bio_at = _iso(bio_rows[0][3]) if bio_rows else None

    # ── Voice analysis during VC (stress_level / energy proxy) ──────────────────
    va_rows = db.execute(
        select(VoiceAnalysis.stress_level, VoiceAnalysis.energy_level, VoiceAnalysis.created_at)
        .where(VoiceAnalysis.patient_id == patient_id)
        .order_by(VoiceAnalysis.created_at.desc())
        .limit(20)
    ).all()
    vc_voice_stress_avg = _avg_nums([float(r[0]) for r in va_rows if r[0] is not None])
    vc_voice_energy_avg = _avg_nums([float(r[1]) for r in va_rows if r[1] is not None])

    # ── Wellness check-ins (patient-shared only — mood/anxiety/pain context) ───
    wc_since = now - timedelta(days=30)
    wc_rows = db.execute(
        select(
            WellnessCheckin.mood,
            WellnessCheckin.anxiety,
            WellnessCheckin.energy,
            WellnessCheckin.pain,
            WellnessCheckin.shared_at,
            WellnessCheckin.created_at,
        )
        .where(WellnessCheckin.patient_id == patient_id)
        .where(WellnessCheckin.deleted_at.is_(None))
        .where(WellnessCheckin.shared_at.isnot(None))
        .where(WellnessCheckin.created_at >= wc_since)
        .order_by(WellnessCheckin.created_at.desc())
        .limit(60)
    ).all()
    wc_mood_avg = _avg_nums([float(r[0]) for r in wc_rows if r[0] is not None])
    wc_anx_avg = _avg_nums([float(r[1]) for r in wc_rows if r[1] is not None])
    wc_energy_avg = _avg_nums([float(r[2]) for r in wc_rows if r[2] is not None])
    wc_pain_avg = _avg_nums([float(r[3]) for r in wc_rows if r[3] is not None])
    last_wellness_at = _iso(wc_rows[0][5]) if wc_rows else None

    # ── Symptom journal (shared entries only — distress vs movement) ─────────
    sj_since = now - timedelta(days=30)
    sj_rows = db.execute(
        select(SymptomJournalEntry.severity, SymptomJournalEntry.created_at)
        .where(SymptomJournalEntry.patient_id == patient_id)
        .where(SymptomJournalEntry.deleted_at.is_(None))
        .where(SymptomJournalEntry.shared_at.isnot(None))
        .where(SymptomJournalEntry.created_at >= sj_since)
        .order_by(SymptomJournalEntry.created_at.desc())
        .limit(40)
    ).all()
    sj_sev_avg = _avg_nums([float(r[0]) for r in sj_rows if r[0] is not None])
    last_symptom_at = _iso(sj_rows[0][1]) if sj_rows else None

    # ── Neuromod treatment courses & clinical sessions (therapy cadence) ─────
    tc_rows = db.execute(
        select(TreatmentCourse.modality_slug, TreatmentCourse.status, TreatmentCourse.sessions_delivered)
        .where(TreatmentCourse.patient_id == patient_id)
    ).all()
    active_courses = sum(1 for r in tc_rows if str(r[1] or "").lower() not in ("completed", "cancelled"))
    modalities = sorted({str(r[0]) for r in tc_rows if r[0]})

    sess_cutoff = now - timedelta(days=90)
    sess_completed_90d = db.scalar(
        select(func.count())
        .select_from(ClinicalSession)
        .where(ClinicalSession.patient_id == patient_id)
        .where(ClinicalSession.status == "completed")
        .where(ClinicalSession.created_at >= sess_cutoff)
    ) or 0

    # ── DeepTwin — latest multimodal fusion output ─────────────────────────────
    dt_row = db.execute(
        select(
            DeepTwinAnalysisRun.id,
            DeepTwinAnalysisRun.analysis_type,
            DeepTwinAnalysisRun.output_summary_json,
            DeepTwinAnalysisRun.confidence,
            DeepTwinAnalysisRun.created_at,
        )
        .where(DeepTwinAnalysisRun.patient_id == patient_id)
        .order_by(DeepTwinAnalysisRun.created_at.desc())
        .limit(1)
    ).first()
    deeptwin_preview = ""
    deeptwin_id = None
    dt_confidence = None
    if dt_row:
        deeptwin_id = dt_row[0]
        deeptwin_preview = _safe_json_summary(dt_row[2])
        dt_confidence = float(dt_row[3]) if dt_row[3] is not None else None

    # ── Completeness (heuristic) ──────────────────────────────────────────────
    has_video = bool(vid_rows)
    has_wearable = bool(step_vals)
    has_meds = bool(med_rows)
    has_bio_vc = bool(bio_rows)
    has_voice = bool(va_rows)
    has_wellness_shared = bool(wc_rows)
    has_symptom_shared = bool(sj_rows)
    has_deeptwin = bool(dt_row)
    has_treatment_course = bool(tc_rows)
    completeness = _clamp01(
        0.18
        + (0.28 if has_video else 0)
        + (0.28 if has_wearable else 0)
        + (0.06 if has_meds else 0)
        + (0.08 if has_bio_vc else 0)
        + (0.05 if has_voice else 0)
        + (0.06 if has_wellness_shared else 0)
        + (0.04 if has_symptom_shared else 0)
        + (0.05 if has_deeptwin else 0)
        + (0.04 if has_treatment_course else 0)
    )
    by_domain = {
        "gait": 0.45 if has_wearable else 0.2,
        "tremor": 0.25,
        "bradykinesia": 0.25,
        "dyskinesia": 0.2,
        "posture_balance": 0.55 if has_video else 0.2,
        "freezing_immobility": 0.2,
        "fine_motor": 0.2,
        "activity_patterns": 0.62 if has_wearable else 0.28,
        "psychophysiology_context": 0.55 if (has_bio_vc or has_voice or has_wellness_shared) else 0.2,
    }

    # ── Snapshot axes (honest defaults where no kinematic pipeline yet) ─────
    snapshot_axes = {
        "tremor": {
            "level": "not_assessed",
            "label": "No structured tremor task in recorded signals",
            "confidence": 0.35,
        },
        "gait": {
            "level": "indirect",
            "label": "Step-count trend only" if has_wearable else "No wearable gait stream",
            "confidence": 0.45 if has_wearable else 0.3,
        },
        "bradykinesia": {
            "level": "not_assessed",
            "label": "Add finger-tap / task video for bradykinesia features",
            "confidence": 0.35,
        },
        "dyskinesia": {
            "level": "not_assessed",
            "label": "No dyskinesia model run on this patient",
            "confidence": 0.35,
        },
        "posture_balance": {
            "level": posture_level,
            "label": "Virtual-care posture proxy" if has_video else "No video movement analysis",
            "confidence": posture_conf if has_video else 0.35,
        },
        "activity": {
            "level": activity_level,
            "label": f"Avg {int(avg_steps)} steps/day (14d)" if avg_steps else "No recent step data",
            "confidence": activity_conf if avg_steps else 0.35,
        },
        "mood_stress_context": {
            "level": "available" if (has_wellness_shared or has_bio_vc or has_voice or has_symptom_shared) else "sparse",
            "label": _mood_stress_axis_label(
                avg_vc_stress,
                vc_voice_stress_avg,
                wc_mood_avg,
                wc_anx_avg,
                wc_pain_avg,
                sj_sev_avg,
            ),
            "confidence": 0.5 if (has_wellness_shared or has_bio_vc or has_voice) else 0.3,
        },
    }

    overall = "unclear"
    if risk_level == "red":
        overall = "worsening"
    elif risk_level == "amber":
        overall = "unclear"
    elif has_wearable and avg_steps and avg_steps >= 5000 and posture_level == "within_expected":
        overall = "stable"

    concern_confidence = _clamp01(completeness * 0.65 + (0.1 if has_video else 0) + (0.1 if has_wearable else 0))

    phenotype_bits = []
    if has_wearable and avg_steps:
        phenotype_bits.append(f"Activity proxy: ~{int(avg_steps)} steps/day from wearable summaries.")
    if has_video:
        phenotype_bits.append("Posture/engagement signals available from analyzed video segments.")
    if has_bio_vc and avg_vc_stress is not None:
        phenotype_bits.append(
            f"Virtual-care biometrics include stress proxy (avg ~{avg_vc_stress:.0f} over recent samples)."
        )
    if has_voice and vc_voice_stress_avg is not None:
        phenotype_bits.append("Voice session features available (stress/energy proxies during telehealth).")
    if has_wellness_shared and (wc_mood_avg is not None or wc_pain_avg is not None):
        phenotype_bits.append("Patient-shared wellness check-ins provide mood/pain context for activity interpretation.")
    if has_treatment_course:
        mod_txt = ", ".join(modalities[:4]) if modalities else "—"
        phenotype_bits.append(
            f"Neuromod treatment courses on file: {len(tc_rows)} total ({active_courses} active); modalities: {mod_txt}."
        )
    if sess_completed_90d:
        phenotype_bits.append(f"{int(sess_completed_90d)} completed clinical sessions in the last 90 days.")
    if has_deeptwin and deeptwin_preview:
        phenotype_bits.append("DeepTwin fusion output available for cross-signal review.")
    if motor_meds:
        phenotype_bits.append(
            "Medication list includes agents that may affect movement; interpret alongside exam."
        )
    if not phenotype_bits:
        phenotype_bits.append(
            "Limited movement-linked signals — connect Video, wearables, wellness sharing, and biometrics to populate this workspace."
        )

    signal_sources = [
        {
            "source_id": "video_vc",
            "source_modality": "video",
            "passive_vs_elicited": "mixed",
            "time_range": {"start": last_video_at, "end": generated_at} if last_video_at else None,
            "last_received_at": last_video_at,
            "completeness_0_1": 0.7 if has_video else 0.0,
            "qc_flags": [] if has_video else ["no_video_analysis_rows"],
            "confidence": 0.55 if has_video else 0.25,
            "upstream_analyzer": "video_analysis",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "wearable_daily",
            "source_modality": "wearable",
            "passive_vs_elicited": "passive",
            "last_received_at": last_wearable_at,
            "completeness_0_1": 0.65 if has_wearable else 0.0,
            "qc_flags": [] if has_wearable else ["no_wearable_summaries"],
            "confidence": 0.55 if has_wearable else 0.25,
            "upstream_analyzer": "wearable_daily_summaries",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "medications",
            "source_modality": "clinician",
            "passive_vs_elicited": "passive",
            "completeness_0_1": 0.8 if has_meds else 0.0,
            "qc_flags": [] if has_meds else ["no_medications"],
            "confidence": 0.75 if has_meds else 0.2,
            "upstream_analyzer": "patient_medications",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "biometrics_vc",
            "source_modality": "biometrics",
            "passive_vs_elicited": "passive",
            "last_received_at": last_bio_at,
            "completeness_0_1": 0.65 if has_bio_vc else 0.0,
            "qc_flags": [] if has_bio_vc else ["no_vc_biometrics_snapshots"],
            "confidence": 0.52 if has_bio_vc else 0.25,
            "upstream_analyzer": "biometrics_snapshots",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "voice_vc",
            "source_modality": "voice",
            "passive_vs_elicited": "elicited",
            "completeness_0_1": 0.55 if has_voice else 0.0,
            "qc_flags": [] if has_voice else ["no_voice_analysis_rows"],
            "confidence": 0.48 if has_voice else 0.22,
            "upstream_analyzer": "voice_analysis",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "wellness_shared",
            "source_modality": "patient_reported",
            "passive_vs_elicited": "passive",
            "last_received_at": last_wellness_at,
            "completeness_0_1": 0.7 if has_wellness_shared else 0.0,
            "qc_flags": [] if has_wellness_shared else ["no_shared_wellness_checkins"],
            "confidence": 0.55 if has_wellness_shared else 0.2,
            "upstream_analyzer": "wellness_checkins",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "symptom_journal_shared",
            "source_modality": "patient_reported",
            "passive_vs_elicited": "passive",
            "last_received_at": last_symptom_at,
            "completeness_0_1": 0.65 if has_symptom_shared else 0.0,
            "qc_flags": [] if has_symptom_shared else ["no_shared_symptom_journal"],
            "confidence": 0.5 if has_symptom_shared else 0.2,
            "upstream_analyzer": "symptom_journal_entries",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "treatment_courses",
            "source_modality": "neuromod_session",
            "passive_vs_elicited": "mixed",
            "completeness_0_1": 0.75 if has_treatment_course else 0.0,
            "qc_flags": [] if has_treatment_course else ["no_treatment_courses"],
            "confidence": 0.65 if has_treatment_course else 0.2,
            "upstream_analyzer": "treatment_courses",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "clinical_sessions",
            "source_modality": "scheduling",
            "passive_vs_elicited": "passive",
            "completeness_0_1": 0.55 if sess_completed_90d else 0.15,
            "qc_flags": [] if sess_completed_90d else ["no_recent_completed_sessions"],
            "confidence": 0.45,
            "upstream_analyzer": "clinical_sessions",
            "upstream_entity_ids": [],
        },
        {
            "source_id": "deeptwin",
            "source_modality": "fusion_model",
            "passive_vs_elicited": "mixed",
            "completeness_0_1": 0.75 if has_deeptwin else 0.0,
            "qc_flags": [] if has_deeptwin else ["no_deeptwin_analysis_run"],
            "confidence": float(dt_confidence) if dt_confidence is not None else (0.5 if has_deeptwin else 0.2),
            "upstream_analyzer": "deeptwin_analysis_runs",
            "upstream_entity_ids": [deeptwin_id] if deeptwin_id else [],
        },
    ]

    cross_modal_context = {
        "virtual_care_biometrics": {
            "stress_score_avg": round(avg_vc_stress, 1) if avg_vc_stress is not None else None,
            "steps_during_visit_avg": round(mean(bio_steps_vals), 1) if bio_steps_vals else None,
            "sleep_hours_last_night_avg": round(mean(sleep_vals), 2) if sleep_vals else None,
            "last_sample_at": last_bio_at,
            "n_samples": len(bio_rows),
        },
        "voice_during_calls": {
            "stress_level_avg": round(vc_voice_stress_avg, 2) if vc_voice_stress_avg is not None else None,
            "energy_level_avg": round(vc_voice_energy_avg, 2) if vc_voice_energy_avg is not None else None,
            "n_segments": len(va_rows),
        },
        "wellness_shared_checkins_30d": {
            "n_checkins": len(wc_rows),
            "mood_avg_0_10": round(wc_mood_avg, 2) if wc_mood_avg is not None else None,
            "anxiety_avg_0_10": round(wc_anx_avg, 2) if wc_anx_avg is not None else None,
            "energy_avg_0_10": round(wc_energy_avg, 2) if wc_energy_avg is not None else None,
            "pain_avg_0_10": round(wc_pain_avg, 2) if wc_pain_avg is not None else None,
            "last_at": last_wellness_at,
        },
        "symptom_journal_shared_30d": {
            "n_entries": len(sj_rows),
            "severity_avg": round(sj_sev_avg, 2) if sj_sev_avg is not None else None,
            "last_at": last_symptom_at,
        },
        "treatment_courses": {
            "count": len(tc_rows),
            "active_count": active_courses,
            "modalities": modalities,
        },
        "clinical_sessions_completed_90d": int(sess_completed_90d),
        "deeptwin": {
            "latest_run_id": deeptwin_id,
            "analysis_type": str(dt_row[1]) if dt_row else None,
            "summary_preview": (deeptwin_preview or None) if has_deeptwin else None,
            "confidence": dt_confidence,
        },
    }

    domains = {
        "gait": [
            {
                "domain": "gait",
                "metric_key": "steps_per_day_avg",
                "value": round(avg_steps, 1) if avg_steps else None,
                "unit": "steps/d",
                "severity_or_direction": "neutral" if avg_steps and avg_steps > 4000 else "unknown",
                "confidence": 0.5 if has_wearable else 0.25,
                "completeness": by_domain["gait"],
                "timestamp": generated_at,
                "note": "Spatiotemporal gait parameters require task video or instrumented walk tests.",
            }
        ],
        "tremor": [
            {
                "domain": "tremor",
                "metric_key": "rest_tremor_power",
                "value": None,
                "unit": "au",
                "severity_or_direction": "unknown",
                "confidence": 0.25,
                "completeness": by_domain["tremor"],
                "timestamp": generated_at,
                "note": "Upload IMU or clinical tremor-task video to estimate tremor burden.",
            }
        ],
        "posture_balance": [
            {
                "domain": "posture_balance",
                "metric_key": "posture_score_vc_proxy",
                "value": round(posture_mean, 1) if posture_mean is not None else None,
                "unit": "score_0_100",
                "severity_or_direction": "better" if posture_level == "within_expected" else ("worse" if posture_level == "notable_concern" else "unknown"),
                "confidence": posture_conf,
                "completeness": by_domain["posture_balance"],
                "timestamp": generated_at,
            }
        ],
        "activity_patterns": [
            {
                "domain": "activity_patterns",
                "metric_key": "wearable_steps_14d_avg",
                "value": round(avg_steps, 1) if avg_steps else None,
                "unit": "steps/d",
                "severity_or_direction": activity_level,
                "confidence": activity_conf,
                "completeness": by_domain["activity_patterns"],
                "timestamp": generated_at,
            }
        ],
        "psychophysiology_context": [
            {
                "domain": "psychophysiology_context",
                "metric_key": "vc_biometrics_stress_avg",
                "value": round(avg_vc_stress, 1) if avg_vc_stress is not None else None,
                "unit": "device_scale",
                "severity_or_direction": "elevated" if avg_vc_stress is not None and avg_vc_stress >= 6.5 else "unknown",
                "confidence": 0.48 if has_bio_vc else 0.25,
                "completeness": by_domain["psychophysiology_context"],
                "timestamp": generated_at,
                "note": "From biometrics_snapshots during virtual care; not a clinical stress test.",
            },
            {
                "domain": "psychophysiology_context",
                "metric_key": "wellness_mood_avg_shared",
                "value": round(wc_mood_avg, 2) if wc_mood_avg is not None else None,
                "unit": "0_10",
                "severity_or_direction": "low_mood" if wc_mood_avg is not None and wc_mood_avg < 4 else "unknown",
                "confidence": 0.52 if has_wellness_shared else 0.22,
                "completeness": by_domain["psychophysiology_context"],
                "timestamp": generated_at,
                "note": "Only patient-shared wellness check-ins (30d) are included.",
            },
            {
                "domain": "psychophysiology_context",
                "metric_key": "voice_stress_during_call_avg",
                "value": round(vc_voice_stress_avg, 2) if vc_voice_stress_avg is not None else None,
                "unit": "model_0_10",
                "severity_or_direction": "unknown",
                "confidence": 0.45 if has_voice else 0.2,
                "completeness": by_domain["psychophysiology_context"],
                "timestamp": generated_at,
            },
        ],
    }

    flags: list[dict[str, Any]] = []
    if not has_video and not has_wearable:
        flags.append({
            "flag_id": "mov-data-sparse",
            "category": "data_quality",
            "title": "Sparse movement-linked data",
            "detail": "No recent wearable summaries and no video analysis rows. Interpretability is limited.",
            "confidence": 0.85,
            "urgency": "routine",
            "movement_domain": "activity_patterns",
            "source_modalities": [],
            "evidence_link_ids": ["evidence-missingness"],
            "linked_analyzers_impacted": ["video-assessments", "wearables"],
        })
    if motor_meds:
        flags.append({
            "flag_id": "mov-med-context",
            "category": "medication_context",
            "title": "Medications may influence movement",
            "detail": f"Flagged for movement relevance (keyword scan): {', '.join(sorted(set(motor_meds))[:6])}. Correlate with exam and timing.",
            "confidence": 0.55,
            "urgency": "monitor",
            "movement_domain": "tremor",
            "source_modalities": ["clinician"],
            "evidence_link_ids": ["evidence-med-movement"],
            "linked_analyzers_impacted": ["medication-analyzer"],
        })
    if (
        has_wellness_shared
        and wc_pain_avg is not None
        and wc_pain_avg >= 6
        and avg_steps is not None
        and avg_steps < 4200
    ):
        flags.append({
            "flag_id": "mov-pain-activity",
            "category": "multimodal_context",
            "title": "Pain burden vs activity — review alongside movement",
            "detail": "Shared wellness reports elevated pain while average steps are below typical mobility targets; consider interactions with fatigue and motor complaints.",
            "confidence": 0.48,
            "urgency": "monitor",
            "movement_domain": "activity_patterns",
            "source_modalities": ["patient_reported", "wearable"],
            "evidence_link_ids": ["evidence-multimodal-context"],
            "linked_analyzers_impacted": ["clinician-wellness", "wearables"],
        })

    recommendations = [
        {
            "id": "rec-video-tasks",
            "kind": "review_video",
            "rationale": "Structured gait/tremor/bradykinesia tasks in Video Analyzer improve domain scores.",
            "priority": "P1",
            "confidence": 0.7,
            "evidence_link_ids": ["evidence-gait-digital"],
        },
    ]
    if has_wearable and avg_steps and avg_steps < 3500:
        recommendations.append({
            "id": "rec-activity-context",
            "kind": "correlate_meds",
            "rationale": "Low average step count — review medications, mood, pain, and cardiometabolic context.",
            "priority": "P2",
            "confidence": 0.5,
            "evidence_link_ids": ["evidence-activity-realworld"],
        })

    evidence_links = [
        {
            "id": "evidence-missingness",
            "source_type": "rule",
            "title": "Interpretation limited without multimodal inputs",
            "snippet": "Digital movement biomarkers depend on sensor quality, task protocol, and population context.",
            "strength": "moderate",
            "confidence": 0.8,
            "related_flag_ids": ["mov-data-sparse"],
        },
        {
            "id": "evidence-med-movement",
            "source_type": "literature",
            "title": "Medication-related movement effects",
            "snippet": "Several medication classes alter tremor, rigidity, or akathisia; clinical correlation is required.",
            "strength": "moderate",
            "confidence": 0.55,
            "related_flag_ids": ["mov-med-context"] if motor_meds else [],
        },
        {
            "id": "evidence-gait-digital",
            "source_type": "literature",
            "title": "Real-world gait and activity metrics",
            "snippet": "Wearable-derived activity can support longitudinal tracking when interpreted with clinical context.",
            "strength": "moderate",
            "confidence": 0.65,
            "related_flag_ids": [],
        },
        {
            "id": "evidence-activity-realworld",
            "source_type": "literature",
            "title": "Activity levels and functional mobility",
            "snippet": "Step counts are a coarse proxy; they do not replace gait laboratory or timed tests.",
            "strength": "low",
            "confidence": 0.5,
            "related_flag_ids": [],
        },
        {
            "id": "evidence-multimodal-context",
            "source_type": "rule",
            "title": "Interpret movement with mood, stress, and treatment context",
            "snippet": "Motor performance covaries with pain, anxiety, sleep, and therapy cadence; multimodal review reduces single-stream misinterpretation.",
            "strength": "moderate",
            "confidence": 0.6,
            "related_flag_ids": ["mov-pain-activity"] if (has_wellness_shared and wc_pain_avg is not None and wc_pain_avg >= 6 and avg_steps is not None and avg_steps < 4200) else [],
        },
    ]

    risk_relation = "clinical_trajectory_context"
    if risk_level:
        risk_relation = f"clinical_deterioration_risk_{risk_level}"
    multimodal_links = [
        {"analyzer_id": "deeptwin", "label": "DeepTwin", "relation": "multimodal_fusion_summary", "entity_ids": [deeptwin_id] if deeptwin_id else []},
        {"analyzer_id": "video-assessments", "label": "Video Analyzer", "relation": "feeds_posture_proxy", "entity_ids": []},
        {"analyzer_id": "wearables", "label": "Biometrics / wearables", "relation": "feeds_activity_proxy", "entity_ids": []},
        {"analyzer_id": "live-session", "label": "Virtual Care", "relation": "vc_biometrics_voice_stress", "entity_ids": []},
        {"analyzer_id": "voice-analyzer", "label": "Voice Analyzer", "relation": "telehealth_voice_features", "entity_ids": []},
        {"analyzer_id": "clinician-wellness", "label": "Wellness Hub", "relation": "shared_checkins_mood_pain", "entity_ids": []},
        {"analyzer_id": "medication-analyzer", "label": "Medication Analyzer", "relation": "motor_relevant_meds", "entity_ids": []},
        {"analyzer_id": "treatment-sessions-analyzer", "label": "Treatment Sessions", "relation": "neuromod_course_progress", "entity_ids": []},
        {"analyzer_id": "risk-analyzer", "label": "Risk Analyzer", "relation": risk_relation, "entity_ids": []},
        {"analyzer_id": "assessments-v2", "label": "Assessments", "relation": "timed_measures_and_scales", "entity_ids": []},
        {"analyzer_id": "mri-analysis", "label": "MRI Analyzer", "relation": "structural_context_when_movement_disorder", "entity_ids": []},
        {"analyzer_id": "qeeg-analysis", "label": "qEEG Analyzer", "relation": "cortical_motor_network_context", "entity_ids": []},
    ]

    interpretation = {
        "hypotheses": [
            {
                "kind": "data_limitation",
                "statement": "This workspace prioritises transparent gaps: domains without task or sensor data stay uninterpreted rather than imputed.",
                "confidence": 0.9,
                "caveat": "Does not replace neurological examination.",
            },
        ],
        "summary": " ".join(phenotype_bits),
    }
    if has_wellness_shared or has_bio_vc or has_voice:
        interpretation["hypotheses"].append({
            "kind": "multimodal_context",
            "statement": (
                "Mood, stress proxies, and voice/biometric signals are contextual only — use them to triangulate "
                "fatigue, anxiety, and pain as contributors to observed activity or posture patterns."
            ),
            "confidence": 0.62,
            "caveat": "Patient-reported data may be incomplete; wellness entries require patient sharing.",
        })

    # ── PR #452 frontend contract projections (additive — coexist with rich blocks) ──
    pr452_modalities = _build_modalities_block(snapshot_axes, by_domain)
    pr452_source_video: Optional[dict[str, Any]] = None
    if vid_rows:
        pr452_source_video = {
            "recording_id": None,  # VideoAnalysis row IDs are not user-facing recording IDs
            "captured_at": last_video_at,
            "duration_seconds": None,  # not modelled on VideoAnalysis
        }

    payload: dict[str, Any] = {
        # ── PR #452 frontend contract (flatter, decision-support page) ────────
        "patient_id": patient_id,
        "patient_name": patient_name or patient_id,
        "captured_at": last_video_at or generated_at,
        "modalities": pr452_modalities,
        "source_video": pr452_source_video,
        "prior_scores": [],
        # ── Rich workspace payload (cursor v0.2 — multimodal review) ──────────
        "generated_at": generated_at,
        "schema_version": SCHEMA_VERSION,
        "pipeline_version": PIPELINE_VERSION,
        "clinical_disclaimer": (
            "Decision-support only. These summaries combine model outputs and passive sensors; "
            "they are not a substitute for in-person neurological examination or standardised rating scales."
        ),
        "snapshot": {
            "as_of": generated_at,
            "phenotype_summary": " ".join(phenotype_bits),
            "overall_concern": overall,
            "overall_confidence": round(concern_confidence, 2),
            "data_completeness": round(completeness, 2),
            "axes": snapshot_axes,
        },
        "signal_sources": signal_sources,
        "domains": domains,
        "cross_modal_context": cross_modal_context,
        "baseline": None,
        "deviations": [],
        "flags": flags,
        "recommendations": recommendations,
        "evidence_links": evidence_links,
        "multimodal_links": multimodal_links,
        "completeness": {"overall": round(completeness, 2), "by_domain": by_domain},
        "linked_analyzers_impacted": [
            "deeptwin",
            "video-assessments",
            "wearables",
            "live-session",
            "voice-analyzer",
            "clinician-wellness",
            "medication-analyzer",
            "treatment-sessions-analyzer",
            "risk-analyzer",
        ],
        "clinical_interpretation": interpretation,
        "audit_tail": [],
    }
    return payload


def persist_snapshot(patient_id: str, payload: dict[str, Any], db: Session) -> MovementAnalyzerSnapshot:
    """Upsert cached snapshot row."""
    row = db.execute(
        select(MovementAnalyzerSnapshot).where(MovementAnalyzerSnapshot.patient_id == patient_id)
    ).scalar_one_or_none()
    body = json.dumps(payload, separators=(",", ":"), default=str)
    now = datetime.now(timezone.utc)
    if row is None:
        row = MovementAnalyzerSnapshot(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            payload_json=body,
            schema_version=SCHEMA_VERSION,
            pipeline_version=PIPELINE_VERSION,
            computed_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row.payload_json = body
        row.schema_version = SCHEMA_VERSION
        row.pipeline_version = PIPELINE_VERSION
        row.computed_at = now
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return row


def load_snapshot(patient_id: str, db: Session) -> Optional[dict[str, Any]]:
    row = db.execute(
        select(MovementAnalyzerSnapshot).where(MovementAnalyzerSnapshot.patient_id == patient_id)
    ).scalar_one_or_none()
    if row is None:
        return None
    try:
        return json.loads(row.payload_json)
    except json.JSONDecodeError:
        return None


def append_audit(
    patient_id: str,
    action: str,
    actor_id: Optional[str],
    detail: Optional[dict[str, Any]],
    db: Session,
) -> None:
    db.add(
        MovementAnalyzerAudit(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            action=action,
            actor_id=actor_id,
            detail_json=json.dumps(detail or {}, separators=(",", ":"), default=str),
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()


def list_audit_events(patient_id: str, db: Session, limit: int = 50) -> list[dict[str, Any]]:
    rows = db.execute(
        select(MovementAnalyzerAudit)
        .where(MovementAnalyzerAudit.patient_id == patient_id)
        .order_by(MovementAnalyzerAudit.created_at.desc())
        .limit(limit)
    ).scalars().all()
    out = []
    for r in rows:
        detail: Any = {}
        if r.detail_json:
            try:
                detail = json.loads(r.detail_json)
            except json.JSONDecodeError:
                detail = {"raw": r.detail_json}
        # Map cursor's internal action names to the frontend's `kind` vocabulary
        # (PR #452 expects `recompute` | `annotation`; extended for review/export).
        action = r.action or ""
        if action == "annotate":
            kind = "annotation"
        elif action == "review_ack":
            kind = "review_ack"
        elif action == "export_download":
            kind = "export_download"
        else:
            kind = action
        # Compose a human-readable `message` for the frontend audit panel.
        message = ""
        if isinstance(detail, dict):
            message = str(detail.get("message") or detail.get("note") or detail.get("reason") or "").strip()
        if not message:
            if kind == "recompute":
                message = "Profile recomputed."
            elif kind == "annotation":
                message = "Clinician annotation."
            elif kind == "review_ack":
                message = "Clinician review acknowledgment."
            elif kind == "export_download":
                message = "Workspace summary exported."
        out.append({
            "id": r.id,
            "patient_id": r.patient_id,
            "action": action,
            "kind": kind,
            "actor_id": r.actor_id,
            "actor": r.actor_id or "system",
            "message": message,
            "created_at": _iso(r.created_at),
            "detail": detail,
        })
    return out

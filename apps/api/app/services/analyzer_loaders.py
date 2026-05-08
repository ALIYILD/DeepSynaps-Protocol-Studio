"""Per-analyzer feature loaders + system prompts for the unified AI report.

Each loader receives ``(analysis_id, db_session)`` and returns an
:class:`AnalyzerPayload` (see ``analyzer_ai_report``) or ``None``.

For analyzers where the workspace is keyed per-patient (movement,
phenotype, labs, nutrition, risk, digital_phenotyping), the route's
``analysis_id`` is interpreted as a ``patient_id`` and the loader
aggregates rows for that patient. For row-keyed analyzers (mri,
deeptwin, video_assessment, voice/audio), it's the row primary key.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.services.analyzer_ai_report import (
    AnalyzerPayload,
    DECISION_SUPPORT_PREAMBLE,
)

_log = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _maybe_json(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _safe_str(value: Any, max_len: int = 2000) -> str:
    if value is None:
        return ""
    s = str(value)
    return s[:max_len]


def _trim_dict(data: Any, max_keys: int = 24) -> dict[str, Any]:
    """Coerce arbitrary JSON into a dict and cap key count."""
    if isinstance(data, dict):
        return {k: data[k] for k in list(data.keys())[:max_keys]}
    if isinstance(data, list):
        return {"items": data[:max_keys]}
    return {}


# ── MRI ──────────────────────────────────────────────────────────────────────


def load_mri(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    from app.persistence.models import MriAnalysis, MriTargetPlan, MriReportFinding

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not row:
        return None

    targets = (
        db.query(MriTargetPlan).filter_by(analysis_id=analysis_id).all()
    )
    findings = (
        db.query(MriReportFinding).filter_by(analysis_id=analysis_id).all()
    )

    features: dict[str, Any] = {
        "modalities_present": _maybe_json(row.modalities_present_json) or [],
        "structural": _trim_dict(_maybe_json(row.structural_json)),
        "functional": _trim_dict(_maybe_json(row.functional_json)),
        "diffusion": _trim_dict(_maybe_json(row.diffusion_json)),
        "stim_targets": _trim_dict(_maybe_json(row.stim_targets_json)),
        "qc": _trim_dict(_maybe_json(row.qc_json)),
        "safety_cockpit": _trim_dict(_maybe_json(row.safety_cockpit_json)),
        "red_flags": _maybe_json(row.red_flags_json) or [],
        "report_state": row.report_state,
        "demo_mode": bool(row.demo_mode),
        "target_plans": [
            {
                "anatomical_label": t.anatomical_label,
                "modality": _safe_str(t.modality_compatibility, 200),
                "evidence_grade": t.evidence_grade,
                "off_label": bool(t.off_label_flag),
                "registration_confidence": t.registration_confidence,
                "rationale": _safe_str(t.match_rationale, 400),
            }
            for t in targets[:12]
        ],
        "report_findings": [
            {
                "target_id": f.target_id,
                "claim_type": f.claim_type,
                "status": f.status,
                "evidence_grade": f.evidence_grade,
                "clinician_note": _safe_str(f.clinician_note, 400),
            }
            for f in findings[:12]
        ],
    }

    return AnalyzerPayload(
        patient_id=row.patient_id,
        analyzer_type="mri",
        analysis_id=analysis_id,
        title="MRI Decision Support",
        summary_features=features,
        flagged_conditions=[c for c in [row.condition] if c],
        charts=[],
        metadata={
            "pipeline_version": row.pipeline_version,
            "norm_db_version": row.norm_db_version,
            "age": row.age,
            "sex": row.sex,
            "report_version": row.report_version,
            "demo_mode": bool(row.demo_mode),
        },
    )


MRI_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: MRI structural / functional / diffusion analysis for neuromodulation
target planning. Cover: anatomical findings, white-matter integrity,
target-region compatibility, off-label flags, registration confidence,
safety cockpit signals (pacemaker, ferrous implant, claustrophobia).
Flag any TARGET PLAN with off_label=true or evidence_grade=D as a key
finding. NEVER suggest a specific stimulation protocol — name the
anatomical region only and recommend MDT review.
"""


# ── Voice / Audio ────────────────────────────────────────────────────────────


def load_voice(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is an AudioAnalysis primary key (preferred) or VoiceAnalysis."""
    from app.persistence.models import AudioAnalysis, VoiceAnalysis

    audio = db.query(AudioAnalysis).filter_by(analysis_id=analysis_id).first()
    if audio:
        report = _maybe_json(audio.voice_report_json) or {}
        run_ctx = _maybe_json(audio.run_context_json) or {}
        features = {
            "voice_report": _trim_dict(report, max_keys=24),
            "run_context": _trim_dict(run_ctx, max_keys=12),
            "status": audio.status,
            "pipeline_version": audio.pipeline_version,
        }
        return AnalyzerPayload(
            patient_id=audio.patient_id,
            analyzer_type="voice",
            analysis_id=analysis_id,
            title="Voice Acoustic Decision Support",
            summary_features=features,
            flagged_conditions=[],
            charts=[],
            metadata={
                "pipeline_version": audio.pipeline_version,
                "session_id": audio.session_id,
            },
        )

    voice = db.query(VoiceAnalysis).filter_by(id=analysis_id).first()
    if not voice:
        return None

    features = {
        "sentiment": voice.sentiment,
        "stress_level": voice.stress_level,
        "energy_level": voice.energy_level,
        "speech_pace_wpm": voice.speech_pace_wpm,
        "mood_tags": _maybe_json(voice.mood_tags_json) or [],
        "ai_insights": _safe_str(voice.ai_insights, 1500),
        "segment_seconds": [voice.segment_start_sec, voice.segment_end_sec],
    }
    return AnalyzerPayload(
        patient_id=voice.patient_id,
        analyzer_type="voice",
        analysis_id=analysis_id,
        title="Voice Sentiment Decision Support",
        summary_features=features,
        flagged_conditions=(
            ["distressed_speech"] if voice.sentiment == "distressed" else []
        ),
        charts=[],
        metadata={"session_id": voice.session_id},
    )


VOICE_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Voice acoustic & sentiment analysis. Cover: prosodic features
(pitch, jitter, shimmer, HNR), speech-pace tendency, sentiment trajectory,
stress correlates, mood tags. Flag distressed speech or mood deterioration
as moderate-to-high severity. Note that voice biomarkers are
research-grade and require correlation with patient self-report.
"""


# ── Video Assessment ─────────────────────────────────────────────────────────


def load_video_assessment(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    from app.persistence.models import VideoAssessmentSession, VideoAnalysis

    session = db.query(VideoAssessmentSession).filter_by(id=analysis_id).first()
    if session:
        protocol_state = _maybe_json(session.session_json) or {}
        features = {
            "protocol_name": session.protocol_name,
            "protocol_version": session.protocol_version,
            "overall_status": session.overall_status,
            "session_state": _trim_dict(protocol_state, max_keys=20),
        }
        return AnalyzerPayload(
            patient_id=session.patient_id,
            analyzer_type="video_assessment",
            analysis_id=analysis_id,
            title="Video Motor Assessment Decision Support",
            summary_features=features,
            flagged_conditions=[],
            charts=[],
            metadata={
                "encounter_id": session.encounter_id,
                "protocol_version": session.protocol_version,
            },
        )

    va = db.query(VideoAnalysis).filter_by(id=analysis_id).first()
    if not va:
        return None
    features = {
        "engagement_score": va.engagement_score,
        "facial_expression": va.facial_expression,
        "eye_contact_pct": va.eye_contact_pct,
        "posture_score": va.posture_score,
        "attention_flags": _maybe_json(va.attention_flags_json) or [],
        "ai_insights": _safe_str(va.ai_insights, 1500),
    }
    return AnalyzerPayload(
        patient_id=va.patient_id,
        analyzer_type="video_assessment",
        analysis_id=analysis_id,
        title="Video Engagement Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={"session_id": va.session_id},
    )


VIDEO_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Tele-neurology video motor / behavioural assessment. Cover:
movement quality, bradykinesia / rigidity / tremor signs (when present),
gait / posture observations, facial expression, eye contact, engagement.
Distinguish protocol-task observations (e.g., finger-tapping rate) from
ambient observations. Note that video assessments cannot replace bedside
examination and are illustrative.
"""


# ── Movement ─────────────────────────────────────────────────────────────────


def load_movement(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id (Movement workspace is unique per patient)."""
    from app.persistence.models import MovementAnalyzerSnapshot

    row = db.query(MovementAnalyzerSnapshot).filter_by(patient_id=analysis_id).first()
    if not row:
        return None

    payload = _maybe_json(row.payload_json) or {}
    features = {
        "schema_version": row.schema_version,
        "pipeline_version": row.pipeline_version,
        "computed_at": row.computed_at.isoformat() if row.computed_at else None,
        "snapshot": _trim_dict(payload, max_keys=24),
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="movement",
        analysis_id=analysis_id,
        title="Movement Analyzer Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={
            "schema_version": row.schema_version,
            "pipeline_version": row.pipeline_version,
        },
    )


MOVEMENT_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Movement / kinematic analysis (gait, fine motor, postural). Cover:
spatiotemporal gait parameters, asymmetry indices, smoothness / jerk,
postural sway, tremor. Distinguish task-evoked findings from baseline.
Flag fall-risk indicators (elevated sway, gait asymmetry > clinically-
meaningful threshold) as moderate-to-high severity.
"""


# ── Phenotype ────────────────────────────────────────────────────────────────


def load_phenotype(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id."""
    from app.persistence.models import PhenotypeAssignment

    rows = (
        db.query(PhenotypeAssignment)
        .filter_by(patient_id=analysis_id)
        .order_by(PhenotypeAssignment.assigned_at.desc())
        .limit(20)
        .all()
    )
    if not rows:
        return None

    features = {
        "assignment_count": len(rows),
        "assignments": [
            {
                "phenotype_id": r.phenotype_id,
                "phenotype_name": r.phenotype_name,
                "domain": r.domain,
                "confidence": r.confidence,
                "qeeg_supported": bool(r.qeeg_supported),
                "rationale": _safe_str(r.rationale, 400),
                "assigned_at": r.assigned_at.isoformat() if r.assigned_at else None,
            }
            for r in rows
        ],
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="phenotype",
        analysis_id=analysis_id,
        title="Phenotype Decision Support",
        summary_features=features,
        flagged_conditions=[r.phenotype_name for r in rows[:5] if r.phenotype_name],
        charts=[],
        metadata={"assignment_count": len(rows)},
    )


PHENOTYPE_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Clinical phenotyping (RDoC / domain-based). Cover: dominant
phenotypes assigned, supporting evidence per phenotype (qEEG / clinical /
self-report), phenotype confidence levels, cross-phenotype overlap,
implications for treatment selection (without naming a specific protocol).
"""


# ── Labs ─────────────────────────────────────────────────────────────────────


def load_labs(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id."""
    from app.persistence.models import PatientLabResult

    rows = (
        db.query(PatientLabResult)
        .filter_by(patient_id=analysis_id)
        .order_by(PatientLabResult.created_at.desc())
        .limit(40)
        .all()
    )
    if not rows:
        return None

    abnormal: list[dict[str, Any]] = []
    normal_count = 0
    for r in rows:
        flagged = False
        if (
            r.value_numeric is not None
            and r.ref_low is not None
            and r.value_numeric < r.ref_low
        ):
            flagged = True
        elif (
            r.value_numeric is not None
            and r.ref_high is not None
            and r.value_numeric > r.ref_high
        ):
            flagged = True
        if flagged:
            abnormal.append(
                {
                    "analyte": r.analyte_display_name,
                    "code": r.analyte_code,
                    "value": r.value_numeric,
                    "unit": r.unit_ucum,
                    "ref_low": r.ref_low,
                    "ref_high": r.ref_high,
                    "panel": r.panel_name,
                }
            )
        else:
            normal_count += 1

    features = {
        "result_count": len(rows),
        "abnormal_count": len(abnormal),
        "normal_count": normal_count,
        "abnormal_results": abnormal[:20],
        "all_results_summary": [
            {
                "analyte": r.analyte_display_name,
                "value": r.value_numeric or r.value_text,
                "unit": r.unit_ucum,
            }
            for r in rows[:20]
        ],
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="labs",
        analysis_id=analysis_id,
        title="Labs Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={"result_count": len(rows), "abnormal_count": len(abnormal)},
    )


LABS_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Laboratory results review for neuropsychiatric workup. Cover:
out-of-reference-range analytes, trend across panels (TFTs, B12 / folate,
metabolic, inflammatory markers, drug levels). Flag anything potentially
explanatory of psychiatric presentation (thyroid abnormality, anaemia,
B12 deficiency, low sodium) as moderate-to-high severity. Recommend
repeat testing or specialist referral when applicable — never recommend
medication changes.
"""


# ── Nutrition ────────────────────────────────────────────────────────────────


def load_nutrition(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id."""
    from app.persistence.models import PatientNutritionDietLog, PatientSupplement

    diet_logs = (
        db.query(PatientNutritionDietLog)
        .filter_by(patient_id=analysis_id)
        .order_by(PatientNutritionDietLog.log_day.desc())
        .limit(30)
        .all()
    )
    supplements = (
        db.query(PatientSupplement)
        .filter_by(patient_id=analysis_id, active=True)
        .limit(30)
        .all()
    )

    if not diet_logs and not supplements:
        return None

    if diet_logs:
        avg_calories = sum((d.calories_kcal or 0) for d in diet_logs) / len(diet_logs)
        avg_protein = sum((d.protein_g or 0) for d in diet_logs) / len(diet_logs)
        avg_sodium = sum((d.sodium_mg or 0) for d in diet_logs) / len(diet_logs)
        avg_fiber = sum((d.fiber_g or 0) for d in diet_logs) / len(diet_logs)
    else:
        avg_calories = avg_protein = avg_sodium = avg_fiber = 0.0

    features = {
        "diet_log_days": len(diet_logs),
        "averages": {
            "calories_kcal": round(avg_calories, 1),
            "protein_g": round(avg_protein, 1),
            "sodium_mg": round(avg_sodium, 1),
            "fiber_g": round(avg_fiber, 1),
        },
        "recent_logs": [
            {
                "day": d.log_day,
                "calories": d.calories_kcal,
                "protein_g": d.protein_g,
                "carbs_g": d.carbs_g,
                "fat_g": d.fat_g,
                "sodium_mg": d.sodium_mg,
                "fiber_g": d.fiber_g,
                "notes": _safe_str(d.notes, 200),
            }
            for d in diet_logs[:10]
        ],
        "active_supplements": [
            {
                "name": s.name,
                "dose": s.dose,
                "frequency": s.frequency,
                "notes": _safe_str(s.notes, 200),
            }
            for s in supplements
        ],
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="nutrition",
        analysis_id=analysis_id,
        title="Nutrition Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={
            "diet_log_count": len(diet_logs),
            "supplement_count": len(supplements),
        },
    )


NUTRITION_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Nutrition decision support for neuropsychiatric care. Cover:
energy intake adequacy, macronutrient balance (protein, carbs, fat),
sodium / fiber adequacy, micronutrient gaps inferable from food log
patterns, supplement-medication interaction risks. Flag deficient
intake (e.g., protein < 0.8 g/kg, fiber < 20 g/day) and supplement-drug
interaction risks (e.g., St. John's Wort + SSRI) as key findings.
"""


# ── Risk ─────────────────────────────────────────────────────────────────────


def load_risk(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id."""
    from app.persistence.models import (
        RiskStratificationResult,
        PatientRiskFormulation,
    )

    risks = (
        db.query(RiskStratificationResult)
        .filter_by(patient_id=analysis_id)
        .all()
    )
    formulation = (
        db.query(PatientRiskFormulation).filter_by(patient_id=analysis_id).first()
    )

    if not risks and not formulation:
        return None

    red_amber: list[str] = []
    risk_summary: list[dict[str, Any]] = []
    for r in risks:
        eff_level = r.override_level or r.level
        if eff_level in {"amber", "red"}:
            red_amber.append(f"{r.category}:{eff_level}")
        risk_summary.append(
            {
                "category": r.category,
                "level": eff_level,
                "raw_level": r.level,
                "confidence": r.confidence,
                "override": bool(r.override_level),
                "rationale": _safe_str(r.rationale, 400),
            }
        )

    features = {
        "risk_categories": risk_summary,
        "amber_red_categories": red_amber,
        "formulation": _trim_dict(
            _maybe_json(formulation.formulation_json) if formulation else None,
            max_keys=12,
        ),
        "safety_plan": _trim_dict(
            _maybe_json(formulation.safety_plan_json) if formulation else None,
            max_keys=12,
        ),
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="risk",
        analysis_id=analysis_id,
        title="Clinical Risk Decision Support",
        summary_features=features,
        flagged_conditions=red_amber,
        charts=[],
        metadata={"risk_count": len(risks)},
    )


RISK_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Clinical risk stratification (suicide risk, self-harm, harm to
others, mental crisis, seizure risk, implant risk, medication interaction,
allergy). RED-LEVEL RISKS must be the first finding with severity=critical.
Always recommend: clinician review, safety-plan update, MDT escalation
where appropriate. NEVER produce content that could be construed as
permission to reduce monitoring. The output is for the clinician — never
for the patient.
"""


# ── Digital Phenotyping ──────────────────────────────────────────────────────


def load_digital_phenotyping(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id."""
    from app.persistence.models import (
        DigitalPhenotypingPatientState,
        DigitalPhenotypingObservation,
    )

    state = (
        db.query(DigitalPhenotypingPatientState)
        .filter_by(patient_id=analysis_id)
        .first()
    )
    obs = (
        db.query(DigitalPhenotypingObservation)
        .filter_by(patient_id=analysis_id)
        .order_by(DigitalPhenotypingObservation.recorded_at.desc())
        .limit(60)
        .all()
    )
    if not state and not obs:
        return None

    by_kind: dict[str, list[dict[str, Any]]] = {}
    for o in obs:
        kind_list = by_kind.setdefault(o.kind, [])
        if len(kind_list) < 8:
            kind_list.append(
                {
                    "recorded_at": o.recorded_at.isoformat() if o.recorded_at else None,
                    "source": o.source,
                    "payload": _trim_dict(_maybe_json(o.payload_json), max_keys=8),
                }
            )

    features = {
        "domains_enabled": _trim_dict(
            _maybe_json(state.domains_enabled_json) if state else None
        ),
        "consent_scope_version": state.consent_scope_version if state else None,
        "observation_count": len(obs),
        "observations_by_kind": by_kind,
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="digital_phenotyping",
        analysis_id=analysis_id,
        title="Digital Phenotyping Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={"observation_count": len(obs)},
    )


DIGITAL_PHENOTYPING_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Digital phenotyping (passive + ecological-momentary data: mood
EMA, sleep, activity, social interaction estimates). Cover: trajectory
across enabled domains, consistency between self-report and device-
backfilled signals, missingness, EMA-flagged crisis indicators. Flag any
acute mood deterioration or sleep collapse as moderate-to-high severity.
Note self-report bias and device-coverage gaps in limitations.
"""


# ── DeepTwin ─────────────────────────────────────────────────────────────────


def load_deeptwin(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is a DeepTwinAnalysisRun id."""
    from app.persistence.models import DeepTwinAnalysisRun, DeepTwinSimulationRun

    run = db.query(DeepTwinAnalysisRun).filter_by(id=analysis_id).first()
    if not run:
        return None
    sims = (
        db.query(DeepTwinSimulationRun)
        .filter_by(patient_id=run.patient_id)
        .order_by(DeepTwinSimulationRun.created_at.desc())
        .limit(5)
        .all()
    )

    features = {
        "analysis_type": run.analysis_type,
        "input_sources": _trim_dict(_maybe_json(run.input_sources_json)),
        "output_summary": _trim_dict(_maybe_json(run.output_summary_json), max_keys=20),
        "limitations": _maybe_json(run.limitations_json) or [],
        "confidence": run.confidence,
        "model_name": run.model_name,
        "status": run.status,
        "recent_simulations": [
            {
                "proposed_protocol": _trim_dict(
                    _maybe_json(s.proposed_protocol_json), max_keys=8
                ),
                "predicted_direction": _trim_dict(
                    _maybe_json(s.predicted_direction_json), max_keys=8
                ),
                "confidence": s.confidence,
                "limitations": _safe_str(s.limitations, 400),
            }
            for s in sims
        ],
    }
    return AnalyzerPayload(
        patient_id=run.patient_id,
        analyzer_type="deeptwin",
        analysis_id=analysis_id,
        title="DeepTwin Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={
            "analysis_type": run.analysis_type,
            "model_name": run.model_name,
            "confidence": run.confidence,
        },
    )


DEEPTWIN_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: DeepTwin patient digital-twin analysis & simulation. Cover:
predicted trajectories, modality correlations, hypothesis confidence,
input-coverage limitations. For simulation runs, NEVER endorse a specific
protocol — describe predicted-direction signals only, with explicit
"requires clinician review" language. Highlight when input coverage is
sparse (limit confidence to 'low' if so).
"""


# ── Treatment Sessions ───────────────────────────────────────────────────────


def load_treatment_sessions(analysis_id: str, db: Any) -> Optional[AnalyzerPayload]:
    """analysis_id is patient_id."""
    from app.persistence.models import ClinicalSession, DeliveredSessionParameters

    sessions = (
        db.query(ClinicalSession)
        .filter_by(patient_id=analysis_id)
        .order_by(ClinicalSession.scheduled_at.desc())
        .limit(40)
        .all()
    )
    if not sessions:
        return None

    completed = [s for s in sessions if (s.status or "").lower() == "completed"]
    avg_tolerance = None
    tolerance_values = [
        getattr(s, "tolerance_score", None)
        for s in completed
        if getattr(s, "tolerance_score", None) is not None
    ]
    if tolerance_values:
        avg_tolerance = round(sum(tolerance_values) / len(tolerance_values), 2)

    features = {
        "total_sessions": len(sessions),
        "completed_sessions": len(completed),
        "avg_tolerance": avg_tolerance,
        "recent_sessions": [
            {
                "session_id": s.id[:8],
                "status": s.status,
                "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
                "tolerance_score": getattr(s, "tolerance_score", None),
                "post_session_notes": _safe_str(
                    getattr(s, "post_session_notes", None), 300
                ),
            }
            for s in sessions[:12]
        ],
    }
    return AnalyzerPayload(
        patient_id=analysis_id,
        analyzer_type="treatment_sessions",
        analysis_id=analysis_id,
        title="Treatment Sessions Decision Support",
        summary_features=features,
        flagged_conditions=[],
        charts=[],
        metadata={"session_count": len(sessions)},
    )


TREATMENT_SESSIONS_PROMPT = DECISION_SUPPORT_PREAMBLE + """
DOMAIN: Longitudinal review of delivered neuromodulation sessions. Cover:
adherence pattern, tolerability trends, deviations / cancellations, dosing
trajectory, and any post-session events. Flag deteriorating tolerance or
high cancellation rates. Suggest schedule / parameter review when
appropriate but never name specific parameter changes.
"""


# ── Registration ─────────────────────────────────────────────────────────────


def register_all(register: Any) -> None:
    """Called by ``analyzer_ai_report._register_default_analyzers``."""
    register(
        "mri",
        loader=load_mri,
        system_prompt=MRI_PROMPT,
        rag_modalities=["tms", "tdcs"],
    )
    register(
        "voice",
        loader=load_voice,
        system_prompt=VOICE_PROMPT,
        rag_modalities=[],
    )
    register(
        "video_assessment",
        loader=load_video_assessment,
        system_prompt=VIDEO_PROMPT,
        rag_modalities=[],
    )
    register(
        "movement",
        loader=load_movement,
        system_prompt=MOVEMENT_PROMPT,
        rag_modalities=[],
    )
    register(
        "phenotype",
        loader=load_phenotype,
        system_prompt=PHENOTYPE_PROMPT,
        rag_modalities=[],
    )
    register(
        "labs",
        loader=load_labs,
        system_prompt=LABS_PROMPT,
        rag_modalities=[],
    )
    register(
        "nutrition",
        loader=load_nutrition,
        system_prompt=NUTRITION_PROMPT,
        rag_modalities=[],
    )
    register(
        "risk",
        loader=load_risk,
        system_prompt=RISK_PROMPT,
        rag_modalities=[],
    )
    register(
        "digital_phenotyping",
        loader=load_digital_phenotyping,
        system_prompt=DIGITAL_PHENOTYPING_PROMPT,
        rag_modalities=[],
    )
    register(
        "deeptwin",
        loader=load_deeptwin,
        system_prompt=DEEPTWIN_PROMPT,
        rag_modalities=[],
    )
    register(
        "treatment_sessions",
        loader=load_treatment_sessions,
        system_prompt=TREATMENT_SESSIONS_PROMPT,
        rag_modalities=[],
    )

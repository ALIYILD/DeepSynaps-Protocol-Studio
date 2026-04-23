"""Risk Stratification Engine — 8-category traffic-light evaluator.

Computes per-patient, per-category risk levels (green/amber/red) by
aggregating patient data and cross-referencing condition-package
contraindications + literature evidence.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    IntakePacket,
    MedicationInteractionLog,
    Patient,
    PatientMedication,
    RiskStratificationAudit,
    RiskStratificationResult,
    WearableAlertFlag,
    WearableDailySummary,
)
from app.services.risk_evidence_map import (
    MAGNETIC_MODALITIES,
    RISK_CATEGORIES,
    RISK_CATEGORY_LABELS,
    RISK_EVIDENCE_MAP,
    SEIZURE_THRESHOLD_DRUGS,
)

log = logging.getLogger(__name__)

# ── Condition packages root ───────────────────────────────────────────────────
_CONDITIONS_DIR = Path(__file__).resolve().parents[4] / "data" / "conditions"


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class CategoryResult:
    level: str = "green"  # green | amber | red
    confidence: str = "no_data"  # high | medium | low | no_data
    rationale: str = ""
    data_sources: list[dict] = field(default_factory=list)
    evidence_refs: list[dict] = field(default_factory=list)


@dataclass
class PatientContext:
    """Pre-fetched bundle of all patient data needed for risk evaluation."""
    patient: Optional[dict] = None
    intake: Optional[dict] = None
    medications: list[dict] = field(default_factory=list)
    interaction_log: Optional[dict] = None
    assessments: list[dict] = field(default_factory=list)  # recent
    wearable_alerts: list[dict] = field(default_factory=list)
    wearable_summaries: list[dict] = field(default_factory=list)
    adverse_events: list[dict] = field(default_factory=list)
    condition_package: Optional[dict] = None
    active_modality: Optional[str] = None
    safety_flags: dict = field(default_factory=dict)  # from contraindication_screening_json


# ── Context assembly ──────────────────────────────────────────────────────────

def _row_to_dict(row: Any) -> dict:
    """Convert an ORM model instance to a plain dict."""
    if row is None:
        return {}
    d: dict = {}
    for c in row.__table__.columns:
        d[c.name] = getattr(row, c.name, None)
    return d


def assemble_patient_context(patient_id: str, db: Session) -> PatientContext:
    """Load all relevant data for a patient in bulk queries."""
    ctx = PatientContext()

    # Patient record
    patient = db.execute(select(Patient).where(Patient.id == patient_id)).scalar_one_or_none()
    if not patient:
        return ctx
    ctx.patient = _row_to_dict(patient)
    ctx.active_modality = (patient.primary_modality or "").lower().strip()

    # Intake packet (latest)
    intake = db.execute(
        select(IntakePacket)
        .where(IntakePacket.patient_id == patient_id)
        .order_by(IntakePacket.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if intake:
        ctx.intake = _row_to_dict(intake)
        try:
            ctx.safety_flags = json.loads(intake.contraindication_screening_json or "{}")
        except (json.JSONDecodeError, TypeError):
            ctx.safety_flags = {}

    # Active medications
    meds = db.execute(
        select(PatientMedication)
        .where(PatientMedication.patient_id == patient_id, PatientMedication.active.is_(True))
    ).scalars().all()
    ctx.medications = [_row_to_dict(m) for m in meds]

    # Latest medication interaction log
    interaction = db.execute(
        select(MedicationInteractionLog)
        .where(MedicationInteractionLog.patient_id == patient_id)
        .order_by(MedicationInteractionLog.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if interaction:
        ctx.interaction_log = _row_to_dict(interaction)

    # Recent assessments (last 20, covers all scales)
    assessments = db.execute(
        select(AssessmentRecord)
        .where(AssessmentRecord.patient_id == patient_id, AssessmentRecord.status == "completed")
        .order_by(AssessmentRecord.completed_at.desc())
        .limit(20)
    ).scalars().all()
    ctx.assessments = [_row_to_dict(a) for a in assessments]

    # Undismissed wearable alerts
    w_alerts = db.execute(
        select(WearableAlertFlag)
        .where(WearableAlertFlag.patient_id == patient_id, WearableAlertFlag.dismissed.is_(False))
    ).scalars().all()
    ctx.wearable_alerts = [_row_to_dict(a) for a in w_alerts]

    # Wearable daily summaries (last 14 days)
    w_summaries = db.execute(
        select(WearableDailySummary)
        .where(WearableDailySummary.patient_id == patient_id)
        .order_by(WearableDailySummary.date.desc())
        .limit(14)
    ).scalars().all()
    ctx.wearable_summaries = [_row_to_dict(s) for s in w_summaries]

    # Unresolved adverse events
    ae = db.execute(
        select(AdverseEvent)
        .where(AdverseEvent.patient_id == patient_id, AdverseEvent.resolved_at.is_(None))
    ).scalars().all()
    ctx.adverse_events = [_row_to_dict(e) for e in ae]

    # Condition package
    ctx.condition_package = _load_condition_package(ctx.patient.get("primary_condition"))

    return ctx


def _load_condition_package(condition_slug: Optional[str]) -> Optional[dict]:
    """Load a condition package JSON from data/conditions/."""
    if not condition_slug:
        return None
    slug = condition_slug.lower().replace(" ", "-").replace("_", "-")
    candidate = _CONDITIONS_DIR / f"{slug}.json"
    if candidate.exists():
        try:
            return json.loads(candidate.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    # Try all files in directory for a match
    if _CONDITIONS_DIR.exists():
        for p in _CONDITIONS_DIR.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                pkg_slug = data.get("condition", {}).get("slug", "")
                if pkg_slug and pkg_slug.lower() == slug:
                    return data
            except (json.JSONDecodeError, OSError):
                continue
    return None


# ── Helper: extract assessment items ──────────────────────────────────────────

def _get_latest_assessment(ctx: PatientContext, template_prefix: str) -> Optional[dict]:
    """Return the most recent completed assessment matching a template_id prefix."""
    for a in ctx.assessments:
        tid = (a.get("template_id") or "").lower()
        if tid.startswith(template_prefix.lower()):
            return a
    return None


def _get_assessment_item(assessment: Optional[dict], item_key: str) -> Optional[int]:
    """Extract a specific item response from an assessment's items_json."""
    if not assessment:
        return None
    items_raw = assessment.get("items_json")
    if not items_raw:
        return None
    try:
        items = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
        val = items.get(item_key)
        return int(val) if val is not None else None
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


def _get_score_numeric(assessment: Optional[dict]) -> Optional[float]:
    """Extract the numeric score from an assessment."""
    if not assessment:
        return None
    v = assessment.get("score_numeric")
    if v is not None:
        try:
            return float(v)
        except (TypeError, ValueError):
            pass
    v = assessment.get("score")
    if v is not None:
        try:
            return float(v)
        except (TypeError, ValueError):
            pass
    return None


def _text_contains_keywords(text: Optional[str], keywords: list[str]) -> bool:
    """Case-insensitive keyword scan in free text."""
    if not text:
        return False
    lower = text.lower()
    return any(kw.lower() in lower for kw in keywords)


# ── Cross-reference evidence from condition packages ──────────────────────────

def _cross_reference_evidence(ctx: PatientContext, category: str) -> list[dict]:
    """Extract relevant contraindication evidence from the condition package."""
    refs: list[dict] = []
    pkg = ctx.condition_package
    if not pkg:
        return refs

    emap = RISK_EVIDENCE_MAP.get(category, {})
    keyword_filters = emap.get("keyword_filters", [])

    for path in emap.get("condition_package_paths", []):
        parts = path.split(".")
        node: Any = pkg
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                node = None
                break
        if node is None:
            continue

        # Absolute/relative contraindications are lists of dicts
        if isinstance(node, list):
            for item in node:
                text = item.get("condition", "") if isinstance(item, dict) else str(item)
                if any(kw.lower() in text.lower() for kw in keyword_filters):
                    refs.append({
                        "source": "condition_package",
                        "path": path,
                        "text": text,
                        "rationale": item.get("rationale", "") if isinstance(item, dict) else "",
                        "mitigation": item.get("mitigation", "") if isinstance(item, dict) else "",
                    })
        # Modality-specific is a dict of lists
        elif isinstance(node, dict):
            modality = ctx.active_modality
            for mod_key, items in node.items():
                if modality and mod_key.lower() != modality:
                    continue
                if isinstance(items, list):
                    for text in items:
                        if any(kw.lower() in str(text).lower() for kw in keyword_filters):
                            refs.append({
                                "source": "condition_package",
                                "path": f"{path}.{mod_key}",
                                "text": str(text),
                            })

    return refs


# ── 8 Category Evaluators ─────────────────────────────────────────────────────

def _evaluate_allergy(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []
    allergies_text = (ctx.intake or {}).get("allergies", "") or ""
    med_names = [m.get("name", "").lower() for m in ctx.medications]
    med_names += [m.get("generic_name", "").lower() for m in ctx.medications if m.get("generic_name")]

    if not allergies_text.strip():
        r.level = "green"
        r.confidence = "low"
        r.rationale = "No allergy data documented in intake packet."
        return r

    sources.append({"type": "intake", "field": "allergies", "value": allergies_text[:200]})

    # Check if any active medication name appears in allergy text
    allergy_lower = allergies_text.lower()
    conflict_meds = [m for m in med_names if m and m in allergy_lower]
    if conflict_meds:
        r.level = "red"
        r.confidence = "high"
        r.rationale = f"Active medication(s) match documented allergy: {', '.join(conflict_meds)}."
        sources.append({"type": "medication_conflict", "medications": conflict_meds})
    else:
        r.level = "amber" if allergies_text.strip() else "green"
        r.confidence = "medium"
        r.rationale = "Allergies documented; no conflict with current medications." if allergies_text.strip() else "No allergies documented."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "allergy")
    return r


def _evaluate_suicide_risk(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []

    # C-SSRS
    cssrs = _get_latest_assessment(ctx, "c-ssrs")
    cssrs_score = _get_score_numeric(cssrs)

    # PHQ-9 item 9
    phq9 = _get_latest_assessment(ctx, "phq-9")
    phq9_item9 = _get_assessment_item(phq9, "item_9") or _get_assessment_item(phq9, "q9") or _get_assessment_item(phq9, "9")

    # Safety flags
    unstable_psych = ctx.safety_flags.get("unstable_psych", False)

    # Psychiatric history keyword scan
    psych_history = (ctx.intake or {}).get("psychiatric_history", "") or ""
    history_keywords = _text_contains_keywords(psych_history, ["suicid", "suicide attempt", "overdose", "self-harm"])

    if cssrs:
        sources.append({"type": "assessment", "template_id": "c-ssrs", "score": cssrs_score})
    if phq9:
        sources.append({"type": "assessment", "template_id": "phq-9", "item_9": phq9_item9})
    if unstable_psych:
        sources.append({"type": "safety_flag", "flag": "unstable_psych"})

    # RED conditions
    if (cssrs_score is not None and cssrs_score >= 4) or \
       (phq9_item9 is not None and phq9_item9 >= 2) or \
       unstable_psych:
        r.level = "red"
        r.confidence = "high"
        reasons = []
        if cssrs_score is not None and cssrs_score >= 4:
            reasons.append(f"C-SSRS score {cssrs_score} (suicidal behavior/plan)")
        if phq9_item9 is not None and phq9_item9 >= 2:
            reasons.append(f"PHQ-9 item 9 = {phq9_item9} (frequent suicidal thoughts)")
        if unstable_psych:
            reasons.append("Acute suicidality safety flag active")
        r.rationale = "HIGH RISK: " + "; ".join(reasons) + ". Initiate crisis protocol."
    # AMBER conditions
    elif (cssrs_score is not None and cssrs_score >= 2) or \
         (phq9_item9 is not None and phq9_item9 == 1) or \
         history_keywords:
        r.level = "amber"
        r.confidence = "medium"
        reasons = []
        if cssrs_score is not None and cssrs_score >= 2:
            reasons.append(f"C-SSRS score {cssrs_score} (active ideation)")
        if phq9_item9 is not None and phq9_item9 == 1:
            reasons.append("PHQ-9 item 9 = 1 (passive suicidal thoughts)")
        if history_keywords:
            reasons.append("Historical suicidality in psychiatric history")
        r.rationale = "MODERATE RISK: " + "; ".join(reasons) + ". Monitor closely."
    # GREEN
    else:
        has_data = cssrs is not None or phq9 is not None
        r.level = "green"
        r.confidence = "high" if has_data else "no_data"
        r.rationale = "No current suicidal risk indicators." if has_data else "No suicide risk screening data available."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "suicide_risk")
    return r


def _evaluate_mental_crisis(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []
    crisis_signals = 0

    # Wearable alerts — symptom_worsening or presession_concern
    urgent_alerts = [a for a in ctx.wearable_alerts if a.get("severity") == "urgent"]
    symptom_alerts = [a for a in ctx.wearable_alerts if a.get("flag_type") in ("symptom_worsening", "presession_concern")]
    if urgent_alerts:
        crisis_signals += 2
        sources.append({"type": "wearable_alert", "count": len(urgent_alerts), "severity": "urgent"})
    if symptom_alerts:
        crisis_signals += 1
        sources.append({"type": "wearable_alert", "flag_types": [a.get("flag_type") for a in symptom_alerts]})

    # Wearable daily summary — declining mood
    if ctx.wearable_summaries:
        latest = ctx.wearable_summaries[0]
        mood = latest.get("mood_score")
        anxiety = latest.get("anxiety_score")
        if mood is not None and mood <= 2:
            crisis_signals += 1
            sources.append({"type": "wearable_summary", "mood_score": mood})
        if anxiety is not None and anxiety >= 8:
            crisis_signals += 1
            sources.append({"type": "wearable_summary", "anxiety_score": anxiety})

    # Assessment severity — any critical assessment
    critical_assessments = [a for a in ctx.assessments if (a.get("severity") or "").lower() == "critical"]
    if critical_assessments:
        crisis_signals += 2
        sources.append({"type": "assessment", "severity": "critical", "count": len(critical_assessments)})

    # Unresolved adverse events
    serious_ae = [e for e in ctx.adverse_events if (e.get("severity") or "").lower() in ("serious", "critical")]
    if serious_ae:
        crisis_signals += 2
        sources.append({"type": "adverse_event", "severity": "serious/critical", "count": len(serious_ae)})

    if crisis_signals >= 3:
        r.level = "red"
        r.confidence = "high" if sources else "medium"
        r.rationale = f"CRISIS INDICATORS: {crisis_signals} signals detected — urgent wearable alerts, critical assessments, or serious adverse events."
    elif crisis_signals >= 1:
        r.level = "amber"
        r.confidence = "medium"
        r.rationale = f"Elevated concern: {crisis_signals} warning signal(s) from monitoring data."
    else:
        has_data = bool(ctx.wearable_summaries or ctx.wearable_alerts or ctx.assessments)
        r.level = "green"
        r.confidence = "high" if has_data else "no_data"
        r.rationale = "No crisis indicators detected." if has_data else "No real-time monitoring data available."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "mental_crisis")
    return r


def _evaluate_self_harm(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []

    # PHQ-9 item 9
    phq9 = _get_latest_assessment(ctx, "phq-9")
    phq9_item9 = _get_assessment_item(phq9, "item_9") or _get_assessment_item(phq9, "q9") or _get_assessment_item(phq9, "9")

    # C-SSRS
    cssrs = _get_latest_assessment(ctx, "c-ssrs")
    cssrs_score = _get_score_numeric(cssrs)

    # Psychiatric history keyword scan
    psych_history = (ctx.intake or {}).get("psychiatric_history", "") or ""
    sh_keywords = ["self-harm", "self harm", "nssi", "cutting", "burning", "self-injur"]
    history_match = _text_contains_keywords(psych_history, sh_keywords)

    if phq9_item9 is not None:
        sources.append({"type": "assessment", "template_id": "phq-9", "item_9": phq9_item9})
    if cssrs_score is not None:
        sources.append({"type": "assessment", "template_id": "c-ssrs", "score": cssrs_score})
    if history_match:
        sources.append({"type": "intake", "field": "psychiatric_history", "keyword_match": True})

    # RED: active self-harm indicators
    if (phq9_item9 is not None and phq9_item9 >= 2) or (cssrs_score is not None and cssrs_score >= 3):
        r.level = "red"
        r.confidence = "high"
        r.rationale = "Active self-harm risk indicators in recent assessments."
    # AMBER: historical or borderline
    elif (phq9_item9 is not None and phq9_item9 == 1) or (cssrs_score is not None and cssrs_score >= 1) or history_match:
        r.level = "amber"
        r.confidence = "medium"
        r.rationale = "Historical or borderline self-harm indicators present."
    else:
        has_data = phq9 is not None or cssrs is not None or (ctx.intake is not None)
        r.level = "green"
        r.confidence = "high" if has_data else "no_data"
        r.rationale = "No self-harm risk indicators." if has_data else "No screening data available."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "self_harm")
    return r


def _evaluate_harm_to_others(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []

    psych_history = (ctx.intake or {}).get("psychiatric_history", "") or ""
    medical_history = (ctx.intake or {}).get("medical_history", "") or ""
    combined = psych_history + " " + medical_history

    violence_keywords = ["violence", "violent", "aggression", "aggressive", "harm to others",
                         "homicid", "assault", "threatening", "involuntary commitment", "danger to others"]
    active_keywords = ["current", "active", "recent", "ongoing", "present"]

    keyword_match = _text_contains_keywords(combined, violence_keywords)
    active_match = keyword_match and _text_contains_keywords(combined, active_keywords)

    # Adverse events with aggression
    aggression_ae = [e for e in ctx.adverse_events if _text_contains_keywords(e.get("event_type", ""), violence_keywords)]

    if keyword_match:
        sources.append({"type": "intake", "field": "psychiatric_history", "keyword_match": True})
    if aggression_ae:
        sources.append({"type": "adverse_event", "count": len(aggression_ae)})

    if active_match or aggression_ae:
        r.level = "red"
        r.confidence = "medium"
        r.rationale = "Active risk indicators for harm to others detected."
    elif keyword_match:
        r.level = "amber"
        r.confidence = "low"
        r.rationale = "Historical risk factors for harm to others in clinical history."
    else:
        has_data = bool(ctx.intake)
        r.level = "green"
        r.confidence = "medium" if has_data else "no_data"
        r.rationale = "No indicators for risk of harm to others." if has_data else "No clinical history data available."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "harm_to_others")
    return r


def _evaluate_seizure_risk(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []

    modality = ctx.active_modality
    is_magnetic = modality in MAGNETIC_MODALITIES

    # Safety flags
    seizure_flag = ctx.safety_flags.get("seizure_history", False)
    threshold_meds_flag = ctx.safety_flags.get("lower_threshold_meds", False)

    if seizure_flag:
        sources.append({"type": "safety_flag", "flag": "seizure_history"})
    if threshold_meds_flag:
        sources.append({"type": "safety_flag", "flag": "lower_threshold_meds"})

    # Check active medications for seizure-threshold-lowering drugs
    med_names = [(m.get("generic_name") or m.get("name") or "").lower() for m in ctx.medications]
    threshold_meds = [m for m in med_names if any(drug in m for drug in SEIZURE_THRESHOLD_DRUGS)]
    if threshold_meds:
        sources.append({"type": "medications", "threshold_lowering": threshold_meds})

    # Medical history keywords
    med_history = (ctx.intake or {}).get("medical_history", "") or ""
    seizure_in_history = _text_contains_keywords(med_history, ["seizure", "epilepsy", "convulsion"])
    if seizure_in_history:
        sources.append({"type": "intake", "field": "medical_history", "keyword_match": True})

    # Adverse events with seizure
    seizure_ae = [e for e in ctx.adverse_events if _text_contains_keywords(e.get("event_type", ""), ["seizure", "convulsion"])]
    if seizure_ae:
        sources.append({"type": "adverse_event", "event_type": "seizure", "count": len(seizure_ae)})

    has_seizure_risk = seizure_flag or seizure_in_history or seizure_ae
    has_threshold_risk = threshold_meds_flag or bool(threshold_meds)

    if has_seizure_risk and is_magnetic:
        r.level = "red"
        r.confidence = "high"
        r.rationale = f"Active seizure risk with magnetic modality ({modality}). Absolute contraindication per condition package."
    elif seizure_ae:
        r.level = "red"
        r.confidence = "high"
        r.rationale = "Unresolved seizure adverse event during treatment."
    elif has_seizure_risk:
        r.level = "amber"
        r.confidence = "high"
        r.rationale = "Seizure history documented. Requires neurologist clearance and conservative parameters."
    elif has_threshold_risk and is_magnetic:
        r.level = "amber"
        r.confidence = "high"
        r.rationale = f"Seizure-threshold-lowering medication(s) ({', '.join(threshold_meds or ['flagged'])}) with magnetic modality."
    elif has_threshold_risk:
        r.level = "amber"
        r.confidence = "medium"
        r.rationale = f"Seizure-threshold-lowering medication(s) detected: {', '.join(threshold_meds or ['flagged'])}."
    else:
        has_data = bool(ctx.intake or ctx.medications or ctx.safety_flags)
        r.level = "green"
        r.confidence = "high" if has_data else "no_data"
        r.rationale = "No seizure risk factors identified." if has_data else "No screening data available."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "seizure_risk")
    return r


def _evaluate_implant_risk(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []

    modality = ctx.active_modality
    is_magnetic = modality in MAGNETIC_MODALITIES

    implanted_device = ctx.safety_flags.get("implanted_device", False)
    intracranial_metal = ctx.safety_flags.get("intracranial_metal", False)
    skull_defect = ctx.safety_flags.get("severe_skull_defect", False)

    if implanted_device:
        sources.append({"type": "safety_flag", "flag": "implanted_device"})
    if intracranial_metal:
        sources.append({"type": "safety_flag", "flag": "intracranial_metal"})
    if skull_defect:
        sources.append({"type": "safety_flag", "flag": "severe_skull_defect"})

    # Medical history keywords
    med_history = (ctx.intake or {}).get("medical_history", "") or ""
    implant_keywords = ["implant", "pacemaker", "cochlear", "metal", "stent", "clip", "shrapnel", "piercing"]
    implant_in_history = _text_contains_keywords(med_history, implant_keywords)
    if implant_in_history and not (implanted_device or intracranial_metal):
        sources.append({"type": "intake", "field": "medical_history", "keyword_match": True})

    has_implant = implanted_device or intracranial_metal
    has_any_flag = has_implant or skull_defect or implant_in_history

    if has_implant and is_magnetic:
        r.level = "red"
        r.confidence = "high"
        r.rationale = f"Metallic implant/device with magnetic modality ({modality}). Absolute contraindication."
    elif intracranial_metal:
        r.level = "red"
        r.confidence = "high"
        r.rationale = "Intracranial metal documented. Contraindicated for most brain stimulation modalities."
    elif has_any_flag and is_magnetic:
        r.level = "amber"
        r.confidence = "medium"
        r.rationale = "Potential implant/metal risk factors with magnetic modality. Verify screening."
    elif has_any_flag:
        r.level = "amber"
        r.confidence = "medium"
        r.rationale = "Implant/metal risk factors documented. Non-magnetic modality reduces risk."
    else:
        has_data = bool(ctx.intake or ctx.safety_flags)
        r.level = "green"
        r.confidence = "high" if has_data else "no_data"
        r.rationale = "No implant or metallic device risk factors." if has_data else "No screening data available."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "implant_risk")
    return r


def _evaluate_medication_interaction(ctx: PatientContext) -> CategoryResult:
    r = CategoryResult()
    sources: list[dict] = []

    if not ctx.medications:
        r.level = "green"
        r.confidence = "no_data"
        r.rationale = "No active medications on record."
        return r

    sources.append({"type": "medications", "count": len(ctx.medications)})

    # Check interaction log
    severity = None
    if ctx.interaction_log:
        severity = (ctx.interaction_log.get("severity_summary") or "").lower()
        sources.append({"type": "interaction_log", "severity": severity})

    # Check for seizure-threshold-lowering meds (relevant if on stimulation)
    med_names = [(m.get("generic_name") or m.get("name") or "").lower() for m in ctx.medications]
    threshold_meds = [m for m in med_names if any(drug in m for drug in SEIZURE_THRESHOLD_DRUGS)]
    if threshold_meds:
        sources.append({"type": "threshold_medications", "medications": threshold_meds})

    if severity == "severe":
        r.level = "red"
        r.confidence = "high"
        r.rationale = "Severe medication interaction detected in interaction check."
    elif severity == "moderate" or threshold_meds:
        r.level = "amber"
        r.confidence = "high" if severity else "medium"
        parts = []
        if severity == "moderate":
            parts.append("Moderate medication interaction detected")
        if threshold_meds:
            parts.append(f"Seizure-threshold-lowering medication(s): {', '.join(threshold_meds)}")
        r.rationale = ". ".join(parts) + "."
    elif severity in ("mild", "none", ""):
        r.level = "green"
        r.confidence = "high"
        r.rationale = "No significant medication interactions detected."
    else:
        r.level = "green"
        r.confidence = "medium"
        r.rationale = "Active medications present. No interaction check performed yet."

    r.data_sources = sources
    r.evidence_refs = _cross_reference_evidence(ctx, "medication_interaction")
    return r


# ── Evaluator dispatch ────────────────────────────────────────────────────────

_EVALUATORS: dict[str, Any] = {
    "allergy": _evaluate_allergy,
    "suicide_risk": _evaluate_suicide_risk,
    "mental_crisis": _evaluate_mental_crisis,
    "self_harm": _evaluate_self_harm,
    "harm_to_others": _evaluate_harm_to_others,
    "seizure_risk": _evaluate_seizure_risk,
    "implant_risk": _evaluate_implant_risk,
    "medication_interaction": _evaluate_medication_interaction,
}


# ── Main compute & persist ────────────────────────────────────────────────────

def compute_risk_profile(patient_id: str, db: Session, clinician_id: Optional[str] = None) -> list[dict]:
    """Compute all 8 risk categories for a patient and persist results.

    Returns a list of dicts (one per category) suitable for API response.
    """
    return recompute_categories(
        patient_id=patient_id,
        categories=RISK_CATEGORIES,
        trigger="full_compute",
        actor_id=clinician_id,
        db=db,
    )


def recompute_categories(
    patient_id: str,
    categories: list[str],
    trigger: str,
    actor_id: Optional[str],
    db: Session,
) -> list[dict]:
    """Recompute specific risk categories and upsert results.

    Called after data mutations or on explicit recompute requests.
    """
    ctx = assemble_patient_context(patient_id, db)
    if not ctx.patient:
        return []

    now = datetime.now(timezone.utc)
    results: list[dict] = []

    for cat in categories:
        evaluator = _EVALUATORS.get(cat)
        if not evaluator:
            continue

        try:
            result = evaluator(ctx)
        except Exception:
            log.exception("Risk evaluator failed for patient=%s category=%s", patient_id, cat)
            result = CategoryResult(
                level="amber",
                confidence="low",
                rationale=f"Evaluation error for {RISK_CATEGORY_LABELS.get(cat, cat)}. Manual review required.",
            )

        # Upsert the result row
        existing = db.execute(
            select(RiskStratificationResult).where(
                RiskStratificationResult.patient_id == patient_id,
                RiskStratificationResult.category == cat,
            )
        ).scalar_one_or_none()

        previous_level = existing.level if existing else None

        if existing:
            existing.level = result.level
            existing.confidence = result.confidence
            existing.rationale = result.rationale
            existing.data_sources_json = json.dumps(result.data_sources)
            existing.evidence_refs_json = json.dumps(result.evidence_refs)
            existing.clinician_id = actor_id
            existing.computed_at = now
            existing.updated_at = now
        else:
            existing = RiskStratificationResult(
                id=str(uuid.uuid4()),
                patient_id=patient_id,
                clinician_id=actor_id,
                category=cat,
                level=result.level,
                confidence=result.confidence,
                rationale=result.rationale,
                data_sources_json=json.dumps(result.data_sources),
                evidence_refs_json=json.dumps(result.evidence_refs),
                computed_at=now,
            )
            db.add(existing)

        # Write audit row if level changed
        if previous_level is not None and previous_level != result.level:
            db.add(RiskStratificationAudit(
                id=str(uuid.uuid4()),
                patient_id=patient_id,
                category=cat,
                previous_level=previous_level,
                new_level=result.level,
                trigger=trigger,
                actor_id=actor_id,
            ))

        # Build response dict
        effective_level = existing.override_level if existing.override_level else result.level
        results.append({
            "category": cat,
            "label": RISK_CATEGORY_LABELS.get(cat, cat),
            "level": effective_level,
            "computed_level": result.level,
            "override_level": existing.override_level,
            "confidence": result.confidence,
            "rationale": result.rationale,
            "data_sources": result.data_sources,
            "evidence_refs": result.evidence_refs,
            "override_by": existing.override_by,
            "override_at": existing.override_at.isoformat() if existing.override_at else None,
            "override_reason": existing.override_reason,
        })

    db.commit()
    return results

"""Assemble unified Risk Analyzer workspace payload — decision-support only.

Operational stratification categories come from ``risk_stratification``.
Prediction cards use transparent rule-based indices separate from traffic lights.
Literature panels use ``evidence_intelligence.query_evidence`` against the evidence corpus (evidence.db).
"""
from __future__ import annotations

import json
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import (
    PatientRiskFormulation,
    RiskAnalyzerAudit,
    RiskStratificationResult,
)
from app.services.risk_clinical_scores import build_all_clinical_scores
from app.services.risk_evidence_map import RISK_CATEGORY_LABELS
from app.services.evidence_intelligence import EvidenceFeatureSummary, EvidenceQuery, EvidenceResult, query_evidence
from app.services.risk_stratification import (
    PatientContext,
    assemble_patient_context,
    compute_risk_profile,
)


SCHEMA_VERSION = "1.1.0"
ASSEMBLER_VERSION = "risk_analyzer_v2_medrag"

log = logging.getLogger(__name__)

# Risk category → evidence_intelligence TARGET_CONCEPTS key (corpus retrieval)
RISK_LITERATURE_TARGETS: dict[str, str] = {
    "suicide_risk": "suicide_self_harm_risk",
    "self_harm": "self_harm_nssi_risk",
    "mental_crisis": "mental_crisis_acute",
    "harm_to_others": "harm_to_others_violence",
    "seizure_risk": "seizure_stimulation_safety",
    "implant_risk": "implant_device_safety",
    "medication_interaction": "medication_interaction_safety",
    "allergy": "allergy_medication_safety",
}


def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    ez = math.exp(x)
    return ez / (1.0 + ez)


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _latest_assessment(ctx: PatientContext, prefix: str) -> Optional[dict]:
    pfx = prefix.lower()
    for a in ctx.assessments or []:
        tid = (a.get("template_id") or "").lower()
        if tid.startswith(pfx):
            return a
    return None


def _get_items(assessment: Optional[dict]) -> dict:
    if not assessment:
        return {}
    raw = assessment.get("items_json")
    if not raw:
        return {}
    try:
        return json.loads(raw) if isinstance(raw, str) else dict(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _norm_cond(slug: Optional[str]) -> str:
    if not slug:
        return ""
    return str(slug).lower().replace(" ", "-").replace("_", "-")


def _build_literature_feature_summary(ctx: PatientContext) -> list[EvidenceFeatureSummary]:
    """Narrow MedRAG-style query with patient course + condition when available."""
    p = ctx.patient or {}
    out: list[EvidenceFeatureSummary] = []
    cond = (p.get("primary_condition") or p.get("primaryCondition") or "") or ""
    if cond:
        out.append(EvidenceFeatureSummary(name="primary_condition", value=cond, modality="patient", direction="context"))
    mod = (p.get("primary_modality") or "") or ""
    if mod:
        out.append(EvidenceFeatureSummary(name="primary_modality", value=mod, modality="neuromodulation", direction="context"))
    if ctx.active_modality:
        out.append(EvidenceFeatureSummary(name="active_modality", value=ctx.active_modality, modality="neuromodulation", direction="context"))
    return out


def _evidence_result_to_corpus_block(result: EvidenceResult) -> dict:
    """Serialize EvidenceResult to JSON-friendly dict (top papers + claim)."""
    sp = []
    for p in (getattr(result, "supporting_papers", None) or [])[:5]:
        d = p.model_dump(mode="json") if hasattr(p, "model_dump") else dict(p)
        # trim long fields for payload size
        if d.get("abstract_snippet") and len(str(d["abstract_snippet"])) > 400:
            d["abstract_snippet"] = str(d["abstract_snippet"])[:400] + "…"
        sp.append(d)
    prov = getattr(result, "provenance", None)
    prov_d = prov.model_dump(mode="json") if prov is not None and hasattr(prov, "model_dump") else {}
    return {
        "finding_id": getattr(result, "finding_id", None),
        "target_name": getattr(result, "target_name", None),
        "claim": getattr(result, "claim", None),
        "literature_summary": getattr(result, "literature_summary", None),
        "recommended_caution": getattr(result, "recommended_caution", None),
        "evidence_strength": getattr(result, "evidence_strength", None),
        "confidence_score": getattr(result, "confidence_score", None),
        "top_papers": sp,
        "conflicting_count": len(getattr(result, "conflicting_papers", None) or []),
        "provenance": prov_d,
    }


def _attach_prediction_corpus(
    card: dict,
    patient_id: str,
    ctx: PatientContext,
    db: Session,
    target_key: str,
) -> dict:
    """Add MedRAG-style top papers to prediction support cards."""
    out = {**card, "corpus_literature": {"enabled": True, "target_key": target_key, "error": None, "result": None}}
    try:
        feat = _build_literature_feature_summary(ctx)
        cond_slug = _norm_cond((ctx.patient or {}).get("primary_condition"))
        diagnosis_filters = [cond_slug] if cond_slug else []
        q = EvidenceQuery(
            patient_id=patient_id,
            context_type="prediction",
            target_name=target_key,
            modality_filters=[(ctx.active_modality or "").lower()] if ctx.active_modality else [],
            diagnosis_filters=diagnosis_filters[:3],
            intervention_filters=[],
            feature_summary=feat,
            max_results=5,
            include_counter_evidence=True,
        )
        ev_res = query_evidence(q, db)
        out["corpus_literature"]["result"] = _evidence_result_to_corpus_block(ev_res)
    except Exception as ex:
        log.warning("Prediction corpus retrieval failed for %s: %s", target_key, ex)
        out["corpus_literature"]["error"] = "literature_retrieval_failed"
    return out


def _enrich_snapshots_with_corpus(
    snap_rows: list[dict],
    patient_id: str,
    ctx: PatientContext,
    db: Session,
) -> list[dict]:
    feat = _build_literature_feature_summary(ctx)
    cond_slug = _norm_cond((ctx.patient or {}).get("primary_condition"))
    diagnosis_filters = [cond_slug] if cond_slug else []

    enriched = []
    for row in snap_rows:
        cat = row.get("category") or ""
        target_key = RISK_LITERATURE_TARGETS.get(cat)
        corpus_block: dict[str, Any] = {
            "enabled": bool(target_key),
            "target_key": target_key,
            "error": None,
            "result": None,
        }
        if target_key:
            try:
                q = EvidenceQuery(
                    patient_id=patient_id,
                    context_type="risk_score",
                    target_name=target_key,
                    modality_filters=[(ctx.active_modality or "").lower()] if ctx.active_modality else [],
                    diagnosis_filters=diagnosis_filters[:3],
                    intervention_filters=[],
                    feature_summary=feat,
                    max_results=5,
                    include_counter_evidence=True,
                )
                ev_res = query_evidence(q, db)
                corpus_block["result"] = _evidence_result_to_corpus_block(ev_res)
                corpus_block["corpus"] = (corpus_block["result"].get("provenance") or {}).get("corpus", "unknown")
            except Exception as ex:
                log.warning("Corpus retrieval failed for %s: %s", cat, ex)
                corpus_block["error"] = "literature_retrieval_failed"
        enriched.append({**row, "corpus_literature": corpus_block})
    return enriched


def _category_snapshot_rows(db: Session, patient_id: str) -> list[dict]:
    rows = db.execute(
        select(RiskStratificationResult).where(RiskStratificationResult.patient_id == patient_id)
    ).scalars().all()
    out = []
    for row in rows:
        effective = row.override_level or row.level
        ds = json.loads(row.data_sources_json or "[]")
        er = json.loads(row.evidence_refs_json or "[]")
        out.append({
            "category": row.category,
            "label": RISK_CATEGORY_LABELS.get(row.category, row.category),
            "level": effective,
            "computed_level": row.level,
            "override_level": row.override_level,
            "confidence": row.confidence,
            "rationale": row.rationale,
            "computed_at": row.computed_at.isoformat() if row.computed_at else None,
            "data_sources": ds,
            "evidence_refs": er,
            "override_by": row.override_by,
            "override_at": row.override_at.isoformat() if row.override_at else None,
            "override_reason": row.override_reason,
            "provenance": {"engine": "risk_stratification", "engine_version": "rules_v1"},
        })
    return out


def _build_evidence_timeline(ctx: PatientContext, patient_id: str) -> list[dict]:
    items: list[dict] = []

    phq9 = _latest_assessment(ctx, "phq-9")
    if phq9:
        its = _get_items(phq9)
        i9 = its.get("item_9")
        if i9 is None:
            i9 = its.get("q9")
        if i9 is None:
            i9 = its.get("9")
        items.append({
            "id": f"ev-phq9-{phq9.get('id', 'latest')}",
            "kind": "phq9_item9",
            "label": "PHQ-9 item 9 (self-harm thoughts)",
            "value_display": str(i9) if i9 is not None else "—",
            "raw_value": {"item_9": i9, "template_id": phq9.get("template_id")},
            "observed_at": phq9.get("completed_at"),
            "recorded_at": phq9.get("completed_at"),
            "provenance": {"table": "assessment_records", "record_id": phq9.get("id")},
        })

    cssrs = _latest_assessment(ctx, "c-ssrs")
    if cssrs:
        items.append({
            "id": f"ev-cssrs-{cssrs.get('id', 'latest')}",
            "kind": "cssrs",
            "label": "Columbia Suicide Severity Rating Scale",
            "value_display": str(cssrs.get("score_numeric") if cssrs.get("score_numeric") is not None else cssrs.get("score") or "—"),
            "raw_value": {"score": cssrs.get("score_numeric"), "template_id": cssrs.get("template_id")},
            "observed_at": cssrs.get("completed_at"),
            "recorded_at": cssrs.get("completed_at"),
            "provenance": {"table": "assessment_records", "record_id": cssrs.get("id")},
        })

    for a in (ctx.assessments or [])[:12]:
        tid = (a.get("template_id") or "").lower()
        if tid.startswith("phq-9") or tid.startswith("c-ssrs"):
            continue
        items.append({
            "id": f"ev-asmt-{a.get('id')}",
            "kind": "assessment",
            "label": a.get("template_title") or a.get("template_id") or "Assessment",
            "value_display": str(a.get("score_numeric") if a.get("score_numeric") is not None else a.get("score") or "—"),
            "raw_value": {"template_id": a.get("template_id")},
            "observed_at": a.get("completed_at"),
            "recorded_at": a.get("completed_at"),
            "provenance": {"table": "assessment_records", "record_id": a.get("id")},
        })

    for e in ctx.adverse_events or []:
        items.append({
            "id": f"ev-ae-{e.get('id')}",
            "kind": "ae",
            "label": f"Adverse event: {e.get('event_type') or 'event'}",
            "value_display": (e.get("severity") or "") + (f" · {e.get('description', '')[:80]}" if e.get("description") else ""),
            "raw_value": {"severity": e.get("severity")},
            "observed_at": e.get("occurred_at") or e.get("created_at"),
            "recorded_at": e.get("created_at"),
            "provenance": {"table": "adverse_events", "record_id": e.get("id")},
        })

    for m in ctx.medications or []:
        items.append({
            "id": f"ev-med-{m.get('id')}",
            "kind": "medication",
            "label": f"Medication: {m.get('name') or m.get('generic_name') or '—'}",
            "value_display": "active" if m.get("active") else "inactive",
            "raw_value": {"name": m.get("name"), "generic_name": m.get("generic_name")},
            "observed_at": None,
            "recorded_at": m.get("updated_at") or m.get("created_at"),
            "provenance": {"table": "patient_medications", "record_id": m.get("id")},
        })

    for w in (ctx.wearable_summaries or [])[:3]:
        items.append({
            "id": f"ev-wear-{w.get('id', 'sum')}",
            "kind": "wearable",
            "label": "Wearable daily summary",
            "value_display": f"mood={w.get('mood_score')} anxiety={w.get('anxiety_score')}",
            "raw_value": {"mood_score": w.get("mood_score"), "anxiety_score": w.get("anxiety_score"), "date": str(w.get("date"))},
            "observed_at": w.get("date"),
            "recorded_at": w.get("created_at"),
            "provenance": {"table": "wearable_daily_summaries", "record_id": w.get("id")},
        })

    intake = ctx.intake or {}
    if intake:
        items.append({
            "id": "ev-intake-latest",
            "kind": "intake",
            "label": "Intake packet (latest)",
            "value_display": "screening & history on file",
            "raw_value": {"has_psychiatric_history": bool(intake.get("psychiatric_history"))},
            "observed_at": intake.get("created_at"),
            "recorded_at": intake.get("created_at"),
            "provenance": {"table": "intake_packets", "record_id": intake.get("id")},
        })

    if ctx.condition_package:
        cond = (ctx.condition_package.get("condition") or {})
        items.append({
            "id": "ev-condition-pkg",
            "kind": "condition_package",
            "label": f"Condition package: {cond.get('name') or cond.get('slug') or 'primary'}",
            "value_display": "loaded",
            "raw_value": {"slug": cond.get("slug")},
            "observed_at": None,
            "recorded_at": None,
            "provenance": {"table": "filesystem", "record_id": cond.get("slug")},
        })

    def _sort_key(it: dict):
        t = it.get("observed_at") or it.get("recorded_at") or ""
        return str(t)

    items.sort(key=_sort_key, reverse=True)
    return items


def _predict_suicide_self_harm(ctx: PatientContext, strat_by_cat: dict[str, dict]) -> dict:
    """Short-horizon concern index (72h label) — orthogonal wording from traffic lights."""
    phq9 = _latest_assessment(ctx, "phq-9")
    its = _get_items(phq9)
    i9 = its.get("item_9") or its.get("q9") or its.get("9")
    i9f = _safe_float(i9)

    cssrs = _latest_assessment(ctx, "c-ssrs")
    cssrs_score = _safe_float(cssrs.get("score_numeric") if cssrs else None)
    if cssrs_score is None and cssrs:
        cssrs_score = _safe_float(cssrs.get("score"))

    unstable = (ctx.safety_flags or {}).get("unstable_psych", False)
    psych_h = (ctx.intake or {}).get("psychiatric_history", "") or ""
    hist_kw = any(k in psych_h.lower() for k in ("suicid", "overdose", "attempt", "self-harm"))

    # wearable stress
    stress_hint = 0.0
    if ctx.wearable_summaries:
        w = ctx.wearable_summaries[0]
        mood = w.get("mood_score")
        anx = w.get("anxiety_score")
        if mood is not None and float(mood) <= 2:
            stress_hint += 0.15
        if anx is not None and float(anx) >= 8:
            stress_hint += 0.12

    logit = -1.2
    if i9f is not None:
        logit += 0.35 * max(0.0, min(3.0, i9f))
    if cssrs_score is not None:
        logit += 0.22 * max(0.0, min(6.0, cssrs_score))
    if unstable:
        logit += 0.9
    if hist_kw:
        logit += 0.25
    logit += stress_hint

    score = round(_sigmoid(logit), 3)
    factors = []
    if i9f is not None:
        factors.append({"name": "PHQ-9 item 9", "direction": "increases", "weight_or_rank": round(i9f / 3.0, 2), "detail": f"value={int(i9f)}"})
    if cssrs_score is not None:
        factors.append({"name": "C-SSRS total", "direction": "increases", "weight_or_rank": round(cssrs_score / 6.0, 2), "detail": f"score={cssrs_score}"})
    if unstable:
        factors.append({"name": "unstable_psych flag", "direction": "increases", "weight_or_rank": 1.0, "detail": "intake screening"})
    if hist_kw:
        factors.append({"name": "history keywords", "direction": "increases", "weight_or_rank": 0.25, "detail": "psychiatric history text"})
    if stress_hint > 0:
        factors.append({"name": "wearable mood/anxiety", "direction": "increases", "weight_or_rank": round(stress_hint, 2), "detail": "latest summary"})

    sr = strat_by_cat.get("suicide_risk", {})
    sh = strat_by_cat.get("self_harm", {})
    factors.append({
        "name": "operational stratification (reference)",
        "direction": "increases" if (sr.get("level") == "red" or sh.get("level") == "red") else "neutral",
        "weight_or_rank": None,
        "detail": f"suicide_risk={sr.get('level')}, self_harm={sh.get('level')} — see Safety Snapshot, not double-counted in score",
    })

    return {
        "analyzer_id": "suicide_self_harm",
        "title": "Suicide / self-harm — short-horizon model estimate",
        "score": score,
        "score_type": "probability",
        "band_label": "elevated" if score >= 0.55 else ("watch" if score >= 0.35 else "lower"),
        "horizon_hours": 72,
        "horizon_label": "72 hours (label only)",
        "contributing_factors": factors,
        "confidence": {
            "level": "low",
            "calibration_note": "Rule-based logistic-style index; not calibrated to population incidence. "
            "Do not use as sole basis for discharge or treatment decisions.",
            "target_population_note": "Adults in neuromodulation clinic contexts with PHQ-9/C-SSRS-style instruments.",
        },
        "model": {"id": "suicide_self_harm_rule_v1", "version": "1.0.0", "kind": "rule_based"},
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {"inputs_hash": None, "upstream": ["risk_stratification", "assessments", "intake"]},
    }


def _predict_mental_crisis(ctx: PatientContext, strat_by_cat: dict[str, dict]) -> dict:
    urgent = len([a for a in (ctx.wearable_alerts or []) if a.get("severity") == "urgent"])
    symp = len([a for a in (ctx.wearable_alerts or []) if a.get("flag_type") in ("symptom_worsening", "presession_concern")])
    crisis_signals = min(6, urgent * 2 + symp)
    if ctx.wearable_summaries:
        w = ctx.wearable_summaries[0]
        if w.get("mood_score") is not None and float(w["mood_score"]) <= 2:
            crisis_signals += 1
        if w.get("anxiety_score") is not None and float(w["anxiety_score"]) >= 8:
            crisis_signals += 1
    serious_ae = len([e for e in (ctx.adverse_events or []) if (e.get("severity") or "").lower() in ("serious", "severe", "critical")])

    tier = "baseline"
    if crisis_signals >= 3 or serious_ae:
        tier = "immediate"
    elif crisis_signals >= 1:
        tier = "urgent"
    dest_score = round(min(1.0, 0.15 * crisis_signals + 0.12 * serious_ae), 3)

    mc = strat_by_cat.get("mental_crisis", {})
    factors = [
        {"name": "wearable_urgent_alerts", "direction": "increases", "weight_or_rank": urgent, "detail": f"count={urgent}"},
        {"name": "symptom_worsening_alerts", "direction": "increases", "weight_or_rank": symp, "detail": f"count={symp}"},
        {"name": "serious_adverse_events", "direction": "increases", "weight_or_rank": serious_ae, "detail": f"unresolved={serious_ae}"},
        {"name": "operational mental_crisis traffic light", "direction": "neutral", "weight_or_rank": None, "detail": f"level={mc.get('level')}"},
    ]

    return {
        "analyzer_id": "mental_crisis",
        "title": "Mental crisis — destabilization estimate",
        "score": dest_score,
        "score_type": "index",
        "band_label": tier,
        "horizon_hours": 48,
        "horizon_label": "48 hours (acute monitoring window)",
        "contributing_factors": factors,
        "confidence": {
            "level": "low",
            "calibration_note": "Heuristic composite from wearables + AEs; not a validated crisis predictor.",
            "target_population_note": "Patients with wearable integration and documented adverse events.",
        },
        "model": {"id": "mental_crisis_rule_v1", "version": "1.0.0", "kind": "rule_based"},
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {"upstream": ["wearables", "adverse_events", "risk_stratification"]},
    }


def _predict_harm_to_others(ctx: PatientContext, strat_by_cat: dict[str, dict]) -> dict:
    combined = ((ctx.intake or {}).get("psychiatric_history", "") or "") + " " + ((ctx.intake or {}).get("medical_history", "") or "")
    violence = any(k in combined.lower() for k in ("violence", "aggression", "homicid", "assault", "threat"))
    aggression_ae = len([
        e for e in (ctx.adverse_events or [])
        if any(k in (e.get("event_type") or "").lower() for k in ("aggression", "violence", "assault"))
    ])

    logit = -1.0
    if violence:
        logit += 0.8
    logit += 0.25 * aggression_ae
    score = round(_sigmoid(logit), 3)

    ho = strat_by_cat.get("harm_to_others", {})
    factors = [
        {"name": "intake violence/aggression keywords", "direction": "increases" if violence else "neutral", "weight_or_rank": 0.8 if violence else 0, "detail": "text scan"},
        {"name": "aggression-related adverse events", "direction": "increases", "weight_or_rank": aggression_ae, "detail": f"count={aggression_ae}"},
        {"name": "operational harm_to_others traffic light", "direction": "neutral", "weight_or_rank": None, "detail": f"level={ho.get('level')}"},
    ]

    return {
        "analyzer_id": "harm_to_others",
        "title": "Harm to others — structured concern profile",
        "score": score,
        "score_type": "probability",
        "band_label": "elevated" if score >= 0.55 else "lower",
        "horizon_hours": 72,
        "horizon_label": "72 hours",
        "contributing_factors": factors,
        "confidence": {
            "level": "low",
            "calibration_note": "Keyword and AE heuristic; clinician formulation required for any security action.",
            "target_population_note": "General clinic cohort; not validated for forensic or ED settings.",
        },
        "model": {"id": "harm_to_others_rule_v1", "version": "1.0.0", "kind": "rule_based"},
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {"upstream": ["intake", "adverse_events"]},
    }


def _merge_relapse_adherence(clinical_scores: dict[str, Any]) -> dict:
    rel = clinical_scores.get("relapse_risk")
    adh = clinical_scores.get("adherence_risk")
    rel_v = getattr(rel, "value", None) if rel is not None else None
    adh_v = getattr(adh, "value", None) if adh is not None else None
    if hasattr(rel, "model_dump"):
        rel_d = rel.model_dump(mode="json")
    elif isinstance(rel, dict):
        rel_d = rel
    else:
        rel_d = {}
    if hasattr(adh, "model_dump"):
        adh_d = adh.model_dump(mode="json")
    elif isinstance(adh, dict):
        adh_d = adh
    else:
        adh_d = {}

    rv = _safe_float(rel_v if rel_v is not None else rel_d.get("value"))
    av = _safe_float(adh_v if adh_v is not None else adh_d.get("value"))
    composite = None
    if rv is not None and av is not None:
        composite = round((rv + av) / 2.0, 3)
    elif rv is not None:
        composite = rv
    elif av is not None:
        composite = av

    msg_parts = []
    if rel_d.get("message"):
        msg_parts.append(str(rel_d["message"]))
    if adh_d.get("message"):
        msg_parts.append(str(adh_d["message"]))

    return {
        "analyzer_id": "relapse_adherence",
        "title": "Relapse / adherence — research-grade composite",
        "score": composite,
        "score_type": "index",
        "band_label": None,
        "horizon_hours": 168,
        "horizon_label": "7 days (care-pathway horizon)",
        "contributing_factors": [
            {"name": "relapse_risk (clinical_scores)", "direction": "neutral", "weight_or_rank": rv, "detail": rel_d.get("summary") or rel_d.get("message") or ""},
            {"name": "adherence_risk (clinical_scores)", "direction": "neutral", "weight_or_rank": av, "detail": adh_d.get("summary") or adh_d.get("message") or ""},
        ],
        "confidence": {
            "level": "low",
            "calibration_note": "Uses ``build_all_clinical_scores`` relapse and adherence builders — research-grade, not safety-critical tier.",
            "target_population_note": "Neuromodulation cohorts with PROM and adherence telemetry when available.",
        },
        "model": {"id": "relapse_adherence_composite", "version": "1.0.0", "kind": "research_composite"},
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {"upstream": ["risk_clinical_scores"]},
        "detail_messages": msg_parts,
    }


def _recommended_actions(
    strat_by_cat: dict[str, dict],
    formulation: dict,
    safety_plan: dict,
    suicide_card: dict,
    crisis_card: dict,
) -> list[dict]:
    actions: list[dict] = []
    aid = 0

    def add(priority: str, category: str, title: str, detail: str, derived: list[str]) -> None:
        nonlocal aid
        aid += 1
        actions.append({
            "id": f"ra-{aid}",
            "priority": priority,
            "category": category,
            "title": title,
            "detail": detail,
            "derived_from": derived,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "provenance": {"rule_id": f"template_{category}", "manual": False},
        })

    if strat_by_cat.get("suicide_risk", {}).get("level") == "red" or strat_by_cat.get("self_harm", {}).get("level") == "red":
        add("immediate", "escalation", "Activate crisis protocol per clinic policy", "Follow suicide-safety workflow; face-to-face risk assessment if acute indicators.", ["stratification"])
    elif strat_by_cat.get("suicide_risk", {}).get("level") == "amber":
        add("same_day", "review", "Same-day clinician review of suicide/self-harm indicators", "Review PHQ-9 item 9 and C-SSRS; document collaborative assessment.", ["stratification"])

    if strat_by_cat.get("mental_crisis", {}).get("level") in ("red", "amber"):
        add("immediate", "escalation", "Address acute destabilization signals", "Review wearable alerts, critical assessments, and unresolved adverse events per operational rules.", ["stratification", "prediction"])

    if strat_by_cat.get("harm_to_others", {}).get("level") in ("red", "amber"):
        add("immediate", "escalation", "Harm-to-others concern — structured review", "Security/safety pathway per local policy; do not rely on scores alone.", ["stratification"])

    if strat_by_cat.get("seizure_risk", {}).get("level") == "red":
        add("immediate", "neuromodulation", "Hold or modify magnetic neuromodulation", "Seizure risk elevated — verify neurology clearance and parameters.", ["stratification"])
    elif strat_by_cat.get("seizure_risk", {}).get("level") == "amber":
        add("same_day", "neuromodulation", "Conservative neuromodulation parameters", "Review threshold-lowering medications and seizure history.", ["stratification"])

    if strat_by_cat.get("medication_interaction", {}).get("level") in ("amber", "red"):
        add("same_day", "medication", "Medication interaction review", "Reconcile interaction checks before next stimulation session.", ["stratification"])

    sp_status = (safety_plan.get("status") or (formulation.get("safety_plan_status") or {}).get("status") or "none")
    if sp_status in (None, "none", "needs_review", "expired"):
        add("same_day", "safety_plan", "Review collaborative safety plan", "Update warning signs, coping steps, supports, and crisis numbers.", ["formulation"])

    if suicide_card.get("score", 0) >= 0.45:
        add("same_day", "review", "Discuss short-horizon model drivers with patient", "Model output is adjunctive — integrate with formulation, not replace it.", ["prediction"])

    if not actions:
        add("routine", "review", "Continue routine monitoring", "No automatic escalation flags from rules; maintain standard documentation.", ["policy"])

    return actions


def _default_formulation() -> dict:
    return {
        "presenting_concerns": [],
        "dynamic_drivers": [],
        "protective_factors": [],
        "access_to_means": {"level": "unknown", "notes": ""},
        "family_carer_concerns": "",
        "narrative_formulation": "",
        "clinician_concerns": "",
        "safety_plan_status": {"status": "none"},
        "provenance": {"source": "default"},
    }


def _default_safety_plan() -> dict:
    return {
        "status": "none",
        "summary": "",
        "warning_signs_documented": False,
        "coping_steps_documented": False,
        "supports_documented": False,
        "means_restriction_discussed": False,
        "crisis_numbers_given": False,
        "provenance": {"source": "studio"},
    }


def load_or_create_formulation_row(db: Session, patient_id: str) -> PatientRiskFormulation:
    row = db.execute(
        select(PatientRiskFormulation).where(PatientRiskFormulation.patient_id == patient_id)
    ).scalar_one_or_none()
    if row:
        return row
    row = PatientRiskFormulation(
        patient_id=patient_id,
        formulation_json=json.dumps(_default_formulation()),
        safety_plan_json=json.dumps(_default_safety_plan()),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def merge_formulation_patch(base: dict, patch: dict) -> dict:
    out = {**base}
    for k in (
        "presenting_concerns",
        "dynamic_drivers",
        "protective_factors",
        "family_carer_concerns",
        "narrative_formulation",
        "clinician_concerns",
    ):
        if k in patch and patch[k] is not None:
            out[k] = patch[k]
    if patch.get("access_to_means") is not None:
        out["access_to_means"] = {**(out.get("access_to_means") or {}), **patch["access_to_means"]}
    if patch.get("safety_plan_status") is not None:
        out["safety_plan_status"] = {**(out.get("safety_plan_status") or {}), **patch["safety_plan_status"]}
    out["provenance"] = {"source": "manual", "updated_at": datetime.now(timezone.utc).isoformat()}
    return out


def merge_safety_plan_patch(base: dict, patch: dict) -> dict:
    return {**base, **{k: v for k, v in patch.items() if v is not None}}


def build_risk_analyzer_payload(
    patient_id: str,
    db: Session,
    *,
    actor_id: Optional[str] = None,
    ensure_compute: bool = True,
) -> dict:
    """Full workspace payload for GET /risk/analyzer/patient/{id}."""
    ctx = assemble_patient_context(patient_id, db)
    if not ctx.patient:
        return {"error": "patient_not_found", "patient_id": patient_id}

    if ensure_compute:
        compute_risk_profile(patient_id, db, clinician_id=actor_id)

    snap_rows = _enrich_snapshots_with_corpus(
        _category_snapshot_rows(db, patient_id),
        patient_id,
        ctx,
        db,
    )
    strat_by_cat = {r["category"]: r for r in snap_rows}

    chronological_age: Optional[int] = None
    age_val = (ctx.patient or {}).get("age")
    if isinstance(age_val, (int, float)):
        chronological_age = int(age_val)
    wearable_summary = ctx.wearable_summaries[0] if ctx.wearable_summaries else None

    scores = build_all_clinical_scores(
        assessments=ctx.assessments,
        qeeg_risk_payload=None,
        brain_age_payload=None,
        wearable_summary=wearable_summary,
        trajectory_change_scores=None,
        adverse_event_count=len(ctx.adverse_events or []),
        adherence_summary=None,
        chronological_age=chronological_age,
        response_target="depression",
    )

    suicide_card = _attach_prediction_corpus(
        _predict_suicide_self_harm(ctx, strat_by_cat), patient_id, ctx, db, "suicide_self_harm_risk",
    )
    crisis_card = _attach_prediction_corpus(
        _predict_mental_crisis(ctx, strat_by_cat), patient_id, ctx, db, "mental_crisis_acute",
    )
    harm_card = _attach_prediction_corpus(
        _predict_harm_to_others(ctx, strat_by_cat), patient_id, ctx, db, "harm_to_others_violence",
    )
    rel_adh = _attach_prediction_corpus(
        _merge_relapse_adherence(scores), patient_id, ctx, db, "relapse_adherence_neuromod",
    )

    form_row = load_or_create_formulation_row(db, patient_id)
    try:
        formulation = json.loads(form_row.formulation_json or "{}")
    except json.JSONDecodeError:
        formulation = _default_formulation()
    try:
        safety_plan = json.loads(form_row.safety_plan_json or "{}")
    except json.JSONDecodeError:
        safety_plan = _default_safety_plan()

    # surface safety plan status on formulation for the panel
    formulation = {
        **formulation,
        "safety_plan_status": {
            **(formulation.get("safety_plan_status") or {}),
            "status": safety_plan.get("status") or (formulation.get("safety_plan_status") or {}).get("status") or "none",
        },
    }

    evidence = _build_evidence_timeline(ctx, patient_id)
    actions = _recommended_actions(strat_by_cat, formulation, safety_plan, suicide_card, crisis_card)

    clinical_dump = {sid: (s.model_dump(mode="json") if hasattr(s, "model_dump") else s) for sid, s in scores.items()}

    return {
        "schema_version": SCHEMA_VERSION,
        "patient_id": patient_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {"assembler_version": ASSEMBLER_VERSION, "sources": ["risk_stratification", "risk_clinical_scores", "patient_risk_formulation"]},
        "disclaimer_acknowledged_session": False,
        "safety_snapshot": snap_rows,
        "formulation": formulation,
        "safety_plan": safety_plan,
        "assessment_evidence": evidence,
        "prediction_support": [suicide_card, crisis_card, harm_card, rel_adh],
        "clinical_scores_raw": clinical_dump,
        "recommended_actions": actions,
        "audit_events": [],
        "active_overrides": [
            r for r in snap_rows if r.get("override_level")
        ],
    }


def append_analyzer_audit(
    db: Session,
    patient_id: str,
    event_type: str,
    actor_id: Optional[str],
    summary: str,
    payload: Optional[dict] = None,
) -> None:
    db.add(RiskAnalyzerAudit(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        event_type=event_type,
        actor_id=actor_id,
        payload_summary=summary,
        payload_json=json.dumps(payload) if payload else None,
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()

"""Labs / Blood Biomarkers Analyzer — rule-first payload assembly.

MVP: deterministic scaffold from patient context (no external lab DB yet).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.labs_analyzer import (
    ConfidenceBlock,
    LabClinicalInterpretation,
    LabConfoundFlag,
    LabCriticalValueAlert,
    LabDomainSummary,
    LabEvidenceLink,
    LabRecommendation,
    LabResultRecord,
    LabReviewAuditEvent,
    LabSnapshot,
    LabsAnalyzerPagePayload,
    LabTrendWindow,
    MultimodalLink,
    ProvenanceBlock,
    ReferenceRange,
)

_ANALYZER_VERSION = "labs-analyzer-0.1.0"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _audit_memory() -> dict[str, list[LabReviewAuditEvent]]:
    """Process-local audit trail for MVP (replaced by DB persistence later)."""
    if not hasattr(_audit_memory, "_store"):
        setattr(_audit_memory, "_store", {})
    return getattr(_audit_memory, "_store")


def append_audit_event(patient_id: str, event: LabReviewAuditEvent) -> None:
    store = _audit_memory()
    store.setdefault(patient_id, []).append(event)


def get_audit_trail(patient_id: str) -> list[LabReviewAuditEvent]:
    return list(_audit_memory().get(patient_id, []))


def build_labs_analyzer_payload(
    patient_id: str,
    db: Session,
    *,
    patient_name: str | None = None,
) -> LabsAnalyzerPagePayload:
    """Assemble page payload from scaffold rules (DB-backed labs later)."""
    del db  # reserved for future lab_observation queries

    name = patient_name or "Patient"
    run_id = str(uuid.uuid4())

    # Demo-style panels — distinct storylines per known demo IDs
    if patient_id == "demo-pt-samantha-li":
        results, domains, snap_extra = _panel_samantha(patient_id)
    elif patient_id == "demo-pt-marcus-chen":
        results, domains, snap_extra = _panel_marcus(patient_id)
    elif patient_id == "demo-pt-elena-vasquez":
        results, domains, snap_extra = _panel_elena(patient_id)
    else:
        results, domains, snap_extra = _panel_generic(patient_id)

    critical = _critical_from_results(results)
    trends = _trends_from_results(results)
    interpretations = _interpretations_for(results, snap_extra)
    confounds = _confounds_for(results)
    recs = _recommendations_for(results, critical)
    links = _multimodal_links()

    abnormal_domains = sum(1 for d in domains if d.status in ("abnormal", "critical"))
    completeness = _completeness(results)

    snapshot = LabSnapshot(
        key_abnormal_markers=snap_extra.get("key_abnormal", []),
        critical_summary=snap_extra.get("critical_summary", ""),
        recent_changes_summary=snap_extra.get("recent_changes", ""),
        abnormal_domain_count=abnormal_domains,
        medication_safety_flag_count=snap_extra.get("med_safety_count", 0),
        inflammation_summary=snap_extra.get("inflammation", ""),
        metabolic_summary=snap_extra.get("metabolic", ""),
        endocrine_summary=snap_extra.get("endocrine", ""),
        completeness_pct=completeness,
        missing_core_analytes=snap_extra.get("missing", []),
        top_confound_warnings=[c.rationale for c in confounds[:3]],
    )

    return LabsAnalyzerPagePayload(
        generated_at=_iso_now(),
        patient_id=patient_id,
        patient_name=name,
        provenance=ProvenanceBlock(
            analyzer_version=_ANALYZER_VERSION,
            input_snapshot_ids=[f"scaffold:{patient_id}"],
            pipeline_run_id=run_id,
        ),
        confidence=ConfidenceBlock(
            overall_panel_completeness=completeness,
            interpretation_confidence_cap=min(0.85, 0.45 + completeness * 0.4),
        ),
        disclaimer_short=(
            "Decision-support only. Not a diagnosis. Laboratory interpretation requires "
            "qualified clinician review and local protocols."
        ),
        lab_snapshot=snapshot,
        domain_summaries=domains,
        results=results,
        trend_windows=trends,
        critical_alerts=critical,
        interpretations=interpretations,
        confound_flags=confounds,
        recommendations=recs,
        multimodal_links=links,
    )


def _ref(low: float | None, high: float | None) -> ReferenceRange:
    return ReferenceRange(low=low, high=high)


def _result(
    pid: str,
    rid: str,
    code: str,
    name: str,
    val: float | None,
    unit: str,
    low: float,
    high: float,
    collected: str,
    domain: str,
    *,
    text: str | None = None,
    critical_low: float | None = None,
    critical_high: float | None = None,
) -> LabResultRecord:
    direction: Any = "normal"
    crit: Any = "none"
    if val is not None:
        if val < low:
            direction = "low"
        elif val > high:
            direction = "high"
        if critical_low is not None and val < critical_low:
            crit = "critical"
        elif critical_high is not None and val > critical_high:
            crit = "critical"
        elif direction in ("low", "high"):
            crit = "moderate"

    impacted: list[str] = []
    if code in ("718-7", "4544-3", "30522-7"):
        impacted.extend(["biometrics", "assessments", "risk"])
    if code in ("2160-0", "3094-0"):
        impacted.extend(["medication", "treatment_sessions"])
    if code in ("3051-6", "3050-8"):
        impacted.extend(["qeeg", "assessments"])

    return LabResultRecord(
        id=rid,
        patient_id=pid,
        analyte_code=code,
        analyte_display_name=name,
        test_name="Basic metabolic panel / CBC" if domain != "hematology" else "CBC",
        panel_name="Core panel (scaffold)",
        value_numeric=val,
        value_text=text,
        unit_ucum=unit,
        reference_range=_ref(low, high),
        sample_collected_at=collected,
        result_reported_at=collected,
        abnormality_direction=direction,
        criticality=crit,
        domain=domain,
        acute_chronic_class="unknown",
        confidence=0.95,
        linked_analyzers_impacted=list(dict.fromkeys(impacted)),
    )


def _domain_summary(
    domain: str,
    status: Any,
    headline: str,
    marker_ids: list[str],
    abnormal: int,
    critical: int,
) -> LabDomainSummary:
    return LabDomainSummary(
        domain=domain,
        status=status,
        abnormal_count=abnormal,
        critical_count=critical,
        headline=headline,
        marker_ids=marker_ids,
    )


def _panel_samantha(patient_id: str) -> tuple[list[LabResultRecord], list[LabDomainSummary], dict[str, Any]]:
    """Mild anemia + B12 low — fatigue confound story."""
    r1 = _result(
        patient_id,
        "lr-sam-hemo",
        "718-7",
        "Hemoglobin",
        10.8,
        "g/dL",
        11.5,
        15.5,
        "2026-04-28T08:00:00Z",
        "hematology",
    )
    r2 = _result(
        patient_id,
        "lr-sam-b12",
        "2132-9",
        "Vitamin B12",
        185.0,
        "pg/mL",
        200.0,
        900.0,
        "2026-04-28T08:00:00Z",
        "nutritional",
    )
    r3 = _result(
        patient_id,
        "lr-sam-cr",
        "2160-0",
        "Creatinine",
        0.88,
        "mg/dL",
        0.6,
        1.1,
        "2026-04-28T08:00:00Z",
        "metabolic_renal",
    )
    results = [r1, r2, r3]
    domains = [
        _domain_summary(
            "hematology",
            "abnormal",
            "Mild anemia pattern — correlate with fatigue / cognition complaints.",
            ["lr-sam-hemo"],
            1,
            0,
        ),
        _domain_summary(
            "nutritional",
            "abnormal",
            "Low B12 — consider supplementation cause vs absorption work-up.",
            ["lr-sam-b12"],
            1,
            0,
        ),
        _domain_summary("metabolic_renal", "clear", "Renal function within range.", ["lr-sam-cr"], 0, 0),
    ]
    extra = {
        "key_abnormal": ["Hemoglobin low", "Vitamin B12 low"],
        "critical_summary": "No critical chemistry flags on this draw.",
        "recent_changes": "Hgb −0.6 g/dL vs prior month (same lab).",
        "med_safety_count": 0,
        "inflammation": "No inflammatory markers on this panel.",
        "metabolic": "Glucose/electrolytes not shown — panel incomplete.",
        "endocrine": "TSH not on this draw.",
        "missing": ["TSH", "CRP", "Ferritin"],
    }
    return results, domains, extra


def _panel_marcus(patient_id: str) -> tuple[list[LabResultRecord], list[LabDomainSummary], dict[str, Any]]:
    """SSR context — mild ALT elevation + lipids — medication monitoring."""
    r1 = _result(
        patient_id,
        "lr-mar-alt",
        "1742-6",
        "ALT",
        78.0,
        "U/L",
        0.0,
        55.0,
        "2026-04-30T07:30:00Z",
        "metabolic_liver",
    )
    r2 = _result(
        patient_id,
        "lr-mar-tsh",
        "3051-6",
        "TSH",
        2.1,
        "mIU/L",
        0.4,
        4.5,
        "2026-04-30T07:30:00Z",
        "endocrine",
    )
    r3 = _result(
        patient_id,
        "lr-mar-glu",
        "2345-7",
        "Glucose (fasting)",
        104.0,
        "mg/dL",
        70.0,
        99.0,
        "2026-04-30T07:30:00Z",
        "cardiometabolic",
    )
    results = [r1, r2, r3]
    domains = [
        _domain_summary(
            "metabolic_liver",
            "abnormal",
            "Transaminitis pattern — review hepatotoxic meds and alcohol.",
            ["lr-mar-alt"],
            1,
            0,
        ),
        _domain_summary("endocrine", "clear", "TSH mid-range.", ["lr-mar-tsh"], 0, 0),
        _domain_summary(
            "cardiometabolic",
            "watch",
            "Borderline fasting glucose — lifestyle vs prediabetes work-up.",
            ["lr-mar-glu"],
            1,
            0,
        ),
    ]
    extra = {
        "key_abnormal": ["ALT elevated", "Fasting glucose high-normal"],
        "critical_summary": "No critical values.",
        "recent_changes": "ALT +22 U/L vs 8 weeks ago.",
        "med_safety_count": 1,
        "inflammation": "CRP not drawn.",
        "metabolic": "Liver enzyme elevation + borderline glucose.",
        "endocrine": "TSH normal; consider FT4 if clinically indicated.",
        "missing": ["AST", "GGT", "HbA1c"],
    }
    return results, domains, extra


def _panel_elena(patient_id: str) -> tuple[list[LabResultRecord], list[LabDomainSummary], dict[str, Any]]:
    """Chronic pain / polypharmacy — CK + eGFR watch."""
    r1 = _result(
        patient_id,
        "lr-ele-ck",
        "2157-6",
        "Creatine kinase (CK)",
        312.0,
        "U/L",
        30.0,
        200.0,
        "2026-04-25T09:00:00Z",
        "cardiometabolic",
    )
    r2 = _result(
        patient_id,
        "lr-ele-egfr",
        "33914-3",
        "eGFR (CKD-EPI)",
        52.0,
        "mL/min/1.73m2",
        60.0,
        120.0,
        "2026-04-25T09:00:00Z",
        "metabolic_renal",
    )
    r3 = _result(
        patient_id,
        "lr-ele-wbc",
        "6690-2",
        "WBC",
        11.2,
        "10*3/uL",
        4.5,
        11.0,
        "2026-04-25T09:00:00Z",
        "hematology",
    )
    results = [r1, r2, r3]
    domains = [
        _domain_summary(
            "metabolic_renal",
            "abnormal",
            "eGFR below expected threshold — medication dosing + contrast caution.",
            ["lr-ele-egfr"],
            1,
            0,
        ),
        _domain_summary(
            "cardiometabolic",
            "watch",
            "CK elevated — exercise, statin, or myopathy differential.",
            ["lr-ele-ck"],
            1,
            0,
        ),
        _domain_summary(
            "hematology",
            "watch",
            "WBC upper-normal / mild leukocytosis.",
            ["lr-ele-wbc"],
            1,
            0,
        ),
    ]
    extra = {
        "key_abnormal": ["eGFR reduced", "CK elevated"],
        "critical_summary": "No emergent critical chemistry on this draw.",
        "recent_changes": "eGFR −6 vs prior quarter.",
        "med_safety_count": 2,
        "inflammation": "WBC borderline — correlate clinically.",
        "metabolic": "Renal function limitation affects clearance interpretation.",
        "endocrine": "Not assessed on this draw.",
        "missing": ["CMP full", "Troponin"],
    }
    return results, domains, extra


def _panel_generic(patient_id: str) -> tuple[list[LabResultRecord], list[LabDomainSummary], dict[str, Any]]:
    r1 = _result(
        patient_id,
        f"lr-{patient_id[:8]}-na",
        "2951-2",
        "Sodium",
        140.0,
        "mmol/L",
        135.0,
        145.0,
        "2026-05-01T08:00:00Z",
        "metabolic_renal",
    )
    results = [r1]
    domains = [
        _domain_summary(
            "metabolic_renal",
            "clear",
            "Limited scaffold — add labs to enable trends.",
            [r1.id],
            0,
            0,
        ),
    ]
    extra = {
        "key_abnormal": [],
        "critical_summary": "No critical values in scaffold sample.",
        "recent_changes": "Insufficient longitudinal data.",
        "med_safety_count": 0,
        "inflammation": "No inflammatory markers in scaffold.",
        "metabolic": "Electrolytes normal in single-sample demo.",
        "endocrine": "Thyroid not included.",
        "missing": ["CBC", "CMP", "Lipids", "TSH"],
    }
    return results, domains, extra


def _critical_from_results(results: list[LabResultRecord]) -> list[LabCriticalValueAlert]:
    out: list[LabCriticalValueAlert] = []
    for r in results:
        if r.criticality == "critical":
            out.append(
                LabCriticalValueAlert(
                    id=f"crit-{r.id}",
                    result_id=r.id,
                    analyte_display_name=r.analyte_display_name,
                    message_clinical=(
                        f"{r.analyte_display_name} in critical range — "
                        "verify repeat / clinical correlation per protocol."
                    ),
                    escalation_level="emergent",
                )
            )
    return out


def _trends_from_results(results: list[LabResultRecord]) -> list[LabTrendWindow]:
    trends: list[LabTrendWindow] = []
    for r in results:
        if r.value_numeric is None:
            continue
        trends.append(
            LabTrendWindow(
                analyte_code=r.analyte_code,
                window_start="2026-01-01T00:00:00Z",
                window_end=r.sample_collected_at,
                n_samples=1,
                baseline_estimate=r.value_numeric,
                latest_value=r.value_numeric,
                delta_percent=None,
                trend_direction="flat",
                real_change_probability=0.35,
                real_change_rationale_codes=["single_draw", "informative_prior_only"],
            )
        )
    return trends


def _interpretations_for(
    results: list[LabResultRecord], snap: dict[str, Any]
) -> list[LabClinicalInterpretation]:
    items: list[LabClinicalInterpretation] = []
    for r in results:
        if r.abnormality_direction not in ("low", "high"):
            continue
        cat = "other"
        summary = f"{r.analyte_display_name} is {r.abnormality_direction} vs reference — possible contributor to symptoms (hypothesis)."
        conf = 0.42
        if r.domain == "hematology":
            cat = "fatigue"
            summary = (
                "Hematologic abnormality may contribute to fatigue or exercise tolerance — "
                "not sufficient alone to explain neurocognitive findings."
            )
            conf = 0.48
        elif r.domain in ("metabolic_liver", "metabolic_renal"):
            cat = "metabolic"
            conf = 0.44
        elif r.domain == "nutritional":
            cat = "endocrine"
            summary = (
                "Nutritional marker abnormal — consider dietary intake, absorption, and "
                "medication effects before attributing symptoms elsewhere."
            )
        items.append(
            LabClinicalInterpretation(
                id=f"int-{r.id}",
                category=cat,
                interpretation_type="possible_contributor",
                summary=summary,
                supporting_result_ids=[r.id],
                confidence=conf,
                caveats=[
                    "Structured hypothesis only.",
                    (
                        f"Panel gaps: {', '.join((snap.get('missing') or [])[:6])}."
                        if snap.get("missing")
                        else "Add relevant analytes for stronger inference."
                    ),
                ],
            )
        )
    return items


def _confounds_for(results: list[LabResultRecord]) -> list[LabConfoundFlag]:
    out: list[LabConfoundFlag] = []
    for r in results:
        if r.abnormality_direction == "normal" and r.criticality != "critical":
            continue
        for target in r.linked_analyzers_impacted or ["risk"]:
            out.append(
                LabConfoundFlag(
                    id=f"cf-{r.id}-{target}",
                    target_analyzer=target,
                    strength="moderate" if r.criticality != "critical" else "high",
                    confound_risk_score=0.55 if r.abnormality_direction != "normal" else 0.72,
                    rationale=(
                        f"{r.analyte_display_name} abnormal — interpret {target} signals with caution "
                        "until labs stabilize or are explained."
                    ),
                    supporting_result_ids=[r.id],
                )
            )
    return out[:12]


def _ev(title: str, snippet: str, eid: str) -> LabEvidenceLink:
    return LabEvidenceLink(
        evidence_id=eid,
        source_type="internal_rule_pack",
        title=title,
        snippet=snippet,
        strength="moderate",
    )


def _recommendations_for(
    results: list[LabResultRecord], critical: list[LabCriticalValueAlert]
) -> list[LabRecommendation]:
    recs: list[LabRecommendation] = []
    if critical:
        recs.append(
            LabRecommendation(
                id="rec-critical",
                type="escalation",
                priority="P0",
                text="Critical result pattern — follow institutional critical-value protocol.",
                evidence_links=[
                    _ev(
                        "Critical values",
                        "Repeat abnormal critical labs per lab director policy.",
                        "ev-critical-1",
                    )
                ],
                linked_result_ids=[c.result_id for c in critical],
            )
        )
    any_abn = any(r.abnormality_direction in ("low", "high") for r in results)
    if any_abn:
        recs.append(
            LabRecommendation(
                id="rec-repeat",
                type="repeat_lab",
                priority="P1",
                text="Repeat key abnormalities on a short interval to distinguish trend from fluctuation.",
                evidence_links=[
                    _ev(
                        "Longitudinal interpretation",
                        "Change vs biological variation requires consecutive draws.",
                        "ev-trend-1",
                    )
                ],
                linked_result_ids=[r.id for r in results if r.abnormality_direction != "normal"],
            )
        )
        recs.append(
            LabRecommendation(
                id="rec-med-review",
                type="med_review",
                priority="P1",
                text="Cross-check active medications for labs that require monitoring (renal/hepatic/bone marrow).",
                evidence_links=[
                    _ev(
                        "Medication monitoring",
                        "Align labs with agent-specific monitoring expectations.",
                        "ev-med-1",
                    )
                ],
                linked_result_ids=[],
            )
        )
    recs.append(
        LabRecommendation(
            id="rec-multimodal",
            type="caution_other_analyzers",
            priority="P2",
            text="When reviewing MRI, qEEG, biometrics, and outcomes, consider lab confounds documented above.",
            evidence_links=[
                _ev(
                    "Multimodal fusion",
                    "Blood biomarkers contextualize but do not replace modality-specific interpretation.",
                    "ev-mm-1",
                )
            ],
            linked_result_ids=[],
        )
    )
    return recs


def _multimodal_links() -> list[MultimodalLink]:
    return [
        MultimodalLink(
            target_page="medication-analyzer",
            label="Medication Analyzer",
            rationale="Compare abnormal labs with agents that require monitoring.",
        ),
        MultimodalLink(
            target_page="wearables",
            label="Biometrics",
            rationale="HRV, sleep, and activity may covary with anemia, thyroid, or metabolic stress.",
        ),
        MultimodalLink(
            target_page="risk-analyzer",
            label="Risk Analyzer",
            rationale="Safety and deterioration models may be confounded by acute lab shifts.",
        ),
        MultimodalLink(
            target_page="treatment-sessions-analyzer",
            label="Treatment Sessions",
            rationale="Relate pre/post session labs when assessing tolerability and response.",
        ),
        MultimodalLink(
            target_page="assessments-v2",
            label="Assessments",
            rationale="Symptom scales may shift when biological contributors change.",
        ),
        MultimodalLink(
            target_page="mri-analysis",
            label="MRI Analyzer",
            rationale="Contrast / renal function and systemic illness may affect imaging planning.",
        ),
        MultimodalLink(
            target_page="qeeg-analysis",
            label="qEEG Analyzer",
            rationale="Metabolic or inflammatory states can influence EEG features — interpret cautiously.",
        ),
        MultimodalLink(
            target_page="deeptwin",
            label="DeepTwin / multimodal summary",
            rationale="Integrate labs as biological context for the fused patient view.",
        ),
    ]


def _completeness(results: list[LabResultRecord]) -> float:
    # Rough scaffold: more results → higher score; cap at 0.95
    base = min(0.95, 0.35 + 0.08 * len(results))
    return round(base, 2)


def recompute_and_payload(
    patient_id: str,
    db: Session,
    *,
    patient_name: str | None = None,
    actor_id: str | None = None,
) -> LabsAnalyzerPagePayload:
    """Mark recompute in audit and return fresh payload."""
    if actor_id:
        append_audit_event(
            patient_id,
            LabReviewAuditEvent(
                event_id=str(uuid.uuid4()),
                event_type="recompute_requested",
                actor_user_id=actor_id,
                timestamp=_iso_now(),
                payload={"reason": "manual"},
            ),
        )
    return build_labs_analyzer_payload(patient_id, db, patient_name=patient_name)

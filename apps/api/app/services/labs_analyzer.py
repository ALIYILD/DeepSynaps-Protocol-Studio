"""Labs / Blood Biomarkers Analyzer — rule-first payload assembly.

Loads persisted `PatientLabResult` rows when present; otherwise uses scaffold
panels (demo personas). Augments with medications, courses, qEEG/MRI IDs,
fusion/deeptwin pointers, evidence corpus query, and optional LLM narrative.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, func, select
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
    LabsEvidenceBrief,
    LabsExternalContext,
    LabTrendWindow,
    MultimodalLink,
    ProvenanceBlock,
    ReferenceRange,
)

_LOG = logging.getLogger(__name__)

_ANALYZER_VERSION = "labs-analyzer-0.2.0"


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
    primary_condition: str | None = None,
    include_ai_narrative: bool = False,
) -> LabsAnalyzerPagePayload:
    """Assemble page payload: DB lab rows override scaffold when present."""
    name = patient_name or "Patient"
    run_id = str(uuid.uuid4())
    input_ids: list[str] = []

    db_rows = _load_lab_rows_from_db(db, patient_id)
    use_db = len(db_rows) > 0

    if use_db:
        results = [_lab_row_to_record(patient_id, row) for row in db_rows]
        input_ids.append(f"db:patient_lab_results:{len(db_rows)}")
        domains = _build_domain_summaries_from_results(results)
        snap_extra = _rollup_extra_from_results(results, db_med_flags=0)
    else:
        if patient_id == "demo-pt-samantha-li":
            results, domains, snap_extra = _panel_samantha(patient_id)
        elif patient_id == "demo-pt-marcus-chen":
            results, domains, snap_extra = _panel_marcus(patient_id)
        elif patient_id == "demo-pt-elena-vasquez":
            results, domains, snap_extra = _panel_elena(patient_id)
        else:
            results, domains, snap_extra = _panel_generic(patient_id)
        input_ids.append(f"scaffold:{patient_id}")

    ext = _load_external_context(db, patient_id)
    med_monitor_notes = _medication_lab_monitor_notes(ext.active_medications, results)
    if med_monitor_notes:
        snap_extra["med_safety_count"] = snap_extra.get("med_safety_count", 0) + len(med_monitor_notes)

    critical = _critical_from_results(results)
    trends = _trends_from_results(results)
    interpretations = _interpretations_for(results, snap_extra)
    confounds = _confounds_for(results)
    confounds.extend(_confounds_from_context(ext, results))
    recs = _recommendations_for(results, critical)
    for i, note in enumerate(med_monitor_notes):
        recs.insert(
            0,
            LabRecommendation(
                id=f"rec-medmon-{i}",
                type="med_review",
                priority="P1",
                text=note,
                evidence_links=[
                    _ev(
                        "Laboratory monitoring",
                        "Align labs with agent-specific monitoring references.",
                        "ev-medmon-1",
                    )
                ],
                linked_result_ids=[],
            ),
        )
    links = _build_multimodal_links_from_context(patient_id, ext)

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
        top_confound_warnings=[c.rationale for c in confounds[:5]],
    )

    evidence_brief: LabsEvidenceBrief | None = None
    ev_ids: list[str] = []
    try:
        evidence_brief, ev_ids = _labs_evidence_query(
            patient_id=patient_id,
            primary_condition=primary_condition,
            medications=ext.active_medications,
            abnormal_terms=snapshot.key_abnormal_markers,
            db=db,
        )
        for eid in ev_ids:
            input_ids.append(f"evidence_intelligence:{eid}")
    except Exception as exc:  # noqa: BLE001
        _LOG.debug("labs evidence query skipped: %s", exc)

    ai_text: str | None = None
    if include_ai_narrative:
        ai_text = _labs_ai_narrative(
            patient_name=name,
            snapshot=snapshot,
            external=ext,
            evidence_summary=evidence_brief.literature_summary if evidence_brief else "",
        )

    prov = ProvenanceBlock(
        analyzer_version=_ANALYZER_VERSION,
        input_snapshot_ids=input_ids,
        pipeline_run_id=run_id,
        evidence_finding_ids=ev_ids,
        llm_narrative_model="optional_llm" if ai_text and "LLM unavailable" not in (ai_text or "") else None,
    )

    return LabsAnalyzerPagePayload(
        generated_at=_iso_now(),
        patient_id=patient_id,
        patient_name=name,
        provenance=prov,
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
        confound_flags=confounds[:24],
        recommendations=recs,
        multimodal_links=links,
        external_context=ext,
        evidence_brief=evidence_brief,
        ai_clinical_narrative=ai_text,
    )


# ── DB + multimodal + evidence + optional LLM ────────────────────────────────


def _load_lab_rows_from_db(db: Session, patient_id: str) -> list[Any]:
    try:
        from app.persistence.models import PatientLabResult
    except ImportError:
        return []
    try:
        rows = (
            db.execute(
                select(PatientLabResult)
                .where(PatientLabResult.patient_id == patient_id)
                .order_by(desc(PatientLabResult.sample_collected_at), desc(PatientLabResult.created_at))
            )
            .scalars()
            .all()
        )
    except Exception as exc:  # noqa: BLE001 — table may not exist pre-migration
        _LOG.debug("patient_lab_results query skipped: %s", exc)
        return []
    return list(rows)


def _domain_for_loinc(code: str) -> str:
    c = (code or "").strip()
    mapping = {
        "718-7": "hematology",
        "4544-3": "hematology",
        "6690-2": "hematology",
        "789-8": "hematology",
        "2132-9": "nutritional",
        "2160-0": "metabolic_renal",
        "3094-0": "metabolic_renal",
        "33914-3": "metabolic_renal",
        "1742-6": "metabolic_liver",
        "1920-8": "metabolic_liver",
        "3051-6": "endocrine",
        "3050-8": "endocrine",
        "2345-7": "cardiometabolic",
        "2157-6": "cardiometabolic",
        "2951-2": "metabolic_renal",
    }
    return mapping.get(c, "general")


def _lab_row_to_record(patient_id: str, row: Any) -> LabResultRecord:
    low = row.ref_low
    high = row.ref_high
    val = row.value_numeric
    direction: Any = "unknown"
    crit: Any = "none"
    if low is not None and high is not None and val is not None:
        if val < low:
            direction = "low"
        elif val > high:
            direction = "high"
        else:
            direction = "normal"
        crit = "moderate" if direction in ("low", "high") else "none"
    collected = (
        row.sample_collected_at.isoformat().replace("+00:00", "Z")
        if row.sample_collected_at
        else _iso_now()
    )
    domain = _domain_for_loinc(row.analyte_code)
    impacted: list[str] = []
    if domain == "hematology":
        impacted = ["biometrics", "assessments", "risk"]
    elif domain in ("metabolic_renal", "metabolic_liver"):
        impacted = ["medication", "mri-analysis", "treatment-sessions-analyzer"]
    elif domain == "endocrine":
        impacted = ["qeeg-analysis", "assessments"]
    return LabResultRecord(
        id=row.id,
        patient_id=patient_id,
        analyte_code=row.analyte_code,
        analyte_display_name=row.analyte_display_name,
        test_name=row.panel_name,
        panel_name=row.panel_name,
        value_numeric=val,
        value_text=row.value_text,
        unit_ucum=row.unit_ucum,
        reference_range=ReferenceRange(low=low, high=high, text=row.ref_text),
        sample_collected_at=collected,
        result_reported_at=collected,
        abnormality_direction=direction,
        criticality=crit,
        domain=domain,
        acute_chronic_class="unknown",
        confidence=0.9,
        linked_analyzers_impacted=impacted,
    )


def _build_domain_summaries_from_results(results: list[LabResultRecord]) -> list[LabDomainSummary]:
    by_dom: dict[str, list[LabResultRecord]] = {}
    for r in results:
        by_dom.setdefault(r.domain, []).append(r)
    out: list[LabDomainSummary] = []
    for dom, rs in sorted(by_dom.items()):
        abn = sum(1 for x in rs if x.abnormality_direction in ("low", "high"))
        crit = sum(1 for x in rs if x.criticality == "critical")
        if crit > 0:
            st: Any = "critical"
        elif abn > 0:
            st = "abnormal"
        else:
            st = "clear"
        headline = f"{len(rs)} marker(s)" + (f", {abn} outside reference" if abn else "")
        out.append(
            LabDomainSummary(
                domain=dom,
                status=st,
                abnormal_count=abn,
                critical_count=crit,
                headline=headline,
                marker_ids=[x.id for x in rs],
            )
        )
    return out


def _rollup_extra_from_results(
    results: list[LabResultRecord], *, db_med_flags: int
) -> dict[str, Any]:
    abn_labels = [
        f"{r.analyte_display_name} ({r.abnormality_direction})"
        for r in results
        if r.abnormality_direction in ("low", "high")
    ]
    return {
        "key_abnormal": abn_labels[:8] or [],
        "critical_summary": "See critical alerts" if any(r.criticality == "critical" for r in results) else "No critical flags in stored results.",
        "recent_changes": "Upload consecutive draws for trend analysis.",
        "med_safety_count": db_med_flags,
        "inflammation": "Add CRP/ESR if inflammatory differential.",
        "metabolic": "Review renal/hepatic panel completeness.",
        "endocrine": "Add TSH/thyroid panel if indicated.",
        "missing": [],
    }


def _load_external_context(db: Session, patient_id: str) -> LabsExternalContext:
    from app.persistence.models import (
        BiometricsSnapshot,
        DeepTwinAnalysisRun,
        FusionCase,
        MriAnalysis,
        PatientMedication,
        QEEGAnalysis,
        TreatmentCourse,
    )

    meds = db.execute(
        select(PatientMedication)
        .where(PatientMedication.patient_id == patient_id)
        .where(PatientMedication.active.is_(True))
    ).scalars().all()
    active_medications = [
        {
            "id": m.id,
            "name": m.name,
            "generic_name": m.generic_name,
            "dose": m.dose,
            "frequency": m.frequency,
        }
        for m in meds
    ]

    courses = db.execute(
        select(TreatmentCourse)
        .where(TreatmentCourse.patient_id == patient_id)
        .order_by(desc(TreatmentCourse.updated_at))
        .limit(5)
    ).scalars().all()
    treatment_courses = [
        {
            "id": c.id,
            "modality_slug": c.modality_slug,
            "status": c.status,
            "sessions_delivered": c.sessions_delivered,
            "planned_sessions_total": c.planned_sessions_total,
        }
        for c in courses
    ]

    qrow = db.execute(
        select(QEEGAnalysis.id, QEEGAnalysis.updated_at)
        .where(QEEGAnalysis.patient_id == patient_id)
        .where(QEEGAnalysis.analysis_status == "completed")
        .order_by(desc(QEEGAnalysis.updated_at))
        .limit(1)
    ).first()
    latest_qeeg = str(qrow[0]) if qrow else None

    mrow = db.execute(
        select(MriAnalysis.analysis_id, MriAnalysis.created_at)
        .where(MriAnalysis.patient_id == patient_id)
        .where(MriAnalysis.state == "SUCCESS")
        .order_by(desc(MriAnalysis.created_at))
        .limit(1)
    ).first()
    latest_mri = str(mrow[0]) if mrow else None

    frow = db.execute(
        select(FusionCase.id, FusionCase.created_at)
        .where(FusionCase.patient_id == patient_id)
        .order_by(desc(FusionCase.created_at))
        .limit(1)
    ).first()
    fusion_id = str(frow[0]) if frow else None

    drow = db.execute(
        select(DeepTwinAnalysisRun.id, DeepTwinAnalysisRun.created_at)
        .where(DeepTwinAnalysisRun.patient_id == patient_id)
        .order_by(desc(DeepTwinAnalysisRun.created_at))
        .limit(1)
    ).first()
    deeptwin_id = str(drow[0]) if drow else None

    brow = db.execute(
        select(BiometricsSnapshot.id, BiometricsSnapshot.recorded_at)
        .where(BiometricsSnapshot.patient_id == patient_id)
        .order_by(desc(BiometricsSnapshot.recorded_at))
        .limit(1)
    ).first()
    bio_id = str(brow[0]) if brow else None

    return LabsExternalContext(
        active_medications=active_medications,
        treatment_courses=treatment_courses,
        latest_qeeg_analysis_id=latest_qeeg,
        latest_mri_analysis_id=latest_mri,
        fusion_case_id=fusion_id,
        deeptwin_last_run_id=deeptwin_id,
        biometrics_snapshot_id=bio_id,
    )


def _medication_lab_monitor_notes(medications: list[dict[str, Any]], results: list[LabResultRecord]) -> list[str]:
    names = " ".join(
        str(m.get("generic_name") or m.get("name") or "") for m in medications
    ).lower()
    notes: list[str] = []
    has = {r.analyte_code for r in results}
    if any(x in names for x in ("valpro", "depak", "divalpro")) and "1742-6" not in has and "1920-8" not in has:
        notes.append("Valproate exposure — consider monitoring LFTs / ammonia per protocol if clinically indicated.")
    if ("lithium" in names or "lithobid" in names) and "3094-0" not in has:
        notes.append("Lithium — renal function and electrolytes should be tracked per monitoring protocol.")
    if any(x in names for x in ("warfarin", "coumadin")) and "5902-2" not in has and "6301-6" not in has:
        notes.append("Warfarin — correlate INR / CBC with bleeding risk if clinically indicated.")
    if any(x in names for x in ("methotrex",)) and "1742-6" not in has:
        notes.append("Methotrexate — hepatic monitoring may be indicated depending on dose/route.")
    return notes


def _confounds_from_context(ext: LabsExternalContext, results: list[LabResultRecord]) -> list[LabConfoundFlag]:
    out: list[LabConfoundFlag] = []
    abn_ids = [r.id for r in results if r.abnormality_direction in ("low", "high")]
    if not abn_ids:
        return out
    if ext.latest_qeeg_analysis_id:
        out.append(
            LabConfoundFlag(
                id="cf-ctx-qeeg",
                target_analyzer="qeeg-analysis",
                strength="moderate",
                confound_risk_score=0.5,
                rationale="Abnormal labs present — interpret latest qEEG in biological context.",
                supporting_result_ids=abn_ids[:5],
            )
        )
    if ext.latest_mri_analysis_id:
        out.append(
            LabConfoundFlag(
                id="cf-ctx-mri",
                target_analyzer="mri-analysis",
                strength="moderate",
                confound_risk_score=0.48,
                rationale="Renal/metabolic issues may affect contrast planning and systemic comorbidity framing.",
                supporting_result_ids=abn_ids[:5],
            )
        )
    if ext.deeptwin_last_run_id:
        out.append(
            LabConfoundFlag(
                id="cf-ctx-dt",
                target_analyzer="deeptwin",
                strength="moderate",
                confound_risk_score=0.46,
                rationale="Refresh multimodal integration — labs add biological confounds to fused summaries.",
                supporting_result_ids=abn_ids[:5],
            )
        )
    return out


def _build_multimodal_links_from_context(patient_id: str, ext: LabsExternalContext) -> list[MultimodalLink]:
    out: list[MultimodalLink] = [
        MultimodalLink(
            target_page="medication-analyzer",
            label="Medication Analyzer",
            rationale="Cross-check labs with active medications and monitoring expectations.",
        ),
        MultimodalLink(
            target_page="treatment-sessions-analyzer",
            label="Treatment Sessions",
            rationale="Relate neuromodulation course timing with labs and tolerability.",
        ),
        MultimodalLink(
            target_page="wearables",
            label="Biometrics",
            rationale="HRV, sleep, vitals — covary with anemia, thyroid, metabolic stress.",
        ),
        MultimodalLink(
            target_page="risk-analyzer",
            label="Risk Analyzer",
            rationale="Safety models may shift when biology changes.",
        ),
        MultimodalLink(
            target_page="assessments-v2",
            label="Assessments",
            rationale="Symptom scales before/after biological correction.",
        ),
    ]
    if ext.latest_qeeg_analysis_id:
        out.append(
            MultimodalLink(
                target_page="qeeg-analysis",
                label="qEEG Analyzer",
                rationale="Latest completed qEEG — interpret alongside metabolic/inflammatory context.",
                resource_id=ext.latest_qeeg_analysis_id,
            )
        )
    else:
        out.append(
            MultimodalLink(
                target_page="qeeg-analysis",
                label="qEEG Analyzer",
                rationale="No completed qEEG — upload or run analysis for multimodal context.",
            )
        )
    if ext.latest_mri_analysis_id:
        out.append(
            MultimodalLink(
                target_page="mri-analysis",
                label="MRI Analyzer",
                rationale="Latest MRI — renal/contrast and systemic illness context.",
                resource_id=ext.latest_mri_analysis_id,
            )
        )
    else:
        out.append(
            MultimodalLink(
                target_page="mri-analysis",
                label="MRI Analyzer",
                rationale="No completed MRI — add imaging when clinically indicated.",
            )
        )
    fus_r = (
        f"Most recent fusion case {ext.fusion_case_id} — integrate labs as biological context."
        if ext.fusion_case_id
        else "Open fusion workbench to build a multimodal summary including labs."
    )
    out.append(
        MultimodalLink(
            target_page="fusion-workbench",
            label="Fusion workbench",
            rationale=fus_r,
            resource_id=ext.fusion_case_id,
        )
    )
    out.append(
        MultimodalLink(
            target_page="deeptwin",
            label="DeepTwin",
            rationale="Multimodal correlation view — refresh after lab updates.",
            resource_id=ext.deeptwin_last_run_id,
        )
    )
    out.append(
        MultimodalLink(
            target_page="research-evidence",
            label="87k evidence corpus",
            rationale="Search PubMed-linked corpus for lab interpretation, monitoring, and confounds.",
        )
    )
    return out


def _labs_evidence_query(
    *,
    patient_id: str,
    primary_condition: str | None,
    medications: list[dict[str, Any]],
    abnormal_terms: list[str],
    db: Session | None,
) -> tuple[LabsEvidenceBrief | None, list[str]]:
    from app.services.evidence_intelligence import EvidenceFeatureSummary, EvidenceQuery, query_evidence

    med_names = [str(m.get("name") or "") for m in medications[:12]]
    feats = [
        EvidenceFeatureSummary(name="lab_flag", value=t, modality="laboratory")
        for t in (abnormal_terms or [])[:8]
    ]
    query = EvidenceQuery(
        patient_id=patient_id,
        context_type="biomarker",
        target_name="blood biomarker longitudinal monitoring",
        modality_filters=["laboratory", "clinical chemistry"],
        diagnosis_filters=[primary_condition] if primary_condition else [],
        medications=med_names,
        phenotype_tags=(abnormal_terms or [])[:10],
        feature_summary=feats,
        max_results=6,
    )
    res = query_evidence(query, db)
    pmids = []
    for p in res.supporting_papers[:6]:
        if p.pmid:
            pmids.append(str(p.pmid))
    brief = LabsEvidenceBrief(
        finding_id=res.finding_id,
        literature_summary=(res.literature_summary or "")[:2400],
        confidence_score=float(res.confidence_score or 0),
        top_pmids=pmids[:8],
    )
    return brief, [res.finding_id]


def _labs_ai_narrative(
    *,
    patient_name: str,
    snapshot: LabSnapshot,
    external: LabsExternalContext,
    evidence_summary: str,
) -> str | None:
    try:
        from app.services.chat_service import _llm_chat
    except ImportError:
        return None
    sys = (
        "You are a clinical decision-support assistant for physicians. "
        "Write 3-5 short bullet points integrating labs with medications and modalities. "
        "Use cautious language: 'possible contributor', 'consider', 'may'. "
        "Never diagnose or claim certainty. If evidence excerpt is empty, still give generic cautious guidance."
    )
    user = {
        "patient_label": patient_name,
        "lab_snapshot": snapshot.model_dump(),
        "medications_count": len(external.active_medications),
        "modalities": {
            "qeeg": external.latest_qeeg_analysis_id,
            "mri": external.latest_mri_analysis_id,
            "fusion": external.fusion_case_id,
            "deeptwin": external.deeptwin_last_run_id,
        },
        "evidence_excerpt": evidence_summary[:1200],
    }
    import json

    try:
        text = _llm_chat(
            system=sys,
            messages=[{"role": "user", "content": json.dumps(user)}],
            max_tokens=400,
            temperature=0.25,
            not_configured_message="__not_configured__",
        )
    except Exception as exc:  # noqa: BLE001
        _LOG.debug("labs AI narrative failed: %s", exc)
        return "LLM unavailable — use structured panels and literature excerpt below."
    if not text or "__not_configured__" in text:
        return "LLM not configured — structured rules and evidence excerpt remain authoritative."
    return text.strip()


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


def _completeness(results: list[LabResultRecord]) -> float:
    # Rough scaffold: more results → higher score; cap at 0.95
    base = min(0.95, 0.35 + 0.08 * len(results))
    return round(base, 2)


def recompute_and_payload(
    patient_id: str,
    db: Session,
    *,
    patient_name: str | None = None,
    primary_condition: str | None = None,
    actor_id: str | None = None,
    include_ai_narrative: bool = False,
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
    return build_labs_analyzer_payload(
        patient_id,
        db,
        patient_name=patient_name,
        primary_condition=primary_condition,
        include_ai_narrative=include_ai_narrative,
    )

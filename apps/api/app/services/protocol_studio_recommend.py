"""Deterministic protocol ranking for Protocol Studio — no LLM, no invented evidence."""

from __future__ import annotations

import re
from typing import Any, TypedDict

from app.services.knowledge.adverse_event_inventory import ADVERSE_EVENT_DECISION_SUPPORT_DISCLAIMER
from app.services.registries import list_protocols as registry_list_protocols


class RecommendRequestDict(TypedDict, total=False):
    patient_id: str | None
    condition: str
    modalities: list[str]
    qeeg_summary: str | None
    mri_summary: str | None
    contraindications: list[str]
    available_devices: list[str]
    desired_outcome_domain: str | None


def _normalize_off_label(text: str | None) -> bool:
    raw = (text or "").strip().lower()
    if raw.startswith("off"):
        return True
    if raw.startswith("on"):
        return False
    return True


def _is_research_only(row: dict[str, Any]) -> bool:
    review_status = str(row.get("review_status") or "").strip().lower()
    notes = str(row.get("notes") or "").strip().lower()
    return ("research" in review_status) or ("research only" in notes) or ("research-only" in notes)


def _grade_weight(evidence_grade: str | None) -> float:
    if not evidence_grade:
        return 0.5
    g = evidence_grade.strip().upper().replace("EV-", "")
    return {"A": 5.0, "B": 4.0, "C": 3.0, "D": 2.0, "E": 1.0, "N/A": 0.5}.get(g, 1.0)


def _refs(row: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for k in ("source_url_primary", "source_url_secondary"):
        v = str(row.get(k) or "").strip()
        if v:
            out.append(v)
    return out


def registry_row_parameter_summary(row: dict[str, Any]) -> str:
    """Public helper for API catalog rows."""
    return _parameter_summary(row)


def _parameter_summary(row: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, label in (
        ("frequency_hz", "Hz"),
        ("intensity", ""),
        ("sessions_per_week", "sessions/wk"),
        ("total_course", "course"),
        ("target_region", "target"),
    ):
        v = row.get(key)
        if v is None:
            continue
        s = str(v).strip()
        if not s:
            continue
        parts.append(f"{s} {label}".strip())
    return " · ".join(parts[:6]) if parts else ""


def _condition_match_score(row: dict[str, Any], condition: str) -> float:
    cid = str(row.get("condition_id") or "").strip().lower()
    cq = condition.strip().lower()
    if not cq:
        return 3.0
    if cid == cq:
        return 10.0
    if cq in cid or cid in cq:
        return 6.0
    return 0.0


def _modality_match(row: dict[str, Any], modalities: list[str]) -> float:
    if not modalities:
        return 3.0
    mid = str(row.get("modality_id") or "").strip().lower()
    wanted = {m.strip().lower() for m in modalities if m and str(m).strip()}
    if not mid:
        return 0.0
    return 5.0 if mid in wanted else 0.0


def _device_match(row: dict[str, Any], devices: list[str]) -> float:
    if not devices:
        return 1.0
    dev = str(row.get("device_id_if_specific") or "").strip().lower()
    wanted = {d.strip().lower() for d in devices if d and str(d).strip()}
    if not dev:
        return 1.0
    return 3.0 if dev in wanted else 0.0


def _contraindication_penalty(row: dict[str, Any], contra: list[str]) -> float:
    text = str(row.get("contraindication_check_required") or "").lower()
    if not text or not contra:
        return 0.0
    hits = 0
    for c in contra:
        w = str(c).strip().lower()
        if len(w) >= 3 and w in text:
            hits += 1
    return -5.0 * min(hits, 3)


def _target_alignment(row: dict[str, Any], qeeg: str | None, mri: str | None) -> float:
    tgt = str(row.get("target_region") or "").lower()
    bonus = 0.0
    blob = " ".join([qeeg or "", mri or ""]).lower()
    if not tgt or not blob.strip():
        return 0.0
    for token in re.split(r"[^\w]+", tgt):
        if len(token) >= 3 and token in blob:
            bonus += 2.0
    return min(bonus, 6.0)


def _score_row(
    row: dict[str, Any],
    *,
    condition: str,
    modalities: list[str],
    contraindications: list[str],
    available_devices: list[str],
    qeeg_summary: str | None,
    mri_summary: str | None,
) -> tuple[float, list[str]]:
    refs = _refs(row)
    reasons: list[str] = []
    if _is_research_only(row):
        return (-1000.0, ["research_only_registry_entry"])

    gwt = _grade_weight(row.get("evidence_grade"))
    reasons.append(f"evidence_grade_weight={gwt:.1f}")

    ev_ct = float(len(refs))
    reasons.append(f"registry_reference_links={int(ev_ct)}")

    cms = _condition_match_score(row, condition)
    reasons.append(f"condition_match={cms:.1f}")

    mms = _modality_match(row, modalities)
    reasons.append(f"modality_eligibility={mms:.1f}")

    dms = _device_match(row, available_devices)
    reasons.append(f"device_availability={dms:.1f}")

    pen = _contraindication_penalty(row, contraindications)
    if pen:
        reasons.append(f"contraindication_overlap_penalty={pen:.1f}")

    off = _normalize_off_label(row.get("on_label_vs_off_label"))
    off_pen = -5.0 if off else 0.0
    if off_pen:
        reasons.append("off_label_penalty=-5.0")

    tgt_b = _target_alignment(row, qeeg_summary, mri_summary)
    if tgt_b:
        reasons.append(f"imaging_summary_target_alignment={tgt_b:.1f}")

    missing_pen = -3.0 if not refs else 0.0
    if missing_pen:
        reasons.append("missing_registry_reference_links_penalty=-3.0")

    score = (
        gwt * 2.0
        + ev_ct * 1.5
        + cms
        + mms
        + dms
        + pen
        + off_pen
        + tgt_b
        + missing_pen
    )
    return score, reasons


def build_protocol_recommendation(req: RecommendRequestDict) -> dict[str, Any]:
    """Return grouped ranked options and overall top 3 (deterministic)."""
    condition = (req.get("condition") or "").strip()
    modalities = list(req.get("modalities") or [])
    contraindications = list(req.get("contraindications") or [])
    devices = list(req.get("available_devices") or [])
    qeeg = (req.get("qeeg_summary") or "").strip() or None
    mri = (req.get("mri_summary") or "").strip() or None
    patient_id = (req.get("patient_id") or "").strip() or None

    rows = registry_list_protocols()
    scored: list[tuple[float, dict[str, Any], list[str]]] = []
    not_recommended: list[dict[str, Any]] = []

    missing_data: list[str] = []
    if not condition:
        missing_data.append("condition")

    safety_flags: list[str] = [
        "Adverse-event sources provide signal detection only. Spontaneous reports do not prove causality or clinical clearance.",
        "Review medication context, seizure-threshold factors, and source availability before TMS/tDCS/DBS/VNS/neurofeedback planning.",
        "Specialized genomics can provide possible disease-specific genetic context only; it is not predictive of treatment response or determinative for protocol selection.",
    ]

    for row in rows:
        sid = str(row.get("id") or "").strip()
        if not sid:
            continue
        score, reasons = _score_row(
            row,
            condition=condition,
            modalities=modalities,
            contraindications=contraindications,
            available_devices=devices,
            qeeg_summary=qeeg,
            mri_summary=mri,
        )
        if score < -100:
            not_recommended.append(
                {
                    "protocol_id": sid,
                    "title": str(row.get("name") or sid),
                    "score": score,
                    "reasons": reasons,
                    "research_only": True,
                }
            )
            continue
        scored.append((score, row, reasons))

    scored.sort(key=lambda x: x[0], reverse=True)

    def _to_option(tup: tuple[float, dict[str, Any], list[str]], *, pool: str) -> dict[str, Any]:
        score, row, reasons = tup
        sid = str(row.get("id") or "")
        refs = _refs(row)
        off = _normalize_off_label(row.get("on_label_vs_off_label"))
        research = _is_research_only(row)
        modality = str(row.get("modality_id") or "")
        target = str(row.get("target_region") or "")
        conf = min(0.95, max(0.15, (score + 5.0) / 25.0))
        fit = (
            f"Ranked in '{pool}' pool from registry match, evidence links, and eligibility rules. "
            f"Not a treatment order — clinician review required."
        )
        if patient_id:
            fit += " Patient context id supplied — verify fit against chart, imaging, and clinic policy."
        fit += (
            " Adverse-event source review remains required; spontaneous-report associations are source-limited "
            "and do not clear a patient for stimulation."
        )
        fit += (
            " Genetic associations, if available, are research-grade context only and require clinician or "
            "genetic specialist review."
        )
        return {
            "protocol_id": sid,
            "title": str(row.get("name") or sid),
            "score": round(score, 3),
            "rank_reasons": reasons,
            "evidence_grade": row.get("evidence_grade"),
            "evidence_count": len(refs),
            "paper_links": refs,
            "patient_fit_rationale": fit,
            "safety_notes": [str(row.get("contraindication_check_required") or "").strip()][:1]
            if row.get("contraindication_check_required")
            else [],
            "missing_data_hints": [] if refs else ["registry_reference_links"],
            "confidence": round(conf, 3),
            "off_label": off,
            "research_only": research,
            "modality": modality or None,
            "target_region": target or None,
            "parameter_summary": _parameter_summary(row),
        }

    evidence_backed: list[dict[str, Any]] = []
    imaging_guided: list[dict[str, Any]] = []
    personalized: list[dict[str, Any]] = []

    for tup in scored:
        _, row, _ = tup
        modality = str(row.get("modality_id") or "").lower()
        align = _target_alignment(row, qeeg, mri)
        imaging_hint = align > 0 or any(
            x in modality for x in ("eeg", "qeeg", "fmri", "mri", "nirs", "pet")
        )
        if imaging_hint:
            imaging_guided.append(_to_option(tup, pool="imaging_guided"))
        if patient_id:
            personalized.append(_to_option(tup, pool="personalized"))
        evidence_backed.append(_to_option(tup, pool="evidence_backed"))

    top3_source = [t for t in scored if t[0] > -100][:3]
    overall_top_3 = [_to_option(t, pool="overall") for t in top3_source]

    return {
        "evidence_backed_options": evidence_backed[:12],
        "personalized_options": personalized[:12] if patient_id else [],
        "imaging_guided_options": imaging_guided[:12],
        "overall_top_3": overall_top_3,
        "not_recommended": not_recommended[:20],
        "missing_data": missing_data,
        "safety_flags": safety_flags,
        "ranking_note": (
            "Protocol rankings are decision-support summaries based on available registry/evidence data. "
            "They are not treatment orders and do not replace clinical judgement. "
            + ADVERSE_EVENT_DECISION_SUPPORT_DISCLAIMER
        ),
    }

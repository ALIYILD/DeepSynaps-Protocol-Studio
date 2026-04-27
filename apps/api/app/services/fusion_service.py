<<<<<<< HEAD
<<<<<<< HEAD
=======
"""Fusion service — load the latest qEEG + MRI analyses and combine them.

Implements CONTRACT_V3.md §1 ``FusionRecommendation`` by orchestrating
the pure-Python :mod:`deepsynaps_qeeg.ai.fusion` module:

1. Load most-recent completed qEEG analysis (status=``completed``).
2. Load most-recent successful MRI analysis (state=``SUCCESS``).
3. Run the qEEG protocol recommender via the existing
   :mod:`app.services.qeeg_ai_bridge` façade.
4. Build an MRI-side recommendation envelope directly from
   ``mri_row.stim_targets_json`` (MRI already stores targets).
5. Call :func:`fusion.combine_recommendations` to merge the two.
6. Optionally rewrite the ``summary`` via an LLM when
   ``llm_narrative=True`` and an Anthropic/OpenAI key is configured.
7. Scrub banned words unconditionally.

Pure orchestration — no DB writes apart from reads. Audit-row writes
live in the router layer.
"""
>>>>>>> origin/integrate/mri-qeeg-fusion-timeline
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
from __future__ import annotations

import json
import logging
<<<<<<< HEAD
<<<<<<< HEAD
=======
import re
>>>>>>> origin/integrate/mri-qeeg-fusion-timeline
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import MriAnalysis, QEEGAnalysis

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
logger = logging.getLogger(__name__)


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Fusion service could not decode persisted JSON payload")
        return None


def _qeeg_payload(row: QEEGAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    flagged = _load_json(getattr(row, "flagged_conditions", None))
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "analysis_status": row.analysis_status,
        "band_powers": _load_json(row.band_powers_json),
        "advanced_analyses": _load_json(row.advanced_analyses_json),
        "brain_age": _load_json(getattr(row, "brain_age_json", None)),
        "risk_scores": _load_json(getattr(row, "risk_scores_json", None)),
        "protocol_recommendation": _load_json(getattr(row, "protocol_recommendation_json", None)),
        "flagged_conditions": flagged if isinstance(flagged, list) else [],
        "similar_cases": _load_json(getattr(row, "similar_cases_json", None)),
        "quality_metrics": _load_json(getattr(row, "quality_metrics_json", None)),
        "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _mri_payload(row: MriAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "analysis_id": row.analysis_id,
        "patient_id": row.patient_id,
        "state": row.state,
        "modalities_present": _load_json(row.modalities_present_json),
        "structural": _load_json(row.structural_json),
        "functional": _load_json(row.functional_json),
        "diffusion": _load_json(row.diffusion_json),
        "stim_targets": _load_json(row.stim_targets_json),
        "qc": _load_json(row.qc_json),
        "condition": row.condition,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _latest_qeeg_analysis(db: Session, patient_id: str) -> QEEGAnalysis | None:
    return (
        db.query(QEEGAnalysis)
        .filter(
            QEEGAnalysis.patient_id == patient_id,
            QEEGAnalysis.analysis_status == "completed",
        )
        .order_by(QEEGAnalysis.analyzed_at.desc(), QEEGAnalysis.created_at.desc())
        .first()
    )


def _latest_mri_analysis(db: Session, patient_id: str) -> MriAnalysis | None:
    return (
        db.query(MriAnalysis)
        .filter(
            MriAnalysis.patient_id == patient_id,
            MriAnalysis.state == "SUCCESS",
        )
        .order_by(MriAnalysis.created_at.desc())
        .first()
    )


def build_fusion_recommendation(db: Session, patient_id: str) -> dict[str, Any]:
<<<<<<< HEAD
    try:
        from deepsynaps_qeeg.ai.fusion import synthesize_fusion_recommendation
        _has_fusion = True
    except ImportError:
        _has_fusion = False
=======
    from deepsynaps_qeeg.ai.fusion import synthesize_fusion_recommendation
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508

    qeeg_row = _latest_qeeg_analysis(db, patient_id)
    mri_row = _latest_mri_analysis(db, patient_id)

<<<<<<< HEAD
    _disclaimer = (
        "Confidence score is algorithmic heuristic and not evidence-graded clinical validation. "
        "Always review recommendations against patient-specific context."
    )
    if not _has_fusion:
        return {
            "patient_id": patient_id,
            "recommendation": None,
            "summary": "Fusion AI module not available in this environment.",
            "confidence": None,
            "confidence_disclaimer": _disclaimer,
            "confidence_grade": "heuristic",
            "qeeg_analysis_id": qeeg_row.id if qeeg_row else None,
            "mri_analysis_id": mri_row.analysis_id if mri_row else None,
            "error": "deepsynaps_qeeg.ai.fusion not installed",
        }

    result = synthesize_fusion_recommendation(
=======
    return synthesize_fusion_recommendation(
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
        patient_id=patient_id,
        qeeg_analysis_id=qeeg_row.id if qeeg_row else None,
        qeeg=_qeeg_payload(qeeg_row),
        mri_analysis_id=mri_row.analysis_id if mri_row else None,
        mri=_mri_payload(mri_row),
    )
<<<<<<< HEAD
    result.setdefault("confidence_disclaimer", _disclaimer)
    result.setdefault("confidence_grade", "heuristic")
    return result
=======
log = logging.getLogger(__name__)


HAS_FUSION: bool = True  # Pure-Python; always available.


_DISCLAIMER: str = (
    "Decision-support tool. Not a medical device. Multi-modal convergent "
    "findings are research/wellness indicators only."
)

_BANNED_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"treatment recommendations?", re.IGNORECASE), "protocol consideration"),
    (re.compile(r"\bdiagnos\w*", re.IGNORECASE), "finding"),
]


# ── Public API ──────────────────────────────────────────────────────────────


async def recommend_fusion_for_patient(
    patient_id: str,
    db: Session,
    *,
    llm_narrative: bool = True,
) -> dict[str, Any]:
    """Return a ``FusionRecommendation`` envelope for ``patient_id``.

    Parameters
    ----------
    patient_id : str
        The patient id to load analyses for.
    db : Session
        An open SQLAlchemy session.
    llm_narrative : bool, default True
        When True and an Anthropic/OpenAI key is configured, rewrite the
        envelope's ``summary`` with a grounded one-paragraph narrative.

    Returns
    -------
    dict
        A ``FusionRecommendation`` dict per CONTRACT_V3 §1.
    """
    # 1. Load latest qEEG analysis (completed) ----------------------------
    qeeg_row = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=patient_id, analysis_status="completed")
        .order_by(QEEGAnalysis.created_at.desc())
        .first()
    )
    # 2. Load latest MRI analysis (SUCCESS) -------------------------------
    mri_row = (
        db.query(MriAnalysis)
        .filter_by(patient_id=patient_id, state="SUCCESS")
        .order_by(MriAnalysis.created_at.desc())
        .first()
    )

    qeeg_row_dict = _qeeg_row_to_dict(qeeg_row) if qeeg_row else None
    mri_row_dict = _mri_row_to_dict(mri_row) if mri_row else None

    # 3. Neither present → empty envelope ---------------------------------
    if qeeg_row is None and mri_row is None:
        from deepsynaps_qeeg.ai import fusion
        env = fusion.combine_recommendations(None, None)
        env["patient_id"] = patient_id
        env["summary"] = "No analyses found for this patient."
        return _sanitise_envelope(env)

    # 4. Build qEEG recommendations via the bridge ------------------------
    qeeg_rec: dict | None = None
    if qeeg_row is not None:
        qeeg_rec = _run_qeeg_recommender(qeeg_row_dict or {})

    # 5. Build MRI recommendations from stim_targets ----------------------
    mri_rec: dict | None = None
    if mri_row is not None:
        mri_rec = _build_mri_recommendations(mri_row_dict or {})

    # 6. Fuse -------------------------------------------------------------
    from deepsynaps_qeeg.ai import fusion

    env = fusion.combine_recommendations(
        qeeg_rec,
        mri_rec,
        qeeg_row=qeeg_row_dict,
        mri_row=mri_row_dict,
    )
    env["patient_id"] = patient_id
    env["qeeg_analysis_id"] = qeeg_row.id if qeeg_row else None
    env["mri_analysis_id"] = mri_row.analysis_id if mri_row else None

    # 7. Optional LLM narrative rewrite -----------------------------------
    if llm_narrative:
        try:
            new_summary = await _rewrite_summary_via_llm(env)
            if new_summary:
                env["summary"] = new_summary
        except Exception as exc:  # pragma: no cover - LLM path is optional
            log.warning("Fusion LLM narrative failed: %s", exc)

    return _sanitise_envelope(env)


# ── Row → dict helpers ──────────────────────────────────────────────────────


def _maybe_load(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None
    return None


def _qeeg_row_to_dict(row: QEEGAnalysis) -> dict[str, Any]:
    """Flatten a ``QEEGAnalysis`` row into a plain dict for the fusion layer."""
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "features": _extract_qeeg_features(row),
        "zscores": _maybe_load(row.normative_zscores_json) or {},
        "normative_zscores": _maybe_load(row.normative_zscores_json) or {},
        "asymmetry": _maybe_load(row.asymmetry_json) or {},
        "risk_scores": _maybe_load(row.risk_scores_json) or {},
        "flagged_conditions": _maybe_load(row.flagged_conditions) or [],
        "embedding": _maybe_load(row.embedding_json),
    }


def _extract_qeeg_features(row: QEEGAnalysis) -> dict[str, Any]:
    """Assemble a single ``features`` dict from the qEEG row JSON columns."""
    bands = _maybe_load(row.band_powers_json) or {}
    aperiodic = _maybe_load(row.aperiodic_json) or {}
    paf = _maybe_load(row.peak_alpha_freq_json) or {}
    conn = _maybe_load(row.connectivity_json) or {}
    asym = _maybe_load(row.asymmetry_json) or {}
    graph = _maybe_load(row.graph_metrics_json) or {}
    source = _maybe_load(row.source_roi_json) or {}
    spectral = {"bands": bands.get("bands") or bands, "aperiodic": aperiodic,
                "peak_alpha_freq": paf}
    return {
        "spectral": spectral,
        "connectivity": conn,
        "asymmetry": asym,
        "graph": graph,
        "source": source,
    }


def _mri_row_to_dict(row: MriAnalysis) -> dict[str, Any]:
    """Flatten an ``MriAnalysis`` row."""
    return {
        "analysis_id": row.analysis_id,
        "patient_id": row.patient_id,
        "structural": _maybe_load(row.structural_json) or {},
        "functional": _maybe_load(row.functional_json) or {},
        "diffusion": _maybe_load(row.diffusion_json) or {},
        "stim_targets": _maybe_load(row.stim_targets_json) or [],
        "condition": row.condition,
    }


# ── Recommender callers ─────────────────────────────────────────────────────


def _run_qeeg_recommender(qeeg_row: dict[str, Any]) -> dict | None:
    """Call the qEEG protocol recommender via the bridge."""
    try:
        from app.services.qeeg_ai_bridge import (
            HAS_PROTOCOL_RECOMMENDER,
            run_recommend_protocol_safe,
        )
    except Exception as exc:  # pragma: no cover
        log.warning("qeeg_ai_bridge import failed: %s", exc)
        return None
    if not HAS_PROTOCOL_RECOMMENDER:
        return None
    features = qeeg_row.get("features") or {}
    zscores = qeeg_row.get("zscores") or {}
    risk_scores = qeeg_row.get("risk_scores") or {}
    flagged = qeeg_row.get("flagged_conditions") or []
    embedding = qeeg_row.get("embedding")
    env = run_recommend_protocol_safe(
        features,
        risk_scores,
        zscores=zscores,
        flagged_conditions=flagged,
        embedding=embedding if isinstance(embedding, list) else None,
    )
    if not env or not env.get("success"):
        log.info("qEEG recommender envelope failure: %s",
                 env.get("error") if env else None)
        return None
    return env.get("data") or None


def _build_mri_recommendations(mri_row: dict[str, Any]) -> dict | None:
    """Project ``mri_row.stim_targets`` into a ``ProtocolRecommendation`` list."""
    targets = mri_row.get("stim_targets") or []
    if not targets:
        return None

    out: list[dict] = []
    for t in targets:
        if not isinstance(t, dict):
            continue
        region_code = t.get("region_code")
        region_name = t.get("region_name") or region_code or "unknown"
        modality = _normalise_mri_modality(str(t.get("modality") or ""))
        params = t.get("suggested_parameters") or {}
        sessions = int(params.get("sessions") or 30)
        intensity = _format_mri_intensity(t)
        dois = t.get("method_reference_dois") or []
        citations = [
            {"n": i + 1, "pmid": None, "doi": d, "title": "",
             "url": f"https://doi.org/{d}" if d else ""}
            for i, d in enumerate(dois)
        ]
        conf_map = {"low": "low", "medium": "moderate", "high": "high"}
        confidence = conf_map.get(str(t.get("confidence") or "medium"), "moderate")
        rationale = (
            f"MRI-derived target via {t.get('method') or 'n/a'} at "
            f"MNI {tuple(t.get('mni_xyz') or ())}."
        )
        out.append({
            "primary_modality": modality,
            "target_region": region_name,
            "region_code": region_code,
            "dose": {
                "sessions": sessions,
                "intensity": intensity,
                "duration_min": int(params.get("duration_min") or 30),
                "frequency": "5x/week" if modality.startswith("rtms") else "per clinician",
            },
            "session_plan": _sozo_from_sessions(sessions, modality),
            "contraindications": _mri_contraindications(modality),
            "expected_response_window_weeks": [4, 8],
            "citations": citations,
            "confidence": confidence,
            "alternative_protocols": [],
            "rationale": rationale,
            "mni_xyz": list(t.get("mni_xyz") or []),
        })

    return {"recommendations": out}


def _normalise_mri_modality(modality: str) -> str:
    m = (modality or "").lower()
    if m == "rtms":
        return "rtms_10hz"
    if m == "tps":
        return "tps"
    if m == "tfus":
        return "tfus"
    if m == "tdcs":
        return "tdcs_2ma"
    if m == "tacs":
        return "tacs"
    return m or "unknown"


def _format_mri_intensity(t: dict) -> str:
    params = t.get("suggested_parameters") or {}
    rmt = params.get("intensity_pct_rmt")
    if rmt is not None:
        return f"{rmt}% RMT"
    mi = params.get("mechanical_index")
    if mi is not None:
        return f"MI={mi}"
    return "device-default"


def _sozo_from_sessions(total: int, modality: str) -> dict:
    induction = max(1, total // 3)
    consolidation = max(1, total // 3)
    maintenance = max(0, total - induction - consolidation)
    return {
        "induction": {"sessions": induction,
                      "notes": f"S phase: induce plasticity with {modality}."},
        "consolidation": {"sessions": consolidation,
                          "notes": "O-Z phase: taper cadence; pair with behavioural loading."},
        "maintenance": {"sessions": maintenance,
                        "notes": "O phase: clinician-gated maintenance."},
    }


def _mri_contraindications(modality: str) -> list[str]:
    if modality.startswith("rtms") or modality == "tms":
        return ["seizure history", "ferromagnetic implants near coil"]
    if modality.startswith("tfus"):
        return ["active brain tumour at target", "pregnancy (relative)"]
    if modality.startswith("tdcs"):
        return ["scalp skin breakdown", "metallic cranial implant under electrode"]
    if modality == "tps":
        return ["recent hemorrhage", "implanted metal near target"]
    return []


# ── LLM narrative ───────────────────────────────────────────────────────────


async def _rewrite_summary_via_llm(env: dict) -> str | None:
    """Have the LLM rewrite the envelope's summary to ≤ 1200 chars.

    Grounded strictly in ``recommendations[*]`` — never cites unsourced
    claims. Returns ``None`` if no LLM is configured.
    """
    try:
        from app.services.chat_service import _llm_chat_async
    except Exception:
        return None

    recs = env.get("recommendations") or []
    if not recs:
        return None
    lines: list[str] = []
    for r in recs[:4]:
        lines.append(
            f"- modality={r.get('primary_modality')} "
            f"target={r.get('target_region')} "
            f"boost={r.get('fusion_boost')} "
            f"agreement={r.get('agreement_score')} "
            f"confidence={r.get('confidence')}"
        )
    system = (
        "You are a clinical decision-support assistant. Rewrite the "
        "summary of a multi-modal fusion recommendation in one paragraph "
        "(no more than 600 characters). Ground strictly in the bullet "
        "facts; never mention a modality or target not in the bullets. "
        "Avoid the words 'diagnose', 'diagnostic', and 'treatment "
        "recommendation'. Use 'protocol consideration' instead. Flag "
        "that this is research/wellness and not a medical device."
    )
    user = (
        "Fusion recommendations:\n" + "\n".join(lines)
        + "\n\nWrite the summary now."
    )
    reply = await _llm_chat_async(
        system=system,
        messages=[{"role": "user", "content": user}],
        max_tokens=400,
        temperature=0.2,
        not_configured_message="",
    )
    if not reply:
        return None
    reply = _sanitise_text(str(reply)).strip()
    return reply[:1200] if reply else None


# ── Sanitiser ───────────────────────────────────────────────────────────────


def _sanitise_text(text: str) -> str:
    out = text or ""
    for pat, replacement in _BANNED_PATTERNS:
        out = pat.sub(replacement, out)
    return out


def _sanitise_envelope(env: dict) -> dict:
    if isinstance(env.get("summary"), str):
        env["summary"] = _sanitise_text(env["summary"])[:1200]
    for rec in env.get("recommendations") or []:
        if isinstance(rec, dict) and isinstance(rec.get("rationale"), str):
            rec["rationale"] = _sanitise_text(rec["rationale"])[:1200]
    # Ensure disclaimer is always present.
    env.setdefault("disclaimer", _DISCLAIMER)
    return env


__all__ = ["HAS_FUSION", "recommend_fusion_for_patient"]
>>>>>>> origin/integrate/mri-qeeg-fusion-timeline
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508

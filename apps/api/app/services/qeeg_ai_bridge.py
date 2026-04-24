"""Façade wiring the new ``deepsynaps_qeeg.ai.*`` / ``deepsynaps_qeeg.ml.*``
scaffold modules into the Studio FastAPI layer.

This mirrors :mod:`app.services.qeeg_pipeline` but covers the ten AI
upgrades defined in ``CONTRACT_V2.md``. Every upgrade module is imported
under a ``try/except`` so the API worker starts cleanly even when the
heavy optional deps (``torch``, ``sentence_transformers``, ``captum``,
``pcntoolkit``, ``networkx``, ``plotly``…) are missing.

All ``run_*_safe`` helpers return a uniform envelope::

    {
      "success": bool,
      "data":    dict | list | None,
      "error":   str | None,
      "is_stub": bool,
    }

Routers never need a ``try/except`` — they can dispatch the return value
directly into an ``AnalysisOut`` response (persisting ``data`` when
``success`` is True).
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


# ── Import helpers ──────────────────────────────────────────────────────────


def _safe_import(modpath: str) -> tuple[Any, str]:
    """Import ``modpath`` under try/except — returning (module, error_msg)."""
    try:
        mod = __import__(modpath, fromlist=["*"])
        return mod, ""
    except Exception as exc:  # ImportError OR heavy-dep failure
        msg = f"{type(exc).__name__}: {exc}"
        log.info("qeeg_ai_bridge: %s unavailable (%s).", modpath, msg)
        return None, msg


_foundation_mod, _FOUNDATION_ERR = _safe_import("deepsynaps_qeeg.ml.foundation_embedding")
_brain_age_mod, _BRAIN_AGE_ERR = _safe_import("deepsynaps_qeeg.ml.brain_age")
_gamlss_mod, _GAMLSS_ERR = _safe_import("deepsynaps_qeeg.normative.gamlss")
_explainability_mod, _EXPLAIN_ERR = _safe_import("deepsynaps_qeeg.ai.explainability")
_risk_mod, _RISK_ERR = _safe_import("deepsynaps_qeeg.ai.risk_scores")
_similar_mod, _SIMILAR_ERR = _safe_import("deepsynaps_qeeg.ai.similar_cases")
_recommender_mod, _RECOMMENDER_ERR = _safe_import("deepsynaps_qeeg.ai.protocol_recommender")
_medrag_mod, _MEDRAG_ERR = _safe_import("deepsynaps_qeeg.ai.medrag")
_longitudinal_mod, _LONGITUDINAL_ERR = _safe_import("deepsynaps_qeeg.ai.longitudinal")
_copilot_mod, _COPILOT_ERR = _safe_import("deepsynaps_qeeg.ai.copilot")


HAS_FOUNDATION_EMBEDDING: bool = _foundation_mod is not None
HAS_BRAIN_AGE: bool = _brain_age_mod is not None
HAS_GAMLSS: bool = _gamlss_mod is not None
HAS_EXPLAINABILITY: bool = _explainability_mod is not None
HAS_RISK_SCORES: bool = _risk_mod is not None
HAS_SIMILAR_CASES: bool = _similar_mod is not None
HAS_PROTOCOL_RECOMMENDER: bool = _recommender_mod is not None
HAS_MEDRAG: bool = _medrag_mod is not None
HAS_LONGITUDINAL: bool = _longitudinal_mod is not None
HAS_COPILOT: bool = _copilot_mod is not None


# ── Envelope helpers ────────────────────────────────────────────────────────


def _error_envelope(mod_name: str, err: str) -> dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "error": (
            f"{mod_name} is not available on this worker. "
            f"Install the relevant extra to enable it. "
            f"(import error: {err or 'unknown'})"
        ),
        "is_stub": True,
    }


def _ok_envelope(data: Any, *, is_stub: bool = False) -> dict[str, Any]:
    """Wrap a successful result — detecting stub flags on the payload."""
    stubbed = bool(is_stub)
    if isinstance(data, dict) and data.get("is_stub"):
        stubbed = True
    return {
        "success": True,
        "data": data,
        "error": None,
        "is_stub": stubbed,
    }


def _call_safely(fn: Any, *args: Any, mod_name: str = "?", **kwargs: Any) -> dict[str, Any]:
    """Invoke ``fn(*args, **kwargs)`` — never raising."""
    try:
        result = fn(*args, **kwargs)
    except Exception as exc:
        log.exception("qeeg_ai_bridge: %s failed", mod_name)
        return {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }
    return _ok_envelope(result)


# ── Upgrade 1: foundation embedding ─────────────────────────────────────────


def run_compute_embedding_safe(epochs: Any, **kwargs: Any) -> dict[str, Any]:
    """Call :func:`deepsynaps_qeeg.ml.foundation_embedding.compute_embedding`."""
    if not HAS_FOUNDATION_EMBEDDING:
        return _error_envelope("foundation_embedding", _FOUNDATION_ERR)
    return _call_safely(
        _foundation_mod.compute_embedding,
        epochs,
        mod_name="compute_embedding",
        **kwargs,
    )


# ── Upgrade 2: brain age ────────────────────────────────────────────────────


def run_predict_brain_age_safe(features: dict, **kwargs: Any) -> dict[str, Any]:
    if not HAS_BRAIN_AGE:
        return _error_envelope("brain_age", _BRAIN_AGE_ERR)
    return _call_safely(
        _brain_age_mod.predict_brain_age,
        features,
        mod_name="predict_brain_age",
        **kwargs,
    )


# ── Upgrade 4: GAMLSS centiles ──────────────────────────────────────────────


def run_fit_centiles_safe(features: dict, **kwargs: Any) -> dict[str, Any]:
    if not HAS_GAMLSS:
        return _error_envelope("gamlss", _GAMLSS_ERR)
    # Try a handful of likely function names — the scaffold API is still
    # being finalised by Agent E. Fall back to an explicit error envelope
    # when none match.
    for fn_name in ("fit_centiles", "compute_centiles", "score_centiles"):
        fn = getattr(_gamlss_mod, fn_name, None)
        if fn is not None:
            return _call_safely(fn, features, mod_name=fn_name, **kwargs)
    return _error_envelope("gamlss", "no compute_centiles function found")


# ── Upgrade 7: explainability ───────────────────────────────────────────────


def run_explain_safe(
    features: dict,
    risk_scores: dict | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    if not HAS_EXPLAINABILITY:
        return _error_envelope("explainability", _EXPLAIN_ERR)
    for fn_name in ("compute_explanations", "explain", "explain_risk_scores"):
        fn = getattr(_explainability_mod, fn_name, None)
        if fn is not None:
            return _call_safely(
                fn,
                features,
                risk_scores,
                mod_name=fn_name,
                **kwargs,
            )
    return _error_envelope("explainability", "no explain function found")


# ── Upgrade 6: risk scores ──────────────────────────────────────────────────


def run_score_conditions_safe(features: dict, **kwargs: Any) -> dict[str, Any]:
    if not HAS_RISK_SCORES:
        return _error_envelope("risk_scores", _RISK_ERR)
    for fn_name in ("score_conditions", "compute_risk_scores", "score_all"):
        fn = getattr(_risk_mod, fn_name, None)
        if fn is not None:
            return _call_safely(fn, features, mod_name=fn_name, **kwargs)
    return _error_envelope("risk_scores", "no score function found")


# ── Upgrade 5: similar cases ────────────────────────────────────────────────


def run_similar_cases_safe(
    embedding: list[float],
    *,
    k: int = 10,
    db_session: Any = None,
    **kwargs: Any,
) -> dict[str, Any]:
    if not HAS_SIMILAR_CASES:
        return _error_envelope("similar_cases", _SIMILAR_ERR)
    for fn_name in ("find_similar_cases", "retrieve_similar", "query"):
        fn = getattr(_similar_mod, fn_name, None)
        if fn is not None:
            return _call_safely(
                fn,
                embedding,
                k=k,
                db_session=db_session,
                mod_name=fn_name,
                **kwargs,
            )
    return _error_envelope("similar_cases", "no similar-cases function found")


# ── Upgrade 8: protocol recommender ─────────────────────────────────────────


def run_recommend_protocol_safe(
    features: dict,
    risk_scores: dict | None = None,
    *,
    papers: list[dict] | None = None,
    db_session: Any = None,
    **kwargs: Any,
) -> dict[str, Any]:
    if not HAS_PROTOCOL_RECOMMENDER:
        return _error_envelope("protocol_recommender", _RECOMMENDER_ERR)
    for fn_name in ("recommend_protocol", "build_recommendation", "recommend"):
        fn = getattr(_recommender_mod, fn_name, None)
        if fn is not None:
            return _call_safely(
                fn,
                features,
                risk_scores,
                papers=papers,
                db_session=db_session,
                mod_name=fn_name,
                **kwargs,
            )
    return _error_envelope("protocol_recommender", "no recommend function found")


# ── Upgrade 3: MedRAG (used by copilot + recommender) ───────────────────────


def run_retrieve_papers_safe(
    eeg_features: dict,
    patient_meta: dict | None = None,
    *,
    k: int = 10,
    db_session: Any = None,
) -> dict[str, Any]:
    if not HAS_MEDRAG:
        return _error_envelope("medrag", _MEDRAG_ERR)
    return _call_safely(
        _medrag_mod.retrieve,
        eeg_features,
        patient_meta or {},
        k=k,
        db_session=db_session,
        mod_name="medrag.retrieve",
    )


# ── Upgrade 9: longitudinal ─────────────────────────────────────────────────


def run_trajectory_report_safe(
    user_id: str,
    db_session: Any,
    **kwargs: Any,
) -> dict[str, Any]:
    if not HAS_LONGITUDINAL:
        return _error_envelope("longitudinal", _LONGITUDINAL_ERR)
    return _call_safely(
        _longitudinal_mod.generate_trajectory_report,
        user_id,
        db_session,
        mod_name="generate_trajectory_report",
        **kwargs,
    )


# ── Upgrade 10: copilot (module accessors) ──────────────────────────────────


def get_copilot_module() -> Any:
    """Return the copilot module object (or None if unavailable)."""
    return _copilot_mod


def copilot_available() -> bool:
    return HAS_COPILOT


__all__ = [
    "HAS_FOUNDATION_EMBEDDING",
    "HAS_BRAIN_AGE",
    "HAS_GAMLSS",
    "HAS_EXPLAINABILITY",
    "HAS_RISK_SCORES",
    "HAS_SIMILAR_CASES",
    "HAS_PROTOCOL_RECOMMENDER",
    "HAS_MEDRAG",
    "HAS_LONGITUDINAL",
    "HAS_COPILOT",
    "run_compute_embedding_safe",
    "run_predict_brain_age_safe",
    "run_fit_centiles_safe",
    "run_explain_safe",
    "run_score_conditions_safe",
    "run_similar_cases_safe",
    "run_recommend_protocol_safe",
    "run_retrieve_papers_safe",
    "run_trajectory_report_safe",
    "get_copilot_module",
    "copilot_available",
]

"""AI feature health/status endpoint.

Returns a truthful, structured report of which AI/ML features are
active, degraded, falling back to stubs, or entirely unavailable.
Never exposes secret values — only checks for *presence*.
"""
from __future__ import annotations

import importlib
import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/health", tags=["health"])

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Status enum values (string, not Python enum, for JSON simplicity)
# ---------------------------------------------------------------------------
_ACTIVE = "active"
_DEGRADED = "degraded"
_FALLBACK = "fallback"
_UNAVAILABLE = "unavailable"
_NOT_IMPLEMENTED = "not_implemented"
_RULE_BASED = "rule_based"


def _has_env(key: str) -> bool:
    """True if the env var is set and non-empty."""
    return bool(os.environ.get(key, "").strip())


def _can_import(module: str) -> bool:
    """True if a Python module is importable (no side effects)."""
    try:
        importlib.import_module(module)
        return True
    except Exception:
        return False


def _path_exists(env_key: str) -> bool:
    """True if the env var points to an existing filesystem path."""
    val = os.environ.get(env_key, "").strip()
    if not val:
        return False
    from pathlib import Path
    return Path(val).exists()


def _check_feature(
    *,
    name: str,
    real_ai: bool,
    required_env: list[str] | None = None,
    any_env: list[str] | None = None,
    required_packages: list[str] | None = None,
    required_weights: list[str] | None = None,
    safe_message: str,
    override_status: str | None = None,
) -> dict[str, Any]:
    """Build a single feature status entry."""
    required_env = required_env or []
    any_env = any_env or []
    required_packages = required_packages or []
    required_weights = required_weights or []

    missing: list[str] = []

    # Check required env vars (all must be present)
    for key in required_env:
        if not _has_env(key):
            missing.append(f"env:{key}")

    # Check any-of env vars (at least one must be present)
    if any_env and not any(_has_env(k) for k in any_env):
        missing.append(f"env:one_of({','.join(any_env)})")

    # Check packages
    for pkg in required_packages:
        if not _can_import(pkg):
            missing.append(f"package:{pkg}")

    # Check weight paths
    for wkey in required_weights:
        if not _path_exists(wkey):
            missing.append(f"weights:{wkey}")

    if override_status:
        status = override_status
    elif not real_ai:
        status = _RULE_BASED
    elif missing:
        status = _UNAVAILABLE
    else:
        status = _ACTIVE

    return {
        "feature": name,
        "status": status,
        "real_ai": real_ai,
        "required_env_vars": required_env + any_env,
        "required_packages": required_packages,
        "required_weights": required_weights,
        "current_missing": missing,
        "safe_user_message": safe_message if missing or not real_ai else "Feature is active.",
        "last_checked": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ai")
def ai_health() -> dict[str, Any]:
    """Truthful AI feature availability report.

    Does NOT make real LLM/API calls. Checks env vars, package
    availability, and weight file presence only.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Detect LLM backend availability
    has_any_llm = _has_env("GLM_API_KEY") or _has_env("ANTHROPIC_API_KEY") or _has_env("OPENAI_API_KEY")

    features = [
        _check_feature(
            name="chat_copilot",
            real_ai=True,
            any_env=["GLM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
            safe_message="Chat copilot requires at least one LLM API key (GLM_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY).",
        ),
        _check_feature(
            name="qeeg_interpreter",
            real_ai=True,
            any_env=["GLM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
            safe_message="qEEG AI interpretation requires at least one LLM API key.",
        ),
        _check_feature(
            name="medrag_retrieval",
            real_ai=True,
            required_packages=["pgvector", "sentence_transformers", "psycopg"],
            safe_message="Dense retrieval requires pgvector, sentence-transformers, and psycopg. Falls back to keyword matching.",
            override_status=_FALLBACK if not all(
                _can_import(p) for p in ["pgvector", "sentence_transformers", "psycopg"]
            ) else None,
        ),
        _check_feature(
            name="mri_brain_age_cnn",
            real_ai=True,
            required_packages=["torch"],
            required_weights=["BRAINAGE_WEIGHTS_PATH"],
            safe_message="Brain-age CNN requires PyTorch and model weights at BRAINAGE_WEIGHTS_PATH.",
        ),
        _check_feature(
            name="qeeg_foundation_labram",
            real_ai=True,
            required_packages=["torch"],
            required_weights=["FOUNDATION_WEIGHTS_DIR"],
            safe_message="LaBraM foundation model requires PyTorch and weights at FOUNDATION_WEIGHTS_DIR. Falls back to lightweight projector.",
            override_status=_FALLBACK if (
                _can_import("torch") and not _path_exists("FOUNDATION_WEIGHTS_DIR")
            ) else None,
        ),
        _check_feature(
            name="risk_score_predictor",
            real_ai=True,
            required_packages=["torch"],
            safe_message="Risk score predictor requires PyTorch and a trained model. Falls back to heuristic scoring.",
            override_status=_FALLBACK if not _can_import("torch") else None,
        ),
        _check_feature(
            name="qeeg_trainer",
            real_ai=True,
            required_packages=["torch", "braindecode"],
            safe_message="qEEG model training requires PyTorch and braindecode.",
        ),
        _check_feature(
            name="qeeg_protocol_recommendations",
            real_ai=False,
            required_packages=["deepsynaps_qeeg"],
            safe_message="Protocol recommendations are rule-based. Requires deepsynaps_qeeg package.",
            override_status=_UNAVAILABLE if not _can_import("deepsynaps_qeeg") else _RULE_BASED,
        ),
        _check_feature(
            name="generation_engine",
            real_ai=False,
            safe_message="Protocol generation is rule-based (CSV registry lookup). No AI inference.",
        ),
        _check_feature(
            name="safety_engine",
            real_ai=False,
            safe_message="Safety engine is rule-based governance enforcement. No AI inference.",
        ),
        _check_feature(
            name="deeptwin_encoders",
            real_ai=False,
            safe_message="DeepTwin encoders are deterministic feature engineering. No downstream inference model is connected.",
            override_status=_NOT_IMPLEMENTED,
        ),
        _check_feature(
            name="deeptwin_simulation",
            real_ai=False,
            safe_message="DeepTwin simulation is not implemented. Returns stub/placeholder data.",
            override_status=_NOT_IMPLEMENTED,
        ),
        _check_feature(
            name="brain_twin_app",
            real_ai=False,
            safe_message="Brain Twin application has no implementation. Placeholder only.",
            override_status=_NOT_IMPLEMENTED,
        ),
        _check_feature(
            name="evidence_pipeline",
            real_ai=False,
            safe_message="Evidence pipeline is data ETL (PubMed, OpenAlex, ClinicalTrials.gov). No AI inference.",
        ),
    ]

    # Summary counts
    active_count = sum(1 for f in features if f["status"] == _ACTIVE)
    total_count = len(features)

    return {
        "timestamp": now,
        "summary": {
            "active": active_count,
            "total": total_count,
            "llm_backend_configured": has_any_llm,
        },
        "features": features,
    }

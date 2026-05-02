"""Stable clinician-facing entry points for voice/audio analysis.

These names match the architecture checklist and delegate to the underlying
implementation modules. Research/wellness use — not a diagnostic device.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .ingestion import load_recording
from .neurological import nonlinear_features
from .neurological.parkinson import pd_voice_likelihood
from .quality import compute_qc, gate
from .schemas import QCReport, Recording
from .voice_step_handlers import voice_handler_acoustic


def import_voice_sample(path: str | Path, task_protocol: str) -> Recording:
    """Alias for :func:`ingestion.load_recording` — load and normalise one take."""

    return load_recording(path, task_protocol)


def extract_audio_metadata(recording: Recording) -> dict[str, Any]:
    """JSON-friendly summary (no waveform) for charts and audit."""

    d = recording.model_dump(mode="json")
    d.pop("waveform", None)
    return d


def check_audio_quality(recording: Recording) -> QCReport:
    """Alias for :func:`quality.compute_qc`."""

    return compute_qc(recording)


def gate_audio_for_analysis(qc: QCReport) -> bool:
    """True when QC is acceptable to proceed (same rule as :func:`quality.gate`)."""

    return gate(qc)


def extract_acoustic_features(recording: Recording) -> dict[str, Any]:
    """Run the acoustic_feature_engine step and return context updates (pitch, perturbation, bundle)."""

    ctx: dict[str, Any] = {"recording": recording.model_dump()}
    node = type("Node", (), {"params": {}})()
    voice_handler_acoustic(ctx, node, {})
    # Drop raw waveform from nested recording if present
    out = {k: v for k, v in ctx.items() if k != "recording"}
    return out


def score_pd_voice_risk(feature_map: Mapping[str, float]) -> dict[str, Any]:
    """Delegate to :func:`neurological.parkinson.pd_voice_likelihood` — returns a Pydantic model as dict."""

    return pd_voice_likelihood(dict(feature_map)).model_dump()


def compute_pd_voice_biomarkers(recording: Recording) -> dict[str, Any]:
    """Nonlinear + PD likelihood bundle commonly cited in PD voice biomarker work."""

    nl = nonlinear_features(recording)
    pert_ctx = extract_acoustic_features(recording).get("perturbation") or {}
    feat = {
        "jitter_local": float(pert_ctx.get("jitter_local", 0.0)),
        "hnr_db": float(pert_ctx.get("hnr_db", 0.0)),
        "rpde": float(nl.rpde),
        "dfa": float(nl.dfa),
        "ppe": float(nl.ppe),
    }
    pd_like = pd_voice_likelihood(feat)
    return {
        "nonlinear": nl.model_dump(),
        "pd_likelihood": pd_like.model_dump(),
    }


__all__ = [
    "import_voice_sample",
    "extract_audio_metadata",
    "check_audio_quality",
    "gate_audio_for_analysis",
    "extract_acoustic_features",
    "score_pd_voice_risk",
    "compute_pd_voice_biomarkers",
]

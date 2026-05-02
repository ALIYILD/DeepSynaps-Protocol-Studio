"""Real audio pipeline step handlers for :func:`workflow_orchestration.execute_voice_pipeline`.

Each handler matches :data:`workflow_orchestration.OrchestratorHandler` — updates JSON context
and emits artifact dicts. Expects ``input_audio_ref`` with ``path`` (filesystem path to audio),
``task_protocol``, ``session_id``, optional ``patient_id``, optional ``transcript``, optional
``reading_recording_path`` for AVQI (second recording).
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Mapping, MutableMapping

import numpy as np

from .analyzers.cognitive_speech import (
    extract_paralinguistic_cognitive_features,
    extract_linguistic_features,
    score_cognitive_speech_risk,
)
from .analyzers.respiratory_voice import extract_respiration_features, score_respiratory_risk
from .clinical_indices import compute_avqi
from .ingestion import load_recording
from .neurological.ddk import ddk_metrics
from .neurological.dysarthria import dysarthria_severity as dysarthria_heuristic
from .neurological.nonlinear import nonlinear_features
from .neurological.parkinson import pd_voice_likelihood
from .quality import compute_qc
from .schemas import (
    AcousticFeatureSet,
    AudioQualityResult,
    CognitiveSpeechRiskScore,
    DysarthriaSeverityScore,
    PDVoiceRiskScore,
    Recording,
    RespiratoryRiskScore,
    VoiceAsset,
    VoiceQualityIndices,
    VoiceSegment,
)
from .voice_reporting import generate_voice_biomarker_report_payload

logger = logging.getLogger(__name__)


def voice_handler_ingestion(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    path = input_audio_ref.get("path") or input_audio_ref.get("local_path") or input_audio_ref.get("uri")
    if not path:
        raise ValueError("input_audio_ref must include 'path', 'local_path', or filesystem 'uri'")
    task = str(input_audio_ref.get("task_protocol", "sustained_vowel_a"))
    rec = load_recording(path, task)
    ctx["recording"] = rec.model_dump()
    artifacts = [
        {
            "kind": "ingestion_metadata",
            "reference_uri": str(Path(path).resolve()),
            "summary": {"task_protocol": task, "n_samples": rec.n_samples, "sr": rec.sample_rate},
            "provenance": {"step": "ingestion", "file_hash_sha256": rec.file_hash},
        }
    ]
    return {}, artifacts


def voice_handler_qc(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rec = Recording.model_validate(ctx["recording"])
    qc_native = compute_qc(rec)
    qc_out = AudioQualityResult(
        verdict=qc_native.verdict,
        loudness_lufs=qc_native.lufs,
        snr_db=qc_native.snr_db,
        clip_fraction=qc_native.clip_fraction,
        speech_ratio=qc_native.speech_ratio,
        reasons=list(qc_native.reasons),
    )
    ctx["qc_report"] = qc_native.model_dump()
    ctx["qc"] = qc_out.model_dump()
    artifacts = [
        {
            "kind": "audio_quality",
            "summary": qc_out.model_dump(),
            "provenance": {"step": "qc", "qc_engine_version": qc_out.qc_engine_version},
        }
    ]
    return {}, artifacts


def voice_handler_acoustic(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    from .acoustic.formants import extract_formants
    from .acoustic.mfcc import extract_mfcc
    from .acoustic.perturbation import extract_perturbation
    from .acoustic.pitch import extract_pitch
    from .acoustic.spectral import extract_spectral

    rec = Recording.model_validate(ctx["recording"])
    pitch = extract_pitch(rec)
    pert = extract_perturbation(rec)
    spec = extract_spectral(rec)
    form = extract_formants(rec)
    mfcc = extract_mfcc(rec)

    af = AcousticFeatureSet(
        f0_mean_hz=pitch.f0_mean_hz,
        f0_sd_hz=pitch.f0_sd_hz,
        intensity_mean_db=float(20.0 * math.log10(max(float(np.mean(np.abs(rec.waveform))), 1e-12))),
        intensity_sd_db=float(min(40.0, pert.shimmer_local * 80.0)),
        voiced_fraction=pitch.voiced_fraction,
    )
    ctx["pitch"] = pitch.model_dump()
    ctx["perturbation"] = pert.model_dump()
    ctx["spectral"] = spec.model_dump()
    ctx["formants"] = form.model_dump()
    ctx["mfcc"] = mfcc.model_dump()
    ctx["acoustic_features"] = af.model_dump()
    nl = nonlinear_features(rec)
    ctx["nonlinear"] = nl.model_dump()
    ddk = ddk_metrics(rec)
    ctx["ddk"] = ddk.model_dump()

    artifacts = [
        {
            "kind": "acoustic_bundle",
            "summary": {"f0_mean_hz": pitch.f0_mean_hz, "hnr_db": pert.hnr_db},
            "provenance": {"step": "acoustic_feature_engine", "backend": "librosa/pyin"},
        }
    ]
    return {}, artifacts


def voice_handler_neuro(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    p = ctx["perturbation"]
    n = ctx["nonlinear"]
    d = ctx["ddk"]
    feat = {
        "jitter_local": float(p["jitter_local"]),
        "shimmer_local": float(p["shimmer_local"]),
        "hnr_db": float(p["hnr_db"]),
        "rpde": float(n["rpde"]),
        "dfa": float(n["dfa"]),
        "ppe": float(n["ppe"]),
        "ddk_regularity_index": float(d["regularity_index"]),
    }
    pd_like = pd_voice_likelihood(feat)
    dys = dysarthria_heuristic(feat)

    ctx["pd_likelihood"] = pd_like.model_dump()
    ctx["dysarthria_score_raw"] = dys.model_dump()

    pd_report = PDVoiceRiskScore(
        score=pd_like.score,
        model_name="pd_heuristic_logit",
        model_version=pd_like.model_version,
        confidence=pd_like.confidence,
        drivers=list(pd_like.drivers),
        percentile=pd_like.percentile,
    )
    dys_report = DysarthriaSeverityScore(
        severity=dys.severity,
        model_name="dysarthria_heuristic",
        model_version=dys.model_version,
        confidence=dys.confidence,
        subtype_hint=dys.subtype_hint,
        drivers=list(dys.drivers),
    )
    ctx["pd_voice"] = pd_report.model_dump()
    ctx["dysarthria"] = dys_report.model_dump()

    artifacts = [
        {
            "kind": "neurological_scores",
            "summary": {"pd_score": pd_like.score, "dysarthria_severity": dys.severity},
            "provenance": {
                "step": "neurological_voice_analyzers",
                "pd_model_version": pd_like.model_version,
                "dys_model_version": dys.model_version,
            },
        }
    ]
    return {}, artifacts


def voice_handler_cognitive(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    transcript = input_audio_ref.get("transcript")
    rec = Recording.model_validate(ctx["recording"])
    seg = VoiceSegment(
        start_s=0.0,
        end_s=rec.duration_s,
        sample_rate_hz=rec.sample_rate,
        waveform=list(rec.waveform or []),
    )
    para = extract_paralinguistic_cognitive_features(seg)
    ling = extract_linguistic_features(str(transcript)) if transcript else None
    risk = score_cognitive_speech_risk(para, ling)
    ctx["cognitive_speech"] = risk.model_dump()
    ctx["paralinguistic_cognitive"] = para.model_dump()

    artifacts = [
        {
            "kind": "cognitive_speech",
            "summary": risk.model_dump(),
            "provenance": {"step": "cognitive_speech_analyzers", "model": risk.model_name},
        }
    ]
    return {}, artifacts


def voice_handler_respiratory(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rec = Recording.model_validate(ctx["recording"])
    task = str(input_audio_ref.get("task_protocol", ""))
    if "cough" in task:
        tt = "cough"
    elif "breath" in task:
        tt = "breath"
    else:
        tt = "other"
    asset = VoiceAsset(
        duration_s=rec.duration_s,
        sample_rate_hz=rec.sample_rate,
        waveform=list(rec.waveform or []),
    )
    rf = extract_respiration_features(asset, task_type=tt)
    rr = score_respiratory_risk(rf)
    ctx["respiratory_features"] = rf.model_dump()
    ctx["respiratory"] = rr.model_dump()

    artifacts = [
        {
            "kind": "respiratory",
            "summary": rr.model_dump(),
            "provenance": {"step": "respiratory_voice_analyzer"},
        }
    ]
    return {}, artifacts


def voice_handler_reporting(
    ctx: MutableMapping[str, Any],
    node: Any,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    qc = AudioQualityResult.model_validate(ctx["qc"])
    af = AcousticFeatureSet.model_validate(ctx["acoustic_features"])
    pd_v = PDVoiceRiskScore.model_validate(ctx["pd_voice"])
    dys = DysarthriaSeverityScore.model_validate(ctx["dysarthria"])
    cog_raw = ctx.get("cognitive_speech")
    cog = CognitiveSpeechRiskScore.model_validate(cog_raw) if cog_raw else None
    resp_raw = ctx.get("respiratory")
    resp = RespiratoryRiskScore.model_validate(resp_raw) if resp_raw else None

    # Optional AVQI when reading path provided
    vq = None
    read_path = input_audio_ref.get("reading_recording_path")
    if read_path:
        try:
            vow = Recording.model_validate(ctx["recording"])
            sp = load_recording(read_path, "reading_passage")
            avqi = compute_avqi(vow, sp)
            vq = VoiceQualityIndices(avqi=avqi.value, dsi=None, severity_band=avqi.severity_band)
        except Exception as exc:
            logger.warning("AVQI skipped: %s", exc)

    payload = generate_voice_biomarker_report_payload(
        str(input_audio_ref.get("session_id", "session")),
        acoustic_features=af,
        voice_quality=vq,
        pd_voice=pd_v,
        dysarthria=dys,
        cognitive_speech=cog,
        respiratory=resp,
        qc=qc,
        patient_id=input_audio_ref.get("patient_id"),
    )
    ctx["voice_report_payload"] = payload.model_dump(mode="json")
    artifacts = [
        {
            "kind": "voice_session_report_payload",
            "summary": {"session_id": payload.session_id, "pipeline": payload.provenance.pipeline_version},
            "provenance": payload.provenance.model_dump(mode="json"),
        }
    ]
    return {}, artifacts


VOICE_PIPELINE_HANDLERS: dict[str, Any] = {
    "ingestion": voice_handler_ingestion,
    "qc": voice_handler_qc,
    "acoustic_feature_engine": voice_handler_acoustic,
    "neurological_voice_analyzers": voice_handler_neuro,
    "cognitive_speech_analyzers": voice_handler_cognitive,
    "respiratory_voice_analyzer": voice_handler_respiratory,
    "reporting": voice_handler_reporting,
}

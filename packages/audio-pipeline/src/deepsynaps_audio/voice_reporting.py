"""Voice biomarker reporting and longitudinal tracking payloads.

Builds JSON-serializable :class:`VoiceSessionReportPayload` and
:class:`LongitudinalVoiceSummaryPayload` for neuromodulation/neurology dashboards.

This module lives alongside :mod:`deepsynaps_audio.reporting` (HTML/PDF/MedRAG).
Python forbids a sibling ``reporting.py`` next to the ``reporting/`` package directory,
so session payloads are implemented here and re-exported from ``deepsynaps_audio.reporting``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Optional, Sequence

from .constants import NORM_DB_VERSION, PIPELINE_VERSION
from .schemas import (
    AcousticFeatureSet,
    AudioQualityResult,
    CognitiveSpeechRiskScore,
    DysarthriaSeverityScore,
    LongitudinalVoiceSummaryPayload,
    PDVoiceRiskScore,
    RespiratoryRiskScore,
    TrendSeries,
    VoiceQualityIndices,
    VoiceReportProvenance,
    VoiceSegment,
    VoiceSegmentRef,
    VoiceSessionReportPayload,
)


def generate_voice_biomarker_report_payload(
    session_id: str,
    *,
    acoustic_features: AcousticFeatureSet | None = None,
    voice_quality: VoiceQualityIndices | None = None,
    pd_voice: PDVoiceRiskScore | None = None,
    dysarthria: DysarthriaSeverityScore | None = None,
    cognitive_speech: CognitiveSpeechRiskScore | None = None,
    respiratory: RespiratoryRiskScore | None = None,
    qc: AudioQualityResult | None = None,
    patient_id: str | None = None,
    task_segments: dict[str, VoiceSegment] | None = None,
) -> VoiceSessionReportPayload:
    """Assemble a report-ready session payload (no raw audio bytes).

    Segment pointers reference timing + ids only; waveforms are stripped from refs.
    """

    generated_at = datetime.now(timezone.utc)
    feature_sets_used = _feature_sets_used(
        acoustic_features,
        voice_quality,
        pd_voice,
        dysarthria,
        cognitive_speech,
        respiratory,
        qc,
    )
    models_used = _collect_models_used(
        pd_voice,
        dysarthria,
        cognitive_speech,
        respiratory,
        qc,
        acoustic_features,
    )

    provenance = VoiceReportProvenance(
        pipeline_version=PIPELINE_VERSION,
        norm_db_version=NORM_DB_VERSION,
        schema_version="voice_session_report/v1",
        feature_sets_used=feature_sets_used,
        models_used=models_used,
    )

    refs = _task_segment_refs(task_segments)

    return VoiceSessionReportPayload(
        session_id=session_id,
        patient_id=patient_id,
        generated_at=generated_at,
        provenance=provenance,
        qc=qc,
        acoustic_features=acoustic_features,
        voice_quality=voice_quality,
        pd_voice=pd_voice,
        dysarthria=dysarthria,
        cognitive_speech=cognitive_speech,
        respiratory=respiratory,
        task_segment_refs=refs,
    )


def generate_longitudinal_voice_summary(
    patient_id: str,
    session_reports: Sequence[VoiceSessionReportPayload],
) -> LongitudinalVoiceSummaryPayload:
    """Aggregate ordered session payloads into trend series and simple deltas.

    Sessions are sorted by ``generated_at``. Missing numeric endpoints yield ``None``
    in ``TrendSeries.values``.
    """

    generated_at = datetime.now(timezone.utc)
    ordered = sorted(session_reports, key=lambda s: s.generated_at)

    trends: dict[str, TrendSeries] = {}
    delta_first_last: dict[str, Optional[float]] = {}

    def add_series(
        key: str,
        label: str,
        unit: str,
        getter: Callable[[VoiceSessionReportPayload], Optional[float]],
    ) -> None:
        sids: list[str] = []
        vals: list[Optional[float]] = []
        gtimes: list[datetime] = []
        for rep in ordered:
            sids.append(rep.session_id)
            gtimes.append(rep.generated_at)
            vals.append(getter(rep))
        trends[key] = TrendSeries(
            feature_key=key,
            label=label,
            unit=unit,
            session_ids=sids,
            values=vals,
            generated_at=gtimes,
        )
        first = next((v for v in vals if v is not None), None)
        last = next((v for v in reversed(vals) if v is not None), None)
        if first is not None and last is not None:
            delta_first_last[key] = last - first
        else:
            delta_first_last[key] = None

    add_series(
        "pd_voice.score",
        "PD voice risk score",
        "1",
        lambda r: r.pd_voice.score if r.pd_voice else None,
    )
    add_series(
        "dysarthria.severity",
        "Dysarthria severity",
        "1",
        lambda r: r.dysarthria.severity if r.dysarthria else None,
    )
    add_series(
        "cognitive_speech.score",
        "Cognitive speech risk score",
        "1",
        lambda r: r.cognitive_speech.score if r.cognitive_speech else None,
    )
    add_series(
        "respiratory.score",
        "Respiratory acoustic risk score",
        "1",
        lambda r: r.respiratory.score if r.respiratory else None,
    )
    add_series(
        "qc.loudness_lufs",
        "Recording loudness",
        "LUFS",
        lambda r: r.qc.loudness_lufs if r.qc else None,
    )
    add_series(
        "acoustic_features.f0_mean_hz",
        "Mean fundamental frequency",
        "Hz",
        lambda r: r.acoustic_features.f0_mean_hz if r.acoustic_features else None,
    )

    prov = VoiceReportProvenance(
        pipeline_version=PIPELINE_VERSION,
        norm_db_version=NORM_DB_VERSION,
        schema_version="longitudinal_voice_summary/v1",
        feature_sets_used=["longitudinal_aggregate"],
        models_used={"aggregation": "deterministic/v1"},
    )

    return LongitudinalVoiceSummaryPayload(
        patient_id=patient_id,
        generated_at=generated_at,
        n_sessions=len(ordered),
        session_order=[r.session_id for r in ordered],
        trends=trends,
        delta_first_last=delta_first_last,
        provenance=prov,
    )


def _feature_sets_used(
    acoustic: AcousticFeatureSet | None,
    voice_quality: VoiceQualityIndices | None,
    pd_voice: PDVoiceRiskScore | None,
    dysarthria: DysarthriaSeverityScore | None,
    cognitive: CognitiveSpeechRiskScore | None,
    respiratory: RespiratoryRiskScore | None,
    qc: AudioQualityResult | None,
) -> list[str]:
    tags: list[str] = []
    if acoustic is not None:
        tags.append("acoustic_descriptor_bundle")
    if voice_quality is not None:
        tags.append("voice_quality_indices")
    if pd_voice is not None:
        tags.append("pd_voice")
    if dysarthria is not None:
        tags.append("dysarthria")
    if cognitive is not None:
        tags.append("cognitive_speech")
    if respiratory is not None:
        tags.append("respiratory")
    if qc is not None:
        tags.append("quality_control")
    return tags


def _collect_models_used(
    pd_voice: PDVoiceRiskScore | None,
    dysarthria: DysarthriaSeverityScore | None,
    cognitive: CognitiveSpeechRiskScore | None,
    respiratory: RespiratoryRiskScore | None,
    qc: AudioQualityResult | None,
    acoustic: AcousticFeatureSet | None,
) -> dict[str, str]:
    m: dict[str, str] = {}
    if pd_voice is not None:
        m["pd_voice"] = f"{pd_voice.model_name}/{pd_voice.model_version}"
    if dysarthria is not None:
        m["dysarthria"] = f"{dysarthria.model_name}/{dysarthria.model_version}"
    if cognitive is not None:
        m["cognitive_speech"] = f"{cognitive.model_name}/{cognitive.model_version}"
    if respiratory is not None:
        m["respiratory"] = f"{respiratory.model_name}/{respiratory.model_version}"
    if qc is not None:
        m["qc_engine"] = qc.qc_engine_version
    if acoustic is not None:
        m["acoustic_descriptors"] = "AcousticFeatureSet/v1"
    return m


def _task_segment_refs(
    task_segments: dict[str, VoiceSegment] | None,
) -> dict[str, VoiceSegmentRef]:
    if not task_segments:
        return {}
    out: dict[str, VoiceSegmentRef] = {}
    for key, seg in task_segments.items():
        dur = max(0.0, seg.end_s - seg.start_s)
        out[key] = VoiceSegmentRef(
            task_key=key,
            snippet_id=None,
            parent_recording_id=None,
            start_s=seg.start_s,
            end_s=seg.end_s,
            duration_s=dur,
            sample_rate_hz=seg.sample_rate_hz,
        )
    return out

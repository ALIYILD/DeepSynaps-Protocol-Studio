"""End-to-end orchestrator: session -> VoiceAnalysisResult.

Stages (5): transcription -> emotion -> biomarkers -> scoring -> report.
Each stage is individually fault-isolated; failures propagate via PipelineStatus
rather than exceptions so callers always get a structured result.
"""

from __future__ import annotations

import logging
import time
import traceback
from dataclasses import dataclass, field
from typing import Optional

from audio_io import AudioMeta
from transcription import TranscriptResult, TranscriptSegment, transcribe_audio
from emotion import EmotionResult, analyze_emotion
from biomarkers import BiomarkerResult, extract_biomarkers
from scoring import RiskScoreResult, score_risk
from report import ClinicalVoiceReport, generate_clinical_report

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public dataclasses
# ---------------------------------------------------------------------------


@dataclass
class PipelineStatus:
    steps_completed: list[str]
    failed_steps: list[str]
    total_steps: int


@dataclass
class VoiceAnalysisResult:
    audio_meta: Optional[AudioMeta]
    transcript: Optional[TranscriptResult]
    emotion: Optional[EmotionResult]
    biomarkers: Optional[BiomarkerResult]
    risk: Optional[RiskScoreResult]
    report: Optional[ClinicalVoiceReport]
    pipeline_status: PipelineStatus


# ---------------------------------------------------------------------------
# Event emission seam (no-op until an event bus is configured)
# ---------------------------------------------------------------------------


def _emit_event(event_name: str, payload: dict) -> None:
    """No-op unless an event bus is configured. Monkeypatch seam."""
    logger.debug("voice-engine event: %s payload=%s", event_name, payload)


# ---------------------------------------------------------------------------
# Volume storage seam
# ---------------------------------------------------------------------------


def _resolve_processed_path(processed_key: str) -> str:
    """Resolve the absolute path for a processed audio file on the Fly volume. Monkeypatch seam.

    *processed_key* is a relative key (e.g. "voice/pt-1/sess-abc/processed.wav")
    stored on AudioMeta.processed_s3_key.  The file is already local on the Fly
    volume — no download needed.
    """
    from audio_io import _get_voice_storage_dir  # lazy — avoids circular at module level

    return str(_get_voice_storage_dir() / processed_key)


# ---------------------------------------------------------------------------
# AudioMeta helper
# ---------------------------------------------------------------------------


def _load_audio_meta(
    patient_id: str,
    session_id: str,
    db_session=None,
) -> Optional[AudioMeta]:
    """Resolve AudioMeta for a session.

    Tries DB lookup first (using db_session if supplied), then falls back to
    the key convention voice/{patient_id}/{session_id}/processed.wav.
    Returns a partial AudioMeta on convention fallback (most fields are None/0).
    """
    processed_s3_key = f"voice/{patient_id}/{session_id}/processed.wav"

    if db_session is not None:
        try:
            from app.persistence.models import AudioAnalysis  # lazy

            row = (
                db_session.query(AudioAnalysis)
                .filter(AudioAnalysis.session_id == session_id)
                .first()
            )
            if row is not None:
                # input_path is the closest column to a processed key; fall back
                # to convention if it's absent.
                key = row.input_path or processed_s3_key
                return AudioMeta(
                    patient_id=patient_id,
                    session_id=session_id,
                    original_filename="",
                    content_type=None,
                    duration_sec=0.0,
                    sample_rate=16_000,
                    channels=1,
                    file_size_bytes=0,
                    original_s3_key="",
                    processed_s3_key=key,
                )
        except Exception as exc:
            logger.warning(
                "_load_audio_meta: DB lookup failed (%s); using convention fallback", exc
            )

    # Convention fallback — build a minimal AudioMeta from the standard key pattern.
    return AudioMeta(
        patient_id=patient_id,
        session_id=session_id,
        original_filename="",
        content_type=None,
        duration_sec=0.0,
        sample_rate=16_000,
        channels=1,
        file_size_bytes=0,
        original_s3_key="",
        processed_s3_key=processed_s3_key,
    )


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------


def _persist_analysis_result(
    patient_id: str,
    session_id: str,
    result: VoiceAnalysisResult,
    db_session=None,
) -> None:
    """Update (or insert) the AudioAnalysis row with pipeline results.

    Stores status + a JSON blob in voice_report_json. No-op if db_session is None.
    """
    if db_session is None:
        return

    try:
        import json as _json
        from app.persistence.models import AudioAnalysis  # lazy
        import uuid

        status = (
            "completed"
            if (
                result.report is not None
                or result.pipeline_status.steps_completed
            )
            else "failed"
        )
        if not result.pipeline_status.steps_completed:
            status = "failed"

        blob: dict = {
            "pipeline_status": {
                "steps_completed": result.pipeline_status.steps_completed,
                "failed_steps": result.pipeline_status.failed_steps,
                "total_steps": result.pipeline_status.total_steps,
            }
        }
        if result.report is not None:
            blob.update(
                {
                    "summary": result.report.summary,
                    "risk_tier": result.report.risk_tier,
                    "raw_scores": result.report.raw_scores,
                    "raw_flags": result.report.raw_flags,
                    "data_quality_notes": result.report.data_quality_notes,
                    "flags": result.report.raw_flags,
                }
            )

        row = (
            db_session.query(AudioAnalysis)
            .filter(AudioAnalysis.session_id == session_id)
            .first()
        )
        if row is None:
            row = AudioAnalysis(
                analysis_id=str(uuid.uuid4()),
                patient_id=patient_id,
                session_id=session_id,
                status=status,
                voice_report_json=_json.dumps(blob),
            )
            db_session.add(row)
        else:
            row.status = status
            row.voice_report_json = _json.dumps(blob)

        db_session.commit()
    except Exception as exc:
        logger.warning("_persist_analysis_result: DB write failed: %s", exc)
        try:
            db_session.rollback()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_voice_analysis_for_session(
    patient_id: str,
    session_id: str,
    db_session=None,
) -> VoiceAnalysisResult:
    """Run the 5-stage voice analysis pipeline for a given session.

    # TODO Background queue integration: replace inline call with task enqueue
    # when worker infra exists. Keep run_voice_analysis_for_session signature stable.

    Stages: transcription -> emotion -> biomarkers -> scoring -> report.
    Each stage is individually fault-isolated. Critical dependencies:
    - scoring requires biomarkers; skipped (and appended to failed_steps) if biomarkers is None.
    - report requires risk; skipped if risk is None.
    emotion and biomarkers are independent of transcription.
    """
    steps_completed: list[str] = []
    failed_steps: list[str] = []

    _emit_event(
        "voice.analysis.started",
        {"patient_id": patient_id, "session_id": session_id},
    )

    # Resolve AudioMeta + local WAV path (already on the Fly volume — no download needed)
    audio_meta = _load_audio_meta(patient_id, session_id, db_session=db_session)
    processed_key = audio_meta.processed_s3_key if audio_meta else f"voice/{patient_id}/{session_id}/processed.wav"

    try:
        temp_path = _resolve_processed_path(processed_key)
    except Exception as exc:
        logger.error(
            "run_voice_analysis_for_session: could not resolve path for %s: %s\n%s",
            processed_key,
            exc,
            traceback.format_exc(),
        )
        _emit_event(
            "voice.analysis.failed",
            {"patient_id": patient_id, "session_id": session_id, "reason": "path_resolve"},
        )
        return VoiceAnalysisResult(
            audio_meta=audio_meta,
            transcript=None,
            emotion=None,
            biomarkers=None,
            risk=None,
            report=None,
            pipeline_status=PipelineStatus(
                steps_completed=[],
                failed_steps=["transcription", "emotion", "biomarkers", "scoring", "report"],
                total_steps=5,
            ),
        )

    transcript: Optional[TranscriptResult] = None
    emotion: Optional[EmotionResult] = None
    biomarkers: Optional[BiomarkerResult] = None
    risk: Optional[RiskScoreResult] = None
    report: Optional[ClinicalVoiceReport] = None

    # ── Stage 1: transcription ──────────────────────────────────────────
    try:
        t0 = time.monotonic()
        logger.info("pipeline[%s]: starting transcription", session_id)
        transcript = transcribe_audio(temp_path)
        elapsed = time.monotonic() - t0
        logger.info("pipeline[%s]: transcription done in %.2fs", session_id, elapsed)
        steps_completed.append("transcription")
        _emit_event(
            "voice.analysis.step_completed",
            {"session_id": session_id, "step": "transcription", "elapsed_sec": elapsed},
        )
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logger.error(
            "pipeline[%s]: transcription failed in %.2fs: %s\n%s",
            session_id, elapsed, exc, traceback.format_exc(),
        )
        failed_steps.append("transcription")

    # ── Stage 2: emotion (independent of transcription) ────────────────
    try:
        t0 = time.monotonic()
        logger.info("pipeline[%s]: starting emotion", session_id)
        segments = transcript.segments if transcript is not None else []
        # Fall back to a single virtual segment covering full duration if empty.
        if not segments:
            segments = [TranscriptSegment(start=0.0, end=0.0, text="", confidence=None)]
        emotion = analyze_emotion(temp_path, segments)
        elapsed = time.monotonic() - t0
        logger.info("pipeline[%s]: emotion done in %.2fs", session_id, elapsed)
        steps_completed.append("emotion")
        _emit_event(
            "voice.analysis.step_completed",
            {"session_id": session_id, "step": "emotion", "elapsed_sec": elapsed},
        )
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logger.error(
            "pipeline[%s]: emotion failed in %.2fs: %s\n%s",
            session_id, elapsed, exc, traceback.format_exc(),
        )
        failed_steps.append("emotion")

    # ── Stage 3: biomarkers (independent of transcription) ─────────────
    try:
        t0 = time.monotonic()
        logger.info("pipeline[%s]: starting biomarkers", session_id)
        biomarkers = extract_biomarkers(temp_path)
        elapsed = time.monotonic() - t0
        logger.info("pipeline[%s]: biomarkers done in %.2fs", session_id, elapsed)
        steps_completed.append("biomarkers")
        _emit_event(
            "voice.analysis.step_completed",
            {"session_id": session_id, "step": "biomarkers", "elapsed_sec": elapsed},
        )
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logger.error(
            "pipeline[%s]: biomarkers failed in %.2fs: %s\n%s",
            session_id, elapsed, exc, traceback.format_exc(),
        )
        failed_steps.append("biomarkers")

    # ── Stage 4: scoring (requires biomarkers) ─────────────────────────
    if biomarkers is None:
        logger.warning("pipeline[%s]: skipping scoring — biomarkers failed", session_id)
        failed_steps.append("scoring")
    else:
        try:
            t0 = time.monotonic()
            logger.info("pipeline[%s]: starting scoring", session_id)
            risk = score_risk(biomarkers, emotion)
            elapsed = time.monotonic() - t0
            logger.info("pipeline[%s]: scoring done in %.2fs", session_id, elapsed)
            steps_completed.append("scoring")
            _emit_event(
                "voice.analysis.step_completed",
                {"session_id": session_id, "step": "scoring", "elapsed_sec": elapsed},
            )
        except Exception as exc:
            elapsed = time.monotonic() - t0
            logger.error(
                "pipeline[%s]: scoring failed in %.2fs: %s\n%s",
                session_id, elapsed, exc, traceback.format_exc(),
            )
            failed_steps.append("scoring")

    # ── Stage 5: report (requires risk) ────────────────────────────────
    if risk is None:
        logger.warning("pipeline[%s]: skipping report — risk is None", session_id)
        failed_steps.append("report")
    else:
        try:
            t0 = time.monotonic()
            logger.info("pipeline[%s]: starting report", session_id)
            report = generate_clinical_report(
                risk,
                biomarkers=biomarkers,
                emotion=emotion,
                transcript=transcript,
            )
            elapsed = time.monotonic() - t0
            logger.info("pipeline[%s]: report done in %.2fs", session_id, elapsed)
            steps_completed.append("report")
            _emit_event(
                "voice.analysis.step_completed",
                {"session_id": session_id, "step": "report", "elapsed_sec": elapsed},
            )
        except Exception as exc:
            elapsed = time.monotonic() - t0
            logger.error(
                "pipeline[%s]: report failed in %.2fs: %s\n%s",
                session_id, elapsed, exc, traceback.format_exc(),
            )
            failed_steps.append("report")

    result = VoiceAnalysisResult(
        audio_meta=audio_meta,
        transcript=transcript,
        emotion=emotion,
        biomarkers=biomarkers,
        risk=risk,
        report=report,
        pipeline_status=PipelineStatus(
            steps_completed=steps_completed,
            failed_steps=failed_steps,
            total_steps=5,
        ),
    )

    event_name = (
        "voice.analysis.completed" if steps_completed else "voice.analysis.failed"
    )
    _emit_event(event_name, {"session_id": session_id, "steps_completed": steps_completed})

    _persist_analysis_result(patient_id, session_id, result, db_session=db_session)

    return result

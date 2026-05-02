"""Audio / voice analysis workflow orchestration.

Provides a reproducible pipeline runner with per-step artifacts and provenance,
similar in spirit to MRI/qEEG session pipelines. Uses an in-process run store by
default; swap ``_RUN_STORE`` for Postgres/S3 in production.

Research/wellness positioning: provenance records models and parameters for audit,
not clinical certification.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, MutableMapping, Sequence

from .constants import NORM_DB_VERSION, PIPELINE_VERSION
from .schemas import (
    AcousticFeatureSet,
    AudioArtifactRecord,
    AudioPipelineDefinition,
    AudioPipelineNode,
    AudioPipelineRun,
    AudioPipelineStage,
    AudioQualityResult,
    CognitiveSpeechRiskScore,
    PDVoiceRiskScore,
    RespiratoryRiskScore,
)

logger = logging.getLogger(__name__)

# --- run persistence (process-local; replace with DB in deployment) ---------

_RUN_STORE: dict[str, AudioPipelineRun] = {}

OrchestratorHandler = Callable[
    [MutableMapping[str, Any], AudioPipelineNode, Mapping[str, Any]],
    tuple[dict[str, Any], list[dict[str, Any]]],
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _definition_snapshot(defn: AudioPipelineDefinition) -> dict[str, Any]:
    return json.loads(defn.model_dump_json())


def execute_audio_pipeline(
    pipeline_definition: AudioPipelineDefinition | Mapping[str, Any],
    input_audio_ref: Mapping[str, Any],
    *,
    handlers: Mapping[str, OrchestratorHandler] | None = None,
    run_id: str | None = None,
) -> AudioPipelineRun:
    """Execute a pipeline definition against ``input_audio_ref`` (URI + metadata, no raw bytes required).

    Returns a completed :class:`AudioPipelineRun` with artifacts and context updates per step.
    If ``run_id`` is supplied and that run already ``completed``, returns the cached run (idempotent).
    If ``run_id`` exists with ``failed`` or partial state, raise ``RuntimeError`` — use
    :func:`resume_audio_pipeline` instead.
    """

    defn = _coerce_definition(pipeline_definition)
    _validate_graph(defn)
    rid = run_id or str(uuid.uuid4())
    store_key = rid

    active_handlers = dict(DEFAULT_STEP_HANDLERS)
    if handlers:
        active_handlers.update(dict(handlers))

    if store_key in _RUN_STORE:
        existing = _RUN_STORE[store_key]
        if existing.status == "running":
            raise RuntimeError(f"run {store_key} is already in progress")
        if existing.status == "completed":
            return existing
        if existing.status == "failed" or existing.completed_node_ids:
            raise RuntimeError(
                f"run {store_key} exists in state {existing.status!r}; call resume_audio_pipeline "
                "or use a new run_id",
            )

    ctx_seed = dict(input_audio_ref)
    ctx_seed["run_id"] = rid

    run = AudioPipelineRun(
        run_id=rid,
        pipeline_id=defn.pipeline_id,
        pipeline_version=defn.version,
        pipeline_definition=_definition_snapshot(defn),
        input_audio_ref=dict(input_audio_ref),
        status="running",
        context=ctx_seed,
        started_at=_now(),
    )
    _RUN_STORE[store_key] = run

    try:
        nodes = defn.nodes
        start_idx = 0
        # Resume support: if same run_id existed completed partially — user should call resume; fresh execute always starts 0
        for idx in range(start_idx, len(nodes)):
            node = nodes[idx]
            if node.node_id in run.completed_node_ids:
                continue
            stage = node.stage
            handler = active_handlers.get(stage)
            if handler is None:
                raise KeyError(f"No handler registered for stage {stage!r} (node {node.node_id})")
            ctx_updates, artifact_payloads = handler(run.context, node, run.input_audio_ref)
            run.context.update(ctx_updates)
            run.current_node_index = idx
            for payload in artifact_payloads:
                art = _build_artifact(run, node, payload)
                run.artifacts.append(art)
            run.completed_node_ids.append(node.node_id)
        run.status = "completed"
        run.finished_at = _now()
    except Exception as exc:  # noqa: BLE001 — surface failure on run record
        logger.exception("audio pipeline failed: run_id=%s", rid)
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = _now()
        raise
    finally:
        _RUN_STORE[store_key] = run

    return run


def resume_audio_pipeline(run_id: str, *, handlers: Mapping[str, OrchestratorHandler] | None = None) -> AudioPipelineRun:
    """Continue execution from the first incomplete node."""

    if run_id not in _RUN_STORE:
        raise KeyError(f"unknown run_id: {run_id}")
    run = _RUN_STORE[run_id]
    if run.status == "completed":
        return run
    run.status = "running"
    run.error_message = None

    defn = AudioPipelineDefinition.model_validate(run.pipeline_definition)
    _validate_graph(defn)
    active_handlers = dict(DEFAULT_STEP_HANDLERS)
    if handlers:
        active_handlers.update(dict(handlers))

    nodes = defn.nodes
    try:
        for idx, node in enumerate(nodes):
            if node.node_id in run.completed_node_ids:
                continue
            handler = active_handlers.get(node.stage)
            if handler is None:
                raise KeyError(f"No handler for stage {node.stage!r}")
            ctx_updates, artifact_payloads = handler(run.context, node, run.input_audio_ref)
            run.context.update(ctx_updates)
            run.current_node_index = idx
            for payload in artifact_payloads:
                run.artifacts.append(_build_artifact(run, node, payload))
            run.completed_node_ids.append(node.node_id)
        run.status = "completed"
        run.finished_at = _now()
    except Exception as exc:  # noqa: BLE001
        logger.exception("resume failed: run_id=%s", run_id)
        run.status = "failed"
        run.error_message = str(exc)
        run.finished_at = _now()
        raise

    _RUN_STORE[run_id] = run
    return run


def collect_audio_provenance(run_id: str) -> Sequence[dict[str, Any]]:
    """Flatten run-level and per-artifact provenance for audit export."""

    if run_id not in _RUN_STORE:
        raise KeyError(f"unknown run_id: {run_id}")
    run = _RUN_STORE[run_id]
    out: list[dict[str, Any]] = [
        {
            "kind": "run",
            "run_id": run.run_id,
            "pipeline_id": run.pipeline_id,
            "pipeline_version": run.pipeline_version,
            "orchestrator_version": run.orchestrator_version,
            "pipeline_definition_digest": _digest_json(run.pipeline_definition),
            "input_audio_ref_digest": _digest_json(run.input_audio_ref),
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "studio_pipeline_version": PIPELINE_VERSION,
            "norm_db_version": NORM_DB_VERSION,
        }
    ]
    for art in run.artifacts:
        out.append(
            {
                "kind": "artifact",
                "artifact_id": art.artifact_id,
                "run_id": art.run_id,
                "node_id": art.node_id,
                "stage": art.stage,
                "artifact_kind": art.kind,
                "reference_uri": art.reference_uri,
                "checksum_sha256": art.checksum_sha256,
                "summary": art.summary,
                "provenance": art.provenance,
                "created_at": art.created_at.isoformat(),
            }
        )
    return out


def clear_run_store_for_tests() -> None:
    """Reset in-memory store (tests only)."""

    _RUN_STORE.clear()


# --- definition coercion / validation ------------------------------------


def _coerce_definition(pipeline_definition: AudioPipelineDefinition | Mapping[str, Any]) -> AudioPipelineDefinition:
    if isinstance(pipeline_definition, AudioPipelineDefinition):
        return pipeline_definition
    return AudioPipelineDefinition.model_validate(dict(pipeline_definition))


def _validate_graph(defn: AudioPipelineDefinition) -> None:
    ids = [n.node_id for n in defn.nodes]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate node_id in pipeline definition")
    id_set = set(ids)
    for n in defn.nodes:
        for d in n.depends_on:
            if d not in id_set:
                raise ValueError(f"depends_on references unknown node_id: {d}")


def _digest_json(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _build_artifact(
    run: AudioPipelineRun,
    node: AudioPipelineNode,
    payload: Mapping[str, Any],
) -> AudioArtifactRecord:
    kind = str(payload.get("kind", "artifact"))
    summary = dict(payload.get("summary", {}))
    prov = dict(payload.get("provenance", {}))
    ref_uri = payload.get("reference_uri")
    checksum = payload.get("checksum_sha256")
    return AudioArtifactRecord(
        artifact_id=str(uuid.uuid4()),
        run_id=run.run_id,
        node_id=node.node_id,
        stage=node.stage,
        kind=kind,
        reference_uri=ref_uri,
        checksum_sha256=checksum,
        summary=summary,
        provenance=prov,
        created_at=_now(),
    )


# --- default step handlers (noop / deterministic fakes for demos & tests) ---


def _handler_ingestion(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    mode = node.params.get("mode", "noop")
    uri = str(input_audio_ref.get("uri", input_audio_ref.get("storage_uri", "")))
    updates = {
        "ingestion": {
            "normalized_uri": uri,
            "task_protocol": input_audio_ref.get("task_protocol", "unknown"),
            "mode": mode,
        }
    }
    artifacts: list[dict[str, Any]] = [
        {
            "kind": "ingestion_metadata",
            "reference_uri": uri or None,
            "summary": {"task_protocol": updates["ingestion"]["task_protocol"]},
            "provenance": {
                "step": "ingestion",
                "handler": "default_ingestion",
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


def _handler_qc(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fake = node.params.get("fake_qc", True)
    if fake:
        qc = AudioQualityResult(
            verdict="pass",
            loudness_lufs=-23.0,
            snr_db=20.0,
            clip_fraction=0.001,
            speech_ratio=0.55,
            reasons=[],
            qc_engine_version=str(node.params.get("qc_engine_version", "1.0.0")),
        )
    else:
        qc = AudioQualityResult(verdict="warn", reasons=["stub"])
    updates = {"qc": qc.model_dump()}
    artifacts = [
        {
            "kind": "audio_quality",
            "summary": updates["qc"],
            "provenance": {
                "step": "qc",
                "analyzer": "AudioQualityResult",
                "qc_engine_version": qc.qc_engine_version,
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


def _handler_acoustic(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    feats = AcousticFeatureSet(
        f0_mean_hz=120.0,
        f0_sd_hz=5.0,
        intensity_mean_db=-20.0,
        intensity_sd_db=2.5,
        voiced_fraction=0.68,
    )
    updates = {"acoustic_features": feats.model_dump()}
    artifacts = [
        {
            "kind": "acoustic_features",
            "summary": feats.model_dump(),
            "provenance": {
                "step": "acoustic_feature_engine",
                "extractor": "AcousticFeatureSet",
                "extractor_version": str(node.params.get("extractor_version", "noop-v1")),
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


def _handler_neuro(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pd_score = PDVoiceRiskScore(
        score=0.31,
        model_name=str(node.params.get("pd_model", "pd_fake")),
        model_version=str(node.params.get("pd_model_version", "0.1.0")),
        confidence=0.62,
        drivers=["f0_sd_hz"],
    )
    updates = {"pd_voice": pd_score.model_dump(), "neurological": {"pd_voice": pd_score.model_dump()}}
    artifacts = [
        {
            "kind": "pd_voice_score",
            "summary": pd_score.model_dump(),
            "provenance": {
                "step": "neurological_voice_analyzers",
                "model_name": pd_score.model_name,
                "model_version": pd_score.model_version,
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


def _handler_cognitive(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    risk = CognitiveSpeechRiskScore(
        score=0.2,
        model_name=str(node.params.get("model_name", "baseline_cognitive_lr")),
        model_version=str(node.params.get("model_version", "1.0.0")),
        confidence=0.55,
        drivers=[],
        linguistic_features_used=bool(node.params.get("linguistic", False)),
    )
    updates = {"cognitive_speech": risk.model_dump()}
    artifacts = [
        {
            "kind": "cognitive_speech_score",
            "summary": risk.model_dump(),
            "provenance": {
                "step": "cognitive_speech_analyzers",
                "model_name": risk.model_name,
                "model_version": risk.model_version,
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


def _handler_respiratory(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rr = RespiratoryRiskScore(
        score=0.12,
        model_name=str(node.params.get("model_name", "baseline_respiratory_lr")),
        model_version=str(node.params.get("model_version", "1.0.0")),
        confidence=0.6,
        drivers=[],
    )
    updates = {"respiratory": rr.model_dump()}
    artifacts = [
        {
            "kind": "respiratory_risk",
            "summary": rr.model_dump(),
            "provenance": {
                "step": "respiratory_voice_analyzer",
                "model_name": rr.model_name,
                "model_version": rr.model_version,
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


def _handler_reporting(
    ctx: MutableMapping[str, Any],
    node: AudioPipelineNode,
    input_audio_ref: Mapping[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rid = str(ctx.get("run_id", "unknown-run"))
    report_uri = f"s3://artifacts/{rid}/voice_report.json"
    summary = {
        "session_id": str(input_audio_ref.get("session_id", "")),
        "keys_in_context": sorted(ctx.keys()),
    }
    updates = {
        "report": {"uri": report_uri, "summary_keys": summary["keys_in_context"]},
    }
    artifacts = [
        {
            "kind": "voice_report_payload_ref",
            "reference_uri": report_uri,
            "summary": summary,
            "provenance": {
                "step": "reporting",
                "schema": "VoiceSessionReportPayload",
                "report_builder_version": str(node.params.get("report_builder_version", "voice_reporting/v1")),
                "params": dict(node.params),
            },
        }
    ]
    return updates, artifacts


DEFAULT_STEP_HANDLERS: dict[AudioPipelineStage, OrchestratorHandler] = {
    "ingestion": _handler_ingestion,
    "qc": _handler_qc,
    "acoustic_feature_engine": _handler_acoustic,
    "neurological_voice_analyzers": _handler_neuro,
    "cognitive_speech_analyzers": _handler_cognitive,
    "respiratory_voice_analyzer": _handler_respiratory,
    "reporting": _handler_reporting,
}


def validate_pipeline_definition(obj: Any) -> AudioPipelineDefinition:
    """Validate a JSON/dict pipeline definition (optional helper for API loaders)."""

    return AudioPipelineDefinition.model_validate(obj)

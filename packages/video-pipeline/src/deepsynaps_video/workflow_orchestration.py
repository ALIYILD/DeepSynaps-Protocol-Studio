"""Workflow orchestration for DeepSynaps Video Analyzer.

The runner in this module is intentionally lightweight and dependency-free. It
provides an auditable DAG-like execution layer for video workflows such as:

* ingest -> pose engine -> clinical analyzers -> reporting
* ingest -> tracking -> monitoring analyzers -> reporting

Operation implementations are registered by name. The pipeline definition stores
operation names and parameters rather than hard-coding model code, which keeps
the workflow reproducible and lets tests use small stub operations instead of
heavy CV/ML inference.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Callable, Literal
from uuid import uuid4

from deepsynaps_video.schemas import json_ready, utc_now_iso

PipelineRunStatus = Literal["created", "running", "completed", "failed"]
PipelineNodeStatus = Literal["pending", "running", "completed", "failed", "skipped"]
ArtifactType = Literal[
    "input_video",
    "video_asset",
    "pose_sequence",
    "clinical_metrics",
    "monitoring_events",
    "report_payload",
    "generic",
]


@dataclass(frozen=True, init=False)
class VideoPipelineNode:
    """One reproducible workflow step.

    ``operation`` maps to a registered Python callable. ``parameters`` capture
    all configurable values used by the operation. Backend/model fields are
    optional but should be populated when a node wraps CV/ML tooling.
    """

    node_id: str
    operation: str
    name: str | None
    inputs: tuple[str, ...]
    parameters: dict[str, Any]
    backend_name: str | None
    backend_version: str | None
    model_name: str | None
    model_version: str | None
    artifact_type: ArtifactType

    def __init__(
        self,
        node_id: str,
        operation: str,
        name: str | None = None,
        inputs: tuple[str, ...] = (),
        parameters: dict[str, Any] | None = None,
        backend_name: str | None = None,
        backend_version: str | None = None,
        model_name: str | None = None,
        model_version: str | None = None,
        artifact_type: ArtifactType = "generic",
        *,
        depends_on: tuple[str, ...] | None = None,
        backend: str | None = None,
        version: str | None = None,
    ) -> None:
        """Create a pipeline node.

        ``depends_on``, ``backend``, and ``version`` are compatibility aliases
        for issue-tracker style pipeline definitions.
        """

        object.__setattr__(self, "node_id", node_id)
        object.__setattr__(self, "operation", operation)
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "inputs", tuple(depends_on if depends_on is not None else inputs))
        object.__setattr__(self, "parameters", dict(parameters or {}))
        object.__setattr__(self, "backend_name", backend_name or backend)
        object.__setattr__(self, "backend_version", backend_version or version)
        object.__setattr__(self, "model_name", model_name)
        object.__setattr__(self, "model_version", model_version)
        object.__setattr__(self, "artifact_type", artifact_type)

    @property
    def depends_on(self) -> tuple[str, ...]:
        return self.inputs

    @property
    def backend(self) -> str | None:
        return self.backend_name

    @property
    def version(self) -> str | None:
        return self.backend_version

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True, init=False)
class VideoArtifactRecord:
    """Artifact produced or referenced by a video pipeline run."""

    artifact_id: str
    run_id: str
    node_id: str
    name: str
    artifact_type: ArtifactType | str
    created_at: str
    value: Any
    uri: str | None
    metadata: dict[str, Any]

    def __init__(
        self,
        artifact_id: str,
        node_id: str,
        artifact_type: ArtifactType | str,
        created_at: str,
        *,
        run_id: str = "",
        name: str | None = None,
        value: Any = None,
        payload: Any = None,
        uri: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        object.__setattr__(self, "artifact_id", artifact_id)
        object.__setattr__(self, "run_id", run_id)
        object.__setattr__(self, "node_id", node_id)
        object.__setattr__(self, "name", name or node_id)
        object.__setattr__(self, "artifact_type", artifact_type)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "value", value if payload is None else payload)
        object.__setattr__(self, "uri", uri)
        object.__setattr__(self, "metadata", dict(metadata or {}))

    @property
    def payload(self) -> Any:
        return self.value

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class VideoPipelineRun:
    """Auditable execution record for a video pipeline."""

    run_id: str
    pipeline_id: str
    input_video_ref: str
    status: PipelineRunStatus
    created_at: str
    updated_at: str
    nodes: tuple[VideoPipelineNode, ...]
    artifacts: tuple[VideoArtifactRecord, ...] = ()
    node_statuses: dict[str, PipelineNodeStatus] = field(default_factory=dict)
    provenance: tuple[dict[str, Any], ...] = ()
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class VideoPipelineDefinition:
    """Named collection of video pipeline nodes."""

    pipeline_id: str
    nodes: tuple[VideoPipelineNode, ...]
    description: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


class VideoWorkflowError(RuntimeError):
    """Raised when pipeline definition, lookup, or execution fails."""


PipelineContext = dict[str, Any]
PipelineOperation = Callable[[PipelineContext, VideoPipelineNode], Any]

_OPERATION_REGISTRY: dict[str, PipelineOperation] = {}
_RUN_STORE: dict[str, VideoPipelineRun] = {}


def register_video_pipeline_operation(name: str, operation: PipelineOperation) -> None:
    """Register an executable operation for workflow nodes."""

    if not name:
        raise ValueError("operation name must not be empty")
    _OPERATION_REGISTRY[name] = operation


def register_video_operation(name: str, operation: PipelineOperation) -> None:
    """Compatibility alias for registering video workflow operations."""

    register_video_pipeline_operation(name, operation)


def execute_video_pipeline(
    pipeline_definition: VideoPipelineDefinition | dict[str, Any] | list[VideoPipelineNode] | tuple[VideoPipelineNode, ...],
    input_video_ref: str,
) -> VideoPipelineRun:
    """Execute a video pipeline and return an auditable run record.

    The runner executes nodes sequentially in definition order. Each node can
    read prior artifacts from ``context['artifacts_by_node']`` or by names listed
    in ``node.inputs``. Operation outputs are stored as JSON-friendly artifact
    values so frontends and tests can inspect them without re-running models.
    """

    definition = _normalize_pipeline_definition(pipeline_definition)
    _validate_pipeline(definition)
    run_id = _new_id("video_run")
    now = utc_now_iso()
    node_statuses: dict[str, PipelineNodeStatus] = {node.node_id: "pending" for node in definition.nodes}
    provenance: list[dict[str, Any]] = [
        _provenance_event(
            run_id=run_id,
            event_type="pipeline_started",
            node=None,
            status="running",
            details={"input_video_ref": input_video_ref, "pipeline_id": definition.pipeline_id},
        )
    ]
    context: PipelineContext = {
        "run_id": run_id,
        "pipeline_id": definition.pipeline_id,
        "input_video_ref": input_video_ref,
        "artifacts_by_node": {},
        "artifacts_by_name": {},
        "artifacts": {},
    }
    artifacts: list[VideoArtifactRecord] = []
    context["artifacts_by_node"]["input"] = input_video_ref
    context["artifacts_by_name"]["input_video_ref"] = input_video_ref

    run = VideoPipelineRun(
        run_id=run_id,
        pipeline_id=definition.pipeline_id,
        input_video_ref=input_video_ref,
        status="running",
        created_at=now,
        updated_at=now,
        nodes=definition.nodes,
        artifacts=tuple(artifacts),
        node_statuses=node_statuses,
        provenance=tuple(provenance),
    )
    _RUN_STORE[run_id] = run

    try:
        for node in definition.nodes:
            node_statuses[node.node_id] = "running"
            provenance.append(
                _provenance_event(run_id=run_id, event_type="node_started", node=node, status="running")
            )
            operation = _get_operation(node.operation)
            result = operation(context, node)
            artifact = _artifact_from_result(run_id, node, result)
            artifacts.append(artifact)
            context["artifacts_by_node"][node.node_id] = artifact.payload
            context["artifacts_by_name"][artifact.name] = artifact.payload
            context["artifacts"][node.node_id] = artifact.payload
            node_statuses[node.node_id] = "completed"
            provenance.append(
                _node_completed_event(
                    run_id=run_id,
                    node=node,
                    artifact=artifact,
                    result=result,
                )
            )
            run = replace(
                run,
                updated_at=utc_now_iso(),
                artifacts=tuple(artifacts),
                node_statuses=dict(node_statuses),
                provenance=tuple(provenance),
            )
            _RUN_STORE[run_id] = run
    except Exception as exc:
        failed_node = _current_failed_node(definition.nodes, node_statuses)
        if failed_node is not None:
            node_statuses[failed_node.node_id] = "failed"
            provenance.append(
                _provenance_event(
                    run_id=run_id,
                    event_type="node_failed",
                    node=failed_node,
                    status="failed",
                    details={"error": str(exc), "error_type": type(exc).__name__},
                )
            )
        run = replace(
            run,
            status="failed",
            updated_at=utc_now_iso(),
            artifacts=tuple(artifacts),
            node_statuses=dict(node_statuses),
            provenance=tuple(provenance),
            error_message=str(exc),
        )
        _RUN_STORE[run_id] = run
        return run

    provenance.append(
        _provenance_event(run_id=run_id, event_type="pipeline_completed", node=None, status="completed")
    )
    node_provenance = tuple(
        event
        for event in provenance
        if event.get("event_type") == "node_completed" and "node_id" in event
    )
    run = replace(
        run,
        status="completed",
        updated_at=utc_now_iso(),
        artifacts=tuple(artifacts),
        node_statuses=dict(node_statuses),
        provenance=node_provenance or tuple(provenance),
    )
    _RUN_STORE[run_id] = run
    return run


def resume_video_pipeline(run_id: str) -> VideoPipelineRun:
    """Return a stored run record.

    The current runner executes synchronously. Resuming therefore returns the
    current auditable state for completed or failed runs. A future async worker
    can extend this function to continue pending nodes from the same run record.
    """

    try:
        return _RUN_STORE[run_id]
    except KeyError as exc:
        raise VideoWorkflowError(f"Unknown video pipeline run_id: {run_id}") from exc


def collect_video_provenance(run_id: str) -> tuple[dict[str, Any], ...]:
    """Collect provenance events for a video pipeline run."""

    provenance = resume_video_pipeline(run_id).provenance
    node_events = tuple(event for event in provenance if "node_id" in event and event.get("event_type") == "node_completed")
    return node_events or provenance


def get_video_pipeline_run(run_id: str) -> VideoPipelineRun:
    """Return the stored run record for inspection."""

    return resume_video_pipeline(run_id)


def reset_video_workflow_state() -> None:
    """Clear in-memory runs and operations.

    Intended for tests only. Production workers should use a durable run store.
    """

    _RUN_STORE.clear()
    _register_builtin_operations()


def reset_video_run_store() -> None:
    """Compatibility alias for tests/callers using run-store terminology."""

    reset_video_workflow_state()


def build_simple_gait_pipeline_definition() -> VideoPipelineDefinition:
    """Return an example gait pipeline definition for documentation/tests.

    This definition assumes an operation named ``example.compute_gait_metrics``
    is registered by the caller. The runner itself does not synthesize pose or
    run gait analysis without explicit operation implementations.
    """

    return VideoPipelineDefinition(
        pipeline_id="simple_gait_analysis_v1",
        description="Example ingest -> pose -> gait metrics -> report payload workflow.",
        nodes=(
            VideoPipelineNode(
                node_id="ingest",
                name="video_asset",
                operation="builtin.register_input_video",
                artifact_type="video_asset",
            ),
            VideoPipelineNode(
                node_id="pose",
                name="pose_sequence",
                operation="example.estimate_pose",
                inputs=("ingest",),
                backend_name="example_pose_backend",
                backend_version="0.1.0",
                artifact_type="pose_sequence",
            ),
            VideoPipelineNode(
                node_id="gait_metrics",
                name="gait_metrics",
                operation="example.compute_gait_metrics",
                inputs=("pose",),
                artifact_type="clinical_metrics",
            ),
            VideoPipelineNode(
                node_id="clinical_report",
                name="clinical_task_report",
                operation="builtin.generate_clinical_task_report",
                inputs=("gait_metrics",),
                artifact_type="report_payload",
            ),
        ),
    )


def _normalize_pipeline_definition(
    definition: VideoPipelineDefinition | dict[str, Any] | list[VideoPipelineNode] | tuple[VideoPipelineNode, ...],
) -> VideoPipelineDefinition:
    if isinstance(definition, VideoPipelineDefinition):
        return definition
    if isinstance(definition, dict):
        nodes = tuple(_node_from_mapping(node) for node in definition.get("nodes", ()))
        return VideoPipelineDefinition(
            pipeline_id=str(definition.get("pipeline_id") or definition.get("id") or _new_id("pipeline")),
            description=definition.get("description"),
            nodes=nodes,
        )
    return VideoPipelineDefinition(pipeline_id=_new_id("pipeline"), nodes=tuple(definition))


def _node_from_mapping(payload: dict[str, Any]) -> VideoPipelineNode:
    return VideoPipelineNode(
        node_id=str(payload["node_id"]),
        name=payload.get("name"),
        operation=str(payload["operation"]),
        inputs=tuple(str(item) for item in payload.get("inputs", ())),
        parameters=dict(payload.get("parameters", {})),
        backend_name=payload.get("backend_name"),
        backend_version=payload.get("backend_version"),
        model_name=payload.get("model_name"),
        model_version=payload.get("model_version"),
        artifact_type=payload.get("artifact_type", "generic"),
    )


def _validate_pipeline(definition: VideoPipelineDefinition) -> None:
    seen: set[str] = {"input"}
    for node in definition.nodes:
        if node.node_id in seen:
            raise VideoWorkflowError(f"Duplicate pipeline node_id: {node.node_id}")
        missing = [input_id for input_id in node.inputs if input_id not in seen]
        if missing:
            raise VideoWorkflowError(f"Node {node.node_id} references unknown inputs: {missing}")
        seen.add(node.node_id)


def _get_operation(name: str) -> PipelineOperation:
    try:
        return _OPERATION_REGISTRY[name]
    except KeyError as exc:
        raise VideoWorkflowError(f"Unregistered video pipeline operation: {name}") from exc


def _provenance_event(
    *,
    run_id: str,
    event_type: str,
    node: VideoPipelineNode | None,
    status: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "event_id": _new_id("provenance"),
        "run_id": run_id,
        "event_type": event_type,
        "status": status,
        "timestamp": utc_now_iso(),
    }
    if node is not None:
        payload.update(
            {
                "node_id": node.node_id,
                "operation": node.operation,
                "parameters": json_ready(node.parameters),
                "backend_name": node.backend_name,
                "backend_version": node.backend_version,
                "model_name": node.model_name,
                "model_version": node.model_version,
            }
        )
    if details:
        payload["details"] = json_ready(details)
    return payload


def _artifact_metadata(node: VideoPipelineNode, result: Any) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "operation": node.operation,
        "backend_name": node.backend_name,
        "backend_version": node.backend_version,
        "model_name": node.model_name,
        "model_version": node.model_version,
        "parameters": json_ready(node.parameters),
    }
    if hasattr(result, "schema_version"):
        metadata["schema_version"] = getattr(result, "schema_version")
    return metadata


def _artifact_from_result(
    run_id: str,
    node: VideoPipelineNode,
    result: Any,
) -> VideoArtifactRecord:
    if isinstance(result, VideoArtifactRecord):
        return VideoArtifactRecord(
            artifact_id=result.artifact_id,
            run_id=run_id,
            node_id=result.node_id,
            name=result.name,
            artifact_type=result.artifact_type,
            created_at=result.created_at,
            value=result.value,
            uri=result.uri,
            metadata={**result.metadata, **_artifact_metadata(node, result.value)},
        )

    value = result.get("artifact") if isinstance(result, dict) and "artifact" in result else result
    return VideoArtifactRecord(
        artifact_id=_new_id("artifact"),
        run_id=run_id,
        node_id=node.node_id,
        name=node.name or node.node_id,
        artifact_type=node.artifact_type,
        created_at=utc_now_iso(),
        value=_json_value(value),
        metadata=_artifact_metadata(node, value),
    )


def _extract_custom_provenance(result: Any) -> dict[str, Any] | None:
    if isinstance(result, dict) and isinstance(result.get("provenance"), dict):
        return {"custom": result["provenance"]}
    return None


def _node_completed_event(
    *,
    run_id: str,
    node: VideoPipelineNode,
    artifact: VideoArtifactRecord,
    result: Any,
) -> dict[str, Any]:
    payload = _provenance_event(
        run_id=run_id,
        event_type="node_completed",
        node=node,
        status="completed",
        details={
            "artifact_id": artifact.artifact_id,
            "artifact_type": artifact.artifact_type,
            **(_extract_custom_provenance(result) or {}),
        },
    )
    payload["artifact_id"] = artifact.artifact_id
    payload["artifact_type"] = artifact.artifact_type
    payload["backend"] = node.backend_name
    payload["version"] = node.backend_version
    custom = _extract_custom_provenance(result)
    if custom:
        payload.update(custom)
    return payload


def _json_value(result: Any) -> Any:
    if hasattr(result, "to_json_dict") and callable(result.to_json_dict):
        return result.to_json_dict()
    if hasattr(result, "to_dict") and callable(result.to_dict):
        return result.to_dict()
    return json_ready(result)


def _current_failed_node(
    nodes: tuple[VideoPipelineNode, ...],
    statuses: dict[str, PipelineNodeStatus],
) -> VideoPipelineNode | None:
    for node in nodes:
        if statuses.get(node.node_id) == "running":
            return node
    return None


def _builtin_register_input_video(context: PipelineContext, node: VideoPipelineNode) -> dict[str, Any]:
    return {
        "video_ref": context["input_video_ref"],
        "parameters": json_ready(node.parameters),
        "registered_at": utc_now_iso(),
    }


def _builtin_generate_clinical_task_report(context: PipelineContext, node: VideoPipelineNode) -> Any:
    from deepsynaps_video.reporting import generate_clinical_task_report_payload

    gait_metrics = None
    for input_id in node.inputs:
        candidate = context["artifacts_by_node"].get(input_id)
        if candidate is not None and candidate.__class__.__name__ == "GaitMetrics":
            gait_metrics = candidate
    return generate_clinical_task_report_payload(
        str(context["input_video_ref"]),
        gait_metrics=gait_metrics,
        session_id=str(context["run_id"]),
    )


def _register_builtin_operations() -> None:
    _OPERATION_REGISTRY.setdefault("builtin.register_input_video", _builtin_register_input_video)
    _OPERATION_REGISTRY.setdefault("builtin.generate_clinical_task_report", _builtin_generate_clinical_task_report)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


_register_builtin_operations()


__all__ = [
    "VideoArtifactRecord",
    "VideoPipelineDefinition",
    "VideoPipelineNode",
    "VideoPipelineRun",
    "VideoWorkflowError",
    "build_simple_gait_pipeline_definition",
    "collect_video_provenance",
    "execute_video_pipeline",
    "get_video_pipeline_run",
    "register_video_pipeline_operation",
    "reset_video_workflow_state",
    "resume_video_pipeline",
]

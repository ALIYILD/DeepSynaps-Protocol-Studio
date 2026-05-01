"""
Lean MRI workflow orchestration — auditable step runner (Nipype-inspired, not a full engine).

Persists run state under ``<artefacts_dir>/workflow/`` for **resume** and **provenance**.
Each step is a **handler** keyed by ``PipelineNode.handler_key``; handlers return
:class:`StepResult` with optional artifact records and context updates.

Design goals: explicit metadata, retries, failure isolation, structured logs — without
a generic DAG framework or distributed queue (use Celery at the API layer if needed).
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

ISO_NOW = lambda: datetime.now(timezone.utc).isoformat()

NodeStatus = Literal["pending", "running", "success", "failed", "skipped"]
RunStatus = Literal["pending", "running", "completed", "failed", "partial"]


class ArtifactRecord(BaseModel):
    """One output path (or URI) produced by a pipeline node."""

    node_id: str
    path: str
    kind: Literal["file", "directory", "json", "log", "other"] = "file"
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class PipelineNode(BaseModel):
    """Declarative step: ``handler_key`` selects the registered callable."""

    id: str
    name: str
    handler_key: str
    description: str = ""
    depends_on: list[str] = Field(default_factory=list)
    max_retries: int = 2
    """Retries after first failure (total attempts = 1 + max_retries)."""
    continue_on_failure: bool = False
    """If True, downstream steps still run after this node fails."""
    metadata: dict[str, Any] = Field(default_factory=dict)
    """Tool name, version, container image, etc. — audit only."""

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class StepResult(BaseModel):
    ok: bool
    artifacts: list[ArtifactRecord] = Field(default_factory=list)
    context_updates: dict[str, Any] = Field(default_factory=dict)
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class NodeExecutionState(BaseModel):
    status: NodeStatus = "pending"
    attempts: int = 0
    last_error: str | None = None
    artifacts: list[ArtifactRecord] = Field(default_factory=list)
    started_at: str | None = None
    finished_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class PipelineRun(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: RunStatus = "pending"
    artefacts_dir: str
    pipeline_version: str = "deepsynaps-mri-workflow-1"
    context: dict[str, Any] = Field(default_factory=dict)
    nodes: list[PipelineNode] = Field(default_factory=list)
    node_states: dict[str, NodeExecutionState] = Field(default_factory=dict)
    execution_order: list[str] = Field(default_factory=list)
    """Resolved topological order of node ids."""
    provenance_path: str | None = None
    state_path: str | None = None
    started_at: str | None = None
    finished_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = self.model_dump(mode="json")
        return d


StepHandler = Callable[[PipelineRun, PipelineNode], StepResult]


def _workflow_dir(artefacts_dir: Path) -> Path:
    d = artefacts_dir / "workflow"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _topological_order(nodes: list[PipelineNode]) -> list[str]:
    ids = {n.id for n in nodes}
    for n in nodes:
        for d in n.depends_on:
            if d not in ids:
                raise ValueError(f"Node {n.id} depends on unknown id {d}")

    deps: dict[str, set[str]] = {n.id: set(n.depends_on) for n in nodes}
    rev: dict[str, set[str]] = {n.id: set() for n in nodes}
    for nid, ds in deps.items():
        for d in ds:
            rev[d].add(nid)

    ready = deque([nid for nid, ds in deps.items() if not ds])
    out: list[str] = []
    while ready:
        u = ready.popleft()
        out.append(u)
        for v in rev.get(u, ()):
            deps[v].discard(u)
            if not deps[v]:
                ready.append(v)

    if len(out) != len(nodes):
        raise ValueError("Cycle or missing dependency in PipelineNode graph")
    return out


def _save_state(run: PipelineRun) -> None:
    wd = _workflow_dir(Path(run.artefacts_dir))
    path = wd / "pipeline_state.json"
    path.write_text(json.dumps(run.to_dict(), indent=2), encoding="utf-8")
    run.state_path = str(path.resolve())


def load_pipeline_run(artefacts_dir: str | Path) -> PipelineRun | None:
    """Load persisted :class:`PipelineRun` or return ``None``."""
    p = Path(artefacts_dir) / "workflow" / "pipeline_state.json"
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return PipelineRun.model_validate(data)
    except Exception:  # noqa: BLE001
        log.exception("Failed to load pipeline state from %s", p)
        return None


def collect_provenance(run: PipelineRun) -> dict[str, Any]:
    """Aggregate artifacts and node metadata into one JSON-serialisable blob."""
    artifacts: list[dict[str, Any]] = []
    for nid, st in run.node_states.items():
        for a in st.artifacts:
            artifacts.append({**a.to_dict(), "node_status": st.status})
    nodes_meta = [n.to_dict() for n in run.nodes]
    node_states_summary = {
        nid: {
            "status": st.status,
            "attempts": st.attempts,
            "last_error": st.last_error,
            "started_at": st.started_at,
            "finished_at": st.finished_at,
        }
        for nid, st in run.node_states.items()
    }
    return {
        "run_id": run.run_id,
        "status": run.status,
        "pipeline_version": run.pipeline_version,
        "artefacts_dir": run.artefacts_dir,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "execution_order": run.execution_order,
        "nodes": nodes_meta,
        "node_states": node_states_summary,
        "artifacts": artifacts,
        "context_keys": sorted(run.context.keys()),
    }


def _write_provenance(run: PipelineRun) -> None:
    wd = _workflow_dir(Path(run.artefacts_dir))
    prov = wd / "provenance.json"
    payload = collect_provenance(run)
    prov.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    run.provenance_path = str(prov.resolve())


def execute_pipeline(
    nodes: list[PipelineNode],
    handlers: dict[str, StepHandler],
    artefacts_dir: str | Path,
    *,
    initial_context: dict[str, Any] | None = None,
    resume: bool = False,
    run_id: str | None = None,
) -> PipelineRun:
    """
    Execute nodes in dependency order. Persists state after each node.

    Parameters
    ----------
    resume
        If True, load ``workflow/pipeline_state.json`` when present and skip
        nodes already in ``success`` (unless you delete state for a full re-run).
    """
    root = Path(artefacts_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)

    existing = load_pipeline_run(root) if resume else None
    if resume and existing is not None:
        if [n.model_dump() for n in existing.nodes] != [n.model_dump() for n in nodes]:
            raise ValueError(
                "Cannot resume: pipeline nodes do not match persisted workflow state "
                f"under {root / 'workflow'}. Remove that directory or pass the same "
                "node definitions as the original run."
            )
        run = existing
        if run.status == "completed":
            log.info("Pipeline already completed run_id=%s", run.run_id)
            return run
    else:
        order = _topological_order(nodes)
        run = PipelineRun(
            run_id=run_id or str(uuid.uuid4()),
            artefacts_dir=str(root),
            context=dict(initial_context or {}),
            nodes=nodes,
            execution_order=order,
            node_states={n.id: NodeExecutionState() for n in nodes},
        )

    if not run.execution_order:
        run.execution_order = _topological_order(run.nodes)

    run.status = "running"
    run.started_at = run.started_at or ISO_NOW()
    _save_state(run)

    any_failed = False
    aborted = False

    for nid in run.execution_order:
        node = next(n for n in run.nodes if n.id == nid)
        st = run.node_states[nid]

        if st.status == "success":
            log.info(
                "workflow_skip node_id=%s run_id=%s reason=already_success",
                nid,
                run.run_id,
            )
            continue

        if aborted:
            st.status = "skipped"
            st.finished_at = ISO_NOW()
            _save_state(run)
            continue

        for dep in node.depends_on:
            dep_st = run.node_states.get(dep)
            if dep_st and dep_st.status == "failed":
                dep_node = next((n for n in run.nodes if n.id == dep), None)
                skip_downstream = not (dep_node and dep_node.continue_on_failure)
                if skip_downstream:
                    st.status = "skipped"
                    st.last_error = f"dependency_failed:{dep}"
                    st.finished_at = ISO_NOW()
                    log.warning(
                        "workflow_skip node_id=%s run_id=%s dependency=%s",
                        nid,
                        run.run_id,
                        dep,
                    )
                    break
        else:
            # deps OK — run handler
            handler = handlers.get(node.handler_key)
            if handler is None:
                st.status = "failed"
                st.last_error = f"unknown_handler:{node.handler_key}"
                st.finished_at = ISO_NOW()
                any_failed = True
                if not node.continue_on_failure:
                    aborted = True
                _save_state(run)
                continue

            max_attempts = 1 + max(0, node.max_retries)
            last_err = ""
            for attempt in range(max_attempts):
                st.attempts = attempt + 1
                st.status = "running"
                st.started_at = ISO_NOW()
                _save_state(run)

                t0 = time.perf_counter()
                try:
                    result = handler(run, node)
                except Exception as exc:  # noqa: BLE001
                    last_err = str(exc)
                    log.exception(
                        "workflow_node_error node_id=%s run_id=%s attempt=%s",
                        nid,
                        run.run_id,
                        attempt + 1,
                    )
                    result = StepResult(ok=False, message=last_err)

                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                log.info(
                    "workflow_step node_id=%s run_id=%s handler=%s ok=%s attempts=%s elapsed_ms=%.1f msg=%s",
                    nid,
                    run.run_id,
                    node.handler_key,
                    result.ok,
                    attempt + 1,
                    elapsed_ms,
                    result.message[:200] if result.message else "",
                )

                if result.ok:
                    st.status = "success"
                    st.last_error = None
                    st.artifacts = list(result.artifacts)
                    st.finished_at = ISO_NOW()
                    run.context.update(result.context_updates)
                    break
                last_err = result.message or last_err
                st.last_error = last_err

            if st.status != "success":
                st.status = "failed"
                st.finished_at = ISO_NOW()
                any_failed = True
                if not node.continue_on_failure:
                    aborted = True

        _save_state(run)

    run.finished_at = ISO_NOW()
    failed_nodes = sum(1 for st in run.node_states.values() if st.status == "failed")
    if failed_nodes == 0:
        run.status = "completed"
    elif aborted:
        run.status = "failed"
    else:
        run.status = "partial"

    _save_state(run)
    _write_provenance(run)
    return run


def resume_pipeline(
    artefacts_dir: str | Path,
    handlers: dict[str, StepHandler],
) -> PipelineRun:
    """Load state and continue execution (same ``nodes`` definition as prior run)."""
    run = load_pipeline_run(artefacts_dir)
    if run is None:
        raise FileNotFoundError(f"No pipeline state in {artefacts_dir}/workflow/")
    return execute_pipeline(run.nodes, handlers, artefacts_dir, resume=True)


__all__ = [
    "ArtifactRecord",
    "PipelineNode",
    "PipelineRun",
    "StepHandler",
    "StepResult",
    "collect_provenance",
    "execute_pipeline",
    "load_pipeline_run",
    "resume_pipeline",
]

"""Tests for :mod:`deepsynaps_mri.workflow_orchestration`."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_mri.workflow_orchestration import (
    ArtifactRecord,
    PipelineNode,
    StepResult,
    collect_provenance,
    execute_pipeline,
    load_pipeline_run,
    resume_pipeline,
)


def test_topological_order() -> None:
    from deepsynaps_mri.workflow_orchestration import _topological_order

    nodes = [
        PipelineNode(id="c", name="c", handler_key="h", depends_on=["b"]),
        PipelineNode(id="a", name="a", handler_key="h"),
        PipelineNode(id="b", name="b", handler_key="h", depends_on=["a"]),
    ]
    assert _topological_order(nodes) == ["a", "b", "c"]


def test_cycle_raises() -> None:
    from deepsynaps_mri.workflow_orchestration import _topological_order

    nodes = [
        PipelineNode(id="a", name="a", handler_key="h", depends_on=["b"]),
        PipelineNode(id="b", name="b", handler_key="h", depends_on=["a"]),
    ]
    with pytest.raises(ValueError, match="Cycle"):
        _topological_order(nodes)


def test_execute_pipeline_success(tmp_path: Path) -> None:
    def h_ok(run, node):
        p = Path(run.artefacts_dir) / f"{node.id}.txt"
        p.write_text("x", encoding="utf-8")
        return StepResult(
            ok=True,
            artifacts=[
                ArtifactRecord(node_id=node.id, path=str(p), kind="file", label="out"),
            ],
            context_updates={f"{node.id}_done": True},
        )

    nodes = [
        PipelineNode(id="s1", name="step1", handler_key="ok"),
        PipelineNode(id="s2", name="step2", handler_key="ok", depends_on=["s1"]),
    ]
    run = execute_pipeline(nodes, {"ok": h_ok}, tmp_path)
    assert run.status == "completed"
    assert run.context.get("s1_done") is True
    assert run.context.get("s2_done") is True
    assert (tmp_path / "workflow" / "provenance.json").exists()


def test_execute_pipeline_retry_then_success(tmp_path: Path) -> None:
    calls = {"n": 0}

    def flaky(run, node):
        calls["n"] += 1
        if calls["n"] < 2:
            return StepResult(ok=False, message="transient")
        return StepResult(ok=True, artifacts=[])

    nodes = [
        PipelineNode(id="f", name="flaky", handler_key="flaky", max_retries=2),
    ]
    run = execute_pipeline(nodes, {"flaky": flaky}, tmp_path)
    assert run.status == "completed"
    assert run.node_states["f"].attempts == 2


def test_failure_isolates_downstream(tmp_path: Path) -> None:
    def bad(run, node):
        return StepResult(ok=False, message="no")

    def good(run, node):
        return StepResult(ok=True)

    nodes = [
        PipelineNode(id="a", name="a", handler_key="bad"),
        PipelineNode(id="b", name="b", handler_key="good", depends_on=["a"]),
    ]
    run = execute_pipeline(nodes, {"bad": bad, "good": good}, tmp_path)
    assert run.status == "failed"
    assert run.node_states["a"].status == "failed"
    assert run.node_states["b"].status == "skipped"


def test_continue_on_failure(tmp_path: Path) -> None:
    def bad(run, node):
        return StepResult(ok=False)

    def good(run, node):
        return StepResult(ok=True)

    nodes = [
        PipelineNode(id="a", name="a", handler_key="bad", continue_on_failure=True),
        PipelineNode(id="b", name="b", handler_key="good", depends_on=["a"]),
    ]
    run = execute_pipeline(nodes, {"bad": bad, "good": good}, tmp_path)
    assert run.status == "partial"
    assert run.node_states["b"].status == "success"


def test_resume_after_partial_failure(tmp_path: Path) -> None:
    steps = []

    def h1(run, node):
        steps.append("1")
        return StepResult(ok=True)

    def h2_fail(run, node):
        steps.append("2fail")
        return StepResult(ok=False, message="fail once")

    def h2_ok(run, node):
        steps.append("2ok")
        return StepResult(ok=True)

    nodes = [
        PipelineNode(id="a", name="a", handler_key="h1"),
        PipelineNode(id="b", name="b", handler_key="h2", depends_on=["a"], max_retries=0),
    ]
    r1 = execute_pipeline(nodes, {"h1": h1, "h2": h2_fail}, tmp_path)
    assert r1.status == "failed"
    assert steps == ["1", "2fail"]

    steps.clear()
    r2 = resume_pipeline(tmp_path, {"h1": h1, "h2": h2_ok})
    assert r2.status == "completed"
    assert steps == ["2ok"]
    assert r2.node_states["a"].status == "success"
    assert r2.node_states["b"].status == "success"


def test_resume_completed_is_noop(tmp_path: Path) -> None:
    steps = []

    def h(run, node):
        steps.append(node.id)
        return StepResult(ok=True)

    nodes = [
        PipelineNode(id="a", name="a", handler_key="h"),
    ]
    execute_pipeline(nodes, {"h": h}, tmp_path)
    steps.clear()
    r2 = resume_pipeline(tmp_path, {"h": h})
    assert r2.status == "completed"
    assert steps == []


def test_collect_provenance(tmp_path: Path) -> None:
    def h(run, node):
        return StepResult(
            ok=True,
            artifacts=[ArtifactRecord(node_id=node.id, path="/tmp/x", kind="file")],
        )

    nodes = [PipelineNode(id="only", name="only", handler_key="h")]
    run = execute_pipeline(nodes, {"h": h}, tmp_path)
    prov = collect_provenance(run)
    assert prov["run_id"] == run.run_id
    assert len(prov["artifacts"]) == 1


def test_unknown_handler_fails(tmp_path: Path) -> None:
    nodes = [PipelineNode(id="x", name="x", handler_key="missing")]
    run = execute_pipeline(nodes, {}, tmp_path)
    assert run.status == "failed"
    assert "unknown_handler" in (run.node_states["x"].last_error or "")


def test_load_missing_returns_none(tmp_path: Path) -> None:
    assert load_pipeline_run(tmp_path) is None

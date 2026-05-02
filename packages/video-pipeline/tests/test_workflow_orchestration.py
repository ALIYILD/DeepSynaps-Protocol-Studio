from __future__ import annotations

import json
from pathlib import Path

from deepsynaps_video.workflow_orchestration import (
    VideoArtifactRecord,
    VideoPipelineNode,
    collect_video_provenance,
    execute_video_pipeline,
    register_video_operation,
    reset_video_run_store,
    resume_video_pipeline,
)


def test_execute_video_pipeline_records_artifacts_and_provenance() -> None:
    reset_video_run_store()

    def step_one(context, node):
        return {"artifact": {"value": context["input_video_ref"], "node": node.node_id}}

    def step_two(context, node):
        return {
            "artifact": {
                "value": context["artifacts"]["ingest"]["value"],
                "backend": node.backend,
            },
            "provenance": {"custom": "ok"},
        }

    register_video_operation("test_ingest", step_one)
    register_video_operation("test_analyze", step_two)
    pipeline = (
        VideoPipelineNode("ingest", "test_ingest", backend="fixture-ingest", version="1.0"),
        VideoPipelineNode(
            "analyze",
            "test_analyze",
            depends_on=("ingest",),
            backend="fixture-analyzer",
            version="2.0",
            parameters={"threshold": 0.5},
        ),
    )

    run = execute_video_pipeline(pipeline, "video://fixture")

    assert run.status == "completed"
    assert [artifact.node_id for artifact in run.artifacts] == ["ingest", "analyze"]
    assert run.artifacts[-1].payload["backend"] == "fixture-analyzer"
    assert run.provenance[0]["operation"] == "test_ingest"
    assert run.provenance[1]["backend"] == "fixture-analyzer"
    assert run.provenance[1]["parameters"] == {"threshold": 0.5}


def test_resume_and_collect_video_provenance() -> None:
    reset_video_run_store()

    def noop(context, node):
        return VideoArtifactRecord(
            artifact_id="artifact-fixed",
            node_id=node.node_id,
            artifact_type="fixture",
            uri=None,
            payload={"input": context["input_video_ref"]},
            created_at="2026-05-01T00:00:00+00:00",
        )

    register_video_operation("test_noop", noop)
    run = execute_video_pipeline((VideoPipelineNode("noop", "test_noop"),), "video://resume")

    resumed = resume_video_pipeline(run.run_id)
    provenance = collect_video_provenance(run.run_id)

    assert resumed.run_id == run.run_id
    assert resumed.artifacts[0].artifact_id == "artifact-fixed"
    assert provenance[0]["node_id"] == "noop"
    assert provenance[0]["artifact_id"] == "artifact-fixed"


def test_example_simple_gait_pipeline_is_valid() -> None:
    example_path = Path(__file__).resolve().parents[1] / "demo" / "simple_gait_pipeline.json"
    payload = json.loads(example_path.read_text())

    assert payload["pipeline_id"] == "simple_gait_analysis_v1"
    assert [node["node_id"] for node in payload["nodes"]] == [
        "ingest",
        "pose",
        "gait_metrics",
        "clinical_report",
    ]

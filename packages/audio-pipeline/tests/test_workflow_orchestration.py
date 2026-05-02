"""Tests for audio pipeline workflow orchestration (noop / fake analyzers)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, MutableMapping

import pytest

from deepsynaps_audio.schemas import (
    AudioArtifactRecord,
    AudioPipelineRun,
    AudioPipelineStage,
)
from deepsynaps_audio.workflow_orchestration import (
    _get_run,
    clear_run_store_for_tests,
    collect_audio_provenance,
    execute_audio_pipeline,
    resume_audio_pipeline,
    validate_pipeline_definition,
    DEFAULT_STEP_HANDLERS,
)


EXAMPLE_PATH = (
    Path(__file__).resolve().parents[1] / "examples" / "pd_voice_pipeline.example.json"
)


@pytest.fixture(autouse=True)
def _clear_store() -> Any:
    clear_run_store_for_tests()
    yield
    clear_run_store_for_tests()


def test_example_definition_loads() -> None:
    raw = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    defn = validate_pipeline_definition(raw)
    assert defn.pipeline_id == "pd_voice_neuromod_baseline"
    assert len(defn.nodes) == 6


def test_execute_pd_pipeline_end_to_end() -> None:
    raw = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    inp = {
        "uri": "s3://bucket/patient/segment.wav",
        "session_id": "sess-pd-001",
        "task_protocol": "sustained_vowel_a",
    }
    run = execute_audio_pipeline(raw, inp)
    assert run.status == "completed"
    assert len(run.completed_node_ids) == 6
    assert len(run.artifacts) == 6
    assert run.context.get("pd_voice") is not None
    assert run.context.get("qc") is not None
    AudioPipelineRun.model_validate(run.model_dump())


def test_artifact_and_provenance_schema() -> None:
    raw = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    run = execute_audio_pipeline(
        raw,
        {"uri": "x://a.wav", "session_id": "s1", "task_protocol": "sustained_vowel_a"},
    )
    for art in run.artifacts:
        AudioArtifactRecord.model_validate(art.model_dump())
    prov = collect_audio_provenance(run.run_id)
    assert prov[0]["kind"] == "run"
    assert prov[0]["studio_pipeline_version"]
    assert len(prov) == 1 + len(run.artifacts)
    qc_art = next(a for a in run.artifacts if a.kind == "audio_quality")
    assert qc_art.provenance.get("qc_engine_version")


def test_resume_after_failure() -> None:
    def boom_ctx(ctx: MutableMapping[str, Any], node: Any, inp: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        raise RuntimeError("simulated neuro failure")

    custom = dict(DEFAULT_STEP_HANDLERS)
    custom["neurological_voice_analyzers"] = boom_ctx

    minimal = {
        "pipeline_id": "resume-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "a", "stage": "ingestion", "params": {}},
            {"node_id": "b", "stage": "qc", "params": {}},
            {"node_id": "c", "stage": "acoustic_feature_engine", "params": {}},
            {"node_id": "d", "stage": "neurological_voice_analyzers", "params": {}},
        ],
    }
    with pytest.raises(RuntimeError, match="simulated"):
        execute_audio_pipeline(minimal, {"uri": "u", "session_id": "s"}, handlers=custom, run_id="r-fail-1")

    failed = _get_run("r-fail-1")
    assert failed is not None
    assert failed.status == "failed"
    assert "a" in failed.completed_node_ids and "b" in failed.completed_node_ids
    # resume with default neuro handler
    run2 = resume_audio_pipeline("r-fail-1")
    assert run2.status == "completed"
    assert "d" in run2.completed_node_ids
    assert run2.context.get("pd_voice") is not None


def test_respiratory_branch_pipeline() -> None:
    defn = {
        "pipeline_id": "resp_screen",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "i1", "stage": "ingestion", "params": {}},
            {"node_id": "q1", "stage": "qc", "params": {}},
            {"node_id": "a1", "stage": "acoustic_feature_engine", "params": {}},
            {"node_id": "r1", "stage": "respiratory_voice_analyzer", "params": {"model_version": "1.0.0"}},
            {"node_id": "rep", "stage": "reporting", "params": {}},
        ],
    }
    run = execute_audio_pipeline(defn, {"uri": "cough.wav", "session_id": "s-resp", "task_protocol": "voluntary_cough"})
    assert run.status == "completed"
    kinds = {a.kind for a in run.artifacts}
    assert "respiratory_risk" in kinds
    assert run.context.get("respiratory") is not None


def test_duplicate_run_id_completed_is_idempotent() -> None:
    raw = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    inp = {"uri": "u", "session_id": "s", "task_protocol": "sustained_vowel_a"}
    r1 = execute_audio_pipeline(raw, inp, run_id="same-id")
    r2 = execute_audio_pipeline(raw, inp, run_id="same-id")
    assert r1.run_id == r2.run_id
    assert r1.finished_at == r2.finished_at


def test_run_store_rehydrates_from_disk(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSYNAPS_AUDIO_RUN_STORE_DIR", str(tmp_path))
    clear_run_store_for_tests()
    raw = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
    inp = {"uri": "u", "session_id": "s", "task_protocol": "sustained_vowel_a"}
    execute_audio_pipeline(raw, inp, run_id="disk-rehydrate-1")
    assert (tmp_path / "disk-rehydrate-1.json").is_file()
    clear_run_store_for_tests()
    # In-memory dict cleared; load still succeeds from JSON on disk.
    prov = collect_audio_provenance("disk-rehydrate-1")
    assert len(prov) >= 2
    monkeypatch.delenv("DEEPSYNAPS_AUDIO_RUN_STORE_DIR", raising=False)
    clear_run_store_for_tests()

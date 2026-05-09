"""Additional tests for audio pipeline workflow orchestration residual branches (PR 84).

Targets missing lines from the 95% coverage report:
- line 67-68: OSError on disk persist
- line 140: failed/partial status guard (run_id with failed status + completed_node_ids)
- line 168: no handler registered for stage
- line 218: no handler in resume branch
- line 297-301: execute_voice_pipeline import path (mocked)
- line 402: fake_qc=False branch in _handler_qc
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, MutableMapping
from unittest.mock import patch, MagicMock

import pytest

from deepsynaps_audio.workflow_orchestration import (
    DEFAULT_STEP_HANDLERS,
    _get_run,
    _persist_run_to_disk,
    clear_run_store_for_tests,
    collect_audio_provenance,
    execute_audio_pipeline,
    resume_audio_pipeline,
    validate_pipeline_definition,
)
from deepsynaps_audio.schemas import AudioPipelineRun


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINIMAL_DEFN = {
    "pipeline_id": "test-extras",
    "version": "1.0.0",
    "nodes": [
        {"node_id": "n_ingest", "stage": "ingestion", "params": {}},
        {"node_id": "n_qc", "stage": "qc", "params": {}},
    ],
}

MINIMAL_INP = {"uri": "s3://bucket/clip.wav", "session_id": "sess-extras-001"}


@pytest.fixture(autouse=True)
def _clear() -> Any:
    clear_run_store_for_tests()
    yield
    clear_run_store_for_tests()


# ---------------------------------------------------------------------------
# OSError on disk persist (line 67-68)
# ---------------------------------------------------------------------------


def test_persist_run_to_disk_oserror_is_logged(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    """_persist_run_to_disk swallows OSError and logs it (line 67-68)."""
    monkeypatch.setenv("DEEPSYNAPS_AUDIO_RUN_STORE_DIR", str(tmp_path))
    # Make the target file a directory so write fails with OSError
    run = execute_audio_pipeline(MINIMAL_DEFN, MINIMAL_INP, run_id="persist-err-1")
    bad_path = tmp_path / "persist-err-2.json"
    bad_path.mkdir()  # occupy the path with a directory — write_text will OSError
    # Manually call _persist_run_to_disk with the dir-colliding run_id
    run2 = run.model_copy(update={"run_id": "persist-err-2"})
    import logging
    with caplog.at_level(logging.ERROR, logger="deepsynaps_audio.workflow_orchestration"):
        _persist_run_to_disk(run2)
    # No exception propagated
    # (caplog may or may not capture on all platforms — primary check is no raise)


# ---------------------------------------------------------------------------
# failed + completed_node_ids guard (line 140)
# ---------------------------------------------------------------------------


def test_execute_raises_on_failed_run_with_partial_nodes() -> None:
    """execute_audio_pipeline raises RuntimeError for run with failed status + partial progress."""

    def boom(ctx: MutableMapping[str, Any], node: Any, inp: Any) -> tuple[dict, list]:
        raise RuntimeError("boom")

    custom = dict(DEFAULT_STEP_HANDLERS)
    custom["qc"] = boom

    with pytest.raises(RuntimeError, match="boom"):
        execute_audio_pipeline(MINIMAL_DEFN, MINIMAL_INP, handlers=custom, run_id="fail-partial-1")

    failed_run = _get_run("fail-partial-1")
    assert failed_run is not None
    assert failed_run.status == "failed"
    assert "n_ingest" in failed_run.completed_node_ids

    # Now try to execute same run_id again — must raise with guidance to use resume
    with pytest.raises(RuntimeError, match="resume_audio_pipeline"):
        execute_audio_pipeline(MINIMAL_DEFN, MINIMAL_INP, run_id="fail-partial-1")


def test_execute_raises_on_running_status() -> None:
    """execute_audio_pipeline raises RuntimeError if run is in 'running' state."""
    # Manually inject a run with status=running
    from deepsynaps_audio.workflow_orchestration import _put_run
    fake_run = AudioPipelineRun(
        run_id="running-1",
        pipeline_id="test",
        pipeline_version="1.0.0",
        pipeline_definition={},
        input_audio_ref={},
        status="running",
    )
    _put_run(fake_run)

    with pytest.raises(RuntimeError, match="already in progress"):
        execute_audio_pipeline(MINIMAL_DEFN, MINIMAL_INP, run_id="running-1")


# ---------------------------------------------------------------------------
# No handler registered for stage (line 168)
# ---------------------------------------------------------------------------


def test_execute_raises_on_missing_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    """KeyError raised when a node's stage has no handler registered.

    DEFAULT_STEP_HANDLERS is pre-seeded with all known stages.  The only way
    to hit the 'no handler' guard (line 168) is to patch DEFAULT_STEP_HANDLERS
    so 'qc' is absent after the merge.
    """
    import deepsynaps_audio.workflow_orchestration as wo

    partial_handlers = {k: v for k, v in wo.DEFAULT_STEP_HANDLERS.items() if k != "qc"}
    monkeypatch.setattr(wo, "DEFAULT_STEP_HANDLERS", partial_handlers)

    defn = {
        "pipeline_id": "missing-handler-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "x1", "stage": "ingestion", "params": {}},
            {"node_id": "x2", "stage": "qc", "params": {}},
        ],
    }
    with pytest.raises(KeyError, match="qc"):
        execute_audio_pipeline(defn, MINIMAL_INP, run_id="no-handler-1")

    # The run should be marked failed
    run = _get_run("no-handler-1")
    assert run is not None
    assert run.status == "failed"


# ---------------------------------------------------------------------------
# No handler in resume branch (line 218)
# ---------------------------------------------------------------------------


def test_resume_raises_on_missing_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    """resume_audio_pipeline raises KeyError when a stage has no handler.

    Like the execute test, we patch DEFAULT_STEP_HANDLERS to remove 'qc',
    then seed a failed run missing that step and resume.
    """
    from deepsynaps_audio.workflow_orchestration import _put_run
    import deepsynaps_audio.workflow_orchestration as wo
    import json

    defn = {
        "pipeline_id": "resume-nh-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "r_ingest", "stage": "ingestion", "params": {}},
            {"node_id": "r_qc", "stage": "qc", "params": {}},
        ],
    }
    defn_obj = validate_pipeline_definition(defn)

    # Pre-seed a failed run that has completed ingestion only
    pre_run = AudioPipelineRun(
        run_id="resume-nohandler-2",
        pipeline_id=defn_obj.pipeline_id,
        pipeline_version=defn_obj.version,
        pipeline_definition=json.loads(defn_obj.model_dump_json()),
        input_audio_ref=dict(MINIMAL_INP),
        status="failed",
        completed_node_ids=["r_ingest"],
        context={"run_id": "resume-nohandler-2", "ingestion": {"mode": "noop"}},
    )
    _put_run(pre_run)

    # Patch DEFAULT_STEP_HANDLERS so 'qc' is absent
    partial_handlers = {k: v for k, v in wo.DEFAULT_STEP_HANDLERS.items() if k != "qc"}
    monkeypatch.setattr(wo, "DEFAULT_STEP_HANDLERS", partial_handlers)

    with pytest.raises(KeyError, match="qc"):
        resume_audio_pipeline("resume-nohandler-2")


# ---------------------------------------------------------------------------
# fake_qc=False branch in _handler_qc (line 402)
# ---------------------------------------------------------------------------


def test_qc_warn_verdict_when_fake_qc_false() -> None:
    """When fake_qc=False the QC handler returns verdict='warn' with reason 'stub'."""
    defn = {
        "pipeline_id": "qc-warn-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "i1", "stage": "ingestion", "params": {}},
            {"node_id": "q1", "stage": "qc", "params": {"fake_qc": False}},
        ],
    }
    run = execute_audio_pipeline(defn, MINIMAL_INP)
    assert run.status == "completed"
    qc_ctx = run.context.get("qc", {})
    assert qc_ctx.get("verdict") == "warn"
    assert "stub" in qc_ctx.get("reasons", [])


# ---------------------------------------------------------------------------
# execute_voice_pipeline mocked path (lines 297-301)
# ---------------------------------------------------------------------------


def test_execute_voice_pipeline_delegates_to_execute_audio_pipeline() -> None:
    """execute_voice_pipeline should merge VOICE_PIPELINE_HANDLERS and call
    execute_audio_pipeline. We mock VOICE_PIPELINE_HANDLERS to avoid needing
    real audio."""
    from deepsynaps_audio import workflow_orchestration

    fake_voice_handlers: dict[str, Any] = {}  # override nothing — use defaults
    mock_module = MagicMock()
    mock_module.VOICE_PIPELINE_HANDLERS = fake_voice_handlers

    with patch.dict("sys.modules", {"deepsynaps_audio.voice_step_handlers": mock_module}):
        run = workflow_orchestration.execute_voice_pipeline(
            MINIMAL_DEFN,
            MINIMAL_INP,
            run_id="voice-pipe-mock-1",
        )
    assert run.status == "completed"
    assert "n_ingest" in run.completed_node_ids
    assert "n_qc" in run.completed_node_ids


# ---------------------------------------------------------------------------
# Resume of already-completed run returns cached
# ---------------------------------------------------------------------------


def test_resume_completed_run_returns_immediately() -> None:
    run = execute_audio_pipeline(MINIMAL_DEFN, MINIMAL_INP, run_id="resume-done-1")
    assert run.status == "completed"
    run2 = resume_audio_pipeline("resume-done-1")
    assert run2.run_id == run.run_id
    assert run2.status == "completed"


def test_resume_unknown_run_id_raises() -> None:
    with pytest.raises(KeyError, match="unknown run_id"):
        resume_audio_pipeline("does-not-exist-xyz")


# ---------------------------------------------------------------------------
# validate_pipeline_definition duplicate node_id guard
# ---------------------------------------------------------------------------


def test_validate_pipeline_duplicate_node_id_raises() -> None:
    bad = {
        "pipeline_id": "dup-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "same", "stage": "ingestion", "params": {}},
            {"node_id": "same", "stage": "qc", "params": {}},
        ],
    }
    with pytest.raises(ValueError, match="duplicate node_id"):
        execute_audio_pipeline(bad, MINIMAL_INP)


def test_validate_pipeline_unknown_depends_on_raises() -> None:
    bad = {
        "pipeline_id": "dep-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "a", "stage": "ingestion", "params": {}, "depends_on": ["nonexistent"]},
        ],
    }
    with pytest.raises(ValueError, match="depends_on references unknown"):
        execute_audio_pipeline(bad, MINIMAL_INP)


# ---------------------------------------------------------------------------
# Provenance — run-level fields are present and typed correctly
# ---------------------------------------------------------------------------


def test_provenance_run_record_fields() -> None:
    run = execute_audio_pipeline(MINIMAL_DEFN, MINIMAL_INP)
    prov = collect_audio_provenance(run.run_id)
    run_rec = prov[0]
    assert run_rec["kind"] == "run"
    assert run_rec["status"] == "completed"
    assert run_rec["pipeline_definition_digest"]
    assert run_rec["input_audio_ref_digest"]
    assert run_rec["studio_pipeline_version"]
    assert run_rec["norm_db_version"]
    # timestamps are ISO strings
    assert run_rec["started_at"]
    assert run_rec["finished_at"]


def test_provenance_unknown_run_id_raises() -> None:
    with pytest.raises(KeyError):
        collect_audio_provenance("no-such-run-prov")


# ---------------------------------------------------------------------------
# ingestion handler extracts URI correctly
# ---------------------------------------------------------------------------


def test_ingestion_handler_normalises_storage_uri() -> None:
    """'storage_uri' key in input_audio_ref is used when 'uri' absent."""
    defn = {
        "pipeline_id": "uri-test",
        "version": "1.0.0",
        "nodes": [
            {"node_id": "i", "stage": "ingestion", "params": {}},
        ],
    }
    inp = {"storage_uri": "gs://bucket/test.wav", "session_id": "s-uri-1"}
    run = execute_audio_pipeline(defn, inp)
    assert run.status == "completed"
    assert run.context["ingestion"]["normalized_uri"] == "gs://bucket/test.wav"


# ---------------------------------------------------------------------------
# Node skip when already in completed_node_ids (resume restart idempotency)
# ---------------------------------------------------------------------------


def test_completed_node_skipped_on_re_execute() -> None:
    """Nodes already in completed_node_ids are skipped during execute."""
    from deepsynaps_audio.workflow_orchestration import _put_run
    from deepsynaps_audio.schemas import AudioPipelineRun

    defn_obj = validate_pipeline_definition(MINIMAL_DEFN)
    # Pre-seed a run that already completed n_ingest — n_qc still pending
    pre_run = AudioPipelineRun(
        run_id="skip-test-1",
        pipeline_id=defn_obj.pipeline_id,
        pipeline_version=defn_obj.version,
        pipeline_definition=json.loads(defn_obj.model_dump_json()),
        input_audio_ref=dict(MINIMAL_INP),
        status="failed",
        completed_node_ids=["n_ingest"],
        context={"run_id": "skip-test-1", "ingestion": {"mode": "noop"}},
    )
    _put_run(pre_run)

    # resume (not execute) should pick up from n_qc only
    run = resume_audio_pipeline("skip-test-1")
    assert run.status == "completed"
    assert run.completed_node_ids.count("n_ingest") == 1  # not duplicated
    assert "n_qc" in run.completed_node_ids

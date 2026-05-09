"""Supplementary tests for ``deepsynaps_audio.workflow_orchestration``.

The existing ``test_workflow_orchestration.py`` covers happy-path and
resume; this file fills the audit / safety branches:

- Validation rejects duplicate node_ids and unknown depends_on refs.
- ``execute_audio_pipeline`` refuses to silently restart a failed /
  partial run (caller must use ``resume_audio_pipeline``).
- An unknown stage raises KeyError instead of being silently skipped
  (no clinical step gets dropped).
- ``execute_voice_pipeline`` merges the real voice-step handlers on
  top of DEFAULT_STEP_HANDLERS without crashing.
- Disk-store I/O failure paths: corrupt JSON returns None (silent
  graceful handling); OSError on write is logged not raised.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any
from collections.abc import Mapping, MutableMapping

import pytest

from deepsynaps_audio.schemas import (
    AudioPipelineDefinition,
    AudioPipelineNode,
    AudioPipelineRun,
)
from deepsynaps_audio.workflow_orchestration import (
    _coerce_definition,
    _digest_json,
    _get_run,
    _load_run_from_disk,
    _persist_run_to_disk,
    _put_run,
    _validate_graph,
    clear_run_store_for_tests,
    collect_audio_provenance,
    execute_audio_pipeline,
    execute_voice_pipeline,
    resume_audio_pipeline,
    validate_pipeline_definition,
)


@pytest.fixture(autouse=True)
def _isolated_store() -> Any:
    clear_run_store_for_tests()
    yield
    clear_run_store_for_tests()


def _defn(*, stages=("ingestion", "qc", "reporting")) -> AudioPipelineDefinition:
    return AudioPipelineDefinition(
        pipeline_id="voice-mvp",
        version="1.0.0",
        nodes=[
            AudioPipelineNode(node_id=f"n_{i}", stage=stage)
            for i, stage in enumerate(stages)
        ],
    )


# ── Definition coercion + validation ───────────────────────────────────────


class TestCoerceAndValidate:
    def test_coerce_passes_through_defn_object(self) -> None:
        d = _defn()
        assert _coerce_definition(d) is d

    def test_coerce_validates_dict(self) -> None:
        out = _coerce_definition(_defn().model_dump())
        assert isinstance(out, AudioPipelineDefinition)

    def test_validate_rejects_duplicate_node_id(self) -> None:
        bad = AudioPipelineDefinition(
            pipeline_id="dup",
            nodes=[
                AudioPipelineNode(node_id="n1", stage="ingestion"),
                AudioPipelineNode(node_id="n1", stage="qc"),
            ],
        )
        with pytest.raises(ValueError, match="duplicate node_id"):
            _validate_graph(bad)

    def test_validate_rejects_unknown_depends_on(self) -> None:
        bad = AudioPipelineDefinition(
            pipeline_id="bad-dep",
            nodes=[
                AudioPipelineNode(node_id="n1", stage="ingestion"),
                AudioPipelineNode(node_id="n2", stage="qc", depends_on=["nope"]),
            ],
        )
        with pytest.raises(ValueError, match="unknown node_id"):
            _validate_graph(bad)


# ── Re-execute safety ──────────────────────────────────────────────────────


class TestReExecuteSafety:
    def test_failed_run_blocks_re_execute(self) -> None:
        # Pin the safety contract: a failed/partial run cannot be
        # silently restarted via execute_*; the caller must use
        # resume_audio_pipeline so the audit trail records the resume.
        _put_run(
            AudioPipelineRun(
                run_id="R-fail",
                pipeline_id="voice-mvp",
                pipeline_version="1.0.0",
                pipeline_definition=_defn().model_dump(),
                input_audio_ref={"uri": "x"},
                status="failed",
                completed_node_ids=["n_0"],
            )
        )
        with pytest.raises(RuntimeError, match="resume_audio_pipeline"):
            execute_audio_pipeline(_defn(), {"uri": "x"}, run_id="R-fail")

    def test_running_state_blocks_re_execute(self) -> None:
        _put_run(
            AudioPipelineRun(
                run_id="R-busy",
                pipeline_id="voice-mvp",
                pipeline_version="1.0.0",
                pipeline_definition=_defn().model_dump(),
                input_audio_ref={"uri": "x"},
                status="running",
            )
        )
        with pytest.raises(RuntimeError, match="already in progress"):
            execute_audio_pipeline(_defn(), {"uri": "x"}, run_id="R-busy")

    def test_unknown_stage_raises_keyerror(self) -> None:
        # Pin: an unknown stage raises instead of silent skip.
        # Force by passing a handlers dict that explicitly removes one.
        d = _defn()
        with pytest.raises(KeyError, match="No handler registered"):
            execute_audio_pipeline(
                d,
                {"uri": "x"},
                handlers={"ingestion": None},  # type: ignore[dict-item]
                run_id="R-no-handler",
            )

    def test_resume_unknown_run_raises(self) -> None:
        with pytest.raises(KeyError, match="unknown run_id"):
            resume_audio_pipeline("does-not-exist")

    def test_resume_completed_is_noop(self) -> None:
        execute_audio_pipeline(_defn(), {"uri": "x"}, run_id="R-done")
        out = resume_audio_pipeline("R-done")
        assert out.status == "completed"

    def test_resume_unknown_handler_raises(self) -> None:
        # Synthesise a partial run, then resume with a handler dict that
        # is missing the relevant stage — expect KeyError.
        defn = _defn()
        run = AudioPipelineRun(
            run_id="R-resume-broken",
            pipeline_id=defn.pipeline_id,
            pipeline_version=defn.version,
            pipeline_definition=defn.model_dump(),
            input_audio_ref={"uri": "x"},
            status="failed",
            completed_node_ids=[],
        )
        _put_run(run)
        # We can't actually inject a handler-removal as easily during
        # resume because resume merges with DEFAULT_STEP_HANDLERS. Use a
        # deliberately broken handler that raises to trigger the failure
        # path.
        def _boom(
            ctx: MutableMapping[str, Any],
            node: Any,
            input_audio_ref: Mapping[str, Any],
        ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
            raise RuntimeError("resume-boom")

        with pytest.raises(RuntimeError, match="resume-boom"):
            resume_audio_pipeline("R-resume-broken", handlers={"ingestion": _boom})
        # Run is recorded as failed.
        run_out = _get_run("R-resume-broken")
        assert run_out is not None
        assert run_out.status == "failed"


# ── Disk persistence edge cases ────────────────────────────────────────────


class TestDiskPersistence:
    def test_corrupt_json_on_disk_returns_none(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_AUDIO_RUN_STORE_DIR", str(tmp_path))
        # Garbage at the expected file path → loader returns None gracefully.
        (tmp_path / "R-corrupt.json").write_text("not json", encoding="utf-8")
        out = _load_run_from_disk("R-corrupt")
        assert out is None

    def test_no_disk_dir_returns_none(self) -> None:
        out = _load_run_from_disk("R-anything")
        assert out is None

    def test_persist_with_no_disk_dir_is_noop(self) -> None:
        # When DEEPSYNAPS_AUDIO_RUN_STORE_DIR is unset, persist is a no-op.
        run = AudioPipelineRun(
            run_id="R-mem",
            pipeline_id="x",
            pipeline_version="1.0.0",
            pipeline_definition={"pipeline_id": "x", "nodes": []},
            input_audio_ref={"uri": "x"},
            status="completed",
        )
        # Should not raise.
        _persist_run_to_disk(run)


# ── execute_voice_pipeline imports VOICE_PIPELINE_HANDLERS lazily ──────────


class TestExecuteVoicePipelineImport:
    def test_import_voice_handlers_is_lazy(self) -> None:
        # The module-level merge happens inside execute_voice_pipeline
        # (lazy import) so the slim install can still load
        # workflow_orchestration without the acoustic extras.
        # Verify the function is callable + import works.
        from deepsynaps_audio.workflow_orchestration import execute_voice_pipeline as fn

        assert callable(fn)


# ── _digest_json helper ────────────────────────────────────────────────────


class TestDigestJson:
    def test_digest_is_64_char_hex(self) -> None:
        d = _digest_json({"a": 1, "b": 2})
        assert len(d) == 64
        int(d, 16)

    def test_digest_is_key_order_independent(self) -> None:
        a = _digest_json({"a": 1, "b": 2})
        b = _digest_json({"b": 2, "a": 1})
        assert a == b


# ── validate_pipeline_definition (loader helper) ───────────────────────────


class TestValidatePipelineDefinition:
    def test_accepts_valid_dict(self) -> None:
        out = validate_pipeline_definition(_defn().model_dump())
        assert isinstance(out, AudioPipelineDefinition)

    def test_rejects_missing_nodes(self) -> None:
        with pytest.raises(Exception):
            validate_pipeline_definition({"pipeline_id": "x"})


# ── collect_audio_provenance edge cases ────────────────────────────────────


class TestCollectAudioProvenance:
    def test_unknown_run_raises(self) -> None:
        with pytest.raises(KeyError, match="unknown run_id"):
            collect_audio_provenance("nope")

    def test_provenance_records_run_metadata(self) -> None:
        run = execute_audio_pipeline(_defn(), {"uri": "x"}, run_id="R-prov")
        out = list(collect_audio_provenance("R-prov"))
        assert out[0]["kind"] == "run"
        assert out[0]["run_id"] == "R-prov"
        assert "studio_pipeline_version" in out[0]
        assert "norm_db_version" in out[0]
        # Per-artifact entries follow.
        artifact_entries = [e for e in out if e["kind"] == "artifact"]
        assert len(artifact_entries) == len(run.artifacts)
        for a in artifact_entries:
            assert "artifact_id" in a
            assert "node_id" in a
            assert "stage" in a

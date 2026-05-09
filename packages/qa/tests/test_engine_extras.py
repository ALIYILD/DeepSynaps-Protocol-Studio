"""Tests for ``deepsynaps_qa.engine.QAEngine`` edge paths.

Pins two safety contracts the existing engine tests don't cover:

- **No spec → FAIL verdict**: when ``get_spec_for_artifact_type`` returns
  None (artifact type not registered), the engine MUST emit a FAIL
  result, never silently PASS. Anything else would let an
  unregistered artifact type slip through QA without checks.
- **run_batch with spec_map**: the optional spec_map kwarg overrides
  the auto-lookup so callers can pin a specific spec version per
  artifact type for reproducibility.
- **run_batch without spec_map**: the auto-lookup path still works.
"""
from __future__ import annotations

from unittest import mock

from deepsynaps_qa.engine import QAEngine
from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    QAResult,
    QASpec,
)


def _qeeg_artifact() -> Artifact:
    return Artifact(
        artifact_id="A-1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
        content="Sample qEEG narrative content.",
        sections=[
            {"name": "Findings", "content": "Sample [PMID 12345]."},
            {"name": "Limitations", "content": "Sample limit."},
        ],
    )


class TestNoSpecFallback:
    def test_unknown_artifact_type_emits_fail(
        self, monkeypatch
    ) -> None:
        # Pin: when get_spec_for_artifact_type returns None, the
        # engine emits a FAIL result so the caller cannot mistake
        # silence for a clean QA pass on an unregistered artifact.
        monkeypatch.setattr(
            "deepsynaps_qa.engine.get_spec_for_artifact_type",
            lambda at: None,
        )
        out = QAEngine().run(_qeeg_artifact())
        assert isinstance(out, QAResult)
        assert out.verdict == "FAIL"
        assert out.spec_id == "unknown"
        # run_id is a UUID, not empty.
        assert len(out.run_id) > 0


class TestRunBatchSpecMap:
    def test_run_batch_with_spec_map(self) -> None:
        # Pin: spec_map provides per-artifact-type spec override.
        # When provided AND the artifact's type is in it, the engine
        # uses the mapped spec instead of doing the auto-lookup —
        # callers pin spec versions this way.
        engine = QAEngine()
        spec = QASpec(
            spec_id="custom:qeeg_v9",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
        )
        out = engine.run_batch(
            [_qeeg_artifact()],
            spec_map={ArtifactType.QEEG_NARRATIVE: spec},
        )
        assert len(out) == 1
        assert out[0].spec_id == "custom:qeeg_v9"

    def test_run_batch_without_spec_map_uses_lookup(self) -> None:
        # Pin: omitting spec_map falls through to auto-lookup. The
        # default spec_id is the registered spec (not "unknown").
        engine = QAEngine()
        out = engine.run_batch([_qeeg_artifact()])
        assert len(out) == 1
        # Default qeeg spec is registered — must NOT be the "unknown"
        # fallback.
        assert out[0].spec_id != "unknown"

    def test_run_batch_spec_map_misses_falls_back_to_lookup(self) -> None:
        # Pin: when spec_map is provided BUT the artifact's type is
        # NOT a key in it, the engine falls through to the registered
        # spec — partial maps don't break artifacts they don't cover.
        engine = QAEngine()
        out = engine.run_batch(
            [_qeeg_artifact()],
            spec_map={ArtifactType.MRI_REPORT: QASpec(
                spec_id="mri:wrong",
                artifact_type=ArtifactType.MRI_REPORT,
            )},
        )
        assert len(out) == 1
        # qEEG artifact resolved via auto-lookup, not via the
        # mismatched spec_map entry.
        assert out[0].spec_id != "mri:wrong"
        assert out[0].spec_id != "unknown"

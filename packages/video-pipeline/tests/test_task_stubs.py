"""Tests for ``deepsynaps_video.tasks.*``, ``scoring``, ``report``,
and ``worker`` stubs.

These modules ship as ``raise NotImplementedError`` stubs awaiting
the implementations described in their docstrings. Pinning the
**stub-must-raise** contract is load-bearing because:

- Callers downstream catch ``NotImplementedError`` to surface a clear
  "not yet available" 503 instead of crashing on a fake answer. A
  refactor that silently returned ``None`` would let a stub answer
  reach a clinician.
- ``SUPPORTED_TASK_IDS`` constants are part of the public surface —
  the dashboard renders task chips from these tuples, so a typo here
  silently breaks the UI.
- The ``TaskEpoch`` dataclass shape is the segmenter contract; the
  operator UI POSTs structured JSON matching it.
"""
from __future__ import annotations

from pathlib import Path
from unittest import mock

import pytest

from deepsynaps_video import scoring, report as report_mod
from deepsynaps_video import worker as worker_mod
from deepsynaps_video.tasks import (
    bradykinesia,
    facial,
    gait,
    posture,
    segmenter,
    tremor,
)


# ── SUPPORTED_TASK_IDS constants ────────────────────────────────────


class TestSupportedTaskIds:
    def test_bradykinesia_task_ids_pinned(self) -> None:
        # Pin: the dashboard renders these as chips. A rename without
        # a UI update silently breaks the operator view.
        assert bradykinesia.SUPPORTED_TASK_IDS == (
            "mds_updrs_3_4_finger_tap",
            "mds_updrs_3_5_hand_open_close",
            "mds_updrs_3_6_pronation_sup",
            "mds_updrs_3_7_toe_tap",
            "mds_updrs_3_8_leg_agility",
        )

    def test_posture_task_ids_pinned(self) -> None:
        assert posture.SUPPORTED_TASK_IDS == (
            "mds_updrs_3_12_postural_stab",
            "mds_updrs_3_13_posture",
            "timed_up_and_go",
            "sit_to_stand_5x",
        )

    def test_tremor_task_ids_pinned(self) -> None:
        assert tremor.SUPPORTED_TASK_IDS == (
            "mds_updrs_3_15_tremor_postural",
            "mds_updrs_3_17_tremor_rest",
        )


# ── Stub bodies must raise NotImplementedError ──────────────────────


class TestTaskStubsRaise:
    def test_bradykinesia_raises(self) -> None:
        track = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            bradykinesia.analyze_bradykinesia(
                track,
                task_id="mds_updrs_3_4_finger_tap",
                epoch_s=(0.0, 1.0),
                side="right",
            )

    def test_tremor_raises(self) -> None:
        track = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            tremor.analyze_tremor(
                track,
                task_id="mds_updrs_3_17_tremor_rest",
                epoch_s=(0.0, 1.0),
            )

    def test_posture_raises(self) -> None:
        track = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            posture.analyze_posture(
                track,
                task_id="timed_up_and_go",
                epoch_s=(0.0, 1.0),
            )

    def test_gait_analyze_raises(self) -> None:
        track = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            gait.analyze_gait(track, epoch_s=(0.0, 1.0))

    def test_gait_detect_freezing_raises(self) -> None:
        track = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            gait.detect_freezing(track)

    def test_facial_raises(self) -> None:
        with pytest.raises(NotImplementedError):
            facial.analyze_facial_battery(Path("/tmp/nope.mp4"))

    def test_segmenter_operator_raises(self) -> None:
        with pytest.raises(NotImplementedError):
            segmenter.segment_operator([])

    def test_segmenter_auto_raises(self) -> None:
        track = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            segmenter.segment_auto(track)

    def test_scoring_raises(self) -> None:
        with pytest.raises(NotImplementedError):
            scoring.suggest_mds_updrs_score(
                "mds_updrs_3_4_finger_tap", {}
            )

    def test_report_render_raises(self) -> None:
        fake_report = mock.MagicMock()
        with pytest.raises(NotImplementedError):
            report_mod.render_report(fake_report)

    def test_worker_queue_task_run_raises(self) -> None:
        with pytest.raises(NotImplementedError):
            worker_mod.queue_task_run({"foo": "bar"})

    def test_worker_queue_monitor_run_raises(self) -> None:
        with pytest.raises(NotImplementedError):
            worker_mod.queue_monitor_run({"foo": "bar"})


# ── Public surface contracts ────────────────────────────────────────


class TestPublicSurface:
    def test_segmenter_task_epoch_defaults(self) -> None:
        # Pin: TaskEpoch is the segmenter contract. The operator UI
        # POSTs JSON matching this shape, so the default values are
        # part of the public API.
        ep = segmenter.TaskEpoch(
            task_id="mds_updrs_3_4_finger_tap",
            epoch_s=(0.0, 1.0),
        )
        assert ep.side == "n/a"
        assert ep.confidence == 1.0
        assert ep.source == "operator"

    def test_segmenter_task_epoch_accepts_auto_source(self) -> None:
        # Pin: 'auto' source is documented + must remain accepted.
        ep = segmenter.TaskEpoch(
            task_id="mds_updrs_3_4_finger_tap",
            epoch_s=(0.0, 1.0),
            source="auto",
            confidence=0.7,
        )
        assert ep.source == "auto"
        assert ep.confidence == 0.7

    def test_report_artefacts_default_pdf_none(self) -> None:
        # Pin: pdf_uri default = None. When weasyprint is not
        # installed (slim image), the caller surfaces a 503 instead
        # of crashing.
        a = report_mod.ReportArtefacts(html_uri="https://example/r.html")
        assert a.pdf_uri is None

    def test_gait_placeholder_metric_returns_nan(self) -> None:
        # Pin: scaffold helper returns a NaN MetricValue so import
        # references stay live without fabricating data.
        import math

        metric = gait._placeholder_metric()
        assert math.isnan(metric.value)


class TestModuleAllExports:
    def test_bradykinesia_all(self) -> None:
        assert set(bradykinesia.__all__) == {
            "SUPPORTED_TASK_IDS",
            "analyze_bradykinesia",
        }

    def test_tremor_all(self) -> None:
        assert set(tremor.__all__) == {
            "SUPPORTED_TASK_IDS",
            "analyze_tremor",
        }

    def test_posture_all(self) -> None:
        assert set(posture.__all__) == {
            "SUPPORTED_TASK_IDS",
            "analyze_posture",
        }

    def test_segmenter_all(self) -> None:
        assert set(segmenter.__all__) == {
            "TaskEpoch",
            "segment_auto",
            "segment_operator",
        }

    def test_gait_all(self) -> None:
        assert set(gait.__all__) == {"analyze_gait", "detect_freezing"}

    def test_facial_all(self) -> None:
        assert set(facial.__all__) == {"analyze_facial_battery"}

    def test_scoring_all(self) -> None:
        assert set(scoring.__all__) == {"suggest_mds_updrs_score"}

    def test_report_all(self) -> None:
        assert set(report_mod.__all__) == {"ReportArtefacts", "render_report"}

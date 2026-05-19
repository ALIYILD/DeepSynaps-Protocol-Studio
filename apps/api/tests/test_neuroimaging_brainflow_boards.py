"""Phase 4 — BrainFlow board metadata helpers (read-only, no hardware)."""
from __future__ import annotations

import pytest

pytest.importorskip("brainflow")


def test_has_brainflow_flag_is_true():
    from app.services.neuroimaging.brainflow_acquisition import HAS_BRAINFLOW
    assert HAS_BRAINFLOW is True


def test_list_supported_boards_returns_nonempty_sorted():
    from app.services.neuroimaging.brainflow_acquisition import list_supported_boards
    boards = list_supported_boards()
    assert len(boards) > 10
    ids = [b["board_id"] for b in boards]
    assert ids == sorted(ids)
    assert all("name" in b and "board_id" in b for b in boards)


def test_board_session_meta_synthetic_board():
    # BoardIds.SYNTHETIC_BOARD == -1 in brainflow; safe to query (no hardware).
    from app.services.neuroimaging.brainflow_acquisition import board_session_meta
    meta = board_session_meta(-1)
    assert meta["board_id"] == -1
    assert meta["sampling_rate_hz"] > 0
    assert meta["eeg_channel_count"] >= 1

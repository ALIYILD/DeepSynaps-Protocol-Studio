"""Phase 4 — BrainFlow client helpers (read-only board metadata)."""
from __future__ import annotations

from typing import Any

try:
    from brainflow.board_shim import BoardIds, BoardShim
    HAS_BRAINFLOW: bool = True
except ImportError:
    BoardIds = None  # type: ignore[assignment]
    BoardShim = None  # type: ignore[assignment]
    HAS_BRAINFLOW = False


def list_supported_boards() -> list[dict[str, Any]]:
    if not HAS_BRAINFLOW:
        raise ImportError("BrainFlow is not installed")
    entries: list[dict[str, Any]] = []
    for name in dir(BoardIds):
        if name.startswith("_"):
            continue
        attr = getattr(BoardIds, name)
        if hasattr(attr, "value") and isinstance(attr.value, int):
            entries.append({"name": name, "board_id": attr.value})
    return sorted(entries, key=lambda e: e["board_id"])


def board_session_meta(board_id: int) -> dict[str, Any]:
    if not HAS_BRAINFLOW:
        raise ImportError("BrainFlow is not installed")
    descr = BoardShim.get_board_descr(board_id)
    name = descr.get("name", "unknown") if isinstance(descr, dict) else "unknown"
    return {
        "board_id": board_id,
        "name": name,
        "sampling_rate_hz": BoardShim.get_sampling_rate(board_id),
        "eeg_channel_count": len(BoardShim.get_eeg_channels(board_id) or []),
    }


__all__ = ["HAS_BRAINFLOW", "list_supported_boards", "board_session_meta"]

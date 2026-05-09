"""Tests for ``deepsynaps_qeeg.longitudinal.store``.

Pins the file-backed session-store contract:

- SessionData.channel_names extracts the ordered connectivity channel
  list (the canonical channel order used by topomaps + connectivity).
- SessionData.recording_state surfaces eyes-open/eyes-closed via either
  ``recording_state`` or ``eyes_state`` keys (back-compat).
- FileSessionStore.load reads ``features.json`` (mandatory) and
  opportunistically loads ``zscores.json`` + ``quality.json`` if
  present.
- Missing features.json raises FileNotFoundError so callers can't
  silently get an empty session.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_qeeg.longitudinal.store import (
    FileSessionStore,
    SessionData,
)


# ── SessionData ────────────────────────────────────────────────────────────


class TestSessionData:
    def test_channel_names_extracts_connectivity_order(self) -> None:
        s = SessionData(
            patient_id="P-1",
            session_id="S-1",
            features={"connectivity": {"channels": ["Fz", "Cz", "Pz"]}},
        )
        assert s.channel_names == ["Fz", "Cz", "Pz"]

    def test_channel_names_returns_empty_when_missing(self) -> None:
        s = SessionData(patient_id="P-1", session_id="S-1", features={})
        assert s.channel_names == []

    def test_channel_names_coerces_to_str(self) -> None:
        # Defensive: numeric channel ids get coerced to str.
        s = SessionData(
            patient_id="P-1",
            session_id="S-1",
            features={"connectivity": {"channels": [1, 2, 3]}},
        )
        assert s.channel_names == ["1", "2", "3"]

    def test_recording_state_from_recording_state_key(self) -> None:
        s = SessionData(
            patient_id="P-1",
            session_id="S-1",
            features={},
            quality={"recording_state": "eyes_closed"},
        )
        assert s.recording_state == "eyes_closed"

    def test_recording_state_falls_back_to_eyes_state(self) -> None:
        # back-compat alias
        s = SessionData(
            patient_id="P-1",
            session_id="S-1",
            features={},
            quality={"eyes_state": "eyes_open"},
        )
        assert s.recording_state == "eyes_open"

    def test_recording_state_none_when_absent(self) -> None:
        s = SessionData(patient_id="P-1", session_id="S-1", features={})
        assert s.recording_state is None

    def test_recording_state_none_when_quality_block_missing(self) -> None:
        s = SessionData(
            patient_id="P-1", session_id="S-1", features={}, quality=None
        )
        assert s.recording_state is None


# ── FileSessionStore.load ──────────────────────────────────────────────────


class TestFileSessionStoreLoad:
    def test_loads_features_only(self, tmp_path: Path) -> None:
        sess_dir = tmp_path / "P-1" / "S-1"
        sess_dir.mkdir(parents=True)
        (sess_dir / "features.json").write_text(
            json.dumps({"connectivity": {"channels": ["Fz", "Cz"]}}),
            encoding="utf-8",
        )

        store = FileSessionStore(root=tmp_path)
        s = store.load(patient_id="P-1", session_id="S-1")
        assert s.patient_id == "P-1"
        assert s.session_id == "S-1"
        assert s.features["connectivity"]["channels"] == ["Fz", "Cz"]
        # Optional sidecars absent → None.
        assert s.zscores is None
        assert s.quality is None

    def test_loads_optional_zscores_and_quality(self, tmp_path: Path) -> None:
        sess_dir = tmp_path / "P-1" / "S-1"
        sess_dir.mkdir(parents=True)
        (sess_dir / "features.json").write_text("{}", encoding="utf-8")
        (sess_dir / "zscores.json").write_text(
            json.dumps({"flagged": []}), encoding="utf-8"
        )
        (sess_dir / "quality.json").write_text(
            json.dumps({"recording_state": "eyes_closed"}),
            encoding="utf-8",
        )

        store = FileSessionStore(root=tmp_path)
        s = store.load(patient_id="P-1", session_id="S-1")
        assert s.zscores == {"flagged": []}
        assert s.quality == {"recording_state": "eyes_closed"}
        assert s.recording_state == "eyes_closed"

    def test_missing_features_raises_file_not_found(self, tmp_path: Path) -> None:
        # Pin: missing features.json MUST raise so the caller cannot
        # silently get an empty SessionData and chart it as a real session.
        store = FileSessionStore(root=tmp_path)
        with pytest.raises(FileNotFoundError):
            store.load(patient_id="P-missing", session_id="S-missing")

    def test_default_root_is_outputs(self) -> None:
        store = FileSessionStore()
        assert store.root == Path("outputs")

    def test_string_root_coerced_to_path(self) -> None:
        store = FileSessionStore(root="some/dir")
        assert store.root == Path("some/dir")

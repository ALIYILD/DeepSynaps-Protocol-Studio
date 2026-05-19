"""PyNWB roundtrip: write minimal NWB file, read back, verify fields."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

pynwb = pytest.importorskip("pynwb")


def test_nwb_roundtrip(tmp_path):
    from app.services.neuroimaging.pynwb_io import read_nwb_summary, write_minimal_nwb

    out = tmp_path / "test.nwb"
    t0 = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    write_minimal_nwb(
        out,
        session_description="pytest session",
        identifier="test-001",
        session_start_time=t0,
    )
    assert out.exists()

    summary = read_nwb_summary(out)
    assert summary.identifier == "test-001"
    assert summary.session_description == "pytest session"
    assert "2024-01-01" in summary.session_start_time
    assert isinstance(summary.acquisition_keys, list)
    assert isinstance(summary.processing_keys, list)


def test_nwb_roundtrip_str_timestamp(tmp_path):
    from app.services.neuroimaging.pynwb_io import read_nwb_summary, write_minimal_nwb

    out = tmp_path / "test2.nwb"
    write_minimal_nwb(
        out,
        session_description="str ts test",
        identifier="test-002",
        session_start_time="2025-06-15T12:00:00+00:00",
    )
    summary = read_nwb_summary(out)
    assert summary.identifier == "test-002"

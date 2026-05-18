"""Unit tests for the CORR adapter with mocked HTTP responses."""

from __future__ import annotations

import csv
import io
import json
import os
import pathlib
import sys
import tempfile
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from corr_adapter import CORRAdapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def cache_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    return tmp_path / "cache"


@pytest.fixture
def mock_phenotypic_csv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Subject ID", "Site ID", "Session", "Age", "Gender",
        "Handedness", "Retest Design", "Retest Interval (days)",
    ])
    sites = ["BNU1", "HNU1", "NKI1", "SWU1", "BNU2"]
    for site in sites:
        for i in range(1, 11):
            sid = f"{site}_{i:03d}"
            age = 20 + i % 10
            sex = "M" if i % 2 == 0 else "F"
            hand = "R" if i % 3 != 0 else "L"
            retest = "test-retest" if i % 2 == 0 else "single"
            interval = 30 if i % 2 == 0 else ""
            writer.writerow([sid, site, 1, age, sex, hand, retest, interval])
    return buf.getvalue()


@pytest.fixture
def adapter(cache_dir: pathlib.Path) -> CORRAdapter:
    return CORRAdapter(cache_dir=cache_dir, skip_imaging=True)


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_sets_session(self, adapter: CORRAdapter) -> None:
        with patch("corr_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True

    def test_connect_warns_on_failure(self, adapter: CORRAdapter) -> None:
        with patch("corr_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.side_effect = Exception("timeout")
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True


# ---------------------------------------------------------------------------
# Fetch tests
# ---------------------------------------------------------------------------

class TestFetch:
    def test_fetch_phenotypic(
        self,
        adapter: CORRAdapter,
        mock_phenotypic_csv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-length": str(len(mock_phenotypic_csv))}
        mock_resp.iter_content.return_value = [
            mock_phenotypic_csv.encode()[i : i + 64]
            for i in range(0, len(mock_phenotypic_csv.encode()), 64)
        ]
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        adapter._session.get.return_value = mock_resp

        files = adapter.fetch()
        assert "phenotypic" in files
        assert files["phenotypic"].exists()

    def test_fetch_skips_existing_cache(
        self, adapter: CORRAdapter, cache_dir: pathlib.Path
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        pheno_path = adapter._local_path(
            "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/_downloads/phenotypic_data.csv",
            ".csv",
        )
        pheno_path.parent.mkdir(parents=True, exist_ok=True)
        pheno_path.write_text("cached")

        files = adapter.fetch()
        assert files["phenotypic"].exists()
        adapter._session.get.assert_not_called()

    def test_fetch_requires_connect(self, adapter: CORRAdapter) -> None:
        adapter._connected = False
        with pytest.raises(RuntimeError, match="call connect"):
            adapter.fetch()


# ---------------------------------------------------------------------------
# Normalize tests
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_normalize_basic(
        self,
        adapter: CORRAdapter,
        mock_phenotypic_csv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-length": str(len(mock_phenotypic_csv))}
        mock_resp.iter_content.return_value = [
            mock_phenotypic_csv.encode()[i : i + 64]
            for i in range(0, len(mock_phenotypic_csv.encode()), 64)
        ]
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        adapter._session.get.return_value = mock_resp

        adapter.fetch()
        result = adapter.normalize()

        participants = result["participants"]
        assert len(participants) == 50  # 5 sites x 10 subjects
        assert "participant_id" in participants.columns
        assert "site" in participants.columns
        assert "age" in participants.columns
        assert "sex" in participants.columns
        assert "handedness" in participants.columns
        # All sites represented
        assert participants["site"].nunique() == 5

    def test_site_column_preserved(
        self, adapter: CORRAdapter, cache_dir: pathlib.Path
    ) -> None:
        csv_data = "Subject ID,Site ID,Session,Age,Gender,Handedness\n"
        csv_data += "BNU1_001,BNU1,1,22,M,R\n"
        csv_data += "HNU1_001,HNU1,1,25,F,L\n"

        adapter._phenotypic_path = cache_dir / "test_site.csv"
        adapter._phenotypic_path.write_text(csv_data)

        result = adapter.normalize()
        sites = result["participants"]["site"].tolist()
        assert "BNU1" in sites
        assert "HNU1" in sites

    def test_sessions_created(
        self,
        adapter: CORRAdapter,
        mock_phenotypic_csv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-length": str(len(mock_phenotypic_csv))}
        mock_resp.iter_content.return_value = [
            mock_phenotypic_csv.encode()[i : i + 64]
            for i in range(0, len(mock_phenotypic_csv.encode()), 64)
        ]
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        adapter._session.get.return_value = mock_resp

        adapter.fetch()
        result = adapter.normalize()
        sessions = result["sessions"]
        assert len(sessions) == 50
        assert "session_id" in sessions.columns


# ---------------------------------------------------------------------------
# Summary / validation tests
# ---------------------------------------------------------------------------

class TestSummary:
    def test_get_summary(self, adapter: CORRAdapter) -> None:
        summary = adapter.get_summary()
        assert summary["dataset"] == "corr"
        assert summary["subject_count"] == 1629
        assert summary["confidence_tier"] == "A"

    def test_validate_no_fetch(self, adapter: CORRAdapter) -> None:
        report = adapter.validate()
        assert report["status"] == "FAIL"

    def test_validate_with_data(
        self,
        adapter: CORRAdapter,
        mock_phenotypic_csv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-length": str(len(mock_phenotypic_csv))}
        mock_resp.iter_content.return_value = [
            mock_phenotypic_csv.encode()[i : i + 64]
            for i in range(0, len(mock_phenotypic_csv.encode()), 64)
        ]
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        adapter._session.get.return_value = mock_resp

        adapter.fetch()
        report = adapter.validate()
        assert report["status"] in ("PASS", "WARN")


# ---------------------------------------------------------------------------
# Convenience helpers tests
# ---------------------------------------------------------------------------

class TestConvenience:
    def test_get_site_summary(
        self,
        adapter: CORRAdapter,
        mock_phenotypic_csv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-length": str(len(mock_phenotypic_csv))}
        mock_resp.iter_content.return_value = [
            mock_phenotypic_csv.encode()[i : i + 64]
            for i in range(0, len(mock_phenotypic_csv.encode()), 64)
        ]
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        adapter._session.get.return_value = mock_resp

        adapter.fetch()
        summary = adapter.get_site_summary()
        assert len(summary) == 5
        assert "n_subjects" in summary.columns
        assert summary["n_subjects"].tolist() == [10, 10, 10, 10, 10]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

"""Unit tests for the HCP Lifespan adapter with mocked HTTP responses."""

from __future__ import annotations

import csv
import io
import json
import os
import pathlib
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from hcp_lifespan_adapter import (
    HCPLifespanAdapter,
    LifespanCohort,
    _COHORTS,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def cache_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    return tmp_path / "cache"


@pytest.fixture
def mock_hcpd_demographics() -> str:
    """Mock HCP-Development demographics CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "subject_id", "interview_age", "sex", "handedness",
        "site", "scanner",
    ])
    for i in range(1, 16):
        writer.writerow([
            f"HCPD_{i:03d}", (5 + i % 16) * 12,  # age in months
            "M" if i % 2 == 0 else "F",
            "R" if i % 3 != 0 else "L",
            f"site_{i % 3 + 1}",
            "Siemens Prisma 3T",
        ])
    return buf.getvalue()


@pytest.fixture
def mock_hcpa_demographics() -> str:
    """Mock HCP-Aging demographics CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "src_subject_id", "age", "gender", "handedness",
        "site", "mri_info_manufacturer",
    ])
    for i in range(1, 16):
        writer.writerow([
            f"HCPA_{i:03d}", 36 + i * 4,
            "F" if i % 2 == 0 else "M",
            "R" if i % 3 != 0 else "L",
            f"site_{i % 4 + 1}",
            "Siemens Prisma 3T",
        ])
    return buf.getvalue()


@pytest.fixture
def adapter(cache_dir: pathlib.Path) -> HCPLifespanAdapter:
    return HCPLifespanAdapter(cache_dir=cache_dir)


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_sets_session(self, adapter: HCPLifespanAdapter) -> None:
        with patch("hcp_lifespan_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            mock_sess.post.return_value.status_code = 302
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True

    def test_connect_with_credentials(self, adapter: HCPLifespanAdapter) -> None:
        adapter.credentials = {"username": "user", "password": "pass"}
        with patch("hcp_lifespan_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            mock_sess.post.return_value.status_code = 302
            MockSession.return_value = mock_sess
            adapter.connect()
            assert mock_sess.auth == ("user", "pass")

    def test_connect_warns_on_failure(self, adapter: HCPLifespanAdapter) -> None:
        with patch("hcp_lifespan_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.side_effect = Exception("timeout")
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True


# ---------------------------------------------------------------------------
# Fetch tests
# ---------------------------------------------------------------------------

class TestFetch:
    def test_fetch_demographics(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        files = adapter.fetch()
        assert "HCP-Development_demographics" in files
        assert "HCP-Aging_demographics" in files
        assert files["HCP-Development_demographics"].exists()
        assert files["HCP-Aging_demographics"].exists()

    def test_fetch_skips_existing_cache(
        self, adapter: HCPLifespanAdapter, cache_dir: pathlib.Path
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        hcpd_dir = cache_dir / "hcp_lifespan" / "HCP-Development"
        hcpd_dir.mkdir(parents=True, exist_ok=True)
        (hcpd_dir / "demographics.csv").write_text("cached")

        files = adapter.fetch()
        assert "HCP-Development_demographics" in files
        # HCP-Aging still fetched since not pre-cached

    def test_fetch_single_cohort(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter = HCPLifespanAdapter(
            cache_dir=cache_dir, cohorts=["HCP-Development"]
        )
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        files = adapter.fetch()
        assert "HCP-Development_demographics" in files
        assert "HCP-Aging_demographics" not in files


# ---------------------------------------------------------------------------
# Normalize tests
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_normalize_both_cohorts(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        result = adapter.normalize()

        participants = result["participants"]
        assert len(participants) == 30  # 15 HCP-D + 15 HCP-A
        assert "participant_id" in participants.columns
        assert "age" in participants.columns
        assert "sex" in participants.columns
        assert "cohort" in participants.columns

        # Check cohort assignment
        cohorts = set(participants["cohort"].unique())
        assert "HCP-Development" in cohorts
        assert "HCP-Aging" in cohorts

        # Check age conversion: HCP-D uses months -> years
        hcpd_mask = participants["cohort"] == "HCP-Development"
        hcpd_ages = participants.loc[hcpd_mask, "age"]
        # ages should be in years (interview_age / 12)
        assert hcpd_ages.mean() < 25

        hcpa_mask = participants["cohort"] == "HCP-Aging"
        hcpa_ages = participants.loc[hcpa_mask, "age"]
        assert hcpa_ages.min() >= 36

    def test_age_in_months_conversion(
        self, adapter: HCPLifespanAdapter, cache_dir: pathlib.Path
    ) -> None:
        csv_data = "subject_id,interview_age,sex,handedness,site\n"
        csv_data += "HCPD_001,120,M,R,site_1\n"  # 10 years
        csv_data += "HCPD_002,180,F,L,site_1\n"  # 15 years

        adapter._demographics_paths["HCP-Development"] = (
            cache_dir / "test_age_months.csv"
        )
        adapter._demographics_paths["HCP-Development"].write_text(csv_data)

        # Create minimal cohort data
        adapter._cohorts = [c for c in _COHORTS if c.name == "HCP-Development"]
        result = adapter.normalize()
        participants = result["participants"]
        ages = participants["age"].tolist()
        assert ages[0] == pytest.approx(10.0)
        assert ages[1] == pytest.approx(15.0)

    def test_scans_dataframe(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        result = adapter.normalize()
        scans = result["scans"]
        # 30 subjects x 4 scans (T1w + T2w + rs-fMRI + dwi) = 120
        assert len(scans) == 120
        assert "modality" in scans.columns
        assert "cohort" in scans.columns
        modalities = set(scans["modality"].unique())
        assert "T1w" in modalities
        assert "T2w" in modalities
        assert "rs-fMRI" in modalities
        assert "dwi" in modalities

    def test_meta_structure(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        result = adapter.normalize()
        meta = result["meta"]
        assert meta["dataset_name"] == "hcp_lifespan"
        assert meta["n_subjects_total"] == 30
        assert len(meta["cohorts"]) == 2
        assert "modalities" in meta
        assert meta["confidence_tier"] == "A"


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------

class TestValidate:
    def test_validate_no_fetch(self, adapter: HCPLifespanAdapter) -> None:
        report = adapter.validate()
        assert report["status"] == "WARN"
        assert "cohorts" in report

    def test_validate_with_data(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        report = adapter.validate()
        assert report["status"] in ("PASS", "WARN")
        assert "HCP-Development" in report["cohorts"]
        assert "HCP-Aging" in report["cohorts"]


# ---------------------------------------------------------------------------
# Convenience helpers tests
# ---------------------------------------------------------------------------

class TestConvenience:
    def test_get_age_distribution(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        dist = adapter.get_age_distribution()
        assert not dist.empty

    def test_query_subjects_by_age(
        self,
        adapter: HCPLifespanAdapter,
        mock_hcpd_demographics: str,
        mock_hcpa_demographics: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "HCP-D" in url or "Development" in url:
                resp.iter_content.return_value = [
                    mock_hcpd_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpd_demographics.encode()), 64
                    )
                ]
            elif "HCP-A" in url or "Aging" in url or "AABC" in url:
                resp.iter_content.return_value = [
                    mock_hcpa_demographics.encode()[i : i + 64]
                    for i in range(
                        0, len(mock_hcpa_demographics.encode()), 64
                    )
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        # Query adults 30-50 (should get HCP-Aging subjects)
        adults = adapter.query_subjects_by_age(30, 50)
        assert not adults.empty
        assert adults["age"].min() >= 30
        assert adults["age"].max() <= 50


# ---------------------------------------------------------------------------
# Cohort dataclass tests
# ---------------------------------------------------------------------------

class TestLifespanCohort:
    def test_cohort_defaults(self) -> None:
        cohort = LifespanCohort(
            name="Test",
            project_id="TEST_001",
            age_range=(0, 100),
            age_unit="years",
            expected_n=100,
            phenotypic_url="http://example.com",
        )
        assert cohort.name == "Test"
        assert cohort.age_range == (0, 100)
        assert cohort.demographics_url is None

    def test_predefined_cohorts(self) -> None:
        assert len(_COHORTS) == 2
        names = {c.name for c in _COHORTS}
        assert "HCP-Development" in names
        assert "HCP-Aging" in names


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

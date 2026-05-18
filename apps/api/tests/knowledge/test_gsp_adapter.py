"""Unit tests for the GSP adapter with mocked HTTP responses."""

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

from gsp_adapter import GSPAdapter


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
        "SubjectID", "Age", "Sex", "Handedness",
        "Race", "Ethnicity", "YearsEducation", "EstimatedIQ",
        "MeanFD", "T1QualityScore",
    ])
    for i in range(1, 21):
        writer.writerow([
            f"GSP_{i:04d}", 20 + (i % 5), "M" if i % 2 == 0 else "F",
            "R" if i % 3 != 0 else "L", "Caucasian",
            "Not Hispanic", 14 + (i % 3), 108 + (i % 10),
            f"{0.1 + (i % 5) * 0.05:.3f}", 3 if i % 4 == 0 else 2,
        ])
    return buf.getvalue()


@pytest.fixture
def adapter(cache_dir: pathlib.Path) -> GSPAdapter:
    return GSPAdapter(cache_dir=cache_dir)


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_sets_session(self, adapter: GSPAdapter) -> None:
        with patch("gsp_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.get.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True

    def test_connect_with_api_token(self, adapter: GSPAdapter) -> None:
        adapter.credentials = {"api_token": "test_token_123"}
        with patch("gsp_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.get.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._session.params == {"key": "test_token_123"}

    def test_connect_warns_on_failure(self, adapter: GSPAdapter) -> None:
        with patch("gsp_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.get.side_effect = Exception("timeout")
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True


# ---------------------------------------------------------------------------
# Fetch tests
# ---------------------------------------------------------------------------

class TestFetch:
    def test_fetch_phenotypic(
        self,
        adapter: GSPAdapter,
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
        assert "readme" in files

    def test_fetch_skips_existing_cache(
        self, adapter: GSPAdapter, cache_dir: pathlib.Path
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        pheno_path = cache_dir / "gsp" / "GSP_phenotypic.csv"
        pheno_path.parent.mkdir(parents=True, exist_ok=True)
        pheno_path.write_text("cached")

        files = adapter.fetch()
        assert files["phenotypic"].exists()
        # README is still fetched (not pre-cached)


# ---------------------------------------------------------------------------
# Normalize tests
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_normalize_basic(
        self,
        adapter: GSPAdapter,
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
        assert len(participants) == 20
        assert "participant_id" in participants.columns
        assert "age" in participants.columns
        assert "sex" in participants.columns
        assert "handedness" in participants.columns
        assert "education_years" in participants.columns
        assert "estimated_iq" in participants.columns
        assert "mean_fd" in participants.columns

    def test_age_coercion(
        self, adapter: GSPAdapter, cache_dir: pathlib.Path
    ) -> None:
        csv_data = "SubjectID,Age,Sex,Handedness\n"
        csv_data += "GSP_0001,twenty-five,M,R\n"  # non-numeric
        csv_data += "GSP_0002,30,F,L\n"

        adapter._phenotypic_path = cache_dir / "test_age.csv"
        adapter._phenotypic_path.write_text(csv_data)

        result = adapter.normalize()
        ages = result["participants"]["age"]
        assert pd.isna(ages.iloc[0])  # non-numeric becomes NaN
        assert ages.iloc[1] == 30.0

    def test_sex_mapping(
        self, adapter: GSPAdapter, cache_dir: pathlib.Path
    ) -> None:
        csv_data = "SubjectID,Age,Sex,Handedness\n"
        csv_data += "GSP_0001,25,female,R\n"
        csv_data += "GSP_0002,30,male,L\n"
        csv_data += "GSP_0003,28,M,R\n"
        csv_data += "GSP_0004,35,F,L\n"

        adapter._phenotypic_path = cache_dir / "test_sex.csv"
        adapter._phenotypic_path.write_text(csv_data)

        result = adapter.normalize()
        sexes = result["participants"]["sex"].tolist()
        assert sexes == ["F", "M", "M", "F"]

    def test_scans_dataframe(
        self,
        adapter: GSPAdapter,
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
        scans = result["scans"]
        # 20 subjects x 2 scans (T1w + rs-fMRI) = 40
        assert len(scans) == 40
        assert "modality" in scans.columns
        modalities = set(scans["modality"].unique())
        assert "T1w" in modalities
        assert "rs-fMRI" in modalities

    def test_meta_includes_reference(
        self,
        adapter: GSPAdapter,
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
        meta = result["meta"]
        assert meta["dataset_name"] == "gsp"
        assert "Holmes et al. 2015" in meta["reference"]
        assert meta["doi"] == "10.1038/sdata.2015.31"
        assert meta["scanner"] == "Siemens TrioTim 3T"
        assert meta["confidence_tier"] == "A"


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------

class TestValidate:
    def test_validate_no_fetch(self, adapter: GSPAdapter) -> None:
        report = adapter.validate()
        assert report["status"] == "FAIL"

    def test_validate_with_data(
        self,
        adapter: GSPAdapter,
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
        assert report["status"] == "FAIL"  # row_count_reasonable check: 20 < 1000


# ---------------------------------------------------------------------------
# Convenience helpers tests
# ---------------------------------------------------------------------------

class TestConvenience:
    def test_get_motion_summary(
        self,
        adapter: GSPAdapter,
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
        motion = adapter.get_motion_summary()
        assert motion is not None
        assert motion["count"] == 20


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

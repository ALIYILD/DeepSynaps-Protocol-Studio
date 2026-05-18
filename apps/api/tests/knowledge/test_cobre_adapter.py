"""Unit tests for the COBRE adapter with mocked HTTP responses."""

from __future__ import annotations

import csv
import io
import json
import os
import pathlib
import sys
import tempfile
from typing import Any, Dict, Generator, List
from unittest.mock import MagicMock, Mock, patch

import pandas as pd
import pytest

# Ensure adapters are importable
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from cobre_adapter import COBREAdapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def cache_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    """Provide a temporary cache directory."""
    return tmp_path / "cache"


@pytest.fixture
def mock_phenotypic_csv() -> str:
    """Return a minimal COBRE-like phenotypic CSV string."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Subject ID", "DX Group", "Age", "Gender",
        "Handedness", "PANSS Total",
    ])
    # Patients
    for i in range(1, 6):
        writer.writerow([f"A000{i}", "Patient", 30 + i, "M", "R", 75 + i])
    # Controls
    for i in range(1, 6):
        writer.writerow([f"B000{i}", "Control", 28 + i, "F", "R", "NA"])
    return buf.getvalue()


@pytest.fixture
def adapter(cache_dir: pathlib.Path) -> COBREAdapter:
    """Return an unconnected adapter instance."""
    return COBREAdapter(cache_dir=cache_dir, use_nitrc=False)


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_sets_session(self, adapter: COBREAdapter) -> None:
        with patch("cobre_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True
            assert adapter._session is mock_sess

    def test_connect_warns_on_failure(self, adapter: COBREAdapter) -> None:
        with patch("cobre_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.side_effect = Exception("Network error")
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True  # still marked connected

    def test_connect_with_credentials(self, adapter: COBREAdapter) -> None:
        adapter.credentials = {"username": "user", "password": "pass"}
        with patch("cobre_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert mock_sess.auth == ("user", "pass")


# ---------------------------------------------------------------------------
# Fetch tests
# ---------------------------------------------------------------------------

class TestFetch:
    def test_fetch_phenotypic_only(
        self,
        adapter: COBREAdapter,
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
        assert "imaging_dir" in files

    def test_fetch_skips_existing_cache(
        self, adapter: COBREAdapter, cache_dir: pathlib.Path
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        # Pre-create the cached file
        pheno_path = adapter._local_path(
            "https://fcon_1000.projects.nitrc.org/indi/retro/cobre_phenotypic.csv",
            ".csv",
        )
        pheno_path.parent.mkdir(parents=True, exist_ok=True)
        pheno_path.write_text("cached")

        files = adapter.fetch()
        assert files["phenotypic"].exists()
        # Should not have made HTTP request
        adapter._session.get.assert_not_called()

    def test_fetch_requires_connect(self, adapter: COBREAdapter) -> None:
        adapter._connected = False
        with pytest.raises(RuntimeError, match="call connect"):
            adapter.fetch()


# ---------------------------------------------------------------------------
# Normalize tests
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_normalize_basic(
        self,
        adapter: COBREAdapter,
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
        assert len(participants) == 10
        assert "participant_id" in participants.columns
        assert "group" in participants.columns
        assert "age" in participants.columns
        assert "sex" in participants.columns
        assert "handedness" in participants.columns
        # Check that patients are correctly labeled
        patient_mask = participants["group"] == "Patient"
        assert patient_mask.sum() == 5
        control_mask = participants["group"] == "Control"
        assert control_mask.sum() == 5

    def test_normalize_sex_mapping(
        self,
        adapter: COBREAdapter,
        cache_dir: pathlib.Path,
    ) -> None:
        """Test that sex values are correctly mapped to F/M/n/a."""
        csv_data = "Subject ID,DX Group,Age,Gender,Handedness\n"
        csv_data += "A001,Patient,25,female,R\n"
        csv_data += "A002,Control,30,male,L\n"
        csv_data += "A003,Patient,28,M,R\n"
        csv_data += "A004,Control,35,F,R\n"

        adapter._phenotypic_path = cache_dir / "test_sex.csv"
        adapter._phenotypic_path.write_text(csv_data)

        result = adapter.normalize()
        sexes = result["participants"]["sex"].tolist()
        assert "F" in sexes
        assert "M" in sexes
        assert "n/a" not in sexes

    def test_normalize_before_fetch_raises(self, adapter: COBREAdapter) -> None:
        with pytest.raises(RuntimeError, match="fetch"):
            adapter.normalize()


# ---------------------------------------------------------------------------
# Summary / meta tests
# ---------------------------------------------------------------------------

class TestSummary:
    def test_get_summary(self, adapter: COBREAdapter) -> None:
        summary = adapter.get_summary()
        assert summary["dataset"] == "cobre"
        assert summary["subject_count"] == 146
        assert summary["confidence_tier"] == "A"
        assert summary["connected"] is False


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------

class TestValidate:
    def test_validate_no_fetch(self, adapter: COBREAdapter) -> None:
        report = adapter.validate()
        assert report["status"] == "FAIL"

    def test_validate_with_data(
        self,
        adapter: COBREAdapter,
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
        assert "checks" in report


# ---------------------------------------------------------------------------
# Diagnosis normalizer tests
# ---------------------------------------------------------------------------

class TestDiagnosisNormalizer:
    def test_patient_variants(self) -> None:
        fn = COBREAdapter._diagnosis_normalizer
        assert fn("patient") == "Patient"
        assert fn("schizophrenia") == "Patient"
        assert fn("sz") == "Patient"
        assert fn("SCZ") == "Patient"

    def test_control_variants(self) -> None:
        fn = COBREAdapter._diagnosis_normalizer
        assert fn("control") == "Control"
        assert fn("CTRL") == "Control"
        assert fn("hc") == "Control"
        assert fn("healthy") == "Control"
        assert fn("typical") == "Control"

    def test_other_diagnoses(self) -> None:
        fn = COBREAdapter._diagnosis_normalizer
        assert fn("bipolar") == "Bipolar"
        assert fn("adhd") == "ADHD"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

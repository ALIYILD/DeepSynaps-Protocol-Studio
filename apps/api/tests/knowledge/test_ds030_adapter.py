"""Unit tests for the ds000030 (UCLA Consortium) adapter with mocked HTTP."""

from __future__ import annotations

import csv
import io
import json
import os
import pathlib
import sys
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from ds030_adapter import DS030Adapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def cache_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    return tmp_path / "cache"


@pytest.fixture
def mock_participants_tsv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter="\t")
    writer.writerow([
        "participant_id", "diagnosis", "age", "sex", "handedness",
        "race", "ethnicity",
    ])
    diagnoses = [
        ("CONTROL", 25, "M", "R"),
        ("CONTROL", 30, "F", "L"),
        ("SCHZ", 28, "M", "R"),
        ("SCHZ", 35, "F", "R"),
        ("BIPOLAR", 32, "M", "R"),
        ("ADHD", 22, "F", "L"),
    ]
    for i, (dx, age, sex, hand) in enumerate(diagnoses, 1):
        writer.writerow([
            f"sub-{i:03d}", dx, age, sex, hand, "Caucasian", "Not Hispanic",
        ])
    return buf.getvalue()


@pytest.fixture
def mock_dataset_description() -> str:
    return json.dumps({
        "Name": "UCLA Consortium for Neuropsychiatric Phenomics LA5c Study",
        "BIDSVersion": "1.0.2",
        "License": "PDDL",
    })


@pytest.fixture
def adapter(cache_dir: pathlib.Path) -> DS030Adapter:
    return DS030Adapter(cache_dir=cache_dir)


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_sets_session(self, adapter: DS030Adapter) -> None:
        with patch("ds030_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert adapter._connected is True

    def test_connect_no_credentials_needed(self, adapter: DS030Adapter) -> None:
        with patch("ds030_adapter.requests.Session") as MockSession:
            mock_sess = MagicMock()
            mock_sess.head.return_value.status_code = 200
            MockSession.return_value = mock_sess
            adapter.connect()
            assert mock_sess.auth is None


# ---------------------------------------------------------------------------
# Fetch tests
# ---------------------------------------------------------------------------

class TestFetch:
    def test_fetch_participants(
        self,
        adapter: DS030Adapter,
        mock_participants_tsv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "participants" in url:
                resp.iter_content.return_value = [
                    mock_participants_tsv.encode()[i : i + 64]
                    for i in range(0, len(mock_participants_tsv.encode()), 64)
                ]
            elif "dataset_description" in url:
                desc = mock_dataset_description()
                resp.iter_content.return_value = [
                    desc.encode()[i : i + 64]
                    for i in range(0, len(desc.encode()), 64)
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        files = adapter.fetch()
        assert "participants" in files
        assert files["participants"].exists()

    def test_fetch_caches_existing(
        self, adapter: DS030Adapter, cache_dir: pathlib.Path
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()
        part_path = adapter._local_path(
            "https://s3.amazonaws.com/openneuro.org/ds000030/ds000030_participants.tsv",
            ".tsv",
        )
        part_path.parent.mkdir(parents=True, exist_ok=True)
        part_path.write_text("cached")

        files = adapter.fetch()
        assert files["participants"].exists()
        adapter._session.get.assert_not_called()


# ---------------------------------------------------------------------------
# Normalize tests
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_normalize_basic(
        self,
        adapter: DS030Adapter,
        mock_participants_tsv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "participants" in url:
                resp.iter_content.return_value = [
                    mock_participants_tsv.encode()[i : i + 64]
                    for i in range(0, len(mock_participants_tsv.encode()), 64)
                ]
            elif "dataset_description" in url:
                desc = json.dumps({"Name": "ds000030", "BIDSVersion": "1.0.2"})
                resp.iter_content.return_value = [
                    desc.encode()[i : i + 64]
                    for i in range(0, len(desc.encode()), 64)
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
        assert len(participants) == 6
        assert "participant_id" in participants.columns
        assert "diagnosis" in participants.columns

        # Check diagnosis mapping
        diagnoses = set(participants["diagnosis"].unique())
        assert "Control" in diagnoses
        assert "Schizophrenia" in diagnoses
        assert "Bipolar" in diagnoses
        assert "ADHD" in diagnoses

    def test_diagnosis_map(self, adapter: DS030Adapter) -> None:
        fn = adapter._diagnosis_map
        assert fn("control") == "Control"
        assert fn("ctrl") == "Control"
        assert fn("hc") == "Control"
        assert fn("schizophrenia") == "Schizophrenia"
        assert fn("sz") == "Schizophrenia"
        assert fn("bipolar") == "Bipolar"
        assert fn("bipolar disorder") == "Bipolar"
        assert fn("adhd") == "ADHD"
        assert fn("UNKNOWN") == "Unknown"

    def test_scans_dataframe(
        self,
        adapter: DS030Adapter,
        mock_participants_tsv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "participants" in url:
                resp.iter_content.return_value = [
                    mock_participants_tsv.encode()[i : i + 64]
                    for i in range(0, len(mock_participants_tsv.encode()), 64)
                ]
            elif "dataset_description" in url:
                desc = json.dumps({"Name": "ds000030", "BIDSVersion": "1.0.2"})
                resp.iter_content.return_value = [
                    desc.encode()[i : i + 64]
                    for i in range(0, len(desc.encode()), 64)
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
        # 6 subjects x (1 T1w + 1 dwi + 1 rest + 7 tasks) = 6 x 10 = 60
        assert len(scans) == 60
        assert "modality" in scans.columns
        assert "task" in scans.columns

    def test_tasks_dict(
        self, adapter: DS030Adapter, cache_dir: pathlib.Path
    ) -> None:
        adapter._phenotypic_path = cache_dir / "test_participants.tsv"
        adapter._phenotypic_path.write_text(
            "participant_id\tsub-001\n"
        )
        adapter._task_meta_dir = cache_dir / "task_meta"
        adapter._task_meta_dir.mkdir(exist_ok=True)
        (adapter._task_meta_dir / "task-rest_bold.json").write_text(
            json.dumps({"RepetitionTime": 2.0, "TaskName": "rest"})
        )

        result = adapter.normalize()
        assert "tasks" in result
        assert "rest" in result["tasks"]
        assert result["tasks"]["rest"]["TaskName"] == "rest"


# ---------------------------------------------------------------------------
# Convenience helpers tests
# ---------------------------------------------------------------------------

class TestConvenience:
    def test_get_diagnosis_counts(
        self,
        adapter: DS030Adapter,
        mock_participants_tsv: str,
        cache_dir: pathlib.Path,
    ) -> None:
        adapter._connected = True
        adapter._session = MagicMock()

        def mock_get(url: str, **kwargs: Any) -> MagicMock:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            if "participants" in url:
                resp.iter_content.return_value = [
                    mock_participants_tsv.encode()[i : i + 64]
                    for i in range(0, len(mock_participants_tsv.encode()), 64)
                ]
            elif "dataset_description" in url:
                desc = json.dumps({"Name": "ds000030", "BIDSVersion": "1.0.2"})
                resp.iter_content.return_value = [
                    desc.encode()[i : i + 64]
                    for i in range(0, len(desc.encode()), 64)
                ]
            else:
                resp.iter_content.return_value = []
            resp.__enter__ = MagicMock(return_value=resp)
            resp.__exit__ = MagicMock(return_value=False)
            return resp

        adapter._session.get.side_effect = mock_get
        adapter.fetch()
        counts = adapter.get_diagnosis_counts()
        assert len(counts) == 4  # 4 unique diagnoses
        assert counts.sum() == 6


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

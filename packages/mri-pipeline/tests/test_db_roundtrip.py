"""Unit tests for :mod:`deepsynaps_mri.db` row assembly (no live Postgres)."""
from __future__ import annotations

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
from uuid import uuid4

from deepsynaps_mri.schemas import MRIReport, Modality, PatientMeta, QCMetrics, Sex


def _minimal_report() -> MRIReport:
    return MRIReport(
        patient=PatientMeta(patient_id="P1", age=40, sex=Sex.M),
        modalities_present=[Modality.T1],
        qc=QCMetrics(),
    )


def test_load_report_maps_columns() -> None:
    """``load_report`` maps SELECT columns to :class:`MRIReport` fields."""
    aid = uuid4()
    row = (
        str(aid),
        "P1",
        40,
        "M",
        json.dumps(["T1"]),
        json.dumps(
            {
                "segmentation_engine": "synthseg",
                "cortical_thickness_mm": {},
                "subcortical_volume_mm3": {},
            }
        ),
        None,
        None,
        json.dumps([]),
        json.dumps({"findings": [], "conditions": []}),
        json.dumps({}),
        json.dumps({"t1": "ok"}),
        "0.1.0",
        "ISTAGING-v1",
    )

    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = row
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_conn.cursor.return_value.__exit__.return_value = None

    @contextmanager
    def fake_connect(_dsn=None):
        yield mock_conn

    with patch("deepsynaps_mri.db.connect", fake_connect):
        from deepsynaps_mri import db as db_mod

        rep = db_mod.load_report(aid)
    assert str(rep.analysis_id) == str(aid)
    assert rep.patient.patient_id == "P1"
    assert rep.modalities_present == [Modality.T1]
    assert rep.structural is not None


def test_save_report_sql_uses_json_columns() -> None:
    """Save path targets Studio ``*_json`` columns (smoke via execute capture)."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    mock_conn.cursor.return_value.__exit__.return_value = None

    @contextmanager
    def fake_connect(_dsn=None):
        yield mock_conn

    with patch("deepsynaps_mri.db.connect", fake_connect):
        from deepsynaps_mri import db as db_mod

        r = _minimal_report()
        mock_cur.fetchone.return_value = (str(r.analysis_id),)
        out = db_mod.save_report(r, dsn="postgresql://test/db")

    assert out == r.analysis_id
    sql = mock_cur.execute.call_args[0][0]
    assert "modalities_present_json" in sql
    assert "structural_json" in sql
    assert "ON CONFLICT (analysis_id)" in sql

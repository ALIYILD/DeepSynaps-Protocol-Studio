"""Workflow orchestration tests."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_text import import_clinical_text
from deepsynaps_text.workflow_orchestration import (
    collect_text_provenance,
    default_text_pipeline_definition,
    execute_text_pipeline,
    resume_text_pipeline,
)


SYNTHETIC_NOTE = (
    "HPI:\n"
    "Completed rTMS series.\n"
    "PLAN:\n"
    "Continue lamotrigine.\n"
)


def test_execute_text_pipeline_note_produces_report_and_provenance() -> None:
    doc = import_clinical_text(
        SYNTHETIC_NOTE,
        patient_ref="opaque-pat",
        encounter_ref=None,
        channel="note",
        created_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
    )
    pipe = default_text_pipeline_definition()
    run = execute_text_pipeline(pipe, doc)
    assert run.status == "completed"
    assert run.report is not None
    assert run.report.document_id == doc.id
    assert run.report.entities is not None
    assert run.report.coded_entities is not None
    assert run.report.neuromodulation is not None
    assert run.report.neuromodulation and run.report.neuromodulation.history
    assert run.run_id
    prov = collect_text_provenance(run.run_id)
    assert len(prov) >= 5
    steps = {p["step"] for p in prov}
    assert "extract_entities" in steps
    assert "assemble_report" in steps


def test_resume_text_pipeline_reruns() -> None:
    doc = import_clinical_text(
        "Brief.",
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    run1 = execute_text_pipeline(default_text_pipeline_definition(), doc)
    run2 = resume_text_pipeline(run1.run_id)
    assert run2.status == "completed"
    assert run2.run_id != run1.run_id
    assert run2.report is not None


def test_resume_missing_raises() -> None:
    with pytest.raises(KeyError):
        resume_text_pipeline("00000000-0000-0000-0000-000000000000")

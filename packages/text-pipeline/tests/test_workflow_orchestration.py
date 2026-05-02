"""Workflow orchestration tests."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from deepsynaps_text import import_clinical_text
from deepsynaps_text.run_store import configure_run_store_from_env, set_run_store
from deepsynaps_text.run_store import MemoryRunStore
from deepsynaps_text.pipeline_hashes import hash_json_object
from deepsynaps_text.workflow_orchestration import (
    collect_text_provenance,
    default_text_pipeline_definition,
    execute_text_pipeline,
    get_text_pipeline_run,
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
    assert run.input_content_sha256 and len(run.input_content_sha256) == 64
    assert run.output_report_sha256 and len(run.output_report_sha256) == 64
    assert run.report is not None
    assert run.report.content_sha256 and len(run.report.content_sha256) == 64
    assert run.output_report_sha256 == hash_json_object(run.report.model_dump(mode="json"))
    prov_row = next(x for x in prov if x["step"] == "extract_entities")
    assert prov_row["detail"].get("rule_pack_version")


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


def test_file_run_store_persists(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSYNAPS_TEXT_PERSIST_RUNS", "1")
    monkeypatch.setenv("DEEPSYNAPS_TEXT_RUN_STORE_DIR", str(tmp_path))
    configure_run_store_from_env()
    doc = import_clinical_text(
        "Synthetic.",
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    run = execute_text_pipeline(default_text_pipeline_definition(), doc)
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    data = json.loads(files[0].read_text(encoding="utf-8"))
    assert data["run_id"] == run.run_id
    loaded = get_text_pipeline_run(run.run_id)
    assert loaded is not None
    assert loaded.report is not None
    monkeypatch.delenv("DEEPSYNAPS_TEXT_PERSIST_RUNS", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_TEXT_RUN_STORE_DIR", raising=False)
    set_run_store(MemoryRunStore())


def test_rules_only_flag_forces_rule_backend(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSYNAPS_TEXT_RULES_ONLY_NLP", "1")
    doc = import_clinical_text(
        SYNTHETIC_NOTE,
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    run = execute_text_pipeline(
        default_text_pipeline_definition(),
        doc,
        entity_backend="spacy_med",
    )
    assert run.feature_flags.get("rules_only_nlp") is True
    ner = next(a for a in run.artifacts if a.step == "extract_entities")
    assert ner.detail.get("entity_backend") == "rule"
    monkeypatch.delenv("DEEPSYNAPS_TEXT_RULES_ONLY_NLP", raising=False)

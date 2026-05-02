"""Core clinical NLP: schema and rule-based pipeline tests (synthetic notes only)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_text.core_nlp import (
    RuleBasedClinicalBackend,
    SpaCyClinicalBackend,
    detect_negation_and_assertion,
    detect_sections,
    detect_temporal_context,
    extract_clinical_entities,
)
from deepsynaps_text.ingestion import normalize_note_format
from deepsynaps_text.schemas import ClinicalEntityExtractionResult


def _sample_note() -> str:
    return (
        "HPI:\n"
        "Patient denies seizure but reports headache.\n"
        "Prior rTMS trial last year.\n"
        "MEDICATIONS:\n"
        "sertraline 50 mg po daily\n"
        "PLAN:\n"
        "Will schedule follow-up DBS discussion.\n"
    )


def test_clinical_entity_extraction_result_schema() -> None:
    from deepsynaps_text import import_clinical_text, normalize_note_format
    from deepsynaps_text.schemas import ClinicalEntity, TextSpan

    doc = import_clinical_text(
        _sample_note(),
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    doc = normalize_note_format(doc)
    r = extract_clinical_entities(doc, backend="rule")
    assert r.document_id == doc.id
    assert r.source_text == doc.normalized_text
    assert r.backend == "rule"
    assert r.model_version
    assert isinstance(r.entities, list)
    for e in r.entities:
        assert isinstance(e, ClinicalEntity)
        assert e.span.end > e.span.start
        assert e.span.text == r.source_text[e.span.start : e.span.end]
        assert isinstance(e.span, TextSpan)


def test_rule_extractor_finds_neuromod_and_medication_attrs() -> None:
    from deepsynaps_text import import_clinical_text, normalize_note_format

    doc = import_clinical_text(
        _sample_note(),
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    doc = normalize_note_format(doc)
    r = extract_clinical_entities(doc, backend="rule")
    types = {e.entity_type for e in r.entities}
    assert "neuromodulation" in types
    meds = [e for e in r.entities if e.entity_type == "medication"]
    assert meds
    ser = next(m for m in meds if "sertraline" in m.span.text.lower())
    assert "dose" in ser.attributes or "frequency" in ser.attributes


def test_spacy_backend_stub_empty_entities() -> None:
    from deepsynaps_text import import_clinical_text

    doc = import_clinical_text(
        "No entities expected from stub.",
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    r = extract_clinical_entities(doc, backend="spacy_med")
    assert r.backend == "spacy_med"
    assert r.model_version and r.model_version.startswith("stub:")
    assert r.entities == []


def test_negation_and_temporal_layers() -> None:
    from deepsynaps_text import import_clinical_text, normalize_note_format

    doc = import_clinical_text(
        _sample_note(),
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    doc = normalize_note_format(doc)
    base = extract_clinical_entities(doc, backend="rule")
    n = detect_negation_and_assertion(base)
    seiz = next(e for e in n.entities if "seizure" in e.span.text.lower())
    assert seiz.negation_assertion == "absent"
    t = detect_temporal_context(n)
    rtm = next(e for e in t.entities if e.span.text.lower() == "rtms")
    assert rtm.temporal_context == "past"
    plan = next(e for e in t.entities if "DBS" in e.span.text)
    assert plan.temporal_context == "future"


def test_detect_sections_message_body() -> None:
    from deepsynaps_text import import_clinical_text

    doc = import_clinical_text(
        "Need refill on lamotrigine please.",
        patient_ref=None,
        encounter_ref=None,
        channel="message",
        created_at=datetime.now(timezone.utc),
    )
    st = detect_sections(doc)
    assert st.document_id == doc.id
    assert len(st.sections) == 1
    assert st.sections[0].label == "message_body"


def test_detect_sections_note_headers() -> None:
    from deepsynaps_text import import_clinical_text, normalize_note_format

    doc = import_clinical_text(
        _sample_note(),
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    doc = normalize_note_format(doc)
    st = detect_sections(doc)
    labels = {s.label for s in st.sections}
    assert "HPI" in labels
    assert "MEDICATIONS" in labels


def test_unknown_backend_raises() -> None:
    from deepsynaps_text import import_clinical_text

    doc = import_clinical_text(
        "x",
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    with pytest.raises(ValueError, match="Unknown clinical NLP backend"):
        extract_clinical_entities(doc, backend="no_such_backend")


def test_backend_classes_instantiable() -> None:
    b = SpaCyClinicalBackend("en_core_sci_sm")
    r = b.extract_entities("hello", "doc-1", [])
    assert isinstance(r, ClinicalEntityExtractionResult)
    rb = RuleBasedClinicalBackend()
    r2 = rb.extract_entities("rTMS today", "doc-2", [])
    assert any(e.entity_type == "neuromodulation" for e in r2.entities)

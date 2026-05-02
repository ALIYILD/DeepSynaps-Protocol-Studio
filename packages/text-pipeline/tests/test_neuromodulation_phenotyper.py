"""Neuromodulation phenotyping — synthetic clinical snippets only."""

from __future__ import annotations

from deepsynaps_text.core_nlp import extract_clinical_entities
from deepsynaps_text.ingestion import import_clinical_text, normalize_note_format
from deepsynaps_text.neuromodulation_phenotyper import (
    extract_neuromodulation_history,
    extract_neuromodulation_risks_and_contraindications,
    extract_stimulation_parameters,
)
from deepsynaps_text.schemas import (
    ClinicalEntityExtractionResult,
    CodedEntityExtractionResult,
)


SYNTHETIC_NOTE = (
    "Patient completed 20 sessions of left DLPFC rTMS at 120% MT with partial response. "
    "No seizures. Has DBS in STN for Parkinson disease."
)


def _note_as_result() -> ClinicalEntityExtractionResult:
    doc = import_clinical_text(
        SYNTHETIC_NOTE,
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    doc = normalize_note_format(doc)
    return extract_clinical_entities(doc, backend="rule")


def test_extract_stimulation_parameters_from_synthetic_note() -> None:
    base = _note_as_result()
    p = extract_stimulation_parameters(base)
    assert p.document_id == base.document_id
    assert p.session_count == 20
    assert p.intensity_percent_mt == 120.0
    assert p.coil_or_lead_location is not None
    assert "DLPFC" in (p.coil_or_lead_location or "")


def test_extract_neuromodulation_history_modalities_targets_response() -> None:
    base = _note_as_result()
    h = extract_neuromodulation_history(base)
    assert h.document_id == base.document_id
    assert "rTMS" in h.modalities_seen
    assert "DBS" in h.modalities_seen
    assert any("DLPFC" in t for t in h.targets_seen)
    assert any("STN" in t for t in h.targets_seen)
    assert any(
        line.response == "partial"
        for line in h.therapies
        if getattr(line, "modality", None) == "rTMS"
    )


def test_risk_profile_seizure_negated_and_dbs_metallic() -> None:
    base = _note_as_result()
    r = extract_neuromodulation_risks_and_contraindications(base)
    assert r.document_id == base.document_id
    assert r.seizure_history is False
    assert r.metallic_implants is True
    assert "seizure_negated_phrase" in r.notes or "seizure_negated" in r.notes
    assert "dbs_implant_mention" in r.notes


def test_works_with_coded_entity_result_wrapper() -> None:
    """CodedEntityExtractionResult is accepted when entities mirror clinical extraction."""
    base = _note_as_result()
    coded = CodedEntityExtractionResult(
        document_id=base.document_id,
        source_text=base.source_text,
        backend="noop",
        entities=[],  # type: ignore[arg-type]
    )
    h = extract_neuromodulation_history(coded)
    assert "rTMS" in h.modalities_seen
    p = extract_stimulation_parameters(coded)
    assert p.session_count == 20


def test_additional_risk_keywords() -> None:
    text = (
        "Pacemaker placed last year. Patient pregnant. Active suicidal ideation. "
        "Unstable angina noted."
    )
    base = ClinicalEntityExtractionResult(
        document_id="r1",
        source_text=text,
        backend="manual",
        entities=[],
    )
    r = extract_neuromodulation_risks_and_contraindications(base)
    assert r.metallic_implants is True
    assert r.pregnancy is True
    assert r.suicidality is True
    assert r.unstable_medical_condition is True

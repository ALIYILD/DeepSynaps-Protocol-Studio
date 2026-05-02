"""Tests for clinical text ingestion and de-identification (synthetic PHI only)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_text import (
    RegexDeidBackend,
    deidentify_text,
    import_clinical_text,
    normalize_note_format,
)
from deepsynaps_text.ingestion import DeidBackend
from deepsynaps_text.schemas import DeidStrategy, PhiSpan


def test_import_clinical_text_sets_metadata() -> None:
    created = datetime(2024, 1, 15, 10, 30, tzinfo=timezone.utc)
    doc = import_clinical_text(
        "Chief complaint: headache.",
        patient_ref="pat_opaque_001",
        encounter_ref="enc_42",
        channel="note",
        created_at=created,
        author_role="physician",
    )
    assert doc.raw_text.startswith("Chief")
    assert doc.deidentified_text is None
    assert doc.metadata.patient_ref == "pat_opaque_001"
    assert doc.metadata.encounter_ref == "enc_42"
    assert doc.metadata.channel == "note"
    assert doc.metadata.created_at == created
    assert doc.metadata.author_role == "physician"
    assert doc.metadata.ingested_at.tzinfo == timezone.utc


def test_deidentify_mask_replaces_phi() -> None:
    raw = (
        "Patient: Jane Smith\n"
        "DOB: 01/15/1980\n"
        "Email: fake.user@example.com Call 555-123-4567\n"
        "MRN: 12345678901\n"
        "Visit 2024-03-01\n"
    )
    doc = import_clinical_text(raw, patient_ref=None, encounter_ref=None, channel="note")
    redacted = deidentify_text(doc, strategy="mask")
    assert "Jane Smith" not in (redacted.deidentified_text or "")
    assert "fake.user@example.com" not in (redacted.deidentified_text or "")
    assert "[EMAIL]" in (redacted.deidentified_text or "")
    assert "[PHONE]" in (redacted.deidentified_text or "")
    assert "[DATE]" in (redacted.deidentified_text or "")
    assert redacted.raw_text == raw


def test_deidentify_remove_strips_phi() -> None:
    raw = "Reach me at patient@mail.org or 800-555-0199."
    doc = import_clinical_text(raw, patient_ref=None, encounter_ref=None, channel="message")
    redacted = deidentify_text(doc, strategy="remove")
    t = redacted.deidentified_text or ""
    assert "patient@mail.org" not in t
    assert "800-555-0199" not in t
    assert "Reach me at" in t or "Reach me" in t


def test_custom_deid_backend() -> None:
    class XBackend(DeidBackend):
        def deidentify(
            self, text: str, *, strategy: DeidStrategy
        ) -> tuple[str, list[PhiSpan]]:  # noqa: ARG002
            return "REDACTED_ALL", []

    doc = import_clinical_text("secret", patient_ref=None, encounter_ref=None, channel="chat")
    out = deidentify_text(doc, backend=XBackend(), strategy="mask")
    assert out.deidentified_text == "REDACTED_ALL"


def test_regex_backend_phi_spans_and_types() -> None:
    raw = "SSN 000-00-0000 and MRN: 12345678"
    backend = RegexDeidBackend()
    out, spans = backend.deidentify(raw, strategy="mask")
    types = {s.phi_type for s in spans}
    assert "ssn" in types
    assert "mrn" in types
    assert "[ID]" in out
    assert "[MRN]" in out


def test_normalize_whitespace_and_sections() -> None:
    note = (
        "Admission one-liner here.\n\n"
        "HPI:\n"
        "  Headache   for 3 days.\n"
        "MEDICATIONS:\n"
        "Aspirin\n"
        "PLAN:\n"
        "Follow up in clinic.\n"
    )
    doc = import_clinical_text(note, patient_ref=None, encounter_ref=None, channel="note")
    doc2 = normalize_note_format(doc)
    assert doc2.normalized_text is not None
    assert "  " not in doc2.normalized_text
    labels = [s.label for s in doc2.sections]
    assert "HPI" in labels
    assert "MEDICATIONS" in labels
    assert "PLAN" in labels
    hpi = next(s for s in doc2.sections if s.label == "HPI")
    assert "Headache" in hpi.body
    assert "Aspirin" in next(s for s in doc2.sections if s.label == "MEDICATIONS").body


def test_normalize_uses_deidentified_when_present() -> None:
    doc = import_clinical_text(
        "Line one.\n\nPLAN:\nDo thing.",
        patient_ref=None,
        encounter_ref=None,
        channel="note",
    )
    doc = deidentify_text(doc, strategy="mask")
    doc = normalize_note_format(doc)
    assert doc.normalized_text is not None
    assert any(s.label == "PLAN" for s in doc.sections)


def test_sections_single_body_when_no_headers() -> None:
    doc = import_clinical_text(
        "Just prose without section headers.",
        patient_ref=None,
        encounter_ref=None,
        channel="message",
    )
    doc = normalize_note_format(doc)
    assert len(doc.sections) == 1
    assert doc.sections[0].label == "BODY"

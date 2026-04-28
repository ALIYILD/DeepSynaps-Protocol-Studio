"""Unit tests for the OpenMed adapter (heuristic backend)."""
from __future__ import annotations

from app.services.openmed import adapter
from app.services.openmed.schemas import ClinicalTextInput


_NOTE = (
    "Patient reports anhedonia and insomnia for 6 weeks. Started sertraline 50mg. "
    "PHQ-9 score 18. Considering rTMS referral. Contact: jane.doe@example.com, "
    "phone 0207-555-0143. MRN: AB-12345. Dx: MDD."
)


def test_analyze_returns_entities_and_pii() -> None:
    r = adapter.analyze(ClinicalTextInput(text=_NOTE, source_type="clinician_note"))
    assert r.backend == "heuristic"
    labels = {e.label for e in r.entities}
    assert "medication" in labels  # sertraline
    assert "diagnosis" in labels   # MDD
    assert "symptom" in labels     # anhedonia / insomnia
    assert "lab" in labels         # PHQ-9
    assert "procedure" in labels   # rTMS
    pii_labels = {p.label for p in r.pii}
    assert "email" in pii_labels
    assert "phone" in pii_labels
    assert "mrn" in pii_labels
    assert r.char_count == len(_NOTE)
    assert r.safety_footer.startswith("decision-support")


def test_analyze_empty_summary_when_no_entities() -> None:
    r = adapter.analyze(ClinicalTextInput(text="Hello world.", source_type="free_text"))
    assert r.backend == "heuristic"
    assert r.entities == []
    assert "no entities" in r.summary.lower()


def test_extract_pii_only_returns_pii_entities() -> None:
    r = adapter.extract_pii(ClinicalTextInput(text=_NOTE))
    assert r.backend == "heuristic"
    assert {p.label for p in r.pii} & {"email", "phone", "mrn"}


def test_deidentify_replaces_pii_with_tokens() -> None:
    r = adapter.deidentify(ClinicalTextInput(text=_NOTE))
    assert r.backend == "heuristic"
    assert "jane.doe@example.com" not in r.redacted_text
    assert "[EMAIL]" in r.redacted_text
    assert "[MRN]" in r.redacted_text
    assert r.replacements


def test_deidentify_preserves_clinical_text() -> None:
    r = adapter.deidentify(ClinicalTextInput(text=_NOTE))
    # Clinical content stays in the redacted body so downstream LLM context
    # remains useful even after PHI is removed.
    assert "anhedonia" in r.redacted_text
    assert "sertraline" in r.redacted_text
    assert "MDD" in r.redacted_text


def test_health_reports_heuristic_when_no_upstream() -> None:
    r = adapter.health()
    assert r.ok is True
    assert r.backend == "heuristic"


def test_entity_spans_round_trip() -> None:
    r = adapter.analyze(ClinicalTextInput(text=_NOTE))
    for ent in r.entities:
        assert _NOTE[ent.span.start : ent.span.end] == ent.text


def test_pii_spans_round_trip() -> None:
    r = adapter.extract_pii(ClinicalTextInput(text=_NOTE))
    for p in r.pii:
        assert _NOTE[p.span.start : p.span.end] == p.text


def test_long_input_does_not_crash() -> None:
    big = ("Patient on sertraline. " * 5000)[:200_000]
    r = adapter.analyze(ClinicalTextInput(text=big, source_type="clinician_note"))
    assert r.backend == "heuristic"
    assert r.char_count == len(big)

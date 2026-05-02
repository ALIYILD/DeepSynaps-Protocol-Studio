"""Terminology linking and auto-coding (stub backends, synthetic entities only)."""

from __future__ import annotations

from deepsynaps_text.coding import auto_code_note, link_entities_to_terminology
from deepsynaps_text.schemas import (
    ClinicalEntity,
    ClinicalEntityExtractionResult,
    TextSpan,
)


def _entity(
    text: str,
    etype: str,
    start: int = 0,
    *,
    section: str = "HPI",
) -> ClinicalEntity:
    end = start + len(text)
    return ClinicalEntity(
        span=TextSpan(start=start, end=end, text=text),
        entity_type=etype,  # type: ignore[arg-type]
        section=section,
    )


def test_link_entities_biosyn_stub_maps_known_terms() -> None:
    base = ClinicalEntityExtractionResult(
        document_id="doc-1",
        source_text="sertraline for migraine; rTMS discussed.",
        backend="rule",
        entities=[
            _entity("sertraline", "medication", start=0),
            _entity("migraine", "diagnosis", start=18),
            _entity("rTMS", "neuromodulation", start=29),
        ],
    )
    coded = link_entities_to_terminology(base, backend="biosyn")
    assert coded.backend == "biosyn"
    assert coded.model_version
    assert len(coded.entities) == 3
    rx = coded.entities[0]
    assert any(c.system == "RXNORM" and c.code == "36437" for c in rx.codings)
    dx = coded.entities[1]
    assert any(c.system == "SNOMED_CT" for c in dx.codings)
    assert any(c.system == "ICD10CM" for c in dx.codings)
    nm = coded.entities[2]
    codes = {c.code for c in nm.codings if c.system == "SNOMED_CT"}
    assert "229072009" in codes


def test_link_entities_noop_empty_codings() -> None:
    base = ClinicalEntityExtractionResult(
        document_id="doc-2",
        source_text="x",
        backend="rule",
        entities=[_entity("aspirin", "medication")],
    )
    coded = link_entities_to_terminology(base, backend="noop")
    assert coded.entities[0].codings == []


def test_auto_code_note_deduplicates_and_groups() -> None:
    base = ClinicalEntityExtractionResult(
        document_id="doc-3",
        source_text="twins",
        backend="rule",
        entities=[
            _entity("migraine", "problem"),
            _entity("migraine", "symptom"),
        ],
    )
    coded = link_entities_to_terminology(base, backend="biosyn")
    auto = auto_code_note(coded)
    assert auto.document_id == "doc-3"
    snomed = [s for s in auto.suggestions if s.system == "SNOMED_CT" and s.code == "37796009"]
    assert len(snomed) == 1
    assert set(snomed[0].source_entity_indices) == {0, 1}
    assert "diagnosis" in auto.by_category


def test_unknown_backend_raises() -> None:
    base = ClinicalEntityExtractionResult(
        document_id="doc-4",
        source_text="",
        backend="rule",
        entities=[],
    )
    try:
        link_entities_to_terminology(base, backend="unknown_linker")
    except ValueError as e:
        assert "Unknown terminology backend" in str(e)
    else:
        raise AssertionError("expected ValueError")


def test_fallback_umls_placeholder_stable() -> None:
    base = ClinicalEntityExtractionResult(
        document_id="doc-5",
        source_text="unknowntermxyz",
        backend="rule",
        entities=[_entity("unknowntermxyz", "other")],
    )
    c1 = link_entities_to_terminology(base, backend="biosyn")
    c2 = link_entities_to_terminology(base, backend="biosyn")
    assert c1.entities[0].codings[0].code == c2.entities[0].codings[0].code
    assert c1.entities[0].codings[0].system == "UMLS_CUI"

"""
Terminology linking and auto-coding (SNOMED, ICD, LOINC, RxNorm).

Real BioSyn / UMLS / API integration belongs in an adapter; defaults here are
deterministic stubs for development and tests.
"""

from __future__ import annotations

import hashlib
import re
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Sequence

from deepsynaps_text.schemas import (
    AutoCodingResult,
    ClinicalEntity,
    ClinicalEntityExtractionResult,
    CodedEntity,
    CodedEntityExtractionResult,
    CodingCategory,
    EntityType,
    SuggestedCode,
    TerminologyReference,
)


def _clinical_entity_to_dict(ent: ClinicalEntity) -> dict:
    """Serialize base entity fields for CodedEntity constructor."""
    return ent.model_dump()


def link_entities_to_terminology(
    entities: ClinicalEntityExtractionResult,
    *,
    backend: str = "biosyn",
) -> CodedEntityExtractionResult:
    """
    Map each extracted entity to candidate standard codes.

    Parameters
    ----------
    entities :
        Output from core NLP (``ClinicalEntityExtractionResult``).
    backend :
        ``biosyn`` — deterministic stub with fake RxNorm/SNOMED/ICD/LOINC ids;
        ``noop`` — attach empty ``codings``.
    """
    impl = _resolve_linking_backend(backend)
    coded_list: list[CodedEntity] = []
    for ent in entities.entities:
        refs = impl.link_entity(ent, source_text=entities.source_text)
        base = _clinical_entity_to_dict(ent)
        coded_list.append(CodedEntity(**base, codings=list(refs)))
    return CodedEntityExtractionResult(
        document_id=entities.document_id,
        source_text=entities.source_text,
        backend=backend,
        model_version=impl.model_version,
        entities=coded_list,
    )


def auto_code_note(coded_entities: CodedEntityExtractionResult) -> AutoCodingResult:
    """
    Roll up entity-level codings into note-level suggestions by category.

    Deduplicates on ``(system, code)``. Keeps the **maximum** confidence among
    contributing mentions and **merges** all supporting entity indices for that code.
    """
    groups: dict[tuple[str, str], list[tuple[int, CodingCategory, TerminologyReference]]] = defaultdict(list)

    for idx, ent in enumerate(coded_entities.entities):
        cat = _category_for_entity_type(ent.entity_type)
        for ref in ent.codings:
            groups[(ref.system, ref.code)].append((idx, cat, ref))

    best: dict[tuple[str, str], SuggestedCode] = {}
    for key, items in groups.items():
        _, winner_cat, winner_ref = max(items, key=lambda x: x[2].confidence)
        merged_indices = list(dict.fromkeys(i for i, _, _ in items))
        best[key] = SuggestedCode(
            coding_category=winner_cat,
            system=winner_ref.system,
            code=winner_ref.code,
            display=winner_ref.display,
            confidence=winner_ref.confidence,
            source_entity_indices=merged_indices,
        )

    suggestions = sorted(best.values(), key=lambda s: (-s.confidence, s.system, s.code))
    by_cat: dict[CodingCategory, list[SuggestedCode]] = defaultdict(list)
    for s in suggestions:
        by_cat[s.coding_category].append(s)

    return AutoCodingResult(
        document_id=coded_entities.document_id,
        backend=coded_entities.backend,
        model_version=coded_entities.model_version,
        suggestions=suggestions,
        by_category={str(k): v for k, v in by_cat.items()},
    )


def _category_for_entity_type(etype: EntityType) -> CodingCategory:
    if etype in ("diagnosis", "problem", "symptom"):
        return "diagnosis"
    if etype == "medication":
        return "medication"
    if etype == "lab":
        return "lab"
    if etype in ("procedure", "neuromodulation"):
        return "procedure"
    if etype == "device":
        return "device"
    return "other"


# --- Backends ----------------------------------------------------------------


class TerminologyLinkingBackend(ABC):
    """Pluggable concept linker (BioSyn-style scoring would live here)."""

    model_version: str = "base"

    @abstractmethod
    def link_entity(
        self,
        entity: ClinicalEntity,
        *,
        source_text: str,
    ) -> Sequence[TerminologyReference]:
        """Return zero or more standard-code candidates for ``entity``."""


class NoopTerminologyBackend(TerminologyLinkingBackend):
    model_version = "noop-stub"

    def link_entity(
        self,
        entity: ClinicalEntity,
        *,
        source_text: str,
    ) -> Sequence[TerminologyReference]:
        return ()


class BioSynStubBackend(TerminologyLinkingBackend):
    """
    Deterministic fake linker for development — **not** real clinical coding.

    Maps a few normalized surface strings to stable fake SNOMED / ICD / RxNorm / LOINC ids.
    """

    model_version = "biosyn-stub-v1"

    def link_entity(
        self,
        entity: ClinicalEntity,
        *,
        source_text: str,
    ) -> Sequence[TerminologyReference]:
        t = entity.span.text.strip()
        key = re.sub(r"\s+", " ", t.lower())
        table = _STUB_TABLE.get((entity.entity_type, key))
        if table:
            return tuple(TerminologyReference(**r) for r in table)
        cue = f"{entity.entity_type}:{key}"
        digest = hashlib.sha256(cue.encode("utf-8")).hexdigest()[:12]
        pseudo_num = int(digest, 16) % 10_000_000
        pseudo = f"C{pseudo_num:07d}"
        return (
            TerminologyReference(
                system="UMLS_CUI",
                code=pseudo,
                display=f"Unmapped mention ({entity.entity_type})",
                confidence=0.25,
            ),
        )


_LINKERS: dict[str, type[TerminologyLinkingBackend]] = {
    "biosyn": BioSynStubBackend,
    "noop": NoopTerminologyBackend,
}


def _resolve_linking_backend(name: str) -> TerminologyLinkingBackend:
    k = name.strip().lower()
    if k not in _LINKERS:
        raise ValueError(
            f"Unknown terminology backend {name!r}; expected one of {sorted(_LINKERS)}.",
        )
    return _LINKERS[k]()


# (entity_type, normalized_surface) -> list of dicts for TerminologyReference
_STUB_TABLE: dict[tuple[EntityType, str], list[dict[str, object]]] = {
    ("medication", "sertraline"): [
        {
            "system": "RXNORM",
            "code": "36437",
            "display": "sertraline",
            "confidence": 0.92,
        },
    ],
    ("medication", "aspirin"): [
        {
            "system": "RXNORM",
            "code": "1191",
            "display": "aspirin",
            "confidence": 0.9,
        },
    ],
    ("diagnosis", "migraine"): [
        {
            "system": "SNOMED_CT",
            "code": "37796009",
            "display": "Migraine",
            "confidence": 0.88,
        },
        {
            "system": "ICD10CM",
            "code": "G43.9",
            "display": "Migraine, unspecified",
            "confidence": 0.85,
        },
    ],
    ("problem", "migraine"): [
        {
            "system": "SNOMED_CT",
            "code": "37796009",
            "display": "Migraine",
            "confidence": 0.86,
        },
    ],
    ("symptom", "headache"): [
        {
            "system": "SNOMED_CT",
            "code": "25064002",
            "display": "Headache",
            "confidence": 0.8,
        },
    ],
    ("symptom", "migraine"): [
        {
            "system": "SNOMED_CT",
            "code": "37796009",
            "display": "Migraine",
            "confidence": 0.88,
        },
    ],
    ("lab", "glucose"): [
        {
            "system": "LOINC",
            "code": "2345-7",
            "display": "Glucose [Mass/volume] in Serum or Plasma",
            "confidence": 0.91,
        },
    ],
    ("procedure", "mri"): [
        {
            "system": "SNOMED_CT",
            "code": "113091000",
            "display": "Magnetic resonance imaging",
            "confidence": 0.87,
        },
        {
            "system": "ICD10PCS",
            "code": "BN39ZZZ",
            "display": "MRI brain",
            "confidence": 0.72,
        },
    ],
    ("neuromodulation", "rtms"): [
        {
            "system": "SNOMED_CT",
            "code": "229072009",
            "display": "Transcranial magnetic stimulation",
            "confidence": 0.84,
        },
    ],
    ("neuromodulation", "tms"): [
        {
            "system": "SNOMED_CT",
            "code": "229072009",
            "display": "Transcranial magnetic stimulation",
            "confidence": 0.83,
        },
    ],
    ("device", "dbs generator"): [
        {
            "system": "SNOMED_CT",
            "code": "705647007",
            "display": "Deep brain stimulation pulse generator",
            "confidence": 0.78,
        },
    ],
}

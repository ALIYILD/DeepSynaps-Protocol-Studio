"""
Core clinical NLP: entities, negation/assertion, temporality, sections.

SpaCy/medSpaCy/scispaCy integration is stubbed behind :class:`SpaCyClinicalBackend`.
Deterministic rule extraction is available via ``backend="rule"`` for tests and baseline runs.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod

from deepsynaps_text.ingestion import build_note_sections_from_text
from deepsynaps_text.schemas import (
    AssertionStatus,
    ClinicalEntity,
    ClinicalEntityExtractionResult,
    ClinicalTextDocument,
    EntityType,
    SectionedText,
    TemporalContext,
    TextSection,
    TextSpan,
)


def _working_text(doc: ClinicalTextDocument) -> str:
    """Prefer normalized pipeline text, then de-identified, then raw."""
    if doc.normalized_text is not None:
        return doc.normalized_text
    if doc.deidentified_text is not None:
        return doc.deidentified_text
    return doc.raw_text


def _sections_for_doc(doc: ClinicalTextDocument) -> tuple[str, list[TextSection]]:
    """Return full working text and section spans (compute if missing)."""
    text = _working_text(doc)
    if doc.sections:
        return text, list(doc.sections)
    collapsed, sections = build_note_sections_from_text(text)
    return collapsed, sections


def _section_label_for_offset(offset: int, sections: list[TextSection]) -> str:
    for sec in sections:
        if sec.start_char <= offset < sec.end_char:
            return sec.label
    if sections:
        return sections[-1].label
    return "BODY"


def detect_sections(doc: ClinicalTextDocument) -> SectionedText:
    """
    Segment the document into headed sections (notes) or a single body/message block.

    Message/email/chat channels use label ``message_body`` when the note is unstructured.
    """
    text, sections = _sections_for_doc(doc)
    ch = doc.metadata.channel
    if ch in ("message", "email", "chat") and len(sections) == 1 and sections[0].label == "BODY":
        s0 = sections[0]
        sections = [
            TextSection(
                label="message_body",
                start_char=s0.start_char,
                end_char=s0.end_char,
                body=s0.body,
            )
        ]
    return SectionedText(document_id=doc.id, full_text=text, sections=sections)


class ClinicalEntityBackend(ABC):
    """Pluggable entity extractor (spaCy/medSpaCy later; rules today)."""

    @abstractmethod
    def extract_entities(
        self,
        text: str,
        document_id: str,
        sections: list[TextSection],
    ) -> ClinicalEntityExtractionResult:
        """Produce entities with spans relative to ``text``."""


class SpaCyClinicalBackend(ClinicalEntityBackend):
    """
    Future hook for medSpaCy / scispaCy / en_core_sci pipelines.

    Install optional ``clinical_nlp`` extras and replace the body of :meth:`extract_entities`
    with a loaded ``nlp`` pipe. Until then returns an empty list with a stub version tag.
    """

    def __init__(self, model_name: str = "stub") -> None:
        self._model_name = model_name

    def extract_entities(
        self,
        text: str,
        document_id: str,
        sections: list[TextSection],
    ) -> ClinicalEntityExtractionResult:
        # Optional: `import spacy` and `nlp = spacy.load(...)` when wired.
        return ClinicalEntityExtractionResult(
            document_id=document_id,
            source_text=text,
            backend="spacy_med",
            model_version=f"stub:{self._model_name}",
            entities=[],
        )


class RuleBasedClinicalBackend(ClinicalEntityBackend):
    """
    Lightweight pattern matcher for synthetic tests and offline baseline extraction.

    Not a substitute for trained clinical NER — demonstrates pipeline wiring only.
    """

    _PATTERNS: list[tuple[EntityType, re.Pattern[str]]] = [
        ("symptom", re.compile(r"\b(headache|seizure|tremor|numbness)\b", re.I)),
        ("problem", re.compile(r"\b(migraine|epilepsy|depression|PD\b|Parkinson)\b", re.I)),
        ("diagnosis", re.compile(r"\b(?:dx|diagnosis)\s*:\s*([A-Za-z][A-Za-z\s]{2,48})", re.I)),
        ("medication", re.compile(r"\b(aspirin|sertraline|levodopa|lamotrigine)\b", re.I)),
        (
            "medication",
            re.compile(
                r"\b\d+\s*(?:mg|mcg|g)\s+(?:po|bid|tid|qhs|daily)\b",
                re.I,
            ),
        ),
        ("lab", re.compile(r"\b(hemoglobin|glucose|HbA1c|creatinine)\b", re.I)),
        ("procedure", re.compile(r"\b(MRI|EEG|lumbar puncture|DBS lead placement)\b", re.I)),
        ("device", re.compile(r"\b(pacemaker|ICD|DBS generator)\b", re.I)),
        (
            "neuromodulation",
            re.compile(
                r"\b(rTMS|TMS|tDCS|tACS|DBS|VNS|SNS|ECT)\b",
                re.I,
            ),
        ),
    ]

    def extract_entities(
        self,
        text: str,
        document_id: str,
        sections: list[TextSection],
    ) -> ClinicalEntityExtractionResult:
        entities: list[ClinicalEntity] = []
        for etype, pat in self._PATTERNS:
            for m in pat.finditer(text):
                if etype == "diagnosis" and m.lastindex:
                    start, end = m.start(1), m.end(1)
                    surface = text[start:end].strip()
                else:
                    start, end = m.start(), m.end()
                    surface = text[start:end]
                sec = _section_label_for_offset(start, sections)
                entities.append(
                    ClinicalEntity(
                        span=TextSpan(start=start, end=end, text=surface),
                        entity_type=etype,
                        negation_assertion="unknown",
                        temporal_context="unknown",
                        section=sec,
                        attributes={},
                    )
                )
        entities.sort(key=lambda e: (e.span.start, e.span.end))
        enriched = [_maybe_enrich_medication(text, e) for e in entities]
        return ClinicalEntityExtractionResult(
            document_id=document_id,
            source_text=text,
            backend="rule",
            model_version="rules-v1",
            entities=enriched,
        )


_MED_ATTR = re.compile(
    r"(?i)(?P<dose>\d+\s*(?:mg|mcg|g))\s*(?P<route>po|iv|im|sq|subq)?\s*(?P<freq>bid|tid|qid|qhs|daily|prn|q\d+h)?",
)


def _maybe_enrich_medication(text: str, ent: ClinicalEntity) -> ClinicalEntity:
    if ent.entity_type != "medication":
        return ent
    tail = text[ent.span.end : ent.span.end + 64]
    m = _MED_ATTR.search(tail)
    if not m:
        return ent
    attrs = dict(ent.attributes)
    if m.group("dose"):
        attrs["dose"] = m.group("dose").strip()
    if m.group("route"):
        attrs["route"] = m.group("route").strip().lower()
    if m.group("freq"):
        attrs["frequency"] = m.group("freq").strip().lower()
    return ent.model_copy(update={"attributes": attrs})


_BACKENDS: dict[str, type[ClinicalEntityBackend]] = {
    "spacy_med": SpaCyClinicalBackend,
    "rule": RuleBasedClinicalBackend,
}


def _resolve_backend(name: str) -> ClinicalEntityBackend:
    key = name.lower().strip()
    if key not in _BACKENDS:
        raise ValueError(
            f"Unknown clinical NLP backend {name!r}; choose from {sorted(_BACKENDS)}.",
        )
    cls = _BACKENDS[key]
    return cls()  # type: ignore[call-arg,misc]


def extract_clinical_entities(
    doc: ClinicalTextDocument,
    *,
    backend: str = "spacy_med",
) -> ClinicalEntityExtractionResult:
    """
    Extract clinical entities from the document's working text.

    Parameters
    ----------
    doc :
        Uses ``normalized_text``, else ``deidentified_text``, else ``raw_text``.
    backend :
        ``spacy_med`` — stub until medSpaCy is wired; ``rule`` — built-in patterns for dev/tests.
    """
    text, sections = _sections_for_doc(doc)
    impl = _resolve_backend(backend)
    return impl.extract_entities(text, doc.id, sections)


_NEG_ABSENT = re.compile(
    r"(?i)(?:\bno\b|\bdenies\b|\bwithout\b|negative for|absence of|ruled out\b)",
)
_NEG_HYP = re.compile(r"(?i)(?:\bpossible\b|\bmay\b|\bmight\b|\br/o\b|consider\b)")
_HIST_ASSERT = re.compile(r"(?i)(?:\bhistory of\b|\bprior\b|\bprevious\b|\bhad\b)")


def _window_before(text: str, start: int, width: int = 96) -> str:
    lo = max(0, start - width)
    return text[lo:start]


def detect_negation_and_assertion(
    entities: ClinicalEntityExtractionResult,
) -> ClinicalEntityExtractionResult:
    """Apply lightweight cue-based negation / certainty / historical assertion (MVP)."""
    src = entities.source_text
    updated: list[ClinicalEntity] = []
    for ent in entities.entities:
        w = _window_before(src, ent.span.start)
        status: AssertionStatus = ent.negation_assertion
        if _NEG_ABSENT.search(w) or _NEG_ABSENT.search(ent.span.text):
            status = "absent"
        elif _HIST_ASSERT.search(w):
            status = "historical"
        elif _NEG_HYP.search(w):
            status = "hypothetical"
        elif status == "unknown":
            status = "present"
        updated.append(
            ent.model_copy(
                update={"negation_assertion": status},
            )
        )
    return entities.model_copy(update={"entities": updated})


_TEMP_PAST = re.compile(
    r"(?i)(?:\bprior\b|\bprevious\b|\blast\b|\bhistory of\b|\bago\b)",
)
_TEMP_FUT = re.compile(
    r"(?i)(?:\bwill\b|\bscheduled\b|\bplan to\b|\bnext week\b|\bfollow[- ]?up\b)",
)
_TEMP_CUR = re.compile(
    r"(?i)(?:\bcurrently\b|\btoday\b|\bnow\b|\bcontinues\b|\bon\b\s+\d)",
)


def detect_temporal_context(
    entities: ClinicalEntityExtractionResult,
) -> ClinicalEntityExtractionResult:
    """Assign coarse temporality using local lexical cues and assertion hints."""
    src = entities.source_text
    updated: list[ClinicalEntity] = []
    for ent in entities.entities:
        w = _window_before(src, ent.span.start)
        full_local = w + ent.span.text
        temp: TemporalContext = ent.temporal_context
        if ent.negation_assertion == "historical":
            temp = "past"
        elif _TEMP_FUT.search(full_local):
            temp = "future"
        elif _TEMP_PAST.search(full_local):
            temp = "past"
        elif _TEMP_CUR.search(full_local):
            temp = "current"
        elif temp == "unknown":
            temp = "current"
        updated.append(ent.model_copy(update={"temporal_context": temp}))
    return entities.model_copy(update={"entities": updated})

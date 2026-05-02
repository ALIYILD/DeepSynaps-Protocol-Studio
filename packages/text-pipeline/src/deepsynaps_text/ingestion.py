"""
Clinical text ingestion, de-identification, and note normalization.

Heavy or ML-based de-identification should implement :class:`DeidBackend`
and be passed to :func:`deidentify_text`.
"""

from __future__ import annotations

import re
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Literal

from deepsynaps_text.schemas import (
    ClinicalTextDocument,
    ClinicalTextMetadata,
    DeidStrategy,
    PhiKind,
    PhiSpan,
    TextSection,
)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def import_clinical_text(
    raw_text: str,
    *,
    patient_ref: str | None,
    encounter_ref: str | None,
    channel: Literal["note", "message", "email", "chat"],
    created_at: datetime | None = None,
    author_role: str | None = None,
) -> ClinicalTextDocument:
    """
    Create a :class:`ClinicalTextDocument` from raw channel text.

    Parameters
    ----------
    raw_text :
        Unstructured clinical or communication text.
    patient_ref, encounter_ref :
        Opaque identifiers only — never log raw PHI here.
    channel :
        note | message | email | chat
    created_at :
        Source timestamp when known.
    author_role :
        Optional producer role string.
    """
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    meta = ClinicalTextMetadata(
        patient_ref=patient_ref,
        encounter_ref=encounter_ref,
        channel=channel,
        created_at=created_at,
        author_role=author_role,
        ingested_at=now,
    )
    return ClinicalTextDocument(
        id=doc_id,
        raw_text=raw_text,
        deidentified_text=None,
        normalized_text=None,
        sections=[],
        metadata=meta,
    )


def deidentify_text(
    doc: ClinicalTextDocument,
    *,
    strategy: Literal["mask", "remove"] = "mask",
    backend: DeidBackend | None = None,
) -> ClinicalTextDocument:
    """
    Apply de-identification to ``doc.raw_text`` and set ``deidentified_text``.

    Does not alter ``raw_text``. Clears ``normalized_text`` and ``sections``
    so callers re-run :func:`normalize_note_format` after de-id.
    """
    impl = backend if backend is not None else RegexDeidBackend()
    new_text, _spans = impl.deidentify(doc.raw_text, strategy=strategy)
    return doc.model_copy(
        update={
            "deidentified_text": new_text,
            "normalized_text": None,
            "sections": [],
        }
    )


def normalize_note_format(doc: ClinicalTextDocument) -> ClinicalTextDocument:
    """
    Collapse whitespace and detect common section headers (notes).

    Operates on ``deidentified_text`` when present, otherwise ``raw_text``.
    """
    source = doc.deidentified_text if doc.deidentified_text is not None else doc.raw_text
    collapsed, sections = build_note_sections_from_text(source)
    return doc.model_copy(update={"normalized_text": collapsed, "sections": sections})


def build_note_sections_from_text(text: str) -> tuple[str, list[TextSection]]:
    """
    Collapse whitespace and split into headed sections (same rules as :func:`normalize_note_format`).

    Public helper for :mod:`deepsynaps_text.core_nlp` and other callers that need sections
    without mutating a :class:`~deepsynaps_text.schemas.ClinicalTextDocument`.
    """
    collapsed = _collapse_whitespace(text)
    return collapsed, _split_into_sections(collapsed)


# ---------------------------------------------------------------------------
# De-identification backends
# ---------------------------------------------------------------------------


class DeidBackend(ABC):
    """Pluggable de-identification (regex baseline today; ML models later)."""

    @abstractmethod
    def deidentify(
        self,
        text: str,
        *,
        strategy: DeidStrategy,
    ) -> tuple[str, list[PhiSpan]]:
        """Return redacted text and spans (offsets refer to *original* ``text``)."""


class RegexDeidBackend(DeidBackend):
    """
    Heuristic PHI detection: emails, phones, MRNs, dates, SSN-like patterns,
    URLs, and a few name-line patterns. Not exhaustive — swap for ML backend in prod.
    """

    _EMAIL = re.compile(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        re.IGNORECASE,
    )
    _URL = re.compile(r"\bhttps?://[^\s<>\"']+", re.IGNORECASE)
    _PHONE = re.compile(
        r"(?<!\d)(\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?!\d)",
    )
    _MRN = re.compile(
        r"\b(?:MRN|medical\s+record|record\s*#)\s*[:#]?\s*(\d{4,12})\b",
        re.IGNORECASE,
    )
    _MRN_BARE = re.compile(r"\b(?:MRN|record)\s*#?\s*\d{4,12}\b", re.IGNORECASE)
    _SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
    _DATE_NUM = re.compile(
        r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b",
    )
    _DATE_LONG = re.compile(
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b",
        re.IGNORECASE,
    )
    _PATIENT_NAME_LINE = re.compile(
        r"(?im)^\s*(?:Patient|Pt|Subject)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*$",
    )
    _DOB_LINE = re.compile(
        r"(?im)^\s*(?:DOB|D\.O\.B\.|Date\s+of\s+birth)\s*:\s*[^\n\r]+$",
    )

    def deidentify(
        self,
        text: str,
        *,
        strategy: DeidStrategy,
    ) -> tuple[str, list[PhiSpan]]:
        spans: list[tuple[int, int, PhiKind]] = []

        def add_span(start: int, end: int, phi_type: PhiKind) -> None:
            spans.append((start, end, phi_type))

        for m in self._EMAIL.finditer(text):
            add_span(m.start(), m.end(), "email")
        for m in self._URL.finditer(text):
            add_span(m.start(), m.end(), "url")
        for m in self._PHONE.finditer(text):
            add_span(m.start(), m.end(), "phone")
        for m in self._MRN.finditer(text):
            add_span(m.start(), m.end(), "mrn")
        for m in self._MRN_BARE.finditer(text):
            add_span(m.start(), m.end(), "mrn")
        for m in self._SSN.finditer(text):
            add_span(m.start(), m.end(), "ssn")
        for m in self._DATE_NUM.finditer(text):
            add_span(m.start(), m.end(), "date")
        for m in self._DATE_LONG.finditer(text):
            add_span(m.start(), m.end(), "date")
        for m in self._PATIENT_NAME_LINE.finditer(text):
            line_start = m.start()
            line_end = text.find("\n", m.end())
            if line_end == -1:
                line_end = len(text)
            add_span(line_start, line_end, "name")
        for m in self._DOB_LINE.finditer(text):
            add_span(m.start(), m.end(), "date")

        merged = _merge_overlapping_spans(spans)
        phi_records: list[PhiSpan] = []
        pieces: list[str] = []
        pos = 0
        for start, end, phi_type in merged:
            if start > pos:
                pieces.append(text[pos:start])
            repl = _replacement_for(phi_type, strategy)
            phi_records.append(
                PhiSpan(
                    start=start,
                    end=end,
                    phi_type=phi_type,
                    replacement=repl,
                )
            )
            pieces.append(repl)
            pos = end
        if pos < len(text):
            pieces.append(text[pos:])
        return "".join(pieces), phi_records


def _replacement_for(phi_type: PhiKind, strategy: DeidStrategy) -> str:
    if strategy == "remove":
        return ""
    labels = {
        "email": "[EMAIL]",
        "phone": "[PHONE]",
        "mrn": "[MRN]",
        "date": "[DATE]",
        "ssn": "[ID]",
        "name": "[NAME]",
        "url": "[URL]",
        "other": "[REDACTED]",
    }
    return labels.get(phi_type, "[REDACTED]")


def _merge_overlapping_spans(
    spans: list[tuple[int, int, PhiKind]],
) -> list[tuple[int, int, PhiKind]]:
    if not spans:
        return []
    spans_sorted = sorted(spans, key=lambda x: (x[0], -x[1]))
    merged: list[tuple[int, int, PhiKind]] = []
    cur_s, cur_e, cur_t = spans_sorted[0]
    for s, e, t in spans_sorted[1:]:
        if s <= cur_e:
            cur_e = max(cur_e, e)
        else:
            merged.append((cur_s, cur_e, cur_t))
            cur_s, cur_e, cur_t = s, e, t
    merged.append((cur_s, cur_e, cur_t))
    return merged


def _collapse_whitespace(text: str) -> str:
    lines = text.splitlines()
    stripped_lines: list[str] = []
    for line in lines:
        inner = re.sub(r"[ \t]+", " ", line.strip())
        stripped_lines.append(inner)
    out_lines: list[str] = []
    blank_run = False
    for ln in stripped_lines:
        if not ln:
            if not blank_run and out_lines:
                out_lines.append("")
            blank_run = True
            continue
        blank_run = False
        out_lines.append(ln)
    return "\n".join(out_lines).strip()


# Known first-pass section headers (case-insensitive). Earlier patterns win per line.
_SECTION_HEADER_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^(History of present illness|HPI)\s*:?\s*$", re.I), "HPI"),
    (re.compile(r"^(Past medical history|PMH)\s*:?\s*$", re.I), "PMH"),
    (re.compile(r"^(Medications|MEDS|MEDICATIONS)\s*:?\s*$", re.I), "MEDICATIONS"),
    (re.compile(r"^(Allergies|ALL)\s*:?\s*$", re.I), "ALLERGIES"),
    (re.compile(r"^(Physical exam|PE|Exam)\s*:?\s*$", re.I), "EXAM"),
    (re.compile(r"^(Assessment|A\/P|A&P)\s*:?\s*$", re.I), "ASSESSMENT"),
    (re.compile(r"^(Plan|PLAN)\s*:?\s*$", re.I), "PLAN"),
    (re.compile(r"^(Impression)\s*:?\s*$", re.I), "IMPRESSION"),
    (re.compile(r"^(ROS|Review of systems)\s*:?\s*$", re.I), "ROS"),
]


def _split_into_sections(collapsed_text: str) -> list[TextSection]:
    """Split normalized note into sections when whole lines match header patterns."""
    if not collapsed_text:
        return []
    lines = collapsed_text.split("\n")
    line_starts: list[int] = []
    offset = 0
    for i, ln in enumerate(lines):
        line_starts.append(offset)
        offset += len(ln) + (1 if i < len(lines) - 1 else 0)

    header_at: dict[int, str] = {}
    for i, line in enumerate(lines):
        for pat, label in _SECTION_HEADER_PATTERNS:
            if pat.match(line):
                header_at[i] = label
                break

    if not header_at:
        return [
            TextSection(
                label="BODY",
                start_char=0,
                end_char=len(collapsed_text),
                body=collapsed_text,
            )
        ]

    ordered = sorted(header_at)
    result: list[TextSection] = []

    first = ordered[0]
    if first > 0:
        pre_lines = lines[:first]
        pre_body = "\n".join(pre_lines).strip()
        if pre_body:
            pre_end = max(line_starts[first] - 1, 0)
            result.append(
                TextSection(
                    label="PREAMBLE",
                    start_char=0,
                    end_char=pre_end,
                    body=pre_body,
                )
            )

    for idx, line_idx in enumerate(ordered):
        label = header_at[line_idx]
        next_header_line = ordered[idx + 1] if idx + 1 < len(ordered) else len(lines)
        body_start_line = line_idx + 1
        if body_start_line >= next_header_line:
            continue
        body_lines = lines[body_start_line:next_header_line]
        body = "\n".join(body_lines).strip()
        if not body:
            continue
        start_char = line_starts[body_start_line]
        end_line_idx = next_header_line - 1
        end_char = line_starts[end_line_idx] + len(lines[end_line_idx])
        result.append(
            TextSection(
                label=label,
                start_char=start_char,
                end_char=end_char,
                body=body,
            )
        )
    return result

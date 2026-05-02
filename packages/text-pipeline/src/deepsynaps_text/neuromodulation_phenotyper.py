"""
Neuromodulation phenotyping from clinical entities and free text (rule-based MVP).

Outputs are **assistive** structured views — not device programming or safety decisions.
"""

from __future__ import annotations

import re
from typing import Union

from deepsynaps_text.schemas import (
    CodedEntityExtractionResult,
    ClinicalEntity,
    ClinicalEntityExtractionResult,
    ModalityName,
    NeuromodulationHistory,
    NeuromodulationParameters,
    NeuromodulationRiskProfile,
    NeuromodulationTherapyLine,
)

EntityResult = Union[ClinicalEntityExtractionResult, CodedEntityExtractionResult]

# Modality token -> canonical
_MODALITY_PATTERNS: list[tuple[re.Pattern[str], ModalityName | str]] = [
    (re.compile(r"\brTMS\b", re.I), "rTMS"),
    (re.compile(r"(?<![A-Za-z])TMS(?![A-Za-z])", re.I), "TMS"),
    (re.compile(r"\btDCS\b", re.I), "tDCS"),
    (re.compile(r"\btACS\b", re.I), "tACS"),
    (re.compile(r"\bTPS\b", re.I), "TPS"),
    (re.compile(r"\bDBS\b", re.I), "DBS"),
    (re.compile(r"\bVNS\b", re.I), "VNS"),
    (re.compile(r"\bSNS\b", re.I), "SNS"),
    (re.compile(r"\bECT\b", re.I), "ECT"),
]

_TARGET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(?:left|right|bilateral)\s+DLPFC\b", re.I),
    re.compile(r"\bDLPFC\b", re.I),
    re.compile(r"\bSTN\b", re.I),
    re.compile(r"\bGPi\b", re.I),
    re.compile(r"\bGPe\b", re.I),
    re.compile(r"\bM1\b", re.I),
    re.compile(r"\bsubgenual\s+cingulate\b", re.I),
    re.compile(r"\bmotor\s+cortex\b", re.I),
    re.compile(r"\bSMA\b", re.I),
    re.compile(r"\bVIM\b", re.I),
    re.compile(r"\bNAc\b", re.I),
    re.compile(r"\bvmPFC\b", re.I),
]

_SESSION_RE = re.compile(
    r"(?P<n>\d+)\s*(?:sessions?|treatments?|visits?)\b",
    re.I,
)
_DATE_RE = re.compile(
    r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b|\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b",
)
_MT_RE = re.compile(
    r"(?P<pct>\d{1,3}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:MT|RMT|motor\s+threshold)\b",
    re.I,
)
_FREQ_RE = re.compile(
    r"(?P<hz>\d{1,2}(?:\.\d+)?)\s*Hz\b",
    re.I,
)
_TRAIN_MS_RE = re.compile(
    r"(?P<ms>\d{2,4})\s*(?:ms|msec)\s*(?:train|pulse\s+train)?",
    re.I,
)


def _norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def _entities(result: EntityResult) -> list[ClinicalEntity]:
    return list(result.entities)


def _text(result: EntityResult) -> str:
    return result.source_text


def _negated_before(text: str, idx: int, width: int = 80) -> bool:
    window = text[max(0, idx - width) : idx].lower()
    return bool(
        re.search(
            r"\b(no|denies|without|negative for|absence of|ruled out|free of)\b",
            window,
        )
    )


def _collect_modalities(text: str) -> list[str]:
    seen: list[str] = []
    for pat, name in _MODALITY_PATTERNS:
        if pat.search(text):
            if name not in seen:
                seen.append(str(name))
    return seen


def _collect_targets(text: str) -> list[str]:
    seen: list[str] = []
    for pat in _TARGET_PATTERNS:
        for m in pat.finditer(text):
            t = _norm_ws(m.group(0))
            if t and t not in seen:
                seen.append(t)
    return seen


def _response_from_text(snippet: str) -> ResponseCategory:
    s = snippet.lower()
    if re.search(r"\bpartial\s+response\b|\bpartial\s+responder\b", s):
        return "partial"
    if re.search(r"\bno\s+response\b|\bnon[- ]?responder\b|\bno\s+benefit\b|\bfailed\b", s):
        return "none"
    if re.search(r"\b(?:complete|full)\s+response\b|\bremission\b|\bimproved\b|\bresolved\b", s):
        return "improved"
    if re.search(
        r"\bresponse\b",
        s,
    ) and "partial" not in s and "no response" not in s:
        return "improved"
    if re.search(r"\bpartial\b", s):
        return "partial"
    return "unknown"


def extract_neuromodulation_history(result: EntityResult) -> NeuromodulationHistory:
    """Infer therapy lines from neuromodulation entities and document-level patterns."""
    doc_id = result.document_id
    text = _text(result)
    modalities_seen = _collect_modalities(text)
    targets_seen = _collect_targets(text)

    therapies: list[NeuromodulationTherapyLine] = []

    # Sentence / clause chunks for response + session bundling
    chunks = re.split(r"(?<=[.!?])\s+|\n+", text)
    for chunk in chunks:
        c = chunk.strip()
        if not c:
            continue
        low = c.lower()
        if not any(k in low for k in ("tms", "tdcs", "tacs", "dbs", "vns", "sns", "ect", "tps")):
            continue
        line_modal: ModalityName | str | None = None
        for pat, name in _MODALITY_PATTERNS:
            m = pat.search(c)
            if m:
                line_modal = name
                break
        if line_modal is None:
            continue
        chunk_targets: list[str] = []
        for pat in _TARGET_PATTERNS:
            for m in pat.finditer(c):
                t = _norm_ws(m.group(0))
                if t and t not in chunk_targets:
                    chunk_targets.append(t)
        sess_m = _SESSION_RE.search(c)
        sessions = int(sess_m.group("n")) if sess_m else None
        resp = _response_from_text(c)
        date_m = _DATE_RE.search(c)
        start_date = date_m.group(0) if date_m else None
        therapies.append(
            NeuromodulationTherapyLine(
                modality=line_modal,
                targets=chunk_targets,
                session_count=sessions,
                start_date=start_date,
                stop_date=None,
                response=resp,
                source_snippet=c[:240] if len(c) > 240 else c,
            )
        )

    # Neuromodulation entities as extra therapy mentions
    for ent in _entities(result):
        if ent.entity_type != "neuromodulation":
            continue
        surface = ent.span.text.strip()
        mod: ModalityName | str = "other"
        up = surface.upper()
        for pat, name in _MODALITY_PATTERNS:
            if pat.search(surface):
                mod = name
                break
        if mod == "other":
            if "DBS" in up:
                mod = "DBS"
            elif "TMS" in up or "RTMS" in up:
                mod = "rTMS" if "r" in surface.lower() else "TMS"
        idx = ent.span.start
        ctx_start = max(0, idx - 120)
        ctx_end = min(len(text), ent.span.end + 120)
        ctx = text[ctx_start:ctx_end]
        resp = _response_from_text(ctx)
        therapies.append(
            NeuromodulationTherapyLine(
                modality=mod,
                targets=_collect_targets(ctx),
                session_count=None,
                start_date=None,
                stop_date=None,
                response=resp,
                source_snippet=surface[:120],
            )
        )

    return NeuromodulationHistory(
        document_id=doc_id,
        therapies=therapies,
        modalities_seen=modalities_seen,
        targets_seen=targets_seen,
    )


def extract_stimulation_parameters(result: EntityResult) -> NeuromodulationParameters:
    """Extract numeric stimulation parameters from full text (regex baseline)."""
    text = _text(result)
    doc_id = result.document_id

    intensity = None
    m_mt = _MT_RE.search(text)
    if m_mt:
        try:
            intensity = float(m_mt.group("pct"))
        except ValueError:
            intensity = None

    freq = None
    m_f = _FREQ_RE.search(text)
    if m_f:
        try:
            freq = float(m_f.group("hz"))
        except ValueError:
            freq = None

    train_ms = None
    m_tr = _TRAIN_MS_RE.search(text)
    if m_tr:
        try:
            train_ms = float(m_tr.group("ms"))
        except ValueError:
            train_ms = None

    sessions = None
    m_s = _SESSION_RE.search(text)
    if m_s:
        try:
            sessions = int(m_s.group("n"))
        except ValueError:
            sessions = None

    coil = None
    m_coil = re.search(
        r"\b(?:figure[- ]?8|H[- ]?coil|coil)\s*(?:over|at|on)?\s*([^.;\n]{4,60})",
        text,
        re.I,
    )
    if m_coil:
        coil = _norm_ws(m_coil.group(0))
    # Prefer stimulation target near TMS/rTMS over DBS target when both exist
    if coil is None or ("DBS" in (coil or "") and re.search(r"\brTMS\b|TMS", text)):
        tms_pos = None
        for m in re.finditer(r"\brTMS\b|(?<![A-Za-z])TMS(?![A-Za-z])", text, re.I):
            tms_pos = m.start()
            break
        if tms_pos is not None:
            best: tuple[int, str] | None = None
            for pat in _TARGET_PATTERNS:
                for mt in pat.finditer(text):
                    d = abs(mt.start() - tms_pos)
                    lab = _norm_ws(mt.group(0))
                    if "STN" in lab or "GPi" in lab:
                        continue
                    if best is None or d < best[0]:
                        best = (d, lab)
            if best:
                coil = best[1]
    if coil is None:
        m_lead = re.search(
            r"\bDBS\s+(?:lead|in|target(?:ing)?)\s+([A-Za-z0-9\s]{2,40})",
            text,
            re.I,
        )
        if m_lead:
            coil = _norm_ws(m_lead.group(0))
    if coil is None:
        for pat in _TARGET_PATTERNS:
            mt = pat.search(text)
            if mt:
                coil = _norm_ws(mt.group(0))
                break

    return NeuromodulationParameters(
        document_id=doc_id,
        intensity_percent_mt=intensity,
        frequency_hz=freq,
        train_length_ms=train_ms,
        coil_or_lead_location=coil,
        session_count=sessions,
    )


def extract_neuromodulation_risks_and_contraindications(
    result: EntityResult,
) -> NeuromodulationRiskProfile:
    """Keyword rules for common TMS / device relative contraindications (MVP)."""
    text = _text(result)
    doc_id = result.document_id
    notes: list[str] = []

    def triplet(pat: re.Pattern[str]) -> bool | None:
        m = pat.search(text)
        if not m:
            return None
        if _negated_before(text, m.start()):
            return False
        return True

    seizure: bool | None = None
    if re.search(r"\bno\s+seizures?\b", text, re.I):
        seizure = False
        notes.append("seizure_negated_phrase")
    else:
        seiz_m = re.search(r"\b(seizure|seizures|epilepsy|convulsion)\b", text, re.I)
        if seiz_m:
            if _negated_before(text, seiz_m.start(), width=96):
                seizure = False
                notes.append("seizure_negated")
            else:
                seizure = True
                notes.append("seizure_mention")

    implant_kw = triplet(
        re.compile(
            r"\b(?:metallic\s+implant|pacemaker|ICD|cochlear|aneurysm\s+clip|"

            r"metal(?:lic)?\s+in\s+(?:the\s+)?body)\b",
            re.I,
        )
    )
    dbs_m = re.search(
        r"\b(?:has|had|with)\s+DBS\b|\bDBS\s+in\b|\bDBS\s+(?:implant|lead|generator)\b",
        text,
        re.I,
    )
    dbs_negated = re.search(r"\b(?:no|without|denies)\s+DBS\b", text, re.I)
    dbs_positive = bool(dbs_m and not dbs_negated)
    metallic: bool | None
    if dbs_positive:
        metallic = True
        notes.append("dbs_implant_mention")
    elif implant_kw is True:
        metallic = True
        notes.append("metallic_implant_mention")
    elif implant_kw is False:
        metallic = False
    else:
        metallic = None

    preg = triplet(re.compile(r"\b(?:pregnant|pregnancy|gravida)\b", re.I))
    if preg:
        notes.append("pregnancy_mention")

    suicidal = triplet(
        re.compile(
            r"\b(?:suicidal|suicide\s+attempt|active\s+SI|SI\b|"

            r"suicidal\s+ideation)\b",
            re.I,
        )
    )
    if suicidal:
        notes.append("suicidality_mention")

    unstable = triplet(
        re.compile(
            r"\b(?:unstable\s+angina|hemodynamically\s+unstable|acute\s+instability|"

            r"unstable\s+medical)\b",
            re.I,
        )
    )
    if unstable:
        notes.append("unstable_medical_mention")

    return NeuromodulationRiskProfile(
        document_id=doc_id,
        seizure_history=seizure,
        metallic_implants=metallic,
        pregnancy=preg,
        suicidality=suicidal,
        unstable_medical_condition=unstable,
        notes=sorted(set(notes)),
    )

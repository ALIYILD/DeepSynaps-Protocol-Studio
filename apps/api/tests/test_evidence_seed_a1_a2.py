"""Tests for the evidence indications seed — A1 + A2 additions (t_013ee166).

Verifies that:
1. tdcs_asd is present in SEED with correct grade/regulatory (A1)
2. tps_chronic_pain is present in SEED with correct grade/regulatory (A2)
3. Both new indications carry honest regulatory notes (no FDA clearance claimed)
4. Neither slug is erroneously marked Grade A or B (both are investigational)
5. EVIDENCE_TOTAL_TRIALS constant in evidence-dataset.js has been corrected (A3)

These tests import the seed module directly — no DB required.
"""
from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[3] / "services" / "evidence-pipeline"
if str(PIPELINE) not in sys.path:
    sys.path.insert(0, str(PIPELINE))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed():
    """Import the seed module fresh (avoids cached state between tests)."""
    if "indications_seed" in sys.modules:
        return sys.modules["indications_seed"]
    return importlib.import_module("indications_seed")


def _find(slug: str) -> dict | None:
    """Return the SEED entry matching slug, or None."""
    seed = _seed()
    for entry in seed.SEED:
        if entry.get("slug") == slug:
            return entry
    return None


# ---------------------------------------------------------------------------
# A1: tdcs_asd
# ---------------------------------------------------------------------------

def test_tdcs_asd_present_in_seed() -> None:
    """tdcs_asd slug exists in SEED (A1)."""
    entry = _find("tdcs_asd")
    assert entry is not None, "tdcs_asd not found in SEED — A1 task incomplete"


def test_tdcs_asd_grade_is_c() -> None:
    """tdcs_asd evidence grade must be C (investigational, not A/B)."""
    entry = _find("tdcs_asd")
    assert entry is not None
    assert entry.get("grade") in ("C", "c"), (
        f"tdcs_asd grade should be C (investigational), got {entry.get('grade')!r}"
    )


def test_tdcs_asd_modality_is_tdcs() -> None:
    entry = _find("tdcs_asd")
    assert entry is not None
    assert entry.get("modality") == "tDCS", (
        f"tdcs_asd modality should be tDCS, got {entry.get('modality')!r}"
    )


def test_tdcs_asd_regulatory_says_no_fda() -> None:
    """Regulatory note must NOT claim FDA clearance for ASD tDCS."""
    entry = _find("tdcs_asd")
    assert entry is not None
    reg = entry.get("regulatory", "")
    # Must mention 'No FDA' or 'no FDA' or 'Investigational'
    assert re.search(r"No FDA|Investigational", reg, re.IGNORECASE), (
        f"tdcs_asd regulatory note must state no FDA clearance, got: {reg!r}"
    )
    # Must NOT claim 'FDA-approved' or 'FDA-cleared' for ASD
    assert not re.search(r"FDA-(approved|cleared)", reg, re.IGNORECASE), (
        f"tdcs_asd regulatory note must not claim FDA approval, got: {reg!r}"
    )


def test_tdcs_asd_has_pubmed_query() -> None:
    entry = _find("tdcs_asd")
    assert entry is not None
    assert entry.get("pubmed_q"), "tdcs_asd must have a pubmed_q query string"
    # Must mention autism in the query
    assert "autism" in entry["pubmed_q"].lower() or "ASD" in entry["pubmed_q"], (
        "tdcs_asd pubmed_q must include autism or ASD keyword"
    )


# ---------------------------------------------------------------------------
# A2: tps_chronic_pain
# ---------------------------------------------------------------------------

def test_tps_chronic_pain_present_in_seed() -> None:
    """tps_chronic_pain slug exists in SEED (A2)."""
    entry = _find("tps_chronic_pain")
    assert entry is not None, "tps_chronic_pain not found in SEED — A2 task incomplete"


def test_tps_chronic_pain_grade_is_d() -> None:
    """tps_chronic_pain evidence grade must be D (experimental)."""
    entry = _find("tps_chronic_pain")
    assert entry is not None
    assert entry.get("grade") in ("D", "d"), (
        f"tps_chronic_pain grade should be D (experimental), got {entry.get('grade')!r}"
    )


def test_tps_chronic_pain_modality_is_tps() -> None:
    entry = _find("tps_chronic_pain")
    assert entry is not None
    assert entry.get("modality") == "TPS", (
        f"tps_chronic_pain modality should be TPS, got {entry.get('modality')!r}"
    )


def test_tps_chronic_pain_regulatory_says_no_fda() -> None:
    """Regulatory note must NOT claim FDA clearance for TPS chronic pain."""
    entry = _find("tps_chronic_pain")
    assert entry is not None
    reg = entry.get("regulatory", "")
    assert re.search(r"No FDA|Investigational|Experimental", reg, re.IGNORECASE), (
        f"tps_chronic_pain regulatory note must state no FDA clearance, got: {reg!r}"
    )
    assert not re.search(r"FDA-(approved|cleared)", reg, re.IGNORECASE), (
        f"tps_chronic_pain regulatory note must not claim FDA approval, got: {reg!r}"
    )


def test_tps_chronic_pain_regulatory_mentions_alzheimers_only_clearance() -> None:
    """Regulatory note should clarify that CE clearance is for Alzheimer's, not pain."""
    entry = _find("tps_chronic_pain")
    assert entry is not None
    reg = entry.get("regulatory", "")
    # Should mention Alzheimer's to make it clear what IS cleared vs what's claimed
    assert re.search(r"Alzheimer", reg, re.IGNORECASE), (
        f"tps_chronic_pain regulatory note should clarify Alzheimer's-only CE marking, got: {reg!r}"
    )


def test_tps_chronic_pain_has_pubmed_query() -> None:
    entry = _find("tps_chronic_pain")
    assert entry is not None
    assert entry.get("pubmed_q"), "tps_chronic_pain must have a pubmed_q query string"
    assert "pain" in entry["pubmed_q"].lower(), (
        "tps_chronic_pain pubmed_q must include 'pain' keyword"
    )


# ---------------------------------------------------------------------------
# A3: EVIDENCE_TOTAL_TRIALS constant correction
# ---------------------------------------------------------------------------

def test_evidence_total_trials_constant_corrected() -> None:
    """EVIDENCE_TOTAL_TRIALS in evidence-dataset.js must equal 1409 (v4 DB count)."""
    dataset_js = (
        Path(__file__).resolve().parents[3]
        / "apps" / "web" / "src" / "evidence-dataset.js"
    )
    assert dataset_js.exists(), f"evidence-dataset.js not found at {dataset_js}"
    content = dataset_js.read_text(encoding="utf-8")
    # Extract the numeric value
    match = re.search(r"EVIDENCE_TOTAL_TRIALS\s*=\s*(\d+)", content)
    assert match, "EVIDENCE_TOTAL_TRIALS constant not found in evidence-dataset.js"
    value = int(match.group(1))
    assert value == 1409, (
        f"EVIDENCE_TOTAL_TRIALS should be 1409 (v4 DB count), got {value}. "
        "The old value of 12840 was an orientation estimate — update A3."
    )


# ---------------------------------------------------------------------------
# Regression: no indication should fabricate Grade A without regulatory basis
# ---------------------------------------------------------------------------

GRADE_A_REQUIRES_CLEARANCE_RE = re.compile(
    r"FDA-approved|CE-marked|CE Marked|FDA-cleared",
    re.IGNORECASE,
)


def test_all_grade_a_indications_have_regulatory_basis() -> None:
    """Every Grade-A indication in SEED must cite a real regulatory basis."""
    seed = _seed()
    for entry in seed.SEED:
        if entry.get("grade") in ("A", "a"):
            reg = entry.get("regulatory", "")
            assert GRADE_A_REQUIRES_CLEARANCE_RE.search(reg), (
                f"Indication {entry['slug']!r} is Grade A but regulatory note "
                f"doesn't mention FDA approval or CE marking: {reg!r}"
            )

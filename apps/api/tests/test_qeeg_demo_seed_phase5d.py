"""Phase 5d — demo-seed brain-map payload tests.

Verifies that the seed_demo helper produces a QEEGBrainMapReport-shaped
payload that the Phase 1 frontend renderer + Phase 2 PDF export can both
consume without modification.
"""
from __future__ import annotations

import json
import re

from scripts.seed_demo import _demo_brain_map_payload


def test_demo_payload_has_all_contract_sections():
    p = _demo_brain_map_payload("Demo Patient", 40.5, "2026-04-23")
    for section in (
        "header",
        "indicators",
        "brain_function_score",
        "lobe_summary",
        "source_map",
        "dk_atlas",
        "ai_narrative",
        "quality",
        "provenance",
        "disclaimer",
    ):
        assert section in p, f"section {section!r} missing from demo payload"


def test_demo_payload_dk_atlas_has_paired_hemispheres():
    p = _demo_brain_map_payload("X", 30.0, "2026-04-01")
    rois = {row["roi"] for row in p["dk_atlas"]}
    assert rois, "dk_atlas should not be empty"
    for roi in rois:
        hemis = [row["hemisphere"] for row in p["dk_atlas"] if row["roi"] == roi]
        assert set(hemis) == {"lh", "rh"}, f"{roi} missing a hemisphere ({hemis})"


def test_demo_payload_indicators_have_canonical_units():
    p = _demo_brain_map_payload("X", 30.0, "2026-04-01")
    ind = p["indicators"]
    assert ind["tbr"]["unit"] == "ratio"
    assert ind["occipital_paf"]["unit"] == "Hz"
    assert ind["alpha_reactivity"]["unit"] == "EO/EC"
    assert ind["ai_brain_age"]["unit"] == "years"


def test_demo_payload_disclaimer_is_research_use_only():
    p = _demo_brain_map_payload("X", 30.0, "2026-04-01")
    disc = p["disclaimer"].lower()
    assert "research" in disc or "wellness" in disc
    assert "not a medical diagnosis" in disc
    # No banned terms outside the regulatory disclaimer phrase
    stripped = re.sub(r"not a medical diagnosis or treatment recommendation", "", disc)
    assert "diagnosis" not in stripped
    assert "diagnostic" not in stripped


def test_demo_payload_serializes_to_json():
    p = _demo_brain_map_payload("X", 30.0, "2026-04-01")
    text = json.dumps(p)
    rehydrated = json.loads(text)
    assert rehydrated["header"]["client_name"] == "X"
    assert len(rehydrated["dk_atlas"]) == len(p["dk_atlas"])


def test_demo_payload_provenance_marks_as_demo():
    p = _demo_brain_map_payload("X", 30.0, "2026-04-01")
    prov = p["provenance"]
    assert "demo" in prov["pipeline_version"].lower()
    # Limitations explicitly call out the synthetic origin so reviewers
    # don't mistake the seed for a real recording.
    lim = " ".join(p["quality"]["limitations"]).lower()
    assert "demo" in lim or "synthetic" in lim

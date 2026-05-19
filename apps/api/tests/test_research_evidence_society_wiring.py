from __future__ import annotations

from pathlib import Path


def _read_page() -> str:
    return Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "pages-research-evidence.js"


def test_research_evidence_page_wires_society_resources_contextually() -> None:
    src = _read_page().read_text(encoding="utf-8")
    assert "societyResourceSources" in src
    assert "Neuroscience society resources" in src
    assert "structured search unavailable in this build" in src.lower()
    assert "links are catalogued for awareness only" in src.lower()
    assert "conference abstracts and society pages are not primary peer-reviewed evidence" in src.lower()

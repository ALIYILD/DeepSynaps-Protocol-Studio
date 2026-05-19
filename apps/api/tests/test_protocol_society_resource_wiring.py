from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_protocol_studio_page_exposes_society_resource_state() -> None:
    src = (REPO_ROOT / "apps" / "web" / "src" / "pages-clinical-hubs.js").read_text(encoding="utf-8")
    assert "societyResources" in src
    assert "societyLifecycle" in src
    assert "_fetchSocietyResources" in src
    assert "_renderSocietyResourcesPanel" in src
    assert "protocol-society-resources-panel" in src
    assert "Contextual links only. No fake abstracts" in src
    assert "patient resources are not clinician guidelines" in src.lower()
    assert "guideline-awareness" in src
    assert "structured search is exposed in this build" in src.lower()


def test_protocol_api_client_has_society_resource_methods() -> None:
    src = (REPO_ROOT / "apps" / "web" / "src" / "studio" / "protocol" / "protocolApi.ts").read_text(encoding="utf-8")
    assert "fetchSocietyResourceSources" in src
    assert "searchSocietyResources" in src

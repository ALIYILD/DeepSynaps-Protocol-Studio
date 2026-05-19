from pathlib import Path


REPO = Path("/Users/aliyildirim/DeepSynaps-Protocol-Studio")


def _read(rel: str) -> str:
    return (REPO / rel).read_text(encoding="utf-8")


def test_protocol_studio_and_device_planning_reference_standards_helpers() -> None:
    hubs = _read("apps/web/src/pages-clinical-hubs.js")
    devices = _read("apps/web/src/pages-device-planning.js")
    api_js = _read("apps/web/src/api.js")
    main_py = _read("apps/api/app/main.py")

    assert "standards_guidelines_router" in main_py
    assert "renderStandardsGuidelinesReferenceCard" in hubs
    assert "standardsGuidelinesSearch" in hubs
    assert "renderStandardsGuidelinesReferenceCard" in devices
    assert "standardsGuidelinesSources" in api_js
    assert "standardsGuidelinesSearch" in api_js
    assert "Decision support only. Not legal or regulatory advice." in hubs
    assert "MDR-compliant" not in hubs

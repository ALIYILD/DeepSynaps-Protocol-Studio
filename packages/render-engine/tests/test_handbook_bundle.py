"""Handbook bundle DOCX/HTML exports."""

import zipfile
from io import BytesIO

from deepsynaps_core_schema import HandbookDocument

from deepsynaps_render_engine.handbook_bundle import (
    HANDBOOK_AI_ASSISTED_DISCLAIMER,
    render_handbook_bundle_docx,
    render_handbook_bundle_html,
)
from deepsynaps_render_engine.payload import ReportPayload


def test_handbook_bundle_docx_contains_required_safety_disclaimer() -> None:
    doc = HandbookDocument(
        document_type="clinician_handbook",
        title="Test handbook",
        overview="Overview line.",
        eligibility=["e1"],
        setup=["s1"],
        session_workflow=["w1"],
        safety=["safe"],
        troubleshooting=["trouble"],
        escalation=["esc"],
        references=[],
    )
    raw = render_handbook_bundle_docx(
        doc,
        None,
        condition_name="X",
        modality_name="Y",
        device_name="",
        handbook_kind_label="Clinician handbook",
        generated_at="2026-01-01T00:00:00Z",
    )
    assert raw.startswith(b"PK")
    zf = zipfile.ZipFile(BytesIO(raw))
    xml = zf.read("word/document.xml").decode("utf-8")
    assert HANDBOOK_AI_ASSISTED_DISCLAIMER[:40] in xml


def test_handbook_bundle_html_includes_appendix_when_report_present() -> None:
    doc = HandbookDocument(
        document_type="clinician_handbook",
        title="T",
        overview="o",
        eligibility=[],
        setup=[],
        session_workflow=[],
        safety=[],
        troubleshooting=[],
        escalation=[],
        references=[],
    )
    rp = ReportPayload(
        title="Rep",
        summary="sum",
        sections=[],
    )
    html = render_handbook_bundle_html(
        doc,
        rp,
        condition_name="c",
        modality_name="m",
        device_name="",
        handbook_kind_label="Clinician handbook",
    )
    assert "Appendix: Detailed clinical report" in html

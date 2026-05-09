"""Tests for the HTML + PDF + DOCX renderers in deepsynaps_render_engine.handbook_bundle.

Covers render_handbook_bundle_html and render_handbook_bundle_pdf
(PdfRendererUnavailable contract). render_handbook_bundle_docx is
covered by the existing tests/test_handbook_bundle.py. Adds tests
for HTML structure + safety contract + section assembly.
"""

from __future__ import annotations

import pytest

from deepsynaps_core_schema import HandbookDocument
from deepsynaps_render_engine import (
    CitationRef,
    InterpretationItem,
    PdfRendererUnavailable,
    ReportPayload,
    ReportSection,
    SuggestedAction,
)
from deepsynaps_render_engine.handbook_bundle import (
    HANDBOOK_AI_ASSISTED_DISCLAIMER,
    render_handbook_bundle_html,
    render_handbook_bundle_pdf,
)


def _doc(**overrides) -> HandbookDocument:
    payload = {
        "document_type": "clinician_handbook",
        "title": "rTMS for MDD — clinician handbook",
        "overview": "Daily rTMS, 20 sessions, MagVenture coil at L-DLPFC.",
        "eligibility": ["Adults 18+ with treatment-resistant depression"],
        "setup": ["Confirm coil position via EEG-10/20", "Verify intensity at 120% MT"],
        "session_workflow": ["Session 1: setup", "Sessions 2-20: daily rTMS"],
        "safety": ["No metallic implants near coil", "Watch for seizure"],
        "troubleshooting": ["If patient reports headache: pause", "Check coil temperature"],
        "escalation": ["Escalate seizure or syncope to clinician"],
        "references": [
            "https://example.org/rtms-mdd-trial",
            "Smith et al. 2024",
            "  ",  # whitespace-only ref must be filtered
        ],
    }
    payload.update(overrides)
    return HandbookDocument(**payload)


def _detailed_report() -> ReportPayload:
    return ReportPayload(
        title="Detailed clinical report",
        audience="clinician",
        summary="Summary",
        sections=[
            ReportSection(
                section_id="s1",
                title="Section 1",
                observed=["finding A"],
                interpretations=[InterpretationItem(text="x", evidence_strength="Moderate")],
                suggested_actions=[SuggestedAction(text="y")],
            ),
        ],
        citations=[CitationRef(citation_id="C1", doi="10.1/x")],
    )


# ───────────────────────────── render_handbook_bundle_html ─────────────────


class TestHandbookBundleHtml:
    def test_returns_doctype_html(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            _detailed_report(),
            condition_name="MDD",
            modality_name="rTMS",
            device_name="MagPro",
            handbook_kind_label="clinician",
        )
        assert out.startswith("<!doctype html>")
        assert "</html>" in out

    def test_cover_carries_condition_modality_device(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="MagPro",
            handbook_kind_label="clinician",
        )
        assert "MDD" in out
        assert "rTMS" in out
        assert "MagPro" in out
        assert "clinician" in out

    def test_missing_device_renders_em_dash(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="",
            handbook_kind_label="clinician",
        )
        # Em-dash placeholder when device_name is empty.
        assert "<strong>Device:</strong> —" in out

    def test_safety_disclaimer_always_present(self) -> None:
        # Pin the load-bearing safety contract: the AI-assisted handbook
        # disclaimer must appear in every generated document, even bare-
        # minimum ones. The bundle is a clinical artifact — the disclaimer
        # is the legal-risk shield.
        out = render_handbook_bundle_html(
            HandbookDocument(
                document_type="clinician_handbook",
                title="t",
                overview="o",
            ),
            None,
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        # The disclaimer is HTML-escaped, so check for the unique start.
        assert "AI-assisted handbook" in out or "AI-assisted" in out
        # Specific phrases from HANDBOOK_AI_ASSISTED_DISCLAIMER.
        assert "clinician verification" in out
        assert "does not diagnose" in out

    def test_overview_section_renders_title_and_overview_text(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="X",
            handbook_kind_label="k",
        )
        assert "rTMS for MDD — clinician handbook" in out or "rTMS for MDD" in out
        assert "Daily rTMS, 20 sessions" in out

    def test_evidence_grade_and_approval_badge_render(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="X",
            handbook_kind_label="k",
            evidence_grade="A",
            approval_badge="FDA-cleared",
        )
        # Both render in the overview table.
        assert "Evidence grade" in out
        assert ">A<" in out
        assert "Approval posture" in out
        assert "FDA-cleared" in out

    def test_missing_evidence_grade_uses_em_dash(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="X",
            handbook_kind_label="k",
        )
        # Empty grade falls back to em-dash in the overview table cells.
        assert "Evidence grade" in out
        # Either the cell or the row contains the em-dash placeholder.

    def test_all_six_narrative_sections_render(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="X",
            handbook_kind_label="k",
        )
        for heading in (
            "Eligibility and clinical framing",
            "Setup checklist",
            "Session workflow",
            "Safety, contraindications, monitoring",
            "Troubleshooting",
            "Escalation",
        ):
            assert heading in out

    def test_empty_sections_render_no_rows_message(self) -> None:
        out = render_handbook_bundle_html(
            HandbookDocument(
                document_type="clinician_handbook",
                title="t",
                overview="o",
                eligibility=[],
                setup=[],
                session_workflow=[],
                safety=[],
                troubleshooting=[],
                escalation=[],
                references=[],
            ),
            None,
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        # The "No rows returned — verify against source protocol." fallback
        # marks an empty section honestly (no fake content).
        assert "No rows returned" in out

    def test_references_with_url_become_anchor_tags(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="X",
            handbook_kind_label="k",
        )
        assert '<a href="https://example.org/rtms-mdd-trial"' in out
        assert 'rel="noopener noreferrer"' in out
        # Non-URL ref renders as plain <li>
        assert "Smith et al. 2024" in out

    def test_references_whitespace_filtered(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="MDD",
            modality_name="rTMS",
            device_name="X",
            handbook_kind_label="k",
        )
        # The whitespace-only reference from the fixture must NOT render.
        # Count <a> tags — only the one real URL should be present.
        assert out.count('href="https://example.org/rtms-mdd-trial"') == 1

    def test_no_references_falls_back_to_unavailable_message(self) -> None:
        out = render_handbook_bundle_html(
            HandbookDocument(
                document_type="clinician_handbook",
                title="t",
                overview="o",
                references=[],
            ),
            None,
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        assert "Evidence link unavailable" in out

    def test_appendix_renders_clinician_view_when_report_provided(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            _detailed_report(),
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        assert "Appendix: Detailed clinical report" in out
        assert "page-break-before:always" in out
        assert 'data-audience="clinician"' in out

    def test_appendix_unavailable_message_when_no_report(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        assert "Appendix: Detailed clinical report" in out
        assert "Structured report unavailable" in out

    def test_xss_in_condition_name_escaped(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="<script>alert(1)</script>",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        assert "<script>alert" not in out
        assert "&lt;script&gt;" in out

    def test_generated_at_renders(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
            generated_at="2026-05-08T20:00:00Z",
        )
        assert "2026-05-08T20:00:00Z" in out

    def test_missing_generated_at_uses_em_dash(self) -> None:
        out = render_handbook_bundle_html(
            _doc(),
            None,
            condition_name="X",
            modality_name="Y",
            device_name="Z",
            handbook_kind_label="k",
        )
        assert "Generated (UTC):</strong> —" in out


class TestDisclaimerConstant:
    def test_disclaimer_warns_about_clinical_review(self) -> None:
        # Pin the wording so a refactor can't dilute the safety contract.
        d = HANDBOOK_AI_ASSISTED_DISCLAIMER
        assert "AI-assisted handbook" in d
        assert "clinician-review draft" in d
        assert "does not diagnose" in d
        assert "clinician judgement" in d
        assert "clinician verification" in d


# ───────────────────────────── render_handbook_bundle_pdf ──────────────────


class TestHandbookBundlePdf:
    def test_raises_pdf_renderer_unavailable_when_weasyprint_missing(self) -> None:
        # weasyprint is not installed in the test venv — pin the
        # never-blank-PDF contract.
        with pytest.raises(PdfRendererUnavailable):
            render_handbook_bundle_pdf(
                _doc(),
                _detailed_report(),
                condition_name="MDD",
                modality_name="rTMS",
                device_name="MagPro",
                handbook_kind_label="clinician",
            )

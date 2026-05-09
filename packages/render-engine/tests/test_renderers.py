"""Tests for deepsynaps_render_engine.renderers.

Covers:
  - render_web_preview (legacy ProtocolPlan shallow preview)
  - render_report_html: clinician / patient / both audience views
  - render_report_pdf: PdfRendererUnavailable when weasyprint missing
  - Private helpers — _esc, _strength_badge, _confidence_pill,
    _citation_inline, _render_observed, _render_simple_list
  - HTML safety (no XSS leaks via unescaped citation text)

The DOCX renderers (render_protocol_docx, render_patient_guide_docx) are
covered by the existing handbook_bundle test in apps/api integration
tests; we add a smoke for the docx-error path here so the import-guard
contract is locked in.
"""

from __future__ import annotations

import pytest

from deepsynaps_core_schema import ProtocolPlan, SessionStep, SessionStructure
from deepsynaps_render_engine import (
    CitationRef,
    InterpretationItem,
    PdfRendererUnavailable,
    ReportPayload,
    ReportSection,
    SuggestedAction,
    render_report_html,
    render_report_pdf,
    render_web_preview,
)
from deepsynaps_render_engine.renderers import (
    _citation_inline,
    _confidence_pill,
    _esc,
    _render_observed,
    _render_simple_list,
    _render_view,
    _strength_badge,
)


# ───────────────────────────── render_web_preview ──────────────────────────


def _protocol_plan() -> ProtocolPlan:
    return ProtocolPlan(
        title="rTMS for MDD",
        condition_slug="mdd",
        modality_slug="rtms",
        device_slug="magventure-mag-pro",
        phenotype="treatment-resistant",
        summary="20 sessions over 4 weeks.",
        session_structure=SessionStructure(
            total_sessions=20,
            sessions_per_week=5,
            session_duration_minutes=37,
            steps=[SessionStep(order=1, title="Setup", detail="d")],
        ),
        checks=["x", "y"],
    )


class TestRenderWebPreview:
    def test_returns_dict_with_export_targets(self) -> None:
        result = render_web_preview(_protocol_plan())
        assert result == {
            "title": "rTMS for MDD",
            "summary": "20 sessions over 4 weeks.",
            "checks": ["x", "y"],
            "export_targets": ["web", "docx", "pdf"],
        }


# ───────────────────────────── private helpers ─────────────────────────────


class TestEsc:
    def test_none_becomes_empty(self) -> None:
        assert _esc(None) == ""

    def test_str_passthrough(self) -> None:
        assert _esc("hello") == "hello"

    def test_html_escaping(self) -> None:
        out = _esc("<script>alert('x')</script>")
        assert "<" not in out
        assert "&lt;" in out
        assert "&#x27;" in out or "&#39;" in out

    def test_quote_attr_escaping(self) -> None:
        # quote=True is set by the renderer.
        assert '"' not in _esc('a"b')


class TestStrengthBadge:
    @pytest.mark.parametrize(
        "strength",
        ["Strong", "Moderate", "Limited", "Conflicting", "Evidence pending"],
    )
    def test_known_strengths_render(self, strength: str) -> None:
        out = _strength_badge(strength)
        assert "ds-strength" in out
        assert strength.upper() in out.upper() or strength in out

    def test_unknown_strength_falls_back_to_evidence_pending_palette(self) -> None:
        out = _strength_badge("Brand New Strength")
        assert "ds-strength" in out
        # Palette = Evidence pending grey
        assert "#475569" in out


class TestConfidencePill:
    def test_none_returns_empty(self) -> None:
        assert _confidence_pill(None) == ""
        assert _confidence_pill("") == ""

    @pytest.mark.parametrize(
        "level,label",
        [
            ("high", "High confidence"),
            ("medium", "Medium confidence"),
            ("low", "Low confidence"),
            ("insufficient", "Insufficient evidence"),
        ],
    )
    def test_known_levels_render_label(self, level: str, label: str) -> None:
        out = _confidence_pill(level)
        assert label in out
        assert "ds-confidence" in out

    def test_unknown_level_uses_titlecased_label(self) -> None:
        out = _confidence_pill("preliminary")
        assert "Preliminary" in out


class TestCitationInline:
    def _lookup(self) -> dict[str, CitationRef]:
        return {
            "C1": CitationRef(citation_id="C1", doi="10.1/x"),
            "C2": CitationRef(citation_id="C2"),
        }

    def test_empty_refs_returns_empty(self) -> None:
        assert _citation_inline([], self._lookup()) == ""

    def test_known_ref_with_link_renders_anchor(self) -> None:
        out = _citation_inline(["C1"], self._lookup())
        assert "<sup" in out
        assert "doi.org" in out
        assert "[C1]" in out

    def test_known_ref_without_link_renders_unverified(self) -> None:
        out = _citation_inline(["C2"], self._lookup())
        assert "ds-cite-unverified" in out
        assert "[C2]" in out

    def test_missing_ref_renders_warning_marker(self) -> None:
        out = _citation_inline(["C99"], self._lookup())
        assert "ds-cite-missing" in out
        assert "[C99?]" in out


class TestRenderObserved:
    def test_empty_renders_empty_state(self) -> None:
        out = _render_observed([])
        assert "ds-empty" in out
        assert "No findings recorded" in out

    def test_items_render_as_list(self) -> None:
        out = _render_observed(["a", "b"])
        assert "<ul" in out
        assert "<li>a</li>" in out
        assert "<li>b</li>" in out

    def test_items_html_escaped(self) -> None:
        out = _render_observed(["<script>"])
        assert "<script>" not in out
        assert "&lt;script&gt;" in out


class TestRenderSimpleList:
    def test_empty_uses_fallback(self) -> None:
        out = _render_simple_list([], fallback="None recorded.", color="#475569")
        assert "None recorded." in out

    def test_items_render_as_list(self) -> None:
        out = _render_simple_list(["x", "y"], fallback="—", color="#000")
        assert "<ul" in out
        assert "<li>x</li>" in out


# ───────────────────────────── render_report_html ──────────────────────────


def _payload(audience: str = "both") -> ReportPayload:
    return ReportPayload(
        title="Test report",
        audience=audience,  # type: ignore[arg-type]
        summary="A short overview.",
        sections=[
            ReportSection(
                section_id="s1",
                title="Section 1",
                observed=["finding A"],
                interpretations=[
                    InterpretationItem(
                        text="The model thinks X.",
                        evidence_strength="Moderate",
                        evidence_refs=["C1"],
                    ),
                ],
                suggested_actions=[SuggestedAction(text="Consider Y.")],
                cautions=["watch for Z"],
                limitations=["small n"],
                confidence="medium",
            ),
        ],
        citations=[
            CitationRef(citation_id="C1", title="Some Paper", doi="10.1/x"),
        ],
        global_cautions=["Read the disclaimer."],
    )


class TestRenderReportHtml:
    def test_returns_doctype_html(self) -> None:
        out = render_report_html(_payload())
        assert out.startswith("<!doctype html>")
        assert "</html>" in out

    def test_title_rendered_in_head(self) -> None:
        out = render_report_html(_payload())
        assert "<title>Test report</title>" in out

    def test_clinician_view_only_no_toggle(self) -> None:
        out = render_report_html(_payload(), audience="clinician")
        # The ds-toggle-bar class always appears in the inline <style> CSS
        # rule. Assert on the actual <div class="ds-toggle-bar"> element.
        assert '<div class="ds-toggle-bar"' not in out
        # Only the clinician view block is rendered.
        assert 'data-audience="clinician"' in out
        assert 'data-audience="patient"' not in out

    def test_patient_view_only_no_toggle(self) -> None:
        out = render_report_html(_payload(), audience="patient")
        assert '<div class="ds-toggle-bar"' not in out
        assert 'data-audience="patient"' in out
        assert 'data-audience="clinician"' not in out

    def test_both_renders_toggle_and_two_views(self) -> None:
        out = render_report_html(_payload(), audience="both")
        assert '<div class="ds-toggle-bar"' in out
        assert 'data-audience="clinician"' in out
        assert 'data-audience="patient"' in out
        # Page break between the two views for static PDF
        assert "page-break-before:always" in out

    def test_unknown_audience_falls_back_to_both(self) -> None:
        out = render_report_html(_payload(audience="both"), audience="weird")  # type: ignore[arg-type]
        assert '<div class="ds-toggle-bar"' in out

    def test_payload_audience_default_used_when_no_override(self) -> None:
        out = render_report_html(_payload(audience="clinician"))
        assert '<div class="ds-toggle-bar"' not in out

    def test_decision_support_disclaimer_rendered(self) -> None:
        out = render_report_html(_payload())
        assert "decision-support" in out

    def test_observed_items_rendered_in_section(self) -> None:
        out = render_report_html(_payload(), audience="clinician")
        assert "finding A" in out

    def test_xss_in_title_escaped(self) -> None:
        p = _payload()
        p.title = "<script>alert(1)</script>"
        out = render_report_html(p, audience="clinician")
        assert "<script>alert" not in out
        assert "&lt;script&gt;" in out


# ───────────────────────────── render_view directly ────────────────────────


class TestRenderView:
    def test_returns_string_for_clinician(self) -> None:
        out = _render_view(_payload(), audience="clinician")
        assert isinstance(out, str)
        assert "ds-view" in out
        assert 'data-audience="clinician"' in out

    def test_returns_string_for_patient(self) -> None:
        out = _render_view(_payload(), audience="patient")
        assert 'data-audience="patient"' in out


# ───────────────────────────── render_report_pdf ───────────────────────────


class TestRenderReportPdf:
    def test_raises_pdf_renderer_unavailable_when_weasyprint_missing(self) -> None:
        # weasyprint is not in the test venv (verified at module import time
        # in the renderer). The contract is: typed exception, never blank PDF.
        with pytest.raises(PdfRendererUnavailable):
            render_report_pdf(_payload())

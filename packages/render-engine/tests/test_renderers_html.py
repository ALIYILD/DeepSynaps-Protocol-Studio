"""Tests for ``deepsynaps_render_engine.renderers.render_report_html``.

Pins the load-bearing **decision-support / clinician-review HTML
output** safety contract:

- Output is always a complete HTML document starting with
  "<!doctype html>" — never an empty / partial fragment.
- audience="both" emits BOTH clinician + patient views with a
  page-break separator AND the inline JS toggle. The PDF wrapper
  relies on the page-break to split exports cleanly.
- audience override on render_report_html wins over payload.audience.
- Invalid audience falls back to "both" (defensive).
- Every SuggestedAction with requires_clinician_review=True gets the
  "Consider:" prefix in the rendered list — pin so refactor cannot
  drop the "presented as advisory, never directive" wording.
- Every InterpretationItem renders with its evidence_strength badge
  visible.
- decision_support_disclaimer rendered in the footer of every view.
- Empty sections render the documented fallback strings ("No findings
  recorded", "No model interpretations", "No suggested actions").
- Citation list with verified / unverified status pills.
- HTML escaping protects against XSS in the title / summary fields.
"""
from __future__ import annotations

from typing import Any

import pytest

from deepsynaps_render_engine.payload import (
    CitationRef,
    InterpretationItem,
    ReportPayload,
    ReportSection,
    SuggestedAction,
)
from deepsynaps_render_engine.renderers import (
    PdfRendererUnavailable,
    RenderEngineError,
    _citation_inline,
    _confidence_pill,
    _esc,
    _render_observed,
    _render_simple_list,
    _render_suggestions,
    _strength_badge,
    render_report_html,
    render_web_preview,
)


# ── Tiny pure helpers ────────────────────────────────────────────────────


class TestEsc:
    def test_escapes_html_entities(self) -> None:
        assert _esc("<script>") == "&lt;script&gt;"

    def test_escapes_quotes(self) -> None:
        # quote=True default — both " and ' are escaped.
        out = _esc('"x"')
        assert "&quot;" in out

    def test_none_returns_empty_string(self) -> None:
        assert _esc(None) == ""

    def test_non_string_coerced(self) -> None:
        assert _esc(42) == "42"


class TestStrengthBadge:
    @pytest.mark.parametrize(
        "strength",
        ["Strong", "Moderate", "Limited", "Conflicting", "Evidence pending"],
    )
    def test_known_strengths_emit_badge(self, strength: str) -> None:
        out = _strength_badge(strength)
        assert "ds-strength" in out
        assert strength.upper()[0] in out.upper() or strength in out

    def test_unknown_strength_falls_back_to_pending_palette(self) -> None:
        # An unknown label uses the "Evidence pending" palette + the
        # raw text (escaped) so the renderer never crashes on a new
        # strength value the schema hasn't seen.
        out = _strength_badge("Unheard-Of")
        assert "Unheard-Of" in out


class TestConfidencePill:
    def test_no_level_returns_empty(self) -> None:
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
    def test_canonical_levels_get_full_label(self, level: str, label: str) -> None:
        out = _confidence_pill(level)
        assert label in out

    def test_unknown_level_falls_back_to_titled(self) -> None:
        out = _confidence_pill("borderline")
        assert "Borderline" in out


class TestRenderObserved:
    def test_empty_emits_documented_fallback(self) -> None:
        out = _render_observed([])
        assert "No findings recorded" in out

    def test_non_empty_renders_ul_li(self) -> None:
        out = _render_observed(["Alpha asymmetry +0.3"])
        assert "<ul" in out and "<li>" in out
        assert "Alpha asymmetry +0.3" in out


class TestRenderSuggestions:
    def test_empty_emits_documented_fallback(self) -> None:
        out = _render_suggestions([])
        assert "No suggested actions" in out

    def test_requires_review_gets_consider_prefix(self) -> None:
        # Pin: refactor cannot drop the "Consider:" prefix when
        # requires_clinician_review=True.
        sa = SuggestedAction(
            text="Increase follow-up cadence to weekly.",
            requires_clinician_review=True,
        )
        out = _render_suggestions([sa])
        assert "Consider:" in out

    def test_informational_no_prefix(self) -> None:
        # Setting requires_clinician_review=False -> no Consider prefix.
        sa = SuggestedAction(
            text="Patient reports good adherence.",
            requires_clinician_review=False,
        )
        out = _render_suggestions([sa])
        assert "Consider:" not in out

    def test_rationale_rendered_when_present(self) -> None:
        sa = SuggestedAction(
            text="Increase cadence.",
            rationale="Trend regressing past PHQ-9 threshold.",
        )
        out = _render_suggestions([sa])
        assert "Trend regressing" in out
        assert "Why:" in out


class TestRenderSimpleList:
    def test_empty_uses_fallback(self) -> None:
        out = _render_simple_list([], fallback="None reported.", color="#000")
        assert "None reported." in out

    def test_non_empty_renders_li(self) -> None:
        out = _render_simple_list(["a", "b"], fallback="x", color="#000")
        assert "<li>a</li>" in out
        assert "<li>b</li>" in out


class TestCitationInline:
    def test_empty_returns_empty(self) -> None:
        assert _citation_inline([], {}) == ""

    def test_known_ref_emits_link(self) -> None:
        cit = CitationRef(citation_id="C1", doi="10.1/x")
        out = _citation_inline(["C1"], {"C1": cit})
        assert "doi.org/10.1/x" in out
        assert "[C1]" in out

    def test_missing_ref_marked_with_question_mark(self) -> None:
        # An evidence_ref pointing at a citation_id that doesn't exist
        # in payload.citations renders with a "?" so the reviewer sees
        # the gap.
        out = _citation_inline(["C99"], {})
        assert "[C99?]" in out
        assert "ds-cite-missing" in out

    def test_unverified_ref_no_link(self) -> None:
        # A citation with no doi/pmid/url is rendered without an <a>.
        cit = CitationRef(citation_id="C1", raw_text="see appendix")
        out = _citation_inline(["C1"], {"C1": cit})
        assert "<a " not in out
        assert "ds-cite-unverified" in out


# ── render_web_preview (legacy) ──────────────────────────────────────────


class TestRenderWebPreview:
    def test_emits_canonical_protocol_dict(self) -> None:
        # Build a minimal ProtocolPlan-like duck.
        from types import SimpleNamespace

        proto = SimpleNamespace(
            title="rTMS L-DLPFC",
            summary="Daily 20 sessions",
            checks=["1", "2"],
        )
        out = render_web_preview(proto)
        assert out["title"] == "rTMS L-DLPFC"
        assert out["summary"] == "Daily 20 sessions"
        assert out["checks"] == ["1", "2"]
        # Pin the export targets — refactor cannot drop a target.
        assert set(out["export_targets"]) == {"web", "docx", "pdf"}


# ── render_report_html (top-level) ───────────────────────────────────────


def _payload(audience: str = "both") -> ReportPayload:
    return ReportPayload(
        title="Test report",
        audience=audience,  # type: ignore[arg-type]
        summary="A short summary.",
        sections=[
            ReportSection(
                section_id="s1",
                title="Section 1",
                observed=["finding A"],
                interpretations=[
                    InterpretationItem(
                        text="x", evidence_strength="Strong", evidence_refs=["C1"]
                    ),
                ],
                suggested_actions=[
                    SuggestedAction(text="follow up", requires_clinician_review=True),
                ],
                cautions=["watch for X"],
                limitations=["small cohort"],
                confidence="medium",
            ),
        ],
        citations=[CitationRef(citation_id="C1", doi="10.1/x", title="A paper")],
    )


class TestRenderReportHtml:
    def test_starts_with_doctype(self) -> None:
        out = render_report_html(_payload())
        assert out.startswith("<!doctype html>")
        assert "</html>" in out

    def test_default_audience_uses_payload_field(self) -> None:
        # No explicit audience kwarg -> payload.audience drives.
        out_clin = render_report_html(_payload(audience="clinician"))
        assert 'data-audience="clinician"' in out_clin
        assert 'data-audience="patient"' not in out_clin

    def test_audience_kwarg_overrides_payload(self) -> None:
        out = render_report_html(_payload(audience="clinician"), audience="patient")
        # Only the patient view rendered.
        assert 'data-audience="patient"' in out
        assert 'data-audience="clinician"' not in out

    def test_invalid_audience_falls_back_to_both(self) -> None:
        # Defensive: a corrupt audience string defaults to "both".
        out = render_report_html(_payload(), audience="garbage")  # type: ignore[arg-type]
        assert 'data-audience="clinician"' in out
        assert 'data-audience="patient"' in out

    def test_both_view_emits_toggle_bar_and_page_break(self) -> None:
        # Pin: the "both" path emits the toggle bar + the
        # page-break-before:always div between views (the PDF wrapper
        # relies on the page break to split exports cleanly).
        out = render_report_html(_payload(audience="both"))
        assert "ds-toggle-bar" in out
        assert "page-break-before:always" in out

    def test_consider_prefix_in_suggestion(self) -> None:
        out = render_report_html(_payload(audience="clinician"))
        assert "Consider:" in out

    def test_disclaimer_in_footer(self) -> None:
        # Pin the load-bearing safety wording is rendered.
        out = render_report_html(_payload(audience="clinician"))
        assert "decision-support" in out.lower()
        assert "qualified clinician" in out

    def test_xss_in_title_escaped(self) -> None:
        p = _payload()
        # Pydantic models are immutable to assignment except via
        # model_copy; build directly.
        p = p.model_copy(update={"title": "<script>alert(1)</script>"})
        out = render_report_html(p, audience="clinician")
        assert "<script>alert" not in out
        assert "&lt;script&gt;" in out

    def test_empty_sections_emit_fallback_strings(self) -> None:
        p = ReportPayload(
            title="x",
            audience="clinician",
            sections=[
                ReportSection(section_id="s1", title="t"),
            ],
        )
        out = render_report_html(p)
        # All three empty-section fallbacks fire.
        assert "No findings recorded" in out
        assert "No model interpretations" in out
        assert "No suggested actions" in out

    def test_no_citations_emits_fallback(self) -> None:
        p = ReportPayload(title="x", audience="clinician", citations=[])
        out = render_report_html(p)
        assert "No citations attached" in out


# ── render_report_pdf — PdfRendererUnavailable contract ──────────────────


class TestRenderReportPdf:
    def test_raises_when_weasyprint_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Pin the never-blank-PDF contract: when weasyprint isn't
        # importable, raise PdfRendererUnavailable so the caller can
        # map to HTTP 503 instead of returning a blank PDF.
        from deepsynaps_render_engine.renderers import render_report_pdf

        original_import = __import__

        def _blocked_import(name, *args, **kwargs):
            if name == "weasyprint":
                raise ImportError("simulated missing weasyprint")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _blocked_import)
        with pytest.raises(PdfRendererUnavailable, match="weasyprint"):
            render_report_pdf(_payload())


# ── Exception class hierarchy ────────────────────────────────────────────


class TestErrorClasses:
    def test_pdf_error_is_render_engine_error(self) -> None:
        # Pin: callers can catch RenderEngineError as the umbrella.
        assert issubclass(PdfRendererUnavailable, RenderEngineError)

    def test_render_engine_error_is_runtime_error(self) -> None:
        assert issubclass(RenderEngineError, RuntimeError)

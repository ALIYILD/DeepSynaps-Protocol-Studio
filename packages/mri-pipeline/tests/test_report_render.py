"""Tests for ``deepsynaps_mri.report.render_html`` + ``render_pdf``.

Pins the load-bearing safety contracts:

* The decision-support disclaimer must always render in the HTML body.
  This is the legal-risk shield — clinicians, not the model, sign off.
* The DOI links to peer-reviewed evidence must render for every
  stim target — the surgical-targeting overlay is only valid with a
  citation chain.
* PDF rendering must not raise when WeasyPrint is unavailable; instead
  it falls back to copying the HTML bytes (never-blank-PDF contract).
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from deepsynaps_mri.report import render_html, render_pdf
from deepsynaps_mri.schemas import (
    MRIReport,
    PatientMeta,
    QCMetrics,
    StimParameters,
    StimTarget,
)


def _report_with_target() -> MRIReport:
    return MRIReport(
        patient=PatientMeta(patient_id="P-001", age=42, chief_complaint="MDD"),
        modalities_present=[],
        qc=QCMetrics(t1_snr=22.0, passed=True),
        stim_targets=[
            StimTarget(
                target_id="T1",
                modality="rtms",
                condition="mdd",
                region_name="L-DLPFC",
                mni_xyz=(-40.0, 44.0, 30.0),
                method="MNI atlas",
                confidence="high",
                method_reference_dois=["10.1/abc"],
                suggested_parameters=StimParameters(
                    protocol="iTBS",
                    sessions=20,
                    pulses_per_session=600,
                ),
            ),
        ],
    )


class TestRenderHtml:
    def test_html_is_written_and_returned_path_exists(self, tmp_path: Path) -> None:
        out = render_html(_report_with_target(), tmp_path / "out.html")
        assert out.exists()
        assert out.suffix == ".html"

    def test_html_contains_patient_id(self, tmp_path: Path) -> None:
        out = render_html(_report_with_target(), tmp_path / "out.html")
        text = out.read_text(encoding="utf-8")
        assert "P-001" in text

    def test_html_contains_decision_support_disclaimer(self, tmp_path: Path) -> None:
        # Pin the load-bearing safety contract: the report is decision-support
        # only and the clinician — not the model — signs off.
        out = render_html(_report_with_target(), tmp_path / "out.html")
        text = out.read_text(encoding="utf-8")
        assert "Decision-support only" in text
        assert "Not a substitute for clinician judgment" in text
        assert "not a medical device" in text

    def test_html_renders_stim_target_with_doi_link(self, tmp_path: Path) -> None:
        out = render_html(_report_with_target(), tmp_path / "out.html")
        text = out.read_text(encoding="utf-8")
        # Every stim target must surface a citation — the targeting
        # contract requires DOIs.
        assert "10.1/abc" in text
        assert "https://doi.org/10.1/abc" in text
        assert "L-DLPFC" in text
        assert "RTMS" in text  # uppercased modality pill

    def test_html_renders_qc_table_metrics(self, tmp_path: Path) -> None:
        out = render_html(_report_with_target(), tmp_path / "out.html")
        text = out.read_text(encoding="utf-8")
        assert "T1 SNR" in text
        assert "22.0" in text

    def test_html_renders_minimal_report_without_optional_blocks(self, tmp_path: Path) -> None:
        # No structural / functional / diffusion → those `{% if %}` blocks
        # are skipped. Disclaimer + QC table still render.
        report = MRIReport(
            patient=PatientMeta(patient_id="P-min"),
            modalities_present=[],
            qc=QCMetrics(),
        )
        out = render_html(report, tmp_path / "min.html")
        text = out.read_text(encoding="utf-8")
        assert "Decision-support only" in text
        assert "P-min" in text
        # No structural section header.
        assert "<h2>Structural</h2>" not in text
        # No targets enumerated → "Stimulation targets (0)".
        assert "Stimulation targets (0)" in text


class TestRenderPdf:
    def test_render_pdf_falls_back_to_html_copy_when_weasyprint_unavailable(
        self,
        tmp_path: Path,
    ) -> None:
        # Pin the never-blank-PDF contract: when WeasyPrint can't run
        # (no Pango/Cairo on Windows), render_pdf must NOT raise. It
        # must write the HTML bytes to the PDF path so callers never
        # get an empty file.
        html_path = tmp_path / "in.html"
        html_path.write_text("<html><body>hello</body></html>", encoding="utf-8")
        pdf_path = tmp_path / "out.pdf"

        # Force the weasyprint import path to fail.
        import sys
        with patch.dict(sys.modules, {"weasyprint": None}):
            out = render_pdf(html_path, pdf_path)

        assert out.exists()
        # Fallback: bytes match the input HTML.
        assert out.read_bytes() == html_path.read_bytes()

    def test_render_pdf_returns_path_object(self, tmp_path: Path) -> None:
        html_path = tmp_path / "in.html"
        html_path.write_text("<html></html>", encoding="utf-8")
        result = render_pdf(html_path, tmp_path / "out.pdf")
        assert isinstance(result, Path)
        assert result.name == "out.pdf"

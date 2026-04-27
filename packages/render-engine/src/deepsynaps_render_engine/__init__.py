"""DeepSynaps render engine.

Public API:
* ``ReportPayload`` and friends — versioned structured-report schema.
* ``render_report_html`` / ``render_report_pdf`` — payload → HTML / PDF.
* ``render_protocol_docx`` / ``render_patient_guide_docx`` — legacy DOCX.
* ``render_web_preview`` — legacy shallow preview, kept for callers.
"""

from .payload import (
    REPORT_GENERATOR_VERSION_DEFAULT,
    REPORT_PAYLOAD_SCHEMA_ID,
    CitationRef,
    CitationStatus,
    EvidenceStrength,
    InterpretationItem,
    ReportPayload,
    ReportSection,
    SuggestedAction,
)
from .renderers import (
    PdfRendererUnavailable,
    RenderEngineError,
    render_patient_guide_docx,
    render_protocol_docx,
    render_report_html,
    render_report_pdf,
    render_web_preview,
)

__all__ = [
    # Payload schema
    "REPORT_PAYLOAD_SCHEMA_ID",
    "REPORT_GENERATOR_VERSION_DEFAULT",
    "CitationRef",
    "CitationStatus",
    "EvidenceStrength",
    "InterpretationItem",
    "ReportPayload",
    "ReportSection",
    "SuggestedAction",
    # Renderers
    "RenderEngineError",
    "PdfRendererUnavailable",
    "render_report_html",
    "render_report_pdf",
    "render_protocol_docx",
    "render_patient_guide_docx",
    "render_web_preview",
]

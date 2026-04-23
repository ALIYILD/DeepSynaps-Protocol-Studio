from io import BytesIO

from deepsynaps_core_schema import ProtocolPlan


def render_web_preview(protocol: ProtocolPlan) -> dict[str, object]:
    return {
        "title": protocol.title,
        "summary": protocol.summary,
        "checks": protocol.checks,
        "export_targets": ["web", "docx", "pdf"],
    }


def render_protocol_docx(protocol_plan, handbook_plan=None) -> bytes:
    """
    Generate a DOCX document from a protocol plan.
    Returns raw bytes of the .docx file.
    Uses python-docx.
    """
    try:
        from docx import Document  # noqa: F401
        from docx.shared import Pt, RGBColor, Inches  # noqa: F401
        from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: F401
    except ImportError:
        raise ImportError("python-docx required: pip install python-docx")

    doc = Document()

    # Title
    title = doc.add_heading(level=0)
    title.text = f"Clinical Protocol: {getattr(protocol_plan, 'title', 'Protocol')}"

    # Summary section
    doc.add_heading("Protocol Summary", level=1)
    summary_table = doc.add_table(rows=4, cols=2)
    summary_table.style = "Table Grid"
    fields = [
        ("Condition", getattr(protocol_plan, 'condition_name', '')),
        ("Modality", getattr(protocol_plan, 'modality_name', '')),
        ("Device", getattr(protocol_plan, 'device_name', '')),
        ("Evidence Grade", getattr(protocol_plan, 'evidence_grade', '')),
    ]
    for i, (label, value) in enumerate(fields):
        row = summary_table.rows[i]
        row.cells[0].text = label
        row.cells[1].text = str(value) if value else "N/A"

    doc.add_paragraph()

    # Approval badge / off-label notice
    approval = getattr(protocol_plan, 'approval_badge', None)
    if approval:
        p = doc.add_paragraph()
        p.add_run(f"Status: {approval}").bold = True

    # Contraindications
    contras = getattr(protocol_plan, 'contraindications', [])
    if contras:
        doc.add_heading("Contraindications", level=1)
        for item in contras:
            doc.add_paragraph(str(item), style="List Bullet")

    # Safety checks
    safety = getattr(protocol_plan, 'safety_checks', [])
    if safety:
        doc.add_heading("Safety Checks", level=1)
        for item in safety:
            doc.add_paragraph(str(item), style="List Bullet")

    # Session structure
    session = getattr(protocol_plan, 'session_structure', None)
    if session:
        doc.add_heading("Session Structure", level=1)
        steps = getattr(session, 'steps', [])
        for step in steps:
            step_title = getattr(step, 'title', '')
            step_desc = getattr(step, 'description', '')
            doc.add_heading(str(step_title), level=2)
            if step_desc:
                doc.add_paragraph(str(step_desc))

    # Handbook sections (if provided)
    if handbook_plan:
        sections = getattr(handbook_plan, 'sections', [])
        for section in sections:
            title_text = getattr(section, 'title', '')
            body = getattr(section, 'body', '')
            doc.add_heading(str(title_text), level=1)
            if body:
                doc.add_paragraph(str(body))

    # Disclaimer
    doc.add_heading("Disclaimer", level=1)
    doc.add_paragraph(
        "This document is a DRAFT support tool for qualified clinicians only. "
        "It does not constitute medical advice. All protocols require independent "
        "clinical review before application. DeepSynaps accepts no liability for "
        "clinical decisions made using this document."
    )

    # Save to bytes
    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


def render_patient_guide_docx(condition_name: str, modality_name: str, instructions: list[str]) -> bytes:
    """Generate a simple patient-facing guide."""
    try:
        from docx import Document
    except ImportError:
        raise ImportError("python-docx required")

    doc = Document()
    doc.add_heading(f"Your Treatment Guide: {condition_name}", level=0)
    doc.add_paragraph(f"Treatment approach: {modality_name}")
    doc.add_heading("What to Expect", level=1)
    for instruction in instructions:
        doc.add_paragraph(str(instruction), style="List Bullet")
    doc.add_paragraph(
        "Please discuss any questions or concerns with your clinician before, during, or after treatment."
    )
    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()

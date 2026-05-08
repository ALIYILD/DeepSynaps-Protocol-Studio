"""Tests for handbook → ReportPayload bridge."""

from deepsynaps_core_schema import HandbookDocument

from deepsynaps_generation_engine import build_report_payload_from_handbook_document


def test_handbook_document_maps_to_report_payload_sections() -> None:
    doc = HandbookDocument(
        document_type="clinician_handbook",
        title="Clinician handbook for Example with rTMS",
        overview="Registry-driven draft for training and review.",
        eligibility=["Population: adults", "Severity: moderate+"],
        setup=["Coil: DLPFC"],
        session_workflow=["20 sessions", "5×/week"],
        safety=["Metal exclusion"],
        troubleshooting=["Verify citations"],
        escalation=["Escalate seizures"],
        references=["https://example.org/guidance"],
    )
    payload = build_report_payload_from_handbook_document(doc)

    assert payload.schema_id == "deepsynaps.report-payload/v1"
    assert payload.title == doc.title
    assert len(payload.sections) >= 7
    ids = {s.section_id for s in payload.sections}
    assert "handbook-overview" in ids
    assert "handbook-session-workflow" in ids
    assert payload.citations and payload.citations[0].citation_id == "H1"


def test_empty_handbook_lists_use_placeholders_not_crash() -> None:
    doc = HandbookDocument(
        document_type="patient_guide",
        title="Patient guide",
        overview="",
        eligibility=[],
        setup=[],
        session_workflow=[],
        safety=[],
        troubleshooting=[],
        escalation=[],
        references=[],
    )
    payload = build_report_payload_from_handbook_document(doc)
    assert payload.sections
    overview = next(s for s in payload.sections if s.section_id == "handbook-overview")
    assert overview.observed

"""QASpec for MRI Reports."""

from __future__ import annotations

from deepsynaps_qa.models import ArtifactType, QASpec

MRI_REPORT_SPEC = QASpec(
    spec_id="spec:mri_report_v1",
    artifact_type=ArtifactType.MRI_REPORT,
    required_sections=[
        "patient_demographics",
        "acquisition_parameters",
        "structural_findings",
        "volumetric_summary",
        "white_matter_assessment",
        "impression",
        "recommendations",
        "radiologist_attestation",
    ],
    citation_floor=3,
    reading_level_min=12.0,
    reading_level_max=18.0,
    banned_terms=[
        "not a radiologist",
        "AI diagnosis",
        "definitively shows",
    ],
    schema_ref="mri_report.json",
    check_ids=[
        "sections",
        "citations",
        "schema",
        "fabrication",
        "language",
        "banned_terms",
        "redaction",
        "placeholders",
    ],
)

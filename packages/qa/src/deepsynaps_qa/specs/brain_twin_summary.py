"""QASpec for Brain Twin Summary Cards."""

from __future__ import annotations

from deepsynaps_qa.models import ArtifactType, QASpec

BRAIN_TWIN_SUMMARY_SPEC = QASpec(
    spec_id="spec:brain_twin_summary_v1",
    artifact_type=ArtifactType.BRAIN_TWIN_SUMMARY,
    required_sections=[
        "subject_profile_hash",
        "baseline_metrics",
        "key_findings",
        "confidence_summary",
        "advisory_notice",
        "data_provenance",
    ],
    citation_floor=2,
    reading_level_min=10.0,
    reading_level_max=16.0,
    banned_terms=[
        "patient name",
        "date of birth",
        "social security",
        "NHS number",
        "Medicare number",
    ],
    schema_ref="brain_twin_summary.json",
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

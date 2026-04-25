"""QASpec for Protocol Drafts."""

from __future__ import annotations

from deepsynaps_qa.models import ArtifactType, QASpec

PROTOCOL_DRAFT_SPEC = QASpec(
    spec_id="spec:protocol_draft_v1",
    artifact_type=ArtifactType.PROTOCOL_DRAFT,
    required_sections=[
        "clinical_rationale",
        "target_population_criteria",
        "exclusion_criteria",
        "contraindications",
        "safety_notes",
        "session_parameters",
        "outcome_measures",
        "monitoring_plan",
        "informed_consent_reference",
        "evidence_summary",
        "limitations",
    ],
    citation_floor=5,
    reading_level_min=14.0,
    reading_level_max=20.0,
    banned_terms=[
        "guaranteed improvement",
        "autonomous protocol",
        "self-administered without supervision",
        "prescribe",
    ],
    schema_ref="protocol_draft.json",
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

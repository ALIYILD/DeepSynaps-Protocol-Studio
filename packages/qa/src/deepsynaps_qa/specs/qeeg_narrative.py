"""QASpec for qEEG Narrative Reports."""

from __future__ import annotations

from deepsynaps_qa.models import ArtifactType, QASpec

QEEG_NARRATIVE_SPEC = QASpec(
    spec_id="spec:qeeg_narrative_v1",
    artifact_type=ArtifactType.QEEG_NARRATIVE,
    required_sections=[
        "patient_demographics",
        "recording_conditions",
        "spectral_analysis",
        "coherence_findings",
        "connectivity_summary",
        "clinical_impression",
        "differential_considerations",
        "recommendations",
        "limitations_and_caveats",
    ],
    citation_floor=5,
    reading_level_min=12.0,
    reading_level_max=18.0,
    banned_terms=[
        "guarantees recovery",
        "diagnostic of",
        "this proves",
    ],
    schema_ref="qeeg_narrative.json",
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

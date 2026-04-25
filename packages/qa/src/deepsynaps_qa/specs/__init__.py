"""Artifact spec registry."""

from __future__ import annotations

from deepsynaps_qa.models import ArtifactType, QASpec
from deepsynaps_qa.specs.brain_twin_summary import BRAIN_TWIN_SUMMARY_SPEC
from deepsynaps_qa.specs.mri_report import MRI_REPORT_SPEC
from deepsynaps_qa.specs.protocol_draft import PROTOCOL_DRAFT_SPEC
from deepsynaps_qa.specs.qeeg_narrative import QEEG_NARRATIVE_SPEC

SPEC_REGISTRY: dict[str, QASpec] = {
    QEEG_NARRATIVE_SPEC.spec_id: QEEG_NARRATIVE_SPEC,
    MRI_REPORT_SPEC.spec_id: MRI_REPORT_SPEC,
    PROTOCOL_DRAFT_SPEC.spec_id: PROTOCOL_DRAFT_SPEC,
    BRAIN_TWIN_SUMMARY_SPEC.spec_id: BRAIN_TWIN_SUMMARY_SPEC,
}

ARTIFACT_TYPE_TO_SPEC: dict[ArtifactType, QASpec] = {
    spec.artifact_type: spec for spec in SPEC_REGISTRY.values()
}


def get_spec(spec_id: str) -> QASpec | None:
    """Look up a QASpec by its ``spec_id``."""
    return SPEC_REGISTRY.get(spec_id)


def get_spec_for_artifact_type(artifact_type: ArtifactType) -> QASpec | None:
    """Look up a QASpec by ``ArtifactType``."""
    return ARTIFACT_TYPE_TO_SPEC.get(artifact_type)


def list_specs() -> list[QASpec]:
    """Return all registered specs."""
    return list(SPEC_REGISTRY.values())


__all__ = [
    "SPEC_REGISTRY",
    "get_spec",
    "get_spec_for_artifact_type",
    "list_specs",
]

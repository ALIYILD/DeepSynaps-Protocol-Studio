"""Pydantic schemas for session-level DeepSynaps Neuro Engine responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any

try:
    from pydantic import BaseModel, ConfigDict
except ImportError:  # pragma: no cover - optional in some runtimes.
    BaseModel = None  # type: ignore[assignment]
    ConfigDict = None  # type: ignore[assignment]

from .features import (
    SessionFeatures,
    SessionFunctionalFeatures,
    SessionMetadata,
    SessionStructuralFeatures,
)
from .presenters import (
    ConnectivityMatrixSummary,
    SessionFeaturesFull,
    SessionFeaturesLite,
)
from .protocol_evidence import (
    EvidenceCitation,
    EvidenceItem,
    ProtocolEvidenceBundle,
)
from .recommendation_drafts import (
    RecommendationDraft,
    RecommendationOption,
)
from .review_queue import EscalationEvent, ReviewQueueItem, ReviewQueueSnapshot
from .review_workflow import DraftReviewState, ReviewAction
from .protocol_views import ProtocolFeature, ProtocolFeatureView


if BaseModel is not None:

    class _SchemaBase(BaseModel):
        """Shared base class for Pydantic session schemas."""

        if ConfigDict is not None:
            model_config = ConfigDict(from_attributes=True)


    class SessionMetadataSchema(_SchemaBase):
        """API schema for session metadata."""

        subject_id: str
        session_id: str | None = None
        age_years: float | None = None
        sex: str | None = None
        diagnosis: str | None = None
        visit_type: str | None = None
        scanner_site: str | None = None
        notes: str | None = None

        @classmethod
        def from_domain(cls, metadata: SessionMetadata) -> "SessionMetadataSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                subject_id=metadata.subject_id,
                session_id=metadata.session_id,
                age_years=metadata.age_years,
                sex=metadata.sex,
                diagnosis=metadata.diagnosis,
                visit_type=metadata.visit_type,
                scanner_site=metadata.scanner_site,
                notes=metadata.notes,
            )


    class SessionStructuralFeaturesSchema(_SchemaBase):
        """API schema for assembled structural session features."""

        subject_id: str
        session_id: str | None = None
        source_dir: str
        biomarker_bundle: dict[str, Any]
        normalized_records: list[dict[str, Any]]

        @classmethod
        def from_domain(
            cls,
            structural: SessionStructuralFeatures,
        ) -> "SessionStructuralFeaturesSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                subject_id=structural.subject_id,
                session_id=structural.session_id,
                source_dir=str(structural.source_dir),
                biomarker_bundle=structural.biomarker_bundle.to_dict(),
                normalized_records=[record.to_dict() for record in structural.normalized_records],
            )


    class SessionFunctionalFeaturesSchema(_SchemaBase):
        """API schema for assembled functional session features."""

        subject_id: str
        session_id: str | None = None
        derivatives_root: str
        connectivity: dict[str, Any] | None = None

        @classmethod
        def from_domain(
            cls,
            functional: SessionFunctionalFeatures,
        ) -> "SessionFunctionalFeaturesSchema":
            """Build the schema from a domain dataclass."""

            connectivity = None
            if functional.connectivity is not None:
                connectivity = {
                    "subject_id": functional.connectivity.subject_id,
                    "session_id": functional.connectivity.session_id,
                    "atlas_name": functional.connectivity.atlas_name,
                    "connectivity_kind": functional.connectivity.connectivity_kind,
                    "runs": [
                        {
                            "subject_id": run.subject_id,
                            "session_id": run.session_id,
                            "run_id": run.run_id,
                            "task_id": run.task_id,
                            "space": run.space,
                            "atlas_name": run.atlas_name,
                            "atlas_labels": list(run.atlas_labels),
                            "connectivity_kind": run.connectivity_kind,
                            "matrix": run.matrix,
                            "confounds_strategy": run.confounds_strategy,
                            "n_volumes": run.n_volumes,
                            "tr": run.tr,
                            "source_bold": run.source_bold,
                            "source_confounds": run.source_confounds,
                        }
                        for run in functional.connectivity.runs
                    ],
                    "aggregated_matrix": functional.connectivity.aggregated_matrix,
                    "aggregation_method": functional.connectivity.aggregation_method,
                }
            return cls(
                subject_id=functional.subject_id,
                session_id=functional.session_id,
                derivatives_root=str(functional.derivatives_root),
                connectivity=connectivity,
            )


    class SessionFeaturesSchema(_SchemaBase):
        """API schema for a unified, versioned session feature object."""

        version: str
        subject_id: str
        session_id: str | None = None
        metadata: SessionMetadataSchema
        structural: SessionStructuralFeaturesSchema | None = None
        functional: SessionFunctionalFeaturesSchema | None = None
        created_at: datetime

        @classmethod
        def from_domain(cls, features: SessionFeatures) -> "SessionFeaturesSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                version=features.version,
                subject_id=features.subject_id,
                session_id=features.session_id,
                metadata=SessionMetadataSchema.from_domain(features.metadata),
                structural=None
                if features.structural is None
                else SessionStructuralFeaturesSchema.from_domain(features.structural),
                functional=None
                if features.functional is None
                else SessionFunctionalFeaturesSchema.from_domain(features.functional),
                created_at=features.created_at,
            )


    class ConnectivityMatrixSummarySchema(_SchemaBase):
        """API schema for a compact connectivity matrix summary."""

        atlas_name: str
        connectivity_kind: str
        n_regions: int
        n_runs: int
        aggregation_method: str | None = None
        min_value: float | None = None
        max_value: float | None = None
        mean_value: float | None = None
        diagonal_mean: float | None = None
        upper_triangle_mean: float | None = None
        upper_triangle_abs_mean: float | None = None

        @classmethod
        def from_domain(
            cls,
            summary: ConnectivityMatrixSummary,
        ) -> "ConnectivityMatrixSummarySchema":
            """Build the schema from a domain dataclass."""

            return cls(**summary.to_dict())


    class SessionFeaturesLiteSchema(_SchemaBase):
        """API schema for the compact session feature presentation."""

        version: str
        subject_id: str
        session_id: str | None = None
        metadata: dict[str, Any]
        structural_summary: dict[str, Any] | None = None
        functional_summary: dict[str, Any] | None = None
        created_at: datetime

        @classmethod
        def from_domain(cls, features: SessionFeaturesLite) -> "SessionFeaturesLiteSchema":
            """Build the schema from a lite presenter output."""

            return cls(
                version=features.version,
                subject_id=features.subject_id,
                session_id=features.session_id,
                metadata=features.metadata,
                structural_summary=features.structural_summary,
                functional_summary=features.functional_summary,
                created_at=features.created_at,
            )


    class SessionFeaturesFullSchema(_SchemaBase):
        """API schema for the expanded session feature presentation."""

        version: str
        subject_id: str
        session_id: str | None = None
        metadata: dict[str, Any]
        structural: dict[str, Any] | None = None
        functional: dict[str, Any] | None = None
        created_at: datetime

        @classmethod
        def from_domain(cls, features: SessionFeaturesFull) -> "SessionFeaturesFullSchema":
            """Build the schema from a full presenter output."""

            return cls(
                version=features.version,
                subject_id=features.subject_id,
                session_id=features.session_id,
                metadata=features.metadata,
                structural=features.structural,
                functional=features.functional,
                created_at=features.created_at,
            )


    class ProtocolFeatureSchema(_SchemaBase):
        """API schema for one selected protocol feature."""

        feature_key: str
        display_name: str
        value: float | int | str | None = None
        unit: str | None = None
        source: str
        notes: str | None = None

        @classmethod
        def from_domain(cls, feature: ProtocolFeature) -> "ProtocolFeatureSchema":
            """Build the schema from a domain dataclass."""

            return cls(**feature.to_dict())


    class ProtocolFeatureViewSchema(_SchemaBase):
        """API schema for a condition-specific protocol feature view."""

        version: str
        condition: str
        subject_id: str
        session_id: str | None = None
        metadata: dict[str, Any]
        selected_features: list[ProtocolFeatureSchema]
        missing_features: list[str]
        created_at: datetime

        @classmethod
        def from_domain(cls, view: ProtocolFeatureView) -> "ProtocolFeatureViewSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                version=view.version,
                condition=view.condition,
                subject_id=view.subject_id,
                session_id=view.session_id,
                metadata=view.metadata,
                selected_features=[ProtocolFeatureSchema.from_domain(feature) for feature in view.selected_features],
                missing_features=list(view.missing_features),
                created_at=view.created_at,
            )


    class EvidenceCitationSchema(_SchemaBase):
        """API schema for one evidence citation."""

        id: str
        title: str
        source: str
        year: int | None = None
        doi_or_url: str | None = None

        @classmethod
        def from_domain(cls, citation: EvidenceCitation) -> "EvidenceCitationSchema":
            """Build the schema from a domain dataclass."""

            return cls(**citation.to_dict())


    class EvidenceItemSchema(_SchemaBase):
        """API schema for one protocol evidence item."""

        key: str
        modality: str
        condition: str
        direction: str | None = None
        value: float | int | str | None = None
        unit: str | None = None
        qualitative_strength: str | None = None
        rationale: str
        citations: list[EvidenceCitationSchema]
        source_feature_key: str
        notes: str | None = None

        @classmethod
        def from_domain(cls, item: EvidenceItem) -> "EvidenceItemSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                key=item.key,
                modality=item.modality,
                condition=item.condition,
                direction=item.direction,
                value=item.value,
                unit=item.unit,
                qualitative_strength=item.qualitative_strength,
                rationale=item.rationale,
                citations=[EvidenceCitationSchema.from_domain(citation) for citation in item.citations],
                source_feature_key=item.source_feature_key,
                notes=item.notes,
            )


    class ProtocolEvidenceBundleSchema(_SchemaBase):
        """API schema for a protocol evidence bundle."""

        version: str
        condition: str
        subject_id: str
        session_id: str | None = None
        items: list[EvidenceItemSchema]
        missing_feature_keys: list[str]
        created_at: datetime

        @classmethod
        def from_domain(cls, bundle: ProtocolEvidenceBundle) -> "ProtocolEvidenceBundleSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                version=bundle.version,
                condition=bundle.condition,
                subject_id=bundle.subject_id,
                session_id=bundle.session_id,
                items=[EvidenceItemSchema.from_domain(item) for item in bundle.items],
                missing_feature_keys=list(bundle.missing_feature_keys),
                created_at=bundle.created_at,
            )


    class RecommendationOptionSchema(_SchemaBase):
        """API schema for one non-final recommendation option."""

        option_id: str
        modality: str
        target_region: str | None = None
        laterality: str | None = None
        protocol_family: str | None = None
        evidence_keys: list[str]
        rationale: str
        confidence_level: str
        safety_flags: list[str]
        missing_information: list[str]
        notes: str | None = None

        @classmethod
        def from_domain(cls, option: RecommendationOption) -> "RecommendationOptionSchema":
            """Build the schema from a domain dataclass."""

            return cls(**option.to_dict())


    class RecommendationDraftSchema(_SchemaBase):
        """API schema for a recommendation draft."""

        version: str
        condition: str
        subject_id: str
        session_id: str | None = None
        options: list[RecommendationOptionSchema]
        global_rationale: str
        required_human_review: bool
        review_status: str
        audit_tags: list[str]
        created_at: datetime

        @classmethod
        def from_domain(cls, draft: RecommendationDraft) -> "RecommendationDraftSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                version=draft.version,
                condition=draft.condition,
                subject_id=draft.subject_id,
                session_id=draft.session_id,
                options=[RecommendationOptionSchema.from_domain(option) for option in draft.options],
                global_rationale=draft.global_rationale,
                required_human_review=draft.required_human_review,
                review_status=draft.review_status,
                audit_tags=list(draft.audit_tags),
                created_at=draft.created_at,
            )


    class ReviewActionSchema(_SchemaBase):
        """API schema for one review workflow action."""

        action_id: str
        actor_id: str
        actor_role: str | None = None
        action_type: str
        rationale: str | None = None
        created_at: datetime
        metadata: dict[str, str | int | float | bool | None]

        @classmethod
        def from_domain(cls, action: ReviewAction) -> "ReviewActionSchema":
            """Build the schema from a domain dataclass."""

            return cls(**action.to_dict())


    class DraftReviewStateSchema(_SchemaBase):
        """API schema for a recommendation draft review state."""

        draft_id: str
        subject_id: str
        session_id: str | None = None
        condition: str
        current_status: str
        reviewer_id: str | None = None
        reviewer_role: str | None = None
        last_updated_at: datetime
        actions: list[ReviewActionSchema]
        final_recommendation_snapshot: dict[str, Any] | None = None

        @classmethod
        def from_domain(cls, state: DraftReviewState) -> "DraftReviewStateSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                draft_id=state.draft_id,
                subject_id=state.subject_id,
                session_id=state.session_id,
                condition=state.condition,
                current_status=state.current_status,
                reviewer_id=state.reviewer_id,
                reviewer_role=state.reviewer_role,
                last_updated_at=state.last_updated_at,
                actions=[ReviewActionSchema.from_domain(action) for action in state.actions],
                final_recommendation_snapshot=state.final_recommendation_snapshot,
            )


    class InitializeDraftReviewRequest(_SchemaBase):
        """Request schema for review workflow initialization."""

        subject_id: str
        session_id: str | None = None
        condition: str
        actor_id: str
        actor_role: str | None = None


    class DraftReviewTransitionRequest(_SchemaBase):
        """Request schema for simple draft review transitions."""

        draft_id: str
        actor_id: str
        actor_role: str | None = None
        rationale: str | None = None


    class DraftApprovalRequest(_SchemaBase):
        """Request schema for approval transitions."""

        draft_id: str
        actor_id: str
        actor_role: str | None = None
        rationale: str | None = None
        final_snapshot: dict[str, Any] | None = None


    class DraftOverrideRequest(_SchemaBase):
        """Request schema for override transitions."""

        draft_id: str
        actor_id: str
        actor_role: str | None = None
        rationale: str
        final_snapshot: dict[str, Any] | None = None


    class ReviewQueueItemSchema(_SchemaBase):
        """API schema for one review queue item."""

        draft_id: str
        subject_id: str
        session_id: str | None = None
        condition: str
        current_status: str
        reviewer_id: str | None = None
        reviewer_role: str | None = None
        created_at: datetime
        last_updated_at: datetime
        age_hours: float
        hours_since_last_action: float
        priority_score: float
        priority_bucket: str
        escalation_flags: list[str]
        summary: str | None = None

        @classmethod
        def from_domain(cls, item: ReviewQueueItem) -> "ReviewQueueItemSchema":
            """Build the schema from a domain dataclass."""

            return cls(**item.to_dict())


    class ReviewQueueSnapshotSchema(_SchemaBase):
        """API schema for a review queue snapshot."""

        generated_at: datetime
        total_items: int
        items: list[ReviewQueueItemSchema]
        counts_by_status: dict[str, int]
        counts_by_priority: dict[str, int]

        @classmethod
        def from_domain(cls, snapshot: ReviewQueueSnapshot) -> "ReviewQueueSnapshotSchema":
            """Build the schema from a domain dataclass."""

            return cls(
                generated_at=snapshot.generated_at,
                total_items=snapshot.total_items,
                items=[ReviewQueueItemSchema.from_domain(item) for item in snapshot.items],
                counts_by_status=dict(snapshot.counts_by_status),
                counts_by_priority=dict(snapshot.counts_by_priority),
            )


    class EscalationEventSchema(_SchemaBase):
        """API schema for one escalation event."""

        escalation_id: str
        draft_id: str
        reason: str
        from_reviewer_id: str | None = None
        to_reviewer_id: str | None = None
        to_queue: str | None = None
        created_at: datetime
        metadata: dict[str, str | int | float | bool | None]

        @classmethod
        def from_domain(cls, event: EscalationEvent) -> "EscalationEventSchema":
            """Build the schema from a domain dataclass."""

            return cls(**event.to_dict())


    class EscalationRequestSchema(_SchemaBase):
        """Request schema for manual review escalation."""

        draft_id: str
        reason: str
        to_reviewer_id: str | None = None
        to_queue: str | None = None
        metadata: dict[str, str | int | float | bool | None] | None = None


else:

    class SessionMetadataSchema:  # pragma: no cover - only used without pydantic.
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, metadata: SessionMetadata) -> "SessionMetadataSchema":
            raise RuntimeError("Pydantic is required for SessionMetadataSchema")


    class SessionStructuralFeaturesSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(
            cls,
            structural: SessionStructuralFeatures,
        ) -> "SessionStructuralFeaturesSchema":
            raise RuntimeError("Pydantic is required for SessionStructuralFeaturesSchema")


    class SessionFunctionalFeaturesSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(
            cls,
            functional: SessionFunctionalFeatures,
        ) -> "SessionFunctionalFeaturesSchema":
            raise RuntimeError("Pydantic is required for SessionFunctionalFeaturesSchema")


    class SessionFeaturesSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, features: SessionFeatures) -> "SessionFeaturesSchema":
            raise RuntimeError("Pydantic is required for SessionFeaturesSchema")


    class ConnectivityMatrixSummarySchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(
            cls,
            summary: ConnectivityMatrixSummary,
        ) -> "ConnectivityMatrixSummarySchema":
            raise RuntimeError("Pydantic is required for ConnectivityMatrixSummarySchema")


    class SessionFeaturesLiteSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, features: SessionFeaturesLite) -> "SessionFeaturesLiteSchema":
            raise RuntimeError("Pydantic is required for SessionFeaturesLiteSchema")


    class SessionFeaturesFullSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, features: SessionFeaturesFull) -> "SessionFeaturesFullSchema":
            raise RuntimeError("Pydantic is required for SessionFeaturesFullSchema")


    class ProtocolFeatureSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, feature: ProtocolFeature) -> "ProtocolFeatureSchema":
            raise RuntimeError("Pydantic is required for ProtocolFeatureSchema")


    class ProtocolFeatureViewSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, view: ProtocolFeatureView) -> "ProtocolFeatureViewSchema":
            raise RuntimeError("Pydantic is required for ProtocolFeatureViewSchema")


    class EvidenceCitationSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, citation: EvidenceCitation) -> "EvidenceCitationSchema":
            raise RuntimeError("Pydantic is required for EvidenceCitationSchema")


    class EvidenceItemSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, item: EvidenceItem) -> "EvidenceItemSchema":
            raise RuntimeError("Pydantic is required for EvidenceItemSchema")


    class ProtocolEvidenceBundleSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, bundle: ProtocolEvidenceBundle) -> "ProtocolEvidenceBundleSchema":
            raise RuntimeError("Pydantic is required for ProtocolEvidenceBundleSchema")


    class RecommendationOptionSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, option: RecommendationOption) -> "RecommendationOptionSchema":
            raise RuntimeError("Pydantic is required for RecommendationOptionSchema")


    class RecommendationDraftSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, draft: RecommendationDraft) -> "RecommendationDraftSchema":
            raise RuntimeError("Pydantic is required for RecommendationDraftSchema")


    class ReviewActionSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, action: ReviewAction) -> "ReviewActionSchema":
            raise RuntimeError("Pydantic is required for ReviewActionSchema")


    class DraftReviewStateSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, state: DraftReviewState) -> "DraftReviewStateSchema":
            raise RuntimeError("Pydantic is required for DraftReviewStateSchema")


    class InitializeDraftReviewRequest:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""


    class DraftReviewTransitionRequest:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""


    class DraftApprovalRequest:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""


    class DraftOverrideRequest:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""


    class ReviewQueueItemSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, item: ReviewQueueItem) -> "ReviewQueueItemSchema":
            raise RuntimeError("Pydantic is required for ReviewQueueItemSchema")


    class ReviewQueueSnapshotSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, snapshot: ReviewQueueSnapshot) -> "ReviewQueueSnapshotSchema":
            raise RuntimeError("Pydantic is required for ReviewQueueSnapshotSchema")


    class EscalationEventSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""

        @classmethod
        def from_domain(cls, event: EscalationEvent) -> "EscalationEventSchema":
            raise RuntimeError("Pydantic is required for EscalationEventSchema")


    class EscalationRequestSchema:  # pragma: no cover
        """Fallback placeholder when Pydantic is unavailable."""


__all__ = [
    "ConnectivityMatrixSummarySchema",
    "DraftApprovalRequest",
    "DraftOverrideRequest",
    "DraftReviewStateSchema",
    "DraftReviewTransitionRequest",
    "EscalationEventSchema",
    "EscalationRequestSchema",
    "EvidenceCitationSchema",
    "EvidenceItemSchema",
    "InitializeDraftReviewRequest",
    "ProtocolFeatureSchema",
    "ProtocolEvidenceBundleSchema",
    "ProtocolFeatureViewSchema",
    "RecommendationDraftSchema",
    "RecommendationOptionSchema",
    "ReviewQueueItemSchema",
    "ReviewQueueSnapshotSchema",
    "ReviewActionSchema",
    "SessionFeaturesFullSchema",
    "SessionFeaturesLiteSchema",
    "SessionFeaturesSchema",
    "SessionFunctionalFeaturesSchema",
    "SessionMetadataSchema",
    "SessionStructuralFeaturesSchema",
]

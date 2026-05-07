"""Facade and exports for the DeepSynaps Neuro Engine."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence
from uuid import uuid4

from .config import NeuroEngineSettings, load_settings
from .functional.connectivity import (
    ConnectivityBundle,
    ConnectivityExtractionError,
    ConnectivityResult,
    ConnectivityRunResult,
    FunctionalConnectivityExtractor,
    compute_functional_connectivity,
)
from .session.features import (
    SessionFeatureAssembler,
    SessionFeatureError,
    SessionFeatures,
    SessionMetadata,
)
from .session.presenters import (
    ConnectivityMatrixSummary,
    SessionFeaturePresenter,
    SessionFeaturesFull,
    SessionFeaturesLite,
    SessionPresentationError,
)
from .session.protocol_evidence import (
    EvidenceCitation,
    EvidenceItem,
    ProtocolEvidenceBuilder,
    ProtocolEvidenceBundle,
    ProtocolEvidenceError,
)
from .session.recommendation_drafts import (
    RecommendationDraft,
    RecommendationDraftBuilder,
    RecommendationDraftError,
    RecommendationOption,
)
from .session.review_workflow import (
    DraftReviewState,
    ReviewWorkflowError,
    ReviewWorkflowManager,
)
from .session.review_queue import (
    EscalationEvent,
    ReviewQueueError,
    ReviewQueueManager,
    ReviewQueueSnapshot,
)
from .session.protocol_views import (
    ProtocolFeature,
    ProtocolFeatureSelector,
    ProtocolFeatureView,
    ProtocolFeatureViewError,
)
from .storage.models import (
    StoredEscalationEvent,
    StoredDraftReviewState,
    StoredProtocolEvidenceBundle,
    StoredProtocolFeatureView,
    StoredRecommendationDraft,
    StoredSessionFeatures,
)
from .storage.service import NeuroEngineStorage
from .structural.biomarkers import (
    FastSurferBiomarkerExtractor,
    StructuralBiomarkerBundle,
    StructuralBiomarkerError,
)
from .structural.normalization import (
    NormalizedStructuralRecord,
    StructuralNormalizationError,
    StructuralNormalizer,
)

__version__ = "0.1.0"


@dataclass(slots=True)
class NeuroEngineRunResult:
    """Aggregate result for a lightweight neuro engine orchestration run."""

    validation: Any = None
    conversion: Any = None
    preprocessing: Any = None
    structural: Any = None
    connectivity: ConnectivityResult | None = None
    segmentation_bundle: Any = None
    segmentation: Any = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the orchestration result into JSON-friendly primitives."""

        return {
            "validation": None if self.validation is None else getattr(self.validation, "__dict__", self.validation),
            "conversion": None if self.conversion is None else getattr(self.conversion, "__dict__", self.conversion),
            "preprocessing": None if self.preprocessing is None else getattr(self.preprocessing, "__dict__", self.preprocessing),
            "structural": None if self.structural is None else getattr(self.structural, "__dict__", self.structural),
            "connectivity": None
            if self.connectivity is None
            else {
                "status": self.connectivity.status,
                "backend": self.connectivity.backend,
                "matrix": self.connectivity.matrix,
                "labels": self.connectivity.labels,
                "notes": self.connectivity.notes,
            },
            "segmentation_bundle": None if self.segmentation_bundle is None else getattr(self.segmentation_bundle, "__dict__", self.segmentation_bundle),
            "segmentation": None if self.segmentation is None else getattr(self.segmentation, "__dict__", self.segmentation),
        }


class NeuroEngine:
    """Clinical orchestration façade for the DeepSynaps neuroimaging stack."""

    def __init__(
        self,
        settings: NeuroEngineSettings | None = None,
        storage: NeuroEngineStorage | None = None,
    ) -> None:
        """Initialize the façade with env-backed settings."""

        self.settings = settings or load_settings()
        self.storage = storage

    def validate_bids_dataset(self, bids_root: str | Path) -> Any:
        """Validate a BIDS dataset tree."""

        from .utils.bids_validator import validate_bids_dataset

        return validate_bids_dataset(bids_root)

    def convert_dicom_series(
        self,
        input_dir: str | Path,
        output_dir: str | Path,
        output_name: str = "series.nii.gz",
    ) -> Any:
        """Convert a DICOM series into a NIfTI file when dependencies are available."""

        from .utils.dicom_converter import convert_dicom_series

        return convert_dicom_series(input_dir=input_dir, output_dir=output_dir, output_name=output_name)

    def run_preprocessing(
        self,
        bids_root: str | Path,
        output_root: str | Path,
        work_root: str | Path,
        participant_label: str | None = None,
        session_id: str | None = None,
        execute: bool = False,
        extra_args: Sequence[str] | None = None,
    ) -> Any:
        """Plan or run fMRIPrep preprocessing."""

        from .preprocessing.fmriprep_runner import run_fmriprep

        return run_fmriprep(
            settings=self.settings,
            bids_root=Path(bids_root),
            output_root=Path(output_root),
            work_root=Path(work_root),
            participant_label=participant_label or self.settings.default_participant_label,
            session_id=session_id,
            extra_args=extra_args,
            execute=execute,
        )

    def run_structural(
        self,
        t1w_path: str | Path,
        subject_id: str,
        subjects_dir: str | Path,
        execute: bool = False,
        extra_args: Sequence[str] | None = None,
    ) -> Any:
        """Plan or run FastSurfer structural segmentation."""

        from .structural.fastsurfer_runner import run_fastsurfer

        return run_fastsurfer(
            settings=self.settings,
            t1w_path=Path(t1w_path),
            subject_id=subject_id,
            subjects_dir=Path(subjects_dir),
            extra_args=extra_args,
            execute=execute,
        )

    def extract_structural_biomarkers(
        self,
        subject_output_dir: Path,
        subject_id: str,
        session_id: str | None = None,
    ) -> StructuralBiomarkerBundle:
        """Extract structural biomarker records from one FastSurfer output directory."""

        return FastSurferBiomarkerExtractor().extract(
            subject_output_dir=Path(subject_output_dir),
            subject_id=subject_id,
            session_id=session_id,
        )

    def normalize_structural_biomarkers(
        self,
        bundle: StructuralBiomarkerBundle,
    ) -> list[NormalizedStructuralRecord]:
        """Compute normalized and derived structural records from a biomarker bundle."""

        return StructuralNormalizer().normalize(bundle)

    def assemble_session_features(
        self,
        subject_id: str,
        session_id: str | None = None,
        *,
        fastsurfer_output_dir: Path | None = None,
        fmriprep_derivatives_root: Path | None = None,
        metadata: dict | None = None,
        connectivity_extractor: FunctionalConnectivityExtractor | None = None,
    ) -> SessionFeatures:
        """Assemble a unified feature object from completed session derivatives."""

        resolved_metadata = SessionMetadata(
            subject_id=subject_id,
            session_id=session_id,
            age_years=None if metadata is None else metadata.get("age_years"),
            sex=None if metadata is None else metadata.get("sex"),
            diagnosis=None if metadata is None else metadata.get("diagnosis"),
            visit_type=None if metadata is None else metadata.get("visit_type"),
            scanner_site=None if metadata is None else metadata.get("scanner_site"),
            notes=None if metadata is None else metadata.get("notes"),
        )
        assembler = SessionFeatureAssembler(
            structural_normalizer=StructuralNormalizer(),
            connectivity_extractor=connectivity_extractor,
        )
        try:
            features = assembler.assemble_session_features(
                subject_id=subject_id,
                session_id=session_id,
                fastsurfer_output_dir=None if fastsurfer_output_dir is None else Path(fastsurfer_output_dir),
                fmriprep_derivatives_root=None if fmriprep_derivatives_root is None else Path(fmriprep_derivatives_root),
                metadata=resolved_metadata,
                connectivity_extractor=connectivity_extractor,
            )
            self._persist_session_features(features)
            return features
        except SessionFeatureError:
            raise
        except Exception as exc:  # pragma: no cover
            raise SessionFeatureError(f"Failed to assemble session features for sub-{subject_id}: {exc}") from exc

    def load_session_features(self, subject_id: str, session_id: str | None) -> SessionFeatures | None:
        """Load previously stored session features when storage is configured."""

        if self.storage is None:
            return None
        stored = self.storage.get_session_features(subject_id, session_id)
        if stored is None:
            return None
        return SessionFeatures.from_dict(stored.payload)

    def analyze_functional_connectivity(
        self,
        timeseries: Sequence[Sequence[float]] | None = None,
        bold_path: str | Path | None = None,
        labels: Sequence[str] | None = None,
    ) -> ConnectivityResult:
        """Run the legacy functional connectivity analysis stage."""

        return compute_functional_connectivity(timeseries=timeseries, bold_path=bold_path, labels=labels)

    def extract_functional_connectivity(
        self,
        derivatives_root: Path,
        subject_id: str,
        session_id: str | None = None,
        aggregate: bool = True,
        *,
        atlas_img: Path,
        atlas_labels: Sequence[str],
        atlas_name: str,
        space: str = "MNI152NLin2009cAsym",
        connectivity_kind: str = "correlation",
        confounds_strategy: str = "simple",
        low_pass: float | None = 0.1,
        high_pass: float | None = 0.01,
        t_r: float | None = None,
    ) -> ConnectivityBundle:
        """Extract fMRIPrep-based functional connectivity for one subject/session."""

        extractor = FunctionalConnectivityExtractor(
            atlas_img=Path(atlas_img),
            atlas_labels=list(atlas_labels),
            atlas_name=atlas_name,
            space=space,
            connectivity_kind=connectivity_kind,
            confounds_strategy=confounds_strategy,
            low_pass=low_pass,
            high_pass=high_pass,
            t_r=t_r,
        )
        return extractor.extract_subject_connectivity(
            derivatives_root=Path(derivatives_root),
            subject_id=subject_id,
            session_id=session_id,
            aggregate=aggregate,
        )

    def build_protocol_feature_view(
        self,
        condition: str,
        subject_id: str,
        session_id: str | None = None,
        *,
        fastsurfer_output_dir: Path | None = None,
        fmriprep_derivatives_root: Path | None = None,
        metadata: dict | None = None,
        connectivity_extractor: FunctionalConnectivityExtractor | None = None,
    ) -> ProtocolFeatureView:
        """Assemble canonical session features and select a protocol-specific view."""

        try:
            session_features = self.assemble_session_features(
                subject_id=subject_id,
                session_id=session_id,
                fastsurfer_output_dir=fastsurfer_output_dir,
                fmriprep_derivatives_root=fmriprep_derivatives_root,
                metadata=metadata,
                connectivity_extractor=connectivity_extractor,
            )
            selector = ProtocolFeatureSelector(version=session_features.version)
            view = selector.select(session_features, condition=condition)
            self._persist_protocol_feature_view(view)
            return view
        except (SessionFeatureError, ProtocolFeatureViewError):
            raise
        except Exception as exc:  # pragma: no cover
            raise ProtocolFeatureViewError(
                f"Failed to build protocol feature view for sub-{subject_id} and condition {condition}: {exc}"
            ) from exc

    def load_protocol_feature_view(
        self,
        subject_id: str,
        session_id: str | None,
        condition: str,
    ) -> ProtocolFeatureView | None:
        """Load a previously stored protocol feature view when storage is configured."""

        if self.storage is None:
            return None
        stored = self.storage.get_protocol_feature_view(subject_id, session_id, condition)
        if stored is None:
            return None
        return ProtocolFeatureView.from_dict(stored.payload)

    def build_protocol_evidence(
        self,
        feature_view: ProtocolFeatureView,
    ) -> ProtocolEvidenceBundle:
        """Build a structured evidence bundle from a protocol feature view."""

        try:
            bundle = ProtocolEvidenceBuilder(version=feature_view.version).build(feature_view)
            self._persist_protocol_evidence(bundle)
            return bundle
        except ProtocolEvidenceError:
            raise
        except Exception as exc:  # pragma: no cover
            raise ProtocolEvidenceError(
                f"Failed to build protocol evidence for sub-{feature_view.subject_id} and condition {feature_view.condition}: {exc}"
            ) from exc

    def build_protocol_evidence_for_condition(
        self,
        condition: str,
        subject_id: str,
        session_id: str | None = None,
        **kwargs: Any,
    ) -> ProtocolEvidenceBundle:
        """Assemble features, select a protocol view, then build protocol evidence."""

        feature_view = self.build_protocol_feature_view(
            condition=condition,
            subject_id=subject_id,
            session_id=session_id,
            **kwargs,
        )
        return self.build_protocol_evidence(feature_view)

    def build_recommendation_draft(
        self,
        evidence_bundle: ProtocolEvidenceBundle,
    ) -> RecommendationDraft:
        """Build and optionally persist a non-final recommendation draft."""

        try:
            draft = RecommendationDraftBuilder(version=evidence_bundle.version).build(evidence_bundle)
            self._persist_recommendation_draft(draft)
            return draft
        except RecommendationDraftError:
            raise
        except Exception as exc:  # pragma: no cover
            raise RecommendationDraftError(
                f"Failed to build recommendation draft for sub-{evidence_bundle.subject_id} and condition {evidence_bundle.condition}: {exc}"
            ) from exc

    def build_recommendation_draft_for_condition(
        self,
        condition: str,
        subject_id: str,
        session_id: str | None = None,
        **kwargs: Any,
    ) -> RecommendationDraft:
        """Assemble evidence and produce a non-final recommendation draft."""

        evidence_bundle = self.build_protocol_evidence_for_condition(
            condition=condition,
            subject_id=subject_id,
            session_id=session_id,
            **kwargs,
        )
        return self.build_recommendation_draft(evidence_bundle)

    def load_protocol_evidence(
        self,
        subject_id: str,
        session_id: str | None,
        condition: str,
    ) -> ProtocolEvidenceBundle | None:
        """Load previously stored protocol evidence when storage is configured."""

        if self.storage is None:
            return None
        stored = self.storage.get_protocol_evidence(subject_id, session_id, condition)
        if stored is None:
            return None
        return ProtocolEvidenceBundle.from_dict(stored.payload)

    def load_recommendation_draft(
        self,
        subject_id: str,
        session_id: str | None,
        condition: str,
    ) -> RecommendationDraft | None:
        """Load a previously stored recommendation draft when storage is configured."""

        if self.storage is None:
            return None
        stored = self.storage.get_recommendation_draft(subject_id, session_id, condition)
        if stored is None:
            return None
        return RecommendationDraft.from_dict(stored.payload)

    def initialize_draft_review(
        self,
        draft: RecommendationDraft,
        actor_id: str,
        actor_role: str | None = None,
    ) -> DraftReviewState:
        """Initialize review workflow state for a stored recommendation draft."""

        if self.storage is None:
            raise ReviewWorkflowError("Review workflow requires a configured storage backend.")
        stored_draft = self.storage.get_recommendation_draft(draft.subject_id, draft.session_id, draft.condition)
        if stored_draft is None:
            raise ReviewWorkflowError("Stored recommendation draft not found for review initialization.")
        manager = ReviewWorkflowManager()
        state = manager.initialize(draft, actor_id=actor_id, actor_role=actor_role)
        state = DraftReviewState(
            draft_id=stored_draft.id,
            subject_id=state.subject_id,
            session_id=state.session_id,
            condition=state.condition,
            current_status=state.current_status,
            reviewer_id=state.reviewer_id,
            reviewer_role=state.reviewer_role,
            last_updated_at=state.last_updated_at,
            actions=state.actions,
            final_recommendation_snapshot=state.final_recommendation_snapshot,
        )
        self._persist_review_state(state)
        return state

    def submit_recommendation_draft_for_review(
        self,
        draft_id: str,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
    ) -> DraftReviewState:
        """Transition a recommendation draft into active review."""

        return self._transition_review_state(
            draft_id=draft_id,
            transition="submit_for_review",
            actor_id=actor_id,
            actor_role=actor_role,
            rationale=rationale,
        )

    def approve_recommendation_draft(
        self,
        draft_id: str,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
        final_snapshot: dict[str, Any] | None = None,
    ) -> DraftReviewState:
        """Approve a recommendation draft under human review."""

        return self._transition_review_state(
            draft_id=draft_id,
            transition="approve",
            actor_id=actor_id,
            actor_role=actor_role,
            rationale=rationale,
            final_snapshot=final_snapshot,
        )

    def reject_recommendation_draft(
        self,
        draft_id: str,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
    ) -> DraftReviewState:
        """Reject a recommendation draft under review."""

        return self._transition_review_state(
            draft_id=draft_id,
            transition="reject",
            actor_id=actor_id,
            actor_role=actor_role,
            rationale=rationale,
        )

    def request_recommendation_draft_changes(
        self,
        draft_id: str,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
    ) -> DraftReviewState:
        """Request changes for a recommendation draft under review."""

        return self._transition_review_state(
            draft_id=draft_id,
            transition="request_changes",
            actor_id=actor_id,
            actor_role=actor_role,
            rationale=rationale,
        )

    def override_recommendation_draft(
        self,
        draft_id: str,
        actor_id: str,
        actor_role: str | None = None,
        rationale: str | None = None,
        final_snapshot: dict[str, Any] | None = None,
    ) -> DraftReviewState:
        """Override a recommendation draft under review or after approval."""

        return self._transition_review_state(
            draft_id=draft_id,
            transition="override",
            actor_id=actor_id,
            actor_role=actor_role,
            rationale=rationale,
            final_snapshot=final_snapshot,
        )

    def load_review_state(self, draft_id: str) -> DraftReviewState | None:
        """Load a persisted draft review state when storage is configured."""

        if self.storage is None:
            return None
        stored = self.storage.get_review_state(draft_id)
        if stored is None:
            return None
        return DraftReviewState.from_dict(stored.payload)

    def get_review_queue(self) -> ReviewQueueSnapshot:
        """Build the current actionable review queue from persisted workflow state."""

        if self.storage is None:
            raise ReviewQueueError("Review queue requires a configured storage backend.")
        stored_states = self.storage.list_review_states()
        states = [DraftReviewState.from_dict(stored.payload) for stored in stored_states]
        draft_lookup: dict[str, RecommendationDraft] = {}
        for stored_state, state in zip(stored_states, states):
            stored_draft = self.storage.get_recommendation_draft(
                stored_state.subject_id,
                stored_state.session_id,
                stored_state.condition,
            )
            if stored_draft is not None and stored_draft.id == stored_state.draft_id:
                draft_lookup[state.draft_id] = RecommendationDraft.from_dict(stored_draft.payload)
        return ReviewQueueManager().build_queue(states, recommendation_drafts=draft_lookup)

    def escalate_recommendation_draft(
        self,
        draft_id: str,
        reason: str,
        *,
        to_reviewer_id: str | None = None,
        to_queue: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> EscalationEvent:
        """Create and persist an escalation event for a review-state item."""

        if self.storage is None:
            raise ReviewQueueError("Escalation requires a configured storage backend.")
        state = self.load_review_state(draft_id)
        if state is None:
            raise ReviewQueueError(f"Review state not found for draft {draft_id}.")
        event = ReviewQueueManager().escalate(
            state,
            reason=reason,
            to_reviewer_id=to_reviewer_id,
            to_queue=to_queue,
            metadata=metadata,
        )
        self._persist_escalation_event(event, state)
        return event

    def list_escalation_events(self, draft_id: str | None = None) -> list[EscalationEvent]:
        """List persisted escalation events, optionally filtered by draft id."""

        if self.storage is None:
            raise ReviewQueueError("Escalation listing requires a configured storage backend.")
        return [
            EscalationEvent.from_dict(stored.payload)
            for stored in self.storage.list_escalation_events(draft_id)
        ]

    def orchestrate(
        self,
        bids_root: str | Path | None = None,
        dicom_input_dir: str | Path | None = None,
        conversion_output_dir: str | Path | None = None,
        preprocessing_output_root: str | Path | None = None,
        preprocessing_work_root: str | Path | None = None,
        participant_label: str | None = None,
        structural_t1w_path: str | Path | None = None,
        structural_subject_id: str | None = None,
        structural_subjects_dir: str | Path | None = None,
        connectivity_timeseries: Sequence[Sequence[float]] | None = None,
        connectivity_bold_path: str | Path | None = None,
        segmentation_volume_path: str | Path | None = None,
        segmentation_output_dir: str | Path | None = None,
        execute_external: bool = False,
    ) -> NeuroEngineRunResult:
        """Orchestrate the major neuroimaging stages behind a single façade."""

        result = NeuroEngineRunResult()
        if bids_root is not None:
            result.validation = self.validate_bids_dataset(bids_root)
        if dicom_input_dir is not None:
            output_dir = Path(conversion_output_dir) if conversion_output_dir else self.settings.output_root / "converted"
            result.conversion = self.convert_dicom_series(dicom_input_dir, output_dir)
        if bids_root is not None and preprocessing_output_root is not None and preprocessing_work_root is not None:
            result.preprocessing = self.run_preprocessing(
                bids_root=bids_root,
                output_root=preprocessing_output_root,
                work_root=preprocessing_work_root,
                participant_label=participant_label,
                execute=execute_external,
            )
        if structural_t1w_path is not None and structural_subject_id is not None and structural_subjects_dir is not None:
            result.structural = self.run_structural(
                t1w_path=structural_t1w_path,
                subject_id=structural_subject_id,
                subjects_dir=structural_subjects_dir,
                execute=execute_external,
            )
        if connectivity_timeseries is not None or connectivity_bold_path is not None:
            result.connectivity = self.analyze_functional_connectivity(
                timeseries=connectivity_timeseries,
                bold_path=connectivity_bold_path,
            )
        if segmentation_volume_path is not None:
            result.segmentation_bundle = {"status": "not_loaded"}
            result.segmentation = {"status": "not_run", "volume_path": str(segmentation_volume_path), "output_dir": None if segmentation_output_dir is None else str(segmentation_output_dir)}
        return result

    def _persist_session_features(self, features: SessionFeatures) -> None:
        """Persist session features when a storage backend is configured."""

        if self.storage is None:
            return
        current_time = datetime.now(timezone.utc)
        self.storage.save_session_features(
            StoredSessionFeatures(
                id=str(uuid4()),
                subject_id=features.subject_id,
                session_id=features.session_id,
                session_features_version=features.version,
                payload=features.to_dict(),
                created_at=current_time,
                updated_at=None,
            )
        )

    def _persist_protocol_feature_view(self, view: ProtocolFeatureView) -> None:
        """Persist a protocol feature view when a storage backend is configured."""

        if self.storage is None:
            return
        current_time = datetime.now(timezone.utc)
        self.storage.save_protocol_feature_view(
            StoredProtocolFeatureView(
                id=str(uuid4()),
                subject_id=view.subject_id,
                session_id=view.session_id,
                condition=view.condition,
                protocol_feature_view_version=view.version,
                payload=view.to_dict(),
                created_at=current_time,
                updated_at=None,
            )
        )

    def _persist_protocol_evidence(self, bundle: ProtocolEvidenceBundle) -> None:
        """Persist a protocol evidence bundle when a storage backend is configured."""

        if self.storage is None:
            return
        current_time = datetime.now(timezone.utc)
        self.storage.save_protocol_evidence(
            StoredProtocolEvidenceBundle(
                id=str(uuid4()),
                subject_id=bundle.subject_id,
                session_id=bundle.session_id,
                condition=bundle.condition,
                protocol_evidence_version=bundle.version,
                payload=bundle.to_dict(),
                created_at=current_time,
                updated_at=None,
            )
        )

    def _persist_recommendation_draft(self, draft: RecommendationDraft) -> None:
        """Persist a recommendation draft when a storage backend is configured."""

        if self.storage is None:
            return
        current_time = datetime.now(timezone.utc)
        self.storage.save_recommendation_draft(
            StoredRecommendationDraft(
                id=str(uuid4()),
                subject_id=draft.subject_id,
                session_id=draft.session_id,
                condition=draft.condition,
                recommendation_draft_version=draft.version,
                payload=draft.to_dict(),
                created_at=current_time,
                updated_at=None,
            )
        )

    def _persist_review_state(self, state: DraftReviewState) -> None:
        """Persist a draft review state when a storage backend is configured."""

        if self.storage is None:
            return
        current_time = datetime.now(timezone.utc)
        existing = self.storage.get_review_state(state.draft_id)
        self.storage.save_review_state(
            StoredDraftReviewState(
                id=str(uuid4()) if existing is None else existing.id,
                draft_id=state.draft_id,
                subject_id=state.subject_id,
                session_id=state.session_id,
                condition=state.condition,
                review_workflow_version="1.0.0",
                payload=state.to_dict(),
                created_at=current_time if existing is None else existing.created_at,
                updated_at=None if existing is None else current_time,
            )
        )

    def _persist_escalation_event(self, event: EscalationEvent, state: DraftReviewState) -> None:
        """Persist an escalation event when a storage backend is configured."""

        if self.storage is None:
            return
        current_time = datetime.now(timezone.utc)
        self.storage.save_escalation_event(
            StoredEscalationEvent(
                id=str(uuid4()),
                draft_id=event.draft_id,
                subject_id=state.subject_id,
                session_id=state.session_id,
                condition=state.condition,
                escalation_version="1.0.0",
                payload=event.to_dict(),
                created_at=current_time,
                updated_at=None,
            )
        )

    def _transition_review_state(
        self,
        *,
        draft_id: str,
        transition: str,
        actor_id: str,
        actor_role: str | None,
        rationale: str | None,
        final_snapshot: dict[str, Any] | None = None,
    ) -> DraftReviewState:
        """Load, transition, and persist a review state through the workflow manager."""

        if self.storage is None:
            raise ReviewWorkflowError("Review workflow requires a configured storage backend.")
        state = self.load_review_state(draft_id)
        if state is None:
            raise ReviewWorkflowError(f"Review state not found for draft {draft_id}.")
        manager = ReviewWorkflowManager()
        if transition == "submit_for_review":
            updated = manager.submit_for_review(state, actor_id=actor_id, actor_role=actor_role, rationale=rationale)
        elif transition == "approve":
            updated = manager.approve(state, actor_id=actor_id, actor_role=actor_role, rationale=rationale, final_snapshot=final_snapshot)
        elif transition == "reject":
            updated = manager.reject(state, actor_id=actor_id, actor_role=actor_role, rationale=rationale)
        elif transition == "request_changes":
            updated = manager.request_changes(state, actor_id=actor_id, actor_role=actor_role, rationale=rationale)
        elif transition == "override":
            updated = manager.override(state, actor_id=actor_id, actor_role=actor_role, rationale=rationale, final_snapshot=final_snapshot)
        else:  # pragma: no cover
            raise ReviewWorkflowError(f"Unsupported review transition: {transition}")
        self._persist_review_state(updated)
        return updated


__all__ = [
    "ConnectivityBundle",
    "ConnectivityMatrixSummary",
    "ConnectivityExtractionError",
    "ConnectivityResult",
    "ConnectivityRunResult",
    "EvidenceCitation",
    "EvidenceItem",
    "FunctionalConnectivityExtractor",
    "NeuroEngine",
    "NeuroEngineRunResult",
    "NeuroEngineStorage",
    "NeuroEngineSettings",
    "NormalizedStructuralRecord",
    "DraftReviewState",
    "EscalationEvent",
    "ProtocolEvidenceBuilder",
    "ProtocolEvidenceBundle",
    "ProtocolEvidenceError",
    "ProtocolFeature",
    "ProtocolFeatureSelector",
    "ProtocolFeatureView",
    "ProtocolFeatureViewError",
    "RecommendationDraft",
    "RecommendationDraftBuilder",
    "RecommendationDraftError",
    "RecommendationOption",
    "ReviewQueueError",
    "ReviewQueueManager",
    "ReviewQueueSnapshot",
    "ReviewWorkflowError",
    "ReviewWorkflowManager",
    "StoredEscalationEvent",
    "StoredDraftReviewState",
    "StoredProtocolEvidenceBundle",
    "StoredProtocolFeatureView",
    "StoredRecommendationDraft",
    "StoredSessionFeatures",
    "SessionFeatureAssembler",
    "SessionFeatureError",
    "SessionFeaturePresenter",
    "SessionFeatures",
    "SessionFeaturesFull",
    "SessionFeaturesLite",
    "SessionMetadata",
    "SessionPresentationError",
    "StructuralBiomarkerBundle",
    "StructuralBiomarkerError",
    "StructuralNormalizationError",
    "StructuralNormalizer",
    "load_settings",
]

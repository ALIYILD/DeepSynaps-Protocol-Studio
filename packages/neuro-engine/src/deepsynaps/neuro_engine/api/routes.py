"""FastAPI-compatible routes for the DeepSynaps Neuro Engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .. import NeuroEngine
from ..session.features import SessionFeatureError
from ..session.presenters import SessionFeaturePresenter, SessionPresentationError
from ..session.protocol_evidence import ProtocolEvidenceError
from ..session.recommendation_drafts import RecommendationDraftError
from ..session.review_queue import ReviewQueueError
from ..session.review_workflow import ReviewWorkflowError
from ..session.protocol_views import ProtocolFeatureViewError
from ..session.schemas import (
    DraftReviewStateSchema,
    EscalationEventSchema,
    ProtocolEvidenceBundleSchema,
    ProtocolFeatureViewSchema,
    RecommendationDraftSchema,
    ReviewQueueSnapshotSchema,
    SessionFeaturesFullSchema,
    SessionFeaturesLiteSchema,
)

try:
    from fastapi import APIRouter, FastAPI, HTTPException
except ImportError:  # pragma: no cover

    @dataclass(slots=True)
    class _Route:
        path: str
        methods: list[str]
        endpoint: Callable[..., Any]


    class APIRouter:
        def __init__(self, prefix: str = "", tags: list[str] | None = None) -> None:
            self.prefix = prefix
            self.tags = tags or []
            self.routes: list[_Route] = []

        def _register(self, path: str, methods: list[str]) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
                self.routes.append(_Route(path=f"{self.prefix}{path}", methods=methods, endpoint=func))
                return func

            return decorator

        def get(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return self._register(path, ["GET"])

        def post(self, path: str, **_: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
            return self._register(path, ["POST"])


    class FastAPI:
        def __init__(self, title: str, version: str) -> None:
            self.title = title
            self.version = version
            self.routes: list[_Route] = []

        def include_router(self, router: APIRouter) -> None:
            self.routes.extend(router.routes)


    class HTTPException(RuntimeError):
        def __init__(self, status_code: int, detail: str) -> None:
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail


def create_router(engine: NeuroEngine | None = None) -> APIRouter:
    """Create the neuro engine API router."""

    neuro_engine = engine or NeuroEngine()
    router = APIRouter(prefix="/neuro-engine", tags=["neuro-engine"])

    @router.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "service": "DeepSynaps Neuro Engine",
            "device": neuro_engine.settings.device,
        }

    @router.post("/session-features")
    def session_features(
        payload: dict[str, Any],
        view: str = "lite",
        include_raw_matrix: bool = True,
    ) -> dict[str, Any]:
        normalized_view = view.strip().lower()
        if normalized_view not in {"lite", "full"}:
            raise HTTPException(
                status_code=422,
                detail="Unsupported session feature view. Expected 'lite' or 'full'.",
            )

        try:
            features = neuro_engine.assemble_session_features(
                subject_id=payload["subject_id"],
                session_id=payload.get("session_id"),
                fastsurfer_output_dir=payload.get("fastsurfer_output_dir"),
                fmriprep_derivatives_root=payload.get("fmriprep_derivatives_root"),
                metadata=payload.get("metadata"),
                connectivity_extractor=payload.get("connectivity_extractor"),
            )
            presenter = SessionFeaturePresenter()
            if normalized_view == "lite":
                presented = presenter.to_lite(features)
                return (
                    SessionFeaturesLiteSchema.from_domain(presented).model_dump()
                    if hasattr(SessionFeaturesLiteSchema, "from_domain")
                    else presented.to_dict()
                )
            presented = presenter.to_full(features, include_raw_matrix=include_raw_matrix)
            return (
                SessionFeaturesFullSchema.from_domain(presented).model_dump()
                if hasattr(SessionFeaturesFullSchema, "from_domain")
                else presented.to_dict()
            )
        except (KeyError, SessionFeatureError, SessionPresentationError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/session-features/stored")
    def stored_session_features(subject_id: str, session_id: str | None = None) -> dict[str, Any]:
        stored = neuro_engine.load_session_features(subject_id, session_id)
        if stored is None:
            raise HTTPException(status_code=404, detail="Stored session features not found.")
        return stored.to_dict()

    @router.get("/protocol-features")
    def protocol_features(
        subject_id: str,
        condition: str,
        session_id: str | None = None,
        fastsurfer_output_dir: str | None = None,
        fmriprep_derivatives_root: str | None = None,
        age_years: float | None = None,
        sex: str | None = None,
        diagnosis: str | None = None,
        visit_type: str | None = None,
        scanner_site: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        metadata = {
            key: value
            for key, value in {
                "age_years": age_years,
                "sex": sex,
                "diagnosis": diagnosis,
                "visit_type": visit_type,
                "scanner_site": scanner_site,
                "notes": notes,
            }.items()
            if value is not None
        }
        try:
            view = neuro_engine.build_protocol_feature_view(
                condition=condition,
                subject_id=subject_id,
                session_id=session_id,
                fastsurfer_output_dir=fastsurfer_output_dir,
                fmriprep_derivatives_root=fmriprep_derivatives_root,
                metadata=metadata or None,
            )
            return (
                ProtocolFeatureViewSchema.from_domain(view).model_dump()
                if hasattr(ProtocolFeatureViewSchema, "from_domain")
                else view.to_dict()
            )
        except (ProtocolFeatureViewError, SessionFeatureError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/protocol-features/stored")
    def stored_protocol_features(
        subject_id: str,
        condition: str,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        stored = neuro_engine.load_protocol_feature_view(subject_id, session_id, condition)
        if stored is None:
            raise HTTPException(status_code=404, detail="Stored protocol feature view not found.")
        return (
            ProtocolFeatureViewSchema.from_domain(stored).model_dump()
            if hasattr(ProtocolFeatureViewSchema, "from_domain")
            else stored.to_dict()
        )

    @router.get("/protocol-evidence")
    def protocol_evidence(
        subject_id: str,
        condition: str,
        session_id: str | None = None,
        fastsurfer_output_dir: str | None = None,
        fmriprep_derivatives_root: str | None = None,
        age_years: float | None = None,
        sex: str | None = None,
        diagnosis: str | None = None,
        visit_type: str | None = None,
        scanner_site: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        metadata = {
            key: value
            for key, value in {
                "age_years": age_years,
                "sex": sex,
                "diagnosis": diagnosis,
                "visit_type": visit_type,
                "scanner_site": scanner_site,
                "notes": notes,
            }.items()
            if value is not None
        }
        try:
            bundle = neuro_engine.build_protocol_evidence_for_condition(
                condition=condition,
                subject_id=subject_id,
                session_id=session_id,
                fastsurfer_output_dir=fastsurfer_output_dir,
                fmriprep_derivatives_root=fmriprep_derivatives_root,
                metadata=metadata or None,
            )
            return (
                ProtocolEvidenceBundleSchema.from_domain(bundle).model_dump()
                if hasattr(ProtocolEvidenceBundleSchema, "from_domain")
                else bundle.to_dict()
            )
        except (ProtocolEvidenceError, ProtocolFeatureViewError, SessionFeatureError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/protocol-evidence/stored")
    def stored_protocol_evidence(
        subject_id: str,
        condition: str,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        stored = neuro_engine.load_protocol_evidence(subject_id, session_id, condition)
        if stored is None:
            raise HTTPException(status_code=404, detail="Stored protocol evidence not found.")
        return (
            ProtocolEvidenceBundleSchema.from_domain(stored).model_dump()
            if hasattr(ProtocolEvidenceBundleSchema, "from_domain")
            else stored.to_dict()
        )

    @router.get("/recommendation-draft")
    def recommendation_draft(
        subject_id: str,
        condition: str,
        session_id: str | None = None,
        fastsurfer_output_dir: str | None = None,
        fmriprep_derivatives_root: str | None = None,
        age_years: float | None = None,
        sex: str | None = None,
        diagnosis: str | None = None,
        visit_type: str | None = None,
        scanner_site: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        metadata = {
            key: value
            for key, value in {
                "age_years": age_years,
                "sex": sex,
                "diagnosis": diagnosis,
                "visit_type": visit_type,
                "scanner_site": scanner_site,
                "notes": notes,
            }.items()
            if value is not None
        }
        try:
            draft = neuro_engine.build_recommendation_draft_for_condition(
                condition=condition,
                subject_id=subject_id,
                session_id=session_id,
                fastsurfer_output_dir=fastsurfer_output_dir,
                fmriprep_derivatives_root=fmriprep_derivatives_root,
                metadata=metadata or None,
            )
            return (
                RecommendationDraftSchema.from_domain(draft).model_dump()
                if hasattr(RecommendationDraftSchema, "from_domain")
                else draft.to_dict()
            )
        except (
            RecommendationDraftError,
            ProtocolEvidenceError,
            ProtocolFeatureViewError,
            SessionFeatureError,
            ValueError,
        ) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/recommendation-draft/stored")
    def stored_recommendation_draft(
        subject_id: str,
        condition: str,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        stored = neuro_engine.load_recommendation_draft(subject_id, session_id, condition)
        if stored is None:
            raise HTTPException(status_code=404, detail="Stored recommendation draft not found.")
        return (
            RecommendationDraftSchema.from_domain(stored).model_dump()
            if hasattr(RecommendationDraftSchema, "from_domain")
            else stored.to_dict()
        )

    @router.get("/recommendation-draft/review-queue")
    def recommendation_draft_review_queue() -> dict[str, Any]:
        try:
            snapshot = neuro_engine.get_review_queue()
        except ReviewQueueError as exc:
            detail = str(exc)
            status_code = 503 if "storage backend" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            ReviewQueueSnapshotSchema.from_domain(snapshot).model_dump()
            if hasattr(ReviewQueueSnapshotSchema, "from_domain")
            else snapshot.to_dict()
        )

    @router.post("/recommendation-draft/review/init")
    def init_recommendation_draft_review(payload: dict[str, Any]) -> dict[str, Any]:
        draft = neuro_engine.load_recommendation_draft(
            payload["subject_id"],
            payload.get("session_id"),
            payload["condition"],
        )
        if draft is None:
            raise HTTPException(status_code=404, detail="Stored recommendation draft not found.")
        try:
            state = neuro_engine.initialize_draft_review(
                draft,
                actor_id=payload["actor_id"],
                actor_role=payload.get("actor_role"),
            )
        except ReviewWorkflowError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/recommendation-draft/review/submit")
    def submit_recommendation_draft_review(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            state = neuro_engine.submit_recommendation_draft_for_review(
                draft_id=payload["draft_id"],
                actor_id=payload["actor_id"],
                actor_role=payload.get("actor_role"),
                rationale=payload.get("rationale"),
            )
        except ReviewWorkflowError as exc:
            detail = str(exc)
            status_code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/recommendation-draft/review/approve")
    def approve_recommendation_draft_review(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            state = neuro_engine.approve_recommendation_draft(
                draft_id=payload["draft_id"],
                actor_id=payload["actor_id"],
                actor_role=payload.get("actor_role"),
                rationale=payload.get("rationale"),
                final_snapshot=payload.get("final_snapshot"),
            )
        except ReviewWorkflowError as exc:
            detail = str(exc)
            status_code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/recommendation-draft/review/reject")
    def reject_recommendation_draft_review(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            state = neuro_engine.reject_recommendation_draft(
                draft_id=payload["draft_id"],
                actor_id=payload["actor_id"],
                actor_role=payload.get("actor_role"),
                rationale=payload.get("rationale"),
            )
        except ReviewWorkflowError as exc:
            detail = str(exc)
            status_code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/recommendation-draft/review/request-changes")
    def request_recommendation_draft_review_changes(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            state = neuro_engine.request_recommendation_draft_changes(
                draft_id=payload["draft_id"],
                actor_id=payload["actor_id"],
                actor_role=payload.get("actor_role"),
                rationale=payload.get("rationale"),
            )
        except ReviewWorkflowError as exc:
            detail = str(exc)
            status_code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/recommendation-draft/review/override")
    def override_recommendation_draft_review(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            state = neuro_engine.override_recommendation_draft(
                draft_id=payload["draft_id"],
                actor_id=payload["actor_id"],
                actor_role=payload.get("actor_role"),
                rationale=payload.get("rationale"),
                final_snapshot=payload.get("final_snapshot"),
            )
        except ReviewWorkflowError as exc:
            detail = str(exc)
            status_code = 404 if "not found" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/recommendation-draft/review/escalate")
    def escalate_recommendation_draft_review(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            event = neuro_engine.escalate_recommendation_draft(
                draft_id=payload["draft_id"],
                reason=payload["reason"],
                to_reviewer_id=payload.get("to_reviewer_id"),
                to_queue=payload.get("to_queue"),
                metadata=payload.get("metadata"),
            )
        except ReviewQueueError as exc:
            detail = str(exc)
            if "not found" in detail.lower():
                status_code = 404
            elif "storage backend" in detail.lower():
                status_code = 503
            else:
                status_code = 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return (
            EscalationEventSchema.from_domain(event).model_dump()
            if hasattr(EscalationEventSchema, "from_domain")
            else event.to_dict()
        )

    @router.get("/recommendation-draft/review/escalations")
    def recommendation_draft_review_escalations(draft_id: str | None = None) -> list[dict[str, Any]]:
        try:
            events = neuro_engine.list_escalation_events(draft_id=draft_id)
        except ReviewQueueError as exc:
            detail = str(exc)
            status_code = 503 if "storage backend" in detail.lower() else 400
            raise HTTPException(status_code=status_code, detail=detail) from exc
        return [
            EscalationEventSchema.from_domain(event).model_dump()
            if hasattr(EscalationEventSchema, "from_domain")
            else event.to_dict()
            for event in events
        ]

    @router.get("/recommendation-draft/review/{draft_id}")
    def get_recommendation_draft_review_state(draft_id: str) -> dict[str, Any]:
        state = neuro_engine.load_review_state(draft_id)
        if state is None:
            raise HTTPException(status_code=404, detail="Draft review state not found.")
        return (
            DraftReviewStateSchema.from_domain(state).model_dump()
            if hasattr(DraftReviewStateSchema, "from_domain")
            else state.to_dict()
        )

    @router.post("/orchestrate")
    def orchestrate(payload: dict[str, Any]) -> dict[str, Any]:
        result = neuro_engine.orchestrate(
            bids_root=payload.get("bids_root"),
            dicom_input_dir=payload.get("dicom_input_dir"),
            conversion_output_dir=payload.get("conversion_output_dir"),
            preprocessing_output_root=payload.get("preprocessing_output_root"),
            preprocessing_work_root=payload.get("preprocessing_work_root"),
            participant_label=payload.get("participant_label"),
            structural_t1w_path=payload.get("structural_t1w_path"),
            structural_subject_id=payload.get("structural_subject_id"),
            structural_subjects_dir=payload.get("structural_subjects_dir"),
            connectivity_timeseries=payload.get("connectivity_timeseries"),
            connectivity_bold_path=payload.get("connectivity_bold_path"),
            segmentation_volume_path=payload.get("segmentation_volume_path"),
            segmentation_output_dir=payload.get("segmentation_output_dir"),
            execute_external=bool(payload.get("execute_external", False)),
        )
        return result.to_dict()

    return router


def create_app(engine: NeuroEngine | None = None) -> FastAPI:
    """Create a FastAPI-compatible app exposing the neuro engine routes."""

    app = FastAPI(title="DeepSynaps Neuro Engine", version="0.1.0")
    app.include_router(create_router(engine=engine))
    return app

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from deepsynaps_core_schema import ReviewActionRequest, ReviewActionResponse

from app.auth import AuthenticatedActor, require_minimum_role
from app.entitlements import require_feature
from app.packages import Feature
from app.registries.audit import AUDIT_DISCLAIMERS, AUDIT_EVENTS
from app.repositories.audit import create_audit_event, seed_audit_events


def record_review_action(
    payload: ReviewActionRequest,
    actor: AuthenticatedActor,
    session: Session,
) -> ReviewActionResponse:
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Review actions require clinician or admin role."],
    )
    require_feature(
        actor.package_id,
        Feature.REVIEW_QUEUE_PERSONAL,
        message="Review queue access requires Clinician Pro or higher.",
    )
    seed_audit_events(session, AUDIT_EVENTS)

    event = create_audit_event(
        session,
        event_id=f"evt-{uuid.uuid4().hex[:16]}",
        target_id=payload.target_id,
        target_type=payload.target_type,
        action=payload.action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=payload.note,
        created_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    )
    return ReviewActionResponse(event=event, disclaimers=AUDIT_DISCLAIMERS)

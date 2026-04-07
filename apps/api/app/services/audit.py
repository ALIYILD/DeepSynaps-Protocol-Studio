from sqlalchemy.orm import Session

from deepsynaps_core_schema import AuditTrailResponse

from app.auth import AuthenticatedActor, require_minimum_role
from app.registries.audit import AUDIT_DISCLAIMERS, AUDIT_EVENTS
from app.repositories.audit import list_audit_events, seed_audit_events


def get_audit_trail(actor: AuthenticatedActor, session: Session) -> AuditTrailResponse:
    require_minimum_role(
        actor,
        "admin",
        warnings=["Audit trail visibility is restricted to admin users."],
    )

    seed_audit_events(session, AUDIT_EVENTS)
    events = list_audit_events(session)
    return AuditTrailResponse(items=events, total=len(events), disclaimers=AUDIT_DISCLAIMERS)

from deepsynaps_core_schema import AuditEvent

from app.registries.shared import standard_disclaimers


AUDIT_EVENTS: list[AuditEvent] = [
    AuditEvent(
        event_id="evt-1001",
        target_id="e1",
        target_type="evidence",
        action="reviewed",
        role="clinician",
        note="Evidence note reviewed during protocol preparation.",
        created_at="2026-04-07T09:10:00Z",
    ),
    AuditEvent(
        event_id="evt-1002",
        target_id="upl-1",
        target_type="upload",
        action="escalated",
        role="clinician",
        note="Escalated upload due to unresolved red flags.",
        created_at="2026-04-07T09:31:00Z",
    ),
]

AUDIT_DISCLAIMERS = standard_disclaimers(include_draft=True, include_off_label=True)

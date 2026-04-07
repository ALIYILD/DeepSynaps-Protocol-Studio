from deepsynaps_core_schema import (
    HandbookGenerateRequest,
    HandbookGenerateResponse,
    ProtocolDraftRequest,
    ProtocolDraftResponse,
)

from app.auth import AuthenticatedActor, require_minimum_role
from app.services.clinical_data import (
    generate_handbook_from_clinical_data,
    generate_protocol_draft_from_clinical_data,
)


def generate_protocol_draft(payload: ProtocolDraftRequest, actor: AuthenticatedActor) -> ProtocolDraftResponse:
    return generate_protocol_draft_from_clinical_data(payload, actor)


def generate_handbook(payload: HandbookGenerateRequest, actor: AuthenticatedActor) -> HandbookGenerateResponse:
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Handbook generation is reserved for clinician and admin roles."],
    )
    return generate_handbook_from_clinical_data(payload, actor)

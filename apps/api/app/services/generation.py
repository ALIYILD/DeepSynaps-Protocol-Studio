from deepsynaps_core_schema import (
    HandbookGenerateRequest,
    HandbookGenerateResponse,
    ProtocolDraftRequest,
    ProtocolDraftResponse,
)

from app.auth import AuthenticatedActor, require_minimum_role
from app.entitlements import require_any_feature, require_feature
from app.errors import ApiServiceError
from app.packages import Feature
from app.services.clinical_data import (
    generate_handbook_from_clinical_data,
    generate_protocol_draft_from_clinical_data,
)


def generate_protocol_draft(payload: ProtocolDraftRequest, actor: AuthenticatedActor) -> ProtocolDraftResponse:
    # 1. Governance check first — preserves forbidden_off_label code for existing tests
    if payload.off_label and actor.role == "guest":
        raise ApiServiceError(
            code="forbidden_off_label",
            message="Guest users cannot access off-label mode.",
            warnings=["Off-label pathways require independent clinical review."],
            status_code=403,
        )
    # 2. Package entitlement check
    require_any_feature(
        actor.package_id,
        Feature.PROTOCOL_GENERATE,
        Feature.PROTOCOL_GENERATE_LIMITED,
        message="Protocol generation requires Resident / Fellow or higher.",
    )
    return generate_protocol_draft_from_clinical_data(payload, actor)


def generate_handbook(payload: HandbookGenerateRequest, actor: AuthenticatedActor) -> HandbookGenerateResponse:
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Handbook generation is reserved for clinician and admin roles."],
    )
    require_any_feature(
        actor.package_id,
        Feature.HANDBOOK_GENERATE_FULL,
        Feature.HANDBOOK_GENERATE_LIMITED,
        message="Handbook generation requires Resident / Fellow or higher.",
    )
    return generate_handbook_from_clinical_data(payload, actor)

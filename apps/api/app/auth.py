from dataclasses import dataclass
from typing import Iterable

from fastapi import Header

from deepsynaps_core_schema import UserRole

from app.errors import ApiServiceError
from app.registries.auth import ANONYMOUS_ACTOR, DEMO_ACTOR_TOKENS


@dataclass(frozen=True, slots=True)
class AuthenticatedActor:
    actor_id: str
    display_name: str
    role: UserRole
    token_id: str | None = None


ROLE_ORDER: dict[UserRole, int] = {
    "guest": 0,
    "clinician": 1,
    "admin": 2,
}


def get_authenticated_actor(authorization: str | None = Header(default=None)) -> AuthenticatedActor:
    token = _extract_bearer_token(authorization)
    if token is None:
        return AuthenticatedActor(
            actor_id=ANONYMOUS_ACTOR.actor_id,
            display_name=ANONYMOUS_ACTOR.display_name,
            role=ANONYMOUS_ACTOR.role,
        )

    actor = DEMO_ACTOR_TOKENS.get(token)
    if actor is None:
        raise ApiServiceError(
            code="invalid_auth_token",
            message="The provided demo authentication token is not recognized.",
            warnings=["Use a supported Bearer token for guest, clinician, or admin demo access."],
            status_code=401,
        )

    return AuthenticatedActor(
        actor_id=actor.actor_id,
        display_name=actor.display_name,
        role=actor.role,
        token_id=token,
    )


def require_minimum_role(actor: AuthenticatedActor, minimum_role: UserRole, warnings: Iterable[str] | None = None) -> None:
    if ROLE_ORDER[actor.role] >= ROLE_ORDER[minimum_role]:
        return

    raise ApiServiceError(
        code="insufficient_role",
        message=f"{minimum_role.title()} access is required for this action.",
        warnings=list(warnings or []),
        status_code=403,
    )


def _extract_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiServiceError(
            code="invalid_auth_header",
            message="Authorization header must use the Bearer scheme.",
            warnings=["Format the header as 'Authorization: Bearer <token>'."],
            status_code=401,
        )
    return token.strip()

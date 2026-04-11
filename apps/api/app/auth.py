from dataclasses import dataclass
from typing import Iterable

from fastapi import Header

from deepsynaps_core_schema import UserRole

from app.errors import ApiServiceError
from app.registries.auth import ANONYMOUS_ACTOR, DEMO_ACTOR_TOKENS
from app.settings import get_settings


@dataclass(frozen=True, slots=True)
class AuthenticatedActor:
    actor_id: str
    display_name: str
    role: UserRole
    package_id: str = "explorer"
    token_id: str | None = None


ROLE_ORDER: dict[UserRole, int] = {
    "guest": 0,
    "patient": 0,
    "technician": 1,
    "reviewer": 1,
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
            package_id=ANONYMOUS_ACTOR.package_id,
        )

    # Demo tokens are only honored in development and test environments.
    # In production/staging, every request must carry a real JWT.
    _settings = get_settings()
    if _settings.app_env in ("development", "test"):
        demo_actor = DEMO_ACTOR_TOKENS.get(token)
        if demo_actor is not None:
            return AuthenticatedActor(
                actor_id=demo_actor.actor_id,
                display_name=demo_actor.display_name,
                role=demo_actor.role,
                package_id=demo_actor.package_id,
                token_id=token,
            )

    # Try real JWT
    try:
        from app.services.auth_service import decode_token
        from app.database import SessionLocal
        from app.repositories.users import get_user_by_id

        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
            if user_id:
                db = SessionLocal()
                try:
                    user = get_user_by_id(db, user_id)
                finally:
                    db.close()
                display_name = user.display_name if user else payload.get("email", "User")
                role = payload.get("role", "guest")
                package_id = payload.get("package_id", "explorer")
                return AuthenticatedActor(
                    actor_id=user_id,
                    display_name=display_name,
                    role=role,
                    package_id=package_id,
                    token_id=token,
                )
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).warning("JWT decode failed: %s: %s", type(e).__name__, e)

    raise ApiServiceError(
        code="invalid_auth_token",
        message="The provided authentication token is not valid.",
        warnings=["Log in again to obtain a fresh token."],
        status_code=401,
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

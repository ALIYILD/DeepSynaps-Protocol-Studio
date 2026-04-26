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
    # Tenant scope. None for guests, admins (cross-clinic by definition),
    # demo actors that aren't bound to a real Clinic row, and any user whose
    # `users.clinic_id` column is NULL. Surfaced through the JWT `clinic_id`
    # claim — see services/auth_service.create_access_token.
    clinic_id: str | None = None


ROLE_ORDER: dict[UserRole, int] = {
    "guest": 0,
    "patient": 1,
    "technician": 2,
    "reviewer": 3,
    "clinician": 4,
    "admin": 5,
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
                clinic_id=getattr(demo_actor, "clinic_id", None),
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
                # Prefer the live DB column over the cached JWT claim — clinic
                # assignment can change after token mint (e.g. invite accept).
                clinic_id = (
                    user.clinic_id if user is not None and user.clinic_id else payload.get("clinic_id")
                )
                return AuthenticatedActor(
                    actor_id=user_id,
                    display_name=display_name,
                    role=role,
                    package_id=package_id,
                    token_id=token,
                    clinic_id=clinic_id,
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


def require_patient_owner(
    actor: AuthenticatedActor,
    patient_clinic_id: str | None,
    *,
    allow_admin: bool = True,
) -> None:
    """Enforce that ``actor`` belongs to the same clinic as the patient.

    Rules (in order):

    * ``guest`` actors are always denied — patient-scoped data is never
      readable without an authenticated, role-bearing identity.
    * ``admin`` actors bypass when ``allow_admin=True``. They are
      cross-clinic by design (platform operators / clinic owners).
    * ``patient`` actors must belong to the same clinic as the patient
      they are reading (so they cannot read across-clinic records).
    * ``clinician`` / ``reviewer`` / ``technician`` actors must have
      ``actor.clinic_id == patient_clinic_id``.
    * If ``patient_clinic_id`` is ``None`` (orphaned / system-owned record),
      only an admin (with ``allow_admin=True``) passes.

    Raises ``ApiServiceError(code="cross_clinic_access_denied",
    status_code=403)`` on mismatch.
    """
    if actor.role == "guest":
        raise ApiServiceError(
            code="cross_clinic_access_denied",
            message="Guest actors cannot access patient-scoped data.",
            status_code=403,
        )

    if allow_admin and actor.role == "admin":
        return

    if patient_clinic_id is None:
        # Orphaned patient or system-owned record. No one but admin (handled
        # above) is permitted to look at it via this gate.
        raise ApiServiceError(
            code="cross_clinic_access_denied",
            message="This record is not scoped to a clinic and cannot be accessed.",
            status_code=403,
        )

    if actor.clinic_id is None or actor.clinic_id != patient_clinic_id:
        raise ApiServiceError(
            code="cross_clinic_access_denied",
            message="This patient belongs to a different clinic.",
            warnings=["You can only access patients from your own clinic."],
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

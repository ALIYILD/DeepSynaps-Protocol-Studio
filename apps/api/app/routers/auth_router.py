from __future__ import annotations

import json
import logging
import re
import secrets as _secrets
import string
from datetime import datetime, timedelta, timezone

import pyotp
from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db_session
from ..errors import ApiServiceError
from ..registries.auth import DEMO_ACTOR_TOKENS
from ..repositories.users import (
    create_subscription,
    create_user,
    get_user_by_email,
    get_user_by_id,
)
from ..services import auth_service
from ..persistence.models import (
    PasswordResetToken,
    PatientInvite,
    User,
    User2FASecret,
    UserSession,
)
from ..settings import get_settings
from ..limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["auth"])

# ── Pydantic models ────────────────────────────────────────────────────────────

_ALLOWED_SELF_REGISTER_ROLES = {"guest", "clinician", "technician", "reviewer"}


class RegisterRequest(BaseModel):
    email: str
    display_name: str
    password: str  # min 8 chars
    role: str = "clinician"  # default role for professional self-signup


class LoginRequest(BaseModel):
    email: str
    password: str


class UserProfile(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    package_id: str
    is_verified: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


# ── Settings API request/response models ──────────────────────────────────────


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    qr_uri: str
    backup_codes: list[str]


class TwoFactorVerifyRequest(BaseModel):
    code: str


class TwoFactorVerifyResponse(BaseModel):
    enabled: bool


class TwoFactorDisableRequest(BaseModel):
    password: str
    code: str


class SessionItem(BaseModel):
    id: str
    user_agent: str
    ip_address: str
    created_at: str
    last_seen_at: str
    is_current: bool


class SessionsListResponse(BaseModel):
    items: list[SessionItem]


class SessionRevokedResponse(BaseModel):
    message: str


class OthersRevokedResponse(BaseModel):
    revoked_count: int


# ── Helpers ────────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(email: str) -> None:
    if not _EMAIL_RE.match(email):
        raise ApiServiceError(
            code="invalid_email",
            message="The provided email address is not valid.",
            warnings=["Provide a valid email address in the format user@domain.com."],
            status_code=400,
        )


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise ApiServiceError(
            code="password_too_short",
            message="Password must be at least 8 characters long.",
            warnings=["Choose a password with 8 or more characters."],
            status_code=400,
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


def _require_current_user(
    authorization: str | None,
    db: Session,
) -> User:
    """Resolve the authenticated user's DB row from the Authorization header.

    Used by the Settings API endpoints (password change, 2FA, sessions) which
    operate on concrete `users` rows — demo tokens don't map to a DB row and
    so are rejected here with 401.
    """
    token = _extract_bearer_token(authorization)
    if token is None:
        raise ApiServiceError(
            code="missing_auth_token",
            message="Authentication is required.",
            warnings=["Provide an 'Authorization: Bearer <token>' header."],
            status_code=401,
        )
    payload = auth_service.decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise ApiServiceError(
            code="invalid_auth_token",
            message="The provided authentication token is invalid or has expired.",
            warnings=["Log in again to obtain a fresh token."],
            status_code=401,
        )
    user_id = payload.get("sub") or ""
    if not user_id or user_id in {a.actor_id for a in DEMO_ACTOR_TOKENS.values()}:
        raise ApiServiceError(
            code="not_a_real_user",
            message="Demo tokens cannot modify account settings.",
            warnings=["Log in with a real account to manage credentials."],
            status_code=401,
        )
    user = get_user_by_id(db, user_id)
    if user is None:
        raise ApiServiceError(
            code="user_not_found",
            message="The user associated with this token no longer exists.",
            warnings=["Please log in again."],
            status_code=401,
        )
    return user


def _record_user_session(
    db: Session,
    *,
    user_id: str,
    refresh_token: str,
    request: Request | None,
) -> None:
    """Create a UserSession row for a newly-issued refresh token. Best-effort —
    swallow any failure so that a broken session-tracking step never blocks
    login/register/refresh. Existing stateless JWTs continue to work even if
    this call does not persist a row.
    """
    try:
        ua = ""
        ip = ""
        if request is not None:
            ua = (request.headers.get("user-agent") or "")[:512]
            ip = (request.client.host if request.client else "") or ""
        db.add(
            UserSession(
                user_id=user_id,
                refresh_token_hash=auth_service.hash_refresh_token(refresh_token),
                user_agent=ua,
                ip_address=ip[:64],
            )
        )
        db.commit()
    except Exception:  # pragma: no cover — best-effort
        logger.warning("Failed to record UserSession for user %s", user_id, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


def _touch_user_session(
    db: Session,
    *,
    old_refresh_token: str,
    new_refresh_token: str,
    user_id: str,
    request: Request | None,
) -> None:
    """Rotate the `refresh_token_hash` on /auth/refresh so the session row
    continues to track the most recent refresh token. Best-effort."""
    try:
        old_hash = auth_service.hash_refresh_token(old_refresh_token)
        row = db.scalar(select(UserSession).where(UserSession.refresh_token_hash == old_hash))
        now = datetime.now(timezone.utc)
        if row is not None:
            row.refresh_token_hash = auth_service.hash_refresh_token(new_refresh_token)
            row.last_seen_at = now
            db.commit()
        else:
            # Row didn't exist (old refresh was issued before session tracking
            # went live, or an aborted rotation). Create one so future refreshes
            # are trackable.
            _record_user_session(
                db, user_id=user_id, refresh_token=new_refresh_token, request=request
            )
    except Exception:  # pragma: no cover
        logger.warning("Failed to touch UserSession for user %s", user_id, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


def _revoke_all_sessions_except_current(
    db: Session,
    *,
    user_id: str,
    current_hash: str | None,
) -> int:
    """Mark every non-revoked UserSession for user as revoked_at=now, except
    the row matching `current_hash`. Returns count revoked."""
    rows = db.scalars(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    ).all()
    now = datetime.now(timezone.utc)
    count = 0
    for row in rows:
        if current_hash is not None and row.refresh_token_hash == current_hash:
            continue
        row.revoked_at = now
        count += 1
    if count:
        db.commit()
    return count


def _generate_backup_codes(n: int = 10) -> list[str]:
    """Generate `n` 8-char alphanumeric (upper) backup codes."""
    alphabet = string.ascii_uppercase + string.digits
    return ["".join(_secrets.choice(alphabet) for _ in range(8)) for _ in range(n)]


def _hash_backup_codes(codes: list[str]) -> str:
    """Bcrypt-hash each backup code. Stored as a JSON list of hashes so a
    code can be consumed (popped + rewritten) when used."""
    import bcrypt as _bcrypt_lib
    hashed = []
    for code in codes:
        # Bcrypt input limit is 72 bytes; 8-char codes are fine without prehash.
        hashed.append(
            _bcrypt_lib.hashpw(code.encode("utf-8"), _bcrypt_lib.gensalt()).decode("utf-8")
        )
    return json.dumps(hashed)


def _write_audit(
    db: Session,
    *,
    target_id: str,
    target_type: str,
    action: str,
    role: str,
    actor_id: str,
    note: str = "",
) -> None:
    """Best-effort audit write. Never blocks the primary mutation."""
    try:
        from ..repositories.audit import create_audit_event
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        create_audit_event(
            db,
            event_id=f"{action}-{target_id}-{int(datetime.now(timezone.utc).timestamp()*1000)}",
            target_id=target_id,
            target_type=target_type,
            action=action,
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=now_iso,
        )
    except Exception:  # pragma: no cover
        logger.warning("Audit write failed for action=%s target=%s", action, target_id, exc_info=True)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@limiter.limit("5/minute")
@router.post("/api/v1/auth/register", response_model=TokenResponse, status_code=201)
def register(
    request: Request,
    body: RegisterRequest,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    _validate_email(body.email)
    _validate_password(body.password)

    # Restrict self-registration to safe roles only; ignore unknown roles.
    assigned_role = body.role if body.role in _ALLOWED_SELF_REGISTER_ROLES else "clinician"

    existing = get_user_by_email(db, body.email)
    if existing is not None:
        raise ApiServiceError(
            code="email_already_registered",
            message="An account with this email address already exists.",
            warnings=["Try logging in, or use a different email address."],
            status_code=409,
        )

    hashed_pw = auth_service.hash_password(body.password)
    user = create_user(
        db,
        email=body.email,
        display_name=body.display_name,
        hashed_password=hashed_pw,
        role=assigned_role,
        package_id="explorer",
    )
    create_subscription(db, user_id=user.id, package_id="explorer")

    access_token = auth_service.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        package_id=user.package_id,
    )
    refresh_token = auth_service.create_refresh_token(user_id=user.id)
    _record_user_session(db, user_id=user.id, refresh_token=refresh_token, request=request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            package_id=user.package_id,
            is_verified=user.is_verified,
        ),
    )


@limiter.limit("10/minute")
@router.post("/api/v1/auth/login", response_model=TokenResponse)
def login(
    request: Request,
    body: LoginRequest,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    user = get_user_by_email(db, body.email)
    if user is None or not auth_service.verify_password(body.password, user.hashed_password):
        raise ApiServiceError(
            code="invalid_credentials",
            message="Incorrect email or password.",
            warnings=["Check your email and password and try again."],
            status_code=401,
        )

    if not user.is_active:
        raise ApiServiceError(
            code="account_inactive",
            message="This account has been deactivated.",
            warnings=["Contact support if you believe this is an error."],
            status_code=401,
        )

    access_token = auth_service.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        package_id=user.package_id,
    )
    refresh_token = auth_service.create_refresh_token(user_id=user.id)
    _record_user_session(db, user_id=user.id, refresh_token=refresh_token, request=request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            package_id=user.package_id,
            is_verified=user.is_verified,
        ),
    )


@limiter.limit("20/minute")
@router.post("/api/v1/auth/refresh", response_model=TokenResponse)
def refresh_token(
    request: Request,
    body: RefreshRequest,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    payload = auth_service.decode_token(body.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise ApiServiceError(
            code="invalid_refresh_token",
            message="The refresh token is invalid or has expired.",
            warnings=["Log in again to obtain a new token pair."],
            status_code=401,
        )

    user_id = payload.get("sub")
    user = get_user_by_id(db, user_id) if user_id else None
    if user is None:
        raise ApiServiceError(
            code="user_not_found",
            message="The user associated with this token no longer exists.",
            warnings=["Please register or contact support."],
            status_code=401,
        )

    if not user.is_active:
        raise ApiServiceError(
            code="account_inactive",
            message="This account has been deactivated.",
            warnings=["Contact support if you believe this is an error."],
            status_code=401,
        )

    new_access_token = auth_service.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        package_id=user.package_id,
    )

    new_refresh_token = auth_service.create_refresh_token(user_id=user.id)
    _touch_user_session(
        db,
        old_refresh_token=body.refresh_token,
        new_refresh_token=new_refresh_token,
        user_id=user.id,
        request=request,
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user=UserProfile(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            package_id=user.package_id,
            is_verified=user.is_verified,
        ),
    )


@router.get("/api/v1/auth/me", response_model=UserProfile)
def me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> UserProfile:
    token = _extract_bearer_token(authorization)
    if token is None:
        raise ApiServiceError(
            code="missing_auth_token",
            message="Authentication is required.",
            warnings=["Provide an 'Authorization: Bearer <token>' header."],
            status_code=401,
        )

    # Demo tokens are only honored in development and test environments.
    if get_settings().app_env in ("development", "test"):
        demo_actor = DEMO_ACTOR_TOKENS.get(token)
        if demo_actor is not None:
            return UserProfile(
                id=demo_actor.actor_id,
                email=f"{demo_actor.actor_id}@demo.local",
                display_name=demo_actor.display_name,
                role=demo_actor.role,
                package_id=demo_actor.package_id,
                is_verified=True,
            )

    # Try to decode as a real JWT.
    payload = auth_service.decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise ApiServiceError(
            code="invalid_auth_token",
            message="The provided authentication token is invalid or has expired.",
            warnings=["Log in again to obtain a fresh token."],
            status_code=401,
        )

    user_id = payload.get("sub", "")

    # Demo actor JWTs (issued by /auth/demo-login) — no DB row needed.
    if user_id in {a.actor_id for a in DEMO_ACTOR_TOKENS.values()}:
        return UserProfile(
            id=user_id,
            email=payload.get("email", f"{user_id}@demo.local"),
            display_name=next(
                (a.display_name for a in DEMO_ACTOR_TOKENS.values() if a.actor_id == user_id),
                "Demo User",
            ),
            role=payload.get("role", "guest"),
            package_id=payload.get("package_id", "explorer"),
            is_verified=True,
        )

    user = get_user_by_id(db, user_id) if user_id else None
    if user is None:
        raise ApiServiceError(
            code="user_not_found",
            message="The user associated with this token no longer exists.",
            warnings=["Please register or contact support."],
            status_code=401,
        )

    return UserProfile(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        package_id=user.package_id,
        is_verified=user.is_verified,
    )


@router.post("/api/v1/auth/logout", response_model=MessageResponse)
def logout() -> MessageResponse:
    # Token invalidation is client-side; server issues no-op acknowledgement.
    return MessageResponse(message="Successfully logged out.")


class DemoLoginRequest(BaseModel):
    token: str


@router.post("/api/v1/auth/demo-login", response_model=TokenResponse)
def demo_login(body: DemoLoginRequest) -> TokenResponse:
    """Issue real JWTs for demo roles — works in all environments."""
    demo = DEMO_ACTOR_TOKENS.get(body.token)
    if demo is None:
        raise ApiServiceError(
            code="invalid_demo_token",
            message="Unknown demo token.",
            status_code=400,
        )
    access_token  = auth_service.create_access_token(
        user_id=demo.actor_id,
        email=f"{demo.actor_id}@demo.local",
        role=demo.role,
        package_id=demo.package_id,
    )
    refresh_token = auth_service.create_refresh_token(demo.actor_id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=demo.actor_id,
            email=f"{demo.actor_id}@demo.local",
            display_name=demo.display_name,
            role=demo.role,
            package_id=demo.package_id,
            is_verified=True,
        ),
    )


@limiter.limit("3/minute")
@router.post("/api/v1/auth/forgot-password", response_model=MessageResponse)
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db_session),
) -> MessageResponse:
    user = get_user_by_email(db, body.email)
    # Always return success to avoid email enumeration.
    if user is None:
        return MessageResponse(
            message="If an account with that email exists, a reset link has been sent."
        )

    raw_token, token_hash = auth_service.generate_password_reset_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset_record)
    db.commit()

    # Log only the first 8 characters so the token cannot be extracted from logs.
    # Replace this block with real email dispatch when the email service is wired.
    logger.info(
        "Password reset token issued for user %s: %s... (expires %s)",
        user.email,
        raw_token[:8],
        expires_at.isoformat(),
    )

    return MessageResponse(
        message="If an account with that email exists, a reset link has been sent."
    )


@limiter.limit("5/minute")
@router.post("/api/v1/auth/reset-password", response_model=MessageResponse)
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
) -> MessageResponse:
    _validate_password(body.new_password)

    token_hash = auth_service.hash_reset_token(body.token)

    reset_record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )

    if reset_record is None:
        raise ApiServiceError(
            code="invalid_reset_token",
            message="The password reset token is invalid.",
            warnings=["Request a new password reset link."],
            status_code=400,
        )

    if reset_record.used_at is not None:
        raise ApiServiceError(
            code="reset_token_already_used",
            message="This password reset token has already been used.",
            warnings=["Request a new password reset link."],
            status_code=400,
        )

    reset_expires_utc = reset_record.expires_at if reset_record.expires_at.tzinfo else reset_record.expires_at.replace(tzinfo=timezone.utc)
    if reset_expires_utc < datetime.now(timezone.utc):
        raise ApiServiceError(
            code="reset_token_expired",
            message="This password reset token has expired.",
            warnings=["Request a new password reset link."],
            status_code=400,
        )

    user = get_user_by_id(db, reset_record.user_id)
    if user is None:
        raise ApiServiceError(
            code="user_not_found",
            message="The user associated with this reset token no longer exists.",
            warnings=["Please register or contact support."],
            status_code=400,
        )

    user.hashed_password = auth_service.hash_password(body.new_password)
    reset_record.used_at = datetime.now(timezone.utc)
    db.commit()

    return MessageResponse(message="Password has been reset successfully.")


# ── Patient Activation ─────────────────────────────────────────────────────────


class ActivatePatientRequest(BaseModel):
    invite_code: str
    email: str
    display_name: str
    password: str


@limiter.limit("5/minute")
@router.post("/api/v1/auth/activate-patient", response_model=TokenResponse, status_code=201)
def activate_patient(
    request: Request,
    body: ActivatePatientRequest,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    """Validate a patient invite code and create a patient user account."""
    _validate_email(body.email)
    _validate_password(body.password)

    invite = db.scalar(
        select(PatientInvite).where(PatientInvite.invite_code == body.invite_code)
    )
    if invite is None:
        raise ApiServiceError(
            code="invalid_invite_code",
            message="The invitation code is not valid.",
            warnings=["Check your invitation code and try again."],
            status_code=400,
        )

    if invite.used_at is not None:
        raise ApiServiceError(
            code="invite_already_used",
            message="This invitation code has already been used.",
            warnings=["Contact your clinic for a new invitation."],
            status_code=400,
        )

    expires_at_utc = invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=timezone.utc)
    if expires_at_utc < datetime.now(timezone.utc):
        raise ApiServiceError(
            code="invite_expired",
            message="This invitation code has expired.",
            warnings=["Contact your clinic for a new invitation."],
            status_code=400,
        )

    existing = get_user_by_email(db, body.email)
    if existing is not None:
        raise ApiServiceError(
            code="email_already_registered",
            message="An account with this email address already exists.",
            warnings=["Try logging in, or contact your clinic."],
            status_code=409,
        )

    hashed_pw = auth_service.hash_password(body.password)
    user = create_user(
        db,
        email=body.email,
        display_name=body.display_name,
        hashed_password=hashed_pw,
        role="patient",
        package_id="explorer",
    )
    create_subscription(db, user_id=user.id, package_id="explorer")

    # Mark invite as used and link to the newly created user
    invite.used_at = datetime.now(timezone.utc)
    invite.activated_user_id = user.id

    # If the invite has a patient_email different from the activation email,
    # update the Patient record's email so the portal email-match works.
    if invite.patient_email and invite.patient_email.lower() != body.email.lower():
        from app.persistence.models import Patient
        linked_patient = db.query(Patient).filter(
            Patient.email == invite.patient_email
        ).first()
        if linked_patient is not None:
            linked_patient.email = body.email

    db.commit()

    access_token = auth_service.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        package_id=user.package_id,
    )
    refresh_token = auth_service.create_refresh_token(user_id=user.id)
    _record_user_session(db, user_id=user.id, refresh_token=refresh_token, request=request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            package_id=user.package_id,
            is_verified=user.is_verified,
        ),
    )


# ── Settings API: password / 2FA / session management ────────────────────────


def _current_refresh_hash_from_request(body_refresh: str | None) -> str | None:
    """Best-effort extraction of the current session's refresh-token hash.
    We accept an optional refresh_token hint in request headers. Returns None
    when unavailable — callers should treat 'current session' as 'unknown',
    which means password-change revokes *everything* to be safe."""
    if body_refresh:
        return auth_service.hash_refresh_token(body_refresh)
    return None


@limiter.limit("5/minute")
@router.patch("/api/v1/auth/password", response_model=MessageResponse)
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    authorization: str | None = Header(default=None),
    x_refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
    db: Session = Depends(get_db_session),
) -> MessageResponse:
    """Change the authenticated user's password.

    * Verifies current password against the stored bcrypt hash.
    * New password must be >= 10 chars and different from the current one.
    * All OTHER sessions are revoked (the current one stays active —
      identified by the optional `X-Refresh-Token` header; if not supplied
      every session is revoked defensively).
    """
    user = _require_current_user(authorization, db)

    if not auth_service.verify_password(body.current_password, user.hashed_password):
        raise ApiServiceError(
            code="invalid_current_password",
            message="The current password is incorrect.",
            warnings=["Double-check your password and try again."],
            status_code=401,
        )

    if len(body.new_password) < 10:
        raise ApiServiceError(
            code="password_too_short",
            message="New password must be at least 10 characters long.",
            warnings=["Choose a password with 10 or more characters."],
            status_code=400,
        )

    if body.new_password == body.current_password:
        raise ApiServiceError(
            code="password_unchanged",
            message="The new password must differ from the current password.",
            warnings=["Pick a different password."],
            status_code=400,
        )

    user.hashed_password = auth_service.hash_password(body.new_password)
    db.commit()

    current_hash = _current_refresh_hash_from_request(x_refresh_token)
    _revoke_all_sessions_except_current(db, user_id=user.id, current_hash=current_hash)

    _write_audit(
        db,
        target_id=user.id,
        target_type="user",
        action="password_changed",
        role=user.role,
        actor_id=user.id,
        note="self-service",
    )

    return MessageResponse(message="Password updated")


# ── 2FA (TOTP) ───────────────────────────────────────────────────────────────


@router.post("/api/v1/auth/2fa/setup", response_model=TwoFactorSetupResponse)
def twofa_setup(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> TwoFactorSetupResponse:
    """Begin 2FA enrollment.

    Generates a new TOTP secret + 10 one-time backup codes. The secret is
    Fernet-encrypted at rest; the backup codes are bcrypt-hashed. Both the
    plaintext secret and the plaintext backup codes are returned ONCE — the
    caller must persist them (typical flow: show QR code, display backup
    codes, then prompt /2fa/verify).
    """
    user = _require_current_user(authorization, db)

    secret = pyotp.random_base32()
    enc_secret = auth_service.encrypt_secret(secret)
    backup_codes = _generate_backup_codes(10)
    backup_blob = _hash_backup_codes(backup_codes)

    row = db.scalar(select(User2FASecret).where(User2FASecret.user_id == user.id))
    if row is None:
        row = User2FASecret(
            user_id=user.id,
            secret_encrypted=enc_secret,
            enabled=False,
            backup_codes_encrypted=backup_blob,
        )
        db.add(row)
    else:
        # Re-enrollment — overwrite secret & backup codes; keep enabled=False
        # until the user proves possession with /verify.
        row.secret_encrypted = enc_secret
        row.backup_codes_encrypted = backup_blob
        row.enabled = False
        row.enabled_at = None
    db.commit()

    qr_uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name="DeepSynaps"
    )

    return TwoFactorSetupResponse(secret=secret, qr_uri=qr_uri, backup_codes=backup_codes)


@limiter.limit("10/minute")
@router.post("/api/v1/auth/2fa/verify", response_model=TwoFactorVerifyResponse)
def twofa_verify(
    request: Request,
    body: TwoFactorVerifyRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> TwoFactorVerifyResponse:
    """Confirm a TOTP code. On success, flips enabled=True."""
    user = _require_current_user(authorization, db)

    row = db.scalar(select(User2FASecret).where(User2FASecret.user_id == user.id))
    if row is None:
        raise ApiServiceError(
            code="twofa_not_enrolled",
            message="2FA setup has not been initiated for this account.",
            warnings=["Call POST /auth/2fa/setup first."],
            status_code=400,
        )

    plaintext_secret = auth_service.decrypt_secret(row.secret_encrypted)
    if plaintext_secret is None:
        raise ApiServiceError(
            code="twofa_secret_corrupted",
            message="Stored 2FA secret could not be decrypted.",
            warnings=["Re-run /auth/2fa/setup to generate a fresh secret."],
            status_code=500,
        )

    if not pyotp.TOTP(plaintext_secret).verify(body.code, valid_window=1):
        raise ApiServiceError(
            code="invalid_totp_code",
            message="The 2FA code is invalid or expired.",
            warnings=["Re-open your authenticator app and try the latest code."],
            status_code=401,
        )

    now = datetime.now(timezone.utc)
    row.enabled = True
    row.enabled_at = now
    row.last_used_at = now
    db.commit()

    _write_audit(
        db,
        target_id=user.id,
        target_type="user",
        action="2fa_enabled",
        role=user.role,
        actor_id=user.id,
        note="totp",
    )

    return TwoFactorVerifyResponse(enabled=True)


@limiter.limit("10/minute")
@router.post("/api/v1/auth/2fa/disable", response_model=TwoFactorVerifyResponse)
def twofa_disable(
    request: Request,
    body: TwoFactorDisableRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
) -> TwoFactorVerifyResponse:
    """Turn off 2FA. Requires password AND a valid TOTP code (defense in
    depth against session-hijack). Secret row is kept (enabled=False) so the
    user can re-enable without losing backup codes — an explicit /setup call
    is needed to rotate."""
    user = _require_current_user(authorization, db)

    if not auth_service.verify_password(body.password, user.hashed_password):
        raise ApiServiceError(
            code="invalid_current_password",
            message="Password is incorrect.",
            status_code=401,
        )

    row = db.scalar(select(User2FASecret).where(User2FASecret.user_id == user.id))
    if row is None or not row.enabled:
        raise ApiServiceError(
            code="twofa_not_enabled",
            message="2FA is not currently enabled for this account.",
            status_code=400,
        )

    plaintext_secret = auth_service.decrypt_secret(row.secret_encrypted)
    if plaintext_secret is None or not pyotp.TOTP(plaintext_secret).verify(body.code, valid_window=1):
        raise ApiServiceError(
            code="invalid_totp_code",
            message="The 2FA code is invalid or expired.",
            status_code=401,
        )

    row.enabled = False
    row.enabled_at = None
    db.commit()

    _write_audit(
        db,
        target_id=user.id,
        target_type="user",
        action="2fa_disabled",
        role=user.role,
        actor_id=user.id,
        note="self-service",
    )

    return TwoFactorVerifyResponse(enabled=False)


# ── Sessions ─────────────────────────────────────────────────────────────────


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


@router.get("/api/v1/auth/sessions", response_model=SessionsListResponse)
def list_sessions(
    authorization: str | None = Header(default=None),
    x_refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
    db: Session = Depends(get_db_session),
) -> SessionsListResponse:
    """List all active (non-revoked) UserSession rows for the caller.

    is_current=True flags the row whose refresh_token_hash matches the
    sha256 of the X-Refresh-Token header. Callers that don't provide the
    header still get the list — every row comes back with is_current=False
    in that case.
    """
    user = _require_current_user(authorization, db)
    current_hash = _current_refresh_hash_from_request(x_refresh_token)

    rows = db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_seen_at.desc())
    ).all()

    items = [
        SessionItem(
            id=row.id,
            user_agent=row.user_agent or "",
            ip_address=row.ip_address or "",
            created_at=_iso(row.created_at),
            last_seen_at=_iso(row.last_seen_at),
            is_current=(current_hash is not None and row.refresh_token_hash == current_hash),
        )
        for row in rows
    ]
    return SessionsListResponse(items=items)


@router.delete("/api/v1/auth/sessions/others", response_model=OthersRevokedResponse)
def revoke_other_sessions(
    authorization: str | None = Header(default=None),
    x_refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
    db: Session = Depends(get_db_session),
) -> OthersRevokedResponse:
    """Revoke every active UserSession for the user EXCEPT the current one.
    If the caller doesn't send X-Refresh-Token, the current session cannot
    be identified and this endpoint refuses with 400 rather than silently
    logging the user out."""
    user = _require_current_user(authorization, db)
    current_hash = _current_refresh_hash_from_request(x_refresh_token)
    if current_hash is None:
        raise ApiServiceError(
            code="current_session_unidentified",
            message="Cannot revoke other sessions without identifying the current session.",
            warnings=["Send your current refresh token in the X-Refresh-Token header."],
            status_code=400,
        )

    count = _revoke_all_sessions_except_current(
        db, user_id=user.id, current_hash=current_hash
    )
    return OthersRevokedResponse(revoked_count=count)


@router.delete("/api/v1/auth/sessions/{session_id}", response_model=SessionRevokedResponse)
def revoke_session(
    session_id: str,
    authorization: str | None = Header(default=None),
    x_refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
    db: Session = Depends(get_db_session),
) -> SessionRevokedResponse:
    """Revoke one UserSession by id. Refuses to revoke the current session
    (use POST /auth/logout for that)."""
    user = _require_current_user(authorization, db)

    row = db.scalar(
        select(UserSession).where(
            UserSession.id == session_id, UserSession.user_id == user.id
        )
    )
    if row is None:
        raise ApiServiceError(
            code="session_not_found",
            message="Session not found.",
            status_code=404,
        )

    current_hash = _current_refresh_hash_from_request(x_refresh_token)
    if current_hash is not None and row.refresh_token_hash == current_hash:
        raise ApiServiceError(
            code="cannot_revoke_current_session",
            message="Refuse to revoke the current session via this endpoint.",
            warnings=["To log out the current session, call POST /auth/logout."],
            status_code=409,
        )

    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()

    return SessionRevokedResponse(message="Revoked")

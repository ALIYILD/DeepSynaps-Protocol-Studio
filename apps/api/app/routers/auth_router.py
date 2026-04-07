from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
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
from ..persistence.models import PasswordResetToken

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["auth"])

# ── Pydantic models ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    display_name: str
    password: str  # min 8 chars


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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/v1/auth/register", response_model=TokenResponse, status_code=201)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    _validate_email(body.email)
    _validate_password(body.password)

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
        role="guest",
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


@router.post("/api/v1/auth/login", response_model=TokenResponse)
def login(
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


@router.post("/api/v1/auth/refresh", response_model=TokenResponse)
def refresh_token(
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

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=body.refresh_token,
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

    # Fall back to demo token handling first so existing demo tokens keep working.
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

    user_id = payload.get("sub")
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


@router.post("/api/v1/auth/forgot-password", response_model=MessageResponse)
def forgot_password(
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
    expires_at = datetime.utcnow() + timedelta(hours=1)

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset_record)
    db.commit()

    # No email sending yet — log the raw token for development use.
    logger.info(
        "Password reset token for user %s: %s (expires %s)",
        user.email,
        raw_token,
        expires_at.isoformat(),
    )

    return MessageResponse(
        message="If an account with that email exists, a reset link has been sent."
    )


@router.post("/api/v1/auth/reset-password", response_model=MessageResponse)
def reset_password(
    body: ResetPasswordRequest,
    db: Session = Depends(get_db_session),
) -> MessageResponse:
    _validate_password(body.new_password)

    token_hash = auth_service.hash_reset_token(body.token)

    from sqlalchemy import select

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

    if reset_record.expires_at < datetime.utcnow():
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
    reset_record.used_at = datetime.utcnow()
    db.commit()

    return MessageResponse(message="Password has been reset successfully.")

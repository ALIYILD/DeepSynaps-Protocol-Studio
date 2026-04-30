"""Profile router — /api/v1/profile.

Handles the authenticated user's own profile fields: display name, credentials,
license number, avatar image, and email-change flow (with 24h token verification).

Endpoints:
  GET    /api/v1/profile                 → ProfileResponse
  PATCH  /api/v1/profile                 → ProfileResponse (partial)
  PATCH  /api/v1/profile/email           → initiate email-change
  POST   /api/v1/profile/email/verify    → confirm email-change via token
  POST   /api/v1/profile/avatar          → multipart upload → WEBP 256x256
  DELETE /api/v1/profile/avatar          → clear

See apps/api/SETTINGS_API_DESIGN.md § Profile router for the full spec.
"""
from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel
from PIL import Image
from sqlalchemy.orm import Session

from ..database import get_db_session
from ..errors import ApiServiceError
from ..limiter import limiter
from ..persistence.models import User
from ..services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])

# Avatar storage directory (mounted by main.py at /static/avatars/...).
_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_AVATAR_DIR = _DATA_DIR / "avatars"
_MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Pydantic models ──────────────────────────────────────────────────────────


class ProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    package_id: str
    is_verified: bool
    credentials: Optional[str] = None
    license_number: Optional[str] = None
    avatar_url: Optional[str] = None
    pending_email: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    credentials: Optional[str] = None
    license_number: Optional[str] = None


class EmailChangeRequest(BaseModel):
    new_email: str
    current_password: str


class EmailChangeResponse(BaseModel):
    pending_email: str
    message: str


class EmailVerifyRequest(BaseModel):
    token: str


class AvatarResponse(BaseModel):
    avatar_url: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _to_response(user: User) -> ProfileResponse:
    return ProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        package_id=user.package_id,
        is_verified=user.is_verified,
        credentials=user.credentials,
        license_number=user.license_number,
        avatar_url=user.avatar_url,
        pending_email=user.pending_email,
    )


def _send_verification_email(email: str, token: str) -> None:
    """Email-change verification delivery. SMTP is not configured on this
    deployment yet — log the verification URL to stdout so devs can complete
    the flow in integration tests. Replace with aiosmtplib when SMTP settings
    are wired.
    """
    logger.info(
        "[email stub] would send email-change verification to %s — "
        "URL: /api/v1/profile/email/verify?token=%s",
        email,
        token,
    )


def _save_avatar(user_id: str, upload_bytes: bytes) -> str:
    """Validate, center-crop, resize → WEBP and persist under data/avatars/.
    Returns the public URL to store on `User.avatar_url`.
    """
    if len(upload_bytes) > _MAX_AVATAR_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message="Avatar must be <= 2MB.",
            warnings=["Compress or choose a smaller image."],
            status_code=413,
        )
    try:
        img = Image.open(BytesIO(upload_bytes))
        img.load()
    except Exception:
        raise ApiServiceError(
            code="invalid_image",
            message="Uploaded file is not a valid image.",
            status_code=400,
        )
    img = img.convert("RGB")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((256, 256), Image.LANCZOS)
    _AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    out_path = _AVATAR_DIR / f"{user_id}.webp"
    img.save(out_path, "WEBP", quality=85)
    return f"/static/avatars/{user_id}.webp"


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=ProfileResponse)
@router.get("/", response_model=ProfileResponse, include_in_schema=False)
def get_profile(
    user: User = Depends(auth_service.current_user),
) -> ProfileResponse:
    """Return the authenticated user's full profile."""
    return _to_response(user)


@router.patch("", response_model=ProfileResponse)
@router.patch("/", response_model=ProfileResponse, include_in_schema=False)
def update_profile(
    body: ProfileUpdateRequest,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> ProfileResponse:
    """Partial update of display_name, credentials, license_number."""
    if body.display_name is not None:
        display_name = body.display_name.strip()
        if not display_name:
            raise ApiServiceError(
                code="invalid_display_name",
                message="Display name cannot be empty.",
                status_code=400,
            )
        if len(display_name) > 255:
            raise ApiServiceError(
                code="display_name_too_long",
                message="Display name must be 255 characters or fewer.",
                status_code=400,
            )
        user.display_name = display_name
    if body.credentials is not None:
        credentials = body.credentials.strip() or None
        if credentials is not None and len(credentials) > 128:
            raise ApiServiceError(
                code="credentials_too_long",
                message="Credentials must be 128 characters or fewer.",
                status_code=400,
            )
        user.credentials = credentials
    if body.license_number is not None:
        license_number = body.license_number.strip() or None
        if license_number is not None and len(license_number) > 64:
            raise ApiServiceError(
                code="license_number_too_long",
                message="License number must be 64 characters or fewer.",
                status_code=400,
            )
        user.license_number = license_number
    db.commit()
    db.refresh(user)
    return _to_response(user)


@router.patch("/email", response_model=EmailChangeResponse)
def change_email(
    body: EmailChangeRequest,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> EmailChangeResponse:
    """Begin email change. Stores new address in `pending_email`, generates a
    64-char token with 24h TTL, and emails a verification link. The user's
    login email does NOT change until POST /email/verify succeeds.
    """
    new_email = body.new_email.strip().lower()
    if not _EMAIL_RE.match(new_email):
        raise ApiServiceError(
            code="invalid_email",
            message="The provided email address is not valid.",
            status_code=400,
        )
    if new_email == (user.email or "").lower():
        raise ApiServiceError(
            code="email_unchanged",
            message="New email must differ from the current email.",
            status_code=400,
        )
    if not auth_service.verify_password(body.current_password, user.hashed_password):
        raise ApiServiceError(
            code="invalid_current_password",
            message="The current password is incorrect.",
            status_code=401,
        )

    # Reject if another user already owns the target email.
    from ..repositories.users import get_user_by_email

    existing = get_user_by_email(db, new_email)
    if existing is not None and existing.id != user.id:
        raise ApiServiceError(
            code="email_already_registered",
            message="That email address is already in use by another account.",
            status_code=409,
        )

    token = secrets.token_urlsafe(48)[:64]
    user.pending_email = new_email
    user.pending_email_token = token
    user.pending_email_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    db.commit()

    _send_verification_email(new_email, token)

    return EmailChangeResponse(
        pending_email=new_email,
        message="Verification email sent.",
    )


@router.post("/email/verify", response_model=ProfileResponse)
def verify_email(
    body: EmailVerifyRequest,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> ProfileResponse:
    """Consume a verification token. Swaps `pending_email` → `email` and
    clears the pending-change columns. Must be called by the same user who
    initiated the change.
    """
    if not user.pending_email or not user.pending_email_token:
        raise ApiServiceError(
            code="no_pending_email",
            message="There is no pending email change for this account.",
            status_code=400,
        )

    if not secrets.compare_digest(user.pending_email_token, body.token):
        raise ApiServiceError(
            code="invalid_email_token",
            message="The verification token is invalid.",
            status_code=400,
        )

    expires_at = user.pending_email_expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise ApiServiceError(
                code="email_token_expired",
                message="The verification token has expired.",
                warnings=["Request a new email change."],
                status_code=400,
            )

    user.email = user.pending_email
    user.pending_email = None
    user.pending_email_token = None
    user.pending_email_expires_at = None
    db.commit()
    db.refresh(user)
    return _to_response(user)


@router.post("/avatar", response_model=AvatarResponse)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> AvatarResponse:
    """Upload a new avatar. Accepts any Pillow-readable format; server-side
    center-crops to a square and resizes to 256x256 WEBP (quality=85).
    """
    if file.content_type and not file.content_type.startswith("image/"):
        raise ApiServiceError(
            code="invalid_content_type",
            message="Avatar must be an image.",
            status_code=400,
        )
    data = await file.read()
    _MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB
    if len(data) > _MAX_AVATAR_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message="Avatar exceeds 5 MB.",
            status_code=413,
        )
    url = _save_avatar(user.id, data)
    user.avatar_url = url
    db.commit()
    return AvatarResponse(avatar_url=url)


@router.delete("/avatar", response_model=AvatarResponse)
def delete_avatar(
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> AvatarResponse:
    """Remove the user's avatar file + column. Idempotent."""
    path = _AVATAR_DIR / f"{user.id}.webp"
    if path.exists():
        try:
            path.unlink()
        except OSError:  # pragma: no cover — best-effort
            logger.warning("Failed to unlink avatar %s", path, exc_info=True)
    user.avatar_url = None
    db.commit()
    return AvatarResponse(avatar_url=None)

from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib
import base64
import bcrypt as _bcrypt_lib
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, Header
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from ..database import get_db_session
from ..errors import ApiServiceError
from ..settings import get_settings

settings = get_settings()


def _prehash(plain: str) -> bytes:
    """SHA-256 → base64 keeps bcrypt input ≤44 bytes, well under the 72-byte limit."""
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(plain: str) -> str:
    return _bcrypt_lib.hashpw(_prehash(plain), _bcrypt_lib.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt_lib.checkpw(_prehash(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    user_id: str,
    email: str,
    role: str,
    package_id: str,
    clinic_id: str | None = None,
) -> str:
    """Mint a short-lived access JWT.

    ``clinic_id`` is the tenant scope from ``users.clinic_id`` and is included
    only when present. Tokens for users without a clinic (e.g. platform admins
    or freshly registered clinicians who have not yet joined a clinic) omit the
    claim so :class:`AuthenticatedActor.clinic_id` resolves to ``None`` —
    this is what the cross-clinic ownership gate uses to decide whether the
    actor passes.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload: dict[str, object] = {
        "sub": user_id,
        "email": email,
        "role": role,
        "package_id": package_id,
        "type": "access",
        "exp": expire,
    }
    if clinic_id:
        payload["clinic_id"] = clinic_id
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def generate_password_reset_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token). Store hash, send raw."""
    raw = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Settings API helpers (session tracking + 2FA secret encryption) ────────────


def hash_refresh_token(raw: str) -> str:
    """SHA-256 hex digest of a refresh token string. Used as the unique lookup
    key for the `user_sessions` row so we never store the raw JWT at rest."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _fernet() -> Fernet:
    """Build a Fernet from the configured secrets_key. Raises if unset."""
    key = get_settings().secrets_key
    if not key:
        raise RuntimeError(
            "DEEPSYNAPS_SECRETS_KEY is not configured — cannot encrypt "
            "2FA secrets. Set the env var and restart."
        )
    # Fernet accepts bytes or str; ensure bytes.
    return Fernet(key.encode("utf-8") if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> str:
    """Fernet-encrypt a string (e.g. pyotp base32 secret). Returns a
    URL-safe token suitable for storage in a VARCHAR column."""
    token = _fernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_secret(ciphertext: str) -> Optional[str]:
    """Reverse of encrypt_secret. Returns None on invalid/expired token."""
    try:
        plain = _fernet().decrypt(ciphertext.encode("utf-8"))
    except (InvalidToken, ValueError):
        return None
    return plain.decode("utf-8")


# ── FastAPI dependencies ──────────────────────────────────────────────────────
#
# `current_user` resolves the authenticated user's DB row from the Bearer
# token. Demo tokens (which don't map to a real `users` row) are rejected —
# Settings endpoints always need a real DB user to mutate.
#
# `current_clinic_admin` additionally requires that the user is associated
# with a clinic and has `role == "admin"`.


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


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db_session),
):
    """FastAPI dependency — returns the authenticated `User` ORM row.

    Raises 401 when the token is missing, malformed, a demo token, or the
    user row no longer exists. Import the model lazily to avoid a circular
    import with `persistence.models` (which imports from other services).
    """
    from ..registries.auth import DEMO_ACTOR_TOKENS
    from ..repositories.users import get_user_by_id

    token = _extract_bearer_token(authorization)
    if token is None:
        raise ApiServiceError(
            code="missing_auth_token",
            message="Authentication is required.",
            warnings=["Provide an 'Authorization: Bearer <token>' header."],
            status_code=401,
        )
    payload = decode_token(token)
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
            message="Demo tokens cannot access this endpoint.",
            warnings=["Log in with a real account."],
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


def current_clinic_admin(
    user=Depends(current_user),
    db: Session = Depends(get_db_session),
):
    """FastAPI dependency — returns the authenticated `User` ONLY if they are
    a clinic admin (role == 'admin' AND user.clinic_id is not null).

    404 when no clinic is associated, 403 when the user is not an admin.
    """
    if not user.clinic_id:
        raise ApiServiceError(
            code="no_clinic",
            message="User is not associated with a clinic.",
            status_code=404,
        )
    if user.role != "admin":
        raise ApiServiceError(
            code="forbidden",
            message="Clinic admin role required.",
            status_code=403,
        )
    return user

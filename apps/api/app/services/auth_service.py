from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib
import base64
import bcrypt as _bcrypt_lib
from cryptography.fernet import Fernet, InvalidToken
from jose import jwt, JWTError
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


def create_access_token(user_id: str, email: str, role: str, package_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "package_id": package_id,
        "type": "access",
        "exp": expire,
    }
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

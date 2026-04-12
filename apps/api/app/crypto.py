"""Application-layer encryption helpers.

Used to encrypt OAuth tokens stored in device_connections.access_token_enc
and refresh_token_enc. Key must be a URL-safe base-64 encoded 32-byte value
generated with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Set the key via the WEARABLE_TOKEN_ENC_KEY environment variable.
If the variable is absent (development default), tokens are stored as
plaintext and a WARNING is emitted on every write.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OAuth V2 Production Checklist — complete ALL items before enabling OAuth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[ ] 1. WEARABLE_TOKEN_ENC_KEY env var present in environment
        Verify: `echo $WEARABLE_TOKEN_ENC_KEY` (must be non-empty)

[ ] 2. Fly.io secret set (production)
        fly secrets set WEARABLE_TOKEN_ENC_KEY=<generated_key> --app deepsynaps-api

[ ] 3. Every OAuth token write goes through encrypt_token()
        Search: grep -r "access_token_enc" apps/api --include="*.py"
        Every match must call encrypt_token() before assignment.

[ ] 4. Every OAuth token read goes through decrypt_token()
        Search: grep -r "access_token_enc" apps/api --include="*.py"
        Every match that uses the value must call decrypt_token().

[ ] 5. Legacy plaintext fallback is monitored
        decrypt_token() logs WARNING on Fernet failure — ensure log sink
        surfaces these. A spike means rows written before encryption was enabled.

[ ] 6. No secrets in application logs
        Confirm no endpoint or service logs the raw token value.
        encrypt_token / decrypt_token do not log plaintext — verify call sites.

[ ] 7. Key rotation plan documented
        To rotate: set new key, migrate existing rows with a one-off script that
        reads each row with old key → re-encrypts with new key → writes back.
        Never delete the old key until all rows are migrated.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
from __future__ import annotations

import logging
import os

_logger = logging.getLogger(__name__)
_FERNET_CACHE: object = None
_KEY_LOADED: str = ""


def _fernet():
    """Return a cached Fernet instance, or None if no key is configured."""
    global _FERNET_CACHE, _KEY_LOADED  # noqa: PLW0603
    key = os.getenv("WEARABLE_TOKEN_ENC_KEY", "")
    if key == _KEY_LOADED and _FERNET_CACHE is not None:
        return _FERNET_CACHE
    _KEY_LOADED = key
    if not key:
        _FERNET_CACHE = None
        return None
    try:
        from cryptography.fernet import Fernet
        _FERNET_CACHE = Fernet(key.encode())
        return _FERNET_CACHE
    except Exception as exc:
        _logger.warning("Invalid WEARABLE_TOKEN_ENC_KEY — tokens will be stored as plaintext: %s", exc)
        _FERNET_CACHE = None
        return None


def encrypt_token(plaintext: str | None) -> str | None:
    """Encrypt a token string for DB storage.  Returns None unchanged."""
    if not plaintext:
        return plaintext
    f = _fernet()
    if f is None:
        # Lazy import to avoid circular dependency at module load time.
        from app.settings import get_settings as _get_settings
        if _get_settings().app_env == "production":
            raise RuntimeError(
                "WEARABLE_TOKEN_ENC_KEY must be set in production. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _logger.warning(
            "WEARABLE_TOKEN_ENC_KEY not set — storing OAuth token as plaintext. "
            "Set this env var before enabling real OAuth device connections."
        )
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str | None) -> str | None:
    """Decrypt a token string retrieved from DB.  Returns None unchanged.

    Falls back to returning the raw value if decryption fails (handles
    legacy plaintext records written before the key was configured).
    """
    if not ciphertext:
        return ciphertext
    f = _fernet()
    if f is None:
        return ciphertext  # dev mode — assumed plaintext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        _logger.warning(
            "Token decryption failed — returning raw value. "
            "This may be a plaintext legacy record or a key rotation issue."
        )
        return ciphertext

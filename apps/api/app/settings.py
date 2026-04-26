from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator


REPO_ROOT = Path(__file__).resolve().parents[3]

# Auto-load apps/api/.env for local development. Never overrides values already
# set in the shell — os.environ wins so production (Fly secrets) is not
# clobbered by a stale .env.
try:
    from dotenv import load_dotenv as _load_dotenv
    _API_ROOT = Path(__file__).resolve().parents[1]
    for _env_path in (_API_ROOT / ".env", REPO_ROOT / ".env"):
        if _env_path.exists():
            _load_dotenv(_env_path, override=False)
except ImportError:
    pass

# The known-bad placeholder shipped in .env.example.
# Any deployment that hasn't changed this is misconfigured.
_INSECURE_JWT_DEFAULT = "CHANGE-THIS-IN-PRODUCTION-use-openssl-rand-hex-32"


def _truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _falsy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"0", "false", "no", "off"}


def resolve_enable_deeptwin_simulation(
    *,
    app_env: str,
    raw_env: str | None,
) -> bool:
    """Resolve the DeepTwin simulation feature flag.

    Defaults: False in production/staging, True in development/test.
    DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION (truthy) forces on; (falsy) forces off.
    Shared between apps/api/app/settings.py and apps/worker so both layers
    agree on whether the simulation surface is live for the environment.
    """
    if _truthy_env(raw_env):
        return True
    if _falsy_env(raw_env):
        return False
    return app_env not in ("production", "staging")


def _parse_cors_origins(value: str | None) -> list[str]:
    # When DEEPSYNAPS_CORS_ORIGINS is unset we return an empty list so that
    # production deployments cannot inherit a stale baked-in allow-list (the
    # previous default whitelisted https://deepsynaps-web.fly.dev even when
    # the operator never opted in). fly.toml sets DEEPSYNAPS_CORS_ORIGINS
    # explicitly, so prod is unaffected; local dev sets it via .env.example.
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class AppSettings(BaseModel):
    app_env: Literal["development", "test", "staging", "production"] = "production"
    api_title: str = "DeepSynaps Protocol Studio API"
    api_version: str = "0.1.0"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    database_url: str = "sqlite:///./deepsynaps_protocol_studio.db"
    # Default to empty so production must opt in via DEEPSYNAPS_CORS_ORIGINS.
    # Local dev should set this in apps/api/.env (see .env.example).
    cors_origins: list[str] = Field(default_factory=list)
    clinical_data_root: Path = REPO_ROOT / "data" / "imports" / "clinical-database"
    clinical_snapshot_root: Path = REPO_ROOT / "data" / "snapshots" / "clinical-database"
    database_backup_root: Path = REPO_ROOT / "data" / "backups"
    request_timeout_seconds: int = 30  # Applied at ASGI server level (uvicorn --timeout-keep-alive); not enforced in middleware.

    # JWT — no insecure default; load_settings() enforces a real secret in production/staging
    jwt_secret_key: str = Field(default=_INSECURE_JWT_DEFAULT)
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_token_expire_minutes: int = Field(default=60)
    jwt_refresh_token_expire_days: int = Field(default=30)

    # Stripe
    stripe_secret_key: str = Field(default="")
    stripe_publishable_key: str = Field(default="")
    stripe_webhook_secret: str = Field(default="")

    # Stripe Price IDs (set these in Fly.io secrets after creating products in Stripe dashboard)
    # Legacy plan IDs (kept for backward-compatibility with existing Stripe products)
    stripe_price_resident: str = Field(default="")
    stripe_price_clinician_pro: str = Field(default="")
    stripe_price_clinic_team: str = Field(default="")
    # New plan IDs — if unset, fall back to legacy aliases (clinician_pro → clinic-starter, clinic_team → clinic-pro)
    stripe_price_clinic_starter: str = Field(default="")
    stripe_price_clinic_pro: str = Field(default="")

    # Telegram — optional second token for separate patient vs clinician bot webhooks
    telegram_bot_token: str = Field(default="")
    telegram_bot_token_patient: str = Field(default="")
    telegram_bot_token_clinician: str = Field(default="")
    telegram_webhook_secret: str = Field(default="")
    telegram_bot_username_patient: str = Field(default="")
    telegram_bot_username_clinician: str = Field(default="")
    telegram_sales_chat_id: str = Field(default="")

    # Sentry
    sentry_dsn: str = Field(default="")

    # Anthropic
    anthropic_api_key: str = Field(default="")

    # OpenAI (optional — doctors can bring their own key)
    openai_api_key: str = Field(default="")

    # GLM-4.7 (Zhipu AI free tier — OpenAI-compatible API via open.bigmodel.cn)
    glm_api_key: str = Field(default="")

    # Wearable token encryption (Fernet key — generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Required in production/staging — load_settings() refuses to boot if
    # WEARABLE_TOKEN_ENC_KEY is unset there. In dev/test, tokens fall back to
    # plaintext storage and a warning is logged on every write.
    wearable_token_enc_key: str = Field(default="")

    # Settings API secrets key (Fernet — encrypts TOTP secrets and 2FA backup
    # codes at rest in user_2fa_secrets). Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If empty in non-production, load_settings() generates an ephemeral key
    # and logs a warning — 2FA secrets will not survive process restart.
    # MUST be set in production/staging via DEEPSYNAPS_SECRETS_KEY env.
    secrets_key: str = Field(default="")

    # App URL (used for Stripe redirect URLs)
    app_url: str = Field(default="http://localhost:5173")

    # Media storage
    media_storage_backend: str = Field(default="local")
    media_storage_root: str = Field(default="./media_uploads")
    media_max_upload_bytes: int = Field(default=52428800)  # 50MB
    media_signed_url_ttl_seconds: int = Field(default=3600)

    # Transcription
    whisper_provider: str = Field(default="openai")

    # Brain Twin Layer 2 (Feature Store) — intentionally minimal abstraction.
    # Layers 3–4 should depend on the FeatureStoreClient interface and opaque
    # metadata blobs, not Feast specifics.
    feature_store_backend: Literal["disabled", "in_memory", "feast"] = "disabled"
    feature_store_default_tenant_id: str = Field(default="default")
    feature_store_registry_url: str = Field(default="")

    enable_deeptwin_simulation: bool = Field(
        default=False,
        description=(
            "Gates DeepTwin simulation worker. Default off in production until "
            "clinical validation packet exists. "
            "Set DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION=1 to override."
        ),
    )

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("database_url must not be empty.")
        if "://" not in value:
            raise ValueError("database_url must be a valid SQLAlchemy URL.")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: list[str]) -> list[str]:
        # Empty list is now valid (the new default). When unset in production
        # the CORSMiddleware simply rejects all cross-origin requests, which
        # is the correct fail-closed behaviour. Operators must populate
        # DEEPSYNAPS_CORS_ORIGINS to allow browser-based clients.
        return value

    @field_validator("clinical_data_root", "clinical_snapshot_root", "database_backup_root")
    @classmethod
    def expand_paths(cls, value: Path) -> Path:
        return value.resolve()


def load_settings() -> AppSettings:
    _app_env = os.getenv("DEEPSYNAPS_APP_ENV", "development")
    _jwt_secret = os.getenv("JWT_SECRET_KEY", _INSECURE_JWT_DEFAULT)

    # Fail fast in production/staging if the JWT secret is missing or still the insecure placeholder.
    if _app_env in ("production", "staging"):
        if not _jwt_secret or _jwt_secret == _INSECURE_JWT_DEFAULT:
            raise RuntimeError(
                "JWT_SECRET_KEY must be set to a cryptographically random value in "
                f"{_app_env} environments. "
                "Generate one with: openssl rand -hex 32"
            )

    # Wearable OAuth token encryption (Fernet). Required in staging/production
    # so OAuth refresh/access tokens are encrypted at rest. In dev/test we
    # tolerate an unset key and let app.crypto fall back to plaintext (with a
    # warning) so local boot works without provisioning a key.
    _wearable_enc_key = os.getenv("WEARABLE_TOKEN_ENC_KEY", "")
    if _app_env in ("production", "staging") and not _wearable_enc_key:
        raise RuntimeError(
            "WEARABLE_TOKEN_ENC_KEY must be set to a Fernet key (32-byte "
            f"base64) in {_app_env} environments so wearable OAuth tokens "
            "are encrypted at rest. Generate one with: "
            "python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'"
        )

    # Settings API: Fernet key for TOTP/2FA secret encryption. In dev/test we
    # fall back to an ephemeral key (with a stderr warning) so local boot works
    # without DEEPSYNAPS_SECRETS_KEY set. In staging/production this must be a
    # stable env-provided key — otherwise restarts invalidate every user's 2FA.
    _secrets_key = os.getenv("DEEPSYNAPS_SECRETS_KEY", "")
    if not _secrets_key:
        if _app_env in ("production", "staging"):
            raise RuntimeError(
                "DEEPSYNAPS_SECRETS_KEY must be set to a Fernet key (32-byte "
                f"base64) in {_app_env} environments. Generate one with: "
                "python -c 'from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())'"
            )
        # Dev/test fallback — ephemeral key, printed warning only.
        import sys
        from cryptography.fernet import Fernet
        _secrets_key = Fernet.generate_key().decode()
        print(
            "DEEPSYNAPS_SECRETS_KEY not set — using ephemeral key; "
            "2FA secrets will not survive restart",
            file=sys.stderr,
        )

    try:
        return AppSettings.model_validate(
            {
                "app_env": _app_env,
                "api_title": os.getenv("DEEPSYNAPS_API_TITLE", "DeepSynaps Protocol Studio API"),
                "api_version": os.getenv("DEEPSYNAPS_API_VERSION", "0.1.0"),
                "api_host": os.getenv("DEEPSYNAPS_API_HOST", "127.0.0.1"),
                "api_port": int(os.getenv("DEEPSYNAPS_API_PORT", "8000")),
                "log_level": os.getenv("DEEPSYNAPS_LOG_LEVEL", "INFO").upper(),
                "database_url": os.getenv(
                    "DEEPSYNAPS_DATABASE_URL",
                    # Use /data volume in production (Fly.io persistent volume), local file in dev
                    "sqlite:////data/deepsynaps_protocol_studio.db"
                    if os.getenv("DEEPSYNAPS_APP_ENV") == "production"
                    else "sqlite:///./deepsynaps_protocol_studio.db",
                ),
                "cors_origins": _parse_cors_origins(os.getenv("DEEPSYNAPS_CORS_ORIGINS")),
                "clinical_data_root": Path(
                    os.getenv(
                        "DEEPSYNAPS_CLINICAL_DATA_ROOT",
                        str(REPO_ROOT / "data" / "imports" / "clinical-database"),
                    )
                ),
                "clinical_snapshot_root": Path(
                    os.getenv(
                        "DEEPSYNAPS_CLINICAL_SNAPSHOT_ROOT",
                        str(REPO_ROOT / "data" / "snapshots" / "clinical-database"),
                    )
                ),
                "database_backup_root": Path(
                    os.getenv(
                        "DEEPSYNAPS_DATABASE_BACKUP_ROOT",
                        str(REPO_ROOT / "data" / "backups"),
                    )
                ),
                "request_timeout_seconds": int(
                    os.getenv("DEEPSYNAPS_REQUEST_TIMEOUT_SECONDS", "30")
                ),
                # JWT — _jwt_secret already resolved above (with production fail-fast)
                "jwt_secret_key": _jwt_secret,
                "jwt_algorithm": os.getenv("JWT_ALGORITHM", "HS256"),
                "jwt_access_token_expire_minutes": int(
                    os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
                ),
                "jwt_refresh_token_expire_days": int(
                    os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "30")
                ),
                # Stripe
                "stripe_secret_key": os.getenv("STRIPE_SECRET_KEY", ""),
                "stripe_publishable_key": os.getenv("STRIPE_PUBLISHABLE_KEY", ""),
                "stripe_webhook_secret": os.getenv("STRIPE_WEBHOOK_SECRET", ""),
                "stripe_price_resident": os.getenv("STRIPE_PRICE_RESIDENT", ""),
                "stripe_price_clinician_pro": os.getenv("STRIPE_PRICE_CLINICIAN_PRO", ""),
                "stripe_price_clinic_team": os.getenv("STRIPE_PRICE_CLINIC_TEAM", ""),
                "stripe_price_clinic_starter": os.getenv("STRIPE_PRICE_CLINIC_STARTER", ""),
                "stripe_price_clinic_pro": os.getenv("STRIPE_PRICE_CLINIC_PRO", ""),
                # Telegram
                "telegram_bot_token": os.getenv("TELEGRAM_BOT_TOKEN", ""),
                "telegram_bot_token_patient": os.getenv("TELEGRAM_BOT_TOKEN_PATIENT", ""),
                "telegram_bot_token_clinician": os.getenv("TELEGRAM_BOT_TOKEN_CLINICIAN", ""),
                "telegram_webhook_secret": os.getenv("TELEGRAM_WEBHOOK_SECRET", ""),
                "telegram_bot_username_patient": os.getenv("TELEGRAM_BOT_USERNAME_PATIENT", ""),
                "telegram_bot_username_clinician": os.getenv("TELEGRAM_BOT_USERNAME_CLINICIAN", ""),
                "telegram_sales_chat_id": os.getenv("TELEGRAM_SALES_CHAT_ID", ""),
                # Sentry
                "sentry_dsn": os.getenv("SENTRY_DSN", ""),
                # Anthropic
                "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
                # OpenAI
                "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
                # LLM (OpenRouter or GLM — OpenAI-compatible endpoint)
                "glm_api_key": os.getenv("GLM_API_KEY", os.getenv("OPENROUTER_API_KEY", "")),
                # Wearable token encryption
                "wearable_token_enc_key": os.getenv("WEARABLE_TOKEN_ENC_KEY", ""),
                # Settings API Fernet key (TOTP secret encryption)
                "secrets_key": _secrets_key,
                # App URL
                "app_url": os.getenv("APP_URL", "http://localhost:5173"),
                # Media storage
                "media_storage_backend": os.getenv("MEDIA_STORAGE_BACKEND", "local"),
                "media_storage_root": os.getenv(
                    "MEDIA_STORAGE_ROOT",
                    # Use /data volume in production (Fly.io persistent volume), local dir in dev
                    "/data/media_uploads"
                    if os.getenv("DEEPSYNAPS_APP_ENV") == "production"
                    else "./media_uploads",
                ),
                "media_max_upload_bytes": int(os.getenv("MEDIA_MAX_UPLOAD_BYTES", "52428800")),
                "media_signed_url_ttl_seconds": int(os.getenv("MEDIA_SIGNED_URL_TTL_SECONDS", "3600")),
                # Transcription
                "whisper_provider": os.getenv("WHISPER_PROVIDER", "openai"),
                # Feature store (Layer 2)
                "feature_store_backend": os.getenv("DEEPSYNAPS_FEATURE_STORE_BACKEND", "disabled"),
                "feature_store_default_tenant_id": os.getenv("DEEPSYNAPS_FEATURE_STORE_DEFAULT_TENANT_ID", "default"),
                "feature_store_registry_url": os.getenv("DEEPSYNAPS_FEATURE_STORE_REGISTRY_URL", ""),
                # DeepTwin simulation gate (F6 from launch-readiness review).
                "enable_deeptwin_simulation": resolve_enable_deeptwin_simulation(
                    app_env=_app_env,
                    raw_env=os.getenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION"),
                ),
            }
        )
    except ValidationError as exc:
        raise RuntimeError(f"Invalid DeepSynaps environment configuration: {exc}") from exc


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return load_settings()


settings = get_settings()
CLINICAL_DATA_ROOT = settings.clinical_data_root
CLINICAL_SNAPSHOT_ROOT = settings.clinical_snapshot_root
DATABASE_BACKUP_ROOT = settings.database_backup_root

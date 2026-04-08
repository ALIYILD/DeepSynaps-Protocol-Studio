from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator


REPO_ROOT = Path(__file__).resolve().parents[3]


def _parse_cors_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://127.0.0.1:5173", "http://localhost:5173"]
    return [item.strip() for item in value.split(",") if item.strip()]


class AppSettings(BaseModel):
    app_env: Literal["development", "test", "staging", "production"] = "development"
    api_title: str = "DeepSynaps Protocol Studio API"
    api_version: str = "0.1.0"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    database_url: str = "sqlite:///./deepsynaps_protocol_studio.db"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )
    clinical_data_root: Path = REPO_ROOT / "data" / "imports" / "clinical-database"
    clinical_snapshot_root: Path = REPO_ROOT / "data" / "snapshots" / "clinical-database"
    database_backup_root: Path = REPO_ROOT / "data" / "backups"
    request_timeout_seconds: int = 30

    # JWT
    jwt_secret_key: str = Field(default="CHANGE-THIS-IN-PRODUCTION-use-openssl-rand-hex-32")
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_token_expire_minutes: int = Field(default=60)
    jwt_refresh_token_expire_days: int = Field(default=30)

    # Stripe
    stripe_secret_key: str = Field(default="")
    stripe_publishable_key: str = Field(default="")
    stripe_webhook_secret: str = Field(default="")

    # Stripe Price IDs (set these in Fly.io secrets after creating products in Stripe dashboard)
    stripe_price_resident: str = Field(default="")
    stripe_price_clinician_pro: str = Field(default="")
    stripe_price_clinic_team: str = Field(default="")

    # Telegram
    telegram_bot_token: str = Field(default="")
    telegram_webhook_secret: str = Field(default="")

    # Sentry
    sentry_dsn: str = Field(default="")

    # Anthropic
    anthropic_api_key: str = Field(default="")

    # App URL (used for Stripe redirect URLs)
    app_url: str = Field(default="http://localhost:5173")

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
        if not value:
            raise ValueError("cors_origins must contain at least one origin.")
        return value

    @field_validator("clinical_data_root", "clinical_snapshot_root", "database_backup_root")
    @classmethod
    def expand_paths(cls, value: Path) -> Path:
        return value.resolve()


def load_settings() -> AppSettings:
    try:
        return AppSettings.model_validate(
            {
                "app_env": os.getenv("DEEPSYNAPS_APP_ENV", "development"),
                "api_title": os.getenv("DEEPSYNAPS_API_TITLE", "DeepSynaps Protocol Studio API"),
                "api_version": os.getenv("DEEPSYNAPS_API_VERSION", "0.1.0"),
                "api_host": os.getenv("DEEPSYNAPS_API_HOST", "127.0.0.1"),
                "api_port": int(os.getenv("DEEPSYNAPS_API_PORT", "8000")),
                "log_level": os.getenv("DEEPSYNAPS_LOG_LEVEL", "INFO").upper(),
                "database_url": os.getenv(
                    "DEEPSYNAPS_DATABASE_URL", "sqlite:///./deepsynaps_protocol_studio.db"
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
                # JWT
                "jwt_secret_key": os.getenv(
                    "JWT_SECRET_KEY",
                    "CHANGE-THIS-IN-PRODUCTION-use-openssl-rand-hex-32",
                ),
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
                # Telegram
                "telegram_bot_token": os.getenv("TELEGRAM_BOT_TOKEN", ""),
                "telegram_webhook_secret": os.getenv("TELEGRAM_WEBHOOK_SECRET", ""),
                # Sentry
                "sentry_dsn": os.getenv("SENTRY_DSN", ""),
                # Anthropic
                "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
                # App URL
                "app_url": os.getenv("APP_URL", "http://localhost:5173"),
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

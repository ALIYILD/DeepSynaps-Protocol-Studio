"""DeepSynaps environment configuration — database, security, deployment.

All methods read from os.environ dynamically, so tests can monkeypatch
environment variables and see the changes immediately.
"""

import os
from typing import Optional


class DeepSynapsConfig:
    """Centralized configuration with env var support and dialect awareness.
    
    All classmethods read os.environ dynamically — no cached values.
    """

    # ── App Environment ──────────────────────────────────────────
    @classmethod
    def app_env(cls) -> str:
        return os.environ.get("DEEPSYNAPS_APP_ENV", "development")

    @classmethod
    def is_production(cls) -> bool:
        return cls.app_env() == "production"

    @classmethod
    def is_test(cls) -> bool:
        return cls.app_env() in ("test", "testing")

    # ── Database ─────────────────────────────────────────────────
    @classmethod
    def database_url(cls) -> str:
        return os.environ.get("DATABASE_URL", "")

    @classmethod
    def deepsynaps_db(cls) -> str:
        return os.environ.get("DEEPSYNAPS_DB", ":memory:")

    @classmethod
    def db_url(cls) -> str:
        return cls.database_url() or cls.deepsynaps_db() or ":memory:"

    @classmethod
    def is_postgres(cls) -> bool:
        url = cls.db_url()
        return url.startswith("postgresql://") or url.startswith("postgres://")

    @classmethod
    def is_sqlite(cls) -> bool:
        return not cls.is_postgres()

    # ── SQLite Dev/Test Safety ───────────────────────────────────
    @classmethod
    def sqlite_allowed(cls) -> bool:
        return not cls.is_production()

    # ── PostgreSQL Production Safety ─────────────────────────────
    @classmethod
    def validate_production_db(cls) -> None:
        if cls.is_production() and cls.is_sqlite():
            raise RuntimeError(
                "FATAL: Production environment requires PostgreSQL. "
                "Set DATABASE_URL=postgresql://user:pass@host/db. "
                "SQLite is not permitted in production."
            )

    # ── Connection Pooling (PostgreSQL only) ────────────────────
    @classmethod
    def postgres_pool_size(cls) -> int:
        return int(os.environ.get("POSTGRES_POOL_SIZE", "10"))

    @classmethod
    def postgres_max_overflow(cls) -> int:
        return int(os.environ.get("POSTGRES_MAX_OVERFLOW", "20"))

    @classmethod
    def postgres_pool_recycle(cls) -> int:
        return int(os.environ.get("POSTGRES_POOL_RECYCLE", "3600"))

    @classmethod
    def postgres_pool_pre_ping(cls) -> bool:
        return os.environ.get("POSTGRES_POOL_PRE_PING", "true").lower() == "true"

    @classmethod
    def postgres_sslmode(cls) -> str:
        return os.environ.get("POSTGRES_SSLMODE", "prefer")

    # ── Demo Mode ────────────────────────────────────────────────
    @classmethod
    def demo_mode(cls) -> bool:
        return os.environ.get("DEEPSYNAPS_DEMO_MODE", "").lower() in ("1", "true", "yes")

    # ── Logging ──────────────────────────────────────────────────
    @classmethod
    def log_level(cls) -> str:
        return os.environ.get("DEEPSYNAPS_LOG_LEVEL", "INFO")

    # ── Debug Info ───────────────────────────────────────────────
    @classmethod
    def debug_info(cls) -> dict:
        return {
            "app_env": cls.app_env(),
            "dialect": "postgresql" if cls.is_postgres() else "sqlite",
            "demo_mode": cls.demo_mode(),
            "log_level": cls.log_level(),
            "pool_size": cls.postgres_pool_size() if cls.is_postgres() else None,
            "sslmode": cls.postgres_sslmode() if cls.is_postgres() else None,
        }


# Keep module-level compatibility aliases
def is_postgres() -> bool:
    return DeepSynapsConfig.is_postgres()


def is_sqlite() -> bool:
    return DeepSynapsConfig.is_sqlite()


def is_production() -> bool:
    return DeepSynapsConfig.is_production()


def is_test() -> bool:
    return DeepSynapsConfig.is_test()


def validate_production_db() -> None:
    DeepSynapsConfig.validate_production_db()


def sqlite_allowed() -> bool:
    return DeepSynapsConfig.sqlite_allowed()

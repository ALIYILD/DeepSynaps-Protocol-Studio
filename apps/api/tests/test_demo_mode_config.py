"""Tests for demo mode configuration and production guardrails.

Covers: demo_mode(), demo_seed_enabled(), demo_mode_label(),
validate_production_demo_guard(), runtime_config() safe output.
No FastAPI dependency — pure config tests.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

import pytest
from config import DeepSynapsConfig


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Reset env vars before every test."""
    monkeypatch.delenv("DEEPSYNAPS_DEMO_MODE", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_DEMO_CLINIC_SEED", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_DEMO_MODE_LABEL", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_APP_ENV", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_DB", raising=False)


# ═══════════════════════════════════════════════════════════════════════════════
# demo_mode()
# ═══════════════════════════════════════════════════════════════════════════════

class TestDemoMode:
    """Tests for DEEPSYNAPS_DEMO_MODE env var parsing."""

    def test_default_is_false(self):
        assert DeepSynapsConfig.demo_mode() is False

    def test_true_string(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "true")
        assert DeepSynapsConfig.demo_mode() is True

    def test_one_string(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "1")
        assert DeepSynapsConfig.demo_mode() is True

    def test_yes_string(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "yes")
        assert DeepSynapsConfig.demo_mode() is True

    def test_uppercase_true(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "TRUE")
        assert DeepSynapsConfig.demo_mode() is True

    def test_false_string(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "false")
        assert DeepSynapsConfig.demo_mode() is False

    def test_zero_string(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "0")
        assert DeepSynapsConfig.demo_mode() is False

    def test_empty_string(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "")
        assert DeepSynapsConfig.demo_mode() is False

    def test_no_env_var(self):
        # DEEPSYNAPS_DEMO_MODE should not be set
        assert "DEEPSYNAPS_DEMO_MODE" not in os.environ
        assert DeepSynapsConfig.demo_mode() is False


# ═══════════════════════════════════════════════════════════════════════════════
# demo_seed_enabled()
# ═══════════════════════════════════════════════════════════════════════════════

class TestDemoSeedEnabled:
    """Tests for DEEPSYNAPS_DEMO_CLINIC_SEED env var parsing."""

    def test_default_is_false(self):
        assert DeepSynapsConfig.demo_seed_enabled() is False

    def test_true(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "true")
        assert DeepSynapsConfig.demo_seed_enabled() is True

    def test_one(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "1")
        assert DeepSynapsConfig.demo_seed_enabled() is True

    def test_false(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "false")
        assert DeepSynapsConfig.demo_seed_enabled() is False

    def test_zero(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "0")
        assert DeepSynapsConfig.demo_seed_enabled() is False


# ═══════════════════════════════════════════════════════════════════════════════
# demo_mode_label()
# ═══════════════════════════════════════════════════════════════════════════════

class TestDemoModeLabel:
    """Tests for DEEPSYNAPS_DEMO_MODE_LABEL env var."""

    def test_default(self):
        assert DeepSynapsConfig.demo_mode_label() == "DEMO BUILD"

    def test_custom_label(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE_LABEL", "INVESTOR DEMO")
        assert DeepSynapsConfig.demo_mode_label() == "INVESTOR DEMO"

    def test_empty_label(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE_LABEL", "")
        assert DeepSynapsConfig.demo_mode_label() == ""


# ═══════════════════════════════════════════════════════════════════════════════
# Production Demo Guard
# ═══════════════════════════════════════════════════════════════════════════════

class TestProductionDemoGuard:
    """Tests for validate_production_demo_guard() — production safety."""

    def test_development_no_warning(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "development")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "true")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "true")
        warnings = DeepSynapsConfig.validate_production_demo_guard()
        assert len(warnings) == 0

    def test_production_demo_seed_warns(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "true")
        warnings = DeepSynapsConfig.validate_production_demo_guard()
        assert len(warnings) == 1
        assert "CRITICAL" in warnings[0]
        assert "DEEPSYNAPS_DEMO_CLINIC_SEED" in warnings[0]

    def test_production_demo_mode_warns(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "true")
        warnings = DeepSynapsConfig.validate_production_demo_guard()
        assert len(warnings) == 1
        assert "WARNING" in warnings[0]
        assert "DEEPSYNAPS_DEMO_MODE" in warnings[0]

    def test_production_both_demo_flags_warns_twice(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "true")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "true")
        warnings = DeepSynapsConfig.validate_production_demo_guard()
        assert len(warnings) == 2
        assert any("CRITICAL" in w for w in warnings)
        assert any("WARNING" in w for w in warnings)

    def test_production_clean_no_warnings(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "false")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "false")
        warnings = DeepSynapsConfig.validate_production_demo_guard()
        assert len(warnings) == 0

    def test_staging_demo_allowed(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "staging")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "true")
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "true")
        warnings = DeepSynapsConfig.validate_production_demo_guard()
        assert len(warnings) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# runtime_config() — No Secrets
# ═══════════════════════════════════════════════════════════════════════════════

class TestRuntimeConfig:
    """Tests that runtime_config() never exposes secrets."""

    def test_returns_dict(self):
        cfg = DeepSynapsConfig.runtime_config()
        assert isinstance(cfg, dict)

    def test_has_expected_keys(self):
        cfg = DeepSynapsConfig.runtime_config()
        expected = [
            "app_env", "dialect", "demo_mode_enabled",
            "demo_seed_enabled", "demo_mode_label",
            "is_production", "log_level",
        ]
        for key in expected:
            assert key in cfg, f"Missing key: {key}"

    def test_no_secrets_exposed(self):
        cfg = DeepSynapsConfig.runtime_config()
        cfg_str = str(cfg)
        forbidden = ["password", "secret", "token", "api_key", "db_url", "postgresql://"]
        for term in forbidden:
            assert term not in cfg_str.lower(), f"Secret leak: '{term}' found in runtime_config"

    def test_demo_mode_false_by_default(self):
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["demo_mode_enabled"] is False

    def test_demo_seed_false_by_default(self):
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["demo_seed_enabled"] is False

    def test_is_production_matches_env(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["is_production"] is True

    def test_demo_mode_true_in_runtime_config(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE", "true")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["demo_mode_enabled"] is True

    def test_demo_seed_true_in_runtime_config(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_CLINIC_SEED", "true")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["demo_seed_enabled"] is True

    def test_custom_label_in_runtime_config(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DEMO_MODE_LABEL", "INVESTOR DEMO")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["demo_mode_label"] == "INVESTOR DEMO"

    def test_pool_size_in_runtime_config_postgres(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["pool_size"] == 10  # default

    def test_pool_size_none_sqlite(self):
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["pool_size"] is None

    def test_dialect_postgres(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host/db")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["dialect"] == "postgresql"

    def test_dialect_sqlite(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_DB", ":memory:")
        cfg = DeepSynapsConfig.runtime_config()
        assert cfg["dialect"] == "sqlite"


# ═══════════════════════════════════════════════════════════════════════════════
# app_env() edge cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestAppEnv:
    """Tests for DEEPSYNAPS_APP_ENV parsing."""

    def test_default_is_development(self):
        assert DeepSynapsConfig.app_env() == "development"

    def test_production(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        assert DeepSynapsConfig.app_env() == "production"
        assert DeepSynapsConfig.is_production() is True

    def test_staging(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "staging")
        assert DeepSynapsConfig.is_production() is False

    def test_test(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
        assert DeepSynapsConfig.is_test() is True

    def test_testing(self, monkeypatch):
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "testing")
        assert DeepSynapsConfig.is_test() is True

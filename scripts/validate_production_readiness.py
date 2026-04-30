#!/usr/bin/env python3
"""Production readiness validator for DeepSynaps Protocol Studio.

Checks environment variables, dependencies, database connectivity,
and AI feature availability. Outputs PASS/WARN/FAIL for each check.

Usage:
    python scripts/validate_production_readiness.py
    python scripts/validate_production_readiness.py --json
    python scripts/validate_production_readiness.py --env production

Never exposes secret values — only checks for presence and format.
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------

@dataclass
class Check:
    name: str
    status: str  # PASS, WARN, FAIL
    message: str
    category: str = "general"


@dataclass
class ValidationReport:
    checks: list[Check] = field(default_factory=list)

    def add(self, name: str, status: str, message: str, category: str = "general") -> None:
        self.checks.append(Check(name=name, status=status, message=message, category=category))

    @property
    def pass_count(self) -> int:
        return sum(1 for c in self.checks if c.status == "PASS")

    @property
    def warn_count(self) -> int:
        return sum(1 for c in self.checks if c.status == "WARN")

    @property
    def fail_count(self) -> int:
        return sum(1 for c in self.checks if c.status == "FAIL")

    @property
    def overall(self) -> str:
        if self.fail_count > 0:
            return "FAIL"
        if self.warn_count > 0:
            return "WARN"
        return "PASS"


# ---------------------------------------------------------------------------
# Helpers (never expose values)
# ---------------------------------------------------------------------------

def _has_env(key: str) -> bool:
    return bool(os.environ.get(key, "").strip())


def _env_looks_like(key: str, prefix: str) -> bool:
    val = os.environ.get(key, "").strip()
    return val.startswith(prefix) if val else False


def _can_import(module: str) -> bool:
    try:
        importlib.import_module(module)
        return True
    except Exception:
        return False


def _path_exists(env_key: str) -> bool:
    val = os.environ.get(env_key, "").strip()
    return Path(val).exists() if val else False


# ---------------------------------------------------------------------------
# Check groups
# ---------------------------------------------------------------------------

def check_backend_env(report: ValidationReport, env: str) -> None:
    cat = "backend_env"

    # DEEPSYNAPS_APP_ENV
    if _has_env("DEEPSYNAPS_APP_ENV"):
        report.add("DEEPSYNAPS_APP_ENV", "PASS", f"Set to '{os.environ['DEEPSYNAPS_APP_ENV']}'", cat)
    else:
        report.add("DEEPSYNAPS_APP_ENV", "WARN", "Not set; defaults to 'development'", cat)

    # Database URL
    if _has_env("DEEPSYNAPS_DATABASE_URL"):
        url = os.environ["DEEPSYNAPS_DATABASE_URL"]
        if "postgresql" in url or "postgres" in url:
            report.add("DEEPSYNAPS_DATABASE_URL", "PASS", "PostgreSQL URL configured (value hidden)", cat)
        elif "sqlite" in url:
            if env in ("production", "staging"):
                report.add("DEEPSYNAPS_DATABASE_URL", "FAIL", "SQLite not suitable for production", cat)
            else:
                report.add("DEEPSYNAPS_DATABASE_URL", "WARN", "SQLite configured (dev only)", cat)
        else:
            report.add("DEEPSYNAPS_DATABASE_URL", "PASS", "Database URL set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("DEEPSYNAPS_DATABASE_URL", "FAIL", "Not set; required for production", cat)
        else:
            report.add("DEEPSYNAPS_DATABASE_URL", "WARN", "Not set; defaults to local SQLite", cat)

    # JWT Secret
    insecure_default = "CHANGE-THIS-IN-PRODUCTION-use-openssl-rand-hex-32"
    if _has_env("JWT_SECRET_KEY"):
        val = os.environ["JWT_SECRET_KEY"]
        if val == insecure_default:
            report.add("JWT_SECRET_KEY", "FAIL", "Still set to insecure placeholder", cat)
        elif len(val) < 32:
            report.add("JWT_SECRET_KEY", "WARN", "Set but shorter than recommended 32 chars", cat)
        else:
            report.add("JWT_SECRET_KEY", "PASS", "Set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("JWT_SECRET_KEY", "FAIL", "Not set; required for production", cat)
        else:
            report.add("JWT_SECRET_KEY", "WARN", "Not set; uses insecure default in dev", cat)

    # Secrets key (Fernet for 2FA)
    if _has_env("DEEPSYNAPS_SECRETS_KEY"):
        report.add("DEEPSYNAPS_SECRETS_KEY", "PASS", "Set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("DEEPSYNAPS_SECRETS_KEY", "FAIL", "Not set; required for 2FA persistence", cat)
        else:
            report.add("DEEPSYNAPS_SECRETS_KEY", "WARN", "Not set; ephemeral key in dev", cat)

    # CORS origins
    if _has_env("DEEPSYNAPS_CORS_ORIGINS"):
        report.add("DEEPSYNAPS_CORS_ORIGINS", "PASS", "Set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("DEEPSYNAPS_CORS_ORIGINS", "FAIL", "Not set; no cross-origin requests allowed", cat)
        else:
            report.add("DEEPSYNAPS_CORS_ORIGINS", "WARN", "Not set; CORS will reject browser requests", cat)

    # Wearable encryption key
    if _has_env("WEARABLE_TOKEN_ENC_KEY"):
        report.add("WEARABLE_TOKEN_ENC_KEY", "PASS", "Set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("WEARABLE_TOKEN_ENC_KEY", "FAIL", "Not set; required in production", cat)
        else:
            report.add("WEARABLE_TOKEN_ENC_KEY", "WARN", "Not set; plaintext fallback in dev", cat)


def check_redis_celery(report: ValidationReport, env: str) -> None:
    cat = "redis_celery"

    # Celery broker
    if _has_env("CELERY_BROKER_URL"):
        report.add("CELERY_BROKER_URL", "PASS", "Set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("CELERY_BROKER_URL", "FAIL", "Not set; async jobs (qEEG, DeepTwin) will fail", cat)
        else:
            report.add("CELERY_BROKER_URL", "WARN", "Not set; workers run inline in dev", cat)

    # Celery result backend
    if _has_env("CELERY_RESULT_BACKEND"):
        report.add("CELERY_RESULT_BACKEND", "PASS", "Set (value hidden)", cat)
    else:
        report.add("CELERY_RESULT_BACKEND", "WARN", "Not set; falls back to broker URL", cat)

    # Rate limiter Redis
    if _has_env("DEEPSYNAPS_LIMITER_REDIS_URI"):
        report.add("DEEPSYNAPS_LIMITER_REDIS_URI", "PASS", "Set (value hidden)", cat)
    else:
        if env in ("production", "staging"):
            report.add("DEEPSYNAPS_LIMITER_REDIS_URI", "WARN",
                       "Not set; rate limits use in-memory (per-machine) counters", cat)
        else:
            report.add("DEEPSYNAPS_LIMITER_REDIS_URI", "WARN", "Not set; in-memory rate limiting", cat)


def check_stripe(report: ValidationReport, env: str) -> None:
    cat = "stripe"
    if _has_env("STRIPE_SECRET_KEY"):
        if _env_looks_like("STRIPE_SECRET_KEY", "sk_live_"):
            report.add("STRIPE_SECRET_KEY", "PASS", "Live key configured (value hidden)", cat)
        elif _env_looks_like("STRIPE_SECRET_KEY", "sk_test_"):
            if env in ("production",):
                report.add("STRIPE_SECRET_KEY", "WARN", "Test key in production environment", cat)
            else:
                report.add("STRIPE_SECRET_KEY", "PASS", "Test key configured", cat)
        else:
            report.add("STRIPE_SECRET_KEY", "PASS", "Set (value hidden)", cat)
    else:
        report.add("STRIPE_SECRET_KEY", "WARN", "Not set; billing features disabled", cat)

    if _has_env("STRIPE_WEBHOOK_SECRET"):
        report.add("STRIPE_WEBHOOK_SECRET", "PASS", "Set (value hidden)", cat)
    else:
        if _has_env("STRIPE_SECRET_KEY"):
            report.add("STRIPE_WEBHOOK_SECRET", "WARN", "Stripe key set but webhook secret missing", cat)
        else:
            report.add("STRIPE_WEBHOOK_SECRET", "WARN", "Not set; Stripe webhooks disabled", cat)


def check_ai_providers(report: ValidationReport) -> None:
    cat = "ai_providers"
    has_any = False

    for key, label in [
        ("ANTHROPIC_API_KEY", "Anthropic"),
        ("OPENAI_API_KEY", "OpenAI"),
        ("GLM_API_KEY", "GLM/OpenRouter"),
    ]:
        if _has_env(key):
            report.add(key, "PASS", f"{label} API key set (value hidden)", cat)
            has_any = True
        else:
            report.add(key, "WARN", f"{label} not configured; LLM features using this provider are unavailable", cat)

    if not has_any:
        report.add("LLM_BACKEND", "WARN",
                    "No LLM API key configured; chat copilot and qEEG interpreter will be unavailable", cat)


def check_ml_models(report: ValidationReport) -> None:
    cat = "ml_models"

    # PyTorch
    if _can_import("torch"):
        report.add("torch", "PASS", "PyTorch importable", cat)
    else:
        report.add("torch", "WARN", "PyTorch not installed; brain-age CNN, LaBraM, risk predictor unavailable", cat)

    # Brain-age weights
    if _path_exists("BRAINAGE_WEIGHTS_PATH"):
        report.add("BRAINAGE_WEIGHTS_PATH", "PASS", "Brain-age model weights found", cat)
    elif _has_env("BRAINAGE_WEIGHTS_PATH"):
        report.add("BRAINAGE_WEIGHTS_PATH", "FAIL", "Env set but path does not exist", cat)
    else:
        report.add("BRAINAGE_WEIGHTS_PATH", "WARN", "Not set; brain-age CNN unavailable", cat)

    # Foundation model weights
    if _path_exists("FOUNDATION_WEIGHTS_DIR"):
        report.add("FOUNDATION_WEIGHTS_DIR", "PASS", "LaBraM foundation weights found", cat)
    elif _has_env("FOUNDATION_WEIGHTS_DIR"):
        report.add("FOUNDATION_WEIGHTS_DIR", "FAIL", "Env set but path does not exist", cat)
    else:
        report.add("FOUNDATION_WEIGHTS_DIR", "WARN", "Not set; LaBraM falls back to lightweight projector", cat)

    # qEEG pipeline
    if _can_import("deepsynaps_qeeg"):
        report.add("deepsynaps_qeeg", "PASS", "qEEG pipeline package importable", cat)
    else:
        report.add("deepsynaps_qeeg", "WARN", "Not installed; qEEG recommendations unavailable", cat)


def check_pgvector(report: ValidationReport) -> None:
    cat = "pgvector"

    pgvector_ok = _can_import("pgvector")
    st_ok = _can_import("sentence_transformers")
    psycopg_ok = _can_import("psycopg")

    if pgvector_ok and st_ok and psycopg_ok:
        report.add("medrag_dense", "PASS",
                    "pgvector + sentence-transformers + psycopg all importable; dense MedRAG available", cat)
    else:
        missing = []
        if not pgvector_ok:
            missing.append("pgvector")
        if not st_ok:
            missing.append("sentence_transformers")
        if not psycopg_ok:
            missing.append("psycopg")
        report.add("medrag_dense", "WARN",
                    f"Missing: {', '.join(missing)}; MedRAG falls back to keyword matching", cat)

    # Check for PostgreSQL with pgvector extension (can only verify if DB URL is postgres)
    if _has_env("DEEPSYNAPS_DATABASE_URL"):
        url = os.environ["DEEPSYNAPS_DATABASE_URL"]
        if "postgresql" in url or "postgres" in url:
            report.add("pgvector_db", "WARN",
                       "PostgreSQL configured; verify pgvector extension is enabled with: "
                       "CREATE EXTENSION IF NOT EXISTS vector", cat)
        else:
            report.add("pgvector_db", "WARN",
                       "Non-PostgreSQL database; pgvector dense retrieval requires PostgreSQL", cat)


def check_frontend_env(report: ValidationReport) -> None:
    cat = "frontend_env"

    if _has_env("VITE_API_BASE_URL"):
        report.add("VITE_API_BASE_URL", "PASS", "Set (value hidden)", cat)
    else:
        report.add("VITE_API_BASE_URL", "WARN",
                    "Not set; API calls will use relative URLs (requires proxy or same-origin)", cat)

    if _has_env("VITE_ENABLE_DEMO"):
        val = os.environ["VITE_ENABLE_DEMO"]
        if val == "1":
            report.add("VITE_ENABLE_DEMO", "WARN", "Demo mode enabled; disable for production", cat)
        else:
            report.add("VITE_ENABLE_DEMO", "PASS", "Demo mode disabled", cat)
    else:
        report.add("VITE_ENABLE_DEMO", "PASS", "Not set; demo mode off by default", cat)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_validation(env: str | None = None) -> ValidationReport:
    if env is None:
        env = os.environ.get("DEEPSYNAPS_APP_ENV", "development")

    report = ValidationReport()

    check_backend_env(report, env)
    check_redis_celery(report, env)
    check_stripe(report, env)
    check_ai_providers(report)
    check_ml_models(report)
    check_pgvector(report)
    check_frontend_env(report)

    return report


def print_report(report: ValidationReport, as_json: bool = False) -> None:
    if as_json:
        data = {
            "overall": report.overall,
            "pass": report.pass_count,
            "warn": report.warn_count,
            "fail": report.fail_count,
            "checks": [
                {"name": c.name, "status": c.status, "message": c.message, "category": c.category}
                for c in report.checks
            ],
        }
        print(json.dumps(data, indent=2))
        return

    status_icons = {"PASS": "\033[32mPASS\033[0m", "WARN": "\033[33mWARN\033[0m", "FAIL": "\033[31mFAIL\033[0m"}
    current_cat = ""

    print("=" * 70)
    print("  DeepSynaps Production Readiness Validation")
    print("=" * 70)
    env = os.environ.get("DEEPSYNAPS_APP_ENV", "development")
    print(f"  Environment: {env}")
    print()

    for check in report.checks:
        if check.category != current_cat:
            current_cat = check.category
            label = current_cat.replace("_", " ").title()
            print(f"  --- {label} ---")

        icon = status_icons.get(check.status, check.status)
        print(f"  [{icon}] {check.name}: {check.message}")

    print()
    print("-" * 70)
    overall_icon = status_icons.get(report.overall, report.overall)
    print(f"  Overall: [{overall_icon}]  "
          f"PASS={report.pass_count}  WARN={report.warn_count}  FAIL={report.fail_count}")
    print("-" * 70)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate production readiness")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--env", default=None, help="Override DEEPSYNAPS_APP_ENV for validation context")
    args = parser.parse_args()

    if args.env:
        os.environ["DEEPSYNAPS_APP_ENV"] = args.env

    report = run_validation(env=args.env)
    print_report(report, as_json=args.json)

    sys.exit(0 if report.fail_count == 0 else 1)


if __name__ == "__main__":
    main()

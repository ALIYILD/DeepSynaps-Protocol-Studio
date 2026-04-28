import os
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient


# Use a per-process DB file so parallel pytest invocations don't collide.
TEST_DB_PATH = Path(__file__).resolve().parent / f".test_deepsynaps_{os.getpid()}.db"
# Set environment BEFORE any app module is imported so cached settings reflect test values.
os.environ["DEEPSYNAPS_APP_ENV"] = "test"
os.environ["DEEPSYNAPS_DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
# Avoid writing clinical snapshot manifest files into the repo during tests.
os.environ["DEEPSYNAPS_CLINICAL_SNAPSHOT_ROOT"] = os.getenv(
    "DEEPSYNAPS_CLINICAL_SNAPSHOT_ROOT",
    str((Path(__file__).resolve().parent / ".test_artifacts" / "clinical-snapshots").as_posix()),
)

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_PATHS = [
    REPO_ROOT / "apps" / "api",
    REPO_ROOT / "packages" / "core-schema" / "src",
    REPO_ROOT / "packages" / "condition-registry" / "src",
    REPO_ROOT / "packages" / "modality-registry" / "src",
    REPO_ROOT / "packages" / "device-registry" / "src",
    REPO_ROOT / "packages" / "safety-engine" / "src",
    REPO_ROOT / "packages" / "generation-engine" / "src",
    REPO_ROOT / "packages" / "render-engine" / "src",
    # Sibling qEEG pipeline — editable install in Docker; for local pytest
    # we surface it on sys.path so the AI-upgrade bridge + longitudinal /
    # copilot modules are importable without `pip install -e`.
    REPO_ROOT / "packages" / "qeeg-pipeline" / "src",
    # Sibling MRI pipeline — see mri_pipeline façade. Heavy neuro deps
    # are optional extras so the import may still fail (HAS_MRI_PIPELINE
    # guards that), but making the path visible lets the façade load
    # schemas without pip-installing the package.
    REPO_ROOT / "packages" / "mri-pipeline" / "src",
    # Evidence Citation Validator package (migration 045).
    REPO_ROOT / "packages" / "evidence" / "src",
    # QA package — protocol quality checks (may be added by parallel session).
    REPO_ROOT / "packages" / "qa" / "src",
]

for source_path in SOURCE_PATHS:
    sys.path.insert(0, str(source_path))

from app.database import reset_database  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.main import app  # noqa: E402

# Functional tests issue many requests in quick succession; disable SlowAPI in test runs.
limiter.enabled = False


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    """Delete the per-process test DB file after the full session completes."""
    yield
    try:
        TEST_DB_PATH.unlink(missing_ok=True)
    except OSError:
        pass


@pytest.fixture(autouse=True)
def isolated_database() -> None:
    reset_database(fast=True)   # fast truncate path (~20x) — falls back to DDL on first call
    # Seed Clinic + User row keyed on the demo clinician's actor_id so the
    # cross-clinic ownership gate (added in the audit) finds a real clinic_id
    # when tests use the `clinician-demo-token`. Idempotent per-test thanks to
    # reset_database() above.
    from app.database import SessionLocal
    from app.persistence.models import Clinic, User
    _db = SessionLocal()
    try:
        _clinic_id = "clinic-demo-default"
        if _db.query(Clinic).filter_by(id=_clinic_id).first() is None:
            _db.add(Clinic(id=_clinic_id, name="Demo Clinic"))
            _db.flush()
        if _db.query(User).filter_by(id="actor-clinician-demo").first() is None:
            _db.add(User(
                id="actor-clinician-demo",
                email="demo_clinician@example.com",
                display_name="Verified Clinician Demo",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=_clinic_id,
            ))
        if _db.query(User).filter_by(id="actor-admin-demo").first() is None:
            _db.add(User(
                id="actor-admin-demo",
                email="demo_admin@example.com",
                display_name="Admin Demo User",
                hashed_password="x",
                role="admin",
                package_id="enterprise",
                clinic_id=_clinic_id,
            ))
        _db.commit()
    except Exception:
        _db.rollback()
    finally:
        _db.close()
    yield
    reset_database(fast=True)   # clean up after each test


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, dict[str, str]]:
    return {
        "guest": {"Authorization": "Bearer guest-demo-token"},
        "patient": {"Authorization": "Bearer patient-demo-token"},
        "clinician": {"Authorization": "Bearer clinician-demo-token"},
        "admin": {"Authorization": "Bearer admin-demo-token"},
    }

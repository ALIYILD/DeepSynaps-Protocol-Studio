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
]

for source_path in SOURCE_PATHS:
    sys.path.insert(0, str(source_path))

from app.database import init_database, reset_database  # noqa: E402
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
    reset_database()   # drop_all then create_all — always idempotent regardless of prior state
    yield
    reset_database()   # clean up after each test


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

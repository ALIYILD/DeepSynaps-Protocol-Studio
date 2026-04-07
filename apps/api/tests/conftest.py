import os
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient


TEST_DB_PATH = Path(__file__).resolve().parent / ".test_deepsynaps_protocol_studio.db"
os.environ["DEEPSYNAPS_DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"

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
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_database() -> None:
    init_database()
    reset_database()
    yield
    reset_database()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, dict[str, str]]:
    return {
        "guest": {"Authorization": "Bearer guest-demo-token"},
        "clinician": {"Authorization": "Bearer clinician-demo-token"},
        "admin": {"Authorization": "Bearer admin-demo-token"},
    }

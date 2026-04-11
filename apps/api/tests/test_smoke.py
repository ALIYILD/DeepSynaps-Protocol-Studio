"""
Smoke tests — end-to-end happy-path coverage for the most critical API flows.

Uses the TestClient fixture from conftest.py which spins up an isolated
SQLite database (reset between each test) and a real FastAPI app instance.

Flows tested
------------
1.  Register a clinician user
2.  Login and get JWT token
3.  GET /api/v1/auth/me with token
4.  Create a patient (clinician)
5.  List patients
6.  Create a treatment course
7.  List treatment courses
8.  GET /api/v1/health  (both /health and /api/v1/health)
9.  Register a patient user, activate with invite code
10. GET /api/v1/patient-portal/me with patient token
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

# ── Constants ──────────────────────────────────────────────────────────────────

CLINICIAN_EMAIL = "smoketest_clinician@example.com"
CLINICIAN_PW = "Sm0keTest!"
CLINICIAN_NAME = "Smoke Clinician"

PATIENT_EMAIL = "smoketest_patient@example.com"
PATIENT_PW = "P@tient99!"
PATIENT_NAME = "Smoke Patient"


# ── Helper fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def clinician_token(client: TestClient) -> str:
    """Register a clinician and return the access token."""
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": CLINICIAN_EMAIL,
            "display_name": CLINICIAN_NAME,
            "password": CLINICIAN_PW,
            "role": "clinician",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


@pytest.fixture
def clinician_headers(clinician_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {clinician_token}"}


@pytest.fixture
def patient_id(client: TestClient, clinician_headers: dict[str, str]) -> str:
    """Create a patient record and return its id."""
    resp = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Smoke",
            "last_name": "Patient",
            "dob": "1985-03-15",
            "gender": "M",
            "email": PATIENT_EMAIL,
            "primary_condition": "depression",
        },
        headers=clinician_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def patient_token(client: TestClient, clinician_headers: dict[str, str], patient_id: str) -> str:
    """Create a patient account via invite flow and return the access token."""
    # Generate invite
    inv = client.post(
        "/api/v1/patients/invite",
        json={"patient_name": PATIENT_NAME, "patient_email": PATIENT_EMAIL},
        headers=clinician_headers,
    )
    assert inv.status_code == 201, inv.text
    invite_code = inv.json()["invite_code"]

    # Activate patient account
    act = client.post(
        "/api/v1/auth/activate-patient",
        json={
            "invite_code": invite_code,
            "email": PATIENT_EMAIL,
            "display_name": PATIENT_NAME,
            "password": PATIENT_PW,
        },
    )
    assert act.status_code == 201, act.text
    return act.json()["access_token"]


@pytest.fixture
def patient_headers(patient_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {patient_token}"}


# ── Flow 1 & 2: Register + Login ───────────────────────────────────────────────


class TestAuthRegisterAndLogin:
    def test_register_clinician_returns_201_with_token(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "email": "new_clinician@example.com",
                "display_name": "New Clinician",
                "password": "NewPass99!",
                "role": "clinician",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["role"] == "clinician"
        assert data["user"]["email"] == "new_clinician@example.com"

    def test_login_with_correct_credentials_returns_token(self, client: TestClient) -> None:
        # Register first
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "login_test@example.com",
                "display_name": "Login Test",
                "password": "LogInOk99!",
                "role": "clinician",
            },
        )

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "login_test@example.com", "password": "LogInOk99!"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_with_wrong_password_returns_401(self, client: TestClient) -> None:
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "wrong_pw@example.com",
                "display_name": "Wrong PW",
                "password": "Correct99!",
                "role": "clinician",
            },
        )
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "wrong_pw@example.com", "password": "WrongPassword!"},
        )
        assert resp.status_code == 401

    def test_register_duplicate_email_returns_409(self, client: TestClient) -> None:
        payload = {
            "email": "dup@example.com",
            "display_name": "Dup",
            "password": "Dup1234!!",
            "role": "clinician",
        }
        client.post("/api/v1/auth/register", json=payload)
        resp = client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409


# ── Flow 3: GET /api/v1/auth/me ────────────────────────────────────────────────


class TestAuthMe:
    def test_me_returns_user_profile(
        self, client: TestClient, clinician_token: str
    ) -> None:
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {clinician_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == CLINICIAN_EMAIL
        assert data["role"] == "clinician"
        assert data["display_name"] == CLINICIAN_NAME
        assert "id" in data

    def test_me_without_token_returns_401(self, client: TestClient) -> None:
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_me_with_invalid_token_returns_401(self, client: TestClient) -> None:
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == 401


# ── Flow 4 & 5: Create + List Patients ────────────────────────────────────────


class TestPatients:
    def test_create_patient_returns_201(
        self, client: TestClient, clinician_headers: dict[str, str]
    ) -> None:
        resp = client.post(
            "/api/v1/patients",
            json={
                "first_name": "Alice",
                "last_name": "Smith",
                "dob": "1990-01-01",
                "gender": "F",
                "email": "alice.smith@example.com",
                "primary_condition": "anxiety",
            },
            headers=clinician_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["first_name"] == "Alice"
        assert data["last_name"] == "Smith"
        assert "id" in data

    def test_list_patients_returns_items(
        self, client: TestClient, clinician_headers: dict[str, str], patient_id: str
    ) -> None:
        resp = client.get("/api/v1/patients", headers=clinician_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 1
        ids = [p["id"] for p in data["items"]]
        assert patient_id in ids

    def test_create_patient_without_auth_is_rejected(self, client: TestClient) -> None:
        # Anonymous actor has guest role — clinician endpoint returns 403 (insufficient role)
        resp = client.post(
            "/api/v1/patients",
            json={"first_name": "X", "last_name": "Y"},
        )
        assert resp.status_code in (401, 403)

    def test_list_patients_without_auth_is_rejected(self, client: TestClient) -> None:
        # Anonymous actor has guest role — clinician endpoint returns 403 (insufficient role)
        resp = client.get("/api/v1/patients")
        assert resp.status_code in (401, 403)


# ── Flow 6 & 7: Create + List Treatment Courses ───────────────────────────────


class TestTreatmentCourses:
    def test_create_course_returns_201(
        self,
        client: TestClient,
        clinician_headers: dict[str, str],
        patient_id: str,
    ) -> None:
        resp = client.post(
            "/api/v1/treatment-courses",
            json={"patient_id": patient_id, "protocol_id": "PRO-001"},
            headers=clinician_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["patient_id"] == patient_id
        assert "id" in data

    def test_list_courses_returns_items(
        self,
        client: TestClient,
        clinician_headers: dict[str, str],
        patient_id: str,
    ) -> None:
        # Create one first
        c = client.post(
            "/api/v1/treatment-courses",
            json={"patient_id": patient_id, "protocol_id": "PRO-001"},
            headers=clinician_headers,
        )
        assert c.status_code == 201
        course_id = c.json()["id"]

        resp = client.get("/api/v1/treatment-courses", headers=clinician_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        ids = [item["id"] for item in data["items"]]
        assert course_id in ids

    def test_create_course_without_auth_is_rejected(
        self, client: TestClient, patient_id: str
    ) -> None:
        # Anonymous actor has guest role — clinician endpoint returns 403 (insufficient role)
        resp = client.post(
            "/api/v1/treatment-courses",
            json={"patient_id": patient_id, "protocol_id": "PRO-001"},
        )
        assert resp.status_code in (401, 403)


# ── Flow 8: Health endpoints ───────────────────────────────────────────────────


class TestHealthEndpoints:
    def test_health_returns_ok(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["database"] == "ok"
        assert data["db"] == "connected"

    def test_healthz_alias_matches_health(self, client: TestClient) -> None:
        h = client.get("/health")
        hz = client.get("/healthz")
        assert hz.status_code == 200
        assert hz.json()["status"] == h.json()["status"]

    def test_api_v1_health_returns_ok(self, client: TestClient) -> None:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["db"] == "connected"
        assert "version" in data


# ── Flow 9 & 10: Patient activation + patient-portal/me ─────────────────────


class TestPatientActivationAndPortal:
    def test_activate_patient_with_valid_invite_returns_201(
        self,
        client: TestClient,
        clinician_headers: dict[str, str],
    ) -> None:
        # Create patient record
        p = client.post(
            "/api/v1/patients",
            json={
                "first_name": "Bob",
                "last_name": "Jones",
                "email": "bob.jones.act@example.com",
            },
            headers=clinician_headers,
        )
        assert p.status_code == 201

        # Generate invite
        inv = client.post(
            "/api/v1/patients/invite",
            json={
                "patient_name": "Bob Jones",
                "patient_email": "bob.jones.act@example.com",
            },
            headers=clinician_headers,
        )
        assert inv.status_code == 201
        code = inv.json()["invite_code"]

        # Activate
        act = client.post(
            "/api/v1/auth/activate-patient",
            json={
                "invite_code": code,
                "email": "bob.jones.act@example.com",
                "display_name": "Bob Jones",
                "password": "BobPw9999!",
            },
        )
        assert act.status_code == 201
        data = act.json()
        assert "access_token" in data
        assert data["user"]["role"] == "patient"

    def test_activate_with_invalid_code_returns_400(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/activate-patient",
            json={
                "invite_code": "BADCODE-XXXX",
                "email": "nobody@example.com",
                "display_name": "Nobody",
                "password": "Nobody99!",
            },
        )
        assert resp.status_code == 400

    def test_patient_portal_me_returns_linked_record(
        self,
        client: TestClient,
        patient_headers: dict[str, str],
    ) -> None:
        resp = client.get("/api/v1/patient-portal/me", headers=patient_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_email"] == PATIENT_EMAIL
        assert data["first_name"] == "Smoke"
        assert "patient_id" in data

    def test_patient_portal_me_with_clinician_token_returns_403(
        self,
        client: TestClient,
        clinician_headers: dict[str, str],
    ) -> None:
        resp = client.get("/api/v1/patient-portal/me", headers=clinician_headers)
        assert resp.status_code == 403

    def test_patient_portal_me_without_token_is_rejected(
        self, client: TestClient
    ) -> None:
        # Anonymous actor gets guest role — patient portal checks role == "patient" → 403
        resp = client.get("/api/v1/patient-portal/me")
        assert resp.status_code in (401, 403)


# ── Token refresh ─────────────────────────────────────────────────────────────


class TestTokenRefresh:
    def test_refresh_token_returns_new_access_token(
        self, client: TestClient, clinician_token: str
    ) -> None:
        # Get a refresh token first by logging in
        login = client.post(
            "/api/v1/auth/login",
            json={"email": CLINICIAN_EMAIL, "password": CLINICIAN_PW},
        )
        assert login.status_code == 200
        refresh_token = login.json()["refresh_token"]

        resp = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    def test_refresh_with_invalid_token_returns_401(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "totally-invalid-refresh-token"},
        )
        assert resp.status_code == 401

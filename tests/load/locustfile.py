#!/usr/bin/env python3
"""
DeepSynaps Protocol Studio — Load Test Suite (Locust)
=======================================================
Simulates realistic user traffic across all major API endpoints.

Usage (local, headless):
    locust -f tests/load/locustfile.py \
        --host http://127.0.0.1:8000 \
        --users 100 --spawn-rate 10 --run-time 5m --headless

Usage (with config):
    locust -f tests/load/locustfile.py \
        --config tests/load/load-test-config.yml

Scenarios:
    1. Health check baseline          — APIHealthCheckUser
    2. Authentication flow            — AuthFlowUser
    3. Protocol generation (clinical) — ProtocolGenerationUser
    4. Patient data access            — PatientDataAccessUser
    5. Evidence query (search)        — EvidenceQueryUser
    6. Mixed real-world workload      — MixedWorkloadUser

All patient identifiers are synthetic (demo-pt-*). No real PHI is used.
"""

from __future__ import annotations

import json
import random
import time
import uuid
from typing import Any

from locust import HttpUser, between, events, task
from locust.contrib.fasthttp import FastHttpUser

# ── Constants ──────────────────────────────────────────────────────────

# Synthetic patient IDs — these match the demo-data fixtures in the API.
# They are NOT real patients; they are deterministic test personas.
SYNTHETIC_PATIENT_IDS = [
    "demo-pt-samantha-li",
    "demo-pt-elena-vasquez",
    "demo-pt-marcus-chen",
    "demo-pt-omar-haddad",
    "demo-pt-amelia-brown",
    "demo-pt-noah-patel",
    "demo-pt-sofia-kim",
    "demo-pt-lucas-martinez",
]

CONDITION_IDS = [
    "cond-mdd-001",
    "cond-gad-001",
    "cond-adhd-001",
    "cond-tbi-001",
    "cond-insomnia-001",
    "cond-ptsd-001",
    "cond-ocd-001",
    "cond-epilepsy-001",
]

MODALITIES = ["tACS", "tDCS", "tRNS", "neurofeedback", "medication"]

CLINICIAN_EMAILS = [
    "clinician.01@deepsynaps.test",
    "clinician.02@deepsynaps.test",
    "admin@deepsynaps.test",
]

# SLO thresholds (used by CI for pass/fail)
SLO_P95_RESPONSE_MS = 200
SLO_ERROR_RATE_PCT = 0.1


# ── Request event hook for SLO tracking ────────────────────────────────

_response_times: list[float] = []
_error_count = 0
_total_count = 0


@events.request.add_listener
def on_request(
    request_type: str,
    name: str,
    response_time: float,
    response_length: int,
    context: dict[str, Any] | None,
    exception: Exception | None,
    start_time: float,
    url: str,
    **_: Any,
) -> None:
    global _error_count, _total_count, _response_times
    _total_count += 1
    _response_times.append(response_time)
    if exception is not None:
        _error_count += 1


@events.quitting.add_listener
def on_quitting(environment, **_kw: Any) -> None:
    """Print SLO summary at the end of the test run."""
    if not _response_times:
        return
    sorted_times = sorted(_response_times)
    p95 = sorted_times[int(len(sorted_times) * 0.95)]
    p99 = sorted_times[int(len(sorted_times) * 0.99)]
    error_rate = (_error_count / _total_count) * 100 if _total_count else 0.0

    print("\n" + "=" * 60)
    print("  LOAD TEST SLO SUMMARY")
    print("=" * 60)
    print(f"  Total requests : {_total_count}")
    print(f"  Errors         : {_error_count} ({error_rate:.2f}%)")
    print(f"  P95 latency    : {p95:.1f} ms  (SLO: {SLO_P95_RESPONSE_MS} ms)")
    print(f"  P99 latency    : {p99:.1f} ms")
    print(
        f"  P95 SLO status : {'PASS' if p95 <= SLO_P95_RESPONSE_MS else 'FAIL'}"
    )
    print(
        f"  Error SLO      : {'PASS' if error_rate <= SLO_ERROR_RATE_PCT else 'FAIL'}"
    )
    print("=" * 60 + "\n")

    # Exit with non-zero if SLOs breached — signals CI failure
    if p95 > SLO_P95_RESPONSE_MS or error_rate > SLO_ERROR_RATE_PCT:
        environment.process_exit_code = 1


# ── Base authenticated user ────────────────────────────────────────────

class AuthenticatedUser(FastHttpUser):
    """Base user that logs in before performing tasks."""

    abstract = True
    wait_time = between(1, 4)

    # Subclasses should set these
    username: str = ""
    password: str = "demo-load-test-password"

    def on_start(self) -> None:
        """Authenticate and store bearer token."""
        # Demo login endpoint (no real credentials needed in staging)
        resp = self.client.post(
            "/api/v1/auth/demo-login",
            json={
                "email": self.username or random.choice(CLINICIAN_EMAILS),
                "patient_id": random.choice(SYNTHETIC_PATIENT_IDS),
            },
            name="POST /api/v1/auth/demo-login",
        )
        if resp.status_code == 200:
            data = resp.json()
            self.access_token = data.get("access_token", "")
        else:
            # Fall back to direct token for unauthenticated probes
            self.access_token = ""

    @property
    def _headers(self) -> dict[str, str]:
        if self.access_token:
            return {"Authorization": f"Bearer {self.access_token}"}
        return {}


# ── User classes (scenarios) ───────────────────────────────────────────

class APIHealthCheckUser(FastHttpUser):
    """
    Lightweight health-probe user.
    Represents monitoring tools (UptimeRobot, Datadog, etc.).
    """

    wait_time = between(5, 15)
    weight = 3

    @task
    def health_check(self) -> None:
        with self.client.get(
            "/health", name="GET /health", catch_response=True
        ) as resp:
            if resp.status_code == 200:
                body = resp.json()
                if body.get("status") == "healthy":
                    resp.success()
                else:
                    resp.failure(f"Unhealthy status: {body}")
            else:
                resp.failure(f"Unexpected status: {resp.status_code}")

    @task(2)
    def api_version(self) -> None:
        self.client.get("/api/v1/version", name="GET /api/v1/version")

    @task
    def openapi_schema(self) -> None:
        self.client.get("/api/v1/openapi.json", name="GET /openapi.json")


class AuthFlowUser(FastHttpUser):
    """
    Simulates login / logout / token-refresh cycles.
    Represents patient-portal and clinician-dashboard sessions.
    """

    wait_time = between(2, 8)
    weight = 4

    @task(3)
    def demo_login(self) -> None:
        patient_id = random.choice(SYNTHETIC_PATIENT_IDS)
        self.client.post(
            "/api/v1/auth/demo-login",
            json={"patient_id": patient_id},
            name="POST /auth/demo-login",
        )

    @task(1)
    def login_and_refresh(self) -> None:
        # Full auth cycle: login → me → refresh
        resp = self.client.post(
            "/api/v1/auth/demo-login",
            json={
                "email": random.choice(CLINICIAN_EMAILS),
                "patient_id": random.choice(SYNTHETIC_PATIENT_IDS),
            },
            name="POST /auth/demo-login (full-cycle)",
        )
        if resp.status_code != 200:
            return
        token = resp.json().get("access_token", "")
        headers = {"Authorization": f"Bearer {token}"}

        self.client.get("/api/v1/auth/me", headers=headers, name="GET /auth/me")
        self.client.post(
            "/api/v1/auth/refresh",
            json={},
            headers=headers,
            name="POST /auth/refresh",
        )

    @task(1)
    def forgot_password(self) -> None:
        self.client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "demo-patient@deepsynaps.test"},
            name="POST /auth/forgot-password",
        )


class ProtocolGenerationUser(AuthenticatedUser):
    """
    Simulates clinicians generating and reviewing neurostimulation protocols.
    This is the heaviest clinical write-path.
    """

    weight = 2
    username = "clinician.load@deepsynaps.test"

    @task(3)
    def list_protocols(self) -> None:
        self.client.get(
            "/api/v1/protocols?page=1&per_page=20",
            headers=self._headers,
            name="GET /protocols (list)",
        )

    @task(2)
    def get_protocol_detail(self) -> None:
        protocol_id = f"proto-{uuid.uuid4().hex[:8]}"
        self.client.get(
            f"/api/v1/protocols/{protocol_id}",
            headers=self._headers,
            name="GET /protocols/{id}",
        )

    @task(1)
    def create_protocol(self) -> None:
        payload = {
            "title": f"Load-test protocol {uuid.uuid4().hex[:6]}",
            "condition_id": random.choice(CONDITION_IDS),
            "modality": random.choice(MODALITIES),
            "frequency_hz": random.choice([1, 10, 40, 77]),
            "duration_minutes": random.randint(10, 40),
            "intensity_ma": round(random.uniform(0.5, 2.0), 1),
            "electrode_montage": random.choice(
                ["F3-Anode / F4-Cathode", "C3-Anode / C4-Cathode", "Fz-Cz"]
            ),
            "target_regions": ["dlpfc_left", "dlpfc_right"],
            "evidence_level": random.choice(["A", "B", "C"]),
            "patient_id": random.choice(SYNTHETIC_PATIENT_IDS),
            "sessions_total": 20,
        }
        self.client.post(
            "/api/v1/protocols",
            json=payload,
            headers=self._headers,
            name="POST /protocols (create)",
        )

    @task(1)
    def update_protocol(self) -> None:
        protocol_id = f"proto-{uuid.uuid4().hex[:8]}"
        self.client.patch(
            f"/api/v1/protocols/{protocol_id}",
            json={
                "status": random.choice(["draft", "active", "completed"]),
                "sessions_completed": random.randint(0, 20),
            },
            headers=self._headers,
            name="PATCH /protocols/{id}",
        )

    @task(2)
    def evidence_summary(self) -> None:
        condition_id = random.choice(CONDITION_IDS)
        self.client.get(
            f"/api/v1/evidence?condition_id={condition_id}&page=1&per_page=10",
            headers=self._headers,
            name="GET /evidence (by condition)",
        )


class PatientDataAccessUser(AuthenticatedUser):
    """
    Simulates patient-portal traffic: dashboard loads, session lists,
    wearable data, and message polling.
    """

    weight = 5
    username = "patient.load@deepsynaps.test"

    @task(4)
    def patient_dashboard(self) -> None:
        patient_id = random.choice(SYNTHETIC_PATIENT_IDS)
        self.client.get(
            f"/api/v1/deeptwin/patients/{patient_id}/dashboard",
            headers=self._headers,
            name="GET /patients/{id}/dashboard",
        )

    @task(3)
    def patient_summary(self) -> None:
        patient_id = random.choice(SYNTHETIC_PATIENT_IDS)
        self.client.get(
            f"/api/v1/patients/{patient_id}/summary",
            headers=self._headers,
            name="GET /patients/{id}/summary",
        )

    @task(2)
    def portal_sessions(self) -> None:
        self.client.get(
            "/api/v1/patient-portal/sessions",
            headers=self._headers,
            name="GET /patient-portal/sessions",
        )

    @task(2)
    def portal_outcomes(self) -> None:
        self.client.get(
            "/api/v1/patient-portal/outcomes",
            headers=self._headers,
            name="GET /patient-portal/outcomes",
        )

    @task(1)
    def portal_messages(self) -> None:
        self.client.get(
            "/api/v1/patient-portal/messages",
            headers=self._headers,
            name="GET /patient-portal/messages",
        )

    @task(1)
    def qeeg_summary(self) -> None:
        patient_id = random.choice(SYNTHETIC_PATIENT_IDS)
        self.client.get(
            f"/api/v1/qeeg/patients/{patient_id}/summary",
            headers=self._headers,
            name="GET /qeeg/patients/{id}/summary",
        )


class EvidenceQueryUser(AuthenticatedUser):
    """
    Simulates clinicians searching the evidence database for condition
    summaries, effect-size metrics, and protocol recommendations.
    """

    weight = 3
    username = "researcher.load@deepsynaps.test"

    @task(4)
    def search_evidence(self) -> None:
        condition_id = random.choice(CONDITION_IDS)
        self.client.get(
            f"/api/v1/evidence?condition_id={condition_id}&include_studies=true",
            headers=self._headers,
            name="GET /evidence (condition + studies)",
        )

    @task(2)
    def evidence_conditions_list(self) -> None:
        self.client.get(
            "/api/v1/evidence/conditions",
            headers=self._headers,
            name="GET /evidence/conditions",
        )

    @task(2)
    def evidence_metrics(self) -> None:
        condition_id = random.choice(CONDITION_IDS)
        modality = random.choice(MODALITIES)
        self.client.get(
            f"/api/v1/evidence/metrics?condition_id={condition_id}&modality={modality}",
            headers=self._headers,
            name="GET /evidence/metrics",
        )

    @task(1)
    def full_text_search(self) -> None:
        query = random.choice(
            ["depression tACS", "ADHD neurofeedback", "sleep tDCS montage"]
        )
        self.client.get(
            f"/api/v1/evidence/search?q={query}&limit=20",
            headers=self._headers,
            name="GET /evidence/search",
        )


class MixedWorkloadUser(AuthenticatedUser):
    """
    Real-world mixed workload: a clinician who logs in, browses patients,
    checks protocols, reviews evidence, and occasionally creates a protocol.
    This is the most realistic scenario for baselining.
    """

    weight = 10
    username = "mixed.load@deepsynaps.test"

    @task(5)
    def browse_dashboard(self) -> None:
        patient_id = random.choice(SYNTHETIC_PATIENT_IDS)
        self.client.get(
            f"/api/v1/deeptwin/patients/{patient_id}/dashboard",
            headers=self._headers,
            name="MIX GET /patients/{id}/dashboard",
        )

    @task(4)
    def browse_protocols(self) -> None:
        self.client.get(
            "/api/v1/protocols?page=1&per_page=20",
            headers=self._headers,
            name="MIX GET /protocols (list)",
        )

    @task(3)
    def check_evidence(self) -> None:
        condition_id = random.choice(CONDITION_IDS)
        self.client.get(
            f"/api/v1/evidence?condition_id={condition_id}",
            headers=self._headers,
            name="MIX GET /evidence",
        )

    @task(2)
    def review_patient_summary(self) -> None:
        patient_id = random.choice(SYNTHETIC_PATIENT_IDS)
        self.client.get(
            f"/api/v1/patients/{patient_id}/summary",
            headers=self._headers,
            name="MIX GET /patients/{id}/summary",
        )

    @task(1)
    def create_protocol_light(self) -> None:
        payload = {
            "title": f"Mixed-load protocol {uuid.uuid4().hex[:6]}",
            "condition_id": random.choice(CONDITION_IDS),
            "modality": random.choice(MODALITIES),
            "frequency_hz": 10,
            "duration_minutes": 20,
            "intensity_ma": 1.0,
            "electrode_montage": "F3-Anode / F4-Cathode",
            "patient_id": random.choice(SYNTHETIC_PATIENT_IDS),
            "target_regions": ["dlpfc_left", "dlpfc_right"],
            "evidence_level": "A",
            "sessions_total": 20,
        }
        self.client.post(
            "/api/v1/protocols",
            json=payload,
            headers=self._headers,
            name="MIX POST /protocols",
        )

    @task(1)
    def poll_health(self) -> None:
        self.client.get("/health", name="MIX GET /health")

    @task(2)
    def portal_check(self) -> None:
        self.client.get(
            "/api/v1/patient-portal/sessions",
            headers=self._headers,
            name="MIX GET /patient-portal/sessions",
        )

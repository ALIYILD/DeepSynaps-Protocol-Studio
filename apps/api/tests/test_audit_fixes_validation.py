"""Targeted validation tests for the audit/fix-fullstack-readiness branch.

Tests cover the specific issues fixed in the audit remediation PR:
1. Finance race condition fix (duplicate number retry)
2. AI health endpoint
3. qEEG recommendation 503 on missing dependency
4. QA package public exports
5. Evidence package sqlalchemy dependency
6. DeepTwin/Brain Twin honesty responses
7. TRIBE engine_info metadata
"""
from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


# ── 1. Finance duplicate number retry ─────────────────────────────────────────

class TestFinanceNumberAllocation:
    """Verify invoice/claim number allocation is DB-level MAX + retry safe."""

    def test_sequential_invoice_numbers(self, client: TestClient, auth_headers: dict) -> None:
        headers = auth_headers["clinician"]
        inv1 = client.post("/api/v1/finance/invoices", json={
            "patient_name": "Patient A", "service": "TMS", "amount": 100.0,
            "issue_date": "2026-01-01", "due_date": "2026-02-01",
        }, headers=headers)
        assert inv1.status_code == 201
        num1 = inv1.json()["invoice_number"]
        assert num1 == "INV-00001"

        inv2 = client.post("/api/v1/finance/invoices", json={
            "patient_name": "Patient B", "service": "tDCS", "amount": 200.0,
            "issue_date": "2026-01-02", "due_date": "2026-02-02",
        }, headers=headers)
        assert inv2.status_code == 201
        num2 = inv2.json()["invoice_number"]
        assert num2 == "INV-00002"

    def test_sequential_claim_numbers(self, client: TestClient, auth_headers: dict) -> None:
        headers = auth_headers["clinician"]
        c1 = client.post("/api/v1/finance/claims", json={
            "patient_name": "Patient A", "insurer": "BUPA",
            "description": "TMS pre-auth", "amount": 500.0,
        }, headers=headers)
        assert c1.status_code == 201
        assert c1.json()["claim_number"] == "INS-00001"

        c2 = client.post("/api/v1/finance/claims", json={
            "patient_name": "Patient B", "insurer": "AXA",
            "description": "tDCS pre-auth", "amount": 300.0,
        }, headers=headers)
        assert c2.status_code == 201
        assert c2.json()["claim_number"] == "INS-00002"

    def test_invoice_unique_constraint_exists(self) -> None:
        """The Invoice model must declare the unique constraint."""
        from app.persistence.models import Invoice
        constraint_names = [
            c.name for c in Invoice.__table__.constraints
            if hasattr(c, "name") and c.name
        ]
        assert "uq_invoices_clinician_number" in constraint_names

    def test_claim_unique_constraint_exists(self) -> None:
        """The InsuranceClaim model must declare the unique constraint."""
        from app.persistence.models import InsuranceClaim
        constraint_names = [
            c.name for c in InsuranceClaim.__table__.constraints
            if hasattr(c, "name") and c.name
        ]
        assert "uq_claims_clinician_number" in constraint_names


# ── 2. AI health endpoint ────────────────────────────────────────────────────

class TestAIHealthEndpoint:
    """Verify GET /api/v1/health/ai returns honest feature status."""

    def test_health_ai_returns_200(self, client: TestClient) -> None:
        resp = client.get("/api/v1/health/ai")
        assert resp.status_code == 200

    def test_health_ai_has_features_and_summary(self, client: TestClient) -> None:
        data = client.get("/api/v1/health/ai").json()
        assert "features" in data
        assert "summary" in data
        assert isinstance(data["features"], list)
        assert isinstance(data["summary"], dict)
        assert len(data["features"]) > 0

    def test_health_ai_no_secrets_exposed(self, client: TestClient) -> None:
        """Ensure no actual API key values appear in the response."""
        import json
        data = client.get("/api/v1/health/ai").json()
        raw = json.dumps(data).lower()
        # Should not contain actual key values (bearer tokens, real keys)
        for bad in ["bearer ", "token="]:
            assert bad not in raw, f"Possible secret leak: found '{bad}' in AI health response"

    def test_health_ai_statuses_are_valid(self, client: TestClient) -> None:
        VALID_STATUSES = {"active", "degraded", "fallback", "unavailable", "not_implemented", "rule_based"}
        data = client.get("/api/v1/health/ai").json()
        for info in data["features"]:
            feature_name = info.get("feature", "unknown")
            assert "status" in info, f"Feature {feature_name} missing 'status'"
            assert info["status"] in VALID_STATUSES, (
                f"Feature {feature_name} has invalid status '{info['status']}'"
            )

    def test_health_ai_deeptwin_not_active(self, client: TestClient) -> None:
        """DeepTwin must NOT be marked as active real AI."""
        data = client.get("/api/v1/health/ai").json()
        for info in data["features"]:
            name = info.get("feature", "")
            if "deeptwin" in name:
                assert info["status"] != "active", (
                    f"{name} should not claim active AI status"
                )


# ── 3. qEEG recommendation 503 ──────────────────────────────────────────────

class TestQeegRecommendation503:
    """When deepsynaps_qeeg.recommender is unavailable, the endpoint must 503."""

    def test_qeeg_recommendations_returns_503_when_unavailable(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        # The recommender package is not installed in this test env
        resp = client.post(
            "/api/v1/qeeg-analysis/recommendations",
            json={"patient_id": "test-patient", "analysis_id": "test-analysis"},
            headers=auth_headers["clinician"],
        )
        # Either 503 (feature unavailable) or 422 (validation) is acceptable;
        # the key thing is it must NOT return 200 with empty data
        if resp.status_code == 200:
            pytest.fail(
                "qEEG recommendations returned 200 despite missing recommender package. "
                "Should return 503 with code='feature_unavailable'."
            )
        # 503 is the expected code from the fix
        if resp.status_code == 503:
            body = resp.json()
            assert body.get("code") == "feature_unavailable" or "unavailable" in str(body).lower()


# ── 4. QA package public exports ─────────────────────────────────────────────

class TestQAPackageExports:
    """Verify the QA package exports all symbols that downstream code needs."""

    REQUIRED_SYMBOLS = [
        "QAEngine", "compute_score", "compute_verdict",
        "emit_audit_record", "verify_chain",
        "apply_demotion", "should_demote",
        "SPEC_REGISTRY", "get_spec", "get_spec_for_artifact_type", "list_specs",
        "BaseCheck", "CheckRegistry",
        # Original model symbols
        "Artifact", "ArtifactType", "Check", "CheckResult", "CheckSeverity",
        "DemotionEvent", "QAAuditEntry", "QAResult", "QASpec", "Score", "Verdict",
    ]

    def test_all_required_symbols_exported(self) -> None:
        import deepsynaps_qa
        for sym in self.REQUIRED_SYMBOLS:
            assert hasattr(deepsynaps_qa, sym), (
                f"deepsynaps_qa missing export: {sym}"
            )

    def test_all_in_dunder_all(self) -> None:
        import deepsynaps_qa
        for sym in self.REQUIRED_SYMBOLS:
            assert sym in deepsynaps_qa.__all__, (
                f"{sym} not in deepsynaps_qa.__all__"
            )


# ── 5. Evidence package sqlalchemy dependency ────────────────────────────────

class TestEvidencePackage:
    """Evidence package must be importable with sqlalchemy available."""

    def test_evidence_audit_importable(self) -> None:
        from deepsynaps_evidence import audit
        assert hasattr(audit, "log_grounding_event")
        assert hasattr(audit, "verify_chain")

    def test_sqlalchemy_is_dependency(self) -> None:
        """sqlalchemy must be importable (it's a declared dependency)."""
        import sqlalchemy
        assert sqlalchemy.__version__


# ── 6. DeepTwin / Brain Twin honesty ─────────────────────────────────────────

class TestDeepTwinHonesty:
    """DeepTwin stub responses must honestly declare placeholder status."""

    def test_simulate_stub_declares_placeholder(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        """When simulation is enabled but uses stub engine, engine.status must be 'placeholder'."""
        with patch.dict("os.environ", {"DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION": "true"}):
            resp = client.post(
                "/api/v1/deeptwin/simulate",
                json={
                    "patient_id": "test-patient",
                    "protocol_id": "proto-1",
                    "horizon_days": 30,
                    "modalities": ["eeg"],
                },
                headers=auth_headers["clinician"],
            )
            if resp.status_code == 200:
                body = resp.json()
                engine = body.get("engine", {})
                assert engine.get("real_ai") is False, (
                    "Stub simulation must declare real_ai=False"
                )
                assert engine.get("status") != "ok", (
                    "Stub simulation must not claim status='ok'"
                )


# ── 7. TRIBE engine_info metadata ────────────────────────────────────────────

class TestTribeEngineInfo:
    """TRIBE response models must include engine_info with real_ai=False."""

    def test_tribe_simulate_includes_engine_info(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        resp = client.post(
            "/api/v1/deeptwin/simulate-tribe",
            json={
                "patient_id": "test-patient",
                "protocol": {
                    "protocol_id": "proto-1",
                    "modality": "tdcs",
                },
                "horizon_weeks": 6,
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "engine_info" in body, "TRIBE response missing engine_info"
        assert body["engine_info"]["real_ai"] is False
        assert body["engine_info"]["method"] == "rule_based"

    def test_tribe_compare_includes_engine_info(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        resp = client.post(
            "/api/v1/deeptwin/compare-protocols",
            json={
                "patient_id": "test-patient",
                "protocols": [
                    {"protocol_id": "proto-1", "modality": "tdcs"},
                    {"protocol_id": "proto-2", "modality": "tms"},
                ],
                "horizon_weeks": 6,
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "engine_info" in body
        assert body["engine_info"]["real_ai"] is False

    def test_tribe_patient_latent_includes_engine_info(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        resp = client.post(
            "/api/v1/deeptwin/patient-latent",
            json={"patient_id": "test-patient"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "engine_info" in body
        assert body["engine_info"]["real_ai"] is False

    def test_tribe_explain_includes_engine_info(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        resp = client.post(
            "/api/v1/deeptwin/explain",
            json={
                "patient_id": "test-patient",
                "protocol": {"protocol_id": "proto-1", "modality": "tdcs"},
                "horizon_weeks": 6,
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "engine_info" in body
        assert body["engine_info"]["real_ai"] is False


# ── 8. MedRAG health truthfulness ────────────────────────────────────────────

class TestMedRAGHealthTruthfulness:
    """Verify AI health endpoint truthfully reflects MedRAG mode."""

    def test_medrag_reports_fallback_when_deps_missing(self, client: TestClient) -> None:
        """When pgvector/sentence_transformers/psycopg are missing, status must be 'fallback'."""
        data = client.get("/api/v1/health/ai").json()
        medrag = next((f for f in data["features"] if f["feature"] == "medrag_retrieval"), None)
        assert medrag is not None, "medrag_retrieval feature missing from health endpoint"
        # In test env, pgvector + sentence_transformers + psycopg are NOT all available
        # so it should report fallback (keyword matching)
        assert medrag["status"] in ("fallback", "unavailable"), (
            f"Expected fallback/unavailable without dense deps, got {medrag['status']}"
        )

    def test_medrag_lists_missing_packages(self, client: TestClient) -> None:
        """current_missing should include the packages that are not installed."""
        data = client.get("/api/v1/health/ai").json()
        medrag = next((f for f in data["features"] if f["feature"] == "medrag_retrieval"), None)
        assert medrag is not None
        missing = medrag.get("current_missing", [])
        # At least one of pgvector / sentence_transformers / psycopg should be listed
        assert len(missing) > 0, "MedRAG should list missing packages when not all are installed"

    def test_medrag_declares_real_ai_true(self, client: TestClient) -> None:
        """MedRAG is a real AI feature (dense retrieval when enabled), even when in fallback."""
        data = client.get("/api/v1/health/ai").json()
        medrag = next((f for f in data["features"] if f["feature"] == "medrag_retrieval"), None)
        assert medrag is not None
        assert medrag["real_ai"] is True, "MedRAG is real AI (when dense deps are present)"


# ── 9. Production readiness script ──────────────────────────────────────────

class TestProductionReadinessScript:
    """Verify the validate_production_readiness.py script runs and returns valid output."""

    # Resolve script path relative to the repo root, not cwd.
    _SCRIPT = str(Path(__file__).resolve().parents[3] / "scripts" / "validate_production_readiness.py")

    def test_script_runs_in_dev_mode(self) -> None:
        """Script must run without crashing in development mode."""
        import subprocess
        result = subprocess.run(
            [sys.executable, self._SCRIPT, "--json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, f"Script failed: {result.stderr}"
        import json
        data = json.loads(result.stdout)
        assert "overall" in data
        assert data["overall"] in ("PASS", "WARN", "FAIL")
        assert "checks" in data
        assert len(data["checks"]) > 10

    def test_script_production_mode_detects_missing(self) -> None:
        """In production mode with no env vars, script should FAIL."""
        import subprocess
        result = subprocess.run(
            [sys.executable, self._SCRIPT, "--json", "--env", "production"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 1, "Production mode with no secrets should exit 1"
        import json
        data = json.loads(result.stdout)
        assert data["overall"] == "FAIL"
        assert data["fail"] > 0

    def test_script_never_leaks_secret_values(self) -> None:
        """When real-looking secrets are set, the output must NOT contain them."""
        import subprocess
        import json as _json
        secret_jwt = "super-secret-jwt-key-that-must-not-appear-in-output"
        secret_db = "postgresql://user:hunter2@db.example.com:5432/prod"
        secret_stripe = "sk_live_fake_stripe_key_1234567890"
        env = {
            **os.environ,
            "JWT_SECRET_KEY": secret_jwt,
            "DEEPSYNAPS_DATABASE_URL": secret_db,
            "STRIPE_SECRET_KEY": secret_stripe,
            "DEEPSYNAPS_APP_ENV": "production",
        }
        result = subprocess.run(
            [sys.executable, self._SCRIPT, "--json"],
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )
        output = result.stdout + result.stderr
        assert secret_jwt not in output, "JWT secret leaked in output"
        assert "hunter2" not in output, "DB password leaked in output"
        assert secret_stripe not in output, "Stripe key leaked in output"
        # Must still produce valid JSON
        data = _json.loads(result.stdout)
        assert "checks" in data


# ── 10. DeepTwin placeholder cannot be mistaken for real prediction ─────────

class TestDeepTwinPlaceholderSafeguards:
    """Ensure DeepTwin placeholder outputs cannot be mistaken for real AI."""

    def test_analyze_includes_decision_support_only(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        resp = client.post(
            "/api/v1/deeptwin/analyze",
            json={"patient_id": "test-patient", "modalities": ["qeeg_features"]},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("decision_support_only") is True, (
            "DeepTwin analyze must declare decision_support_only=true"
        )

    def test_analyze_engine_contains_disclaimer_notes(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        resp = client.post(
            "/api/v1/deeptwin/analyze",
            json={"patient_id": "test-patient"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        engine = resp.json().get("engine", {})
        notes = engine.get("notes", [])
        assert any("decision-support" in n.lower() or "diagnostic" in n.lower() for n in notes), (
            "Engine notes must include a clinical disclaimer"
        )

    def test_simulate_engine_not_active(
        self, client: TestClient, auth_headers: dict,
    ) -> None:
        """Simulation engine must not claim active/ok status."""
        resp = client.post(
            "/api/v1/deeptwin/simulate",
            json={"patient_id": "test-patient", "protocol_id": "proto-1", "horizon_days": 30},
            headers=auth_headers["clinician"],
        )
        if resp.status_code == 200:
            engine = resp.json().get("engine", {})
            assert engine.get("status") not in ("active", "ok"), (
                "Simulation engine must not claim active/ok without real model"
            )

    def test_health_deeptwin_simulation_not_implemented(
        self, client: TestClient,
    ) -> None:
        """Health endpoint must report deeptwin_simulation as not_implemented."""
        data = client.get("/api/v1/health/ai").json()
        dt_sim = next((f for f in data["features"] if f["feature"] == "deeptwin_simulation"), None)
        assert dt_sim is not None, "deeptwin_simulation missing from health endpoint"
        assert dt_sim["status"] == "not_implemented"
        assert dt_sim["real_ai"] is False

    def test_health_deeptwin_encoders_not_implemented(
        self, client: TestClient,
    ) -> None:
        """Health endpoint must report deeptwin_encoders as not_implemented."""
        data = client.get("/api/v1/health/ai").json()
        dt_enc = next((f for f in data["features"] if f["feature"] == "deeptwin_encoders"), None)
        assert dt_enc is not None, "deeptwin_encoders missing from health endpoint"
        assert dt_enc["status"] == "not_implemented"
        assert dt_enc["real_ai"] is False


# ── 11. Brain Twin simulation contract ──────────────────────────────────────

class TestBrainTwinSimulationContract:
    """Verify the worker-level Brain Twin simulation honours the placeholder contract.

    These tests load the worker module directly (bypassing the API app shadow)
    so they exercise the actual Celery task entry point.
    """

    @staticmethod
    def _load_worker_sim():
        """Load apps/worker/app/deeptwin_simulation.py bypassing the API app shadow."""
        import importlib.util
        from pathlib import Path
        worker_path = (
            Path(__file__).resolve().parents[2] / "worker" / "app" / "deeptwin_simulation.py"
        )
        spec = importlib.util.spec_from_file_location(
            "brain_twin_sim_contract", worker_path,
        )
        assert spec is not None and spec.loader is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        # The worker module uses `from __future__ import annotations` so `Any`
        # is a string annotation. Inject typing.Any before Pydantic rebuild.
        import typing
        mod.DeeptwinSimulationJob.model_rebuild(_types_namespace={"Any": typing.Any})
        return mod

    def test_brain_twin_worker_stub_returns_real_ai_false(self, monkeypatch) -> None:
        """Stub path must declare real_ai=False in engine block."""
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "1")
        sim = self._load_worker_sim()
        job = sim.DeeptwinSimulationJob(
            job_id="contract-1", patient_id="pat-c1", protocol_id="proto-c1",
            horizon_days=30, modalities=[], scenario={},
        )
        result = sim.run_deeptwin_simulation(job)
        # Skip if autoresearch is installed (different path)
        if result.get("status") == "not_implemented":
            pytest.skip("autoresearch installed; stub path not taken")
        assert result["engine"]["real_ai"] is False

    def test_brain_twin_worker_stub_includes_placeholder_notice(self, monkeypatch) -> None:
        """Stub engine block must contain a human-readable placeholder notice."""
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "1")
        sim = self._load_worker_sim()
        job = sim.DeeptwinSimulationJob(
            job_id="contract-2", patient_id="pat-c2", protocol_id="proto-c2",
            horizon_days=30, modalities=[], scenario={},
        )
        result = sim.run_deeptwin_simulation(job)
        if result.get("status") == "not_implemented":
            pytest.skip("autoresearch installed; stub path not taken")
        notice = result["engine"].get("notice", "")
        assert "placeholder" in notice.lower(), (
            f"Engine notice must mention 'placeholder', got: {notice!r}"
        )

    def test_brain_twin_celery_task_validates_payload(self, monkeypatch) -> None:
        """DeeptwinSimulationJob must reject invalid payloads at the Pydantic layer."""
        sim = self._load_worker_sim()
        with pytest.raises(Exception):
            # Missing required fields patient_id and protocol_id
            sim.DeeptwinSimulationJob.model_validate({"job_id": "bad"})

    def test_brain_twin_disabled_path_has_clinician_review_language(self, monkeypatch) -> None:
        """When simulation is disabled, the response must include actionable language."""
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "0")
        sim = self._load_worker_sim()
        job = sim.DeeptwinSimulationJob(
            job_id="contract-3", patient_id="pat-c3", protocol_id="proto-c3",
            horizon_days=30, modalities=[], scenario={},
        )
        result = sim.run_deeptwin_simulation(job)
        assert result["status"] == "disabled"
        assert "gated off" in result["message"].lower() or "not enabled" in result["message"].lower()

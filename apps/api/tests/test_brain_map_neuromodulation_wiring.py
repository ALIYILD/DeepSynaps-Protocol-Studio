from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from app.routers.brainmap_router import BrainMapPlanCreate, create_brain_map_plan


class MockActor:
    def __init__(self, actor_id: str = "test-clinician", role: str = "clinician"):
        self.actor_id = actor_id
        self.role = role


class MockResult:
    def __init__(self, rows):
        self.rows = rows if isinstance(rows, list) else [rows]

    def first(self):
        return self.rows[0] if self.rows else None


class MockDB:
    def __init__(self):
        self.data = {}
        self.audit = []

    def execute(self, stmt, params=None):
        params = params or {}
        if "INSERT INTO brain_map_plans" in stmt:
            self.data[params["id"]] = params
            return MockResult([])
        if "SELECT * FROM brain_map_plans WHERE id = :id" in stmt:
            plan_id = params["id"]
            return MockResult([self.data[plan_id]]) if plan_id in self.data else MockResult([])
        if "INSERT INTO audit_trail" in stmt:
            self.audit.append(params)
            return MockResult([])
        return MockResult([])

    def commit(self):
        return None


def test_brain_map_plan_preserves_neuromodulation_provenance() -> None:
    actor = MockActor()
    db = MockDB()

    payload = BrainMapPlanCreate(
        patient_id="patient-456",
        region="DLPFC-L",
        target_anchor="F3",
        protocol_id="proto-neuro-1",
        protocol_name="Neuromodulation Review Draft",
        intensity_ma=2.0,
        frequency_hz=10.0,
        session_duration_min=20,
        num_sessions=10,
        demo_stamp=False,
        full_artifact={
            "neuromodulation_context": {
                "source_statuses": {"simnibs": "unavailable", "ieeg": "disabled"},
                "target_anchor": "F3",
                "decision_support_disclaimer": "Decision support only.",
            }
        },
        notes="Test plan",
    )

    with patch("app.routers.brainmap_router._audit_plan_event"):
        with patch("app.routers.brainmap_router._generate_plan_id", return_value="plan-123"):
            result = create_brain_map_plan(payload, actor, db)

    assert result.id == "plan-123"
    assert result.full_artifact["neuromodulation_context"]["source_statuses"]["simnibs"] == "unavailable"
    assert result.created_at is not None

"""tests/test_brainmap_router.py — Unit + integration tests for brain map planner endpoints."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


# Mock auth and DB session objects
class MockActor:
    def __init__(self, actor_id: str = "test-clinician", role: str = "clinician"):
        self.actor_id = actor_id
        self.role = role


class MockDB:
    """Mock SQLAlchemy session."""
    
    def __init__(self):
        self.data = {}  # plan_id -> row dict
        self.audit = []  # audit events
    
    def execute(self, stmt, params=None):
        """Mock execute."""
        params = params or {}
        
        # INSERT INTO brain_map_plans
        if "INSERT INTO brain_map_plans" in stmt:
            plan_id = params.get("id")
            self.data[plan_id] = params
            return MockResult([])
        
        # SELECT * FROM brain_map_plans WHERE id = :id
        elif "SELECT * FROM brain_map_plans WHERE id = :id" in stmt:
            plan_id = params.get("id")
            if plan_id in self.data:
                return MockResult([self.data[plan_id]])
            return MockResult([])
        
        # SELECT COUNT(*) FROM brain_map_plans
        elif "COUNT(*)" in stmt:
            return MockResult([(len(self.data),)])
        
        # SELECT * FROM brain_map_plans (list)
        elif "SELECT * FROM brain_map_plans" in stmt:
            rows = list(self.data.values())
            return MockResult(rows)
        
        # UPDATE brain_map_plans
        elif "UPDATE brain_map_plans" in stmt:
            plan_id = params.get("id")
            if plan_id in self.data:
                self.data[plan_id].update(params)
            return MockResult([])
        
        # SELECT * FROM brain_map_plan_audit
        elif "SELECT * FROM brain_map_plan_audit" in stmt:
            plan_id = params.get("plan_id")
            events = [e for e in self.audit if e.get("plan_id") == plan_id]
            return MockResult(events)
        
        # INSERT INTO audit_trail (from _audit_plan_event)
        elif "INSERT INTO audit_trail" in stmt:
            self.audit.append(params)
            return MockResult([])
        
        return MockResult([])
    
    def commit(self):
        pass


class MockResult:
    def __init__(self, rows):
        self.rows = rows if isinstance(rows, list) else [rows]
    
    def first(self):
        return self.rows[0] if self.rows else None
    
    def fetchall(self):
        return self.rows


# ─── Test cases ────────────────────────────────────────────────────────

def test_create_brain_map_plan_success():
    """Test successful plan creation."""
    # Setup
    from app.routers.brainmap_router import create_brain_map_plan, BrainMapPlanCreate
    
    actor = MockActor(actor_id="clinician-123", role="clinician")
    db = MockDB()
    
    payload = BrainMapPlanCreate(
        patient_id="patient-456",
        region="DLPFC-L",
        target_anchor="F3",
        protocol_id="proto-789",
        protocol_name="Test Protocol",
        intensity_ma=2.0,
        frequency_hz=10.0,
        session_duration_min=20,
        num_sessions=10,
        demo_stamp=False,
        full_artifact={"test": "data"},
        notes="Test plan",
    )
    
    # Mock _audit_plan_event and _generate_plan_id
    with patch("app.routers.brainmap_router._audit_plan_event") as mock_audit:
        with patch("app.routers.brainmap_router._generate_plan_id", return_value="plan-123"):
            result = create_brain_map_plan(payload, actor, db)
    
    # Verify
    assert result.id == "plan-123"
    assert result.patient_id == "patient-456"
    assert result.region == "DLPFC-L"
    assert result.status == "draft"
    assert result.demo_stamp is False
    assert mock_audit.called


def test_create_brain_map_plan_demo_blocked():
    """Test that demo plans are blocked for non-admin."""
    from app.routers.brainmap_router import create_brain_map_plan, BrainMapPlanCreate
    from fastapi import HTTPException
    
    actor = MockActor(actor_id="clinician-123", role="clinician")
    db = MockDB()
    
    payload = BrainMapPlanCreate(
        patient_id="patient-456",
        demo_stamp=True,  # ← DEMO FLAG
        full_artifact={"test": "data"},
    )
    
    # Expect 403
    with pytest.raises(HTTPException) as exc_info:
        create_brain_map_plan(payload, actor, db)
    
    assert exc_info.value.status_code == 403


def test_create_brain_map_plan_no_patient_id():
    """Test that patient_id is required for non-demo roles."""
    from app.routers.brainmap_router import create_brain_map_plan, BrainMapPlanCreate
    from fastapi import HTTPException
    
    actor = MockActor(actor_id="clinician-123", role="clinician")
    db = MockDB()
    
    payload = BrainMapPlanCreate(
        patient_id=None,  # ← NO PATIENT
        demo_stamp=False,
        full_artifact={"test": "data"},
    )
    
    # Expect 400
    with pytest.raises(HTTPException) as exc_info:
        create_brain_map_plan(payload, actor, db)
    
    assert exc_info.value.status_code == 400


def test_get_brain_map_plan_success():
    """Test successful plan retrieval."""
    from app.routers.brainmap_router import get_brain_map_plan
    
    actor = MockActor()
    db = MockDB()
    
    # Pre-populate plan
    db.data["plan-123"] = {
        "id": "plan-123",
        "patient_id": "patient-456",
        "created_by": "clinician-123",
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
        "status": "draft",
        "region": "DLPFC-L",
        "target_anchor": "F3",
        "protocol_id": "proto-789",
        "protocol_name": "Test Protocol",
        "intensity_ma": 2.0,
        "frequency_hz": 10.0,
        "session_duration_min": 20,
        "num_sessions": 10,
        "qeeg_analysis_id": None,
        "analyzer_fit": None,
        "demo_stamp": False,
        "full_artifact": {"test": "data"},
        "notes": "Test",
    }
    
    with patch("app.routers.brainmap_router._audit_plan_event"):
        result = get_brain_map_plan("plan-123", actor, db)
    
    assert result.id == "plan-123"
    assert result.region == "DLPFC-L"


def test_get_brain_map_plan_not_found():
    """Test 404 for missing plan."""
    from app.routers.brainmap_router import get_brain_map_plan
    from fastapi import HTTPException
    
    actor = MockActor()
    db = MockDB()
    
    with pytest.raises(HTTPException) as exc_info:
        get_brain_map_plan("nonexistent", actor, db)
    
    assert exc_info.value.status_code == 404


def test_update_brain_map_plan_status_success():
    """Test successful status update by creator."""
    from app.routers.brainmap_router import update_brain_map_plan_status, BrainMapPlanStatusUpdate
    
    actor = MockActor(actor_id="clinician-123", role="clinician")
    db = MockDB()
    
    # Pre-populate plan created by same actor
    db.data["plan-123"] = {
        "id": "plan-123",
        "patient_id": "patient-456",
        "created_by": "clinician-123",  # ← SAME ACTOR
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
        "status": "draft",
        "region": "DLPFC-L",
        "target_anchor": "F3",
        "protocol_id": None,
        "protocol_name": None,
        "intensity_ma": None,
        "frequency_hz": None,
        "session_duration_min": None,
        "num_sessions": None,
        "qeeg_analysis_id": None,
        "analyzer_fit": None,
        "demo_stamp": False,
        "full_artifact": {},
        "notes": None,
    }
    
    payload = BrainMapPlanStatusUpdate(status="approved", notes="Ready for review")
    
    with patch("app.routers.brainmap_router._audit_plan_event"):
        result = update_brain_map_plan_status("plan-123", payload, actor, db)
    
    assert result.status == "approved"


def test_update_brain_map_plan_status_forbidden():
    """Test IDOR: cannot update other's plan."""
    from app.routers.brainmap_router import update_brain_map_plan_status, BrainMapPlanStatusUpdate
    from fastapi import HTTPException
    
    actor = MockActor(actor_id="clinician-123", role="clinician")
    db = MockDB()
    
    # Pre-populate plan created by different actor
    db.data["plan-123"] = {
        "id": "plan-123",
        "created_by": "OTHER-CLINICIAN",  # ← DIFFERENT CREATOR
        "status": "draft",
    }
    
    payload = BrainMapPlanStatusUpdate(status="approved")
    
    with pytest.raises(HTTPException) as exc_info:
        update_brain_map_plan_status("plan-123", payload, actor, db)
    
    assert exc_info.value.status_code == 403


def test_list_brain_map_plans_empty():
    """Test list with no plans."""
    from app.routers.brainmap_router import list_brain_map_plans
    
    actor = MockActor()
    db = MockDB()
    
    with patch("app.routers.brainmap_router._audit_plan_event"):
        result = list_brain_map_plans(None, None, 0, 50, actor, db)
    
    assert result.total == 0
    assert len(result.plans) == 0


def test_list_brain_map_plans_filtered():
    """Test list with patient_id filter."""
    from app.routers.brainmap_router import list_brain_map_plans
    
    actor = MockActor()
    db = MockDB()
    
    # Pre-populate plans
    for i in range(3):
        db.data[f"plan-{i}"] = {
            "id": f"plan-{i}",
            "patient_id": "patient-456",
            "created_by": "clinician-123",
            "created_at": datetime.now(timezone.utc),
            "status": "draft",
            "region": f"region-{i}",
            "target_anchor": "F3",
            "protocol_id": None,
            "protocol_name": None,
            "intensity_ma": None,
            "frequency_hz": None,
            "session_duration_min": None,
            "num_sessions": None,
            "qeeg_analysis_id": None,
            "analyzer_fit": None,
            "demo_stamp": False,
            "full_artifact": {},
            "notes": None,
            "updated_at": None,
        }
    
    with patch("app.routers.brainmap_router._audit_plan_event"):
        result = list_brain_map_plans("patient-456", None, 0, 50, actor, db)
    
    assert result.total == 3


def test_health_check():
    """Test health endpoint."""
    from app.routers.brainmap_router import health_check
    
    result = health_check()
    assert result["status"] == "ok"
    assert result["service"] == "brain-map"


# ─── Parametrized tests ─────────────────────────────────────────────────

@pytest.mark.parametrize("role,should_succeed", [
    ("clinician", True),
    ("admin", True),
    ("demo", True),
    ("researcher", False),  # Assuming only clinician/admin/demo can create
])
def test_create_plan_by_role(role, should_succeed):
    """Test role-based access to create endpoint."""
    from app.routers.brainmap_router import create_brain_map_plan, BrainMapPlanCreate
    from fastapi import HTTPException
    
    actor = MockActor(actor_id="user-123", role=role)
    db = MockDB()
    
    payload = BrainMapPlanCreate(
        patient_id="patient-456",
        demo_stamp=False,
        full_artifact={"test": "data"},
    )
    
    if not should_succeed and role not in ("clinician", "admin", "demo"):
        # Expect to fail if role is researcher
        with pytest.raises((HTTPException, AttributeError)):
            with patch("app.routers.brainmap_router._audit_plan_event"):
                create_brain_map_plan(payload, actor, db)
    else:
        # Should succeed
        with patch("app.routers.brainmap_router._audit_plan_event"):
            with patch("app.routers.brainmap_router._generate_plan_id", return_value="plan-123"):
                result = create_brain_map_plan(payload, actor, db)
                assert result is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

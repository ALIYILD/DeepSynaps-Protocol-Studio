"""
Deny-by-default role-hierarchy tests for require_minimum_role.

Locks in the strict hierarchy:
    guest=0 < patient=1 < technician=2 < reviewer=3 < clinician=4 < admin=5.

Prior bug (caught by /autoplan launch-readiness review): ROLE_ORDER collapsed
guest=patient=0 and technician=reviewer=clinician=1, which silently let
technicians and reviewers pass every "clinician" gate (~287 routes including
DeepTwin patient endpoints) and let guests pass "patient" gates.
"""
from __future__ import annotations

import pytest

from app.auth import ROLE_ORDER, AuthenticatedActor, require_minimum_role
from app.errors import ApiServiceError

ROLES = ("guest", "patient", "technician", "reviewer", "clinician", "admin")


def _actor(role: str) -> AuthenticatedActor:
    return AuthenticatedActor(actor_id=f"test-{role}", display_name=role.title(), role=role)


def test_role_order_is_strictly_increasing():
    ranks = [ROLE_ORDER[r] for r in ROLES]
    assert ranks == sorted(ranks)
    assert len(set(ranks)) == len(ROLES), (
        f"Every role must have a unique rank, got {dict(zip(ROLES, ranks))}"
    )


@pytest.mark.parametrize("actor_role", ROLES)
@pytest.mark.parametrize("minimum_role", ROLES)
def test_require_minimum_role_matrix(actor_role: str, minimum_role: str):
    actor = _actor(actor_role)
    expect_pass = ROLE_ORDER[actor_role] >= ROLE_ORDER[minimum_role]

    if expect_pass:
        require_minimum_role(actor, minimum_role)
    else:
        with pytest.raises(ApiServiceError) as exc_info:
            require_minimum_role(actor, minimum_role)
        assert exc_info.value.code == "insufficient_role"
        assert exc_info.value.status_code == 403


def test_technician_does_not_pass_clinician_gate():
    with pytest.raises(ApiServiceError) as exc_info:
        require_minimum_role(_actor("technician"), "clinician")
    assert exc_info.value.code == "insufficient_role"


def test_reviewer_does_not_pass_clinician_gate():
    with pytest.raises(ApiServiceError) as exc_info:
        require_minimum_role(_actor("reviewer"), "clinician")
    assert exc_info.value.code == "insufficient_role"


def test_guest_does_not_pass_patient_gate():
    with pytest.raises(ApiServiceError) as exc_info:
        require_minimum_role(_actor("guest"), "patient")
    assert exc_info.value.code == "insufficient_role"


def test_admin_passes_all_gates():
    for minimum_role in ROLES:
        require_minimum_role(_actor("admin"), minimum_role)


def test_guest_only_passes_guest_gate():
    require_minimum_role(_actor("guest"), "guest")
    for minimum_role in ("patient", "technician", "reviewer", "clinician", "admin"):
        with pytest.raises(ApiServiceError):
            require_minimum_role(_actor("guest"), minimum_role)

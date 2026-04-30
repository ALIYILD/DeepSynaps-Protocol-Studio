"""Regression tests for the presence cross-clinic-leak fix.

Pre-fix the in-process ``_presence`` map was keyed by ``page_id``
alone. A clinician at clinic A reading
``GET /api/v1/notifications/presence/<patient-uuid-at-clinic-B>``
saw clinic-B clinicians' display_name + role plus an oracle
confirmation that the patient/course UUID exists at that other
clinic — HIPAA-relevant reconnaissance.

Post-fix the map is keyed by ``"<clinic_id>::<page_id>"`` so
different clinics see different presence pools even when the
underlying ``page_id`` is identical. The route reads/writes
``actor.clinic_id`` from the JWT, never accepts it from the
client.
"""
from __future__ import annotations

import asyncio

import pytest

from app.routers import notifications_router as nr


@pytest.fixture(autouse=True)
def _clear_presence():
    nr._presence.clear()
    yield
    nr._presence.clear()


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_presence_isolated_by_clinic() -> None:
    """Same page_id, two clinics — each clinic only sees its own
    members in ``get_presence``."""
    _run(nr.update_presence("u-a1", "Alice", "clinician", "/patient/p1", clinic_id="clinic-a"))
    _run(nr.update_presence("u-a2", "Adam",  "clinician", "/patient/p1", clinic_id="clinic-a"))
    _run(nr.update_presence("u-b1", "Bob",   "clinician", "/patient/p1", clinic_id="clinic-b"))

    a_view = nr.get_presence("/patient/p1", clinic_id="clinic-a")
    b_view = nr.get_presence("/patient/p1", clinic_id="clinic-b")

    a_ids = {row["id"] for row in a_view}
    b_ids = {row["id"] for row in b_view}

    assert a_ids == {"u-a1", "u-a2"}
    assert b_ids == {"u-b1"}
    # And critically — neither clinic's view ever names the other side.
    assert "u-b1" not in a_ids
    assert "u-a1" not in b_ids
    assert "u-a2" not in b_ids


def test_presence_no_clinic_does_not_pool_with_real_clinic() -> None:
    """A misconfigured / clinic-less actor must not be visible to
    clinic-scoped readers, and vice-versa."""
    _run(nr.update_presence("u-orph", "Orph", "clinician", "/patient/p1", clinic_id=None))
    _run(nr.update_presence("u-real", "Real", "clinician", "/patient/p1", clinic_id="clinic-a"))

    real_view = nr.get_presence("/patient/p1", clinic_id="clinic-a")
    orph_view = nr.get_presence("/patient/p1", clinic_id=None)

    assert {row["id"] for row in real_view} == {"u-real"}
    assert {row["id"] for row in orph_view} == {"u-orph"}


def test_presence_default_kwargs_back_compat() -> None:
    """``get_presence(page_id)`` (no clinic_id) keeps working — it
    queries the no-clinic bucket so callers that forget to pass
    clinic_id don't accidentally fall into a clinic's pool."""
    _run(nr.update_presence("u-a", "Anna", "clinician", "/page", clinic_id="clinic-a"))
    legacy_view = nr.get_presence("/page")  # no clinic_id passed
    assert legacy_view == []  # cannot see clinic-a's pool from the no-clinic bucket

"""Tests for the Phase 14 finance CSV export of ``agent_run_audit``.

Covers:

* Auth gate — anonymous + guest are rejected; clinician is admitted.
* Content-type and ``Content-Disposition`` filename use today's UTC date.
* Header column tuple matches the spec exactly (and in the documented order).
* Rows are returned newest-first.
* Cross-clinic isolation — clinician of clinic A cannot see clinic B rows.
* ``since_days`` clamp returns 422 outside ``[1, 365]``.
* Unknown ``agent_id`` returns 404.
* Embedded commas / double-quotes / newlines round-trip via ``csv.reader``.
* The 10,000-row safety cap truncates and adds a ``# truncated …`` footer.
"""
from __future__ import annotations

import csv as _csv
import io as _io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AgentRunAudit
from app.routers.agents_router import CSV_COLUMNS, CSV_MAX_ROWS


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _seed_audit_row(
    *,
    db,
    agent_id: str = "clinic.reception",
    actor_id: str | None = "actor-clinician-demo",
    clinic_id: str | None = "clinic-demo-default",
    ok: bool = True,
    latency_ms: int = 25,
    message: str = "hello",
    reply: str = "world",
    error_code: str | None = None,
    tokens_in_used: int | None = 10,
    tokens_out_used: int | None = 5,
    cost_pence: int | None = 1,
    created_at: datetime | None = None,
) -> AgentRunAudit:
    row = AgentRunAudit(
        actor_id=actor_id,
        clinic_id=clinic_id,
        agent_id=agent_id,
        message_preview=message,
        reply_preview=reply,
        latency_ms=latency_ms,
        ok=ok,
        error_code=error_code,
        tokens_in_used=tokens_in_used,
        tokens_out_used=tokens_out_used,
        cost_pence=cost_pence,
    )
    if created_at is not None:
        # SQLAlchemy default fires only when the column is unset; assigning
        # explicitly lets us deterministically order rows in tests.
        row.created_at = created_at
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _parse_csv(body: str) -> tuple[list[str], list[list[str]], list[str]]:
    """Split CSV body into (header, data rows, footer comment lines).

    Footer comments are ``#``-prefixed lines that the endpoint appends when
    the result was truncated; ``csv.reader`` treats them as single-cell
    rows so we strip them out for the data-row assertions.
    """
    reader = _csv.reader(_io.StringIO(body))
    rows = list(reader)
    if not rows:
        return [], [], []
    header = rows[0]
    data: list[list[str]] = []
    footer: list[str] = []
    for r in rows[1:]:
        if r and r[0].startswith("#"):
            footer.append(",".join(r))
            continue
        data.append(r)
    return header, data, footer


# ---------------------------------------------------------------------------
# Auth gate
# ---------------------------------------------------------------------------


def test_csv_rejects_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/agents/runs.csv")
    assert resp.status_code in (401, 403)


def test_csv_rejects_guest(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["guest"]
    )
    assert resp.status_code in (401, 403)


def test_csv_clinician_returns_text_csv(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    ct = resp.headers.get("content-type", "")
    assert ct.startswith("text/csv"), f"unexpected content-type: {ct!r}"


# ---------------------------------------------------------------------------
# Header row + Content-Disposition
# ---------------------------------------------------------------------------


def test_csv_header_row_matches_spec_exactly(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    header, _, _ = _parse_csv(resp.text)
    expected = [
        "created_at",
        "agent_id",
        "actor_id",
        "clinic_id",
        "ok",
        "error_code",
        "latency_ms",
        "tokens_in",
        "tokens_out",
        "cost_pence",
        "message_preview",
        "reply_preview",
    ]
    assert header == expected
    # Sanity: the constant the endpoint uses internally also matches.
    assert list(CSV_COLUMNS) == expected


def test_csv_content_disposition_uses_today_utc_date(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    cd = resp.headers.get("content-disposition", "")
    assert cd == f'attachment; filename="agent-runs-{today}.csv"'


# ---------------------------------------------------------------------------
# Row content + ordering
# ---------------------------------------------------------------------------


def test_csv_returns_three_seeded_rows_desc(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    base = datetime(2026, 4, 1, 12, 0, 0)
    _seed_audit_row(db=db_session, message="first", created_at=base)
    _seed_audit_row(
        db=db_session, message="second", created_at=base + timedelta(seconds=1)
    )
    _seed_audit_row(
        db=db_session, message="third", created_at=base + timedelta(seconds=2)
    )

    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    _, data, footer = _parse_csv(resp.text)
    assert footer == []
    assert len(data) == 3
    msg_col = CSV_COLUMNS.index("message_preview")
    # DESC by created_at — newest (third) first.
    assert [row[msg_col] for row in data] == ["third", "second", "first"]


def test_csv_cross_clinic_isolation(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    # Two rows in our clinic, one in a foreign clinic — clinician must
    # only see their own.
    _seed_audit_row(db=db_session, message="ours-1")
    _seed_audit_row(db=db_session, message="ours-2")
    _seed_audit_row(
        db=db_session,
        message="foreign",
        actor_id=None,
        clinic_id="clinic-other",
    )

    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    _, data, _ = _parse_csv(resp.text)
    msg_col = CSV_COLUMNS.index("message_preview")
    messages = {row[msg_col] for row in data}
    assert messages == {"ours-1", "ours-2"}
    assert "foreign" not in messages


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------


def test_csv_since_days_above_max_returns_422(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv?since_days=400",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_csv_since_days_below_min_returns_422(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv?since_days=0",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_csv_unknown_agent_id_returns_404(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/agents/runs.csv?agent_id=clinic.does_not_exist",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# CSV escaping round-trip
# ---------------------------------------------------------------------------


def test_csv_escapes_comma_quote_and_newline(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    tricky = 'a, "b" and\nnewline'
    _seed_audit_row(db=db_session, message=tricky, reply="ok")

    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    _, data, _ = _parse_csv(resp.text)
    assert len(data) == 1
    msg_col = CSV_COLUMNS.index("message_preview")
    # Round-trip through csv.reader must yield the original string verbatim.
    assert data[0][msg_col] == tricky


# ---------------------------------------------------------------------------
# 10,000-row safety cap + truncation footer
# ---------------------------------------------------------------------------


def test_csv_truncates_above_safety_cap(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    db_session,
) -> None:
    # Bulk-insert 10001 rows directly so the test runs in a few seconds —
    # going through ``_seed_audit_row`` would commit per row.
    base = datetime(2026, 4, 1, 0, 0, 0)
    rows = [
        AgentRunAudit(
            actor_id="actor-clinician-demo",
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            message_preview=f"msg-{i}",
            reply_preview="r",
            latency_ms=1,
            ok=True,
            tokens_in_used=1,
            tokens_out_used=1,
            cost_pence=0,
            created_at=base + timedelta(seconds=i),
        )
        for i in range(CSV_MAX_ROWS + 1)
    ]
    db_session.bulk_save_objects(rows)
    db_session.commit()

    resp = client.get(
        "/api/v1/agents/runs.csv", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    _, data, footer = _parse_csv(resp.text)
    assert len(data) == CSV_MAX_ROWS
    # Footer must announce the truncation so finance scripts can detect it.
    assert footer, "expected a truncation footer comment line"
    assert any("truncated" in line.lower() for line in footer)

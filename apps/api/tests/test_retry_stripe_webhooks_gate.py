"""Startup gate test for ``scripts/retry_stripe_webhooks.py``.

Sister fix to PR #574 (qeeg_worker). The stripe_worker process group on Fly
runs ``while true; do python scripts/retry_stripe_webhooks.py; sleep 300;
done`` (see ``apps/api/fly.toml``). Because the volume is only mounted on
the ``app`` process group, a SQLite ``DEEPSYNAPS_DATABASE_URL`` makes every
retry tick query an empty database and crash with
``sqlite3.OperationalError: no such table: stripe_webhook_logs``.

The script must exit cleanly (code 0) with a clear warning when the URL is
SQLite, so the parent shell loop doesn't crash-loop every 5 minutes. When
the URL is network-reachable (postgres/mysql), the script must NOT short-
circuit at the gate.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "scripts" / "retry_stripe_webhooks.py"


def _spawn_with_env(db_url: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "DEEPSYNAPS_DATABASE_URL": db_url,
        # Defensive: make import-time cost predictable even if local env is messy.
        "DEEPSYNAPS_APP_ENV": "test",
    }
    return subprocess.run(
        [sys.executable, str(SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_sqlite_url_short_circuits_with_clean_exit() -> None:
    """SQLite URL → warning + exit 0 (so parent ``while true`` loop sleeps cleanly)."""
    result = _spawn_with_env("sqlite:////data/deepsynaps_protocol_studio.db")
    # Combined stdout+stderr is fine — the script logs via the root logger.
    combined = (result.stdout or "") + (result.stderr or "")
    assert result.returncode == 0, (
        f"SQLite URL must exit 0; got {result.returncode}\nout={result.stdout}\nerr={result.stderr}"
    )
    assert "SQLite path" in combined, "expected SQLite-path warning in output"
    assert "Skipping this retry tick" in combined
    assert "no such table" not in combined, (
        "should not hit any sqlite OperationalError — gate must short-circuit before DB import"
    )


def test_empty_url_short_circuits_too() -> None:
    """No DB URL set at all → still exit 0 with warning, not a crash."""
    result = _spawn_with_env("")
    assert result.returncode == 0
    combined = (result.stdout or "") + (result.stderr or "")
    assert "<unset>" in combined or "Skipping this retry tick" in combined


@pytest.mark.parametrize("network_url", [
    "postgresql+psycopg2://user:pw@db.internal:5432/deepsynaps",
    "postgres://user:pw@db.internal:5432/deepsynaps",
    "mysql+pymysql://user:pw@db.internal:3306/deepsynaps",
])
def test_network_db_does_not_short_circuit(network_url: str) -> None:
    """Postgres/MySQL must pass the gate and proceed to import the app modules.

    We only assert the gate doesn't trigger; the script will fail later
    because ``db.internal`` isn't reachable in the test environment, which
    proves the gate let us through.
    """
    result = _spawn_with_env(network_url)
    combined = (result.stdout or "") + (result.stderr or "")
    # Gate-warning text must NOT appear (otherwise we short-circuited).
    assert "Skipping this retry tick" not in combined, (
        f"network URL {network_url!r} unexpectedly hit the SQLite gate"
    )

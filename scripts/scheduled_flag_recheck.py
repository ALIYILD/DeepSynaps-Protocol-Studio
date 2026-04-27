#!/usr/bin/env python3
"""Scheduled wearable flag re-check — runs every 6h regardless of sync state.

Closes overnight audit gap §6.C:
- Successful sync triggers run_flag_checks (best-effort, swallowed).
- On adapter error, no flag re-check, no alert.
- This job ensures flags are re-evaluated on a schedule so patients don't
  go silently un-flagged for days.

Intended invocation (cron / systemd timer / Celery beat):
    uv run --python 3.11 scripts/scheduled_flag_recheck.py

The script is idempotent: duplicate flags within 48h are suppressed by
run_flag_checks itself.
"""
from __future__ import annotations

import json
import logging
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

# Must configure logging before any app imports that may trigger side-effects.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stderr,
)
_log = logging.getLogger("scheduled_flag_recheck")


def _main() -> int:
    from sqlalchemy.orm import Session

    from app.database import SessionLocal, engine
    from app.persistence.models import DeviceConnection
    from app.services.wearable_flags import run_flag_checks

    started_at = datetime.now(timezone.utc)
    _log.info("scheduled_flag_recheck started at %s", started_at.isoformat())

    db: Session = SessionLocal()
    try:
        # Active connections = anything not explicitly disconnected.
        # We group by patient_id because a patient may have multiple devices.
        rows = (
            db.query(DeviceConnection)
            .filter(DeviceConnection.status != "disconnected")
            .order_by(DeviceConnection.patient_id)
            .all()
        )

        patient_ids = []
        seen = set()
        for conn in rows:
            if conn.patient_id not in seen:
                seen.add(conn.patient_id)
                patient_ids.append(conn.patient_id)

        total_patients = len(patient_ids)
        checked = 0
        errors = 0
        flags_raised = 0

        _log.info("Found %d active device connection(s) covering %d patient(s)", len(rows), total_patients)

        for patient_id in patient_ids:
            try:
                new_flags = run_flag_checks(patient_id, None, db)
                checked += 1
                if new_flags:
                    flags_raised += len(new_flags)
                    _log.info(
                        "patient=%s flags_raised=%d types=%s",
                        patient_id,
                        len(new_flags),
                        ",".join(f.flag_type for f in new_flags),
                    )
            except Exception:
                errors += 1
                _log.error(
                    "Flag check failed for patient %s — continuing with next patient.\n%s",
                    patient_id,
                    traceback.format_exc(),
                )
                # Ensure the session is still usable after a rollback inside
                # run_flag_checks or downstream code.
                try:
                    db.rollback()
                except Exception:
                    pass

        finished_at = datetime.now(timezone.utc)
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        summary = {
            "event": "scheduled_flag_recheck",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_ms": duration_ms,
            "total_patients": total_patients,
            "checked": checked,
            "errors": errors,
            "flags_raised": flags_raised,
            "ok": errors == 0,
        }

        # One-line JSON summary to stdout for health/readiness probes.
        print(json.dumps(summary, separators=(",", ":")))
        _log.info("scheduled_flag_recheck finished: %s", summary)
        return 0 if errors == 0 else 1

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(_main())

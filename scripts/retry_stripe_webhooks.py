#!/usr/bin/env python3
"""Stripe webhook retry worker.

Queries the StripeWebhookLog outbox for events in ('pending','failed') that
are due for retry, re-runs the business logic, and updates status accordingly.
After max attempts (10) the event is marked 'dead' and an alert is logged.

Intended usage:
    python scripts/retry_stripe_webhooks.py

Can also be run as a cron job every N minutes.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── path setup ───────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

# ── logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("retry_stripe_webhooks")

# ── env defaults for standalone execution ────────────────────────────────────
os.environ.setdefault("DEEPSYNAPS_APP_ENV", "production")

from app.database import SessionLocal  # noqa: E402
from app.persistence.models import StripeWebhookLog  # noqa: E402
from app.routers.payments_router import _process_webhook_event, _compute_next_retry_at  # noqa: E402

MAX_ATTEMPTS = 10


def _run() -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        logs = (
            db.query(StripeWebhookLog)
            .filter(
                StripeWebhookLog.status.in_(["pending", "failed"]),
                StripeWebhookLog.attempt_count < MAX_ATTEMPTS,
                StripeWebhookLog.next_retry_at <= now,
            )
            .order_by(StripeWebhookLog.created_at)
            .all()
        )

        if not logs:
            logger.info("No webhook events due for retry.")
            return 0

        processed = 0
        succeeded = 0
        failed = 0
        dead = 0

        for log in logs:
            processed += 1
            log.status = "processing"
            db.commit()

            try:
                event = json.loads(log.payload)
                _process_webhook_event(db, event)
            except Exception as exc:
                log.attempt_count += 1
                log.last_error = str(exc)
                log.updated_at = datetime.now(timezone.utc)

                if log.attempt_count >= MAX_ATTEMPTS:
                    log.status = "dead"
                    log.next_retry_at = None
                    dead += 1
                    logger.error(
                        "ALERT: Stripe webhook reached max attempts and is now dead. "
                        "event_id=%s stripe_event_id=%s error=%s",
                        log.id,
                        log.stripe_event_id,
                        exc,
                    )
                else:
                    log.status = "failed"
                    log.next_retry_at = _compute_next_retry_at(log.attempt_count)
                    failed += 1
                    logger.warning(
                        "Retry failed for event_id=%s stripe_event_id=%s attempt=%d error=%s",
                        log.id,
                        log.stripe_event_id,
                        log.attempt_count,
                        exc,
                    )
                db.commit()
                continue

            log.status = "succeeded"
            log.next_retry_at = None
            log.last_error = None
            log.updated_at = datetime.now(timezone.utc)
            db.commit()
            succeeded += 1
            logger.info(
                "Retry succeeded for event_id=%s stripe_event_id=%s",
                log.id,
                log.stripe_event_id,
            )

        logger.info(
            "Retry batch complete: processed=%d succeeded=%d failed=%d dead=%d",
            processed,
            succeeded,
            failed,
            dead,
        )
        return 0
    except Exception as exc:
        logger.exception("Retry worker crashed: %s", exc)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(_run())

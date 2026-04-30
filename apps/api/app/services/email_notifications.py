"""Email notification channel for ops alerts (Phase 11D).

Phase 7 introduced Slack-based abuse alerting via
:mod:`app.services.ops_alerting`. Some operators want the same alerts in
their inbox — this module is the email companion. It is *strictly opt-in*
via env vars; absence of configuration is a silent no-op so unit tests,
ephemeral preview deploys and developer machines never accidentally email.

Provider strategy
=================

Two providers are supported, in priority order:

1. **SendGrid HTTP API** — chosen automatically when ``SENDGRID_API_KEY``
   is set. HTTP is more reliable than SMTP across NAT / cloud egress
   firewalls, so when both providers are configured SendGrid wins.
2. **Plain SMTP via stdlib :mod:`smtplib`** — fallback when only the
   SMTP env vars are set. Zero new dependencies.

Either provider requires a sender address (``DEEPSYNAPS_SMTP_FROM``) and
at least one recipient (``DEEPSYNAPS_ALERT_RECIPIENTS``, comma-separated).

Environment variables
=====================

* SMTP path — all required:

  - ``DEEPSYNAPS_SMTP_HOST``
  - ``DEEPSYNAPS_SMTP_PORT`` (default ``"587"``)
  - ``DEEPSYNAPS_SMTP_USERNAME``
  - ``DEEPSYNAPS_SMTP_PASSWORD``
  - ``DEEPSYNAPS_SMTP_FROM``
  - ``DEEPSYNAPS_ALERT_RECIPIENTS`` (comma-separated)

* SendGrid path — required:

  - ``SENDGRID_API_KEY``
  - ``DEEPSYNAPS_SMTP_FROM``
  - ``DEEPSYNAPS_ALERT_RECIPIENTS``

Return-value contract
=====================

:func:`send_email` *never* raises. It always returns a structured
envelope so the caller (typically :func:`ops_alerting.post_alert`) can
log a one-liner without re-parsing exceptions:

* ``{"sent": False, "reason": "disabled"}`` — no provider configured.
* ``{"sent": True, "channel": "smtp"|"sendgrid", "recipients": [...]}``
* ``{"sent": False, "reason": "error", "error": "<repr>"}``

Decision-support framing only — alert emails are operator
notifications, not autonomous action.
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Any

logger = logging.getLogger(__name__)


_SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_recipients() -> list[str]:
    """Split ``DEEPSYNAPS_ALERT_RECIPIENTS`` on commas, trimming whitespace."""
    raw = os.environ.get("DEEPSYNAPS_ALERT_RECIPIENTS", "")
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


def _has_smtp_config() -> bool:
    return all(
        os.environ.get(name, "").strip()
        for name in (
            "DEEPSYNAPS_SMTP_HOST",
            "DEEPSYNAPS_SMTP_USERNAME",
            "DEEPSYNAPS_SMTP_PASSWORD",
            "DEEPSYNAPS_SMTP_FROM",
            "DEEPSYNAPS_ALERT_RECIPIENTS",
        )
    )


def _has_sendgrid_config() -> bool:
    return all(
        os.environ.get(name, "").strip()
        for name in (
            "SENDGRID_API_KEY",
            "DEEPSYNAPS_SMTP_FROM",
            "DEEPSYNAPS_ALERT_RECIPIENTS",
        )
    )


# ---------------------------------------------------------------------------
# Provider implementations — kept private so tests can monkeypatch the
# dispatch logic in :func:`send_email` independently of network layers.
# ---------------------------------------------------------------------------


def _send_via_smtp(
    *,
    subject: str,
    body: str,
    sender: str,
    recipients: list[str],
) -> dict[str, Any]:
    """Send via stdlib :mod:`smtplib`.

    Uses STARTTLS on the configured port (default 587). Login is always
    performed — this module is not designed for un-auth'd SMTP relays.
    """
    host = os.environ["DEEPSYNAPS_SMTP_HOST"].strip()
    try:
        port = int(os.environ.get("DEEPSYNAPS_SMTP_PORT", "587"))
    except ValueError:
        port = 587
    username = os.environ["DEEPSYNAPS_SMTP_USERNAME"].strip()
    password = os.environ["DEEPSYNAPS_SMTP_PASSWORD"]

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    smtp = smtplib.SMTP(host, port, timeout=10)
    try:
        smtp.starttls()
        smtp.login(username, password)
        smtp.sendmail(sender, recipients, msg.as_string())
    finally:
        try:
            smtp.quit()
        except Exception:  # pragma: no cover - best-effort teardown
            pass

    return {"sent": True, "channel": "smtp", "recipients": recipients}


def _send_via_sendgrid(
    *,
    subject: str,
    body: str,
    sender: str,
    recipients: list[str],
) -> dict[str, Any]:
    """Send via SendGrid v3 mail/send endpoint using stdlib :mod:`urllib`.

    Avoids adding a ``requests`` dependency. SendGrid responds with HTTP
    202 on accept; any 2xx is treated as success.
    """
    api_key = os.environ["SENDGRID_API_KEY"].strip()
    payload = {
        "personalizations": [
            {"to": [{"email": addr} for addr in recipients]}
        ],
        "from": {"email": sender},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        _SENDGRID_ENDPOINT,
        data=data,
        method="POST",
    )
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 — fixed scheme
        status = getattr(resp, "status", None) or resp.getcode()
        if not (200 <= int(status) < 300):
            raise RuntimeError(f"sendgrid_non_2xx:{status}")

    return {"sent": True, "channel": "sendgrid", "recipients": recipients}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def send_email(*, subject: str, body: str) -> dict[str, Any]:
    """Send an alert email to ``DEEPSYNAPS_ALERT_RECIPIENTS``.

    Provider selection (in order):

    1. SendGrid (if ``SENDGRID_API_KEY`` is set alongside FROM + recipients)
    2. SMTP (if all SMTP env vars are set)
    3. Disabled — return ``{"sent": False, "reason": "disabled"}``

    Never raises. On any provider exception returns
    ``{"sent": False, "reason": "error", "error": str(exc)}`` and logs a
    warning so the failure shows up in the API container's stderr.
    """
    sender = os.environ.get("DEEPSYNAPS_SMTP_FROM", "").strip()
    recipients = _parse_recipients()

    if not sender or not recipients:
        return {"sent": False, "reason": "disabled"}

    use_sendgrid = _has_sendgrid_config()
    use_smtp = _has_smtp_config()

    if not use_sendgrid and not use_smtp:
        return {"sent": False, "reason": "disabled"}

    try:
        if use_sendgrid:
            return _send_via_sendgrid(
                subject=subject,
                body=body,
                sender=sender,
                recipients=recipients,
            )
        return _send_via_smtp(
            subject=subject,
            body=body,
            sender=sender,
            recipients=recipients,
        )
    except Exception as exc:  # noqa: BLE001 — by contract we never raise
        logger.warning(
            "email notification failed",
            extra={
                "event": "email_notification_error",
                "channel": "sendgrid" if use_sendgrid else "smtp",
                "error": str(exc),
            },
        )
        return {"sent": False, "reason": "error", "error": str(exc)}


__all__ = [
    "send_email",
    "_send_via_smtp",
    "_send_via_sendgrid",
]

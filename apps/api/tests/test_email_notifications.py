"""Unit tests for the Phase 11D email notification side-channel.

Covers
======

* :func:`email_notifications.send_email` — provider gating, success
  envelopes for both SMTP and SendGrid, provider precedence (SendGrid
  wins when both are configured) and the never-raise contract.
* Integration with :func:`ops_alerting.post_alert` — both side-channels
  fire on a single alert, and an email-side exception does not crash
  the Slack return contract.
"""
from __future__ import annotations

import smtplib
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services import email_notifications, ops_alerting


# ---------------------------------------------------------------------------
# Shared fixtures — every test starts with a clean env (autouse) so a leaky
# CI runner can't taint behaviour.
# ---------------------------------------------------------------------------

_EMAIL_ENV_VARS = (
    "SENDGRID_API_KEY",
    "DEEPSYNAPS_SMTP_HOST",
    "DEEPSYNAPS_SMTP_PORT",
    "DEEPSYNAPS_SMTP_USERNAME",
    "DEEPSYNAPS_SMTP_PASSWORD",
    "DEEPSYNAPS_SMTP_FROM",
    "DEEPSYNAPS_ALERT_RECIPIENTS",
)


@pytest.fixture(autouse=True)
def _scrub_email_env(monkeypatch):
    for name in _EMAIL_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    yield


def _set_smtp_env(monkeypatch) -> None:
    monkeypatch.setenv("DEEPSYNAPS_SMTP_HOST", "smtp.test")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_PORT", "587")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_USERNAME", "ops@deepsynaps.test")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_PASSWORD", "s3cret")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "alerts@deepsynaps.test")
    monkeypatch.setenv(
        "DEEPSYNAPS_ALERT_RECIPIENTS", "oncall@deepsynaps.test, sre@deepsynaps.test"
    )


def _set_sendgrid_env(monkeypatch) -> None:
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.fake-key")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "alerts@deepsynaps.test")
    monkeypatch.setenv("DEEPSYNAPS_ALERT_RECIPIENTS", "oncall@deepsynaps.test")


# ---------------------------------------------------------------------------
# send_email — provider gating
# ---------------------------------------------------------------------------


def test_send_email_disabled_when_no_env_configured():
    result = email_notifications.send_email(subject="s", body="b")
    assert result == {"sent": False, "reason": "disabled"}


def test_send_email_disabled_when_only_sender_set(monkeypatch):
    """No recipients → disabled, even if FROM is set."""
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "alerts@deepsynaps.test")
    result = email_notifications.send_email(subject="s", body="b")
    assert result == {"sent": False, "reason": "disabled"}


def test_send_email_disabled_when_recipients_set_but_no_provider(monkeypatch):
    """FROM + recipients but neither SendGrid nor full SMTP config → disabled."""
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "alerts@deepsynaps.test")
    monkeypatch.setenv("DEEPSYNAPS_ALERT_RECIPIENTS", "oncall@deepsynaps.test")
    result = email_notifications.send_email(subject="s", body="b")
    assert result == {"sent": False, "reason": "disabled"}


# ---------------------------------------------------------------------------
# SMTP path
# ---------------------------------------------------------------------------


def test_send_email_smtp_path_calls_starttls_login_sendmail_quit(monkeypatch):
    _set_smtp_env(monkeypatch)

    fake_smtp = MagicMock()
    smtp_factory = MagicMock(return_value=fake_smtp)

    with patch.object(smtplib, "SMTP", smtp_factory):
        result = email_notifications.send_email(
            subject="abuse signal",
            body="clinic-x ran 50 turns",
        )

    assert result["sent"] is True
    assert result["channel"] == "smtp"
    assert result["recipients"] == [
        "oncall@deepsynaps.test",
        "sre@deepsynaps.test",
    ]

    smtp_factory.assert_called_once()
    # Host + port positional args.
    args, _kwargs = smtp_factory.call_args
    assert args[0] == "smtp.test"
    assert args[1] == 587

    fake_smtp.starttls.assert_called_once()
    fake_smtp.login.assert_called_once_with("ops@deepsynaps.test", "s3cret")
    fake_smtp.sendmail.assert_called_once()
    sendmail_args, _ = fake_smtp.sendmail.call_args
    assert sendmail_args[0] == "alerts@deepsynaps.test"
    assert sendmail_args[1] == [
        "oncall@deepsynaps.test",
        "sre@deepsynaps.test",
    ]
    # The third arg is the rendered RFC822 message.
    assert "Subject: abuse signal" in sendmail_args[2]
    assert "clinic-x ran 50 turns" in sendmail_args[2]
    fake_smtp.quit.assert_called_once()


def test_send_email_smtp_raises_returns_error_envelope(monkeypatch):
    _set_smtp_env(monkeypatch)

    def _boom(*_a, **_kw):
        raise smtplib.SMTPException("connection refused")

    with patch.object(smtplib, "SMTP", side_effect=_boom):
        result = email_notifications.send_email(subject="s", body="b")

    assert result["sent"] is False
    assert result["reason"] == "error"
    assert "connection refused" in result["error"]


def test_send_email_smtp_default_port_587_when_unset(monkeypatch):
    """Omitting DEEPSYNAPS_SMTP_PORT must default to 587."""
    _set_smtp_env(monkeypatch)
    monkeypatch.delenv("DEEPSYNAPS_SMTP_PORT", raising=False)

    fake_smtp = MagicMock()
    with patch.object(smtplib, "SMTP", return_value=fake_smtp) as factory:
        result = email_notifications.send_email(subject="s", body="b")

    assert result["sent"] is True
    args, _ = factory.call_args
    assert args[1] == 587


# ---------------------------------------------------------------------------
# SendGrid path
# ---------------------------------------------------------------------------


def _patch_urlopen_ok():
    """Return a context-manager-friendly mock for ``urllib.request.urlopen``."""
    fake_resp = MagicMock()
    fake_resp.status = 202
    fake_resp.getcode.return_value = 202
    fake_resp.__enter__ = MagicMock(return_value=fake_resp)
    fake_resp.__exit__ = MagicMock(return_value=False)
    return fake_resp


def test_send_email_sendgrid_uses_https_endpoint_and_bearer_auth(monkeypatch):
    _set_sendgrid_env(monkeypatch)
    fake_resp = _patch_urlopen_ok()

    captured: dict = {}

    def _capture(req, timeout=None):
        # ``Request`` exposes full_url and get_header(...) normalised on
        # the casefolded header name (e.g. "Authorization" → "Authorization").
        captured["url"] = req.full_url
        captured["auth"] = req.get_header("Authorization")
        captured["content_type"] = req.get_header("Content-type")
        captured["data"] = req.data
        return fake_resp

    with patch(
        "app.services.email_notifications.urllib.request.urlopen",
        side_effect=_capture,
    ):
        result = email_notifications.send_email(
            subject="abuse signal", body="clinic-x ran 50 turns"
        )

    assert result == {
        "sent": True,
        "channel": "sendgrid",
        "recipients": ["oncall@deepsynaps.test"],
    }
    assert captured["url"] == "https://api.sendgrid.com/v3/mail/send"
    assert captured["auth"] == "Bearer SG.fake-key"
    assert captured["content_type"] == "application/json"
    # Payload should encode subject + recipient.
    raw = captured["data"].decode("utf-8")
    assert "abuse signal" in raw
    assert "oncall@deepsynaps.test" in raw
    assert "alerts@deepsynaps.test" in raw


def test_send_email_sendgrid_wins_when_both_providers_configured(monkeypatch):
    _set_smtp_env(monkeypatch)
    _set_sendgrid_env(monkeypatch)

    fake_resp = _patch_urlopen_ok()
    smtp_factory = MagicMock()

    with patch(
        "app.services.email_notifications.urllib.request.urlopen",
        return_value=fake_resp,
    ) as urlopen, patch.object(smtplib, "SMTP", smtp_factory):
        result = email_notifications.send_email(subject="s", body="b")

    assert result["channel"] == "sendgrid"
    urlopen.assert_called_once()
    smtp_factory.assert_not_called()


def test_send_email_sendgrid_non_2xx_returns_error_envelope(monkeypatch):
    _set_sendgrid_env(monkeypatch)

    fake_resp = MagicMock()
    fake_resp.status = 401
    fake_resp.getcode.return_value = 401
    fake_resp.__enter__ = MagicMock(return_value=fake_resp)
    fake_resp.__exit__ = MagicMock(return_value=False)

    with patch(
        "app.services.email_notifications.urllib.request.urlopen",
        return_value=fake_resp,
    ):
        result = email_notifications.send_email(subject="s", body="b")

    assert result["sent"] is False
    assert result["reason"] == "error"
    assert "sendgrid_non_2xx" in result["error"]


# ---------------------------------------------------------------------------
# ops_alerting integration
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_ops_dedupe():
    ops_alerting._reset_dedupe_for_tests()
    yield
    ops_alerting._reset_dedupe_for_tests()


def test_post_alert_calls_send_email_after_slack(monkeypatch):
    """Slack and email side-channels both fire on a single ``post_alert`` call."""
    monkeypatch.setenv("SLACK_OPS_WEBHOOK_URL", "https://hooks.slack.test/x/y/z")

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200

    sent_emails: list[dict] = []

    def _fake_send_email(*, subject, body):
        sent_emails.append({"subject": subject, "body": body})
        return {"sent": True, "channel": "smtp", "recipients": ["x@y"]}

    with patch.object(httpx, "post", return_value=fake_resp) as p, patch.object(
        ops_alerting, "send_email", side_effect=_fake_send_email
    ):
        result = ops_alerting.post_alert(
            severity="high", title="Pair noisy", body="clinic-x ran 50 turns"
        )

    assert result["ok"] is True
    p.assert_called_once()
    assert len(sent_emails) == 1
    assert sent_emails[0]["subject"] == "[DeepSynaps] Pair noisy"
    assert sent_emails[0]["body"] == "clinic-x ran 50 turns"


def test_post_alert_email_failure_does_not_break_slack_return(monkeypatch):
    """If ``send_email`` raises (against contract), Slack return is preserved."""
    monkeypatch.setenv("SLACK_OPS_WEBHOOK_URL", "https://hooks.slack.test/x/y/z")

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200

    def _boom(**_kw):
        raise RuntimeError("hypothetical email bug")

    with patch.object(httpx, "post", return_value=fake_resp), patch.object(
        ops_alerting, "send_email", side_effect=_boom
    ):
        result = ops_alerting.post_alert(
            severity="high", title="Pair noisy", body="clinic-x ran 50 turns"
        )

    assert result == {"ok": True, "reason": None, "status_code": 200}


def test_post_alert_emails_even_when_slack_webhook_unset(monkeypatch):
    """Email is independent of Slack — runs even with no Slack webhook."""
    monkeypatch.delenv("SLACK_OPS_WEBHOOK_URL", raising=False)

    sent: list = []

    def _fake_send_email(**kw):
        sent.append(kw)
        return {"sent": True, "channel": "smtp", "recipients": ["x@y"]}

    with patch.object(ops_alerting, "send_email", side_effect=_fake_send_email):
        result = ops_alerting.post_alert(
            severity="med", title="t", body="b"
        )

    assert result["reason"] == "no_webhook_configured"
    assert len(sent) == 1
    assert sent[0]["subject"] == "[DeepSynaps] t"


def test_post_alert_dedupe_suppresses_email_too(monkeypatch):
    """Once a dedupe key is seen, neither Slack nor email re-fires."""
    monkeypatch.setenv("SLACK_OPS_WEBHOOK_URL", "https://hooks.slack.test/x/y/z")

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200

    sent: list = []

    with patch.object(httpx, "post", return_value=fake_resp) as p, patch.object(
        ops_alerting, "send_email", side_effect=lambda **kw: sent.append(kw)
    ):
        first = ops_alerting.post_alert(
            severity="high", title="t", body="b", dedupe_key="k1"
        )
        second = ops_alerting.post_alert(
            severity="high", title="t", body="b", dedupe_key="k1"
        )

    assert first["ok"] is True and first["reason"] is None
    assert second == {"ok": True, "reason": "deduped", "status_code": None}
    assert p.call_count == 1
    assert len(sent) == 1

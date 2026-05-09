"""Tests for app.services.email_notifications — send_email behaviour (PR 83/N).

Covers:
- returns disabled when no env vars set
- returns disabled when only FROM set but no recipients
- _parse_recipients handles comma-separated, strips whitespace
- _has_smtp_config returns False when env vars missing
- _has_sendgrid_config returns False when env vars missing
- send_email returns sendgrid envelope when sendgrid config present
- send_email returns smtp envelope when smtp config present
- send_email returns error envelope on provider exception (never raises)
- sendgrid preferred over smtp when both configured
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch


def _clear_email_env(monkeypatch):
    for key in (
        "SENDGRID_API_KEY",
        "DEEPSYNAPS_SMTP_HOST",
        "DEEPSYNAPS_SMTP_PORT",
        "DEEPSYNAPS_SMTP_USERNAME",
        "DEEPSYNAPS_SMTP_PASSWORD",
        "DEEPSYNAPS_SMTP_FROM",
        "DEEPSYNAPS_ALERT_RECIPIENTS",
    ):
        monkeypatch.delenv(key, raising=False)


def test_disabled_when_no_env_vars(monkeypatch):
    _clear_email_env(monkeypatch)
    from app.services.email_notifications import send_email

    result = send_email(subject="Test", body="Hello")
    assert result["sent"] is False
    assert result["reason"] == "disabled"


def test_disabled_when_recipients_empty(monkeypatch):
    _clear_email_env(monkeypatch)
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "ops@example.com")
    monkeypatch.setenv("DEEPSYNAPS_ALERT_RECIPIENTS", "")
    from app.services.email_notifications import send_email

    result = send_email(subject="Alert", body="ops message")
    assert result["sent"] is False
    assert result["reason"] == "disabled"


def test_parse_recipients_splits_on_comma(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ALERT_RECIPIENTS", "a@example.com, b@example.com , c@example.com")
    from app.services.email_notifications import _parse_recipients

    recipients = _parse_recipients()
    assert recipients == ["a@example.com", "b@example.com", "c@example.com"]


def test_parse_recipients_empty_env_gives_empty_list(monkeypatch):
    monkeypatch.delenv("DEEPSYNAPS_ALERT_RECIPIENTS", raising=False)
    from app.services.email_notifications import _parse_recipients

    assert _parse_recipients() == []


def test_has_smtp_config_false_when_missing(monkeypatch):
    _clear_email_env(monkeypatch)
    from app.services.email_notifications import _has_smtp_config

    assert _has_smtp_config() is False


def test_has_sendgrid_config_false_when_missing(monkeypatch):
    _clear_email_env(monkeypatch)
    from app.services.email_notifications import _has_sendgrid_config

    assert _has_sendgrid_config() is False


def test_send_email_uses_sendgrid_when_configured(monkeypatch):
    _clear_email_env(monkeypatch)
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.fake")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "ops@example.com")
    monkeypatch.setenv("DEEPSYNAPS_ALERT_RECIPIENTS", "dr@example.com")

    mock_send = MagicMock(return_value={"sent": True, "channel": "sendgrid", "recipients": ["dr@example.com"]})
    with patch("app.services.email_notifications._send_via_sendgrid", mock_send):
        from app.services.email_notifications import send_email

        result = send_email(subject="Subject", body="Body text")

    assert result["sent"] is True
    assert result["channel"] == "sendgrid"
    mock_send.assert_called_once()


def test_send_email_uses_smtp_when_no_sendgrid(monkeypatch):
    _clear_email_env(monkeypatch)
    for key, val in (
        ("DEEPSYNAPS_SMTP_HOST", "smtp.example.com"),
        ("DEEPSYNAPS_SMTP_USERNAME", "user"),
        ("DEEPSYNAPS_SMTP_PASSWORD", "pass"),
        ("DEEPSYNAPS_SMTP_FROM", "ops@example.com"),
        ("DEEPSYNAPS_ALERT_RECIPIENTS", "dr@example.com"),
    ):
        monkeypatch.setenv(key, val)

    mock_smtp = MagicMock(return_value={"sent": True, "channel": "smtp", "recipients": ["dr@example.com"]})
    with patch("app.services.email_notifications._send_via_smtp", mock_smtp):
        from app.services.email_notifications import send_email

        result = send_email(subject="Alert", body="SMTP alert body")

    assert result["sent"] is True
    assert result["channel"] == "smtp"
    mock_smtp.assert_called_once()


def test_send_email_returns_error_envelope_on_provider_exception(monkeypatch):
    _clear_email_env(monkeypatch)
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.fail")
    monkeypatch.setenv("DEEPSYNAPS_SMTP_FROM", "ops@example.com")
    monkeypatch.setenv("DEEPSYNAPS_ALERT_RECIPIENTS", "dr@example.com")

    def _fail(**kwargs):
        raise RuntimeError("network timeout")

    with patch("app.services.email_notifications._send_via_sendgrid", _fail):
        from app.services.email_notifications import send_email

        result = send_email(subject="Fail", body="will fail")

    assert result["sent"] is False
    assert result["reason"] == "error"
    assert "network timeout" in result["error"]


def test_sendgrid_preferred_over_smtp_when_both_configured(monkeypatch):
    _clear_email_env(monkeypatch)
    for key, val in (
        ("SENDGRID_API_KEY", "SG.both"),
        ("DEEPSYNAPS_SMTP_HOST", "smtp.example.com"),
        ("DEEPSYNAPS_SMTP_USERNAME", "user"),
        ("DEEPSYNAPS_SMTP_PASSWORD", "pass"),
        ("DEEPSYNAPS_SMTP_FROM", "ops@example.com"),
        ("DEEPSYNAPS_ALERT_RECIPIENTS", "dr@example.com"),
    ):
        monkeypatch.setenv(key, val)

    mock_sg = MagicMock(return_value={"sent": True, "channel": "sendgrid", "recipients": ["dr@example.com"]})
    mock_smtp = MagicMock(return_value={"sent": True, "channel": "smtp", "recipients": ["dr@example.com"]})
    with patch("app.services.email_notifications._send_via_sendgrid", mock_sg), \
         patch("app.services.email_notifications._send_via_smtp", mock_smtp):
        from app.services.email_notifications import send_email

        result = send_email(subject="Both", body="prefer sendgrid")

    mock_sg.assert_called_once()
    mock_smtp.assert_not_called()
    assert result["channel"] == "sendgrid"

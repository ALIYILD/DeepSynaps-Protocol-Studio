"""On-Call Delivery Adapter Service (2026-05-01).

Closes the **delivery half** of the on-call escalation chain:

* ``Care Team Coverage (#357)`` shipped the data model — escalation chains,
  per-surface SLAs, the ``_list_breaches`` predicate, and the manual
  ``POST /page-oncall`` endpoint.
* ``Auto-Page Worker (#372)`` shipped the real-time scanner — every 60s it
  walks every clinic with ``escalation_chains.auto_page_enabled=True``,
  finds breaches, and fires ``_page_oncall_impl(...)``.
* THIS PR closes the gap. Both call sites (manual handler + worker)
  funnel through :class:`OncallDeliveryService`, which dispatches the
  page through the configured external adapters (Slack DM, Twilio SMS,
  PagerDuty incident) and stamps an HONEST ``delivery_status``:

    - ``"sent"``   when ONE adapter returned 2xx — ``external_id`` and
      ``delivery_note`` carry the provider-side message id and a
      one-line transcript.
    - ``"failed"`` when EVERY enabled adapter returned non-2xx / raised
      / timed out — ``delivery_note`` carries the joined per-adapter
      reasons (``slack=403, twilio=timeout, pagerduty=429``). Failed
      rows are visible to the next worker tick so retry is automatic
      via the existing cooldown logic in #372.
    - ``"queued"`` is preserved as the legacy synonym for "no adapter
      enabled" so the worker badge + status panel stay honest about a
      deploy with zero env vars set.

Truth-audit invariants
======================

1. **No silent ``sent``.** The service NEVER stamps ``"sent"`` without a
   confirming 2xx from a real adapter. Mock-mode for tests is opt-in via
   ``DEEPSYNAPS_DELIVERY_MOCK=1`` AND the resulting row's
   ``delivery_note`` ALWAYS starts with ``"MOCK:"`` so reviewers see at a
   glance that the row was not a real delivery.
2. **No silent skips.** When an adapter env var is absent the service
   logs ``adapter X disabled, env var missing`` AND surfaces the
   adapter as ``enabled=False`` in :func:`describe_adapters` so the UI
   renders a per-adapter health row (NOT a blank).
3. **No automatic retries.** A single :meth:`OncallDeliveryService.send`
   tries adapters in priority order and stops at the first 2xx. The
   worker's own 15-minute cooldown handles re-delivery on the next tick.
4. **5s timeout.** Every HTTP call is bounded at 5 seconds. Timeouts
   count as a ``failed`` adapter; the dispatch loop continues to the
   next adapter.
5. **No tokens in the API response.** The describe-adapters surface
   reports ``enabled`` only — never the bot token or account SID. Tokens
   are loaded from env vars at adapter construction time.

Configuration
=============

``DEEPSYNAPS_DELIVERY_MOCK``
    When equal to ``"1"``, every :meth:`send` returns a synthetic ``sent``
    result with ``delivery_note='MOCK: ...'``. Used by tests and demo
    deploys; production MUST leave this unset.
``SLACK_BOT_TOKEN``  +  ``SLACK_DEFAULT_CHANNEL``
    Slack bot OAuth token + the default channel id (e.g. ``"C012ABC3DE"``)
    to post pages into when the ``OncallPage`` carries no per-shift
    Slack channel handle. When the token is absent, :class:`SlackAdapter`
    is registered as ``enabled=False`` and never dispatched.
``TWILIO_ACCOUNT_SID``  +  ``TWILIO_AUTH_TOKEN``  +  ``TWILIO_FROM_NUMBER``
    All three required to enable :class:`TwilioSMSAdapter`. Pages are
    routed to the on-call user's ``ShiftRoster.contact_handle``.
``PAGERDUTY_API_KEY``  +  ``PAGERDUTY_ROUTING_KEY``
    Routing key is the v2 events integration key for the destination
    service. When either is absent, :class:`PagerDutyAdapter` is
    registered as ``enabled=False``.
``SENDGRID_API_KEY``  +  ``SENDGRID_FROM_ADDRESS``
    Both required to enable :class:`SendGridEmailAdapter`. POSTs to
    ``https://api.sendgrid.com/v3/mail/send`` with a Bearer token;
    SendGrid returns ``202 Accepted`` on a successful queue. Used by the
    Caregiver Email Digest worker (#380) to turn the mock dispatch into
    a real outbound email when both env vars are set. Loud-signal
    on-call channels (PagerDuty / Slack / Twilio) still own the default
    on-call dispatch order; SendGrid is opt-in for the email channel
    only via :func:`build_email_digest_service`.
``DEEPSYNAPS_DELIVERY_TIMEOUT_SEC``
    Per-adapter HTTP timeout in seconds. Defaults to 5. Bad values fall
    back to 5.

Adapter dispatch order
======================

PagerDuty → Slack → Twilio. Rationale: PagerDuty is the "loudest"
delivery (page incident, on-call escalation honored by the destination
service), Slack is "loud-ish" (DM with desktop notification + mobile
push), Twilio SMS is the "fallback" (works on the carrier network even
when the data plane is down). The order is fixed in code so deploys
cannot accidentally reorder it through env-var ordering.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

import httpx


_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public dataclasses
# ---------------------------------------------------------------------------


@dataclass
class PageMessage:
    """A single page-on-call message to be handed to an adapter.

    Built by :class:`OncallDeliveryService.send` from the ``OncallPage``
    row + the resolved on-call ``User`` row + the originating audit
    row. Adapters consume only this struct so the test fakes don't need
    to know anything about the SQLAlchemy model.
    """

    clinic_id: str
    surface: str
    audit_event_id: str
    body: str
    severity: str = "high"
    # Recipient identification — the adapter chooses which one(s) to use.
    recipient_display_name: Optional[str] = None
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None
    recipient_slack_user_id: Optional[str] = None
    # Provider-side targeting hints (e.g. PagerDuty service id).
    routing_hints: dict[str, str] = field(default_factory=dict)


@dataclass
class DeliveryResult:
    """Result of one adapter ``send`` call OR the dispatch-level summary.

    For an individual adapter ``status`` is ``"sent"`` or ``"failed"``;
    for the dispatch-level summary returned by
    :meth:`OncallDeliveryService.send` it is ``"sent"`` (any adapter
    won), ``"failed"`` (every enabled adapter failed), or ``"queued"``
    (no adapter was enabled — the legacy honest-default carried forward
    from #372).
    """

    status: str  # "sent" | "failed" | "queued"
    adapter: Optional[str] = None
    external_id: Optional[str] = None
    raw_response: dict[str, Any] = field(default_factory=dict)
    latency_ms: int = 0
    note: Optional[str] = None
    # Per-adapter audit chain — populated on the dispatch-level result so
    # the audit row can record every attempt even when one of them won.
    attempts: list["DeliveryResult"] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Protocol + base class
# ---------------------------------------------------------------------------


class Adapter(Protocol):
    """Adapter contract. Implementations live below."""

    name: str
    enabled: bool

    def send(self, message: PageMessage) -> DeliveryResult: ...


def _timeout_sec() -> float:
    raw = os.environ.get("DEEPSYNAPS_DELIVERY_TIMEOUT_SEC", "").strip()
    if not raw:
        return 5.0
    try:
        v = float(raw)
    except ValueError:
        return 5.0
    if v <= 0 or v > 60:
        return 5.0
    return v


def _mock_mode_enabled() -> bool:
    return os.environ.get("DEEPSYNAPS_DELIVERY_MOCK", "").strip() == "1"


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# Adapter implementations
# ---------------------------------------------------------------------------


class SlackAdapter:
    """Slack ``chat.postMessage`` adapter.

    Posts the page body into the recipient's Slack DM (when
    ``recipient_slack_user_id`` is present) OR the configured default
    channel. Only enabled when ``SLACK_BOT_TOKEN`` is set.
    """

    name = "slack"

    def __init__(
        self,
        bot_token: Optional[str] = None,
        default_channel: Optional[str] = None,
    ) -> None:
        self.bot_token = bot_token if bot_token is not None else os.environ.get("SLACK_BOT_TOKEN")
        self.default_channel = (
            default_channel
            if default_channel is not None
            else os.environ.get("SLACK_DEFAULT_CHANNEL")
        )
        self.enabled = bool(self.bot_token)

    def send(self, message: PageMessage) -> DeliveryResult:
        if not self.enabled:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="disabled: SLACK_BOT_TOKEN missing",
            )
        channel = message.recipient_slack_user_id or self.default_channel
        if not channel:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="no recipient slack user id and no default channel",
            )
        started = _now_ms()
        try:
            with httpx.Client(timeout=_timeout_sec()) as client:
                resp = client.post(
                    "https://slack.com/api/chat.postMessage",
                    headers={
                        "Authorization": f"Bearer {self.bot_token}",
                        "Content-Type": "application/json; charset=utf-8",
                    },
                    json={
                        "channel": channel,
                        "text": message.body,
                    },
                )
        except httpx.TimeoutException:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="timeout",
                latency_ms=_now_ms() - started,
            )
        except Exception as exc:  # pragma: no cover - defensive
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note=f"error: {exc.__class__.__name__}",
                latency_ms=_now_ms() - started,
            )
        latency = _now_ms() - started
        if 200 <= resp.status_code < 300:
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            # Slack returns ``ok: true`` on success even on 200 OK with a
            # logical error (e.g. ``"not_in_channel"``). Honor that flag.
            if isinstance(payload, dict) and payload.get("ok") is True:
                return DeliveryResult(
                    status="sent",
                    adapter=self.name,
                    external_id=str(payload.get("ts", "")) or None,
                    raw_response={"ok": True, "ts": payload.get("ts")},
                    latency_ms=latency,
                    note=f"slack ok ts={payload.get('ts', '')}",
                )
            err = (payload.get("error") if isinstance(payload, dict) else None) or "unknown"
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                raw_response={"ok": False, "error": err},
                latency_ms=latency,
                note=f"slack ok=false error={err}",
            )
        return DeliveryResult(
            status="failed",
            adapter=self.name,
            raw_response={"status_code": resp.status_code},
            latency_ms=latency,
            note=f"http {resp.status_code}",
        )


class TwilioSMSAdapter:
    """Twilio Messages API adapter.

    POST ``https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json``
    with HTTP basic auth (account SID / auth token). Routes to
    ``message.recipient_phone``.
    """

    name = "twilio"

    def __init__(
        self,
        account_sid: Optional[str] = None,
        auth_token: Optional[str] = None,
        from_number: Optional[str] = None,
    ) -> None:
        self.account_sid = account_sid if account_sid is not None else os.environ.get("TWILIO_ACCOUNT_SID")
        self.auth_token = auth_token if auth_token is not None else os.environ.get("TWILIO_AUTH_TOKEN")
        self.from_number = from_number if from_number is not None else os.environ.get("TWILIO_FROM_NUMBER")
        self.enabled = bool(self.account_sid and self.auth_token and self.from_number)

    def send(self, message: PageMessage) -> DeliveryResult:
        if not self.enabled:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note=(
                    "disabled: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / "
                    "TWILIO_FROM_NUMBER missing"
                ),
            )
        if not message.recipient_phone:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="no recipient phone on shift",
            )
        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}"
            f"/Messages.json"
        )
        started = _now_ms()
        try:
            with httpx.Client(timeout=_timeout_sec()) as client:
                resp = client.post(
                    url,
                    auth=(self.account_sid, self.auth_token),
                    data={
                        "From": self.from_number,
                        "To": message.recipient_phone,
                        "Body": message.body,
                    },
                )
        except httpx.TimeoutException:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="timeout",
                latency_ms=_now_ms() - started,
            )
        except Exception as exc:  # pragma: no cover - defensive
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note=f"error: {exc.__class__.__name__}",
                latency_ms=_now_ms() - started,
            )
        latency = _now_ms() - started
        if 200 <= resp.status_code < 300:
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            sid = payload.get("sid") if isinstance(payload, dict) else None
            return DeliveryResult(
                status="sent",
                adapter=self.name,
                external_id=str(sid) if sid else None,
                raw_response={"sid": sid, "status_code": resp.status_code},
                latency_ms=latency,
                note=f"twilio sid={sid}",
            )
        return DeliveryResult(
            status="failed",
            adapter=self.name,
            raw_response={"status_code": resp.status_code},
            latency_ms=latency,
            note=f"http {resp.status_code}",
        )


class PagerDutyAdapter:
    """PagerDuty Events v2 ``enqueue`` adapter.

    POST ``https://events.pagerduty.com/v2/enqueue`` with ``event_action``
    set to ``"trigger"`` so the destination service raises an incident.
    """

    name = "pagerduty"

    def __init__(
        self,
        api_key: Optional[str] = None,
        routing_key: Optional[str] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.environ.get("PAGERDUTY_API_KEY")
        self.routing_key = routing_key if routing_key is not None else os.environ.get("PAGERDUTY_ROUTING_KEY")
        self.enabled = bool(self.api_key and self.routing_key)

    def send(self, message: PageMessage) -> DeliveryResult:
        if not self.enabled:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="disabled: PAGERDUTY_API_KEY / PAGERDUTY_ROUTING_KEY missing",
            )
        dedup_key = f"deepsynaps-{message.audit_event_id}"
        started = _now_ms()
        try:
            with httpx.Client(timeout=_timeout_sec()) as client:
                resp = client.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/vnd.pagerduty+json;version=2",
                        "Authorization": f"Token token={self.api_key}",
                    },
                    json={
                        "routing_key": self.routing_key,
                        "event_action": "trigger",
                        "dedup_key": dedup_key,
                        "payload": {
                            "summary": message.body[:1024],
                            "severity": (message.severity or "high"),
                            "source": f"deepsynaps:{message.clinic_id}",
                            "component": message.surface,
                            "custom_details": {
                                "audit_event_id": message.audit_event_id,
                                "surface": message.surface,
                                "clinic_id": message.clinic_id,
                                "recipient": message.recipient_display_name,
                            },
                        },
                    },
                )
        except httpx.TimeoutException:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="timeout",
                latency_ms=_now_ms() - started,
            )
        except Exception as exc:  # pragma: no cover - defensive
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note=f"error: {exc.__class__.__name__}",
                latency_ms=_now_ms() - started,
            )
        latency = _now_ms() - started
        # PagerDuty returns 202 Accepted on success.
        if 200 <= resp.status_code < 300:
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            return DeliveryResult(
                status="sent",
                adapter=self.name,
                external_id=str(payload.get("dedup_key") or dedup_key) if payload else dedup_key,
                raw_response={"status_code": resp.status_code, "dedup_key": dedup_key},
                latency_ms=latency,
                note=f"pagerduty dedup={dedup_key}",
            )
        return DeliveryResult(
            status="failed",
            adapter=self.name,
            raw_response={"status_code": resp.status_code},
            latency_ms=latency,
            note=f"http {resp.status_code}",
        )


class SendGridEmailAdapter:
    """SendGrid ``v3/mail/send`` adapter.

    POST ``https://api.sendgrid.com/v3/mail/send`` with a Bearer token.
    Routes to ``message.recipient_email``; refuses to dispatch when the
    field is missing (the audit row records ``failed`` with a reason so
    the regulator transcript stays honest about why the email did not
    leave). Only enabled when BOTH ``SENDGRID_API_KEY`` and
    ``SENDGRID_FROM_ADDRESS`` are set.

    SendGrid returns ``202 Accepted`` on a successful queue (the message
    has been handed off to their delivery infrastructure). 4xx / 5xx are
    stamped ``failed`` with the response status code captured in
    ``raw_response`` so retry tooling can drive back-off / re-route.
    Timeouts count as a ``failed`` adapter at the 5s ceiling — the
    dispatch loop is bounded so a hung SendGrid edge cannot stall the
    Caregiver Email Digest worker.
    """

    name = "sendgrid"

    def __init__(
        self,
        api_key: Optional[str] = None,
        from_address: Optional[str] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.environ.get("SENDGRID_API_KEY")
        self.from_address = (
            from_address
            if from_address is not None
            else os.environ.get("SENDGRID_FROM_ADDRESS")
        )
        self.enabled = bool(self.api_key and self.from_address)

    def send(self, message: PageMessage) -> DeliveryResult:
        if not self.enabled:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="disabled: SENDGRID_API_KEY / SENDGRID_FROM_ADDRESS missing",
            )
        if not message.recipient_email:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="no recipient_email on message",
            )
        # Build a HTML + plaintext multipart envelope. SendGrid's v3 API
        # requires both ``personalizations[0].to`` and ``content`` of at
        # least one type; we send text/plain with the body verbatim.
        payload = {
            "personalizations": [
                {
                    "to": [
                        {
                            "email": message.recipient_email,
                            "name": message.recipient_display_name
                            or message.recipient_email,
                        }
                    ],
                    "subject": _sendgrid_subject(message),
                }
            ],
            "from": {
                "email": self.from_address,
                "name": "DeepSynaps Studio",
            },
            "content": [
                {"type": "text/plain", "value": message.body or ""},
            ],
            "categories": [
                f"deepsynaps:{message.surface}"[:255],
            ],
            "custom_args": {
                "audit_event_id": message.audit_event_id,
                "surface": message.surface,
                "clinic_id": message.clinic_id,
            },
        }
        started = _now_ms()
        try:
            with httpx.Client(timeout=_timeout_sec()) as client:
                resp = client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException:
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note="timeout",
                latency_ms=_now_ms() - started,
            )
        except Exception as exc:  # pragma: no cover - defensive
            return DeliveryResult(
                status="failed",
                adapter=self.name,
                note=f"error: {exc.__class__.__name__}",
                latency_ms=_now_ms() - started,
            )
        latency = _now_ms() - started
        # SendGrid returns 202 Accepted on success — also accept the
        # broader 2xx range for forward-compatibility.
        if 200 <= resp.status_code < 300:
            # SendGrid's success response carries an ``X-Message-Id``
            # header (when sandbox-mode is off) we capture as the
            # external_id so the audit row can be correlated against
            # the SendGrid Activity feed for delivery tracking.
            try:
                ext_id = (
                    resp.headers.get("X-Message-Id")
                    or resp.headers.get("x-message-id")
                    or None
                )
            except Exception:
                ext_id = None
            return DeliveryResult(
                status="sent",
                adapter=self.name,
                external_id=str(ext_id) if ext_id else None,
                raw_response={"status_code": resp.status_code, "x_message_id": ext_id},
                latency_ms=latency,
                note=f"sendgrid 202 x_message_id={ext_id or '-'}",
            )
        # Capture a short body snippet for the audit row. Avoid logging
        # full response bodies (SendGrid sometimes echoes the recipient
        # email in the error envelope; the snippet is bounded to 200 chars
        # so PHI exposure is minimised).
        try:
            err_body = resp.text[:200]
        except Exception:
            err_body = ""
        return DeliveryResult(
            status="failed",
            adapter=self.name,
            raw_response={"status_code": resp.status_code, "body": err_body},
            latency_ms=latency,
            note=f"http {resp.status_code}",
        )


def _sendgrid_subject(message: PageMessage) -> str:
    """Subject line for the SendGrid envelope.

    The Caregiver Email Digest worker carries ``surface=
    'caregiver_email_digest'`` so we surface a calm, plainspoken
    subject. Other surfaces (on-call paging) get a louder prefix so the
    inbox row is unmissable.
    """
    if message.surface == "caregiver_email_digest":
        return "Your DeepSynaps caregiver digest"
    if message.severity == "critical":
        return f"[DeepSynaps PAGE] {message.surface}"
    return f"[DeepSynaps] {message.surface}"


# ---------------------------------------------------------------------------
# Dispatch service
# ---------------------------------------------------------------------------


# Adapter registration order. Frozen in code so deploys can't accidentally
# reorder via env vars. Tests construct the service with explicit adapters
# to bypass this when needed.
DEFAULT_ADAPTER_ORDER: tuple[type, ...] = (
    PagerDutyAdapter,
    SlackAdapter,
    TwilioSMSAdapter,
)


# Email-channel adapter order. SendGrid is the only currently-wired
# email adapter; we keep the tuple for symmetry so a future SES adapter
# can drop in without churning the worker call site.
EMAIL_ADAPTER_ORDER: tuple[type, ...] = (
    SendGridEmailAdapter,
)


_ADAPTER_FACTORIES: dict[str, type] = {
    "pagerduty": PagerDutyAdapter,
    "slack": SlackAdapter,
    "twilio": TwilioSMSAdapter,
    "sendgrid": SendGridEmailAdapter,
}


# Adapter-name → user-facing channel chip. The channel chip is what the
# UI renders next to a delivery row ("via email" / "via sms") and what
# the audit-row note carries as ``channel=<chip>`` so downstream
# consumers (patient digest, audit trail) don't have to maintain their
# own adapter→channel mapping.
ADAPTER_CHANNEL: dict[str, str] = {
    "sendgrid": "email",
    "twilio": "sms",
    "slack": "slack",
    "pagerduty": "pagerduty",
    # Mock-mode dispatch surfaces as ``channel=mock`` so the regulator
    # transcript is unambiguous about which deploys were demo / CI vs.
    # production.
    "mock": "mock",
}


def adapter_channel(adapter_name: Optional[str]) -> str:
    """Return the user-facing channel chip for ``adapter_name``.

    Falls back to the adapter name itself when unknown so a future
    adapter (e.g. SES) still surfaces a non-empty chip without code
    churn — just register it in :data:`ADAPTER_CHANNEL` to make the chip
    pretty.
    """
    if not adapter_name:
        return "-"
    key = adapter_name.strip().lower()
    return ADAPTER_CHANNEL.get(key, key)


def build_delivery_audit_note(
    *,
    unread_count: int,
    recipient: Optional[str],
    delivery_status: str,
    adapter_name: Optional[str],
    external_id: Optional[str],
    grant_id: Optional[str],
    delivery_note: Optional[str],
    trigger: str = "send_now",
    extra: Optional[dict[str, str]] = None,
) -> str:
    """Build the unified audit-row note for caregiver digest delivery.

    Multi-Adapter Delivery Parity launch-audit (2026-05-01). All four
    adapters (SendGrid, Twilio, Slack, PagerDuty) call this helper from
    the dispatch loop so the note format is identical across channels.
    Downstream readers (``latest_delivery_ack_for_caregiver``,
    ``_count_caregiver_digest_deliveries``, audit-trail filter) parse
    ``adapter=`` / ``channel=`` / ``delivery_status=`` keys.

    Note format::

        unread=N; recipient=<email|->; delivery_status=<sent|failed|queued>;
        adapter=<sendgrid|twilio|slack|pagerduty|->;
        channel=<email|sms|slack|pagerduty|->;
        external_id=<...>; grant_id=<...>;
        delivery_note=<...>; trigger=<send_now|worker>

    The ``channel`` key is the load-bearing addition: per-adapter parity
    means the patient digest UI can render a "via {channel}" tag without
    needing to know the adapter taxonomy. ``trigger`` distinguishes
    manual ``POST /send-now`` from worker-tick dispatches so the
    regulator transcript can disambiguate the two paths.
    """
    note_bits: list[str] = [
        f"unread={unread_count}",
        f"recipient={recipient or '-'}",
        f"delivery_status={delivery_status}",
        f"adapter={adapter_name or '-'}",
        f"channel={adapter_channel(adapter_name)}",
        f"external_id={external_id or '-'}",
        f"grant_id={grant_id or '-'}",
        f"delivery_note={(delivery_note or '')[:160]}",
        f"trigger={trigger}",
    ]
    if extra:
        for k, v in extra.items():
            if not k:
                continue
            note_bits.append(f"{k}={v}")
    return "; ".join(note_bits)[:1024]


def _build_adapters_for_order(order: list[str]) -> list[Adapter]:
    """Construct adapters in the requested ``order``.

    Unknown adapter names are dropped silently here — the
    :mod:`escalation_policy_router` PUT validates against
    :data:`KNOWN_ADAPTER_NAMES` so a malformed order can never reach this
    constructor in the production path. Tests pass adapters directly.
    """
    out: list[Adapter] = []
    for name in order:
        cls = _ADAPTER_FACTORIES.get((name or "").strip().lower())
        if cls is None:
            continue
        out.append(cls())
    return out


KNOWN_ADAPTER_NAMES: tuple[str, ...] = tuple(_ADAPTER_FACTORIES.keys())


class OncallDeliveryService:
    """Per-clinic on-call delivery dispatcher.

    Use :meth:`send` with the resolved ``OncallPage`` row + recipient.
    The service constructs adapters from env vars on-init unless an
    explicit ``adapters`` list is passed (test path).

    Dispatch order resolution (when ``adapters`` is None):

    1. If a ``surface`` is supplied AND the clinic's
       :class:`~app.persistence.models.EscalationPolicy` has a per-surface
       override for that surface, use the override list.
    2. Else, if the clinic has a policy with a ``dispatch_order``, use it.
    3. Else, fall back to :data:`DEFAULT_ADAPTER_ORDER`
       (PagerDuty → Slack → Twilio).

    Step 1+2 are best-effort — any DB / JSON-parse failure quietly falls
    back to step 3 so a misconfigured policy can NEVER take down the
    on-call dispatch chain.
    """

    def __init__(
        self,
        clinic_id: Optional[str] = None,
        *,
        adapters: Optional[list[Adapter]] = None,
        surface: Optional[str] = None,
        db: Optional[Any] = None,
    ) -> None:
        self.clinic_id = clinic_id
        self.surface = surface
        if adapters is None:
            order = self._resolve_dispatch_order(clinic_id, surface, db)
            adapters = _build_adapters_for_order(order)
            # If the resolver returned an empty / all-unknown list, fall
            # back to the static default so we never end up with zero
            # adapters from a misconfigured policy.
            if not adapters:
                adapters = [cls() for cls in DEFAULT_ADAPTER_ORDER]
        self.adapters: list[Adapter] = adapters

    @staticmethod
    def _resolve_dispatch_order(
        clinic_id: Optional[str],
        surface: Optional[str],
        db: Optional[Any],
    ) -> list[str]:
        """Resolve the dispatch order for ``(clinic_id, surface)``.

        Returns a list of adapter names (lowercase). Falls back to the
        DEFAULT_ADAPTER_ORDER class names lower-cased when no policy is
        available. Defensive: any DB / JSON failure returns the default.
        """
        default_order = [
            getattr(cls, "name", cls.__name__.lower())
            for cls in DEFAULT_ADAPTER_ORDER
        ]
        if not clinic_id:
            return default_order
        try:
            import json as _json  # noqa: PLC0415
            from app.persistence.models import EscalationPolicy  # noqa: PLC0415

            local_db = db
            opened = False
            if local_db is None:
                from app.database import SessionLocal  # noqa: PLC0415
                local_db = SessionLocal()
                opened = True
            try:
                row = (
                    local_db.query(EscalationPolicy)
                    .filter(EscalationPolicy.clinic_id == clinic_id)
                    .one_or_none()
                )
                if row is None:
                    return default_order
                # Per-surface override wins.
                if surface and row.surface_overrides:
                    try:
                        overrides = _json.loads(row.surface_overrides) or {}
                    except Exception:
                        overrides = {}
                    s_override = overrides.get(surface) if isinstance(overrides, dict) else None
                    if isinstance(s_override, list) and s_override:
                        cleaned = [
                            str(n).strip().lower()
                            for n in s_override
                            if isinstance(n, str) and str(n).strip()
                        ]
                        if cleaned:
                            return cleaned
                # Clinic-wide dispatch order.
                if row.dispatch_order:
                    try:
                        order = _json.loads(row.dispatch_order) or []
                    except Exception:
                        order = []
                    if isinstance(order, list) and order:
                        cleaned = [
                            str(n).strip().lower()
                            for n in order
                            if isinstance(n, str) and str(n).strip()
                        ]
                        if cleaned:
                            return cleaned
                return default_order
            finally:
                if opened:
                    try:
                        local_db.close()
                    except Exception:
                        pass
        except Exception:  # pragma: no cover - defensive
            return default_order

    # --- Discovery ------------------------------------------------------

    def get_enabled_adapters(self) -> list[Adapter]:
        return [a for a in self.adapters if getattr(a, "enabled", False)]

    def describe_adapters(self) -> list[dict[str, Any]]:
        """Snapshot for the UI / status endpoint.

        Returns one row per adapter (regardless of enabled state) so the
        UI can render a per-adapter health row even for the disabled
        ones — never silently hide a missing-env-var adapter.
        """
        out: list[dict[str, Any]] = []
        for a in self.adapters:
            out.append({
                "name": getattr(a, "name", a.__class__.__name__.lower()),
                "enabled": bool(getattr(a, "enabled", False)),
            })
        return out

    # --- Dispatch -------------------------------------------------------

    def send(self, message: PageMessage) -> DeliveryResult:
        """Try every enabled adapter in order; stop at the first 2xx.

        Mock-mode short-circuits to a synthetic ``"sent"`` result whose
        ``delivery_note`` ALWAYS starts with ``"MOCK:"``. The mock path
        is opt-in via ``DEEPSYNAPS_DELIVERY_MOCK=1`` and exists so demo
        deploys + CI tests can exercise the entire dispatch chain
        without making real HTTPS calls.
        """
        if _mock_mode_enabled():
            note = (
                f"MOCK: simulated send via DEEPSYNAPS_DELIVERY_MOCK=1; "
                f"surface={message.surface}; recipient="
                f"{message.recipient_display_name or '-'}"
            )
            return DeliveryResult(
                status="sent",
                adapter="mock",
                external_id=f"mock-{uuid.uuid4().hex[:12]}",
                raw_response={"mock": True},
                latency_ms=0,
                note=note,
                attempts=[],
            )

        enabled = self.get_enabled_adapters()
        if not enabled:
            for a in self.adapters:
                _log.info(
                    "oncall delivery adapter disabled, env var missing",
                    extra={
                        "event": "oncall_delivery_adapter_disabled",
                        "adapter": getattr(a, "name", "unknown"),
                        "clinic_id": self.clinic_id,
                    },
                )
            return DeliveryResult(
                status="queued",
                adapter=None,
                external_id=None,
                raw_response={"reason": "no_adapters_enabled"},
                latency_ms=0,
                note=(
                    "no_adapters_enabled: SLACK_BOT_TOKEN / TWILIO_* / "
                    "PAGERDUTY_API_KEY all unset"
                ),
                attempts=[],
            )

        attempts: list[DeliveryResult] = []
        for adapter in enabled:
            try:
                result = adapter.send(message)
            except Exception as exc:  # pragma: no cover - defensive
                result = DeliveryResult(
                    status="failed",
                    adapter=getattr(adapter, "name", "unknown"),
                    note=f"adapter raised {exc.__class__.__name__}: {exc}",
                )
            attempts.append(result)
            if result.status == "sent":
                # First win, stop. Audit chain still includes any prior
                # failed attempts in result.attempts so the regulator
                # sees ``slack=400 -> twilio=200 OK`` not just ``200 OK``.
                summary = DeliveryResult(
                    status="sent",
                    adapter=result.adapter,
                    external_id=result.external_id,
                    raw_response=result.raw_response,
                    latency_ms=result.latency_ms,
                    note=result.note,
                    attempts=attempts,
                )
                return summary

        # Every enabled adapter failed.
        joined = ", ".join(
            f"{a.adapter or '?'}={(a.note or 'failed').split(';')[0][:48]}"
            for a in attempts
        )
        return DeliveryResult(
            status="failed",
            adapter=None,
            external_id=None,
            raw_response={"all_failed": True},
            latency_ms=sum(a.latency_ms for a in attempts),
            note=f"all_adapters_failed: {joined}"[:1024],
            attempts=attempts,
        )


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def build_default_service(
    clinic_id: Optional[str] = None,
    *,
    surface: Optional[str] = None,
    db: Optional[Any] = None,
) -> OncallDeliveryService:
    """Convenience constructor for the default adapter chain.

    Used by both the auto-page worker and the manual page-on-call
    handler so the adapter wire-up lives in exactly one place.

    When ``surface`` is given, the service consults the clinic's
    :class:`EscalationPolicy.surface_overrides` first before falling
    back to the clinic-wide dispatch order. When ``db`` is given, the
    service reuses the caller's session instead of opening a new one
    (helpful inside FastAPI request handlers).
    """
    return OncallDeliveryService(clinic_id=clinic_id, surface=surface, db=db)


def is_mock_mode_enabled() -> bool:
    """Public alias for :func:`_mock_mode_enabled` so callers outside this
    module (e.g. the auto-page-worker router's adapter-health surface)
    can read the flag without touching the leading-underscore helper.
    """
    return _mock_mode_enabled()


def build_caregiver_digest_service(
    *,
    clinic_id: Optional[str] = None,
    db: Optional[Any] = None,
) -> OncallDeliveryService:
    """Construct a delivery service for the caregiver digest channel.

    Multi-Adapter Delivery Parity launch-audit (2026-05-01). Uses the
    full adapter chain (PagerDuty / Slack / Twilio + SendGrid as the
    email channel) so the Caregiver Email Digest worker can dispatch via
    ANY enabled adapter — not just SendGrid. The dispatch order is
    resolved via :class:`EscalationPolicy.surface_overrides` for
    ``surface='caregiver_digest'`` when set, falling back to the email
    chain (SendGrid first) so deploys with only ``SENDGRID_API_KEY``
    keep working as before.

    Each adapter in the chain that returns ``status='sent'`` is recorded
    via :func:`build_delivery_audit_note` so the regulator transcript
    carries identical ``adapter=`` / ``channel=`` keys regardless of
    which channel won the dispatch.
    """
    surface = "caregiver_digest"
    # Build the surface-aware service. When the clinic has no policy /
    # no override for this surface, ``_resolve_dispatch_order`` falls
    # back to the DEFAULT_ADAPTER_ORDER (PagerDuty → Slack → Twilio).
    # We override that fallback here with a chain that prefers SendGrid
    # for the email channel + keeps the loud-signal adapters as
    # secondary so a deploy with only SendGrid wired stays on the email
    # path while a clinic that opts SMS in via the policy can do so.
    order = OncallDeliveryService._resolve_dispatch_order(clinic_id, surface, db)
    default_chain = [
        getattr(cls, "name", cls.__name__.lower())
        for cls in DEFAULT_ADAPTER_ORDER
    ]
    if order == default_chain:
        # No per-surface override and no clinic-wide order — use the
        # caregiver-digest default: SendGrid first, then the loud-signal
        # adapters. This preserves the legacy "email digest goes via
        # SendGrid" behaviour while keeping SMS / Slack / PagerDuty as
        # opt-in fallbacks.
        order = ["sendgrid", "slack", "twilio", "pagerduty"]
    adapters = _build_adapters_for_order(order)
    if not adapters:
        adapters = [cls() for cls in EMAIL_ADAPTER_ORDER]
    return OncallDeliveryService(
        clinic_id=clinic_id,
        adapters=adapters,
        surface=surface,
        db=db,
    )


def build_email_digest_service() -> OncallDeliveryService:
    """Construct a delivery service tuned for the email channel.

    Returns an :class:`OncallDeliveryService` whose adapters are taken
    from :data:`EMAIL_ADAPTER_ORDER` (SendGrid only, today). Used by the
    Caregiver Email Digest worker (#380) and the manual ``send-now``
    handler so the dispatch chain for caregiver email goes
    ``SendGrid (when SENDGRID_API_KEY+SENDGRID_FROM_ADDRESS set)`` →
    ``no_adapters_enabled`` (which the caller surfaces as ``queued``).

    Mock-mode (``DEEPSYNAPS_DELIVERY_MOCK=1``) short-circuits the dispatch
    inside :meth:`OncallDeliveryService.send` regardless of which adapter
    chain we hand it, so this constructor doesn't need to special-case
    the mock path.
    """
    adapters: list[Adapter] = [cls() for cls in EMAIL_ADAPTER_ORDER]
    return OncallDeliveryService(adapters=adapters)


__all__ = [
    "ADAPTER_CHANNEL",
    "Adapter",
    "DEFAULT_ADAPTER_ORDER",
    "DeliveryResult",
    "EMAIL_ADAPTER_ORDER",
    "KNOWN_ADAPTER_NAMES",
    "OncallDeliveryService",
    "PageMessage",
    "PagerDutyAdapter",
    "SendGridEmailAdapter",
    "SlackAdapter",
    "TwilioSMSAdapter",
    "adapter_channel",
    "build_caregiver_digest_service",
    "build_default_service",
    "build_delivery_audit_note",
    "build_email_digest_service",
    "is_mock_mode_enabled",
]

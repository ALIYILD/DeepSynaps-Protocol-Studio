"""Agent SKU subscription helpers — TEST-MODE-ONLY in this PR.

This module wires the in-process Agent Marketplace registry
(``app.services.agents.registry.AGENT_REGISTRY``) to per-clinic Stripe
Subscriptions. It is intentionally additive: it does NOT replace the
existing one-off ``stripe_service.py`` flow used by the package tiers
(Resident / Clinician Pro / Clinic Team), and it shares no global Stripe
state with that module beyond the SDK client itself.

Safety guardrails (do not remove without CEO sign-off)
======================================================
* This is **TEST MODE ONLY** in the PR that lands first.
* Live cutover requires explicit operator action: rotate
  ``STRIPE_SECRET_KEY`` to a ``sk_live_*`` key AND set
  ``STRIPE_LIVE_MODE_ACK=1`` in the environment. This module REFUSES to
  hand out a Stripe client when a live key is configured without that
  acknowledgement — that's intentional belt-and-braces. See
  :func:`_get_client`.
* Hard-coded ``sk_test_*`` keys in tests are fine. Hard-coded
  ``sk_live_*`` keys anywhere in the repo are NOT fine.

Webhook events handled
======================
* ``checkout.session.completed`` → mark row ``active`` + stamp ``started_at``.
* ``customer.subscription.deleted`` → mark row ``canceled`` + stamp
  ``canceled_at``.
* ``customer.subscription.updated`` (status=past_due) → mark row ``past_due``.

Idempotency
-----------
Webhook dedupe is now DB-backed via :class:`StripeWebhookEvent` (Phase 7,
migration 051). The handler INSERTs a row keyed on the Stripe ``event.id``
inside a try/except IntegrityError; on collision the event is treated as
a redelivery and the handler short-circuits without re-applying the
update. The previous in-memory ``deque`` is preserved as
``_reset_dedupe_for_tests`` for backward compatibility but no longer
gates real traffic — multi-process / blue-green deploys could double-apply
otherwise.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from threading import Lock
from typing import TYPE_CHECKING, Any

import stripe
from sqlalchemy.exc import IntegrityError

from app.persistence.models import AgentSubscription, StripeWebhookEvent, User
from app.services.agents.registry import AGENT_REGISTRY

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Live-key guardrail
# ---------------------------------------------------------------------------

_CLIENT_LOCK = Lock()
_CLIENT_INITIALIZED = False
_CLIENT_KEY_FINGERPRINT: str | None = None


def _reset_client_cache_for_tests() -> None:
    """Test helper — reset the memoization. Production code never calls this."""
    global _CLIENT_INITIALIZED, _CLIENT_KEY_FINGERPRINT
    with _CLIENT_LOCK:
        _CLIENT_INITIALIZED = False
        _CLIENT_KEY_FINGERPRINT = None


def _get_client():
    """Return the configured Stripe SDK module, refusing live keys without ack.

    The Stripe Python SDK is module-level (``stripe.api_key = ...``) rather
    than instance-based; we still wrap it in a function so callers go
    through the live-mode guardrail every time and so the memoization is
    explicit.

    Raises
    ------
    RuntimeError
        If ``STRIPE_SECRET_KEY`` is missing, or if it begins with
        ``sk_live_`` without ``STRIPE_LIVE_MODE_ACK=1`` being set.
    """
    global _CLIENT_INITIALIZED, _CLIENT_KEY_FINGERPRINT

    secret = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not secret:
        raise RuntimeError(
            "STRIPE_SECRET_KEY is not configured — refusing to call Stripe."
        )

    if secret.startswith("sk_live_"):
        ack = os.environ.get("STRIPE_LIVE_MODE_ACK", "").strip()
        if ack != "1":
            # Belt-and-braces: even if an operator accidentally rotates to
            # a live key, we refuse to start until they explicitly tick the
            # acknowledgement env var. This protects against accidental
            # billing in the agent-SKU flow before the live cutover plan
            # has been signed off.
            raise RuntimeError(
                "live key without explicit ack — set STRIPE_LIVE_MODE_ACK=1 "
                "to opt into live billing for the agent SKU flow"
            )

    # Memoize: only re-assign stripe.api_key if the key fingerprint changed.
    # Fingerprint = last 6 chars; never log the raw secret.
    fingerprint = secret[-6:]
    with _CLIENT_LOCK:
        if not _CLIENT_INITIALIZED or _CLIENT_KEY_FINGERPRINT != fingerprint:
            stripe.api_key = secret
            _CLIENT_KEY_FINGERPRINT = fingerprint
            _CLIENT_INITIALIZED = True
            logger.info(
                "stripe_skus client initialised (mode=%s, key_fp=…%s)",
                "live" if secret.startswith("sk_live_") else "test",
                fingerprint,
            )
    return stripe


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _lookup_key_for_agent(agent_id: str) -> str:
    """Stable Stripe Price lookup_key. Lets us reuse a Price across runs."""
    return f"agent_sku:{agent_id}"


def _find_or_create_customer(
    *, db: "Session", clinic_id: str
) -> str:
    """Find a Stripe Customer for ``clinic_id``, creating one if missing.

    Search strategy:
    1. Reuse the ``stripe_customer_id`` off any existing AgentSubscription
       row for the clinic — guarantees we never duplicate customers when a
       clinic adds a second agent.
    2. Otherwise call ``stripe.Customer.search`` with ``metadata.clinic_id``
       (the canonical link).
    3. Otherwise create a new Customer with the first admin user's email
       (or no email if the clinic has no admin yet — Stripe permits this).
    """
    sdk = _get_client()

    # (1) Cheapest path: another AgentSubscription row already knows the id.
    existing = (
        db.query(AgentSubscription)
        .filter(AgentSubscription.clinic_id == clinic_id)
        .filter(AgentSubscription.stripe_customer_id.isnot(None))
        .first()
    )
    if existing and existing.stripe_customer_id:
        return existing.stripe_customer_id

    # (2) Search by metadata. We swallow any SDK-level exception and fall
    # through to creating a fresh customer — the search API can be flaky
    # (eventual consistency) and over-creating is recoverable, while
    # blocking checkout on a transient search 500 isn't.
    try:
        result = sdk.Customer.search(
            query=f'metadata["clinic_id"]:"{clinic_id}"',
            limit=1,
        )
        # ``result`` is either a Stripe ListObject (.data) or a dict
        # depending on the test mock; handle both.
        data = getattr(result, "data", None)
        if data is None and isinstance(result, dict):
            data = result.get("data") or []
        if data:
            customer_id = data[0]["id"] if isinstance(data[0], dict) else data[0].id
            return customer_id
    except Exception as exc:  # pragma: no cover — defensive
        logger.warning(
            "Stripe Customer.search failed for clinic=%s: %s; creating a fresh one",
            clinic_id, exc,
        )

    # (3) Create. Use first admin's email when available — it's only used
    # for receipts, so a missing email is non-fatal.
    admin = (
        db.query(User)
        .filter(User.clinic_id == clinic_id, User.role == "admin")
        .order_by(User.created_at.asc())
        .first()
    )
    create_kwargs: dict[str, Any] = {
        "metadata": {
            "clinic_id": clinic_id,
            "schema": "deepsynaps.agent_sku/v1",
        },
    }
    if admin and admin.email:
        create_kwargs["email"] = admin.email

    customer = sdk.Customer.create(**create_kwargs)
    return customer["id"] if isinstance(customer, dict) else customer.id


def _find_or_create_price(*, agent_id: str, monthly_price_gbp: int) -> str:
    """Find an existing Price by lookup_key, otherwise mint a new one."""
    sdk = _get_client()
    lookup_key = _lookup_key_for_agent(agent_id)

    # Try to reuse an existing Price keyed on our agent_id.
    try:
        result = sdk.Price.list(lookup_keys=[lookup_key], limit=1, active=True)
        data = getattr(result, "data", None)
        if data is None and isinstance(result, dict):
            data = result.get("data") or []
        if data:
            price = data[0]
            return price["id"] if isinstance(price, dict) else price.id
    except Exception as exc:  # pragma: no cover — defensive
        logger.warning(
            "Stripe Price.list failed for lookup_key=%s: %s; creating a fresh one",
            lookup_key, exc,
        )

    price = sdk.Price.create(
        unit_amount=monthly_price_gbp * 100,  # GBP → pence
        currency="gbp",
        recurring={"interval": "month"},
        product_data={"name": f"DeepSynaps Agent — {agent_id}"},
        lookup_key=lookup_key,
        metadata={
            "agent_id": agent_id,
            "schema": "deepsynaps.agent_sku/v1",
        },
    )
    return price["id"] if isinstance(price, dict) else price.id


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_checkout_session(
    *,
    db: "Session",
    actor: "AuthenticatedActor",
    agent_id: str,
    success_url: str,
    cancel_url: str,
) -> dict:
    """Start a Stripe Checkout session for a clinic to subscribe to an agent.

    Returns
    -------
    dict
        ``{ok: True, checkout_url, session_id, agent_id, monthly_price_gbp}``
        on success, or ``{ok: False, reason, ...}`` on a refusal that we
        want the UI to render gracefully (e.g. already subscribed). Hard
        errors (unknown agent, missing clinic) bubble up as
        :class:`app.errors.ApiServiceError` from the router layer.
    """
    from app.errors import ApiServiceError

    agent = AGENT_REGISTRY.get(agent_id)
    if agent is None:
        raise ApiServiceError(
            code="agent_not_found",
            message=f"Unknown agent id: {agent_id}",
            warnings=[],
            status_code=404,
        )

    if agent.audience == "patient":
        return {
            "ok": False,
            "reason": "patient_agents_not_yet_activated",
            "message": (
                "Patient-side agents are pending clinical sign-off and cannot "
                "be subscribed to yet."
            ),
        }

    if agent.monthly_price_gbp <= 0:
        return {
            "ok": False,
            "reason": "free_agent",
            "message": "This agent is free — nothing to bill.",
        }

    if actor.clinic_id is None:
        return {
            "ok": False,
            "reason": "no_clinic",
            "message": (
                "Subscribing requires the actor to belong to a clinic. Ask "
                "your DeepSynaps admin to attach you to a clinic first."
            ),
        }

    # Already-subscribed short-circuit. We return ok=False with a stable
    # reason string so the UI can render an "already active" tile rather
    # than firing duplicate Stripe Checkout sessions.
    existing_active = (
        db.query(AgentSubscription)
        .filter(AgentSubscription.clinic_id == actor.clinic_id)
        .filter(AgentSubscription.agent_id == agent_id)
        .filter(AgentSubscription.status == "active")
        .first()
    )
    if existing_active is not None:
        return {
            "ok": False,
            "reason": "already_subscribed",
            "subscription_id": existing_active.stripe_subscription_id,
        }

    sdk = _get_client()

    customer_id = _find_or_create_customer(db=db, clinic_id=actor.clinic_id)
    price_id = _find_or_create_price(
        agent_id=agent_id, monthly_price_gbp=agent.monthly_price_gbp
    )

    session = sdk.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        customer=customer_id,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "clinic_id": actor.clinic_id,
            "agent_id": agent_id,
            "schema": "deepsynaps.checkout/v1",
        },
    )

    session_id = session["id"] if isinstance(session, dict) else session.id
    checkout_url = session["url"] if isinstance(session, dict) else session.url

    # Reuse an existing test_pending row for this (clinic, agent) pair if
    # one exists — the unique constraint would otherwise reject a second
    # checkout attempt after a cancelled session.
    pending = (
        db.query(AgentSubscription)
        .filter(AgentSubscription.clinic_id == actor.clinic_id)
        .filter(AgentSubscription.agent_id == agent_id)
        .first()
    )
    if pending is None:
        pending = AgentSubscription(
            clinic_id=actor.clinic_id,
            agent_id=agent_id,
            stripe_customer_id=customer_id,
            stripe_price_id=price_id,
            status="test_pending",
            monthly_price_gbp=agent.monthly_price_gbp,
        )
        db.add(pending)
    else:
        pending.stripe_customer_id = customer_id
        pending.stripe_price_id = price_id
        pending.monthly_price_gbp = agent.monthly_price_gbp
        # If a previous attempt was canceled, allow restart by going back
        # to test_pending. Active rows have already been short-circuited
        # above, so this branch is safe.
        if pending.status not in ("active", "past_due"):
            pending.status = "test_pending"
        pending.updated_at = _now()
    db.commit()

    return {
        "ok": True,
        "checkout_url": checkout_url,
        "session_id": session_id,
        "agent_id": agent_id,
        "monthly_price_gbp": agent.monthly_price_gbp,
    }


# ---------------------------------------------------------------------------
# Webhook handling
# ---------------------------------------------------------------------------

def _try_claim_event(*, db: "Session", event_id: str, event_type: str) -> bool:
    """Insert a :class:`StripeWebhookEvent` row, returning True if NEW.

    Phase 7 — DB-backed dedupe. Race-safe across processes because the
    primary key constraint on ``event_id`` means at most one process can
    successfully INSERT for a given event id; everyone else gets an
    :class:`sqlalchemy.exc.IntegrityError` and reports the event as a
    duplicate.

    The row is committed up-front (before ``_apply_webhook`` runs) so
    that a crash mid-apply still leaves the dedupe row in place — the
    redelivery will be flagged as a duplicate, which is the conservative
    default for billing-adjacent code. Operators can manually delete a
    row to force a re-apply if needed.
    """
    if not event_id:
        return True  # No id to dedupe on — let the caller proceed.
    row = StripeWebhookEvent(
        id=event_id,
        event_type=event_type or "",
        processed=True,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    return True


def _reset_dedupe_for_tests() -> None:
    """Test helper — no-op now that dedupe is DB-backed (the test harness
    truncates the ``stripe_webhook_event`` table via reset_database()).

    Kept as a stable symbol so existing fixtures that call it don't
    break — see ``tests/test_stripe_skus.py::_reset_skus_state``.
    """
    return None


def handle_subscription_webhook(payload: bytes | str | dict, signature: str) -> dict:
    """Process a Stripe webhook for the agent-SKU subscription flow.

    Parameters
    ----------
    payload
        Raw request body as ``bytes`` (preferred — Stripe signatures are
        computed over the raw bytes), or ``str`` / pre-parsed ``dict`` for
        test convenience.
    signature
        Value of the ``Stripe-Signature`` header.

    Returns
    -------
    dict
        ``{ok: bool, event_type: str, applied: bool}``. ``applied`` is False
        when the event is a duplicate or carries data we don't recognize.
        ``ok`` is False only on signature failure or fatal parse errors.
    """
    sdk = _get_client()
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        return {"ok": False, "event_type": "", "applied": False, "reason": "no_secret"}

    # ``construct_event`` expects bytes in production; accept str / dict for
    # test convenience but never fall through silently.
    try:
        if isinstance(payload, dict):
            # Tests sometimes pass a pre-built event dict; we still honour
            # signature verification by routing through ``construct_event``
            # only when payload is bytes/str. For dict payloads we trust
            # the test author and skip verification.
            event: Any = payload
        else:
            raw = payload.encode("utf-8") if isinstance(payload, str) else payload
            event = sdk.Webhook.construct_event(raw, signature, secret)
    except stripe.error.SignatureVerificationError:
        logger.warning("agent-SKU webhook: signature verification failed")
        return {
            "ok": False,
            "event_type": "",
            "applied": False,
            "reason": "invalid_signature",
        }
    except Exception as exc:
        logger.warning("agent-SKU webhook: parse error: %s", exc)
        return {"ok": False, "event_type": "", "applied": False, "reason": "parse_error"}

    event_id = event.get("id", "") if isinstance(event, dict) else getattr(event, "id", "")
    event_type = (
        event.get("type", "") if isinstance(event, dict) else getattr(event, "type", "")
    )

    data_obj = (
        event["data"]["object"]
        if isinstance(event, dict)
        else event["data"]["object"]
    )

    # Open a fresh DB session — webhooks aren't bound to a request scope.
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Phase 7 — DB-backed dedupe. Try to claim the event id before
        # touching anything; on duplicate, return early without mutating
        # any agent_subscriptions row.
        if event_id and not _try_claim_event(
            db=db, event_id=event_id, event_type=event_type
        ):
            return {
                "ok": True,
                "event_type": event_type,
                "applied": False,
                "reason": "duplicate",
            }

        applied = _apply_webhook(db=db, event_type=event_type, data_obj=data_obj)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("agent-SKU webhook apply failed: %s", exc)
        return {
            "ok": False,
            "event_type": event_type,
            "applied": False,
            "reason": "apply_error",
        }
    finally:
        db.close()

    return {"ok": True, "event_type": event_type, "applied": applied}


def _apply_webhook(*, db: "Session", event_type: str, data_obj: dict) -> bool:
    """Mutate the AgentSubscription row implied by the event. Returns True
    if a row was updated."""
    if event_type == "checkout.session.completed":
        clinic_id = (data_obj.get("metadata") or {}).get("clinic_id")
        agent_id = (data_obj.get("metadata") or {}).get("agent_id")
        stripe_subscription_id = data_obj.get("subscription")
        stripe_customer_id = data_obj.get("customer")

        if not (clinic_id and agent_id):
            return False

        row = (
            db.query(AgentSubscription)
            .filter(AgentSubscription.clinic_id == clinic_id)
            .filter(AgentSubscription.agent_id == agent_id)
            .first()
        )
        if row is None:
            return False
        row.status = "active"
        row.started_at = _now()
        row.updated_at = _now()
        if stripe_subscription_id:
            row.stripe_subscription_id = stripe_subscription_id
        if stripe_customer_id:
            row.stripe_customer_id = stripe_customer_id
        return True

    if event_type == "customer.subscription.deleted":
        sub_id = data_obj.get("id")
        if not sub_id:
            return False
        row = (
            db.query(AgentSubscription)
            .filter(AgentSubscription.stripe_subscription_id == sub_id)
            .first()
        )
        if row is None:
            return False
        row.status = "canceled"
        row.canceled_at = _now()
        row.updated_at = _now()
        return True

    if event_type == "customer.subscription.updated":
        sub_id = data_obj.get("id")
        new_status = data_obj.get("status")
        if not sub_id:
            return False
        row = (
            db.query(AgentSubscription)
            .filter(AgentSubscription.stripe_subscription_id == sub_id)
            .first()
        )
        if row is None:
            return False
        if new_status == "past_due":
            row.status = "past_due"
            row.updated_at = _now()
            return True
        if new_status == "canceled":
            row.status = "canceled"
            row.canceled_at = _now()
            row.updated_at = _now()
            return True
        if new_status == "active":
            row.status = "active"
            row.updated_at = _now()
            return True
        return False

    return False


# ---------------------------------------------------------------------------
# Read-only listing
# ---------------------------------------------------------------------------


def list_clinic_subscriptions(*, db: "Session", clinic_id: str) -> list[dict]:
    """Return all AgentSubscription rows for a clinic as plain dicts."""
    if not clinic_id:
        return []
    rows = (
        db.query(AgentSubscription)
        .filter(AgentSubscription.clinic_id == clinic_id)
        .order_by(AgentSubscription.created_at.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "clinic_id": r.clinic_id,
            "agent_id": r.agent_id,
            "status": r.status,
            "monthly_price_gbp": r.monthly_price_gbp,
            "stripe_subscription_id": r.stripe_subscription_id,
            "stripe_price_id": r.stripe_price_id,
            "stripe_customer_id": r.stripe_customer_id,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "canceled_at": r.canceled_at.isoformat() if r.canceled_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


__all__ = [
    "create_checkout_session",
    "handle_subscription_webhook",
    "list_clinic_subscriptions",
]

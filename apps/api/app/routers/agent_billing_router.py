"""Agent Marketplace billing endpoints — Stripe SKU subscriptions.

Endpoints:
* ``POST /api/v1/agent-billing/checkout/{agent_id}`` — clinic admin starts
  a Stripe Checkout session for an agent SKU. Inserts an AgentSubscription
  row in ``test_pending`` state.
* ``GET  /api/v1/agent-billing/subscriptions``       — list the actor's
  clinic's subscriptions (read-only).
* ``POST /api/v1/agent-billing/webhook``              — Stripe webhook
  handler, no JWT auth (verified via ``Stripe-Signature`` header).

All Stripe-touching code lives in :mod:`app.services.stripe_skus`. This
router is intentionally thin so the live-mode guardrail and the dedupe
cache stay in one place.

Safety
------
The underlying service refuses to start with a ``sk_live_*`` key unless
``STRIPE_LIVE_MODE_ACK=1`` is also set. Tests use ``sk_test_*`` keys
seeded via monkeypatch — never hard-code a real key here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import StripeWebhookEvent
from app.services import stripe_skus

router = APIRouter(prefix="/api/v1/agent-billing", tags=["agent-billing"])


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CheckoutRequest(BaseModel):
    success_url: str = Field(
        ...,
        description="URL Stripe redirects to after a successful subscription.",
        min_length=1,
        max_length=2048,
    )
    cancel_url: str = Field(
        ...,
        description="URL Stripe redirects to if the user cancels checkout.",
        min_length=1,
        max_length=2048,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/checkout/{agent_id}")
@limiter.limit("10/minute")
def create_checkout(
    request: Request,
    agent_id: str,
    payload: CheckoutRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Start a Stripe Checkout session for an agent SKU.

    Only clinic admins may subscribe. The endpoint is rate-limited to
    10/minute/IP to deter accidental Checkout-spam loops from the UI.
    """
    require_minimum_role(actor, "admin")

    return stripe_skus.create_checkout_session(
        db=db,
        actor=actor,
        agent_id=agent_id,
        success_url=payload.success_url,
        cancel_url=payload.cancel_url,
    )


class BillingPortalRequest(BaseModel):
    return_url: str = Field(
        ...,
        description=(
            "URL Stripe redirects the user back to after they exit the "
            "Customer Portal. Must be an https:// URL."
        ),
        min_length=1,
        max_length=2048,
    )


@router.post("/portal")
@limiter.limit("10/minute")
def create_billing_portal(
    request: Request,
    payload: BillingPortalRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Create a Stripe Customer Portal session for the actor's clinic.

    Mirrors the role gate of ``/checkout/{agent_id}`` — clinic admins (and
    super-admins) only. The portal lets paying clinics self-serve cancellations,
    card updates, and invoice downloads without contacting support.

    Status mapping
    --------------
    * 400 — ``return_url`` does not start with ``https://``.
    * 403 — actor is not at least an admin (``require_minimum_role`` raises).
    * 404 — the clinic has no Stripe customer yet (no prior subscription).
    * 503 — the Stripe SDK raised a non-validation error (e.g. API outage).
    * 200 — ``{"url": "https://billing.stripe.com/..."}``.
    """
    require_minimum_role(actor, "admin")

    if not payload.return_url.startswith("https://"):
        raise ApiServiceError(
            code="invalid_return_url",
            message="return_url must be an https:// URL.",
            status_code=400,
        )

    if actor.clinic_id is None:
        # Clinic-less admins (super-admins) can't have a portal session
        # because the portal is keyed on the clinic's existing customer.
        raise ApiServiceError(
            code="no_stripe_customer",
            message="No Stripe customer found — start a subscription first.",
            status_code=404,
        )

    try:
        return stripe_skus.create_billing_portal_session(
            db=db,
            clinic_id=actor.clinic_id,
            return_url=payload.return_url,
        )
    except ValueError as exc:
        if str(exc) == "no_stripe_customer":
            raise ApiServiceError(
                code="no_stripe_customer",
                message="No Stripe customer found — start a subscription first.",
                status_code=404,
            ) from exc
        # Any other ValueError is a programming error — surface as 503 so the
        # UI can render a safe envelope without leaking internals.
        raise ApiServiceError(
            code="billing_portal_unavailable",
            message="Billing portal is temporarily unavailable. Please try again.",
            status_code=503,
        ) from exc
    except ApiServiceError:
        raise
    except Exception as exc:  # pragma: no cover — Stripe SDK / network failures
        import logging

        logging.getLogger(__name__).warning(
            "billing_portal_session_create failed for clinic=%s: %s: %s",
            actor.clinic_id,
            type(exc).__name__,
            exc,
        )
        raise ApiServiceError(
            code="billing_portal_unavailable",
            message="Billing portal is temporarily unavailable. Please try again.",
            status_code=503,
        ) from exc


@router.get("/subscriptions")
def list_subscriptions(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """List the actor's clinic's agent subscriptions (clinician+ visibility)."""
    require_minimum_role(actor, "clinician")

    if actor.clinic_id is None:
        # An authenticated clinician without a clinic gets an empty list
        # rather than a 400 — UI can render an empty-state without
        # special-casing the error path.
        return {"subscriptions": []}

    return {
        "subscriptions": stripe_skus.list_clinic_subscriptions(
            db=db, clinic_id=actor.clinic_id
        )
    }


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="stripe-signature"),
):
    """Receive Stripe webhook events for the agent SKU flow.

    No JWT auth — verification is via the ``Stripe-Signature`` header
    inside :func:`app.services.stripe_skus.handle_subscription_webhook`.
    The handler always returns 200 with a JSON envelope, including on
    signature failure, so Stripe doesn't retry forever at their layer.
    Operational alerts are emitted via the logger.
    """
    body = await request.body()
    return stripe_skus.handle_subscription_webhook(body, stripe_signature)


# ---------------------------------------------------------------------------
# Admin webhook replay (Phase 10)
# ---------------------------------------------------------------------------


class WebhookReplayRequest(BaseModel):
    event_id: str = Field(
        ...,
        description="Stripe event id to re-fetch and replay (must start with 'evt_').",
        min_length=5,
        max_length=255,
    )


def _require_super_admin(actor: AuthenticatedActor) -> None:
    """Mirror the gate from :mod:`app.routers.agent_admin_router` — admin
    AND ``actor.clinic_id is None``. Clinic-bound admins are rejected so
    cross-tenant ops surfaces stay opt-in.
    """
    require_minimum_role(actor, "admin")
    if actor.clinic_id is not None:
        raise ApiServiceError(
            code="ops_admin_required",
            message="Cross-clinic ops requires a super-admin actor.",
            warnings=["This endpoint is reserved for platform operators."],
            status_code=403,
        )


@router.post("/admin/webhook-replay")
@limiter.limit("6/minute")
def admin_webhook_replay(
    request: Request,
    payload: WebhookReplayRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Re-fetch and re-process a stored Stripe webhook event id.

    Super-admin only. Phase 7 stores only the event id + type (not the
    payload), so the service layer re-fetches the canonical event from
    Stripe via :func:`stripe.Event.retrieve` and re-runs the apply step
    against it. Useful when a handler bug left a customer stuck on
    ``test_pending`` after their checkout actually completed.

    Status mapping
    --------------
    * 400 — ``event_id`` does not start with ``evt_``.
    * 403 — actor is not a super-admin.
    * 404 — Stripe says no such event (e.g. typo or past 30-day retention).
    * 200 — replay completed; envelope contains ``ok`` flag and either a
      ``result`` dict or an ``error`` string.
    """
    _require_super_admin(actor)

    if not payload.event_id.startswith("evt_"):
        raise ApiServiceError(
            code="invalid_event_id",
            message="event_id must start with 'evt_'.",
            status_code=400,
        )

    result = stripe_skus.replay_webhook_event(db=db, event_id=payload.event_id)

    if not result.get("ok") and result.get("error") == "not_found":
        raise ApiServiceError(
            code="event_not_found",
            message=f"Stripe has no event with id {payload.event_id}.",
            status_code=404,
            details={"event_id": payload.event_id},
        )

    return result


# ---------------------------------------------------------------------------
# Phase 13 — Admin browser for the stripe_webhook_event table
# ---------------------------------------------------------------------------


@router.get("/admin/webhook-events")
def admin_list_webhook_events(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
    limit: int = Query(50, ge=1, le=200),
    event_type: str | None = Query(None, max_length=128),
    since_days: int = Query(7, ge=1, le=90),
):
    """Super-admin browser of the ``stripe_webhook_event`` dedupe table.

    Pairs with :func:`admin_webhook_replay` — operators use this list to
    find the row to replay. Cross-dialect SQL only (no Postgres-specific
    operators) so the SQLite test DB and Postgres prod both work.

    Status mapping
    --------------
    * 403 — actor is not a super-admin (mirror :func:`_require_super_admin`).
    * 422 — ``limit`` outside [1, 200] or ``since_days`` outside [1, 90]
      (FastAPI ``Query`` constraint validation).
    * 200 — ``{"since_days": int, "rows": [...]}`` ordered by
      ``received_at DESC``.
    """
    _require_super_admin(actor)

    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    # SQLite stores naive datetimes — strip tz for the comparison so the
    # WHERE clause is dialect-agnostic.
    cutoff_naive = cutoff.replace(tzinfo=None)

    q = db.query(StripeWebhookEvent).filter(
        StripeWebhookEvent.received_at >= cutoff_naive
    )
    if event_type:
        q = q.filter(StripeWebhookEvent.event_type == event_type)

    rows = (
        q.order_by(StripeWebhookEvent.received_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "since_days": since_days,
        "rows": [
            {
                "id": r.id,
                "event_id": r.id,
                "event_type": r.event_type,
                "received_at": (
                    r.received_at.isoformat() if r.received_at is not None else None
                ),
                "processed": bool(r.processed),
            }
            for r in rows
        ],
    }

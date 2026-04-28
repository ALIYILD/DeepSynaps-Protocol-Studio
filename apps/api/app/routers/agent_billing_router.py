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

from fastapi import APIRouter, Depends, Header, Request
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

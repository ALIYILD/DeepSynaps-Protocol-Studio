from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
import stripe

from ..auth import AuthenticatedActor, get_authenticated_actor
from ..packages import PACKAGES, PACKAGE_ORDER
from ..persistence.models import StripeWebhookLog
from ..services.stripe_service import (
    create_customer,
    create_checkout_session,
    create_portal_session,
    construct_webhook_event,
)
from ..repositories.users import (
    get_user_by_id,
    get_subscription_by_user,
    update_subscription_from_stripe,
    update_user_package,
)
from ..database import get_db_session
from ..settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["payments"])

# TODO(billing-reconcile, 2026-04-26): Three-way pricing conflict — needs CEO input.
# This router and ``apps/api/app/packages.py`` use the canonical 5-tier model:
#   Explorer (free) / Resident $99 / Clinician Pro $199 / Clinic Team $699 / Enterprise $2,500
# ``PRICING_PACKAGES.md`` (root) matches this 5-tier model.
# However, the public web pricing page (``apps/web/src/pages-public.js`` and
# ``apps/web/src/pages-knowledge.js``, last rebuilt 2026-04-24 in commit 6d9c673)
# advertises a different 4-tier model:
#   Starter $99 / Professional $299 / Clinic $999 / Enterprise from $2,499
# with package IDs (``starter``/``professional``/``clinic``) and Stripe price IDs
# (``price_starter_m`` / ``price_pro_m`` / ``price_clinic_m``) that do NOT exist
# in this backend. The commit message references ``PRICING_PAGE_SPEC.md`` but no
# such spec file exists in the repo. Until product/CEO confirms which model is
# canonical, checkout for Professional/Clinic from the marketing site will 404
# at ``/api/v1/payments/create-checkout``. Do NOT silently align prices in either
# direction — this is a billing/legal-risk decision that requires explicit sign-off.

PACKAGE_ROLE_MAP = {
    "explorer": "guest",
    "resident": "clinician",
    "clinician_pro": "clinician",
    "clinic_team": "clinician",
    "enterprise": "admin",
}


def _build_package_info() -> list[dict]:
    """Derive the public package list from the canonical ``PACKAGES`` registry.

    Source of truth is ``apps/api/app/packages.py``. We never hand-roll feature
    lists or pricing here — that caused drift between the pricing page, the
    payments config, and the backend entitlement model. Public feature labels
    live alongside each package definition below (display-only copy).
    """
    # Display-only feature bullets; they complement (not replace) the
    # authoritative Feature enum membership on each Package. Keep these short
    # so the pricing page UI renders cleanly without truncation.
    display_features: dict[str, list[str]] = {
        "explorer": [
            "Evidence library — read",
            "Device registry — limited",
            "Conditions & modalities — limited",
        ],
        "resident": [
            "Full evidence library",
            "Protocol generation (EV-A/B)",
            "Assessment builder — limited",
            "Handbook generation — limited",
            "PDF export",
        ],
        "clinician_pro": [
            "Full protocol generator (EV-C override)",
            "Uploads (qEEG / MRI / PDFs)",
            "Personalized case summaries",
            "Full assessment + handbook builders",
            "PDF + DOCX export",
            "Personal review queue & audit trail",
            "Monthly monitoring digest",
            "Add-on: Phenotype mapping",
        ],
        "clinic_team": [
            "Everything in Clinician Pro",
            "Phenotype mapping included",
            "Shared team review queue",
            "Team audit trail & governance",
            "Team templates & comments",
            "Seat management (up to 10)",
            "Basic white-label branding",
        ],
        "enterprise": [
            "Everything in Clinic Team",
            "Unlimited seats",
            "Advanced governance rules",
            "Full white-label branding",
            "API / integrations",
            "Automated monitoring workspace",
            "SSO-ready structure",
        ],
    }
    out: list[dict] = []
    for pid in PACKAGE_ORDER:
        pkg = PACKAGES[pid]
        out.append(
            {
                "id": pkg.id,
                "name": pkg.display_name,
                "price_monthly": pkg.monthly_price_usd,
                "price_annual": pkg.annual_price_usd,
                "seat_limit": pkg.seat_limit,
                "custom_pricing": pkg.custom_pricing,
                "best_for": pkg.best_for,
                "features": display_features.get(pid, []),
            }
        )
    return out


PACKAGE_INFO = _build_package_info()




# ── Request schemas ────────────────────────────────────────────────────────────

class CreateCheckoutRequest(BaseModel):
    package_id: str  # "resident" | "clinician_pro" | "clinic_team"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/v1/payments/config")
def get_payments_config():
    """Return public Stripe key and available packages. No auth required."""
    s = get_settings()
    return {
        "publishable_key": s.stripe_publishable_key,
        "packages": PACKAGE_INFO,
    }


@router.post("/api/v1/payments/create-checkout")
def create_checkout(
    body: CreateCheckoutRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Create a Stripe Checkout session for the authenticated user."""
    user_id = actor.actor_id
    s = get_settings()
    if not s.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe not configured")

    # Enterprise is a "contact us" plan — no Stripe checkout
    if body.package_id == "enterprise":
        return {"checkout_url": None, "contact_us": True, "message": "Contact us at hello@deepsynaps.com to set up an Enterprise plan."}

    # Map package_id → Stripe price ID. Only canonical package IDs from
    # ``apps/api/app/packages.py`` are accepted.
    price_map = {
        "resident": s.stripe_price_resident,
        "clinician_pro": s.stripe_price_clinician_pro,
        "clinic_team": s.stripe_price_clinic_team,
    }
    price_id = price_map.get(body.package_id)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Unknown or unconfigured package: {body.package_id}")

    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Ensure the user has a Stripe customer ID (stored on their subscription row)
    sub = get_subscription_by_user(db, user_id)

    stripe_customer_id: Optional[str] = sub.stripe_customer_id if sub else None

    if not stripe_customer_id:
        stripe_customer_id = create_customer(email=user.email, name=user.display_name)
        # Persist it so subsequent calls don't create duplicates
        if sub:
            sub.stripe_customer_id = stripe_customer_id
            db.commit()
        else:
            from ..repositories.users import create_subscription
            sub = create_subscription(db, user_id=user_id, package_id="explorer")
            sub.stripe_customer_id = stripe_customer_id
            db.commit()

    checkout_url = create_checkout_session(
        customer_id=stripe_customer_id,
        price_id=price_id,
        user_id=user_id,
        app_url=s.app_url,
    )
    return {"checkout_url": checkout_url}


@router.post("/api/v1/payments/create-portal")
def create_portal(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Create a Stripe Customer Portal session for the authenticated user."""
    user_id = actor.actor_id
    s = get_settings()

    sub = get_subscription_by_user(db, user_id)
    if not sub or not sub.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer ID found for this user")

    portal_url = create_portal_session(
        customer_id=sub.stripe_customer_id,
        app_url=s.app_url,
    )
    return {"portal_url": portal_url}


def _compute_next_retry_at(attempt_count: int, base_minutes: int = 5, max_minutes: int = 360) -> datetime:
    """Exponential backoff capped at max_minutes (default 6 hours)."""
    backoff_minutes = min(base_minutes * (2 ** attempt_count), max_minutes)
    return datetime.now(timezone.utc) + timedelta(minutes=backoff_minutes)


def _price_map_rev(settings) -> dict[str, str]:
    """Build reverse price-id → package-id map, filtering unset IDs."""
    price_map = {
        settings.stripe_price_resident: "resident",
        settings.stripe_price_clinician_pro: "clinician_pro",
        settings.stripe_price_clinic_team: "clinic_team",
    }
    return {k: v for k, v in price_map.items() if k}


def _process_webhook_event(db: Session, event: dict) -> None:
    """Run the business logic for a verified Stripe webhook event.

    This is intentionally separate from HTTP handling so the retry worker can
    call it directly without re-verifying signatures.
    """
    s = get_settings()
    event_type = event["type"]
    data_obj = event["data"]["object"]

    # ── checkout.session.completed ────────────────────────────────────────────
    if event_type == "checkout.session.completed":
        stripe_customer_id = data_obj.get("customer")
        stripe_subscription_id = data_obj.get("subscription")
        user_id = (data_obj.get("metadata") or {}).get("user_id")

        package_id = "explorer"
        current_period_end = None
        if stripe_subscription_id:
            try:
                import stripe as _stripe
                _stripe.api_key = s.stripe_secret_key
                stripe_sub = _stripe.Subscription.retrieve(stripe_subscription_id)
                price_id = stripe_sub["items"]["data"][0]["price"]["id"]
                price_map_rev = _price_map_rev(s)
                package_id = price_map_rev.get(price_id, "explorer")
                current_period_end_ts = stripe_sub.get("current_period_end")
                current_period_end = (
                    datetime.fromtimestamp(current_period_end_ts, tz=timezone.utc)
                    if current_period_end_ts
                    else None
                )
            except Exception:
                current_period_end = None

        if stripe_customer_id:
            if user_id:
                sub = get_subscription_by_user(db, user_id)
                if sub and not sub.stripe_customer_id:
                    sub.stripe_customer_id = stripe_customer_id
                    db.commit()

            sub = update_subscription_from_stripe(
                db,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id or "",
                package_id=package_id,
                status="active",
                current_period_end=current_period_end,
            )
            if sub and user_id:
                role = PACKAGE_ROLE_MAP.get(package_id, "guest")
                update_user_package(db, user_id=sub.user_id, package_id=package_id, role=role)

    # ── customer.subscription.updated ────────────────────────────────────────
    elif event_type == "customer.subscription.updated":
        stripe_customer_id = data_obj.get("customer")
        stripe_subscription_id = data_obj.get("id")
        status = data_obj.get("status", "active")
        if status not in ("active", "canceled", "past_due"):
            status = "active"

        price_id = None
        try:
            price_id = data_obj["items"]["data"][0]["price"]["id"]
        except (KeyError, IndexError, TypeError):
            pass

        price_map_rev = _price_map_rev(s)
        package_id = price_map_rev.get(price_id, "explorer") if price_id else "explorer"

        current_period_end_ts = data_obj.get("current_period_end")
        current_period_end = (
            datetime.fromtimestamp(current_period_end_ts, tz=timezone.utc)
            if current_period_end_ts
            else None
        )

        if stripe_customer_id:
            sub = update_subscription_from_stripe(
                db,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id or "",
                package_id=package_id,
                status=status,
                current_period_end=current_period_end,
            )
            if sub:
                role = PACKAGE_ROLE_MAP.get(package_id, "guest")
                update_user_package(db, user_id=sub.user_id, package_id=package_id, role=role)

    # ── customer.subscription.deleted ────────────────────────────────────────
    elif event_type == "customer.subscription.deleted":
        stripe_customer_id = data_obj.get("customer")
        stripe_subscription_id = data_obj.get("id")

        if stripe_customer_id:
            sub = update_subscription_from_stripe(
                db,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id or "",
                package_id="explorer",
                status="canceled",
                current_period_end=None,
            )
            if sub:
                update_user_package(db, user_id=sub.user_id, package_id="explorer", role="guest")

    # ── invoice.payment_failed ────────────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        stripe_customer_id = data_obj.get("customer")
        stripe_subscription_id = data_obj.get("subscription")

        if stripe_customer_id:
            sub = update_subscription_from_stripe(
                db,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id or "",
                package_id="explorer",
                status="past_due",
                current_period_end=None,
            )
            if sub:
                update_user_package(db, user_id=sub.user_id, package_id="explorer", role="guest")


@router.post("/api/v1/payments/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db_session)):
    """Handle Stripe webhook events. Stripe sends raw bytes; no JWT auth.

    Every verified event is persisted to the StripeWebhookLog outbox table.
    Business logic runs inside a try/except so partial failures are recorded
    and retried by the worker rather than dropped.
    """
    s = get_settings()
    if not s.stripe_webhook_secret:
        raise HTTPException(status_code=400, detail="Stripe not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = construct_webhook_event(payload, sig_header, s.stripe_webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse webhook event")

    stripe_event_id = event.get("id", "")
    event_type = event.get("type", "")

    # Upsert the log row (idempotent — Stripe may redeliver)
    log = db.query(StripeWebhookLog).filter_by(stripe_event_id=stripe_event_id).first()
    if log is None:
        log = StripeWebhookLog(
            stripe_event_id=stripe_event_id,
            event_type=event_type,
            payload=json.dumps(event),
            status="pending",
            attempt_count=0,
            next_retry_at=None,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
    elif log.status == "succeeded":
        # Already processed successfully — return 200 so Stripe stops retrying
        return {"received": True}
    else:
        # Re-delivered while pending/failed/dead — bump to pending for another attempt
        log.status = "pending"
        log.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(log)

    try:
        _process_webhook_event(db, event)
    except Exception as exc:
        log.status = "failed"
        log.attempt_count += 1
        log.next_retry_at = _compute_next_retry_at(log.attempt_count)
        log.last_error = str(exc)
        log.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.warning("Stripe webhook processing failed: event=%s error=%s", stripe_event_id, exc)
        # Return 200 so Stripe doesn't retry at their layer — our worker handles retries
        return {"received": True}

    log.status = "succeeded"
    log.next_retry_at = None
    log.last_error = None
    log.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"received": True}

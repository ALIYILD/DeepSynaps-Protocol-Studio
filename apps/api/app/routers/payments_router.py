from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import stripe

from ..auth import AuthenticatedActor, get_authenticated_actor
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
from ..errors import ApiServiceError

router = APIRouter(prefix="", tags=["payments"])

PACKAGE_ROLE_MAP = {
    "explorer": "guest",
    "resident": "clinician",
    "clinician_pro": "clinician",
    "clinic_team": "clinician",
    # Current pricing page plan IDs
    "clinic-starter": "clinician",
    "clinic-pro": "clinician",
    "enterprise": "admin",
}

PACKAGE_INFO = [
    {
        "id": "clinic-starter",
        "name": "Clinic Starter",
        "price_monthly": 299,
        "features": ["Up to 3 clinicians", "Full protocol access", "Outcome tracking", "PDF & DOCX export"],
    },
    {
        "id": "clinic-pro",
        "name": "Clinic Pro",
        "price_monthly": 599,
        "features": ["Unlimited clinicians", "Full protocol access", "Outcome tracking", "PDF & DOCX export", "Wearable integrations", "Priority support"],
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "price_monthly": None,
        "features": ["Custom seats", "White-label options", "EHR integration", "Dedicated support", "Custom SLA"],
    },
    # Legacy plan IDs kept for backward-compatibility
    {
        "id": "resident",
        "name": "Resident (legacy)",
        "price_monthly": 29,
        "features": ["1 seat", "Full protocol access", "PDF & DOCX export"],
    },
    {
        "id": "clinician_pro",
        "name": "Clinician Pro (legacy)",
        "price_monthly": 79,
        "features": ["Up to 3 seats", "Full protocol access", "PDF & DOCX export", "Priority support"],
    },
    {
        "id": "clinic_team",
        "name": "Clinic Team (legacy)",
        "price_monthly": 199,
        "features": ["Up to 20 seats", "Full protocol access", "PDF & DOCX export", "Priority support", "Team management"],
    },
]




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

    # Map package_id → Stripe price ID (new IDs fall back to legacy price env vars if new ones unset)
    price_map = {
        "resident": s.stripe_price_resident,
        "clinician_pro": s.stripe_price_clinician_pro,
        "clinic_team": s.stripe_price_clinic_team,
        "clinic-starter": s.stripe_price_clinic_starter or s.stripe_price_clinician_pro,
        "clinic-pro": s.stripe_price_clinic_pro or s.stripe_price_clinic_team,
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


@router.post("/api/v1/payments/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db_session)):
    """Handle Stripe webhook events. Stripe sends raw bytes; no JWT auth."""
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

    event_type = event["type"]
    data_obj = event["data"]["object"]

    # ── checkout.session.completed ────────────────────────────────────────────
    if event_type == "checkout.session.completed":
        stripe_customer_id = data_obj.get("customer")
        stripe_subscription_id = data_obj.get("subscription")
        user_id = (data_obj.get("metadata") or {}).get("user_id")

        # Determine package from the subscription's price
        package_id = "explorer"
        if stripe_subscription_id:
            try:
                import stripe as _stripe
                _stripe.api_key = s.stripe_secret_key
                stripe_sub = _stripe.Subscription.retrieve(stripe_subscription_id)
                price_id = stripe_sub["items"]["data"][0]["price"]["id"]
                price_map_rev = {
                    s.stripe_price_resident: "resident",
                    s.stripe_price_clinician_pro: "clinician_pro",
                    s.stripe_price_clinic_team: "clinic_team",
                    s.stripe_price_clinic_starter: "clinic-starter",
                    s.stripe_price_clinic_pro: "clinic-pro",
                }
                # Remove empty-string key that maps unset prices to explorer
                price_map_rev = {k: v for k, v in price_map_rev.items() if k}
                package_id = price_map_rev.get(price_id, "explorer")
                current_period_end_ts = stripe_sub.get("current_period_end")
                from datetime import datetime
                current_period_end = (
                    datetime.utcfromtimestamp(current_period_end_ts)
                    if current_period_end_ts
                    else None
                )
            except Exception:
                current_period_end = None
        else:
            current_period_end = None

        if stripe_customer_id:
            # Ensure subscription row exists with customer id before updating
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
        # Map Stripe status to our status vocabulary
        if status not in ("active", "canceled", "past_due"):
            status = "active"

        price_id = None
        try:
            price_id = data_obj["items"]["data"][0]["price"]["id"]
        except (KeyError, IndexError, TypeError):
            pass

        price_map_rev = {
            s.stripe_price_resident: "resident",
            s.stripe_price_clinician_pro: "clinician_pro",
            s.stripe_price_clinic_team: "clinic_team",
            s.stripe_price_clinic_starter: "clinic-starter",
            s.stripe_price_clinic_pro: "clinic-pro",
        }
        # Remove empty-string key that maps unset prices to explorer
        price_map_rev = {k: v for k, v in price_map_rev.items() if k}
        package_id = price_map_rev.get(price_id, "explorer") if price_id else "explorer"

        current_period_end_ts = data_obj.get("current_period_end")
        from datetime import datetime
        current_period_end = (
            datetime.utcfromtimestamp(current_period_end_ts) if current_period_end_ts else None
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

    return {"received": True}

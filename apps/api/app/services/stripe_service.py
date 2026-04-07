import stripe
from ..settings import get_settings


def _init_stripe():
    s = get_settings()
    if s.stripe_secret_key:
        stripe.api_key = s.stripe_secret_key
    return s


PACKAGE_SEAT_LIMITS = {
    "explorer": 1,
    "resident": 1,
    "clinician_pro": 3,
    "clinic_team": 20,
    "enterprise": 999,
}


def create_customer(email: str, name: str) -> str:
    _init_stripe()
    customer = stripe.Customer.create(email=email, name=name)
    return customer["id"]


def create_checkout_session(customer_id: str, price_id: str, user_id: str, app_url: str) -> str:
    _init_stripe()
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{app_url}/pricing-access?success=1",
        cancel_url=f"{app_url}/pricing-access?canceled=1",
        metadata={"user_id": user_id},
    )
    return session.url


def create_portal_session(customer_id: str, app_url: str) -> str:
    _init_stripe()
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{app_url}/pricing-access",
    )
    return session.url


def construct_webhook_event(payload: bytes, sig_header: str, webhook_secret: str):
    return stripe.Webhook.construct_event(payload, sig_header, webhook_secret)

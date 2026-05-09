"""Tests for app.repositories.users — user and subscription CRUD contracts (PR 83/N).

Covers:
- create_user inserts a User with expected fields
- get_user_by_email returns correct user
- get_user_by_id returns correct user
- get_user_by_email returns None for unknown email
- get_user_by_id returns None for unknown id
- update_user_package changes package_id and role
- update_user_package returns None for unknown id
- create_subscription creates subscription row
- get_subscription_by_user returns subscription
- update_subscription_from_stripe updates subscription fields
"""
from __future__ import annotations

import uuid


def _uid() -> str:
    return f"test-user-{uuid.uuid4().hex[:8]}"


def test_create_user_happy_path():
    from app.database import SessionLocal
    from app.repositories.users import create_user

    db = SessionLocal()
    try:
        uid = _uid()
        user = create_user(
            db,
            email=f"{uid}@example.com",
            display_name="Test Clinician",
            hashed_password="hashed-x",
            role="clinician",
            package_id="clinician_pro",
        )
        assert user.email == f"{uid}@example.com"
        assert user.display_name == "Test Clinician"
        assert user.role == "clinician"
        assert user.package_id == "clinician_pro"
        assert user.id is not None
    finally:
        db.close()


def test_get_user_by_email_returns_user():
    from app.database import SessionLocal
    from app.repositories.users import create_user, get_user_by_email

    db = SessionLocal()
    try:
        uid = _uid()
        email = f"{uid}@example.com"
        create_user(db, email=email, display_name="Name", hashed_password="h")
        found = get_user_by_email(db, email)
        assert found is not None
        assert found.email == email
    finally:
        db.close()


def test_get_user_by_email_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.users import get_user_by_email

    db = SessionLocal()
    try:
        result = get_user_by_email(db, "nobody@nonexistent.example.com")
        assert result is None
    finally:
        db.close()


def test_get_user_by_id_returns_user():
    from app.database import SessionLocal
    from app.repositories.users import create_user, get_user_by_id

    db = SessionLocal()
    try:
        uid = _uid()
        user = create_user(db, email=f"{uid}@example.com", display_name="n", hashed_password="h")
        found = get_user_by_id(db, user.id)
        assert found is not None
        assert found.id == user.id
    finally:
        db.close()


def test_get_user_by_id_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.users import get_user_by_id

    db = SessionLocal()
    try:
        result = get_user_by_id(db, "user-does-not-exist-xyz")
        assert result is None
    finally:
        db.close()


def test_update_user_package_changes_fields():
    from app.database import SessionLocal
    from app.repositories.users import create_user, update_user_package

    db = SessionLocal()
    try:
        uid = _uid()
        user = create_user(
            db,
            email=f"{uid}@example.com",
            display_name="Upgradable",
            hashed_password="h",
            role="guest",
            package_id="explorer",
        )
        updated = update_user_package(db, user.id, package_id="clinician_pro", role="clinician")
        assert updated is not None
        assert updated.package_id == "clinician_pro"
        assert updated.role == "clinician"
    finally:
        db.close()


def test_update_user_package_returns_none_for_unknown_id():
    from app.database import SessionLocal
    from app.repositories.users import update_user_package

    db = SessionLocal()
    try:
        result = update_user_package(db, "unknown-id-xyz", package_id="pro", role="clinician")
        assert result is None
    finally:
        db.close()


def test_create_subscription_happy_path():
    from app.database import SessionLocal
    from app.repositories.users import create_user, create_subscription, get_subscription_by_user

    db = SessionLocal()
    try:
        uid = _uid()
        user = create_user(db, email=f"{uid}@example.com", display_name="Sub User", hashed_password="h")
        sub = create_subscription(db, user.id, package_id="clinician_pro")
        assert sub.user_id == user.id
        assert sub.package_id == "clinician_pro"
    finally:
        db.close()


def test_get_subscription_by_user_returns_subscription():
    from app.database import SessionLocal
    from app.repositories.users import create_user, create_subscription, get_subscription_by_user

    db = SessionLocal()
    try:
        uid = _uid()
        user = create_user(db, email=f"{uid}@example.com", display_name="Sub Lookup", hashed_password="h")
        create_subscription(db, user.id, package_id="explorer")
        found = get_subscription_by_user(db, user.id)
        assert found is not None
        assert found.user_id == user.id
    finally:
        db.close()


def test_update_subscription_from_stripe():
    from datetime import datetime, timezone
    from app.database import SessionLocal
    from app.repositories.users import create_user, create_subscription, update_subscription_from_stripe
    from app.persistence.models import Subscription

    db = SessionLocal()
    try:
        uid = _uid()
        user = create_user(db, email=f"{uid}@example.com", display_name="Stripe Sub", hashed_password="h")
        sub = create_subscription(db, user.id, package_id="explorer")

        # attach stripe IDs directly for the update lookup
        sub.stripe_customer_id = f"cus_{uid}"
        db.commit()

        period_end = datetime(2027, 1, 1, tzinfo=timezone.utc)
        updated = update_subscription_from_stripe(
            db,
            stripe_customer_id=f"cus_{uid}",
            stripe_subscription_id=f"sub_{uid}",
            package_id="clinician_pro",
            status="active",
            current_period_end=period_end,
        )
        assert updated is not None
        assert updated.package_id == "clinician_pro"
        assert updated.status == "active"
    finally:
        db.close()

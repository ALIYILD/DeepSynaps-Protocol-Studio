from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..persistence.models import Subscription, User


def get_user_by_email(session: Session, email: str) -> Optional[User]:
    return session.scalar(select(User).where(User.email == email))


def get_user_by_id(session: Session, user_id: str) -> Optional[User]:
    return session.scalar(select(User).where(User.id == user_id))


def create_user(
    session: Session,
    email: str,
    display_name: str,
    hashed_password: str,
    role: str = "guest",
    package_id: str = "explorer",
) -> User:
    user = User(
        email=email,
        display_name=display_name,
        hashed_password=hashed_password,
        role=role,
        package_id=package_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user_package(
    session: Session, user_id: str, package_id: str, role: str
) -> Optional[User]:
    user = get_user_by_id(session, user_id)
    if user:
        user.package_id = package_id
        user.role = role
        session.commit()
        session.refresh(user)
    return user


def get_subscription_by_user(session: Session, user_id: str) -> Optional[Subscription]:
    return session.scalar(select(Subscription).where(Subscription.user_id == user_id))


def create_subscription(
    session: Session, user_id: str, package_id: str = "explorer"
) -> Subscription:
    sub = Subscription(user_id=user_id, package_id=package_id)
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub


def update_subscription_from_stripe(
    session: Session,
    stripe_customer_id: str,
    stripe_subscription_id: str,
    package_id: str,
    status: str,
    current_period_end,
) -> Optional[Subscription]:
    sub = session.scalar(
        select(Subscription).where(Subscription.stripe_customer_id == stripe_customer_id)
    )
    if sub:
        sub.stripe_subscription_id = stripe_subscription_id
        sub.package_id = package_id
        sub.status = status
        sub.current_period_end = current_period_end
        session.commit()
        session.refresh(sub)
    return sub

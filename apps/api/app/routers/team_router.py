"""Team router — /api/v1/team.

Clinic team management: list members + pending invites, invite new members,
revoke pending invites, change roles, and remove members. Plus a PUBLIC
accept-invite endpoint that creates the invited user + issues JWTs.

Endpoints:
  GET    /api/v1/team                       → {items, pending}
  POST   /api/v1/team/invite                → TeamInviteResponse (token once)
  DELETE /api/v1/team/invite/{invite_id}    → {revoked: true}
  PATCH  /api/v1/team/{user_id}/role        → {user_id, role}
  DELETE /api/v1/team/{user_id}             → {removed: true}  (dissociate)
  POST   /api/v1/team/accept-invite         → TokenResponse     (PUBLIC)

See apps/api/SETTINGS_API_DESIGN.md § Team router for the full spec.
"""
from __future__ import annotations

import json
import logging
import re
import secrets as _secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from ..database import get_db_session
from ..errors import ApiServiceError
from ..limiter import limiter
from ..persistence.models import ClinicTeamInvite, User, UserSession
from ..repositories.users import (
    create_user,
    get_subscription_by_user,
    get_user_by_email,
)
from ..services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/team", tags=["team"])

# ── Constants ────────────────────────────────────────────────────────────────

_ALLOWED_ROLES = {"admin", "clinician", "technician", "read-only"}
_INVITE_TTL_HOURS = 48
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# TODO: enforce against Subscription.seat_limit with proper billing lookup.
# v0 falls back to this value when the admin's Subscription row is missing.
DEFAULT_SEAT_LIMIT = 5


# ── Pydantic models ──────────────────────────────────────────────────────────


class TeamMemberItem(BaseModel):
    id: str
    display_name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    last_active_at: Optional[str] = None
    is_current: bool = False


class TeamInviteItem(BaseModel):
    id: str
    email: str
    role: str
    invited_at: str
    expires_at: str


class TeamListResponse(BaseModel):
    items: list[TeamMemberItem]
    pending: list[TeamInviteItem]


class TeamInviteRequest(BaseModel):
    email: str
    role: str


class TeamInviteResponse(BaseModel):
    id: str
    email: str
    role: str
    token: str  # ONE-time display
    expires_at: str


class RoleUpdateRequest(BaseModel):
    role: str


class RoleUpdateResponse(BaseModel):
    user_id: str
    role: str


class InviteRevokedResponse(BaseModel):
    revoked: bool


class MemberRemovedResponse(BaseModel):
    removed: bool


class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    display_name: str


# UserProfile + TokenResponse mirror the shapes in auth_router so the shared
# TokenResponse contract holds across endpoints. Duplicated (not imported) to
# avoid a circular import via auth_router.


class _UserProfile(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    package_id: str
    is_verified: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: _UserProfile


# ── Helpers ──────────────────────────────────────────────────────────────────


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _validate_email(email: str) -> None:
    if not _EMAIL_RE.match(email or ""):
        raise ApiServiceError(
            code="invalid_email",
            message="The provided email address is not valid.",
            warnings=["Provide a valid email address in the format user@domain.com."],
            status_code=400,
        )


def _validate_role(role: str) -> str:
    role = (role or "").strip()
    if role not in _ALLOWED_ROLES:
        raise ApiServiceError(
            code="invalid_role",
            message="Role must be one of: admin, clinician, technician, read-only.",
            status_code=400,
        )
    return role


def _validate_password(password: str) -> None:
    if not password or len(password) < 8:
        raise ApiServiceError(
            code="password_too_short",
            message="Password must be at least 8 characters long.",
            warnings=["Choose a password with 8 or more characters."],
            status_code=400,
        )


def _require_clinic(user: User) -> str:
    if not user.clinic_id:
        raise ApiServiceError(
            code="no_clinic",
            message="User is not associated with a clinic.",
            status_code=404,
        )
    return user.clinic_id


def _active_invites_query(clinic_id: str):
    """Invites that are still pending: not accepted, not revoked, not expired."""
    now = datetime.now(timezone.utc)
    return select(ClinicTeamInvite).where(
        ClinicTeamInvite.clinic_id == clinic_id,
        ClinicTeamInvite.accepted_at.is_(None),
        ClinicTeamInvite.revoked_at.is_(None),
        ClinicTeamInvite.expires_at > now,
    )


def _count_clinic_admins(db: Session, clinic_id: str) -> int:
    return (
        db.scalar(
            select(func.count(User.id)).where(
                User.clinic_id == clinic_id, User.role == "admin"
            )
        )
        or 0
    )


def _resolve_seat_limit(db: Session, caller: User) -> int:
    """Return the seat limit for the caller's subscription.

    v0: read `Subscription.seat_limit` if a row exists; otherwise fall back to
    `DEFAULT_SEAT_LIMIT`. If no subscription exists at all, this is a solo/
    grandfathered account — allow 1 seat (matches the Subscription default).
    """
    sub = get_subscription_by_user(db, caller.id)
    if sub is None:
        # Per spec: "If no subscription row exists, default to 1 seat."
        return 1
    # Allow the hardcoded floor while we wire plan → seat_limit properly.
    return max(int(sub.seat_limit or 0), DEFAULT_SEAT_LIMIT)


def _latest_session_last_seen(db: Session, user_id: str) -> datetime | None:
    return db.scalar(
        select(func.max(UserSession.last_seen_at)).where(
            UserSession.user_id == user_id
        )
    )


def _write_audit(
    db: Session,
    *,
    target_id: str,
    target_type: str,
    action: str,
    role: str,
    actor_id: str,
    note: str = "",
) -> None:
    """Best-effort audit write. Never blocks the primary mutation."""
    try:
        from ..repositories.audit import create_audit_event
        now_iso = _iso(datetime.now(timezone.utc))
        create_audit_event(
            db,
            event_id=f"{action}-{target_id}-{int(datetime.now(timezone.utc).timestamp()*1000)}",
            target_id=target_id,
            target_type=target_type,
            action=action,
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=now_iso,
        )
    except Exception:  # pragma: no cover
        logger.warning("Audit write failed for %s/%s", action, target_id, exc_info=True)


def _record_user_session(
    db: Session,
    *,
    user_id: str,
    refresh_token: str,
    request: Request | None,
) -> None:
    """Mirror of auth_router._record_user_session. Best-effort creation of a
    UserSession row for a newly-issued refresh token."""
    try:
        ua = ""
        ip = ""
        if request is not None:
            ua = (request.headers.get("user-agent") or "")[:512]
            ip = (request.client.host if request.client else "") or ""
        db.add(
            UserSession(
                user_id=user_id,
                refresh_token_hash=auth_service.hash_refresh_token(refresh_token),
                user_agent=ua,
                ip_address=ip[:64],
            )
        )
        db.commit()
    except Exception:  # pragma: no cover — best-effort
        logger.warning("Failed to record UserSession for user %s", user_id, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=TeamListResponse)
@router.get("/", response_model=TeamListResponse, include_in_schema=False)
def list_team(
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> TeamListResponse:
    """List clinic members + active pending invites. 404 if caller has no clinic."""
    clinic_id = _require_clinic(user)

    # Members — every User row with matching clinic_id (includes the caller).
    member_rows = db.scalars(
        select(User)
        .where(User.clinic_id == clinic_id)
        .order_by(User.display_name.asc())
    ).all()

    items: list[TeamMemberItem] = []
    for row in member_rows:
        last_seen = _latest_session_last_seen(db, row.id)
        items.append(
            TeamMemberItem(
                id=row.id,
                display_name=row.display_name,
                email=row.email,
                role=row.role,
                avatar_url=row.avatar_url,
                last_active_at=_iso(last_seen) if last_seen else None,
                is_current=(row.id == user.id),
            )
        )

    # Pending invites.
    invite_rows = db.scalars(
        _active_invites_query(clinic_id).order_by(ClinicTeamInvite.invited_at.desc())
    ).all()

    pending = [
        TeamInviteItem(
            id=inv.id,
            email=inv.email,
            role=inv.role,
            invited_at=_iso(inv.invited_at),
            expires_at=_iso(inv.expires_at),
        )
        for inv in invite_rows
    ]

    return TeamListResponse(items=items, pending=pending)


@router.post("/invite", response_model=TeamInviteResponse, status_code=201)
@limiter.limit("20/day")
def invite_member(
    request: Request,
    body: TeamInviteRequest,
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> TeamInviteResponse:
    """Invite a new team member. Admin only.

    * Validates email + role.
    * Enforces seat limit (current members + active invites <= seat_limit).
    * Refuses a duplicate active invite for the same (clinic, email) pair.
    * Generates a 64-char token, stores it, returns it ONCE so the admin can
      forward the accept-invite URL to the invitee.
    """
    clinic_id = _require_clinic(user)
    email_norm = (body.email or "").strip().lower()
    _validate_email(email_norm)
    role = _validate_role(body.role)

    # Application-layer uniqueness: no existing active invite for this email.
    dup = db.scalar(
        _active_invites_query(clinic_id).where(ClinicTeamInvite.email == email_norm)
    )
    if dup is not None:
        raise ApiServiceError(
            code="invite_already_pending",
            message="An active invitation for this email already exists.",
            warnings=["Revoke the existing invite before creating a new one."],
            status_code=409,
        )

    # If a user with this email already belongs to this clinic, no-op.
    existing = get_user_by_email(db, email_norm)
    if existing is not None and existing.clinic_id == clinic_id:
        raise ApiServiceError(
            code="already_member",
            message="This user is already a member of your clinic.",
            status_code=409,
        )

    # Seat limit check: count current members + pending invites.
    seat_limit = _resolve_seat_limit(db, user)
    current_members = (
        db.scalar(
            select(func.count(User.id)).where(User.clinic_id == clinic_id)
        )
        or 0
    )
    pending_count = (
        db.scalar(
            select(func.count(ClinicTeamInvite.id)).where(
                ClinicTeamInvite.clinic_id == clinic_id,
                ClinicTeamInvite.accepted_at.is_(None),
                ClinicTeamInvite.revoked_at.is_(None),
                ClinicTeamInvite.expires_at > datetime.now(timezone.utc),
            )
        )
        or 0
    )
    if current_members + pending_count >= seat_limit:
        raise ApiServiceError(
            code="seat_limit_reached",
            message=(
                f"Seat limit reached ({seat_limit}). "
                "Upgrade your plan or revoke a pending invite."
            ),
            status_code=409,
        )

    token = _secrets.token_urlsafe(48)  # ~64 chars
    # Defensive safety: ensure length fits the 64-char column even if the
    # encoding yields more; truncation is fine because entropy is still ≥ 256 bits.
    token = token[:64]
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=_INVITE_TTL_HOURS)

    invite = ClinicTeamInvite(
        clinic_id=clinic_id,
        email=email_norm,
        role=role,
        token=token,
        invited_by=user.id,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Stub email delivery — replace with real SMTP once settings.SMTP_* is wired.
    logger.info(
        "[email stub] invite URL: /accept-invite?token=%s (to %s, role=%s, clinic=%s)",
        token,
        email_norm,
        role,
        clinic_id,
    )

    _write_audit(
        db,
        target_id=clinic_id,
        target_type="clinic",
        action="team_member_invited",
        role=user.role,
        actor_id=user.id,
        note=json.dumps({"email": email_norm, "role": role}),
    )

    return TeamInviteResponse(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        token=token,
        expires_at=_iso(invite.expires_at),
    )


@router.delete("/invite/{invite_id}", response_model=InviteRevokedResponse)
def revoke_invite(
    invite_id: str,
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> InviteRevokedResponse:
    """Mark a pending invite as revoked. Admin only; 404 if it doesn't exist
    or belongs to another clinic."""
    clinic_id = _require_clinic(user)

    invite = db.scalar(
        select(ClinicTeamInvite).where(
            ClinicTeamInvite.id == invite_id,
            ClinicTeamInvite.clinic_id == clinic_id,
        )
    )
    if invite is None:
        raise ApiServiceError(
            code="invite_not_found",
            message="Invite not found.",
            status_code=404,
        )

    if invite.revoked_at is None and invite.accepted_at is None:
        invite.revoked_at = datetime.now(timezone.utc)
        db.commit()

        _write_audit(
            db,
            target_id=clinic_id,
            target_type="clinic",
            action="team_invite_revoked",
            role=user.role,
            actor_id=user.id,
            note=json.dumps({"invite_id": invite_id, "email": invite.email}),
        )

    return InviteRevokedResponse(revoked=True)


@router.patch("/{user_id}/role", response_model=RoleUpdateResponse)
def change_member_role(
    user_id: str,
    body: RoleUpdateRequest,
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> RoleUpdateResponse:
    """Change a team member's role. Admin only.

    * Target must belong to the caller's clinic (else 404).
    * Refuses to demote the last remaining admin.
    """
    clinic_id = _require_clinic(user)
    new_role = _validate_role(body.role)

    target = db.scalar(
        select(User).where(User.id == user_id, User.clinic_id == clinic_id)
    )
    if target is None:
        raise ApiServiceError(
            code="member_not_found",
            message="Team member not found.",
            status_code=404,
        )

    # Last-admin guard.
    if target.role == "admin" and new_role != "admin":
        admin_count = _count_clinic_admins(db, clinic_id)
        if admin_count <= 1:
            raise ApiServiceError(
                code="last_admin",
                message="Cannot demote the last remaining admin.",
                warnings=["Promote another member to admin before changing this role."],
                status_code=409,
            )

    if target.role != new_role:
        old_role = target.role
        target.role = new_role
        db.commit()

        _write_audit(
            db,
            target_id=target.id,
            target_type="user",
            action="team_member_role_changed",
            role=user.role,
            actor_id=user.id,
            note=json.dumps({"from": old_role, "to": new_role}),
        )

    return RoleUpdateResponse(user_id=target.id, role=target.role)


@router.delete("/{user_id}", response_model=MemberRemovedResponse)
def remove_member(
    user_id: str,
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> MemberRemovedResponse:
    """Remove a team member from the clinic by dissociating (clinic_id=NULL,
    role=guest). Does NOT delete the user row — their account lives on.

    * Refuses if the target is the caller (409 — use /auth/logout or a
      dedicated /team/leave flow instead).
    * Refuses if the target is the last admin (409 `last_admin`).
    """
    clinic_id = _require_clinic(user)

    if user_id == user.id:
        raise ApiServiceError(
            code="cannot_remove_self",
            message="You cannot remove yourself from the clinic via this endpoint.",
            warnings=["Use /auth/logout or a clinic-leave flow instead."],
            status_code=409,
        )

    target = db.scalar(
        select(User).where(User.id == user_id, User.clinic_id == clinic_id)
    )
    if target is None:
        raise ApiServiceError(
            code="member_not_found",
            message="Team member not found.",
            status_code=404,
        )

    if target.role == "admin":
        admin_count = _count_clinic_admins(db, clinic_id)
        if admin_count <= 1:
            raise ApiServiceError(
                code="last_admin",
                message="Cannot remove the last remaining admin.",
                warnings=["Promote another member to admin first."],
                status_code=409,
            )

    target.clinic_id = None
    target.role = "guest"
    db.commit()

    _write_audit(
        db,
        target_id=clinic_id,
        target_type="clinic",
        action="team_member_removed",
        role=user.role,
        actor_id=user.id,
        note=json.dumps({"user_id": target.id, "email": target.email}),
    )

    return MemberRemovedResponse(removed=True)


@router.post("/accept-invite", response_model=TokenResponse, status_code=201)
@limiter.limit("5/minute")
def accept_invite(
    request: Request,
    body: AcceptInviteRequest,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    """PUBLIC — accept an invite.

    Validates the token (not expired, not revoked, not already accepted),
    creates the User (or rejects if one already exists for this email),
    associates them with the clinic, and issues JWTs so the new user is
    logged in on response.
    """
    token = (body.token or "").strip()
    if not token:
        raise ApiServiceError(
            code="invalid_invite_token",
            message="Invitation token is required.",
            status_code=400,
        )

    _validate_password(body.password)
    display_name = (body.display_name or "").strip()
    if not display_name:
        raise ApiServiceError(
            code="invalid_display_name",
            message="Display name is required.",
            status_code=400,
        )

    invite = db.scalar(select(ClinicTeamInvite).where(ClinicTeamInvite.token == token))
    if invite is None:
        raise ApiServiceError(
            code="invalid_invite_token",
            message="The invitation token is not valid.",
            warnings=["Ask your admin for a fresh invite."],
            status_code=400,
        )

    if invite.revoked_at is not None:
        raise ApiServiceError(
            code="invite_revoked",
            message="This invitation has been revoked.",
            status_code=400,
        )
    if invite.accepted_at is not None:
        raise ApiServiceError(
            code="invite_already_used",
            message="This invitation has already been accepted.",
            status_code=400,
        )

    expires_at_utc = (
        invite.expires_at
        if invite.expires_at.tzinfo
        else invite.expires_at.replace(tzinfo=timezone.utc)
    )
    if expires_at_utc < datetime.now(timezone.utc):
        raise ApiServiceError(
            code="invite_expired",
            message="This invitation has expired.",
            warnings=["Ask your admin for a fresh invite."],
            status_code=400,
        )

    # If a user already exists with this email, gate on clinic membership.
    existing = get_user_by_email(db, invite.email)
    if existing is not None:
        if existing.clinic_id == invite.clinic_id:
            raise ApiServiceError(
                code="account_exists_same_clinic",
                message="An account with this email already belongs to the clinic.",
                warnings=["Log in via /auth/login."],
                status_code=409,
            )
        # Different clinic (including None) — v0 does not support transfers.
        raise ApiServiceError(
            code="account_exists_other_clinic",
            message="An account with this email already exists.",
            warnings=[
                "Multi-clinic membership is not yet supported. "
                "Contact support to move your account."
            ],
            status_code=409,
        )

    hashed_pw = auth_service.hash_password(body.password)
    user = create_user(
        db,
        email=invite.email,
        display_name=display_name[:255],
        hashed_password=hashed_pw,
        role=invite.role,
        package_id="explorer",
    )
    # Associate with the inviting clinic.
    user.clinic_id = invite.clinic_id

    # Mark invite as accepted.
    invite.accepted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    # Issue JWTs and record session (matches auth_router login/register flow).
    access_token = auth_service.create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        package_id=user.package_id,
    )
    refresh_token = auth_service.create_refresh_token(user_id=user.id)
    _record_user_session(db, user_id=user.id, refresh_token=refresh_token, request=request)

    _write_audit(
        db,
        target_id=invite.clinic_id,
        target_type="clinic",
        action="team_invite_accepted",
        role=user.role,
        actor_id=user.id,
        note=json.dumps({"email": user.email, "role": user.role}),
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_UserProfile(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            package_id=user.package_id,
            is_verified=user.is_verified,
        ),
    )

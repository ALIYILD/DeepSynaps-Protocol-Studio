"""Auth router payload types.

Promoted out of ``apps/api/app/routers/auth_router.py`` per Architect
Rec #5. These shapes are part of the public auth contract consumed by the
web client and any non-router service that issues credentials.
"""

from __future__ import annotations

from pydantic import BaseModel


# ── Registration / login / refresh ────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: str
    display_name: str
    password: str  # min 8 chars
    role: str = "clinician"  # default role for professional self-signup


class LoginRequest(BaseModel):
    email: str
    password: str


class UserProfile(BaseModel):
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
    user: UserProfile


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


# ── Settings API: password / 2FA ──────────────────────────────────────────────


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    qr_uri: str
    backup_codes: list[str]


class TwoFactorVerifyRequest(BaseModel):
    code: str


class TwoFactorVerifyResponse(BaseModel):
    enabled: bool


class TwoFactorDisableRequest(BaseModel):
    password: str
    code: str


# ── Sessions ──────────────────────────────────────────────────────────────────


class SessionItem(BaseModel):
    id: str
    user_agent: str
    ip_address: str
    created_at: str
    last_seen_at: str
    is_current: bool


class SessionsListResponse(BaseModel):
    items: list[SessionItem]


class SessionRevokedResponse(BaseModel):
    message: str


class OthersRevokedResponse(BaseModel):
    revoked_count: int


# ── Logout / demo / patient activation ────────────────────────────────────────


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class DemoLoginRequest(BaseModel):
    token: str


class ActivatePatientRequest(BaseModel):
    invite_code: str
    email: str
    display_name: str
    password: str

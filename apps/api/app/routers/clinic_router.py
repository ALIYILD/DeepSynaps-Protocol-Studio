"""Clinic router — /api/v1/clinic.

Handles the clinic (multi-user organisation) that the authenticated user
belongs to. Creating a clinic promotes the caller to `role="admin"`.

Endpoints:
  GET    /api/v1/clinic                  → ClinicResponse (404 if solo)
  POST   /api/v1/clinic                  → create clinic + promote to admin
  PATCH  /api/v1/clinic                  → partial update (admin only)
  POST   /api/v1/clinic/logo             → multipart → 512x512 padded WEBP
  PUT    /api/v1/clinic/working-hours    → 7-day schedule

See apps/api/SETTINGS_API_DESIGN.md § Clinic router for the full spec.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db_session
from ..errors import ApiServiceError
from ..persistence.models import Clinic, User
from ..services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/clinic", tags=["clinic"])

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_CLINIC_LOGO_DIR = _DATA_DIR / "clinics"
_MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB


# ── Pydantic models ──────────────────────────────────────────────────────────


class ClinicResponse(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    timezone: str
    logo_url: Optional[str] = None
    specialties: Optional[list[str]] = None
    working_hours: Optional[dict] = None
    retention_days: int
    created_at: str
    updated_at: str


class ClinicCreateRequest(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    timezone: str = "UTC"
    specialties: Optional[list[str]] = None


class ClinicUpdateRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    timezone: Optional[str] = None
    specialties: Optional[list[str]] = None


class WorkingHoursDay(BaseModel):
    """Per-day schedule. `from_` is serialised as `from` (reserved keyword)."""
    model_config = ConfigDict(populate_by_name=True)

    open: bool
    from_: str = Field(default="09:00", alias="from")
    to: str = "17:00"


class WorkingHoursRequest(BaseModel):
    mon: WorkingHoursDay
    tue: WorkingHoursDay
    wed: WorkingHoursDay
    thu: WorkingHoursDay
    fri: WorkingHoursDay
    sat: WorkingHoursDay
    sun: WorkingHoursDay


class LogoResponse(BaseModel):
    logo_url: str


class WorkingHoursResponse(BaseModel):
    working_hours: dict


# ── Helpers ──────────────────────────────────────────────────────────────────


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _decode_json(blob: Optional[str], default):
    if not blob:
        return default
    try:
        return json.loads(blob)
    except (ValueError, TypeError):
        return default


def _to_response(clinic: Clinic) -> ClinicResponse:
    specialties = _decode_json(clinic.specialties, None)
    working_hours = _decode_json(clinic.working_hours, None)
    # Preserve list/dict shapes; coerce mistakes silently rather than 500.
    if specialties is not None and not isinstance(specialties, list):
        specialties = None
    if working_hours is not None and not isinstance(working_hours, dict):
        working_hours = None
    return ClinicResponse(
        id=clinic.id,
        name=clinic.name,
        address=clinic.address,
        phone=clinic.phone,
        email=clinic.email,
        website=clinic.website,
        timezone=clinic.timezone,
        logo_url=clinic.logo_url,
        specialties=specialties,
        working_hours=working_hours,
        retention_days=clinic.retention_days,
        created_at=_iso(clinic.created_at),
        updated_at=_iso(clinic.updated_at),
    )


def _load_user_clinic(db: Session, user: User) -> Clinic:
    if not user.clinic_id:
        raise ApiServiceError(
            code="no_clinic",
            message="User is not associated with a clinic.",
            status_code=404,
        )
    clinic = db.scalar(select(Clinic).where(Clinic.id == user.clinic_id))
    if clinic is None:
        raise ApiServiceError(
            code="clinic_not_found",
            message="Clinic referenced by user no longer exists.",
            status_code=404,
        )
    return clinic


def _save_logo(clinic_id: str, upload_bytes: bytes) -> str:
    """Pad-to-square then resize to 512x512 WEBP. Aspect ratio preserved —
    short side is padded with white (background=#FFFFFF).
    """
    if len(upload_bytes) > _MAX_LOGO_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message="Logo must be <= 2MB.",
            status_code=413,
        )
    try:
        img = Image.open(BytesIO(upload_bytes))
        img.load()
    except Exception:
        raise ApiServiceError(
            code="invalid_image",
            message="Uploaded file is not a valid image.",
            status_code=400,
        )
    img = img.convert("RGB")
    # Fit inside a 512 square while preserving aspect.
    img.thumbnail((512, 512), Image.LANCZOS)
    # Pad to exactly 512x512 with white background.
    canvas = Image.new("RGB", (512, 512), (255, 255, 255))
    offset = ((512 - img.width) // 2, (512 - img.height) // 2)
    canvas.paste(img, offset)
    _CLINIC_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    out_path = _CLINIC_LOGO_DIR / f"{clinic_id}.webp"
    canvas.save(out_path, "WEBP", quality=90)
    return f"/static/clinics/{clinic_id}.webp"


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=ClinicResponse)
@router.get("/", response_model=ClinicResponse, include_in_schema=False)
def get_clinic(
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> ClinicResponse:
    """Return the caller's clinic. 404 when the user has no clinic_id."""
    clinic = _load_user_clinic(db, user)
    return _to_response(clinic)


@router.post("", response_model=ClinicResponse, status_code=201)
@router.post("/", response_model=ClinicResponse, status_code=201, include_in_schema=False)
def create_clinic(
    body: ClinicCreateRequest,
    user: User = Depends(auth_service.current_user),
    db: Session = Depends(get_db_session),
) -> ClinicResponse:
    """Create a clinic and associate the caller with it as `admin`.

    Fails if the user already has a clinic_id — use PATCH to edit, or
    have the admin remove the user from their current clinic first.
    """
    if user.clinic_id:
        raise ApiServiceError(
            code="already_in_clinic",
            message="User is already associated with a clinic.",
            warnings=["Leave your current clinic before creating a new one."],
            status_code=409,
        )
    name = (body.name or "").strip()
    if not name:
        raise ApiServiceError(
            code="invalid_clinic_name",
            message="Clinic name is required.",
            status_code=400,
        )

    specialties_blob = (
        json.dumps(body.specialties) if body.specialties is not None else None
    )

    clinic = Clinic(
        name=name[:255],
        address=body.address,
        phone=body.phone,
        email=body.email,
        website=body.website,
        timezone=(body.timezone or "UTC")[:64],
        specialties=specialties_blob,
    )
    db.add(clinic)
    db.flush()  # populate clinic.id

    user.clinic_id = clinic.id
    user.role = "admin"
    db.commit()
    db.refresh(clinic)
    return _to_response(clinic)


@router.patch("", response_model=ClinicResponse)
@router.patch("/", response_model=ClinicResponse, include_in_schema=False)
def update_clinic(
    body: ClinicUpdateRequest,
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> ClinicResponse:
    """Partial update of clinic fields. Admin only."""
    clinic = _load_user_clinic(db, user)

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ApiServiceError(
                code="invalid_clinic_name",
                message="Clinic name cannot be empty.",
                status_code=400,
            )
        clinic.name = name[:255]
    if body.address is not None:
        clinic.address = body.address or None
    if body.phone is not None:
        clinic.phone = body.phone or None
    if body.email is not None:
        clinic.email = body.email or None
    if body.website is not None:
        clinic.website = body.website or None
    if body.timezone is not None:
        tz = body.timezone.strip()
        if not tz:
            raise ApiServiceError(
                code="invalid_timezone",
                message="Timezone cannot be empty.",
                status_code=400,
            )
        clinic.timezone = tz[:64]
    if body.specialties is not None:
        clinic.specialties = json.dumps(body.specialties)

    db.commit()
    db.refresh(clinic)
    return _to_response(clinic)


@router.post("/logo", response_model=LogoResponse)
async def upload_logo(
    file: UploadFile = File(...),
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> LogoResponse:
    """Upload clinic logo (admin only). Padded to 512x512 WEBP."""
    if file.content_type and not file.content_type.startswith("image/"):
        raise ApiServiceError(
            code="invalid_content_type",
            message="Logo must be an image.",
            status_code=400,
        )
    clinic = _load_user_clinic(db, user)
    data = await file.read()
    url = _save_logo(clinic.id, data)
    clinic.logo_url = url
    db.commit()
    return LogoResponse(logo_url=url)


@router.put("/working-hours", response_model=WorkingHoursResponse)
def set_working_hours(
    body: WorkingHoursRequest,
    user: User = Depends(auth_service.current_clinic_admin),
    db: Session = Depends(get_db_session),
) -> WorkingHoursResponse:
    """Replace the clinic's weekly schedule. Stored as JSON in
    `Clinic.working_hours`. Admin only.
    """
    clinic = _load_user_clinic(db, user)
    # Serialise with by_alias so `from_` → `from` in the stored JSON, matching
    # the API-facing shape `{open, from, to}`.
    payload = body.model_dump(by_alias=True)
    clinic.working_hours = json.dumps(payload)
    db.commit()
    return WorkingHoursResponse(working_hours=payload)

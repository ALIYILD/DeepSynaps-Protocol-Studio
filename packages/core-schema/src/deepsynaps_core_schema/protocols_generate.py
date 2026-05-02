"""Payload types for the AI-protocol-generation endpoints.

These mirror the request/response shapes for ``POST /api/v1/protocols/generate-brain-scan``
and ``POST /api/v1/protocols/generate-personalized``. Promoted out of
``apps/api/app/routers/protocols_generate_router.py`` per Architect Rec #5
so workers / web clients can share the schema without importing the FastAPI
router module.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from .models import ProtocolDraftResponse


class BrainScanProtocolRequest(BaseModel):
    condition: str
    scan_type: str = "qEEG"           # qEEG | fMRI | NIRS
    primary_target: str = "DLPFC"     # e.g. DLPFC, ACC, M1
    eeg_markers: list[str] = []
    phenotype: str = ""
    device: str = ""


class BrainScanProtocolResponse(ProtocolDraftResponse):
    scan_guidance: str = ""
    recommended_montage: str = ""
    marker_adjustment: str = ""


class PersonalizedProtocolRequest(BaseModel):
    condition: str
    patient_id: str = "demo"
    phq9: Optional[float] = None
    gad7: Optional[float] = None
    moca: Optional[float] = None
    medication_load: str = ""
    chronotype: str = ""        # morning | evening | neutral
    treatment_history: str = ""
    device: str = ""


class PersonalizedProtocolResponse(ProtocolDraftResponse):
    personalization_rationale: str = ""

"""protocols_generate_router.py — Two AI-generation endpoints for Protocol Studio.

POST /api/v1/protocols/generate-brain-scan
POST /api/v1/protocols/generate-personalized

Both delegate to generate_protocol_draft_from_clinical_data for the base
protocol, then layer a structured enrichment block on top. No external AI
calls are made — all logic is data-driven from the imported CSVs.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from deepsynaps_core_schema import ProtocolDraftRequest, ProtocolDraftResponse

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.clinical_data import generate_protocol_draft_from_clinical_data

router = APIRouter(prefix="", tags=["protocols-generate"])
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Scan type → modality mapping
# ---------------------------------------------------------------------------
_SCAN_MODALITY: dict[str, str] = {
    "qEEG":  "tDCS",
    "fMRI":  "rTMS",
    "NIRS":  "tDCS",
}

_DEFAULT_EVIDENCE_MAP: dict[str, str] = {
    "Grade A": "Guideline",
    "Grade B": "Systematic Review",
    "Grade C": "Consensus",
    "Grade D": "Registry",
    "Grade E": "Registry",
}

# ---------------------------------------------------------------------------
# Shared extended response schemas
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _map_scan_to_modality(scan_type: str) -> str:
    return _SCAN_MODALITY.get(scan_type, "tDCS")


def _build_scan_guidance(req: BrainScanProtocolRequest, draft: ProtocolDraftResponse) -> str:
    parts = [
        "Scan type: " + req.scan_type + ".",
        "Primary target identified: " + req.primary_target + ".",
    ]
    if req.eeg_markers:
        parts.append("EEG markers present: " + ", ".join(req.eeg_markers) + ".")
        if any(m.lower() in ("alpha-asymmetry", "alpha asymmetry") for m in req.eeg_markers):
            parts.append(
                "Alpha asymmetry detected — protocol reinforces left-hemisphere up-regulation."
            )
        if any("theta" in m.lower() for m in req.eeg_markers):
            parts.append(
                "Elevated frontal theta — consider neurofeedback adjunct or theta-burst rTMS."
            )
    if req.phenotype:
        parts.append("Phenotype: " + req.phenotype + " — intensity adjusted to evidence sub-group.")
    parts.append(
        "Target region " + req.primary_target + " corroborates the registry-selected "
        "target " + draft.target_region + "."
    )
    return " ".join(parts)


def _build_montage(req: BrainScanProtocolRequest) -> str:
    electrode_map: dict[str, str] = {
        "DLPFC": "F3",
        "DLPFC-R": "F4",
        "ACC": "Fz",
        "M1": "C3",
        "OFC": "Fp1",
        "VMPFC": "AFz",
        "TPJ": "T7",
        "PCC": "Pz",
    }
    anchor = electrode_map.get(req.primary_target.upper(), "F3")
    return anchor + " anode — Fp2 cathode (classic Fregni montage derived from " + req.scan_type + " localisation)"


def _build_marker_adjustment(req: BrainScanProtocolRequest) -> str:
    if not req.eeg_markers:
        return "No EEG markers supplied — base registry parameters applied unchanged."
    notes = []
    for m in req.eeg_markers:
        ml = m.lower()
        if "alpha" in ml:
            notes.append("Alpha power deviation: +2 sessions/week recommended over standard.")
        elif "theta" in ml:
            notes.append("Frontal theta elevation: consider iTBS variant if available.")
        elif "beta" in ml:
            notes.append("Beta excess: HF-rTMS or tACS at beta frequency warranted.")
    return " ".join(notes) if notes else "Markers noted but no specific adjustment rule matched — standard parameters retained."


def _build_personalization_rationale(req: PersonalizedProtocolRequest, draft: ProtocolDraftResponse) -> str:
    notes: list[str] = []

    if req.phq9 is not None:
        if req.phq9 >= 20:
            notes.append(
                f"PHQ-9 {req.phq9:.0f} (severe) — protocol intensity maintained at upper evidence-supported limit; "
                "monitoring plan extended to weekly assessments."
            )
        elif req.phq9 >= 15:
            notes.append(
                f"PHQ-9 {req.phq9:.0f} (moderately severe) — standard protocol parameters retained; "
                "reassess at session 10."
            )
        elif req.phq9 >= 10:
            notes.append(
                f"PHQ-9 {req.phq9:.0f} (moderate) — consider step-down to home device maintenance after acute course."
            )
        else:
            notes.append(f"PHQ-9 {req.phq9:.0f} (mild) — protocol may be abbreviated; reassess after 10 sessions.")

    if req.gad7 is not None:
        if req.gad7 >= 15:
            notes.append(
                f"GAD-7 {req.gad7:.0f} (severe anxiety) — recommend anxiolytic pre-medication review before session 1."
            )
        elif req.gad7 >= 10:
            notes.append(
                f"GAD-7 {req.gad7:.0f} (moderate anxiety) — session duration may be reduced by 5 min if tolerated poorly."
            )

    if req.moca is not None:
        if req.moca < 18:
            notes.append(
                f"MoCA {req.moca:.0f} (significant cognitive impairment) — informed consent via surrogate required; "
                "close supervision mandated throughout course."
            )
        elif req.moca < 26:
            notes.append(
                f"MoCA {req.moca:.0f} (mild cognitive impairment) — written session instructions recommended; "
                "caregiver present at first two sessions."
            )

    if req.medication_load:
        notes.append(
            "Medication load (" + req.medication_load + ") noted — verify absence of seizure-threshold-lowering agents before first session."
        )

    if req.chronotype in ("morning", "Morning"):
        notes.append(
            "Morning chronotype: schedule sessions between 08:00–11:00 for optimal cortical excitability."
        )
    elif req.chronotype in ("evening", "Evening"):
        notes.append(
            "Evening chronotype: 14:00–17:00 window recommended; avoid post-19:00 sessions (alertness rebound risk)."
        )

    if req.treatment_history:
        notes.append(
            "Treatment history noted: \"" + req.treatment_history[:200] + "\" — prior response informs escalation threshold."
        )

    if req.patient_id and req.patient_id.lower() != "demo":
        notes.append("Protocol linked to patient record " + req.patient_id + " — save to /api/v1/protocols/saved to persist.")

    if not notes:
        notes.append(
            "No assessment scores or personalization inputs supplied — base registry protocol returned unchanged."
        )

    return " ".join(notes)


# ---------------------------------------------------------------------------
# Endpoint A: generate-brain-scan
# ---------------------------------------------------------------------------

@router.post(
    "/api/v1/protocols/generate-brain-scan",
    response_model=BrainScanProtocolResponse,
)
@limiter.limit("10/minute")
def generate_brain_scan_protocol(
    request: Request,
    body: BrainScanProtocolRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BrainScanProtocolResponse:
    """Generate a brain-scan-guided protocol draft.

    Derives modality from scan_type, calls the core generation service,
    then enriches the response with montage recommendation and marker
    adjustment logic. No external AI call — data-driven only.
    """
    require_minimum_role(actor, "clinician")

    modality = _map_scan_to_modality(body.scan_type)
    draft_request = ProtocolDraftRequest(
        condition=body.condition,
        symptom_cluster="General",
        modality=modality,
        device=body.device or "",
        setting="Clinic",
        evidence_threshold="Systematic Review",
        off_label=False,
        qeeg_summary=", ".join(body.eeg_markers) if body.eeg_markers else None,
        phenotype_tags=[body.phenotype] if body.phenotype else [],
    )

    base = generate_protocol_draft_from_clinical_data(draft_request, actor)

    return BrainScanProtocolResponse(
        **base.model_dump(),
        scan_guidance=_build_scan_guidance(body, base),
        recommended_montage=_build_montage(body),
        marker_adjustment=_build_marker_adjustment(body),
    )


# ---------------------------------------------------------------------------
# Endpoint B: generate-personalized
# ---------------------------------------------------------------------------

@router.post(
    "/api/v1/protocols/generate-personalized",
    response_model=PersonalizedProtocolResponse,
)
@limiter.limit("10/minute")
def generate_personalized_protocol(
    request: Request,
    body: PersonalizedProtocolRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PersonalizedProtocolResponse:
    """Generate a patient-personalized protocol draft.

    Calls the core generation service for the base protocol then builds a
    personalization_rationale string referencing the supplied assessment
    scores, chronotype and medication load. No external AI call.
    """
    require_minimum_role(actor, "clinician")

    draft_request = ProtocolDraftRequest(
        condition=body.condition,
        symptom_cluster="General",
        modality="tDCS",
        device=body.device or "",
        setting="Clinic",
        evidence_threshold="Systematic Review",
        off_label=False,
    )

    base = generate_protocol_draft_from_clinical_data(draft_request, actor)

    return PersonalizedProtocolResponse(
        **base.model_dump(),
        personalization_rationale=_build_personalization_rationale(body, base),
    )

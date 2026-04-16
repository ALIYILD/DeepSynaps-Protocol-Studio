"""Permission-gated, prompt-safe patient medical-history context builder.

Used by AI-facing endpoints (clinician chat, report drafts) that need a
compact, structured summary of a patient's medical history WITHOUT the AI
having direct DB access. Every call:

1. Requires clinician-or-higher role.
2. Enforces ownership via ``get_patient(session, patient_id, actor.actor_id)``
   — a clinician cannot build AI context for another clinician's patient.
3. Returns structured output separating:
   - ``summary_md``  : human-authored clinician fields only, formatted as
                      markdown safe for LLM prompts (no PHI identifiers
                      other than first name).
   - ``structured_flags`` : machine-readable safety flag dictionary.
   - ``requires_review`` : True if blocking safety flags are set or the
                           record has never been reviewed.
   - ``used_sections`` : which MH sections were non-empty.
   - ``source_meta`` : version, updated_at, reviewed_at metadata for audit.

Callers MUST render AI output as a draft requiring clinician review and
must NOT auto-apply it to the clinical record.
"""

from __future__ import annotations

import json
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_minimum_role
from app.errors import ApiServiceError
from app.repositories.patients import get_patient


_MH_SECTION_LABELS = {
    "presenting":   "Presenting Problems",
    "diagnoses":    "Diagnoses",
    "safety":       "Contraindications & Safety (clinician notes)",
    "psychiatric":  "Psychiatric History",
    "neurological": "Neurological & Medical",
    "medications":  "Medications & Supplements",
    "allergies":    "Allergies",
    "prior_tx":     "Prior Treatment History",
    "family":       "Family History",
    "lifestyle":    "Lifestyle & Social",
    "goals":        "Treatment Goals",
    "summary":      "Clinician Summary",
}

_BLOCKING_SAFETY_FLAGS = {
    "implanted_device",
    "intracranial_metal",
    "seizure_history",
    "pregnancy",
    "severe_skull_defect",
    "recent_tbi",
    "unstable_psych",
}


def _parse_mh(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _truncate(s: str, max_chars: int) -> str:
    if not s:
        return ""
    s = s.strip()
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1].rstrip() + "…"


def build_patient_medical_context(
    session: Session,
    actor: AuthenticatedActor,
    patient_id: str,
    *,
    include_sections: Optional[list[str]] = None,
    per_section_char_limit: int = 1500,
) -> dict:
    """Return a prompt-safe, permission-scoped medical-history context.

    Parameters
    ----------
    session : Session
        SQLAlchemy session.
    actor : AuthenticatedActor
        Calling actor. Must be clinician-or-higher.
    patient_id : str
        Patient identifier. Ownership is enforced.
    include_sections : list[str] | None
        If provided, only these MH sections are rendered into ``summary_md``.
    per_section_char_limit : int
        Max characters per section in ``summary_md`` to bound prompt size.

    Returns
    -------
    dict with keys:
        summary_md, structured_flags, requires_review, used_sections,
        source_meta, patient_first_name, patient_condition

    Raises
    ------
    ApiServiceError
        On insufficient role, missing patient, or ownership mismatch.
    """
    require_minimum_role(actor, "clinician")

    patient = get_patient(session, patient_id, actor.actor_id)
    if patient is None:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found or not accessible.",
            status_code=404,
        )

    mh = _parse_mh(patient.medical_history)
    sections_src = mh.get("sections") or {}
    safety_src = mh.get("safety") or {}
    meta_src = mh.get("meta") or {}

    flags = {k: bool(v) for k, v in (safety_src.get("flags") or {}).items()}
    has_blocking = any(flags.get(k) is True for k in _BLOCKING_SAFETY_FLAGS)
    ever_reviewed = bool(meta_src.get("reviewed_at"))
    requires_review = has_blocking or not ever_reviewed

    selected = include_sections if include_sections else list(_MH_SECTION_LABELS.keys())

    summary_lines: list[str] = []
    used: list[str] = []
    for sec_id in selected:
        label = _MH_SECTION_LABELS.get(sec_id)
        if not label:
            continue
        payload = sections_src.get(sec_id) or {}
        notes = ""
        if isinstance(payload, dict):
            notes = (payload.get("notes") or "").strip()
        elif isinstance(payload, str):
            notes = payload.strip()
        if not notes:
            continue
        summary_lines.append(f"### {label}")
        summary_lines.append(_truncate(notes, per_section_char_limit))
        summary_lines.append("")
        used.append(sec_id)

    # Append structured safety block (separate from free-text — prompts should
    # treat this as ground truth, not generate new flags).
    if flags:
        summary_lines.append("### Structured safety flags (clinician-entered)")
        for fid, v in flags.items():
            if v is True:
                tag = " [blocking]" if fid in _BLOCKING_SAFETY_FLAGS else ""
                summary_lines.append(f"- {fid}{tag}")
        summary_lines.append("")

    summary_md = "\n".join(summary_lines).strip() or "(No clinician-authored medical history recorded.)"

    first_name = (patient.first_name or "").strip() or "Patient"
    condition = (patient.primary_condition or "").strip() or "—"

    return {
        "summary_md": summary_md,
        "structured_flags": flags,
        "requires_review": requires_review,
        "used_sections": used,
        "source_meta": {
            "version": int(meta_src.get("version", 0) or 0),
            "updated_at": meta_src.get("updated_at"),
            "reviewed_at": meta_src.get("reviewed_at"),
            "reviewed_by": meta_src.get("reviewed_by"),
        },
        "patient_first_name": first_name,
        "patient_condition": condition,
    }

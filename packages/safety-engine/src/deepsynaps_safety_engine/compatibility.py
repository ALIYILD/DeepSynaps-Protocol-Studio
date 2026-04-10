from pydantic import BaseModel

from deepsynaps_core_schema import DeviceProfile, ModalityProfile


class CompatibilityResult(BaseModel):
    is_compatible: bool
    reasons: list[str]


def validate_modality_device(
    modality: ModalityProfile,
    device: DeviceProfile,
) -> CompatibilityResult:
    reasons: list[str] = []
    is_compatible = True

    if device.slug not in modality.supported_device_slugs:
        reasons.append(f"Modality '{modality.slug}' does not list device '{device.slug}'.")
        is_compatible = False

    if modality.slug not in device.supported_modality_slugs:
        reasons.append(f"Device '{device.slug}' does not support modality '{modality.slug}'.")
        is_compatible = False

    if is_compatible:
        reasons.append("Selected modality and device are compatible at the registry level.")

    return CompatibilityResult(is_compatible=is_compatible, reasons=reasons)


def check_contraindications(
    condition_contraindications: str,
    modality_slug: str,  # noqa: ARG001 — kept for forward-compatible filtering
) -> list[str]:
    """Parse the ``Contraindication_Alerts`` field from conditions.csv and
    return a list of contraindication warning strings.

    All items are returned for clinician review.  The ``modality_slug``
    parameter is accepted for API stability and future modality-specific
    filtering.

    Parameters
    ----------
    condition_contraindications:
        The raw semicolon-separated string from the ``Contraindication_Alerts``
        column of conditions.csv.
    modality_slug:
        The modality slug (e.g. ``"rtms"``, ``"tdcs"``).  Currently not used
        to filter items — all contraindications are surfaced.

    Returns
    -------
    list[str]
        Individual contraindication strings, stripped of surrounding whitespace.
        Empty list if input is empty or blank.
    """
    if not condition_contraindications or not condition_contraindications.strip():
        return []
    return [s.strip() for s in condition_contraindications.split(";") if s.strip()]


def apply_governance_rules(
    on_label: bool,
    evidence_grade: str,
    actor_role: str,
) -> list[str]:
    """Return governance warning messages based on rules from governance_rules.csv.

    Implements the following rules:

    * GOV-001 — Off-label protocol requires clinician role.
    * GOV-002 — EV-D evidence blocks patient-facing export.
    * GOV-003 — EV-C off-label requires clinician review and informed consent.

    Parameters
    ----------
    on_label:
        ``True`` when the protocol's ``On_Label_vs_Off_Label`` field starts
        with ``"On-label"``.
    evidence_grade:
        Raw evidence grade string from the CSV (e.g. ``"EV-A"``, ``"EV-C"``).
    actor_role:
        The requesting user's role string (``"guest"``, ``"clinician"``,
        ``"admin"``).

    Returns
    -------
    list[str]
        Zero or more warning messages.  An empty list means no governance flags
        were triggered.
    """
    warnings: list[str] = []
    grade = evidence_grade.strip().upper()

    # GOV-002: EV-D evidence is blocked entirely
    if grade == "EV-D":
        warnings.append(
            "EV-D evidence level: this protocol is blocked by governance rules."
        )
        return warnings  # Hard block — no further checks needed

    # GOV-001: Off-label requires clinician or admin
    if not on_label and actor_role not in {"clinician", "admin"}:
        warnings.append(
            "Off-label protocol requires clinician authorization."
        )

    # GOV-003: EV-C off-label requires clinician review and informed consent
    if grade == "EV-C" and not on_label:
        warnings.append(
            "EV-C off-label: requires clinician review and informed consent."
        )

    return warnings

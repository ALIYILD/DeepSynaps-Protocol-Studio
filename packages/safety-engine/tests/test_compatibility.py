"""Tests for deepsynaps_safety_engine.compatibility.

Locks the contract for clinical safety gates:
  - validate_modality_device — registry-level modality/device pairing
  - check_contraindications — semicolon-list parsing of CSV input
  - apply_governance_rules — GOV-001 / GOV-002 / GOV-003 enforcement
"""

from __future__ import annotations

import pytest

from deepsynaps_core_schema import DeviceProfile, ModalityProfile
from deepsynaps_safety_engine import (
    CompatibilityResult,
    apply_governance_rules,
    check_contraindications,
    validate_modality_device,
)


# ───────────────────────────── fixtures ─────────────────────────────────────


def _modality(slug: str = "rtms", devices: list[str] | None = None) -> ModalityProfile:
    return ModalityProfile(
        slug=slug,
        name=slug.upper(),
        treatment_family="neuromodulation",
        supported_device_slugs=devices or ["magventure-mag-pro"],
    )


def _device(slug: str = "magventure-mag-pro", modalities: list[str] | None = None) -> DeviceProfile:
    return DeviceProfile(
        slug=slug,
        name="MagVenture MagPro",
        manufacturer="MagVenture",
        supported_modality_slugs=modalities or ["rtms"],
    )


# ───────────────────────────── validate_modality_device ─────────────────────


class TestValidateModalityDevice:
    def test_compatible_pair_passes(self) -> None:
        result = validate_modality_device(_modality(), _device())
        assert result.is_compatible is True
        assert any("compatible at the registry level" in r for r in result.reasons)

    def test_returns_compatibility_result(self) -> None:
        result = validate_modality_device(_modality(), _device())
        assert isinstance(result, CompatibilityResult)

    def test_modality_does_not_list_device(self) -> None:
        modality = _modality(devices=["other-device"])
        result = validate_modality_device(modality, _device())
        assert result.is_compatible is False
        assert any("does not list device" in r for r in result.reasons)

    def test_device_does_not_support_modality(self) -> None:
        device = _device(modalities=["other-modality"])
        result = validate_modality_device(_modality(), device)
        assert result.is_compatible is False
        assert any("does not support modality" in r for r in result.reasons)

    def test_both_directions_mismatched_returns_two_reasons(self) -> None:
        modality = _modality(devices=["other-device"])
        device = _device(modalities=["other-modality"])
        result = validate_modality_device(modality, device)
        assert result.is_compatible is False
        assert len(result.reasons) == 2

    def test_compatible_pair_returns_exactly_one_reason(self) -> None:
        result = validate_modality_device(_modality(), _device())
        assert len(result.reasons) == 1


# ───────────────────────────── check_contraindications ──────────────────────


class TestCheckContraindications:
    def test_empty_string_returns_empty_list(self) -> None:
        assert check_contraindications("", "rtms") == []

    def test_whitespace_only_returns_empty_list(self) -> None:
        assert check_contraindications("   \t\n  ", "rtms") == []

    def test_single_item_returns_one_entry(self) -> None:
        result = check_contraindications("Pregnancy", "rtms")
        assert result == ["Pregnancy"]

    def test_semicolon_separated_returns_list(self) -> None:
        result = check_contraindications("Pregnancy;Active seizure disorder", "rtms")
        assert result == ["Pregnancy", "Active seizure disorder"]

    def test_strips_surrounding_whitespace(self) -> None:
        result = check_contraindications("  Pregnancy  ;  Seizures  ", "rtms")
        assert result == ["Pregnancy", "Seizures"]

    def test_drops_empty_segments(self) -> None:
        result = check_contraindications("Pregnancy;;Seizures;", "rtms")
        assert result == ["Pregnancy", "Seizures"]

    def test_drops_whitespace_only_segments(self) -> None:
        result = check_contraindications("Pregnancy; ; Seizures", "rtms")
        assert result == ["Pregnancy", "Seizures"]

    def test_modality_slug_does_not_filter_today(self) -> None:
        # The doc-string for check_contraindications explicitly notes that the
        # modality_slug arg is reserved for future modality-specific filtering
        # and is currently not applied. Pin that contract.
        a = check_contraindications("Pregnancy;Seizures", "rtms")
        b = check_contraindications("Pregnancy;Seizures", "tdcs")
        assert a == b


# ───────────────────────────── apply_governance_rules ───────────────────────


class TestApplyGovernanceRules:
    def test_on_label_clinician_no_warnings(self) -> None:
        warnings = apply_governance_rules(on_label=True, evidence_grade="EV-A", actor_role="clinician")
        assert warnings == []

    # GOV-002 — EV-D blocks entirely.

    def test_ev_d_returns_block_warning_and_short_circuits(self) -> None:
        warnings = apply_governance_rules(on_label=True, evidence_grade="EV-D", actor_role="admin")
        assert len(warnings) == 1
        assert "EV-D" in warnings[0]
        assert "blocked" in warnings[0].lower()

    def test_ev_d_off_label_still_only_returns_block(self) -> None:
        # GOV-002 short-circuits — GOV-001 / GOV-003 must NOT also fire.
        warnings = apply_governance_rules(on_label=False, evidence_grade="EV-D", actor_role="guest")
        assert len(warnings) == 1
        assert "EV-D" in warnings[0]

    def test_ev_d_lowercase_normalised(self) -> None:
        # The implementation upper-cases evidence_grade before matching. Pin.
        warnings = apply_governance_rules(on_label=True, evidence_grade="ev-d", actor_role="clinician")
        assert any("EV-D" in w for w in warnings)

    # GOV-001 — Off-label requires clinician or admin.

    def test_off_label_guest_blocked(self) -> None:
        warnings = apply_governance_rules(on_label=False, evidence_grade="EV-A", actor_role="guest")
        assert any("Off-label protocol requires clinician authorization" in w for w in warnings)

    def test_off_label_clinician_passes_gov_001(self) -> None:
        warnings = apply_governance_rules(on_label=False, evidence_grade="EV-A", actor_role="clinician")
        assert not any("Off-label protocol requires clinician authorization" in w for w in warnings)

    def test_off_label_admin_passes_gov_001(self) -> None:
        warnings = apply_governance_rules(on_label=False, evidence_grade="EV-A", actor_role="admin")
        assert not any("Off-label protocol requires clinician authorization" in w for w in warnings)

    # GOV-003 — EV-C off-label requires clinician review and informed consent.

    def test_ev_c_off_label_emits_consent_warning(self) -> None:
        warnings = apply_governance_rules(on_label=False, evidence_grade="EV-C", actor_role="clinician")
        assert any(
            "informed consent" in w and "EV-C" in w
            for w in warnings
        )

    def test_ev_c_on_label_no_consent_warning(self) -> None:
        warnings = apply_governance_rules(on_label=True, evidence_grade="EV-C", actor_role="clinician")
        assert not any("informed consent" in w for w in warnings)

    def test_ev_c_off_label_guest_emits_both_gov_001_and_gov_003(self) -> None:
        warnings = apply_governance_rules(on_label=False, evidence_grade="EV-C", actor_role="guest")
        # Both GOV-001 (off-label / not-clinician) and GOV-003 (EV-C off-label) fire.
        assert any("Off-label protocol requires clinician" in w for w in warnings)
        assert any("informed consent" in w for w in warnings)
        assert len(warnings) == 2

    @pytest.mark.parametrize(
        "grade,actor_role,on_label,expected_count",
        [
            ("EV-A", "clinician", True, 0),
            ("EV-A", "admin", True, 0),
            ("EV-B", "clinician", True, 0),
            ("EV-A", "guest", True, 0),
            ("EV-C", "clinician", True, 0),
            ("EV-A", "guest", False, 1),  # GOV-001
            ("EV-C", "guest", False, 2),  # GOV-001 + GOV-003
            ("EV-D", "admin", True, 1),  # GOV-002 short-circuit
            ("EV-D", "guest", False, 1),  # GOV-002 short-circuit
        ],
    )
    def test_governance_matrix(
        self,
        grade: str,
        actor_role: str,
        on_label: bool,
        expected_count: int,
    ) -> None:
        warnings = apply_governance_rules(on_label=on_label, evidence_grade=grade, actor_role=actor_role)
        assert len(warnings) == expected_count, (
            f"grade={grade}, actor={actor_role}, on_label={on_label} → {warnings}"
        )

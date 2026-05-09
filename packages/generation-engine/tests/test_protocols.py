"""Tests for deepsynaps_generation_engine.protocols.

The generation engine is a deterministic builder: registry profiles +
optional protocol params → ProtocolPlan / ClinicianHandbookPlan /
ReportPayload. No LLM composition. Pin every branch so a refactor can't
silently change the registry-only contract.
"""

from __future__ import annotations

import pytest

from deepsynaps_core_schema import (
    ClinicianHandbookPlan,
    ConditionProfile,
    DeviceProfile,
    ModalityProfile,
    ProtocolPlan,
    SessionStructure,
)
from deepsynaps_generation_engine import (
    build_clinician_handbook_plan,
    build_protocol_plan,
    build_report_payload_from_protocol,
    build_session_structure,
)
from deepsynaps_generation_engine.protocols import _modality_defaults, _parse_int
from deepsynaps_render_engine import ReportPayload
from deepsynaps_safety_engine import CompatibilityResult


# ───────────────────────────── helpers ──────────────────────────────────────


def _condition() -> ConditionProfile:
    return ConditionProfile(
        slug="mdd",
        name="Major Depressive Disorder",
        contraindications=["Active seizures"],
        phenotypes=["Treatment-resistant"],
    )


def _modality(slug: str = "rtms") -> ModalityProfile:
    return ModalityProfile(
        slug=slug,
        name=slug.upper(),
        treatment_family="neuromodulation",
        supported_device_slugs=["magventure-mag-pro"],
        safety_notes=["No metallic implants near coil"],
    )


def _device() -> DeviceProfile:
    return DeviceProfile(
        slug="magventure-mag-pro",
        name="MagVenture MagPro",
        manufacturer="MagVenture",
        supported_modality_slugs=["rtms"],
    )


def _compat() -> CompatibilityResult:
    return CompatibilityResult(is_compatible=True, reasons=["registry compatible"])


# ───────────────────────────── _parse_int ──────────────────────────────────


class TestParseInt:
    @pytest.mark.parametrize(
        "text,default,expected",
        [
            ("20-30 sessions over 4-6 weeks", 0, 20),
            ("5 (daily weekday)", 0, 5),
            ("37.5 minutes", 0, 37),  # extracts "37" before the dot
            ("no digits here", 99, 99),
            ("", 7, 7),
            ("1000mA", 0, 1000),
            ("0", 99, 0),
        ],
    )
    def test_parse_int(self, text: str, default: int, expected: int) -> None:
        assert _parse_int(text, default) == expected


# ───────────────────────────── _modality_defaults ──────────────────────────


class TestModalityDefaults:
    @pytest.mark.parametrize(
        "slug,expected",
        [
            ("rtms", (25, 5, 38)),
            ("itbs", (25, 5, 5)),
            ("tdcs", (20, 5, 30)),
            ("ces", (30, 7, 20)),
            ("tavns", (12, 5, 30)),
            ("neurofeedback", (30, 2, 45)),
            ("tps", (6, 1, 30)),
            ("pbm", (12, 3, 20)),
            # Unknown slug uses the generic fallback.
            ("brand-new-modality", (20, 3, 40)),
        ],
    )
    def test_known_and_unknown(self, slug: str, expected: tuple[int, int, int]) -> None:
        assert _modality_defaults(slug) == expected

    def test_uppercase_slug_normalised(self) -> None:
        # Spec uses lower(); pin so a refactor can't break case-insensitivity.
        assert _modality_defaults("RTMS") == (25, 5, 38)


# ───────────────────────────── build_session_structure ─────────────────────


class TestBuildSessionStructure:
    def test_default_modality_path(self) -> None:
        ss = build_session_structure(
            _condition(), _modality("rtms"), _device(), "mild",
        )
        assert isinstance(ss, SessionStructure)
        assert ss.total_sessions == 25  # rTMS default
        assert ss.sessions_per_week == 5
        assert ss.session_duration_minutes == 38
        assert len(ss.steps) == 4
        assert ss.steps[0].order == 1
        assert "Pre-session safety review" in ss.steps[0].title

    def test_protocol_params_override_defaults(self) -> None:
        params = {
            "total_sessions": "30 (over 6 weeks)",
            "sessions_per_week": "7 (daily)",
            "session_duration_minutes": "45 minutes",
        }
        ss = build_session_structure(
            _condition(), _modality(), _device(), "mild", params,
        )
        assert ss.total_sessions == 30
        assert ss.sessions_per_week == 7
        assert ss.session_duration_minutes == 45

    def test_setup_step_carries_coil_freq_intensity(self) -> None:
        ss = build_session_structure(
            _condition(), _modality(), _device(), "x",
            {
                "coil_placement": "L-DLPFC",
                "frequency_hz": "10",
                "intensity": "120% MT",
            },
        )
        setup_detail = ss.steps[1].detail
        assert "L-DLPFC" in setup_detail
        assert "10 Hz" in setup_detail
        assert "120% MT" in setup_detail
        assert _device().name in setup_detail

    def test_treatment_step_uses_target_when_provided(self) -> None:
        ss = build_session_structure(
            _condition(), _modality(), _device(), "x",
            {"target_region": "Left DLPFC"},
        )
        assert "Left DLPFC" in ss.steps[2].detail

    def test_treatment_step_falls_back_to_generic_when_no_target(self) -> None:
        ss = build_session_structure(
            _condition(), _modality(), _device(), "x",
        )
        assert "target region" in ss.steps[2].detail

    def test_post_session_uses_monitoring_when_provided(self) -> None:
        ss = build_session_structure(
            _condition(), _modality(), _device(), "x",
            {"monitoring_requirements": "BP and HR every 5 min"},
        )
        assert "BP and HR every 5 min" in ss.steps[3].detail

    def test_post_session_default_when_no_monitoring(self) -> None:
        ss = build_session_structure(
            _condition(), _modality(), _device(), "x",
        )
        assert "tolerability" in ss.steps[3].detail


# ───────────────────────────── build_protocol_plan ─────────────────────────


class TestBuildProtocolPlan:
    def test_returns_protocol_plan(self) -> None:
        plan = build_protocol_plan(
            _condition(), _modality(), _device(), "x", _compat(),
        )
        assert isinstance(plan, ProtocolPlan)
        assert plan.condition_slug == "mdd"
        assert plan.modality_slug == "rtms"
        assert plan.device_slug == "magventure-mag-pro"
        assert plan.phenotype == "x"

    def test_support_basis_lists_all_three_registries(self) -> None:
        plan = build_protocol_plan(
            _condition(), _modality(), _device(), "x", _compat(),
        )
        assert any("Condition registry: mdd" in s for s in plan.support_basis)
        assert any("Modality registry: rtms" in s for s in plan.support_basis)
        assert any("Device registry: magventure-mag-pro" in s for s in plan.support_basis)

    def test_safety_notes_carry_modality_notes(self) -> None:
        plan = build_protocol_plan(
            _condition(), _modality(), _device(), "x", _compat(),
        )
        assert any("metallic implants" in s.lower() for s in plan.safety_notes)

    def test_protocol_params_extend_safety_notes(self) -> None:
        plan = build_protocol_plan(
            _condition(), _modality(), _device(), "x", _compat(),
            {"escalation_rules": "Stop on seizure"},
        )
        assert any("Stop on seizure" in s for s in plan.safety_notes)

    def test_protocol_params_extend_contraindications(self) -> None:
        plan = build_protocol_plan(
            _condition(), _modality(), _device(), "x", _compat(),
            {"adverse_event_monitoring": "Watch for severe headache"},
        )
        assert any("severe headache" in c for c in plan.contraindications)

    def test_compatibility_reasons_become_checks(self) -> None:
        plan = build_protocol_plan(
            _condition(), _modality(), _device(), "x",
            CompatibilityResult(is_compatible=True, reasons=["check 1", "check 2"]),
        )
        assert plan.checks == ["check 1", "check 2"]


# ───────────────────────────── build_clinician_handbook_plan ───────────────


class TestBuildClinicianHandbookPlan:
    def test_returns_handbook_plan(self) -> None:
        plan = build_clinician_handbook_plan(
            _condition(), _modality(), _device(), "x",
        )
        assert isinstance(plan, ClinicianHandbookPlan)
        assert plan.audience == "clinician"

    def test_sections_include_all_expected_titles(self) -> None:
        plan = build_clinician_handbook_plan(
            _condition(), _modality(), _device(), "x",
        )
        section_titles = [s.title for s in plan.sections]
        assert any("Eligibility" in t for t in section_titles)
        assert any("Safety" in t for t in section_titles)
        assert any("Monitoring" in t for t in section_titles)
        assert any("Session delivery" in t for t in section_titles)

    def test_protocol_params_extend_safety_section(self) -> None:
        plan = build_clinician_handbook_plan(
            _condition(), _modality(), _device(), "x",
            {"escalation_rules": "Stop on seizure"},
        )
        assert any("Stop on seizure" in s for s in plan.safety_notes)


# ───────────────────────────── build_report_payload_from_protocol ──────────


class TestBuildReportPayloadFromProtocol:
    def _plan(self) -> ProtocolPlan:
        return build_protocol_plan(
            _condition(), _modality(), _device(), "treatment-resistant", _compat(),
        )

    def test_returns_report_payload(self) -> None:
        payload = build_report_payload_from_protocol(self._plan())
        assert isinstance(payload, ReportPayload)
        assert payload.title

    def test_payload_has_sections(self) -> None:
        payload = build_report_payload_from_protocol(self._plan())
        assert payload.sections
        assert all(s.section_id for s in payload.sections)
        assert all(s.title for s in payload.sections)

    def test_payload_schema_id_set(self) -> None:
        payload = build_report_payload_from_protocol(self._plan())
        assert payload.schema_id == "deepsynaps.report-payload/v1"

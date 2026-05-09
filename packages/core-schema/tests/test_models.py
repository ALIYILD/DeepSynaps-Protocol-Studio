"""Smoke tests for deepsynaps_core_schema.models — the legacy/registry-facing
domain models that every other package depends on.

This file is intentionally narrow: it pins the import surface, the field
shapes the registries depend on, and the input-tolerance the registry loaders
rely on (e.g. ConditionProfile.contraindications must accept both flat
list[str] and the structured {"absolute": [...], "relative": [...]} dict).

The richer Pydantic models (treatment_courses, assessments_v2, etc.) are
covered by their using packages (apps/api routers, generation-engine).
"""

from __future__ import annotations

import pytest

from deepsynaps_core_schema import (
    ConditionProfile,
    DeviceProfile,
    ModalityProfile,
    SessionStep,
    SessionStructure,
)


class TestImportSurface:
    def test_core_models_importable(self) -> None:
        # Sanity-check: this file imported the names above without ImportError,
        # so this test is a marker that the module loads cleanly.
        assert ConditionProfile is not None
        assert DeviceProfile is not None
        assert ModalityProfile is not None
        assert SessionStep is not None
        assert SessionStructure is not None


class TestModalityProfile:
    def test_minimal_construction(self) -> None:
        m = ModalityProfile(slug="rtms", name="rTMS", treatment_family="neuromodulation")
        assert m.slug == "rtms"
        assert m.name == "rTMS"
        assert m.treatment_family == "neuromodulation"
        assert m.supported_device_slugs == []
        assert m.safety_notes == []

    def test_supports_device_slug_list(self) -> None:
        m = ModalityProfile(
            slug="tdcs",
            name="tDCS",
            treatment_family="neuromodulation",
            supported_device_slugs=["a", "b", "c"],
        )
        assert m.supported_device_slugs == ["a", "b", "c"]


class TestDeviceProfile:
    def test_minimal_construction(self) -> None:
        d = DeviceProfile(slug="luma-one", name="Luma One", manufacturer="LumaCo")
        assert d.slug == "luma-one"
        assert d.name == "Luma One"
        assert d.manufacturer == "LumaCo"
        assert d.supported_modality_slugs == []
        assert d.markets == []

    def test_supports_modality_slug_list(self) -> None:
        d = DeviceProfile(
            slug="x", name="X", manufacturer="m",
            supported_modality_slugs=["rtms", "tdcs"],
            markets=["EU", "US"],
        )
        assert d.supported_modality_slugs == ["rtms", "tdcs"]
        assert d.markets == ["EU", "US"]


class TestConditionProfile:
    def test_minimal_construction(self) -> None:
        c = ConditionProfile(slug="mdd", name="Major Depressive Disorder")
        assert c.slug == "mdd"
        assert c.contraindications == []
        assert c.phenotypes == []
        assert c.notes == []

    def test_contraindications_accepts_flat_list(self) -> None:
        c = ConditionProfile(
            slug="mdd",
            name="MDD",
            contraindications=["Pregnancy", "Active suicidality"],
        )
        assert c.contraindications == ["Pregnancy", "Active suicidality"]

    def test_contraindications_accepts_structured_dict(self) -> None:
        # Pin the registry-loader-friendly behaviour: condition JSON files
        # in data/conditions/*.json store contraindications as
        #   {"absolute": [...], "relative": [...]}
        # and the validator must flatten both lists into a single
        # list[str] so downstream code can iterate without case-splitting.
        c = ConditionProfile(
            slug="mdd",
            name="MDD",
            contraindications={
                "absolute": ["Active seizure disorder", "Metallic implant near coil"],
                "relative": ["Pregnancy"],
            },
        )
        assert "Active seizure disorder" in c.contraindications
        assert "Metallic implant near coil" in c.contraindications
        assert "Pregnancy" in c.contraindications

    def test_contraindications_accepts_dict_of_dicts(self) -> None:
        # Some condition JSONs store entries as {"condition": "...", ...} dicts.
        # The validator must extract the "condition" key.
        c = ConditionProfile(
            slug="mdd",
            name="MDD",
            contraindications={
                "absolute": [
                    {"condition": "Active seizure disorder", "severity": "high"},
                ],
                "relative": [
                    {"condition": "Pregnancy"},
                ],
            },
        )
        assert "Active seizure disorder" in c.contraindications
        assert "Pregnancy" in c.contraindications


class TestSessionStructure:
    def test_session_step_minimal(self) -> None:
        step = SessionStep(order=1, title="Setup", detail="Calibrate device.")
        assert step.order == 1
        assert step.title == "Setup"

    def test_session_structure_holds_steps(self) -> None:
        struct = SessionStructure(
            total_sessions=20,
            sessions_per_week=5,
            session_duration_minutes=37,
            steps=[
                SessionStep(order=1, title="A", detail="d"),
                SessionStep(order=2, title="B", detail="d"),
            ],
        )
        assert [s.order for s in struct.steps] == [1, 2]
        assert struct.total_sessions == 20
        assert struct.sessions_per_week == 5
        assert struct.session_duration_minutes == 37

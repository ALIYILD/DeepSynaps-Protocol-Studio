"""Unit tests for ``qeeg_analysis_router._is_demo_id`` consent-bypass boundary."""

from __future__ import annotations

import pytest

from app.routers.qeeg_analysis_router import _is_demo_id


@pytest.mark.parametrize(
    "value,expected",
    [
        ("demo", True),
        ("mock", True),
        ("test", True),
        ("demo-pt-samantha-li", True),
        ("demo-pt-001", True),
        ("demo-patient", True),
        ("demo-patient-001", True),
        ("demo-patient-synthetic", True),
        ("demographic-patient-123", False),
        ("demoed-real-patient-id", False),
        ("testicular-clinic-case-id", False),
        ("mockery-real-analysis", False),
        ("sample-real-upload", False),
        ("demo-clinical-trial-007", False),
        ("mock-protocol-alpha", False),
        ("cg-pt-real", False),
    ],
)
def test_is_demo_id_boundary(value: str, expected: bool) -> None:
    assert _is_demo_id(value) is expected

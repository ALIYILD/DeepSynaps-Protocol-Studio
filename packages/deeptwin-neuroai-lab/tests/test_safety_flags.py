import pytest

from deeptwin_neuroai_lab.risk_flags import (
    UnsafeLanguageError,
    assert_safe_language,
    scan_for_unsafe_clinical_claims,
)
from deeptwin_neuroai_lab.schemas import InterventionPayload, InterventionType
from deeptwin_neuroai_lab.simulation_contracts import DeepTwinSimulationRequest, preview_simulation


def test_scan_blocks_unsafe_phrases():
    assert scan_for_unsafe_clinical_claims("recommended treatment plan")
    assert not scan_for_unsafe_clinical_claims("observed association for clinician review")


def test_assert_safe_language_raises():
    with pytest.raises(UnsafeLanguageError):
        assert_safe_language("This is a recommended treatment.")


def test_simulation_preview_safe_and_disclaimers():
    req = DeepTwinSimulationRequest(
        baseline_events=[],
        proposed_intervention=InterventionPayload(
            intervention_type=InterventionType.rTMS,
            target="DLPFC",
            frequency_hz=10,
            clinician_approved=False,
        ),
    )
    out = preview_simulation(req)
    assert out.clinician_review_required is True
    assert out.no_parameter_change_recommendation is True
    blob = out.scenario_summary + " " + " ".join(out.possible_associations)
    assert not scan_for_unsafe_clinical_claims(blob)

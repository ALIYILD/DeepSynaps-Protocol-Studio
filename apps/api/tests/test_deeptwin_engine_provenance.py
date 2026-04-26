from __future__ import annotations

from app.services.deeptwin_engine import simulate_intervention_scenario


def test_simulation_includes_auditable_provenance_and_attribution() -> None:
    payload = simulate_intervention_scenario(
        "patient-provenance",
        scenario_id="scenario-a",
        modality="tms",
        target="L_DLPFC",
        frequency_hz=10.0,
        adherence_assumption_pct=72.0,
    )

    assert payload["approval_required"] is True
    assert payload["provenance"]["engine"] == "deeptwin_engine"
    assert payload["provenance"]["scenario_id"] == "scenario-a"
    assert payload["provenance"]["inputs"]["modality"] == "tms"
    assert payload["uncertainty"]["method"] == "deterministic_scenario_band"
    assert payload["feature_attribution"]
    assert any(item["factor"] == "adherence_assumption_pct" for item in payload["feature_attribution"])

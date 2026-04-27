"""Tests for the TRIBE-inspired DeepTwin layer.

Coverage matrix (per the task brief):

- multimodal fusion shape and quality propagation
- missing-modality handling (encoder + fusion + simulation still work)
- protocol comparison ranking + winner stability
- scenario simulation output shape (heads, explanation, labels)
- explanation payload presence and content
- low-confidence scenario handling (fewer modalities → lower confidence)
- end-to-end HTTP scenario (latent → simulate → compare → explain → report)

The synthetic encoders are deterministic, so we can assert exact keys and
relative orderings without needing trained weights.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.deeptwin_tribe import (
    EMBED_DIM,
    ProtocolSpec,
    compare_protocols,
    compute_patient_latent,
    encode_all,
    simulate_protocol,
    to_jsonable,
)


# ---------------------------------------------------------------------------
# Pure-Python unit tests (no HTTP)
# ---------------------------------------------------------------------------

def test_encode_all_returns_one_embedding_per_modality():
    embs = encode_all("pat-tribe-1")
    names = [e.modality for e in embs]
    assert names == [
        "qeeg", "mri", "assessments", "wearables", "treatment_history",
        "demographics", "medications", "text", "voice",
    ]
    for e in embs:
        assert isinstance(e.vector, list)
        assert len(e.vector) == EMBED_DIM


def test_missing_modality_is_masked_in_fusion():
    # ``__no_wearables__`` prefix is the explicit "no data" trigger.
    embs, latent, _adapted = compute_patient_latent("__no_wearables__pat-1")
    weights = latent.modality_weights
    assert weights["wearables"] == 0.0
    assert "wearables" in latent.missing_modalities
    assert "wearables" not in latent.used_modalities
    # Other modalities should still pick up the slack.
    assert sum(weights.values()) == 1.0 or abs(sum(weights.values()) - 1.0) < 1e-6


def test_fusion_quality_propagates_to_response_confidence():
    """Coverage drives confidence: poor patient cannot exceed rich."""
    poor_id = "__no_wearables____no_text____no_qeeg____no_mri____no_assessments__pat"
    rich_id = "pat-rich-1"
    proto = ProtocolSpec(protocol_id="proto_x", modality="tdcs", target="Fp2",
                         current_ma=2.0, sessions_per_week=5, weeks=5)
    poor_embs, poor_latent, _ = compute_patient_latent(poor_id)
    rich_embs, rich_latent, _ = compute_patient_latent(rich_id)
    # Rich patient must have strictly more usable modalities.
    assert len(rich_latent.used_modalities) > len(poor_latent.used_modalities)
    poor = simulate_protocol(poor_id, proto)
    rich = simulate_protocol(rich_id, proto)
    rank = {"low": 0, "moderate": 1, "high": 2}
    assert rank[poor.heads.response_confidence] <= rank[rich.heads.response_confidence]
    # Poor coverage must never report "high" confidence.
    assert poor.heads.response_confidence != "high"


def test_simulate_protocol_emits_full_shape():
    sim = simulate_protocol(
        "pat-tribe-2",
        ProtocolSpec(protocol_id="proto_x", modality="tms", target="DLPFC",
                     frequency_hz=10, sessions_per_week=5, weeks=4),
    )
    out = to_jsonable(sim)
    assert set(out.keys()) >= {
        "patient_id", "protocol", "horizon_weeks", "heads",
        "explanation", "approval_required", "labels", "disclaimer",
    }
    assert out["approval_required"] is True
    assert out["labels"]["simulation_only"] is True
    assert out["labels"]["not_a_prescription"] is True
    assert out["labels"]["requires_clinician_review"] is True
    assert "decision-support only" in out["disclaimer"].lower()
    heads = out["heads"]
    assert len(heads["symptom_trajectories"]) >= 4
    assert len(heads["biomarker_trajectories"]) >= 4
    assert 0.0 <= heads["response_probability"] <= 1.0
    assert heads["response_confidence"] in {"low", "moderate", "high"}
    # Trajectories carry uncertainty bands.
    pt = heads["symptom_trajectories"][0]["points"][1]
    assert pt["ci_low"] <= pt["point"] <= pt["ci_high"]


def test_explanation_payload_has_drivers_and_cautions():
    sim = simulate_protocol(
        "pat-tribe-3",
        ProtocolSpec(protocol_id="proto_y", modality="tdcs", target="Fp2",
                     current_ma=2.0, sessions_per_week=5, weeks=5,
                     contraindications=["seizure_history"]),
    )
    out = to_jsonable(sim)
    expl = out["explanation"]
    assert expl["top_modalities"], "expected at least one top modality"
    assert expl["top_drivers"], "expected at least one driver"
    assert expl["evidence_grade"] in {"low", "moderate"}
    assert any("decision-support" in c.lower() for c in expl["cautions"])
    # Contraindication should bubble into adverse risk concerns.
    assert "seizure_history" in out["heads"]["adverse_risk"]["concerns"]
    assert out["heads"]["adverse_risk"]["level"] == "elevated"


def test_compare_protocols_ranks_and_picks_winner():
    cmp_obj = compare_protocols(
        "pat-tribe-4",
        [
            ProtocolSpec(protocol_id="A", modality="tms",
                         target="DLPFC", frequency_hz=10,
                         sessions_per_week=5, weeks=5),
            ProtocolSpec(protocol_id="B", modality="ces",
                         sessions_per_week=2, weeks=2),
            ProtocolSpec(protocol_id="C", modality="tdcs",
                         target="Fp2", current_ma=2.0,
                         sessions_per_week=5, weeks=6),
        ],
    )
    out = to_jsonable(cmp_obj)
    assert out["winner"] in {"A", "B", "C"}
    assert len(out["ranking"]) == 3
    assert [r["rank"] for r in out["ranking"]] == [1, 2, 3]
    assert out["confidence_gap"] >= 0.0
    # Each candidate must come with a full simulation envelope.
    for cand in out["candidates"]:
        assert "heads" in cand and "explanation" in cand
        assert cand["approval_required"] is True


def test_low_confidence_scenario_does_not_claim_high():
    # All-missing patient: every encoder masked.
    pid = "__no_qeeg____no_mri____no_assessments____no_wearables__"
    pid += "__no_history____no_demographics____no_medications____no_text____no_voice__pat"
    sim = simulate_protocol(pid, ProtocolSpec(protocol_id="proto_z", modality="ces"))
    out = to_jsonable(sim)
    # With no modalities, evidence grade must be low.
    assert out["explanation"]["evidence_grade"] == "low"
    # Confidence must not be "high" when nothing contributed.
    assert out["heads"]["response_confidence"] != "high"
    # Many missing-data notes expected.
    assert len(out["explanation"]["missing_data_notes"]) >= 5


# ---------------------------------------------------------------------------
# HTTP integration tests
# ---------------------------------------------------------------------------

PID = "pat-tribe-http-1"
PROTO_A = {
    "protocol_id": "A", "modality": "tms", "target": "DLPFC",
    "frequency_hz": 10, "sessions_per_week": 5, "weeks": 5,
}
PROTO_B = {
    "protocol_id": "B", "modality": "tdcs", "target": "Fp2",
    "current_ma": 2.0, "sessions_per_week": 5, "weeks": 5,
}


def test_endpoint_simulate_tribe(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.post(
        "/api/v1/deeptwin/simulate-tribe",
        headers=auth_headers["clinician"],
        json={"patient_id": PID, "protocol": PROTO_A, "horizon_weeks": 6},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["patient_id"] == PID
    assert body["horizon_weeks"] == 6
    out = body["output"]
    assert out["approval_required"] is True
    assert out["heads"]["response_confidence"] in {"low", "moderate", "high"}
    assert out["explanation"]["top_drivers"]


def test_endpoint_compare_protocols(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        "/api/v1/deeptwin/compare-protocols",
        headers=auth_headers["clinician"],
        json={"patient_id": PID, "protocols": [PROTO_A, PROTO_B], "horizon_weeks": 6},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    cmp_out = body["comparison"]
    assert cmp_out["winner"] in {"A", "B"}
    assert len(cmp_out["candidates"]) == 2
    assert cmp_out["confidence_gap"] >= 0.0


def test_endpoint_patient_latent(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.post(
        "/api/v1/deeptwin/patient-latent",
        headers=auth_headers["clinician"],
        json={"patient_id": PID},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["embeddings"]) == 9
    assert len(body["latent"]["vector"]) == EMBED_DIM
    assert len(body["adapted"]["adapted_vector"]) == EMBED_DIM


def test_endpoint_explain(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.post(
        "/api/v1/deeptwin/explain",
        headers=auth_headers["clinician"],
        json={"patient_id": PID, "protocol": PROTO_A, "horizon_weeks": 6},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["protocol_id"] == "A"
    assert body["evidence_grade"] in {"low", "moderate", "high"}
    assert body["explanation"]["top_modalities"]


def test_endpoint_report_payload(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.post(
        "/api/v1/deeptwin/report-payload",
        headers=auth_headers["clinician"],
        json={
            "patient_id": PID, "protocol": PROTO_A, "horizon_weeks": 6,
            "kind": "clinician_intelligence",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["audit_ref"].startswith("twin_tribe_report:")
    assert body["title"] == "DeepTwin Clinical Intelligence Report"
    section_ids = {s["id"] for s in body["sections"]}
    assert {"summary", "scenario", "predictions", "drivers", "risks",
            "limitations", "review", "audit"}.issubset(section_ids)


def test_end_to_end_scenario(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    """Full scenario: latent → 2 protocols compared → explain winner → report payload."""
    headers = auth_headers["clinician"]

    # 1. Patient latent.
    latent_r = client.post(
        "/api/v1/deeptwin/patient-latent",
        headers=headers, json={"patient_id": PID},
    )
    assert latent_r.status_code == 200
    assert len(latent_r.json()["embeddings"]) == 9

    # 2. Two protocols compared.
    cmp_r = client.post(
        "/api/v1/deeptwin/compare-protocols",
        headers=headers,
        json={"patient_id": PID, "protocols": [PROTO_A, PROTO_B], "horizon_weeks": 6},
    )
    assert cmp_r.status_code == 200
    winner_id = cmp_r.json()["comparison"]["winner"]
    winner_proto = PROTO_A if winner_id == "A" else PROTO_B

    # 3. Explain the winner.
    expl_r = client.post(
        "/api/v1/deeptwin/explain",
        headers=headers,
        json={"patient_id": PID, "protocol": winner_proto, "horizon_weeks": 6},
    )
    assert expl_r.status_code == 200
    assert expl_r.json()["explanation"]["cautions"]

    # 4. Generate a clinician intelligence report payload for the winner.
    rep_r = client.post(
        "/api/v1/deeptwin/report-payload",
        headers=headers,
        json={
            "patient_id": PID, "protocol": winner_proto,
            "horizon_weeks": 6, "kind": "clinician_intelligence",
        },
    )
    assert rep_r.status_code == 200
    assert rep_r.json()["audit_ref"].startswith("twin_tribe_report:")


# ---------------------------------------------------------------------------
# Cross-clinic IDOR regression — every tribe endpoint must reject a clinician
# from a different clinic when the patient_id resolves to a real DB row.
# ---------------------------------------------------------------------------

def _seed_cross_clinic_patient() -> dict[str, str]:
    """Seed two clinics, two clinicians, one patient owned by clinic A.
    Returns ids + a JWT for clinic B's clinician."""
    import uuid
    from app.database import SessionLocal
    from app.persistence.models import Clinic, Patient, User
    from app.services.auth_service import create_access_token

    db = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Tribe Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Tribe Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"tribe_a_{uuid.uuid4().hex[:6]}@example.com",
            display_name="Tribe A", hashed_password="x",
            role="clinician", package_id="explorer", clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"tribe_b_{uuid.uuid4().hex[:6]}@example.com",
            display_name="Tribe B", hashed_password="x",
            role="clinician", package_id="explorer", clinic_id=clinic_b.id,
        )
        db.add_all([clin_a, clin_b])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()), clinician_id=clin_a.id,
            first_name="Tribe", last_name="Patient",
        )
        db.add(patient)
        db.commit()
        token_b = create_access_token(
            user_id=clin_b.id, email="tribe_b@example.com",
            role="clinician", package_id="explorer", clinic_id=clinic_b.id,
        )
        return {"patient_id": patient.id, "token_b": token_b}
    finally:
        db.close()


def test_tribe_endpoints_block_cross_clinic_idor(client: TestClient) -> None:
    """Every /deeptwin/*-tribe endpoint must 403 when the actor is in a
    different clinic than the patient. Regression for the audit gap where
    these 5 endpoints accepted any patient_id without an ownership check."""
    seed = _seed_cross_clinic_patient()
    headers = {"Authorization": f"Bearer {seed['token_b']}"}
    pid = seed["patient_id"]

    # simulate-tribe
    r = client.post(
        "/api/v1/deeptwin/simulate-tribe",
        headers=headers,
        json={"patient_id": pid, "protocol": PROTO_A, "horizon_weeks": 6},
    )
    assert r.status_code == 403, r.text

    # compare-protocols
    r = client.post(
        "/api/v1/deeptwin/compare-protocols",
        headers=headers,
        json={"patient_id": pid, "protocols": [PROTO_A, PROTO_B], "horizon_weeks": 6},
    )
    assert r.status_code == 403, r.text

    # patient-latent
    r = client.post(
        "/api/v1/deeptwin/patient-latent",
        headers=headers,
        json={"patient_id": pid},
    )
    assert r.status_code == 403, r.text

    # explain
    r = client.post(
        "/api/v1/deeptwin/explain",
        headers=headers,
        json={"patient_id": pid, "protocol": PROTO_A, "horizon_weeks": 6},
    )
    assert r.status_code == 403, r.text

    # report-payload
    r = client.post(
        "/api/v1/deeptwin/report-payload",
        headers=headers,
        json={
            "patient_id": pid, "protocol": PROTO_A,
            "horizon_weeks": 6, "kind": "clinician_intelligence",
        },
    )
    assert r.status_code == 403, r.text

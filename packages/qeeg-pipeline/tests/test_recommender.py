from __future__ import annotations

from pathlib import Path

import pytest

from deepsynaps_qeeg.recommender.contraindications import filter_contraindicated
from deepsynaps_qeeg.recommender.features import summarize_for_recommender
from deepsynaps_qeeg.recommender.protocols import ProtocolLibrary
from deepsynaps_qeeg.recommender.ranker import recommend_protocols


def _write_min_protocols_csv(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "Protocol_ID,Protocol_Name,Condition_ID,Phenotype_ID,Modality_ID,Device_ID_if_specific,On_Label_vs_Off_Label,Evidence_Grade,Evidence_Summary,Target_Region,Laterality,Frequency_Hz,Intensity,Session_Duration,Sessions_per_Week,Total_Course,Coil_or_Electrode_Placement,Monitoring_Requirements,Contraindication_Check_Required,Adverse_Event_Monitoring,Escalation_or_Adjustment_Rules,Patient_Facing_Allowed,Clinician_Review_Required,Source_URL_Primary,Source_URL_Secondary,Notes,Review_Status",
                "P1,rTMS 10 Hz Left DLPFC for MDD,CON-001,,MOD-001,,On-label,EV-A,x,Left DLPFC,Left,10,120% RMT,37 min,5,30 sessions,x,x,Yes,x,x,Yes,Yes,https://pubmed.ncbi.nlm.nih.gov/1/,,Seizure history relative contraindication,Reviewed",
                "P2,Neurofeedback SMR/Theta for ADHD,CON-002,,MOD-010,,Off-label,EV-B,x,Cz,,x,x,40 min,3,20 sessions,x,x,Yes,x,x,Yes,Yes,https://pubmed.ncbi.nlm.nih.gov/2/,,x,Reviewed",
                "P3,Alpha downtraining for anxiety,CON-003,,MOD-011,,Off-label,EV-C,x,Pz,,x,x,40 min,3,20 sessions,x,x,Yes,x,x,Yes,Yes,https://pubmed.ncbi.nlm.nih.gov/3/,,x,Reviewed",
            ]
        ),
        encoding="utf-8",
    )


def _fake_medrag(*_args, **_kwargs):
    return [
        {
            "relevance": 2.0,
            "url": "https://pubmed.ncbi.nlm.nih.gov/99999999/",
            "title": "Toy",
        }
    ]


def test_rules_fire_theta_f3f4_plus_tbr():
    # Build a minimal pipeline_result-like dict; summarizer reads features+zscores.
    pipeline_result = {
        "features": {
            "spectral": {
                "bands": {
                    "theta": {"relative": {"F3": 0.4, "F4": 0.4}},
                    "beta": {"relative": {"F3": 0.08, "F4": 0.08}},
                },
                "peak_alpha_freq": {},
            },
            "asymmetry": {"frontal_alpha_F3_F4": 0.0},
            "connectivity": {"coherence": {"alpha": []}, "channels": []},
        },
        "zscores": {
            "spectral": {
                "bands": {
                    "theta": {"absolute_uv2": {"F3": 2.0, "F4": 2.0}},
                }
            }
        },
    }
    fv = summarize_for_recommender(pipeline_result)
    assert fv.theta_beta_ratio is not None
    assert fv.theta_beta_ratio > 4.0
    assert fv.region_band_z["frontal"]["theta"] > 1.5


def test_contraindications_filter_seizure_history_blocks_tms(tmp_path: Path):
    csv_path = tmp_path / "protocols.csv"
    _write_min_protocols_csv(csv_path)
    lib = ProtocolLibrary.load(csv_path)

    kept, hits = filter_contraindicated(lib.protocols, {"seizure_history": True})
    kept_ids = {p.protocol_id for p in kept}
    assert "P1" not in kept_ids
    assert any(h.protocol_id == "P1" for h in hits)


def test_top_k_returns_distinct(tmp_path: Path):
    csv_path = tmp_path / "protocols.csv"
    _write_min_protocols_csv(csv_path)
    lib = ProtocolLibrary.load(csv_path)

    pipeline_result = {
        "features": {
            "spectral": {
                "bands": {
                    "theta": {"relative": {"F3": 0.4, "F4": 0.4}},
                    "beta": {"relative": {"F3": 0.08, "F4": 0.08}},
                },
                "peak_alpha_freq": {},
            },
            "asymmetry": {"frontal_alpha_F3_F4": 0.0},
            "connectivity": {"coherence": {"alpha": []}, "channels": []},
        },
        "zscores": {
            "spectral": {
                "bands": {
                    "theta": {"absolute_uv2": {"F3": 2.0, "F4": 2.0}},
                }
            }
        },
    }
    fv = summarize_for_recommender(pipeline_result)
    recs, _contra, _rules = recommend_protocols(
        fv,
        patient_meta={},
        library=lib,
        top_k=2,
        medrag_fn=_fake_medrag,
    )
    assert len(recs) == 2
    assert len({r.protocol_id for r in recs}) == 2


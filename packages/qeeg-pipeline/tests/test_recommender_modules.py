"""Tests for the qEEG recommender modules.

Pins the load-bearing **decision-support, NOT diagnostic** policy:

- Every contraindication block carries a human-readable reason (auditability).
- Seizure history blocks ALL TMS/iTBS/TBS family protocols.
- Cranial / ferromagnetic implants block TMS-type protocols.
- Active psychosis is honoured when the protocol notes flag it.
- The recommendation-feedback persistence is intentionally NotImplemented
  -- consumers must wire it at the API layer, not pretend it succeeded.

Also covers:
- ``summarize_for_recommender`` accepts both PipelineResult-like dataclasses
  and plain dicts (backwards-compat with cached pipeline output).
- Region-band z aggregation works across the canonical 10-20 region
  groupings (frontal / central / temporal / parietal / occipital).
- Rules cover all four phenotypes (ADHD-like / MDD-like / anxiety-like /
  cognitive-decline-like).
"""
from __future__ import annotations

from dataclasses import dataclass

import pytest

from deepsynaps_qeeg.recommender.contraindications import (
    ContraindicationHit,
    _truthy,
    filter_contraindicated,
)
from deepsynaps_qeeg.recommender.features import (
    FeatureVector,
    summarize_for_recommender,
)
from deepsynaps_qeeg.recommender.feedback import (
    RecommendationFeedback,
    record_feedback,
)
from deepsynaps_qeeg.recommender.protocols import Protocol
from deepsynaps_qeeg.recommender.rules import (
    RuleCitation,
    RuleHit,
    evaluate_rules,
)


# ── Fixtures ───────────────────────────────────────────────────────────────


def _proto(
    *,
    pid: str = "P-rTMS-MDD",
    name: str = "rTMS L-DLPFC for MDD",
    notes: str | None = None,
    contra: str | None = None,
) -> Protocol:
    return Protocol(
        protocol_id=pid,
        protocol_name=name,
        condition_id="mdd",
        phenotype_id=None,
        modality_id="rtms",
        device_id_if_specific=None,
        evidence_grade="A",
        evidence_summary="STAR*D et al.",
        target_region="L-DLPFC",
        laterality="left",
        intensity="120% MT",
        session_duration="40min",
        sessions_per_week="5",
        total_course="20 sessions",
        contraindication_check_required=contra,
        adverse_event_monitoring=None,
        source_url_primary="https://example.org/p1",
        source_url_secondary="",
        notes=notes,
    )


# ── _truthy helper ─────────────────────────────────────────────────────────


class TestTruthyHelper:
    @pytest.mark.parametrize(
        "value",
        [True, "yes", "Yes", "true", "TRUE", "y", "1", "on", 1, 1.5, -2.0],
    )
    def test_truthy_inputs(self, value) -> None:
        assert _truthy({"k": value}, "k") is True

    @pytest.mark.parametrize(
        "value",
        [False, "no", "false", "0", 0, 0.0, "", None],
    )
    def test_falsy_inputs(self, value) -> None:
        assert _truthy({"k": value}, "k") is False

    def test_first_explicit_bool_short_circuits(self) -> None:
        # The first key whose value is a bool returns immediately —
        # boolean explicitness wins, even if a later key is truthy. This
        # matches the conservative "if you say False you mean False"
        # design.
        assert _truthy({"a": False, "b": True}, "a", "b") is False
        # When the first key is truthy, the function still returns True.
        assert _truthy({"a": True, "b": False}, "a", "b") is True

    def test_missing_keys(self) -> None:
        assert _truthy({}, "a", "b") is False


# ── filter_contraindicated ─────────────────────────────────────────────────


class TestFilterContraindicated:
    def test_no_meta_keeps_everything(self) -> None:
        protos = [_proto(), _proto(pid="P2", name="iTBS protocol")]
        kept, hits = filter_contraindicated(protos, None)
        assert len(kept) == 2
        assert hits == []

    def test_seizure_history_blocks_tms(self) -> None:
        protos = [_proto(name="rTMS L-DLPFC for MDD")]
        kept, hits = filter_contraindicated(protos, {"seizure_history": True})
        assert kept == []
        assert len(hits) == 1
        assert isinstance(hits[0], ContraindicationHit)
        assert "Seizure history" in hits[0].reason

    def test_seizure_history_blocks_itbs_and_tbs(self) -> None:
        # iTBS / cTBS variants should also be matched by name heuristic.
        protos = [
            _proto(pid="P-iTBS", name="iTBS L-DLPFC"),
            _proto(pid="P-cTBS", name="cTBS protocol"),
        ]
        kept, hits = filter_contraindicated(protos, {"epilepsy": True})
        assert kept == []
        assert len(hits) == 2

    def test_cranial_implant_blocks_tms(self) -> None:
        protos = [_proto(name="rTMS L-DLPFC for MDD")]
        kept, hits = filter_contraindicated(protos, {"cranial_implant": True})
        assert kept == []
        assert "implant" in hits[0].reason.lower()

    def test_pregnancy_blocks_only_when_protocol_notes_say_so(self) -> None:
        # Pregnancy alone is a soft contra; the protocol notes must mention it
        # explicitly or it does NOT get filtered.
        without_pregnancy_note = _proto(name="rTMS L-DLPFC")
        with_pregnancy_note = _proto(
            pid="P-preg",
            name="rTMS for MDD",
            notes="Pregnancy: avoid until cleared by obstetrics.",
        )
        kept, hits = filter_contraindicated(
            [without_pregnancy_note, with_pregnancy_note],
            {"pregnant": True},
        )
        assert any(p.protocol_id == "P-rTMS-MDD" for p in kept)
        assert any(h.protocol_id == "P-preg" for h in hits)

    def test_active_psychosis_blocks_when_protocol_notes_say_so(self) -> None:
        with_psy = _proto(
            pid="P-psy",
            name="iTBS protocol",
            notes="Active psychosis: defer until stable.",
        )
        kept, hits = filter_contraindicated([with_psy], {"active_psychosis": True})
        assert kept == []
        assert "psychosis" in hits[0].reason.lower()

    def test_implant_with_tdcs_when_notes_mention_metal(self) -> None:
        proto = _proto(
            pid="P-tdcs",
            name="tDCS over DLPFC",
            notes="Avoid in patients with metal implants near electrodes.",
        )
        kept, hits = filter_contraindicated([proto], {"metallic_implant_head": True})
        assert kept == []
        assert "implant" in hits[0].reason.lower() or "metal" in hits[0].reason.lower()

    def test_non_tms_non_tdcs_protocol_not_filtered_for_seizure(self) -> None:
        # A non-stim protocol (e.g. neurofeedback) should NOT be blocked
        # by seizure history when there's no name match.
        proto = _proto(pid="P-nfb", name="Theta-beta neurofeedback")
        kept, hits = filter_contraindicated([proto], {"seizure_history": True})
        assert proto in kept
        assert hits == []


# ── evaluate_rules ─────────────────────────────────────────────────────────


def _fv(**overrides) -> FeatureVector:
    return FeatureVector(
        region_band_z=overrides.pop("region_band_z", {}),
        frontal_alpha_asymmetry_f3_f4=overrides.pop("frontal_alpha_asymmetry_f3_f4", None),
        theta_beta_ratio=overrides.pop("theta_beta_ratio", None),
        iapf_hz=overrides.pop("iapf_hz", None),
        alpha_coherence=overrides.pop("alpha_coherence", {}),
        condition_likelihoods=overrides.pop("condition_likelihoods", {}),
    )


class TestEvaluateRules:
    def test_empty_feature_vector_yields_no_hits(self) -> None:
        assert evaluate_rules(_fv()) == []

    def test_adhd_rule_fires_with_high_frontal_theta_and_tbr(self) -> None:
        fv = _fv(
            region_band_z={"frontal": {"theta": 2.0}},
            theta_beta_ratio=4.5,
        )
        hits = evaluate_rules(fv)
        ids = [h.rule_id for h in hits]
        assert "RULE-ADHD-THETA-TBR" in ids

    def test_adhd_rule_does_not_fire_below_threshold(self) -> None:
        fv = _fv(
            region_band_z={"frontal": {"theta": 1.0}},
            theta_beta_ratio=3.0,
        )
        hits = evaluate_rules(fv)
        assert all(h.rule_id != "RULE-ADHD-THETA-TBR" for h in hits)

    def test_mdd_rule_fires_with_negative_faa_and_low_post_alpha(self) -> None:
        fv = _fv(
            frontal_alpha_asymmetry_f3_f4=-0.3,
            region_band_z={"occipital": {"alpha": -2.0}},
        )
        hits = evaluate_rules(fv)
        assert any(h.rule_id == "RULE-MDD-FAA-POSTALPHA" for h in hits)

    def test_anx_rule_fires_with_elevated_post_alpha(self) -> None:
        fv = _fv(region_band_z={"occipital": {"alpha": 1.5}})
        hits = evaluate_rules(fv)
        assert any(h.rule_id == "RULE-ANX-POSTALPHA-COH" for h in hits)

    def test_anx_rule_fires_with_high_occipital_coherence(self) -> None:
        fv = _fv(alpha_coherence={"alpha_coherence_within_occipital": 0.5})
        hits = evaluate_rules(fv)
        assert any(h.rule_id == "RULE-ANX-POSTALPHA-COH" for h in hits)

    def test_cog_decline_rule_fires_when_iapf_below_9(self) -> None:
        fv = _fv(iapf_hz=8.0)
        hits = evaluate_rules(fv)
        assert any(h.rule_id == "RULE-COG-IAPF-LOW" for h in hits)

    def test_cog_decline_rule_does_not_fire_at_normal_iapf(self) -> None:
        fv = _fv(iapf_hz=10.0)
        hits = evaluate_rules(fv)
        assert all(h.rule_id != "RULE-COG-IAPF-LOW" for h in hits)

    def test_each_hit_carries_at_least_one_citation(self) -> None:
        # Decision-support: every rule must surface evidence or a literature
        # pointer. A rule firing without a citation is not auditable.
        fv = _fv(iapf_hz=8.0)
        hits = evaluate_rules(fv)
        for h in hits:
            assert isinstance(h, RuleHit)
            assert h.citations, f"Rule {h.rule_id} fired without any citation"
            for c in h.citations:
                assert isinstance(c, RuleCitation)
                assert c.label


# ── summarize_for_recommender ──────────────────────────────────────────────


@dataclass
class _PipelineResultLike:
    features: dict
    zscores: dict
    risk_scores: dict


class TestSummarizeForRecommender:
    def test_dict_input_extracts_features(self) -> None:
        payload = {
            "features": {
                "asymmetry": {"frontal_alpha_F3_F4": -0.25},
                "spectral": {
                    "bands": {
                        "theta": {"relative": {"Fz": 0.30, "Cz": 0.32}},
                        "beta": {"relative": {"Fz": 0.10, "Cz": 0.11}},
                    },
                    "peak_alpha_freq": {"O1": 9.5, "O2": 9.7},
                },
            },
            "zscores": {
                "spectral": {
                    "bands": {
                        "theta": {"absolute_uv2": {"Fp1": 1.5, "F3": 1.8, "Fz": 2.0}},
                        "alpha": {"absolute_uv2": {"O1": -2.0, "O2": -1.8}},
                    },
                },
            },
            "risk_scores": {"adhd": {"score": 0.7}, "anxiety": "n/a"},
        }
        fv = summarize_for_recommender(payload)
        assert isinstance(fv, FeatureVector)
        assert fv.frontal_alpha_asymmetry_f3_f4 == pytest.approx(-0.25)
        assert "frontal" in fv.region_band_z
        assert fv.region_band_z["frontal"]["theta"] == pytest.approx((1.5 + 1.8 + 2.0) / 3)
        assert fv.region_band_z["occipital"]["alpha"] == pytest.approx(-1.9)
        # TBR computed.
        assert fv.theta_beta_ratio == pytest.approx(0.31 / 0.105, rel=1e-3)
        # IAPF averaged across O1/O2.
        assert fv.iapf_hz == pytest.approx(9.6)
        assert fv.condition_likelihoods == {"adhd": 0.7}

    def test_dataclass_input_works_too(self) -> None:
        payload = _PipelineResultLike(
            features={},
            zscores={"spectral": {"bands": {"alpha": {"absolute_uv2": {"O1": -1.0, "O2": -1.5}}}}},
            risk_scores={},
        )
        fv = summarize_for_recommender(payload)
        assert fv.region_band_z["occipital"]["alpha"] == pytest.approx(-1.25)

    def test_empty_input_returns_empty_vector(self) -> None:
        fv = summarize_for_recommender({})
        assert fv.region_band_z == {
            "frontal": {},
            "central": {},
            "temporal": {},
            "parietal": {},
            "occipital": {},
        }
        assert fv.frontal_alpha_asymmetry_f3_f4 is None
        assert fv.theta_beta_ratio is None
        assert fv.iapf_hz is None

    def test_garbage_input_does_not_raise(self) -> None:
        # Defensive: weird shapes (string instead of dict) must not crash.
        fv = summarize_for_recommender({"features": "garbage", "zscores": 42})
        assert isinstance(fv, FeatureVector)

    def test_alpha_coherence_within_region_aggregated(self) -> None:
        # Build a 3x3 coherence matrix over (Fp1, F3, Fz) — all in the
        # frontal region. Mean upper-triangle pair-wise coherence:
        # (0.5 + 0.6 + 0.7) / 3 = 0.6.
        chs = ["Fp1", "F3", "Fz"]
        coh = [
            [1.0, 0.5, 0.6],
            [0.5, 1.0, 0.7],
            [0.6, 0.7, 1.0],
        ]
        payload = {
            "features": {
                "connectivity": {"channels": chs, "coherence": {"alpha": coh}},
            },
        }
        fv = summarize_for_recommender(payload)
        assert "alpha_coherence_within_frontal" in fv.alpha_coherence
        assert fv.alpha_coherence["alpha_coherence_within_frontal"] == pytest.approx(0.6)

    def test_alpha_coherence_skips_region_with_fewer_than_two_channels(self) -> None:
        # Only one occipital channel present → no within-region pair, so
        # the coherence map omits that region.
        chs = ["O1"]
        coh = [[1.0]]
        payload = {
            "features": {
                "connectivity": {"channels": chs, "coherence": {"alpha": coh}},
            },
        }
        fv = summarize_for_recommender(payload)
        assert "alpha_coherence_within_occipital" not in fv.alpha_coherence


# ── feedback ───────────────────────────────────────────────────────────────


class TestFeedback:
    def test_record_feedback_raises_not_implemented(self) -> None:
        # Pin the load-bearing contract: persistence is intentionally NOT
        # wired at the package layer. Consumers must implement it at the
        # API layer (writing to qeeg_recommendation_feedback). Pretending
        # the call succeeded would silently lose feedback.
        fb = RecommendationFeedback(
            analysis_id="A1",
            protocol_id="P1",
            accepted=True,
            notes="looks good",
        )
        with pytest.raises(NotImplementedError, match="not wired yet"):
            record_feedback(fb)

    def test_feedback_dataclass_is_frozen(self) -> None:
        fb = RecommendationFeedback(analysis_id="A1", protocol_id="P1", accepted=False)
        with pytest.raises(Exception):
            fb.accepted = True  # type: ignore[misc]


# ── Protocol.source_urls helper ────────────────────────────────────────────


class TestProtocolSourceUrls:
    def test_returns_only_non_blank_urls(self) -> None:
        p = _proto()  # primary set, secondary empty string
        assert p.source_urls == ["https://example.org/p1"]

    def test_returns_empty_list_when_both_blank(self) -> None:
        p = Protocol(
            protocol_id="P-x",
            protocol_name="x",
            condition_id="c",
            phenotype_id=None,
            modality_id="m",
            device_id_if_specific=None,
            evidence_grade=None,
            evidence_summary=None,
            target_region=None,
            laterality=None,
            intensity=None,
            session_duration=None,
            sessions_per_week=None,
            total_course=None,
            contraindication_check_required=None,
            adverse_event_monitoring=None,
            source_url_primary="",
            source_url_secondary=None,
            notes=None,
        )
        assert p.source_urls == []

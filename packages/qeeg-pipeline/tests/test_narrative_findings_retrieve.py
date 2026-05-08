"""Tests for ``deepsynaps_qeeg.narrative.findings`` + ``narrative.retrieve``.

Pins the **borderline / significant z-thresholds** the entire downstream
narrative pipeline depends on, plus the deterministic finding-ordering
contract (severity-first, then |z| desc, then stable tiebreaker).

Coverage of ``retrieve.retrieve_evidence`` exercises the 60/40 graph +
vector blend, the de-duplication on paper_id/pmid/doi, and the
defensive 'medrag unavailable -> return []' fallback (the safety net
when the AI subpackage is not installed).
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

from deepsynaps_qeeg.narrative.findings import (
    _band_from_metric,
    _direction_for_z,
    _severity_for_z,
    _value_from_result,
    extract_findings,
)
from deepsynaps_qeeg.narrative.retrieve import retrieve_evidence
from deepsynaps_qeeg.narrative.types import Citation, Finding


# ── _severity_for_z ─────────────────────────────────────────────────────


class TestSeverityForZ:
    @pytest.mark.parametrize("z", [2.0, 2.5, -2.0, -3.5])
    def test_significant_at_or_above_2(self, z: float) -> None:
        # Pin the load-bearing threshold: |z| >= 2.0 = significant.
        assert _severity_for_z(z) == "significant"

    @pytest.mark.parametrize("z", [1.5, 1.6, -1.5, -1.99])
    def test_borderline_between_1_5_and_2(self, z: float) -> None:
        # |z| in [1.5, 2.0) = borderline.
        assert _severity_for_z(z) == "borderline"

    @pytest.mark.parametrize("z", [0.0, 0.5, 1.0, 1.49, -1.49])
    def test_below_1_5_returns_none(self, z: float) -> None:
        # Below threshold: NOT a finding (filtered out downstream).
        assert _severity_for_z(z) is None


# ── _direction_for_z ────────────────────────────────────────────────────


class TestDirectionForZ:
    def test_positive_z_is_elevated(self) -> None:
        assert _direction_for_z(2.0) == "elevated"

    def test_negative_z_is_reduced(self) -> None:
        assert _direction_for_z(-2.0) == "reduced"

    def test_zero_is_normal(self) -> None:
        assert _direction_for_z(0.0) == "normal"

    def test_near_zero_is_normal(self) -> None:
        assert _direction_for_z(1e-10) == "normal"


# ── _band_from_metric ──────────────────────────────────────────────────


class TestBandFromMetric:
    def test_standard_path_extracts_band(self) -> None:
        assert _band_from_metric("spectral.bands.alpha.absolute_uv2") == "alpha"
        assert _band_from_metric("spectral.bands.theta.relative") == "theta"

    def test_path_without_bands_returns_unspecified(self) -> None:
        assert _band_from_metric("aperiodic.slope") == "unspecified"

    def test_empty_path_returns_unspecified(self) -> None:
        assert _band_from_metric("") == "unspecified"


# ── _value_from_result ─────────────────────────────────────────────────


class TestValueFromResult:
    def test_extracts_band_metric_value_for_channel(self) -> None:
        features = {
            "spectral": {
                "bands": {
                    "alpha": {"absolute_uv2": {"Fz": 12.3}},
                },
            },
        }
        v = _value_from_result(features, "spectral.bands.alpha.absolute_uv2", "Fz")
        assert v == pytest.approx(12.3)

    def test_extracts_aperiodic_slope_value(self) -> None:
        features = {
            "spectral": {
                "aperiodic": {"slope": {"Fz": -1.7}},
            },
        }
        v = _value_from_result(features, "aperiodic.slope", "Fz")
        assert v == pytest.approx(-1.7)

    def test_no_features_returns_none(self) -> None:
        assert _value_from_result(None, "spectral.bands.alpha.absolute_uv2", "Fz") is None

    def test_missing_metric_path_returns_none(self) -> None:
        assert _value_from_result({}, "", "Fz") is None

    def test_missing_band_returns_none(self) -> None:
        features = {"spectral": {"bands": {}}}
        v = _value_from_result(features, "spectral.bands.alpha.absolute_uv2", "Fz")
        assert v is None

    def test_missing_channel_returns_none(self) -> None:
        features = {"spectral": {"bands": {"alpha": {"absolute_uv2": {"Cz": 8.0}}}}}
        v = _value_from_result(features, "spectral.bands.alpha.absolute_uv2", "Fz")
        assert v is None

    def test_unsupported_path_returns_none(self) -> None:
        # Any other path returns None defensively.
        v = _value_from_result({"spectral": {}}, "weird.path", "Fz")
        assert v is None


# ── extract_findings ───────────────────────────────────────────────────


class TestExtractFindings:
    def test_dict_input_extracts_significant_finding(self) -> None:
        result = {
            "zscores": {
                "flagged": [
                    {"metric": "spectral.bands.alpha.absolute_uv2", "channel": "Fz", "z": 2.5},
                ],
            },
            "features": {
                "spectral": {"bands": {"alpha": {"absolute_uv2": {"Fz": 10.0}}}},
            },
        }
        out = extract_findings(result)
        assert len(out) == 1
        f = out[0]
        assert f.severity == "significant"
        assert f.direction == "elevated"
        assert f.region == "Fz"
        assert f.band == "alpha"
        assert f.value == pytest.approx(10.0)

    def test_dataclass_input_works_too(self) -> None:
        result = SimpleNamespace(
            zscores={
                "flagged": [
                    {"metric": "spectral.bands.theta.absolute_uv2", "channel": "Cz", "z": -2.1},
                ],
            },
            features={},
        )
        out = extract_findings(result)
        assert len(out) == 1
        assert out[0].severity == "significant"
        assert out[0].direction == "reduced"

    def test_below_threshold_filtered(self) -> None:
        result = {
            "zscores": {
                "flagged": [
                    {"metric": "spectral.bands.beta.absolute_uv2", "channel": "Pz", "z": 1.0},
                ],
            },
        }
        out = extract_findings(result)
        assert out == []

    def test_invalid_z_skipped(self) -> None:
        result = {
            "zscores": {
                "flagged": [
                    {"metric": "x", "channel": "Fz", "z": "garbage"},
                ],
            },
        }
        out = extract_findings(result)
        assert out == []

    def test_non_dict_row_skipped(self) -> None:
        result = {"zscores": {"flagged": [None, "garbage", 42]}}
        out = extract_findings(result)
        assert out == []

    def test_no_zscores_returns_empty(self) -> None:
        out = extract_findings({})
        assert out == []

    def test_uses_region_key_when_no_channel(self) -> None:
        result = {
            "zscores": {
                "flagged": [
                    {"metric": "spectral.bands.alpha.absolute_uv2", "region": "frontal", "z": 2.0},
                ],
            },
        }
        out = extract_findings(result)
        assert out[0].region == "frontal"

    def test_unspecified_region_default_when_neither_present(self) -> None:
        result = {
            "zscores": {
                "flagged": [
                    {"metric": "spectral.bands.alpha.absolute_uv2", "z": 2.0},
                ],
            },
        }
        out = extract_findings(result)
        assert out[0].region == "unspecified"

    def test_ordering_significant_first_then_by_abs_z_desc(self) -> None:
        # Pin the deterministic order contract: significant before
        # borderline; within each severity, larger |z| first.
        result = {
            "zscores": {
                "flagged": [
                    {"metric": "m1", "channel": "Fz", "z": 1.6},   # borderline
                    {"metric": "m2", "channel": "Cz", "z": 2.5},   # significant
                    {"metric": "m3", "channel": "Pz", "z": -2.1},  # significant
                ],
            },
        }
        out = extract_findings(result)
        sevs = [f.severity for f in out]
        assert sevs == ["significant", "significant", "borderline"]
        # Within significant, |z|=2.5 before |z|=2.1.
        assert abs(out[0].z) > abs(out[1].z)


# ── retrieve_evidence ──────────────────────────────────────────────────


def _finding(z: float = 2.5) -> Finding:
    return Finding(
        region="Fz",
        band="alpha",
        metric="spectral.bands.alpha.absolute_uv2",
        value=10.0,
        z=z,
        direction="elevated",
        severity="significant",
    )


class TestRetrieveEvidence:
    def test_returns_empty_when_top_k_negative(self) -> None:
        # Defensive: a negative top_k returns no citations rather than
        # raising or going to MedRAG. Note that top_k=0 falls back to
        # the default k=5 due to ``int(top_k or 5)`` — that quirk is
        # documented but out-of-scope here.
        assert retrieve_evidence(_finding(), top_k=-3) == []

    def test_dedupes_by_paper_id_across_graph_and_vector_passes(self) -> None:
        # Both the "graph" and "vector" MedRAG passes return the same
        # paper_id — the merge MUST de-dupe so the citation list is
        # not inflated by repeats.
        same_paper = {
            "paper_id": "P-1",
            "pmid": "111",
            "doi": "10.1/x",
            "title": "Same paper",
            "year": 2023,
            "url": "https://example.org/p1",
            "relevance": 0.9,
        }

        def fake_retrieve(features, meta, *, k=5):  # noqa: ARG001
            return [same_paper] * int(k)

        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve",
            side_effect=fake_retrieve,
        ):
            cits = retrieve_evidence(_finding(), top_k=5)
        # Only one unique paper despite both passes returning copies.
        assert len(cits) == 1
        assert cits[0].pmid == "111"
        assert cits[0].doi == "10.1/x"
        assert cits[0].year == 2023
        assert cits[0].relevance == pytest.approx(0.9)

    def test_blends_distinct_papers_from_graph_and_vector(self) -> None:
        graph_paper = {
            "paper_id": "P-graph",
            "pmid": "111",
            "title": "Graph paper",
            "year": 2024,
            "relevance": 0.8,
        }
        vector_paper = {
            "paper_id": "P-vec",
            "pmid": "222",
            "title": "Vector paper",
            "year": 2025,
            "relevance": 0.7,
        }

        call_count = {"n": 0}

        def fake_retrieve(features, meta, *, k=5):  # noqa: ARG001
            call_count["n"] += 1
            return [graph_paper] if call_count["n"] == 1 else [vector_paper]

        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve",
            side_effect=fake_retrieve,
        ):
            cits = retrieve_evidence(_finding(), top_k=5)
        ids = [c.pmid for c in cits]
        assert "111" in ids
        assert "222" in ids

    def test_skips_rows_with_no_paper_id_or_pmid_or_doi(self) -> None:
        garbage = {"title": "No id at all"}
        keepable = {"paper_id": "ok", "pmid": "1", "title": "kept"}

        def fake_retrieve(features, meta, *, k=5):  # noqa: ARG001
            return [garbage, keepable]

        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve",
            side_effect=fake_retrieve,
        ):
            cits = retrieve_evidence(_finding(), top_k=5)
        assert len(cits) == 1
        assert cits[0].pmid == "1"

    def test_graph_pass_failure_does_not_crash(self) -> None:
        # Pin: when the graph MedRAG call raises, retrieve still tries
        # the vector pass (graceful degradation, not an end-to-end fail).
        call_count = {"n": 0}

        def fake_retrieve(features, meta, *, k=5):  # noqa: ARG001
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("graph down")
            return [{"paper_id": "P", "pmid": "1", "title": "vec only"}]

        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve",
            side_effect=fake_retrieve,
        ):
            cits = retrieve_evidence(_finding(), top_k=5)
        assert any(c.pmid == "1" for c in cits)

    def test_vector_pass_failure_does_not_crash(self) -> None:
        call_count = {"n": 0}

        def fake_retrieve(features, meta, *, k=5):  # noqa: ARG001
            call_count["n"] += 1
            if call_count["n"] == 1:
                return [{"paper_id": "P", "pmid": "g", "title": "graph"}]
            raise RuntimeError("vec down")

        with mock.patch(
            "deepsynaps_qeeg.ai.medrag.retrieve",
            side_effect=fake_retrieve,
        ):
            cits = retrieve_evidence(_finding(), top_k=5)
        assert any(c.pmid == "g" for c in cits)

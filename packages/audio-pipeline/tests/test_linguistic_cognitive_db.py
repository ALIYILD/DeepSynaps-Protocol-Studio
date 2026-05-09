"""Tests for ``deepsynaps_audio.cognitive``, ``linguistic``, and ``db``.

Pins three contracts:

1. **Stub-must-raise**: linguistic.{transcription, prosody, syntactic}
   and cognitive.tasks are documented v2 stubs. They MUST raise
   NotImplementedError with the documented spec pointer in the
   message — the API surfaces a clear "feature not yet available"
   instead of silently returning fake data.

2. **mci_risk / lexical shim contracts**: these modules wrap
   analyzers/cognitive_speech delegations. They must build a
   well-formed payload from the input mapping and return the
   documented schema fields — never raise on an empty mapping.

3. **db.write_audio_analysis privacy contract**:
   - Always returns a UUID4-shaped analysis_id.
   - Persists JSON locally (the v1 fallback) under the documented
     env-var path.
   - Includes the bundle dump under the "bundle" key so future
     reads can re-hydrate.
   - Tolerates absent ``DATABASE_URL`` (the JSON path is the
     v1 single source of truth — Postgres writer is deferred).
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from unittest import mock

import pytest

from deepsynaps_audio import cognitive, linguistic
from deepsynaps_audio.cognitive import mci_risk, tasks as cog_tasks
from deepsynaps_audio.linguistic import (
    lexical,
    prosody,
    syntactic,
    transcription,
)
from deepsynaps_audio import db as audio_db
from deepsynaps_audio.schemas import (
    LexicalFeatures,
    MCIRisk,
    ReportBundle,
)


# ── Stub-must-raise ────────────────────────────────────────────────


class TestLinguisticStubs:
    def test_transcribe_raises_with_spec_pointer(self) -> None:
        # Pin: stub raises NotImplementedError AND mentions the spec
        # doc, so an API surface that catches this can show a clear
        # "see AUDIO_ANALYZER_STACK.md §7" hint in the 503 envelope.
        rec = mock.MagicMock()
        with pytest.raises(NotImplementedError, match="AUDIO_ANALYZER_STACK"):
            transcription.transcribe(rec)

    def test_prosody_raises_with_spec_pointer(self) -> None:
        rec = mock.MagicMock()
        tx = mock.MagicMock()
        with pytest.raises(NotImplementedError, match="AUDIO_ANALYZER_STACK"):
            prosody.prosody_from_transcript(rec, tx)

    def test_syntactic_raises_with_spec_pointer(self) -> None:
        tx = mock.MagicMock()
        with pytest.raises(NotImplementedError, match="AUDIO_ANALYZER_STACK"):
            syntactic.syntactic_features(tx)

    def test_cognitive_tasks_raises_with_spec_pointer(self) -> None:
        sess = mock.MagicMock()
        with pytest.raises(NotImplementedError, match="AUDIO_ANALYZER_STACK"):
            cog_tasks.task_subscores(sess)

    def test_linguistic_all_exports_pinned(self) -> None:
        # Pin the four documented public names.
        assert set(linguistic.__all__) == {
            "transcribe",
            "prosody_from_transcript",
            "lexical_features",
            "syntactic_features",
        }

    def test_cognitive_all_exports_pinned(self) -> None:
        assert set(cognitive.__all__) == {"mci_risk_score", "task_subscores"}


# ── mci_risk_score shim ─────────────────────────────────────────────


class TestMciRiskScore:
    def test_empty_features_does_not_raise(self) -> None:
        # Pin: empty mapping is mapped to all-zeros — the shim
        # never crashes on missing fields. (Downstream score is
        # whatever the conservative analyzer returns for zeros.)
        out = mci_risk.mci_risk_score({})
        assert isinstance(out, MCIRisk)
        # model_version always carries the analyzer name + version.
        assert "/" in out.model_version

    def test_features_pass_through_to_analyzer(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: the shim passes the documented scalar feature names
        # through to score_cognitive_speech_risk via a typed
        # ParalinguisticCognitiveFeatures payload.
        captured: dict[str, Any] = {}

        from deepsynaps_audio.analyzers import cognitive_speech as cs

        def _fake_score(para, lex):
            captured["para"] = para
            captured["lex"] = lex
            scored = mock.MagicMock()
            scored.score = 0.42
            scored.drivers = ["pause_count_high"]
            scored.confidence = 0.3
            scored.model_name = "fake_model"
            scored.model_version = "v9"
            return scored

        monkeypatch.setattr(
            "deepsynaps_audio.cognitive.mci_risk.score_cognitive_speech_risk",
            _fake_score,
        )

        out = mci_risk.mci_risk_score(
            {
                "speech_rate_wpm": 110.0,
                "pause_count": 7,
                "pause_mean_s": 0.4,
            }
        )
        assert out.score == 0.42
        assert "pause_count_high" in out.drivers
        assert out.model_version == "fake_model/v9"
        assert captured["para"].speech_rate_wpm == 110.0
        assert captured["para"].pause_count == 7
        assert captured["para"].pause_mean_s == pytest.approx(0.4)
        # lex argument is None (the shim does not have a transcript).
        assert captured["lex"] is None


# ── lexical_features shim ───────────────────────────────────────────


class TestLexicalFeaturesShim:
    def test_passes_text_to_analyzer(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: the shim forwards transcript.text into
        # extract_linguistic_features and projects each documented
        # field onto LexicalFeatures.
        captured: dict[str, Any] = {}

        def _fake_extract(text: str):
            captured["text"] = text
            lf = mock.MagicMock()
            lf.type_token_ratio = 0.7
            lf.mtld = 50.0
            lf.brunet_w = 10.0
            lf.honore_r = 1300.0
            lf.noun_ratio = 0.3
            lf.verb_ratio = 0.2
            lf.pronoun_ratio = 0.1
            lf.idea_density = 0.5
            return lf

        monkeypatch.setattr(
            "deepsynaps_audio.linguistic.lexical.extract_linguistic_features",
            _fake_extract,
        )

        tx = mock.MagicMock()
        tx.text = "the quick brown fox"
        out = lexical.lexical_features(tx)
        assert isinstance(out, LexicalFeatures)
        assert captured["text"] == "the quick brown fox"
        assert out.type_token_ratio == 0.7
        assert out.idea_density == 0.5


# ── db.write_audio_analysis ─────────────────────────────────────────


class TestWriteAudioAnalysis:
    def _fake_bundle(self) -> ReportBundle:
        # ReportBundle.model_dump(mode="json") needs to succeed —
        # we only care about a minimal valid object.
        return ReportBundle(
            session_id="sess-1",
            patient_id="pat-1",
            task_protocol="sustained_vowel_a",
            qc=mock.MagicMock(spec=[]),  # ignored; will be replaced via __dict__
        ) if False else ReportBundle.model_construct(
            session_id="sess-1",
            patient_id="pat-1",
            task_protocol="sustained_vowel_a",
        )

    def test_returns_uuid_string(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: every call returns a UUID4-shaped analysis_id.
        monkeypatch.setenv("DEEPSYNAPS_AUDIO_ANALYSIS_DIR", str(tmp_path))
        bundle = self._fake_bundle()
        # ReportBundle.model_dump may fail on the model_construct'd
        # object — patch it.
        monkeypatch.setattr(
            type(bundle), "model_dump", lambda self, **kw: {"stub": True}
        )

        aid = audio_db.write_audio_analysis(bundle)
        # UUID4: 8-4-4-4-12 hex.
        import re

        assert re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", aid)

    def test_writes_json_under_env_dir(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: JSON path is determined by the documented env var.
        monkeypatch.setenv("DEEPSYNAPS_AUDIO_ANALYSIS_DIR", str(tmp_path))
        bundle = self._fake_bundle()
        monkeypatch.setattr(
            type(bundle), "model_dump", lambda self, **kw: {"stub": True}
        )

        aid = audio_db.write_audio_analysis(bundle, run_id="run-7")
        out = tmp_path / f"{aid}.json"
        assert out.exists()
        loaded = json.loads(out.read_text(encoding="utf-8"))
        assert loaded["analysis_id"] == aid
        assert loaded["run_id"] == "run-7"
        assert loaded["bundle"] == {"stub": True}
        # created_at is an ISO-8601 string.
        assert "T" in loaded["created_at"]

    def test_session_payload_dict_pass_through(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: a plain dict session_payload is passed through verbatim
        # (the persistence layer doesn't model_dump it twice).
        monkeypatch.setenv("DEEPSYNAPS_AUDIO_ANALYSIS_DIR", str(tmp_path))
        bundle = self._fake_bundle()
        monkeypatch.setattr(
            type(bundle), "model_dump", lambda self, **kw: {"stub": True}
        )

        payload = {"foo": "bar", "n": 1}
        aid = audio_db.write_audio_analysis(bundle, session_payload=payload)
        out = tmp_path / f"{aid}.json"
        loaded = json.loads(out.read_text(encoding="utf-8"))
        assert loaded["voice_session_report"] == payload

    def test_database_url_set_still_writes_json(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        # Pin: when DATABASE_URL is set, the v1 writer logs a warning
        # but STILL writes the JSON. Postgres writer is deferred —
        # callers must not silently drop data because Postgres looks
        # configured.
        monkeypatch.setenv("DEEPSYNAPS_AUDIO_ANALYSIS_DIR", str(tmp_path))
        monkeypatch.setenv("DATABASE_URL", "postgresql://x/y")
        bundle = self._fake_bundle()
        monkeypatch.setattr(
            type(bundle), "model_dump", lambda self, **kw: {"stub": True}
        )

        aid = audio_db.write_audio_analysis(bundle)
        out = tmp_path / f"{aid}.json"
        # JSON written even though Postgres is "configured".
        assert out.exists()

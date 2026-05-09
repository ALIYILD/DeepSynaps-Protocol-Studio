"""Tests for ``deepsynaps_qa._compat``.

Pins the **optional-dep guards** that let the QA engine run with a slim
install: every QA check that needs Presidio or textstat must call these
helpers and degrade to a NOT-installed code path if they return None.

Key contracts:

- ``get_presidio_analyzer()`` returns a usable AnalyzerEngine when
  Presidio is importable, else None.
- ``get_textstat()`` returns the module when textstat is importable,
  else None.
- Neither helper RAISES on a missing optional dep — that's the whole
  point. A regression that let an ImportError escape would crash the
  QA runner on a slim install instead of skipping the check.
"""
from __future__ import annotations

import builtins
import sys
import types
from unittest import mock

import pytest

from deepsynaps_qa import _compat


class TestGetPresidioAnalyzer:
    def test_missing_presidio_returns_none(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin the slim-install path: ImportError is swallowed and
        # the helper returns None — never propagates to the caller.
        original_import = builtins.__import__

        def _block_presidio(name: str, *args, **kwargs):
            if name == "presidio_analyzer":
                raise ImportError("forced for test")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", _block_presidio)
        # Drop any cached module so the import is re-attempted.
        monkeypatch.delitem(sys.modules, "presidio_analyzer", raising=False)

        assert _compat.get_presidio_analyzer() is None

    def test_present_presidio_returns_engine(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin the success path: when presidio_analyzer IS importable,
        # the helper returns a fresh AnalyzerEngine instance — not None.
        # We inject a fake module so the test works regardless of
        # whether presidio is actually installed in the test env.
        fake_engine = mock.MagicMock(name="AnalyzerEngine-instance")
        fake_engine_cls = mock.MagicMock(return_value=fake_engine)
        fake_module = types.ModuleType("presidio_analyzer")
        fake_module.AnalyzerEngine = fake_engine_cls  # type: ignore[attr-defined]

        monkeypatch.setitem(sys.modules, "presidio_analyzer", fake_module)

        out = _compat.get_presidio_analyzer()
        assert out is fake_engine
        fake_engine_cls.assert_called_once_with()


class TestGetTextstat:
    def test_missing_textstat_returns_none(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: ImportError on textstat is swallowed; helper returns
        # None so callers can skip readability checks instead of
        # crashing on a slim install.
        original_import = builtins.__import__

        def _block_textstat(name: str, *args, **kwargs):
            if name == "textstat":
                raise ImportError("forced for test")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", _block_textstat)
        monkeypatch.delitem(sys.modules, "textstat", raising=False)

        assert _compat.get_textstat() is None

    def test_present_textstat_returns_module(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: helper returns the textstat module reference (not a
        # subset / proxy) so callers can dispatch on whatever
        # function they need.
        fake_textstat = types.ModuleType("textstat")
        fake_textstat.flesch_reading_ease = lambda s: 50.0  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "textstat", fake_textstat)

        out = _compat.get_textstat()
        assert out is fake_textstat
        # Must expose textstat's documented surface.
        assert callable(out.flesch_reading_ease)

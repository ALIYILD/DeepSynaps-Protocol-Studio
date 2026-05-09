"""Tests for qeeg_encoder.cli.main."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from qeeg_encoder import cli


# ───────────────────────────── lockcheck command ───────────────────────────


class TestLockcheckCommand:
    def test_returns_0_when_no_violations(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture,
    ) -> None:
        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "lockcheck", "--path", "fake.yaml"])
        with patch.object(cli, "check_lockfile", return_value=[]):
            rc = cli.main()
        out = capsys.readouterr().out
        assert rc == 0
        assert "OK" in out
        assert "fake.yaml" in out

    def test_returns_1_when_violations_present(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture,
    ) -> None:
        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "lockcheck"])
        with patch.object(cli, "check_lockfile", return_value=["pin missing", "hash drift"]):
            rc = cli.main()
        err = capsys.readouterr().err
        assert rc == 1
        assert "FAIL: pin missing" in err
        assert "FAIL: hash drift" in err

    def test_passes_path_to_check_lockfile(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "lockcheck", "--path", "tmp/x.yaml"])
        with patch.object(cli, "check_lockfile", return_value=[]) as mock_check:
            cli.main()
        # check_lockfile receives a Path, not a string.
        call_arg = mock_check.call_args[0][0]
        assert isinstance(call_arg, Path)
        # Compare via Path semantics so the test works on both posix and Windows.
        assert call_arg == Path("tmp/x.yaml")

    def test_default_lock_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "lockcheck"])
        with patch.object(cli, "check_lockfile", return_value=[]) as mock_check:
            cli.main()
        assert mock_check.call_args[0][0] == Path("configs/models.lock.yaml")


# ───────────────────────────── config command ──────────────────────────────


class TestConfigCommand:
    def test_prints_settings_as_json(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture,
    ) -> None:
        from unittest.mock import MagicMock

        fake_settings = MagicMock()
        fake_settings.model_dump_json = MagicMock(return_value='{"k":"v"}')

        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "config", "--path", "configs/x.yaml"])
        with patch.object(cli, "load_settings", return_value=fake_settings) as mock_load:
            rc = cli.main()
        out = capsys.readouterr().out
        assert rc == 0
        assert out.strip() == '{"k":"v"}'
        mock_load.assert_called_once_with("configs/x.yaml")
        fake_settings.model_dump_json.assert_called_once_with(indent=2)

    def test_default_config_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from unittest.mock import MagicMock

        fake = MagicMock()
        fake.model_dump_json = MagicMock(return_value="{}")
        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "config"])
        with patch.object(cli, "load_settings", return_value=fake) as mock_load:
            cli.main()
        mock_load.assert_called_once_with("configs/default.yaml")


# ───────────────────────────── argparse routing ────────────────────────────


class TestArgparseRouting:
    def test_no_subcommand_raises_systemexit(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # argparse exits with code 2 when a required subparser is missing.
        monkeypatch.setattr("sys.argv", ["qeeg-encoder"])
        with pytest.raises(SystemExit) as exc:
            cli.main()
        assert exc.value.code == 2

    def test_unknown_subcommand_raises_systemexit(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr("sys.argv", ["qeeg-encoder", "totally-fake-command"])
        with pytest.raises(SystemExit):
            cli.main()

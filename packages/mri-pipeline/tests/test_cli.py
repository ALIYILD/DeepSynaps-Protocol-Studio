"""Tests for deepsynaps_mri.cli.

The CLI is a thin wrapper around run_pipeline + db.save_report +
report.render_html/render_pdf. We mock all three at module attribute
level so the CLI's argparse + I/O glue is exercised without dragging
in the actual pipeline (which needs DICOM/NIfTI fixtures).
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from deepsynaps_mri import cli


# ───────────────────────────── _build_parser ───────────────────────────────


class TestBuildParser:
    def test_parser_has_subcommand_required(self) -> None:
        parser = cli._build_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([])

    def test_analyze_parses_minimal_args(self) -> None:
        parser = cli._build_parser()
        args = parser.parse_args([
            "analyze", "--session", "/tmp/s", "--patient", "P1", "--out", "/tmp/o",
        ])
        assert args.cmd == "analyze"
        assert args.session == "/tmp/s"
        assert args.patient == "P1"
        assert args.out == "/tmp/o"
        # Defaults
        assert args.age is None
        assert args.sex is None
        assert args.condition == "mdd"
        assert args.stage is None
        assert args.no_db is False
        assert args.log == "INFO"

    def test_analyze_optional_args(self) -> None:
        parser = cli._build_parser()
        args = parser.parse_args([
            "analyze",
            "--session", "/tmp/s",
            "--patient", "P1",
            "--out", "/tmp/o",
            "--age", "45",
            "--sex", "F",
            "--condition", "anxiety",
            "--stage", "preprocess",
            "--stage", "segmentation",
            "--no-db",
            "--log", "DEBUG",
        ])
        assert args.age == 45
        assert args.sex == "F"
        assert args.condition == "anxiety"
        assert args.stage == ["preprocess", "segmentation"]
        assert args.no_db is True
        assert args.log == "DEBUG"

    def test_sex_constrained_to_choices(self) -> None:
        parser = cli._build_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([
                "analyze",
                "--session", "/tmp/s", "--patient", "P1", "--out", "/tmp/o",
                "--sex", "X",  # not in {F, M, O}
            ])

    def test_report_parses_minimal_args(self) -> None:
        parser = cli._build_parser()
        args = parser.parse_args([
            "report", "--analysis-id", "uuid-1", "--out", "/tmp/o",
        ])
        assert args.cmd == "report"
        assert args.analysis_id == "uuid-1"
        assert args.out == "/tmp/o"


# ───────────────────────────── _cmd_analyze ────────────────────────────────


def _mk_report() -> MagicMock:
    """Mock pipeline output that mimics the MRIReport contract."""
    rep = MagicMock()
    rep.analysis_id = "analysis-uuid-1"
    rep.model_dump_json = MagicMock(return_value='{"k":"v"}')
    return rep


class TestCmdAnalyze:
    def test_writes_report_json_and_calls_save(
        self, tmp_path: Path, capsys: pytest.CaptureFixture,
    ) -> None:
        rep = _mk_report()
        out_dir = tmp_path / "P1"
        with patch.object(cli, "run_pipeline", return_value=rep) as mock_run, \
             patch.object(cli, "db_mod") as mock_db:
            rc = cli.main([
                "analyze",
                "--session", str(tmp_path / "session"),
                "--patient", "P1",
                "--age", "45",
                "--sex", "F",
                "--out", str(out_dir),
            ])
        assert rc == 0
        # report.json written
        assert (out_dir / "report.json").read_text(encoding="utf-8") == '{"k":"v"}'
        # run_pipeline got the right kwargs
        assert mock_run.call_count == 1
        kwargs = mock_run.call_args.kwargs
        assert kwargs.get("condition") == "mdd"
        assert kwargs.get("only") is None
        # db.save_report was called by default (no --no-db)
        mock_db.save_report.assert_called_once_with(rep)
        # stdout contains analysis_id JSON
        out = capsys.readouterr().out
        body = json.loads(out)
        assert body["analysis_id"] == "analysis-uuid-1"
        assert body["out"] == str(out_dir)

    def test_no_db_skips_save(self, tmp_path: Path) -> None:
        rep = _mk_report()
        with patch.object(cli, "run_pipeline", return_value=rep), \
             patch.object(cli, "db_mod") as mock_db:
            cli.main([
                "analyze",
                "--session", str(tmp_path / "session"),
                "--patient", "P1",
                "--out", str(tmp_path / "o"),
                "--no-db",
            ])
        mock_db.save_report.assert_not_called()

    def test_db_save_failure_is_warned_not_raised(
        self, tmp_path: Path, caplog: pytest.LogCaptureFixture,
    ) -> None:
        rep = _mk_report()
        with patch.object(cli, "run_pipeline", return_value=rep), \
             patch.object(cli, "db_mod") as mock_db:
            mock_db.save_report.side_effect = RuntimeError("postgres down")
            with caplog.at_level("WARNING"):
                rc = cli.main([
                    "analyze",
                    "--session", str(tmp_path / "session"),
                    "--patient", "P1",
                    "--out", str(tmp_path / "o"),
                ])
        # The CLI swallows DB errors with a warning (Postgres optional in dev).
        assert rc == 0
        assert any("Postgres save failed" in r.getMessage() for r in caplog.records)

    def test_stage_filter_passes_only_kwarg(self, tmp_path: Path) -> None:
        rep = _mk_report()
        with patch.object(cli, "run_pipeline", return_value=rep) as mock_run, \
             patch.object(cli, "db_mod"):
            cli.main([
                "analyze",
                "--session", str(tmp_path / "s"),
                "--patient", "P1",
                "--out", str(tmp_path / "o"),
                "--stage", "preprocess",
                "--stage", "segmentation",
            ])
        kwargs = mock_run.call_args.kwargs
        assert kwargs["only"] == ["preprocess", "segmentation"]

    def test_sex_passes_through_to_patient_meta(self, tmp_path: Path) -> None:
        rep = _mk_report()
        with patch.object(cli, "run_pipeline", return_value=rep) as mock_run, \
             patch.object(cli, "db_mod"):
            cli.main([
                "analyze",
                "--session", str(tmp_path / "s"),
                "--patient", "P1",
                "--sex", "M",
                "--out", str(tmp_path / "o"),
            ])
        # Second positional arg to run_pipeline is PatientMeta.
        patient = mock_run.call_args.args[1]
        # PatientMeta carries the Sex enum through from --sex
        assert patient.patient_id == "P1"
        assert patient.sex is not None


# ───────────────────────────── _cmd_report ─────────────────────────────────


class TestCmdReport:
    def test_re_renders_html_and_pdf(
        self, tmp_path: Path, capsys: pytest.CaptureFixture,
    ) -> None:
        out_dir = tmp_path / "out"
        with patch.object(cli, "db_mod") as mock_db, \
             patch.object(cli, "rep_mod") as mock_rep:
            mock_db.load_report.return_value = SimpleNamespace(analysis_id="x")
            mock_rep.render_html.return_value = out_dir / "report.html"
            mock_rep.render_pdf.return_value = out_dir / "report.pdf"
            rc = cli.main([
                "report", "--analysis-id", "uuid-1", "--out", str(out_dir),
            ])
        assert rc == 0
        mock_db.load_report.assert_called_once_with("uuid-1")
        mock_rep.render_html.assert_called_once()
        mock_rep.render_pdf.assert_called_once()
        out = capsys.readouterr().out
        body = json.loads(out)
        assert body["html"].endswith("report.html")
        assert body["pdf"].endswith("report.pdf")


# ───────────────────────────── main routing ────────────────────────────────


class TestMainRouting:
    def test_returns_2_on_unknown_command(self) -> None:
        # argparse with required=True surfaces unknown commands as SystemExit
        # before reaching the routing branches.
        with pytest.raises(SystemExit):
            cli.main(["totally-fake"])

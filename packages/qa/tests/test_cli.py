"""Tests for ``deepsynaps_qa.cli`` (the studio-qa Typer entry point).

Pins the CLI exit-code contract — automation pipelines and CI gates
rely on these specific codes:

- ``run`` exits 0 on PASS, 1 on FAIL, 2 on NEEDS_REVIEW (only when
  --strict), 3 on input errors (missing artifact, unknown spec,
  malformed JSON).
- ``list-specs`` lists every entry in SPEC_REGISTRY.
- ``list-checks`` lists every (category, check class) pair; the
  ``--category`` filter narrows by prefix.
- ``explain`` resolves the check_id prefix to a category, returns
  exit 1 on unknown category, otherwise prints the known checks
  in that category.
- Output flag (--output) selects between table / json / markdown.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from deepsynaps_qa.cli import app


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture
def golden_qeeg_artifact_path(tmp_path: Path) -> Path:
    src = (
        Path(__file__).parent / "fixtures" / "golden_qeeg_narrative.json"
    )
    out = tmp_path / "artifact.json"
    out.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return out


# ── list-specs ───────────────────────────────────────────────────────────


class TestListSpecs:
    def test_lists_every_registered_spec(self, runner: CliRunner) -> None:
        result = runner.invoke(app, ["list-specs"])
        assert result.exit_code == 0
        # The four canonical specs are documented to ship.
        assert "spec:qeeg_narrative_v1" in result.output
        assert "spec:mri_report_v1" in result.output
        assert "spec:protocol_draft_v1" in result.output
        assert "spec:brain_twin_summary_v1" in result.output


# ── list-checks ──────────────────────────────────────────────────────────


class TestListChecks:
    def test_lists_all_checks(self, runner: CliRunner) -> None:
        result = runner.invoke(app, ["list-checks"])
        assert result.exit_code == 0
        # Output groups checks by category — at minimum the canonical
        # categories appear.
        out = result.output
        assert "sections" in out
        assert "citations" in out

    def test_category_filter_narrows_output(self, runner: CliRunner) -> None:
        result = runner.invoke(app, ["list-checks", "--category", "sections"])
        assert result.exit_code == 0
        # When filtering by 'sections', other categories don't appear
        # as a prefix on a line.
        for line in result.output.splitlines():
            if line.strip():
                # Each non-blank line either starts whitespace then
                # 'sections' or contains 'sections' as the category.
                assert "sections" in line or line.startswith(" ")


# ── explain ──────────────────────────────────────────────────────────────


class TestExplain:
    def test_known_check_emits_category_and_weight(self, runner: CliRunner) -> None:
        result = runner.invoke(app, ["explain", "sections.x"])
        assert result.exit_code == 0
        assert "sections" in result.output
        assert "Category weight" in result.output

    def test_unknown_category_returns_exit_1(self, runner: CliRunner) -> None:
        # Pin: explain on an unknown category exits 1 (caller can
        # detect a typo cleanly).
        result = runner.invoke(app, ["explain", "not_a_real_category.x"])
        assert result.exit_code == 1
        assert "Unknown check category" in result.output


# ── run ──────────────────────────────────────────────────────────────────


class TestRunCommand:
    def test_missing_artifact_exits_3(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        # Pin: missing artifact file -> exit 3 (input error), not 1
        # (which means FAIL verdict).
        missing = tmp_path / "does_not_exist.json"
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(missing),
                "--spec",
                "spec:qeeg_narrative_v1",
            ],
        )
        assert result.exit_code == 3
        assert "artifact file not found" in result.output

    def test_unknown_spec_exits_3(
        self, runner: CliRunner, golden_qeeg_artifact_path: Path
    ) -> None:
        # Pin: unknown spec -> exit 3 + helpful spec listing in output.
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(golden_qeeg_artifact_path),
                "--spec",
                "spec:unknown",
            ],
        )
        assert result.exit_code == 3
        assert "unknown spec" in result.output.lower()
        # The known specs are listed for the operator.
        assert "Available specs" in result.output

    def test_malformed_json_exits_3(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        # Pin: malformed artifact JSON -> exit 3 (input error).
        bad = tmp_path / "bad.json"
        bad.write_text("{not json", encoding="utf-8")
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(bad),
                "--spec",
                "spec:qeeg_narrative_v1",
            ],
        )
        assert result.exit_code == 3
        assert "failed to parse artifact" in result.output

    def test_golden_artifact_exits_0_or_2(
        self, runner: CliRunner, golden_qeeg_artifact_path: Path
    ) -> None:
        # The golden fixture should pass (exit 0) or, at worst,
        # NEEDS_REVIEW (exit 2 only with --strict). Without --strict
        # it must NOT exit 1 (FAIL).
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(golden_qeeg_artifact_path),
                "--spec",
                "spec:qeeg_narrative_v1",
            ],
        )
        # Exit code should not be FAIL or input error.
        assert result.exit_code in (0,)

    def test_output_json_emits_parseable_json(
        self, runner: CliRunner, golden_qeeg_artifact_path: Path
    ) -> None:
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(golden_qeeg_artifact_path),
                "--spec",
                "spec:qeeg_narrative_v1",
                "--output",
                "json",
            ],
        )
        assert result.exit_code == 0
        # The output is a JSON object — round-trip parse to confirm.
        parsed = json.loads(result.output)
        assert "verdict" in parsed
        assert "score" in parsed

    def test_output_markdown_includes_findings_header(
        self, runner: CliRunner, golden_qeeg_artifact_path: Path
    ) -> None:
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(golden_qeeg_artifact_path),
                "--spec",
                "spec:qeeg_narrative_v1",
                "--output",
                "markdown",
            ],
        )
        assert result.exit_code == 0
        assert "# QA Report" in result.output
        assert "## Findings" in result.output

    def test_output_table_includes_run_id_and_score(
        self, runner: CliRunner, golden_qeeg_artifact_path: Path
    ) -> None:
        # Default output is table — pin it carries the documented header rows.
        result = runner.invoke(
            app,
            [
                "run",
                "--artifact",
                str(golden_qeeg_artifact_path),
                "--spec",
                "spec:qeeg_narrative_v1",
            ],
        )
        assert result.exit_code == 0
        assert "Run ID:" in result.output
        assert "Score:" in result.output
        assert "Verdict:" in result.output

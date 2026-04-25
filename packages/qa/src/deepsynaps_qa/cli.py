"""studio-qa CLI — Typer-based command-line interface for the QA engine."""

from __future__ import annotations

import json
from pathlib import Path

import typer

from deepsynaps_qa.engine import QAEngine
from deepsynaps_qa.models import Artifact, Verdict
from deepsynaps_qa.specs import SPEC_REGISTRY, get_spec, list_specs

app = typer.Typer(
    add_completion=False,
    help="DeepSynaps QA — artifact completeness scoring engine.",
)


@app.command()
def run(
    artifact: Path = typer.Option(..., "--artifact", help="Path to artifact JSON file"),
    spec: str = typer.Option(..., "--spec", help="Spec ID (e.g. spec:qeeg_narrative_v1)"),
    output: str = typer.Option("table", "--output", help="Output format: json, markdown, table"),
    strict: bool = typer.Option(
        False, "--strict", help="Exit 2 on NEEDS_REVIEW (default: exit 1 on FAIL only)"
    ),
) -> None:
    """Run QA against a specific artifact file using a named spec."""
    if not artifact.exists():
        typer.echo(f"Error: artifact file not found: {artifact}", err=True)
        raise typer.Exit(3)

    qa_spec = get_spec(spec)
    if qa_spec is None:
        typer.echo(f"Error: unknown spec ID '{spec}'", err=True)
        typer.echo(f"Available specs: {', '.join(SPEC_REGISTRY.keys())}", err=True)
        raise typer.Exit(3)

    try:
        raw = json.loads(artifact.read_text(encoding="utf-8"))
        art = Artifact(**raw)
    except Exception as exc:
        typer.echo(f"Error: failed to parse artifact: {exc}", err=True)
        raise typer.Exit(3) from None

    engine = QAEngine()
    result = engine.run(art, qa_spec)

    if output == "json":
        typer.echo(result.model_dump_json(indent=2))
    elif output == "markdown":
        _print_markdown(result)
    else:
        _print_table(result)

    # Exit codes
    if result.verdict == Verdict.FAIL:
        raise typer.Exit(1)
    if strict and result.verdict == Verdict.NEEDS_REVIEW:
        raise typer.Exit(2)
    raise typer.Exit(0)


@app.command("list-specs")
def list_specs_cmd() -> None:
    """List all available spec IDs."""
    for s in list_specs():
        typer.echo(f"  {s.spec_id}  ({s.artifact_type.value})")


@app.command("list-checks")
def list_checks_cmd(
    spec: str | None = typer.Option(None, "--spec", help="Filter by spec ID"),
    category: str | None = typer.Option(None, "--category", help="Filter by category"),
) -> None:
    """List all check IDs."""
    from deepsynaps_qa.checks import CheckRegistry, _ensure_checks_imported

    _ensure_checks_imported()

    all_checks = CheckRegistry.all_checks()
    for cat, classes in sorted(all_checks.items()):
        if category and cat != category:
            continue
        for cls in classes:
            typer.echo(f"  {cat:<16} {cls.__name__}")


@app.command()
def explain(
    check_id: str = typer.Argument(..., help="Check ID to explain"),
) -> None:
    """Explain a specific check: description, severity, weight, examples."""
    from deepsynaps_qa.checks import CheckRegistry, _ensure_checks_imported
    from deepsynaps_qa.verdicts import DEFAULT_CATEGORY_WEIGHTS

    _ensure_checks_imported()

    category = check_id.split(".")[0]
    all_checks = CheckRegistry.all_checks()

    if category not in all_checks:
        typer.echo(f"Unknown check category: {category}", err=True)
        raise typer.Exit(1)

    weight = DEFAULT_CATEGORY_WEIGHTS.get(category, 0.0)
    typer.echo(f"  Check ID:       {check_id}")
    typer.echo(f"  Category:       {category}")
    typer.echo(f"  Category weight: {weight}")
    typer.echo("  Registered checks in this category:")
    for cls in all_checks[category]:
        typer.echo(f"    - {cls.__name__}")


def _print_table(result) -> None:
    """Print a human-readable table summary."""
    typer.echo(f"Run ID:   {result.run_id}")
    typer.echo(f"Artifact: {result.artifact_id}")
    typer.echo(f"Spec:     {result.spec_id}")
    typer.echo(f"Score:    {result.score.numeric:.2f} / 100")
    typer.echo(f"Verdict:  {result.verdict.value}")
    typer.echo("")
    typer.echo(f"{'Category':<16} {'Score':>8}    Issues")
    typer.echo("-" * 50)
    for cat, earned in sorted(result.score.breakdown.items()):
        # Count issues for this category
        issues = [
            r for r in result.check_results if r.check_id.startswith(cat) and not r.passed
        ]
        issue_str = ", ".join(
            f"{r.severity.value} ({r.check_id})" for r in issues
        ) if issues else "-"
        typer.echo(f"{cat:<16} {earned:>7.1f}    {issue_str}")


def _print_markdown(result) -> None:
    """Print a Markdown-formatted summary."""
    typer.echo(f"# QA Report: {result.artifact_id}")
    typer.echo("")
    typer.echo(f"- **Spec:** {result.spec_id}")
    typer.echo(f"- **Score:** {result.score.numeric:.2f} / 100")
    typer.echo(f"- **Verdict:** {result.verdict.value}")
    typer.echo(f"- **Blocks:** {result.score.block_count}")
    typer.echo(f"- **Warnings:** {result.score.warning_count}")
    typer.echo("")
    typer.echo("## Findings")
    typer.echo("")
    for r in result.check_results:
        if not r.passed:
            typer.echo(f"- **{r.severity.value}** `{r.check_id}`: {r.message}")


if __name__ == "__main__":
    app()

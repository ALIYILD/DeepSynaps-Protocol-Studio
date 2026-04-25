from __future__ import annotations

from pathlib import Path

import typer


app = typer.Typer(add_completion=False, help="Export weights for runtime inference.")


@app.command()
def main(
    weights_path: Path = typer.Argument(..., help="Path to a *.pt state_dict."),
    task: str = typer.Option(..., help="Task key (e.g. adhd)."),
    version: str = typer.Option("dev", help="Version label recorded in registry."),
    registry_path: Path = typer.Option(
        Path("./registry.local.yaml"),
        help="Where to write a registry entry (for later promotion to S3/MLflow).",
    ),
) -> None:
    """Write a small registry entry alongside the weights artifact.

    This intentionally avoids assuming a specific MLOps backend (MLflow registry,
    S3 promotion, etc.). Production runtime consumes a curated YAML registry.
    """

    import hashlib
    import yaml

    if not weights_path.exists():
        raise typer.BadParameter(f"weights_path does not exist: {weights_path}")

    sha256 = hashlib.sha256(weights_path.read_bytes()).hexdigest()

    entry = {
        "task": task,
        "version": version,
        "sha256": sha256,
        "artifact": str(weights_path.as_posix()),
        "notes": "promote this entry into the production registry when ready",
    }

    registry_path.parent.mkdir(parents=True, exist_ok=True)
    if registry_path.exists():
        existing = yaml.safe_load(registry_path.read_text(encoding="utf-8")) or {}
    else:
        existing = {}

    existing.setdefault("models", {})
    existing["models"].setdefault(task, [])
    existing["models"][task].append(entry)

    registry_path.write_text(yaml.safe_dump(existing, sort_keys=False), encoding="utf-8")
    typer.echo(f"wrote registry entry → {registry_path}")


if __name__ == "__main__":
    app()


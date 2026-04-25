from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import urlretrieve


@dataclass(frozen=True, slots=True)
class ModelSpec:
    task: str
    version: str
    artifact: str
    sha256: str | None = None
    model_class: str | None = None
    metadata: dict[str, Any] | None = None


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_weights(artifact: str, *, cache_dir: str | Path = ".cache/qeeg-models") -> Path:
    """Fetch a weights artifact into a local cache and return its path.

    Supported schemes
    -----------------
    - local path: `/abs/or/relative.pt`
    - file URL: `file:///.../weights.pt`
    - HTTPS URL: `https://.../weights.pt`
    - S3 URL: `s3://bucket/key.pt` (requires `boto3`)
    """

    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    parsed = urlparse(artifact)
    scheme = parsed.scheme.lower()

    if scheme in ("", "path"):
        p = Path(artifact)
        if not p.exists():
            raise FileNotFoundError(f"weights not found: {p}")
        return p

    if scheme == "file":
        p = Path(parsed.path)
        if not p.exists():
            raise FileNotFoundError(f"weights not found: {p}")
        return p

    if scheme in ("http", "https"):
        filename = os.path.basename(parsed.path) or "weights.pt"
        out = cache_dir / filename
        if not out.exists():
            urlretrieve(artifact, out)
        return out

    if scheme == "s3":
        try:
            import boto3  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("S3 download requires boto3") from exc

        bucket = parsed.netloc
        key = parsed.path.lstrip("/")
        filename = os.path.basename(key) or "weights.pt"
        out = cache_dir / filename
        if not out.exists():
            boto3.client("s3").download_file(bucket, key, str(out))
        return out

    raise ValueError(f"Unsupported artifact scheme: {scheme!r} ({artifact})")


def _load_registry(registry_path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Loading model registry requires PyYAML. Install it via `pip install pyyaml` "
            "or avoid calling deepsynaps_qeeg.models.load_model()."
        ) from exc

    return yaml.safe_load(registry_path.read_text(encoding="utf-8")) or {}


def load_model(
    task: str,
    *,
    version: str | None = None,
    registry_path: str | Path | None = None,
    cache_dir: str | Path = ".cache/qeeg-models",
) -> Any:
    """Resolve a model spec from `registry.yaml`, download weights, and load it.

    Returns a framework object (typically `torch.nn.Module`) when torch is available.
    """

    if registry_path is None:
        registry_path = Path(__file__).with_name("registry.yaml")
    else:
        registry_path = Path(registry_path)

    registry = _load_registry(registry_path)
    models = registry.get("models", {})
    entries = models.get(task, [])
    if not entries:
        raise KeyError(f"No model registered for task={task!r} in {registry_path}")

    if version is None:
        entry = entries[-1]
    else:
        try:
            entry = next(e for e in entries if e.get("version") == version)
        except StopIteration as exc:
            raise KeyError(f"No model registered for task={task!r} version={version!r}") from exc

    spec = ModelSpec(
        task=task,
        version=entry.get("version", "unknown"),
        artifact=entry["artifact"],
        sha256=entry.get("sha256"),
        model_class=entry.get("model_class"),
        metadata=entry.get("metadata"),
    )

    weights_path = download_weights(spec.artifact, cache_dir=cache_dir)
    if spec.sha256 is not None:
        got = _sha256(weights_path)
        if got != spec.sha256:
            raise ValueError(
                f"weights sha256 mismatch for {weights_path} (expected {spec.sha256}, got {got})"
            )

    from .inference import load_model_from_spec

    return load_model_from_spec(spec, weights_path)


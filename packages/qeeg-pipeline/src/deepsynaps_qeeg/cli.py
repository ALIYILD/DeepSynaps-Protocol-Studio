"""Command-line entry point for the qEEG analyzer.

Usage::

    qeeg /path/to/patient.edf --age 35 --sex F --out ./out
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def _serialise(obj: Any) -> Any:
    """JSON-friendly converter for numpy / Path / dataclass-ish values."""
    import math

    try:
        import numpy as np  # local import
    except Exception:  # pragma: no cover
        np = None  # type: ignore[assignment]

    if obj is None:
        return None
    if isinstance(obj, (str, bool, int)):
        return obj
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, Path):
        return str(obj)
    if np is not None:
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.floating,)):
            f = float(obj)
            return f if math.isfinite(f) else None
        if isinstance(obj, (np.integer,)):
            return int(obj)
    if isinstance(obj, dict):
        return {str(k): _serialise(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_serialise(v) for v in obj]
    return str(obj)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="qeeg",
        description="DeepSynaps qEEG analyzer — upload EDF/BDF/BrainVision, get a report.",
    )
    parser.add_argument("eeg_path", help="Path to the input EEG file")
    parser.add_argument("--age", type=int, default=None, help="Subject age in years")
    parser.add_argument("--sex", choices=["M", "F"], default=None, help="Subject sex")
    parser.add_argument(
        "--out",
        default="./qeeg_out",
        help="Output directory for features.json, zscores.json, quality.json, report.*",
    )
    parser.add_argument(
        "--no-source",
        action="store_true",
        help="Skip eLORETA source localization (much faster, no MRI deps required).",
    )
    parser.add_argument(
        "--notch", type=float, default=50.0, help="Notch frequency in Hz (default 50)."
    )
    parser.add_argument(
        "--log-level", default="INFO", help="Python logging level (default INFO)."
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code.

    Parameters
    ----------
    argv : list of str or None
        Optional argument vector (useful for tests). ``None`` means use
        :data:`sys.argv`.

    Returns
    -------
    int
        0 on success, non-zero on failure.
    """
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    from .pipeline import run_full_pipeline

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info("Running pipeline on %s", args.eeg_path)
    result = run_full_pipeline(
        args.eeg_path,
        age=args.age,
        sex=args.sex,
        notch_hz=args.notch,
        do_source_localization=not args.no_source,
        do_report=True,
        out_dir=out_dir,
    )

    (out_dir / "features.json").write_text(
        json.dumps(_serialise(result.features), indent=2), encoding="utf-8"
    )
    (out_dir / "zscores.json").write_text(
        json.dumps(_serialise(result.zscores), indent=2), encoding="utf-8"
    )
    (out_dir / "quality.json").write_text(
        json.dumps(_serialise(result.quality), indent=2), encoding="utf-8"
    )
    if result.report_html is not None:
        (out_dir / "report.html").write_text(result.report_html, encoding="utf-8")
    log.info("Wrote artifacts to %s", out_dir)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

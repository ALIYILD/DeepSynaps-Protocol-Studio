"""
Command-line entry point: ``python -m deepsynaps_mri.cli``.

Usage:
  deepsynaps-mri analyze --session ./run01 --patient P001 --condition mdd --out ./artefacts/P001
  deepsynaps-mri report  --analysis-id <uuid> --out ./artefacts/P001

The CLI is a thin wrapper around pipeline.run_pipeline + db.save_report +
report.render_html/render_pdf.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from . import db as db_mod
from . import report as rep_mod
from .pipeline import run_pipeline
from .schemas import PatientMeta, Sex


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser("deepsynaps-mri")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="Run the pipeline end-to-end")
    a.add_argument("--session", required=True, help="DICOM or NIfTI session dir")
    a.add_argument("--patient", required=True, help="patient_id")
    a.add_argument("--age", type=int, default=None)
    a.add_argument("--sex", choices=["F", "M", "O"], default=None)
    a.add_argument("--condition", default="mdd")
    a.add_argument("--out", required=True)
    a.add_argument("--stage", action="append", default=None,
                   help="run only the given stage(s); repeat flag for multiple")
    a.add_argument("--no-db", action="store_true", help="skip Postgres persistence")
    a.add_argument("--log", default="INFO")

    r = sub.add_parser("report", help="Re-render HTML/PDF from a stored MRIReport")
    r.add_argument("--analysis-id", required=True)
    r.add_argument("--out", required=True)

    return p


def _cmd_analyze(args) -> int:
    logging.basicConfig(level=getattr(logging, args.log.upper(), logging.INFO),
                        format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
    patient = PatientMeta(
        patient_id=args.patient,
        age=args.age,
        sex=Sex(args.sex) if args.sex else None,
    )
    report = run_pipeline(
        args.session,
        patient,
        args.out,
        condition=args.condition,
        only=args.stage,
    )
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(report.model_dump_json(indent=2), encoding="utf-8")
    if not args.no_db:
        try:
            db_mod.save_report(report)
        except Exception as e:                                  # noqa: BLE001
            logging.warning("Postgres save failed: %s", e)
    print(json.dumps({"analysis_id": str(report.analysis_id),
                      "out": str(out)}, indent=2))
    return 0


def _cmd_report(args) -> int:
    rep = db_mod.load_report(args.analysis_id)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    html = rep_mod.render_html(rep, out / "report.html")
    pdf = rep_mod.render_pdf(html, out / "report.pdf")
    print(json.dumps({"html": str(html), "pdf": str(pdf)}, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.cmd == "analyze":
        return _cmd_analyze(args)
    if args.cmd == "report":
        return _cmd_report(args)
    return 2


if __name__ == "__main__":
    sys.exit(main())

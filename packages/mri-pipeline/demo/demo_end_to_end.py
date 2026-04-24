"""
End-to-end demo — round-trips the sample MRIReport JSON through the
schemas, builds overlays from canonical atlas targets (no real NIfTI
needed if you provide a template path), and renders the HTML report.

Usage:
    python demo/demo_end_to_end.py --out ./demo_out
    python demo/demo_end_to_end.py --out ./demo_out --t1 /path/to/MNI152NLin2009cAsym_T1w.nii.gz
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from deepsynaps_mri.schemas import MRIReport           # noqa: E402
from deepsynaps_mri.report import render_html           # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--t1", default=None,
                    help="Optional MNI T1 template NIfTI for overlay rendering")
    args = ap.parse_args()

    out = Path(args.out)
    (out / "overlays").mkdir(parents=True, exist_ok=True)

    here = Path(__file__).parent
    sample = json.loads((here / "sample_mri_report.json").read_text())
    report = MRIReport.model_validate(sample)

    if args.t1:
        from deepsynaps_mri.overlay import render_all_targets
        print("[demo] rendering overlays ...")
        arts = render_all_targets(report.stim_targets, args.t1, out / "overlays")
        for tid, a in arts.items():
            print(f"  {tid} -> {a.interactive_html}")

    html = render_html(report, out / "report.html")
    print(f"[demo] HTML report -> {html}")
    print(f"[demo] JSON round-trip OK ({len(report.stim_targets)} targets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

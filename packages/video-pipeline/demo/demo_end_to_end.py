"""End-to-end demo entry point.

Runs the full task pipeline against a sample clip and prints the resulting
``VideoAnalysisReport`` JSON. Used by the Studio preview deploy and as the
go-to integration smoke test once analyzers land.

TODO(impl): once ``pipeline.run_task`` is wired, replace the
``sample_video_report.json`` short-circuit with a real call.
"""

from __future__ import annotations

import json
from pathlib import Path


def main() -> int:
    report_path = Path(__file__).parent / "sample_video_report.json"
    print(json.dumps(json.loads(report_path.read_text()), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

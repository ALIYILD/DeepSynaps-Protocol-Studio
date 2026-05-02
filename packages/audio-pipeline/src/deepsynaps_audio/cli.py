"""``ds-audio`` CLI entrypoint."""

from __future__ import annotations

import argparse
import sys
from typing import Sequence


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ds-audio",
        description=(
            "DeepSynaps Audio / Voice Analyzer — clinical voice acoustics, "
            "neurological voice biomarkers, and neuromodulation follow-up. "
            "See AUDIO_ANALYZER_STACK.md for the v1 / v2 roadmap."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    qc_p = sub.add_parser("qc", help="Run quality control on a single recording.")
    qc_p.add_argument("path", help="Audio file to QC.")
    qc_p.add_argument(
        "--task",
        default="sustained_vowel_a",
        help="Task protocol slug (see constants.TASK_PROTOCOLS).",
    )

    analyze_p = sub.add_parser(
        "analyze",
        help="Run the end-to-end pipeline on a session manifest (JSON).",
    )
    analyze_p.add_argument(
        "manifest",
        help="Path to a session manifest JSON file.",
    )

    sub.add_parser("version", help="Print the pipeline version and exit.")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "version":
        from . import __version__

        print(__version__)
        return 0

    if args.command == "qc":
        # TODO (PR #1): wire ingestion.load_recording → quality.compute_qc.
        print(
            "ds-audio qc: not yet implemented — see AUDIO_ANALYZER_STACK.md §9 task 1.",
            file=sys.stderr,
        )
        return 2

    if args.command == "analyze":
        # TODO (PR #4): wire the orchestrator.
        print(
            "ds-audio analyze: not yet implemented — see AUDIO_ANALYZER_STACK.md §9 task 4.",
            file=sys.stderr,
        )
        return 2

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

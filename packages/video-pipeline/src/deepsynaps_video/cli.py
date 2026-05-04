"""``ds-video`` CLI entrypoint.

Matches the ``ds-mri`` / ``ds-qeeg`` shape. Subcommands:

- ``ds-video analyze <clip> --task <task_id> [--side L|R]`` — run a
  structured-task pipeline on a local clip.
- ``ds-video monitor <rtsp> --camera-id <id>`` — start a monitoring run
  (v2, feature-flagged).
- ``ds-video eval <manifest> --bundle <id>`` — run dataset evaluation.
"""

from __future__ import annotations

import argparse
import sys


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ds-video")
    sub = parser.add_subparsers(dest="cmd", required=True)

    analyze = sub.add_parser("analyze", help="run a clinical task pipeline")
    analyze.add_argument("clip", help="path to the input video clip")
    analyze.add_argument("--task", required=True)
    analyze.add_argument("--side", default="n/a", choices=["left", "right", "bilateral", "n/a"])
    analyze.add_argument("--research-consent", action="store_true")

    monitor = sub.add_parser("monitor", help="start a monitoring run (v2)")
    monitor.add_argument("rtsp")
    monitor.add_argument("--camera-id", required=True)
    monitor.add_argument("--duration-s", type=float, default=600.0)

    evalp = sub.add_parser("eval", help="run dataset evaluation against a manifest")
    evalp.add_argument("manifest")
    evalp.add_argument("--bundle", required=True)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "analyze":
        # TODO(impl): build TaskRunRequest, call pipeline.run_task,
        # write a JSON report to stdout. Print the analysis_id.
        raise NotImplementedError
    if args.cmd == "monitor":
        # TODO(impl): build MonitorRunRequest, call pipeline.run_monitor.
        raise NotImplementedError
    if args.cmd == "eval":
        # TODO(impl): call dataset.eval_runner.run_eval.
        raise NotImplementedError

    parser.print_help()
    return 2


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = ["build_parser", "main"]

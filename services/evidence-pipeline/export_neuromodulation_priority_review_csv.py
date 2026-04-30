from __future__ import annotations

import argparse
import csv
from pathlib import Path


DEFAULT_BUNDLE_ROOT = Path(__file__).resolve().parents[2] / "data" / "research" / "neuromodulation"
DEFAULT_INPUT = "derived/neuromodulation_product_ingest.csv"
DEFAULT_OUTPUT = "derived/neuromodulation_priority_review.csv"


def _to_int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except Exception:
        return 0


def _clean(value: str | None) -> str:
    return " ".join((value or "").split())


def build_priority_slice(bundle_root: Path, input_name: str, output_name: str, limit: int) -> dict[str, object]:
    src = bundle_root / input_name
    dst = bundle_root / output_name
    dst.parent.mkdir(parents=True, exist_ok=True)

    with src.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    rows.sort(
        key=lambda row: (
            _to_int(row.get("priority_score")),
            _to_int(row.get("paper_confidence_score")),
            _to_int(row.get("cited_by_count")),
            _to_int(row.get("year")),
        ),
        reverse=True,
    )

    review_fields = [
        "paper_key",
        "title",
        "year",
        "journal",
        "authors",
        "doi",
        "pmid",
        "record_url",
        "primary_modality",
        "canonical_modalities",
        "indication_tags",
        "condition_mentions_top",
        "target_tags",
        "study_type_normalized",
        "evidence_tier",
        "paper_confidence_score",
        "priority_score",
        "cited_by_count",
        "is_open_access",
        "real_world_evidence_flag",
        "trial_match_count",
        "fda_match_count",
        "trial_top_nct_ids",
        "fda_top_clearances",
        "research_summary",
        "abstract",
    ]

    selected = rows[:limit]
    with dst.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=review_fields)
        writer.writeheader()
        for row in selected:
            writer.writerow({field: _clean(row.get(field, "")) for field in review_fields})

    return {
        "input_path": str(src),
        "output_path": str(dst),
        "rows_written": len(selected),
        "column_count": len(review_fields),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a top-ranked neuromodulation evidence review CSV.")
    parser.add_argument("--bundle-root", type=Path, default=DEFAULT_BUNDLE_ROOT)
    parser.add_argument("--input-name", default=DEFAULT_INPUT)
    parser.add_argument("--output-name", default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=5000)
    args = parser.parse_args()

    result = build_priority_slice(args.bundle_root.resolve(), args.input_name, args.output_name, args.limit)
    print(result)


if __name__ == "__main__":
    main()

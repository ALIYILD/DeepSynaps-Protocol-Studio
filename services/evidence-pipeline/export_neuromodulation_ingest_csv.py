from __future__ import annotations

import argparse
import csv
from pathlib import Path


DEFAULT_BUNDLE_ROOT = Path(__file__).resolve().parents[2] / "data" / "research" / "neuromodulation"
DEFAULT_INPUT = "neuromodulation_master_database_enriched.csv"
DEFAULT_OUTPUT = "derived/neuromodulation_product_ingest.csv"

OUTPUT_FIELDS = [
    "paper_key",
    "title",
    "abstract",
    "research_summary",
    "authors",
    "journal",
    "year",
    "doi",
    "pmid",
    "pmcid",
    "record_url",
    "source",
    "pub_type",
    "study_type_normalized",
    "evidence_tier",
    "primary_modality",
    "canonical_modalities",
    "invasiveness",
    "indication_tags",
    "condition_mentions_top",
    "population_tags",
    "target_tags",
    "parameter_signal_tags",
    "safety_signal_tags",
    "contraindication_signal_tags",
    "protocol_relevance_score",
    "matched_query_terms",
    "is_open_access",
    "cited_by_count",
    "outcome_snippet_count",
    "outcome_categories",
    "real_world_evidence_flag",
    "paper_confidence_score",
    "priority_score",
    "trial_match_count",
    "trial_top_nct_ids",
    "trial_summary",
    "trial_protocol_parameter_summary",
    "fda_match_count",
    "fda_top_clearances",
    "fda_summary",
    "regulatory_clinical_signal",
    "trial_signal_score",
    "fda_signal_score",
]


def _clean(value: str | None) -> str:
    return " ".join((value or "").split())


def export_csv(bundle_root: Path, input_name: str, output_name: str) -> dict[str, object]:
    source_path = bundle_root / input_name
    output_path = bundle_root / output_name
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows_written = 0
    with source_path.open("r", encoding="utf-8", newline="") as src, output_path.open(
        "w", encoding="utf-8", newline=""
    ) as dst:
        reader = csv.DictReader(src)
        writer = csv.DictWriter(dst, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        for row in reader:
            writer.writerow({field: _clean(row.get(field, "")) for field in OUTPUT_FIELDS})
            rows_written += 1

    return {
        "input_path": str(source_path),
        "output_path": str(output_path),
        "rows_written": rows_written,
        "column_count": len(OUTPUT_FIELDS),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a product-ingest neuromodulation literature CSV.")
    parser.add_argument("--bundle-root", type=Path, default=DEFAULT_BUNDLE_ROOT)
    parser.add_argument("--input-name", default=DEFAULT_INPUT)
    parser.add_argument("--output-name", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    result = export_csv(args.bundle_root.resolve(), args.input_name, args.output_name)
    print(result)


if __name__ == "__main__":
    main()

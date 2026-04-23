from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_SCHEMA_SRC = REPO_ROOT / "packages" / "core-schema" / "src"
if str(CORE_SCHEMA_SRC) not in sys.path:
    sys.path.insert(0, str(CORE_SCHEMA_SRC))

from deepsynaps_core_schema import ConditionKnowledgeBase


@dataclass(frozen=True)
class ConditionSpec:
    slug: str
    priority_rank: int
    indication_tags: tuple[str, ...]


PRIORITY_CONDITIONS: tuple[ConditionSpec, ...] = (
    ConditionSpec("major-depressive-disorder", 1, ("depression",)),
    ConditionSpec("ptsd", 2, ("ptsd",)),
    ConditionSpec("chronic-pain-fibromyalgia", 3, ("chronic_pain",)),
    ConditionSpec("parkinsons-disease", 4, ("parkinsons_disease",)),
    ConditionSpec("obsessive-compulsive-disorder", 5, ("ocd",)),
    ConditionSpec("drug-resistant-epilepsy", 6, ("epilepsy_seizures",)),
    ConditionSpec("stroke-rehabilitation", 7, ("stroke_rehabilitation",)),
)


def split_multi(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


def parse_int(value: str) -> int:
    if not value:
        return 0
    try:
        return int(float(value))
    except ValueError:
        return 0


def parse_float(value: str) -> float:
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def is_truthy_flag(value: str) -> bool:
    return value.strip().lower() in {"true", "t", "yes", "y", "1"}


def parse_bucket_blob(blob: str) -> Counter[str]:
    counts: Counter[str] = Counter()
    for item in split_multi(blob):
        if ":" not in item:
            counts[item] += 1
            continue
        label, raw_count = item.rsplit(":", 1)
        counts[label.strip()] += parse_int(raw_count.strip())
    return counts


def top_buckets(counter: Counter[str], *, total: int | None = None, limit: int = 10) -> list[dict]:
    items: list[dict] = []
    for label, count in counter.most_common(limit):
        item = {"label": label, "count": count}
        if total:
            item["share"] = round(count / total, 4)
        items.append(item)
    return items


def match_indication(row_value: str, aliases: tuple[str, ...]) -> bool:
    row_tags = set(split_multi(row_value))
    return any(alias in row_tags for alias in aliases)


def load_condition_names() -> dict[str, str]:
    names: dict[str, str] = {}
    conditions_dir = REPO_ROOT / "data" / "conditions"
    for spec in PRIORITY_CONDITIONS:
        payload = json.loads((conditions_dir / f"{spec.slug}.json").read_text(encoding="utf-8"))
        names[spec.slug] = payload["name"]
    return names


def aggregate_ai_dataset(bundle_dir: Path) -> dict[str, dict]:
    path = bundle_dir / "neuromodulation_ai_ingestion_dataset.csv"
    aggregations: dict[str, dict] = {}
    for spec in PRIORITY_CONDITIONS:
        aggregations[spec.slug] = {
            "papers": [],
            "open_access_papers": 0,
            "years": [],
            "evidence_tiers": Counter(),
            "study_types": Counter(),
            "modalities": Counter(),
            "invasiveness": Counter(),
            "targets": Counter(),
            "parameter_signals": Counter(),
            "populations": Counter(),
        }

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            for spec in PRIORITY_CONDITIONS:
                if not match_indication(row.get("indication_tags", ""), spec.indication_tags):
                    continue
                bucket = aggregations[spec.slug]
                bucket["papers"].append(row)
                if is_truthy_flag(row.get("open_access_flag", "")):
                    bucket["open_access_papers"] += 1
                year = parse_int(row.get("year", ""))
                if year:
                    bucket["years"].append(year)
                bucket["evidence_tiers"][row.get("evidence_tier", "unspecified") or "unspecified"] += 1
                bucket["study_types"][row.get("study_type_normalized", "other") or "other"] += 1
                bucket["invasiveness"][row.get("invasiveness", "unknown") or "unknown"] += 1
                for value in split_multi(row.get("canonical_modalities", "")):
                    bucket["modalities"][value] += 1
                for value in split_multi(row.get("target_tags", "")):
                    bucket["targets"][value] += 1
                for value in split_multi(row.get("parameter_signal_tags", "")):
                    bucket["parameter_signals"][value] += 1
                for value in split_multi(row.get("population_tags", "")):
                    bucket["populations"][value] += 1
    return aggregations


def aggregate_evidence_graph(bundle_dir: Path) -> dict[str, list[dict]]:
    path = bundle_dir / "neuromodulation_evidence_graph.csv"
    per_condition: dict[str, list[dict]] = defaultdict(list)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            for spec in PRIORITY_CONDITIONS:
                if match_indication(row.get("indication", ""), spec.indication_tags):
                    per_condition[spec.slug].append(row)
    return per_condition


def aggregate_protocol_candidates(bundle_dir: Path) -> dict[str, list[dict]]:
    path = bundle_dir / "neuromodulation_protocol_template_candidates.csv"
    per_condition: dict[str, list[dict]] = defaultdict(list)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            for spec in PRIORITY_CONDITIONS:
                if match_indication(row.get("indication", ""), spec.indication_tags):
                    per_condition[spec.slug].append(row)
    return per_condition


def aggregate_safety(bundle_dir: Path) -> dict[str, dict[str, Counter[str]]]:
    path = bundle_dir / "neuromodulation_safety_contraindication_signals.csv"
    per_condition: dict[str, dict[str, Counter[str]]] = {}
    for spec in PRIORITY_CONDITIONS:
        per_condition[spec.slug] = {
            "safety": Counter(),
            "contraindication": Counter(),
        }

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            for spec in PRIORITY_CONDITIONS:
                if not match_indication(row.get("indication_tags", ""), spec.indication_tags):
                    continue
                for value in split_multi(row.get("safety_signal_tags", "")):
                    per_condition[spec.slug]["safety"][value] += 1
                for value in split_multi(row.get("contraindication_signal_tags", "")):
                    per_condition[spec.slug]["contraindication"][value] += 1
    return per_condition


def representative_papers(rows: list[dict], limit: int = 12) -> list[dict]:
    def sort_key(row: dict) -> tuple[int, float, int]:
        return (
            parse_int(row.get("citation_count", "")),
            parse_float(row.get("protocol_relevance_score", "")),
            parse_int(row.get("year", "")),
        )

    selected = sorted(rows, key=sort_key, reverse=True)[:limit]
    papers: list[dict] = []
    for row in selected:
        papers.append(
            {
                "paper_key": row.get("paper_key", ""),
                "title": row.get("title", ""),
                "year": parse_int(row.get("year", "")) or None,
                "journal": row.get("journal") or None,
                "doi": row.get("doi") or None,
                "pmid": row.get("pmid") or None,
                "citation_count": parse_int(row.get("citation_count", "")) or None,
                "evidence_tier": row.get("evidence_tier") or None,
                "study_type": row.get("study_type_normalized") or None,
                "primary_modality": row.get("primary_modality") or None,
                "canonical_modalities": split_multi(row.get("canonical_modalities", "")),
                "target_tags": split_multi(row.get("target_tags", "")),
                "parameter_signal_tags": split_multi(row.get("parameter_signal_tags", "")),
                "record_url": row.get("record_url") or None,
            }
        )
    return papers


def build_modality_snapshots(graph_rows: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for row in graph_rows:
        modality = row.get("modality", "unknown") or "unknown"
        current = grouped.setdefault(
            modality,
            {
                "paper_count": 0,
                "citation_sum": 0,
                "evidence_weight_sum": 0.0,
                "open_access_count": 0,
                "year_min": None,
                "year_max": None,
                "study_types": Counter(),
                "parameter_tags": Counter(),
                "safety_tags": Counter(),
            },
        )
        current["paper_count"] += parse_int(row.get("paper_count", ""))
        current["citation_sum"] += parse_int(row.get("citation_sum", ""))
        current["evidence_weight_sum"] += parse_float(row.get("evidence_weight_sum", ""))
        current["open_access_count"] += parse_int(row.get("open_access_count", ""))
        year_min = parse_int(row.get("year_min", ""))
        year_max = parse_int(row.get("year_max", ""))
        if year_min:
            current["year_min"] = year_min if current["year_min"] is None else min(current["year_min"], year_min)
        if year_max:
            current["year_max"] = year_max if current["year_max"] is None else max(current["year_max"], year_max)
        current["study_types"].update(parse_bucket_blob(row.get("top_study_types", "")))
        current["parameter_tags"].update(parse_bucket_blob(row.get("top_parameter_tags", "")))
        current["safety_tags"].update(parse_bucket_blob(row.get("top_safety_tags", "")))

    snapshots: list[dict] = []
    for modality, current in grouped.items():
        paper_count = current["paper_count"]
        snapshots.append(
            {
                "modality": modality,
                "paper_count": paper_count,
                "citation_sum": current["citation_sum"],
                "evidence_weight_sum": round(current["evidence_weight_sum"], 2),
                "mean_citations_per_paper": round(current["citation_sum"] / paper_count, 2) if paper_count else None,
                "top_study_types": top_buckets(current["study_types"], total=paper_count, limit=5),
                "top_parameter_tags": top_buckets(current["parameter_tags"], total=paper_count, limit=5),
                "top_safety_tags": top_buckets(current["safety_tags"], total=paper_count, limit=5),
                "open_access_count": current["open_access_count"],
                "year_min": current["year_min"],
                "year_max": current["year_max"],
            }
        )
    return sorted(snapshots, key=lambda item: (item["paper_count"], item["citation_sum"]), reverse=True)[:8]


def build_target_snapshots(graph_rows: list[dict]) -> list[dict]:
    snapshots: list[dict] = []
    filtered = [
        row for row in graph_rows
        if (row.get("target") or "") not in {"", "unspecified_target"}
    ]
    for row in sorted(filtered, key=lambda r: (parse_int(r.get("paper_count", "")), parse_int(r.get("citation_sum", ""))), reverse=True)[:10]:
        paper_count = parse_int(row.get("paper_count", ""))
        snapshots.append(
            {
                "modality": row.get("modality", "unknown"),
                "target": row.get("target", "unspecified_target"),
                "paper_count": paper_count,
                "citation_sum": parse_int(row.get("citation_sum", "")),
                "template_support_score": parse_float(row.get("evidence_weight_sum", "")),
                "top_study_types": top_buckets(parse_bucket_blob(row.get("top_study_types", "")), total=paper_count, limit=5),
                "top_parameter_tags": top_buckets(parse_bucket_blob(row.get("top_parameter_tags", "")), total=paper_count, limit=5),
                "top_population_tags": [],
                "top_safety_tags": top_buckets(parse_bucket_blob(row.get("top_safety_tags", "")), total=paper_count, limit=5),
                "example_titles": [],
            }
        )
    return snapshots


def build_protocol_candidates(rows: list[dict]) -> list[dict]:
    snapshots: list[dict] = []
    sorted_rows = sorted(
        rows,
        key=lambda row: (parse_float(row.get("template_support_score", "")), parse_int(row.get("paper_count", ""))),
        reverse=True,
    )[:10]
    for row in sorted_rows:
        paper_count = parse_int(row.get("paper_count", ""))
        snapshots.append(
            {
                "modality": row.get("modality", "unknown"),
                "target": row.get("target", "unspecified_target"),
                "invasiveness": row.get("invasiveness") or None,
                "paper_count": paper_count,
                "citation_sum": parse_int(row.get("citation_sum", "")),
                "template_support_score": round(parse_float(row.get("template_support_score", "")), 2),
                "top_study_types": top_buckets(parse_bucket_blob(row.get("top_study_types", "")), total=paper_count, limit=5),
                "top_parameter_tags": top_buckets(parse_bucket_blob(row.get("top_parameter_tags", "")), total=paper_count, limit=5),
                "top_population_tags": top_buckets(parse_bucket_blob(row.get("top_population_tags", "")), total=paper_count, limit=5),
                "top_safety_tags": top_buckets(parse_bucket_blob(row.get("top_safety_tags", "")), total=paper_count, limit=5),
                "example_titles": [title.strip() for title in row.get("example_titles", "").split(" | ") if title.strip()][:3],
            }
        )
    return snapshots


def build_signal_snapshots(counter: Counter[str], signal_type: str, limit: int = 10) -> list[dict]:
    return [
        {"signal": label, "count": count, "signal_type": signal_type}
        for label, count in counter.most_common(limit)
    ]


def personalization_notes(spec: ConditionSpec, ai_stats: dict, protocols: list[dict], safety: dict[str, Counter[str]]) -> list[str]:
    notes = [
        "Use this file as a retrieval and ranking prior for protocol personalization, not as a stand-alone prescribing source.",
        "Always resolve candidate protocols back to the authoritative condition package and device-specific governance before export.",
    ]
    top_modalities = ", ".join(label["label"] for label in top_buckets(ai_stats["modalities"], limit=3))
    if top_modalities:
        notes.append(f"Top literature-weighted modalities for this condition are {top_modalities}.")
    if protocols:
        best = protocols[0]
        notes.append(
            f"Highest-support protocol cluster in the imported bundle is {best['modality']} targeting {best['target']}."
        )
    top_safety = ", ".join(item["label"] for item in top_buckets(safety["safety"], limit=3))
    if top_safety:
        notes.append(f"Most frequent safety-monitoring signals in matched papers are {top_safety}.")
    if spec.slug == "chronic-pain-fibromyalgia":
        notes.append("This evidence snapshot uses the broad chronic_pain literature tag and currently backs the narrower chronic-pain-fibromyalgia package.")
    return notes


def build_payloads(bundle_dir: Path, output_dir: Path) -> list[ConditionKnowledgeBase]:
    condition_names = load_condition_names()
    ai_data = aggregate_ai_dataset(bundle_dir)
    graph_data = aggregate_evidence_graph(bundle_dir)
    protocol_data = aggregate_protocol_candidates(bundle_dir)
    safety_data = aggregate_safety(bundle_dir)

    source_assets = [
        {
            "file_name": "neuromodulation_ai_ingestion_dataset.csv",
            "relative_path": "neuromodulation_ai_ingestion_dataset.csv",
            "notes": "Primary paper-level AI ingestion corpus used for counts, modalities, targets, and representative papers.",
        },
        {
            "file_name": "neuromodulation_evidence_graph.csv",
            "relative_path": "neuromodulation_evidence_graph.csv",
            "notes": "Aggregated indication -> modality -> target evidence graph used for modality and target snapshots.",
        },
        {
            "file_name": "neuromodulation_protocol_template_candidates.csv",
            "relative_path": "neuromodulation_protocol_template_candidates.csv",
            "notes": "Protocol-cluster candidates ranked by support score.",
        },
        {
            "file_name": "neuromodulation_safety_contraindication_signals.csv",
            "relative_path": "neuromodulation_safety_contraindication_signals.csv",
            "notes": "Safety and contraindication heuristic extraction over the same corpus.",
        },
    ]

    payloads: list[ConditionKnowledgeBase] = []
    generated_at = datetime.now(timezone.utc).date().isoformat()
    source_bundle_date = bundle_dir.name.rsplit("_", 1)[-1]

    for spec in PRIORITY_CONDITIONS:
        ai_stats = ai_data[spec.slug]
        papers = ai_stats["papers"]
        total_papers = len(papers)
        graph_rows = graph_data.get(spec.slug, [])
        protocol_rows = protocol_data.get(spec.slug, [])
        safety = safety_data[spec.slug]

        payload = {
            "condition_slug": spec.slug,
            "condition_name": condition_names[spec.slug],
            "condition_package_slug": spec.slug,
            "priority_rank": spec.priority_rank,
            "indication_tags": list(spec.indication_tags),
            "source_bundle_date": source_bundle_date,
            "generated_at": generated_at,
            "source_assets": source_assets,
            "research_stats": {
                "indication_tag": spec.indication_tags[0],
                "total_papers": total_papers,
                "open_access_papers": ai_stats["open_access_papers"],
                "year_min": min(ai_stats["years"]) if ai_stats["years"] else None,
                "year_max": max(ai_stats["years"]) if ai_stats["years"] else None,
                "evidence_tiers": top_buckets(ai_stats["evidence_tiers"], total=total_papers),
                "study_types": top_buckets(ai_stats["study_types"], total=total_papers),
                "modalities": top_buckets(ai_stats["modalities"], total=total_papers),
                "invasiveness": top_buckets(ai_stats["invasiveness"], total=total_papers),
                "targets": top_buckets(ai_stats["targets"], total=total_papers),
                "parameter_signals": top_buckets(ai_stats["parameter_signals"], total=total_papers),
                "populations": top_buckets(ai_stats["populations"], total=total_papers),
            },
            "modality_evidence": build_modality_snapshots(graph_rows),
            "target_evidence": build_target_snapshots(graph_rows),
            "protocol_candidates": build_protocol_candidates(protocol_rows),
            "safety_signals": build_signal_snapshots(safety["safety"], "safety"),
            "contraindication_signals": build_signal_snapshots(safety["contraindication"], "contraindication"),
            "representative_papers": representative_papers(papers),
            "protocol_personalization_notes": personalization_notes(spec, ai_stats, build_protocol_candidates(protocol_rows), safety),
        }
        payloads.append(ConditionKnowledgeBase.model_validate(payload))

    output_dir.mkdir(parents=True, exist_ok=True)
    index_payload = []
    for payload in payloads:
        path = output_dir / f"{payload.condition_slug}.json"
        path.write_text(json.dumps(payload.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8")
        index_payload.append(
            {
                "condition_slug": payload.condition_slug,
                "condition_name": payload.condition_name,
                "condition_package_slug": payload.condition_package_slug,
                "priority_rank": payload.priority_rank,
                "indication_tags": payload.indication_tags,
                "relative_path": f"{payload.condition_slug}.json",
                "total_papers": payload.research_stats.total_papers,
                "top_modalities": [entry.label for entry in payload.research_stats.modalities[:3]],
            }
        )
    (output_dir / "index.json").write_text(json.dumps(index_payload, indent=2) + "\n", encoding="utf-8")
    return payloads


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate priority condition research knowledge files.")
    parser.add_argument(
        "--bundle-dir",
        default="/Users/aliyildirim/Desktop/neuromodulation_research_bundle_2026-04-22",
        help="Directory containing the neuromodulation bundle CSV files.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(REPO_ROOT / "data" / "conditions" / "research-kb"),
        help="Directory where per-condition research knowledge JSON files will be written.",
    )
    args = parser.parse_args()

    build_payloads(Path(args.bundle_dir), Path(args.output_dir))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


RESEARCH_ROOT = Path(__file__).resolve().parents[1] / "data" / "imports" / "neuromodulation-research" / "2026-04-22"
REPO_ROOT = Path(__file__).resolve().parents[1]
CLINICAL_ROOT = REPO_ROOT / "data" / "imports" / "clinical-database"
CONDITIONS_ROOT = REPO_ROOT / "data" / "conditions"
AI_DATASET = RESEARCH_ROOT / "neuromodulation_ai_ingestion_dataset.csv"
EVIDENCE_GRAPH = RESEARCH_ROOT / "neuromodulation_evidence_graph.csv"
PROTOCOL_TEMPLATES = RESEARCH_ROOT / "neuromodulation_protocol_template_candidates.csv"
SAFETY_SIGNALS = RESEARCH_ROOT / "neuromodulation_safety_contraindication_signals.csv"

OUT_PROTOCOLS = RESEARCH_ROOT / "protocol_parameter_candidates.csv"
OUT_EXACT_PROTOCOLS = RESEARCH_ROOT / "top_condition_exact_protocols.csv"
OUT_SAFETY = RESEARCH_ROOT / "contraindication_safety_schema.csv"
OUT_KB = RESEARCH_ROOT / "top_condition_knowledge_base.json"
OUT_MANIFEST = RESEARCH_ROOT / "research_bundle_manifest.json"

TOP_CONDITIONS = {
    "major-depressive-disorder": {
        "label": "Major Depressive Disorder",
        "indication_tags": {"depression"},
    },
    "ptsd": {
        "label": "PTSD",
        "indication_tags": {"ptsd"},
    },
    "chronic-pain-fibromyalgia": {
        "label": "Chronic Pain / Fibromyalgia",
        "indication_tags": {"chronic_pain"},
    },
    "parkinsons-disease": {
        "label": "Parkinson's Disease",
        "indication_tags": {"parkinsons_disease"},
    },
    "obsessive-compulsive-disorder": {
        "label": "Obsessive-Compulsive Disorder",
        "indication_tags": {"ocd"},
    },
    "drug-resistant-epilepsy": {
        "label": "Drug-Resistant Epilepsy",
        "indication_tags": {"epilepsy_seizures"},
    },
    "stroke-rehabilitation": {
        "label": "Stroke Rehabilitation",
        "indication_tags": {"stroke_rehabilitation"},
    },
}

MODALITY_SLUG_MAP = {
    "transcranial_magnetic_stimulation": "rtms",
    "transcranial_direct_current_stimulation": "tdcs",
    "transcranial_alternating_current_stimulation": "tacs",
    "auricular_vagus_nerve_stimulation": "tavns",
    "vagus_nerve_stimulation": "vns",
    "deep_brain_stimulation": "dbs",
    "spinal_cord_stimulation": "scs",
    "focused_ultrasound_neuromodulation": "tps",
    "transcranial_random_noise_stimulation": "trns",
}


def _split_tags(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(";") if item.strip()]


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _int(value: str) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return 0


def _condition_slug_for_tags(tags: list[str]) -> list[str]:
    matched: list[str] = []
    tag_set = set(tags)
    for slug, meta in TOP_CONDITIONS.items():
        if tag_set & meta["indication_tags"]:
            matched.append(slug)
    return matched


def build() -> dict[str, int]:
    ai_rows = _read_csv(AI_DATASET)
    graph_rows = _read_csv(EVIDENCE_GRAPH)
    template_rows = _read_csv(PROTOCOL_TEMPLATES)
    safety_rows = _read_csv(SAFETY_SIGNALS)
    modality_rows = _read_csv(CLINICAL_ROOT / "modalities.csv")
    curated_protocol_rows = _read_csv(CLINICAL_ROOT / "protocols.csv")

    protocol_candidates: list[dict[str, str]] = []
    exact_protocol_rows: list[dict[str, str]] = []
    safety_schema_rows: list[dict[str, str]] = []
    knowledge_base: dict[str, dict] = {}

    top_titles_by_condition: dict[str, list[dict[str, str]]] = defaultdict(list)
    ai_counts = Counter()
    modality_name_by_id = {row["Modality_ID"]: row["Modality_Name"] for row in modality_rows}
    condition_id_by_slug = {}
    for slug in TOP_CONDITIONS:
        payload = json.loads((CONDITIONS_ROOT / f"{slug}.json").read_text(encoding="utf-8"))
        condition_id_by_slug[slug] = payload["id"]

    for row in ai_rows:
        indication_tags = _split_tags(row.get("indication_tags", ""))
        condition_slugs = _condition_slug_for_tags(indication_tags)
        if not condition_slugs:
            continue

        modality_tags = _split_tags(row.get("canonical_modalities", ""))
        primary_modality = row.get("primary_modality", "") or (modality_tags[0] if modality_tags else "")
        modality_slug = MODALITY_SLUG_MAP.get(primary_modality, "")

        for condition_slug in condition_slugs:
            ai_counts[condition_slug] += 1
            if len(top_titles_by_condition[condition_slug]) < 25:
                top_titles_by_condition[condition_slug].append(row)

            if int(row.get("protocol_relevance_score") or 0) < 3:
                continue

            protocol_candidates.append(
                {
                    "condition_slug": condition_slug,
                    "condition_label": TOP_CONDITIONS[condition_slug]["label"],
                    "paper_key": row.get("paper_key", ""),
                    "title": row.get("title", ""),
                    "modality": primary_modality,
                    "modality_slug": modality_slug,
                    "target_tags": row.get("target_tags", ""),
                    "study_type": row.get("study_type_normalized", ""),
                    "evidence_tier": row.get("evidence_tier", ""),
                    "parameter_signal_tags": row.get("parameter_signal_tags", ""),
                    "population_tags": row.get("population_tags", ""),
                    "protocol_relevance_score": row.get("protocol_relevance_score", ""),
                    "citation_count": row.get("citation_count", ""),
                    "record_url": row.get("record_url", ""),
                }
            )

    for row in safety_rows:
        indication_tags = _split_tags(row.get("indication_tags", ""))
        condition_slugs = _condition_slug_for_tags(indication_tags)
        if not condition_slugs:
            continue
        for condition_slug in condition_slugs:
            safety_schema_rows.append(
                {
                    "condition_slug": condition_slug,
                    "condition_label": TOP_CONDITIONS[condition_slug]["label"],
                    "paper_key": row.get("paper_key", ""),
                    "title": row.get("title", ""),
                    "primary_modality": row.get("primary_modality", ""),
                    "canonical_modalities": row.get("canonical_modalities", ""),
                    "signal_type": "contraindication" if row.get("contraindication_signal_tags") else "safety",
                    "safety_signal_tags": row.get("safety_signal_tags", ""),
                    "contraindication_signal_tags": row.get("contraindication_signal_tags", ""),
                    "population_tags": row.get("population_tags", ""),
                    "target_tags": row.get("target_tags", ""),
                    "study_type_normalized": row.get("study_type_normalized", ""),
                    "evidence_tier": row.get("evidence_tier", ""),
                    "record_url": row.get("record_url", ""),
                }
            )

    graph_by_condition: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in graph_rows:
        slug_list = _condition_slug_for_tags([row.get("indication", "")])
        for slug in slug_list:
            graph_by_condition[slug].append(row)

    templates_by_condition: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in template_rows:
        slug_list = _condition_slug_for_tags([row.get("indication", "")])
        for slug in slug_list:
            templates_by_condition[slug].append(row)

    safety_by_condition: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in safety_schema_rows:
        safety_by_condition[row["condition_slug"]].append(row)

    template_lookup = defaultdict(list)
    for slug, rows in templates_by_condition.items():
        for row in rows:
            template_lookup[(slug, row.get("modality", ""))].append(row)

    for slug, meta in TOP_CONDITIONS.items():
        condition_id = condition_id_by_slug[slug]
        matching_protocols = [row for row in curated_protocol_rows if row.get("Condition_ID") == condition_id]
        for row in matching_protocols:
            modality_name = modality_name_by_id.get(row.get("Modality_ID", ""), "")
            matching_templates = template_lookup.get((slug, modality_name), [])
            exact_protocol_rows.append(
                {
                    "condition_slug": slug,
                    "condition_label": meta["label"],
                    "protocol_id": row.get("Protocol_ID", ""),
                    "protocol_name": row.get("Protocol_Name", ""),
                    "modality_name": modality_name,
                    "modality_id": row.get("Modality_ID", ""),
                    "device_id_if_specific": row.get("Device_ID_if_specific", ""),
                    "target_region": row.get("Target_Region", ""),
                    "laterality": row.get("Laterality", ""),
                    "frequency_hz": row.get("Frequency_Hz", ""),
                    "intensity": row.get("Intensity", ""),
                    "session_duration": row.get("Session_Duration", ""),
                    "sessions_per_week": row.get("Sessions_per_Week", ""),
                    "total_course": row.get("Total_Course", ""),
                    "coil_or_electrode_placement": row.get("Coil_or_Electrode_Placement", ""),
                    "monitoring_requirements": row.get("Monitoring_Requirements", ""),
                    "adverse_event_monitoring": row.get("Adverse_Event_Monitoring", ""),
                    "escalation_rules": row.get("Escalation_or_Adjustment_Rules", ""),
                    "evidence_grade": row.get("Evidence_Grade", ""),
                    "on_label_vs_off_label": row.get("On_Label_vs_Off_Label", ""),
                    "source_url_primary": row.get("Source_URL_Primary", ""),
                    "source_url_secondary": row.get("Source_URL_Secondary", ""),
                    "research_support_count": str(sum(_int(item.get("paper_count", "")) for item in matching_templates)),
                    "research_parameter_tags": "; ".join(
                        item.get("top_parameter_tags", "") for item in matching_templates[:3] if item.get("top_parameter_tags")
                    ),
                    "research_safety_tags": "; ".join(
                        item.get("top_safety_tags", "") for item in matching_templates[:3] if item.get("top_safety_tags")
                    ),
                }
            )

    for slug, meta in TOP_CONDITIONS.items():
        graph_items = sorted(
            graph_by_condition[slug],
            key=lambda item: (_int(item.get("evidence_weight_sum", "")), _int(item.get("paper_count", ""))),
            reverse=True,
        )[:10]
        template_items = sorted(
            templates_by_condition[slug],
            key=lambda item: (_int(item.get("template_support_score", "")), _int(item.get("paper_count", ""))),
            reverse=True,
        )[:10]
        safety_items = safety_by_condition[slug][:20]
        top_titles = sorted(
            top_titles_by_condition[slug],
            key=lambda item: (_int(item.get("citation_count", "")), _int(item.get("protocol_relevance_score", ""))),
            reverse=True,
        )[:10]

        modality_counts = Counter(item.get("modality", "") for item in template_items if item.get("modality"))
        signal_counts = Counter()
        for item in safety_items:
            signal_counts.update(_split_tags(item.get("safety_signal_tags", "")))
            signal_counts.update(_split_tags(item.get("contraindication_signal_tags", "")))

        knowledge_base[slug] = {
            "condition_slug": slug,
            "condition_label": meta["label"],
            "research_paper_count": ai_counts[slug],
            "priority_modalities": [name for name, _ in modality_counts.most_common(5)],
            "exact_protocols": [row for row in exact_protocol_rows if row["condition_slug"] == slug],
            "top_protocol_templates": template_items,
            "top_evidence_links": graph_items,
            "top_safety_signals": [{"signal": name, "count": count} for name, count in signal_counts.most_common(10)],
            "example_papers": [
                {
                    "title": row.get("title", ""),
                    "primary_modality": row.get("primary_modality", ""),
                    "study_type": row.get("study_type_normalized", ""),
                    "evidence_tier": row.get("evidence_tier", ""),
                    "citation_count": row.get("citation_count", ""),
                    "record_url": row.get("record_url", ""),
                }
                for row in top_titles
            ],
        }

    with OUT_PROTOCOLS.open("w", encoding="utf-8", newline="") as handle:
        fieldnames = [
            "condition_slug",
            "condition_label",
            "paper_key",
            "title",
            "modality",
            "modality_slug",
            "target_tags",
            "study_type",
            "evidence_tier",
            "parameter_signal_tags",
            "population_tags",
            "protocol_relevance_score",
            "citation_count",
            "record_url",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sorted(protocol_candidates, key=lambda item: (_int(item["citation_count"]), _int(item["protocol_relevance_score"])), reverse=True))

    with OUT_SAFETY.open("w", encoding="utf-8", newline="") as handle:
        fieldnames = [
            "condition_slug",
            "condition_label",
            "paper_key",
            "title",
            "primary_modality",
            "canonical_modalities",
            "signal_type",
            "safety_signal_tags",
            "contraindication_signal_tags",
            "population_tags",
            "target_tags",
            "study_type_normalized",
            "evidence_tier",
            "record_url",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(safety_schema_rows)

    with OUT_EXACT_PROTOCOLS.open("w", encoding="utf-8", newline="") as handle:
        fieldnames = [
            "condition_slug",
            "condition_label",
            "protocol_id",
            "protocol_name",
            "modality_name",
            "modality_id",
            "device_id_if_specific",
            "target_region",
            "laterality",
            "frequency_hz",
            "intensity",
            "session_duration",
            "sessions_per_week",
            "total_course",
            "coil_or_electrode_placement",
            "monitoring_requirements",
            "adverse_event_monitoring",
            "escalation_rules",
            "evidence_grade",
            "on_label_vs_off_label",
            "source_url_primary",
            "source_url_secondary",
            "research_support_count",
            "research_parameter_tags",
            "research_safety_tags",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(exact_protocol_rows)

    OUT_KB.write_text(json.dumps(knowledge_base, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_files": [
            AI_DATASET.name,
            EVIDENCE_GRAPH.name,
            PROTOCOL_TEMPLATES.name,
            SAFETY_SIGNALS.name,
        ],
        "outputs": {
            "protocol_parameter_candidates": len(protocol_candidates),
            "top_condition_exact_protocols": len(exact_protocol_rows),
            "contraindication_safety_schema": len(safety_schema_rows),
            "top_condition_knowledge_base": len(knowledge_base),
        },
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    return manifest["outputs"]


if __name__ == "__main__":
    counts = build()
    print(json.dumps(counts, indent=2))

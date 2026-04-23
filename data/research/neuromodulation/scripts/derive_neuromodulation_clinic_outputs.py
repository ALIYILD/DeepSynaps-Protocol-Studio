#!/usr/bin/env python3

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path


INPUT = Path("/Users/aliyildirim/Desktop/neuromodulation_research_bundle_2026-04-22/neuromodulation_ai_ingestion_dataset.csv")
OUTPUT_DIR = Path("/Users/aliyildirim/Desktop/neuromodulation_research_bundle_2026-04-22")

EVIDENCE_GRAPH = OUTPUT_DIR / "neuromodulation_evidence_graph.csv"
PROTOCOL_TEMPLATES = OUTPUT_DIR / "neuromodulation_protocol_template_candidates.csv"
SAFETY_SIGNALS = OUTPUT_DIR / "neuromodulation_safety_contraindication_signals.csv"
INDICATION_SUMMARY = OUTPUT_DIR / "neuromodulation_indication_modality_summary.csv"


SAFETY_PATTERNS = {
    "seizure_risk": [r"\bseizure", r"\bepilep", r"\bstatus epilepticus\b"],
    "mania_hypomania": [r"\bmania\b", r"\bhypomania\b", r"\bmanic\b"],
    "suicidality": [r"\bsuicid", r"\bself-harm\b"],
    "bleeding_hemorrhage": [r"\bhemorrhag", r"\bhaemorrhag", r"\bbleeding\b", r"\bhematoma\b"],
    "infection": [r"\binfection\b", r"\binfected\b", r"\bdevice infection\b"],
    "cardiac_risk": [r"\barrhythm", r"\bcardiac\b", r"\bheart rate\b", r"\bqt\b"],
    "cognitive_adverse_effect": [r"\bcognitive\b", r"\bmemory\b", r"\bconfusion\b", r"\bdelirium\b"],
    "pain_or_discomfort": [r"\bpain\b", r"\bdiscomfort\b", r"\bheadache\b"],
    "sleep_disturbance": [r"\binsomnia\b", r"\bsleep\b"],
    "device_complication": [r"\blead migration\b", r"\bdevice complication\b", r"\bhardware\b", r"\bimplant", r"\brevision surgery\b"],
    "skin_burn_irritation": [r"\bburn\b", r"\bskin\b", r"\birritation\b", r"\bdermatitis\b"],
    "pregnancy_caution": [r"\bpregnan", r"\bperinatal\b", r"\bpostpartum\b"],
    "pediatric_caution": [r"\bpediatric\b", r"\bpaediatric\b", r"\bchild", r"\badolescent\b"],
    "older_adult_caution": [r"\belderly\b", r"\bolder adult", r"\bgeriatric\b"],
    "psychosis_caution": [r"\bpsychosis\b", r"\bpsychotic\b", r"\bschizophren"],
    "metal_implant_caution": [r"\bimplant\b", r"\bmetal\b", r"\bferromagnetic\b", r"\bdevice\b"],
}

CONTRAINDICATION_PATTERNS = {
    "contraindication": [r"\bcontraindicat"],
    "exclusion_criteria": [r"\bexclusion criteria\b", r"\bexcluded\b"],
    "adverse_event": [r"\badverse event", r"\bside effect", r"\bcomplication"],
    "safety": [r"\bsafety\b", r"\bsafe\b", r"\btolerability\b", r"\btolerable\b"],
    "feasibility": [r"\bfeasibility\b"],
}

PARAMETER_HINT_PATTERNS = {
    "high_frequency": [r"\bhigh[- ]frequency\b", r"\b10 hz\b", r"\b20 hz\b", r"\b50 hz\b", r"\b100 hz\b"],
    "low_frequency": [r"\blow[- ]frequency\b", r"\b1 hz\b", r"\b0\.?5 hz\b"],
    "burst_pattern": [r"\btheta burst\b", r"\bburst\b"],
    "current_dose_reported": [r"\b\d+(\.\d+)?\s?ma\b", r"\bcurrent intensity\b"],
    "pulse_width_reported": [r"\bpulse width\b", r"\b\d+(\.\d+)?\s?(us|μs|ms)\b"],
    "session_count_reported": [r"\b\d+\s?sessions?\b", r"\bnumber of sessions\b"],
    "duration_reported": [r"\b\d+\s?(min|minutes|hour|hours|day|days|week|weeks|month|months)\b"],
    "sham_controlled": [r"\bsham-controlled\b", r"\bsham controlled\b", r"\bsham\b"],
    "double_blind": [r"\bdouble-blind\b", r"\bsingle-blind\b", r"\bblinded\b"],
    "closed_loop": [r"\bclosed[- ]loop\b", r"\badaptive\b", r"\bresponsive\b"],
}

EVIDENCE_SCORE_MAP = {
    "high": 5,
    "moderate_high": 4,
    "moderate": 3,
    "contextual": 2,
    "low": 1,
    "low_for_effectiveness": 1,
    "preclinical": 1,
    "unspecified": 1,
}


def split_tags(value: str) -> list:
    return [item.strip() for item in (value or "").split(";") if item.strip()]


def first_or_unknown(items: list, unknown: str) -> str:
    return items[0] if items else unknown


def find_pattern_hits(text: str, pattern_map: dict) -> list:
    hits = []
    for tag, patterns in pattern_map.items():
        if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns):
            hits.append(tag)
    return sorted(hits)


def protocol_score(row: dict, parameter_hits: list, safety_hits: list) -> int:
    score = int(row.get("protocol_relevance_score") or 0)
    score += min(2, len(parameter_hits))
    if row.get("study_type_normalized") in {"randomized_controlled_trial", "clinical_trial", "meta_analysis", "systematic_review", "guideline_consensus"}:
        score += 1
    if safety_hits:
        score += 1
    return min(score, 10)


def main() -> int:
    evidence = defaultdict(lambda: {
        "paper_count": 0,
        "citation_sum": 0,
        "evidence_weight_sum": 0,
        "study_types": Counter(),
        "paper_keys": set(),
        "years": [],
        "open_access_count": 0,
        "parameter_tags": Counter(),
        "safety_tags": Counter(),
    })
    protocol_templates = defaultdict(lambda: {
        "paper_count": 0,
        "citation_sum": 0,
        "evidence_weight_sum": 0,
        "study_types": Counter(),
        "parameter_tags": Counter(),
        "target_tags": Counter(),
        "population_tags": Counter(),
        "safety_tags": Counter(),
        "paper_keys": set(),
        "example_titles": [],
    })
    safety_rows = []
    indication_summary = defaultdict(lambda: {
        "paper_count": 0,
        "evidence_weight_sum": 0,
        "citation_sum": 0,
        "study_types": Counter(),
        "target_tags": Counter(),
        "parameter_tags": Counter(),
    })

    with INPUT.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            title = row.get("title", "")
            ai_text = row.get("ai_ingestion_text", "")
            text = f"{title} | {ai_text}"

            modalities = split_tags(row.get("canonical_modalities", "")) or ["unknown_modality"]
            indications = split_tags(row.get("indication_tags", "")) or ["unspecified_indication"]
            targets = split_tags(row.get("target_tags", "")) or ["unspecified_target"]
            populations = split_tags(row.get("population_tags", "")) or ["unspecified_population"]
            study_type = row.get("study_type_normalized", "") or "other"
            evidence_tier = row.get("evidence_tier", "") or "unspecified"
            citation_count = int(row.get("citation_count") or 0)
            year = row.get("year", "")
            open_access = row.get("open_access_flag", "") == "Y"
            paper_key = row.get("paper_key", "")

            safety_hits = find_pattern_hits(text, SAFETY_PATTERNS)
            contraindication_hits = find_pattern_hits(text, CONTRAINDICATION_PATTERNS)
            parameter_hits = sorted(set(split_tags(row.get("parameter_signal_tags", "")) + find_pattern_hits(text, PARAMETER_HINT_PATTERNS)))
            weighted_score = EVIDENCE_SCORE_MAP.get(evidence_tier, 1)
            template_score = protocol_score(row, parameter_hits, safety_hits)

            for modality in modalities:
                for indication in indications:
                    for target in targets:
                        key = (indication, modality, target)
                        item = evidence[key]
                        if paper_key not in item["paper_keys"]:
                            item["paper_count"] += 1
                            item["citation_sum"] += citation_count
                            item["evidence_weight_sum"] += weighted_score
                            item["paper_keys"].add(paper_key)
                            if year:
                                item["years"].append(year)
                            if open_access:
                                item["open_access_count"] += 1
                        item["study_types"][study_type] += 1
                        item["parameter_tags"].update(parameter_hits)
                        item["safety_tags"].update(safety_hits)

                    summary_key = (indication, modality)
                    summary = indication_summary[summary_key]
                    summary["paper_count"] += 1
                    summary["evidence_weight_sum"] += weighted_score
                    summary["citation_sum"] += citation_count
                    summary["study_types"][study_type] += 1
                    summary["target_tags"].update(targets)
                    summary["parameter_tags"].update(parameter_hits)

                target_for_template = first_or_unknown(targets, "unspecified_target")
                indication_for_template = first_or_unknown(indications, "unspecified_indication")
                template_key = (modality, indication_for_template, target_for_template, row.get("invasiveness", "unknown"))
                template = protocol_templates[template_key]
                if paper_key not in template["paper_keys"]:
                    template["paper_count"] += 1
                    template["citation_sum"] += citation_count
                    template["evidence_weight_sum"] += weighted_score + template_score
                    template["paper_keys"].add(paper_key)
                    if len(template["example_titles"]) < 3 and title:
                        template["example_titles"].append(title)
                template["study_types"][study_type] += 1
                template["parameter_tags"].update(parameter_hits)
                template["target_tags"].update(targets)
                template["population_tags"].update(populations)
                template["safety_tags"].update(safety_hits)

            if safety_hits or contraindication_hits:
                safety_rows.append({
                    "paper_key": paper_key,
                    "year": year,
                    "title": title,
                    "primary_modality": row.get("primary_modality", ""),
                    "canonical_modalities": row.get("canonical_modalities", ""),
                    "indication_tags": row.get("indication_tags", ""),
                    "study_type_normalized": study_type,
                    "evidence_tier": evidence_tier,
                    "safety_signal_tags": "; ".join(safety_hits),
                    "contraindication_signal_tags": "; ".join(contraindication_hits),
                    "population_tags": row.get("population_tags", ""),
                    "target_tags": row.get("target_tags", ""),
                    "parameter_signal_tags": "; ".join(parameter_hits),
                    "record_url": row.get("record_url", ""),
                })

    with EVIDENCE_GRAPH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "indication",
                "modality",
                "target",
                "paper_count",
                "citation_sum",
                "evidence_weight_sum",
                "mean_citations_per_paper",
                "top_study_types",
                "top_parameter_tags",
                "top_safety_tags",
                "open_access_count",
                "year_min",
                "year_max",
            ],
        )
        writer.writeheader()
        rows = []
        for (indication, modality, target), item in evidence.items():
            years = sorted(y for y in item["years"] if y.isdigit())
            rows.append({
                "indication": indication,
                "modality": modality,
                "target": target,
                "paper_count": item["paper_count"],
                "citation_sum": item["citation_sum"],
                "evidence_weight_sum": item["evidence_weight_sum"],
                "mean_citations_per_paper": round(item["citation_sum"] / item["paper_count"], 2) if item["paper_count"] else 0,
                "top_study_types": "; ".join(f"{k}:{v}" for k, v in item["study_types"].most_common(5)),
                "top_parameter_tags": "; ".join(f"{k}:{v}" for k, v in item["parameter_tags"].most_common(5)),
                "top_safety_tags": "; ".join(f"{k}:{v}" for k, v in item["safety_tags"].most_common(5)),
                "open_access_count": item["open_access_count"],
                "year_min": years[0] if years else "",
                "year_max": years[-1] if years else "",
            })
        rows.sort(key=lambda row: (row["evidence_weight_sum"], row["paper_count"], row["citation_sum"]), reverse=True)
        writer.writerows(rows)

    with PROTOCOL_TEMPLATES.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "modality",
                "indication",
                "target",
                "invasiveness",
                "paper_count",
                "citation_sum",
                "template_support_score",
                "top_study_types",
                "top_parameter_tags",
                "top_population_tags",
                "top_safety_tags",
                "example_titles",
            ],
        )
        writer.writeheader()
        rows = []
        for (modality, indication, target, invasiveness), item in protocol_templates.items():
            rows.append({
                "modality": modality,
                "indication": indication,
                "target": target,
                "invasiveness": invasiveness,
                "paper_count": item["paper_count"],
                "citation_sum": item["citation_sum"],
                "template_support_score": item["evidence_weight_sum"],
                "top_study_types": "; ".join(f"{k}:{v}" for k, v in item["study_types"].most_common(5)),
                "top_parameter_tags": "; ".join(f"{k}:{v}" for k, v in item["parameter_tags"].most_common(8)),
                "top_population_tags": "; ".join(f"{k}:{v}" for k, v in item["population_tags"].most_common(5)),
                "top_safety_tags": "; ".join(f"{k}:{v}" for k, v in item["safety_tags"].most_common(5)),
                "example_titles": " | ".join(item["example_titles"]),
            })
        rows.sort(key=lambda row: (row["template_support_score"], row["paper_count"], row["citation_sum"]), reverse=True)
        writer.writerows(rows)

    with SAFETY_SIGNALS.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "paper_key",
                "year",
                "title",
                "primary_modality",
                "canonical_modalities",
                "indication_tags",
                "study_type_normalized",
                "evidence_tier",
                "safety_signal_tags",
                "contraindication_signal_tags",
                "population_tags",
                "target_tags",
                "parameter_signal_tags",
                "record_url",
            ],
        )
        writer.writeheader()
        writer.writerows(safety_rows)

    with INDICATION_SUMMARY.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "indication",
                "modality",
                "paper_count",
                "evidence_weight_sum",
                "citation_sum",
                "top_study_types",
                "top_targets",
                "top_parameter_tags",
            ],
        )
        writer.writeheader()
        rows = []
        for (indication, modality), item in indication_summary.items():
            rows.append({
                "indication": indication,
                "modality": modality,
                "paper_count": item["paper_count"],
                "evidence_weight_sum": item["evidence_weight_sum"],
                "citation_sum": item["citation_sum"],
                "top_study_types": "; ".join(f"{k}:{v}" for k, v in item["study_types"].most_common(5)),
                "top_targets": "; ".join(f"{k}:{v}" for k, v in item["target_tags"].most_common(5)),
                "top_parameter_tags": "; ".join(f"{k}:{v}" for k, v in item["parameter_tags"].most_common(5)),
            })
        rows.sort(key=lambda row: (row["evidence_weight_sum"], row["paper_count"], row["citation_sum"]), reverse=True)
        writer.writerows(rows)

    print(f"Wrote {EVIDENCE_GRAPH}")
    print(f"Wrote {PROTOCOL_TEMPLATES}")
    print(f"Wrote {SAFETY_SIGNALS}")
    print(f"Wrote {INDICATION_SUMMARY}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

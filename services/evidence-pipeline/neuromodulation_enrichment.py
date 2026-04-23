from __future__ import annotations

import argparse
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from indications_seed import MODALITY_PRODUCT_CODES, SEED
from sources import ctgov, openfda


EUROPEPMC_SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

ABSTRACTS_OUTPUT = "derived/neuromodulation_europepmc_abstracts.csv"
TRIALS_OUTPUT = "derived/neuromodulation_clinical_trials.csv"
FDA_OUTPUT = "derived/neuromodulation_fda_510k_devices.csv"
CONDITIONS_OUTPUT = "derived/neuromodulation_condition_mentions.csv"
OUTCOMES_OUTPUT = "derived/neuromodulation_patient_outcomes.csv"


AI_MODALITY_TO_SEED_MODALITY = {
    "deep_brain_stimulation": "DBS",
    "responsive_neurostimulation": "RNS",
    "vagus_nerve_stimulation": "VNS",
    "spinal_cord_stimulation": "SCS",
    "dorsal_root_ganglion_stimulation": "DRG",
    "sacral_neuromodulation": "SNM",
    "hypoglossal_nerve_stimulation": "HNS",
    "transcranial_magnetic_stimulation": "rTMS",
    "transcranial_direct_current_stimulation": "tDCS",
    "focused_ultrasound_neuromodulation": "MRgFUS",
}

MODALITY_QUERY_TERMS = {
    "deep_brain_stimulation": "deep brain stimulation",
    "responsive_neurostimulation": "responsive neurostimulation",
    "vagus_nerve_stimulation": "vagus nerve stimulation",
    "auricular_vagus_nerve_stimulation": "auricular vagus nerve stimulation",
    "transcranial_magnetic_stimulation": "transcranial magnetic stimulation",
    "transcranial_direct_current_stimulation": "transcranial direct current stimulation",
    "transcranial_alternating_current_stimulation": "transcranial alternating current stimulation",
    "transcranial_random_noise_stimulation": "transcranial random noise stimulation",
    "transcranial_pulsed_current_stimulation": "transcranial pulsed current stimulation",
    "focused_ultrasound_neuromodulation": "focused ultrasound neuromodulation",
    "spinal_cord_stimulation": "spinal cord stimulation",
    "dorsal_root_ganglion_stimulation": "dorsal root ganglion stimulation",
    "peripheral_nerve_stimulation": "peripheral nerve stimulation",
    "sacral_neuromodulation": "sacral neuromodulation",
    "tibial_nerve_stimulation": "tibial nerve stimulation",
    "trigeminal_nerve_stimulation": "trigeminal nerve stimulation",
    "occipital_nerve_stimulation": "occipital nerve stimulation",
    "hypoglossal_nerve_stimulation": "hypoglossal nerve stimulation",
    "motor_cortex_stimulation": "motor cortex stimulation",
    "general_neuromodulation": "neuromodulation",
}

CONDITION_PATTERNS = {
    "depression": {
        "label": "Depression",
        "patterns": [r"\bdepression\b", r"\bmajor depressive\b", r"\bmdd\b", r"\btreatment-resistant depression\b"],
    },
    "anxiety": {
        "label": "Anxiety",
        "patterns": [r"\banxiety\b", r"\bgeneralized anxiety\b", r"\bgad\b"],
    },
    "ptsd": {
        "label": "Post-traumatic stress disorder",
        "patterns": [r"\bptsd\b", r"\bpost[- ]traumatic stress\b"],
    },
    "ocd": {
        "label": "Obsessive-compulsive disorder",
        "patterns": [r"\bocd\b", r"\bobsessive[- ]compulsive\b"],
    },
    "addiction_substance_use": {
        "label": "Substance use disorder",
        "patterns": [r"\bsubstance use\b", r"\baddiction\b", r"\balcohol use\b", r"\bopioid use\b", r"\bnicotine dependence\b"],
    },
    "epilepsy_seizures": {
        "label": "Epilepsy and seizures",
        "patterns": [r"\bepilep", r"\bseizure", r"\bstatus epilepticus\b"],
    },
    "parkinsons_disease": {
        "label": "Parkinson's disease",
        "patterns": [r"\bparkinson", r"\bparkinson's disease\b"],
    },
    "essential_tremor": {
        "label": "Essential tremor",
        "patterns": [r"\bessential tremor\b", r"\btremor\b"],
    },
    "dystonia": {
        "label": "Dystonia",
        "patterns": [r"\bdystonia\b"],
    },
    "chronic_pain": {
        "label": "Chronic pain",
        "patterns": [r"\bchronic pain\b", r"\bneuropathic pain\b", r"\bneuralgia\b", r"\bmigraine\b", r"\bheadache\b", r"\bpainful diabetic neuropathy\b"],
    },
    "stroke_rehabilitation": {
        "label": "Stroke rehabilitation",
        "patterns": [r"\bstroke\b", r"\bpost[- ]stroke\b", r"\bstroke rehabilitation\b"],
    },
    "brain_injury": {
        "label": "Brain injury",
        "patterns": [r"\btraumatic brain injury\b", r"\btbi\b", r"\bbrain injury\b"],
    },
    "spinal_cord_injury": {
        "label": "Spinal cord injury",
        "patterns": [r"\bspinal cord injury\b", r"\bsci\b"],
    },
    "multiple_sclerosis": {
        "label": "Multiple sclerosis",
        "patterns": [r"\bmultiple sclerosis\b", r"\bms\b"],
    },
    "alzheimers_dementia": {
        "label": "Alzheimer's disease and dementia",
        "patterns": [r"\balzheimer", r"\bdementia\b", r"\bcognitive impairment\b"],
    },
    "sleep_apnea": {
        "label": "Sleep apnea",
        "patterns": [r"\bobstructive sleep apnea\b", r"\bsleep apnea\b", r"\bosa\b"],
    },
    "urinary_bladder_bowel": {
        "label": "Urinary, bladder, and bowel dysfunction",
        "patterns": [r"\boveractive bladder\b", r"\burinary\b", r"\bbowel\b", r"\bfecal incontinence\b", r"\burinary retention\b", r"\bincontinence\b"],
    },
    "tinnitus": {
        "label": "Tinnitus",
        "patterns": [r"\btinnitus\b"],
    },
}

OUTCOME_MEASURE_PATTERNS = {
    "ham_d": [r"\bham[- ]d\b", r"\bhamilton depression\b"],
    "madrs": [r"\bmadrs\b", r"\bmontgomery[- ]åsberg\b", r"\bmontgomery-asberg\b"],
    "phq_9": [r"\bphq[- ]9\b"],
    "gad_7": [r"\bgad[- ]7\b"],
    "ybocs": [r"\by[- ]bocs\b", r"\byale[- ]brown\b"],
    "updrs": [r"\bupdrs\b", r"\bunified parkinson"],
    "vas": [r"\bvas\b", r"\bvisual analog scale\b"],
    "nrs": [r"\bnrs\b", r"\bnumeric rating scale\b"],
    "sf_36": [r"\bsf[- ]36\b"],
    "eq_5d": [r"\beq[- ]5d\b"],
    "moCA": [r"\bmoca\b", r"\bmontreal cognitive assessment\b"],
}

OUTCOME_CATEGORY_PATTERNS = {
    "symptom_improvement": [r"\bimprov", r"\bresponse rate\b", r"\bremission\b", r"\breduction in symptoms?\b"],
    "pain_reduction": [r"\bpain relief\b", r"\breduction in pain\b", r"\bpain intensity\b", r"\banalges"],
    "motor_function": [r"\bmotor function\b", r"\bmotor symptoms?\b", r"\bmovement\b", r"\bgait\b"],
    "quality_of_life": [r"\bquality of life\b", r"\bfunctional status\b", r"\bdaily living\b"],
    "sleep": [r"\bsleep\b", r"\binsomnia\b", r"\bapnea[- ]hypopnea\b"],
    "cognition": [r"\bcognit", r"\bmemory\b", r"\battention\b"],
    "safety_tolerability": [r"\badverse event\b", r"\bsafe\b", r"\btolerab", r"\bside effect\b"],
}

POSITIVE_OUTCOME_PATTERNS = [r"\bimprov", r"\breduced\b", r"\bdecrease", r"\bresponse\b", r"\bremission\b", r"\bbenefit\b"]
NEGATIVE_OUTCOME_PATTERNS = [r"\bworsen", r"\bno significant\b", r"\bnot significant\b", r"\bineffective\b", r"\bfailed to\b"]
RWE_PATTERNS = [r"\breal[- ]world\b", r"\bregistry\b", r"\bretrospective\b", r"\bobservational\b", r"\bcohort\b", r"\bcase series\b"]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def none_if_blank(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def tokenize(value: str | None) -> list[str]:
    if not value:
        return []
    normalized = value.replace("|", ";")
    return [item.strip() for item in normalized.split(";") if item.strip()]


def slugify_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def sentence_split(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [part.strip() for part in parts if part.strip()]


def resolve_bundle_file(bundle_root: Path, relative_path: str) -> Path:
    nested = bundle_root / relative_path
    if nested.exists():
        return nested
    return bundle_root / Path(relative_path).name


def modality_seed_metadata() -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"trial_terms": set(), "conditions": set(), "applicants": set(), "product_codes": set()}
    )
    for entry in SEED:
        meta = grouped[entry["modality"]]
        meta["trial_terms"].add(entry["trial_q"])
        meta["conditions"].add(entry["condition"])
        meta["applicants"].update(entry.get("fda_applicants") or [])
        meta["product_codes"].update(MODALITY_PRODUCT_CODES.get(entry["modality"]) or [])
    return grouped


SEED_MODALITY_METADATA = modality_seed_metadata()


def europepmc_query(row: dict[str, str]) -> str | None:
    source = none_if_blank(row.get("source"))
    source_id = none_if_blank(row.get("id"))
    pmcid = none_if_blank(row.get("pmcid"))
    pmid = none_if_blank(row.get("pmid"))
    doi = none_if_blank(row.get("doi"))
    if source and source_id:
        return f'EXT_ID:"{source_id}" AND SRC:"{source}"'
    if pmcid:
        return f'PMCID:"{pmcid}"'
    if pmid:
        return f'EXT_ID:"{pmid}" AND SRC:"MED"'
    if doi:
        return f'DOI:"{doi}"'
    return None


def europepmc_fetch_abstract(row: dict[str, str]) -> dict[str, str]:
    query = europepmc_query(row)
    source_id = none_if_blank(row.get("id")) or none_if_blank(row.get("pmcid")) or none_if_blank(row.get("pmid")) or none_if_blank(row.get("doi"))
    if not query:
        return {
            "paper_key": row["paper_key"],
            "source": row.get("source") or "",
            "source_id": source_id or "",
            "title": row.get("title") or "",
            "abstract": "",
            "abstract_source": "europepmc",
            "abstract_length": "0",
            "retrieval_status": "skipped_no_identifier",
            "record_url": row.get("record_url") or "",
            "retrieved_at": now_iso(),
        }
    params = urllib.parse.urlencode({"query": query, "format": "json", "pageSize": "1", "resultType": "core"})
    url = f"{EUROPEPMC_SEARCH_URL}?{params}"
    try:
        with urllib.request.urlopen(url, timeout=40) as response:
            payload = json.loads(response.read().decode("utf-8"))
        results = payload.get("resultList", {}).get("result", [])
        record = results[0] if results else {}
        abstract = (record.get("abstractText") or "").strip()
        return {
            "paper_key": row["paper_key"],
            "source": row.get("source") or "",
            "source_id": source_id or "",
            "title": row.get("title") or "",
            "abstract": abstract,
            "abstract_source": "europepmc",
            "abstract_length": str(len(abstract)),
            "retrieval_status": "ok" if abstract else "not_found",
            "record_url": row.get("record_url") or "",
            "retrieved_at": now_iso(),
        }
    except Exception as exc:
        return {
            "paper_key": row["paper_key"],
            "source": row.get("source") or "",
            "source_id": source_id or "",
            "title": row.get("title") or "",
            "abstract": "",
            "abstract_source": "europepmc",
            "abstract_length": "0",
            "retrieval_status": f"error:{type(exc).__name__}",
            "record_url": row.get("record_url") or "",
            "retrieved_at": now_iso(),
        }


def build_abstract_dataset(
    bundle_root: Path,
    ai_rows: list[dict[str, str]],
    *,
    fetch_limit: int = 250,
    sleep_seconds: float = 0.1,
) -> list[dict[str, str]]:
    output_path = bundle_root / "derived" / Path(ABSTRACTS_OUTPUT).name
    existing: dict[str, dict[str, str]] = {}
    if output_path.exists():
        for row in load_csv(output_path):
            existing[row["paper_key"]] = row

    rows_to_fetch = [row for row in ai_rows if row["paper_key"] not in existing]
    fetched = 0
    for row in rows_to_fetch:
        if fetched >= fetch_limit:
            break
        existing[row["paper_key"]] = europepmc_fetch_abstract(row)
        fetched += 1
        if sleep_seconds:
            time.sleep(sleep_seconds)

    merged_rows = []
    for row in ai_rows:
        merged_rows.append(
            existing.get(
                row["paper_key"],
                {
                    "paper_key": row["paper_key"],
                    "source": row.get("source") or "",
                    "source_id": row.get("pmcid") or row.get("pmid") or row.get("doi") or "",
                    "title": row.get("title") or "",
                    "abstract": "",
                    "abstract_source": "europepmc",
                    "abstract_length": "0",
                    "retrieval_status": "pending",
                    "record_url": row.get("record_url") or "",
                    "retrieved_at": "",
                },
            )
        )

    write_csv(
        output_path,
        [
            "paper_key",
            "source",
            "source_id",
            "title",
            "abstract",
            "abstract_source",
            "abstract_length",
            "retrieval_status",
            "record_url",
            "retrieved_at",
        ],
        merged_rows,
    )
    return merged_rows


def extract_conditions(text: str) -> list[tuple[str, str, int]]:
    matches = []
    lowered = text.lower()
    for slug, meta in CONDITION_PATTERNS.items():
        count = 0
        for pattern in meta["patterns"]:
            count += len(re.findall(pattern, lowered, flags=re.IGNORECASE))
        if count:
            matches.append((slug, meta["label"], count))
    return sorted(matches, key=lambda item: (-item[2], item[0]))


def build_condition_mentions_dataset(
    bundle_root: Path,
    ai_rows: list[dict[str, str]],
    abstract_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    abstract_by_key = {row["paper_key"]: row for row in abstract_rows}
    output_rows: list[dict[str, str]] = []
    for row in ai_rows:
        abstract = abstract_by_key.get(row["paper_key"], {}).get("abstract", "")
        title = row.get("title") or ""
        combined = f"{title}\n{abstract}"
        extracted = Counter()
        source_sections: dict[str, set[str]] = defaultdict(set)
        for slug, label, count in extract_conditions(title):
            extracted[(slug, label)] += count
            source_sections[(slug, label)].add("title")
        for slug, label, count in extract_conditions(abstract):
            extracted[(slug, label)] += count
            source_sections[(slug, label)].add("abstract")

        ai_indications = tokenize(row.get("indication_tags"))
        for slug in ai_indications:
            meta = CONDITION_PATTERNS.get(slug)
            if meta:
                extracted[(slug, meta["label"])] += 1
                source_sections[(slug, meta["label"])].add("ai_ingestion")

        combined_length = max(len(combined), 1)
        for (slug, label), count in extracted.items():
            confidence = min(0.99, 0.35 + (count / max(combined_length / 200.0, 1.0)) * 0.3)
            output_rows.append(
                {
                    "paper_key": row["paper_key"],
                    "condition_slug": slug,
                    "condition_label": label,
                    "match_count": str(count),
                    "source_sections": ";".join(sorted(source_sections[(slug, label)])),
                    "confidence": f"{confidence:.3f}",
                }
            )

    write_csv(
        bundle_root / "derived" / Path(CONDITIONS_OUTPUT).name,
        ["paper_key", "condition_slug", "condition_label", "match_count", "source_sections", "confidence"],
        output_rows,
    )
    return output_rows


def outcome_direction(text: str) -> str:
    lowered = text.lower()
    if any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in NEGATIVE_OUTCOME_PATTERNS):
        return "negative_or_null"
    if any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in POSITIVE_OUTCOME_PATTERNS):
        return "positive"
    return "unclear"


def detect_measure(text: str) -> str:
    lowered = text.lower()
    for measure, patterns in OUTCOME_MEASURE_PATTERNS.items():
        if any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in patterns):
            return measure
    return ""


def detect_category(text: str) -> str:
    lowered = text.lower()
    for category, patterns in OUTCOME_CATEGORY_PATTERNS.items():
        if any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in patterns):
            return category
    return "other"


def extract_metric(text: str) -> tuple[str, str]:
    percent = re.search(r"(\d+(?:\.\d+)?)\s?%", text)
    if percent:
        return percent.group(1), "%"
    points = re.search(r"(\d+(?:\.\d+)?)\s?(points?|pts)\b", text, flags=re.IGNORECASE)
    if points:
        return points.group(1), "points"
    return "", ""


def build_patient_outcomes_dataset(
    bundle_root: Path,
    ai_rows: list[dict[str, str]],
    abstract_rows: list[dict[str, str]],
    condition_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    abstract_by_key = {row["paper_key"]: row for row in abstract_rows}
    conditions_by_key: dict[str, list[str]] = defaultdict(list)
    for row in condition_rows:
        if float(row.get("confidence") or 0) >= 0.35:
            conditions_by_key[row["paper_key"]].append(row["condition_slug"])

    output_rows: list[dict[str, str]] = []
    for row in ai_rows:
        text = "\n".join(
            part for part in [row.get("title") or "", abstract_by_key.get(row["paper_key"], {}).get("abstract", "")]
            if part
        )
        if not text:
            continue
        real_world_flag = row.get("study_type_normalized") in {"cohort_study", "case_report"} or any(
            re.search(pattern, text, flags=re.IGNORECASE) for pattern in RWE_PATTERNS
        )
        for sentence in sentence_split(text):
            category = detect_category(sentence)
            measure = detect_measure(sentence)
            direction = outcome_direction(sentence)
            if category == "other" and not measure:
                continue
            value, unit = extract_metric(sentence)
            output_rows.append(
                {
                    "paper_key": row["paper_key"],
                    "source_type": "abstract" if abstract_by_key.get(row["paper_key"], {}).get("abstract") else "title",
                    "study_type_normalized": row.get("study_type_normalized") or "",
                    "evidence_tier": row.get("evidence_tier") or "",
                    "primary_modality": row.get("primary_modality") or "",
                    "condition_slug": ";".join(sorted(set(conditions_by_key.get(row["paper_key"], [])))),
                    "endpoint_category": category,
                    "outcome_measure": measure,
                    "outcome_direction": direction,
                    "metric_value": value,
                    "metric_unit": unit,
                    "real_world_evidence_flag": "Y" if real_world_flag else "N",
                    "source_snippet": sentence[:500],
                }
            )

    write_csv(
        bundle_root / "derived" / Path(OUTCOMES_OUTPUT).name,
        [
            "paper_key",
            "source_type",
            "study_type_normalized",
            "evidence_tier",
            "primary_modality",
            "condition_slug",
            "endpoint_category",
            "outcome_measure",
            "outcome_direction",
            "metric_value",
            "metric_unit",
            "real_world_evidence_flag",
            "source_snippet",
        ],
        output_rows,
    )
    return output_rows


def top_modality_condition_queries(ai_rows: list[dict[str, str]], limit: int) -> list[tuple[str, str, int]]:
    combo_counts: Counter[tuple[str, str]] = Counter()
    for row in ai_rows:
        modality = row.get("primary_modality") or ""
        if not modality:
            continue
        conditions = tokenize(row.get("indication_tags")) or ["general_neuromodulation"]
        for condition in conditions:
            combo_counts[(modality, condition)] += 1
    return [(modality, condition, count) for (modality, condition), count in combo_counts.most_common(limit)]


def ctgov_query_for_combo(modality: str, condition_slug: str) -> str:
    modality_term = MODALITY_QUERY_TERMS.get(modality, modality.replace("_", " "))
    condition_label = CONDITION_PATTERNS.get(condition_slug, {}).get("label", condition_slug.replace("_", " "))
    return f'"{modality_term}" "{condition_label}"'


def build_trials_dataset(
    bundle_root: Path,
    ai_rows: list[dict[str, str]],
    *,
    max_queries: int = 24,
    max_records_per_query: int = 25,
) -> list[dict[str, str]]:
    aggregated: dict[str, dict[str, Any]] = {}
    for modality, condition_slug, _count in top_modality_condition_queries(ai_rows, max_queries):
        query = ctgov_query_for_combo(modality, condition_slug)
        try:
            studies = ctgov.search(query, max_records=max_records_per_query)
        except Exception:
            studies = []
        for study in studies:
            protocol = study.get("protocolSection", {})
            ident = protocol.get("identificationModule") or {}
            status = protocol.get("statusModule") or {}
            design = protocol.get("designModule") or {}
            arms = protocol.get("armsInterventionsModule") or {}
            outcomes = protocol.get("outcomesModule") or {}
            sponsor = protocol.get("sponsorCollaboratorsModule") or {}
            conditions = (protocol.get("conditionsModule") or {}).get("conditions") or []

            nct_id = ident.get("nctId")
            if not nct_id:
                continue
            row = aggregated.setdefault(
                nct_id,
                {
                    "nct_id": nct_id,
                    "title": ident.get("briefTitle") or ident.get("officialTitle") or "",
                    "overall_status": status.get("overallStatus") or "",
                    "phase": ";".join(design.get("phases") or []),
                    "study_type": design.get("studyType") or "",
                    "enrollment": str(((design.get("enrollmentInfo") or {}).get("count")) or ""),
                    "sponsor": ((sponsor.get("leadSponsor") or {}).get("name")) or "",
                    "start_date": ((status.get("startDateStruct") or {}).get("date")) or "",
                    "last_update": ((status.get("lastUpdatePostDateStruct") or {}).get("date")) or "",
                    "conditions_json": json.dumps(conditions, ensure_ascii=False),
                    "interventions_json": json.dumps(arms.get("interventions") or [], ensure_ascii=False),
                    "outcomes_json": json.dumps(outcomes.get("primaryOutcomes") or [], ensure_ascii=False),
                    "brief_summary": ((protocol.get("descriptionModule") or {}).get("briefSummary")) or "",
                    "matched_modalities": set(),
                    "matched_conditions": set(),
                    "query_terms": set(),
                    "source_url": f"https://clinicaltrials.gov/study/{nct_id}",
                    "raw_json": json.dumps(study, ensure_ascii=False),
                },
            )
            row["matched_modalities"].add(modality)
            row["matched_conditions"].add(condition_slug)
            row["query_terms"].add(query)

    rows = []
    for row in aggregated.values():
        rows.append(
            {
                **{k: v for k, v in row.items() if k not in {"matched_modalities", "matched_conditions", "query_terms"}},
                "matched_modalities": ";".join(sorted(row["matched_modalities"])),
                "matched_conditions": ";".join(sorted(row["matched_conditions"])),
                "query_terms": " | ".join(sorted(row["query_terms"])),
            }
        )

    write_csv(
        bundle_root / "derived" / Path(TRIALS_OUTPUT).name,
        [
            "nct_id",
            "title",
            "overall_status",
            "phase",
            "study_type",
            "enrollment",
            "sponsor",
            "start_date",
            "last_update",
            "conditions_json",
            "interventions_json",
            "outcomes_json",
            "brief_summary",
            "matched_modalities",
            "matched_conditions",
            "query_terms",
            "source_url",
            "raw_json",
        ],
        sorted(rows, key=lambda item: (item["last_update"], item["nct_id"]), reverse=True),
    )
    return rows


def build_fda_510k_dataset(
    bundle_root: Path,
    ai_rows: list[dict[str, str]],
    *,
    max_records_per_applicant: int = 25,
) -> list[dict[str, str]]:
    observed_modalities = {row.get("primary_modality") for row in ai_rows if row.get("primary_modality")}
    rows_by_number: dict[str, dict[str, Any]] = {}
    for modality in sorted(observed_modalities):
        seed_modality = AI_MODALITY_TO_SEED_MODALITY.get(modality or "")
        if not seed_modality:
            continue
        meta = SEED_MODALITY_METADATA.get(seed_modality) or {}
        applicants = sorted(meta.get("applicants") or [])
        product_codes = sorted(meta.get("product_codes") or [])
        matched_conditions = sorted(
            {
                condition
                for row in ai_rows
                if row.get("primary_modality") == modality
                for condition in tokenize(row.get("indication_tags"))
            }
        )
        for applicant in applicants:
            try:
                results = openfda.search_510k(applicant, max_records=max_records_per_applicant, product_codes=product_codes)
            except Exception:
                results = []
            for rec in results:
                number = rec.get("k_number")
                if not number:
                    continue
                row = rows_by_number.setdefault(
                    number,
                    {
                        "clearance_number": number,
                        "decision_date": rec.get("decision_date") or "",
                        "applicant": rec.get("applicant") or "",
                        "device_name": rec.get("device_name") or "",
                        "generic_name": rec.get("generic_name") or "",
                        "product_code": rec.get("product_code") or "",
                        "advisory_committee": rec.get("advisory_committee_description") or "",
                        "matched_modalities": set(),
                        "matched_conditions": set(),
                        "query_terms": set(),
                        "source_url": f"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID={number}",
                        "raw_json": json.dumps(rec, ensure_ascii=False),
                    },
                )
                row["matched_modalities"].add(modality or "")
                row["matched_conditions"].update(matched_conditions)
                row["query_terms"].add(applicant)

    rows = []
    for row in rows_by_number.values():
        rows.append(
            {
                **{k: v for k, v in row.items() if k not in {"matched_modalities", "matched_conditions", "query_terms"}},
                "matched_modalities": ";".join(sorted(filter(None, row["matched_modalities"]))),
                "matched_conditions": ";".join(sorted(filter(None, row["matched_conditions"]))),
                "query_terms": " | ".join(sorted(row["query_terms"])),
            }
        )

    write_csv(
        bundle_root / "derived" / Path(FDA_OUTPUT).name,
        [
            "clearance_number",
            "decision_date",
            "applicant",
            "device_name",
            "generic_name",
            "product_code",
            "advisory_committee",
            "matched_modalities",
            "matched_conditions",
            "query_terms",
            "source_url",
            "raw_json",
        ],
        sorted(rows, key=lambda item: (item["decision_date"], item["clearance_number"]), reverse=True),
    )
    return rows


def build_enrichment_bundle(
    bundle_root: Path,
    *,
    abstract_fetch_limit: int = 250,
    trial_query_limit: int = 24,
    trial_records_per_query: int = 25,
    fda_records_per_applicant: int = 25,
) -> dict[str, int]:
    ai_rows = load_csv(resolve_bundle_file(bundle_root, "derived/neuromodulation_ai_ingestion_dataset.csv"))
    abstract_rows = build_abstract_dataset(bundle_root, ai_rows, fetch_limit=abstract_fetch_limit)
    condition_rows = build_condition_mentions_dataset(bundle_root, ai_rows, abstract_rows)
    outcome_rows = build_patient_outcomes_dataset(bundle_root, ai_rows, abstract_rows, condition_rows)
    trial_rows = build_trials_dataset(
        bundle_root,
        ai_rows,
        max_queries=trial_query_limit,
        max_records_per_query=trial_records_per_query,
    )
    fda_rows = build_fda_510k_dataset(
        bundle_root,
        ai_rows,
        max_records_per_applicant=fda_records_per_applicant,
    )
    return {
        "abstracts": len(abstract_rows),
        "condition_mentions": len(condition_rows),
        "patient_outcomes": len(outcome_rows),
        "clinical_trials": len(trial_rows),
        "fda_510k_records": len(fda_rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate neuromodulation bundle enrichments.")
    parser.add_argument("--bundle-root", type=Path, required=True)
    parser.add_argument("--abstract-fetch-limit", type=int, default=250)
    parser.add_argument("--trial-query-limit", type=int, default=24)
    parser.add_argument("--trial-records-per-query", type=int, default=25)
    parser.add_argument("--fda-records-per-applicant", type=int, default=25)
    args = parser.parse_args()

    summary = build_enrichment_bundle(
        args.bundle_root,
        abstract_fetch_limit=args.abstract_fetch_limit,
        trial_query_limit=args.trial_query_limit,
        trial_records_per_query=args.trial_records_per_query,
        fda_records_per_applicant=args.fda_records_per_applicant,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

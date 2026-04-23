#!/usr/bin/env python3

import csv
import re
import unicodedata
from pathlib import Path


SOURCE_FILES = [
    Path("/Users/aliyildirim/neuromodulation_papers_europepmc.csv"),
    Path("/Users/aliyildirim/neuromodulation_papers_modalities_europepmc.csv"),
]

MASTER_OUTPUT = Path("/Users/aliyildirim/neuromodulation_all_papers_master.csv")
AI_OUTPUT = Path("/Users/aliyildirim/neuromodulation_ai_ingestion_dataset.csv")


MODALITY_PATTERNS = {
    "deep_brain_stimulation": [r"\bdeep brain stimulation\b", r"\bdbs\b"],
    "responsive_neurostimulation": [r"\bresponsive neurostimulation\b", r"\brns\b"],
    "vagus_nerve_stimulation": [r"\bvagus nerve stimulation\b", r"\bvagal nerve stimulation\b", r"\bvns\b"],
    "auricular_vagus_nerve_stimulation": [
        r"\bauricular vagus nerve stimulation\b",
        r"\btranscutaneous auricular vagus nerve stimulation\b",
        r"\btavns\b",
    ],
    "transcranial_magnetic_stimulation": [
        r"\btranscranial magnetic stimulation\b",
        r"\brtms\b",
        r"\btms\b",
        r"\btheta burst stimulation\b",
        r"\bitbs\b",
        r"\bctbs\b",
    ],
    "transcranial_direct_current_stimulation": [r"\btranscranial direct current stimulation\b", r"\btdcs\b"],
    "transcranial_alternating_current_stimulation": [r"\btranscranial alternating current stimulation\b", r"\btacs\b"],
    "transcranial_random_noise_stimulation": [r"\btranscranial random noise stimulation\b", r"\btrns\b"],
    "transcranial_pulsed_current_stimulation": [r"\btranscranial pulsed current stimulation\b", r"\btpcs\b"],
    "focused_ultrasound_neuromodulation": [
        r"\bfocused ultrasound neuromodulation\b",
        r"\blow[- ]intensity focused ultrasound\b",
        r"\btranscranial focused ultrasound\b",
        r"\blifu\b",
    ],
    "spinal_cord_stimulation": [r"\bspinal cord stimulation\b", r"\bscs\b", r"\bdorsal column stimulation\b"],
    "dorsal_root_ganglion_stimulation": [r"\bdorsal root ganglion stimulation\b", r"\bdrg stimulation\b"],
    "peripheral_nerve_stimulation": [r"\bperipheral nerve stimulation\b", r"\bpns\b"],
    "sacral_neuromodulation": [r"\bsacral neuromodulation\b", r"\bsacral nerve stimulation\b", r"\bsns\b"],
    "tibial_nerve_stimulation": [
        r"\bposterior tibial nerve stimulation\b",
        r"\bpercutaneous tibial nerve stimulation\b",
        r"\btranscutaneous tibial nerve stimulation\b",
        r"\bptns\b",
        r"\bttns\b",
    ],
    "trigeminal_nerve_stimulation": [r"\btrigeminal nerve stimulation\b", r"\btns\b"],
    "occipital_nerve_stimulation": [r"\boccipital nerve stimulation\b", r"\bons\b"],
    "hypoglossal_nerve_stimulation": [r"\bhypoglossal nerve stimulation\b"],
    "motor_cortex_stimulation": [r"\bmotor cortex stimulation\b", r"\bcortical stimulation\b"],
    "general_neuromodulation": [r"\bneuromodulation\b"],
}

INDICATION_PATTERNS = {
    "depression": [r"\bdepression\b", r"\bmajor depressive\b", r"\bmdd\b"],
    "anxiety": [r"\banxiety\b", r"\bgad\b"],
    "ptsd": [r"\bpost[- ]traumatic stress\b", r"\bptsd\b"],
    "ocd": [r"\bobsessive[- ]compulsive\b", r"\bocd\b"],
    "addiction_substance_use": [r"\bsubstance use\b", r"\baddiction\b", r"\bcocaine\b", r"\balcohol\b", r"\bopioid\b", r"\bnicotine\b"],
    "epilepsy_seizures": [r"\bepilep", r"\bseizure", r"\bstatus epilepticus\b"],
    "parkinsons_disease": [r"\bparkinson", r"\bpd\b"],
    "essential_tremor": [r"\bessential tremor\b", r"\btremor\b"],
    "dystonia": [r"\bdystonia\b"],
    "chronic_pain": [r"\bpain\b", r"\bneuralgia\b", r"\bneuropathic\b", r"\bnociceptive\b", r"\bmigraine\b", r"\bheadache\b"],
    "stroke_rehabilitation": [r"\bstroke\b", r"\bpoststroke\b", r"\brehabilitation\b"],
    "brain_injury": [r"\btraumatic brain injury\b", r"\btbi\b", r"\bbrain injury\b"],
    "spinal_cord_injury": [r"\bspinal cord injury\b", r"\bsci\b"],
    "multiple_sclerosis": [r"\bmultiple sclerosis\b", r"\bms\b"],
    "alzheimers_dementia": [r"\balzheimer", r"\bdementia\b"],
    "sleep_apnea": [r"\bsleep apnea\b", r"\bobstructive sleep apnea\b", r"\bosa\b"],
    "urinary_bladder_bowel": [r"\boveractive bladder\b", r"\burinary\b", r"\bbladder\b", r"\bfecal\b", r"\bbowel\b", r"\bincontinence\b"],
    "tinnitus": [r"\btinnitus\b"],
}

STUDY_TYPE_PATTERNS = {
    "systematic_review": [r"\bsystematic review\b"],
    "meta_analysis": [r"\bmeta-analysis\b", r"\bmeta analysis\b", r"\bpooled analysis\b"],
    "review": [r"\breview\b", r"\bnarrative review\b", r"\bscoping review\b"],
    "guideline_consensus": [r"\bguideline\b", r"\bconsensus\b", r"\brecommendation\b", r"\bposition statement\b"],
    "randomized_controlled_trial": [r"\brandomized\b", r"\brandomised\b", r"\bsham-controlled\b", r"\bdouble-blind\b", r"\bcontrolled trial\b"],
    "clinical_trial": [r"\bclinical trial\b", r"\bpilot trial\b", r"\bfeasibility trial\b"],
    "protocol_paper": [r"\bstudy protocol\b", r"\btrial protocol\b", r"\bprotocol for\b"],
    "cohort_study": [r"\bcohort\b", r"\bprospective\b", r"\bretrospective\b"],
    "case_report": [r"\bcase report\b", r"\bcase series\b"],
    "animal_preclinical": [r"\brat\b", r"\bmice\b", r"\bmouse\b", r"\banimal\b", r"\bpreclinical\b", r"\bmonkey\b", r"\bporcine\b"],
}

POPULATION_PATTERNS = {
    "pediatric": [r"\bpediatric\b", r"\bpaediatric\b", r"\bchild", r"\badolescent\b", r"\byouth\b"],
    "adult": [r"\badult\b"],
    "older_adult": [r"\belderly\b", r"\bolder adult", r"\bgeriatric\b"],
    "pregnancy": [r"\bpregnan", r"\bperinatal\b", r"\bpostpartum\b"],
    "animal": [r"\brat\b", r"\bmice\b", r"\bmouse\b", r"\banimal\b", r"\bpreclinical\b", r"\bmonkey\b", r"\bporcine\b"],
}

TARGET_PATTERNS = {
    "dlpfc": [r"\bdlpfc\b", r"\bdorsolateral prefrontal cortex\b"],
    "m1_motor_cortex": [r"\bprimary motor cortex\b", r"\bm1\b", r"\bmotor cortex\b"],
    "prefrontal_cortex": [r"\bprefrontal cortex\b", r"\bpfc\b"],
    "subthalamic_nucleus": [r"\bsubthalamic nucleus\b", r"\bstn\b"],
    "globus_pallidus": [r"\bglobus pallidus\b", r"\bgpi\b", r"\bgpe\b"],
    "thalamus": [r"\bthalam", r"\bant\b"],
    "nucleus_accumbens": [r"\bnucleus accumbens\b", r"\bnac\b"],
    "vagus_nerve": [r"\bvagus nerve\b", r"\bvagal\b"],
    "spinal_cord": [r"\bspinal cord\b", r"\bdorsal column\b"],
    "dorsal_root_ganglion": [r"\bdorsal root ganglion\b"],
    "trigeminal_nerve": [r"\btrigeminal nerve\b"],
    "occipital_nerve": [r"\boccipital nerve\b"],
    "hypoglossal_nerve": [r"\bhypoglossal nerve\b"],
    "tibial_nerve": [r"\btibial nerve\b"],
    "sacral_nerve": [r"\bsacral nerve\b", r"\bs3\b"],
}

PARAMETER_PATTERNS = {
    "frequency_signal": [r"\b\d+(\.\d+)?\s?hz\b", r"\bhigh[- ]frequency\b", r"\blow[- ]frequency\b"],
    "current_signal": [r"\b\d+(\.\d+)?\s?ma\b", r"\bcurrent intensity\b"],
    "pulse_width_signal": [r"\bpulse width\b", r"\b\d+(\.\d+)?\s?(us|μs|ms)\b"],
    "amplitude_signal": [r"\bamplitude\b", r"\bvoltage\b", r"\b\d+(\.\d+)?\s?v\b"],
    "session_count_signal": [r"\b\d+\s?sessions?\b", r"\bnumber of sessions\b"],
    "duration_signal": [r"\b\d+\s?(min|minutes|hour|hours|day|days|week|weeks|month|months)\b"],
    "dose_signal": [r"\bdose\b", r"\bdosing\b"],
    "targeting_signal": [r"\btarget\b", r"\btargeted\b", r"\bnavigation\b", r"\bneuronavigat"],
    "closed_loop_signal": [r"\bclosed[- ]loop\b", r"\badaptive\b", r"\bresponsive\b"],
}


def normalize_text(text: str) -> str:
    text = text or ""
    text = unicodedata.normalize("NFKC", text)
    return " ".join(text.split())


def slug_text(text: str) -> str:
    text = normalize_text(text).lower()
    return re.sub(r"\s+", " ", text).strip()


def dedupe_key(row: dict) -> tuple:
    doi = slug_text(row.get("doi", ""))
    if doi:
        return ("doi", doi)

    pmid = normalize_text(row.get("pmid", ""))
    if pmid:
        return ("pmid", pmid)

    pmcid = slug_text(row.get("pmcid", ""))
    if pmcid:
        return ("pmcid", pmcid)

    title = slug_text(row.get("title", ""))
    year = normalize_text(row.get("year", ""))
    return ("title_year", title, year)


def split_semicolon(value: str) -> set:
    return {item.strip() for item in (value or "").split(";") if item.strip()}


def match_tags(text: str, patterns: dict) -> list:
    hits = []
    for tag, regexes in patterns.items():
        if any(re.search(regex, text, flags=re.IGNORECASE) for regex in regexes):
            hits.append(tag)
    return sorted(hits)


def normalize_study_type(pub_type: str, title_text: str) -> str:
    matched = match_tags(f"{pub_type} {title_text}", STUDY_TYPE_PATTERNS)
    priority = [
        "meta_analysis",
        "systematic_review",
        "guideline_consensus",
        "randomized_controlled_trial",
        "clinical_trial",
        "protocol_paper",
        "cohort_study",
        "case_report",
        "animal_preclinical",
        "review",
    ]
    for item in priority:
        if item in matched:
            return item
    pub = slug_text(pub_type)
    if "review" in pub:
        return "review"
    if "journal article" in pub:
        return "journal_article"
    return "other"


def evidence_tier(study_type: str) -> str:
    mapping = {
        "meta_analysis": "high",
        "systematic_review": "high",
        "guideline_consensus": "high",
        "randomized_controlled_trial": "moderate_high",
        "clinical_trial": "moderate",
        "cohort_study": "moderate",
        "protocol_paper": "low_for_effectiveness",
        "case_report": "low",
        "animal_preclinical": "preclinical",
        "review": "contextual",
        "journal_article": "unspecified",
        "other": "unspecified",
    }
    return mapping.get(study_type, "unspecified")


def infer_invasiveness(modalities: set) -> str:
    invasive = {
        "deep_brain_stimulation",
        "responsive_neurostimulation",
        "spinal_cord_stimulation",
        "dorsal_root_ganglion_stimulation",
        "peripheral_nerve_stimulation",
        "sacral_neuromodulation",
        "occipital_nerve_stimulation",
        "motor_cortex_stimulation",
        "hypoglossal_nerve_stimulation",
    }
    mixed = {
        "vagus_nerve_stimulation",
        "tibial_nerve_stimulation",
        "trigeminal_nerve_stimulation",
    }
    noninvasive = {
        "auricular_vagus_nerve_stimulation",
        "transcranial_magnetic_stimulation",
        "transcranial_direct_current_stimulation",
        "transcranial_alternating_current_stimulation",
        "transcranial_random_noise_stimulation",
        "transcranial_pulsed_current_stimulation",
        "focused_ultrasound_neuromodulation",
    }
    if modalities & invasive:
        return "invasive_or_implanted"
    if modalities & mixed and modalities & noninvasive:
        return "mixed"
    if modalities & mixed:
        return "mixed_or_device_dependent"
    if modalities & noninvasive:
        return "noninvasive"
    return "unknown"


def protocol_relevance_score(modalities: set, study_type: str, text: str) -> int:
    score = 0
    if modalities:
        score += 2
    if study_type in {"randomized_controlled_trial", "clinical_trial", "meta_analysis", "systematic_review", "guideline_consensus"}:
        score += 2
    if any(re.search(regex, text, flags=re.IGNORECASE) for regs in PARAMETER_PATTERNS.values() for regex in regs):
        score += 2
    if any(token in text.lower() for token in ["protocol", "parameter", "dose", "stimulation", "target"]):
        score += 1
    return min(score, 5)


def merge_sources() -> list:
    records = {}

    for source_path in SOURCE_FILES:
        with source_path.open(encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                key = dedupe_key(row)
                record = records.setdefault(
                    key,
                    {
                        "source": "",
                        "id": "",
                        "pmid": "",
                        "pmcid": "",
                        "doi": "",
                        "title": "",
                        "authors": "",
                        "journal": "",
                        "year": "",
                        "pub_type": "",
                        "is_open_access": "",
                        "cited_by_count": "",
                        "first_publication_date": "",
                        "first_index_date": "",
                        "europe_pmc_url": "",
                        "matched_modalities": set(),
                        "matched_query_terms": set(),
                        "source_exports": set(),
                    },
                )

                for field in [
                    "source",
                    "id",
                    "pmid",
                    "pmcid",
                    "doi",
                    "title",
                    "authors",
                    "journal",
                    "year",
                    "pub_type",
                    "is_open_access",
                    "cited_by_count",
                    "first_publication_date",
                    "first_index_date",
                    "europe_pmc_url",
                ]:
                    if not record[field] and row.get(field):
                        record[field] = row[field]

                if row.get("matched_modalities"):
                    record["matched_modalities"].update(split_semicolon(row["matched_modalities"]))
                if row.get("matched_query_terms"):
                    record["matched_query_terms"].update(split_semicolon(row["matched_query_terms"]))
                if row.get("query"):
                    record["matched_query_terms"].add(normalize_text(row["query"]))

                record["source_exports"].add(source_path.name)

    return list(records.values())


def write_master(rows: list) -> None:
    fieldnames = [
        "source",
        "id",
        "pmid",
        "pmcid",
        "doi",
        "title",
        "authors",
        "journal",
        "year",
        "pub_type",
        "is_open_access",
        "cited_by_count",
        "first_publication_date",
        "first_index_date",
        "europe_pmc_url",
        "matched_modalities",
        "matched_query_terms",
        "source_exports",
    ]

    with MASTER_OUTPUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in sorted(rows, key=lambda item: (normalize_text(item["year"]), slug_text(item["title"])), reverse=True):
            out = row.copy()
            out["matched_modalities"] = "; ".join(sorted(row["matched_modalities"]))
            out["matched_query_terms"] = "; ".join(sorted(row["matched_query_terms"]))
            out["source_exports"] = "; ".join(sorted(row["source_exports"]))
            writer.writerow(out)


def write_ai_dataset(rows: list) -> None:
    fieldnames = [
        "paper_key",
        "title",
        "title_normalized",
        "authors",
        "journal",
        "year",
        "source",
        "doi",
        "pmid",
        "pmcid",
        "pub_type_raw",
        "study_type_normalized",
        "evidence_tier",
        "canonical_modalities",
        "primary_modality",
        "invasiveness",
        "indication_tags",
        "population_tags",
        "target_tags",
        "parameter_signal_tags",
        "protocol_relevance_score",
        "open_access_flag",
        "citation_count",
        "matched_query_terms",
        "source_exports",
        "record_url",
        "ai_ingestion_text",
    ]

    with AI_OUTPUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()

        for row in sorted(rows, key=lambda item: (normalize_text(item["year"]), slug_text(item["title"])), reverse=True):
            title = normalize_text(row["title"])
            journal = normalize_text(row["journal"])
            pub_type = normalize_text(row["pub_type"])
            matched_modalities = set(row["matched_modalities"])

            text_for_rules = " ".join(
                part for part in [
                    title,
                    journal,
                    pub_type,
                    " ".join(sorted(matched_modalities)),
                    " ".join(sorted(row["matched_query_terms"])),
                ] if part
            )

            inferred_modalities = set(match_tags(text_for_rules, MODALITY_PATTERNS))
            canonical_modalities = sorted(matched_modalities | inferred_modalities)
            study_type = normalize_study_type(pub_type, text_for_rules)
            indications = match_tags(text_for_rules, INDICATION_PATTERNS)
            populations = match_tags(text_for_rules, POPULATION_PATTERNS)
            targets = match_tags(text_for_rules, TARGET_PATTERNS)
            parameter_signals = match_tags(text_for_rules, PARAMETER_PATTERNS)
            paper_key = "|".join(dedupe_key(row))

            ai_text_parts = [
                f"title: {title}" if title else "",
                f"modalities: {', '.join(canonical_modalities)}" if canonical_modalities else "",
                f"indications: {', '.join(indications)}" if indications else "",
                f"study_type: {study_type}" if study_type else "",
                f"journal: {journal}" if journal else "",
                f"year: {normalize_text(row['year'])}" if row["year"] else "",
                f"pub_type: {pub_type}" if pub_type else "",
                f"targets: {', '.join(targets)}" if targets else "",
                f"parameter_signals: {', '.join(parameter_signals)}" if parameter_signals else "",
            ]

            writer.writerow(
                {
                    "paper_key": paper_key,
                    "title": title,
                    "title_normalized": slug_text(title),
                    "authors": normalize_text(row["authors"]),
                    "journal": journal,
                    "year": normalize_text(row["year"]),
                    "source": normalize_text(row["source"]),
                    "doi": normalize_text(row["doi"]),
                    "pmid": normalize_text(row["pmid"]),
                    "pmcid": normalize_text(row["pmcid"]),
                    "pub_type_raw": pub_type,
                    "study_type_normalized": study_type,
                    "evidence_tier": evidence_tier(study_type),
                    "canonical_modalities": "; ".join(canonical_modalities),
                    "primary_modality": canonical_modalities[0] if canonical_modalities else "",
                    "invasiveness": infer_invasiveness(set(canonical_modalities)),
                    "indication_tags": "; ".join(indications),
                    "population_tags": "; ".join(populations),
                    "target_tags": "; ".join(targets),
                    "parameter_signal_tags": "; ".join(parameter_signals),
                    "protocol_relevance_score": protocol_relevance_score(set(canonical_modalities), study_type, text_for_rules),
                    "open_access_flag": normalize_text(row["is_open_access"]),
                    "citation_count": normalize_text(str(row["cited_by_count"])),
                    "matched_query_terms": "; ".join(sorted(row["matched_query_terms"])),
                    "source_exports": "; ".join(sorted(row["source_exports"])),
                    "record_url": normalize_text(row["europe_pmc_url"]),
                    "ai_ingestion_text": " | ".join(part for part in ai_text_parts if part),
                }
            )


def main() -> int:
    rows = merge_sources()
    write_master(rows)
    write_ai_dataset(rows)
    print(f"Wrote master dataset to {MASTER_OUTPUT}")
    print(f"Wrote AI ingestion dataset to {AI_OUTPUT}")
    print(f"Unified row count: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

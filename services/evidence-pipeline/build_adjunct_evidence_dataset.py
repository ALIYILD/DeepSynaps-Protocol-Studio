from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BUNDLE_ROOT = ROOT / "data" / "research" / "neuromodulation"
SOURCE_DATASET = "neuromodulation_master_database_enriched.csv"
TARGET_DATASET = "derived/neuromodulation_adjunct_evidence.csv"
TARGET_ASSET_KEY = "neuromodulation_adjunct_evidence"


@dataclass(frozen=True)
class TopicRule:
    key: str
    label: str
    domain: str
    terms: tuple[str, ...]


TOPIC_RULES: tuple[TopicRule, ...] = (
    TopicRule("ssri", "SSRI Antidepressants", "medication", ("ssri", "selective serotonin reuptake inhibitor", "sertraline", "fluoxetine", "escitalopram", "citalopram", "paroxetine")),
    TopicRule("snri", "SNRI Antidepressants", "medication", ("snri", "serotonin norepinephrine reuptake inhibitor", "venlafaxine", "desvenlafaxine", "duloxetine")),
    TopicRule("bupropion", "Bupropion", "medication", ("bupropion", "wellbutrin")),
    TopicRule("benzodiazepines", "Benzodiazepines", "medication", ("benzodiazepine", "lorazepam", "alprazolam", "clonazepam", "diazepam")),
    TopicRule("stimulants", "Stimulants", "medication", ("stimulant", "methylphenidate", "amphetamine", "lisdexamfetamine", "dexmethylphenidate")),
    TopicRule("antipsychotics", "Antipsychotics", "medication", ("antipsychotic", "quetiapine", "olanzapine", "risperidone", "aripiprazole")),
    TopicRule("anticonvulsants", "Anticonvulsants", "medication", ("anticonvulsant", "lamotrigine", "valproate", "gabapentin", "pregabalin", "carbamazepine")),
    TopicRule("lithium", "Lithium", "medication", ("lithium",)),
    TopicRule("ketamine", "Ketamine / Esketamine", "medication", ("ketamine", "esketamine")),
    TopicRule("cbc", "Complete Blood Count", "lab_test", ("complete blood count", "cbc", "hematocrit", "hemoglobin")),
    TopicRule("cmp", "Comprehensive Metabolic Panel", "lab_test", ("comprehensive metabolic panel", "cmp", "liver enzymes", "electrolytes")),
    TopicRule("ferritin", "Ferritin", "biomarker", ("ferritin", "iron deficiency", "iron status")),
    TopicRule("vitamin_d", "Vitamin D", "vitamin", ("vitamin d", "25-oh vitamin d", "25 hydroxyvitamin d", "25-hydroxyvitamin d")),
    TopicRule("vitamin_b12", "Vitamin B12", "vitamin", ("vitamin b12", "b12 deficiency", "cobalamin")),
    TopicRule("folate", "Folate", "vitamin", ("folate", "folic acid")),
    TopicRule("magnesium", "Magnesium", "supplement", ("magnesium", "serum magnesium", "intracellular magnesium")),
    TopicRule("omega_3", "Omega-3", "supplement", ("omega-3", "omega 3", "omega3", "epa", "dha", "fish oil")),
    TopicRule("homocysteine", "Homocysteine", "biomarker", ("homocysteine",)),
    TopicRule("crp", "C-Reactive Protein", "biomarker", ("c-reactive protein", "crp", "hs-crp", "inflammation marker")),
    TopicRule("thyroid", "Thyroid / TSH", "biomarker", ("thyroid", "tsh", "free t4", "hypothyroid", "hyperthyroid")),
    TopicRule("hba1c", "HbA1c / Glycemia", "biomarker", ("hba1c", "hemoglobin a1c", "glycemic", "glucose control")),
    TopicRule("cortisol", "Cortisol", "biomarker", ("cortisol", "hpa axis")),
    TopicRule("testosterone", "Testosterone", "biomarker", ("testosterone", "androgen")),
    TopicRule("estradiol", "Estradiol", "biomarker", ("estradiol", "estrogen")),
    TopicRule("zinc", "Zinc", "supplement", ("zinc",)),
    TopicRule("creatine", "Creatine", "supplement", ("creatine",)),
    TopicRule("nac", "N-Acetylcysteine", "supplement", ("n-acetylcysteine", "n acetylcysteine", "nac")),
    TopicRule("melatonin", "Melatonin", "supplement", ("melatonin",)),
    TopicRule("probiotic", "Probiotics", "supplement", ("probiotic", "microbiome")),
    TopicRule("ketogenic_diet", "Ketogenic Diet", "diet", ("ketogenic diet", "keto diet", "ketosis")),
    TopicRule("mediterranean_diet", "Mediterranean Diet", "diet", ("mediterranean diet",)),
    TopicRule("anti_inflammatory_diet", "Anti-Inflammatory Diet", "diet", ("anti-inflammatory diet", "anti inflammatory diet")),
    TopicRule("diet_quality", "Diet Quality / Nutrition", "diet", ("diet quality", "nutrition", "nutritional status", "dietary pattern")),
)

RELATION_RULES: tuple[tuple[str, str], ...] = (
    ("response", "response_modifier"),
    ("predict", "predictive_signal"),
    ("deficien", "deficiency_signal"),
    ("inflamm", "inflammation_signal"),
    ("contraind", "contraindication_signal"),
    ("adverse", "safety_signal"),
    ("seizure", "seizure_threshold_signal"),
    ("interaction", "interaction_signal"),
    ("withdraw", "withdrawal_signal"),
    ("taper", "taper_signal"),
    ("augment", "adjunctive_signal"),
    ("biomarker", "biomarker_signal"),
    ("medication", "medication_signal"),
    ("antidepress", "medication_signal"),
    ("diet", "diet_signal"),
    ("supplement", "supplement_signal"),
    ("vitamin", "vitamin_signal"),
)

FIELDNAMES = [
    "paper_key", "title", "authors", "journal", "journal_normalized", "year", "doi", "pmid", "pmcid",
    "primary_modality", "canonical_modalities", "indication_tags", "study_type_normalized", "evidence_tier",
    "paper_confidence_score", "priority_score", "citation_count", "record_url", "research_summary",
    "adjunct_domains", "adjunct_topic_keys", "adjunct_topic_labels", "adjunct_terms", "condition_mentions_top",
    "relation_signal_tags",
]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _match_topics(text: str) -> list[TopicRule]:
    return [rule for rule in TOPIC_RULES if any(term in text for term in rule.terms)]


def _relation_tags(text: str) -> list[str]:
    tags: list[str] = []
    for term, tag in RELATION_RULES:
        if term in text and tag not in tags:
            tags.append(tag)
    return tags


def build_dataset(bundle_root: Path) -> tuple[Path, int]:
    source_path = bundle_root / SOURCE_DATASET
    target_path = bundle_root / TARGET_DATASET
    target_path.parent.mkdir(parents=True, exist_ok=True)
    row_count = 0
    with source_path.open(encoding="utf-8", newline="") as src, target_path.open("w", encoding="utf-8", newline="") as dst:
        reader = csv.DictReader(src)
        writer = csv.DictWriter(dst, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in reader:
            text = " ".join([
                row.get("title", ""),
                row.get("research_summary", ""),
                row.get("abstract", ""),
                row.get("ai_ingestion_text", ""),
                row.get("condition_mentions_top", ""),
                row.get("parameter_signal_tags", ""),
                row.get("safety_signal_tags", ""),
                row.get("contraindication_signal_tags", ""),
            ]).lower()
            topics = _match_topics(text)
            if not topics:
                continue
            writer.writerow({
                "paper_key": row.get("paper_key", ""),
                "title": row.get("title", ""),
                "authors": row.get("authors", ""),
                "journal": row.get("journal", ""),
                "journal_normalized": row.get("journal_normalized", ""),
                "year": row.get("year", ""),
                "doi": row.get("doi", ""),
                "pmid": row.get("pmid", ""),
                "pmcid": row.get("pmcid", ""),
                "primary_modality": row.get("primary_modality", ""),
                "canonical_modalities": row.get("canonical_modalities", ""),
                "indication_tags": row.get("indication_tags", ""),
                "study_type_normalized": row.get("study_type_normalized", ""),
                "evidence_tier": row.get("evidence_tier", ""),
                "paper_confidence_score": row.get("paper_confidence_score", ""),
                "priority_score": row.get("priority_score", ""),
                "citation_count": row.get("cited_by_count", ""),
                "record_url": row.get("record_url", ""),
                "research_summary": row.get("research_summary", ""),
                "adjunct_domains": ";".join(dict.fromkeys(rule.domain for rule in topics)),
                "adjunct_topic_keys": ";".join(dict.fromkeys(rule.key for rule in topics)),
                "adjunct_topic_labels": ";".join(dict.fromkeys(rule.label for rule in topics)),
                "adjunct_terms": ";".join(dict.fromkeys(term for rule in topics for term in rule.terms[:2])),
                "condition_mentions_top": row.get("condition_mentions_top", ""),
                "relation_signal_tags": ";".join(_relation_tags(text)),
            })
            row_count += 1
    return target_path, row_count


def update_manifest(bundle_root: Path, target_path: Path, row_count: int) -> None:
    manifest_path = bundle_root / "manifest.json"
    if not manifest_path.exists():
        return
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = payload.get("assets") or []
    relative_path = str(target_path.relative_to(bundle_root))
    asset = {
        "asset_key": TARGET_ASSET_KEY,
        "relative_path": relative_path,
        "sha256": _sha256(target_path),
        "bytes": target_path.stat().st_size,
        "row_count": row_count,
        "kind": "derived",
    }
    for idx, existing in enumerate(assets):
        if existing.get("asset_key") == TARGET_ASSET_KEY or existing.get("relative_path") == relative_path:
            assets[idx] = asset
            break
    else:
        assets.append(asset)
    payload["assets"] = assets
    manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    target_path, row_count = build_dataset(DEFAULT_BUNDLE_ROOT)
    update_manifest(DEFAULT_BUNDLE_ROOT, target_path, row_count)
    print(json.dumps({"path": str(target_path), "row_count": row_count}, indent=2))


if __name__ == "__main__":
    main()

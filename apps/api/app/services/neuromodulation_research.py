from __future__ import annotations

import csv
import json
import os
from collections import Counter
from functools import lru_cache
from heapq import heappop, heappush
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

try:
    from dotenv import load_dotenv as _load_dotenv

    _API_ROOT = Path(__file__).resolve().parents[2]
    _REPO_ROOT = Path(__file__).resolve().parents[4]
    for _env_path in (_API_ROOT / ".env", _REPO_ROOT / ".env"):
        if _env_path.exists():
            _load_dotenv(_env_path, override=False)
except ImportError:
    pass


def _default_root() -> Path:
    env_root = os.getenv("DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT") or os.getenv("DEEPSYNAPS_RESEARCH_BUNDLE_ROOT")
    if env_root:
        return Path(env_root).resolve()
    repo_root = Path(__file__).resolve().parents[4]
    canonical_root = repo_root / "data" / "research" / "neuromodulation"
    if canonical_root.exists():
        return canonical_root
    return repo_root / "data" / "imports" / "neuromodulation-research" / "2026-04-22"


def _bundle_file(name: str) -> Path:
    return _default_root() / name


def _manifest_candidates() -> list[Path]:
    root = _default_root()
    return [root / "manifest.json", root / "research_bundle_manifest.json"]


def _first_existing_path(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def bundle_exists() -> bool:
    return _first_existing_path(_manifest_candidates()) is not None


def bundle_root() -> str:
    return str(_default_root())


@lru_cache(maxsize=8)
def _load_manifest(path_str: str) -> dict:
    path = Path(path_str)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_manifest() -> dict:
    manifest_path = _first_existing_path(_manifest_candidates())
    if manifest_path is None:
        return {}
    return _load_manifest(str(manifest_path))


@lru_cache(maxsize=8)
def _load_top_condition_knowledge_base(path_str: str) -> dict[str, dict]:
    path = Path(path_str)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_top_condition_knowledge_base() -> dict[str, dict]:
    return _load_top_condition_knowledge_base(str(_bundle_file("top_condition_knowledge_base.json")))


@lru_cache(maxsize=8)
def _load_protocol_parameter_candidates(path_str: str) -> list[dict[str, str]]:
    path = Path(path_str)
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_protocol_parameter_candidates() -> list[dict[str, str]]:
    return _load_protocol_parameter_candidates(str(_bundle_file("protocol_parameter_candidates.csv")))


@lru_cache(maxsize=8)
def _load_exact_protocols(path_str: str) -> list[dict[str, str]]:
    path = Path(path_str)
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_exact_protocols() -> list[dict[str, str]]:
    return _load_exact_protocols(str(_bundle_file("top_condition_exact_protocols.csv")))


@lru_cache(maxsize=8)
def _load_contraindication_safety_schema(path_str: str) -> list[dict[str, str]]:
    path = Path(path_str)
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_contraindication_safety_schema() -> list[dict[str, str]]:
    return _load_contraindication_safety_schema(str(_bundle_file("contraindication_safety_schema.csv")))


def research_summary() -> dict:
    kb = load_top_condition_knowledge_base()
    manifest = load_manifest()
    return {
        "bundle_root": bundle_root(),
        "available": bool(manifest),
        "manifest": manifest,
        "condition_count": len(kb),
        "conditions": sorted(kb),
    }


def list_condition_knowledge() -> list[dict]:
    kb = load_top_condition_knowledge_base()
    items = []
    for slug, payload in kb.items():
        items.append(
            {
                "condition_slug": slug,
                "condition_label": payload.get("condition_label", slug),
                "research_paper_count": payload.get("research_paper_count", 0),
                "priority_modalities": payload.get("priority_modalities", []),
                "top_safety_signals": payload.get("top_safety_signals", [])[:5],
            }
        )
    return sorted(items, key=lambda item: item["research_paper_count"], reverse=True)


def get_condition_knowledge(slug: str) -> dict | None:
    return load_top_condition_knowledge_base().get(slug)


def list_protocol_candidates(condition_slug: str | None = None, limit: int = 50) -> list[dict[str, str]]:
    rows = load_protocol_parameter_candidates()
    if condition_slug:
        rows = [row for row in rows if row.get("condition_slug") == condition_slug]
    return rows[:limit]


def list_exact_protocols(condition_slug: str | None = None, limit: int = 50) -> list[dict[str, str]]:
    rows = load_exact_protocols()
    if condition_slug:
        rows = [row for row in rows if row.get("condition_slug") == condition_slug]
    return rows[:limit]


def list_safety_schema(condition_slug: str | None = None, limit: int = 100) -> list[dict[str, str]]:
    rows = load_contraindication_safety_schema()
    if condition_slug:
        rows = [row for row in rows if row.get("condition_slug") == condition_slug]
    return rows[:limit]


_CSV_BUNDLE_ENV = "DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT"
_CSV_DATASETS: dict[str, dict[str, str]] = {
    "master_enriched": {
        "relative_path": "neuromodulation_master_database_enriched.csv",
        "label": "Enriched master database",
        "description": "Primary paper-level neuromodulation database enriched with abstracts, outcomes, trials, regulatory signals, summaries, and ranking metadata.",
        "required": "false",
    },
    "master": {
        "relative_path": "raw/neuromodulation_all_papers_master.csv",
        "label": "Unified raw corpus",
        "description": "Deduplicated master corpus across broad and modality-specific searches.",
        "required": "true",
    },
    "ai_ingestion": {
        "relative_path": "derived/neuromodulation_ai_ingestion_dataset.csv",
        "label": "AI ingestion dataset",
        "description": "Normalized paper-level dataset with modality, indication, and protocol features.",
        "required": "true",
    },
    "evidence_graph": {
        "relative_path": "derived/neuromodulation_evidence_graph.csv",
        "label": "Evidence graph",
        "description": "Aggregated indication-to-modality-to-target evidence links.",
        "required": "true",
    },
    "protocol_templates": {
        "relative_path": "derived/neuromodulation_protocol_template_candidates.csv",
        "label": "Protocol template candidates",
        "description": "Ranked candidate protocol templates by indication, modality, and target.",
        "required": "true",
    },
    "safety_signals": {
        "relative_path": "derived/neuromodulation_safety_contraindication_signals.csv",
        "label": "Safety and contraindication signals",
        "description": "Paper-level safety and contraindication signal rows.",
        "required": "true",
    },
    "indication_summary": {
        "relative_path": "derived/neuromodulation_indication_modality_summary.csv",
        "label": "Indication summary",
        "description": "Rollup summary by indication and modality.",
        "required": "true",
    },
    "condition_knowledge": {
        "relative_path": "top_condition_knowledge_base.json",
        "label": "Condition knowledge base",
        "description": "Priority-condition knowledge base derived from the research bundle.",
        "required": "true",
    },
    "exact_protocols": {
        "relative_path": "top_condition_exact_protocols.csv",
        "label": "Exact top-condition protocols",
        "description": "Curated exact protocol rows layered with research support signals.",
        "required": "true",
    },
    "protocol_parameter_candidates": {
        "relative_path": "protocol_parameter_candidates.csv",
        "label": "Protocol parameter candidates",
        "description": "Paper-level candidate rows useful for protocol extraction and review.",
        "required": "true",
    },
    "contraindication_safety_schema": {
        "relative_path": "contraindication_safety_schema.csv",
        "label": "Contraindication and safety schema",
        "description": "Normalized safety and contraindication rows for top-priority conditions.",
        "required": "true",
    },
    "europepmc_abstracts": {
        "relative_path": "derived/neuromodulation_europepmc_abstracts.csv",
        "label": "Europe PMC abstracts",
        "description": "Abstract backfill results from Europe PMC keyed to the AI-ingestion dataset.",
        "required": "false",
    },
    "clinical_trials": {
        "relative_path": "derived/neuromodulation_clinical_trials.csv",
        "label": "ClinicalTrials.gov metadata",
        "description": "Condition-modality matched ClinicalTrials.gov trial metadata for the neuromodulation bundle.",
        "required": "false",
    },
    "fda_510k_devices": {
        "relative_path": "derived/neuromodulation_fda_510k_devices.csv",
        "label": "FDA 510(k) device records",
        "description": "Matched FDA 510(k) device records for relevant neuromodulation modalities.",
        "required": "false",
    },
    "condition_mentions": {
        "relative_path": "derived/neuromodulation_condition_mentions.csv",
        "label": "Condition mentions",
        "description": "Rule-based NLP condition extraction from titles and Europe PMC abstracts.",
        "required": "false",
    },
    "patient_outcomes": {
        "relative_path": "derived/neuromodulation_patient_outcomes.csv",
        "label": "Patient outcomes",
        "description": "Paper-level outcome snippets and real-world-evidence flags derived from abstracts.",
        "required": "false",
    },
    "adjunct_evidence": {
        "relative_path": "derived/neuromodulation_adjunct_evidence.csv",
        "label": "Adjunct biomarker / nutrition / medication evidence",
        "description": "Paper-level evidence slice linking labs, biomarkers, medications, supplements, vitamins, and diet topics to neuromodulation-relevant conditions and protocols.",
        "required": "false",
    },
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _csv_bundle_candidates() -> list[Path]:
    candidates: list[Path] = []
    override = os.getenv(_CSV_BUNDLE_ENV, "").strip() or os.getenv("DEEPSYNAPS_RESEARCH_BUNDLE_ROOT", "").strip()
    if override:
        candidates.append(Path(override).expanduser())

    candidates.append(_repo_root() / "data" / "research" / "neuromodulation")
    candidates.append(_repo_root() / "data" / "neuromodulation-research")

    desktop = Path.home() / "Desktop"
    if desktop.exists():
        bundles = sorted(
            desktop.glob("neuromodulation_research_bundle_*"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        candidates.extend(bundles)
    return candidates


def bundle_root_or_none() -> Path | None:
    explicit = os.getenv(_CSV_BUNDLE_ENV, "").strip() or os.getenv("DEEPSYNAPS_RESEARCH_BUNDLE_ROOT", "").strip()
    if explicit:
        explicit_path = Path(explicit).expanduser()
        if explicit_path.exists() and explicit_path.is_dir():
            return explicit_path
        return None
    for candidate in _csv_bundle_candidates():
        if candidate.exists() and candidate.is_dir():
            required = [meta for meta in _CSV_DATASETS.values() if meta.get("required", "true") == "true"]
            if all(_resolve_dataset_file(candidate, meta["relative_path"]).exists() for meta in required):
                return candidate
    return None


def require_bundle_root() -> Path:
    root = bundle_root_or_none()
    if root is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Neuromodulation research bundle not found. Set "
                f"{_CSV_BUNDLE_ENV} or place the CSV bundle under data/neuromodulation-research."
            ),
        )
    return root


def dataset_keys() -> list[str]:
    return list(_CSV_DATASETS.keys())


def dataset_path(dataset_key: str) -> Path:
    meta = _CSV_DATASETS.get(dataset_key)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"unknown research dataset: {dataset_key}")
    return _resolve_dataset_file(require_bundle_root(), meta["relative_path"])


def _resolve_dataset_file(root: Path, relative_path: str) -> Path:
    nested = root / relative_path
    if nested.exists():
        return nested
    return root / Path(relative_path).name


def _stat_signature(path: Path) -> tuple[str, int, int]:
    stat = path.stat()
    return (str(path), stat.st_mtime_ns, stat.st_size)


@lru_cache(maxsize=64)
def _row_count_cached(path_str: str, mtime_ns: int, size: int) -> int:
    del mtime_ns, size
    with open(path_str, newline="", encoding="utf-8") as handle:
        total = sum(1 for _ in handle)
    return max(total - 1, 0)


def _row_count(path: Path) -> int:
    return _row_count_cached(*_stat_signature(path))


# Re-export shim — see docs/adr/0009-registry-packages.md.
# _csv_reader moved to packages/clinical-data-registry; this binding keeps
# the existing local call sites in this module (search_ranked_papers,
# search_ai_ingestion, list_protocol_templates, list_evidence_graph,
# list_safety_signals, build_research_summary, list_protocol_coverage)
# working unchanged. The shim disappears in PR-C.
from clinical_data_registry import _csv_reader  # noqa: E402,F401


def list_datasets() -> list[dict[str, Any]]:
    root = require_bundle_root()
    items: list[dict[str, Any]] = []
    for key, meta in _CSV_DATASETS.items():
        path = _resolve_dataset_file(root, meta["relative_path"])
        if not path.exists():
            if meta.get("required", "true") == "true":
                raise HTTPException(status_code=503, detail=f"required research dataset missing: {path.name}")
            continue
        stat = path.stat()
        items.append(
            {
                "key": key,
                "label": meta["label"],
                "description": meta["description"],
                "filename": path.name,
                "relative_path": meta["relative_path"],
                "path": str(path),
                "rows": _row_count(path),
                "size_bytes": stat.st_size,
                "modified_at": stat.st_mtime,
            }
        )
    return items


def research_health() -> dict[str, Any]:
    root = require_bundle_root()
    datasets = list_datasets()
    return {
        "ok": True,
        "bundle_root": str(root),
        "dataset_count": len(datasets),
        "datasets": datasets,
    }


def _to_int(value: str | None, default: int = 0) -> int:
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _tokenize(value: str | None) -> list[str]:
    if not value:
        return []
    normalized = value.replace("|", ";").replace(",", ";")
    return [item.strip().lower() for item in normalized.split(";") if item.strip()]


def _contains_filter(value: str | None, expected: str | None) -> bool:
    if not expected:
        return True
    expected_norm = expected.strip().lower()
    if not expected_norm:
        return True
    if not value:
        return False
    hay = value.lower()
    if expected_norm in hay:
        return True
    return expected_norm in _tokenize(value)


def _push_top(heap: list[tuple[tuple, str, dict[str, Any]]], rank: tuple, row: dict[str, Any], limit: int) -> None:
    tiebreak = str(row.get("paper_key") or row.get("nct_id") or row.get("clearance_number") or row.get("title") or "")
    item = (rank, tiebreak, row)
    if len(heap) < limit:
        heappush(heap, item)
        return
    if heap[0][:2] < item[:2]:
        heappop(heap)
        heappush(heap, item)


def _dataset_path_if_present(dataset_key: str) -> Path | None:
    meta = _CSV_DATASETS.get(dataset_key)
    if meta is None:
        return None
    root = require_bundle_root()
    path = _resolve_dataset_file(root, meta["relative_path"])
    return path if path.exists() else None


def _to_bool_flag(value: str | None) -> bool:
    return (value or "").strip().upper() in {"Y", "YES", "TRUE", "1"}


def _tier_weight(value: str | None) -> int:
    return {
        "high": 5,
        "moderate_high": 4,
        "moderate": 3,
        "contextual": 2,
        "unspecified": 1,
        "preclinical": 0,
    }.get((value or "").strip().lower(), 0)


def _text_search_matches(row: dict[str, str], query: str) -> bool:
    haystack = " ".join(
        [
            row.get("title", ""),
            row.get("research_summary", ""),
            row.get("abstract", ""),
            row.get("ai_ingestion_text", ""),
            row.get("matched_query_terms", ""),
            row.get("journal", ""),
            row.get("journal_normalized", ""),
            row.get("authors", ""),
            row.get("authors_normalized", ""),
        ]
    ).lower()
    return query in haystack


def _text_search_matches_any(row: dict[str, str], terms: list[str]) -> bool:
    if not terms:
        return True
    haystack = " ".join(
        [
            row.get("title", ""),
            row.get("research_summary", ""),
            row.get("abstract", ""),
            row.get("ai_ingestion_text", ""),
            row.get("adjunct_topic_labels", ""),
            row.get("adjunct_terms", ""),
            row.get("adjunct_domains", ""),
            row.get("condition_mentions_top", ""),
            row.get("journal", ""),
            row.get("journal_normalized", ""),
            row.get("authors", ""),
        ]
    ).lower()
    return any(term in haystack for term in terms if term)


def _slugify_label(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    pieces: list[str] = []
    for ch in raw:
        pieces.append(ch if ch.isalnum() else "_")
    slug = "".join(pieces)
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_")


def _ranking_tuple(row: dict[str, Any], ranking_mode: str) -> tuple[int, int, int, int, int, int]:
    confidence = _to_int(str(row.get("paper_confidence_score")))
    priority = _to_int(str(row.get("priority_score")))
    citations = _to_int(str(row.get("citation_count")))
    year = _to_int(str(row.get("year")))
    _to_int(str(row.get("trial_match_count")))
    _to_int(str(row.get("fda_match_count")))
    trial_signal = _to_int(str(row.get("trial_signal_score")))
    fda_signal = _to_int(str(row.get("fda_signal_score")))
    real_world = 1 if row.get("real_world_evidence_flag") else 0
    evidence_weight = _tier_weight(row.get("evidence_tier"))
    outcomes = _to_int(str(row.get("outcome_snippet_count")))
    journal_present = 1 if row.get("journal") else 0

    if ranking_mode == "clinical":
        return (priority, confidence, trial_signal + fda_signal, real_world, year, citations)
    if ranking_mode == "safety":
        safety_signal = 1 if row.get("safety_signal_tags") or row.get("contraindication_signal_tags") else 0
        return (safety_signal, confidence, outcomes, year, citations, priority)
    if ranking_mode == "regulatory":
        return (fda_signal, trial_signal, priority, confidence, year, citations)
    if ranking_mode == "recent":
        return (year, confidence, priority, trial_signal, citations, journal_present)
    return (confidence, priority, evidence_weight, citations, year, real_world)


def search_ranked_papers(
    *,
    q: str | None = None,
    modality: str | None = None,
    indication: str | None = None,
    target: str | None = None,
    study_type: str | None = None,
    evidence_tier: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    open_access_only: bool = False,
    min_confidence: int | None = None,
    min_priority: int | None = None,
    real_world_only: bool = False,
    with_trial_signal: bool = False,
    with_fda_signal: bool = False,
    ranking_mode: str = "best",
    limit: int = 20,
) -> list[dict[str, Any]]:
    enriched_path = _dataset_path_if_present("master_enriched")
    if enriched_path is None:
        return search_ai_ingestion(
            q=q,
            modality=modality,
            indication=indication,
            study_type=study_type,
            evidence_tier=evidence_tier,
            year_min=year_min,
            year_max=year_max,
            open_access_only=open_access_only,
            limit=limit,
        )

    query = (q or "").strip().lower()
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(enriched_path)
    try:
        for row in reader:
            year = _to_int(row.get("year"), default=-1)
            if year_min is not None and year < year_min:
                continue
            if year_max is not None and year > year_max:
                continue
            if open_access_only and not _to_bool_flag(row.get("is_open_access")):
                continue
            if min_confidence is not None and _to_int(row.get("paper_confidence_score")) < min_confidence:
                continue
            if min_priority is not None and _to_int(row.get("priority_score")) < min_priority:
                continue
            if real_world_only and not _to_bool_flag(row.get("real_world_evidence_flag")):
                continue
            if with_trial_signal and _to_int(row.get("trial_signal_score")) <= 0:
                continue
            if with_fda_signal and _to_int(row.get("fda_signal_score")) <= 0:
                continue
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            if not _contains_filter(row.get("target_tags"), target):
                continue
            if not _contains_filter(row.get("study_type_normalized"), study_type):
                continue
            if not _contains_filter(row.get("evidence_tier"), evidence_tier):
                continue
            if query and not _text_search_matches(row, query):
                continue

            out = {
                "paper_key": row.get("paper_key") or None,
                "title": row.get("title") or None,
                "authors": row.get("authors") or None,
                "journal": row.get("journal_normalized") or row.get("journal") or None,
                "year": year if year >= 0 else None,
                "doi": row.get("doi") or None,
                "pmid": row.get("pmid") or None,
                "pmcid": row.get("pmcid") or None,
                "primary_modality": row.get("primary_modality") or None,
                "canonical_modalities": _tokenize(row.get("canonical_modalities")),
                "indication_tags": _tokenize(row.get("indication_tags")),
                "population_tags": _tokenize(row.get("population_tags")),
                "target_tags": _tokenize(row.get("target_tags")),
                "parameter_signal_tags": _tokenize(row.get("parameter_signal_tags")),
                "study_type_normalized": row.get("study_type_normalized") or None,
                "evidence_tier": row.get("evidence_tier") or None,
                "protocol_relevance_score": _to_int(row.get("protocol_relevance_score")),
                "citation_count": _to_int(row.get("cited_by_count")),
                "open_access_flag": _to_bool_flag(row.get("is_open_access")),
                "record_url": row.get("record_url") or None,
                "source_exports": _tokenize(row.get("source_exports")),
                "research_summary": row.get("research_summary") or None,
                "abstract_status": row.get("abstract_status") or None,
                "paper_confidence_score": _to_int(row.get("paper_confidence_score")),
                "priority_score": _to_int(row.get("priority_score")),
                "trial_match_count": _to_int(row.get("trial_match_count")),
                "fda_match_count": _to_int(row.get("fda_match_count")),
                "trial_signal_score": _to_int(row.get("trial_signal_score")),
                "fda_signal_score": _to_int(row.get("fda_signal_score")),
                "real_world_evidence_flag": _to_bool_flag(row.get("real_world_evidence_flag")),
                "outcome_snippet_count": _to_int(row.get("outcome_snippet_count")),
                "trial_protocol_parameter_summary": row.get("trial_protocol_parameter_summary") or None,
                "regulatory_clinical_signal": row.get("regulatory_clinical_signal") or None,
                "ranking_mode": ranking_mode,
            }
            _push_top(heap, _ranking_tuple(out, ranking_mode), out, limit)
    finally:
        handle.close()

    return [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]


def search_ai_ingestion(
    *,
    q: str | None = None,
    modality: str | None = None,
    indication: str | None = None,
    study_type: str | None = None,
    evidence_tier: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    open_access_only: bool = False,
    limit: int = 20,
) -> list[dict[str, Any]]:
    path = dataset_path("ai_ingestion")
    query = (q or "").strip().lower()
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            year = _to_int(row.get("year"), default=-1)
            if year_min is not None and year < year_min:
                continue
            if year_max is not None and year > year_max:
                continue
            if open_access_only and (row.get("open_access_flag") or "").upper() != "Y":
                continue
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            if not _contains_filter(row.get("study_type_normalized"), study_type):
                continue
            if not _contains_filter(row.get("evidence_tier"), evidence_tier):
                continue
            if query:
                haystack = " ".join(
                    [
                        row.get("title", ""),
                        row.get("ai_ingestion_text", ""),
                        row.get("matched_query_terms", ""),
                    ]
                ).lower()
                if query not in haystack:
                    continue

            out = {
                "paper_key": row.get("paper_key"),
                "title": row.get("title"),
                "authors": row.get("authors"),
                "journal": row.get("journal"),
                "year": year if year >= 0 else None,
                "doi": row.get("doi") or None,
                "pmid": row.get("pmid") or None,
                "pmcid": row.get("pmcid") or None,
                "primary_modality": row.get("primary_modality") or None,
                "canonical_modalities": _tokenize(row.get("canonical_modalities")),
                "indication_tags": _tokenize(row.get("indication_tags")),
                "population_tags": _tokenize(row.get("population_tags")),
                "target_tags": _tokenize(row.get("target_tags")),
                "parameter_signal_tags": _tokenize(row.get("parameter_signal_tags")),
                "study_type_normalized": row.get("study_type_normalized") or None,
                "evidence_tier": row.get("evidence_tier") or None,
                "protocol_relevance_score": _to_int(row.get("protocol_relevance_score")),
                "citation_count": _to_int(row.get("citation_count")),
                "open_access_flag": (row.get("open_access_flag") or "").upper() == "Y",
                "record_url": row.get("record_url") or None,
                "source_exports": _tokenize(row.get("source_exports")),
            }
            _push_top(
                heap,
                (out["protocol_relevance_score"], out["citation_count"], out["year"] or 0),
                out,
                limit,
            )
    finally:
        handle.close()

    return [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]


def list_protocol_templates(
    *,
    indication: str | None = None,
    modality: str | None = None,
    invasiveness: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    path = dataset_path("protocol_templates")
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            if not _contains_filter(row.get("indication"), indication):
                continue
            if not _contains_filter(row.get("modality"), modality):
                continue
            if not _contains_filter(row.get("invasiveness"), invasiveness):
                continue

            out = {
                "modality": row.get("modality") or None,
                "indication": row.get("indication") or None,
                "target": row.get("target") or None,
                "invasiveness": row.get("invasiveness") or None,
                "paper_count": _to_int(row.get("paper_count")),
                "citation_sum": _to_int(row.get("citation_sum")),
                "template_support_score": _to_int(row.get("template_support_score")),
                "top_study_types": row.get("top_study_types") or "",
                "top_parameter_tags": row.get("top_parameter_tags") or "",
                "top_population_tags": row.get("top_population_tags") or "",
                "top_safety_tags": row.get("top_safety_tags") or "",
                "example_titles": row.get("example_titles") or "",
            }
            _push_top(heap, (out["template_support_score"], out["paper_count"]), out, limit)
    finally:
        handle.close()

    return [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]


def list_evidence_graph(
    *,
    indication: str | None = None,
    modality: str | None = None,
    target: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    path = dataset_path("evidence_graph")
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            if not _contains_filter(row.get("indication"), indication):
                continue
            if not _contains_filter(row.get("modality"), modality):
                continue
            if not _contains_filter(row.get("target"), target):
                continue

            out = {
                "indication": row.get("indication") or None,
                "modality": row.get("modality") or None,
                "target": row.get("target") or None,
                "paper_count": _to_int(row.get("paper_count")),
                "citation_sum": _to_int(row.get("citation_sum")),
                "evidence_weight_sum": _to_int(row.get("evidence_weight_sum")),
                "mean_citations_per_paper": float(row.get("mean_citations_per_paper") or 0.0),
                "top_study_types": row.get("top_study_types") or "",
                "top_parameter_tags": row.get("top_parameter_tags") or "",
                "top_safety_tags": row.get("top_safety_tags") or "",
                "open_access_count": _to_int(row.get("open_access_count")),
                "year_min": _to_int(row.get("year_min"), default=0) or None,
                "year_max": _to_int(row.get("year_max"), default=0) or None,
            }
            _push_top(heap, (out["evidence_weight_sum"], out["paper_count"]), out, limit)
    finally:
        handle.close()

    return [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]


def list_safety_signals(
    *,
    indication: str | None = None,
    modality: str | None = None,
    safety_tag: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    path = dataset_path("safety_signals")
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            if not _contains_filter(
                f"{row.get('safety_signal_tags', '')};{row.get('contraindication_signal_tags', '')}",
                safety_tag,
            ):
                continue

            out = {
                "paper_key": row.get("paper_key"),
                "title": row.get("title"),
                "year": _to_int(row.get("year"), default=0) or None,
                "primary_modality": row.get("primary_modality") or None,
                "canonical_modalities": _tokenize(row.get("canonical_modalities")),
                "indication_tags": _tokenize(row.get("indication_tags")),
                "study_type_normalized": row.get("study_type_normalized") or None,
                "evidence_tier": row.get("evidence_tier") or None,
                "safety_signal_tags": _tokenize(row.get("safety_signal_tags")),
                "contraindication_signal_tags": _tokenize(row.get("contraindication_signal_tags")),
                "population_tags": _tokenize(row.get("population_tags")),
                "target_tags": _tokenize(row.get("target_tags")),
                "parameter_signal_tags": _tokenize(row.get("parameter_signal_tags")),
                "record_url": row.get("record_url") or None,
            }
            _push_top(
                heap,
                (_to_int(row.get("year")), len(out["safety_signal_tags"]) + len(out["contraindication_signal_tags"])),
                out,
                limit,
            )
    finally:
        handle.close()

    return [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]


def build_research_summary(
    *,
    indication: str | None = None,
    modality: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    path = dataset_path("ai_ingestion")
    total_papers = 0
    open_access_papers = 0
    evidence_counter: Counter[str] = Counter()
    study_counter: Counter[str] = Counter()
    modality_counter: Counter[str] = Counter()
    indication_counter: Counter[str] = Counter()

    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            total_papers += 1
            if (row.get("open_access_flag") or "").upper() == "Y":
                open_access_papers += 1
            evidence_counter[row.get("evidence_tier") or "unspecified"] += 1
            study_counter[row.get("study_type_normalized") or "other"] += 1
            for item in _tokenize(row.get("canonical_modalities")) or _tokenize(row.get("primary_modality")):
                modality_counter[item] += 1
            for item in _tokenize(row.get("indication_tags")):
                indication_counter[item] += 1
    finally:
        handle.close()

    top_graph = list_evidence_graph(indication=indication, modality=modality, limit=limit)
    top_templates = list_protocol_templates(indication=indication, modality=modality, limit=limit)
    recent_safety = list_safety_signals(indication=indication, modality=modality, limit=limit)

    safety_counter: Counter[str] = Counter()
    safety_handle, safety_reader = _csv_reader(dataset_path("safety_signals"))
    try:
        for row in safety_reader:
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            for tag in _tokenize(row.get("safety_signal_tags")):
                safety_counter[tag] += 1
            for tag in _tokenize(row.get("contraindication_signal_tags")):
                safety_counter[tag] += 1
    finally:
        safety_handle.close()

    return {
        "filters": {"indication": indication, "modality": modality},
        "paper_count": total_papers,
        "open_access_paper_count": open_access_papers,
        "top_evidence_tiers": [{"key": key, "count": count} for key, count in evidence_counter.most_common(limit)],
        "top_study_types": [{"key": key, "count": count} for key, count in study_counter.most_common(limit)],
        "top_modalities": [{"key": key, "count": count} for key, count in modality_counter.most_common(limit)],
        "top_indications": [{"key": key, "count": count} for key, count in indication_counter.most_common(limit)],
        "top_safety_tags": [{"key": key, "count": count} for key, count in safety_counter.most_common(limit)],
        "top_evidence_links": top_graph,
        "top_protocol_templates": top_templates,
        "recent_safety_signals": recent_safety,
    }


def list_protocol_coverage(limit: int = 50) -> dict[str, Any]:
    path = dataset_path("indication_summary")
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            indication = row.get("indication") or ""
            modality = row.get("modality") or ""
            if not indication or not modality:
                continue

            paper_count = _to_int(row.get("paper_count"))
            evidence_weight = _to_int(row.get("evidence_weight_sum"))
            citation_sum = _to_int(row.get("citation_sum"))
            coverage = min(100, paper_count // 2 + evidence_weight // 8)
            gap = "None"
            if paper_count < 10:
                gap = "Low paper coverage"
            elif evidence_weight < 25:
                gap = "Thin high-tier support"
            elif citation_sum < 100:
                gap = "Low citation depth"

            payload = {
                "id": f"{_slugify_label(indication)}::{_slugify_label(modality)}",
                "condition": indication.replace("_", " ").title(),
                "modality": modality.replace("_", " ").title(),
                "coverage": coverage,
                "gap": gap,
                "reviewed": "Live bundle",
                "paper_count": paper_count,
                "evidence_weight_sum": evidence_weight,
                "citation_sum": citation_sum,
                "top_targets": row.get("top_targets") or "",
                "top_parameter_tags": row.get("top_parameter_tags") or "",
                "top_study_types": row.get("top_study_types") or "",
            }
            _push_top(heap, (coverage, evidence_weight, citation_sum, paper_count), payload, limit)
    finally:
        handle.close()

    rows = [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]
    return {"rows": rows, "generated_from": path.name, "total": len(rows)}


def search_adjunct_evidence(
    *,
    q: str | None = None,
    domain: str | None = None,
    topic: str | None = None,
    indication: str | None = None,
    modality: str | None = None,
    evidence_tier: str | None = None,
    medication_risk_tier: str | None = None,
    year_min: int | None = None,
    year_max: int | None = None,
    limit: int = 20,
    terms: list[str] | None = None,
) -> list[dict[str, Any]]:
    path = _dataset_path_if_present("adjunct_evidence")
    if path is None:
        return []

    query = (q or "").strip().lower()
    search_terms = [item.strip().lower() for item in (terms or []) if item and item.strip()]
    heap: list[tuple[tuple, str, dict[str, Any]]] = []
    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            year = _to_int(row.get("year"), default=-1)
            if year_min is not None and year < year_min:
                continue
            if year_max is not None and year > year_max:
                continue
            if not _contains_filter(row.get("adjunct_domains"), domain):
                continue
            if not _contains_filter(
                f"{row.get('adjunct_topic_keys', '')};{row.get('adjunct_topic_labels', '')};{row.get('adjunct_terms', '')}",
                topic,
            ):
                continue
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            if not _contains_filter(row.get("evidence_tier"), evidence_tier):
                continue
            if not _contains_filter(row.get("medication_risk_tier"), medication_risk_tier):
                continue
            if query and not _text_search_matches(row, query):
                continue
            if search_terms and not _text_search_matches_any(row, search_terms):
                continue

            out = {
                "paper_key": row.get("paper_key") or None,
                "title": row.get("title") or None,
                "authors": row.get("authors") or None,
                "journal": row.get("journal_normalized") or row.get("journal") or None,
                "year": year if year >= 0 else None,
                "doi": row.get("doi") or None,
                "pmid": row.get("pmid") or None,
                "pmcid": row.get("pmcid") or None,
                "primary_modality": row.get("primary_modality") or None,
                "canonical_modalities": _tokenize(row.get("canonical_modalities")),
                "indication_tags": _tokenize(row.get("indication_tags")),
                "study_type_normalized": row.get("study_type_normalized") or None,
                "evidence_tier": row.get("evidence_tier") or None,
                "paper_confidence_score": _to_int(row.get("paper_confidence_score")),
                "priority_score": _to_int(row.get("priority_score")),
                "citation_count": _to_int(row.get("citation_count") or row.get("cited_by_count")),
                "record_url": row.get("record_url") or None,
                "research_summary": row.get("research_summary") or None,
                "adjunct_domains": _tokenize(row.get("adjunct_domains")),
                "adjunct_topic_keys": _tokenize(row.get("adjunct_topic_keys")),
                "adjunct_topic_labels": [item.strip() for item in (row.get("adjunct_topic_labels") or "").split(";") if item.strip()],
                "adjunct_terms": [item.strip() for item in (row.get("adjunct_terms") or "").split(";") if item.strip()],
                "condition_mentions_top": [item.strip() for item in (row.get("condition_mentions_top") or "").split(";") if item.strip()],
                "relation_signal_tags": _tokenize(row.get("relation_signal_tags")),
                "medication_risk_tier": row.get("medication_risk_tier") or None,
                "medication_risk_reason": row.get("medication_risk_reason") or None,
                "medication_risk_signal_tags": _tokenize(row.get("medication_risk_signal_tags")),
                "ranking_mode": "adjunct",
            }
            _push_top(
                heap,
                (
                    out["paper_confidence_score"],
                    out["priority_score"],
                    out["citation_count"],
                    out["year"] or 0,
                    len(out["adjunct_topic_keys"]),
                    len(out["relation_signal_tags"]),
                ),
                out,
                limit,
            )
    finally:
        handle.close()

    return [row for _, _, row in sorted(heap, key=lambda item: (item[0], item[1]), reverse=True)]


def build_adjunct_evidence_summary(
    *,
    domain: str | None = None,
    indication: str | None = None,
    modality: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    path = _dataset_path_if_present("adjunct_evidence")
    if path is None:
        return {
            "filters": {"domain": domain, "indication": indication, "modality": modality},
            "paper_count": 0,
            "top_domains": [],
            "top_topics": [],
            "top_indications": [],
            "top_modalities": [],
            "top_relation_signal_tags": [],
            "top_medication_risk_tiers": [],
            "top_papers": [],
        }

    total_papers = 0
    domain_counter: Counter[str] = Counter()
    topic_counter: Counter[str] = Counter()
    indication_counter: Counter[str] = Counter()
    modality_counter: Counter[str] = Counter()
    relation_counter: Counter[str] = Counter()
    medication_risk_counter: Counter[str] = Counter()

    handle, reader = _csv_reader(path)
    try:
        for row in reader:
            if not _contains_filter(row.get("adjunct_domains"), domain):
                continue
            if not _contains_filter(row.get("indication_tags"), indication):
                continue
            if not _contains_filter(
                f"{row.get('canonical_modalities', '')};{row.get('primary_modality', '')}",
                modality,
            ):
                continue
            total_papers += 1
            for item in _tokenize(row.get("adjunct_domains")):
                domain_counter[item] += 1
            for item in [v.strip() for v in (row.get("adjunct_topic_labels") or "").split(";") if v.strip()]:
                topic_counter[item] += 1
            for item in _tokenize(row.get("indication_tags")):
                indication_counter[item] += 1
            for item in _tokenize(row.get("canonical_modalities")) or _tokenize(row.get("primary_modality")):
                modality_counter[item] += 1
            for item in _tokenize(row.get("relation_signal_tags")):
                relation_counter[item] += 1
            if row.get("medication_risk_tier"):
                medication_risk_counter[row["medication_risk_tier"]] += 1
    finally:
        handle.close()

    return {
        "filters": {"domain": domain, "indication": indication, "modality": modality},
        "paper_count": total_papers,
        "top_domains": [{"key": key, "count": count} for key, count in domain_counter.most_common(limit)],
        "top_topics": [{"key": key, "count": count} for key, count in topic_counter.most_common(limit)],
        "top_indications": [{"key": key, "count": count} for key, count in indication_counter.most_common(limit)],
        "top_modalities": [{"key": key, "count": count} for key, count in modality_counter.most_common(limit)],
        "top_relation_signal_tags": [{"key": key, "count": count} for key, count in relation_counter.most_common(limit)],
        "top_medication_risk_tiers": [{"key": key, "count": count} for key, count in medication_risk_counter.most_common(limit)],
        "top_papers": search_adjunct_evidence(domain=domain, indication=indication, modality=modality, limit=limit),
    }

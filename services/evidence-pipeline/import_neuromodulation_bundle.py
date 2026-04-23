"""Stage and import the repo-local neuromodulation research bundle.

This script does two things:
1. Copies the generated Desktop bundle into `data/research/neuromodulation`.
2. Imports the staged CSVs into the SQLite evidence database.

Usage:
    python3 import_neuromodulation_bundle.py --stage
    python3 import_neuromodulation_bundle.py --import-db
    python3 import_neuromodulation_bundle.py --stage --import-db
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db
from neuromodulation_enrichment import build_enrichment_bundle


PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_DIR.parent.parent
DEFAULT_SOURCE_BUNDLE = Path.home() / "Desktop" / "neuromodulation_research_bundle_2026-04-22"
TARGET_ROOT = REPO_ROOT / "data" / "research" / "neuromodulation"

ASSETS = {
    "raw/neuromodulation_papers_europepmc.csv": "raw",
    "raw/neuromodulation_papers_modalities_europepmc.csv": "raw",
    "raw/neuromodulation_all_papers_master.csv": "raw",
    "derived/neuromodulation_ai_ingestion_dataset.csv": "derived",
    "derived/neuromodulation_evidence_graph.csv": "derived",
    "derived/neuromodulation_protocol_template_candidates.csv": "derived",
    "derived/neuromodulation_safety_contraindication_signals.csv": "derived",
    "derived/neuromodulation_indication_modality_summary.csv": "derived",
    "derived/neuromodulation_modalities_summary.csv": "derived",
    "scripts/build_neuromodulation_master_and_ai_dataset.py": "script",
    "scripts/derive_neuromodulation_clinic_outputs.py": "script",
    "scripts/export_neuromodulation_europepmc.py": "script",
    "scripts/export_neuromodulation_modalities_europepmc.py": "script",
}

FRESH_SCHEMA_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_pmcid_unique
  ON papers(pmcid) WHERE pmcid IS NOT NULL AND pmcid != '';
CREATE INDEX IF NOT EXISTS idx_papers_europepmc_id ON papers(europepmc_id);
CREATE TABLE IF NOT EXISTS neuromodulation_paper_profiles (
  paper_id                 INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  paper_key                TEXT UNIQUE NOT NULL,
  title_normalized         TEXT,
  source                   TEXT,
  study_type_normalized    TEXT,
  evidence_tier            TEXT,
  canonical_modalities     TEXT,
  primary_modality         TEXT,
  invasiveness             TEXT,
  indication_tags          TEXT,
  population_tags          TEXT,
  target_tags              TEXT,
  parameter_signal_tags    TEXT,
  protocol_relevance_score REAL,
  matched_query_terms      TEXT,
  source_exports           TEXT,
  record_url               TEXT,
  ai_ingestion_text        TEXT,
  open_access_flag         INTEGER,
  citation_count           INTEGER,
  imported_at              TEXT
);
CREATE INDEX IF NOT EXISTS idx_neuro_profiles_primary_modality
  ON neuromodulation_paper_profiles(primary_modality);
CREATE INDEX IF NOT EXISTS idx_neuro_profiles_evidence_tier
  ON neuromodulation_paper_profiles(evidence_tier);
CREATE TABLE IF NOT EXISTS neuromodulation_safety_signals (
  paper_id                       INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  paper_key                      TEXT UNIQUE NOT NULL,
  year                           INTEGER,
  title                          TEXT,
  primary_modality               TEXT,
  canonical_modalities           TEXT,
  indication_tags                TEXT,
  study_type_normalized          TEXT,
  evidence_tier                  TEXT,
  safety_signal_tags             TEXT,
  contraindication_signal_tags   TEXT,
  population_tags                TEXT,
  target_tags                    TEXT,
  parameter_signal_tags          TEXT,
  record_url                     TEXT,
  imported_at                    TEXT
);
CREATE TABLE IF NOT EXISTS neuromodulation_evidence_graph (
  indication                TEXT NOT NULL,
  modality                  TEXT NOT NULL,
  target                    TEXT NOT NULL,
  paper_count               INTEGER,
  citation_sum              INTEGER,
  evidence_weight_sum       REAL,
  mean_citations_per_paper  REAL,
  top_study_types           TEXT,
  top_parameter_tags        TEXT,
  top_safety_tags           TEXT,
  open_access_count         INTEGER,
  year_min                  INTEGER,
  year_max                  INTEGER,
  imported_at               TEXT,
  PRIMARY KEY (indication, modality, target)
);
CREATE TABLE IF NOT EXISTS neuromodulation_protocol_templates (
  modality                 TEXT NOT NULL,
  indication               TEXT NOT NULL,
  target                   TEXT NOT NULL,
  invasiveness             TEXT NOT NULL,
  paper_count              INTEGER,
  citation_sum             INTEGER,
  template_support_score   REAL,
  top_study_types          TEXT,
  top_parameter_tags       TEXT,
  top_population_tags      TEXT,
  top_safety_tags          TEXT,
  example_titles           TEXT,
  imported_at              TEXT,
  PRIMARY KEY (modality, indication, target, invasiveness)
);
CREATE TABLE IF NOT EXISTS neuromodulation_indication_modality_summary (
  indication           TEXT NOT NULL,
  modality             TEXT NOT NULL,
  paper_count          INTEGER,
  evidence_weight_sum  REAL,
  citation_sum         INTEGER,
  top_study_types      TEXT,
  top_targets          TEXT,
  top_parameter_tags   TEXT,
  imported_at          TEXT,
  PRIMARY KEY (indication, modality)
);
CREATE TABLE IF NOT EXISTS neuromodulation_modality_summary (
  modality      TEXT PRIMARY KEY,
  paper_count   INTEGER,
  imported_at   TEXT
);
CREATE TABLE IF NOT EXISTS neuromodulation_bundle_assets (
  asset_key        TEXT PRIMARY KEY,
  relative_path    TEXT NOT NULL,
  sha256           TEXT NOT NULL,
  bytes            INTEGER NOT NULL,
  row_count        INTEGER,
  source_bundle    TEXT,
  imported_at      TEXT,
  notes            TEXT
);
CREATE TABLE IF NOT EXISTS neuromodulation_abstracts (
  paper_id          INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  paper_key         TEXT UNIQUE NOT NULL,
  title             TEXT,
  abstract          TEXT,
  abstract_source   TEXT,
  abstract_length   INTEGER,
  retrieval_status  TEXT,
  source_id         TEXT,
  source            TEXT,
  imported_at       TEXT
);
CREATE TABLE IF NOT EXISTS neuromodulation_trial_metadata (
  nct_id               TEXT PRIMARY KEY,
  title                TEXT,
  overall_status       TEXT,
  phase                TEXT,
  study_type           TEXT,
  enrollment           INTEGER,
  sponsor              TEXT,
  start_date           TEXT,
  last_update          TEXT,
  conditions_json      TEXT,
  interventions_json   TEXT,
  outcomes_json        TEXT,
  brief_summary        TEXT,
  matched_modalities   TEXT,
  matched_conditions   TEXT,
  query_terms          TEXT,
  source_url           TEXT,
  raw_json             TEXT,
  imported_at          TEXT
);
CREATE TABLE IF NOT EXISTS neuromodulation_fda_510k_records (
  clearance_number    TEXT PRIMARY KEY,
  decision_date       TEXT,
  applicant           TEXT,
  device_name         TEXT,
  generic_name        TEXT,
  product_code        TEXT,
  advisory_committee  TEXT,
  matched_modalities  TEXT,
  matched_conditions  TEXT,
  query_terms         TEXT,
  source_url          TEXT,
  raw_json            TEXT,
  imported_at         TEXT
);
CREATE TABLE IF NOT EXISTS neuromodulation_condition_mentions (
  paper_id          INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  condition_slug    TEXT NOT NULL,
  condition_label   TEXT,
  match_count       INTEGER,
  source_sections   TEXT,
  confidence        REAL,
  imported_at       TEXT,
  PRIMARY KEY (paper_id, condition_slug)
);
CREATE TABLE IF NOT EXISTS neuromodulation_patient_outcomes (
  paper_id                   INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  paper_key                  TEXT NOT NULL,
  source_type                TEXT,
  study_type_normalized      TEXT,
  evidence_tier              TEXT,
  primary_modality           TEXT,
  condition_slug             TEXT,
  endpoint_category          TEXT,
  outcome_measure            TEXT,
  outcome_direction          TEXT,
  metric_value               TEXT,
  metric_unit                TEXT,
  real_world_evidence_flag   INTEGER,
  source_snippet             TEXT NOT NULL,
  imported_at                TEXT,
  PRIMARY KEY (paper_id, endpoint_category, outcome_measure, source_snippet)
);
CREATE INDEX IF NOT EXISTS idx_neuro_condition_mentions_slug
  ON neuromodulation_condition_mentions(condition_slug);
CREATE INDEX IF NOT EXISTS idx_neuro_outcomes_condition
  ON neuromodulation_patient_outcomes(condition_slug);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def none_if_blank(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def to_int(value: str | None) -> int | None:
    value = none_if_blank(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def to_float(value: str | None) -> float | None:
    value = none_if_blank(value)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def boolish(value: str | None) -> int | None:
    value = none_if_blank(value)
    if value is None:
        return None
    lowered = value.lower()
    if lowered in {"1", "true", "yes", "y"}:
        return 1
    if lowered in {"0", "false", "no", "n"}:
        return 0
    return None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def count_rows(path: Path) -> int | None:
    if path.suffix.lower() != ".csv":
        return None
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        return sum(1 for _ in reader)


def write_manifest(asset_rows: list[dict], source_bundle: Path) -> Path:
    manifest_path = TARGET_ROOT / "manifest.json"
    payload = {
        "bundle_name": "neuromodulation_research_bundle_2026-04-22",
        "generated_at": now_iso(),
        "source_bundle": str(source_bundle),
        "assets": asset_rows,
    }
    manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def stage_bundle(source_bundle: Path) -> Path:
    TARGET_ROOT.mkdir(parents=True, exist_ok=True)
    asset_rows = []
    for relative_path in ASSETS:
        destination = TARGET_ROOT / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        source = source_bundle / destination.name
        if not source.exists():
            raise FileNotFoundError(f"missing bundle asset: {source}")
        shutil.copy2(source, destination)
        asset_rows.append(
            {
                "asset_key": destination.stem,
                "relative_path": relative_path,
                "sha256": sha256_file(destination),
                "bytes": destination.stat().st_size,
                "row_count": count_rows(destination),
                "kind": ASSETS[relative_path],
            }
        )
    return write_manifest(asset_rows, source_bundle)


def ensure_bundle_schema(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(papers)").fetchall()}
    if "pmcid" not in columns:
        conn.execute("ALTER TABLE papers ADD COLUMN pmcid TEXT")
    conn.executescript(FRESH_SCHEMA_SQL)


def parse_authors(raw: str | None) -> str:
    raw = none_if_blank(raw)
    if not raw:
        return "[]"
    authors = [item.strip() for item in raw.split(";") if item.strip()]
    if not authors:
        authors = [raw]
    return json.dumps(authors, ensure_ascii=False)


def parse_pub_types(raw: str | None) -> str:
    raw = none_if_blank(raw)
    if not raw:
        return "[]"
    pub_types = [item.strip() for item in raw.replace("|", ";").split(";") if item.strip()]
    if not pub_types:
        pub_types = [raw]
    return json.dumps(pub_types, ensure_ascii=False)


def append_source(existing_json: str | None, source_name: str) -> str:
    existing = set(json.loads(existing_json or "[]"))
    existing.add(source_name)
    return json.dumps(sorted(existing))


def master_row_key(row: dict[str, str]) -> str:
    for prefix, field in (("doi", "doi"), ("pmid", "pmid"), ("pmcid", "pmcid")):
        value = none_if_blank(row.get(field))
        if value:
            return f"{prefix}|{value.lower()}"
    title = none_if_blank(row.get("title")) or "untitled"
    year = none_if_blank(row.get("year")) or "unknown"
    return f"titleyear|{title.strip().lower()}|{year}"


def upsert_master_paper(conn: sqlite3.Connection, row: dict[str, str], imported_at: str) -> int:
    pmid = none_if_blank(row.get("pmid"))
    pmcid = none_if_blank(row.get("pmcid"))
    doi = none_if_blank(row.get("doi"))
    europepmc_id = none_if_blank(row.get("id"))
    existing = conn.execute(
        "SELECT id, sources_json FROM papers "
        "WHERE (pmid IS NOT NULL AND pmid = ?) "
        "OR (pmcid IS NOT NULL AND pmcid = ?) "
        "OR (doi IS NOT NULL AND doi = ?) "
        "OR (europepmc_id IS NOT NULL AND europepmc_id = ?)",
        (pmid, pmcid, doi, europepmc_id),
    ).fetchone()
    title = none_if_blank(row.get("title"))
    authors_json = parse_authors(row.get("authors"))
    pub_types_json = parse_pub_types(row.get("pub_type"))
    values = (
        pmid,
        pmcid,
        doi.lower() if doi else None,
        europepmc_id,
        title,
        None,
        to_int(row.get("year")),
        none_if_blank(row.get("journal")),
        authors_json,
        pub_types_json,
        to_int(row.get("cited_by_count")),
        boolish(row.get("is_open_access")),
        none_if_blank(row.get("europe_pmc_url")),
        imported_at,
    )
    if existing:
        conn.execute(
            "UPDATE papers SET "
            "pmid = COALESCE(pmid, ?), "
            "pmcid = COALESCE(pmcid, ?), "
            "doi = COALESCE(doi, ?), "
            "europepmc_id = COALESCE(europepmc_id, ?), "
            "title = COALESCE(title, ?), "
            "year = COALESCE(year, ?), "
            "journal = COALESCE(journal, ?), "
            "authors_json = CASE WHEN authors_json IS NULL OR authors_json = '[]' THEN ? ELSE authors_json END, "
            "pub_types_json = CASE WHEN pub_types_json IS NULL OR pub_types_json = '[]' THEN ? ELSE pub_types_json END, "
            "cited_by_count = COALESCE(?, cited_by_count), "
            "is_oa = COALESCE(?, is_oa), "
            "oa_url = COALESCE(?, oa_url), "
            "sources_json = ?, "
            "last_ingested = ? "
            "WHERE id = ?",
            (
                pmid,
                pmcid,
                doi.lower() if doi else None,
                europepmc_id,
                title,
                to_int(row.get("year")),
                none_if_blank(row.get("journal")),
                authors_json,
                pub_types_json,
                to_int(row.get("cited_by_count")),
                boolish(row.get("is_open_access")),
                none_if_blank(row.get("europe_pmc_url")),
                append_source(existing["sources_json"], "neuromodulation_bundle"),
                imported_at,
                existing["id"],
            ),
        )
        return existing["id"]

    cur = conn.execute(
        "INSERT INTO papers("
        "pmid, pmcid, doi, europepmc_id, title, abstract, year, journal, "
        "authors_json, pub_types_json, cited_by_count, is_oa, oa_url, sources_json, last_ingested"
        ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        values[:-1] + (json.dumps(["neuromodulation_bundle"]), imported_at),
    )
    return cur.lastrowid


def import_master(conn: sqlite3.Connection, path: Path, imported_at: str) -> dict[str, int]:
    key_to_paper_id: dict[str, int] = {}
    inserted = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            before = conn.total_changes
            paper_id = upsert_master_paper(conn, row, imported_at)
            key_to_paper_id[master_row_key(row)] = paper_id
            if conn.total_changes > before:
                inserted += 1
    return {"count": len(key_to_paper_id), "inserted_or_updated": inserted, "key_to_paper_id": key_to_paper_id}


def import_profiles(conn: sqlite3.Connection, path: Path, key_to_paper_id: dict[str, int], imported_at: str) -> int:
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            paper_id = key_to_paper_id.get(row["paper_key"])
            if not paper_id:
                continue
            conn.execute(
                "INSERT INTO neuromodulation_paper_profiles ("
                "paper_id, paper_key, title_normalized, source, study_type_normalized, evidence_tier, "
                "canonical_modalities, primary_modality, invasiveness, indication_tags, population_tags, "
                "target_tags, parameter_signal_tags, protocol_relevance_score, matched_query_terms, "
                "source_exports, record_url, ai_ingestion_text, open_access_flag, citation_count, imported_at"
                ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(paper_id) DO UPDATE SET "
                "paper_key=excluded.paper_key, title_normalized=excluded.title_normalized, source=excluded.source, "
                "study_type_normalized=excluded.study_type_normalized, evidence_tier=excluded.evidence_tier, "
                "canonical_modalities=excluded.canonical_modalities, primary_modality=excluded.primary_modality, "
                "invasiveness=excluded.invasiveness, indication_tags=excluded.indication_tags, "
                "population_tags=excluded.population_tags, target_tags=excluded.target_tags, "
                "parameter_signal_tags=excluded.parameter_signal_tags, "
                "protocol_relevance_score=excluded.protocol_relevance_score, "
                "matched_query_terms=excluded.matched_query_terms, source_exports=excluded.source_exports, "
                "record_url=excluded.record_url, ai_ingestion_text=excluded.ai_ingestion_text, "
                "open_access_flag=excluded.open_access_flag, citation_count=excluded.citation_count, "
                "imported_at=excluded.imported_at",
                (
                    paper_id,
                    row["paper_key"],
                    none_if_blank(row.get("title_normalized")),
                    none_if_blank(row.get("source")),
                    none_if_blank(row.get("study_type_normalized")),
                    none_if_blank(row.get("evidence_tier")),
                    none_if_blank(row.get("canonical_modalities")),
                    none_if_blank(row.get("primary_modality")),
                    none_if_blank(row.get("invasiveness")),
                    none_if_blank(row.get("indication_tags")),
                    none_if_blank(row.get("population_tags")),
                    none_if_blank(row.get("target_tags")),
                    none_if_blank(row.get("parameter_signal_tags")),
                    to_float(row.get("protocol_relevance_score")),
                    none_if_blank(row.get("matched_query_terms")),
                    none_if_blank(row.get("source_exports")),
                    none_if_blank(row.get("record_url")),
                    none_if_blank(row.get("ai_ingestion_text")),
                    boolish(row.get("open_access_flag")),
                    to_int(row.get("citation_count")),
                    imported_at,
                ),
            )
            count += 1
    return count


def import_safety(conn: sqlite3.Connection, path: Path, key_to_paper_id: dict[str, int], imported_at: str) -> int:
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            paper_id = key_to_paper_id.get(row["paper_key"])
            if not paper_id:
                continue
            conn.execute(
                "INSERT INTO neuromodulation_safety_signals ("
                "paper_id, paper_key, year, title, primary_modality, canonical_modalities, indication_tags, "
                "study_type_normalized, evidence_tier, safety_signal_tags, contraindication_signal_tags, "
                "population_tags, target_tags, parameter_signal_tags, record_url, imported_at"
                ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(paper_id) DO UPDATE SET "
                "paper_key=excluded.paper_key, year=excluded.year, title=excluded.title, "
                "primary_modality=excluded.primary_modality, canonical_modalities=excluded.canonical_modalities, "
                "indication_tags=excluded.indication_tags, study_type_normalized=excluded.study_type_normalized, "
                "evidence_tier=excluded.evidence_tier, safety_signal_tags=excluded.safety_signal_tags, "
                "contraindication_signal_tags=excluded.contraindication_signal_tags, "
                "population_tags=excluded.population_tags, target_tags=excluded.target_tags, "
                "parameter_signal_tags=excluded.parameter_signal_tags, record_url=excluded.record_url, "
                "imported_at=excluded.imported_at",
                (
                    paper_id,
                    row["paper_key"],
                    to_int(row.get("year")),
                    none_if_blank(row.get("title")),
                    none_if_blank(row.get("primary_modality")),
                    none_if_blank(row.get("canonical_modalities")),
                    none_if_blank(row.get("indication_tags")),
                    none_if_blank(row.get("study_type_normalized")),
                    none_if_blank(row.get("evidence_tier")),
                    none_if_blank(row.get("safety_signal_tags")),
                    none_if_blank(row.get("contraindication_signal_tags")),
                    none_if_blank(row.get("population_tags")),
                    none_if_blank(row.get("target_tags")),
                    none_if_blank(row.get("parameter_signal_tags")),
                    none_if_blank(row.get("record_url")),
                    imported_at,
                ),
            )
            count += 1
    return count


def import_aggregate_table(
    conn: sqlite3.Connection,
    table: str,
    path: Path,
    columns: list[str],
    converters: dict[str, callable],
    imported_at: str,
) -> int:
    count = 0
    placeholders = ", ".join(["?"] * (len(columns) + 1))
    updates = ", ".join([f"{column}=excluded.{column}" for column in columns] + ["imported_at=excluded.imported_at"])
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            values = []
            for column in columns:
                converter = converters.get(column, none_if_blank)
                values.append(converter(row.get(column)))
            conn.execute(
                f"INSERT INTO {table} ({', '.join(columns)}, imported_at) VALUES ({placeholders}) "
                f"ON CONFLICT DO UPDATE SET {updates}",
                values + [imported_at],
            )
            count += 1
    return count


def import_assets_table(conn: sqlite3.Connection, manifest_path: Path, imported_at: str) -> int:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    count = 0
    for asset in payload["assets"]:
        conn.execute(
            "INSERT INTO neuromodulation_bundle_assets ("
            "asset_key, relative_path, sha256, bytes, row_count, source_bundle, imported_at, notes"
            ") VALUES (?,?,?,?,?,?,?,?) "
            "ON CONFLICT(asset_key) DO UPDATE SET "
            "relative_path=excluded.relative_path, sha256=excluded.sha256, bytes=excluded.bytes, "
            "row_count=excluded.row_count, source_bundle=excluded.source_bundle, "
            "imported_at=excluded.imported_at, notes=excluded.notes",
            (
                asset["asset_key"],
                asset["relative_path"],
                asset["sha256"],
                asset["bytes"],
                asset["row_count"],
                payload.get("source_bundle"),
                imported_at,
                asset.get("kind"),
            ),
        )
        count += 1
    return count


def import_abstracts(conn: sqlite3.Connection, path: Path, key_to_paper_id: dict[str, int], imported_at: str) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            paper_id = key_to_paper_id.get(row["paper_key"])
            if not paper_id:
                continue
            abstract = none_if_blank(row.get("abstract"))
            conn.execute(
                "INSERT INTO neuromodulation_abstracts ("
                "paper_id, paper_key, title, abstract, abstract_source, abstract_length, retrieval_status, "
                "source_id, source, imported_at"
                ") VALUES (?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(paper_id) DO UPDATE SET "
                "paper_key=excluded.paper_key, title=excluded.title, abstract=excluded.abstract, "
                "abstract_source=excluded.abstract_source, abstract_length=excluded.abstract_length, "
                "retrieval_status=excluded.retrieval_status, source_id=excluded.source_id, "
                "source=excluded.source, imported_at=excluded.imported_at",
                (
                    paper_id,
                    row["paper_key"],
                    none_if_blank(row.get("title")),
                    abstract,
                    none_if_blank(row.get("abstract_source")),
                    to_int(row.get("abstract_length")),
                    none_if_blank(row.get("retrieval_status")),
                    none_if_blank(row.get("source_id")),
                    none_if_blank(row.get("source")),
                    imported_at,
                ),
            )
            if abstract:
                existing = conn.execute("SELECT abstract, sources_json FROM papers WHERE id = ?", (paper_id,)).fetchone()
                conn.execute(
                    "UPDATE papers SET abstract = COALESCE(abstract, ?), sources_json = ?, last_ingested = ? WHERE id = ?",
                    (
                        abstract,
                        append_source(existing["sources_json"], "europepmc_abstract_enrichment"),
                        imported_at,
                        paper_id,
                    ),
                )
            count += 1
    return count


def import_trial_metadata(conn: sqlite3.Connection, path: Path, imported_at: str) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            nct_id = none_if_blank(row.get("nct_id"))
            if not nct_id:
                continue
            conn.execute(
                "INSERT INTO trials("
                "nct_id, title, phase, status, enrollment, conditions_json, interventions_json, outcomes_json, "
                "brief_summary, start_date, last_update, study_type, sponsor, locations_json, raw_json"
                ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(nct_id) DO UPDATE SET "
                "title=excluded.title, phase=excluded.phase, status=excluded.status, enrollment=excluded.enrollment, "
                "conditions_json=excluded.conditions_json, interventions_json=excluded.interventions_json, "
                "outcomes_json=excluded.outcomes_json, brief_summary=excluded.brief_summary, "
                "start_date=excluded.start_date, last_update=excluded.last_update, study_type=excluded.study_type, "
                "sponsor=excluded.sponsor, raw_json=excluded.raw_json",
                (
                    nct_id,
                    none_if_blank(row.get("title")),
                    none_if_blank(row.get("phase")),
                    none_if_blank(row.get("overall_status")),
                    to_int(row.get("enrollment")),
                    row.get("conditions_json") or "[]",
                    row.get("interventions_json") or "[]",
                    row.get("outcomes_json") or "[]",
                    none_if_blank(row.get("brief_summary")),
                    none_if_blank(row.get("start_date")),
                    none_if_blank(row.get("last_update")),
                    none_if_blank(row.get("study_type")),
                    none_if_blank(row.get("sponsor")),
                    "[]",
                    row.get("raw_json") or "{}",
                ),
            )
            conn.execute(
                "INSERT INTO neuromodulation_trial_metadata ("
                "nct_id, title, overall_status, phase, study_type, enrollment, sponsor, start_date, last_update, "
                "conditions_json, interventions_json, outcomes_json, brief_summary, matched_modalities, "
                "matched_conditions, query_terms, source_url, raw_json, imported_at"
                ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(nct_id) DO UPDATE SET "
                "title=excluded.title, overall_status=excluded.overall_status, phase=excluded.phase, "
                "study_type=excluded.study_type, enrollment=excluded.enrollment, sponsor=excluded.sponsor, "
                "start_date=excluded.start_date, last_update=excluded.last_update, "
                "conditions_json=excluded.conditions_json, interventions_json=excluded.interventions_json, "
                "outcomes_json=excluded.outcomes_json, brief_summary=excluded.brief_summary, "
                "matched_modalities=excluded.matched_modalities, matched_conditions=excluded.matched_conditions, "
                "query_terms=excluded.query_terms, source_url=excluded.source_url, raw_json=excluded.raw_json, "
                "imported_at=excluded.imported_at",
                (
                    nct_id,
                    none_if_blank(row.get("title")),
                    none_if_blank(row.get("overall_status")),
                    none_if_blank(row.get("phase")),
                    none_if_blank(row.get("study_type")),
                    to_int(row.get("enrollment")),
                    none_if_blank(row.get("sponsor")),
                    none_if_blank(row.get("start_date")),
                    none_if_blank(row.get("last_update")),
                    row.get("conditions_json") or "[]",
                    row.get("interventions_json") or "[]",
                    row.get("outcomes_json") or "[]",
                    none_if_blank(row.get("brief_summary")),
                    none_if_blank(row.get("matched_modalities")),
                    none_if_blank(row.get("matched_conditions")),
                    none_if_blank(row.get("query_terms")),
                    none_if_blank(row.get("source_url")),
                    row.get("raw_json") or "{}",
                    imported_at,
                ),
            )
            count += 1
    return count


def import_fda_510k_records(conn: sqlite3.Connection, path: Path, imported_at: str) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            clearance_number = none_if_blank(row.get("clearance_number"))
            if not clearance_number:
                continue
            conn.execute(
                "INSERT INTO devices(kind, number, applicant, trade_name, generic_name, product_code, "
                "decision_date, advisory_committee, raw_json) VALUES (?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(kind, number, decision_date) DO UPDATE SET "
                "applicant=excluded.applicant, trade_name=excluded.trade_name, generic_name=excluded.generic_name, "
                "product_code=excluded.product_code, advisory_committee=excluded.advisory_committee, "
                "raw_json=excluded.raw_json",
                (
                    "510k",
                    clearance_number,
                    none_if_blank(row.get("applicant")),
                    none_if_blank(row.get("device_name")),
                    none_if_blank(row.get("generic_name")),
                    none_if_blank(row.get("product_code")),
                    none_if_blank(row.get("decision_date")),
                    none_if_blank(row.get("advisory_committee")),
                    row.get("raw_json") or "{}",
                ),
            )
            conn.execute(
                "INSERT INTO neuromodulation_fda_510k_records ("
                "clearance_number, decision_date, applicant, device_name, generic_name, product_code, "
                "advisory_committee, matched_modalities, matched_conditions, query_terms, source_url, raw_json, imported_at"
                ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(clearance_number) DO UPDATE SET "
                "decision_date=excluded.decision_date, applicant=excluded.applicant, device_name=excluded.device_name, "
                "generic_name=excluded.generic_name, product_code=excluded.product_code, "
                "advisory_committee=excluded.advisory_committee, matched_modalities=excluded.matched_modalities, "
                "matched_conditions=excluded.matched_conditions, query_terms=excluded.query_terms, "
                "source_url=excluded.source_url, raw_json=excluded.raw_json, imported_at=excluded.imported_at",
                (
                    clearance_number,
                    none_if_blank(row.get("decision_date")),
                    none_if_blank(row.get("applicant")),
                    none_if_blank(row.get("device_name")),
                    none_if_blank(row.get("generic_name")),
                    none_if_blank(row.get("product_code")),
                    none_if_blank(row.get("advisory_committee")),
                    none_if_blank(row.get("matched_modalities")),
                    none_if_blank(row.get("matched_conditions")),
                    none_if_blank(row.get("query_terms")),
                    none_if_blank(row.get("source_url")),
                    row.get("raw_json") or "{}",
                    imported_at,
                ),
            )
            count += 1
    return count


def import_condition_mentions(conn: sqlite3.Connection, path: Path, key_to_paper_id: dict[str, int], imported_at: str) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            paper_id = key_to_paper_id.get(row["paper_key"])
            if not paper_id:
                continue
            conn.execute(
                "INSERT INTO neuromodulation_condition_mentions ("
                "paper_id, condition_slug, condition_label, match_count, source_sections, confidence, imported_at"
                ") VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT(paper_id, condition_slug) DO UPDATE SET "
                "condition_label=excluded.condition_label, match_count=excluded.match_count, "
                "source_sections=excluded.source_sections, confidence=excluded.confidence, imported_at=excluded.imported_at",
                (
                    paper_id,
                    none_if_blank(row.get("condition_slug")),
                    none_if_blank(row.get("condition_label")),
                    to_int(row.get("match_count")),
                    none_if_blank(row.get("source_sections")),
                    to_float(row.get("confidence")),
                    imported_at,
                ),
            )
            count += 1
    return count


def import_patient_outcomes(conn: sqlite3.Connection, path: Path, key_to_paper_id: dict[str, int], imported_at: str) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            paper_id = key_to_paper_id.get(row["paper_key"])
            if not paper_id:
                continue
            snippet = none_if_blank(row.get("source_snippet"))
            if not snippet:
                continue
            conn.execute(
                "INSERT INTO neuromodulation_patient_outcomes ("
                "paper_id, paper_key, source_type, study_type_normalized, evidence_tier, primary_modality, "
                "condition_slug, endpoint_category, outcome_measure, outcome_direction, metric_value, metric_unit, "
                "real_world_evidence_flag, source_snippet, imported_at"
                ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(paper_id, endpoint_category, outcome_measure, source_snippet) DO UPDATE SET "
                "source_type=excluded.source_type, study_type_normalized=excluded.study_type_normalized, "
                "evidence_tier=excluded.evidence_tier, primary_modality=excluded.primary_modality, "
                "condition_slug=excluded.condition_slug, outcome_direction=excluded.outcome_direction, "
                "metric_value=excluded.metric_value, metric_unit=excluded.metric_unit, "
                "real_world_evidence_flag=excluded.real_world_evidence_flag, imported_at=excluded.imported_at",
                (
                    paper_id,
                    row["paper_key"],
                    none_if_blank(row.get("source_type")),
                    none_if_blank(row.get("study_type_normalized")),
                    none_if_blank(row.get("evidence_tier")),
                    none_if_blank(row.get("primary_modality")),
                    none_if_blank(row.get("condition_slug")),
                    none_if_blank(row.get("endpoint_category")),
                    none_if_blank(row.get("outcome_measure")),
                    none_if_blank(row.get("outcome_direction")),
                    none_if_blank(row.get("metric_value")),
                    none_if_blank(row.get("metric_unit")),
                    boolish(row.get("real_world_evidence_flag")),
                    snippet,
                    imported_at,
                ),
            )
            count += 1
    return count


def import_bundle(staged_root: Path) -> dict[str, int]:
    manifest_path = staged_root / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"missing manifest: {manifest_path}")

    db.init()
    conn = db.connect()
    ensure_bundle_schema(conn)
    imported_at = now_iso()
    conn.execute("BEGIN")
    try:
        asset_rows = import_assets_table(conn, manifest_path, imported_at)
        master = import_master(conn, staged_root / "raw" / "neuromodulation_all_papers_master.csv", imported_at)
        profiles = import_profiles(
            conn,
            staged_root / "derived" / "neuromodulation_ai_ingestion_dataset.csv",
            master["key_to_paper_id"],
            imported_at,
        )
        safety = import_safety(
            conn,
            staged_root / "derived" / "neuromodulation_safety_contraindication_signals.csv",
            master["key_to_paper_id"],
            imported_at,
        )
        graph = import_aggregate_table(
            conn,
            "neuromodulation_evidence_graph",
            staged_root / "derived" / "neuromodulation_evidence_graph.csv",
            [
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
            {
                "paper_count": to_int,
                "citation_sum": to_int,
                "evidence_weight_sum": to_float,
                "mean_citations_per_paper": to_float,
                "open_access_count": to_int,
                "year_min": to_int,
                "year_max": to_int,
            },
            imported_at,
        )
        templates = import_aggregate_table(
            conn,
            "neuromodulation_protocol_templates",
            staged_root / "derived" / "neuromodulation_protocol_template_candidates.csv",
            [
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
            {
                "paper_count": to_int,
                "citation_sum": to_int,
                "template_support_score": to_float,
            },
            imported_at,
        )
        indication_summary = import_aggregate_table(
            conn,
            "neuromodulation_indication_modality_summary",
            staged_root / "derived" / "neuromodulation_indication_modality_summary.csv",
            [
                "indication",
                "modality",
                "paper_count",
                "evidence_weight_sum",
                "citation_sum",
                "top_study_types",
                "top_targets",
                "top_parameter_tags",
            ],
            {
                "paper_count": to_int,
                "evidence_weight_sum": to_float,
                "citation_sum": to_int,
            },
            imported_at,
        )
        modality_summary = import_aggregate_table(
            conn,
            "neuromodulation_modality_summary",
            staged_root / "derived" / "neuromodulation_modalities_summary.csv",
            ["modality", "paper_count"],
            {"paper_count": to_int},
            imported_at,
        )
        abstracts = import_abstracts(
            conn,
            staged_root / "derived" / "neuromodulation_europepmc_abstracts.csv",
            master["key_to_paper_id"],
            imported_at,
        )
        trial_metadata = import_trial_metadata(
            conn,
            staged_root / "derived" / "neuromodulation_clinical_trials.csv",
            imported_at,
        )
        fda_510k = import_fda_510k_records(
            conn,
            staged_root / "derived" / "neuromodulation_fda_510k_devices.csv",
            imported_at,
        )
        condition_mentions = import_condition_mentions(
            conn,
            staged_root / "derived" / "neuromodulation_condition_mentions.csv",
            master["key_to_paper_id"],
            imported_at,
        )
        patient_outcomes = import_patient_outcomes(
            conn,
            staged_root / "derived" / "neuromodulation_patient_outcomes.csv",
            master["key_to_paper_id"],
            imported_at,
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()

    return {
        "assets": asset_rows,
        "papers": master["count"],
        "profiles": profiles,
        "safety_signals": safety,
        "evidence_graph_edges": graph,
        "protocol_templates": templates,
        "indication_summaries": indication_summary,
        "modality_summaries": modality_summary,
        "abstracts": abstracts,
        "clinical_trials": trial_metadata,
        "fda_510k_records": fda_510k,
        "condition_mentions": condition_mentions,
        "patient_outcomes": patient_outcomes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", action="store_true", help="Copy the Desktop bundle into data/research/neuromodulation.")
    parser.add_argument("--enrich", action="store_true", help="Generate abstract/trial/device/condition/outcome enrichments into the staged bundle.")
    parser.add_argument("--import-db", action="store_true", help="Import the staged CSVs into the SQLite evidence DB.")
    parser.add_argument("--source-bundle", type=Path, default=DEFAULT_SOURCE_BUNDLE)
    parser.add_argument("--staged-root", type=Path, default=TARGET_ROOT)
    parser.add_argument("--abstract-fetch-limit", type=int, default=250)
    parser.add_argument("--trial-query-limit", type=int, default=24)
    parser.add_argument("--trial-records-per-query", type=int, default=25)
    parser.add_argument("--fda-records-per-applicant", type=int, default=25)
    args = parser.parse_args()

    if not args.stage and not args.enrich and not args.import_db:
        parser.error("pass --stage, --enrich, --import-db, or any combination")

    if args.stage:
        manifest_path = stage_bundle(args.source_bundle)
        print(f"staged bundle -> {manifest_path}")

    if args.enrich:
        summary = build_enrichment_bundle(
            args.staged_root,
            abstract_fetch_limit=args.abstract_fetch_limit,
            trial_query_limit=args.trial_query_limit,
            trial_records_per_query=args.trial_records_per_query,
            fda_records_per_applicant=args.fda_records_per_applicant,
        )
        print(json.dumps({"enrichment": summary}, indent=2))

    if args.import_db:
        summary = import_bundle(args.staged_root)
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

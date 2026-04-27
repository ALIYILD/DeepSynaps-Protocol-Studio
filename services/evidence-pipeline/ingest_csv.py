"""Bulk-ingest a EuropePMC-style paper CSV into the evidence DB.

Reads a CSV with columns:
    paper_id, source, source_id, pmid, pmcid, doi, title, abstract, journal,
    year, is_open_access, cited_by_count, modalities, conditions, study_design,
    sample_size, primary_outcome_measure, effect_direction, europe_pmc_url,
    enrichment_status

and upserts into the `papers` table (extended by migration 004). Dedupe order:
PMID → DOI → (source, source_id). The FTS trigger on papers keeps
`papers_fts` in sync automatically.

Also: for rows whose (modality, condition) pair matches an existing
`indications` row, links the paper via `paper_indications`. Papers whose
modality/condition does not match any curated indication are still fully
searchable via the new papers.modalities_json / conditions_json columns — they
just don't participate in the indication-scoped API endpoints.

Usage:
    python3 ingest_csv.py /path/to/deepsynaps_papers.87k.csv
    python3 ingest_csv.py /path/to/file.csv --db /tmp/evidence.db
    python3 ingest_csv.py /path/to/file.csv --limit 100   # dry-ish run

The script is safe to re-run: repeated runs UPDATE existing rows instead of
inserting duplicates.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import db  # type: ignore


# CSV modality tokens → canonical indications.modality values used by the
# curated taxonomy in indications_seed.py. Tokens absent from this map still
# land in papers.modalities_json; they just won't auto-link into
# paper_indications.
MODALITY_ALIASES: dict[str, list[str]] = {
    "tms":    ["rTMS", "dTMS"],
    "dbs":    ["DBS"],
    "tdcs":   ["tDCS"],
    "scs":    ["SCS"],
    "vns":    ["VNS"],
    "tvns":   ["VNS"],
    "pns":    ["PNS"],
    "rns":    ["RNS"],
    "snm":    ["SNM"],
    "tfus":   ["MRgFUS"],
    "tacs":   [],  # no curated indications yet
    "mcs":    [],
    "ons":    [],
    "trigns": [],
    "trns":   [],
    "gen":    [],
}

# CSV condition tokens → substrings that appear in indications.condition or
# indications.slug. Match is case-insensitive.
CONDITION_ALIASES: dict[str, list[str]] = {
    "parkinsons":   ["parkinson"],
    "mdd":          ["depress", "major depressive"],
    "depression":   ["depress"],
    "chronic_pain": ["pain", "crps", "neuropath"],
    "stroke":       ["stroke"],
    "alzheimers":   ["alzheimer", "dementia", "mild cognitive"],
    "ocd":          ["obsessive", "ocd"],
    "ptsd":         ["ptsd", "anxiety"],
    "anxiety":      ["anxiety", "ptsd"],
    "tbi":          ["brain injury", "tbi", "concussion"],
    "adhd":         ["adhd", "attention"],
    "epilepsy":     ["epilepsy"],
    "ms":           ["multiple sclerosis", "spasticity"],
    "insomnia":     [],
    "tinnitus":     [],
    "long_covid":   [],
    "asd":          [],
}


def _split_semi(val: str | None) -> list[str]:
    if not val:
        return []
    return [x.strip() for x in val.split(";") if x.strip()]


def _to_int(val: str | None) -> int | None:
    if not val:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _to_bool01(val: str | None) -> int | None:
    if not val:
        return None
    s = val.strip().lower()
    if s in {"t", "true", "1", "yes"}:
        return 1
    if s in {"f", "false", "0", "no"}:
        return 0
    return None


def _ensure_schema_and_migrations(db_path: str) -> None:
    """Apply schema.sql + run every *.sql migration in migrations/ once.

    Opens and explicitly closes every connection so Windows test runners (which
    cannot delete tmp dirs while any handle is live) can reclaim the file.
    """
    # Apply base schema in its own short-lived connection.
    schema_path = Path(__file__).parent / "schema.sql"
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        with open(schema_path, encoding="utf-8") as f:
            conn.executescript(f.read())
        conn.commit()
    finally:
        conn.close()

    migrations_dir = Path(__file__).parent / "migrations"
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(filename TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        applied = {
            r[0] for r in conn.execute("SELECT filename FROM schema_migrations").fetchall()
        }
        for f in sorted(migrations_dir.glob("*.sql")):
            if f.name in applied:
                continue
            print(f"[ingest_csv] apply migration {f.name}", flush=True)
            with open(f, encoding="utf-8") as sql:
                conn.executescript(sql.read())
            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations(filename) VALUES (?)",
                (f.name,),
            )
        conn.commit()
    finally:
        conn.close()


def _seed_indications(conn: sqlite3.Connection) -> int:
    """Seed the curated indication taxonomy so paper_indications linking has
    targets. Idempotent via upsert-on-slug; safe to call every ingest."""
    try:
        from indications_seed import SEED  # type: ignore
    except Exception as e:
        print(f"[ingest_csv] could not import indications_seed: {e}", flush=True)
        return 0
    n = 0
    for entry in SEED:
        conn.execute(
            "INSERT INTO indications(slug, label, modality, condition, "
            "evidence_grade, regulatory) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(slug) DO UPDATE SET "
            "  label=excluded.label, modality=excluded.modality, "
            "  condition=excluded.condition, evidence_grade=excluded.evidence_grade, "
            "  regulatory=excluded.regulatory",
            (
                entry["slug"], entry["label"], entry["modality"], entry["condition"],
                entry.get("grade"), entry.get("regulatory"),
            ),
        )
        n += 1
    return n


def _build_indication_lookup(conn: sqlite3.Connection) -> dict[tuple[str, str], int]:
    """Return {(modality_lower, condition_substring): indication_id}.

    Expanded so each CSV (modality, condition) token pair resolves in O(1).
    """
    rows = conn.execute(
        "SELECT id, slug, modality, condition FROM indications"
    ).fetchall()
    out: dict[tuple[str, str], int] = {}
    for iid, slug, modality, condition in rows:
        mod_l = (modality or "").strip().lower()
        cond_l = (condition or "").strip().lower()
        slug_l = (slug or "").strip().lower()
        out[(mod_l, cond_l)] = iid
        # slug is also a useful lookup key (e.g. dbs_parkinson)
        out[(mod_l, slug_l)] = iid
    return out


def _link_indications(
    conn: sqlite3.Connection,
    paper_id: int,
    csv_mods: list[str],
    csv_conds: list[str],
    lookup: dict[tuple[str, str], int],
) -> int:
    """Insert paper_indications rows for every (csv_mod, csv_cond) pair that
    resolves to an indication. Returns the number of links created."""
    if not csv_mods or not csv_conds:
        return 0
    links = 0
    for m in csv_mods:
        m_l = m.strip().lower()
        canon_mods = MODALITY_ALIASES.get(m_l, [])
        if not canon_mods:
            continue
        for c in csv_conds:
            c_l = c.strip().lower()
            cond_needles = CONDITION_ALIASES.get(c_l, [])
            if not cond_needles:
                continue
            for canon_m in canon_mods:
                canon_m_l = canon_m.lower()
                for needle in cond_needles:
                    # scan lookup keys for (canon_m_l, *any condition containing needle*)
                    for (mod_k, cond_k), ind_id in lookup.items():
                        if mod_k != canon_m_l:
                            continue
                        if needle in cond_k:
                            try:
                                conn.execute(
                                    "INSERT OR IGNORE INTO paper_indications"
                                    "(paper_id, indication_id, relevance) VALUES (?,?,?)",
                                    (paper_id, ind_id, 0.5),
                                )
                                links += 1
                            except sqlite3.IntegrityError:
                                pass
    return links


def _row_to_payload(row: dict) -> dict:
    """Normalise one CSV row to DB column shape."""
    modalities = _split_semi(row.get("modalities"))
    conditions = _split_semi(row.get("conditions"))
    year = _to_int(row.get("year"))
    sample_size = _to_int(row.get("sample_size"))
    cited = _to_int(row.get("cited_by_count")) or 0
    is_oa = _to_bool01(row.get("is_open_access"))
    source = (row.get("source") or "").strip() or None
    source_id = (row.get("source_id") or "").strip() or None
    pmid = (row.get("pmid") or "").strip() or None
    pmcid = (row.get("pmcid") or "").strip() or None
    doi = (row.get("doi") or "").strip() or None
    # Canonicalise DOI: many rows have "doi.org/…" or trailing whitespace.
    if doi:
        doi = doi.strip().rstrip("/").lower()
        if doi.startswith("https://doi.org/"):
            doi = doi[len("https://doi.org/"):]
        elif doi.startswith("http://doi.org/"):
            doi = doi[len("http://doi.org/"):]
    europepmc_id = f"{source}:{source_id}" if source and source_id else None

    return {
        "pmid": pmid,
        "doi": doi,
        "europepmc_id": europepmc_id,
        "pmcid": pmcid,
        "title": (row.get("title") or "").strip() or None,
        "abstract": (row.get("abstract") or "").strip() or None,
        "year": year,
        "journal": (row.get("journal") or "").strip() or None,
        "cited_by_count": cited,
        "is_oa": is_oa,
        "oa_url": (row.get("europe_pmc_url") or "").strip() or None,
        "source": source,
        "source_id": source_id,
        "modalities_json": json.dumps(modalities) if modalities else None,
        "conditions_json": json.dumps(conditions) if conditions else None,
        "modalities_list": modalities,
        "conditions_list": conditions,
        "study_design": (row.get("study_design") or "").strip() or None,
        "sample_size": sample_size,
        "primary_outcome_measure": (row.get("primary_outcome_measure") or "").strip() or None,
        "effect_direction": (row.get("effect_direction") or "").strip() or None,
        "europe_pmc_url": (row.get("europe_pmc_url") or "").strip() or None,
        "enrichment_status": (row.get("enrichment_status") or "").strip() or None,
        "sources_json": json.dumps([source]) if source else None,
    }


def _lookup_existing_id(conn: sqlite3.Connection, p: dict) -> int | None:
    """Order: PMID → DOI → europepmc_id. Returns existing papers.id if found."""
    cur = conn.cursor()
    if p["pmid"]:
        r = cur.execute("SELECT id FROM papers WHERE pmid = ?", (p["pmid"],)).fetchone()
        if r:
            return r[0]
    if p["doi"]:
        r = cur.execute("SELECT id FROM papers WHERE doi = ?", (p["doi"],)).fetchone()
        if r:
            return r[0]
    if p["europepmc_id"]:
        r = cur.execute(
            "SELECT id FROM papers WHERE europepmc_id = ?", (p["europepmc_id"],)
        ).fetchone()
        if r:
            return r[0]
    return None


_INSERT_SQL = """
INSERT INTO papers (
    pmid, doi, europepmc_id, pmcid, title, abstract, year, journal,
    cited_by_count, is_oa, oa_url, sources_json, last_ingested,
    source, source_id, modalities_json, conditions_json, study_design,
    sample_size, primary_outcome_measure, effect_direction,
    europe_pmc_url, enrichment_status
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?)
"""

_UPDATE_SQL = """
UPDATE papers SET
    pmid = COALESCE(?, pmid),
    doi = COALESCE(?, doi),
    europepmc_id = COALESCE(?, europepmc_id),
    pmcid = COALESCE(?, pmcid),
    title = COALESCE(?, title),
    abstract = COALESCE(?, abstract),
    year = COALESCE(?, year),
    journal = COALESCE(?, journal),
    cited_by_count = COALESCE(?, cited_by_count),
    is_oa = COALESCE(?, is_oa),
    oa_url = COALESCE(?, oa_url),
    sources_json = COALESCE(?, sources_json),
    last_ingested = datetime('now'),
    source = COALESCE(?, source),
    source_id = COALESCE(?, source_id),
    modalities_json = COALESCE(?, modalities_json),
    conditions_json = COALESCE(?, conditions_json),
    study_design = COALESCE(?, study_design),
    sample_size = COALESCE(?, sample_size),
    primary_outcome_measure = COALESCE(?, primary_outcome_measure),
    effect_direction = COALESCE(?, effect_direction),
    europe_pmc_url = COALESCE(?, europe_pmc_url),
    enrichment_status = COALESCE(?, enrichment_status)
WHERE id = ?
"""


def ingest_file(csv_path: str, db_path: str, limit: int | None = None,
                chunk_size: int = 2000, verbose: bool = True) -> dict:
    _ensure_schema_and_migrations(db_path)
    conn = sqlite3.connect(db_path, timeout=60, isolation_level=None)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    conn.execute("BEGIN")
    seeded = _seed_indications(conn)
    conn.execute("COMMIT")
    if verbose and seeded:
        print(f"[ingest_csv] seeded/updated {seeded} curated indications")

    lookup = _build_indication_lookup(conn)
    if verbose:
        print(f"[ingest_csv] indication lookup size: {len(lookup)}")

    inserted = updated = links = 0
    row_i = 0
    t0 = time.time()

    csv.field_size_limit(10_000_000)

    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        conn.execute("BEGIN")
        for row in reader:
            if limit and row_i >= limit:
                break
            row_i += 1
            p = _row_to_payload(row)
            existing = _lookup_existing_id(conn, p)
            if existing is None:
                conn.execute(
                    _INSERT_SQL,
                    (
                        p["pmid"], p["doi"], p["europepmc_id"], p["pmcid"],
                        p["title"], p["abstract"], p["year"], p["journal"],
                        p["cited_by_count"], p["is_oa"], p["oa_url"],
                        p["sources_json"],
                        p["source"], p["source_id"],
                        p["modalities_json"], p["conditions_json"],
                        p["study_design"], p["sample_size"],
                        p["primary_outcome_measure"], p["effect_direction"],
                        p["europe_pmc_url"], p["enrichment_status"],
                    ),
                )
                paper_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                inserted += 1
            else:
                conn.execute(
                    _UPDATE_SQL,
                    (
                        p["pmid"], p["doi"], p["europepmc_id"], p["pmcid"],
                        p["title"], p["abstract"], p["year"], p["journal"],
                        p["cited_by_count"], p["is_oa"], p["oa_url"],
                        p["sources_json"],
                        p["source"], p["source_id"],
                        p["modalities_json"], p["conditions_json"],
                        p["study_design"], p["sample_size"],
                        p["primary_outcome_measure"], p["effect_direction"],
                        p["europe_pmc_url"], p["enrichment_status"],
                        existing,
                    ),
                )
                paper_id = existing
                updated += 1

            if p["modalities_list"] and p["conditions_list"]:
                links += _link_indications(
                    conn, paper_id, p["modalities_list"], p["conditions_list"], lookup
                )

            if row_i % chunk_size == 0:
                conn.execute("COMMIT")
                conn.execute("BEGIN")
                if verbose:
                    rate = row_i / max(time.time() - t0, 0.001)
                    print(
                        f"[ingest_csv] rows={row_i} inserted={inserted} "
                        f"updated={updated} links={links} rate={rate:.0f}/s",
                        flush=True,
                    )
        conn.execute("COMMIT")

    # Final counts
    counts = {
        "papers": conn.execute("SELECT count(*) FROM papers").fetchone()[0],
        "paper_indications": conn.execute(
            "SELECT count(*) FROM paper_indications"
        ).fetchone()[0],
        "indications": conn.execute("SELECT count(*) FROM indications").fetchone()[0],
    }
    conn.close()

    summary = {
        "rows_read": row_i,
        "inserted": inserted,
        "updated": updated,
        "paper_indication_links_added": links,
        "elapsed_s": round(time.time() - t0, 1),
        "db_path": db_path,
        "counts": counts,
    }
    if verbose:
        print(f"[ingest_csv] done: {json.dumps(summary, indent=2)}")
    return summary


def main():
    ap = argparse.ArgumentParser(description="Bulk CSV → evidence.db")
    ap.add_argument("csv_path", help="Path to the papers CSV.")
    ap.add_argument(
        "--db",
        default=os.environ.get("EVIDENCE_DB_PATH")
        or str(Path(__file__).parent / "evidence.db"),
        help="Target SQLite DB (default: evidence.db next to schema.sql).",
    )
    ap.add_argument("--limit", type=int, default=None,
                    help="Stop after N rows. Useful for smoke-testing.")
    ap.add_argument("--chunk", type=int, default=2000,
                    help="Commit every N rows (default 2000).")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.csv_path):
        print(f"CSV not found: {args.csv_path}", file=sys.stderr)
        sys.exit(2)

    ingest_file(args.csv_path, args.db, limit=args.limit,
                chunk_size=args.chunk, verbose=not args.quiet)


if __name__ == "__main__":
    main()

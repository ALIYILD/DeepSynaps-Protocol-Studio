"""enrich_abstracts.py — Pilot abstract enrichment for the top-N most-cited papers.

Selects the top N papers by cited_by_count where abstract IS NULL (or empty),
batches their PMIDs through the EuropePMC REST search endpoint, writes the
returned abstract text back into papers.abstract and sets papers.abstract_source.

Idempotent: rows with a non-empty abstract are skipped.  Re-running with the
same --limit resumes from wherever the previous run stopped.

Migration required before first run:
    DB=/path/to/evidence.db ./migrations/run-migrations.sh
(or: sqlite3 $DB < migrations/008_papers_abstract_source.sql)

Usage:
    python3 enrich_abstracts.py                              # top 10,000, default DB
    python3 enrich_abstracts.py --limit 100                  # smoke test
    python3 enrich_abstracts.py --db /path/to/evidence.db --limit 500 --batch 50
    python3 enrich_abstracts.py --report                     # fill-rate report only

Rate-limiting behaviour:
    EuropePMC does not publish a hard rate limit for the REST API, but their
    documentation suggests <= 10 req/s as a courtesy.  We sleep 1.0s between
    batches by default (--sleep).  On 3 consecutive HTTP 429 responses the
    script stops and prints a resume hint.

Source choice -- EuropePMC over PubMed efetch:
    EuropePMC supports batch lookup via EXT_ID list in a single query, avoids
    the NCBI API key requirement, and covers preprints + PMC full-text records
    in addition to MEDLINE, giving better coverage for our mixed-source corpus.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Path bootstrap -- allow running from any cwd.
# ---------------------------------------------------------------------------
_HERE = Path(__file__).parent
sys.path.insert(0, str(_HERE))
import db as _db  # noqa: E402  (after sys.path mutation)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("enrich_abstracts")

# ---------------------------------------------------------------------------
# EuropePMC constants
# ---------------------------------------------------------------------------
EUROPEPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
DEFAULT_BATCH = 50          # PMIDs per request (EuropePMC handles up to 100)
DEFAULT_LIMIT = 10_000      # top-N papers to target
DEFAULT_SLEEP = 1.0         # seconds between batch requests
MAX_CONSECUTIVE_429 = 3     # abort after this many back-to-back rate-limits
REQUEST_TIMEOUT = 40        # seconds


def _europepmc_batch(pmids: list[str]) -> dict[str, str]:
    """Query EuropePMC for a batch of PMIDs. Returns {pmid: abstract_text}.

    Uses SRC:MED (MEDLINE/PubMed) for PMID lookups.  Papers without a MEDLINE
    record (preprints, EuropePMC-only deposits) will simply be absent from the
    result dict -- the caller leaves their abstract NULL.
    """
    if not pmids:
        return {}

    # Build the query: EXT_ID:PMID1 OR EXT_ID:PMID2 ... AND SRC:MED
    # EuropePMC allows batching via the ext_id:<list> form with resultType=core.
    pmid_clause = " OR ".join(f'EXT_ID:"{p}"' for p in pmids)
    query = f"({pmid_clause}) AND SRC:MED"
    params = urllib.parse.urlencode(
        {
            "query": query,
            "format": "json",
            "pageSize": str(len(pmids)),
            "resultType": "core",
        }
    )
    url = f"{EUROPEPMC_SEARCH}?{params}"

    with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:
        payload: dict[str, Any] = json.loads(resp.read().decode("utf-8"))

    results = payload.get("resultList", {}).get("result", []) or []
    out: dict[str, str] = {}
    for record in results:
        pmid = str(record.get("pmid") or "").strip()
        abstract = (record.get("abstractText") or "").strip()
        if pmid and abstract:
            out[pmid] = abstract
    return out


def _ensure_abstract_source_column(conn) -> None:
    """Add abstract_source column if the migration has not been applied yet."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(papers)")}
    if "abstract_source" not in cols:
        log.warning(
            "abstract_source column missing -- applying inline DDL. "
            "Run 008_papers_abstract_source.sql migration for a clean history."
        )
        conn.execute("ALTER TABLE papers ADD COLUMN abstract_source TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_papers_abstract_source "
            "ON papers(abstract_source)"
        )


def select_candidates(conn, limit: int) -> list[dict]:
    """Return the top `limit` papers by cited_by_count that have no abstract."""
    rows = conn.execute(
        """
        SELECT id, pmid, doi, cited_by_count
        FROM   papers
        WHERE  (abstract IS NULL OR abstract = '')
          AND  pmid IS NOT NULL
        ORDER BY cited_by_count DESC NULLS LAST
        LIMIT  ?
        """,
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def enrich(
    db_path: str,
    limit: int = DEFAULT_LIMIT,
    batch_size: int = DEFAULT_BATCH,
    sleep_seconds: float = DEFAULT_SLEEP,
) -> dict[str, Any]:
    """Main enrichment loop. Returns a summary dict."""
    conn = _db.connect(db_path)
    _ensure_abstract_source_column(conn)

    candidates = select_candidates(conn, limit)
    total = len(candidates)
    log.info("Candidates (pmid, no abstract, top by citations): %d", total)

    if not candidates:
        log.info("Nothing to enrich -- all top-%d papers already have abstracts.", limit)
        conn.close()
        return {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0}

    enriched = 0
    not_found = 0
    errors = 0
    consecutive_429 = 0
    batch_num = 0
    total_batches = -(-total // batch_size)  # ceiling division

    for offset in range(0, total, batch_size):
        chunk = candidates[offset : offset + batch_size]
        pmids = [str(r["pmid"]) for r in chunk]
        pmid_to_id = {str(r["pmid"]): r["id"] for r in chunk}

        batch_num += 1
        log.info(
            "Batch %d/%d  papers %d-%d  (pmids: %d)",
            batch_num,
            total_batches,
            offset + 1,
            min(offset + batch_size, total),
            len(pmids),
        )

        try:
            abstracts = _europepmc_batch(pmids)
            consecutive_429 = 0  # reset on success
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                consecutive_429 += 1
                log.warning(
                    "HTTP 429 (rate limited) -- consecutive count: %d/%d",
                    consecutive_429,
                    MAX_CONSECUTIVE_429,
                )
                if consecutive_429 >= MAX_CONSECUTIVE_429:
                    log.error(
                        "Aborting after %d consecutive 429s. "
                        "Stopped at batch %d (paper offset %d). "
                        "Re-run with --limit %d to resume from where we stopped "
                        "(already-enriched rows are skipped automatically).",
                        MAX_CONSECUTIVE_429,
                        batch_num,
                        offset,
                        limit,
                    )
                    break
                time.sleep(sleep_seconds * 10)  # back off longer on 429
                errors += len(chunk)
                continue
            else:
                log.error("HTTP %d for batch %d: %s", exc.code, batch_num, exc)
                errors += len(chunk)
                consecutive_429 = 0
                time.sleep(sleep_seconds)
                continue
        except Exception as exc:
            log.error("Network error in batch %d: %s", batch_num, exc)
            errors += len(chunk)
            consecutive_429 = 0
            time.sleep(sleep_seconds)
            continue

        # Write results
        for pmid in pmids:
            paper_id = pmid_to_id[pmid]
            abstract_text = abstracts.get(pmid)
            if abstract_text:
                conn.execute(
                    "UPDATE papers SET abstract = ?, abstract_source = ?, "
                    "last_ingested = datetime('now') WHERE id = ?",
                    (abstract_text, "europepmc", paper_id),
                )
                enriched += 1
            else:
                # Mark as attempted so a future re-run with a different source
                # can target these; leave abstract NULL.
                conn.execute(
                    "UPDATE papers SET abstract_source = 'europepmc:not_found', "
                    "last_ingested = datetime('now') "
                    "WHERE id = ? AND (abstract IS NULL OR abstract = '')",
                    (paper_id,),
                )
                not_found += 1

        log.info(
            "  -> found: %d / %d  (running: enriched=%d not_found=%d errors=%d)",
            len(abstracts),
            len(pmids),
            enriched,
            not_found,
            errors,
        )

        if offset + batch_size < total:
            time.sleep(sleep_seconds)

    conn.close()
    return {
        "targeted": total,
        "enriched": enriched,
        "not_found": not_found,
        "errors": errors,
        "fill_rate_pct": round(100 * enriched / total, 2) if total else 0,
    }


def modality_report(conn) -> list[dict]:
    """Fill-rate per modality using the paper_indications join."""
    rows = conn.execute(
        """
        SELECT
            i.modality,
            count(DISTINCT p.id)                                              AS total_papers,
            count(DISTINCT CASE WHEN p.abstract IS NOT NULL AND p.abstract != ''
                                THEN p.id END)                                AS with_abstract,
            count(DISTINCT CASE WHEN p.abstract IS NULL OR p.abstract = ''
                                THEN p.id END)                                AS without_abstract
        FROM   papers p
        JOIN   paper_indications pi ON p.id = pi.paper_id
        JOIN   indications i        ON pi.indication_id = i.id
        GROUP  BY i.modality
        ORDER  BY total_papers DESC
        """
    ).fetchall()
    return [dict(r) for r in rows]


def sample_enriched(conn, n: int = 10) -> list[dict]:
    """Return n random enriched papers with modality and abstract excerpt."""
    rows = conn.execute(
        """
        SELECT
            p.pmid,
            i.modality,
            p.title,
            substr(p.abstract, 1, 300) AS abstract_excerpt,
            p.cited_by_count,
            p.abstract_source
        FROM   papers p
        JOIN   paper_indications pi ON p.id = pi.paper_id
        JOIN   indications i        ON pi.indication_id = i.id
        WHERE  p.abstract IS NOT NULL AND p.abstract != ''
          AND  p.abstract_source = 'europepmc'
        ORDER  BY random()
        LIMIT  ?
        """,
        (n,),
    ).fetchall()
    return [dict(r) for r in rows]


def before_after_stats(conn) -> dict:
    """Abstract length distribution before/after enrichment."""
    row = conn.execute(
        """
        SELECT
            count(*) FILTER (WHERE abstract IS NULL OR abstract = '')           AS empty,
            count(*) FILTER (WHERE abstract IS NOT NULL AND abstract != '')     AS filled,
            avg(length(abstract)) FILTER (WHERE abstract IS NOT NULL
                                            AND abstract != '')                 AS avg_len,
            min(length(abstract)) FILTER (WHERE abstract IS NOT NULL
                                            AND abstract != '')                 AS min_len,
            max(length(abstract)) FILTER (WHERE abstract IS NOT NULL
                                            AND abstract != '')                 AS max_len
        FROM papers
        """
    ).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(
        description="Enrich top-N most-cited papers with abstracts from EuropePMC."
    )
    ap.add_argument(
        "--db",
        default=None,
        help="Path to the SQLite evidence DB. Defaults to db.py resolution order.",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        metavar="N",
        help=f"Target the top-N papers by cited_by_count (default: {DEFAULT_LIMIT}).",
    )
    ap.add_argument(
        "--batch",
        type=int,
        default=DEFAULT_BATCH,
        metavar="SIZE",
        help=f"PMIDs per EuropePMC request (default: {DEFAULT_BATCH}, max: 100).",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=DEFAULT_SLEEP,
        metavar="SECS",
        help=f"Seconds to sleep between batches (default: {DEFAULT_SLEEP}).",
    )
    ap.add_argument(
        "--report",
        action="store_true",
        help="Print fill-rate report and sample rows without running enrichment.",
    )
    args = ap.parse_args()

    db_path = _db.resolve_db_path(args.db)
    log.info("DB: %s", db_path)

    conn = _db.connect(db_path)
    _ensure_abstract_source_column(conn)

    if args.report:
        stats = before_after_stats(conn)
        print("\n=== Abstract coverage (current state) ===")
        print(json.dumps(stats, indent=2))

        print("\n=== Fill-rate by modality ===")
        for row in modality_report(conn):
            pct = (
                round(100 * row["with_abstract"] / row["total_papers"], 1)
                if row["total_papers"]
                else 0
            )
            print(
                f"  {row['modality']:10s}  "
                f"{row['with_abstract']:>5}/{row['total_papers']:<5}  ({pct}%)"
            )

        print("\n=== 5 sample enriched rows ===")
        for s in sample_enriched(conn, n=5):
            print(
                f"  pmid={s['pmid']}  modality={s['modality']}  "
                f"cites={s['cited_by_count']}\n"
                f"  title: {(s['title'] or '')[:100]}\n"
                f"  excerpt: {s['abstract_excerpt']}\n"
            )
        conn.close()
        return

    # --- Before stats
    before = before_after_stats(conn)
    log.info(
        "Before enrichment -- filled: %d  empty: %d  avg_len: %.0f",
        before["filled"],
        before["empty"],
        before["avg_len"] or 0,
    )
    conn.close()

    # --- Enrich
    summary = enrich(db_path, limit=args.limit, batch_size=args.batch, sleep_seconds=args.sleep)
    log.info("Enrichment complete: %s", summary)

    # --- After stats + report
    conn = _db.connect(db_path)
    after = before_after_stats(conn)
    log.info(
        "After enrichment  -- filled: %d  empty: %d  avg_len: %.0f",
        after["filled"],
        after["empty"],
        after["avg_len"] or 0,
    )

    print("\n=== Fill-rate by modality ===")
    for row in modality_report(conn):
        pct = (
            round(100 * row["with_abstract"] / row["total_papers"], 1)
            if row["total_papers"]
            else 0
        )
        print(
            f"  {row['modality']:10s}  "
            f"{row['with_abstract']:>5}/{row['total_papers']:<5}  ({pct}%)"
        )

    print("\n=== 5 sample enriched rows ===")
    for s in sample_enriched(conn, n=5):
        print(
            f"  pmid={s['pmid']}  modality={s['modality']}  cites={s['cited_by_count']}\n"
            f"  title: {(s['title'] or '')[:100]}\n"
            f"  excerpt: {s['abstract_excerpt']}\n"
        )

    conn.close()
    print("\n=== Summary ===")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

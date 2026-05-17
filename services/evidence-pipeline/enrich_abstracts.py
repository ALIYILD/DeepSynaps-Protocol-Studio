"""enrich_abstracts.py — Abstract enrichment for curated and top-cited papers.

Two operating modes
-------------------
Default (--limit N):
    Selects the top N papers by cited_by_count where abstract IS NULL (or empty),
    batches their PMIDs through the EuropePMC REST search endpoint, writes the
    returned abstract text back into papers.abstract and sets papers.abstract_source.

--curated-first:
    First enriches every paper that appears in paper_indications but has no
    abstract yet (regardless of cited_by_count rank).  These are highest-value
    rows because each is linked to a curated indication slug.  After the curated
    set is exhausted, continues with the top-N by cited_by_count (--limit controls
    the top-up cap; the curated set does not count against it).

Idempotent: rows with a non-empty abstract or abstract_source IS NOT NULL are
skipped automatically — re-running is always safe.

Migration required before first run:
    DB=/path/to/evidence.db ./migrations/run-migrations.sh
(or: sqlite3 $DB < migrations/008_papers_abstract_source.sql)

Usage:
    python3 enrich_abstracts.py                                       # top 10,000, default DB
    python3 enrich_abstracts.py --limit 100                           # smoke test
    python3 enrich_abstracts.py --db /path/to/evidence.db --limit 500 --batch 50
    python3 enrich_abstracts.py --curated-first --limit 30000        # GOAL (a)+(b)
    python3 enrich_abstracts.py --report                              # fill-rate report only

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
import defusedxml.ElementTree as ET
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

# ---------------------------------------------------------------------------
# PubMed E-utilities efetch (fallback for EuropePMC misses)
# ---------------------------------------------------------------------------
# Without an API key, NCBI allows ~3 req/sec. We sleep 0.4s between batches.
# Batch size is intentionally smaller than EuropePMC because efetch returns
# a richer XML payload per PMID — paying for both bandwidth and parse time.
PUBMED_EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
PUBMED_BATCH = 50
PUBMED_SLEEP = 0.4

# ---------------------------------------------------------------------------
# CrossRef + OpenAlex (3rd / 4th tier fallbacks, DOI-keyed)
# ---------------------------------------------------------------------------
# Both APIs are per-record (no batch endpoint), so the inner loop calls them
# one DOI at a time. Polite-pool conventions:
#   - mailto in User-Agent → CrossRef puts the request in the polite pool;
#     OpenAlex bumps it to a higher rate limit.
#   - 0.1s sleep between requests = ~10 req/sec, well within both APIs'
#     polite limits even without a registered token.
#
# CrossRef returns abstracts as JATS XML embedded in the JSON `abstract` field.
# OpenAlex returns `abstract_inverted_index`: a {word: [positions]} map that we
# reconstruct back to a flat string.
CROSSREF_WORK_URL = "https://api.crossref.org/works/"      # + DOI
OPENALEX_WORK_URL = "https://api.openalex.org/works/doi:"   # + DOI
DOI_API_SLEEP = 0.1
DOI_API_USER_AGENT = (
    "DeepSynaps-Studio-evidence-pipeline/1.0 (mailto:dr.aliyildirim123@gmail.com)"
)


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


def _pubmed_efetch_batch(pmids: list[str]) -> dict[str, str]:
    """Query NCBI E-utilities efetch for a batch of PMIDs. Returns {pmid: abstract}.

    Used as the second-tier fallback for papers that EuropePMC marked
    'europepmc:not_found'. PubMed has broader MEDLINE coverage than the
    EuropePMC mirror — particularly for older / non-PMC papers.

    Returns only PMIDs that resolved AND had a non-empty AbstractText.
    Multi-section abstracts are joined with ' | ' to preserve the structure
    (Background / Methods / Results / Conclusion) in a single TEXT field.
    """
    if not pmids:
        return {}

    params = urllib.parse.urlencode(
        {
            "db": "pubmed",
            "id": ",".join(pmids),
            "rettype": "abstract",
            "retmode": "xml",
        }
    )
    url = f"{PUBMED_EFETCH_URL}?{params}"

    with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as resp:
        body = resp.read()

    out: dict[str, str] = {}
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        log.warning("pubmed efetch: XML parse error: %s", exc)
        return out

    for article in root.iter("PubmedArticle"):
        pmid_el = article.find(".//PMID")
        if pmid_el is None or not (pmid_el.text or "").strip():
            continue
        pmid = pmid_el.text.strip()
        # AbstractText may be split into Background / Methods / Results sections.
        sections: list[str] = []
        for at in article.iter("AbstractText"):
            label = (at.get("Label") or "").strip()
            text = "".join(at.itertext()).strip()
            if not text:
                continue
            sections.append(f"{label}: {text}" if label else text)
        if sections:
            out[pmid] = " | ".join(sections)
    return out


_JATS_TAG_RE = None  # lazy compile


def _strip_jats_tags(text: str) -> str:
    """CrossRef returns abstracts as JATS XML; strip the tags to plain text."""
    global _JATS_TAG_RE
    if _JATS_TAG_RE is None:
        import re as _re
        _JATS_TAG_RE = _re.compile(r"<[^>]+>")
    cleaned = _JATS_TAG_RE.sub(" ", text)
    return " ".join(cleaned.split()).strip()


def _crossref_one(doi: str) -> str | None:
    """Fetch one abstract from CrossRef by DOI. Returns plain text or None."""
    url = CROSSREF_WORK_URL + urllib.parse.quote(doi, safe="")
    req = urllib.request.Request(url, headers={"User-Agent": DOI_API_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError):
        return None
    abstract = (payload.get("message", {}) or {}).get("abstract")
    if not abstract:
        return None
    cleaned = _strip_jats_tags(abstract)
    return cleaned or None


def _openalex_one(doi: str) -> str | None:
    """Fetch one abstract from OpenAlex by DOI. Reconstructs from inverted index."""
    url = OPENALEX_WORK_URL + urllib.parse.quote(doi, safe="")
    req = urllib.request.Request(url, headers={"User-Agent": DOI_API_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError):
        return None
    inv = payload.get("abstract_inverted_index")
    if not inv:
        return None
    # inv is {word: [positions]}; reconstruct to a flat string by position.
    pos_to_word: dict[int, str] = {}
    for word, positions in inv.items():
        for p in positions:
            pos_to_word[p] = word
    if not pos_to_word:
        return None
    text = " ".join(pos_to_word[i] for i in sorted(pos_to_word))
    return text.strip() or None


def _crossref_batch(dois: list[str]) -> dict[str, str]:
    """Per-record CrossRef calls with polite sleep. Returns {doi: abstract}."""
    out: dict[str, str] = {}
    for i, doi in enumerate(dois):
        if not doi:
            continue
        text = _crossref_one(doi)
        if text:
            out[doi] = text
        if i + 1 < len(dois):
            time.sleep(DOI_API_SLEEP)
    return out


def _openalex_batch(dois: list[str]) -> dict[str, str]:
    """Per-record OpenAlex calls with polite sleep. Returns {doi: abstract}."""
    out: dict[str, str] = {}
    for i, doi in enumerate(dois):
        if not doi:
            continue
        text = _openalex_one(doi)
        if text:
            out[doi] = text
        if i + 1 < len(dois):
            time.sleep(DOI_API_SLEEP)
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
          AND  abstract_source IS NULL
          AND  pmid IS NOT NULL
        ORDER BY cited_by_count DESC NULLS LAST
        LIMIT  ?
        """,
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def select_not_found_candidates(conn, limit: int) -> list[dict]:
    """Rows that EuropePMC couldn't find — retry against PubMed efetch.

    Targets `abstract_source = 'europepmc:not_found'`, ordered by citation
    count so the most-impactful papers are tried first.
    """
    rows = conn.execute(
        """
        SELECT id, pmid, doi, cited_by_count
        FROM   papers
        WHERE  (abstract IS NULL OR abstract = '')
          AND  abstract_source = 'europepmc:not_found'
          AND  pmid IS NOT NULL
        ORDER BY cited_by_count DESC NULLS LAST
        LIMIT  ?
        """,
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def select_by_source_marker(conn, marker: str, limit: int, require_doi: bool = False) -> list[dict]:
    """Generic selector for papers tagged with a specific not-found marker.

    Used for the DOI-keyed 3rd/4th tier passes:
      marker='pubmed:not_found'   → CrossRef pass
      marker='crossref:not_found' → OpenAlex pass
    """
    extra = "AND doi IS NOT NULL AND doi != ''" if require_doi else ""
    rows = conn.execute(
        f"""
        SELECT id, pmid, doi, cited_by_count
        FROM   papers
        WHERE  (abstract IS NULL OR abstract = '')
          AND  abstract_source = ?
          {extra}
        ORDER BY cited_by_count DESC NULLS LAST
        LIMIT  ?
        """,
        (marker, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def select_curated_candidates(conn) -> list[dict]:
    """Return all paper_indications-linked papers with no abstract (not yet attempted).

    These are the highest-value rows — every one is attached to a curated
    indication slug.  Ordered by cited_by_count DESC so the most-cited curated
    papers are fetched first (better for partial-run value).
    """
    rows = conn.execute(
        """
        SELECT DISTINCT p.id, p.pmid, p.doi, p.cited_by_count
        FROM   papers p
        JOIN   paper_indications pi ON pi.paper_id = p.id
        WHERE  (p.abstract IS NULL OR p.abstract = '')
          AND  p.abstract_source IS NULL
          AND  p.pmid IS NOT NULL
        ORDER  BY p.cited_by_count DESC NULLS LAST
        """
    ).fetchall()
    return [dict(r) for r in rows]


def _run_enrichment_loop(
    conn,
    candidates: list[dict],
    batch_size: int,
    sleep_seconds: float,
    label: str = "batch",
    fetch_fn=None,
    source: str = "europepmc",
    id_field: str = "pmid",
) -> dict[str, Any]:
    """Shared inner loop — processes `candidates` and writes results to DB.

    `fetch_fn` defaults to `_europepmc_batch`. Pass alternatives:
      - `_pubmed_efetch_batch` (id_field='pmid', source='pubmed')
      - `_crossref_batch`      (id_field='doi',  source='crossref')
      - `_openalex_batch`      (id_field='doi',  source='openalex')

    `source` is the value written into papers.abstract_source on success;
    the not-found marker becomes f"{source}:not_found". `id_field` selects
    'pmid' or 'doi' as the lookup key in the candidate row dicts.

    Returns a summary dict with keys: targeted, enriched, not_found, errors,
    fill_rate_pct, stopped_early (bool).
    """
    if fetch_fn is None:
        fetch_fn = _europepmc_batch
    total = len(candidates)
    enriched = 0
    not_found = 0
    errors = 0
    consecutive_429 = 0
    batch_num = 0
    total_batches = -(-total // batch_size)  # ceiling division
    stopped_early = False

    for offset in range(0, total, batch_size):
        chunk = candidates[offset : offset + batch_size]
        ids = [str(r[id_field]) for r in chunk if r.get(id_field)]
        id_to_paper_id = {str(r[id_field]): r["id"] for r in chunk if r.get(id_field)}

        batch_num += 1
        log.info(
            "[%s] Batch %d/%d  papers %d-%d  (%ss: %d)",
            label,
            batch_num,
            total_batches,
            offset + 1,
            min(offset + batch_size, total),
            id_field,
            len(ids),
        )

        try:
            abstracts = fetch_fn(ids)
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
                        "Stopped at %s batch %d (paper offset %d). "
                        "Re-run is idempotent — already-enriched rows are skipped.",
                        MAX_CONSECUTIVE_429,
                        label,
                        batch_num,
                        offset,
                    )
                    stopped_early = True
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
        for ident in ids:
            paper_id = id_to_paper_id[ident]
            abstract_text = abstracts.get(ident)
            if abstract_text:
                conn.execute(
                    "UPDATE papers SET abstract = ?, abstract_source = ?, "
                    "last_ingested = datetime('now') WHERE id = ?",
                    (abstract_text, source, paper_id),
                )
                enriched += 1
            else:
                # Mark as attempted so a future re-run with a different source
                # can target these; leave abstract NULL.
                conn.execute(
                    "UPDATE papers SET abstract_source = ?, "
                    "last_ingested = datetime('now') "
                    "WHERE id = ? AND (abstract IS NULL OR abstract = '')",
                    (f"{source}:not_found", paper_id),
                )
                not_found += 1

        log.info(
            "  -> found: %d / %d  (running: enriched=%d not_found=%d errors=%d)",
            len(abstracts),
            len(ids),
            enriched,
            not_found,
            errors,
        )

        if offset + batch_size < total:
            time.sleep(sleep_seconds)

    return {
        "targeted": total,
        "enriched": enriched,
        "not_found": not_found,
        "errors": errors,
        "fill_rate_pct": round(100 * enriched / total, 2) if total else 0,
        "stopped_early": stopped_early,
    }


def enrich(
    db_path: str,
    limit: int = DEFAULT_LIMIT,
    batch_size: int = DEFAULT_BATCH,
    sleep_seconds: float = DEFAULT_SLEEP,
    curated_first: bool = False,
) -> dict[str, Any]:
    """Main enrichment entry point. Returns a summary dict.

    When curated_first=True, runs two phases:
      Phase A — all paper_indications-linked papers with no abstract.
      Phase B — top `limit` additional papers by cited_by_count (skipping
                 already-enriched rows, so picks up from rank 10,001+).

    When curated_first=False (default), runs only the top-limit by citation.
    """
    conn = _db.connect(db_path)
    _ensure_abstract_source_column(conn)

    if curated_first:
        # ---- Phase A: curated -----------------------------------------------
        curated = select_curated_candidates(conn)
        log.info(
            "Phase A (curated-first): %d paper_indications-linked papers need abstracts.",
            len(curated),
        )
        if curated:
            summary_a = _run_enrichment_loop(
                conn, curated, batch_size, sleep_seconds, label="curated"
            )
            log.info("Phase A complete: %s", summary_a)
            if summary_a["stopped_early"]:
                conn.close()
                return {"phase_a": summary_a, "phase_b": None, "stopped_after": "phase_a"}
        else:
            summary_a = {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0,
                         "fill_rate_pct": 0.0, "stopped_early": False}
            log.info("Phase A: nothing to do — all curated papers already have abstracts.")

        # ---- Phase B: top-up by cited_by_count -------------------------------
        log.info(
            "Phase B (top-up): fetching up to %d more papers by cited_by_count "
            "(skipping already-enriched rows).",
            limit,
        )
        topup = select_candidates(conn, limit)
        log.info("Phase B candidates remaining after phase A: %d", len(topup))
        if topup:
            summary_b = _run_enrichment_loop(
                conn, topup, batch_size, sleep_seconds, label="top-up"
            )
            log.info("Phase B complete: %s", summary_b)
        else:
            summary_b = {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0,
                         "fill_rate_pct": 0.0, "stopped_early": False}
            log.info("Phase B: nothing to do.")

        conn.close()
        return {"phase_a": summary_a, "phase_b": summary_b}

    # ---- Original single-phase mode (no --curated-first) --------------------
    candidates = select_candidates(conn, limit)
    total = len(candidates)
    log.info("Candidates (pmid, no abstract, top by citations): %d", total)

    if not candidates:
        log.info("Nothing to enrich -- all top-%d papers already have abstracts.", limit)
        conn.close()
        return {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0,
                "fill_rate_pct": 0.0, "stopped_early": False}

    result = _run_enrichment_loop(conn, candidates, batch_size, sleep_seconds, label="top-cited")
    conn.close()
    return result


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
def _print_modality_table(conn) -> None:
    """Print a per-modality fill-rate table to stdout."""
    TARGET_MODALITIES = {"rTMS", "DBS", "VNS", "SCS", "tDCS", "NFB", "PBM", "ESWT"}
    rows = modality_report(conn)
    print(f"\n{'Modality':<12}  {'with_abstract':>13}  {'total':>7}  {'fill_%':>7}  {'flag':>4}")
    print("-" * 54)
    for row in rows:
        pct = (
            round(100 * row["with_abstract"] / row["total_papers"], 1)
            if row["total_papers"]
            else 0.0
        )
        flag = "<-- target" if row["modality"] in TARGET_MODALITIES else ""
        print(
            f"  {row['modality']:<10}  {row['with_abstract']:>13,}  "
            f"{row['total_papers']:>7,}  {pct:>6.1f}%  {flag}"
        )


def main() -> None:
    ap = argparse.ArgumentParser(
        description=(
            "Enrich papers with abstracts from EuropePMC. "
            "Use --curated-first to prioritise paper_indications-linked rows."
        )
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
        help=(
            f"Target the top-N papers by cited_by_count (default: {DEFAULT_LIMIT}). "
            "With --curated-first this is the Phase B cap (not counting Phase A rows)."
        ),
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
        "--curated-first",
        action="store_true",
        help=(
            "Phase A: enrich every paper linked via paper_indications that has no abstract. "
            "Phase B: top-up with --limit more papers by cited_by_count. "
            "Both phases are idempotent and safe to re-run."
        ),
    )
    ap.add_argument(
        "--report",
        action="store_true",
        help="Print fill-rate report and sample rows without running enrichment.",
    )
    ap.add_argument(
        "--retry-not-found",
        action="store_true",
        help=(
            "Retry papers EuropePMC marked 'not_found' against PubMed efetch. "
            "PubMed has broader MEDLINE coverage (older / non-PMC papers). "
            "Targets up to --limit rows; idempotent — papers that PubMed also "
            "misses get marked 'pubmed:not_found' and won't be retried again."
        ),
    )
    ap.add_argument(
        "--retry-with-crossref",
        action="store_true",
        help=(
            "Retry papers marked 'pubmed:not_found' against CrossRef (DOI-keyed). "
            "Some publishers send abstracts to CrossRef but not EuropePMC/PubMed. "
            "Marks the residual as 'crossref:not_found'."
        ),
    )
    ap.add_argument(
        "--retry-with-openalex",
        action="store_true",
        help=(
            "Retry papers marked 'crossref:not_found' against OpenAlex. "
            "OpenAlex stores abstracts as inverted indices that we reconstruct. "
            "Marks the residual as 'openalex:not_found' — bottom of the funnel."
        ),
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
        _print_modality_table(conn)
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
    t0 = time.monotonic()
    if args.retry_not_found:
        # PubMed efetch fallback for europepmc:not_found rows.
        conn = _db.connect(db_path)
        candidates = select_not_found_candidates(conn, args.limit)
        log.info(
            "PubMed fallback: %d papers marked 'europepmc:not_found' to retry "
            "(--limit cap=%d).",
            len(candidates),
            args.limit,
        )
        if candidates:
            summary = _run_enrichment_loop(
                conn,
                candidates,
                batch_size=PUBMED_BATCH,
                sleep_seconds=PUBMED_SLEEP,
                label="pubmed-fallback",
                fetch_fn=_pubmed_efetch_batch,
                source="pubmed",
            )
        else:
            summary = {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0,
                       "fill_rate_pct": 0.0, "stopped_early": False}
            log.info("PubMed fallback: nothing to do — no 'europepmc:not_found' rows.")
        conn.close()
    elif args.retry_with_crossref:
        # CrossRef fallback for pubmed:not_found rows.
        conn = _db.connect(db_path)
        candidates = select_by_source_marker(
            conn, marker="pubmed:not_found", limit=args.limit, require_doi=True
        )
        log.info(
            "CrossRef fallback: %d papers marked 'pubmed:not_found' (with DOI) "
            "to retry (--limit cap=%d).",
            len(candidates),
            args.limit,
        )
        if candidates:
            summary = _run_enrichment_loop(
                conn,
                candidates,
                batch_size=50,
                sleep_seconds=DOI_API_SLEEP,
                label="crossref-fallback",
                fetch_fn=_crossref_batch,
                source="crossref",
                id_field="doi",
            )
        else:
            summary = {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0,
                       "fill_rate_pct": 0.0, "stopped_early": False}
            log.info("CrossRef fallback: nothing to do.")
        conn.close()
    elif args.retry_with_openalex:
        # OpenAlex fallback for crossref:not_found rows.
        conn = _db.connect(db_path)
        candidates = select_by_source_marker(
            conn, marker="crossref:not_found", limit=args.limit, require_doi=True
        )
        log.info(
            "OpenAlex fallback: %d papers marked 'crossref:not_found' (with DOI) "
            "to retry (--limit cap=%d).",
            len(candidates),
            args.limit,
        )
        if candidates:
            summary = _run_enrichment_loop(
                conn,
                candidates,
                batch_size=50,
                sleep_seconds=DOI_API_SLEEP,
                label="openalex-fallback",
                fetch_fn=_openalex_batch,
                source="openalex",
                id_field="doi",
            )
        else:
            summary = {"targeted": 0, "enriched": 0, "not_found": 0, "errors": 0,
                       "fill_rate_pct": 0.0, "stopped_early": False}
            log.info("OpenAlex fallback: nothing to do.")
        conn.close()
    else:
        summary = enrich(
            db_path,
            limit=args.limit,
            batch_size=args.batch,
            sleep_seconds=args.sleep,
            curated_first=args.curated_first,
        )
    elapsed = time.monotonic() - t0
    log.info("Enrichment complete in %.1f s: %s", elapsed, summary)

    # --- After stats + report
    conn = _db.connect(db_path)
    after = before_after_stats(conn)
    log.info(
        "After enrichment  -- filled: %d  empty: %d  avg_len: %.0f",
        after["filled"],
        after["empty"],
        after["avg_len"] or 0,
    )

    _print_modality_table(conn)

    print("\n=== 5 sample enriched rows ===")
    for s in sample_enriched(conn, n=5):
        print(
            f"  pmid={s['pmid']}  modality={s['modality']}  cites={s['cited_by_count']}\n"
            f"  title: {(s['title'] or '')[:100]}\n"
            f"  excerpt: {s['abstract_excerpt']}\n"
        )

    conn.close()
    print(f"\n=== Summary (elapsed: {elapsed:.0f}s) ===")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

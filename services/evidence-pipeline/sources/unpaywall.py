"""Unpaywall: resolve a DOI to its best open-access URL."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

EMAIL = os.environ.get("UNPAYWALL_EMAIL", "")


def resolve(doi: str) -> tuple[bool, str | None]:
    """Return (is_oa, best_oa_url). Returns (False, None) on miss or error."""
    if not EMAIL or not doi:
        return (False, None)
    url = f"https://api.unpaywall.org/v2/{urllib.parse.quote(doi)}?email={urllib.parse.quote(EMAIL)}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read().decode())
    except Exception:
        return (False, None)
    is_oa = bool(data.get("is_oa"))
    best = data.get("best_oa_location") or {}
    return (is_oa, best.get("url_for_pdf") or best.get("url"))


def backfill(conn, limit: int = 500) -> int:
    """Resolve OA status for papers with a DOI but no is_oa set. Polite-paced."""
    rows = conn.execute(
        "SELECT id, doi FROM papers WHERE doi IS NOT NULL AND is_oa IS NULL LIMIT ?",
        (limit,),
    ).fetchall()
    n = 0
    for row in rows:
        is_oa, url = resolve(row["doi"])
        conn.execute(
            "UPDATE papers SET is_oa=?, oa_url=COALESCE(?, oa_url) WHERE id=?",
            (1 if is_oa else 0, url, row["id"]),
        )
        n += 1
        time.sleep(0.12)  # ~8 req/s, well inside Unpaywall's published policy
    return n

#!/usr/bin/env python3

import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


QUERY = "neuromodulation"
PAGE_SIZE = 1000
BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
OUTPUT = Path("/Users/aliyildirim/neuromodulation_papers_europepmc.csv")


def fetch_page(cursor_mark: str) -> dict:
    params = {
        "query": QUERY,
        "format": "json",
        "pageSize": PAGE_SIZE,
        "cursorMark": cursor_mark,
        "resultType": "core",
    }
    url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"

    for attempt in range(5):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "codex-exporter/1.0 (academic metadata export)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 4:
                raise
            wait_s = 2 ** attempt
            print(
                f"Request failed for cursor {cursor_mark!r}: {exc}. Retrying in {wait_s}s.",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(wait_s)


def dedupe_key(record: dict) -> tuple:
    doi = (record.get("doi") or "").strip().lower()
    if doi:
        return ("doi", doi)

    pmid = (record.get("pmid") or "").strip()
    if pmid:
        return ("pmid", pmid)

    pmcid = (record.get("pmcid") or "").strip().lower()
    if pmcid:
        return ("pmcid", pmcid)

    title = " ".join((record.get("title") or "").strip().lower().split())
    year = (record.get("pubYear") or "").strip()
    return ("title_year", title, year)


def as_row(record: dict) -> dict:
    return {
        "query": QUERY,
        "source": record.get("source", ""),
        "id": record.get("id", ""),
        "pmid": record.get("pmid", ""),
        "pmcid": record.get("pmcid", ""),
        "doi": record.get("doi", ""),
        "title": record.get("title", ""),
        "authors": record.get("authorString", ""),
        "journal": record.get("journalTitle", ""),
        "year": record.get("pubYear", ""),
        "pub_type": record.get("pubType", ""),
        "is_open_access": record.get("isOpenAccess", ""),
        "cited_by_count": record.get("citedByCount", ""),
        "first_publication_date": record.get("firstPublicationDate", ""),
        "first_index_date": record.get("firstIndexDate", ""),
        "europe_pmc_url": (
            f"https://europepmc.org/article/{record.get('source', '')}/{record.get('id', '')}"
            if record.get("source") and record.get("id")
            else ""
        ),
    }


def main() -> int:
    cursor_mark = "*"
    seen = set()
    total_hits = None
    fetched = 0
    written = 0

    fieldnames = [
        "query",
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
    ]

    with OUTPUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        fh.flush()

        while True:
            payload = fetch_page(cursor_mark)
            if total_hits is None:
                total_hits = int(payload.get("hitCount", 0))
                print(f"Europe PMC hit count: {total_hits}", file=sys.stderr, flush=True)

            results = payload.get("resultList", {}).get("result", [])
            if not results:
                break

            for record in results:
                fetched += 1
                key = dedupe_key(record)
                if key in seen:
                    continue
                seen.add(key)
                writer.writerow(as_row(record))
                written += 1

            fh.flush()
            print(
                f"Fetched {fetched} raw records, wrote {written} unique records",
                file=sys.stderr,
                flush=True,
            )

            next_cursor = payload.get("nextCursorMark")
            if not next_cursor or next_cursor == cursor_mark:
                break
            cursor_mark = next_cursor
            time.sleep(0.1)

    print(f"Wrote {written} rows to {OUTPUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

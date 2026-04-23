#!/usr/bin/env python3

import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import List


BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
PAGE_SIZE = 1000
OUTPUT = Path("/Users/aliyildirim/neuromodulation_papers_modalities_europepmc.csv")

# Broad, clinically relevant modality coverage for neuromodulation literature harvesting.
MODALITY_QUERIES = {
    "general_neuromodulation": [
        '"neuromodulation"',
    ],
    "deep_brain_stimulation": [
        '"deep brain stimulation"',
        '"DBS"',
    ],
    "responsive_neurostimulation": [
        '"responsive neurostimulation"',
        '"RNS"',
    ],
    "vagus_nerve_stimulation": [
        '"vagus nerve stimulation"',
        '"vagal nerve stimulation"',
        '"VNS"',
    ],
    "auricular_vagus_nerve_stimulation": [
        '"auricular vagus nerve stimulation"',
        '"transcutaneous auricular vagus nerve stimulation"',
        '"taVNS"',
    ],
    "transcranial_magnetic_stimulation": [
        '"transcranial magnetic stimulation"',
        '"TMS"',
        '"rTMS"',
        '"theta burst stimulation"',
        '"iTBS"',
        '"cTBS"',
    ],
    "transcranial_direct_current_stimulation": [
        '"transcranial direct current stimulation"',
        '"tDCS"',
    ],
    "transcranial_alternating_current_stimulation": [
        '"transcranial alternating current stimulation"',
        '"tACS"',
    ],
    "transcranial_random_noise_stimulation": [
        '"transcranial random noise stimulation"',
        '"tRNS"',
    ],
    "transcranial_pulsed_current_stimulation": [
        '"transcranial pulsed current stimulation"',
        '"tPCS"',
    ],
    "focused_ultrasound_neuromodulation": [
        '"focused ultrasound neuromodulation"',
        '"low-intensity focused ultrasound"',
        '"transcranial focused ultrasound"',
        '"LIFU"',
    ],
    "spinal_cord_stimulation": [
        '"spinal cord stimulation"',
        '"SCS"',
        '"dorsal column stimulation"',
    ],
    "dorsal_root_ganglion_stimulation": [
        '"dorsal root ganglion stimulation"',
    ],
    "peripheral_nerve_stimulation": [
        '"peripheral nerve stimulation"',
        '"PNS"',
    ],
    "sacral_neuromodulation": [
        '"sacral neuromodulation"',
        '"sacral nerve stimulation"',
        '"SNS"',
    ],
    "tibial_nerve_stimulation": [
        '"posterior tibial nerve stimulation"',
        '"percutaneous tibial nerve stimulation"',
        '"transcutaneous tibial nerve stimulation"',
        '"PTNS"',
        '"TTNS"',
    ],
    "trigeminal_nerve_stimulation": [
        '"trigeminal nerve stimulation"',
        '"TNS"',
    ],
    "occipital_nerve_stimulation": [
        '"occipital nerve stimulation"',
        '"ONS"',
    ],
    "hypoglossal_nerve_stimulation": [
        '"hypoglossal nerve stimulation"',
    ],
    "motor_cortex_stimulation": [
        '"motor cortex stimulation"',
        '"cortical stimulation"',
    ],
}


def modality_query(terms: List[str]) -> str:
    scoped = []
    for term in terms:
        term_value = term.strip()
        if not term_value:
            continue
        scoped.append(f"(TITLE:{term_value} OR ABSTRACT:{term_value} OR KW:{term_value})")
    return " OR ".join(scoped)


def fetch_page(query: str, cursor_mark: str) -> dict:
    params = {
        "query": query,
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
                f"Request failed for query {query[:80]!r}, cursor {cursor_mark!r}: {exc}. Retrying in {wait_s}s.",
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


def base_row(record: dict) -> dict:
    return {
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
    records = {}
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
    ]

    for modality, terms in MODALITY_QUERIES.items():
        query = modality_query(terms)
        cursor_mark = "*"
        total_hits = None
        fetched = 0

        print(f"Starting modality: {modality}", file=sys.stderr, flush=True)

        while True:
            payload = fetch_page(query, cursor_mark)
            if total_hits is None:
                total_hits = int(payload.get("hitCount", 0))
                print(
                    f"  hit count for {modality}: {total_hits}",
                    file=sys.stderr,
                    flush=True,
                )

            results = payload.get("resultList", {}).get("result", [])
            if not results:
                break

            for record in results:
                fetched += 1
                key = dedupe_key(record)
                row = records.setdefault(
                    key,
                    {
                        **base_row(record),
                        "matched_modalities": set(),
                        "matched_query_terms": set(),
                    },
                )
                row["matched_modalities"].add(modality)
                row["matched_query_terms"].update(term.strip('"') for term in terms)

            print(
                f"  fetched {fetched} raw records for {modality}; master unique set is {len(records)}",
                file=sys.stderr,
                flush=True,
            )

            next_cursor = payload.get("nextCursorMark")
            if not next_cursor or next_cursor == cursor_mark:
                break
            cursor_mark = next_cursor
            time.sleep(0.1)

    with OUTPUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in sorted(
            records.values(),
            key=lambda item: (
                str(item.get("year", "")),
                str(item.get("title", "")).lower(),
            ),
            reverse=True,
        ):
            out = row.copy()
            out["matched_modalities"] = "; ".join(sorted(row["matched_modalities"]))
            out["matched_query_terms"] = "; ".join(sorted(row["matched_query_terms"]))
            writer.writerow(out)

    print(f"Wrote {len(records)} rows to {OUTPUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

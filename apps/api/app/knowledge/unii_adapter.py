#!/usr/bin/env python3
"""
UNII Adapter  –  FDA Unique Ingredient Identifier
==================================================

* Data source : https://precision.fda.gov/uniisearch/archive/latest
* Format      : ZIP → CSV (UNII_Data.csv)
* Records     : 200 000+ substances
* Update cadence : Quarterly
* Confidence  : A (FDA — authoritative)

Canonical output
----------------
Each CSV row becomes a :class:`Substance` with UNII code, name, type,
synonyms, InChIKey and CAS number when available.
"""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from .base_adapter import BaseAdapter, FetchError, logger
from .models import ConfidenceTier, Provenance, Substance, compute_hash

logger = logging.getLogger("batch_c.unii")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

UNII_ZIP_URL = "https://precision.fda.gov/uniisearch/archive/latest/unii_data.zip"
UNII_ZIP_ALT = "https://precision.fda.gov/uniisearch/archive/latest/unii_data.zip"

CACHE_SUBDIR = "unii"
CACHE_FILE_RAW = "raw.pkl"
CACHE_FILE_CANONICAL = "canonical.json.gz"

# Expected columns inside the ZIP CSV
UNII_COLUMNS = [
    "NAME",
    "TYPE",
    "UNII",
    "DISPLAY_NAME",
    "INCHIKEY",
    "SMILES",
    "INCHI",
    "IUPAC_NAME",
    "CAS_NUMBER",
    "SUBSTANCE_DEFINITION",
    "EC_NUMBER",
    "RNA_ID",
    "PROTEIN_ID",
    "NCBI_TAXONOMY_ID",
    "MOLFORMULA",
    "MOLECULAR_WEIGHT",
    "MOLFILE",
    "CLASS",
    "SUBCLASS",
    "DISPLAY_NAME_TYPE",
    "ATOMIC_WEIGHT",
    "ATOMIC_NUMBER",
    "COLLATERAL_CODES",
    "AA_UNII",
    "DSSR_ID",
    "USED_IN_PRODUCT",
    "USED_IN_PRODUCT_DATE",
    "USED_AS",
    "USED_AS_DATE",
]

# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class UniiAdapter(BaseAdapter):
    """Fetch, transform and cache FDA UNII substance identifiers."""

    source_name = "unii"
    source_url = UNII_ZIP_URL
    confidence_tier = "A"
    cache_subdir = CACHE_SUBDIR
    cache_file_raw = CACHE_FILE_RAW
    cache_file_canonical = CACHE_FILE_CANONICAL

    # ------------------------------------------------------------------
    # fetch
    # ------------------------------------------------------------------
    def fetch(self) -> List[Dict[str, str]]:
        """Download UNII ZIP and parse the CSV inside."""
        cached = self._load_raw_cache()
        if cached is not None:
            logger.info("[%s] Using cached raw data", self.source_name)
            return cached  # type: ignore[return-value]

        logger.info("[%s] Downloading UNII ZIP …", self.source_name)
        try:
            resp = self._http_get(UNII_ZIP_URL, stream=True)
        except Exception:
            logger.warning("[%s] Primary URL failed, trying fallback …", self.source_name)
            resp = self._http_get(UNII_ZIP_ALT, stream=True)

        try:
            zf = zipfile.ZipFile(io.BytesIO(resp.content))
            names = zf.namelist()
        except zipfile.BadZipFile as exc:
            raise FetchError(f"Downloaded file is not a valid ZIP: {exc}") from exc

        # find the CSV file inside the ZIP
        csv_files = [n for n in names if n.lower().endswith(".csv")]
        if not csv_files:
            raise FetchError(f"No CSV file found inside UNII ZIP; contents: {names}")

        fname = csv_files[0]
        logger.info("[%s] Reading CSV from ZIP: %s", self.source_name, fname)

        with zf.open(fname) as fh:
            lines = [ln.decode("utf-8", errors="replace") for ln in fh]

        # Detect delimiter – UNII CSV can be tab or comma delimited
        delimiter = "\t" if "\t" in lines[0] else ","
        reader = csv.DictReader(lines, delimiter=delimiter)
        rows = []
        for row in reader:
            cleaned = {k.strip().upper(): (v or "").strip() for k, v in row.items()}
            rows.append(cleaned)

        self._save_raw_to_cache(rows)
        logger.info("[%s] Parsed %d UNII substance rows", self.source_name, len(rows))
        return rows

    def _save_raw_to_cache(self, data: List[Dict[str, str]]) -> None:
        import pickle
        try:
            with open(self._raw_cache_path, "wb") as fh:
                pickle.dump(data, fh, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception as exc:
            logger.warning("[%s] Failed to write raw cache: %s", self.source_name, exc)

    # ------------------------------------------------------------------
    # transform
    # ------------------------------------------------------------------
    def transform(self, raw: List[Dict[str, str]]) -> List[Substance]:
        """Convert UNII rows → Substance objects."""
        substances: List[Substance] = []
        prov = Provenance(
            source=self.source_name,
            source_url=self.source_url,
            confidence_tier=ConfidenceTier.AUTHORITY,
        )

        seen_codes: set[str] = set()
        for row in raw:
            try:
                sub = self._row_to_substance(row, prov)
            except Exception as exc:
                logger.debug("[%s] Skipping malformed row: %s", self.source_name, exc)
                continue
            # deduplicate on UNII code
            if sub.unii_code in seen_codes:
                continue
            seen_codes.add(sub.unii_code)
            substances.append(sub)

        logger.info("[%s] Transformed %d unique substances", self.source_name, len(substances))
        return substances

    def _row_to_substance(self, row: Dict[str, str], prov: Provenance) -> Substance:
        """Parse a single UNII CSV row."""
        name = row.get("NAME", "").strip()
        display_name = row.get("DISPLAY_NAME", "").strip()
        unii_code = row.get("UNII", "").strip()
        sub_type = row.get("TYPE", "").strip()
        inchikey = row.get("INCHIKEY", "").strip() or None
        cas_number = row.get("CAS_NUMBER", "").strip() or None

        # synonyms – split on pipe if present, otherwise use IUPAC name
        synonyms: List[str] = []
        iupac = row.get("IUPAC_NAME", "").strip()
        if iupac and iupac != name and iupac != display_name:
            synonyms.append(iupac)

        sub = Substance(
            name=name or display_name or unii_code,
            synonyms=synonyms,
            unii_code=unii_code,
            substance_type=sub_type or "unknown",
            inchikey=inchikey,
            cas_number=cas_number,
            provenance=Provenance(
                source=prov.source,
                source_url=prov.source_url,
                confidence_tier=prov.confidence_tier,
            ),
        )
        return sub

    # ------------------------------------------------------------------
    # validation
    # ------------------------------------------------------------------
    def _validate_one(self, record: Substance) -> tuple[bool, Optional[str]]:
        if not record.unii_code or len(record.unii_code) < 4:
            return False, f"invalid UNII code: {record.unii_code}"
        if not record.name:
            return False, "missing substance name"
        return True, None


# ---------------------------------------------------------------------------
# Lookup helpers (useful for cross-referencing)
# ---------------------------------------------------------------------------

def lookup_by_name(adapter: UniiAdapter, query: str) -> List[Substance]:
    """Return substances whose name contains *query* (case-insensitive)."""
    q = query.lower()
    results = []
    for sub in adapter.transform(adapter.fetch()):
        if q in sub.name.lower() or any(q in s.lower() for s in sub.synonyms):
            results.append(sub)
    return results


def lookup_by_unii(adapter: UniiAdapter, code: str) -> Optional[Substance]:
    """Return the substance matching an exact UNII code."""
    code = code.strip().upper()
    for sub in adapter.transform(adapter.fetch()):
        if sub.unii_code.upper() == code:
            return sub
    return None


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    adapter = UniiAdapter()
    summary = adapter.run()
    print(summary)


if __name__ == "__main__":
    main()

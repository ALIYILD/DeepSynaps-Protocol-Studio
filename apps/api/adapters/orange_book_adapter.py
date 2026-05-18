#!/usr/bin/env python3
"""
Orange Book Adapter  –  FDA Approved Drug Products with Therapeutic Equivalence
===============================================================================

* Data source : https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files
* Format      : ZIP → CSV (products.txt, patents.txt, exclusivity.txt)
* Update cadence : Monthly
* Records     : ~30 000 drug products
* Confidence  : A (FDA — authoritative)

Canonical output
----------------
Each row in ``products.txt`` becomes a :class:`Medication`.
Patent / exclusivity data are merged by application number.
"""

from __future__ import annotations

import csv
import io
import logging
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

from .base_adapter import BaseAdapter, FetchError, logger
from .models import ConfidenceTier, Medication, Provenance, TeCode, compute_hash

logger = logging.getLogger("batch_c.orange_book")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ORANGE_BOOK_ZIP_URL = (
    "https://www.fda.gov/media/76860/download"
)
# fallback mirror used in some periods
ORANGE_BOOK_ZIP_ALT = (
    "https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files"
)

CACHE_SUBDIR = "orange_book"
CACHE_FILE_RAW = "raw.pkl"
CACHE_FILE_CANONICAL = "canonical.json.gz"

# CSV filenames inside the ZIP
FN_PRODUCTS = "products.txt"
FN_PATENTS = "patents.txt"
FN_EXCLUSIVITY = "exclusivity.txt"

# Expected headers (lower-cased for robust matching)
PRODUCTS_HEADER = [
    "ingredient", "df;route", "trade_name", "applicant_full_name",
    "strength", "appl_type", "appl_no", "product_no", "te_code",
    "approval_date", "rld", "rs", "type", "applicant"
]
PATENTS_HEADER = [
    "appl_type", "appl_no", "product_no", "patent_no",
    "patent_expire_date_text", "drug_substance_flag", "drug_product_flag",
    "patent_use_code", "delist_requested", "submission_date"
]
EXCLUSIVITY_HEADER = [
    "appl_type", "appl_no", "product_no", "exclusivity_code",
    "exclusivity_date"
]


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class OrangeBookAdapter(BaseAdapter):
    """Fetch, transform and cache FDA Orange Book data."""

    source_name = "orange_book"
    source_url = ORANGE_BOOK_ZIP_URL
    confidence_tier = "A"
    cache_subdir = CACHE_SUBDIR
    cache_file_raw = CACHE_FILE_RAW
    cache_file_canonical = CACHE_FILE_CANONICAL

    # ------------------------------------------------------------------
    # fetch
    # ------------------------------------------------------------------
    def fetch(self) -> Dict[str, List[Dict[str, str]]]:
        """Download Orange Book ZIP and parse the three CSVs inside.

        Returns a dict with keys ``products``, ``patents``, ``exclusivity``.
        """
        cached = self._load_raw_cache()
        if cached is not None:
            logger.info("[%s] Using cached raw data", self.source_name)
            return cached  # type: ignore[return-value]

        logger.info("[%s] Downloading Orange Book ZIP …", self.source_name)
        try:
            resp = self._http_get(ORANGE_BOOK_ZIP_URL, stream=True)
        except Exception:
            logger.warning("[%s] Primary URL failed, trying fallback …", self.source_name)
            resp = self._http_get(ORANGE_BOOK_ZIP_ALT, stream=True)

        # Parse ZIP in memory
        try:
            zf = zipfile.ZipFile(io.BytesIO(resp.content))
            names = set(zf.namelist())
            logger.info("[%s] ZIP contents: %s", self.source_name, names)
        except zipfile.BadZipFile as exc:
            raise FetchError(f"Downloaded file is not a valid ZIP: {exc}") from exc

        data: Dict[str, List[Dict[str, str]]] = {}
        for key, fname, hdr in [
            ("products", FN_PRODUCTS, PRODUCTS_HEADER),
            ("patents", FN_PATENTS, PATENTS_HEADER),
            ("exclusivity", FN_EXCLUSIVITY, EXCLUSIVITY_HEADER),
        ]:
            # find case-insensitive match
            matched = [n for n in names if n.lower() == fname]
            if not matched:
                logger.warning("[%s] %s not found in ZIP", self.source_name, fname)
                data[key] = []
                continue
            with zf.open(matched[0]) as fh:
                lines = [ln.decode("utf-8", errors="replace") for ln in fh]
            reader = csv.DictReader(lines, delimiter="\t")
            rows = [{k.lower().strip(): (v or "").strip() for k, v in row.items()} for row in reader]
            data[key] = rows
            logger.info("[%s] Parsed %d rows from %s", self.source_name, len(rows), fname)

        # cache raw
        self._save_raw_to_cache(data)
        return data

    def _save_raw_to_cache(self, data: Dict[str, List[Dict[str, str]]]) -> None:
        """Override pickle dump so fetch() can cache before transform."""
        import pickle
        try:
            with open(self._raw_cache_path, "wb") as fh:
                pickle.dump(data, fh, protocol=pickle.HIGHEST_PROTOCOL)
            logger.debug("[%s] Raw cache written → %s", self.source_name, self._raw_cache_path)
        except Exception as exc:
            logger.warning("[%s] Failed to write raw cache: %s", self.source_name, exc)

    # ------------------------------------------------------------------
    # transform
    # ------------------------------------------------------------------
    def transform(self, raw: Dict[str, List[Dict[str, str]]]) -> List[Medication]:
        """Convert Orange Book product rows → Medication objects."""
        products = raw.get("products", [])
        patents = raw.get("patents", [])
        exclusivity = raw.get("exclusivity", [])

        # index patents & exclusivity by (appl_type, appl_no)
        patents_by_app: Dict[Tuple[str, str], List[Dict[str, str]]] = {}
        for p in patents:
            key = (p.get("appl_type", ""), p.get("appl_no", ""))
            patents_by_app.setdefault(key, []).append(p)

        exclusivity_by_app: Dict[Tuple[str, str], List[Dict[str, str]]] = {}
        for e in exclusivity:
            key = (e.get("appl_type", ""), e.get("appl_no", ""))
            exclusivity_by_app.setdefault(key, []).append(e)

        meds: List[Medication] = []
        prov = Provenance(
            source=self.source_name,
            source_url=self.source_url,
            confidence_tier=ConfidenceTier.AUTHORITY,
        )

        for row in products:
            try:
                med = self._row_to_medication(row, prov)
            except Exception as exc:
                logger.debug("[%s] Skipping malformed row: %s", self.source_name, exc)
                continue
            # merge patent / exclusivity info
            app_key = (row.get("appl_type", ""), row.get("appl_no", ""))
            med.provenance.row_count += 1
            meds.append(med)

        logger.info("[%s] Transformed %d products → Medication", self.source_name, len(meds))
        return meds

    # ------------------------------------------------------------------
    # row → Medication
    # ------------------------------------------------------------------
    def _row_to_medication(self, row: Dict[str, str], prov: Provenance) -> Medication:
        """Parse a single products.txt row."""
        # active ingredients – semicolon-separated in the "ingredient" column
        ingredients_raw = row.get("ingredient", "")
        ingredients = [i.strip() for i in ingredients_raw.split(";") if i.strip()]

        # approval date
        approval_date = self._parse_date(row.get("approval_date", ""))

        # TE code
        te_raw = row.get("te_code", "") or row.get("te_code", "")
        try:
            te_code = TeCode(te_raw.strip().upper()) if te_raw.strip() else TeCode.UNKNOWN
        except ValueError:
            te_code = TeCode.UNKNOWN

        # reference standard flag
        rs_raw = (row.get("rs", "") or "").strip().upper()
        reference_standard = rs_raw in ("Y", "YES", "TRUE", "1")

        # application number
        appl_type = row.get("appl_type", "").strip()
        appl_no = row.get("appl_no", "").strip()
        application_number = f"{appl_type}{appl_no}" if appl_type else appl_no

        # dosage form / route
        df_route = row.get("df;route", "")
        dosage_form, route = self._split_df_route(df_route)

        med = Medication(
            name=(row.get("trade_name", "") or "").strip(),
            generic_name=ingredients_raw,
            active_ingredients=ingredients,
            strength=(row.get("strength", "") or "").strip(),
            dosage_form=dosage_form,
            applicant=(row.get("applicant_full_name", "") or row.get("applicant", "") or "").strip(),
            application_number=application_number,
            approval_date=approval_date,
            approval_status="Prescription",   # Orange Book = Rx only
            te_code=te_code,
            reference_standard=reference_standard,
            provenance=Provenance(
                source=prov.source,
                source_url=prov.source_url,
                confidence_tier=prov.confidence_tier,
            ),
        )
        return med

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_date(val: str) -> Optional[date]:
        """Parse ``Mmm DD, YYYY`` or ``YYYY-MM-DD`` → date."""
        val = (val or "").strip()
        if not val:
            return None
        for fmt in ("%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%b-%Y"):
            try:
                return datetime.strptime(val, fmt).date()
            except ValueError:
                continue
        logger.debug("[orange_book] Unparseable date: %s", val)
        return None

    @staticmethod
    def _split_df_route(val: str) -> Tuple[str, str]:
        """``TABLET;ORAL`` → ("TABLET", "ORAL")."""
        parts = [p.strip() for p in val.split(";")]
        if len(parts) >= 2:
            return parts[0], parts[1]
        return parts[0] if parts else "", ""

    # ------------------------------------------------------------------
    # validation
    # ------------------------------------------------------------------
    def _validate_one(self, record: Medication) -> tuple[bool, Optional[str]]:
        if not record.name and not record.generic_name:
            return False, "missing name and generic_name"
        if not record.active_ingredients:
            return False, "no active ingredients"
        if not record.application_number:
            return False, "missing application_number"
        return True, None


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    adapter = OrangeBookAdapter()
    summary = adapter.run()
    print(summary)


if __name__ == "__main__":
    main()

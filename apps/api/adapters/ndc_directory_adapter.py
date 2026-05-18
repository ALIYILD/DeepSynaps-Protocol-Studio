#!/usr/bin/env python3
"""
NDC Directory Adapter  –  FDA National Drug Code
================================================

* Data source : https://www.accessdata.fda.gov/cder/ndc/ (download page)
  Direct download : https://www.accessdata.fda.gov/cder/ndc/ndc_database.zip
* Format      : ZIP → CSV (product.txt, package.txt)
* Records     : 300 000+ products / packages
* Update cadence : Daily
* Confidence  : A (FDA — authoritative)

Canonical output
----------------
Each product row becomes a :class:`Medication` with attached NDC package
codes.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

from .base_adapter import BaseAdapter, FetchError, logger
from .models import ConfidenceTier, Medication, Provenance, compute_hash

logger = logging.getLogger("batch_c.ndc_directory")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NDC_ZIP_URL = "https://www.accessdata.fda.gov/cder/ndc/ndc_database.zip"
NDC_ZIP_ALT = "https://www.accessdata.fda.gov/cder/ndc/ndc_database.zip"

CACHE_SUBDIR = "ndc_directory"
CACHE_FILE_RAW = "raw.pkl"
CACHE_FILE_CANONICAL = "canonical.json.gz"

FN_PRODUCT = "product.txt"
FN_PACKAGE = "package.txt"

PRODUCT_HEADER = [
    "PRODUCTID", "PRODUCTNDC", "PRODUCTTYPENAME",
    "PROPRIETARYNAME", "PROPRIETARYNAMESUFFIX",
    "NONPROPRIETARYNAME", "DOSAGEFORMNAME",
    "ROUTENAME", "STARTMARKETINGDATE", "ENDMARKETINGDATE",
    "MARKETINGCATEGORYNAME", "APPLICATIONNUMBER",
    "LABELERNAME", "SUBSTANCENAME", "ACTIVE_NUMERATOR_STRENGTH",
    "ACTIVE_INGRED_UNIT", "PHARM_CLASSES",
    "DEASCHEDULE", "NDC_EXCLUDE_FLAG", "LISTING_RECORD_CERTIFIED_THROUGH",
]

PACKAGE_HEADER = [
    "PRODUCTID", "PRODUCTNDC", "NDCPACKAGECODE",
    "PACKAGEDESCRIPTION", "STARTMARKETINGDATE",
    "ENDMARKETINGDATE", "NDC_EXCLUDE_FLAG",
    "SAMPLE_PACKAGE",
]


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class NdcDirectoryAdapter(BaseAdapter):
    """Fetch, transform and cache FDA NDC Directory."""

    source_name = "ndc_directory"
    source_url = NDC_ZIP_URL
    confidence_tier = "A"
    cache_subdir = CACHE_SUBDIR
    cache_file_raw = CACHE_FILE_RAW
    cache_file_canonical = CACHE_FILE_CANONICAL

    # ------------------------------------------------------------------
    # fetch
    # ------------------------------------------------------------------
    def fetch(self) -> Dict[str, List[Dict[str, str]]]:
        """Download NDC ZIP and parse product + package CSVs.

        Returns ``{"products": [...], "packages": [...]}``.
        """
        cached = self._load_raw_cache()
        if cached is not None:
            logger.info("[%s] Using cached raw data", self.source_name)
            return cached  # type: ignore[return-value]

        logger.info("[%s] Downloading NDC ZIP …", self.source_name)
        try:
            resp = self._http_get(NDC_ZIP_URL, stream=True)
        except Exception:
            logger.warning("[%s] Primary URL failed, trying fallback …", self.source_name)
            resp = self._http_get(NDC_ZIP_ALT, stream=True)

        try:
            zf = zipfile.ZipFile(io.BytesIO(resp.content))
            names = set(zf.namelist())
        except zipfile.BadZipFile as exc:
            raise FetchError(f"Downloaded file is not a valid ZIP: {exc}") from exc

        data: Dict[str, List[Dict[str, str]]] = {}

        # product
        matched = [n for n in names if n.lower() == FN_PRODUCT]
        if matched:
            data["products"] = self._read_csv(zf, matched[0])
        else:
            logger.error("[%s] %s missing from ZIP", self.source_name, FN_PRODUCT)
            data["products"] = []

        # package
        matched = [n for n in names if n.lower() == FN_PACKAGE]
        if matched:
            data["packages"] = self._read_csv(zf, matched[0])
        else:
            logger.error("[%s] %s missing from ZIP", self.source_name, FN_PACKAGE)
            data["packages"] = []

        self._save_raw_to_cache(data)
        logger.info(
            "[%s] Loaded %d products, %d packages",
            self.source_name, len(data["products"]), len(data["packages"]),
        )
        return data

    def _read_csv(self, zf: zipfile.ZipFile, fname: str) -> List[Dict[str, str]]:
        """Read a single CSV from the ZIP archive."""
        with zf.open(fname) as fh:
            lines = [ln.decode("utf-8", errors="replace") for ln in fh]
        dialect = csv.Sniffer().sniff(lines[0], delimiters="\t,")
        reader = csv.DictReader(lines, delimiter=dialect.delimiter)
        rows = []
        for row in reader:
            cleaned = {k.strip().upper(): (v or "").strip() for k, v in row.items()}
            rows.append(cleaned)
        logger.debug("[%s] Read %d rows from %s", self.source_name, len(rows), fname)
        return rows

    def _save_raw_to_cache(self, data: Dict[str, List[Dict[str, str]]]) -> None:
        import pickle
        try:
            with open(self._raw_cache_path, "wb") as fh:
                pickle.dump(data, fh, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception as exc:
            logger.warning("[%s] Failed to write raw cache: %s", self.source_name, exc)

    # ------------------------------------------------------------------
    # transform
    # ------------------------------------------------------------------
    def transform(self, raw: Dict[str, List[Dict[str, str]]]) -> List[Medication]:
        """Convert NDC product rows → Medication with package codes."""
        products = raw.get("products", [])
        packages = raw.get("packages", [])

        # index packages by PRODUCTNDC
        packages_by_ndc: Dict[str, List[str]] = {}
        for pkg in packages:
            ndc = pkg.get("PRODUCTNDC", "").strip()
            pkg_code = pkg.get("NDCPACKAGECODE", "").strip()
            if ndc and pkg_code:
                packages_by_ndc.setdefault(ndc, []).append(pkg_code)

        meds: List[Medication] = []
        prov = Provenance(
            source=self.source_name,
            source_url=self.source_url,
            confidence_tier=ConfidenceTier.AUTHORITY,
        )

        for row in products:
            try:
                med = self._row_to_medication(row, prov, packages_by_ndc)
            except Exception as exc:
                logger.debug("[%s] Skipping malformed row: %s", self.source_name, exc)
                continue
            meds.append(med)

        logger.info("[%s] Transformed %d NDC products → Medication", self.source_name, len(meds))
        return meds

    def _row_to_medication(
        self,
        row: Dict[str, str],
        prov: Provenance,
        packages_by_ndc: Dict[str, List[str]],
    ) -> Medication:
        """Parse a single NDC product row."""
        ndc = row.get("PRODUCTNDC", "").strip()
        proprietary = row.get("PROPRIETARYNAME", "").strip()
        suffix = row.get("PROPRIETARYNAMESUFFIX", "").strip()
        brand_name = f"{proprietary} {suffix}".strip() if suffix else proprietary

        # active ingredients – pipe-separated
        substances_raw = row.get("SUBSTANCENAME", "")
        ingredients = [s.strip() for s in substances_raw.split("|") if s.strip()]

        # strength
        strengths = row.get("ACTIVE_NUMERATOR_STRENGTH", "").strip()
        units = row.get("ACTIVE_INGRED_UNIT", "").strip()
        strength_str = "; ".join(
            f"{s} {u}".strip()
            for s, u in zip(strengths.split(";"), units.split(";"))
        ) if strengths else ""

        # dates
        approval_date = self._parse_fda_date(row.get("STARTMARKETINGDATE", ""))

        # status
        status = row.get("PRODUCTTYPENAME", "").strip()
        marketing = row.get("MARKETINGCATEGORYNAME", "").strip()

        med = Medication(
            name=brand_name,
            generic_name=row.get("NONPROPRIETARYNAME", "").strip(),
            active_ingredients=ingredients,
            strength=strength_str,
            dosage_form=row.get("DOSAGEFORMNAME", "").strip(),
            applicant=row.get("LABELERNAME", "").strip(),
            application_number=row.get("APPLICATIONNUMBER", "").strip(),
            approval_date=approval_date,
            approval_status=f"{status} ({marketing})" if marketing else status,
            ndc_package_codes=packages_by_ndc.get(ndc, []),
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
    def _parse_fda_date(val: str) -> Optional[date]:
        val = (val or "").strip()
        if not val:
            return None
        for fmt in ("%Y%m%d", "%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(val, fmt).date()
            except ValueError:
                continue
        logger.debug("[ndc_directory] Unparseable date: %s", val)
        return None

    # ------------------------------------------------------------------
    # validation
    # ------------------------------------------------------------------
    def _validate_one(self, record: Medication) -> tuple[bool, Optional[str]]:
        if not record.name and not record.generic_name:
            return False, "missing name and generic_name"
        if not record.active_ingredients:
            return False, "no active ingredients"
        return True, None


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    adapter = NdcDirectoryAdapter()
    summary = adapter.run()
    print(summary)


if __name__ == "__main__":
    main()

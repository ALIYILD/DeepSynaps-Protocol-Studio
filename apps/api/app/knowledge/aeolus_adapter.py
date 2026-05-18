"""
AEOLUS Adapter - Adverse Event Open Data (Standardized FAERS)
=============================================================
Adapter for AEOLUS (Adverse Event Open Learning Universal Standard) dataset.
NLM/NIH — standardized version of FDA FAERS with MedDRA and RxNorm coding.
~4.8M drug-adverse event pairs.

Data source: Dryad repository (download-based adapter)
URL: https://datadryad.org/stash/dataset/doi:10.5061/dryad.8q0s4
Format: TSV/CSV files with MedDRA preferred terms and RxNorm concept IDs
"""

import os
import csv
import gzip
import json
import logging
import hashlib
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------

class BaseAdapter:
    """Abstract base class for all adverse event / literature adapters."""

    async def validate_connection(self) -> bool:
        raise NotImplementedError

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        raise NotImplementedError

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "adverse_event"
    ) -> Dict:
        raise NotImplementedError

    def get_provenance(self, result: Dict) -> Dict:
        raise NotImplementedError

    def get_confidence_score(self, result: Dict) -> Dict:
        raise NotImplementedError

    async def close(self):
        pass


# ---------------------------------------------------------------------------
# AEOLUSAdapter
# ---------------------------------------------------------------------------

class AEOLUSAdapter(BaseAdapter):
    """
    AEOLUS (Adverse Event Open Learning Universal Standard) adapter.

    This is a *download-based* adapter that works with locally cached
    AEOLUS TSV files.  On first use it downloads the dataset from Dryad
    (or an alternate mirror) and parses the standardized FAERS records.

    Each row represents a drug–adverse event pair with:
      - RxNorm / RxCUI concept identifiers for the drug
      - MedDRA preferred terms for the adverse event
      - Outcome, report counts, demographic data
    """

    # Dryad landing page (for provenance)
    SOURCE_LANDING_PAGE = "https://datadryad.org/stash/dataset/doi:10.5061/dryad.8q0s4"
    # Direct download URLs – may need updating if Dryad changes
    DATASET_URLS = {
        "standardized": "https://datadryad.org/stash/downloads/file_stream/244774",
        "concepts": "https://datadryad.org/stash/downloads/file_stream/244773",
    }
    # Alternate: Zenodo mirrors or manual download
    ALTERNATE_URL = "https://zenodo.org/records/ Fine / files/aeolus/"

    # Expected column headers (AEOLUS 1.0 format)
    EXPECTED_COLUMNS = [
        "drug_concept_id", "drug_concept_name", "condition_concept_id",
        "condition_concept_name", "snomed_concept_id", "snomed_concept_name",
        " MedDRA_concept_code ", " MedDRA_concept_name", "count",
    ]

    def __init__(
        self,
        data_dir: Optional[str] = None,
        auto_download: bool = True,
    ):
        self.name = "aeolus"
        self.display_name = "AEOLUS (Standardized FAERS)"
        self.source_url = self.SOURCE_LANDING_PAGE
        self.version = "1.0"
        self.confidence_tier = "B"  # spontaneous reporting, not RCT
        self.data_types = ["adverse_event", "drug_safety", "spontaneous_report"]
        self.rate_limit_per_minute = 10  # download-only
        self.requires_auth = False
        self.auth_type = "none"
        self.research_only = True  # ALWAYS True for adverse events

        self.data_dir = Path(data_dir or os.environ.get("AEOLUS_DATA_DIR", "./data/aeolus"))
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.auto_download = auto_download

        # Parsed records (loaded lazily)
        self._records: List[Dict[str, Any]] = []
        self._loaded = False
        self._drug_index: Dict[str, List[int]] = {}  # drug_name -> record indices
        self._event_index: Dict[str, List[int]] = {}  # event_name -> record indices

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0"},
            follow_redirects=True,
        )

    # -- internal data loading -----------------------------------------------

    def _dataset_path(self, key: str = "standardized") -> Path:
        return self.data_dir / f"aeolus_{key}.tsv"

    def _dataset_gz_path(self, key: str = "standardized") -> Path:
        return self.data_dir / f"aeolus_{key}.tsv.gz"

    async def _download_dataset(self, key: str = "standardized") -> bool:
        """Download AEOLUS dataset from Dryad if not cached locally."""
        tsv_path = self._dataset_path(key)
        if tsv_path.exists() and tsv_path.stat().st_size > 0:
            logger.info(f"AEOLUS dataset '{key}' already cached at {tsv_path}")
            return True

        url = self.DATASET_URLS.get(key)
        if not url:
            logger.error(f"No download URL for AEOLUS dataset '{key}'")
            return False

        logger.info(f"Downloading AEOLUS dataset '{key}' from Dryad ...")
        try:
            async with self.client.stream("GET", url, timeout=120.0) as resp:
                if resp.status_code == 200:
                    with open(tsv_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
                    logger.info(f"Downloaded AEOLUS '{key}' ({tsv_path.stat().st_size} bytes)")
                    return True
                logger.error(f"Download HTTP {resp.status_code}: {resp.url}")
        except Exception as exc:
            logger.error(f"Download failed for AEOLUS '{key}': {exc}")
        return False

    def _parse_tsv(self, key: str = "standardized") -> List[Dict[str, Any]]:
        """Parse the AEOLUS TSV file into a list of dict records."""
        tsv_path = self._dataset_path(key)
        gz_path = self._dataset_gz_path(key)

        source_path = None
        if tsv_path.exists() and tsv_path.stat().st_size > 0:
            source_path = tsv_path
        elif gz_path.exists() and gz_path.stat().st_size > 0:
            source_path = gz_path

        if source_path is None:
            logger.warning(f"No AEOLUS data file found at {tsv_path} or {gz_path}")
            return []

        records: List[Dict[str, Any]] = []
        opener = gzip.open if str(source_path).endswith(".gz") else open

        logger.info(f"Parsing AEOLUS data from {source_path} ...")
        try:
            with opener(source_path, "rt", encoding="utf-8", errors="replace") as fh:
                reader = csv.DictReader(fh, delimiter="\t")
                for i, row in enumerate(reader):
                    if i % 100_000 == 0 and i > 0:
                        logger.debug(f"  Parsed {i:,} AEOLUS rows ...")
                    # Normalize column names
                    clean_row = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items()}
                    records.append(clean_row)
        except Exception as exc:
            logger.error(f"Error parsing AEOLUS TSV: {exc}")

        logger.info(f"Parsed {len(records):,} AEOLUS records")
        return records

    def _build_indices(self):
        """Build inverted indices for fast search."""
        self._drug_index.clear()
        self._event_index.clear()
        for idx, rec in enumerate(self._records):
            drug_name = rec.get("drug_concept_name", "").lower()
            if drug_name:
                self._drug_index.setdefault(drug_name, []).append(idx)
            # Also index by RxNorm concept ID
            drug_id = rec.get("drug_concept_id", "")
            if drug_id:
                self._drug_index.setdefault(drug_id.lower(), []).append(idx)

            event_name = rec.get("condition_concept_name", "").lower()
            if event_name:
                self._event_index.setdefault(event_name, []).append(idx)
            # Also index by MedDRA code
            meddra_code = rec.get("meddra_concept_code", "").lower()
            if meddra_code:
                self._event_index.setdefault(meddra_code, []).append(idx)

    async def _ensure_loaded(self):
        """Ensure data is downloaded and loaded into memory."""
        if self._loaded:
            return

        if self.auto_download:
            await self._download_dataset("standardized")

        self._records = self._parse_tsv("standardized")
        self._build_indices()
        self._loaded = True

    def _is_data_available(self) -> bool:
        """Check if local AEOLUS data files exist."""
        return (
            self._dataset_path("standardized").exists()
            or self._dataset_gz_path("standardized").exists()
        )

    # -- connection validation -----------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking local data availability or API reachability."""
        # If we have local data, we're good
        if self._is_data_available() or self._loaded:
            logger.info(f"{self.name} connection validated (local data available)")
            return True

        # Try downloading a small test
        if self.auto_download:
            success = await self._download_dataset("standardized")
            if success:
                self._records = self._parse_tsv("standardized")
                self._build_indices()
                self._loaded = True
                return True

        # Check if Dryad landing page is reachable
        try:
            resp = await self.client.get(
                "https://datadryad.org/api/v2/",
                timeout=10.0,
            )
            if resp.status_code in (200, 404):  # 404 means API exists but path wrong
                logger.info(f"{self.name} Dryad API reachable")
                return True
        except Exception as exc:
            logger.error(f"{self.name} Dryad API check failed: {exc}")

        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search AEOLUS for drug-adverse event pairs.

        Parameters
        ----------
        query: str
            Drug name, RxNorm concept ID, or MedDRA condition name/code.
        filters: Optional[Dict]
            - min_count: int — minimum report count threshold
            - search_field: str — "drug", "condition", or "both"
            - limit: int — max results to return
            - exact_match: bool — require exact match (default: False)

        Returns
        -------
        List[Dict] — matching drug-AE pair records
        """
        await self._ensure_loaded()

        filters = filters or {}
        search_field = filters.get("search_field", "both")
        min_count = filters.get("min_count", 0)
        limit = filters.get("limit", 100)
        exact_match = filters.get("exact_match", False)

        if not self._records:
            logger.warning("AEOLUS data not loaded, returning empty results")
            return []

        query_lower = query.lower().strip()
        matched_indices: set = set()

        if search_field in ("drug", "both"):
            if exact_match:
                if query_lower in self._drug_index:
                    matched_indices.update(self._drug_index[query_lower])
            else:
                for drug_key, indices in self._drug_index.items():
                    if query_lower in drug_key:
                        matched_indices.update(indices)

        if search_field in ("condition", "both"):
            if exact_match:
                if query_lower in self._event_index:
                    matched_indices.update(self._event_index[query_lower])
            else:
                for event_key, indices in self._event_index.items():
                    if query_lower in event_key:
                        matched_indices.update(indices)

        results: List[Dict] = []
        for idx in sorted(matched_indices):
            rec = self._records[idx]
            # Apply count filter
            try:
                count = int(rec.get("count", 0) or 0)
            except (ValueError, TypeError):
                count = 0
            if count >= min_count:
                results.append(rec)
            if len(results) >= limit:
                break

        logger.info(
            f"AEOLUS search '{query}' ({search_field}): "
            f"{len(results)} matches from {len(matched_indices)} candidates"
        )
        return results

    async def search_by_drug(self, drug_name: str, limit: int = 50) -> List[Dict]:
        """Convenience: search for adverse events associated with a specific drug."""
        return await self.search(drug_name, filters={"search_field": "drug", "limit": limit})

    async def search_by_condition(self, condition_name: str, limit: int = 50) -> List[Dict]:
        """Convenience: search for drugs associated with a specific adverse condition."""
        return await self.search(condition_name, filters={"search_field": "condition", "limit": limit})

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "adverse_event") -> Dict:
        """
        Transform an AEOLUS record into the canonical AdverseEvent format.
        """
        drug_name = raw_data.get("drug_concept_name", "")
        drug_id = raw_data.get("drug_concept_id", "")
        event_name = raw_data.get("condition_concept_name", "")
        event_id = raw_data.get("condition_concept_id", "")
        meddra_code = raw_data.get("meddra_concept_code", "")
        meddra_name = raw_data.get("meddra_concept_name", "")

        try:
            report_count = int(raw_data.get("count", 0) or 0)
        except (ValueError, TypeError):
            report_count = 0

        provenance = self.get_provenance(raw_data)
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": f"aeolus:{drug_id}:{event_id}",
            "drug_name": drug_name,
            "drug_id_rxcui": drug_id,
            "event_name": event_name or meddra_name,
            "event_id": event_id,
            "meddra_code": meddra_code,
            "meddra_name": meddra_name,
            "report_count": report_count,
            "frequency": report_count,  # raw count as proxy
            "severity": "unknown",  # AEOLUS does not encode severity
            "confidence": confidence,
            "provenance": provenance,
            "raw_data": raw_data,
        }

    # -- provenance & confidence ---------------------------------------------

    def get_provenance(self, result: Dict) -> Dict:
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.78,
            "research_only": True,  # SAFETY: always True for adverse events
            "data_origin": "FDA FAERS (spontaneous reports)",
            "standardization": "MedDRA + RxNorm via OHDSI/OMOP",
            "caveats": [
                "Spontaneous reporting, not RCT evidence",
                "Reporting bias and under-reporting likely",
                "Cannot establish causality",
                "Counts are report counts, not incidence rates",
            ],
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score based on report count.
        Higher counts = more reliable signal, but still observational.
        """
        try:
            report_count = int(result.get("count", 0) or 0)
        except (ValueError, TypeError):
            report_count = 0

        # Scale count confidence logarthmically
        count_score = min(1.0, __import__("math").log1p(report_count) / 8.0) if report_count > 0 else 0.05

        # AEOLUS is well-standardized but spontaneous reporting has inherent limitations
        overall = (
            0.65 * 0.20  # data_quality
            + count_score * 0.30  # sample_size proxy
            + 0.30 * 0.15  # consistency (standardized)
            + 0.50 * 0.15  # temporal_relevance
            + 0.20 * 0.20  # evidence_strength (observational)
        )

        return {
            "data_quality": 0.65,
            "evidence_strength": 0.20,
            "sample_size": round(count_score, 2),
            "replication": round(min(1.0, count_score * 0.8), 2),
            "consistency": 0.30,
            "temporal_relevance": 0.50,
            "population_match": 0.55,
            "overall": round(overall, 2),
        }

    # -- aggregate statistics ------------------------------------------------

    async def get_drug_event_summary(self, drug_name: str) -> Dict[str, Any]:
        """Get summary statistics for a drug's adverse events."""
        records = await self.search_by_drug(drug_name, limit=1000)
        if not records:
            return {"drug": drug_name, "total_events": 0, "total_reports": 0, "top_events": []}

        event_counts: Dict[str, int] = {}
        total_reports = 0
        for rec in records:
            event = rec.get("condition_concept_name", rec.get("meddra_concept_name", "unknown"))
            try:
                cnt = int(rec.get("count", 0) or 0)
            except (ValueError, TypeError):
                cnt = 0
            event_counts[event] = event_counts.get(event, 0) + cnt
            total_reports += cnt

        top_events = sorted(event_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        return {
            "drug": drug_name,
            "total_events": len(event_counts),
            "total_reports": total_reports,
            "top_events": [{"event": ev, "report_count": cnt} for ev, cnt in top_events],
        }

    # -- lifecycle -----------------------------------------------------------

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()

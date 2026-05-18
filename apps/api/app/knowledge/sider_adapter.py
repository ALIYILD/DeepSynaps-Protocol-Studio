"""
SIDER Adapter - Drug Side Effect Database
=========================================
Adapter for SIDER (Side Effect Resource) from EMBL-EBI.
Open download dataset containing drug side effects extracted from drug labels
and FAERS. 1,400+ drugs, 5,800+ side effects, MedDRA coded.

Data source: http://sideeffects.embl.de/ (download TSV)
Files: meddra_all_se.tsv, meddra_freq.tsv, drug_names.tsv
"""

import os
import csv
import gzip
import logging
from typing import List, Dict, Optional, Any, Set, Tuple
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
# SIDERAdapter
# ---------------------------------------------------------------------------

class SIDERAdapter(BaseAdapter):
    """
    SIDER (Side Effect Resource) adapter.

    Download-based adapter that works with locally cached SIDER TSV files.
    Combines side effect data from drug labels and FAERS, coded with MedDRA.

    Key files:
      - meddra_all_se.tsv: all side effects (drug → MedDRA term)
      - meddra_freq.tsv: side effect frequencies (where available)
      - drug_names.tsv: mapping of STITCH IDs to drug names
    """

    SOURCE_LANDING_PAGE = "http://sideeffects.embl.de/"
    DOWNLOAD_URLS = {
        "drug_names": "http://sideeffects.embl.de/media/download/drug_names.tsv",
        "meddra_all_se": "http://sideeffects.embl.de/media/download/meddra_all_se.tsv.gz",
        "meddra_freq": "http://sideeffects.embl.de/media/download/meddra_freq.tsv.gz",
        "meddra_all_label_se": "http://sideeffects.embl.de/media/download/meddra_all_label_se.tsv.gz",
        "meddra_all_indications": "http://sideeffects.embl.de/media/download/meddra_all_indications.tsv.gz",
    }

    # Column names for each file (SIDER 4.1 format)
    DRUG_NAMES_COLUMNS = ["stitch_id_flat", "stitch_id_stereo", "drug_name"]
    ALL_SE_COLUMNS = [
        "stitch_id_flat", "stitch_id_stereo", "umls_cui_from_label",
        "meddra_type", "umls_cui_of_meddra_term", "side_effect_name",
    ]
    FREQ_COLUMNS = [
        "stitch_id_flat", "stitch_id_stereo", "umls_cui",
        "placebo", "frequency_description", "frequency_lower_bound",
        "frequency_upper_bound", "meddra_type", "umls_cui_of_meddra_term",
        "side_effect_name",
    ]

    def __init__(
        self,
        data_dir: Optional[str] = None,
        auto_download: bool = True,
    ):
        self.name = "sider"
        self.display_name = "SIDER (Side Effect Resource)"
        self.source_url = self.SOURCE_LANDING_PAGE
        self.version = "4.1"
        self.confidence_tier = "B"  # label-derived + FAERS
        self.data_types = ["adverse_event", "drug_side_effect", "drug_label"]
        self.rate_limit_per_minute = 10  # download only
        self.requires_auth = False
        self.auth_type = "none"
        self.research_only = True  # ALWAYS True for adverse events

        self.data_dir = Path(data_dir or os.environ.get("SIDER_DATA_DIR", "./data/sider"))
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.auto_download = auto_download

        # Parsed data
        self._drug_names: Dict[str, str] = {}  # stitch_id_flat -> drug_name
        self._side_effects: List[Dict[str, Any]] = []  # all side effect records
        self._frequencies: Dict[Tuple[str, str], Dict] = {}  # (stitch_id, umls) -> freq record
        self._loaded = False

        # Search indices
        self._drug_se_index: Dict[str, List[int]] = {}  # drug_name -> indices
        self._se_drug_index: Dict[str, List[int]] = {}  # side_effect_name -> indices

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0"},
            follow_redirects=True,
        )

    # -- data loading --------------------------------------------------------

    def _file_path(self, key: str) -> Path:
        return self.data_dir / f"sider_{key}.tsv"

    def _file_gz_path(self, key: str) -> Path:
        return self.data_dir / f"sider_{key}.tsv.gz"

    async def _download_file(self, key: str) -> bool:
        """Download a SIDER data file if not cached."""
        gz_path = self._file_gz_path(key)
        tsv_path = self._file_path(key)

        if tsv_path.exists() and tsv_path.stat().st_size > 0:
            return True
        if gz_path.exists() and gz_path.stat().st_size > 0:
            return True

        url = self.DOWNLOAD_URLS.get(key)
        if not url:
            logger.error(f"No download URL for SIDER file '{key}'")
            return False

        logger.info(f"Downloading SIDER file '{key}' ...")
        try:
            target = gz_path if url.endswith(".gz") else tsv_path
            async with self.client.stream("GET", url, timeout=120.0) as resp:
                if resp.status_code == 200:
                    with open(target, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
                    logger.info(f"Downloaded SIDER '{key}' ({target.stat().st_size} bytes)")
                    return True
                logger.warning(f"Download HTTP {resp.status_code} for {key}")
        except Exception as exc:
            logger.error(f"Download failed for SIDER '{key}': {exc}")
        return False

    def _parse_file(self, key: str, columns: List[str]) -> List[Dict[str, str]]:
        """Parse a TSV file (plain or gzipped) into dict records."""
        gz_path = self._file_gz_path(key)
        tsv_path = self._file_path(key)

        source = None
        if gz_path.exists() and gz_path.stat().st_size > 0:
            source = gz_path
        elif tsv_path.exists() and tsv_path.stat().st_size > 0:
            source = tsv_path

        if source is None:
            return []

        records: List[Dict[str, str]] = []
        opener = gzip.open if str(source).endswith(".gz") else open

        try:
            with opener(source, "rt", encoding="utf-8", errors="replace") as fh:
                reader = csv.reader(fh, delimiter="\t")
                for row in reader:
                    if len(row) >= len(columns):
                        record = {col: val.strip() for col, val in zip(columns, row)}
                        records.append(record)
                    elif len(row) > 0:
                        # Try to map what we can
                        record = {col: row[i].strip() if i < len(row) else "" for i, col in enumerate(columns)}
                        records.append(record)
        except Exception as exc:
            logger.error(f"Error parsing SIDER file '{key}': {exc}")

        return records

    async def _load_all_data(self):
        """Download and parse all SIDER data files."""
        if self._loaded:
            return

        if self.auto_download:
            await self._download_file("drug_names")
            await self._download_file("meddra_all_se")
            await self._download_file("meddra_freq")

        # Load drug names
        drug_records = self._parse_file("drug_names", self.DRUG_NAMES_COLUMNS)
        self._drug_names = {}
        for rec in drug_records:
            stitch_id = rec.get("stitch_id_flat", "")
            name = rec.get("drug_name", "")
            if stitch_id and name:
                self._drug_names[stitch_id] = name
        logger.info(f"Loaded {len(self._drug_names)} SIDER drug names")

        # Load side effects
        se_records = self._parse_file("meddra_all_se", self.ALL_SE_COLUMNS)
        self._side_effects = []
        for rec in se_records:
            stitch_id = rec.get("stitch_id_flat", "")
            drug_name = self._drug_names.get(stitch_id, stitch_id)
            rec["drug_name"] = drug_name
            self._side_effects.append(rec)
        logger.info(f"Loaded {len(self._side_effects)} SIDER side effect records")

        # Load frequencies
        freq_records = self._parse_file("meddra_freq", self.FREQ_COLUMNS)
        self._frequencies = {}
        for rec in freq_records:
            stitch_id = rec.get("stitch_id_flat", "")
            umls = rec.get("umls_cui_of_meddra_term", "")
            if stitch_id and umls:
                self._frequencies[(stitch_id, umls)] = rec
        logger.info(f"Loaded {len(self._frequencies)} SIDER frequency records")

        # Build indices
        self._build_indices()
        self._loaded = True

    def _build_indices(self):
        """Build inverted indices for drug and side effect search."""
        self._drug_se_index.clear()
        self._se_drug_index.clear()

        for idx, rec in enumerate(self._side_effects):
            drug_name = rec.get("drug_name", "").lower()
            stitch_id = rec.get("stitch_id_flat", "").lower()

            if drug_name:
                self._drug_se_index.setdefault(drug_name, []).append(idx)
            if stitch_id:
                self._drug_se_index.setdefault(stitch_id, []).append(idx)

            se_name = rec.get("side_effect_name", "").lower()
            umls = rec.get("umls_cui_of_meddra_term", "").lower()

            if se_name:
                self._se_drug_index.setdefault(se_name, []).append(idx)
            if umls:
                self._se_drug_index.setdefault(umls, []).append(idx)

    # -- connection validation -----------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking local data or website reachability."""
        if self._loaded:
            return True

        # Check if any data files exist locally
        for key in self.DOWNLOAD_URLS:
            if self._file_path(key).exists() or self._file_gz_path(key).exists():
                return True

        # Check if SIDER website is reachable
        try:
            resp = await self.client.get(self.SOURCE_LANDING_PAGE, timeout=10.0)
            if resp.status_code == 200:
                logger.info(f"{self.name} website reachable")
                return True
        except Exception as exc:
            logger.error(f"{self.name} website check failed: {exc}")

        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search SIDER for drug-side effect associations.

        Parameters
        ----------
        query: str
            Drug name, STITCH ID, side effect name, or UMLS CUI.
        filters: Optional[Dict]
            - search_field: "drug", "side_effect", or "both" (default: "both")
            - include_frequency: bool — include frequency data when available
            - limit: int — max results
            - exact_match: bool (default: False)

        Returns
        -------
        List[Dict] — matching drug-side effect records with frequency info
        """
        await self._load_all_data()

        filters = filters or {}
        search_field = filters.get("search_field", "both")
        include_frequency = filters.get("include_frequency", True)
        limit = filters.get("limit", 100)
        exact_match = filters.get("exact_match", False)

        if not self._side_effects:
            logger.warning("SIDER data not loaded, returning empty results")
            return []

        query_lower = query.lower().strip()
        matched_indices: set = set()

        if search_field in ("drug", "both"):
            if exact_match:
                if query_lower in self._drug_se_index:
                    matched_indices.update(self._drug_se_index[query_lower])
            else:
                for key, indices in self._drug_se_index.items():
                    if query_lower in key:
                        matched_indices.update(indices)

        if search_field in ("side_effect", "both"):
            if exact_match:
                if query_lower in self._se_drug_index:
                    matched_indices.update(self._se_drug_index[query_lower])
            else:
                for key, indices in self._se_drug_index.items():
                    if query_lower in key:
                        matched_indices.update(indices)

        results: List[Dict] = []
        for idx in sorted(matched_indices):
            rec = dict(self._side_effects[idx])

            # Enrich with frequency data if available
            if include_frequency:
                stitch_id = rec.get("stitch_id_flat", "")
                umls = rec.get("umls_cui_of_meddra_term", "")
                freq_key = (stitch_id, umls)
                if freq_key in self._frequencies:
                    freq_rec = self._frequencies[freq_key]
                    rec["frequency_description"] = freq_rec.get("frequency_description", "")
                    rec["frequency_lower_bound"] = freq_rec.get("frequency_lower_bound", "")
                    rec["frequency_upper_bound"] = freq_rec.get("frequency_upper_bound", "")
                    rec["placebo"] = freq_rec.get("placebo", "")

            results.append(rec)

            if len(results) >= limit:
                break

        logger.info(
            f"SIDER search '{query}' ({search_field}): {len(results)} matches"
        )
        return results

    async def get_side_effects_for_drug(self, drug_name: str, limit: int = 100) -> List[Dict]:
        """Get all side effects for a specific drug."""
        return await self.search(drug_name, filters={"search_field": "drug", "limit": limit})

    async def get_drugs_for_side_effect(self, side_effect: str, limit: int = 100) -> List[Dict]:
        """Get all drugs associated with a specific side effect."""
        return await self.search(side_effect, filters={"search_field": "side_effect", "limit": limit})

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "adverse_event") -> Dict:
        """
        Transform a SIDER record into the canonical AdverseEvent format.
        """
        drug_name = raw_data.get("drug_name", "")
        stitch_id = raw_data.get("stitch_id_flat", "")
        side_effect = raw_data.get("side_effect_name", "")
        meddra_type = raw_data.get("meddra_type", "")  # PT = preferred term, LLT = lower-level
        umls_cui = raw_data.get("umls_cui_of_meddra_term", "")
        umls_label = raw_data.get("umls_cui_from_label", "")

        # Frequency info (may be enriched)
        freq_desc = raw_data.get("frequency_description", "")
        freq_lower = raw_data.get("frequency_lower_bound", "")
        freq_upper = raw_data.get("frequency_upper_bound", "")
        placebo = raw_data.get("placebo", "")

        # Parse frequency bounds if available
        frequency = None
        if freq_lower and freq_upper:
            try:
                lo = float(freq_lower)
                hi = float(freq_upper)
                frequency = (lo + hi) / 2.0
            except (ValueError, TypeError):
                frequency = freq_desc
        elif freq_desc:
            frequency = freq_desc

        # Infer severity from frequency
        severity = "unknown"
        if frequency is not None and isinstance(frequency, float):
            if frequency >= 0.10:
                severity = "common"
            elif frequency >= 0.01:
                severity = "uncommon"
            elif frequency > 0:
                severity = "rare"

        provenance = self.get_provenance(raw_data)
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": f"sider:{stitch_id}:{umls_cui}",
            "drug_name": drug_name,
            "drug_id_stitch": stitch_id,
            "event_name": side_effect,
            "event_id_umls": umls_cui,
            "meddra_type": meddra_type,
            "frequency": frequency,
            "frequency_description": freq_desc,
            "frequency_bounds": {
                "lower": freq_lower,
                "upper": freq_upper,
            } if freq_lower or freq_upper else None,
            "placebo_associated": placebo.lower() in ("true", "1", "yes") if placebo else False,
            "severity": severity,
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
            "data_quality_score": 0.80,
            "research_only": True,  # SAFETY: always True for adverse events
            "data_origin": "Drug labels + FAERS",
            "coding_systems": ["MedDRA", "UMLS", "STITCH"],
            "caveats": [
                "Derived from drug labels and spontaneous reports",
                "Frequencies may vary between label sources",
                "Not all side effects have frequency data",
                "Cannot establish causality for label-derived effects",
            ],
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Confidence scoring for SIDER records.
        Higher confidence when frequency data is available (label-derived).
        """
        has_freq = bool(
            result.get("frequency_description") or result.get("frequency_lower_bound")
        )
        freq_source = 0.75 if has_freq else 0.45
        label_source = 0.70  # drug label is relatively reliable

        # Placebo comparison strengthens signal
        placebo = result.get("placebo", "")
        placebo_bonus = 0.1 if placebo and placebo.lower() not in ("", "false", "0") else 0.0

        overall = (
            0.80 * 0.15  # data_quality
            + freq_source * 0.25  # evidence_strength
            + 0.50 * 0.15  # sample_size (moderate, from many labels)
            + label_source * 0.15  # replication (consistent labels)
            + 0.70 * 0.10  # consistency
            + 0.60 * 0.10  # temporal_relevance
            + 0.50 * 0.10  # population_match
            + placebo_bonus
        )

        return {
            "data_quality": 0.80,
            "evidence_strength": round(freq_source, 2),
            "sample_size": 0.50,
            "replication": round(label_source, 2),
            "consistency": 0.70,
            "temporal_relevance": 0.60,
            "population_match": 0.50,
            "overall": round(min(1.0, overall), 2),
        }

    # -- drug info helpers ---------------------------------------------------

    async def list_all_drugs(self) -> List[Dict[str, str]]:
        """Return the full list of drugs in SIDER."""
        await self._load_all_data()
        drugs = []
        seen: Set[str] = set()
        for stitch_id, name in self._drug_names.items():
            if name not in seen:
                seen.add(name)
                drugs.append({"stitch_id": stitch_id, "drug_name": name})
        return drugs

    async def list_all_side_effects(self) -> List[str]:
        """Return the full list of unique side effect names."""
        await self._load_all_data()
        effects: Set[str] = set()
        for rec in self._side_effects:
            se = rec.get("side_effect_name", "")
            if se:
                effects.add(se)
        return sorted(effects)

    # -- lifecycle -----------------------------------------------------------

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()

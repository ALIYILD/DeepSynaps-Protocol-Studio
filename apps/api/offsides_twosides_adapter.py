"""
OFFSIDES / TWOSIDES Adapter — Post-Market Adverse Event Mining
===============================================================
Adapter for OFFSIDES and TWOSIDES datasets (Tatonetti Lab, Columbia University).
Now integrated with the OnSIDES project. Statistical data mining of FDA FAERS.

  - OFFSIDES: 2.9M drug–side effect associations not on the label
  - TWOSIDES: 4.6M drug–drug interaction adverse effects

Data source: https://github.com/tatonetti-lab/onsides (OnSIDES integration)
Format: PostgreSQL dump or TSV files with statistical scores (PRR, IC, etc.)
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
# OffsidesTwosidesAdapter
# ---------------------------------------------------------------------------

class OffsidesTwosidesAdapter(BaseAdapter):
    """
    OFFSIDES / TWOSIDES adapter for post-market adverse event mining.

    OFFSIDES: Off-label side effects discovered through statistical analysis
              of FAERS.  2.9M drug–side effect associations.

    TWOSIDES: Drug–drug interaction adverse effects from FAERS.
              4.6M drug-pair–side effect associations.

    Both datasets include statistical scores (PRR, IC, etc.) that quantify
    the strength of association.
    """

    SOURCE_REPO = "https://github.com/tatonetti-lab/onsides"
    DOWNLOAD_URLS = {
        "offsides": "https://github.com/tatonetti-lab/onsides/releases/download/v2.0.0/onsides_v2.0.0_offsides.tsv.gz",
        "twosides": "https://github.com/github/tatonetti-lab/onsides/releases/download/v2.0.0/onsides_v2.0.0_twosides.tsv.gz",
        "drug_mapping": "https://github.com/tatonetti-lab/onsides/releases/download/v2.0.0/onsides_v2.0.0_drug_names.tsv",
        "event_mapping": "https://github.com/tatonetti-lab/onsides/releases/download/v2.0.0/onsides_v2.0.0_meddra_terms.tsv",
    }

    # Column schemas (OnSIDES v2.0.0 format)
    OFFSIDES_COLUMNS = [
        "drug_rxnorn_id", "drug_name", "condition_meddra_id",
        "condition_name", "PRR", "PRR_error", "IC", "IC_lower", "IC_upper",
        "case_count", "drug_count", "reports_with_drug", "reports_with_event",
        "total_reports", "p_value", "bonferroni_significant",
    ]

    TWOSIDES_COLUMNS = [
        "drug1_rxnorm_id", "drug1_name", "drug2_rxnorm_id", "drug2_name",
        "condition_meddra_id", "condition_name", "PRR", "PRR_error",
        "IC", "IC_lower", "IC_upper", "case_count", "combo_count",
        "reports_with_combo", "reports_with_event", "total_reports",
        "p_value", "bonferroni_significant",
    ]

    DRUG_MAP_COLUMNS = ["rxnorm_id", "drug_name", "generic_name"]
    EVENT_MAP_COLUMNS = ["meddra_id", "meddra_term", "meddra_level"]

    def __init__(
        self,
        data_dir: Optional[str] = None,
        auto_download: bool = True,
    ):
        self.name = "offsides_twosides"
        self.display_name = "OFFSIDES / TWOSIDES"
        self.source_url = self.SOURCE_REPO
        self.version = "2.0.0"
        self.confidence_tier = "B"  # data mining of spontaneous reports
        self.data_types = ["adverse_event", "drug_interaction", "off_label_effect", "data_mining"]
        self.rate_limit_per_minute = 10
        self.requires_auth = False
        self.auth_type = "none"
        self.research_only = True  # ALWAYS True for adverse events

        self.data_dir = Path(data_dir or os.environ.get("OFFSIDES_DATA_DIR", "./data/offsides_twosides"))
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.auto_download = auto_download

        # Parsed data stores
        self._offsides_records: List[Dict[str, Any]] = []
        self._twosides_records: List[Dict[str, Any]] = []
        self._drug_map: Dict[str, Dict] = {}  # rxnorm_id -> drug info
        self._event_map: Dict[str, Dict] = {}  # meddra_id -> event info
        self._loaded = False

        # Search indices
        self._drug_off_index: Dict[str, List[int]] = {}
        self._event_off_index: Dict[str, List[int]] = {}
        self._drug1_two_index: Dict[str, List[int]] = {}
        self._drug2_two_index: Dict[str, List[int]] = {}
        self._event_two_index: Dict[str, List[int]] = {}

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={"User-Agent": "DeepSynaps-Protocol-Studio/1.0"},
            follow_redirects=True,
        )

    # -- data loading --------------------------------------------------------

    def _file_path(self, key: str) -> Path:
        return self.data_dir / f"onsides_{key}.tsv"

    def _file_gz_path(self, key: str) -> Path:
        return self.data_dir / f"onsides_{key}.tsv.gz"

    async def _download_file(self, key: str) -> bool:
        """Download an OnSIDES data file if not already cached."""
        gz_path = self._file_gz_path(key)
        tsv_path = self._file_path(key)

        if tsv_path.exists() and tsv_path.stat().st_size > 0:
            return True
        if gz_path.exists() and gz_path.stat().st_size > 0:
            return True

        url = self.DOWNLOAD_URLS.get(key)
        if not url:
            logger.error(f"No download URL for OnSIDES file '{key}'")
            return False

        logger.info(f"Downloading OnSIDES file '{key}' ...")
        try:
            target = gz_path if url.endswith(".gz") else tsv_path
            async with self.client.stream("GET", url, timeout=180.0) as resp:
                if resp.status_code == 200:
                    with open(target, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
                    logger.info(f"Downloaded OnSIDES '{key}' ({target.stat().st_size} bytes)")
                    return True
                logger.warning(f"Download HTTP {resp.status_code} for {key}")
        except Exception as exc:
            logger.error(f"Download failed for OnSIDES '{key}': {exc}")
        return False

    def _parse_tsv(self, key: str, columns: List[str]) -> List[Dict[str, str]]:
        """Parse a TSV (plain or gzipped) into dict records."""
        gz_path = self._file_gz_path(key)
        tsv_path = self._file_path(key)

        source = None
        if gz_path.exists() and gz_path.stat().st_size > 0:
            source = gz_path
        elif tsv_path.exists() and tsv_path.stat().st_size > 0:
            source = tsv_path

        if source is None:
            logger.warning(f"No OnSIDES data file found for '{key}'")
            return []

        records: List[Dict[str, str]] = []
        opener = gzip.open if str(source).endswith(".gz") else open

        logger.info(f"Parsing OnSIDES '{key}' from {source} ...")
        try:
            with opener(source, "rt", encoding="utf-8", errors="replace") as fh:
                # Detect header
                sample = fh.read(4096)
                fh.seek(0)
                has_header = any(col in sample for col in columns[:3])

                reader = csv.reader(fh, delimiter="\t")
                if has_header:
                    next(reader, None)

                for i, row in enumerate(reader):
                    if i % 500_000 == 0 and i > 0:
                        logger.debug(f"  Parsed {i:,} rows from '{key}' ...")
                    record = {}
                    for j, col in enumerate(columns):
                        record[col] = row[j].strip() if j < len(row) else ""
                    records.append(record)
        except Exception as exc:
            logger.error(f"Error parsing OnSIDES '{key}': {exc}")

        logger.info(f"Parsed {len(records):,} records from '{key}'")
        return records

    async def _load_all_data(self):
        """Load all OnSIDES data files and build indices."""
        if self._loaded:
            return

        if self.auto_download:
            for key in self.DOWNLOAD_URLS:
                await self._download_file(key)

        # Load OFFSIDES
        self._offsides_records = self._parse_tsv("offsides", self.OFFSIDES_COLUMNS)

        # Load TWOSIDES
        self._twosides_records = self._parse_tsv("twosides", self.TWOSIDES_COLUMNS)

        # Load mappings
        drug_map_records = self._parse_tsv("drug_mapping", self.DRUG_MAP_COLUMNS)
        self._drug_map = {r.get("rxnorm_id", ""): r for r in drug_map_records if r.get("rxnorm_id")}

        event_map_records = self._parse_tsv("event_mapping", self.EVENT_MAP_COLUMNS)
        self._event_map = {r.get("meddra_id", ""): r for r in event_map_records if r.get("meddra_id")}

        logger.info(
            f"Loaded {len(self._drug_map)} drug mappings, "
            f"{len(self._event_map)} event mappings"
        )

        self._build_indices()
        self._loaded = True

    def _build_indices(self):
        """Build inverted indices for all datasets."""
        # OFFSIDES indices
        self._drug_off_index.clear()
        self._event_off_index.clear()
        for idx, rec in enumerate(self._offsides_records):
            drug_name = rec.get("drug_name", "").lower()
            drug_id = rec.get("drug_rxnorn_id", "").lower()
            if drug_name:
                self._drug_off_index.setdefault(drug_name, []).append(idx)
            if drug_id:
                self._drug_off_index.setdefault(drug_id, []).append(idx)

            event_name = rec.get("condition_name", "").lower()
            event_id = rec.get("condition_meddra_id", "").lower()
            if event_name:
                self._event_off_index.setdefault(event_name, []).append(idx)
            if event_id:
                self._event_off_index.setdefault(event_id, []).append(idx)

        # TWOSIDES indices
        self._drug1_two_index.clear()
        self._drug2_two_index.clear()
        self._event_two_index.clear()
        for idx, rec in enumerate(self._twosides_records):
            for drug_key in ["drug1_name", "drug1_rxnorm_id"]:
                val = rec.get(drug_key, "").lower()
                if val:
                    self._drug1_two_index.setdefault(val, []).append(idx)
            for drug_key in ["drug2_name", "drug2_rxnorm_id"]:
                val = rec.get(drug_key, "").lower()
                if val:
                    self._drug2_two_index.setdefault(val, []).append(idx)

            event_name = rec.get("condition_name", "").lower()
            event_id = rec.get("condition_meddra_id", "").lower()
            if event_name:
                self._event_two_index.setdefault(event_name, []).append(idx)
            if event_id:
                self._event_two_index.setdefault(event_id, []).append(idx)

        logger.info(
            f"Built indices: OFFSIDES drugs={len(self._drug_off_index)}, "
            f"events={len(self._event_off_index)}; "
            f"TWOSIDES drugs={len(self._drug1_two_index)}, "
            f"events={len(self._event_two_index)}"
        )

    # -- connection validation -----------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking local data or GitHub repo reachability."""
        if self._loaded:
            return True

        for key in self.DOWNLOAD_URLS:
            if self._file_path(key).exists() or self._file_gz_path(key).exists():
                return True

        # Check GitHub API for the repo
        try:
            resp = await self.client.get(
                "https://api.github.com/repos/tatonetti-lab/onsides",
                timeout=10.0,
            )
            if resp.status_code == 200:
                logger.info(f"{self.name} GitHub repo reachable")
                return True
            if resp.status_code == 403:
                logger.info(f"{self.name} GitHub API rate-limited but reachable")
                return True
        except Exception as exc:
            logger.error(f"{self.name} GitHub check failed: {exc}")

        return False

    # -- search --------------------------------------------------------------

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search OFFSIDES/TWOSIDES for adverse event associations.

        Parameters
        ----------
        query: str
            Drug name, RxNorm ID, side effect name, or MedDRA ID.
        filters: Optional[Dict]
            - dataset: "offsides", "twosides", or "both" (default: "both")
            - search_field: "drug", "event", or "both" (default: "both")
            - min_ic: float — minimum Information Component threshold
            - bonferroni_only: bool — only statistically significant (default: False)
            - limit: int — max results
            - exact_match: bool (default: False)

        Returns
        -------
        List[Dict] — matching association records with statistical scores
        """
        await self._load_all_data()

        filters = filters or {}
        dataset = filters.get("dataset", "both")
        search_field = filters.get("search_field", "both")
        min_ic = filters.get("min_ic", None)
        bonferroni_only = filters.get("bonferroni_only", False)
        limit = filters.get("limit", 100)
        exact_match = filters.get("exact_match", False)

        query_lower = query.lower().strip()
        results: List[Dict] = []

        # Search OFFSIDES
        if dataset in ("offsides", "both"):
            matched: set = set()
            if search_field in ("drug", "both"):
                if exact_match:
                    matched.update(self._drug_off_index.get(query_lower, []))
                else:
                    for k, idxs in self._drug_off_index.items():
                        if query_lower in k:
                            matched.update(idxs)
            if search_field in ("event", "both"):
                if exact_match:
                    matched.update(self._event_off_index.get(query_lower, []))
                else:
                    for k, idxs in self._event_off_index.items():
                        if query_lower in k:
                            matched.update(idxs)

            for idx in sorted(matched):
                rec = dict(self._offsides_records[idx])
                rec["_dataset"] = "OFFSIDES"
                if self._passes_filters(rec, min_ic, bonferroni_only):
                    results.append(rec)
                if len(results) >= limit:
                    return results

        # Search TWOSIDES
        if dataset in ("twosides", "both"):
            matched: set = set()
            if search_field in ("drug", "both"):
                if exact_match:
                    matched.update(self._drug1_two_index.get(query_lower, []))
                    matched.update(self._drug2_two_index.get(query_lower, []))
                else:
                    for k, idxs in self._drug1_two_index.items():
                        if query_lower in k:
                            matched.update(idxs)
                    for k, idxs in self._drug2_two_index.items():
                        if query_lower in k:
                            matched.update(idxs)
            if search_field in ("event", "both"):
                if exact_match:
                    matched.update(self._event_two_index.get(query_lower, []))
                else:
                    for k, idxs in self._event_two_index.items():
                        if query_lower in k:
                            matched.update(idxs)

            for idx in sorted(matched):
                rec = dict(self._twosides_records[idx])
                rec["_dataset"] = "TWOSIDES"
                if self._passes_filters(rec, min_ic, bonferroni_only):
                    results.append(rec)
                if len(results) >= limit:
                    return results

        logger.info(
            f"OFFSIDES/TWOSIDES search '{query}' ({dataset}/{search_field}): "
            f"{len(results)} matches"
        )
        return results

    def _passes_filters(self, rec: Dict, min_ic: Optional[float], bonferroni_only: bool) -> bool:
        """Check if a record passes the filter criteria."""
        if min_ic is not None:
            try:
                ic = float(rec.get("IC", 0) or 0)
            except (ValueError, TypeError):
                ic = 0
            if ic < min_ic:
                return False
        if bonferroni_only:
            sig = rec.get("bonferroni_significant", "").lower()
            if sig not in ("true", "1", "yes", "t"):
                return False
        return True

    async def search_offsides(self, drug_name: str, **kwargs) -> List[Dict]:
        """Search OFFSIDES dataset only."""
        kwargs["dataset"] = "offsides"
        return await self.search(drug_name, filters=kwargs)

    async def search_twosides(self, drug1: str, drug2: Optional[str] = None, **kwargs) -> List[Dict]:
        """Search TWOSIDES dataset. If drug2 provided, search both drug columns."""
        kwargs["dataset"] = "twosides"
        results = await self.search(drug1, filters=kwargs)
        if drug2:
            drug2_lower = drug2.lower()
            results = [
                r for r in results
                if drug2_lower in r.get("drug2_name", "").lower()
                or drug2_lower in r.get("drug2_rxnorm_id", "").lower()
            ]
        return results

    # -- transform -----------------------------------------------------------

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "adverse_event") -> Dict:
        """
        Transform an OFFSIDES or TWOSIDES record into canonical AdverseEvent format.
        """
        dataset = raw_data.get("_dataset", "OFFSIDES")
        is_twosides = dataset == "TWOSIDES"

        drug1_id = ""
        drug2_id = ""
        if is_twosides:
            drug1_name = raw_data.get("drug1_name", "")
            drug1_id = raw_data.get("drug1_rxnorm_id", "")
            drug2_name = raw_data.get("drug2_name", "")
            drug2_id = raw_data.get("drug2_rxnorm_id", "")
            drug_display = f"{drug1_name} + {drug2_name}"
            drug_id = f"{drug1_id}:{drug2_id}"
        else:
            drug_display = raw_data.get("drug_name", "")
            drug_id = raw_data.get("drug_rxnorn_id", "")
            drug1_name = drug_display
            drug2_name = ""

        event_name = raw_data.get("condition_name", "")
        meddra_id = raw_data.get("condition_meddra_id", "")

        # Statistical scores
        prr = raw_data.get("PRR", "")
        ic = raw_data.get("IC", "")
        ic_lower = raw_data.get("IC_lower", "")
        ic_upper = raw_data.get("IC_upper", "")
        case_count = raw_data.get("case_count", "")
        p_value = raw_data.get("p_value", "")
        bonf_sig = raw_data.get("bonferroni_significant", "")

        # Derive severity from statistical signal strength
        severity = "unknown"
        try:
            ic_val = float(ic) if ic else 0
            if bonf_sig.lower() in ("true", "1", "yes", "t") and ic_val > 3:
                severity = "high_signal"
            elif ic_val > 1.5:
                severity = "moderate_signal"
            elif ic_val > 0:
                severity = "weak_signal"
        except (ValueError, TypeError):
            pass

        provenance = self.get_provenance(raw_data)
        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": f"{dataset.lower()}:{drug_id}:{meddra_id}",
            "dataset": dataset,
            "drug_name": drug_display,
            "drug1_name": drug1_name,
            "drug1_id_rxnorm": drug1_id,
            "drug2_name": drug2_name,
            "drug2_id_rxnorm": drug2_id,
            "is_drug_interaction": is_twosides,
            "event_name": event_name,
            "event_id_meddra": meddra_id,
            "report_count": self._safe_int(case_count),
            "statistical_scores": {
                "PRR": self._safe_float(prr),
                "IC": self._safe_float(ic),
                "IC_lower": self._safe_float(ic_lower),
                "IC_upper": self._safe_float(ic_upper),
                "p_value": self._safe_float(p_value),
                "bonferroni_significant": bonf_sig.lower() in ("true", "1", "yes", "t") if bonf_sig else False,
            },
            "severity": severity,
            "confidence": confidence,
            "provenance": provenance,
            "raw_data": raw_data,
        }

    @staticmethod
    def _safe_float(val: Any) -> Optional[float]:
        try:
            return float(val) if val not in ("", None, "NA", "NaN") else None
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _safe_int(val: Any) -> Optional[int]:
        try:
            return int(float(val)) if val not in ("", None, "NA", "NaN") else None
        except (ValueError, TypeError):
            return None

    # -- provenance & confidence ---------------------------------------------

    def get_provenance(self, result: Dict) -> Dict:
        dataset = result.get("_dataset", "OFFSIDES")
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.72,
            "research_only": True,  # SAFETY: always True for adverse events
            "data_origin": f"{dataset} — FAERS data mining (Columbia Univ.)",
            "statistical_method": "Disproportionality analysis (PRR, IC)",
            "coding_systems": ["MedDRA", "RxNorm"],
            "caveats": [
                "Data mining of spontaneous reports, not RCT evidence",
                "Associations do not imply causality",
                "May be confounded by indication or polypharmacy",
                "Off-label signals require clinical validation",
            ],
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Confidence based on statistical signal strength.
        Strong IC and significant p-value = higher confidence in the signal.
        """
        ic = self._safe_float(result.get("IC")) or 0
        p_val = self._safe_float(result.get("p_value")) or 1.0
        bonf = result.get("bonferroni_significant", "").lower() in ("true", "1", "yes", "t")
        case_count = self._safe_int(result.get("case_count")) or 0

        # IC-based evidence strength (0–5 scale normalized)
        ic_score = min(1.0, max(0.0, ic) / 3.0)

        # Statistical significance
        sig_score = 0.9 if bonf else (0.7 if p_val < 0.05 else 0.3)

        # Sample size
        sample_score = min(1.0, __import__("math").log1p(case_count) / 8.0) if case_count > 0 else 0.05

        overall = (
            0.72 * 0.15  # data_quality
            + ic_score * 0.25  # evidence_strength
            + sample_score * 0.20  # sample_size
            + sig_score * 0.15  # consistency (statistical)
            + 0.50 * 0.10  # temporal_relevance
            + 0.40 * 0.10  # population_match
            + 0.30 * 0.05  # replication
        )

        return {
            "data_quality": 0.72,
            "evidence_strength": round(ic_score, 2),
            "sample_size": round(sample_score, 2),
            "replication": round(sig_score, 2),
            "consistency": round(sig_score, 2),
            "temporal_relevance": 0.50,
            "population_match": 0.40,
            "overall": round(min(1.0, overall), 2),
        }

    # -- aggregate helpers ---------------------------------------------------

    async def get_top_signals(
        self,
        dataset: str = "offsides",
        min_ic: float = 1.5,
        limit: int = 50,
    ) -> List[Dict]:
        """Get the strongest signals (highest IC) from a dataset."""
        await self._load_all_data()
        records = self._offsides_records if dataset == "offsides" else self._twosides_records

        scored = []
        for rec in records:
            ic = self._safe_float(rec.get("IC")) or 0
            if ic >= min_ic:
                scored.append((ic, rec))

        scored.sort(key=lambda x: x[0], reverse=True)

        results = []
        for ic, rec in scored[:limit]:
            r = dict(rec)
            r["_dataset"] = dataset.upper()
            results.append(r)
        return results

    async def get_drug_signal_summary(self, drug_name: str) -> Dict[str, Any]:
        """Get summary of adverse event signals for a drug."""
        offsides = await self.search_offsides(drug_name, limit=1000)
        twosides = await self.search_twosides(drug_name, limit=1000)

        def summarize(records, dataset_name):
            if not records:
                return {"count": 0, "top_signals": [], "avg_ic": 0}
            ics = [self._safe_float(r.get("IC")) or 0 for r in records]
            avg_ic = sum(ics) / len(ics) if ics else 0
            sorted_recs = sorted(records, key=lambda r: self._safe_float(r.get("IC")) or 0, reverse=True)[:10]
            return {
                "count": len(records),
                "top_signals": [
                    {
                        "event": r.get("condition_name", ""),
                        "IC": self._safe_float(r.get("IC")),
                        "case_count": self._safe_int(r.get("case_count")),
                    }
                    for r in sorted_recs
                ],
                "avg_ic": round(avg_ic, 2),
            }

        return {
            "drug": drug_name,
            "offsides": summarize(offsides, "OFFSIDES"),
            "twosides": summarize(twosides, "TWOSIDES"),
        }

    # -- lifecycle -----------------------------------------------------------

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()

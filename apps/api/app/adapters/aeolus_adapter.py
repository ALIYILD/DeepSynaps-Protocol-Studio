#!/usr/bin/env python3
"""
AEOLUS Adapter — Adverse Event Open Learning Using Universal Standards
Pre-computed tables from: https://github.com/tatonetti-lab/aeolus

Provides access to AEOLUS pharmacovigilance data including drug-outcome pairs,
standardized adverse event frequencies, and signal detection statistics.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://github.com/tatonetti-lab/aeolus/raw/master/"
RAW_URL = "https://raw.githubusercontent.com/tatonetti-lab/aeolus/master"
DEFAULT_TIMEOUT = 60.0
RATE_LIMIT_DELAY = 1.0
CACHE_TTL_SECONDS = 7200


@dataclass
class AeolusOutcome:
    """Represents an adverse drug outcome."""
    outcome_concept_id: int
    outcome_concept_name: str
    outcome_vocabulary_id: str
    meddra_concept_id: int = 0
    meddra_concept_name: str = ""
    meddra_pt_id: int = 0
    meddra_pt_name: str = ""
    meddra_soc_id: int = 0
    meddra_soc_name: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "outcome_concept_id": self.outcome_concept_id,
            "outcome_concept_name": self.outcome_concept_name,
            "outcome_vocabulary_id": self.outcome_vocabulary_id,
            "meddra_concept_id": self.meddra_concept_id,
            "meddra_concept_name": self.meddra_concept_name,
            "meddra_pt_id": self.meddra_pt_id,
            "meddra_pt_name": self.meddra_pt_name,
            "meddra_soc_id": self.meddra_soc_id,
            "meddra_soc_name": self.meddra_soc_name,
        }


@dataclass
class AeolusDrugOutcomePair:
    """Represents a drug-outcome pair with signal statistics."""
    drug_concept_id: int
    drug_concept_name: str
    outcome_concept_id: int
    outcome_concept_name: str
    case_count: int = 0
    prr: float = 0.0
    prr_95_ci_lower: float = 0.0
    prr_95_ci_upper: float = 0.0
    ror: float = 0.0
    ror_95_ci_lower: float = 0.0
    ror_95_ci_upper: float = 0.0
    ic: float = 0.0
    ic_95_ci_lower: float = 0.0
    ic_95_ci_upper: float = 0.0
    binomial_ci_count: int = 0
    mean_reporting_frequency: float = 0.0
    snomed_outcome_concept_id: int = 0
    snomed_outcome_concept_name: str = ""
    condition_concept_id: int = 0
    condition_concept_name: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "drug_concept_id": self.drug_concept_id,
            "drug_concept_name": self.drug_concept_name,
            "outcome_concept_id": self.outcome_concept_id,
            "outcome_concept_name": self.outcome_concept_name,
            "case_count": self.case_count,
            "prr": self.prr,
            "prr_95_ci_lower": self.prr_95_ci_lower,
            "prr_95_ci_upper": self.prr_95_ci_upper,
            "ror": self.ror,
            "ror_95_ci_lower": self.ror_95_ci_lower,
            "ror_95_ci_upper": self.ror_95_ci_upper,
            "ic": self.ic,
            "ic_95_ci_lower": self.ic_95_ci_lower,
            "ic_95_ci_upper": self.ic_95_ci_upper,
            "binomial_ci_count": self.binomial_ci_count,
            "mean_reporting_frequency": self.mean_reporting_frequency,
            "snomed_outcome_concept_id": self.snomed_outcome_concept_id,
            "snomed_outcome_concept_name": self.snomed_outcome_concept_name,
            "condition_concept_id": self.condition_concept_id,
            "condition_concept_name": self.condition_concept_name,
        }


@dataclass
class AeolusDrug:
    """Represents a drug in AEOLUS."""
    drug_concept_id: int
    concept_name: str
    concept_class_id: str = ""
    vocabulary_id: str = ""
    concept_code: str = ""
    standard_concept: str = ""
    rxnorm_concept_id: int = 0
    rxnorm_concept_name: str = ""
    number_of_outcomes: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "drug_concept_id": self.drug_concept_id,
            "concept_name": self.concept_name,
            "concept_class_id": self.concept_class_id,
            "vocabulary_id": self.vocabulary_id,
            "concept_code": self.concept_code,
            "standard_concept": self.standard_concept,
            "rxnorm_concept_id": self.rxnorm_concept_id,
            "rxnorm_concept_name": self.rxnorm_concept_name,
            "number_of_outcomes": self.number_of_outcomes,
        }


class _Cache:
    def __init__(self, ttl: int = CACHE_TTL_SECONDS) -> None:
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._ttl = ttl

    def _key(self, *parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()

    def get(self, *parts: str) -> Optional[Any]:
        key = self._key(*parts)
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > self._ttl:
            del self._store[key]
            return None
        return value

    def set(self, value: Any, *parts: str) -> None:
        key = self._key(*parts)
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()

_CACHE = _Cache()


class AeolusAdapter:
    """Async adapter for AEOLUS pharmacovigilance data.

    Provides access to pre-computed adverse event signal tables including
    drug-outcome pairs with PRR, ROR, and IC signal metrics.

    Example:
        adapter = AeolusAdapter()
        drugs = await adapter.search_drugs("warfarin")
        pairs = await adapter.get_drug_outcome_pairs(drug_concept_id=1310149)
    """

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        rate_limit_delay: float = RATE_LIMIT_DELAY,
    ) -> None:
        self.timeout = timeout
        self.rate_limit_delay = rate_limit_delay
        self._client: Optional[httpx.AsyncClient] = None
        self._last_call_time: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> Any:
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        cache_key = (url, json.dumps(params or {}, sort_keys=True))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        try:
            resp = await client.get(url, params=params or {})
            self._last_call_time = time.time()
            resp.raise_for_status()
            data = resp.json()
            _CACHE.set(data, *cache_key)
            return data
        except httpx.HTTPStatusError as e:
            raise AeolusAPIError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise AeolusAPIError(f"Request failed: {e}") from e

    async def get_outcomes(self, limit: int = 100) -> List[AeolusOutcome]:
        """Get all adverse event outcomes.

        Args:
            limit: Max results.

        Returns:
            List of outcomes.
        """
        url = f"{RAW_URL}/data/outcome_of_interest.csv"
        return await self._fetch_csv_outcomes(url, limit)

    async def search_drugs(
        self, drug_name: str, limit: int = 10
    ) -> List[AeolusDrug]:
        """Search drugs by name.

        Args:
            drug_name: Drug name.
            limit: Max results.

        Returns:
            Matching drugs.
        """
        url = f"{RAW_URL}/data/drug.csv"
        drugs = await self._fetch_csv_drugs(url, limit)
        return [d for d in drugs if drug_name.lower() in d.concept_name.lower()][:limit]

    async def get_drug_outcome_pairs(
        self, drug_concept_id: int, limit: int = 100
    ) -> List[AeolusDrugOutcomePair]:
        """Get outcome pairs for a specific drug.

        Args:
            drug_concept_id: OMOP drug concept ID.
            limit: Max results.

        Returns:
            Drug-outcome pairs.
        """
        url = f"{RAW_URL}/data/drug_outcome_pairs.csv"
        pairs = await self._fetch_csv_pairs(url)
        return [p for p in pairs if p.drug_concept_id == drug_concept_id][:limit]

    async def get_pairs_by_outcome(
        self, outcome_concept_id: int, limit: int = 100
    ) -> List[AeolusDrugOutcomePair]:
        """Get drug pairs for a specific outcome.

        Args:
            outcome_concept_id: OMOP outcome concept ID.
            limit: Max results.

        Returns:
            Drug-outcome pairs.
        """
        url = f"{RAW_URL}/data/drug_outcome_pairs.csv"
        pairs = await self._fetch_csv_pairs(url)
        return [p for p in pairs if p.outcome_concept_id == outcome_concept_id][:limit]

    async def get_significant_pairs(
        self, min_case_count: int = 10, min_prr: float = 2.0, limit: int = 100
    ) -> List[AeolusDrugOutcomePair]:
        """Get statistically significant drug-outcome pairs.

        Args:
            min_case_count: Minimum case count.
            min_prr: Minimum PRR threshold.
            limit: Max results.

        Returns:
            Significant pairs.
        """
        url = f"{RAW_URL}/data/drug_outcome_pairs.csv"
        pairs = await self._fetch_csv_pairs(url)
        filtered = [
            p for p in pairs
            if p.case_count >= min_case_count and p.prr >= min_prr
        ]
        return filtered[:limit]

    async def get_drug_statistics(
        self, drug_concept_id: int
    ) -> Dict[str, Any]:
        """Get summary statistics for a drug.

        Args:
            drug_concept_id: Drug concept ID.

        Returns:
            Statistics dict.
        """
        pairs = await self.get_drug_outcome_pairs(drug_concept_id)
        if not pairs:
            return {"drug_concept_id": drug_concept_id, "total_outcomes": 0}
        return {
            "drug_concept_id": drug_concept_id,
            "drug_name": pairs[0].drug_concept_name,
            "total_outcomes": len(pairs),
            "total_cases": sum(p.case_count for p in pairs),
            "mean_prr": sum(p.prr for p in pairs) / len(pairs) if pairs else 0,
            "max_prr": max((p.prr for p in pairs), default=0),
            "mean_ror": sum(p.ror for p in pairs) / len(pairs) if pairs else 0,
            "mean_ic": sum(p.ic for p in pairs) / len(pairs) if pairs else 0,
        }

    async def get_top_signals(
        self, drug_concept_id: int, metric: str = "prr", limit: int = 10
    ) -> List[AeolusDrugOutcomePair]:
        """Get top signals for a drug.

        Args:
            drug_concept_id: Drug concept ID.
            metric: Sort metric ("prr", "ror", "ic").
            limit: Max results.

        Returns:
            Top signal pairs.
        """
        pairs = await self.get_drug_outcome_pairs(drug_concept_id)
        reverse = True
        if metric == "prr":
            pairs.sort(key=lambda x: x.prr, reverse=reverse)
        elif metric == "ror":
            pairs.sort(key=lambda x: x.ror, reverse=reverse)
        elif metric == "ic":
            pairs.sort(key=lambda x: x.ic, reverse=reverse)
        return pairs[:limit]

    async def _fetch_csv_outcomes(self, url: str, limit: int) -> List[AeolusOutcome]:
        cache_key = (url, str(limit))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        try:
            resp = await client.get(url)
            self._last_call_time = time.time()
            resp.raise_for_status()
            lines = resp.text.strip().split("\n")
            outcomes: List[AeolusOutcome] = []
            for line in lines[1:limit+1]:
                parts = line.split(",")
                if len(parts) >= 3:
                    outcomes.append(AeolusOutcome(
                        outcome_concept_id=int(parts[0]) if parts[0].isdigit() else 0,
                        outcome_concept_name=parts[1],
                        outcome_vocabulary_id=parts[2] if len(parts) > 2 else "",
                    ))
            _CACHE.set(outcomes, *cache_key)
            return outcomes
        except Exception as e:
            raise AeolusAPIError(f"CSV fetch failed: {e}") from e

    async def _fetch_csv_drugs(self, url: str, limit: int) -> List[AeolusDrug]:
        cache_key = (url, str(limit))
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        try:
            resp = await client.get(url)
            self._last_call_time = time.time()
            resp.raise_for_status()
            lines = resp.text.strip().split("\n")
            drugs: List[AeolusDrug] = []
            for line in lines[1:limit+1]:
                parts = line.split(",")
                if len(parts) >= 3:
                    drugs.append(AeolusDrug(
                        drug_concept_id=int(parts[0]) if parts[0].isdigit() else 0,
                        concept_name=parts[1],
                        concept_class_id=parts[2] if len(parts) > 2 else "",
                    ))
            _CACHE.set(drugs, *cache_key)
            return drugs
        except Exception as e:
            raise AeolusAPIError(f"CSV fetch failed: {e}") from e

    async def _fetch_csv_pairs(self, url: str) -> List[AeolusDrugOutcomePair]:
        cache_key = (url, "pairs")
        cached = _CACHE.get(*cache_key)
        if cached is not None:
            return cached
        client = await self._get_client()
        elapsed = time.time() - self._last_call_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        try:
            resp = await client.get(url)
            self._last_call_time = time.time()
            resp.raise_for_status()
            lines = resp.text.strip().split("\n")
            pairs: List[AeolusDrugOutcomePair] = []
            for line in lines[1:]:
                parts = line.split(",")
                if len(parts) >= 4:
                    pairs.append(AeolusDrugOutcomePair(
                        drug_concept_id=int(parts[0]) if parts[0].isdigit() else 0,
                        drug_concept_name=parts[1],
                        outcome_concept_id=int(parts[2]) if parts[2].isdigit() else 0,
                        outcome_concept_name=parts[3],
                    ))
            _CACHE.set(pairs, *cache_key)
            return pairs
        except Exception as e:
            raise AeolusAPIError(f"CSV fetch failed: {e}") from e

    async def health_check(self) -> bool:
        try:
            url = f"{RAW_URL}/README.md"
            client = await self._get_client()
            resp = await client.get(url)
            return resp.status_code == 200
        except AeolusAPIError:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "AeolusAdapter":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class AeolusAPIError(Exception):
    pass


async def _test_aeolus() -> None:
    adapter = AeolusAdapter()
    healthy = await adapter.health_check()
    print(f"[TEST] health_check: {'PASS' if healthy else 'FAIL'}")
    drugs = await adapter.search_drugs("warfarin", limit=5)
    print(f"[TEST] search_drugs: found {len(drugs)} results")
    assert isinstance(drugs, list)
    await adapter.close()
    print("[TEST] All AEOLUS tests completed.")


if __name__ == "__main__":
    asyncio.run(_test_aeolus())

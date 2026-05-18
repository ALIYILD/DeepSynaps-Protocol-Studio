"""
NIH RePORTER Adapter - Funded Research Projects Database
=========================================================
Provides access to NIH RePORTER, a database of 3M+ funded research
projects across NIH institutes and centers.

API: https://api.reporter.nih.gov/ (REST API v2)
Confidence tier: B
"""

import logging
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------
from abc import ABC, abstractmethod


class BaseAdapter(ABC):
    """Abstract base class for all evidence/literature database adapters."""

    name: str = ""
    display_name: str = ""
    source_url: str = ""
    version: str = ""
    confidence_tier: str = "C"
    data_types: List[str] = []
    rate_limit_per_minute: int = 60
    requires_auth: bool = False
    auth_type: str = "none"

    @abstractmethod
    async def validate_connection(self) -> bool:
        ...

    @abstractmethod
    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        ...

    @abstractmethod
    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "evidence_entry") -> Dict:
        ...

    @abstractmethod
    def get_provenance(self, result: Dict) -> Dict:
        ...

    @abstractmethod
    def get_confidence_score(self, result: Dict) -> Dict:
        ...

    async def close(self):
        pass


# ---------------------------------------------------------------------------
# NIH RePORTER Adapter
# ---------------------------------------------------------------------------


class NIHRePORTERAdapter(BaseAdapter):
    """
    Adapter for NIH RePORTER (Research Portfolio Online Reporting Tools).

    NIH RePORTER provides:
      - 3M+ funded research projects (active and historical)
      - Project details: PI, institution, abstract, funding
      - Publications linked to projects
      - Clinical trials linked to projects
      - Patents and other outputs

    API v2 endpoints:
      - /v2/projects/search – project search
      - /v2/publications/search – publication search
      - /v2/agencies – list funding agencies

    This adapter focuses on project-level search and retrieval.
    """

    API_BASE = "https://api.reporter.nih.gov/v2"
    WEB_BASE = "https://reporter.nih.gov"

    # NIH funding institutes/centers
    IC_CODES = {
        "NCI": "National Cancer Institute",
        "NHLBI": "National Heart, Lung, and Blood Institute",
        "NIAID": "National Institute of Allergy and Infectious Diseases",
        "NIGMS": "National Institute of General Medical Sciences",
        "NINDS": "National Institute of Neurological Disorders and Stroke",
        "NIMH": "National Institute of Mental Health",
        "NIDDK": "National Institute of Diabetes and Digestive and Kidney Diseases",
        "NICHD": "National Institute of Child Health and Human Development",
        "NIA": "National Institute on Aging",
        "NIAAA": "National Institute on Alcohol Abuse and Alcoholism",
        "NIEHS": "National Institute of Environmental Health Sciences",
        "NIAMS": "National Institute of Arthritis and Musculoskeletal and Skin Diseases",
        "NIDCR": "National Institute of Dental and Craniofacial Research",
        "NEI": "National Eye Institute",
        "NIDCD": "National Institute on Deafness and Other Communication Disorders",
        "NLM": "National Library of Medicine",
        "NINR": "National Institute of Nursing Research",
        "NHGRI": "National Human Genome Research Institute",
        "NIBIB": "National Institute of Biomedical Imaging and Bioengineering",
        "FIC": "Fogarty International Center",
        "NCATS": "National Center for Advancing Translational Sciences",
        "NCCIH": "National Center for Complementary and Integrative Health",
    }

    # Project type to research category
    PROJECT_TYPES = {
        "research": "Research Project",
        "training": "Training Grant",
        "fellowship": "Fellowship",
        "center": "Center Grant",
        "contract": "Research Contract",
        "sbir": "SBIR/STTR",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.name = "nih_reporter"
        self.display_name = "NIH RePORTER"
        self.source_url = self.WEB_BASE
        self.version = "2025"
        self.confidence_tier = "B"
        self.data_types = [
            "funded_research_project",
            "research_grant",
            "training_grant",
            "fellowship",
            "center_grant",
            "research_contract",
        ]
        self.rate_limit_per_minute = 120  # ~2/sec
        self.requires_auth = False
        self.auth_type = "none"
        self.api_key = api_key

        self._semaphore = asyncio.Semaphore(3)
        self._last_request_time: Optional[datetime] = None

        self.client = httpx.AsyncClient(
            timeout=45.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (bot@deepsynaps.ai)",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _rate_limited_post(self, url: str, json_data: Optional[Dict] = None) -> httpx.Response:
        """Execute a POST request with rate limiting."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 0.5:
                    await asyncio.sleep(0.5 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.post(url, json=json_data)
            return response

    async def _rate_limited_get(self, url: str, params: Optional[Dict] = None) -> httpx.Response:
        """Execute a GET request with rate limiting."""
        async with self._semaphore:
            now = datetime.utcnow()
            if self._last_request_time is not None:
                elapsed = (now - self._last_request_time).total_seconds()
                if elapsed < 0.5:
                    await asyncio.sleep(0.5 - elapsed)
            self._last_request_time = datetime.utcnow()
            response = await self.client.get(url, params=params)
            return response

    @staticmethod
    def _activity_code_to_project_type(activity_code: str) -> str:
        """Map NIH activity code to project type.

        NIH activity codes use letter prefixes:
          R = Research, T = Training, F = Fellowship,
          K = Career Development, P = Center,
          U = Cooperative Agreement, SB/ST = SBIR/STTR
        """
        if not activity_code:
            return "research"
        ac = activity_code.upper()
        if ac.startswith(("SB", "ST")):
            return "sbir"
        mapping = {
            "R": "research", "U": "research", "S": "research",
            "D": "research", "DP": "research",
            "T": "training", "G": "training",
            "F": "fellowship", "K": "fellowship",
            "P": "center",
        }
        return mapping.get(ac[:1], "research")

    def _build_search_payload(self, query: str, filters: Dict) -> Dict[str, Any]:
        """Build the NIH RePORTER API v2 search payload."""
        # API v2 uses criteria-based search
        criteria: List[Dict[str, Any]] = []

        # Text search across multiple fields
        criteria.append({
            "field": "projectTitle",
            "operator": "contains",
            "value": query,
        })

        payload: Dict[str, Any] = {
            "criteria": criteria,
            "include_fields": [
                "ProjectNum", "ProjectTitle", "AbstractText",
                "PrincipalInvestigators", "Organization",
                "AwardAmount", "AgencyIcFundings",
                "ProjectStartDate", "ProjectEndDate",
                "ActivityCode", "FiscalYear",
            ],
            "offset": filters.get("offset", 0),
            "limit": min(filters.get("max_results", 25), 500),
            "sort_field": "project_start_date",
            "sort_order": "desc",
        }

        # PI name filter
        if filters.get("pi_name"):
            payload["criteria"].append({
                "field": "pi_names",
                "operator": "contains",
                "value": filters["pi_name"],
            })

        # Institution filter
        if filters.get("institution"):
            payload["criteria"].append({
                "field": "org_names",
                "operator": "contains",
                "value": filters["institution"],
            })

        # Fiscal year range
        if filters.get("fiscal_year"):
            fy = filters["fiscal_year"]
            if isinstance(fy, int):
                payload["criteria"].append({
                    "field": "fiscal_year",
                    "operator": "equals",
                    "value": fy,
                })
            elif isinstance(fy, (list, tuple)) and len(fy) == 2:
                payload["criteria"].append({
                    "field": "fiscal_year",
                    "operator": "range",
                    "value": {"from": fy[0], "to": fy[1]},
                })

        # Institute/Center filter
        if filters.get("ic_code"):
            ic = filters["ic_code"].upper()
            payload["criteria"].append({
                "field": "agency_ic_codes",
                "operator": "contains",
                "value": ic,
            })

        # Activity code filter (e.g., R01, R21, U01)
        if filters.get("activity_code"):
            payload["criteria"].append({
                "field": "activity_code",
                "operator": "equals",
                "value": filters["activity_code"].upper(),
            })

        # Award amount range
        if filters.get("award_min") is not None or filters.get("award_max") is not None:
            award_range: Dict[str, Any] = {}
            if filters.get("award_min") is not None:
                award_range["from"] = filters["award_min"]
            if filters.get("award_max") is not None:
                award_range["to"] = filters["award_max"]
            if award_range:
                payload["criteria"].append({
                    "field": "award_amount",
                    "operator": "range",
                    "value": award_range,
                })

        return payload

    # ------------------------------------------------------------------
    # Required interface methods
    # ------------------------------------------------------------------

    async def validate_connection(self) -> bool:
        """Validate by checking the NIH RePORTER API."""
        try:
            payload = {
                "criteria": [{"field": "projectTitle", "operator": "contains", "value": "test"}],
                "limit": 1,
            }
            response = await self._rate_limited_post(
                f"{self.API_BASE}/projects/search", json_data=payload
            )
            if response.status_code in (200, 400):
                # 400 is acceptable for our minimal test payload
                logger.info("NIH RePORTER API validated")
                return True
            logger.warning(f"NIH RePORTER returned HTTP {response.status_code}")
            return False
        except Exception as exc:
            logger.error(f"NIH RePORTER connection validation failed: {exc}")
            return False

    async def search(self, query: str, filters: Optional[Dict] = None) -> List[Dict]:
        """
        Search NIH RePORTER for funded research projects.

        Parameters
        ----------
        query: Research topic, disease, condition, or keyword.
        filters: Optional dictionary with keys:
            - max_results (int):     maximum results, default 25, max 500
            - pi_name (str):         principal investigator name
            - institution (str):     funding recipient organization
            - fiscal_year (int|List[int]): single year or [from, to] range
            - ic_code (str):         NIH institute code (e.g., 'NCI', 'NHLBI')
            - activity_code (str):   grant type (e.g., 'R01', 'R21', 'U01')
            - award_min (int):       minimum award amount
            - award_max (int):       maximum award amount
            - offset (int):          pagination offset

        Returns
        -------
        List of raw project dictionaries.
        """
        filters = filters or {}
        max_results = min(filters.get("max_results", 25), 500)

        payload = self._build_search_payload(query, filters)
        payload["limit"] = max_results

        logger.info(f"NIH RePORTER search: query='{query}', filters={filters}")

        try:
            resp = await self._rate_limited_post(
                f"{self.API_BASE}/projects/search", json_data=payload
            )
            resp.raise_for_status()
            data = resp.json()

            results: List[Dict] = []
            if isinstance(data, list):
                results = data
            elif isinstance(data, dict):
                results = data.get("results", [])

            for r in results:
                r["_query"] = query
                r["_fetch_source"] = "nih_reporter"

            logger.info(f"NIH RePORTER returned {len(results)} projects")
            return results[:max_results]

        except httpx.HTTPStatusError as exc:
            logger.error(f"NIH RePORTER search HTTP error {exc.response.status_code}")
            return []
        except Exception as exc:
            logger.error(f"NIH RePORTER search failed: {exc}")
            return []

    def transform_to_canonical(self, raw_data: Dict, entity_type: str = "research_entry") -> Dict:
        """
        Convert a raw NIH RePORTER project into the canonical ResearchEntry.
        """
        project_num = raw_data.get("ProjectNum") or raw_data.get("project_num") or raw_data.get("applId") or raw_data.get("application_id", "")
        title = raw_data.get("ProjectTitle") or raw_data.get("project_title", "")

        # Abstract
        abstract = raw_data.get("AbstractText") or raw_data.get("abstract_text") or raw_data.get("abstract", "")

        # Principal Investigators
        pis = raw_data.get("PrincipalInvestigators") or raw_data.get("principal_investigators") or raw_data.get("pi", [])
        pi_list: List[Dict[str, str]] = []
        if isinstance(pis, list):
            for p in pis:
                if isinstance(p, dict):
                    pi_list.append({
                        "name": p.get("fullName") or p.get("name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip(),
                        "role": p.get("role", "PI"),
                        "orcid": p.get("orcid", ""),
                    })
                elif isinstance(p, str):
                    pi_list.append({"name": p, "role": "PI", "orcid": ""})
        elif isinstance(pis, str):
            pi_list.append({"name": pis, "role": "PI", "orcid": ""})

        # Organization
        org = raw_data.get("Organization") or raw_data.get("organization", {})
        if isinstance(org, dict):
            organization = {
                "name": org.get("orgName") or org.get("name", ""),
                "city": org.get("orgCity") or org.get("city", ""),
                "state": org.get("orgState") or org.get("state", ""),
                "country": org.get("orgCountry") or org.get("country", "US"),
                "zip": org.get("orgZipCode") or org.get("zip", ""),
            }
        else:
            organization = {"name": str(org), "city": "", "state": "", "country": "US", "zip": ""}

        # Funding
        award_amount = raw_data.get("AwardAmount") or raw_data.get("award_amount") or raw_data.get("awardAmount", 0)
        if isinstance(award_amount, str):
            try:
                award_amount = float(award_amount.replace(",", "").replace("$", ""))
            except ValueError:
                award_amount = 0.0

        # Agency / Institute funding
        agency_fundings = raw_data.get("AgencyIcFundings") or raw_data.get("agency_ic_fundings") or []
        ic_list: List[Dict[str, Any]] = []
        if isinstance(agency_fundings, list):
            for af in agency_fundings:
                if isinstance(af, dict):
                    code = af.get("code") or af.get("icCode", "")
                    ic_list.append({
                        "code": code,
                        "name": self.IC_CODES.get(code, code),
                        "amount": af.get("totalCost") or af.get("amount", 0),
                    })

        # Dates
        start_date = raw_data.get("ProjectStartDate") or raw_data.get("project_start_date", "")
        end_date = raw_data.get("ProjectEndDate") or raw_data.get("project_end_date", "")
        fiscal_year = raw_data.get("FiscalYear") or raw_data.get("fiscal_year", "")

        # Activity code and project type
        activity_code = raw_data.get("ActivityCode") or raw_data.get("activity_code", "")
        project_type = self._activity_code_to_project_type(activity_code)

        # Is active
        is_active = False
        if end_date:
            try:
                end = datetime.strptime(str(end_date)[:10], "%Y-%m-%d")
                is_active = end >= datetime.now()
            except ValueError:
                pass

        # URL
        url = ""
        if project_num:
            url = f"{self.WEB_BASE}/project-details/{project_num}"

        confidence = self.get_confidence_score(raw_data)

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": str(project_num),
            "title": title,
            "abstract": abstract,
            "principal_investigators": pi_list,
            "organization": organization,
            "award_amount": float(award_amount) if award_amount else 0.0,
            "funding_institutes": ic_list,
            "activity_code": activity_code,
            "project_type": project_type,
            "project_type_label": self.PROJECT_TYPES.get(project_type, "Research Project"),
            "start_date": str(start_date)[:10] if start_date else "",
            "end_date": str(end_date)[:10] if end_date else "",
            "fiscal_year": fiscal_year,
            "is_active": is_active,
            "evidence_grade": "B",  # research funding evidence
            "confidence": confidence,
            "provenance": self.get_provenance(raw_data),
            "url": url,
            "raw_data": raw_data,
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for a NIH RePORTER project."""
        activity_code = (result.get("ActivityCode") or result.get("activity_code", "")).upper()
        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat() + "Z",
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.88,
            "research_only": True,
            "curation_status": "nih_official_record",
            "activity_code": activity_code,
            "us_government_source": True,
            "fiscal_year": result.get("FiscalYear") or result.get("fiscal_year", ""),
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Compute confidence score for a NIH RePORTER project entry.

        Confidence reflects the reliability of the funding record and
        its relevance as research evidence.
        """
        award_amount = result.get("AwardAmount") or result.get("award_amount", 0)
        if isinstance(award_amount, str):
            try:
                award_amount = float(award_amount.replace(",", "").replace("$", ""))
            except ValueError:
                award_amount = 0
        activity_code = (result.get("ActivityCode") or result.get("activity_code", "")).upper()
        has_abstract = bool(result.get("AbstractText") or result.get("abstract_text"))
        has_pis = bool(result.get("PrincipalInvestigators") or result.get("principal_investigators"))

        # Evidence strength - NIH grants represent planned research
        if activity_code.startswith("R01"):
            evidence_strength = 0.88  # standard research
        elif activity_code.startswith(("U01", "P01")):
            evidence_strength = 0.90  # cooperative agreements, program projects
        elif activity_code.startswith(("R21", "R03")):
            evidence_strength = 0.78  # exploratory grants
        elif activity_code.startswith("T"):
            evidence_strength = 0.65  # training grants
        elif activity_code.startswith("F"):
            evidence_strength = 0.68  # fellowships
        else:
            evidence_strength = 0.80

        # Data quality
        data_quality = 0.92  # NIH records are highly reliable
        if has_abstract:
            data_quality += 0.03
        if has_pis:
            data_quality += 0.03
        data_quality = min(data_quality, 0.99)

        # Sample size indicator via award amount
        if award_amount > 5000000:
            sample_size = 0.85
        elif award_amount > 1000000:
            sample_size = 0.80
        elif award_amount > 500000:
            sample_size = 0.75
        elif award_amount > 100000:
            sample_size = 0.70
        else:
            sample_size = 0.60

        replication = 0.50  # single grant, not replicated
        consistency = 0.85
        temporal_relevance = 0.82
        population_match = 0.75

        overall = round(
            (evidence_strength * 0.25
             + data_quality * 0.30
             + sample_size * 0.10
             + replication * 0.08
             + consistency * 0.12
             + temporal_relevance * 0.08
             + population_match * 0.07),
            3,
        )

        return {
            "data_quality": round(data_quality, 3),
            "evidence_strength": round(evidence_strength, 3),
            "sample_size": round(sample_size, 3),
            "replication": round(replication, 3),
            "consistency": round(consistency, 3),
            "temporal_relevance": round(temporal_relevance, 3),
            "population_match": round(population_match, 3),
            "overall": overall,
        }

    # ------------------------------------------------------------------
    # Extended helpers
    # ------------------------------------------------------------------

    async def fetch_project_publications(self, project_num: str) -> List[Dict]:
        """
        Retrieve publications linked to a specific NIH project.

        Parameters
        ----------
        project_num: NIH project number (e.g., '1R01CA123456-01A1')

        Returns
        -------
        List of publication dictionaries.
        """
        try:
            payload = {
                "criteria": [{"field": "coreprojectNum", "operator": "equals", "value": project_num}],
                "limit": 100,
            }
            resp = await self._rate_limited_post(
                f"{self.API_BASE}/publications/search", json_data=payload
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data if isinstance(data, list) else data.get("results", [])
                for r in results:
                    r["_fetch_source"] = "nih_reporter_publications"
                return results
            logger.warning(f"NIH publications HTTP {resp.status_code} for {project_num}")
            return []
        except Exception as exc:
            logger.error(f"NIH fetch_project_publications failed for {project_num}: {exc}")
            return []

    async def get_institutes(self) -> List[Dict]:
        """Return a list of NIH institutes and centers."""
        return [
            {"code": code, "name": name}
            for code, name in self.IC_CODES.items()
        ]

    async def get_project_statistics(self) -> Optional[Dict]:
        """Fetch aggregate statistics from NIH RePORTER."""
        try:
            resp = await self._rate_limited_get(f"{self.API_BASE}/projects/aggregation")
            if resp.status_code == 200:
                return resp.json()
            return None
        except Exception as exc:
            logger.error(f"NIH project statistics failed: {exc}")
            return None

    async def close(self):
        await self.client.aclose()

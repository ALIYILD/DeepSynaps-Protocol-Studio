"""
literature_monitor.py — Automated Literature Monitor for DeepSynaps Protocols.

Weekly scheduled scans of PubMed and ClinicalTrials.gov for new evidence
relevant to DeepSynaps neuromodulation protocols. Detects new publications,
generates weekly literature digests, and alerts clinicians when high-impact
papers are published.

Features:
- Scheduled weekly scans (Monday 00:00 UTC) via APScheduler
- Query PubMed for: "tDCS depression", "TMS OCD", "neurofeedback ADHD",
  "PBM TBI", and other DeepSynaps-relevant queries
- Query ClinicalTrials.gov for new neuromodulation trials
- Detect new publications since last scan
- Generate weekly literature digest
- Alert clinicians when high-impact papers published (Lancet, JAMA, Nature, etc.)

Usage:
    # Run weekly scan manually
    python literature_monitor.py --scan

    # Start scheduler daemon
    python literature_monitor.py --schedule

    # Generate digest from last results
    python literature_monitor.py --digest

    # Run tests
    python literature_monitor.py --test

Env:
    PUBMED_API_KEY  — NCBI API key (bumps rate limit 3/s -> 10/s)
    PUBMED_EMAIL    — NCBI contact email
    NCBI_API_KEY    — Fallback API key name
    MONITOR_DB_PATH — Path to monitor SQLite DB (default: ./literature_monitor.db)
    ALERT_WEBHOOK   — Optional webhook URL for high-impact alerts
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, Tuple

# ---------------------------------------------------------------------------
# Optional dependency: APScheduler for production scheduling.
# Falls back to asyncio.sleep loop if unavailable.
# ---------------------------------------------------------------------------
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    APSCHEDULER_AVAILABLE = True
except ImportError:
    APSCHEDULER_AVAILABLE = False

# ---------------------------------------------------------------------------
# Optional dependency: requests (fall back to urllib)
# ---------------------------------------------------------------------------
try:
    import requests

    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# =============================================================================
# LOGGING
# =============================================================================

logger = logging.getLogger("literature_monitor")


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure structured logging for the literature monitor."""
    if logger.handlers:
        logger.setLevel(level)
        return logger
    logger.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    fmt = logging.Formatter(
        "%(asctime)s | %(name)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    return logger


# =============================================================================
# DATA MODELS
# =============================================================================


class ImpactTier(Enum):
    """Impact classification for published papers."""

    TIER_1 = "tier_1"  # Highest impact: Lancet, JAMA, Nature, Science, NEJM
    TIER_2 = "tier_2"  # High impact: BMJ, Cell, PNAS, Brain, Biol Psychiatry
    TIER_3 = "tier_3"  # Moderate: Neurology, JNNP, Psych Neuro, etc.
    STANDARD = "standard"  # Everything else


IMPACT_TIER_1_JOURNALS: Tuple[str, ...] = (
    "lancet",
    "jama",
    "nature",
    "science",
    "new england journal of medicine",
    "nejm",
    "nature medicine",
    "nature neuroscience",
    "cell",
    "british medical journal",
    "bmj",
)

IMPACT_TIER_2_JOURNALS: Tuple[str, ...] = (
    "brain",
    "biological psychiatry",
    "molecular psychiatry",
    "pnas",
    "proceedings of the national academy of sciences",
    "american journal of psychiatry",
    "archives of general psychiatry",
    "neuropsychopharmacology",
    "world psychiatry",
    "annals of neurology",
    "neuron",
    "nature communications",
    "science translational medicine",
)

IMPACT_TIER_3_JOURNALS: Tuple[str, ...] = (
    "neurology",
    "journal of neurology neurosurgery and psychiatry",
    "jnnp",
    "psychological medicine",
    "neuroimage",
    "clinical neurophysiology",
    "journal of affective disorders",
    "depression and anxiety",
    "psychiatry research",
    "cortex",
    "neuroscience",
    "psychopharmacology",
    "european psychiatry",
    "neurotherapeutics",
    "journal of clinical psychiatry",
    "journal of neuropsychiatry",
    "frontiers in psychiatry",
    "frontiers in neuroscience",
    "international journal of neuropsychopharmacology",
    "translational psychiatry",
)


@dataclass
class Paper:
    """A published paper retrieved from PubMed."""

    pmid: str
    title: str
    authors: List[str] = field(default_factory=list)
    year: Optional[int] = None
    journal: Optional[str] = None
    abstract: Optional[str] = None
    doi: Optional[str] = None
    pub_date: Optional[str] = None
    impact_tier: ImpactTier = ImpactTier.STANDARD
    is_new: bool = False
    confidence_score: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        d = asdict(self)
        d["impact_tier"] = self.impact_tier.value
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Paper":
        """Deserialize from dictionary."""
        data = dict(data)
        tier = data.pop("impact_tier", "standard")
        data["impact_tier"] = ImpactTier(tier) if isinstance(tier, str) else tier
        return cls(**data)


@dataclass
class ClinicalTrial:
    """A clinical trial retrieved from ClinicalTrials.gov."""

    nct_id: str
    title: str
    status: Optional[str] = None
    phase: Optional[str] = None
    conditions: List[str] = field(default_factory=list)
    interventions: List[str] = field(default_factory=list)
    enrollment: Optional[int] = None
    sponsor: Optional[str] = None
    start_date: Optional[str] = None
    last_update: Optional[str] = None
    study_type: Optional[str] = None
    locations: List[str] = field(default_factory=list)
    confidence_score: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ClinicalTrial":
        """Deserialize from dictionary."""
        return cls(**data)


@dataclass
class WeeklyDigest:
    """Weekly literature digest summarizing scan results."""

    scan_date: str
    total_new_papers: int = 0
    total_new_trials: int = 0
    high_impact_papers: List[Paper] = field(default_factory=list)
    papers_by_topic: Dict[str, List[Paper]] = field(default_factory=dict)
    trials_by_condition: Dict[str, List[ClinicalTrial]] = field(default_factory=dict)
    impact_summary: Dict[str, int] = field(default_factory=dict)
    alert_triggered: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "scan_date": self.scan_date,
            "total_new_papers": self.total_new_papers,
            "total_new_trials": self.total_new_trials,
            "high_impact_papers": [p.to_dict() for p in self.high_impact_papers],
            "papers_by_topic": {
                k: [p.to_dict() for p in v] for k, v in self.papers_by_topic.items()
            },
            "trials_by_condition": {
                k: [t.to_dict() for t in v] for k, v in self.trials_by_condition.items()
            },
            "impact_summary": self.impact_summary,
            "alert_triggered": self.alert_triggered,
        }


# =============================================================================
# DEFAULT QUERY CONFIGURATION
# =============================================================================

# PubMed queries mapped to DeepSynaps protocol topics
DEFAULT_PUBMED_QUERIES: Dict[str, str] = {
    "tDCS_depression": '("transcranial direct current stimulation"[Title/Abstract] OR tDCS[Title/Abstract]) AND depression[Title/Abstract]',
    "TMS_OCD": '("transcranial magnetic stimulation"[Title/Abstract] OR TMS[Title/Abstract] OR rTMS[Title/Abstract]) AND ("obsessive compulsive disorder"[Title/Abstract] OR OCD[Title/Abstract])',
    "neurofeedback_ADHD": '(neurofeedback[Title/Abstract] OR "EEG biofeedback"[Title/Abstract]) AND (ADHD[Title/Abstract] OR "attention deficit"[Title/Abstract])',
    "PBM_TBI": '("photobiomodulation"[Title/Abstract] OR "low level laser"[Title/Abstract] OR "red light therapy"[Title/Abstract] OR "near infrared"[Title/Abstract]) AND ("traumatic brain injury"[Title/Abstract] OR TBI[Title/Abstract])',
    "tDCS_anxiety": '("transcranial direct current stimulation"[Title/Abstract] OR tDCS[Title/Abstract]) AND anxiety[Title/Abstract]',
    "TMS_depression": '("transcranial magnetic stimulation"[Title/Abstract] OR rTMS[Title/Abstract]) AND depression[Title/Abstract]',
    "neurofeedback_depression": 'neurofeedback[Title/Abstract] AND depression[Title/Abstract]',
    "PBM_depression": '("photobiomodulation"[Title/Abstract] OR "red light therapy"[Title/Abstract]) AND depression[Title/Abstract]',
    "tDCS_chronic_pain": '("transcranial direct current stimulation"[Title/Abstract] OR tDCS[Title/Abstract]) AND ("chronic pain"[Title/Abstract] OR fibromyalgia[Title/Abstract])',
    "TMS_PTSD": '("transcranial magnetic stimulation"[Title/Abstract] OR TMS[Title/Abstract]) AND (PTSD[Title/Abstract] OR "post traumatic stress"[Title/Abstract])',
    "neurofeedback_insomnia": 'neurofeedback[Title/Abstract] AND (insomnia[Title/Abstract] OR sleep[Title/Abstract])',
    "PBM_cognitive": '("photobiomodulation"[Title/Abstract] OR "red light therapy"[Title/Abstract]) AND (cognitive[Title/Abstract] OR cognition[Title/Abstract])',
    "tACS_cognition": '("transcranial alternating current stimulation"[Title/Abstract] OR tACS[Title/Abstract]) AND (cognitive[Title/Abstract] OR cognition[Title/Abstract])',
    "DBS_depression": '("deep brain stimulation"[Title/Abstract] OR DBS[Title/Abstract]) AND depression[Title/Abstract]',
    "ECT_alternatives": '(ECT[Title/Abstract] OR "electroconvulsive therapy"[Title/Abstract]) AND (neuromodulation[Title/Abstract] OR "non invasive"[Title/Abstract])',
    "tDCS_autism": '("transcranial direct current stimulation"[Title/Abstract] OR tDCS[Title/Abstract]) AND (autism[Title/Abstract] OR ASD[Title/Abstract])',
    "TMS_addiction": '("transcranial magnetic stimulation"[Title/Abstract] OR TMS[Title/Abstract]) AND (addiction[Title/Abstract] OR "substance use"[Title/Abstract])',
    "neurofeedback_PTSD": 'neurofeedback[Title/Abstract] AND (PTSD[Title/Abstract] OR "post traumatic stress"[Title/Abstract])',
    "PBM_stroke": '("photobiomodulation"[Title/Abstract] OR "red light therapy"[Title/Abstract]) AND stroke[Title/Abstract]',
    "tDCS_migraine": '("transcranial direct current stimulation"[Title/Abstract] OR tDCS[Title/Abstract]) AND migraine[Title/Abstract]',
}

# ClinicalTrials.gov conditions to monitor
DEFAULT_CLINICAL_TRIAL_QUERIES: Dict[str, str] = {
    "neuromodulation_depression": "neuromodulation AND depression",
    "tDCS_mental_health": "tDCS OR \"transcranial direct current stimulation\"",
    "TMS_psychiatric": "rTMS OR \"transcranial magnetic stimulation\"",
    "neurofeedback": "neurofeedback OR \"EEG biofeedback\"",
    "photobiomodulation": "photobiomodulation OR \"red light therapy\" OR \"low level laser\"",
    "deep_brain_stimulation": "\"deep brain stimulation\" OR DBS",
    "vagus_nerve_stimulation": "\"vagus nerve stimulation\" OR VNS",
    "neuromodulation_pain": "neuromodulation AND chronic pain",
    "neuromodulation_PTSD": "neuromodulation AND PTSD",
    "neuromodulation_TBI": "neuromodulation AND \"traumatic brain injury\"",
}


# =============================================================================
# PUBMED CLIENT
# =============================================================================


class PubMedAdapter(Protocol):
    """Protocol for PubMed adapter implementations."""

    def search(self, query: str, days_back: int = 7, max_results: int = 50) -> List[Dict[str, Any]]:
        """Search PubMed and return raw result dictionaries."""
        ...


class PubMedClientAdapter:
    """PubMed E-utilities client with rate limiting and retry logic."""

    BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    DEFAULT_TIMEOUT = 30
    MAX_RETRIES = 4
    RETRY_STATUSES = {429, 500, 502, 503, 504}

    def __init__(
        self,
        api_key: Optional[str] = None,
        contact_email: Optional[str] = None,
        tool_name: str = "deepsynaps-literature-monitor",
    ) -> None:
        self.api_key = (
            api_key
            or os.environ.get("PUBMED_API_KEY")
            or os.environ.get("NCBI_API_KEY")
            or None
        )
        self.contact_email = contact_email or os.environ.get("PUBMED_EMAIL") or None
        self.tool_name = tool_name
        self._min_interval = 0.11 if self.api_key else 0.34
        self._last_call_ts = 0.0
        self._sleep_count = 0
        self._logger = logging.getLogger("literature_monitor.pubmed")

    # ------------------------------------------------------------------ internal
    def _rate_limit_sleep(self) -> None:
        now = time.monotonic()
        delta = now - self._last_call_ts
        if delta < self._min_interval:
            time.sleep(self._min_interval - delta)
            self._sleep_count += 1
        self._last_call_ts = time.monotonic()

    def _base_params(self) -> Dict[str, str]:
        params: Dict[str, str] = {"tool": self.tool_name}
        if self.api_key:
            params["api_key"] = self.api_key
        if self.contact_email:
            params["email"] = self.contact_email
        return params

    def _get(self, endpoint: str, params: Dict[str, Any]) -> Any:
        """GET with rate-limit sleep + exponential backoff on 429/5xx."""
        url = f"{self.BASE}/{endpoint}"
        merged = {**self._base_params(), **params}
        backoff = 1.0
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.MAX_RETRIES + 1):
            self._rate_limit_sleep()
            try:
                if HAS_REQUESTS:
                    resp = requests.get(url, params=merged, timeout=self.DEFAULT_TIMEOUT)
                    status_code = resp.status_code
                    content = resp.content
                else:
                    query_string = urllib.parse.urlencode(merged)
                    full_url = f"{url}?{query_string}"
                    with urllib.request.urlopen(full_url, timeout=self.DEFAULT_TIMEOUT) as r:
                        content = r.read()
                        status_code = r.getcode()
            except Exception as e:
                last_exc = e
                if attempt == self.MAX_RETRIES:
                    raise
                time.sleep(backoff)
                backoff *= 2
                continue
            if status_code in self.RETRY_STATUSES and attempt < self.MAX_RETRIES:
                time.sleep(backoff)
                backoff *= 2
                continue
            if HAS_REQUESTS:
                resp.raise_for_status()
                return resp
            else:
                # For urllib, parse content
                class _FakeResp:
                    content = property(lambda self: content)
                    text = property(lambda self: content.decode("utf-8"))
                    status_code = status_code
                    def json(self):
                        return json.loads(content.decode("utf-8"))
                return _FakeResp()
        raise RuntimeError(f"PubMed retry exhausted: {last_exc!r}")

    # ------------------------------------------------------------------ esearch
    def esearch(self, query: str, days_back: int = 7, max_results: int = 50) -> List[str]:
        """Return PMIDs matching query, restricted to the last N days."""
        params: Dict[str, Any] = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": str(max_results),
            "sort": "date",
        }
        if days_back > 0:
            params["reldate"] = str(days_back)
            params["datetype"] = "pdat"
        r = self._get("esearch.fcgi", params)
        data = r.json()
        return data.get("esearchresult", {}).get("idlist", []) or []

    # ------------------------------------------------------------------ efetch
    def efetch(self, pmids: List[str]) -> List[Dict[str, Any]]:
        """Full metadata records for the given PMIDs."""
        if not pmids:
            return []
        params: Dict[str, str] = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        r = self._get("efetch.fcgi", params)
        return self._parse_pubmed_xml(r.content)

    # ------------------------------------------------------------------ esummary
    def esummary(self, pmids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Lighter-weight summary keyed by PMID."""
        if not pmids:
            return {}
        params: Dict[str, str] = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "json",
        }
        r = self._get("esummary.fcgi", params)
        data = r.json().get("result", {})
        uids = data.get("uids", [])
        return {uid: data.get(uid, {}) for uid in uids}

    # ------------------------------------------------------------------ combined
    def search(
        self,
        query: str,
        days_back: int = 7,
        max_results: int = 50,
    ) -> List[Dict[str, Any]]:
        """esearch + efetch in one call. Returns normalised dicts."""
        self._logger.info("PubMed search: query=%r days_back=%d max_results=%d", query, days_back, max_results)
        pmids = self.esearch(query, days_back=days_back, max_results=max_results)
        self._logger.info("PubMed esearch returned %d PMIDs", len(pmids))
        if not pmids:
            return []
        return self.efetch(pmids)

    # ------------------------------------------------------------------ parsing
    @staticmethod
    def _text(node: Optional[ET.Element], path: str, default: Optional[str] = None) -> Optional[str]:
        if node is None:
            return default
        el = node.find(path)
        return el.text if el is not None and el.text else default

    @classmethod
    def _parse_pubmed_xml(cls, xml_bytes: bytes) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        try:
            root = ET.fromstring(xml_bytes)
        except ET.ParseError as e:
            cls._logger = logging.getLogger("literature_monitor.pubmed")
            cls._logger.warning("PubMed XML parse error: %s", e)
            return out
        for art in root.findall(".//PubmedArticle"):
            medline = art.find("MedlineCitation")
            pmid = cls._text(medline, "PMID")
            article = medline.find("Article") if medline is not None else None
            title = cls._text(article, "ArticleTitle")
            abstract = " ".join(
                (el.text or "")
                for el in (article.findall(".//AbstractText") if article is not None else [])
            ).strip() or None
            journal = cls._text(article, "Journal/Title")
            year: Optional[int] = None
            pub_date_str: Optional[str] = None
            if article is not None:
                y = article.find(".//PubDate/Year")
                if y is not None and y.text and y.text.isdigit():
                    year = int(y.text)
                else:
                    md = article.find(".//PubDate/MedlineDate")
                    if md is not None and md.text:
                        tok = md.text.strip().split()[0].split("-")[0]
                        if tok.isdigit():
                            year = int(tok)
                # Try to get full pub date
                pubdate = article.find(".//PubDate")
                if pubdate is not None:
                    parts = []
                    for tag in ["Year", "Month", "Day"]:
                        el = pubdate.find(tag)
                        if el is not None and el.text:
                            parts.append(el.text)
                    if parts:
                        pub_date_str = " ".join(parts)
            authors: List[str] = []
            if article is not None:
                for a in article.findall(".//Author"):
                    last = cls._text(a, "LastName", "")
                    init = cls._text(a, "Initials", "")
                    coll = cls._text(a, "CollectiveName")
                    if coll:
                        authors.append(coll)
                    elif last:
                        authors.append(f"{last} {init}".strip())
            doi: Optional[str] = None
            for aid in art.findall(".//ArticleId"):
                if aid.attrib.get("IdType") == "doi" and aid.text:
                    doi = aid.text.lower().strip()
                    break
            out.append(
                {
                    "pmid": pmid,
                    "doi": doi,
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "journal": journal,
                    "abstract": abstract,
                    "pub_date": pub_date_str,
                }
            )
        return out


# =============================================================================
# CLINICAL TRIALS CLIENT
# =============================================================================


class ClinicalTrialsAdapter(Protocol):
    """Protocol for ClinicalTrials.gov adapter implementations."""

    def search(self, query: str, max_records: int = 100) -> List[Dict[str, Any]]:
        """Search ClinicalTrials.gov and return raw result dictionaries."""
        ...


class ClinicalTrialsClientAdapter:
    """ClinicalTrials.gov v2 API client with pagination support."""

    BASE = "https://clinicaltrials.gov/api/v2/studies"
    DEFAULT_TIMEOUT = 40
    MAX_RETRIES = 4
    RETRY_STATUSES = {429, 500, 502, 503, 504}

    def __init__(self, max_pages: int = 10) -> None:
        self.max_pages = max_pages
        self._logger = logging.getLogger("literature_monitor.ctgov")

    def _get(self, url: str) -> Dict[str, Any]:
        """GET with retry logic."""
        backoff = 1.0
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                if HAS_REQUESTS:
                    resp = requests.get(url, timeout=self.DEFAULT_TIMEOUT)
                    resp.raise_for_status()
                    return resp.json()
                else:
                    with urllib.request.urlopen(url, timeout=self.DEFAULT_TIMEOUT) as r:
                        return json.loads(r.read().decode())
            except Exception as e:
                if attempt == self.MAX_RETRIES:
                    raise
                if hasattr(e, "code") and e.code in self.RETRY_STATUSES:  # type: ignore[union-attr]
                    pass
                time.sleep(backoff)
                backoff *= 2
        return {}

    def search(
        self,
        query: str,
        max_records: int = 100,
        filter_last_update: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search ClinicalTrials.gov v2 API with pagination.

        Args:
            query: Search query string.
            max_records: Maximum total records to return.
            filter_last_update: ISO date string. If provided, only returns trials
                updated on or after this date.

        Returns:
            List of study dictionaries.
        """
        self._logger.info("ClinicalTrials search: query=%r max_records=%d", query, max_records)
        out: List[Dict[str, Any]] = []
        next_token: Optional[str] = None
        page_size = min(max_records, 1000)
        base = (
            f"{self.BASE}?query.term={urllib.parse.quote(query)}"
            f"&pageSize={page_size}&countTotal=true"
        )
        if filter_last_update:
            base += f"&filter.lastUpdatePostDate={filter_last_update}"

        pages = 0
        while len(out) < max_records and pages < self.max_pages:
            url = base + (f"&pageToken={urllib.parse.quote(next_token)}" if next_token else "")
            data = self._get(url)
            studies = data.get("studies", [])
            out.extend(studies)
            next_token = data.get("nextPageToken")
            pages += 1
            if not next_token or not studies:
                break
            time.sleep(0.2)

        self._logger.info("ClinicalTrials returned %d studies in %d pages", len(out[:max_records]), pages)
        return out[:max_records]

    @staticmethod
    def _get_nested(data: Dict[str, Any], *keys: str, default: Any = None) -> Any:
        for k in keys:
            if data is None:
                return default
            data = data.get(k) if isinstance(data, dict) else None
        return data if data is not None else default

    def parse_study(self, study: Dict[str, Any]) -> Dict[str, Any]:
        """Parse a raw ClinicalTrials.gov study into a normalized dict."""
        proto = study.get("protocolSection", {})
        idmod = self._get_nested(proto, "identificationModule") or {}
        statmod = self._get_nested(proto, "statusModule") or {}
        desc = self._get_nested(proto, "descriptionModule") or {}
        cond = self._get_nested(proto, "conditionsModule") or {}
        arms = self._get_nested(proto, "armsInterventionsModule") or {}
        design = self._get_nested(proto, "designModule") or {}
        spons = self._get_nested(proto, "sponsorCollaboratorsModule") or {}
        locs = self._get_nested(proto, "contactsLocationsModule") or {}

        interventions = arms.get("interventions") or []
        conditions = cond.get("conditions") or []
        locations_list = locs.get("locations") or []

        return {
            "nct_id": idmod.get("nctId"),
            "title": idmod.get("briefTitle") or idmod.get("officialTitle"),
            "status": statmod.get("overallStatus"),
            "phase": ", ".join(design.get("phases") or []),
            "conditions": conditions,
            "interventions": [i.get("name", "") for i in interventions if isinstance(i, dict)],
            "enrollment": (design.get("enrollmentInfo") or {}).get("count"),
            "sponsor": (spons.get("leadSponsor") or {}).get("name"),
            "start_date": (statmod.get("startDateStruct") or {}).get("date"),
            "last_update": (statmod.get("lastUpdatePostDateStruct") or {}).get("date"),
            "study_type": design.get("studyType"),
            "locations": [
                f"{loc.get('city','')}, {loc.get('country','')}"
                for loc in locations_list if isinstance(loc, dict)
            ],
        }


# =============================================================================
# MONITOR DATABASE
# =============================================================================


class MonitorDatabase:
    """SQLite persistence layer for literature monitor state."""

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS scan_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_date   TEXT NOT NULL,
        scan_type   TEXT NOT NULL,
        query_key   TEXT,
        new_count   INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        duration_ms INTEGER,
        status      TEXT DEFAULT 'success',
        error       TEXT,
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS seen_papers (
        pmid        TEXT PRIMARY KEY,
        title       TEXT,
        journal     TEXT,
        year        INTEGER,
        authors_json TEXT,
        first_seen  TEXT NOT NULL,
        last_seen   TEXT NOT NULL,
        impact_tier TEXT DEFAULT 'standard',
        topics_json TEXT
    );

    CREATE TABLE IF NOT EXISTS seen_trials (
        nct_id      TEXT PRIMARY KEY,
        title       TEXT,
        status      TEXT,
        phase       TEXT,
        first_seen  TEXT NOT NULL,
        last_seen   TEXT NOT NULL,
        conditions_json TEXT
    );

    CREATE TABLE IF NOT EXISTS weekly_digests (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start  TEXT NOT NULL UNIQUE,
        digest_json TEXT NOT NULL,
        alert_sent  INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alert_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type  TEXT NOT NULL,
        pmid        TEXT,
        nct_id      TEXT,
        message     TEXT NOT NULL,
        sent_at     TEXT DEFAULT CURRENT_TIMESTAMP,
        channel     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_seen_papers_tier ON seen_papers(impact_tier);
    CREATE INDEX IF NOT EXISTS idx_seen_papers_first ON seen_papers(first_seen);
    CREATE INDEX IF NOT EXISTS idx_history_date ON scan_history(scan_date);
    """

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or os.environ.get(
            "MONITOR_DB_PATH", "./literature_monitor.db"
        )
        self._conn: Optional[sqlite3.Connection] = None
        self._ensure_tables()

    def _connect(self) -> sqlite3.Connection:
        # For :memory: databases, reuse the same connection
        if self.db_path == ":memory:":
            if self._conn is None:
                self._conn = sqlite3.connect(self.db_path, timeout=30)
                self._conn.row_factory = sqlite3.Row
                self._conn.execute("PRAGMA foreign_keys = ON")
            return self._conn
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_tables(self) -> None:
        with self._connect() as conn:
            conn.executescript(self.SCHEMA)

    # --- Scan history ---

    def log_scan(
        self,
        scan_type: str,
        query_key: str,
        new_count: int,
        total_count: int,
        duration_ms: int,
        status: str = "success",
        error: Optional[str] = None,
    ) -> int:
        """Log a scan execution. Returns the scan_history row id."""
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._connect() as conn:
            cur = conn.execute(
                """INSERT INTO scan_history
                    (scan_date, scan_type, query_key, new_count, total_count,
                     duration_ms, status, error)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (now, scan_type, query_key, new_count, total_count, duration_ms, status, error),
            )
            return cur.lastrowid or 0

    def get_last_scan_date(self, scan_type: str, query_key: str) -> Optional[str]:
        """Get the most recent successful scan date for a query."""
        with self._connect() as conn:
            row = conn.execute(
                """SELECT scan_date FROM scan_history
                    WHERE scan_type=? AND query_key=? AND status='success'
                    ORDER BY scan_date DESC LIMIT 1""",
                (scan_type, query_key),
            ).fetchone()
            return row[0] if row else None

    def get_scan_stats(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get scan statistics for the last N days."""
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT scan_date, scan_type, query_key, new_count,
                          total_count, status
                     FROM scan_history
                    WHERE scan_date >= datetime('now', '-{} days')
                    ORDER BY scan_date DESC""".format(days)
            ).fetchall()
            return [dict(r) for r in rows]

    # --- Seen papers ---

    def get_seen_pmids(self) -> set[str]:
        """Return all previously seen PMIDs."""
        with self._connect() as conn:
            rows = conn.execute("SELECT pmid FROM seen_papers").fetchall()
            return {r[0] for r in rows if r[0]}

    def get_seen_nct_ids(self) -> set[str]:
        """Return all previously seen NCT IDs."""
        with self._connect() as conn:
            rows = conn.execute("SELECT nct_id FROM seen_trials").fetchall()
            return {r[0] for r in rows if r[0]}

    def record_papers(self, papers: List[Paper], topic: str) -> int:
        """Record papers as seen. Returns count of newly recorded papers."""
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        new_count = 0
        with self._connect() as conn:
            for paper in papers:
                existing = conn.execute(
                    "SELECT pmid FROM seen_papers WHERE pmid=?", (paper.pmid,)
                ).fetchone()
                if existing:
                    conn.execute(
                        "UPDATE seen_papers SET last_seen=? WHERE pmid=?",
                        (now, paper.pmid),
                    )
                else:
                    conn.execute(
                        """INSERT INTO seen_papers
                            (pmid, title, journal, year, authors_json,
                             first_seen, last_seen, impact_tier, topics_json)
                           VALUES (?,?,?,?,?,?,?,?,?)""",
                        (
                            paper.pmid,
                            paper.title,
                            paper.journal,
                            paper.year,
                            json.dumps(paper.authors, ensure_ascii=False),
                            now,
                            now,
                            paper.impact_tier.value,
                            json.dumps([topic], ensure_ascii=False),
                        ),
                    )
                    new_count += 1
        return new_count

    def record_trials(self, trials: List[ClinicalTrial]) -> int:
        """Record trials as seen. Returns count of newly recorded trials."""
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        new_count = 0
        with self._connect() as conn:
            for trial in trials:
                existing = conn.execute(
                    "SELECT nct_id FROM seen_trials WHERE nct_id=?", (trial.nct_id,)
                ).fetchone()
                if existing:
                    conn.execute(
                        "UPDATE seen_trials SET last_seen=? WHERE nct_id=?",
                        (now, trial.nct_id),
                    )
                else:
                    conn.execute(
                        """INSERT INTO seen_trials
                            (nct_id, title, status, phase, first_seen, last_seen,
                             conditions_json)
                           VALUES (?,?,?,?,?,?,?)""",
                        (
                            trial.nct_id,
                            trial.title,
                            trial.status,
                            trial.phase,
                            now,
                            now,
                            json.dumps(trial.conditions, ensure_ascii=False),
                        ),
                    )
                    new_count += 1
        return new_count

    # --- Digests ---

    def save_digest(self, week_start: str, digest: Dict[str, Any]) -> None:
        """Save a weekly digest."""
        with self._connect() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO weekly_digests
                    (week_start, digest_json, created_at)
                   VALUES (?,?,?)""",
                (week_start, json.dumps(digest, ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
            )

    def get_digest(self, week_start: str) -> Optional[Dict[str, Any]]:
        """Retrieve a weekly digest."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT digest_json FROM weekly_digests WHERE week_start=?", (week_start,)
            ).fetchone()
            if row:
                return json.loads(row[0])
            return None

    # --- Alerts ---

    def log_alert(
        self,
        alert_type: str,
        message: str,
        pmid: Optional[str] = None,
        nct_id: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> None:
        """Log an alert that was sent."""
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO alert_log
                    (alert_type, pmid, nct_id, message, channel)
                   VALUES (?,?,?,?,?)""",
                (alert_type, pmid, nct_id, message, channel),
            )

    def get_recent_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent alerts."""
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT * FROM alert_log ORDER BY sent_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]


# =============================================================================
# ALERT SYSTEM
# =============================================================================


class AlertChannel(Protocol):
    """Protocol for alert channel implementations."""

    def send(self, message: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Send an alert. Returns True if sent successfully."""
        ...


class WebhookAlertChannel:
    """Send alerts via HTTP webhook."""

    def __init__(self, webhook_url: Optional[str] = None) -> None:
        self.webhook_url = webhook_url or os.environ.get("ALERT_WEBHOOK")
        self._logger = logging.getLogger("literature_monitor.alerts")

    def send(self, message: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        if not self.webhook_url:
            self._logger.warning("No webhook URL configured, alert not sent: %s", message[:100])
            return False
        payload = {
            "text": message,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "literature_monitor",
        }
        try:
            if HAS_REQUESTS:
                resp = requests.post(
                    self.webhook_url,
                    json=payload,
                    timeout=10,
                )
                success = resp.status_code < 400
            else:
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    self.webhook_url,
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    success = r.getcode() < 400
            self._logger.info("Webhook alert sent: success=%s", success)
            return success
        except Exception as e:
            self._logger.error("Webhook alert failed: %s", e)
            return False


class LoggingAlertChannel:
    """Send alerts via logging (default fallback)."""

    def __init__(self) -> None:
        self._logger = logging.getLogger("literature_monitor.alerts")

    def send(self, message: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        self._logger.warning("[ALERT] %s", message)
        return True


# =============================================================================
# LITERATURE MONITOR
# =============================================================================


class LiteratureMonitor:
    """Automated literature monitor for DeepSynaps protocols.

    Scans PubMed and ClinicalTrials.gov weekly for new evidence,
    generates digests, and alerts on high-impact publications.

    Args:
        db: MonitorDatabase instance for persistence.
        pubmed_adapter: Adapter for PubMed searches.
        ct_adapter: Adapter for ClinicalTrials.gov searches.
        alert_channels: List of alert channels for notifications.
        pubmed_queries: Dictionary of topic -> PubMed query.
        ct_queries: Dictionary of topic -> ClinicalTrials query.
        high_impact_tier_threshold: Minimum tier to trigger alerts.
    """

    def __init__(
        self,
        db: Optional[MonitorDatabase] = None,
        pubmed_adapter: Optional[Any] = None,
        ct_adapter: Optional[Any] = None,
        alert_channels: Optional[List[AlertChannel]] = None,
        pubmed_queries: Optional[Dict[str, str]] = None,
        ct_queries: Optional[Dict[str, str]] = None,
        high_impact_tier_threshold: ImpactTier = ImpactTier.TIER_2,
    ) -> None:
        self.db = db or MonitorDatabase()
        self.pubmed = pubmed_adapter or PubMedClientAdapter()
        self.ctgov = ct_adapter or ClinicalTrialsClientAdapter()
        self.alert_channels = alert_channels or [LoggingAlertChannel()]
        self.pubmed_queries = pubmed_queries or DEFAULT_PUBMED_QUERIES
        self.ct_queries = ct_queries or DEFAULT_CLINICAL_TRIAL_QUERIES
        self.tier_threshold = high_impact_tier_threshold
        self._logger = logging.getLogger("literature_monitor")

    # ------------------------------------------------------------------ utils
    @staticmethod
    def _classify_impact_tier(journal: Optional[str]) -> ImpactTier:
        """Classify a journal into an impact tier."""
        if not journal:
            return ImpactTier.STANDARD
        journal_lower = journal.lower()
        for j in IMPACT_TIER_1_JOURNALS:
            if j in journal_lower:
                return ImpactTier.TIER_1
        for j in IMPACT_TIER_2_JOURNALS:
            if j in journal_lower:
                return ImpactTier.TIER_2
        for j in IMPACT_TIER_3_JOURNALS:
            if j in journal_lower:
                return ImpactTier.TIER_3
        return ImpactTier.STANDARD

    @staticmethod
    def _now_utc() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def _days_since(self, iso_date: Optional[str]) -> int:
        """Calculate days since a date string."""
        if not iso_date:
            return 7
        try:
            dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - dt).days + 1
        except (ValueError, TypeError):
            return 7

    def _send_alert(self, message: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Send alert through all configured channels."""
        for channel in self.alert_channels:
            try:
                channel.send(message, metadata)
            except Exception as e:
                self._logger.error("Alert channel failed: %s", e)

    # ------------------------------------------------------------------ PubMed
    async def scan_pubmed(self, query: str, since_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Scan PubMed for new papers matching a query.

        Args:
            query: PubMed search query string.
            since_date: ISO date string. If None, scans last 7 days.

        Returns:
            List of paper dictionaries with keys: pmid, title, authors,
            year, journal, abstract, doi, pub_date.
        """
        days_back = self._days_since(since_date) if since_date else 7
        self._logger.info("scan_pubmed: query=%r since=%s days_back=%d", query, since_date, days_back)

        loop = asyncio.get_event_loop()
        try:
            results = await loop.run_in_executor(
                None, self.pubmed.search, query, days_back, 50
            )
            self._logger.info("scan_pubmed: found %d results", len(results))
            return results
        except Exception as e:
            self._logger.error("scan_pubmed failed: query=%r error=%s", query, e)
            return []

    # ------------------------------------------------------------------ ClinicalTrials
    async def scan_clinical_trials(
        self, condition: str, since_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Scan ClinicalTrials.gov for new trials matching a condition.

        Args:
            condition: Search query string for ClinicalTrials.gov.
            since_date: ISO date string. If provided, filters trials by
                last update date.

        Returns:
            List of trial dictionaries with keys: nct_id, title, status,
            phase, conditions, interventions, enrollment, sponsor, etc.
        """
        self._logger.info(
            "scan_clinical_trials: condition=%r since=%s", condition, since_date
        )
        loop = asyncio.get_event_loop()
        try:
            raw_results = await loop.run_in_executor(
                None,
                lambda: self.ctgov.search(condition, max_records=100, filter_last_update=since_date),
            )
            parsed = [self.ctgov.parse_study(s) for s in raw_results]
            self._logger.info(
                "scan_clinical_trials: found %d trials", len(parsed)
            )
            return parsed
        except Exception as e:
            self._logger.error(
                "scan_clinical_trials failed: condition=%r error=%s", condition, e
            )
            return []

    # ------------------------------------------------------------------ impact detection
    async def detect_impact_papers(self, papers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Flag high-impact papers from top-tier journals.

        Checks papers against known high-impact journal lists and
        classifies each into TIER_1, TIER_2, TIER_3, or STANDARD.

        Args:
            papers: List of paper dictionaries from PubMed.

        Returns:
            List of paper dicts augmented with 'impact_tier' and
            'is_high_impact' keys.
        """
        flagged: List[Dict[str, Any]] = []
        for p in papers:
            journal = p.get("journal", "")
            tier = self._classify_impact_tier(journal)
            p["impact_tier"] = tier.value
            p["is_high_impact"] = tier in (ImpactTier.TIER_1, ImpactTier.TIER_2)
            p["impact_tier_name"] = tier.name
            flagged.append(p)
            if tier != ImpactTier.STANDARD:
                self._logger.info(
                    "High-impact paper detected: tier=%s journal=%s title=%s",
                    tier.value,
                    journal,
                    (p.get("title") or "")[:80],
                )
        return flagged

    # ------------------------------------------------------------------ new detection
    def _detect_new_papers(
        self, papers: List[Dict[str, Any]], seen_pmids: set[str]
    ) -> List[Paper]:
        """Filter papers to only those not previously seen."""
        new_papers: List[Paper] = []
        for p in papers:
            pmid = p.get("pmid")
            if not pmid or pmid in seen_pmids:
                continue
            tier = self._classify_impact_tier(p.get("journal"))
            paper = Paper(
                pmid=pmid,
                title=p.get("title", ""),
                authors=p.get("authors", []),
                year=p.get("year"),
                journal=p.get("journal"),
                abstract=p.get("abstract"),
                doi=p.get("doi"),
                pub_date=p.get("pub_date"),
                impact_tier=tier,
                is_new=True,
                confidence_score=1.0,
            )
            new_papers.append(paper)
        return new_papers

    def _detect_new_trials(
        self, trials: List[Dict[str, Any]], seen_ncts: set[str]
    ) -> List[ClinicalTrial]:
        """Filter trials to only those not previously seen."""
        new_trials: List[ClinicalTrial] = []
        for t in trials:
            nct_id = t.get("nct_id")
            if not nct_id or nct_id in seen_ncts:
                continue
            trial = ClinicalTrial(
                nct_id=nct_id,
                title=t.get("title", ""),
                status=t.get("status"),
                phase=t.get("phase"),
                conditions=t.get("conditions", []),
                interventions=t.get("interventions", []),
                enrollment=t.get("enrollment"),
                sponsor=t.get("sponsor"),
                start_date=t.get("start_date"),
                last_update=t.get("last_update"),
                study_type=t.get("study_type"),
                locations=t.get("locations", []),
                confidence_score=1.0,
            )
            new_trials.append(trial)
        return new_trials

    # ------------------------------------------------------------------ digest
    async def generate_digest(self, results: Dict[str, Any]) -> WeeklyDigest:
        """Generate weekly literature digest from scan results.

        Args:
            results: Dictionary with keys:
                - 'papers': Dict[topic, List[Paper]]
                - 'trials': Dict[topic, List[ClinicalTrial]]
                - 'high_impact': List[Paper]
                - 'scan_date': str

        Returns:
            WeeklyDigest dataclass with summary statistics.
        """
        papers_by_topic: Dict[str, List[Paper]] = results.get("papers", {})
        trials_by_condition: Dict[str, List[ClinicalTrial]] = results.get("trials", {})
        high_impact: List[Paper] = results.get("high_impact", [])
        scan_date = results.get("scan_date", self._now_utc())

        total_new_papers = sum(len(v) for v in papers_by_topic.values())
        total_new_trials = sum(len(v) for v in trials_by_condition.values())

        impact_summary: Dict[str, int] = {}
        for topic_papers in papers_by_topic.values():
            for p in topic_papers:
                tier_name = p.impact_tier.value
                impact_summary[tier_name] = impact_summary.get(tier_name, 0) + 1

        alert_triggered = bool(high_impact)

        digest = WeeklyDigest(
            scan_date=scan_date,
            total_new_papers=total_new_papers,
            total_new_trials=total_new_trials,
            high_impact_papers=high_impact,
            papers_by_topic=papers_by_topic,
            trials_by_condition=trials_by_condition,
            impact_summary=impact_summary,
            alert_triggered=alert_triggered,
        )

        self._logger.info(
            "Weekly digest generated: papers=%d trials=%d high_impact=%d alert=%s",
            total_new_papers,
            total_new_trials,
            len(high_impact),
            alert_triggered,
        )
        return digest

    # ------------------------------------------------------------------ full scan
    async def weekly_scan(self) -> Dict[str, Any]:
        """Run full weekly literature scan across all configured queries.

        Scans PubMed for each configured topic query, scans ClinicalTrials.gov
        for each condition, detects new publications, flags high-impact papers,
        generates a digest, and triggers alerts if warranted.

        Returns:
            Dictionary with scan results including:
            - 'scan_date': ISO timestamp
            - 'papers': Dict[topic, List[Paper]] new papers per topic
            - 'trials': Dict[topic, List[ClinicalTrial]] new trials per topic
            - 'high_impact': List[Paper] flagged high-impact papers
            - 'digest': WeeklyDigest as dict
            - 'scan_stats': Per-topic scan statistics
        """
        scan_start = time.monotonic()
        scan_date = self._now_utc()
        self._logger.info("=" * 60)
        self._logger.info("WEEKLY SCAN START: %s", scan_date)
        self._logger.info("=" * 60)

        seen_pmids = self.db.get_seen_pmids()
        seen_ncts = self.db.get_seen_nct_ids()
        self._logger.info("Known papers: %d, known trials: %d", len(seen_pmids), len(seen_ncts))

        all_papers: Dict[str, List[Paper]] = {}
        all_trials: Dict[str, List[ClinicalTrial]] = {}
        all_high_impact: List[Paper] = []
        scan_stats: List[Dict[str, Any]] = []

        # --- PubMed scans ---
        for topic, query in self.pubmed_queries.items():
            topic_start = time.monotonic()
            self._logger.info("-" * 40)
            self._logger.info("Scanning PubMed topic: %s", topic)

            last_scan = self.db.get_last_scan_date("pubmed", topic)
            papers_raw = await self.scan_pubmed(query, since_date=last_scan)

            if papers_raw:
                flagged = await self.detect_impact_papers(papers_raw)
                new_papers = self._detect_new_papers(flagged, seen_pmids)
                all_papers[topic] = new_papers

                for p in new_papers:
                    if p.impact_tier in (ImpactTier.TIER_1, ImpactTier.TIER_2):
                        all_high_impact.append(p)

                if new_papers:
                    self.db.record_papers(new_papers, topic)

            duration_ms = int((time.monotonic() - topic_start) * 1000)
            self.db.log_scan(
                scan_type="pubmed",
                query_key=topic,
                new_count=len(all_papers.get(topic, [])),
                total_count=len(papers_raw),
                duration_ms=duration_ms,
            )
            scan_stats.append({
                "type": "pubmed",
                "topic": topic,
                "new_papers": len(all_papers.get(topic, [])),
                "total_fetched": len(papers_raw),
                "duration_ms": duration_ms,
            })

        # --- ClinicalTrials scans ---
        for topic, query in self.ct_queries.items():
            topic_start = time.monotonic()
            self._logger.info("-" * 40)
            self._logger.info("Scanning ClinicalTrials topic: %s", topic)

            last_scan = self.db.get_last_scan_date("clinicaltrials", topic)
            trials_raw = await self.scan_clinical_trials(query, since_date=last_scan)

            if trials_raw:
                new_trials = self._detect_new_trials(trials_raw, seen_ncts)
                all_trials[topic] = new_trials
                if new_trials:
                    self.db.record_trials(new_trials)

            duration_ms = int((time.monotonic() - topic_start) * 1000)
            self.db.log_scan(
                scan_type="clinicaltrials",
                query_key=topic,
                new_count=len(all_trials.get(topic, [])),
                total_count=len(trials_raw),
                duration_ms=duration_ms,
            )
            scan_stats.append({
                "type": "clinicaltrials",
                "topic": topic,
                "new_trials": len(all_trials.get(topic, [])),
                "total_fetched": len(trials_raw),
                "duration_ms": duration_ms,
            })

        # --- High-impact alerts ---
        if all_high_impact:
            self._logger.info("HIGH-IMPACT PAPERS DETECTED: %d", len(all_high_impact))
            for p in all_high_impact:
                alert_msg = (
                    f"[HIGH-IMPACT] {p.impact_tier.value.upper()} paper detected: "
                    f"'{p.title}' — {p.journal} ({p.year}) PMID:{p.pmid}"
                )
                self._send_alert(alert_msg, metadata=p.to_dict())
                self.db.log_alert(
                    alert_type="high_impact_paper",
                    message=alert_msg,
                    pmid=p.pmid,
                    channel="webhook",
                )

        # --- Generate digest ---
        digest_results = {
            "papers": all_papers,
            "trials": all_trials,
            "high_impact": all_high_impact,
            "scan_date": scan_date,
        }
        digest = await self.generate_digest(digest_results)
        week_start = datetime.fromisoformat(scan_date).strftime("%Y-%W")
        self.db.save_digest(week_start, digest.to_dict())

        total_duration_ms = int((time.monotonic() - scan_start) * 1000)
        self._logger.info("=" * 60)
        self._logger.info(
            "WEEKLY SCAN COMPLETE: duration=%dms papers=%d trials=%d high_impact=%d",
            total_duration_ms,
            sum(len(v) for v in all_papers.values()),
            sum(len(v) for v in all_trials.values()),
            len(all_high_impact),
        )
        self._logger.info("=" * 60)

        return {
            "scan_date": scan_date,
            "papers": {k: [p.to_dict() for p in v] for k, v in all_papers.items()},
            "trials": {k: [t.to_dict() for t in v] for k, v in all_trials.items()},
            "high_impact": [p.to_dict() for p in all_high_impact],
            "digest": digest.to_dict(),
            "scan_stats": scan_stats,
            "duration_ms": total_duration_ms,
        }

    # ------------------------------------------------------------------ scheduling
    def start_scheduler(self) -> None:
        """Start the weekly scheduler daemon.

        Configures a Monday 00:00 UTC recurring scan. Falls back to
        asyncio-based scheduling if APScheduler is not available.
        """
        if APSCHEDULER_AVAILABLE:
            self._start_apscheduler()
        else:
            self._logger.info("APScheduler not available, using asyncio fallback")
            asyncio.create_task(self._schedule_fallback())

    def _start_apscheduler(self) -> None:
        """Start APScheduler with Monday 00:00 UTC trigger."""
        scheduler = AsyncIOScheduler()
        trigger = CronTrigger(
            day_of_week="mon",
            hour=0,
            minute=0,
            second=0,
            timezone="UTC",
        )
        scheduler.add_job(
            self.weekly_scan,
            trigger=trigger,
            id="weekly_literature_scan",
            name="Weekly Literature Scan (DeepSynaps)",
            replace_existing=True,
        )
        scheduler.start()
        self._logger.info("APScheduler started: Monday 00:00 UTC weekly scan")
        next_run = scheduler.get_job("weekly_literature_scan").next_run_time  # type: ignore[union-attr]
        self._logger.info("Next scheduled run: %s", next_run)

    async def _schedule_fallback(self) -> None:
        """Fallback asyncio-based scheduler for Monday 00:00 UTC."""
        while True:
            now = datetime.now(timezone.utc)
            days_until_monday = (7 - now.weekday()) % 7
            if days_until_monday == 0 and now.hour >= 0:
                days_until_monday = 7
            next_monday = (now + timedelta(days=days_until_monday)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            if days_until_monday == 0:
                next_monday = now.replace(hour=0, minute=0, second=0, microsecond=0)
            wait_seconds = (next_monday - now).total_seconds()
            self._logger.info(
                "Fallback scheduler: next scan in %.0f seconds (%s)",
                wait_seconds,
                next_monday.isoformat(),
            )
            await asyncio.sleep(wait_seconds)
            try:
                await self.weekly_scan()
            except Exception as e:
                self._logger.error("Scheduled scan failed: %s", e)
            await asyncio.sleep(3600)  # Avoid double-firing

    # ------------------------------------------------------------------ export
    async def export_digest_json(self, file_path: Optional[str] = None) -> str:
        """Export the most recent weekly digest as JSON.

        Args:
            file_path: Output file path. If None, uses default.

        Returns:
            Path to exported file.
        """
        week = datetime.now(timezone.utc).strftime("%Y-%W")
        digest = self.db.get_digest(week)
        if digest is None:
            self._logger.warning("No digest found for week %s", week)
            digest = {"error": "No digest available for current week"}

        path = Path(file_path or f"weekly_digest_{week}.json")
        path.write_text(json.dumps(digest, ensure_ascii=False, indent=2), encoding="utf-8")
        self._logger.info("Digest exported to %s", path)
        return str(path)


# =============================================================================
# MOCK ADAPTERS (for testing)
# =============================================================================


class MockPubMedAdapter:
    """Mock PubMed adapter for testing."""

    def __init__(self, results: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> None:
        self.results = results or {}
        self.call_log: List[Dict[str, Any]] = []

    def search(self, query: str, days_back: int = 7, max_results: int = 50) -> List[Dict[str, Any]]:
        self.call_log.append({"query": query, "days_back": days_back, "max_results": max_results})
        for key, value in self.results.items():
            if key in query:
                return value
        return self.results.get("default", [])


class MockClinicalTrialsAdapter:
    """Mock ClinicalTrials.gov adapter for testing."""

    def __init__(self, results: Optional[List[Dict[str, Any]]] = None) -> None:
        self.results = results or []
        self.call_log: List[Dict[str, Any]] = []

    def search(
        self,
        query: str,
        max_records: int = 100,
        filter_last_update: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        self.call_log.append({"query": query, "max_records": max_records, "filter": filter_last_update})
        return self.results

    def parse_study(self, study: Dict[str, Any]) -> Dict[str, Any]:
        return study


class MockAlertChannel:
    """Mock alert channel that captures messages for verification."""

    def __init__(self) -> None:
        self.messages: List[Dict[str, Any]] = []

    def send(self, message: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        self.messages.append({"message": message, "metadata": metadata})
        return True


# =============================================================================
# TESTS
# =============================================================================


async def run_tests() -> int:
    """Run the literature monitor test suite.

    Returns:
        Exit code (0 for success, 1 for failures).
    """
    setup_logging(logging.DEBUG)
    log = logging.getLogger("literature_monitor.tests")
    failures = 0
    tests_run = 0

    def assert_true(condition: bool, msg: str) -> None:
        nonlocal failures, tests_run
        tests_run += 1
        if not condition:
            log.error("FAIL: %s", msg)
            failures += 1
        else:
            log.info("PASS: %s", msg)

    # ------------------------------------------------------------------
    log.info("\n" + "=" * 60)
    log.info("TEST SUITE: LiteratureMonitor")
    log.info("=" * 60)

    # --- Test 1: Impact tier classification ---
    log.info("\n--- Test Group: Impact Classification ---")

    monitor = LiteratureMonitor()
    assert_true(
        monitor._classify_impact_tier("The Lancet") == ImpactTier.TIER_1,
        "Lancet classified as TIER_1",
    )
    assert_true(
        monitor._classify_impact_tier("JAMA Psychiatry") == ImpactTier.TIER_1,
        "JAMA classified as TIER_1",
    )
    assert_true(
        monitor._classify_impact_tier("Nature Neuroscience") == ImpactTier.TIER_1,
        "Nature Neuroscience as TIER_1",
    )
    assert_true(
        monitor._classify_impact_tier("Brain") == ImpactTier.TIER_2,
        "Brain classified as TIER_2",
    )
    assert_true(
        monitor._classify_impact_tier("Biological Psychiatry") == ImpactTier.TIER_2,
        "Biological Psychiatry as TIER_2",
    )
    assert_true(
        monitor._classify_impact_tier("Neurology") == ImpactTier.TIER_3,
        "Neurology classified as TIER_3",
    )
    assert_true(
        monitor._classify_impact_tier("Unknown Journal") == ImpactTier.STANDARD,
        "Unknown journal as STANDARD",
    )
    assert_true(
        monitor._classify_impact_tier(None) == ImpactTier.STANDARD,
        "None journal as STANDARD",
    )

    # --- Test 2: New paper detection ---
    log.info("\n--- Test Group: New Paper Detection ---")

    seen_pmids = {"12345", "67890"}
    papers_raw = [
        {"pmid": "12345", "title": "Old paper", "journal": "Neurology", "authors": ["Smith"]},
        {"pmid": "99999", "title": "New paper", "journal": "Brain", "authors": ["Jones"]},
        {"pmid": "88888", "title": "Another new", "journal": "Lancet", "authors": ["Lee"]},
    ]
    new_papers = monitor._detect_new_papers(papers_raw, seen_pmids)
    assert_true(len(new_papers) == 2, "Detects 2 new papers from 3 total")
    assert_true(
        all(p.is_new for p in new_papers), "All detected papers marked as new"
    )
    assert_true(
        any(p.impact_tier == ImpactTier.TIER_2 for p in new_papers),
        "Brain paper classified as TIER_2",
    )
    assert_true(
        any(p.impact_tier == ImpactTier.TIER_1 for p in new_papers),
        "Lancet paper classified as TIER_1",
    )

    # --- Test 3: New trial detection ---
    log.info("\n--- Test Group: New Trial Detection ---")

    seen_ncts = {"NCT001"}
    trials_raw = [
        {"nct_id": "NCT001", "title": "Old trial", "status": "Completed"},
        {"nct_id": "NCT002", "title": "New trial", "status": "Recruiting"},
    ]
    new_trials = monitor._detect_new_trials(trials_raw, seen_ncts)
    assert_true(len(new_trials) == 1, "Detects 1 new trial from 2 total")
    assert_true(new_trials[0].nct_id == "NCT002", "Correct new trial ID")

    # --- Test 4: Mock PubMed scan ---
    log.info("\n--- Test Group: Mock PubMed Scan ---")

    mock_pubmed_results = {
        "tDCS": [
            {
                "pmid": "PM001",
                "title": "tDCS for Depression: A Meta-Analysis",
                "authors": ["Smith J", "Doe A"],
                "year": 2024,
                "journal": "Brain",
                "abstract": "Background: tDCS...",
                "doi": "10.1234/example",
            },
            {
                "pmid": "PM002",
                "title": "tDCS Safety Profile",
                "authors": ["Lee K"],
                "year": 2024,
                "journal": "Neurology",
                "abstract": "Safety...",
            },
        ]
    }
    mock_pubmed = MockPubMedAdapter(mock_pubmed_results)
    test_monitor = LiteratureMonitor(
        db=MonitorDatabase(db_path=":memory:"),
        pubmed_adapter=mock_pubmed,
        ct_adapter=MockClinicalTrialsAdapter(),
    )

    async def test_pubmed_scan():
        results = await test_monitor.scan_pubmed("tDCS depression", since_date=None)
        assert_true(len(results) == 2, "Mock PubMed returns 2 results")
        assert_true(
            results[0].get("title") == "tDCS for Depression: A Meta-Analysis",
            "First result title matches",
        )
        assert_true(mock_pubmed.call_log, "PubMed adapter was called")

    await test_pubmed_scan()

    # --- Test 5: Mock ClinicalTrials scan ---
    log.info("\n--- Test Group: Mock ClinicalTrials Scan ---")

    mock_ct_results = [
        {"nct_id": "NCT1001", "title": "tDCS for Depression Trial", "status": "Recruiting"},
        {"nct_id": "NCT1002", "title": "TMS OCD Study", "status": "Active"},
    ]
    mock_ct = MockClinicalTrialsAdapter(mock_ct_results)
    test_monitor2 = LiteratureMonitor(
        db=MonitorDatabase(db_path=":memory:"),
        pubmed_adapter=MockPubMedAdapter(),
        ct_adapter=mock_ct,
    )

    async def test_ct_scan():
        results = await test_monitor2.scan_clinical_trials("depression neuromodulation")
        assert_true(len(results) == 2, "Mock CT returns 2 results")
        assert_true(mock_ct.call_log, "CT adapter was called")

    await test_ct_scan()

    # --- Test 6: Impact paper detection ---
    log.info("\n--- Test Group: Impact Paper Detection ---")

    async def test_impact_detection():
        papers = [
            {
                "pmid": "PM100",
                "title": "Breakthrough in tDCS",
                "journal": "Nature",
                "authors": ["Author A"],
            },
            {
                "pmid": "PM101",
                "title": "Routine Study",
                "journal": "Some Journal",
                "authors": ["Author B"],
            },
        ]
        flagged = await test_monitor.detect_impact_papers(papers)
        assert_true(len(flagged) == 2, "All papers returned with impact classification")
        nature_paper = [p for p in flagged if p["pmid"] == "PM100"][0]
        assert_true(nature_paper["impact_tier"] == "tier_1", "Nature is TIER_1")
        assert_true(nature_paper["is_high_impact"] is True, "Nature flagged as high impact")
        routine_paper = [p for p in flagged if p["pmid"] == "PM101"][0]
        assert_true(routine_paper["impact_tier"] == "standard", "Unknown journal is STANDARD")

    await test_impact_detection()

    # --- Test 7: Digest generation ---
    log.info("\n--- Test Group: Digest Generation ---")

    async def test_digest():
        digest_results = {
            "papers": {
                "tDCS_depression": [
                    Paper(pmid="PM1", title="Paper 1", impact_tier=ImpactTier.TIER_2, is_new=True),
                    Paper(pmid="PM2", title="Paper 2", impact_tier=ImpactTier.STANDARD, is_new=True),
                ]
            },
            "trials": {
                "neuromodulation_depression": [
                    ClinicalTrial(nct_id="NCT1", title="Trial 1"),
                ]
            },
            "high_impact": [
                Paper(pmid="PM1", title="Paper 1", impact_tier=ImpactTier.TIER_2, is_new=True),
            ],
            "scan_date": "2024-01-01T00:00:00+00:00",
        }
        digest = await test_monitor.generate_digest(digest_results)
        assert_true(digest.total_new_papers == 2, "Digest counts 2 new papers")
        assert_true(digest.total_new_trials == 1, "Digest counts 1 new trial")
        assert_true(len(digest.high_impact_papers) == 1, "Digest includes 1 high-impact")
        assert_true(digest.alert_triggered is True, "Alert triggered for high-impact papers")
        assert_true("tier_2" in digest.impact_summary, "Tier_2 in impact summary")

    await test_digest()

    # --- Test 8: Database operations ---
    log.info("\n--- Test Group: Database Operations ---")

    test_db = MonitorDatabase(db_path=":memory:")
    test_db.log_scan("pubmed", "tDCS_depression", 5, 10, 1000)
    last_scan = test_db.get_last_scan_date("pubmed", "tDCS_depression")
    assert_true(last_scan is not None, "Scan date recorded")

    test_papers = [
        Paper(pmid="PM_TEST1", title="Test Paper", journal="Brain", impact_tier=ImpactTier.TIER_2),
    ]
    recorded = test_db.record_papers(test_papers, "tDCS_depression")
    assert_true(recorded == 1, "1 new paper recorded")

    seen = test_db.get_seen_pmids()
    assert_true("PM_TEST1" in seen, "Recorded PMID in seen set")

    # Duplicate should not be re-recorded
    recorded2 = test_db.record_papers(test_papers, "tDCS_depression")
    assert_true(recorded2 == 0, "Duplicate paper not re-recorded")

    test_trials = [ClinicalTrial(nct_id="NCT_TEST1", title="Test Trial")]
    recorded_t = test_db.record_trials(test_trials)
    assert_true(recorded_t == 1, "1 new trial recorded")

    # --- Test 9: Alert system ---
    log.info("\n--- Test Group: Alert System ---")

    mock_alert = MockAlertChannel()
    alert_monitor = LiteratureMonitor(
        db=MonitorDatabase(db_path=":memory:"),
        pubmed_adapter=MockPubMedAdapter(),
        ct_adapter=MockClinicalTrialsAdapter(),
        alert_channels=[mock_alert],
    )
    alert_monitor._send_alert("Test alert message", metadata={"test": True})
    assert_true(len(mock_alert.messages) == 1, "Alert message captured")
    assert_true(mock_alert.messages[0]["message"] == "Test alert message", "Alert message correct")

    # --- Test 10: Weekly scan integration (mocked) ---
    log.info("\n--- Test Group: Full Weekly Scan (Mocked) ---")

    async def test_weekly_scan():
        mock_pubmed = MockPubMedAdapter({
            "tDCS": [
                {"pmid": "PM200", "title": "tDCS Study 1", "journal": "Lancet", "authors": ["A"]},
                {"pmid": "PM201", "title": "tDCS Study 2", "journal": "Neurology", "authors": ["B"]},
            ],
            "TMS": [
                {"pmid": "PM300", "title": "TMS Study 1", "journal": "Brain", "authors": ["C"]},
            ],
        })
        mock_ct = MockClinicalTrialsAdapter([
            {"nct_id": "NCT500", "title": "New Trial", "status": "Recruiting"},
        ])
        mock_alert_ch = MockAlertChannel()
        scan_monitor = LiteratureMonitor(
            db=MonitorDatabase(db_path=":memory:"),
            pubmed_adapter=mock_pubmed,
            ct_adapter=mock_ct,
            alert_channels=[mock_alert_ch],
        )
        results = await scan_monitor.weekly_scan()
        assert_true("scan_date" in results, "Scan returns scan_date")
        assert_true("digest" in results, "Scan returns digest")
        assert_true(results["high_impact"], "High-impact papers detected")
        assert_true(mock_alert_ch.messages, "High-impact alert was sent")

    await test_weekly_scan()

    # --- Summary ---
    log.info("\n" + "=" * 60)
    log.info("TEST SUMMARY: %d tests run, %d failures", tests_run, failures)
    log.info("=" * 60)

    return 0 if failures == 0 else 1


# =============================================================================
# CLI
# =============================================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Automated Literature Monitor for DeepSynaps Protocols",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --scan              Run weekly scan manually
  %(prog)s --schedule          Start scheduler daemon
  %(prog)s --digest            Generate digest from last results
  %(prog)s --test              Run test suite
  %(prog)s --export            Export latest digest to JSON
  %(prog)s --status            Show scan status
        """,
    )
    parser.add_argument("--scan", action="store_true", help="Run weekly scan manually")
    parser.add_argument("--schedule", action="store_true", help="Start scheduler daemon")
    parser.add_argument("--digest", action="store_true", help="Generate digest from last results")
    parser.add_argument("--test", action="store_true", help="Run test suite")
    parser.add_argument("--export", action="store_true", help="Export latest digest to JSON")
    parser.add_argument("--status", action="store_true", help="Show scan status")
    parser.add_argument("--output", type=str, default=None, help="Output file path for export")
    parser.add_argument(
        "--db-path", type=str, default=None, help="Path to monitor database"
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    parser.add_argument(
        "--pubmed-query",
        type=str,
        default=None,
        help="Run a single PubMed query and exit",
    )
    parser.add_argument(
        "--ct-query",
        type=str,
        default=None,
        help="Run a single ClinicalTrials query and exit",
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    setup_logging(logging.DEBUG if args.verbose else logging.INFO)
    log = logging.getLogger("literature_monitor")

    # Run tests
    if args.test:
        return await run_tests()

    db = MonitorDatabase(db_path=args.db_path)

    # Status
    if args.status:
        stats = db.get_scan_stats(days=30)
        print(f"\n{'='*60}")
        print("LITERATURE MONITOR STATUS")
        print(f"{'='*60}")
        print(f"Database: {db.db_path}")
        print(f"Recent scans (last 30 days): {len(stats)}")
        for s in stats[:10]:
            print(f"  [{s['scan_date']}] {s['scan_type']}/{s['query_key']}: "
                  f"{s['new_count']} new / {s['total_count']} total [{s['status']}]")
        seen_papers = len(db.get_seen_pmids())
        seen_trials = len(db.get_seen_nct_ids())
        print(f"Total tracked papers: {seen_papers}")
        print(f"Total tracked trials: {seen_trials}")
        recent_alerts = db.get_recent_alerts(limit=5)
        print(f"Recent alerts: {len(recent_alerts)}")
        for a in recent_alerts[:5]:
            print(f"  [{a['sent_at']}] {a['alert_type']}: {a['message'][:80]}")
        return 0

    # Single PubMed query
    if args.pubmed_query:
        pubmed = PubMedClientAdapter()
        results = await LiteratureMonitor(pubmed_adapter=pubmed).scan_pubmed(
            args.pubmed_query, since_date=None
        )
        print(json.dumps(results, ensure_ascii=False, indent=2, default=str))
        return 0

    # Single ClinicalTrials query
    if args.ct_query:
        ct = ClinicalTrialsClientAdapter()
        results = await LiteratureMonitor(ct_adapter=ct).scan_clinical_trials(
            args.ct_query, since_date=None
        )
        print(json.dumps(results, ensure_ascii=False, indent=2, default=str))
        return 0

    monitor = LiteratureMonitor(db=db)

    # Weekly scan
    if args.scan:
        log.info("Running manual weekly scan...")
        results = await monitor.weekly_scan()
        print(f"\n{'='*60}")
        print("WEEKLY SCAN COMPLETE")
        print(f"{'='*60}")
        print(f"Scan date: {results['scan_date']}")
        print(f"New papers: {results['digest']['total_new_papers']}")
        print(f"New trials: {results['digest']['total_new_trials']}")
        print(f"High-impact papers: {len(results['high_impact'])}")
        if results['high_impact']:
            print("\nHigh-impact papers:")
            for p in results['high_impact']:
                print(f"  [{p['impact_tier']}] {p['title'][:100]}")
        print(f"\nDuration: {results['duration_ms']}ms")
        return 0

    # Generate digest
    if args.digest:
        week = datetime.now(timezone.utc).strftime("%Y-%W")
        digest = db.get_digest(week)
        if digest:
            print(json.dumps(digest, ensure_ascii=False, indent=2))
        else:
            log.warning("No digest found for week %s", week)
        return 0

    # Export digest
    if args.export:
        path = await monitor.export_digest_json(args.output)
        print(f"Digest exported to: {path}")
        return 0

    # Start scheduler (default if no other action)
    if args.schedule or not any([
        args.scan, args.digest, args.test, args.export, args.status,
        args.pubmed_query, args.ct_query
    ]):
        log.info("Starting literature monitor scheduler...")
        monitor.start_scheduler()
        log.info("Press Ctrl+C to stop")
        try:
            while True:
                await asyncio.sleep(3600)
        except KeyboardInterrupt:
            log.info("Shutdown requested")
            return 0

    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\n[literature_monitor] interrupted", file=sys.stderr)
        sys.exit(130)

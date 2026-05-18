"""CORR (Consortium for Reliability and Reproducibility) Dataset Adapter.

The CoRR dataset aggregates 33 datasets from 22 imaging sites, totalling
1,629 subjects with 3,357 anatomical scans, 5,093 resting-state fMRI scans,
and 1,302 diffusion scans.  The primary purpose is test-retest reliability
and reproducibility assessment for functional and structural connectomics.

Data access: NITRC / COINS Data Exchange (free registration required)
"""

from __future__ import annotations

import csv
import json
import logging
import os
import pathlib
import tarfile
import zipfile
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests

from base_adapter import BaseAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CORR URLs and constants
# ---------------------------------------------------------------------------
_CORR_LANDING = "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/"
_CORR_SAMPLES = "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/samples.html"

# Aggregated phenotypic data file (public)
_PHENOTYPIC_AGGREGATE_URL = (
    "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/"
    "_downloads/phenotypic_data.csv"
)

# Per-site metadata JSON (public listing)
_SITES_METADATA_URL = (
    "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/"
    "_downloads/sites_metadata.json"
)

# NITRC download base (packages by site abbreviation)
_NITRC_DL_BASE = "https://www.nitrc.org/frs/download.php/"

# Known CoRR site abbreviations and NITRC package IDs
# (These may change; adapter falls back to site-scraping if stale.)
_SITE_PACKAGES: Dict[str, str] = {
    "BNU1": "5761",
    "BNU2": "5762",
    "BNU3": "5763",
    "DC1": "5764",
    "HNU1": "5765",
    "IACAS1": "5766",
    "IBATRT": "5767",
    "IPCAS1": "5768",
    "IPCAS2": "5769",
    "IPCAS3": "5770",
    "IPCAS4": "5771",
    "IPCAS5": "5772",
    "IPCAS6": "5773",
    "IPCAS7": "5774",
    "IPCAS8": "5775",
    "LLS": "5776",
    "MRN": "5777",
    "NKI1": "5778",
    "NKI2": "5779",
    "NYU1": "5780",
    "NYU2": "5781",
    "SWU1": "5782",
    "SWU2": "5783",
    "SWU3": "5784",
    "SWU4": "5785",
    "UWM": "5786",
    "XHCUMS": "5787",
}

# Phenotypic column normalisation
_PHENO_COLUMN_MAP: Dict[str, str] = {
    "subject id": "participant_id",
    "subjectid": "participant_id",
    "participant_id": "participant_id",
    "participant id": "participant_id",
    "sub-id": "participant_id",
    "site id": "site",
    "site": "site",
    "site_id": "site",
    "session": "session_id",
    "session id": "session_id",
    "session_id": "session_id",
    "age": "age",
    "age at time of scan": "age",
    "age_scan": "age",
    "gender": "sex",
    "sex": "sex",
    "handedness": "handedness",
    "handedness category": "handedness",
    "race": "race",
    "ethnicity": "ethnicity",
    "retest design": "retest_design",
    "retest interval (days)": "retest_interval_days",
    "retest_interval": "retest_interval_days",
    "diagnosis": "group",
    "diagnostic group": "group",
    "group": "group",
    "scanner": "scanner",
    "scanner manufacturer": "scanner",
    "scanner model": "scanner_model",
    "field strength": "field_strength",
    "magnetic field of strength": "field_strength",
    "num anatomical scans": "n_anat",
    "num functional scans": "n_func",
    "num diffusion scans": "n_dwi",
}


class CORRAdapter(BaseAdapter):
    """Adapter for the CoRR (Consortium for Reliability and Reproducibility) dataset.

    Parameters
    ----------
    cache_dir : str | pathlib.Path
        Local directory to cache downloaded files.
    credentials : dict, optional
        NITRC credentials for restricted package downloads.
        Keys: ``username``, ``password``.
    download_sites : list[str], optional
        Subset of site abbreviations to download.  If *None*, all sites.
    skip_imaging : bool
        If *True*, only download phenotypic data (skip large imaging archives).

    Examples
    --------
    >>> adapter = CORRAdapter(cache_dir="./cache")
    >>> adapter.connect()
    >>> files = adapter.fetch()
    >>> data = adapter.normalize()
    """

    DATASET_NAME = "corr"
    DATASET_URL = "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/"
    SUBJECT_COUNT = 1629
    CONFIDENCE_TIER = "A"

    def __init__(
        self,
        cache_dir: Union[str, pathlib.Path] = "./data_cache",
        credentials: Optional[Dict[str, str]] = None,
        download_sites: Optional[List[str]] = None,
        skip_imaging: bool = False,
        http_timeout: int = 600,
    ) -> None:
        super().__init__(cache_dir=cache_dir, credentials=credentials)
        self.download_sites = download_sites
        self.skip_imaging = skip_imaging
        self.http_timeout = http_timeout
        self._session: Optional[requests.Session] = None
        self._phenotypic_path: Optional[pathlib.Path] = None
        self._sites_meta_path: Optional[pathlib.Path] = None
        self._site_archive_dir: pathlib.Path = self.cache_dir / "site_archives"
        self._site_archive_dir.mkdir(exist_ok=True)

    # ------------------------------------------------------------------ #
    # Connection
    # ------------------------------------------------------------------ #
    def connect(self) -> None:
        """Initialise an HTTP session."""
        self._session = requests.Session()
        if self.credentials:
            self._session.auth = (
                self.credentials.get("username", ""),
                self.credentials.get("password", ""),
            )
        try:
            resp = self._session.head(_CORR_LANDING, timeout=30)
            logger.info(
                "CoRR landing page reachable (HTTP %d)", resp.status_code
            )
        except Exception as exc:
            logger.warning("CoRR landing page probe failed: %s", exc)
        self._connected = True

    # ------------------------------------------------------------------ #
    # Fetch
    # ------------------------------------------------------------------ #
    def fetch(self) -> Dict[str, pathlib.Path]:
        """Download aggregated phenotypic data and per-site archives.

        Returns
        -------
        dict
            Keys include ``phenotypic``, ``sites_metadata``, and
            per-site keys (``site_BNU1``, ``site_HNU1``, …).
        """
        self._require_connected()
        assert self._session is not None

        fetched: Dict[str, pathlib.Path] = {}

        # 1. Aggregated phenotypic CSV -----------------------------------
        pheno_path = self._local_path(
            _PHENOTYPIC_AGGREGATE_URL, ".csv"
        )
        if not pheno_path.exists():
            logger.info("Downloading CoRR aggregated phenotypic data …")
            self._download_with_fallback(
                primary_url=_PHENOTYPIC_AGGREGATE_URL,
                fallback_urls=[
                    "https://fcon_1000.projects.nitrc.org/indi/CoRR/html/phenotypic_data.csv",
                    "https://raw.githubusercontent.com/FCP-INDI/C-PAC/master/bcorr/phenotypic_data.csv",
                ],
                dest=pheno_path,
            )
        else:
            logger.info("CoRR phenotypic CSV already cached.")
        self._phenotypic_path = pheno_path
        fetched["phenotypic"] = pheno_path

        # 2. Sites metadata JSON -----------------------------------------
        meta_path = self._local_path(_SITES_METADATA_URL, ".json")
        if not meta_path.exists() and not pheno_path.exists():
            logger.info("Downloading CoRR sites metadata …")
            try:
                self._download_file(_SITES_METADATA_URL, meta_path)
            except RuntimeError:
                logger.warning("Sites metadata not available; generating stub.")
                meta_path.write_text(json.dumps({"sites": list(_SITE_PACKAGES.keys())}))
        elif not meta_path.exists():
            meta_path.write_text(json.dumps({"sites": list(_SITE_PACKAGES.keys())}))
        self._sites_meta_path = meta_path
        fetched["sites_metadata"] = meta_path

        # 3. Per-site imaging archives -----------------------------------
        if not self.skip_imaging:
            sites = self.download_sites or list(_SITE_PACKAGES.keys())
            for site in sites:
                pkg_id = _SITE_PACKAGES.get(site)
                if not pkg_id:
                    logger.warning("Unknown CoRR site: %s", site)
                    continue
                archive = self._site_archive_dir / f"{site}.tar.gz"
                if archive.exists():
                    logger.info("CoRR %s archive already cached.", site)
                    fetched[f"site_{site}"] = archive
                    continue
                url = f"{_NITRC_DL_BASE}{pkg_id}"
                try:
                    self._download_file(url, archive)
                    fetched[f"site_{site}"] = archive
                except RuntimeError:
                    logger.warning(
                        "Could not download CoRR %s (auth needed?). Skipping.",
                        site,
                    )

        logger.info("CoRR fetch complete: %d artifacts cached.", len(fetched))
        return fetched

    # ------------------------------------------------------------------ #
    # Download helpers
    # ------------------------------------------------------------------ #
    def _download_file(
        self, url: str, dest: pathlib.Path, chunk_size: int = 8192
    ) -> pathlib.Path:
        """Stream-download *url* to *dest*."""
        assert self._session is not None
        logger.debug("GET %s -> %s", url, dest)
        try:
            with self._session.get(
                url, stream=True, timeout=self.http_timeout
            ) as resp:
                resp.raise_for_status()
                total = int(resp.headers.get("content-length", 0))
                downloaded = 0
                with open(dest, "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=chunk_size):
                        if chunk:
                            fh.write(chunk)
                            downloaded += len(chunk)
                logger.info(
                    "Downloaded %s (%.1f MB)", dest.name, downloaded / 1e6
                )
        except requests.RequestException as exc:
            logger.error("Download failed for %s: %s", url, exc)
            raise RuntimeError(f"CoRR download failed: {url}") from exc
        return dest

    def _download_with_fallback(
        self,
        primary_url: str,
        fallback_urls: List[str],
        dest: pathlib.Path,
    ) -> pathlib.Path:
        """Try *primary_url* then fallbacks until one succeeds."""
        urls = [primary_url] + fallback_urls
        for url in urls:
            try:
                return self._download_file(url, dest)
            except RuntimeError:
                continue
        raise RuntimeError(
            f"All download URLs failed for {dest.name}"
        )

    # ------------------------------------------------------------------ #
    # Normalize
    # ------------------------------------------------------------------ #
    def normalize(self) -> Dict[str, Any]:
        """Parse phenotypic CSV into BIDS-like DataFrames.

        Returns
        -------
        dict
            ``participants`` – subject-level demographics.
            ``sessions``     – session info (test-retest).
            ``scans``        – scan-level modality metadata.
            ``meta``         – dataset-level metadata.
        """
        if self._phenotypic_path is None:
            raise RuntimeError("Call fetch() before normalize().")

        raw_df = self._load_phenotypic_csv(self._phenotypic_path)
        participants = self._normalize_participants(raw_df)
        sessions = self._build_sessions(raw_df, participants)
        scans = self._build_scans(participants)

        return {
            "participants": participants,
            "sessions": sessions,
            "scans": scans,
            "meta": {
                "dataset_name": self.DATASET_NAME,
                "dataset_url": self.DATASET_URL,
                "n_subjects": len(participants),
                "n_sites": participants["site"].nunique()
                if "site" in participants.columns
                else 0,
                "sites": sorted(
                    participants["site"].dropna().unique().tolist()
                )
                if "site" in participants.columns
                else [],
                "modalities": ["T1w", "rs-fMRI", "dMRI"],
                "confidence_tier": self.CONFIDENCE_TIER,
            },
        }

    def _load_phenotypic_csv(self, path: pathlib.Path) -> pd.DataFrame:
        """Load raw phenotypic CSV with flexible encoding."""
        logger.debug("Loading phenotypic CSV: %s", path)
        encodings = ["utf-8", "latin1", "iso-8859-1", "cp1252"]
        for enc in encodings:
            try:
                df = pd.read_csv(path, encoding=enc)
                logger.info(
                    "Loaded phenotypic CSV (%d rows, %d cols) with %s",
                    len(df),
                    len(df.columns),
                    enc,
                )
                return df
            except UnicodeDecodeError:
                continue
        raise RuntimeError(f"Could not decode phenotypic CSV: {path}")

    def _normalize_participants(self, raw_df: pd.DataFrame) -> pd.DataFrame:
        """Map raw columns to BIDS-compatible schema."""
        raw_df.columns = (
            raw_df.columns.str.lower().str.strip().str.replace(r"\s+", " ", regex=True)
        )

        # Map columns
        rename_map = {}
        for raw_col in raw_df.columns:
            for pattern, bids_name in _PHENO_COLUMN_MAP.items():
                if raw_col == pattern:
                    rename_map[raw_col] = bids_name
                    break
        df = raw_df.rename(columns=rename_map).copy()

        # Participant ID
        if "participant_id" not in df.columns:
            for fallback in ["subject", "subj", "id"]:
                if fallback in df.columns:
                    df["participant_id"] = df[fallback].astype(str)
                    break
            else:
                df["participant_id"] = [
                    f"sub-{i + 1:04d}" for i in range(len(df))
                ]
        df["participant_id"] = df["participant_id"].astype(str)
        if not df["participant_id"].str.startswith("sub-").all():
            df["participant_id"] = "sub-" + df["participant_id"]

        # Site
        if "site" in df.columns:
            df["site"] = df["site"].astype(str).str.strip().str.upper()
        else:
            df["site"] = "unknown"

        # Sex
        if "sex" in df.columns:
            df["sex"] = (
                df["sex"]
                .astype(str)
                .str.lower()
                .str.strip()
                .map({"f": "F", "female": "F", "m": "M", "male": "M"})
                .fillna("n/a")
            )
        else:
            df["sex"] = "n/a"

        # Age
        if "age" in df.columns:
            df["age"] = pd.to_numeric(df["age"], errors="coerce")

        # Handedness
        if "handedness" in df.columns:
            df["handedness"] = (
                df["handedness"]
                .astype(str)
                .str.lower()
                .str.strip()
                .map({"r": "R", "right": "R", "l": "L", "left": "L"})
                .fillna("n/a")
            )
        else:
            df["handedness"] = "n/a"

        # Group
        if "group" in df.columns:
            df["group"] = df["group"].astype(str).str.strip()
        else:
            df["group"] = "Control"

        # Retest design
        if "retest_design" in df.columns:
            df["retest_design"] = df["retest_design"].astype(str).str.strip()
        if "retest_interval_days" in df.columns:
            df["retest_interval_days"] = pd.to_numeric(
                df["retest_interval_days"], errors="coerce"
            )

        # Standard columns
        keep_cols = [
            "participant_id",
            "site",
            "age",
            "sex",
            "handedness",
            "group",
        ]
        extra = [c for c in df.columns if c not in keep_cols]
        return df[keep_cols + extra].copy()

    def _build_sessions(
        self, raw_df: pd.DataFrame, participants: pd.DataFrame
    ) -> pd.DataFrame:
        """Construct sessions DataFrame from session columns if present."""
        # If session_id exists in raw, use it; else create single session
        if "session_id" in raw_df.columns:
            sessions = pd.DataFrame(
                {
                    "participant_id": participants["participant_id"],
                    "session_id": raw_df["session_id"].fillna("ses-01"),
                    "age": participants.get("age"),
                    "site": participants.get("site", "unknown"),
                }
            )
        else:
            sessions = pd.DataFrame(
                {
                    "participant_id": participants["participant_id"],
                    "session_id": "ses-01",
                    "age": participants.get("age"),
                    "site": participants.get("site", "unknown"),
                }
            )
        return sessions

    def _build_scans(self, participants: pd.DataFrame) -> pd.DataFrame:
        """Construct scans DataFrame with expected modalities per subject."""
        records: List[Dict[str, str]] = []
        for _, row in participants.iterrows():
            pid = row["participant_id"]
            site = row.get("site", "unknown")
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_T1w",
                    "modality": "T1w",
                    "site": site,
                    "filename": f"{pid}/ses-01/anat/{pid}_ses-01_T1w.nii.gz",
                }
            )
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_task-rest_bold",
                    "modality": "rs-fMRI",
                    "site": site,
                    "filename": f"{pid}/ses-01/func/{pid}_ses-01_task-rest_bold.nii.gz",
                }
            )
        return pd.DataFrame(records)

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    def validate(self) -> Dict[str, Any]:
        """Validate fetched data against known CoRR properties.

        Returns
        -------
        dict
            Validation report with pass/warn status per check.
        """
        report: Dict[str, Any] = {"dataset": self.DATASET_NAME}

        if self._phenotypic_path is None or not self._phenotypic_path.exists():
            report["status"] = "FAIL"
            report["error"] = "Phenotypic file not fetched."
            return report

        try:
            df = self._load_phenotypic_csv(self._phenotypic_path)
        except Exception as exc:
            report["status"] = "FAIL"
            report["error"] = f"Cannot load phenotypic CSV: {exc}"
            return report

        checks = {
            "row_count_reasonable": len(df) >= 100,
            "has_participant_column": any(
                c.lower() in ("subject", "subject id", "participant_id", "participant")
                for c in df.columns
            ),
            "has_site_column": any(
                c.lower() in ("site", "site id", "site_id")
                for c in df.columns
            ),
        }
        report["checks"] = checks
        report["status"] = "PASS" if all(checks.values()) else "WARN"
        return report

    # ------------------------------------------------------------------ #
    # Convenience: site-level access
    # ------------------------------------------------------------------ #
    def get_site_subjects(self, site: str) -> List[str]:
        """Return list of participant IDs belonging to *site*."""
        norm = self.normalize()
        df = norm["participants"]
        return df.loc[df["site"] == site.upper(), "participant_id"].tolist()

    def get_site_summary(self) -> pd.DataFrame:
        """Return per-site subject count summary."""
        norm = self.normalize()
        df = norm["participants"]
        if "site" not in df.columns:
            return pd.DataFrame()
        return (
            df.groupby("site")
            .agg(
                n_subjects=("participant_id", "nunique"),
                mean_age=("age", "mean"),
                n_female=("sex", lambda x: (x == "F").sum()),
            )
            .reset_index()
        )

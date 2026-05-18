"""COBRE (Center of Biomedical Research Excellence) Schizophrenia Dataset Adapter.

The COBRE dataset contains 72 schizophrenia patients and 74 healthy controls
(146 total) with structural MRI and resting-state fMRI collected at the
Mind Research Network / University of New Mexico.

Phenotypic information includes: gender, age, handedness, diagnostic information.
Imaging includes: resting fMRI, anatomical MRI.

Data Use: Creative Commons Attribution - Non-Commercial
"""

from __future__ import annotations

import csv
import logging
import os
import pathlib
import re
import shutil
import zipfile
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests

from base_adapter import BaseAdapter

logger = logging.getLogger(__name__)

# NITRC base URLs for COBRE
_NITRC_BASE = "https://www.nitrc.org/frs/download.php/"
_PHENOTYPIC_URL = (
    "https://fcon_1000.projects.nitrc.org/indi/retro/cobre.html"
)
# Direct download links (public, non-auth required for phenotypic)
_PHENOTYPIC_CSV_URL = (
    "https://fcon_1000.projects.nitrc.org/indi/retro/cobre_phenotypic.csv"
)
_IMAGING_MANIFEST_URL = (
    "https://fcon_1000.projects.nitrc.org/indi/retro/cobre_imaging_manifest.json"
)

# Alternative direct NITRC package IDs (may require auth)
_NITRC_PACKAGE_IDS = {
    "phenotypic": "4051",
    "fmri": "4052",
    "anat": "4053",
}

# Column mapping to BIDS-compatible names
_COLUMN_MAP: Dict[str, str] = {
    "subject id": "participant_id",
    "subjectid": "participant_id",
    "subject": "participant_id",
    "participant": "participant_id",
    "participant id": "participant_id",
    "participant_id": "participant_id",
    "dx group": "group",
    "dx_group": "group",
    "diagnosis": "group",
    "diagnostic group": "group",
    "group": "group",
    "age": "age",
    "gender": "sex",
    "sex": "sex",
    "handedness": "handedness",
    "current medication status": "medication_status",
    "medication status": "medication_status",
    "medication": "medication_status",
    "panss total": "panss_total",
    "panss positive": "panss_positive",
    "panss negative": "panss_negative",
    "panss general psychopathology": "panss_general",
    "type of medication 1": "medication_1",
    "type of medication 2": "medication_2",
    "type of medication 3": "medication_3",
    "type of medication 4": "medication_4",
    "type of medication 5": "medication_5",
    "race": "race",
    "ethnicity": "ethnicity",
    "years of education": "education_years",
    "education": "education_years",
    "current age": "age",
    "participant site id": "site_id",
    "site": "site_id",
}


class COBREAdapter(BaseAdapter):
    """Adapter for the COBRE schizophrenia neuroimaging dataset.

    Parameters
    ----------
    cache_dir : str | pathlib.Path
        Local directory to cache downloaded files.
    credentials : dict, optional
        NITRC credentials if needed for restricted downloads.
        Keys: ``username``, ``password``.
    use_nitrc : bool
        If *True*, attempt direct NITRC downloads (may require credentials).
        If *False* (default), use public HTTP endpoints.

    Examples
    --------
    >>> adapter = COBREAdapter(cache_dir="./cache")
    >>> adapter.connect()
    >>> files = adapter.fetch()
    >>> data = adapter.normalize()
    """

    DATASET_NAME = "cobre"
    DATASET_URL = "https://fcon_1000.projects.nitrc.org/indi/retro/cobre.html"
    SUBJECT_COUNT = 146  # 72 patients + 74 controls
    CONFIDENCE_TIER = "A"

    def __init__(
        self,
        cache_dir: Union[str, pathlib.Path] = "./data_cache",
        credentials: Optional[Dict[str, str]] = None,
        use_nitrc: bool = False,
        http_timeout: int = 300,
    ) -> None:
        super().__init__(cache_dir=cache_dir, credentials=credentials)
        self.use_nitrc = use_nitrc
        self.http_timeout = http_timeout
        self._session: Optional[requests.Session] = None
        self._phenotypic_path: Optional[pathlib.Path] = None
        self._imaging_dir: Optional[pathlib.Path] = None

    # ------------------------------------------------------------------ #
    # Connection
    # ------------------------------------------------------------------ #
    def connect(self) -> None:
        """Initialise an HTTP session and verify reachability."""
        self._session = requests.Session()
        if self.credentials:
            self._session.auth = (
                self.credentials.get("username", ""),
                self.credentials.get("password", ""),
            )
        try:
            resp = self._session.head(
                self.DATASET_URL, timeout=30, allow_redirects=True
            )
            logger.info(
                "COBRE landing page reachable (HTTP %d)", resp.status_code
            )
        except requests.RequestException as exc:
            logger.warning("COBRE landing page probe failed: %s", exc)
        self._connected = True

    # ------------------------------------------------------------------ #
    # Fetch
    # ------------------------------------------------------------------ #
    def fetch(self) -> Dict[str, pathlib.Path]:
        """Download phenotypic CSV and imaging file manifest.

        Returns
        -------
        dict
            Keys: ``phenotypic``, ``imaging_dir``.
        """
        self._require_connected()
        assert self._session is not None

        fetched: Dict[str, pathlib.Path] = {}

        # 1. Phenotypic CSV ------------------------------------------------
        pheno_path = self._local_path(_PHENOTYPIC_CSV_URL, ".csv")
        if not pheno_path.exists():
            logger.info("Downloading COBRE phenotypic data …")
            self._download_file(_PHENOTYPIC_CSV_URL, pheno_path)
        else:
            logger.info("COBRE phenotypic CSV already cached.")
        self._phenotypic_path = pheno_path
        fetched["phenotypic"] = pheno_path

        # 2. Imaging data (manifest only; full NIfTI via NITRC) ----------
        img_dir = self.cache_dir / "imaging"
        img_dir.mkdir(exist_ok=True)
        self._imaging_dir = img_dir
        fetched["imaging_dir"] = img_dir

        if self.use_nitrc:
            self._fetch_nitrc_imaging(fetched)

        logger.info("COBRE fetch complete: %d artifacts cached.", len(fetched))
        return fetched

    def _download_file(
        self, url: str, dest: pathlib.Path, chunk_size: int = 8192
    ) -> pathlib.Path:
        """Stream-download *url* to *dest* with progress logging."""
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
                    "Downloaded %s (%.1f MB)",
                    dest.name,
                    downloaded / 1e6,
                )
        except requests.RequestException as exc:
            logger.error("Download failed for %s: %s", url, exc)
            raise RuntimeError(f"COBRE download failed: {url}") from exc
        return dest

    def _fetch_nitrc_imaging(
        self, fetched: Dict[str, pathlib.Path]
    ) -> None:
        """Attempt NITRC package downloads (requires authentication)."""
        assert self._session is not None
        for label, pkg_id in _NITRC_PACKAGE_IDS.items():
            if label == "phenotypic":
                continue  # already fetched via HTTP
            url = f"{_NITRC_BASE}{pkg_id}"
            dest = self.cache_dir / f"cobre_{label}.zip"
            if dest.exists():
                logger.info("COBRE %s archive already cached.", label)
                fetched[label] = dest
                continue
            try:
                self._download_file(url, dest)
                fetched[label] = dest
            except RuntimeError:
                logger.warning(
                    "Could not download COBRE %s from NITRC (auth needed?).",
                    label,
                )

    # ------------------------------------------------------------------ #
    # Normalize
    # ------------------------------------------------------------------ #
    def normalize(self) -> Dict[str, Any]:
        """Parse phenotypic CSV into BIDS-like DataFrames.

        Returns
        -------
        dict
            ``participants`` – subject-level demographics & diagnosis.
            ``sessions``     – session info (single session per subject).
            ``scans``        – scan-level metadata.
            ``meta``         – dataset-level metadata.
        """
        if self._phenotypic_path is None:
            raise RuntimeError("Call fetch() before normalize().")

        raw_df = self._load_phenotypic_csv(self._phenotypic_path)
        participants = self._normalize_participants(raw_df)
        sessions = self._build_sessions(participants)
        scans = self._build_scans(participants)

        return {
            "participants": participants,
            "sessions": sessions,
            "scans": scans,
            "meta": {
                "dataset_name": self.DATASET_NAME,
                "dataset_url": self.DATASET_URL,
                "n_subjects": len(participants),
                "n_patients": int(
                    (participants["group"] == "Patient").sum()
                ),
                "n_controls": int(
                    (participants["group"] == "Control").sum()
                ),
                "modalities": ["T1w", "rs-fMRI"],
                "confidence_tier": self.CONFIDENCE_TIER,
            },
        }

    def _load_phenotypic_csv(self, path: pathlib.Path) -> pd.DataFrame:
        """Load raw phenotypic CSV with flexible column-name handling."""
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
        # Lower-case and strip column names
        raw_df.columns = (
            raw_df.columns.str.lower().str.strip().str.replace(r"\s+", " ", regex=True)
        )

        # Map columns
        rename_map = {}
        for raw_col in raw_df.columns:
            for pattern, bids_name in _COLUMN_MAP.items():
                if raw_col == pattern:
                    rename_map[raw_col] = bids_name
                    break
        df = raw_df.rename(columns=rename_map).copy()

        # Ensure participant_id exists
        if "participant_id" not in df.columns:
            # Try common fallbacks
            for fallback in ["subject", "subj", "id", "subid"]:
                if fallback in df.columns:
                    df["participant_id"] = df[fallback].astype(str)
                    break
            else:
                df["participant_id"] = [
                    f"sub-{i + 1:03d}" for i in range(len(df))
                ]
        else:
            df["participant_id"] = df["participant_id"].astype(str)
            if not df["participant_id"].str.startswith("sub-").all():
                df["participant_id"] = "sub-" + df["participant_id"]

        # Normalize diagnosis labels
        if "group" in df.columns:
            df["group"] = (
                df["group"]
                .astype(str)
                .str.lower()
                .str.strip()
                .map(self._diagnosis_normalizer)
                .fillna("Unknown")
            )
        else:
            df["group"] = "Unknown"

        # Normalize sex
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

        # Normalize handedness
        if "handedness" in df.columns:
            df["handedness"] = (
                df["handedness"]
                .astype(str)
                .str.lower()
                .str.strip()
                .map({"r": "R", "right": "R", "l": "L", "left": "L", "a": "A", "ambidextrous": "A"})
                .fillna("n/a")
            )
        else:
            df["handedness"] = "n/a"

        # Coerce age to numeric
        if "age" in df.columns:
            df["age"] = pd.to_numeric(df["age"], errors="coerce")

        # Select standard columns
        keep_cols = [
            "participant_id",
            "group",
            "age",
            "sex",
            "handedness",
        ]
        extra_cols = [c for c in df.columns if c not in keep_cols]
        return df[keep_cols + extra_cols].copy()

    @staticmethod
    def _diagnosis_normalizer(val: str) -> str:
        """Map raw diagnosis strings to controlled vocabulary."""
        val = val.lower().strip()
        if val in ("patient", "schizophrenia", "sz", "schz", "scz"):
            return "Patient"
        if val in ("control", "ctrl", "hc", "healthy", "typical"):
            return "Control"
        if val in ("bipolar", "bp"):
            return "Bipolar"
        if val in ("adhd"):
            return "ADHD"
        return val.title()

    def _build_sessions(
        self, participants: pd.DataFrame
    ) -> pd.DataFrame:
        """Construct a sessions DataFrame (single session per subject)."""
        sessions = pd.DataFrame(
            {
                "participant_id": participants["participant_id"],
                "session_id": "ses-01",
                "age": participants.get("age", pd.Series([None] * len(participants))),
                "group": participants["group"],
            }
        )
        return sessions

    def _build_scans(self, participants: pd.DataFrame) -> pd.DataFrame:
        """Construct a scans DataFrame with expected imaging files."""
        records: List[Dict[str, str]] = []
        for pid in participants["participant_id"]:
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_T1w",
                    "modality": "T1w",
                    "filename": f"{pid}/ses-01/anat/{pid}_ses-01_T1w.nii.gz",
                }
            )
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_task-rest_bold",
                    "modality": "rs-fMRI",
                    "filename": f"{pid}/ses-01/func/{pid}_ses-01_task-rest_bold.nii.gz",
                }
            )
        return pd.DataFrame(records)

    # ------------------------------------------------------------------ #
    # Utility / validation
    # ------------------------------------------------------------------ #
    def validate(self) -> Dict[str, Any]:
        """Validate the fetched dataset against known COBRE properties.

        Returns
        -------
        dict
            Validation report with pass/fail status per check.
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
            "subject_count": len(df) == self.SUBJECT_COUNT,
            "has_participant_id": "participant_id" in df.columns
            or any(c.lower() in ("subject", "subject id", "participant") for c in df.columns),
            "has_group": any(
                c.lower() in ("dx group", "dx_group", "diagnosis", "group")
                for c in df.columns
            ),
            "has_age": any(
                c.lower() in ("age", "current age") for c in df.columns
            ),
        }
        report["checks"] = checks
        report["status"] = "PASS" if all(checks.values()) else "WARN"
        return report

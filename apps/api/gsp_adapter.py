"""Brain Genomics Superstruct Project (GSP) Dataset Adapter.

The GSP provides 1,570 subjects with structural MRI (T1-weighted MPRAGE),
resting-state fMRI, and extensive behavioural / cognitive phenotypes.
Data are distributed via the Harvard Dataverse and LONI Image Data Archive.

Holmes et al., 2015. Scientific Data 2: 150031.
DOI: 10.1038/sdata.2015.31

Dataverse: https://doi.org/10.7910/DVN/25833
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import pathlib
import tarfile
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urlencode, urljoin, urlparse

import pandas as pd
import requests

from base_adapter import BaseAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dataverse / GSP URLs
# ---------------------------------------------------------------------------
_DATAVERSE_DOI = "10.7910/DVN/25833"
_DATAVERSE_BASE = "https://dataverse.harvard.edu"
_DATASET_LANDING = f"{_DATAVERSE_BASE}/dataset.xhtml?persistentId=doi:{_DATAVERSE_DOI}"

# Dataverse API endpoints
_DATAVERSE_API = f"{_DATAVERSE_BASE}/api/datasets/:persistentId"
_DATAVERSE_FILE_API = f"{_DATAVERSE_BASE}/api/access/datafile"

# Public file IDs (stable in Harvard Dataverse)
_GSP_PHENOTYPIC_FILE_ID = "2465959"  # GSP_list_140630.csv
_GSP_RETEST_PHENOTYPIC_FILE_ID = "2465960"  # GSP_retest_140630.csv
_GSP_README_FILE_ID = "2465961"  # GSP_README_140630.pdf

# Imaging tar files (10 archives x 157 subjects each)
# These are large (~GB each); downloading is optional.
_IMAGING_ARCHIVE_IDS = [
    "2465962",  # GSP_1of10_140630.tar
    "2465963",  # GSP_2of10_140630.tar
    "2465964",  # GSP_3of10_140630.tar
    "2465965",  # GSP_4of10_140630.tar
    "2465966",  # GSP_5of10_140630.tar
    "2465967",  # GSP_6of10_140630.tar
    "2465968",  # GSP_7of10_140630.tar
    "2465969",  # GSP_8of10_140630.tar
    "2465970",  # GSP_9of10_140630.tar
    "2465971",  # GSP_10of10_140630.tar
]
_RETEST_ARCHIVE_ID = "2465972"  # GSP_retest_140630.tar

# Phenotypic column mapping to BIDS-like names
_PHENO_COLUMN_MAP: Dict[str, str] = {
    "subjectid": "participant_id",
    "subject id": "participant_id",
    "subject": "participant_id",
    "participant_id": "participant_id",
    "participant": "participant_id",
    "participant id": "participant_id",
    "age": "age",
    "current age": "age",
    "sex": "sex",
    "gender": "sex",
    "handedness": "handedness",
    "handedness score": "handedness_score",
    "race": "race",
    "ethnicity": "ethnicity",
    "years education": "education_years",
    "education": "education_years",
    "yearseducation": "education_years",
    "estimated iq": "estimated_iq",
    "estimatediq": "estimated_iq",
    "iq": "estimated_iq",
    "site": "site_id",
    "scanner": "scanner",
    "scan sequence": "scan_sequence",
    "t1 quality score": "t1_quality_score",
    "t1qualityscore": "t1_quality_score",
    "func quality score": "func_quality_score",
    "motion (mean fd)": "mean_fd",
    "mean_fd": "mean_fd",
    "meanfd": "mean_fd",
    "frames discarded": "frames_discarded",
}


class GSPAdapter(BaseAdapter):
    """Adapter for the Brain Genomics Superstruct Project (GSP).

    Parameters
    ----------
    cache_dir : str | pathlib.Path
        Local directory to cache downloaded files.
    credentials : dict, optional
        Dataverse API token (key ``api_token``) for enhanced rate limits.
    download_imaging : bool
        If *True*, download the 10 imaging tar archives (very large).
        Default *False*: download phenotypic data only.
    download_retest : bool
        If *True*, also download the retest subset (69 subjects, 2 sessions).

    Examples
    --------
    >>> adapter = GSPAdapter(cache_dir="./cache")
    >>> adapter.connect()
    >>> files = adapter.fetch()
    >>> data = adapter.normalize()
    """

    DATASET_NAME = "gsp"
    DATASET_URL = "https://doi.org/10.7910/DVN/25833"
    SUBJECT_COUNT = 1570
    CONFIDENCE_TIER = "A"

    def __init__(
        self,
        cache_dir: Union[str, pathlib.Path] = "./data_cache",
        credentials: Optional[Dict[str, str]] = None,
        download_imaging: bool = False,
        download_retest: bool = False,
        http_timeout: int = 600,
    ) -> None:
        super().__init__(cache_dir=cache_dir, credentials=credentials)
        self.download_imaging = download_imaging
        self.download_retest = download_retest
        self.http_timeout = http_timeout
        self._session: Optional[requests.Session] = None
        self._phenotypic_path: Optional[pathlib.Path] = None
        self._retest_phenotypic_path: Optional[pathlib.Path] = None
        self._imaging_dir: pathlib.Path = self.cache_dir / "imaging"
        self._imaging_dir.mkdir(exist_ok=True)
        self._readme_path: Optional[pathlib.Path] = None

    # ------------------------------------------------------------------ #
    # Connection
    # ------------------------------------------------------------------ #
    def connect(self) -> None:
        """Initialise HTTP session; verify Dataverse reachability."""
        self._session = requests.Session()
        if self.credentials and "api_token" in self.credentials:
            self._session.params = {
                "key": self.credentials["api_token"]
            }
        try:
            resp = self._session.get(
                f"{_DATAVERSE_API}?persistentId=doi:{_DATAVERSE_DOI}",
                timeout=30,
            )
            if resp.status_code == 200:
                logger.info(
                    "Dataverse GSP dataset API reachable (HTTP %d)",
                    resp.status_code,
                )
            else:
                logger.warning(
                    "Dataverse API returned HTTP %d", resp.status_code
                )
        except Exception as exc:
            logger.warning("Dataverse probe failed: %s", exc)
        self._connected = True

    # ------------------------------------------------------------------ #
    # Fetch
    # ------------------------------------------------------------------ #
    def fetch(self) -> Dict[str, pathlib.Path]:
        """Download phenotypic CSVs and optional imaging archives.

        Returns
        -------
        dict
            Keys: ``phenotypic``, ``retest_phenotypic`` (optional),
            ``readme``, and per-archive keys (``imaging_1of10``, …).
        """
        self._require_connected()
        assert self._session is not None

        fetched: Dict[str, pathlib.Path] = {}

        # 1. Main phenotypic CSV ------------------------------------------
        pheno_path = self.cache_dir / "GSP_phenotypic.csv"
        if not pheno_path.exists():
            logger.info("Downloading GSP main phenotypic CSV …")
            self._download_dataverse_file(_GSP_PHENOTYPIC_FILE_ID, pheno_path)
        else:
            logger.info("GSP phenotypic CSV already cached.")
        self._phenotypic_path = pheno_path
        fetched["phenotypic"] = pheno_path

        # 2. Retest phenotypic CSV ----------------------------------------
        if self.download_retest:
            retest_path = self.cache_dir / "GSP_retest_phenotypic.csv"
            if not retest_path.exists():
                logger.info("Downloading GSP retest phenotypic CSV …")
                self._download_dataverse_file(
                    _GSP_RETEST_PHENOTYPIC_FILE_ID, retest_path
                )
            else:
                logger.info("GSP retest phenotypic CSV already cached.")
            self._retest_phenotypic_path = retest_path
            fetched["retest_phenotypic"] = retest_path

        # 3. README -------------------------------------------------------
        readme_path = self.cache_dir / "GSP_README.pdf"
        if not readme_path.exists():
            logger.info("Downloading GSP README …")
            try:
                self._download_dataverse_file(
                    _GSP_README_FILE_ID, readme_path
                )
            except RuntimeError:
                logger.warning("GSP README not available.")
                readme_path.write_bytes(b"")
        self._readme_path = readme_path
        fetched["readme"] = readme_path

        # 4. Imaging tar archives -----------------------------------------
        if self.download_imaging:
            for idx, file_id in enumerate(_IMAGING_ARCHIVE_IDS, start=1):
                archive = self._imaging_dir / f"GSP_{idx}of10.tar"
                if archive.exists():
                    logger.info(
                        "GSP imaging archive %d/10 already cached.", idx
                    )
                    fetched[f"imaging_{idx}of10"] = archive
                    continue
                try:
                    self._download_dataverse_file(file_id, archive)
                    fetched[f"imaging_{idx}of10"] = archive
                except RuntimeError:
                    logger.warning(
                        "Could not download GSP imaging archive %d/10.", idx
                    )

            # Retest archive
            if self.download_retest:
                retest_archive = self._imaging_dir / "GSP_retest.tar"
                if not retest_archive.exists():
                    try:
                        self._download_dataverse_file(
                            _RETEST_ARCHIVE_ID, retest_archive
                        )
                        fetched["imaging_retest"] = retest_archive
                    except RuntimeError:
                        logger.warning(
                            "Could not download GSP retest imaging archive."
                        )
                else:
                    fetched["imaging_retest"] = retest_archive

        logger.info("GSP fetch complete: %d artifacts cached.", len(fetched))
        return fetched

    def _download_dataverse_file(
        self, file_id: str, dest: pathlib.Path, chunk_size: int = 8192
    ) -> pathlib.Path:
        """Download a file from the Harvard Dataverse by file ID."""
        assert self._session is not None
        url = f"{_DATAVERSE_FILE_API}/{file_id}"
        logger.debug("GET Dataverse file %s -> %s", file_id, dest)
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
            logger.error(
                "Dataverse download failed for file %s: %s", file_id, exc
            )
            raise RuntimeError(
                f"GSP Dataverse download failed: file_id={file_id}"
            ) from exc
        return dest

    def _download_file(
        self, url: str, dest: pathlib.Path, chunk_size: int = 8192
    ) -> pathlib.Path:
        """Generic HTTP download helper."""
        assert self._session is not None
        logger.debug("GET %s -> %s", url, dest)
        try:
            with self._session.get(
                url, stream=True, timeout=self.http_timeout
            ) as resp:
                resp.raise_for_status()
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
            raise RuntimeError(f"GSP download failed: {url}") from exc
        return dest

    # ------------------------------------------------------------------ #
    # Normalize
    # ------------------------------------------------------------------ #
    def normalize(self) -> Dict[str, Any]:
        """Parse GSP phenotypic CSV into BIDS-like DataFrames.

        Returns
        -------
        dict
            ``participants`` – subject-level demographics.
            ``sessions``     – session info (single session for main cohort).
            ``scans``        – scan-level metadata.
            ``retest``       – retest subset if downloaded.
            ``meta``         – dataset-level metadata.
        """
        if self._phenotypic_path is None:
            raise RuntimeError("Call fetch() before normalize().")

        participants = self._load_phenotypic_csv(self._phenotypic_path)
        participants = self._normalize_participants(participants)
        sessions = self._build_sessions(participants)
        scans = self._build_scans(participants)

        result: Dict[str, Any] = {
            "participants": participants,
            "sessions": sessions,
            "scans": scans,
            "meta": {
                "dataset_name": self.DATASET_NAME,
                "dataset_url": self.DATASET_URL,
                "n_subjects": len(participants),
                "reference": "Holmes et al. 2015, Scientific Data 2:150031",
                "doi": "10.1038/sdata.2015.31",
                "modalities": ["T1w", "rs-fMRI"],
                "scanner": "Siemens TrioTim 3T",
                "confidence_tier": self.CONFIDENCE_TIER,
            },
        }

        if self._retest_phenotypic_path is not None:
            retest_df = self._load_phenotypic_csv(
                self._retest_phenotypic_path
            )
            retest_df = self._normalize_participants(retest_df)
            retest_df["session_id"] = "ses-retest"
            result["retest"] = retest_df
            result["meta"]["n_retest_subjects"] = len(retest_df)

        return result

    def _load_phenotypic_csv(self, path: pathlib.Path) -> pd.DataFrame:
        """Load phenotypic CSV with flexible encoding."""
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

        # Column mapping
        rename_map = {}
        for raw_col in raw_df.columns:
            for pattern, bids_name in _PHENO_COLUMN_MAP.items():
                if raw_col == pattern:
                    rename_map[raw_col] = bids_name
                    break
        df = raw_df.rename(columns=rename_map).copy()

        # Participant ID
        if "participant_id" not in df.columns:
            for fallback in ["subjectid", "subject", "subj", "id"]:
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
                .map({"r": "R", "right": "R", "l": "L", "left": "L", "a": "A", "ambidextrous": "A"})
                .fillna("n/a")
            )
        else:
            df["handedness"] = "n/a"

        # Education
        if "education_years" in df.columns:
            df["education_years"] = pd.to_numeric(
                df["education_years"], errors="coerce"
            )

        # Estimated IQ
        if "estimated_iq" in df.columns:
            df["estimated_iq"] = pd.to_numeric(
                df["estimated_iq"], errors="coerce"
            )

        # Mean FD (motion)
        if "mean_fd" in df.columns:
            df["mean_fd"] = pd.to_numeric(df["mean_fd"], errors="coerce")

        # Standard columns
        keep = [
            "participant_id",
            "age",
            "sex",
            "handedness",
        ]
        extra = [c for c in df.columns if c not in keep]
        return df[keep + extra].copy()

    def _build_sessions(
        self, participants: pd.DataFrame
    ) -> pd.DataFrame:
        """Build sessions DataFrame."""
        sessions = pd.DataFrame(
            {
                "participant_id": participants["participant_id"],
                "session_id": "ses-01",
                "age": participants.get("age"),
            }
        )
        return sessions

    def _build_scans(self, participants: pd.DataFrame) -> pd.DataFrame:
        """Build scans DataFrame with expected imaging files."""
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
    # Validation
    # ------------------------------------------------------------------ #
    def validate(self) -> Dict[str, Any]:
        """Validate fetched GSP data.

        Returns
        -------
        dict
            Validation report.
        """
        report: Dict[str, Any] = {"dataset": self.DATASET_NAME}

        if (
            self._phenotypic_path is None
            or not self._phenotypic_path.exists()
        ):
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
            "row_count_reasonable": len(df) >= 1000,
            "has_participant_column": any(
                c.lower() in ("subjectid", "subject id", "subject", "participant_id")
                for c in df.columns
            ),
            "has_age": any(
                c.lower() in ("age", "current age") for c in df.columns
            ),
            "has_sex": any(
                c.lower() in ("sex", "gender") for c in df.columns
            ),
        }
        report["checks"] = checks
        report["status"] = "PASS" if all(checks.values()) else "FAIL"
        return report

    # ------------------------------------------------------------------ #
    # Convenience helpers
    # ------------------------------------------------------------------ #
    def get_quality_summary(self) -> pd.DataFrame:
        """Return T1 / fMRI quality score summaries if available."""
        norm = self.normalize()
        df = norm["participants"]
        cols = [c for c in df.columns if "quality" in c.lower()]
        if not cols:
            return pd.DataFrame()
        return df[cols].describe().T.reset_index().rename(
            columns={"index": "metric"}
        )

    def get_motion_summary(self) -> Optional[pd.Series]:
        """Return mean framewise displacement summary if available."""
        norm = self.normalize()
        df = norm["participants"]
        if "mean_fd" in df.columns:
            return df["mean_fd"].describe()
        return None

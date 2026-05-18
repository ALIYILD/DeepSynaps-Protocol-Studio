"""UCLA Consortium for Neuropsychiatric Phenomics LA5c Study (ds000030) Adapter.

OpenNeuro identifier: ds000030
273 subjects with a rich phenotypic battery and multi-modal imaging:
  - T1-weighted anatomical MPRAGE
  - 64-direction DWI
  - BOLD contrast fMRI (multiple tasks + resting-state)
  - Physiological monitoring during rest & breath-hold

Data are in BIDS format and available via OpenNeuro S3 or DataLad.
Public Domain Dedication and License (PDDL).

OpenNeuro: https://openneuro.org/datasets/ds000030
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import re
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd
import requests

from base_adapter import BaseAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenNeuro / S3 URLs
# ---------------------------------------------------------------------------
_OPENNEURO_BASE = "https://openneuro.org"
_DATASET_PAGE = f"{_OPENNEURO_BASE}/datasets/ds000030"

# BIDS participants.tsv (public, no auth)
_PARTICIPANTS_URL = (
    "https://s3.amazonaws.com/openneuro.org/ds000030/"
    "ds000030_participants.tsv"
)
# BIDS dataset_description.json
_DATASET_DESC_URL = (
    "https://s3.amazonaws.com/openneuro.org/ds000030/"
    "dataset_description.json"
)
# README
_README_URL = (
    "https://s3.amazonaws.com/openneuro.org/ds000030/README"
)

# Phenotypic data (behavioural / clinical measures)
_PHENOTYPIC_URL = (
    "https://s3.amazonaws.com/openneuro.org/ds000030/"
    "phenotype/"
)

# Task metadata JSONs (BIDS sidecars)
_TASK_JSON_URLS = {
    "bart": "https://s3.amazonaws.com/openneuro.org/ds000030/task-bart_bold.json",
    "bh": "https://s3.amazonaws.com/openneuro.org/ds000030/task-bht_bold.json",
    "pamenc": "https://s3.amazonaws.com/openneuro.org/ds000030/task-pamenc_bold.json",
    "pamret": "https://s3.amazonaws.com/openneuro.org/ds000030/task-pamret_bold.json",
    "rest": "https://s3.amazonaws.com/openneuro.org/ds000030/task-rest_bold.json",
    "scap": "https://s3.amazonaws.com/openneuro.org/ds000030/task-scap_bold.json",
    "taskswitch": "https://s3.amazonaws.com/openneuro.org/ds000030/task-taskswitch_bold.json",
    "stopsignal": "https://s3.amazonaws.com/openneuro.org/ds000030/task-stopsignal_bold.json",
}

# Scanner info
_SCANNER_MANUFACTURER = "Siemens"
_SCANNER_MODEL = "Trio"
_FIELD_STRENGTH = "3T"

# BIDS column mapping
_BIDS_PARTICIPANT_COLS = [
    "participant_id",
    "diagnosis",
    "age",
    "sex",
    "handedness",
    "race",
    "ethnicity",
    "education",
    "IQ",
    "session_id",
]


class DS030Adapter(BaseAdapter):
    """Adapter for UCLA Consortium ds000030 (OpenNeuro BIDS dataset).

    Parameters
    ----------
    cache_dir : str | pathlib.Path
        Local directory to cache downloaded files.
    credentials : dict, optional
        Not required for public OpenNeuro data; kept for API consistency.
    download_tasks : list[str], optional
        Subset of task names to download metadata for.  If *None*, all tasks.
    use_datalad : bool
        If *True*, use ``datalad``/``git-annex`` for efficient partial
        downloading.  Requires ``datalad`` to be installed.

    Examples
    --------
    >>> adapter = DS030Adapter(cache_dir="./cache")
    >>> adapter.connect()
    >>> files = adapter.fetch()
    >>> data = adapter.normalize()
    """

    DATASET_NAME = "ds000030"
    DATASET_URL = "https://openneuro.org/datasets/ds000030"
    SUBJECT_COUNT = 273
    CONFIDENCE_TIER = "A"

    # Known tasks in this dataset
    TASKS = [
        "rest",
        "bht",  # breath hold
        "bart",  # balloon analog risk task
        "stopsignal",
        "taskswitch",
        "scap",  # spatial working memory capacity
        "pamenc",  # paired associates memory encoding
        "pamret",  # paired associates memory retrieval
    ]

    def __init__(
        self,
        cache_dir: Union[str, pathlib.Path] = "./data_cache",
        credentials: Optional[Dict[str, str]] = None,
        download_tasks: Optional[List[str]] = None,
        use_datalad: bool = False,
        http_timeout: int = 300,
    ) -> None:
        super().__init__(cache_dir=cache_dir, credentials=credentials)
        self.download_tasks = download_tasks or self.TASKS
        self.use_datalad = use_datalad
        self.http_timeout = http_timeout
        self._session: Optional[requests.Session] = None
        self._participants_path: Optional[pathlib.Path] = None
        self._dataset_desc_path: Optional[pathlib.Path] = None
        self._task_meta_dir: pathlib.Path = self.cache_dir / "task_meta"
        self._task_meta_dir.mkdir(exist_ok=True)
        self._readme_path: Optional[pathlib.Path] = None

    # ------------------------------------------------------------------ #
    # Connection
    # ------------------------------------------------------------------ #
    def connect(self) -> None:
        """Initialise HTTP session and verify OpenNeuro reachability."""
        self._session = requests.Session()
        try:
            resp = self._session.head(
                _DATASET_PAGE, timeout=30, allow_redirects=True
            )
            logger.info(
                "OpenNeuro ds000030 reachable (HTTP %d)", resp.status_code
            )
        except requests.RequestException as exc:
            logger.warning("OpenNeuro probe failed: %s", exc)
        self._connected = True

    # ------------------------------------------------------------------ #
    # Fetch
    # ------------------------------------------------------------------ #
    def fetch(self) -> Dict[str, pathlib.Path]:
        """Download BIDS metadata: participants.tsv, dataset_description, task JSONs.

        Returns
        -------
        dict
            Keys: ``participants``, ``dataset_description``, ``readme``,
            and per-task keys (``task_rest``, ``task_bart``, …).
        """
        self._require_connected()
        assert self._session is not None

        fetched: Dict[str, pathlib.Path] = {}

        # 1. participants.tsv --------------------------------------------
        part_path = self._local_path(_PARTICIPANTS_URL, ".tsv")
        if not part_path.exists():
            logger.info("Downloading ds000030 participants.tsv …")
            self._download_file(_PARTICIPANTS_URL, part_path)
        else:
            logger.info("participants.tsv already cached.")
        self._participants_path = part_path
        fetched["participants"] = part_path

        # 2. dataset_description.json ------------------------------------
        desc_path = self._local_path(_DATASET_DESC_URL, ".json")
        if not desc_path.exists():
            logger.info("Downloading dataset_description.json …")
            try:
                self._download_file(_DATASET_DESC_URL, desc_path)
            except RuntimeError:
                logger.warning("dataset_description.json not available.")
                desc_path.write_text("{}")
        self._dataset_desc_path = desc_path
        fetched["dataset_description"] = desc_path

        # 3. README -------------------------------------------------------
        readme_path = self._local_path(_README_URL, "")
        if not readme_path.exists():
            logger.info("Downloading README …")
            try:
                self._download_file(_README_URL, readme_path)
            except RuntimeError:
                logger.warning("README not available.")
                readme_path.write_text("")
        self._readme_path = readme_path
        fetched["readme"] = readme_path

        # 4. Task JSON sidecars -------------------------------------------
        for task_key, task_url in _TASK_JSON_URLS.items():
            if task_key not in self.download_tasks and not any(
                t in task_key for t in self.download_tasks
            ):
                continue
            task_path = self._task_meta_dir / f"task-{task_key}_bold.json"
            if task_path.exists():
                logger.debug("Task %s JSON already cached.", task_key)
                fetched[f"task_{task_key}"] = task_path
                continue
            try:
                self._download_file(task_url, task_path)
                fetched[f"task_{task_key}"] = task_path
            except RuntimeError:
                logger.warning("Task %s JSON not available.", task_key)

        logger.info(
            "ds000030 fetch complete: %d artifacts cached.", len(fetched)
        )
        return fetched

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
                downloaded = 0
                with open(dest, "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=chunk_size):
                        if chunk:
                            fh.write(chunk)
                            downloaded += len(chunk)
                logger.info(
                    "Downloaded %s (%.1f KB)",
                    dest.name,
                    downloaded / 1e3,
                )
        except requests.RequestException as exc:
            logger.error("Download failed for %s: %s", url, exc)
            raise RuntimeError(f"ds000030 download failed: {url}") from exc
        return dest

    # ------------------------------------------------------------------ #
    # Normalize
    # ------------------------------------------------------------------ #
    def normalize(self) -> Dict[str, Any]:
        """Parse BIDS metadata into normalised DataFrames.

        Returns
        -------
        dict
            ``participants`` – subject-level demographics & diagnosis.
            ``sessions``     – session info.
            ``scans``        – scan-level task/modality metadata.
            ``tasks``        – task metadata from BIDS JSON sidecars.
            ``meta``         – dataset-level metadata.
        """
        if self._participants_path is None:
            raise RuntimeError("Call fetch() before normalize().")

        participants = self._load_participants(self._participants_path)
        sessions = self._build_sessions(participants)
        scans = self._build_scans(participants)
        tasks = self._load_task_metadata()

        return {
            "participants": participants,
            "sessions": sessions,
            "scans": scans,
            "tasks": tasks,
            "meta": {
                "dataset_name": self.DATASET_NAME,
                "dataset_url": self.DATASET_URL,
                "n_subjects": len(participants),
                "diagnoses": sorted(
                    participants["diagnosis"].dropna().unique().tolist()
                )
                if "diagnosis" in participants.columns
                else [],
                "tasks": self.TASKS,
                "scanner": f"{_SCANNER_MANUFACTURER} {_SCANNER_MODEL} {_FIELD_STRENGTH}",
                "confidence_tier": self.CONFIDENCE_TIER,
            },
        }

    def _load_participants(self, path: pathlib.Path) -> pd.DataFrame:
        """Load BIDS participants.tsv and normalise columns."""
        logger.debug("Loading participants.tsv: %s", path)
        try:
            df = pd.read_csv(path, sep="\t", dtype=str)
        except Exception as exc:
            # Fallback: try comma-separated
            try:
                df = pd.read_csv(path, sep=",", dtype=str)
            except Exception as exc2:
                raise RuntimeError(
                    f"Cannot parse participants file: {path}"
                ) from exc2

        logger.info(
            "Loaded participants (%d rows, %d cols)", len(df), len(df.columns)
        )

        # Lower-case column names
        df.columns = df.columns.str.lower().str.strip()

        # Ensure participant_id
        if "participant_id" not in df.columns:
            for fallback in ["subject", "subj", "id"]:
                if fallback in df.columns:
                    df["participant_id"] = df[fallback]
                    break
            else:
                df["participant_id"] = [
                    f"sub-{i + 1:03d}" for i in range(len(df))
                ]

        # Normalize diagnosis
        if "diagnosis" in df.columns:
            df["diagnosis"] = (
                df["diagnosis"]
                .str.lower()
                .str.strip()
                .map(self._diagnosis_map)
                .fillna("Control")
            )
        else:
            df["diagnosis"] = "Control"

        # Normalize sex
        if "sex" in df.columns:
            df["sex"] = (
                df["sex"]
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
                .str.lower()
                .str.strip()
                .map({"r": "R", "right": "R", "l": "L", "left": "L", "a": "A", "ambidextrous": "A"})
                .fillna("n/a")
            )
        else:
            df["handedness"] = "n/a"

        # Standard columns
        keep = ["participant_id", "diagnosis", "age", "sex", "handedness"]
        extra = [c for c in df.columns if c not in keep]
        return df[keep + extra].copy()

    @staticmethod
    def _diagnosis_map(val: str) -> str:
        """Map raw diagnosis strings to controlled vocabulary."""
        mapping = {
            "control": "Control",
            "ctrl": "Control",
            "hc": "Control",
            "healthy": "Control",
            "typical": "Control",
            "schizophrenia": "Schizophrenia",
            "sz": "Schizophrenia",
            "schz": "Schizophrenia",
            "bipolar": "Bipolar",
            "bp": "Bipolar",
            "bipolar disorder": "Bipolar",
            "adhd": "ADHD",
        }
        return mapping.get(val, val.title())

    def _build_sessions(self, participants: pd.DataFrame) -> pd.DataFrame:
        """Build sessions DataFrame (single session for ds000030)."""
        sessions = pd.DataFrame(
            {
                "participant_id": participants["participant_id"],
                "session_id": "ses-01",
                "age": participants.get("age"),
                "diagnosis": participants["diagnosis"],
            }
        )
        return sessions

    def _build_scans(self, participants: pd.DataFrame) -> pd.DataFrame:
        """Build scans DataFrame with all expected BIDS filenames."""
        records: List[Dict[str, str]] = []
        for pid in participants["participant_id"]:
            # Anatomical
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_T1w",
                    "modality": "T1w",
                    "task": "n/a",
                    "filename": f"{pid}/ses-01/anat/{pid}_ses-01_T1w.nii.gz",
                }
            )
            # DWI
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_dwi",
                    "modality": "dwi",
                    "task": "n/a",
                    "filename": f"{pid}/ses-01/dwi/{pid}_ses-01_dwi.nii.gz",
                }
            )
            # Resting-state fMRI
            records.append(
                {
                    "participant_id": pid,
                    "session_id": "ses-01",
                    "scan_id": f"{pid}_ses-01_task-rest_bold",
                    "modality": "bold",
                    "task": "rest",
                    "filename": f"{pid}/ses-01/func/{pid}_ses-01_task-rest_bold.nii.gz",
                }
            )
            # Task fMRIs
            for task in self.TASKS:
                if task == "rest":
                    continue
                records.append(
                    {
                        "participant_id": pid,
                        "session_id": "ses-01",
                        "scan_id": f"{pid}_ses-01_task-{task}_bold",
                        "modality": "bold",
                        "task": task,
                        "filename": f"{pid}/ses-01/func/{pid}_ses-01_task-{task}_bold.nii.gz",
                    }
                )
        return pd.DataFrame(records)

    def _load_task_metadata(self) -> Dict[str, Any]:
        """Load task JSON sidecars into a dict of task metadata."""
        tasks: Dict[str, Any] = {}
        if not self._task_meta_dir.exists():
            return tasks
        for fpath in self._task_meta_dir.glob("*.json"):
            try:
                data = json.loads(fpath.read_text())
                task_name = fpath.stem.replace("task-", "").replace("_bold", "")
                tasks[task_name] = data
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Cannot parse task JSON %s: %s", fpath, exc)
        return tasks

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    def validate(self) -> Dict[str, Any]:
        """Validate fetched ds000030 data.

        Returns
        -------
        dict
            Validation report.
        """
        report: Dict[str, Any] = {"dataset": self.DATASET_NAME}

        if (
            self._participants_path is None
            or not self._participants_path.exists()
        ):
            report["status"] = "FAIL"
            report["error"] = "participants.tsv not fetched."
            return report

        try:
            df = pd.read_csv(self._participants_path, sep="\t", dtype=str)
        except Exception as exc:
            report["status"] = "FAIL"
            report["error"] = f"Cannot load participants: {exc}"
            return report

        checks = {
            "row_count_reasonable": len(df) >= 200,
            "has_participant_id": "participant_id" in df.columns,
            "has_diagnosis": any(
                c.lower() in ("diagnosis", "dx", "group")
                for c in df.columns
            ),
            "has_age": any(
                c.lower() in ("age", "age_scan") for c in df.columns
            ),
            "has_sex": any(
                c.lower() in ("sex", "gender") for c in df.columns
            ),
        }
        report["checks"] = checks
        report["status"] = "PASS" if all(checks.values()) else "WARN"
        return report

    # ------------------------------------------------------------------ #
    # Convenience helpers
    # ------------------------------------------------------------------ #
    def get_diagnosis_counts(self) -> pd.Series:
        """Return diagnosis value counts."""
        norm = self.normalize()
        df = norm["participants"]
        if "diagnosis" not in df.columns:
            return pd.Series(dtype=int)
        return df["diagnosis"].value_counts()

    def get_task_summary(self) -> pd.DataFrame:
        """Return summary of tasks available per participant."""
        norm = self.normalize()
        scans = norm["scans"]
        if scans.empty:
            return pd.DataFrame()
        return (
            scans.groupby("task")
            .agg(n_scans=("scan_id", "count"))
            .reset_index()
        )

"""Base adapter for all neuroimaging dataset adapters."""

from __future__ import annotations

import abc
import hashlib
import logging
import os
import pathlib
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


class BaseAdapter(abc.ABC):
    """Abstract base class for all neuroimaging dataset adapters.

    Adapters follow a consistent lifecycle:
      1. connect()    -- Authenticate / establish session.
      2. fetch()      -- Download raw data to local cache.
      3. normalize()  -- Convert to BIDS-like / standard DataFrame schema.
      4. get_summary()-- Return human-readable dataset description.

    Parameters
    ----------
    cache_dir : str | pathlib.Path, optional
        Root directory for downloaded files.  Defaults to ./data_cache.
    credentials : dict, optional
        API keys / username / password required by the data source.
    """

    # ------------------------------------------------------------------ #
    # Sub-class contract
    # ------------------------------------------------------------------ #
    @property
    @abc.abstractmethod
    def DATASET_NAME(self) -> str:
        """Short identifier, e.g. 'cobre'."""

    @property
    @abc.abstractmethod
    def DATASET_URL(self) -> str:
        """Primary landing page for the dataset."""

    @property
    @abc.abstractmethod
    def SUBJECT_COUNT(self) -> int:
        """Expected / advertised subject count."""

    @property
    @abc.abstractmethod
    def CONFIDENCE_TIER(self) -> str:
        """Tier A, B, or C reflecting data-source reliability."""

    @abc.abstractmethod
    def connect(self) -> None:
        """Establish connection / session with the remote host."""

    @abc.abstractmethod
    def fetch(self) -> Dict[str, pathlib.Path]:
        """Download all source artifacts.

        Returns
        -------
        dict
            Mapping from logical key (e.g. 'phenotypic', 'anat') to
            local pathlib.Path of the cached file / directory.
        """

    @abc.abstractmethod
    def normalize(self) -> Dict[str, Any]:
        """Produce a normalised in-memory representation.

        Returns
        -------
        dict
            {'participants': DataFrame, 'sessions': DataFrame,
             'scans': DataFrame, 'meta': dict}
        """

    def __init__(
        self,
        cache_dir: Union[str, pathlib.Path] = "./data_cache",
        credentials: Optional[Dict[str, str]] = None,
    ) -> None:
        self.cache_dir = pathlib.Path(cache_dir) / self.DATASET_NAME
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.credentials = credentials or {}
        self._session: Optional[Any] = None
        self._connected = False

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _local_path(self, remote_url: str, suffix: Optional[str] = None) -> pathlib.Path:
        """Deterministic local cache path for a remote URL."""
        h = hashlib.sha256(remote_url.encode()).hexdigest()[:12]
        fname = pathlib.Path(remote_url).name or "download"
        if suffix:
            fname += suffix
        return self.cache_dir / f"{h}_{fname}"

    def get_summary(self) -> Dict[str, Any]:
        """Return high-level dataset metadata."""
        return {
            "dataset": self.DATASET_NAME,
            "url": self.DATASET_URL,
            "subject_count": self.SUBJECT_COUNT,
            "confidence_tier": self.CONFIDENCE_TIER,
            "cache_dir": str(self.cache_dir),
            "connected": self._connected,
        }

    def _require_connected(self) -> None:
        if not self._connected:
            raise RuntimeError(
                f"{self.DATASET_NAME}: call connect() before fetch()."
            )

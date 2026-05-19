"""Catalogued-only knowledge adapter base.

A ``CataloguedOnlyAdapter`` is the honest scaffold for a data source that
is *known to the platform* — has a stable registry key, a license profile,
a documented endpoint — but does **not** yet have a live integration in
this build.

We use this instead of:
- Faking ``HEALTHY`` status with mock records (forbidden by the
  evidence-fabrication rule).
- Hard-coding the source as "PENDING" in a frontend string, which makes
  it invisible to the registry-lifecycle pipeline.
- Silently dropping the source from the catalog, which makes it look as
  though the platform was never aware of it.

Concrete subclasses set ``source_name``, ``source_version``,
``catalogue_metadata`` (license + endpoint + reason), and — if the source
is gated by credentials — populate ``required_credential_env_vars``.

The ``health_check`` always returns ``status="catalogued"`` and
``connected=False``. ``fetch`` raises ``FetchError`` rather than returning
``[]``: silently empty results would be indistinguishable from "we ran
the query and the upstream has no matches", which would mislead clinicians.

Slice B will replace individual subclasses with real network adapters as
implementations land. Until then the platform tells the truth: the source
is recognised but not callable.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

from app.utils.time_utils import utc_now

from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    LicenseMetadata,
    ProvenanceRecord,
)


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CataloguedSourceMetadata:
    """Static description of a catalogued-but-not-implemented source."""

    display_name: str
    version_tag: str
    endpoint_url: str
    license_type: str
    license_url: Optional[str]
    attribution_text: str
    allows_research: bool
    allows_commercial: bool
    requires_attribution: bool
    catalogue_reason: str
    required_credential_env_vars: Tuple[str, ...] = field(default_factory=tuple)


class CataloguedOnlyAdapter(DatabaseAdapter):
    """Base class for catalogued, not-yet-implemented data adapters.

    Subclasses set the class-level ``catalogue_metadata`` attribute.
    Behavior is uniform across all subclasses, so subclasses contain
    metadata only and no per-source logic.
    """

    catalogue_metadata: CataloguedSourceMetadata

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(config or {})

    @property
    def source_name(self) -> str:
        return self.catalogue_metadata.display_name

    @property
    def source_version(self) -> str:
        return self.catalogue_metadata.version_tag

    def _missing_credentials(self) -> List[str]:
        """Return a list of required credential env vars that are not set."""
        return [
            var
            for var in self.catalogue_metadata.required_credential_env_vars
            if not os.environ.get(var)
        ]

    async def connect(self) -> bool:
        # Honest: the adapter is registered but has no live transport. We
        # explicitly do not flip ``_connected`` to True.
        self._connected = False
        return False

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
        meta = self.catalogue_metadata
        missing = self._missing_credentials()
        if missing:
            detail = (
                f"{meta.display_name} requires credentials "
                f"({', '.join(missing)}) and is not configured in this build."
            )
        else:
            detail = (
                f"{meta.display_name} is catalogued but no live adapter "
                f"implementation is bundled in this build. {meta.catalogue_reason}"
            )
        # Refuse to fabricate. Callers MUST surface this to the clinician.
        raise FetchError(detail)

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return list(raw)

    async def validate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return list(records)

    def get_provenance(self, record: Dict[str, Any]) -> ProvenanceRecord:
        meta = self.catalogue_metadata
        record_id = str(record.get("source_record_id") or record.get("id") or "")
        return ProvenanceRecord(
            source_database=meta.display_name,
            source_version=meta.version_tag,
            source_record_id=record_id,
            ingestion_timestamp=utc_now(),
            license_type=meta.license_type,
            confidence_tier=ConfidenceTier.UNKNOWN,
            evidence_level=EvidenceLevel.ANECDOTAL,
            attribution_text=meta.attribution_text,
            research_only=not meta.allows_commercial,
            retrieval_method="catalogued_only",
            data_quality_score=0.0,
        )

    def get_license(self) -> LicenseMetadata:
        meta = self.catalogue_metadata
        return LicenseMetadata(
            license_type=meta.license_type,
            license_url=meta.license_url,
            attribution_text=meta.attribution_text,
            allows_research=meta.allows_research,
            allows_commercial=meta.allows_commercial,
            requires_attribution=meta.requires_attribution,
        )

    def get_confidence(self, record: Dict[str, Any]) -> ConfidenceTier:
        return ConfidenceTier.UNKNOWN

    async def health_check(self) -> Dict[str, Any]:
        meta = self.catalogue_metadata
        missing = self._missing_credentials()
        message = meta.catalogue_reason
        status = "catalogued"
        if missing:
            message = (
                f"{message} Missing credential env vars: {', '.join(missing)}."
            )
            status = "disabled"
        return {
            "adapter_name": meta.display_name,
            "source_name": meta.display_name,
            "source_version": meta.version_tag,
            "endpoint": meta.endpoint_url,
            "connected": False,
            "status": status,
            "latency_ms": None,
            "last_check": utc_now().isoformat(),
            "message": message,
            "requires_credentials": bool(meta.required_credential_env_vars),
            "missing_credential_env_vars": missing,
        }


__all__ = ["CataloguedOnlyAdapter", "CataloguedSourceMetadata"]

"""
DeepSynaps Protocol Studio — Knowledge Layer Adapter Registry

Central registry managing all Knowledge Layer database adapters. Handles
adapter lifecycle (register, unregister, resolve), health monitoring with
cached status, priority-tier management (P0/P1/P2), license aggregation for
compliance reporting, and async initialization patterns.

The registry is designed as a singleton-friendly object; the application
layer typically instantiates one global registry at startup and injects it
into ETLPipeline instances.

Usage:
    from app.services.knowledge.adapter_registry import AdapterRegistry

    registry = AdapterRegistry()
    registry.register("pubmed", PubMedAdapter(config), tier="P0")
    registry.register("ctgov", ClinicalTrialsAdapter(config), tier="P1")

    adapter = registry.get("pubmed")
    all_healthy = await registry.health_check_all()
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from app.services.knowledge.base_adapter import (
    DatabaseAdapter,
    LicenseMetadata,
    LicenseViolationError,
)

logger = logging.getLogger("knowledge.adapter_registry")

# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class RegistryError(Exception):
    """Base exception for registry operations."""

    def __init__(self, message: str, *, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


class AdapterNotFoundError(RegistryError):
    """Raised when a requested adapter is not registered."""


class AdapterAlreadyRegisteredError(RegistryError):
    """Raised when attempting to register an adapter under an existing name."""


class InvalidTierError(RegistryError):
    """Raised when an invalid priority tier is specified."""


# ---------------------------------------------------------------------------
# Tier definitions
# ---------------------------------------------------------------------------

VALID_TIERS: Set[str] = {"P0", "P1", "P2"}

TIER_DESCRIPTIONS: Dict[str, str] = {
    "P0": "Critical — core clinical databases required for normal operation",
    "P1": "Important — quality sources that enhance knowledge coverage",
    "P2": "Extended — supplementary databases for deep research queries",
}

# ---------------------------------------------------------------------------
# Registry dataclass
# ---------------------------------------------------------------------------


@dataclass
class AdapterInfo:
    """Lightweight metadata snapshot for a registered adapter.

    Attributes:
        name: Registry key (unique identifier).
        adapter_class: Fully-qualified class name.
        source_name: Human-readable database name.
        source_version: Database version string.
        tier: Priority tier (P0, P1, or P2).
        registered_at: Timestamp of registration.
        license_type: License identifier.
        connected: Whether the adapter is currently connected.
    """

    name: str
    adapter_class: str
    source_name: str
    source_version: str
    tier: str
    registered_at: datetime
    license_type: str
    connected: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize adapter info to a JSON-friendly dictionary."""
        return {
            "name": self.name,
            "adapter_class": self.adapter_class,
            "source_name": self.source_name,
            "source_version": self.source_version,
            "tier": self.tier,
            "tier_description": TIER_DESCRIPTIONS.get(self.tier, "Unknown"),
            "registered_at": self.registered_at.isoformat(),
            "license_type": self.license_type,
            "connected": self.connected,
        }


# ---------------------------------------------------------------------------
# Central registry
# ---------------------------------------------------------------------------


class AdapterRegistry:
    """Central registry for all Knowledge Layer database adapters.

    Manages adapter lifecycle, health monitoring, priority tiers, and provides
    unified access to all integrated databases. The registry maintains three
    priority tiers:

        P0 — Critical adapters (e.g., PubMed, ClinicalTrials.gov). Failure
             triggers immediate alerts and degraded-mode handling.
        P1 — Important adapters that meaningfully expand coverage.
        P2 — Extended adapters for research-depth queries.

    Thread-safety: asyncio-safe; all mutating operations should be called
    from the same event loop. Synchronous reads (get, list_adapters) are
    safe across coroutines as long as no concurrent write is in progress.

    Attributes:
        _adapters: Map of name → DatabaseAdapter instance.
        _tiers: Map of tier → ordered list of adapter names.
        _health_status: Map of name → last health-check result.
        _adapter_info: Map of name → AdapterInfo metadata.
        _health_cache_ttl: Seconds to cache health-check results.
    """

    def __init__(self, health_cache_ttl: int = 30) -> None:
        self._adapters: Dict[str, DatabaseAdapter] = {}
        self._tiers: Dict[str, List[str]] = {
            "P0": [],  # Critical
            "P1": [],  # Important
            "P2": [],  # Extended
        }
        self._health_status: Dict[str, Dict[str, Any]] = {}
        self._adapter_info: Dict[str, AdapterInfo] = {}
        self._health_cache_ttl = health_cache_ttl
        self._health_last_check: Dict[str, float] = {}
        self._initialized: bool = False

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(
        self,
        name: str,
        adapter: DatabaseAdapter,
        tier: str = "P1",
        *,
        allow_replace: bool = False,
    ) -> None:
        """Register an adapter with the registry.

        Args:
            name: Unique registry key for the adapter (e.g., "pubmed").
            adapter: Concrete DatabaseAdapter instance.
            tier: Priority tier — one of 'P0', 'P1', 'P2'.
            allow_replace: If True, silently replace an existing entry.
                If False (default), raises AdapterAlreadyRegisteredError.

        Raises:
            AdapterAlreadyRegisteredError: If name already exists and
                allow_replace is False.
            InvalidTierError: If tier is not one of the valid values.
            TypeError: If adapter is not a DatabaseAdapter subclass.
        """
        if not isinstance(adapter, DatabaseAdapter):
            raise TypeError(
                f"adapter must be a DatabaseAdapter, got {type(adapter).__name__}"
            )

        if tier not in VALID_TIERS:
            raise InvalidTierError(
                f"Invalid tier '{tier}'. Must be one of: {sorted(VALID_TIERS)}",
                details={"provided_tier": tier, "valid_tiers": sorted(VALID_TIERS)},
            )

        if name in self._adapters and not allow_replace:
            raise AdapterAlreadyRegisteredError(
                f"Adapter '{name}' is already registered. "
                f"Use allow_replace=True to overwrite.",
                details={"existing_adapter": self._adapter_info.get(name, {}).to_dict() if name in self._adapter_info else None},
            )

        # Remove from old tier if replacing
        if name in self._adapters:
            old_tier = self._adapter_info[name].tier if name in self._adapter_info else tier
            if name in self._tiers.get(old_tier, []):
                self._tiers[old_tier].remove(name)
            logger.info("Replacing adapter '%s' in tier '%s'", name, old_tier)

        self._adapters[name] = adapter

        # Add to tier (preserve order, deduplicate)
        tier_list = self._tiers[tier]
        if name not in tier_list:
            tier_list.append(name)

        # Build info snapshot
        try:
            license_meta = adapter.get_license()
            license_type = license_meta.license_type
        except Exception as exc:
            logger.warning("Could not read license from '%s': %s", name, exc)
            license_type = "unknown"

        self._adapter_info[name] = AdapterInfo(
            name=name,
            adapter_class=f"{adapter.__class__.__module__}.{adapter.__class__.__name__}",
            source_name=adapter.source_name,
            source_version=adapter.source_version,
            tier=tier,
            registered_at=datetime.utcnow(),
            license_type=license_type,
            connected=adapter.is_connected,
        )

        logger.info(
            "Registered adapter '%s' (source='%s', tier='%s', class='%s')",
            name, adapter.source_name, tier, adapter.__class__.__name__,
        )

    def unregister(self, name: str) -> None:
        """Remove an adapter from the registry.

        Performs full cleanup: removes the adapter from tier lists,
        health status cache, metadata, and the adapter store.

        Args:
            name: Registry key of the adapter to remove.

        Raises:
            AdapterNotFoundError: If the adapter is not registered.
        """
        if name not in self._adapters:
            raise AdapterNotFoundError(
                f"Adapter '{name}' is not registered.",
                details={"registered_names": list(self._adapters.keys())},
            )

        adapter = self._adapters[name]
        tier = self._adapter_info[name].tier if name in self._adapter_info else "P1"

        # Remove from tier list
        if name in self._tiers.get(tier, []):
            self._tiers[tier].remove(name)

        # Clean up caches
        self._adapters.pop(name, None)
        self._adapter_info.pop(name, None)
        self._health_status.pop(name, None)
        self._health_last_check.pop(name, None)

        logger.info(
            "Unregistered adapter '%s' (source='%s')", name, adapter.source_name,
        )

    def replace(self, name: str, adapter: DatabaseAdapter, tier: Optional[str] = None) -> None:
        """Atomic replace of an existing adapter.

        Preserves the existing tier if not explicitly overridden.

        Args:
            name: Registry key to replace.
            adapter: New DatabaseAdapter instance.
            tier: Optional new tier; keeps existing tier if None.

        Raises:
            AdapterNotFoundError: If the adapter does not exist.
        """
        if name not in self._adapters:
            raise AdapterNotFoundError(f"Cannot replace '{name}': not registered.")

        effective_tier = tier or self._adapter_info[name].tier
        self.register(name, adapter, tier=effective_tier, allow_replace=True)
        logger.info("Atomically replaced adapter '%s'", name)

    # ------------------------------------------------------------------
    # Resolution
    # ------------------------------------------------------------------

    def get(self, name: str) -> Optional[DatabaseAdapter]:
        """Get an adapter by its registry name.

        Args:
            name: Registry key.

        Returns:
            The DatabaseAdapter instance, or None if not found.
        """
        adapter = self._adapters.get(name)
        if adapter is None:
            logger.debug("Adapter lookup failed for name='%s'", name)
        return adapter

    def get_required(self, name: str) -> DatabaseAdapter:
        """Get an adapter by name, raising if not found.

        Args:
            name: Registry key.

        Returns:
            The DatabaseAdapter instance.

        Raises:
            AdapterNotFoundError: If the adapter is not registered.
        """
        adapter = self.get(name)
        if adapter is None:
            raise AdapterNotFoundError(
                f"Required adapter '{name}' is not registered.",
                details={"registered_names": list(self._adapters.keys())},
            )
        return adapter

    def list_adapters(self, tier: Optional[str] = None) -> List[str]:
        """List all registered adapter names, optionally filtered by tier.

        Args:
            tier: If provided, only return adapters in that tier.

        Returns:
            List of adapter registry keys.

        Raises:
            InvalidTierError: If an invalid tier is provided.
        """
        if tier is not None:
            if tier not in VALID_TIERS:
                raise InvalidTierError(
                    f"Invalid tier '{tier}'. Must be one of: {sorted(VALID_TIERS)}",
                )
            return list(self._tiers[tier])
        return list(self._adapters.keys())

    def list_by_tier(self) -> Dict[str, List[str]]:
        """Return a mapping of tier → adapter names.

        Returns:
            Dictionary with keys 'P0', 'P1', 'P2'.
        """
        return {tier: list(names) for tier, names in self._tiers.items()}

    def has_adapter(self, name: str) -> bool:
        """Check whether an adapter is registered.

        Args:
            name: Registry key to check.

        Returns:
            True if the adapter is registered.
        """
        return name in self._adapters

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def get_adapter_info(self, name: str) -> Dict[str, Any]:
        """Get metadata about a registered adapter.

        Args:
            name: Registry key.

        Returns:
            Dictionary with keys: name, source_name, source_version,
            tier, tier_description, registered_at, license_type, connected.

        Raises:
            AdapterNotFoundError: If the adapter is not registered.
        """
        if name not in self._adapter_info:
            raise AdapterNotFoundError(f"Adapter '{name}' is not registered.")
        return self._adapter_info[name].to_dict()

    def get_all_info(self) -> Dict[str, Dict[str, Any]]:
        """Get metadata for all registered adapters.

        Returns:
            Dictionary mapping adapter name → info dictionary.
        """
        return {name: info.to_dict() for name, info in self._adapter_info.items()}

    # ------------------------------------------------------------------
    # Health monitoring
    # ------------------------------------------------------------------

    async def health_check(
        self,
        name: str,
        *,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Run a health check on a single adapter with optional caching.

        Args:
            name: Registry key.
            force: If True, bypass the cache and run a fresh check.

        Returns:
            Health status dictionary from the adapter.

        Raises:
            AdapterNotFoundError: If the adapter is not registered.
        """
        adapter = self.get_required(name)

        # Check cache
        now = time.monotonic()
        last_check = self._health_last_check.get(name)
        if not force and last_check is not None:
            if (now - last_check) < self._health_cache_ttl:
                cached = self._health_status.get(name, {})
                logger.debug("Returning cached health for '%s'", name)
                return dict(cached)

        try:
            result = await adapter.health_check()
            result["registry_name"] = name
            result["checked_at"] = datetime.utcnow().isoformat()
            result["cached"] = False
        except Exception as exc:
            logger.warning("Health check failed for '%s': %s", name, exc)
            result = {
                "registry_name": name,
                "adapter_name": adapter.source_name,
                "source_name": adapter.source_name,
                "source_version": adapter.source_version,
                "connected": False,
                "latency_ms": None,
                "last_check": datetime.utcnow().isoformat(),
                "message": f"Health check error: {exc}",
                "cached": False,
                "error": str(exc),
            }

        self._health_status[name] = result
        self._health_last_check[name] = now

        # Update adapter info connected status
        if name in self._adapter_info:
            self._adapter_info[name].connected = result.get("connected", False)

        return result

    async def health_check_all(
        self,
        *,
        force: bool = False,
        concurrency: int = 5,
    ) -> Dict[str, Dict[str, Any]]:
        """Run health checks on all registered adapters.

        Checks are executed concurrently with a semaphore to limit
        resource pressure on external endpoints.

        Args:
            force: If True, bypass per-adapter caches.
            concurrency: Maximum number of simultaneous health checks.

        Returns:
            Dictionary mapping adapter name → health status dict.
        """
        semaphore = asyncio.Semaphore(concurrency)

        async def _check_one(name: str) -> tuple[str, Dict[str, Any]]:
            async with semaphore:
                try:
                    status = await self.health_check(name, force=force)
                    return name, status
                except Exception as exc:
                    logger.error("Unexpected error in health check for '%s': %s", name, exc)
                    return name, {
                        "registry_name": name,
                        "connected": False,
                        "message": f"Unexpected error: {exc}",
                        "error": str(exc),
                    }

        names = list(self._adapters.keys())
        if not names:
            return {}

        results = await asyncio.gather(*[_check_one(n) for n in names])
        return {name: status for name, status in results}

    def get_cached_health(self, name: str) -> Optional[Dict[str, Any]]:
        """Return the most recently cached health status without running a new check.

        Args:
            name: Registry key.

        Returns:
            Cached health dict, or None if no check has been run.
        """
        return self._health_status.get(name)

    def get_all_cached_health(self) -> Dict[str, Dict[str, Any]]:
        """Return all cached health statuses.

        Returns:
            Dictionary mapping adapter name → cached health dict.
        """
        return dict(self._health_status)

    # ------------------------------------------------------------------
    # Async initialization
    # ------------------------------------------------------------------

    async def initialize_all(
        self,
        *,
        connect: bool = True,
        concurrency: int = 3,
        skip_on_error: bool = True,
    ) -> Dict[str, bool]:
        """Initialize all registered adapters.

        For each adapter this optionally calls connect() and then runs a
        health check. Results are tracked so the application can decide
        whether to proceed in degraded mode.

        Args:
            connect: Whether to call connect() on each adapter.
            concurrency: Max simultaneous initializations.
            skip_on_error: If True, log errors and continue. If False,
                the first error is propagated.

        Returns:
            Dictionary mapping adapter name → success bool.
        """
        semaphore = asyncio.Semaphore(concurrency)
        results: Dict[str, bool] = {}

        async def _init_one(name: str) -> tuple[str, bool]:
            adapter = self._adapters[name]
            async with semaphore:
                try:
                    if connect:
                        connected = await adapter.connect()
                        logger.info(
                            "Adapter '%s' connect() → %s", name, connected,
                        )
                    else:
                        connected = adapter.is_connected

                    # Run health check
                    await self.health_check(name, force=True)
                    return name, connected
                except Exception as exc:
                    logger.error("Initialization failed for '%s': %s", name, exc)
                    if not skip_on_error:
                        raise
                    return name, False

        init_results = await asyncio.gather(
            *[_init_one(n) for n in self._adapters.keys()],
            return_exceptions=skip_on_error,
        )

        for item in init_results:
            if isinstance(item, Exception):
                logger.error("Initialization raised exception: %s", item)
                continue
            name, success = item
            results[name] = success

        self._initialized = True
        logger.info(
            "Registry initialization complete: %d/%d adapters ready",
            sum(1 for v in results.values() if v), len(results),
        )
        return results

    async def shutdown_all(self, concurrency: int = 5) -> Dict[str, bool]:
        """Gracefully shut down all registered adapters.

        Calls disconnect() on every adapter concurrently.

        Args:
            concurrency: Max simultaneous disconnections.

        Returns:
            Dictionary mapping adapter name → success bool.
        """
        semaphore = asyncio.Semaphore(concurrency)

        async def _shutdown_one(name: str) -> tuple[str, bool]:
            adapter = self._adapters[name]
            async with semaphore:
                try:
                    await adapter.disconnect()
                    return name, True
                except Exception as exc:
                    logger.warning("Disconnect error for '%s': %s", name, exc)
                    return name, False

        results = await asyncio.gather(
            *[_shutdown_one(n) for n in list(self._adapters.keys())],
        )
        self._initialized = False
        return {name: success for name, success in results}

    # ------------------------------------------------------------------
    # License compliance
    # ------------------------------------------------------------------

    def get_license(self, name: str) -> LicenseMetadata:
        """Get license metadata for a specific adapter.

        Args:
            name: Registry key.

        Returns:
            LicenseMetadata instance.

        Raises:
            AdapterNotFoundError: If the adapter is not registered.
        """
        adapter = self.get_required(name)
        return adapter.get_license()

    def get_all_licenses(self) -> Dict[str, LicenseMetadata]:
        """Get licensing info for all registered adapters.

        Returns:
            Dictionary mapping adapter name → LicenseMetadata.
        """
        licenses: Dict[str, LicenseMetadata] = {}
        for name, adapter in self._adapters.items():
            try:
                licenses[name] = adapter.get_license()
            except Exception as exc:
                logger.warning("Could not retrieve license for '%s': %s", name, exc)
                licenses[name] = LicenseMetadata(
                    license_type="unknown",
                    allows_research=False,
                    allows_commercial=False,
                    requires_attribution=True,
                    restrictions=[f"License retrieval failed: {exc}"],
                )
        return licenses

    def generate_compliance_report(self) -> Dict[str, Any]:
        """Generate an aggregated license compliance report.

        The report includes every adapter, its license terms, whether
        research use is allowed, and any restrictions that affect
        clinical or commercial deployment.

        Returns:
            Dictionary with 'generated_at', 'total_adapters', 'adapters',
            'research_allowed_all', 'commercial_allowed_any',
            'requires_attribution', and 'compliance_issues'.
        """
        licenses = self.get_all_licenses()
        adapter_reports: List[Dict[str, Any]] = []
        compliance_issues: List[Dict[str, Any]] = []

        for name, lic in licenses.items():
            report = {
                "name": name,
                "license_type": lic.license_type,
                "allows_research": lic.allows_research,
                "allows_commercial": lic.allows_commercial,
                "requires_attribution": lic.requires_attribution,
                "requires_share_alike": lic.requires_share_alike,
                "redistribution_allowed": lic.redistribution_allowed,
                "modification_allowed": lic.modification_allowed,
                "attribution_text": lic.attribution_text,
                "restrictions": list(lic.restrictions),
                "last_verified": lic.last_verified.isoformat(),
            }
            adapter_reports.append(report)

            if not lic.allows_research:
                compliance_issues.append({
                    "adapter": name,
                    "issue": "Research use not allowed",
                    "severity": "critical",
                })
            if lic.requires_attribution and not lic.attribution_text:
                compliance_issues.append({
                    "adapter": name,
                    "issue": "Attribution required but no text provided",
                    "severity": "warning",
                })

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "total_adapters": len(licenses),
            "adapters": adapter_reports,
            "research_allowed_all": all(l.allows_research for l in licenses.values()),
            "commercial_allowed_any": any(l.allows_commercial for l in licenses.values()),
            "requires_attribution": any(l.requires_attribution for l in licenses.values()),
            "compliance_issues": compliance_issues,
        }

    def assert_license_compliance(self, name: str, *, research: bool = True, commercial: bool = False) -> None:
        """Assert that usage of an adapter is compliant with its license.

        Args:
            name: Registry key.
            research: Whether the intended use is research.
            commercial: Whether the intended use is commercial.

        Raises:
            AdapterNotFoundError: If the adapter is not registered.
            LicenseViolationError: If the intended use violates license terms.
        """
        lic = self.get_license(name)
        violations: List[str] = []

        if research and not lic.allows_research:
            violations.append("Research use is not permitted by license")
        if commercial and not lic.allows_commercial:
            violations.append("Commercial use is not permitted by license")

        if violations:
            raise LicenseViolationError(
                f"License violation for adapter '{name}': {'; '.join(violations)}",
                adapter_name=name,
                details={
                    "license_type": lic.license_type,
                    "violations": violations,
                    "allows_research": lic.allows_research,
                    "allows_commercial": lic.allows_commercial,
                },
            )

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------

    def stats(self) -> Dict[str, Any]:
        """Return registry statistics.

        Returns:
            Dictionary with adapter counts, tier breakdown, and health summary.
        """
        return {
            "total_adapters": len(self._adapters),
            "tier_breakdown": {
                tier: len(names) for tier, names in self._tiers.items()
            },
            "initialized": self._initialized,
            "adapters": list(self._adapters.keys()),
            "health_cached": list(self._health_status.keys()),
        }

    def __repr__(self) -> str:
        return (
            f"<AdapterRegistry("
            f"adapters={len(self._adapters)}, "
            f"P0={len(self._tiers['P0'])}, "
            f"P1={len(self._tiers['P1'])}, "
            f"P2={len(self._tiers['P2'])})>"
        )

    def __len__(self) -> int:
        """Return the number of registered adapters."""
        return len(self._adapters)

    def __contains__(self, name: str) -> bool:
        """Support 'name in registry' syntax."""
        return name in self._adapters

    def __iter__(self):
        """Iterate over (name, adapter) pairs."""
        return iter(self._adapters.items())

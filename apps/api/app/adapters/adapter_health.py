"""
DeepSynaps Knowledge Layer — Adapter Health Monitor
====================================================

Continuous health monitoring for all adapters with:
- Periodic health checks per adapter
- Response time tracking with percentile histograms
- Error rate monitoring with automatic disabling
- Prometheus-compatible metrics export
- Circuit breaker pattern for failing adapters
- Adaptive check intervals based on health

Usage:
    monitor = AdapterHealthMonitor(registry)
    await monitor.start()
    health = await monitor.check_all()
    metrics = monitor.to_prometheus()
"""

from __future__ import annotations

import asyncio
import logging
import time
import statistics
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import deque
from enum import Enum

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class HealthState(Enum):
    """Health state machine states."""
    HEALTHY = "healthy"           # All checks passing
    DEGRADED = "degraded"         # Some checks failing, within threshold
    UNHEALTHY = "unhealthy"       # Exceeded error threshold
    DISABLED = "disabled"         # Automatically disabled
    UNKNOWN = "unknown"           # No checks performed yet


@dataclass
class HealthCheckResult:
    """Result of a single health check."""
    adapter_key: str
    timestamp: datetime
    response_time_ms: float
    success: bool
    error_message: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AdapterHealthRecord:
    """Complete health record for a single adapter."""
    adapter_key: str
    display_name: str
    category: str
    state: HealthState = HealthState.UNKNOWN
    
    # Response time tracking
    response_times_ms: deque = field(default_factory=lambda: deque(maxlen=100))
    
    # Error tracking
    consecutive_successes: int = 0
    consecutive_failures: int = 0
    total_checks: int = 0
    total_successes: int = 0
    total_failures: int = 0
    
    # Last check info
    last_check_time: Optional[datetime] = None
    last_success_time: Optional[datetime] = None
    last_failure_time: Optional[datetime] = None
    last_error: Optional[str] = None
    last_response_time_ms: float = 0.0
    
    # Circuit breaker
    circuit_state: str = "closed"  # closed | open | half_open
    circuit_failures: int = 0
    circuit_opened_at: Optional[datetime] = None
    
    # Check interval (adaptive)
    current_interval_seconds: float = 60.0
    
    def error_rate(self) -> float:
        """Calculate error rate (0.0 - 1.0)."""
        if self.total_checks == 0:
            return 0.0
        return self.total_failures / self.total_checks

    def avg_response_time_ms(self) -> float:
        """Average response time."""
        if not self.response_times_ms:
            return 0.0
        return statistics.mean(self.response_times_ms)

    def p95_response_time_ms(self) -> float:
        """95th percentile response time."""
        if not self.response_times_ms:
            return 0.0
        sorted_times = sorted(self.response_times_ms)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    def p99_response_time_ms(self) -> float:
        """99th percentile response time."""
        if not self.response_times_ms:
            return 0.0
        sorted_times = sorted(self.response_times_ms)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    def uptime_percentage(self) -> float:
        """Calculate uptime percentage."""
        if self.total_checks == 0:
            return 100.0
        return (self.total_successes / self.total_checks) * 100

    def to_dict(self) -> Dict[str, Any]:
        return {
            "adapter_key": self.adapter_key,
            "display_name": self.display_name,
            "category": self.category,
            "state": self.state.value,
            "avg_response_time_ms": round(self.avg_response_time_ms(), 2),
            "p95_response_time_ms": round(self.p95_response_time_ms(), 2),
            "p99_response_time_ms": round(self.p99_response_time_ms(), 2),
            "last_response_time_ms": round(self.last_response_time_ms, 2),
            "error_rate": round(self.error_rate(), 4),
            "uptime_percentage": round(self.uptime_percentage(), 2),
            "consecutive_successes": self.consecutive_successes,
            "consecutive_failures": self.consecutive_failures,
            "total_checks": self.total_checks,
            "total_successes": self.total_successes,
            "total_failures": self.total_failures,
            "last_check_time": self.last_check_time.isoformat() if self.last_check_time else None,
            "last_success_time": self.last_success_time.isoformat() if self.last_success_time else None,
            "last_failure_time": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "last_error": self.last_error,
            "circuit_state": self.circuit_state,
            "circuit_failures": self.circuit_failures,
            "current_interval_seconds": self.current_interval_seconds,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class HealthMonitorConfig:
    """Configuration for the health monitor."""
    # Check intervals
    default_interval_seconds: float = 60.0
    healthy_interval_seconds: float = 60.0
    degraded_interval_seconds: float = 30.0
    unhealthy_interval_seconds: float = 15.0
    
    # Thresholds
    error_rate_threshold: float = 0.25         # Disable adapter if error rate > 25%
    consecutive_failure_threshold: int = 5     # Disable after 5 consecutive failures
    response_time_warning_ms: float = 5000.0   # Log warning if response > 5s
    response_time_critical_ms: float = 10000.0 # Mark degraded if response > 10s
    
    # Circuit breaker
    circuit_breaker_enabled: bool = True
    circuit_failure_threshold: int = 3
    circuit_timeout_seconds: float = 300.0     # 5 minutes
    
    # Auto-disable
    auto_disable_enabled: bool = True
    auto_disable_error_rate: float = 0.50      # Disable if error rate > 50%
    auto_disable_consecutive_failures: int = 10
    
    # Recovery
    recovery_check_interval_seconds: float = 300.0  # 5 minutes
    
    # Prometheus
    prometheus_prefix: str = "deepsynaps_adapter"


# ═══════════════════════════════════════════════════════════════════════════════
# CIRCUIT BREAKER
# ═══════════════════════════════════════════════════════════════════════════════

class CircuitBreaker:
    """Circuit breaker pattern for adapter calls."""

    def __init__(self, adapter_key: str, config: HealthMonitorConfig):
        self._adapter_key = adapter_key
        self._config = config
        self._state = "closed"  # closed | open | half_open
        self._failure_count = 0
        self._success_count = 0
        self._opened_at: Optional[datetime] = None

    @property
    def state(self) -> str:
        return self._state

    def can_execute(self) -> bool:
        """Check if the circuit allows execution."""
        if not self._config.circuit_breaker_enabled:
            return True
        
        if self._state == "closed":
            return True
        elif self._state == "open":
            if self._opened_at and \
               (datetime.utcnow() - self._opened_at).total_seconds() > self._config.circuit_timeout_seconds:
                self._state = "half_open"
                self._success_count = 0
                return True
            return False
        elif self._state == "half_open":
            return True
        return False

    def record_success(self):
        """Record a successful call."""
        if self._state == "half_open":
            self._success_count += 1
            if self._success_count >= 2:
                self._state = "closed"
                self._failure_count = 0
        elif self._state == "closed":
            self._failure_count = 0

    def record_failure(self):
        """Record a failed call."""
        self._failure_count += 1
        if self._state == "half_open":
            self._state = "open"
            self._opened_at = datetime.utcnow()
        elif self._state == "closed" and \
             self._failure_count >= self._config.circuit_failure_threshold:
            self._state = "open"
            self._opened_at = datetime.utcnow()
            logger.warning(f"Circuit breaker OPENED for {self._adapter_key}")


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH MONITOR
# ═══════════════════════════════════════════════════════════════════════════════

class AdapterHealthMonitor:
    """
    Continuous health monitoring for all adapters.

    Features:
    - Periodic health checks with configurable intervals
    - Response time histograms (avg, p95, p99)
    - Error rate tracking with automatic adapter disabling
    - Circuit breaker pattern per adapter
    - Adaptive check intervals based on health state
    - Prometheus-compatible metrics export
    - Recovery attempts for disabled adapters
    """

    def __init__(self, registry: Any, config: Optional[HealthMonitorConfig] = None):
        self._registry = registry
        self._config = config or HealthMonitorConfig()
        self._health_records: Dict[str, AdapterHealthRecord] = {}
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._check_results: deque = deque(maxlen=10000)

        # Initialize health records from registry
        self._init_records()

    def _init_records(self):
        """Initialize health records from registry metadata."""
        try:
            adapters = self._registry.list_adapters() if hasattr(self._registry, "list_adapters") else []
            for adapter_info in adapters:
                key = adapter_info.get("key", "unknown")
                self._health_records[key] = AdapterHealthRecord(
                    adapter_key=key,
                    display_name=adapter_info.get("display_name", key),
                    category=adapter_info.get("category", "unknown"),
                    current_interval_seconds=self._config.default_interval_seconds,
                )
                self._circuit_breakers[key] = CircuitBreaker(key, self._config)
        except Exception as e:
            logger.error(f"Failed to init health records: {e}")

    # ────────────────────────────────────────────────────────────────────
    # Lifecycle
    # ────────────────────────────────────────────────────────────────────

    async def start(self):
        """Start the background health monitoring loop."""
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Adapter health monitor started")

    async def stop(self):
        """Stop the background monitoring loop."""
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("Adapter health monitor stopped")

    async def _monitor_loop(self):
        """Background loop that periodically checks all adapters."""
        while self._running:
            try:
                await self.check_all()
                # Sleep with dynamic interval based on worst health
                interval = self._calculate_global_interval()
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
                await asyncio.sleep(self._config.default_interval_seconds)

    def _calculate_global_interval(self) -> float:
        """Calculate check interval based on worst adapter health."""
        states = [r.state for r in self._health_records.values()]
        if HealthState.UNHEALTHY in states or HealthState.DISABLED in states:
            return self._config.unhealthy_interval_seconds
        elif HealthState.DEGRADED in states:
            return self._config.degraded_interval_seconds
        return self._config.healthy_interval_seconds

    # ────────────────────────────────────────────────────────────────────
    # Health Checks
    # ────────────────────────────────────────────────────────────────────

    async def check_all(self) -> Dict[str, HealthCheckResult]:
        """Check health of all adapters concurrently."""
        results = {}
        tasks = []
        
        for key in self._health_records:
            cb = self._circuit_breakers.get(key)
            if cb and not cb.can_execute():
                # Circuit is open, skip check
                continue
            tasks.append(self._check_one(key))
        
        if tasks:
            completed = await asyncio.gather(*tasks, return_exceptions=True)
            for result in completed:
                if isinstance(result, Exception):
                    logger.error(f"Health check error: {result}")
                elif isinstance(result, HealthCheckResult):
                    results[result.adapter_key] = result
                    self._update_record(result)
                    self._check_results.append(result)
        
        return results

    async def check_one(self, adapter_key: str) -> Optional[HealthCheckResult]:
        """Check health of a single adapter."""
        cb = self._circuit_breakers.get(adapter_key)
        if cb and not cb.can_execute():
            return None
        return await self._check_one(adapter_key)

    async def _check_one(self, adapter_key: str) -> HealthCheckResult:
        """Execute a single health check."""
        record = self._health_records.get(adapter_key)
        if record is None:
            record = AdapterHealthRecord(
                adapter_key=adapter_key,
                display_name=adapter_key,
                category="unknown",
            )
            self._health_records[adapter_key] = record

        t0 = time.perf_counter()
        success = False
        error_msg = None
        details: Dict[str, Any] = {}

        try:
            # Get adapter instance from registry
            adapter = self._registry.get(adapter_key) if hasattr(self._registry, "get") else None

            if adapter is None:
                success = False
                error_msg = "Adapter not available in registry"
            elif hasattr(adapter, "health_check"):
                # Adapter has custom health_check method
                adapter_health = await adapter.health_check()
                success = adapter_health.get("healthy", True)
                details = adapter_health
            elif hasattr(adapter, "ping"):
                # Adapter has ping method
                success = await adapter.ping()
            elif hasattr(adapter, "validate_connection"):
                # Adapter has validate_connection method
                success = await adapter.validate_connection()
            else:
                # No health method — assume healthy if loaded
                success = True
                details["check_method"] = "presence_only"

            # Record circuit breaker result
            cb = self._circuit_breakers.get(adapter_key)
            if cb:
                if success:
                    cb.record_success()
                else:
                    cb.record_failure()

        except Exception as e:
            success = False
            error_msg = f"{type(e).__name__}: {str(e)}"
            cb = self._circuit_breakers.get(adapter_key)
            if cb:
                cb.record_failure()

        elapsed_ms = (time.perf_counter() - t0) * 1000

        result = HealthCheckResult(
            adapter_key=adapter_key,
            timestamp=datetime.utcnow(),
            response_time_ms=elapsed_ms,
            success=success,
            error_message=error_msg,
            details=details,
        )

        # Log slow responses
        if elapsed_ms > self._config.response_time_warning_ms:
            logger.warning(f"Slow response from {adapter_key}: {elapsed_ms:.1f}ms")

        return result

    def _update_record(self, result: HealthCheckResult):
        """Update health record with check result."""
        record = self._health_records[result.adapter_key]
        record.last_check_time = result.timestamp
        record.last_response_time_ms = result.response_time_ms
        record.response_times_ms.append(result.response_time_ms)
        record.total_checks += 1

        cb = self._circuit_breakers.get(result.adapter_key)
        if cb:
            record.circuit_state = cb.state
            record.circuit_failures = cb._failure_count

        if result.success:
            record.consecutive_successes += 1
            record.consecutive_failures = 0
            record.total_successes += 1
            record.last_success_time = result.timestamp
        else:
            record.consecutive_failures += 1
            record.consecutive_successes = 0
            record.total_failures += 1
            record.last_failure_time = result.timestamp
            record.last_error = result.error_message

        # Update state machine
        self._update_state(record)

        # Update adaptive interval
        self._update_interval(record)

    def _update_state(self, record: AdapterHealthRecord):
        """Update the health state based on recent check results."""
        if record.state == HealthState.DISABLED:
            # Only recovery checks can change from disabled
            if record.consecutive_successes >= 3:
                record.state = HealthState.HEALTHY
                logger.info(f"Adapter '{record.adapter_key}' recovered from DISABLED")
            return

        # Calculate error rate over recent checks
        error_rate = record.error_rate()

        if error_rate >= self._config.auto_disable_error_rate and \
           self._config.auto_disable_enabled:
            record.state = HealthState.DISABLED
            logger.warning(f"Adapter '{record.adapter_key}' AUTO-DISABLED "
                           f"(error rate: {error_rate:.1%})")
        elif record.consecutive_failures >= self._config.auto_disable_consecutive_failures:
            record.state = HealthState.DISABLED
            logger.warning(f"Adapter '{record.adapter_key}' AUTO-DISABLED "
                           f"({record.consecutive_failures} consecutive failures)")
        elif record.consecutive_failures >= self._config.consecutive_failure_threshold:
            record.state = HealthState.UNHEALTHY
        elif record.last_response_time_ms > self._config.response_time_critical_ms:
            record.state = HealthState.DEGRADED
        elif error_rate >= self._config.error_rate_threshold:
            record.state = HealthState.DEGRADED
        elif error_rate < 0.01 and record.consecutive_successes >= 3:
            record.state = HealthState.HEALTHY
        elif record.total_checks > 0:
            record.state = HealthState.HEALTHY

    def _update_interval(self, record: AdapterHealthRecord):
        """Update check interval based on health state."""
        if record.state == HealthState.HEALTHY:
            record.current_interval_seconds = self._config.healthy_interval_seconds
        elif record.state == HealthState.DEGRADED:
            record.current_interval_seconds = self._config.degraded_interval_seconds
        elif record.state == HealthState.UNHEALTHY:
            record.current_interval_seconds = self._config.unhealthy_interval_seconds
        elif record.state == HealthState.DISABLED:
            record.current_interval_seconds = self._config.recovery_check_interval_seconds

    # ────────────────────────────────────────────────────────────────────
    # Public API
    # ────────────────────────────────────────────────────────────────────

    def get_health(self, adapter_key: str) -> Optional[AdapterHealthRecord]:
        """Get health record for a specific adapter."""
        return self._health_records.get(adapter_key)

    def get_all_health(self) -> Dict[str, AdapterHealthRecord]:
        """Get all health records."""
        return dict(self._health_records)

    def is_healthy(self, adapter_key: str) -> bool:
        """Check if an adapter is healthy."""
        record = self._health_records.get(adapter_key)
        if record is None:
            return False
        return record.state in (HealthState.HEALTHY,)

    def is_available(self, adapter_key: str) -> bool:
        """Check if an adapter is available (not disabled)."""
        record = self._health_records.get(adapter_key)
        if record is None:
            return False
        return record.state != HealthState.DISABLED

    def disable_adapter(self, adapter_key: str):
        """Manually disable an adapter."""
        record = self._health_records.get(adapter_key)
        if record:
            record.state = HealthState.DISABLED
            logger.info(f"Adapter '{adapter_key}' manually disabled")

    def enable_adapter(self, adapter_key: str):
        """Manually enable an adapter."""
        record = self._health_records.get(adapter_key)
        if record:
            record.state = HealthState.UNKNOWN
            record.consecutive_successes = 0
            record.consecutive_failures = 0
            logger.info(f"Adapter '{adapter_key}' manually enabled")

    # ────────────────────────────────────────────────────────────────────
    # Summary & Reports
    # ────────────────────────────────────────────────────────────────────

    def get_summary(self) -> Dict[str, Any]:
        """Get overall health summary."""
        records = list(self._health_records.values())
        total = len(records)
        if total == 0:
            return {"status": "no_data"}

        healthy = sum(1 for r in records if r.state == HealthState.HEALTHY)
        degraded = sum(1 for r in records if r.state == HealthState.DEGRADED)
        unhealthy = sum(1 for r in records if r.state == HealthState.UNHEALTHY)
        disabled = sum(1 for r in records if r.state == HealthState.DISABLED)
        unknown = sum(1 for r in records if r.state == HealthState.UNKNOWN)

        all_response_times = []
        for r in records:
            all_response_times.extend(r.response_times_ms)

        avg_rt = statistics.mean(all_response_times) if all_response_times else 0

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "overall_status": "healthy" if healthy == total else \
                             "degraded" if degraded > 0 else \
                             "critical" if unhealthy > 0 or disabled > 0 else "unknown",
            "total_monitored": total,
            "healthy": healthy,
            "degraded": degraded,
            "unhealthy": unhealthy,
            "disabled": disabled,
            "unknown": unknown,
            "availability_percentage": round(healthy / total * 100, 1),
            "avg_response_time_ms": round(avg_rt, 2),
            "by_category": self._summary_by_category(),
        }

    def _summary_by_category(self) -> Dict[str, Dict[str, int]]:
        """Group health summary by category."""
        result: Dict[str, Dict[str, int]] = {}
        for record in self._health_records.values():
            cat = record.category
            if cat not in result:
                result[cat] = {"healthy": 0, "degraded": 0, "unhealthy": 0, "disabled": 0, "total": 0}
            result[cat][record.state.value] = result[cat].get(record.state.value, 0) + 1
            result[cat]["total"] += 1
        return result

    # ────────────────────────────────────────────────────────────────────
    # Prometheus Metrics Export
    # ────────────────────────────────────────────────────────────────────

    def to_prometheus(self) -> str:
        """
        Export metrics in Prometheus text format.

        Returns:
            Multi-line string in Prometheus exposition format
        """
        lines = []
        prefix = self._config.prometheus_prefix

        # HELP and TYPE declarations
        lines.append(f"# HELP {prefix}_health Adapter health status (1=healthy, 0.5=degraded, 0=unhealthy)")
        lines.append(f"# TYPE {prefix}_health gauge")
        lines.append(f"# HELP {prefix}_response_time_ms Adapter response time in milliseconds")
        lines.append(f"# TYPE {prefix}_response_time_ms gauge")
        lines.append(f"# HELP {prefix}_error_rate Adapter error rate")
        lines.append(f"# TYPE {prefix}_error_rate gauge")
        lines.append(f"# HELP {prefix}_checks_total Total health checks performed")
        lines.append(f"# TYPE {prefix}_checks_total counter")
        lines.append(f"# HELP {prefix}_uptime_percentage Adapter uptime percentage")
        lines.append(f"# TYPE {prefix}_uptime_percentage gauge")
        lines.append(f"# HELP {prefix}_info Adapter metadata")
        lines.append(f"# TYPE {prefix}_info gauge")

        for key, record in self._health_records.items():
            labels = f'adapter="{key}",category="{record.category}"'

            # Health gauge
            health_value = 1.0 if record.state == HealthState.HEALTHY else \
                           0.5 if record.state == HealthState.DEGRADED else 0.0
            lines.append(f'{prefix}_health{{{labels}}} {health_value}')

            # Response time
            avg_rt = record.avg_response_time_ms()
            lines.append(f'{prefix}_response_time_ms{{{labels}}} {avg_rt:.2f}')

            # P95 response time
            p95_rt = record.p95_response_time_ms()
            lines.append(f'{prefix}_response_time_p95_ms{{{labels}}} {p95_rt:.2f}')

            # Error rate
            lines.append(f'{prefix}_error_rate{{{labels}}} {record.error_rate():.4f}')

            # Total checks
            lines.append(f'{prefix}_checks_total{{{labels},result="success"}} {record.total_successes}')
            lines.append(f'{prefix}_checks_total{{{labels},result="failure"}} {record.total_failures}')

            # Uptime percentage
            lines.append(f'{prefix}_uptime_percentage{{{labels}}} {record.uptime_percentage():.2f}')

            # Info
            lines.append(f'{prefix}_info{{{labels},display_name="{record.display_name}"}} 1')

        # Summary metrics
        summary = self.get_summary()
        lines.append(f"# HELP {prefix}_summary_overall Overall registry health summary")
        lines.append(f"# TYPE {prefix}_summary_overall gauge")
        lines.append(f'{prefix}_summary_overall{{}} {summary.get("availability_percentage", 0):.2f}')

        return "\n".join(lines) + "\n"

    # ────────────────────────────────────────────────────────────────────
    # JSON Export for API
    # ────────────────────────────────────────────────────────────────────

    def to_json(self) -> Dict[str, Any]:
        """Export all health data as JSON-serializable dict."""
        return {
            "summary": self.get_summary(),
            "adapters": {k: v.to_dict() for k, v in self._health_records.items()},
            "config": {
                "default_interval_seconds": self._config.default_interval_seconds,
                "error_rate_threshold": self._config.error_rate_threshold,
                "consecutive_failure_threshold": self._config.consecutive_failure_threshold,
                "circuit_breaker_enabled": self._config.circuit_breaker_enabled,
                "auto_disable_enabled": self._config.auto_disable_enabled,
            },
        }


# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI ENDPOINT HELPER
# ═══════════════════════════════════════════════════════════════════════════════

class HealthEndpoint:
    """Helper to mount health check endpoints in FastAPI."""

    def __init__(self, monitor: AdapterHealthMonitor):
        self._monitor = monitor

    def register_routes(self, router: Any):
        """Register health endpoints on a FastAPI router."""
        from fastapi import HTTPException

        @router.get("/health")
        async def health_overview():
            return self._monitor.get_summary()

        @router.get("/health/adapters")
        async def adapter_health():
            return self._monitor.to_json()

        @router.get("/health/adapters/{adapter_key}")
        async def adapter_detail(adapter_key: str):
            record = self._monitor.get_health(adapter_key)
            if record is None:
                raise HTTPException(status_code=404, detail=f"Adapter '{adapter_key}' not found")
            return record.to_dict()

        @router.post("/health/adapters/{adapter_key}/disable")
        async def disable_adapter(adapter_key: str):
            self._monitor.disable_adapter(adapter_key)
            return {"status": "disabled", "adapter": adapter_key}

        @router.post("/health/adapters/{adapter_key}/enable")
        async def enable_adapter(adapter_key: str):
            self._monitor.enable_adapter(adapter_key)
            return {"status": "enabled", "adapter": adapter_key}

        @router.get("/metrics")
        async def prometheus_metrics():
            return self._monitor.to_prometheus()


__all__ = [
    "AdapterHealthMonitor",
    "HealthMonitorConfig",
    "HealthCheckResult",
    "AdapterHealthRecord",
    "HealthState",
    "CircuitBreaker",
    "HealthEndpoint",
]

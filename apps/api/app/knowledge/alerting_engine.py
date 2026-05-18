#!/usr/bin/env python3
"""
Alerting Engine - System Metrics & Alerting System

A production-grade alerting system that monitors system health,
evaluates alert rules against collected metrics, and sends notifications
through multiple channels with deduplication support.

Components:
    - MetricsCollector: Time-series metrics storage with windowed queries
    - RuleEngine: Evaluates alert rules against current metrics
    - AlertChannel: Pluggable notification channels (webhook, log, in-app)
    - AlertDedup: Deduplication with cooldown periods
    - AlertManager: Orchestrates rule evaluation and notification dispatch
    - HealthCheck: System health endpoint

Author: DevOps Monitoring Team
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import unittest
from abc import ABC, abstractmethod
from collections import defaultdict, deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Deque, Dict, List, Optional, Protocol, Tuple

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------

logger = logging.getLogger("alerting_engine")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    ))
    logger.addHandler(_handler)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SeverityLevel(str, Enum):
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

    @property
    def numeric(self) -> int:
        """Return numeric value for comparison (higher = more severe)."""
        return {"info": 1, "warning": 2, "critical": 3}[self.value]


class AlertAction(str, Enum):
    """Actions triggered by alert rules."""

    NOTIFY_ADMIN = "notify_admin"
    NOTIFY_TEAM = "notify_team"
    LOG_AND_NOTIFY = "log_and_notify"
    LOG_ONLY = "log_only"


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MetricPoint:
    """A single time-series metric data point.

    Attributes:
        name: Fully-qualified metric name (e.g. ``adapter.failed_checks``).
        value: Numeric value of the metric.
        timestamp: UTC epoch timestamp when the metric was recorded.
        tags: Optional key-value tags for dimensionality.
    """

    name: str
    value: float
    timestamp: float
    tags: Dict[str, str] = field(default_factory=dict)

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(asdict(self), default=str)

    @classmethod
    def from_json(cls, raw: str) -> MetricPoint:
        """Deserialize from JSON string."""
        data = json.loads(raw)
        return cls(**data)


@dataclass
class AlertRule:
    """Definition of an alert rule.

    Attributes:
        name: Unique rule identifier.
        condition: Human-readable condition description.
        severity: Severity level when triggered.
        action: Action to perform when triggered.
        metric_name: Metric name to watch (inferred from condition if not set).
        threshold: Numeric threshold for comparison.
        comparison: ``gt``, ``lt``, ``ge``, ``le``, ``eq``.
        window_seconds: Time window for aggregation.
        enabled: Whether the rule is active.
        cooldown_seconds: Minimum seconds between repeated alerts.
    """

    name: str
    condition: str
    severity: SeverityLevel
    action: AlertAction
    metric_name: str = ""
    threshold: float = 0.0
    comparison: str = "gt"
    window_seconds: int = 3600
    enabled: bool = True
    cooldown_seconds: int = 300


@dataclass
class Alert:
    """An instantiated alert raised by the system.

    Attributes:
        rule_name: Name of the rule that triggered.
        severity: Severity of the alert.
        message: Human-readable alert description.
        timestamp: UTC epoch timestamp when the alert was raised.
        metric_value: The metric value that caused the trigger.
        rule: Reference to the originating rule.
    """

    rule_name: str
    severity: SeverityLevel
    message: str
    timestamp: float
    metric_value: float
    rule: Optional[AlertRule] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert alert to dictionary for serialization."""
        return {
            "rule_name": self.rule_name,
            "severity": self.severity.value,
            "message": self.message,
            "timestamp": datetime.fromtimestamp(self.timestamp, tz=timezone.utc).isoformat(),
            "metric_value": self.metric_value,
            "rule_condition": self.rule.condition if self.rule else None,
        }

    @property
    def dedup_key(self) -> str:
        """Return a key used for deduplication."""
        raw = f"{self.rule_name}:{self.severity.value}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


@dataclass
class HealthStatus:
    """Health check response payload."""

    status: str  # "healthy", "degraded", "unhealthy"
    checks: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = ""

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "checks": self.checks,
            "timestamp": self.timestamp,
        }


# ---------------------------------------------------------------------------
# Metrics Collector
# ---------------------------------------------------------------------------

class MetricsCollector:
    """In-memory time-series metrics collector with sliding-window queries.

    Stores metric points in per-name deques and supports aggregation
    operations over configurable time windows.

    Thread-safety: *not* thread-safe; external synchronisation required
    for concurrent writes.
    """

    def __init__(self, max_retention_seconds: int = 86400) -> None:
        self._retention: int = max_retention_seconds
        # name -> deque of MetricPoint
        self._store: Dict[str, Deque[MetricPoint]] = defaultdict(
            lambda: deque(maxlen=100_000)
        )
        self._counters: Dict[str, float] = defaultdict(float)

    # ------------------------------------------------------------------
    # Write API
    # ------------------------------------------------------------------

    def record(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        """Record a metric data point at the current time."""
        point = MetricPoint(
            name=name,
            value=float(value),
            timestamp=time.time(),
            tags=tags or {},
        )
        self._store[name].append(point)
        self._gc(name)

    def increment(self, name: str, value: float = 1.0, tags: Optional[Dict[str, str]] = None) -> None:
        """Increment a counter metric."""
        self._counters[name] += value
        self.record(name, self._counters[name], tags)

    def gauge(self, name: str, value: float, tags: Optional[Dict[str, str]] = None) -> None:
        """Record a gauge metric."""
        self.record(name, value, tags)

    # ------------------------------------------------------------------
    # Read API
    # ------------------------------------------------------------------

    def query(
        self,
        name: str,
        window_seconds: int,
        aggregator: str = "last",
    ) -> float:
        """Return the aggregated value for *name* over the last *window_seconds*.

        Args:
            name: Metric name.
            window_seconds: Look-back window in seconds.
            aggregator: One of ``last``, ``avg``, ``sum``, ``count``,
                ``min``, ``max``, ``p95``.

        Returns:
            Aggregated value, or ``0.0`` if no data.
        """
        cutoff = time.time() - window_seconds
        points = [p for p in self._store.get(name, []) if p.timestamp >= cutoff]
        if not points:
            return 0.0

        values = [p.value for p in points]

        if aggregator == "last":
            return values[-1]
        if aggregator == "avg":
            return sum(values) / len(values)
        if aggregator == "sum":
            return sum(values)
        if aggregator == "count":
            return float(len(values))
        if aggregator == "min":
            return min(values)
        if aggregator == "max":
            return max(values)
        if aggregator == "p95":
            sorted_vals = sorted(values)
            idx = int(len(sorted_vals) * 0.95)
            return sorted_vals[min(idx, len(sorted_vals) - 1)]

        return values[-1]

    def get_rate(
        self,
        name: str,
        window_seconds: int,
    ) -> float:
        """Calculate the per-second rate of a counter over a window."""
        cutoff = time.time() - window_seconds
        points = [p for p in self._store.get(name, []) if p.timestamp >= cutoff]
        if len(points) < 2:
            return 0.0
        total = sum(p.value for p in points)
        return total / window_seconds

    def get_error_rate(
        self,
        total_name: str,
        error_name: str,
        window_seconds: int,
    ) -> float:
        """Calculate error rate = errors / total over a window."""
        total = self.query(total_name, window_seconds, aggregator="count")
        errors = self.query(error_name, window_seconds, aggregator="count")
        if total == 0:
            return 0.0
        return errors / total

    def latest(self, name: str) -> float:
        """Return the most recent value for a metric, or 0.0."""
        dq = self._store.get(name)
        if not dq:
            return 0.0
        return dq[-1].value

    def all_metric_names(self) -> List[str]:
        """Return a list of all known metric names."""
        return list(self._store.keys())

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _gc(self, name: str) -> None:
        """Remove points older than retention limit."""
        cutoff = time.time() - self._retention
        dq = self._store[name]
        while dq and dq[0].timestamp < cutoff:
            dq.popleft()

    def clear(self) -> None:
        """Remove all stored metrics (useful for testing)."""
        self._store.clear()
        self._counters.clear()


# ---------------------------------------------------------------------------
# Alert Deduplication
# ---------------------------------------------------------------------------

class AlertDedup:
    """Deduplicates alerts using a cooldown mechanism.

    An alert is suppressed if an identical alert (same dedup_key) was
    recently seen within the configured cooldown window.
    """

    def __init__(self, default_cooldown: int = 300) -> None:
        self._default_cooldown: int = default_cooldown
        # dedup_key -> last_sent_timestamp
        self._last_seen: Dict[str, float] = {}

    def should_send(self, alert: Alert, cooldown_override: Optional[int] = None) -> bool:
        """Return ``True`` if the alert should be sent (not a duplicate)."""
        key = alert.dedup_key
        cooldown = cooldown_override or self._default_cooldown
        last = self._last_seen.get(key, 0.0)
        now = time.time()
        if now - last < cooldown:
            logger.debug(
                "Alert dedup suppressed: rule=%s key=%s cooldown=%ds",
                alert.rule_name, key, cooldown,
            )
            return False
        return True

    def mark_sent(self, alert: Alert) -> None:
        """Record that the alert was just sent."""
        self._last_seen[alert.dedup_key] = time.time()

    def cooldown_remaining(self, alert: Alert) -> float:
        """Return remaining cooldown seconds for an alert, or 0.0."""
        key = alert.dedup_key
        last = self._last_seen.get(key, 0.0)
        remaining = self._default_cooldown - (time.time() - last)
        return max(remaining, 0.0)

    def reset(self, alert: Optional[Alert] = None) -> None:
        """Reset dedup state (for testing or alert resolution)."""
        if alert is None:
            self._last_seen.clear()
        else:
            self._last_seen.pop(alert.dedup_key, None)


# ---------------------------------------------------------------------------
# Alert Channels
# ---------------------------------------------------------------------------

class AlertChannel(ABC):
    """Abstract base class for notification channels."""

    name: str = "abstract"

    @abstractmethod
    async def send(self, alert: Alert) -> bool:
        """Send an alert notification. Return ``True`` on success."""

    def supports_action(self, action: AlertAction) -> bool:
        """Return ``True`` if this channel handles the given action."""
        return True


class WebhookChannel(AlertChannel):
    """Sends alerts as JSON POST payloads to an external webhook URL.

    Uses ``aiohttp`` if available, falling back to ``urllib`` for
    synchronous submission.
    """

    name: str = "webhook"

    def __init__(self, url: str, headers: Optional[Dict[str, str]] = None) -> None:
        self.url: str = url
        self.headers: Dict[str, str] = headers or {"Content-Type": "application/json"}
        self._last_response_code: Optional[int] = None

    async def send(self, alert: Alert) -> bool:
        """Send alert payload to the configured webhook URL."""
        payload = alert.to_dict()
        payload["channel"] = self.name
        payload["sent_at"] = datetime.now(timezone.utc).isoformat()

        try:
            import aiohttp  # type: ignore[import-untyped]
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.url,
                    json=payload,
                    headers=self.headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    self._last_response_code = resp.status
                    logger.info(
                        "WebhookChannel sent alert: rule=%s status=%d",
                        alert.rule_name, resp.status,
                    )
                    return 200 <= resp.status < 300
        except ImportError:
            # Fallback to urllib (synchronous in async context is sub-optimal
            # but functional for compatibility)
            import urllib.request
            req = urllib.request.Request(
                self.url,
                data=json.dumps(payload).encode(),
                headers=self.headers,
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    self._last_response_code = resp.status  # type: ignore[assignment]
                    logger.info("WebhookChannel sent alert (urllib): rule=%s", alert.rule_name)
                    return True
            except Exception as exc:
                logger.error("WebhookChannel failed: %s", exc)
                return False
        except Exception as exc:
            logger.error("WebhookChannel failed: %s", exc)
            return False

    def supports_action(self, action: AlertAction) -> bool:
        return action in (
            AlertAction.NOTIFY_ADMIN,
            AlertAction.NOTIFY_TEAM,
            AlertAction.LOG_AND_NOTIFY,
        )


class LogChannel(AlertChannel):
    """Emits alert notifications as structured JSON log entries."""

    name: str = "log"

    def __init__(self, logger_override: Optional[logging.Logger] = None) -> None:
        self._log: logging.Logger = logger_override or logger

    async def send(self, alert: Alert) -> bool:
        """Log the alert as a structured JSON message."""
        record = {
            "event": "alert_triggered",
            "rule_name": alert.rule_name,
            "severity": alert.severity.value,
            "message": alert.message,
            "metric_value": alert.metric_value,
            "timestamp": datetime.fromtimestamp(alert.timestamp, tz=timezone.utc).isoformat(),
            "channel": self.name,
        }
        log_fn = self._log.info if alert.severity == SeverityLevel.INFO else self._log.warning
        if alert.severity == SeverityLevel.CRITICAL:
            log_fn = self._log.critical
        log_fn(json.dumps(record))
        return True

    def supports_action(self, action: AlertAction) -> bool:
        return True  # Log channel handles everything


class InAppChannel(AlertChannel):
    """In-application notification channel.

    Stores alerts in an internal queue that can be consumed by a UI
    or other in-process subscribers.
    """

    name: str = "in_app"

    def __init__(self, max_queue_size: int = 10_000) -> None:
        self._alerts: Deque[Alert] = deque(maxlen=max_queue_size)
        self._subscribers: List[Callable[[Alert], None]] = []

    async def send(self, alert: Alert) -> bool:
        """Store alert in the in-app queue and notify subscribers."""
        self._alerts.append(alert)
        for cb in self._subscribers:
            try:
                cb(alert)
            except Exception:
                logger.exception("InApp subscriber failed")
        logger.info("InAppChannel stored alert: rule=%s", alert.rule_name)
        return True

    def supports_action(self, action: AlertAction) -> bool:
        return action in (
            AlertAction.NOTIFY_ADMIN,
            AlertAction.NOTIFY_TEAM,
            AlertAction.LOG_AND_NOTIFY,
        )

    def subscribe(self, callback: Callable[[Alert], None]) -> None:
        """Register a callback invoked on every new alert."""
        self._subscribers.append(callback)

    def get_alerts(self, count: int = 100) -> List[Alert]:
        """Return the most recent *count* alerts."""
        return list(self._alerts)[-count:]

    def clear(self) -> None:
        """Clear all queued alerts."""
        self._alerts.clear()


# ---------------------------------------------------------------------------
# Rule Engine
# ---------------------------------------------------------------------------

class RuleEngine:
    """Evaluates alert rules against collected metrics.

    Each rule specifies a metric name, comparison operator, threshold,
    and look-back window.  The engine queries the
    :class:`MetricsCollector` and returns any triggered alerts.
    """

    # Mapping of rule name -> AlertRule with pre-parsed config
    DEFAULT_RULES: List[AlertRule] = [
        AlertRule(
            name="adapter_down",
            condition="adapter.failed_checks > 3 in 15 minutes",
            severity=SeverityLevel.CRITICAL,
            action=AlertAction.NOTIFY_ADMIN,
            metric_name="adapter.failed_checks",
            threshold=3.0,
            comparison="gt",
            window_seconds=900,
        ),
        AlertRule(
            name="high_error_rate",
            condition="adapter.error_rate > 0.1 in 1 hour",
            severity=SeverityLevel.WARNING,
            action=AlertAction.NOTIFY_TEAM,
            metric_name="adapter.error_rate",
            threshold=0.1,
            comparison="gt",
            window_seconds=3600,
        ),
        AlertRule(
            name="slow_response",
            condition="adapter.p95_response > 5000ms",
            severity=SeverityLevel.WARNING,
            action=AlertAction.LOG_AND_NOTIFY,
            metric_name="adapter.p95_response",
            threshold=5000.0,
            comparison="gt",
            window_seconds=300,
        ),
        AlertRule(
            name="cache_hit_rate_low",
            condition="cache.hit_rate < 0.5",
            severity=SeverityLevel.INFO,
            action=AlertAction.LOG_ONLY,
            metric_name="cache.hit_rate",
            threshold=0.5,
            comparison="lt",
            window_seconds=300,
        ),
        AlertRule(
            name="disk_space_low",
            condition="disk.usage > 0.9",
            severity=SeverityLevel.CRITICAL,
            action=AlertAction.NOTIFY_ADMIN,
            metric_name="disk.usage",
            threshold=0.9,
            comparison="gt",
            window_seconds=60,
        ),
    ]

    def __init__(self, metrics: MetricsCollector) -> None:
        self._metrics: MetricsCollector = metrics
        self._rules: Dict[str, AlertRule] = {}
        for rule in self.DEFAULT_RULES:
            self._rules[rule.name] = rule

    # ------------------------------------------------------------------
    # Rule CRUD
    # ------------------------------------------------------------------

    def add_rule(self, rule: AlertRule) -> None:
        """Register a new alert rule."""
        self._rules[rule.name] = rule

    def remove_rule(self, name: str) -> None:
        """Remove an alert rule by name."""
        self._rules.pop(name, None)

    def get_rule(self, name: str) -> Optional[AlertRule]:
        """Return the rule with the given name."""
        return self._rules.get(name)

    def list_rules(self) -> List[AlertRule]:
        """Return all registered rules."""
        return list(self._rules.values())

    # ------------------------------------------------------------------
    # Evaluation
    # ------------------------------------------------------------------

    def evaluate_all(self) -> List[Alert]:
        """Evaluate all enabled rules and return triggered alerts."""
        alerts: List[Alert] = []
        for rule in self._rules.values():
            if not rule.enabled:
                continue
            alert = self._evaluate_rule(rule)
            if alert is not None:
                alerts.append(alert)
        return alerts

    def evaluate_rule(self, name: str) -> Optional[Alert]:
        """Evaluate a single rule by name."""
        rule = self._rules.get(name)
        if rule is None or not rule.enabled:
            return None
        return self._evaluate_rule(rule)

    def _evaluate_rule(self, rule: AlertRule) -> Optional[Alert]:
        """Evaluate a single rule against current metrics.

        Returns ``None`` if the rule is not triggered *or* if no metric
        data exists (avoids false-positives from default ``0.0`` values).
        """
        # Skip evaluation if no data has ever been recorded for this metric.
        if rule.metric_name not in self._metrics._store:
            return None

        metric_value = self._metrics.query(
            rule.metric_name,
            rule.window_seconds,
            aggregator="sum" if "failed_checks" in rule.metric_name else "last",
        )

        # For rate-based metrics like error_rate, use the rate query
        if "error_rate" in rule.metric_name:
            metric_value = self._metrics.latest(rule.metric_name)

        triggered = self._compare(metric_value, rule.threshold, rule.comparison)
        if not triggered:
            return None

        message = (
            f"Rule '{rule.name}' triggered: {rule.condition} "
            f"(value={metric_value:.4f})"
        )
        alert = Alert(
            rule_name=rule.name,
            severity=rule.severity,
            message=message,
            timestamp=time.time(),
            metric_value=metric_value,
            rule=rule,
        )
        return alert

    @staticmethod
    def _compare(value: float, threshold: float, op: str) -> bool:
        """Compare *value* against *threshold* using operator *op*."""
        return {
            "gt": value > threshold,
            "ge": value >= threshold,
            "lt": value < threshold,
            "le": value <= threshold,
            "eq": value == threshold,
        }.get(op, False)

    def get_rule_status(self) -> List[Dict[str, Any]]:
        """Return status of all rules (triggered or not)."""
        results: List[Dict[str, Any]] = []
        for rule in self._rules.values():
            val = self._metrics.query(rule.metric_name, rule.window_seconds, aggregator="last")
            triggered = self._compare(val, rule.threshold, rule.comparison)
            results.append({
                "name": rule.name,
                "enabled": rule.enabled,
                "metric_value": val,
                "threshold": rule.threshold,
                "triggered": triggered,
            })
        return results


# ---------------------------------------------------------------------------
# Alert Manager
# ---------------------------------------------------------------------------

class AlertManager:
    """Orchestrates metrics collection, rule evaluation, deduplication,
    and multi-channel alert dispatch.

    Typical usage::

        metrics = MetricsCollector()
        manager = AlertManager(metrics)
        manager.add_channel(LogChannel())
        manager.add_channel(WebhookChannel("https://hooks.example.com/alerts"))

        # Record metrics
        metrics.record("adapter.failed_checks", 5)

        # Evaluate and send
        alerts = await manager.check()
    """

    def __init__(
        self,
        metrics: MetricsCollector,
        dedup: Optional[AlertDedup] = None,
    ) -> None:
        self._metrics: MetricsCollector = metrics
        self._engine: RuleEngine = RuleEngine(metrics)
        self._dedup: AlertDedup = dedup or AlertDedup()
        self._channels: List[AlertChannel] = []
        self._total_alerts: int = 0
        self._total_sent: int = 0
        self._total_deduped: int = 0

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def add_channel(self, channel: AlertChannel) -> None:
        """Register a notification channel."""
        self._channels.append(channel)

    def remove_channel(self, channel: AlertChannel) -> None:
        """Unregister a notification channel."""
        self._channels = [c for c in self._channels if c is not channel]

    def get_engine(self) -> RuleEngine:
        """Return the internal rule engine."""
        return self._engine

    # ------------------------------------------------------------------
    # Check & Dispatch
    # ------------------------------------------------------------------

    async def check(self) -> List[Alert]:
        """Evaluate all rules and dispatch non-duplicate alerts.

        Returns:
            List of alerts that were triggered (including deduped).
        """
        alerts = self._engine.evaluate_all()
        self._total_alerts += len(alerts)

        for alert in alerts:
            if self._dedup.should_send(alert):
                await self._dispatch(alert)
                self._dedup.mark_sent(alert)
                self._total_sent += 1
            else:
                self._total_deduped += 1
                logger.info("Alert deduped: rule=%s", alert.rule_name)

        return alerts

    async def check_rule(self, name: str) -> Optional[Alert]:
        """Evaluate a single rule by name and dispatch if triggered."""
        alert = self._engine.evaluate_rule(name)
        if alert is None:
            return None
        self._total_alerts += 1
        if self._dedup.should_send(alert):
            await self._dispatch(alert)
            self._dedup.mark_sent(alert)
            self._total_sent += 1
        else:
            self._total_deduped += 1
        return alert

    async def _dispatch(self, alert: Alert) -> None:
        """Send alert to all applicable channels."""
        if not self._channels:
            logger.warning("No channels configured for alert: %s", alert.rule_name)
            return

        action = alert.rule.action if alert.rule else AlertAction.LOG_ONLY
        for channel in self._channels:
            if channel.supports_action(action):
                try:
                    success = await channel.send(alert)
                    if not success:
                        logger.error(
                            "Channel %s failed to send alert %s",
                            channel.name, alert.rule_name,
                        )
                except Exception:
                    logger.exception(
                        "Channel %s raised exception for alert %s",
                        channel.name, alert.rule_name,
                    )

    # ------------------------------------------------------------------
    # Metrics / Status
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, int]:
        """Return alert manager statistics."""
        return {
            "total_alerts": self._total_alerts,
            "total_sent": self._total_sent,
            "total_deduped": self._total_deduped,
            "channels": len(self._channels),
            "rules": len(self._engine.list_rules()),
        }

    def reset_stats(self) -> None:
        """Reset all statistics counters."""
        self._total_alerts = 0
        self._total_sent = 0
        self._total_deduped = 0


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

class HealthCheck:
    """Provides a health-check endpoint for the alerting system.

    Checks registered components and returns an overall health status.
    """

    def __init__(self, manager: AlertManager) -> None:
        self._manager: AlertManager = manager
        self._checks: Dict[str, Callable[[], Dict[str, Any]]] = {}

    def register_check(
        self,
        name: str,
        fn: Callable[[], Dict[str, Any]],
    ) -> None:
        """Register a custom health check function.

        The callable should return a dict with at least a ``"status"`` key
        (``"healthy"`` or ``"unhealthy"``).
        """
        self._checks[name] = fn

    def check(self) -> HealthStatus:
        """Run all health checks and return aggregated status."""
        results: Dict[str, Any] = {}
        overall = "healthy"

        # Built-in checks
        stats = self._manager.get_stats()
        results["alert_manager"] = {
            "status": "healthy",
            "stats": stats,
        }

        # Check for high dedup rate (potential issue)
        if stats["total_alerts"] > 0:
            dedup_rate = stats["total_deduped"] / stats["total_alerts"]
            if dedup_rate > 0.8:
                results["dedup_rate"] = {
                    "status": "degraded",
                    "detail": f"Dedup rate is {dedup_rate:.1%}",
                }
                overall = "degraded"

        # Check rule coverage
        engine = self._manager.get_engine()
        rules = engine.list_rules()
        enabled_rules = [r for r in rules if r.enabled]
        results["rules"] = {
            "status": "healthy" if enabled_rules else "unhealthy",
            "total": len(rules),
            "enabled": len(enabled_rules),
        }
        if not enabled_rules:
            overall = "unhealthy"

        # Custom checks
        for name, fn in self._checks.items():
            try:
                results[name] = fn()
                if results[name].get("status") == "unhealthy":
                    overall = "unhealthy"
                elif (
                    results[name].get("status") == "degraded"
                    and overall == "healthy"
                ):
                    overall = "degraded"
            except Exception as exc:
                results[name] = {"status": "unhealthy", "error": str(exc)}
                overall = "unhealthy"

        return HealthStatus(status=overall, checks=results)


# ---------------------------------------------------------------------------
# Convenience Factory
# ---------------------------------------------------------------------------

def create_default_manager() -> Tuple[AlertManager, MetricsCollector]:
    """Create an :class:`AlertManager` with sensible defaults.

    Returns:
        ``(manager, metrics)`` tuple.
    """
    metrics = MetricsCollector()
    dedup = AlertDedup(default_cooldown=300)
    manager = AlertManager(metrics, dedup)
    manager.add_channel(LogChannel())
    manager.add_channel(InAppChannel())
    return manager, metrics


# ===========================================================================
# Tests
# ===========================================================================

class TestMetricsCollector(unittest.TestCase):
    """Unit tests for :class:`MetricsCollector`."""

    def setUp(self) -> None:
        self.mc = MetricsCollector()

    def tearDown(self) -> None:
        self.mc.clear()

    def test_record_and_latest(self) -> None:
        self.mc.record("cpu.usage", 42.5)
        self.assertEqual(self.mc.latest("cpu.usage"), 42.5)

    def test_latest_missing(self) -> None:
        self.assertEqual(self.mc.latest("nonexistent"), 0.0)

    def test_increment(self) -> None:
        self.mc.increment("requests.total")
        self.mc.increment("requests.total", 2.0)
        self.assertEqual(self.mc.latest("requests.total"), 3.0)

    def test_gauge(self) -> None:
        self.mc.gauge("memory.usage", 78.0)
        self.assertEqual(self.mc.latest("memory.usage"), 78.0)

    def test_query_avg(self) -> None:
        self.mc.record("temp", 10.0)
        self.mc.record("temp", 20.0)
        self.mc.record("temp", 30.0)
        avg = self.mc.query("temp", 60, aggregator="avg")
        self.assertAlmostEqual(avg, 20.0, places=2)

    def test_query_count(self) -> None:
        for i in range(5):
            self.mc.record("events", float(i))
        count = self.mc.query("events", 60, aggregator="count")
        self.assertEqual(count, 5.0)

    def test_query_sum(self) -> None:
        for i in range(1, 4):
            self.mc.record("sales", float(i))
        total = self.mc.query("sales", 60, aggregator="sum")
        self.assertEqual(total, 6.0)

    def test_query_p95(self) -> None:
        for i in range(100):
            self.mc.record("latency", float(i))
        p95 = self.mc.query("latency", 60, aggregator="p95")
        self.assertAlmostEqual(p95, 95.0, places=1)

    def test_query_window_filtering(self) -> None:
        import time as time_mod
        # Old point (outside 1-second window)
        old_point = MetricPoint("x", 999.0, timestamp=time_mod.time() - 10)
        self.mc._store["x"].append(old_point)
        # New point
        self.mc.record("x", 1.0)
        val = self.mc.query("x", 1, aggregator="last")
        self.assertEqual(val, 1.0)

    def test_all_metric_names(self) -> None:
        self.mc.record("a", 1)
        self.mc.record("b", 2)
        names = sorted(self.mc.all_metric_names())
        self.assertEqual(names, ["a", "b"])

    def test_tags(self) -> None:
        self.mc.record("cpu", 50.0, tags={"host": "web-01"})
        point = self.mc._store["cpu"][0]
        self.assertEqual(point.tags, {"host": "web-01"})


class TestAlertDedup(unittest.TestCase):
    """Unit tests for :class:`AlertDedup`."""

    def setUp(self) -> None:
        self.dedup = AlertDedup(default_cooldown=2)

    def test_should_send_first_time(self) -> None:
        alert = Alert("test_rule", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        self.assertTrue(self.dedup.should_send(alert))

    def test_should_send_duplicate_suppressed(self) -> None:
        alert = Alert("test_rule", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        self.assertTrue(self.dedup.should_send(alert))
        self.dedup.mark_sent(alert)
        # Same rule + severity should be deduped within cooldown
        alert2 = Alert("test_rule", SeverityLevel.WARNING, "different msg", time.time(), 2.0)
        self.assertFalse(self.dedup.should_send(alert2))

    def test_different_rules_not_deduped(self) -> None:
        a1 = Alert("rule_a", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        a2 = Alert("rule_b", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        self.assertTrue(self.dedup.should_send(a1))
        self.dedup.mark_sent(a1)
        self.assertTrue(self.dedup.should_send(a2))

    def test_cooldown_expires(self) -> None:
        alert = Alert("test_rule", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        self.assertTrue(self.dedup.should_send(alert))
        self.dedup.mark_sent(alert)
        # Cooldown is 2 seconds; wait for it to expire
        time.sleep(2.5)
        self.assertTrue(self.dedup.should_send(alert))

    def test_reset(self) -> None:
        alert = Alert("test_rule", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        self.dedup.mark_sent(alert)
        self.assertFalse(self.dedup.should_send(alert))
        self.dedup.reset(alert)
        self.assertTrue(self.dedup.should_send(alert))

    def test_cooldown_remaining(self) -> None:
        alert = Alert("test_rule", SeverityLevel.WARNING, "msg", time.time(), 1.0)
        self.dedup.mark_sent(alert)
        remaining = self.dedup.cooldown_remaining(alert)
        self.assertGreater(remaining, 0.0)
        self.assertLessEqual(remaining, 2.0)


class TestAlertChannels(unittest.TestCase):
    """Unit tests for alert channel implementations."""

    def test_log_channel(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            log_channel = LogChannel()
            alert = Alert(
                rule_name="test",
                severity=SeverityLevel.INFO,
                message="test alert",
                timestamp=time.time(),
                metric_value=42.0,
            )
            result = loop.run_until_complete(log_channel.send(alert))
            self.assertTrue(result)
        finally:
            loop.close()

    def test_in_app_channel(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            channel = InAppChannel()
            alert = Alert(
                rule_name="test",
                severity=SeverityLevel.WARNING,
                message="in-app test",
                timestamp=time.time(),
                metric_value=10.0,
            )
            result = loop.run_until_complete(channel.send(alert))
            self.assertTrue(result)
            self.assertEqual(len(channel.get_alerts()), 1)
        finally:
            loop.close()

    def test_in_app_subscriber(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            channel = InAppChannel()
            received: List[Alert] = []
            channel.subscribe(lambda a: received.append(a))
            alert = Alert(
                rule_name="sub_test",
                severity=SeverityLevel.INFO,
                message="sub",
                timestamp=time.time(),
                metric_value=1.0,
            )
            loop.run_until_complete(channel.send(alert))
            self.assertEqual(len(received), 1)
            self.assertEqual(received[0].rule_name, "sub_test")
        finally:
            loop.close()

    def test_webhook_channel_init(self) -> None:
        wh = WebhookChannel("https://example.com/hook", headers={"Auth": "Bearer x"})
        self.assertEqual(wh.url, "https://example.com/hook")
        self.assertEqual(wh.headers["Auth"], "Bearer x")

    def test_webhook_supports_action(self) -> None:
        wh = WebhookChannel("https://example.com/hook")
        self.assertTrue(wh.supports_action(AlertAction.NOTIFY_ADMIN))
        self.assertTrue(wh.supports_action(AlertAction.NOTIFY_TEAM))
        self.assertTrue(wh.supports_action(AlertAction.LOG_AND_NOTIFY))
        self.assertFalse(wh.supports_action(AlertAction.LOG_ONLY))

    def test_log_channel_supports_all(self) -> None:
        lc = LogChannel()
        for action in AlertAction:
            self.assertTrue(lc.supports_action(action))


class TestRuleEngine(unittest.TestCase):
    """Unit tests for :class:`RuleEngine`."""

    def setUp(self) -> None:
        self.metrics = MetricsCollector()
        self.engine = RuleEngine(self.metrics)

    def tearDown(self) -> None:
        self.metrics.clear()

    def test_default_rules_loaded(self) -> None:
        rules = self.engine.list_rules()
        self.assertEqual(len(rules), 5)
        names = {r.name for r in rules}
        expected = {
            "adapter_down",
            "high_error_rate",
            "slow_response",
            "cache_hit_rate_low",
            "disk_space_low",
        }
        self.assertEqual(names, expected)

    def test_adapter_down_triggered(self) -> None:
        # Record 5 failed checks in the last 15 minutes
        for i in range(5):
            self.metrics.record("adapter.failed_checks", 1.0)
        alert = self.engine.evaluate_rule("adapter_down")
        self.assertIsNotNone(alert)
        self.assertEqual(alert.rule_name, "adapter_down")
        self.assertEqual(alert.severity, SeverityLevel.CRITICAL)

    def test_adapter_down_not_triggered(self) -> None:
        # Record only 2 failed checks
        for i in range(2):
            self.metrics.record("adapter.failed_checks", 1.0)
        alert = self.engine.evaluate_rule("adapter_down")
        self.assertIsNone(alert)

    def test_high_error_rate_triggered(self) -> None:
        self.metrics.record("adapter.error_rate", 0.25)
        alert = self.engine.evaluate_rule("high_error_rate")
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, SeverityLevel.WARNING)

    def test_high_error_rate_not_triggered(self) -> None:
        self.metrics.record("adapter.error_rate", 0.05)
        alert = self.engine.evaluate_rule("high_error_rate")
        self.assertIsNone(alert)

    def test_slow_response_triggered(self) -> None:
        self.metrics.record("adapter.p95_response", 7200.0)
        alert = self.engine.evaluate_rule("slow_response")
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, SeverityLevel.WARNING)

    def test_cache_hit_rate_low_triggered(self) -> None:
        self.metrics.record("cache.hit_rate", 0.3)
        alert = self.engine.evaluate_rule("cache_hit_rate_low")
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, SeverityLevel.INFO)

    def test_disk_space_low_triggered(self) -> None:
        self.metrics.record("disk.usage", 0.95)
        alert = self.engine.evaluate_rule("disk_space_low")
        self.assertIsNotNone(alert)
        self.assertEqual(alert.severity, SeverityLevel.CRITICAL)

    def test_add_and_remove_rule(self) -> None:
        new_rule = AlertRule(
            name="custom",
            condition="custom.metric > 10",
            severity=SeverityLevel.INFO,
            action=AlertAction.LOG_ONLY,
            metric_name="custom.metric",
            threshold=10.0,
            comparison="gt",
        )
        self.engine.add_rule(new_rule)
        self.assertIsNotNone(self.engine.get_rule("custom"))
        self.engine.remove_rule("custom")
        self.assertIsNone(self.engine.get_rule("custom"))

    def test_disabled_rule(self) -> None:
        rule = self.engine.get_rule("adapter_down")
        rule.enabled = False
        for i in range(10):
            self.metrics.record("adapter.failed_checks", 1.0)
        alert = self.engine.evaluate_rule("adapter_down")
        self.assertIsNone(alert)
        rule.enabled = True  # Restore

    def test_rule_status(self) -> None:
        self.metrics.record("adapter.failed_checks", 5.0)
        status = self.engine.get_rule_status()
        triggered = [s for s in status if s["triggered"]]
        self.assertTrue(len(triggered) >= 1)

    def test_comparison_ops(self) -> None:
        self.assertTrue(RuleEngine._compare(5.0, 3.0, "gt"))
        self.assertTrue(RuleEngine._compare(3.0, 3.0, "ge"))
        self.assertTrue(RuleEngine._compare(2.0, 3.0, "lt"))
        self.assertTrue(RuleEngine._compare(3.0, 3.0, "le"))
        self.assertTrue(RuleEngine._compare(3.0, 3.0, "eq"))
        self.assertFalse(RuleEngine._compare(5.0, 3.0, "lt"))


class TestAlertManager(unittest.TestCase):
    """Unit tests for :class:`AlertManager`."""

    def setUp(self) -> None:
        self.metrics = MetricsCollector()
        self.dedup = AlertDedup(default_cooldown=0)  # No dedup for tests
        self.manager = AlertManager(self.metrics, self.dedup)
        self.log_channel = LogChannel()
        self.in_app = InAppChannel()
        self.manager.add_channel(self.log_channel)
        self.manager.add_channel(self.in_app)

    def tearDown(self) -> None:
        self.metrics.clear()

    def test_check_no_alerts(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            alerts = loop.run_until_complete(self.manager.check())
            self.assertEqual(len(alerts), 0)
        finally:
            loop.close()

    def test_check_triggers_alert(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            self.metrics.record("adapter.failed_checks", 5.0)
            alerts = loop.run_until_complete(self.manager.check())
            triggered = [a for a in alerts if a.rule_name == "adapter_down"]
            self.assertEqual(len(triggered), 1)
            self.assertEqual(triggered[0].severity, SeverityLevel.CRITICAL)
        finally:
            loop.close()

    def test_check_dedup(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            self.dedup = AlertDedup(default_cooldown=3600)
            self.manager = AlertManager(self.metrics, self.dedup)
            self.manager.add_channel(self.log_channel)

            self.metrics.record("adapter.failed_checks", 5.0)
            alerts1 = loop.run_until_complete(self.manager.check())
            self.assertEqual(len(alerts1), 1)

            # Second check should dedup
            alerts2 = loop.run_until_complete(self.manager.check())
            self.assertEqual(len(alerts2), 1)  # Still evaluates but deduped
            stats = self.manager.get_stats()
            self.assertEqual(stats["total_deduped"], 1)
        finally:
            loop.close()

    def test_check_rule(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            self.metrics.record("disk.usage", 0.95)
            alert = loop.run_until_complete(self.manager.check_rule("disk_space_low"))
            self.assertIsNotNone(alert)
            self.assertEqual(alert.rule_name, "disk_space_low")
        finally:
            loop.close()

    def test_stats(self) -> None:
        stats = self.manager.get_stats()
        self.assertIn("total_alerts", stats)
        self.assertIn("total_sent", stats)
        self.assertIn("total_deduped", stats)
        self.assertIn("channels", stats)
        self.assertIn("rules", stats)

    def test_multiple_channels(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            # disk_space_low -> NOTIFY_ADMIN -> goes to InAppChannel
            self.metrics.record("disk.usage", 0.95)
            loop.run_until_complete(self.manager.check())
            alerts = self.in_app.get_alerts()
            disk_alerts = [a for a in alerts if a.rule_name == "disk_space_low"]
            self.assertTrue(len(disk_alerts) >= 1)
        finally:
            loop.close()

    def test_remove_channel(self) -> None:
        self.manager.remove_channel(self.log_channel)
        stats = self.manager.get_stats()
        self.assertEqual(stats["channels"], 1)

    def test_no_channels_warning(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            bare = AlertManager(MetricsCollector())
            bare._metrics.record("adapter.failed_checks", 10.0)
            # Should not raise even with no channels
            alerts = loop.run_until_complete(bare.check())
            self.assertTrue(len(alerts) >= 0)
        finally:
            loop.close()


class TestHealthCheck(unittest.TestCase):
    """Unit tests for :class:`HealthCheck`."""

    def setUp(self) -> None:
        self.metrics = MetricsCollector()
        self.manager = AlertManager(self.metrics)
        self.manager.add_channel(LogChannel())
        self.hc = HealthCheck(self.manager)

    def test_healthy(self) -> None:
        status = self.hc.check()
        self.assertEqual(status.status, "healthy")
        self.assertIn("rules", status.checks)
        self.assertIn("alert_manager", status.checks)

    def test_with_custom_check(self) -> None:
        self.hc.register_check("db", lambda: {"status": "healthy"})
        status = self.hc.check()
        self.assertEqual(status.status, "healthy")
        self.assertIn("db", status.checks)

    def test_unhealthy_custom_check(self) -> None:
        self.hc.register_check("db", lambda: {"status": "unhealthy"})
        status = self.hc.check()
        self.assertEqual(status.status, "unhealthy")

    def test_degraded_dedup_rate(self) -> None:
        # Simulate high dedup rate
        for _ in range(10):
            self.manager._total_alerts += 1
            self.manager._total_deduped += 1
        status = self.hc.check()
        # With 100% dedup rate, status should be degraded
        self.assertEqual(status.status, "degraded")


class TestIntegration(unittest.TestCase):
    """End-to-end integration tests."""

    def test_full_flow(self) -> None:
        """Test a complete alerting flow from metrics to notification."""
        loop = asyncio.new_event_loop()
        try:
            manager, metrics = create_default_manager()
            in_app: InAppChannel = manager._channels[1]  # type: ignore[assignment]

            # Record some metrics
            for i in range(5):
                metrics.record("adapter.failed_checks", 1.0)
            metrics.record("adapter.p95_response", 7500.0)
            metrics.record("cache.hit_rate", 0.3)
            metrics.record("disk.usage", 0.95)

            # Evaluate rules
            alerts = loop.run_until_complete(manager.check())

            # Should trigger: adapter_down, slow_response, cache_hit_rate_low, disk_space_low
            rule_names = {a.rule_name for a in alerts}
            self.assertIn("adapter_down", rule_names)
            self.assertIn("slow_response", rule_names)
            self.assertIn("cache_hit_rate_low", rule_names)
            self.assertIn("disk_space_low", rule_names)

            # Verify in-app notifications (LOG_ONLY action skips in-app)
            queued = in_app.get_alerts()
            self.assertTrue(len(queued) >= 3)  # adapter_down, slow_response, disk_space_low

            # Verify stats
            stats = manager.get_stats()
            self.assertGreaterEqual(stats["total_alerts"], 4)
            self.assertGreaterEqual(stats["total_sent"], 4)

            # Verify health check
            hc = HealthCheck(manager)
            health = hc.check()
            self.assertEqual(health.status, "healthy")
        finally:
            loop.close()

    def test_dedup_does_not_suppress_different_severities(self) -> None:
        """Alerts with different severities should not dedup each other."""
        dedup = AlertDedup(default_cooldown=3600)
        a1 = Alert("r1", SeverityLevel.WARNING, "w", time.time(), 1.0)
        a2 = Alert("r1", SeverityLevel.CRITICAL, "c", time.time(), 1.0)
        self.assertTrue(dedup.should_send(a1))
        dedup.mark_sent(a1)
        # Different severity -> different dedup key
        self.assertTrue(dedup.should_send(a2))

    def test_alert_serialization(self) -> None:
        alert = Alert(
            rule_name="test",
            severity=SeverityLevel.CRITICAL,
            message="test message",
            timestamp=1700000000.0,
            metric_value=42.0,
        )
        d = alert.to_dict()
        self.assertEqual(d["rule_name"], "test")
        self.assertEqual(d["severity"], "critical")
        self.assertEqual(d["metric_value"], 42.0)

    def test_metric_point_serialization(self) -> None:
        point = MetricPoint("cpu", 50.0, 1700000000.0, {"host": "web01"})
        raw = point.to_json()
        restored = MetricPoint.from_json(raw)
        self.assertEqual(restored.name, "cpu")
        self.assertEqual(restored.value, 50.0)
        self.assertEqual(restored.tags, {"host": "web01"})

    def test_severity_ordering(self) -> None:
        self.assertLess(SeverityLevel.INFO.numeric, SeverityLevel.WARNING.numeric)
        self.assertLess(SeverityLevel.WARNING.numeric, SeverityLevel.CRITICAL.numeric)

    def test_health_status_serialization(self) -> None:
        hs = HealthStatus(
            status="healthy",
            checks={"db": {"status": "healthy"}},
        )
        d = hs.to_dict()
        self.assertEqual(d["status"], "healthy")
        self.assertIn("timestamp", d)


# ---------------------------------------------------------------------------
# Main / CLI
# ---------------------------------------------------------------------------

def main() -> None:  # pragma: no cover
    """Run a demonstration of the alerting engine."""
    print("=" * 60)
    print("Alerting Engine Demo")
    print("=" * 60)

    manager, metrics = create_default_manager()

    # Record metrics that trigger multiple rules
    print("\n[1] Recording metrics...")
    for i in range(5):
        metrics.record("adapter.failed_checks", 1.0)
    metrics.record("adapter.p95_response", 7200.0)
    metrics.record("cache.hit_rate", 0.3)
    metrics.record("disk.usage", 0.95)

    # Show rule status before evaluation
    print("\n[2] Rule status before evaluation:")
    engine = manager.get_engine()
    for rs in engine.get_rule_status():
        status_icon = "🔴" if rs["triggered"] else "🟢"
        print(f"    {status_icon} {rs['name']}: value={rs['metric_value']:.4f} "
              f"threshold={rs['threshold']} triggered={rs['triggered']}")

    # Evaluate rules
    print("\n[3] Evaluating rules...")
    loop = asyncio.new_event_loop()
    try:
        alerts = loop.run_until_complete(manager.check())
        print(f"    Triggered {len(alerts)} alert(s):")
        for alert in alerts:
            severity_icon = {"info": "ℹ️", "warning": "⚠️", "critical": "🚨"}.get(
                alert.severity.value, "❓"
            )
            print(f"      {severity_icon} [{alert.severity.value.upper()}] {alert.rule_name}: "
                  f"{alert.message}")
    finally:
        loop.close()

    # Show stats
    print("\n[4] Alert manager stats:")
    for key, value in manager.get_stats().items():
        print(f"    {key}: {value}")

    # Health check
    print("\n[5] Health check:")
    hc = HealthCheck(manager)
    health = hc.check()
    print(f"    Overall: {health.status}")
    for check_name, check_data in health.checks.items():
        print(f"    {check_name}: {check_data['status']}")

    print("\n" + "=" * 60)
    print("Demo complete.")
    print("=" * 60)


if __name__ == "__main__":
    # Run unit tests when invoked directly
    unittest.main(verbosity=2, exit=False)
    # Then run demo
    main()

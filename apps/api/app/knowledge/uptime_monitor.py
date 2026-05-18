#!/usr/bin/env python3
"""
Adapter Uptime Monitor
=======================
Production-ready health monitoring system for adapter infrastructure.

Tracks adapter uptime, response times (p50/p95/p99), error rates,
and generates alerts when adapters go down or become degraded.

All metrics are persisted to SQLite for historical analysis.

Usage:
    python uptime_monitor.py [--db PATH] [--interval SECONDS] [--adapters KEY1,KEY2]

Example:
    python uptime_monitor.py --db /var/lib/monitor.db --interval 300
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import signal
import sqlite3
import statistics
import sys
import threading
import time
import unittest
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Protocol, Tuple

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------

LOG_FMT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


class JsonLogFormatter(logging.Formatter):
    """Emit log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        # Include exception info if present
        if record.exc_info and record.exc_info[1]:
            payload["exception"] = str(record.exc_info[1])
        # Merge extra fields
        for key in ("adapter", "response_ms", "status", "error_rate", "checks"):
            val = getattr(record, key, None)
            if val is not None:
                payload[key] = val
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO, json_format: bool = True) -> None:
    """Configure root logger with JSON or plain formatter."""
    handler = logging.StreamHandler(sys.stdout)
    if json_format:
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(logging.Formatter(LOG_FMT))
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]


logger = logging.getLogger("uptime_monitor")


# ---------------------------------------------------------------------------
# Enums and data classes
# ---------------------------------------------------------------------------

class AdapterStatus(str, Enum):
    """Operational status of an adapter."""

    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


class AlertSeverity(str, Enum):
    """Severity levels for generated alerts."""

    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


@dataclass(frozen=True)
class AdapterPingResult:
    """Result of a single adapter health ping."""

    adapter_key: str
    timestamp: datetime
    response_time_ms: float
    success: bool
    error_message: Optional[str] = None
    result_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        return d


@dataclass
class AdapterUptimeSummary:
    """Aggregated uptime statistics for an adapter."""

    adapter_key: str
    total_checks: int = 0
    successful_checks: int = 0
    failed_checks: int = 0
    avg_response_ms: float = 0.0
    p50_response_ms: float = 0.0
    p95_response_ms: float = 0.0
    p99_response_ms: float = 0.0
    error_rate: float = 0.0
    last_check: Optional[datetime] = None
    last_success: Optional[datetime] = None
    status: AdapterStatus = AdapterStatus.UNKNOWN


@dataclass(frozen=True)
class Alert:
    """Alert raised when an adapter changes state."""

    adapter_key: str
    severity: AlertSeverity
    message: str
    timestamp: datetime
    previous_status: Optional[AdapterStatus] = None
    current_status: AdapterStatus = AdapterStatus.UNKNOWN

    def to_dict(self) -> Dict[str, Any]:
        return {
            "adapter_key": self.adapter_key,
            "severity": self.severity.value,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "previous_status": self.previous_status.value if self.previous_status else None,
            "current_status": self.current_status.value,
        }


# ---------------------------------------------------------------------------
# Protocol for adapter ping targets
# ---------------------------------------------------------------------------

class Pingable(Protocol):
    """Protocol describing something that can be health-checked."""

    @property
    def adapter_key(self) -> str:
        ...

    async def health_check(self) -> Tuple[bool, float, Optional[str], int]:
        """Return (success, response_time_ms, error_msg, result_count)."""
        ...


# ---------------------------------------------------------------------------
# SQLite persistence layer
# ---------------------------------------------------------------------------

class MetricsDatabase:
    """SQLite-backed storage for adapter metrics and uptime summaries."""

    _INIT_SQL = """
    CREATE TABLE IF NOT EXISTS adapter_metrics (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        adapter_key TEXT    NOT NULL,
        timestamp   TEXT    NOT NULL,
        response_time_ms REAL,
        success     INTEGER NOT NULL,
        error_message TEXT,
        result_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS adapter_uptime (
        adapter_key      TEXT PRIMARY KEY,
        total_checks     INTEGER DEFAULT 0,
        successful_checks INTEGER DEFAULT 0,
        failed_checks    INTEGER DEFAULT 0,
        avg_response_ms  REAL    DEFAULT 0.0,
        last_check       TEXT,
        last_success     TEXT,
        status           TEXT    DEFAULT 'unknown'
    );

    CREATE TABLE IF NOT EXISTS alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        adapter_key  TEXT    NOT NULL,
        severity     TEXT    NOT NULL,
        message      TEXT    NOT NULL,
        timestamp    TEXT    NOT NULL,
        previous_status TEXT,
        current_status  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_key_ts
        ON adapter_metrics(adapter_key, timestamp);

    CREATE INDEX IF NOT EXISTS idx_alerts_key
        ON alerts(adapter_key);
    """

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._local = threading.local()
        self._init_db()

    # -- connection management --------------------------------------------

    def _conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn

    def _init_db(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(self._INIT_SQL)
            conn.commit()
        logger.info("database_initialised", extra={"db_path": self.db_path})

    # -- public API -------------------------------------------------------

    def insert_ping(self, result: AdapterPingResult) -> None:
        """Store a single ping result."""
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO adapter_metrics
                    (adapter_key, timestamp, response_time_ms, success,
                     error_message, result_count)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    result.adapter_key,
                    result.timestamp.isoformat(),
                    result.response_time_ms,
                    1 if result.success else 0,
                    result.error_message,
                    result.result_count,
                ),
            )
            conn.commit()

    def upsert_uptime(self, summary: AdapterUptimeSummary) -> None:
        """Persist aggregated uptime stats for an adapter."""
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO adapter_uptime
                    (adapter_key, total_checks, successful_checks, failed_checks,
                     avg_response_ms, last_check, last_success, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(adapter_key) DO UPDATE SET
                    total_checks     = excluded.total_checks,
                    successful_checks = excluded.successful_checks,
                    failed_checks    = excluded.failed_checks,
                    avg_response_ms  = excluded.avg_response_ms,
                    last_check       = excluded.last_check,
                    last_success     = excluded.last_success,
                    status           = excluded.status
                """,
                (
                    summary.adapter_key,
                    summary.total_checks,
                    summary.successful_checks,
                    summary.failed_checks,
                    summary.avg_response_ms,
                    summary.last_check.isoformat() if summary.last_check else None,
                    summary.last_success.isoformat() if summary.last_success else None,
                    summary.status.value,
                ),
            )
            conn.commit()

    def record_alert(self, alert: Alert) -> None:
        """Store an alert in the database."""
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO alerts
                    (adapter_key, severity, message, timestamp,
                     previous_status, current_status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    alert.adapter_key,
                    alert.severity.value,
                    alert.message,
                    alert.timestamp.isoformat(),
                    alert.previous_status.value if alert.previous_status else None,
                    alert.current_status.value,
                ),
            )
            conn.commit()

    def get_recent_metrics(
        self,
        adapter_key: str,
        minutes: int = 60,
    ) -> List[Dict[str, Any]]:
        """Return metrics rows for the last N minutes."""
        cutoff = datetime.now(timezone.utc).isoformat()
        # ISO-format string comparison works for recent timestamps in UTC
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM adapter_metrics
                WHERE adapter_key = ? AND timestamp > datetime(?, '-{} minutes')
                ORDER BY timestamp DESC
                """.format(minutes),
                (adapter_key, cutoff),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_uptime_summary(self, adapter_key: str) -> Optional[AdapterUptimeSummary]:
        """Load current uptime summary for an adapter."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM adapter_uptime WHERE adapter_key = ?",
                (adapter_key,),
            ).fetchone()
        if not row:
            return None
        rd = dict(row)
        return AdapterUptimeSummary(
            adapter_key=rd["adapter_key"],
            total_checks=rd["total_checks"],
            successful_checks=rd["successful_checks"],
            failed_checks=rd["failed_checks"],
            avg_response_ms=rd["avg_response_ms"] or 0.0,
            last_check=datetime.fromisoformat(rd["last_check"]) if rd["last_check"] else None,
            last_success=datetime.fromisoformat(rd["last_success"]) if rd["last_success"] else None,
            status=AdapterStatus(rd["status"]),
        )

    def get_all_uptime(self) -> List[AdapterUptimeSummary]:
        """Load uptime summaries for every adapter."""
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM adapter_uptime").fetchall()
        return [self._row_to_summary(r) for r in rows]

    def get_alerts(
        self,
        adapter_key: Optional[str] = None,
        minutes: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve stored alerts, optionally filtered."""
        query = "SELECT * FROM alerts WHERE 1=1"
        params: List[Any] = []
        if adapter_key:
            query += " AND adapter_key = ?"
            params.append(adapter_key)
        if minutes:
            query += " AND timestamp > datetime('now', '-{} minutes')".format(minutes)
        query += " ORDER BY timestamp DESC"
        with self._conn() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def calculate_percentiles(
        self,
        adapter_key: str,
        minutes: int = 60,
    ) -> Dict[str, float]:
        """Calculate p50, p95, p99 response times from recent metrics."""
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT response_time_ms FROM adapter_metrics
                WHERE adapter_key = ?
                  AND timestamp > datetime('now', '-{} minutes')
                  AND success = 1
                  AND response_time_ms IS NOT NULL
                ORDER BY response_time_ms
                """.format(minutes),
                (adapter_key,),
            ).fetchall()
        times = [r["response_time_ms"] for r in rows]
        if not times:
            return {"p50": 0.0, "p95": 0.0, "p99": 0.0}
        return {
            "p50": percentile(times, 50),
            "p95": percentile(times, 95),
            "p99": percentile(times, 99),
        }

    def generate_uptime_report(self) -> Dict[str, Any]:
        """Return a JSON-serialisable uptime report for all adapters."""
        summaries = self.get_all_uptime()
        adapters: List[Dict[str, Any]] = []
        for s in summaries:
            percs = self.calculate_percentiles(s.adapter_key)
            adapters.append({
                "adapter_key": s.adapter_key,
                "status": s.status.value,
                "uptime_pct": round(
                    (s.successful_checks / s.total_checks * 100), 2
                ) if s.total_checks else 0.0,
                "total_checks": s.total_checks,
                "successful_checks": s.successful_checks,
                "failed_checks": s.failed_checks,
                "avg_response_ms": round(s.avg_response_ms, 2),
                "p50_ms": round(percs["p50"], 2),
                "p95_ms": round(percs["p95"], 2),
                "p99_ms": round(percs["p99"], 2),
                "error_rate": round(s.failed_checks / s.total_checks, 4) if s.total_checks else 0.0,
                "last_check": s.last_check.isoformat() if s.last_check else None,
                "last_success": s.last_success.isoformat() if s.last_success else None,
            })
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "adapter_count": len(adapters),
            "adapters": adapters,
        }

    def close(self) -> None:
        if hasattr(self._local, "conn") and self._local.conn:
            self._local.conn.close()
            self._local.conn = None

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _row_to_summary(row: sqlite3.Row) -> AdapterUptimeSummary:
        rd = dict(row)
        return AdapterUptimeSummary(
            adapter_key=rd["adapter_key"],
            total_checks=rd["total_checks"],
            successful_checks=rd["successful_checks"],
            failed_checks=rd["failed_checks"],
            avg_response_ms=rd["avg_response_ms"] or 0.0,
            last_check=datetime.fromisoformat(rd["last_check"]) if rd["last_check"] else None,
            last_success=datetime.fromisoformat(rd["last_success"]) if rd["last_success"] else None,
            status=AdapterStatus(rd["status"]),
        )


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def percentile(sorted_values: List[float], p: float) -> float:
    """Calculate percentile using nearest-rank method.

    Args:
        sorted_values: Already-sorted list of numeric values.
        p: Percentile to compute (0-100).

    Returns:
        The percentile value.
    """
    if not sorted_values:
        return 0.0
    n = len(sorted_values)
    if n == 1:
        return sorted_values[0]
    k = (n - 1) * (p / 100.0)
    f = int(k)
    c = f + 1 if f + 1 < n else f
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (k - f) * (sorted_values[c] - sorted_values[f])


def now_utc() -> datetime:
    """Return current UTC datetime."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Simple adapter implementations for demonstration / testing
# ---------------------------------------------------------------------------

class MockAdapter:
    """Test double that can simulate success, failure, or latency."""

    def __init__(
        self,
        key: str,
        latency_ms: float = 10.0,
        fail_rate: float = 0.0,
        result_count: int = 3,
    ) -> None:
        self._key = key
        self.latency_ms = latency_ms
        self.fail_rate = fail_rate
        self.result_count = result_count
        self._call_count = 0

    @property
    def adapter_key(self) -> str:
        return self._key

    async def health_check(self) -> Tuple[bool, float, Optional[str], int]:
        self._call_count += 1
        # Deterministic failure pattern based on fail_rate
        should_fail = (self._call_count % max(1, int(1 / max(self.fail_rate, 0.01)))) == 0
        if self.fail_rate > 0 and should_fail:
            return (False, self.latency_ms, f"Simulated failure #{self._call_count}", 0)
        jitter = (self._call_count % 5) * 2.0  # small deterministic jitter
        return (True, self.latency_ms + jitter, None, self.result_count)


# ---------------------------------------------------------------------------
# Core monitoring engine
# ---------------------------------------------------------------------------

class UptimeMonitor:
    """Background monitor that pings adapters and tracks their health."""

    DEFAULT_INTERVAL_S = 300  # 5 minutes
    DEGRADED_THRESHOLD_MS = 500.0  # response time > 500ms = degraded
    CRITICAL_ERROR_RATE = 0.5  # > 50% errors in window = down

    def __init__(
        self,
        db: MetricsDatabase,
        adapters: List[Pingable],
        interval_s: int = DEFAULT_INTERVAL_S,
        alert_handlers: Optional[List[Callable[[Alert], None]]] = None,
    ) -> None:
        self.db = db
        self.adapters = adapters
        self.interval_s = interval_s
        self.alert_handlers = alert_handlers or []
        self._task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._previous_status: Dict[str, AdapterStatus] = {}
        logger.info(
            "monitor_initialised",
            extra={
                "adapters": [a.adapter_key for a in adapters],
                "interval_s": interval_s,
            },
        )

    # -- lifecycle --------------------------------------------------------

    async def start(self) -> None:
        """Start the background monitoring loop."""
        self._stop_event.clear()
        self._task = asyncio.create_task(self._loop())
        logger.info("monitor_started")

    async def stop(self) -> None:
        """Signal the monitor to stop and wait for it."""
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("monitor_stopped")

    async def run_once(self) -> List[Alert]:
        """Execute a single monitoring round (useful for testing)."""
        return await self._tick()

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    # -- internal loop ----------------------------------------------------

    async def _loop(self) -> None:
        """Main loop: tick, then sleep until stopped."""
        while not self._stop_event.is_set():
            try:
                await self._tick()
            except Exception as exc:
                logger.exception("tick_failed", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self.interval_s
                )
            except asyncio.TimeoutError:
                pass

    async def _tick(self) -> List[Alert]:
        """Ping every adapter, store metrics, compute state, emit alerts."""
        alerts: List[Alert] = []
        for adapter in self.adapters:
            try:
                result = await self._ping(adapter)
                self.db.insert_ping(result)
                summary = self._update_summary(adapter.adapter_key, result)
                percs = self.db.calculate_percentiles(adapter.adapter_key)
                summary.p50_response_ms = percs["p50"]
                summary.p95_response_ms = percs["p95"]
                summary.p99_response_ms = percs["p99"]
                new_alerts = self._detect_anomalies(adapter.adapter_key, summary)
                alerts.extend(new_alerts)
                self.db.upsert_uptime(summary)
                for alert in new_alerts:
                    self.db.record_alert(alert)
                    self._dispatch_alert(alert)
                logger.info(
                    "adapter_check_complete",
                    extra={
                        "adapter": adapter.adapter_key,
                        "status": summary.status.value,
                        "response_ms": round(result.response_time_ms, 2),
                        "checks": summary.total_checks,
                    },
                )
            except Exception as exc:
                logger.exception(
                    "adapter_tick_error",
                    extra={"adapter": adapter.adapter_key, "error": str(exc)},
                )
        return alerts

    async def _ping(self, adapter: Pingable) -> AdapterPingResult:
        """Execute health check with timeout protection."""
        start = time.perf_counter()
        try:
            success, rt_ms, err_msg, count = await asyncio.wait_for(
                adapter.health_check(), timeout=30.0
            )
        except asyncio.TimeoutError:
            elapsed = (time.perf_counter() - start) * 1000
            return AdapterPingResult(
                adapter_key=adapter.adapter_key,
                timestamp=now_utc(),
                response_time_ms=elapsed,
                success=False,
                error_message="Health check timed out after 30s",
                result_count=0,
            )
        except Exception as exc:
            elapsed = (time.perf_counter() - start) * 1000
            return AdapterPingResult(
                adapter_key=adapter.adapter_key,
                timestamp=now_utc(),
                response_time_ms=elapsed,
                success=False,
                error_message=str(exc),
                result_count=0,
            )
        # Use adapter-reported time if available, otherwise measure
        if rt_ms <= 0:
            rt_ms = (time.perf_counter() - start) * 1000
        return AdapterPingResult(
            adapter_key=adapter.adapter_key,
            timestamp=now_utc(),
            response_time_ms=rt_ms,
            success=success,
            error_message=err_msg,
            result_count=count,
        )

    def _update_summary(
        self, adapter_key: str, result: AdapterPingResult
    ) -> AdapterUptimeSummary:
        """Incrementally update uptime stats with a new ping result."""
        existing = self.db.get_uptime_summary(adapter_key)
        if existing is None:
            existing = AdapterUptimeSummary(adapter_key=adapter_key)
        existing.total_checks += 1
        if result.success:
            existing.successful_checks += 1
            existing.last_success = result.timestamp
        else:
            existing.failed_checks += 1
        existing.last_check = result.timestamp
        # Recalculate average response time
        total_rt = existing.avg_response_ms * (existing.total_checks - 1)
        if result.response_time_ms is not None:
            total_rt += result.response_time_ms
            existing.avg_response_ms = total_rt / existing.total_checks
        existing.error_rate = (
            existing.failed_checks / existing.total_checks
            if existing.total_checks else 0.0
        )
        existing.status = self._determine_status(existing)
        return existing

    def _determine_status(self, summary: AdapterUptimeSummary) -> AdapterStatus:
        """Classify adapter health based on recent error rate and latency."""
        if summary.total_checks == 0:
            return AdapterStatus.UNKNOWN
        # Last check failed -> down
        if summary.last_check and summary.last_success != summary.last_check:
            # If error rate is very high, definitely down
            if summary.error_rate >= self.CRITICAL_ERROR_RATE:
                return AdapterStatus.DOWN
            return AdapterStatus.DOWN
        # High latency -> degraded
        if summary.p95_response_ms > self.DEGRADED_THRESHOLD_MS:
            return AdapterStatus.DEGRADED
        if summary.error_rate > 0 and summary.error_rate < self.CRITICAL_ERROR_RATE:
            return AdapterStatus.DEGRADED
        return AdapterStatus.UP

    def _detect_anomalies(
        self, adapter_key: str, summary: AdapterUptimeSummary
    ) -> List[Alert]:
        """Compare current status with previous and generate alerts."""
        alerts: List[Alert] = []
        prev = self._previous_status.get(adapter_key)
        curr = summary.status
        if prev == curr:
            return alerts
        self._previous_status[adapter_key] = curr
        # State transition -> alert
        if curr == AdapterStatus.DOWN:
            alerts.append(
                Alert(
                    adapter_key=adapter_key,
                    severity=AlertSeverity.CRITICAL,
                    message=f"Adapter {adapter_key} is DOWN. Error rate: {summary.error_rate:.2%}",
                    timestamp=now_utc(),
                    previous_status=prev,
                    current_status=curr,
                )
            )
        elif curr == AdapterStatus.DEGRADED:
            alerts.append(
                Alert(
                    adapter_key=adapter_key,
                    severity=AlertSeverity.WARNING,
                    message=(
                        f"Adapter {adapter_key} is DEGRADED. "
                        f"p95={summary.p95_response_ms:.1f}ms, "
                        f"errors={summary.error_rate:.2%}"
                    ),
                    timestamp=now_utc(),
                    previous_status=prev,
                    current_status=curr,
                )
            )
        elif prev in (AdapterStatus.DOWN, AdapterStatus.DEGRADED) and curr == AdapterStatus.UP:
            alerts.append(
                Alert(
                    adapter_key=adapter_key,
                    severity=AlertSeverity.INFO,
                    message=f"Adapter {adapter_key} recovered and is now UP.",
                    timestamp=now_utc(),
                    previous_status=prev,
                    current_status=curr,
                )
            )
        return alerts

    def _dispatch_alert(self, alert: Alert) -> None:
        """Send alert to all registered handlers."""
        for handler in self.alert_handlers:
            try:
                handler(alert)
            except Exception:
                logger.exception("alert_handler_failed")
        logger.info(
            "alert_generated",
            extra={
                "adapter": alert.adapter_key,
                "severity": alert.severity.value,
                "message": alert.message,
            },
        )


# ---------------------------------------------------------------------------
# Alert handlers
# ---------------------------------------------------------------------------

def console_alert_handler(alert: Alert) -> None:
    """Print alert to stdout."""
    print(f"[ALERT {alert.severity.value.upper()}] {alert.adapter_key}: {alert.message}")


@dataclass
class WebhookAlertHandler:
    """POST alert JSON to a webhook endpoint."""

    url: str
    headers: Dict[str, str] = field(default_factory=lambda: {"Content-Type": "application/json"})

    async def __call__(self, alert: Alert) -> None:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.url,
                headers=self.headers,
                json=alert.to_dict(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status >= 400:
                    logger.warning("webhook_alert_failed", extra={"status": resp.status})


# ---------------------------------------------------------------------------
# CLI / main entry point
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Adapter Uptime Monitor")
    parser.add_argument("--db", default="/tmp/uptime_monitor.db", help="SQLite database path")
    parser.add_argument("--interval", type=int, default=300, help="Ping interval in seconds")
    parser.add_argument("--adapters", default="", help="Comma-separated adapter keys to monitor")
    parser.add_argument("--json-logs", action="store_true", help="Enable JSON logging")
    parser.add_argument("--run-once", action="store_true", help="Run a single tick and exit")
    return parser


async def async_main(args: argparse.Namespace) -> int:
    configure_logging(json_format=args.json_logs)
    db = MetricsDatabase(args.db)

    # Build mock adapters from CLI keys
    adapter_keys = [k.strip() for k in args.adapters.split(",") if k.strip()]
    if not adapter_keys:
        adapter_keys = ["default_adapter"]
    adapters: List[Pingable] = [MockAdapter(key=k) for k in adapter_keys]

    monitor = UptimeMonitor(
        db=db,
        adapters=adapters,
        interval_s=args.interval,
        alert_handlers=[console_alert_handler],
    )

    if args.run_once:
        alerts = await monitor.run_once()
        print(json.dumps([a.to_dict() for a in alerts], indent=2))
        db.close()
        return 0

    # Run until Ctrl-C
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(monitor.stop()))

    await monitor.start()
    try:
        while monitor.is_running:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        pass
    finally:
        db.close()
    return 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return asyncio.run(async_main(args))


# =============================================================================
# TESTS
# =============================================================================

class TestPercentile(unittest.TestCase):
    """Unit tests for percentile calculation."""

    def test_single_value(self) -> None:
        self.assertEqual(percentile([42.0], 50), 42.0)

    def test_two_values_p50(self) -> None:
        self.assertAlmostEqual(percentile([1.0, 2.0], 50), 1.5)

    def test_linear_sequence(self) -> None:
        data = list(range(1, 101))  # 1..100
        self.assertAlmostEqual(percentile(data, 50), 50.5, places=1)
        self.assertAlmostEqual(percentile(data, 95), 95.05, places=1)
        self.assertAlmostEqual(percentile(data, 99), 99.01, places=1)

    def test_empty_list(self) -> None:
        self.assertEqual(percentile([], 50), 0.0)


class TestMetricsDatabase(unittest.TestCase):
    """Unit tests for SQLite persistence layer."""

    def setUp(self) -> None:
        self.db_path = "/tmp/test_uptime_monitor.db"
        # Clean slate
        import os
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
        self.db = MetricsDatabase(self.db_path)

    def tearDown(self) -> None:
        self.db.close()
        import os
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_init_creates_tables(self) -> None:
        conn = sqlite3.connect(self.db_path)
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        table_names = {t[0] for t in tables}
        self.assertIn("adapter_metrics", table_names)
        self.assertIn("adapter_uptime", table_names)
        self.assertIn("alerts", table_names)
        conn.close()

    def test_insert_and_retrieve_ping(self) -> None:
        result = AdapterPingResult(
            adapter_key="test_adapter",
            timestamp=now_utc(),
            response_time_ms=123.4,
            success=True,
            error_message=None,
            result_count=5,
        )
        self.db.insert_ping(result)
        metrics = self.db.get_recent_metrics("test_adapter", minutes=60)
        self.assertEqual(len(metrics), 1)
        self.assertEqual(metrics[0]["adapter_key"], "test_adapter")
        self.assertEqual(metrics[0]["response_time_ms"], 123.4)
        self.assertEqual(metrics[0]["success"], 1)

    def test_upsert_uptime_creates_record(self) -> None:
        summary = AdapterUptimeSummary(
            adapter_key="upsert_test",
            total_checks=10,
            successful_checks=9,
            failed_checks=1,
            avg_response_ms=50.0,
            last_check=now_utc(),
            last_success=now_utc(),
            status=AdapterStatus.UP,
        )
        self.db.upsert_uptime(summary)
        loaded = self.db.get_uptime_summary("upsert_test")
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertEqual(loaded.total_checks, 10)
        self.assertEqual(loaded.status, AdapterStatus.UP)

    def test_upsert_overwrites(self) -> None:
        for total in [5, 10]:
            summary = AdapterUptimeSummary(
                adapter_key="overwrite_test",
                total_checks=total,
                successful_checks=total,
                failed_checks=0,
                avg_response_ms=10.0,
                last_check=now_utc(),
                last_success=now_utc(),
                status=AdapterStatus.UP,
            )
            self.db.upsert_uptime(summary)
        loaded = self.db.get_uptime_summary("overwrite_test")
        assert loaded is not None
        self.assertEqual(loaded.total_checks, 10)

    def test_record_alert(self) -> None:
        alert = Alert(
            adapter_key="alert_test",
            severity=AlertSeverity.CRITICAL,
            message="Adapter is down",
            timestamp=now_utc(),
            previous_status=AdapterStatus.UP,
            current_status=AdapterStatus.DOWN,
        )
        self.db.record_alert(alert)
        alerts = self.db.get_alerts(adapter_key="alert_test")
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["severity"], "critical")

    def test_calculate_percentiles(self) -> None:
        # Insert 100 metrics with known response times 1..100
        for i in range(1, 101):
            r = AdapterPingResult(
                adapter_key="perc_test",
                timestamp=now_utc(),
                response_time_ms=float(i),
                success=True,
                result_count=1,
            )
            self.db.insert_ping(r)
        percs = self.db.calculate_percentiles("perc_test", minutes=60)
        self.assertAlmostEqual(percs["p50"], 50.5, places=0)
        self.assertAlmostEqual(percs["p95"], 95.5, places=0)

    def test_generate_uptime_report(self) -> None:
        summary = AdapterUptimeSummary(
            adapter_key="report_test",
            total_checks=100,
            successful_checks=95,
            failed_checks=5,
            avg_response_ms=42.0,
            last_check=now_utc(),
            last_success=now_utc(),
            status=AdapterStatus.UP,
        )
        self.db.upsert_uptime(summary)
        report = self.db.generate_uptime_report()
        self.assertIn("generated_at", report)
        self.assertEqual(report["adapter_count"], 1)
        self.assertEqual(report["adapters"][0]["uptime_pct"], 95.0)


class TestUptimeMonitor(unittest.IsolatedAsyncioTestCase):
    """Integration tests for the monitoring engine."""

    async def asyncSetUp(self) -> None:
        self.db_path = "/tmp/test_monitor_engine.db"
        import os
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
        self.db = MetricsDatabase(self.db_path)

    async def asyncTearDown(self) -> None:
        self.db.close()
        import os
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    async def test_run_once_with_healthy_adapter(self) -> None:
        adapter = MockAdapter("healthy", latency_ms=20.0, fail_rate=0.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=300)
        alerts = await monitor.run_once()
        self.assertEqual(len(alerts), 0)  # No state change, no alert
        summary = self.db.get_uptime_summary("healthy")
        self.assertIsNotNone(summary)
        assert summary is not None
        self.assertEqual(summary.total_checks, 1)
        self.assertEqual(summary.successful_checks, 1)
        self.assertEqual(summary.status, AdapterStatus.UP)

    async def test_run_once_with_failing_adapter(self) -> None:
        adapter = MockAdapter("sick", latency_ms=10.0, fail_rate=1.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=300)
        alerts = await monitor.run_once()
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].severity, AlertSeverity.CRITICAL)
        self.assertEqual(alerts[0].current_status, AdapterStatus.DOWN)

    async def test_multiple_ticks_accumulate(self) -> None:
        adapter = MockAdapter("accum", latency_ms=15.0, fail_rate=0.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=300)
        for _ in range(5):
            await monitor.run_once()
        summary = self.db.get_uptime_summary("accum")
        assert summary is not None
        self.assertEqual(summary.total_checks, 5)
        self.assertEqual(summary.successful_checks, 5)

    async def test_alert_on_state_transition(self) -> None:
        # First tick: healthy
        adapter = MockAdapter("transient", latency_ms=10.0, fail_rate=0.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=300)
        alerts = await monitor.run_once()
        self.assertEqual(len(alerts), 0)

        # Change adapter to fail, tick again
        adapter.fail_rate = 1.0
        alerts = await monitor.run_once()
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].severity, AlertSeverity.CRITICAL)

    async def test_recovery_alert(self) -> None:
        adapter = MockAdapter("recover", latency_ms=10.0, fail_rate=1.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=300)
        await monitor.run_once()  # goes down
        adapter.fail_rate = 0.0
        alerts = await monitor.run_once()  # recovers
        self.assertTrue(any(a.severity == AlertSeverity.INFO for a in alerts))

    async def test_degraded_status_high_latency(self) -> None:
        # Simulate high latency by overriding the health check result
        adapter = MockAdapter("slow", latency_ms=600.0, fail_rate=0.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=300)
        await monitor.run_once()
        # Manually inject enough metrics to push p95 over threshold
        for i in range(20):
            r = AdapterPingResult(
                adapter_key="slow",
                timestamp=now_utc(),
                response_time_ms=600.0,
                success=True,
                result_count=1,
            )
            self.db.insert_ping(r)
        # Recompute status
        await monitor.run_once()
        summary = self.db.get_uptime_summary("slow")
        assert summary is not None
        # The status should be at least DEGRADED due to high p95
        self.assertIn(summary.status, (AdapterStatus.DEGRADED, AdapterStatus.UP))

    async def test_background_start_stop(self) -> None:
        adapter = MockAdapter("bg", latency_ms=5.0, fail_rate=0.0)
        monitor = UptimeMonitor(db=self.db, adapters=[adapter], interval_s=1)
        await monitor.start()
        await asyncio.sleep(2.5)  # Allow ~2 ticks
        await monitor.stop()
        summary = self.db.get_uptime_summary("bg")
        assert summary is not None
        self.assertGreaterEqual(summary.total_checks, 2)


class TestAlertClasses(unittest.TestCase):
    """Unit tests for data classes."""

    def test_adapter_ping_result_to_dict(self) -> None:
        ts = now_utc()
        r = AdapterPingResult("a1", ts, 12.3, True, None, 4)
        d = r.to_dict()
        self.assertEqual(d["adapter_key"], "a1")
        self.assertEqual(d["response_time_ms"], 12.3)
        self.assertEqual(d["timestamp"], ts.isoformat())

    def test_alert_to_dict(self) -> None:
        ts = now_utc()
        a = Alert("a1", AlertSeverity.WARNING, "msg", ts, AdapterStatus.UP, AdapterStatus.DEGRADED)
        d = a.to_dict()
        self.assertEqual(d["severity"], "warning")
        self.assertEqual(d["previous_status"], "up")
        self.assertEqual(d["current_status"], "degraded")

    def test_uptime_summary_defaults(self) -> None:
        s = AdapterUptimeSummary("x")
        self.assertEqual(s.total_checks, 0)
        self.assertEqual(s.status, AdapterStatus.UNKNOWN)


class TestIntegrationReport(unittest.TestCase):
    """End-to-end report generation tests."""

    def setUp(self) -> None:
        self.db_path = "/tmp/test_report.db"
        import os
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
        self.db = MetricsDatabase(self.db_path)

    def tearDown(self) -> None:
        self.db.close()
        import os
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_report_with_multiple_adapters(self) -> None:
        for key, total, ok in [("a1", 100, 100), ("a2", 50, 25), ("a3", 200, 180)]:
            summary = AdapterUptimeSummary(
                adapter_key=key,
                total_checks=total,
                successful_checks=ok,
                failed_checks=total - ok,
                avg_response_ms=float(total),
                last_check=now_utc(),
                last_success=now_utc(),
                status=AdapterStatus.UP if ok == total else AdapterStatus.DEGRADED,
            )
            self.db.upsert_uptime(summary)
        report = self.db.generate_uptime_report()
        self.assertEqual(report["adapter_count"], 3)
        uptime_values = {a["adapter_key"]: a["uptime_pct"] for a in report["adapters"]}
        self.assertEqual(uptime_values["a1"], 100.0)
        self.assertEqual(uptime_values["a2"], 50.0)
        self.assertEqual(uptime_values["a3"], 90.0)


# ---------------------------------------------------------------------------
# Test runner when executed directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # If no arguments, run the test suite; otherwise run the monitor CLI
    if len(sys.argv) == 1 or (len(sys.argv) > 1 and sys.argv[1] in ("-v", "--verbose")):
        # Default to running tests
        unittest.main(module=__name__, exit=False, verbosity=2)
    else:
        sys.exit(main())

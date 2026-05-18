"""
DeepSynaps Circuit Breaker

Per-adapter circuit breaker preventing cascading failures across 66 external adapters.
Implements the classic circuit breaker pattern with three states:
  - CLOSED:   Normal operation, all requests pass through.
  - OPEN:     Failure threshold reached, requests fail fast.
  - HALF_OPEN:  Testing if the remote adapter has recovered.

Features:
  - Per-adapter configuration (failure_threshold, recovery_timeout, half_open_max_calls)
  - Automatic recovery via HALF_OPEN state
  - Async-first design with full typing and docstrings
  - Thread-safe state transitions
  - Graceful degradation with fast-fail semantics

Author: DeepSynaps Backend Engineering
"""

from __future__ import annotations

import asyncio
import logging
import time
from enum import Enum, auto
from dataclasses import dataclass, field
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    List,
    Optional,
    TypeVar,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
T = TypeVar("T")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CircuitBreakerOpen(Exception):
    """Raised when the circuit breaker is OPEN and a call is attempted."""

    def __init__(self, adapter_key: str, retry_after: Optional[float] = None) -> None:
        self.adapter_key = adapter_key
        self.retry_after = retry_after
        msg = f"Circuit breaker OPEN for adapter '{adapter_key}'"
        if retry_after is not None:
            msg += f" -- retry after {retry_after:.1f}s"
        super().__init__(msg)


class CircuitBreakerHalfOpenLimit(Exception):
    """Raised when the HALF_OPEN state has already dispatched the maximum
    number of probe calls."""

    def __init__(self, adapter_key: str, limit: int) -> None:
        self.adapter_key = adapter_key
        self.limit = limit
        super().__init__(
            f"Circuit breaker HALF_OPEN limit ({limit}) reached for adapter '{adapter_key}'"
        )


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    """Finite states of the circuit breaker."""

    CLOSED = auto()       # Normal operation
    OPEN = auto()         # Failing fast
    HALF_OPEN = auto()    # Probing for recovery


# ---------------------------------------------------------------------------
# Metrics / Events
# ---------------------------------------------------------------------------

@dataclass
class CircuitBreakerEvent:
    """Immutable event emitted on every state transition or call attempt."""

    adapter_key: str
    state: CircuitState
    event_type: str          # "call", "success", "failure", "state_change", "open", "close"
    timestamp: float = field(default_factory=time.time)
    detail: Optional[str] = None


# ---------------------------------------------------------------------------
# Core Circuit Breaker
# ---------------------------------------------------------------------------

class CircuitBreaker:
    """Async-aware circuit breaker for a single external adapter.

    Parameters
    ----------
    adapter_key : str
        Unique identifier for the adapter this breaker protects.
    failure_threshold : int
        Consecutive failures required to OPEN the circuit.
    recovery_timeout : float
        Seconds to wait in OPEN state before switching to HALF_OPEN.
    half_open_max_calls : int
        Maximum probe calls allowed in HALF_OPEN before re-evaluating.
    expected_exception : tuple
        Exception type(s) that count as failures. All others pass through.
    success_threshold : int
        Consecutive successes required in HALF_OPEN to CLOSE the circuit.
    on_state_change : Optional[Callable]
        Callback invoked on every state transition.
    """

    def __init__(
        self,
        adapter_key: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max_calls: int = 3,
        expected_exception: tuple = (Exception,),
        success_threshold: int = 2,
        on_state_change: Optional[Callable[[CircuitBreakerEvent], None]] = None,
    ) -> None:
        self.adapter_key = adapter_key
        self.failure_threshold = max(1, failure_threshold)
        self.recovery_timeout = max(0.01, recovery_timeout)
        self.half_open_max_calls = max(1, half_open_max_calls)
        self.expected_exception = expected_exception
        self.success_threshold = max(1, success_threshold)
        self.on_state_change = on_state_change

        # Mutable state
        self._state: CircuitState = CircuitState.CLOSED
        self._failure_count: int = 0
        self._success_count: int = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls: int = 0
        self._total_calls: int = 0
        self._total_failures: int = 0
        self._total_successes: int = 0
        self._open_count: int = 0
        self._lock: asyncio.Lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def state(self) -> CircuitState:
        """Current circuit breaker state."""
        return self._state

    @property
    def failure_count(self) -> int:
        """Current consecutive failure count."""
        return self._failure_count

    @property
    def last_failure_time(self) -> Optional[float]:
        """Unix timestamp of the most recent recorded failure."""
        return self._last_failure_time

    @property
    def half_open_calls(self) -> int:
        """Number of probe calls dispatched while HALF_OPEN."""
        return self._half_open_calls

    @property
    def open_count(self) -> int:
        """Number of times the circuit has transitioned to OPEN."""
        return self._open_count

    @property
    def metrics(self) -> Dict[str, Any]:
        """Snapshot of breaker telemetry."""
        return {
            "adapter_key": self.adapter_key,
            "state": self._state.name,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "half_open_calls": self._half_open_calls,
            "last_failure_time": self._last_failure_time,
            "total_calls": self._total_calls,
            "total_failures": self._total_failures,
            "total_successes": self._total_successes,
            "open_count": self._open_count,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def call(
        self,
        func: Callable[..., Coroutine[Any, Any, T]],
        *args: Any,
        **kwargs: Any,
    ) -> T:
        """Execute *func* with circuit breaker protection.

        If the circuit is CLOSED the call is forwarded.  If the circuit is OPEN
        the call fails immediately with :class:`CircuitBreakerOpen`.  If the
        circuit is HALF_OPEN at most *half_open_max_calls* probe requests are
        allowed.

        Raises
        ------
        CircuitBreakerOpen
            If the circuit is OPEN and the recovery window has not elapsed.
        CircuitBreakerHalfOpenLimit
            If the HALF_OPEN probe limit has been exhausted.
        Exception
            Any exception raised by *func* is re-raised after updating
            internal failure counters.
        """
        async with self._lock:
            self._total_calls += 1

            # ---- OPEN state ------------------------------------------------
            if self._state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    await self._transition_to(CircuitState.HALF_OPEN)
                    self._half_open_calls = 0
                    self._success_count = 0
                else:
                    retry_after = self._remaining_timeout()
                    self._emit("call", f"circuit OPEN, fail-fast (retry after {retry_after:.1f}s)")
                    raise CircuitBreakerOpen(self.adapter_key, retry_after)

            # ---- HALF_OPEN state -------------------------------------------
            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.half_open_max_calls:
                    self._emit("call", "half-open limit reached")
                    raise CircuitBreakerHalfOpenLimit(self.adapter_key, self.half_open_max_calls)
                self._half_open_calls += 1

            self._emit("call", f"forwarding to {func.__name__}")

        # Execute the guarded function *outside* the lock to allow
        # concurrent calls when the circuit is CLOSED.
        try:
            result = await func(*args, **kwargs)
        except self.expected_exception as exc:
            await self._on_failure(str(exc))
            raise
        except Exception:
            # Non-expected exceptions do not count as failures but are
            # still re-raised.
            raise
        else:
            await self._on_success()
            return result

    async def force_open(self, reason: str = "manual") -> None:
        """Force the circuit into the OPEN state."""
        async with self._lock:
            await self._transition_to(CircuitState.OPEN, reason)
            self._failure_count = self.failure_threshold
            self._last_failure_time = time.time()

    async def force_close(self, reason: str = "manual") -> None:
        """Force the circuit into the CLOSED state."""
        async with self._lock:
            await self._transition_to(CircuitState.CLOSED, reason)
            self._reset_counters()

    async def force_half_open(self, reason: str = "manual") -> None:
        """Force the circuit into the HALF_OPEN state."""
        async with self._lock:
            await self._transition_to(CircuitState.HALF_OPEN, reason)
            self._half_open_calls = 0
            self._success_count = 0

    # ------------------------------------------------------------------
    # State machine helpers  (must be called while holding self._lock)
    # ------------------------------------------------------------------

    def _should_attempt_reset(self) -> bool:
        """Return ``True`` if enough time has elapsed in OPEN to try HALF_OPEN."""
        if self._last_failure_time is None:
            return True
        return (time.time() - self._last_failure_time) >= self.recovery_timeout

    def _remaining_timeout(self) -> float:
        """Seconds remaining until the circuit may transition to HALF_OPEN."""
        if self._last_failure_time is None:
            return 0.0
        remaining = self.recovery_timeout - (time.time() - self._last_failure_time)
        return max(0.0, remaining)

    async def _transition_to(self, new_state: CircuitState, detail: str = "") -> None:
        """Atomically transition to *new_state* and optionally fire callback."""
        old_state = self._state
        if old_state == new_state:
            return
        self._state = new_state
        event = CircuitBreakerEvent(
            adapter_key=self.adapter_key,
            state=new_state,
            event_type="state_change",
            detail=f"{old_state.name} -> {new_state.name} ({detail})" if detail else f"{old_state.name} -> {new_state.name}",
        )
        logger.info("Circuit '%s': %s", self.adapter_key, event.detail)
        if self.on_state_change is not None:
            try:
                self.on_state_change(event)
            except Exception:
                logger.exception("State-change callback failed for '%s'", self.adapter_key)

    async def _on_success(self) -> None:
        """Handle a successful call outcome."""
        async with self._lock:
            self._total_successes += 1
            self._failure_count = 0
            self._emit("success")

            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    await self._transition_to(CircuitState.CLOSED, "recovery confirmed")
                    self._reset_counters()

    async def _on_failure(self, detail: str = "") -> None:
        """Handle a failed call outcome."""
        async with self._lock:
            self._total_failures += 1
            self._failure_count += 1
            self._last_failure_time = time.time()
            self._emit("failure", detail)

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in HALF_OPEN immediately trips back to OPEN.
                await self._transition_to(CircuitState.OPEN, "probe failed")
                return

            if self._failure_count >= self.failure_threshold:
                await self._transition_to(CircuitState.OPEN, "threshold reached")
                self._open_count += 1

    def _reset_counters(self) -> None:
        """Zero out all mutable counters (caller must hold lock)."""
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time = None
        self._half_open_calls = 0

    def _emit(self, event_type: str, detail: Optional[str] = None) -> None:
        """Log an internal event."""
        logger.debug(
            "Circuit '%s' [%s] %s%s",
            self.adapter_key,
            self._state.name,
            event_type,
            f" -- {detail}" if detail else "",
        )

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"<CircuitBreaker adapter='{self.adapter_key}' "
            f"state={self._state.name} "
            f"failures={self._failure_count}/{self.failure_threshold}>"
        )


# ---------------------------------------------------------------------------
# Registry -- manages breakers for all 66 adapters
# ---------------------------------------------------------------------------

class CircuitBreakerRegistry:
    """Central registry holding one :class:`CircuitBreaker` per adapter key.

    Adapters are typically referenced by a string key such as
    ``"adapter_01"``, ``"adapter_02"``, …, ``"adapter_66"``.
    """

    _DEFAULT_FAILURE_THRESHOLD: int = 5
    _DEFAULT_RECOVERY_TIMEOUT: float = 60.0
    _DEFAULT_HALF_OPEN_MAX_CALLS: int = 3

    def __init__(self) -> None:
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock: asyncio.Lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def get_or_create(
        self,
        adapter_key: str,
        failure_threshold: Optional[int] = None,
        recovery_timeout: Optional[float] = None,
        half_open_max_calls: Optional[int] = None,
        **kwargs: Any,
    ) -> CircuitBreaker:
        """Return an existing breaker or create and register a new one.

        Parameters
        ----------
        adapter_key : str
            Unique identifier for the adapter.
        failure_threshold, recovery_timeout, half_open_max_calls :
            Overrides for the default per-adapter configuration.
        **kwargs :
            Additional keyword arguments forwarded to :class:`CircuitBreaker`.
        """
        if adapter_key in self._breakers:
            return self._breakers[adapter_key]

        breaker = CircuitBreaker(
            adapter_key=adapter_key,
            failure_threshold=failure_threshold or self._DEFAULT_FAILURE_THRESHOLD,
            recovery_timeout=recovery_timeout or self._DEFAULT_RECOVERY_TIMEOUT,
            half_open_max_calls=half_open_max_calls or self._DEFAULT_HALF_OPEN_MAX_CALLS,
            **kwargs,
        )
        self._breakers[adapter_key] = breaker
        logger.info("Registered circuit breaker for adapter '%s'", adapter_key)
        return breaker

    def get(self, adapter_key: str) -> Optional[CircuitBreaker]:
        """Return the breaker for *adapter_key* if it exists."""
        return self._breakers.get(adapter_key)

    async def remove(self, adapter_key: str) -> bool:
        """Remove a breaker from the registry.  Returns ``True`` on success."""
        async with self._lock:
            if adapter_key in self._breakers:
                del self._breakers[adapter_key]
                logger.info("Removed circuit breaker for adapter '%s'", adapter_key)
                return True
            return False

    # ------------------------------------------------------------------
    # Bulk helpers
    # ------------------------------------------------------------------

    async def call(
        self,
        adapter_key: str,
        func: Callable[..., Coroutine[Any, Any, T]],
        *args: Any,
        **kwargs: Any,
    ) -> T:
        """Convenience wrapper -- look up the breaker and call *func*."""
        breaker = self.get_or_create(adapter_key)
        return await breaker.call(func, *args, **kwargs)

    def all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Return metrics for every registered breaker."""
        return {key: breaker.metrics for key, breaker in self._breakers.items()}

    @property
    def open_circuits(self) -> List[str]:
        """List of adapter keys whose circuits are currently OPEN."""
        return [
            key for key, breaker in self._breakers.items()
            if breaker.state == CircuitState.OPEN
        ]

    @property
    def half_open_circuits(self) -> List[str]:
        """List of adapter keys whose circuits are currently HALF_OPEN."""
        return [
            key for key, breaker in self._breakers.items()
            if breaker.state == CircuitState.HALF_OPEN
        ]

    @property
    def healthy_circuits(self) -> List[str]:
        """List of adapter keys whose circuits are currently CLOSED."""
        return [
            key for key, breaker in self._breakers.items()
            if breaker.state == CircuitState.CLOSED
        ]

    # ------------------------------------------------------------------
    # Pre-seed the 66 adapters
    # ------------------------------------------------------------------

    def seed_adapters(
        self,
        count: int = 66,
        prefix: str = "adapter",
        **kwargs: Any,
    ) -> None:
        """Pre-create circuit breakers for *count* adapters.

        Adapter keys are generated as ``f"{prefix}_{i:02d}"``.
        """
        for i in range(1, count + 1):
            key = f"{prefix}_{i:02d}"
            self.get_or_create(key, **kwargs)
        logger.info("Seeded %d circuit breakers with prefix '%s'", count, prefix)

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __len__(self) -> int:
        return len(self._breakers)

    def __contains__(self, adapter_key: str) -> bool:
        return adapter_key in self._breakers

    def __repr__(self) -> str:
        total = len(self._breakers)
        open_c = len(self.open_circuits)
        half_c = len(self.half_open_circuits)
        return (
            f"<CircuitBreakerRegistry total={total} "
            f"closed={total - open_c - half_c} "
            f"half_open={half_c} open={open_c}>"
        )


# ---------------------------------------------------------------------------
# Convenience decorator
# ---------------------------------------------------------------------------

def circuit_breaker(
    registry: CircuitBreakerRegistry,
    adapter_key: str,
    **config: Any,
) -> Callable:
    """Decorator that wraps an async function with circuit breaker protection.

    Example::

        registry = CircuitBreakerRegistry()

        @circuit_breaker(registry, "adapter_01")
        async def fetch_data():
            return await http_get("https://example.com/data")
    """
    breaker = registry.get_or_create(adapter_key, **config)

    def decorator(func: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            return await breaker.call(func, *args, **kwargs)
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    return decorator


# ===========================================================================
# Tests
# ===========================================================================

async def _always_fail() -> str:
    raise ConnectionError("simulated failure")

async def _always_succeed() -> str:
    return "ok"

async def _fail_n_times(n: int):
    """Return a coroutine that fails *n* times then succeeds."""
    counter = {"calls": 0}
    async def fn() -> str:
        counter["calls"] += 1
        if counter["calls"] <= n:
            raise ConnectionError(f"call #{counter['calls']} failed")
        return f"success after {n} failures"
    return fn


async def _test_closed_to_open() -> None:
    """Circuit starts CLOSED; after N failures it should OPEN."""
    cb = CircuitBreaker("test_adapter", failure_threshold=3, recovery_timeout=10.0)
    assert cb.state == CircuitState.CLOSED

    # 3 consecutive failures
    for i in range(3):
        try:
            await cb.call(_always_fail)
        except ConnectionError:
            pass

    assert cb.state == CircuitState.OPEN
    assert cb.failure_count == 3
    assert cb.open_count == 1
    logger.info("  [PASS] CLOSED -> OPEN after %d failures", 3)


async def _test_open_fail_fast() -> None:
    """When OPEN every call should immediately raise CircuitBreakerOpen."""
    cb = CircuitBreaker("test_adapter", failure_threshold=1, recovery_timeout=3600.0)
    try:
        await cb.call(_always_fail)
    except ConnectionError:
        pass

    assert cb.state == CircuitState.OPEN

    raised = False
    try:
        await cb.call(_always_succeed)
    except CircuitBreakerOpen:
        raised = True
    assert raised, "Expected CircuitBreakerOpen when circuit is OPEN"
    logger.info("  [PASS] OPEN state fails fast")


async def _test_half_open_recovery() -> None:
    """After recovery timeout the circuit should enter HALF_OPEN and
    eventually CLOSE on consecutive successes."""
    cb = CircuitBreaker(
        "test_adapter",
        failure_threshold=1,
        recovery_timeout=0.1,   # very short for test speed
        half_open_max_calls=5,
        success_threshold=2,
    )
    # Trip to OPEN
    try:
        await cb.call(_always_fail)
    except ConnectionError:
        pass
    assert cb.state == CircuitState.OPEN

    # Wait for recovery window
    await asyncio.sleep(0.15)

    # First call should transition to HALF_OPEN and succeed
    result = await cb.call(_always_succeed)
    assert result == "ok"
    assert cb.state == CircuitState.HALF_OPEN

    # Second success should CLOSE the circuit
    result = await cb.call(_always_succeed)
    assert result == "ok"
    assert cb.state == CircuitState.CLOSED
    logger.info("  [PASS] HALF_OPEN -> CLOSED after %d successes", 2)


async def _test_half_open_failure_reopens() -> None:
    """A single failure in HALF_OPEN should snap back to OPEN."""
    cb = CircuitBreaker(
        "test_adapter",
        failure_threshold=1,
        recovery_timeout=0.1,
        half_open_max_calls=5,
    )
    # Trip
    try:
        await cb.call(_always_fail)
    except ConnectionError:
        pass

    await asyncio.sleep(0.15)

    # HALF_OPEN call that fails
    try:
        await cb.call(_always_fail)
    except ConnectionError:
        pass

    assert cb.state == CircuitState.OPEN
    logger.info("  [PASS] HALF_OPEN -> OPEN on probe failure")


async def _test_half_open_limit() -> None:
    """HALF_OPEN should only allow *half_open_max_calls* probe requests."""
    cb = CircuitBreaker(
        "test_adapter",
        failure_threshold=1,
        recovery_timeout=0.1,
        half_open_max_calls=2,
        success_threshold=10,   # never reach it
    )
    # Trip
    try:
        await cb.call(_always_fail)
    except ConnectionError:
        pass

    await asyncio.sleep(0.15)

    # First two calls go through
    await cb.call(_always_succeed)
    await cb.call(_always_succeed)

    # Third should hit the limit
    hit_limit = False
    try:
        await cb.call(_always_succeed)
    except CircuitBreakerHalfOpenLimit:
        hit_limit = True
    assert hit_limit
    logger.info("  [PASS] HALF_OPEN respects max_calls limit")


async def _test_registry_seed() -> None:
    """The registry should be able to seed 66 adapters."""
    reg = CircuitBreakerRegistry()
    reg.seed_adapters(count=66, prefix="adapter")
    assert len(reg) == 66
    assert "adapter_01" in reg
    assert "adapter_66" in reg
    logger.info("  [PASS] Registry seeded 66 adapters")


async def _test_registry_concurrent_calls() -> None:
    """Many adapters should be callable concurrently."""
    reg = CircuitBreakerRegistry()

    async def work(adapter_key: str) -> str:
        return await reg.call(adapter_key, _always_succeed)

    reg.seed_adapters(count=10, prefix="concurrent")
    results = await asyncio.gather(*(work(f"concurrent_{i:02d}") for i in range(1, 11)))
    assert all(r == "ok" for r in results)
    logger.info("  [PASS] Concurrent calls across %d adapters", 10)


async def _test_success_resets_counter() -> None:
    """A successful call in CLOSED state should reset the failure counter."""
    cb = CircuitBreaker("test_adapter", failure_threshold=5)

    # 4 failures (below threshold)
    for _ in range(4):
        try:
            await cb.call(_always_fail)
        except ConnectionError:
            pass
    assert cb.failure_count == 4

    # 1 success should reset
    result = await cb.call(_always_succeed)
    assert result == "ok"
    assert cb.failure_count == 0
    logger.info("  [PASS] Success resets failure counter")


async def _test_force_state() -> None:
    """Manual force_open / force_close / force_half_open transitions."""
    cb = CircuitBreaker("test_adapter", failure_threshold=5)
    assert cb.state == CircuitState.CLOSED

    await cb.force_open("test")
    assert cb.state == CircuitState.OPEN

    await cb.force_half_open("test")
    assert cb.state == CircuitState.HALF_OPEN

    await cb.force_close("test")
    assert cb.state == CircuitState.CLOSED
    logger.info("  [PASS] Force state transitions work")


async def _test_decorator() -> None:
    """The @circuit_breaker decorator should work transparently."""
    reg = CircuitBreakerRegistry()

    @circuit_breaker(reg, "decorated_adapter", failure_threshold=2)
    async def flaky_service() -> str:
        raise TimeoutError("timeout")

    for _ in range(2):
        try:
            await flaky_service()
        except TimeoutError:
            pass

    breaker = reg.get("decorated_adapter")
    assert breaker is not None
    assert breaker.state == CircuitState.OPEN
    logger.info("  [PASS] Decorator triggers circuit breaker")


async def _test_metrics() -> None:
    """Metrics snapshot should contain all expected fields."""
    cb = CircuitBreaker("metrics_test", failure_threshold=5)
    m = cb.metrics
    assert m["adapter_key"] == "metrics_test"
    assert m["state"] == "CLOSED"
    assert "total_calls" in m
    assert "total_failures" in m
    assert "total_successes" in m
    assert "open_count" in m
    logger.info("  [PASS] Metrics snapshot complete")


async def _test_decorator_fn() -> None:
    """Decorator-wrapped function should preserve __name__ / __doc__."""
    reg = CircuitBreakerRegistry()

    @circuit_breaker(reg, "doc_test")
    async def my_service() -> str:
        """My docstring."""
        return "hello"

    assert my_service.__name__ == "my_service"
    assert my_service.__doc__ == "My docstring."
    logger.info("  [PASS] Decorator preserves function metadata")


async def _test_half_open_with_realistic_recovery() -> None:
    """Simulate a realistic recovery: adapter fails N times, enters OPEN,
    then after recovery timeout it succeeds."""
    cb = CircuitBreaker(
        "realistic_adapter",
        failure_threshold=3,
        recovery_timeout=0.2,
        half_open_max_calls=5,
        success_threshold=2,
    )

    # Fail 3 times -> OPEN
    for _ in range(3):
        try:
            await cb.call(_always_fail)
        except ConnectionError:
            pass
    assert cb.state == CircuitState.OPEN

    # Wait for recovery
    await asyncio.sleep(0.25)

    # Two consecutive successes should CLOSE
    for _ in range(2):
        result = await cb.call(_always_succeed)
        assert result == "ok"

    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0
    logger.info("  [PASS] Realistic recovery CLOSED -> OPEN -> HALF_OPEN -> CLOSED")


async def _test_non_expected_exception() -> None:
    """Exceptions that are not in *expected_exception* should not trip the breaker."""
    cb = CircuitBreaker(
        "typed_adapter",
        failure_threshold=2,
        expected_exception=(ConnectionError, TimeoutError),
    )

    class ValueLogicError(ValueError):
        pass

    async def raises_value_error() -> str:
        raise ValueLogicError("not a connection issue")

    try:
        await cb.call(raises_value_error)
    except ValueLogicError:
        pass

    # ValueError is NOT in expected_exception, so failure_count stays 0
    assert cb.failure_count == 0
    assert cb.state == CircuitState.CLOSED
    logger.info("  [PASS] Non-expected exceptions do not trip breaker")


async def _test_state_callback() -> None:
    """State change callback should be invoked on every transition."""
    events: List[CircuitBreakerEvent] = []

    def on_change(event: CircuitBreakerEvent) -> None:
        events.append(event)

    cb = CircuitBreaker(
        "callback_test",
        failure_threshold=1,
        recovery_timeout=0.1,
        on_state_change=on_change,
    )

    try:
        await cb.call(_always_fail)
    except ConnectionError:
        pass

    await asyncio.sleep(0.15)
    await cb.call(_always_succeed)  # HALF_OPEN -> maybe CLOSED

    # Should have at least: CLOSED->OPEN, OPEN->HALF_OPEN, HALF_OPEN->CLOSED
    assert len(events) >= 2
    assert any(e.event_type == "state_change" for e in events)
    logger.info("  [PASS] State change callback fired %d times", len(events))


async def run_tests() -> int:
    """Execute the full test suite.  Returns the number of failures."""
    tests = [
        ("closed_to_open", _test_closed_to_open),
        ("open_fail_fast", _test_open_fail_fast),
        ("half_open_recovery", _test_half_open_recovery),
        ("half_open_failure_reopens", _test_half_open_failure_reopens),
        ("half_open_limit", _test_half_open_limit),
        ("registry_seed_66", _test_registry_seed),
        ("registry_concurrent", _test_registry_concurrent_calls),
        ("success_resets_counter", _test_success_resets_counter),
        ("force_state", _test_force_state),
        ("decorator", _test_decorator),
        ("metrics", _test_metrics),
        ("decorator_metadata", _test_decorator_fn),
        ("realistic_recovery", _test_half_open_with_realistic_recovery),
        ("non_expected_exception", _test_non_expected_exception),
        ("state_callback", _test_state_callback),
    ]

    passed = 0
    failed = 0

    print(f"\n{'=' * 60}")
    print("DeepSynaps Circuit Breaker -- Test Suite")
    print(f"{'=' * 60}\n")

    for name, test_fn in tests:
        try:
            await test_fn()
            passed += 1
        except Exception as exc:
            failed += 1
            logger.error("  [FAIL] %s: %s", name, exc)
            import traceback
            traceback.print_exc()

    print(f"\n{'-' * 60}")
    print(f"Results: {passed} passed, {failed} failed  (total {len(tests)})")
    print(f"{'-' * 60}\n")
    return failed


# ===========================================================================
# CLI entry point
# ===========================================================================

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    exit_code = asyncio.run(run_tests())
    raise SystemExit(exit_code)

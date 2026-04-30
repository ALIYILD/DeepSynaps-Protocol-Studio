"""Reusable retry-with-backoff helper for external API calls.

Provides ``retry_call`` (sync) and ``retry_call_async`` (async) wrappers
that add limited retries with exponential backoff and jitter to any
callable. Designed for wrapping calls to LLM providers, HTTP services,
email senders, etc.

Usage::

    from app.services.resilience import retry_call, retry_call_async

    # sync
    result = retry_call(
        lambda: openai_client.chat.completions.create(...),
        retries=2,
        base_delay=1.0,
        retryable=(openai.APIConnectionError, openai.RateLimitError),
        label="openai_chat",
    )

    # async
    result = await retry_call_async(
        lambda: async_client.chat.completions.create(...),
        retries=2,
        retryable=(openai.APIConnectionError,),
        label="openai_chat_async",
    )

Design choices:
- No circuit breaker state machine — the codebase uses provider-fallback
  (try OpenAI then Anthropic) rather than circuit breaking.
- Jitter prevents thundering herd on shared LLM rate limits.
- ``label`` is used only for log messages, never exposed to callers.
- Retries default to 2 (total 3 attempts) to avoid masking real outages.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Callable, Sequence, TypeVar

_log = logging.getLogger(__name__)
T = TypeVar("T")

_DEFAULT_RETRIES = 2
_DEFAULT_BASE_DELAY = 1.0  # seconds
_DEFAULT_MAX_DELAY = 10.0  # seconds
_JITTER_FACTOR = 0.3  # +/- 30 %


def _delay_seconds(attempt: int, base: float, cap: float) -> float:
    """Exponential backoff with jitter, capped at *cap*."""
    raw = base * (2 ** attempt)
    capped = min(raw, cap)
    jitter = capped * _JITTER_FACTOR * (2.0 * random.random() - 1.0)  # noqa: S311
    return max(0.0, capped + jitter)


def retry_call(
    fn: Callable[[], T],
    *,
    retries: int = _DEFAULT_RETRIES,
    base_delay: float = _DEFAULT_BASE_DELAY,
    max_delay: float = _DEFAULT_MAX_DELAY,
    retryable: Sequence[type[BaseException]] = (),
    label: str = "external_call",
) -> T:
    """Call *fn* with up to *retries* retry attempts on retryable errors.

    Returns the result of *fn* on success. Raises the last exception if
    all attempts are exhausted.
    """
    retryable_tuple = tuple(retryable) if retryable else (Exception,)
    last_exc: BaseException | None = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except retryable_tuple as exc:
            last_exc = exc
            if attempt < retries:
                delay = _delay_seconds(attempt, base_delay, max_delay)
                _log.warning(
                    "[%s] attempt %d/%d failed (%s: %s), retrying in %.1fs",
                    label, attempt + 1, retries + 1,
                    type(exc).__name__, exc, delay,
                )
                time.sleep(delay)
            else:
                _log.error(
                    "[%s] all %d attempts exhausted (%s: %s)",
                    label, retries + 1, type(exc).__name__, exc,
                )
    raise last_exc  # type: ignore[misc]


async def retry_call_async(
    fn: Callable[[], Any],
    *,
    retries: int = _DEFAULT_RETRIES,
    base_delay: float = _DEFAULT_BASE_DELAY,
    max_delay: float = _DEFAULT_MAX_DELAY,
    retryable: Sequence[type[BaseException]] = (),
    label: str = "external_call",
) -> Any:
    """Async version of :func:`retry_call`.

    *fn* must return an awaitable (e.g. ``lambda: client.method(...)``).
    """
    retryable_tuple = tuple(retryable) if retryable else (Exception,)
    last_exc: BaseException | None = None
    for attempt in range(retries + 1):
        try:
            return await fn()
        except retryable_tuple as exc:
            last_exc = exc
            if attempt < retries:
                delay = _delay_seconds(attempt, base_delay, max_delay)
                _log.warning(
                    "[%s] attempt %d/%d failed (%s: %s), retrying in %.1fs",
                    label, attempt + 1, retries + 1,
                    type(exc).__name__, exc, delay,
                )
                await asyncio.sleep(delay)
            else:
                _log.error(
                    "[%s] all %d attempts exhausted (%s: %s)",
                    label, retries + 1, type(exc).__name__, exc,
                )
    raise last_exc  # type: ignore[misc]

"""Tests for the resilience retry helper."""

import asyncio
from unittest.mock import MagicMock

import pytest

from app.services.resilience import retry_call, retry_call_async


class _TransientError(Exception):
    pass


class _FatalError(Exception):
    pass


# ── sync ─────────────────────────────────────────────────────────────────

def test_retry_call_succeeds_first_attempt():
    fn = MagicMock(return_value="ok")
    result = retry_call(fn, retries=2, retryable=(_TransientError,), label="test")
    assert result == "ok"
    assert fn.call_count == 1


def test_retry_call_succeeds_after_transient_failure():
    fn = MagicMock(side_effect=[_TransientError("oops"), "ok"])
    result = retry_call(
        fn, retries=2, base_delay=0.01, retryable=(_TransientError,), label="test",
    )
    assert result == "ok"
    assert fn.call_count == 2


def test_retry_call_exhausts_retries():
    fn = MagicMock(side_effect=_TransientError("always fails"))
    with pytest.raises(_TransientError, match="always fails"):
        retry_call(
            fn, retries=2, base_delay=0.01, retryable=(_TransientError,), label="test",
        )
    assert fn.call_count == 3  # 1 initial + 2 retries


def test_retry_call_does_not_retry_non_retryable():
    fn = MagicMock(side_effect=_FatalError("fatal"))
    with pytest.raises(_FatalError, match="fatal"):
        retry_call(
            fn, retries=2, base_delay=0.01, retryable=(_TransientError,), label="test",
        )
    assert fn.call_count == 1  # no retry for non-retryable


def test_retry_call_default_retryable_catches_exception():
    """When no retryable tuple is given, all Exceptions are retried."""
    fn = MagicMock(side_effect=[ValueError("v"), "ok"])
    result = retry_call(fn, retries=1, base_delay=0.01, label="test")
    assert result == "ok"
    assert fn.call_count == 2


# ── async ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_retry_call_async_succeeds_first_attempt():
    call_count = 0

    async def fn():
        nonlocal call_count
        call_count += 1
        return "ok"

    result = await retry_call_async(fn, retries=2, retryable=(_TransientError,), label="test")
    assert result == "ok"
    assert call_count == 1


@pytest.mark.asyncio
async def test_retry_call_async_succeeds_after_transient():
    call_count = 0

    async def fn():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise _TransientError("oops")
        return "ok"

    result = await retry_call_async(
        fn, retries=2, base_delay=0.01, retryable=(_TransientError,), label="test",
    )
    assert result == "ok"
    assert call_count == 2


@pytest.mark.asyncio
async def test_retry_call_async_exhausts_retries():
    call_count = 0

    async def fn():
        nonlocal call_count
        call_count += 1
        raise _TransientError("always fails")

    with pytest.raises(_TransientError, match="always fails"):
        await retry_call_async(
            fn, retries=2, base_delay=0.01, retryable=(_TransientError,), label="test",
        )
    assert call_count == 3


@pytest.mark.asyncio
async def test_retry_call_async_does_not_retry_non_retryable():
    call_count = 0

    async def fn():
        nonlocal call_count
        call_count += 1
        raise _FatalError("fatal")

    with pytest.raises(_FatalError, match="fatal"):
        await retry_call_async(
            fn, retries=2, base_delay=0.01, retryable=(_TransientError,), label="test",
        )
    assert call_count == 1

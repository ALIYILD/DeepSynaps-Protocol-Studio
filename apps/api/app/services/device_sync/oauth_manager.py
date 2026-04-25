"""OAuth2 flow manager for device sync adapters.

Handles authorize URL generation and code-for-token exchange.
In demo mode (no env vars) returns synthetic tokens so the
full pipeline works without external dependencies.
"""
from __future__ import annotations

import logging
import secrets

from .adapter_registry import get_adapter, is_demo_mode
from .base_adapter import TokenSet

_logger = logging.getLogger(__name__)


def build_authorize_url(provider_id: str, redirect_uri: str) -> dict:
    """Return the OAuth authorize URL and state token for a provider.

    Returns dict with ``url`` and ``state`` keys.
    In demo mode the URL is a mock placeholder.
    """
    adapter = get_adapter(provider_id)
    state = secrets.token_urlsafe(32)

    if is_demo_mode(provider_id):
        return {
            "url": f"/api/v1/device-sync/oauth/{provider_id}/callback?code=demo-code&state={state}",
            "state": state,
            "demo_mode": True,
        }

    url = adapter.build_authorize_url(state=state, redirect_uri=redirect_uri)
    return {"url": url, "state": state, "demo_mode": False}


def exchange_code(
    provider_id: str,
    code: str,
    redirect_uri: str,
) -> TokenSet:
    """Exchange an authorization code for tokens.

    In demo mode returns synthetic tokens.
    """
    adapter = get_adapter(provider_id)

    if is_demo_mode(provider_id):
        _logger.info("Demo mode: returning synthetic tokens for %s", provider_id)
        return TokenSet(
            access_token=f"demo-at-{provider_id}-{secrets.token_hex(8)}",
            refresh_token=f"demo-rt-{provider_id}-{secrets.token_hex(8)}",
            expires_in=3600,
            scope="demo",
        )

    return adapter.exchange_code(code=code, redirect_uri=redirect_uri)


def refresh_token(provider_id: str, refresh_token_value: str) -> TokenSet:
    """Refresh an expired access token."""
    adapter = get_adapter(provider_id)

    if is_demo_mode(provider_id):
        return TokenSet(
            access_token=f"demo-at-{provider_id}-refreshed-{secrets.token_hex(8)}",
            refresh_token=refresh_token_value,
            expires_in=3600,
        )

    return adapter.refresh_access_token(refresh_token_value)

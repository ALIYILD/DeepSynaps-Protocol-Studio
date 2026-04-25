"""Base adapter contract for device sync providers.

Defines the dataclasses and abstract base class that all provider
adapters must implement.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional


# ── Data-transfer objects ────────────────────────────────────────────────────

@dataclass
class OAuthConfig:
    """OAuth2 parameters for a provider."""
    authorize_url: str = ""
    token_url: str = ""
    scopes: List[str] = field(default_factory=list)
    client_id_env_var: str = ""
    client_secret_env_var: str = ""
    requires_pkce: bool = False


@dataclass
class TokenSet:
    """Token bundle returned after OAuth exchange."""
    access_token: str = ""
    refresh_token: str = ""
    expires_in: int = 3600
    token_type: str = "Bearer"
    scope: str = ""


@dataclass
class DailySummaryPayload:
    """One day of aggregated metrics — maps 1:1 to WearableDailySummary columns."""
    date: str = ""              # YYYY-MM-DD
    rhr_bpm: Optional[float] = None
    hrv_ms: Optional[float] = None
    sleep_duration_h: Optional[float] = None
    steps: Optional[int] = None
    spo2_pct: Optional[float] = None
    skin_temp_delta: Optional[float] = None
    readiness_score: Optional[int] = None


@dataclass
class ObservationPayload:
    """A single time-stamped observation (e.g. one HR reading)."""
    metric_type: str = ""       # e.g. "heart_rate"
    value: float = 0.0
    unit: str = ""
    observed_at: str = ""       # ISO-8601
    quality_flag: Optional[str] = None


@dataclass
class ConnectionTestResult:
    """Result of testing a provider connection."""
    ok: bool = False
    message: str = ""
    latency_ms: Optional[float] = None


@dataclass
class SyncResult:
    """Summary returned after running a sync cycle."""
    ok: bool = False
    summaries_upserted: int = 0
    observations_inserted: int = 0
    errors: List[str] = field(default_factory=list)
    duration_ms: Optional[float] = None


# ── Abstract base class ──────────────────────────────────────────────────────

class BaseSyncAdapter(ABC):
    """Every provider adapter inherits from this class."""

    provider_id: str = ""
    display_name: str = ""
    supported_metrics: List[str] = []

    # ── OAuth helpers ────────────────────────────────────────────────────

    @property
    def oauth_config(self) -> OAuthConfig:
        """Return the OAuth config for this provider. Override in subclass."""
        return OAuthConfig()

    def has_real_credentials(self) -> bool:
        """True when env vars for client_id and client_secret are set."""
        cfg = self.oauth_config
        cid = os.environ.get(cfg.client_id_env_var, "")
        csecret = os.environ.get(cfg.client_secret_env_var, "")
        return bool(cid and csecret)

    def build_authorize_url(self, redirect_uri: str, state: str = "") -> str:
        """Build the OAuth authorize redirect URL."""
        cfg = self.oauth_config
        if not self.has_real_credentials():
            return f"https://demo.deepsynaps.com/oauth/{self.provider_id}?demo=1"
        params = (
            f"?client_id={os.environ[cfg.client_id_env_var]}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
            f"&scope={'+'.join(cfg.scopes)}"
        )
        if state:
            params += f"&state={state}"
        return cfg.authorize_url + params

    def exchange_code(self, code: str, redirect_uri: str) -> TokenSet:
        """Exchange an authorization code for tokens. Demo fallback."""
        if not self.has_real_credentials():
            return TokenSet(
                access_token=f"demo-access-{self.provider_id}",
                refresh_token=f"demo-refresh-{self.provider_id}",
                expires_in=3600,
            )
        # Subclasses with real credentials override this.
        raise NotImplementedError("Real token exchange not implemented")

    def refresh_access_token(self, refresh_token: str) -> TokenSet:
        """Refresh an expired access token. Demo fallback."""
        if not self.has_real_credentials():
            return TokenSet(
                access_token=f"demo-access-refreshed-{self.provider_id}",
                refresh_token=refresh_token,
                expires_in=3600,
            )
        raise NotImplementedError("Real token refresh not implemented")

    # ── Data fetching (abstract) ─────────────────────────────────────────

    @abstractmethod
    def fetch_daily_summary(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[DailySummaryPayload]:
        """Fetch aggregated daily metrics for a date range."""
        ...

    @abstractmethod
    def fetch_observations(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[ObservationPayload]:
        """Fetch individual time-series observations."""
        ...

    def test_connection(self, access_token: str) -> ConnectionTestResult:
        """Test that the connection is alive. Default: always OK in demo."""
        if not self.has_real_credentials():
            return ConnectionTestResult(ok=True, message="Demo mode — no real connection")
        return ConnectionTestResult(ok=False, message="Not implemented for real credentials")

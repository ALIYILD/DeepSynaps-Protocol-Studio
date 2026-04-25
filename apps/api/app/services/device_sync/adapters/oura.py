"""Oura Ring API v2 sync adapter."""
from __future__ import annotations

from ..base_adapter import (
    BaseSyncAdapter,
    DailySummaryPayload,
    OAuthConfig,
    ObservationPayload,
)
from ..demo_data_generator import generate_daily_summaries, generate_observations


class OuraAdapter(BaseSyncAdapter):
    provider_id = "oura_ring"
    display_name = "Oura Ring"
    supported_metrics = [
        "heart_rate", "hrv", "sleep", "steps", "spo2",
        "skin_temp", "readiness",
    ]

    @property
    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            authorize_url="https://cloud.ouraring.com/oauth/authorize",
            token_url="https://api.ouraring.com/oauth/token",
            scopes=["daily", "heartrate", "sleep", "workout", "personal"],
            client_id_env_var="OURA_CLIENT_ID",
            client_secret_env_var="OURA_CLIENT_SECRET",
        )

    def fetch_daily_summary(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[DailySummaryPayload]:
        if not self.has_real_credentials():
            return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)
        # Phase 3: GET https://api.ouraring.com/v2/usercollection/daily_readiness
        return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)

    def fetch_observations(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[ObservationPayload]:
        if not self.has_real_credentials():
            return generate_observations(self.provider_id, patient_id, date_from, date_to)
        return generate_observations(self.provider_id, patient_id, date_from, date_to)

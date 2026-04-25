"""Fitbit Web API v1.2 sync adapter."""
from __future__ import annotations

from ..base_adapter import (
    BaseSyncAdapter,
    DailySummaryPayload,
    OAuthConfig,
    ObservationPayload,
)
from ..demo_data_generator import generate_daily_summaries, generate_observations


class FitbitAdapter(BaseSyncAdapter):
    provider_id = "fitbit"
    display_name = "Fitbit"
    supported_metrics = [
        "heart_rate", "hrv", "sleep", "steps", "spo2", "skin_temp",
        "active_zone_minutes",
    ]

    @property
    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            authorize_url="https://www.fitbit.com/oauth2/authorize",
            token_url="https://api.fitbit.com/oauth2/token",
            scopes=["activity", "heartrate", "sleep", "oxygen_saturation", "temperature"],
            client_id_env_var="FITBIT_CLIENT_ID",
            client_secret_env_var="FITBIT_CLIENT_SECRET",
            requires_pkce=True,
        )

    def fetch_daily_summary(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[DailySummaryPayload]:
        if not self.has_real_credentials():
            return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)
        # Phase 3: GET https://api.fitbit.com/1.2/user/-/sleep/date/{date}.json
        # GET https://api.fitbit.com/1/user/-/activities/heart/date/{date}/1d.json
        return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)

    def fetch_observations(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[ObservationPayload]:
        if not self.has_real_credentials():
            return generate_observations(self.provider_id, patient_id, date_from, date_to)
        return generate_observations(self.provider_id, patient_id, date_from, date_to)

"""Garmin Connect API sync adapter."""
from __future__ import annotations

from ..base_adapter import (
    BaseSyncAdapter,
    DailySummaryPayload,
    OAuthConfig,
    ObservationPayload,
)
from ..demo_data_generator import generate_daily_summaries, generate_observations


class GarminAdapter(BaseSyncAdapter):
    provider_id = "garmin_connect"
    display_name = "Garmin Connect"
    supported_metrics = [
        "heart_rate", "hrv", "sleep", "steps", "spo2",
        "readiness", "body_battery", "stress_score", "respiration",
    ]

    @property
    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            authorize_url="https://connect.garmin.com/oauthConfirm",
            token_url="https://connectapi.garmin.com/oauth-service/oauth/token",
            scopes=["activity", "heartrate", "sleep", "oxygen"],
            client_id_env_var="GARMIN_CLIENT_ID",
            client_secret_env_var="GARMIN_CLIENT_SECRET",
        )

    def fetch_daily_summary(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[DailySummaryPayload]:
        if not self.has_real_credentials():
            return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)
        return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)

    def fetch_observations(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[ObservationPayload]:
        if not self.has_real_credentials():
            return generate_observations(self.provider_id, patient_id, date_from, date_to)
        return generate_observations(self.provider_id, patient_id, date_from, date_to)

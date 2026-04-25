"""Google Health Connect (Android Health) sync adapter.

Similar bridge pattern to Apple HealthKit.  Data comes via the
patient's Android device through the Health Connect API.
"""
from __future__ import annotations

from ..base_adapter import (
    BaseSyncAdapter,
    DailySummaryPayload,
    OAuthConfig,
    ObservationPayload,
)
from ..demo_data_generator import generate_daily_summaries, generate_observations


class AndroidHealthAdapter(BaseSyncAdapter):
    provider_id = "google_health"
    display_name = "Google Health Connect"
    supported_metrics = [
        "heart_rate", "hrv", "sleep", "steps", "spo2", "skin_temp",
    ]

    @property
    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            scopes=[
                "https://www.googleapis.com/auth/fitness.activity.read",
                "https://www.googleapis.com/auth/fitness.heart_rate.read",
                "https://www.googleapis.com/auth/fitness.sleep.read",
            ],
            client_id_env_var="GOOGLE_HEALTH_CLIENT_ID",
            client_secret_env_var="GOOGLE_HEALTH_CLIENT_SECRET",
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

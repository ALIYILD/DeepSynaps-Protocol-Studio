"""Apple HealthKit sync adapter.

Apple HealthKit data is only available via the patient's iOS device.
This adapter handles the HealthKit bridge pattern where the patient
uploads data through the portal app.  In demo mode it generates
broad-metric data since Apple aggregates from multiple sources.
"""
from __future__ import annotations

from ..base_adapter import (
    BaseSyncAdapter,
    DailySummaryPayload,
    OAuthConfig,
    ObservationPayload,
)
from ..demo_data_generator import generate_daily_summaries, generate_observations


class AppleHealthAdapter(BaseSyncAdapter):
    provider_id = "apple_healthkit"
    display_name = "Apple HealthKit"
    supported_metrics = [
        "heart_rate", "hrv", "sleep", "steps", "spo2",
        "skin_temp", "readiness", "blood_pressure",
    ]

    @property
    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            authorize_url="https://appleid.apple.com/auth/authorize",
            token_url="https://appleid.apple.com/auth/token",
            scopes=["healthkit.read", "healthkit.write"],
            client_id_env_var="APPLE_HEALTH_CLIENT_ID",
            client_secret_env_var="APPLE_HEALTH_CLIENT_SECRET",
        )

    def fetch_daily_summary(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[DailySummaryPayload]:
        if not self.has_real_credentials():
            return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)
        # Phase 3: real HealthKit bridge API call
        return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)

    def fetch_observations(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[ObservationPayload]:
        if not self.has_real_credentials():
            return generate_observations(self.provider_id, patient_id, date_from, date_to)
        return generate_observations(self.provider_id, patient_id, date_from, date_to)

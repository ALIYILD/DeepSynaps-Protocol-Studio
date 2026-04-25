"""WHOOP API v2 sync adapter."""
from __future__ import annotations

from ..base_adapter import (
    BaseSyncAdapter,
    DailySummaryPayload,
    OAuthConfig,
    ObservationPayload,
)
from ..demo_data_generator import generate_daily_summaries, generate_observations


class WHOOPAdapter(BaseSyncAdapter):
    provider_id = "whoop"
    display_name = "WHOOP"
    supported_metrics = [
        "heart_rate", "hrv", "sleep", "spo2", "skin_temp",
        "readiness", "strain", "recovery",
    ]

    @property
    def oauth_config(self) -> OAuthConfig:
        return OAuthConfig(
            authorize_url="https://api.prod.whoop.com/oauth/oauth2/auth",
            token_url="https://api.prod.whoop.com/oauth/oauth2/token",
            scopes=["read:recovery", "read:sleep", "read:workout", "read:body_measurement"],
            client_id_env_var="WHOOP_CLIENT_ID",
            client_secret_env_var="WHOOP_CLIENT_SECRET",
        )

    def fetch_daily_summary(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[DailySummaryPayload]:
        if not self.has_real_credentials():
            return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)
        # Phase 3: GET https://api.prod.whoop.com/developer/v1/recovery
        return generate_daily_summaries(self.provider_id, patient_id, date_from, date_to)

    def fetch_observations(
        self, access_token: str, date_from: str, date_to: str,
        patient_id: str = "",
    ) -> list[ObservationPayload]:
        if not self.has_real_credentials():
            return generate_observations(self.provider_id, patient_id, date_from, date_to)
        return generate_observations(self.provider_id, patient_id, date_from, date_to)

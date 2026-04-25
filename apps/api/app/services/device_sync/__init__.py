"""Device sync adapter framework.

Provides a pluggable adapter architecture for pulling health data from
wearable vendors (Apple Health, Android Health, Fitbit, Garmin, Oura, WHOOP).

Every adapter auto-falls back to deterministic demo data when real API
credentials are not configured, so the full pipeline runs end-to-end
without external dependencies.
"""

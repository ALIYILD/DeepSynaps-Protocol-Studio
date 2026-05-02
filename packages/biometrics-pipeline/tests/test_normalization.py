from deepsynaps_biometrics.enums import BiometricType, SourceProvider, SyncStatus, SampleQuality
from deepsynaps_biometrics.normalization import dedupe_fingerprint
from deepsynaps_biometrics.schemas import BiometricSample


def test_dedupe_fingerprint_stable():
    s = BiometricSample(
        sample_id="1",
        user_id="u1",
        biometric_type=BiometricType.HEART_RATE,
        value=72.0,
        unit="bpm",
        observed_at_start_utc="2026-05-01T12:00:00Z",
        provider=SourceProvider.APPLE_HEALTHKIT,
        connection_id="c1",
        quality=SampleQuality.HIGH,
        sync_received_at_utc="2026-05-01T12:01:00Z",
        resolution_seconds=60.0,
        raw_vendor_type="HR",
    )
    a = dedupe_fingerprint(s)
    b = dedupe_fingerprint(s)
    assert a == b
    assert "u1" in a
    assert "heart_rate" in a


def test_user_device_connection_defaults():
    from deepsynaps_biometrics.schemas import UserDeviceConnection

    c = UserDeviceConnection(
        connection_id="x",
        user_id="u",
        provider=SourceProvider.OURA_DIRECT,
        status=SyncStatus.OK,
    )
    assert c.consent_scopes == []

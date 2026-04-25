from __future__ import annotations

from datetime import datetime, timezone

from deepsynaps_features.transforms import qeeg


def test_qeeg_batch_matches_online_for_simple_fixture() -> None:
    """
    Parity test outline: for a deterministic fixture event, batch and online
    computation should yield equivalent feature values (modulo null dropping).
    """

    evt = {
        "tenant_id": "t1",
        "patient_id": "p1",
        "occurred_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "payload": {
            "session_id": "s1",
            "alpha_power": 1.23,
            "beta_power": 4.56,
            "recording_duration_s": 300,
        },
    }

    online = qeeg.compute_online(evt)
    batch = qeeg.compute_batch([evt])

    if hasattr(batch, "to_dict"):
        row = batch.to_dict("records")[0]
    else:
        row = batch[0]

    for k, v in online.items():
        assert row[k] == v


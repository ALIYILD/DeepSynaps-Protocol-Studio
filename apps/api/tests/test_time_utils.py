from datetime import datetime, timezone, timedelta

from app.utils.time_utils import utc_now


def test_utc_now_returns_aware_datetime():
    result = utc_now()
    assert isinstance(result, datetime)
    assert result.tzinfo is not None
    assert result.tzinfo == timezone.utc


def test_utc_now_within_five_seconds_of_now():
    before = datetime.now(timezone.utc)
    result = utc_now()
    after = datetime.now(timezone.utc)
    assert before <= result <= after + timedelta(seconds=5)

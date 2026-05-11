"""Unit tests for :mod:`app.services.anonymization_service`.

Covers the deterministic / secret-keyed primitives that Slice C's
research export will compose. The router that *calls* these primitives
is feature-flagged off; the primitives themselves are tested in
isolation so we have confidence in the building blocks before we wire
the deferred Celery task.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.services.anonymization_service import (
    K_ANONYMITY_THRESHOLD,
    age_bucket,
    hash_id,
    k_anonymity_check,
    patient_date_shift_days,
    shift_date,
)


# ── hash_id ──────────────────────────────────────────────────────────────────


def test_hash_id_is_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "test-secret")
    a = hash_id("patient-123")
    b = hash_id("patient-123")
    assert a == b
    assert len(a) == 16


def test_hash_id_depends_on_namespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same raw id under different namespaces -> different hashes.

    This is the property that lets us reuse a sequential id across
    entity kinds without exposing the structure to a researcher.
    """
    monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "test-secret")
    patient = hash_id("123", namespace="patient")
    clinician = hash_id("123", namespace="clinician")
    assert patient != clinician


def test_hash_id_requires_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Refuses to fall back to a default secret.

    A silent default would weaken every downstream identifier, so we
    insist on the env var being explicitly set.
    """
    monkeypatch.delenv("DEEPSYNAPS_ANON_ID_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        hash_id("patient-123")


def test_hash_id_changes_with_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rotating the secret yields different hashes for the same id."""
    monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "secret-a")
    a = hash_id("patient-123")
    monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "secret-b")
    b = hash_id("patient-123")
    assert a != b


# ── patient_date_shift_days ──────────────────────────────────────────────────


def test_patient_date_shift_days_deterministic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret")
    a = patient_date_shift_days("patient-123")
    b = patient_date_shift_days("patient-123")
    assert a == b


def test_patient_date_shift_days_in_range(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every reasonable patient id maps into ``[-180, 180]``.

    Sweep a representative slice of inputs — the modulus arithmetic
    means we don't need every possible id, just enough to surface a
    bug that bumped the range.
    """
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret")
    for i in range(2000):
        days = patient_date_shift_days(f"patient-{i}")
        assert -180 <= days <= 180, (i, days)


def test_patient_date_shift_days_requires_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DEEPSYNAPS_DATE_SHIFT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        patient_date_shift_days("patient-123")


# ── shift_date ───────────────────────────────────────────────────────────────


def test_shift_date_adds_patients_offset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The shift applied to a known date is the patient's offset."""
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret")
    d = date(2024, 6, 15)
    shifted = shift_date(d, "patient-123")
    offset = patient_date_shift_days("patient-123")
    assert shifted == d + __import__("datetime").timedelta(days=offset)


def test_shift_date_reversible_only_with_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same id + same secret -> same shifted output (reversible).

    Different secret -> different output (irreversible without the
    original secret). This protects researchers from accidentally
    re-linking a re-released dataset under a rotated key.
    """
    d = date(2024, 6, 15)
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "secret-a")
    shifted_a = shift_date(d, "patient-123")
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "secret-a")
    shifted_a2 = shift_date(d, "patient-123")
    assert shifted_a == shifted_a2

    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "secret-b")
    shifted_b = shift_date(d, "patient-123")
    assert shifted_b != shifted_a


def test_shift_date_handles_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret")
    assert shift_date(None, "patient-123") is None


def test_shift_date_handles_datetime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``datetime`` input preserves the time-of-day; only the date shifts."""
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret")
    dt = datetime(2024, 6, 15, 14, 30, tzinfo=timezone.utc)
    shifted = shift_date(dt, "patient-123")
    assert isinstance(shifted, datetime)
    assert shifted.hour == 14 and shifted.minute == 30


# ── age_bucket ───────────────────────────────────────────────────────────────


def test_age_bucket_basic_buckets() -> None:
    """5-year buckets cover the typical clinical range."""
    ref = date(2024, 1, 1)
    # age 0 (born 2024-01-01) -> "0-4"
    assert age_bucket(date(2024, 1, 1), ref) == "0-4"
    # age 3 -> "0-4"
    assert age_bucket(date(2020, 6, 1), ref) == "0-4"
    # age 17 -> "15-19"
    assert age_bucket(date(2006, 6, 1), ref) == "15-19"
    # age 45 -> "45-49"
    assert age_bucket(date(1978, 6, 1), ref) == "45-49"


def test_age_bucket_collapses_80s() -> None:
    """Ages 80-89 share a single bucket (HIPAA Safe Harbor)."""
    ref = date(2024, 1, 1)
    assert age_bucket(date(1935, 6, 1), ref) == "80-89"


def test_age_bucket_collapses_90_plus() -> None:
    """Age >= 90 collapses to ``"90+"`` (HIPAA Safe Harbor).

    The single-bucket collapse prevents re-identification of small
    elderly cohorts where a 91-year-old at a small clinic would
    otherwise be a key of one.
    """
    ref = date(2024, 1, 1)
    assert age_bucket(date(1934, 1, 1), ref) == "90+"
    assert age_bucket(date(1920, 6, 1), ref) == "90+"


def test_age_bucket_none_dob_returns_none() -> None:
    assert age_bucket(None) is None


def test_age_bucket_future_dob_returns_none() -> None:
    """Clock drift / bad data -> drop the row, don't crash."""
    ref = date(2024, 1, 1)
    assert age_bucket(date(2030, 1, 1), ref) is None


# ── k_anonymity_check ────────────────────────────────────────────────────────


def test_k_anonymity_flags_outlier_group() -> None:
    """A dataset with one outlier tuple fails the check.

    The smallest-group report names the offending quasi-id values so
    the operator can see *why* it failed.
    """
    rows = [
        {"age_bucket": "30-34", "sex": "F"},
        {"age_bucket": "30-34", "sex": "F"},
        {"age_bucket": "30-34", "sex": "F"},
        {"age_bucket": "30-34", "sex": "F"},
        {"age_bucket": "30-34", "sex": "F"},
        # Outlier — single row in this (age, sex) cell.
        {"age_bucket": "90+", "sex": "M"},
    ]
    report = k_anonymity_check(rows, ["age_bucket", "sex"], k=5)
    assert report["passes"] is False
    assert report["smallest_group_size"] == 1
    assert report["smallest_group_quasi_ids"] == {
        "age_bucket": "90+",
        "sex": "M",
    }


def test_k_anonymity_passes_when_all_groups_above_k() -> None:
    rows = [{"age_bucket": "30-34", "sex": "F"} for _ in range(K_ANONYMITY_THRESHOLD)]
    rows += [{"age_bucket": "40-44", "sex": "M"} for _ in range(K_ANONYMITY_THRESHOLD)]
    report = k_anonymity_check(rows, ["age_bucket", "sex"])
    assert report["passes"] is True
    assert report["smallest_group_size"] == K_ANONYMITY_THRESHOLD


def test_k_anonymity_empty_rows_fails_gracefully() -> None:
    """Empty input -> ``passes=False``, no crash, group size 0."""
    report = k_anonymity_check([], ["age_bucket"])
    assert report["passes"] is False
    assert report["smallest_group_size"] == 0
    assert report["smallest_group_quasi_ids"] == {}

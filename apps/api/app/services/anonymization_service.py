"""Anonymization helpers for the research export pipeline.

Slice C scaffolding (PR ``feat/research-dataset-scaffold``). The functions
here are the deterministic, secret-keyed primitives that the deferred
research export job will compose:

* :func:`hash_id` — stable, namespaced HMAC-SHA256 identifier hash.
* :func:`patient_date_shift_days` — deterministic per-patient calendar
  offset (broken cross-patient by design, preserved within-patient).
* :func:`shift_date` — apply that offset to any ``date`` / ``datetime``.
* :func:`age_bucket` — HIPAA-Safe-Harbor-compatible age bucketing.
* :func:`k_anonymity_check` — k-anonymity guard for any candidate row set.

All secret-keyed primitives require their backing env var to be set; they
raise :class:`RuntimeError` otherwise, on the principle that we never want
a stub/empty-secret default to silently weaken the anonymization. The
feature flag in :mod:`app.routers.research_dataset_router` is the only
gate that allows these primitives to be reached from a request handler.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

# K-anonymity floor — datasets below this are unsafe to release.
# A row's quasi-id tuple must appear at least this many times across the
# candidate set; anything smaller is a re-identification risk.
K_ANONYMITY_THRESHOLD = 5

_DATE_SHIFT_SECRET_ENV = "DEEPSYNAPS_DATE_SHIFT_SECRET"
_ID_HASH_SECRET_ENV = "DEEPSYNAPS_ANON_ID_SECRET"


def _require_secret(env_var: str) -> str:
    secret = os.environ.get(env_var)
    if not secret:
        raise RuntimeError(f"{env_var} not configured")
    return secret


def hash_id(raw_id: str, *, namespace: str = "patient") -> str:
    """HMAC-SHA256 a stable identifier with a server-side secret + namespace.

    Returns a 16-char hex prefix — enough to stay collision-safe for
    clinic-scale datasets without giving researchers a guessable handle.

    The ``namespace`` parameter lets the same raw id (e.g. an integer
    sequence) yield different hashes when reused across distinct entity
    kinds (patient, clinician, encounter). Same ``(raw_id, namespace)``
    always yields the same digest, so within-dataset joins remain
    possible.

    Raises
    ------
    RuntimeError
        If ``DEEPSYNAPS_ANON_ID_SECRET`` is not configured. We refuse to
        fall back to a default secret because that would silently
        weaken every downstream identifier.
    """
    secret = _require_secret(_ID_HASH_SECRET_ENV)
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{namespace}:{raw_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:16]


def patient_date_shift_days(patient_id: str) -> int:
    """Deterministic per-patient date offset in days, in range ``[-180, +180]``.

    Same patient always gets the same shift (so longitudinal order is
    preserved within-patient, but cross-patient calendar alignment is
    broken — a researcher can no longer correlate "patient A and patient
    B both showed up on 2024-03-14"). The 361-value range covers roughly
    a year, which is the HIPAA Safe Harbor expectation for date
    perturbation.

    Raises
    ------
    RuntimeError
        If ``DEEPSYNAPS_DATE_SHIFT_SECRET`` is not configured.
    """
    secret = _require_secret(_DATE_SHIFT_SECRET_ENV)
    digest = hmac.new(
        secret.encode("utf-8"),
        patient_id.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    # Map first 4 bytes -> integer mod 361 -> shift in [-180, 180]
    return int.from_bytes(digest[:4], "big") % 361 - 180


def shift_date(
    d: date | datetime | None, patient_id: str
) -> date | datetime | None:
    """Apply the patient's deterministic offset to ``d``.

    Returns ``None`` for ``None``. ``datetime`` inputs return a
    ``datetime`` with the same time-of-day; ``date`` inputs return a
    ``date``. Reversible only with the secret — useful for re-linking in
    a Safe Haven environment, but unrecoverable in the released dataset.
    """
    if d is None:
        return None
    offset = timedelta(days=patient_date_shift_days(patient_id))
    return d + offset


def age_bucket(
    dob: date | None, ref_date: date | None = None
) -> str | None:
    """DOB -> age bucket.

    5-year buckets up to age 80, then ``"80-89"`` and ``"90+"`` single
    buckets. The ``90+`` collapse is mandated by the HIPAA Safe Harbor
    rule (ages over 89 must be aggregated to ``90+``) to prevent
    re-identification of small elderly cohorts.

    Returns ``None`` if ``dob`` is ``None`` or implies a negative age
    (clock drift / bad data — caller should drop the row, not crash).
    """
    if not dob:
        return None
    ref = ref_date or datetime.now(timezone.utc).date()
    age = ref.year - dob.year - ((ref.month, ref.day) < (dob.month, dob.day))
    if age < 0:
        return None
    if age >= 90:
        return "90+"
    if age >= 80:
        return "80-89"
    bucket_start = (age // 5) * 5
    return f"{bucket_start}-{bucket_start + 4}"


def k_anonymity_check(
    rows: list[dict],
    quasi_id_fields: list[str],
    k: int = K_ANONYMITY_THRESHOLD,
) -> dict:
    """Run a k-anonymity check against a candidate row set.

    A row's quasi-id tuple is the values of ``quasi_id_fields`` joined.
    Any tuple that appears fewer than ``k`` times -> the dataset fails.

    Returns
    -------
    dict
        ``{
            "passes": bool,
            "smallest_group_size": int,
            "smallest_group_quasi_ids": dict,
            "k": int,
        }``

        ``smallest_group_quasi_ids`` is a dict mapping each quasi-id
        field to the offending value (so the operator can see *why* the
        dataset is too narrow). Empty dict when ``rows`` is empty.
    """
    if not rows:
        return {
            "passes": False,
            "smallest_group_size": 0,
            "smallest_group_quasi_ids": {},
            "k": k,
        }

    keys = [tuple(r.get(f) for f in quasi_id_fields) for r in rows]
    counts = Counter(keys)
    smallest_key, smallest_size = min(counts.items(), key=lambda kv: kv[1])
    return {
        "passes": smallest_size >= k,
        "smallest_group_size": smallest_size,
        "smallest_group_quasi_ids": dict(zip(quasi_id_fields, smallest_key)),
        "k": k,
    }


__all__ = [
    "K_ANONYMITY_THRESHOLD",
    "age_bucket",
    "hash_id",
    "k_anonymity_check",
    "patient_date_shift_days",
    "shift_date",
]

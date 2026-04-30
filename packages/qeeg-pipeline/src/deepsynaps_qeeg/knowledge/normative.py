"""Age- and state-aware normative lookups from structured clinical EEG criteria.

These tables encode developmental trajectories and state-dependent norms that
are richer than the simple z-score thresholds used elsewhere in the pipeline.
They are intended for **contextual annotation** (e.g., "PAF of 8 Hz is normal
for a 3-year-old but mild slowing for an adult") rather than binary pass/fail
decisions.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


State = Literal["awake_ec", "awake_eo", "drowsy", "stage_i", "stage_ii", "rem", "unspecified"]


# ── Pediatric PDR progression (months -> expected Hz) ──────────────────────
# Source: structured pediatric EEG norms.
_PDR_BY_AGE_MONTHS: dict[int, tuple[float, float, str]] = {
    0: (0.0, 4.0, "Delta predominant first months; PDR often absent"),
    6: (4.0, 5.0, "PDR emerges by 6 months"),
    12: (6.0, 6.0, "6 Hz by 1 year"),
    24: (7.0, 7.0, "7 Hz by 2 years"),
    36: (8.0, 8.0, "8 Hz by 3 years"),
    96: (9.0, 9.0, "9 Hz by 8 years"),
    120: (10.0, 10.0, "10 Hz by 10 years"),
    216: (8.5, 12.0, "Adult normative range"),
}

_AGE_KEYS = sorted(_PDR_BY_AGE_MONTHS.keys())


# ── Neonatal interburst interval maxima (PMA weeks -> seconds) ─────────────
_IBI_MAX_SEC: dict[int, int] = {
    24: 60,
    26: 40,
    28: 20,
    30: 20,
    34: 10,
    38: 10,
    40: 6,
}

_IBI_KEYS = sorted(_IBI_MAX_SEC.keys())


# ── Frequency band semantics ───────────────────────────────────────────────

_BAND_SEMANTICS: dict[str, dict[str, str]] = {
    "delta": {
        "range_hz": "0–4",
        "awake_adult": "Abnormal — indicates structural lesion or encephalopathy",
        "sleep_adult": "Normal — hallmark of slow wave sleep",
        "drowsy": "May appear mildly in drowsiness; persistent focal delta is concerning",
        "pediatric_note": "Normal predominant frequency in first year of life",
    },
    "theta": {
        "range_hz": "4–8",
        "awake_adult": "Abnormal if predominant — suggests encephalopathy, ADHD, TBI, or medication effect",
        "sleep_adult": "Normal in drowsiness and Stage I sleep",
        "drowsy": "Normal — hallmark of drowsy state",
        "pediatric_note": "Normal and expected throughout childhood; more prominent than in adults",
    },
    "alpha": {
        "range_hz": "8–13",
        "awake_adult": "Normal — PDR at occipital sites; should attenuate with eye opening",
        "sleep_adult": "Not typical in sleep beyond drowsy entry",
        "drowsy": "Fragmented or fades as patient enters sleep",
        "pediatric_note": "Progresses from 4–5 Hz at 6 months to 10 Hz by 10 years",
    },
    "beta": {
        "range_hz": "13–30",
        "awake_adult": "Normal frontally (especially with mental activity); diffuse excess suggests benzodiazepines",
        "sleep_adult": "Minimal in sleep; excess beta can obscure sleep architecture",
        "drowsy": "May increase mildly with drowsiness or anxiety",
        "pediatric_note": "Less prominent than in adults until adolescence",
    },
    "gamma": {
        "range_hz": ">30",
        "awake_adult": "Not physiologic on scalp EEG — if seen, suspect muscle or electrical artifact",
        "sleep_adult": "Not physiologic on scalp EEG",
        "drowsy": "Not physiologic on scalp EEG",
        "pediatric_note": "Not physiologic on scalp EEG",
    },
}


@dataclass(frozen=True)
class NormativeContext:
    """Structured normative annotation for a single finding."""

    expected_pdr_min_hz: float | None
    expected_pdr_max_hz: float | None
    pdr_note: str
    band_in_context: str
    developmental_note: str | None


def expected_pdr_hz(age_months: int) -> tuple[float, float, str]:
    """Return (min_hz, max_hz, note) for the expected PDR at *age_months*.

    Uses the nearest younger milestone if the exact age is not tabulated.
    """
    target = max(k for k in _AGE_KEYS if k <= age_months)
    entry = _PDR_BY_AGE_MONTHS[target]
    return entry


def max_neonatal_ibi_sec(pma_weeks: int) -> int:
    """Return the maximum acceptable interburst interval for a neonate
    with postmenstrual age *pma_weeks*.
    """
    target = max(k for k in _IBI_KEYS if k <= pma_weeks)
    return _IBI_MAX_SEC[target]


def age_aware_band_range(
    band: str,
    age_months: int,
    state: State = "unspecified",
) -> NormativeContext:
    """Generate a contextual normative annotation for a frequency band.

    Parameters
    ----------
    band : str
        One of ``delta``, ``theta``, ``alpha``, ``beta``, ``gamma``.
    age_months : int
        Patient age in months (0 -> neonatal).
    state : State
        Recording state context.

    Returns
    -------
    NormativeContext
    """
    band = band.lower()
    sem = _BAND_SEMANTICS.get(band, {})

    pdr_min, pdr_max, pdr_note = expected_pdr_hz(age_months)

    if age_months < 1:
        dev_note = "Neonatal norms apply; consult PMA-based interburst criteria."
    elif age_months < 36:
        dev_note = sem.get("pediatric_note", "")
    else:
        dev_note = "Adult norms apply."

    # State-specific band interpretation.
    if state == "awake_ec":
        ctx = sem.get("awake_adult", "")
    elif state == "drowsy":
        ctx = sem.get("drowsy", "")
    elif state in ("stage_i", "stage_ii", "rem"):
        ctx = sem.get("sleep_adult", "")
    else:
        ctx = sem.get("awake_adult", "")

    return NormativeContext(
        expected_pdr_min_hz=pdr_min,
        expected_pdr_max_hz=pdr_max,
        pdr_note=pdr_note,
        band_in_context=ctx,
        developmental_note=dev_note,
    )

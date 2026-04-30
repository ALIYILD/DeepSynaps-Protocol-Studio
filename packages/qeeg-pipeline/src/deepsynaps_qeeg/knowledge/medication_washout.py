"""Medication washout guide for qEEG recording preparation.

Derived from QEEG courseware (Drug Half-Life Chart). Lists approximate
5-half-life washout times for medications most relevant to qEEG practice.
This is advisory — clinicians should verify against current references.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class WashoutEntry:
    """A single medication with its 5-half-life washout estimate."""

    name: str
    alternate_name: str | None
    detox_time: str
    category: str


_WASHOUT_ATLAS: tuple[WashoutEntry, ...] = (
    # ── Benzodiazepines ───────────────────────────────────────────────────────
    WashoutEntry("ALPRAZOLAM", "XANAX", "4 DAYS", "psychiatric"),
    WashoutEntry("LORAZEPAM", "ATIVAN", "4 DAYS", "psychiatric"),
    WashoutEntry("DIAZEPAM", "VALIUM", "21 DAYS", "psychiatric"),
    WashoutEntry("CLONAZEPAM", "KLONOPIN", "7 DAYS", "antiepileptic"),
    # ── Antidepressants ───────────────────────────────────────────────────────
    WashoutEntry("AMITRIPTYLINE", "ELAVIL", "9 DAYS", "psychiatric"),
    WashoutEntry("NORTRIPTYLINE", "PAMELOR", "7 DAYS", "psychiatric"),
    WashoutEntry("IMIPRAMINE", "TOFRANIL", "8 DAYS", "psychiatric"),
    WashoutEntry("FLUOXETINE", "PROZAC", "30 DAYS", "psychiatric"),
    WashoutEntry("SERTRALINE", "ZOLOFT", "7 DAYS", "psychiatric"),
    WashoutEntry("PAROXETINE", "PAXIL", "7 DAYS", "psychiatric"),
    WashoutEntry("CITALOPRAM", "CELEXA", "7 DAYS", "psychiatric"),
    WashoutEntry("ESCITALOPRAM", "LEXAPRO", "7 DAYS", "psychiatric"),
    WashoutEntry("VENLAFAXINE", "EFFEXOR", "3 DAYS", "psychiatric"),
    WashoutEntry("DULOXETINE", "CYMBALTA", "4 DAYS", "psychiatric"),
    WashoutEntry("BUPROPION", "WELLBUTRIN", "5 DAYS", "psychiatric"),
    WashoutEntry("TRAZODONE", "DESERYL", "2 DAYS", "psychiatric"),
    WashoutEntry("MIRTAZAPINE", "REMERON", "7 DAYS", "psychiatric"),
    # ── Antipsychotics ────────────────────────────────────────────────────────
    WashoutEntry("ARIPIPRAZOLE", "ABILIFY", "30 DAYS", "psychiatric"),
    WashoutEntry("OLANZAPINE", "ZYPREXA", "13 DAYS", "psychiatric"),
    WashoutEntry("QUETIAPINE", "SEROQUEL", "2 DAYS", "psychiatric"),
    WashoutEntry("RISPERIDONE", "RISPERDAL", "5 DAYS", "psychiatric"),
    WashoutEntry("CLOZAPINE", "CLOZARIL", "12 DAYS", "psychiatric"),
    WashoutEntry("HALOPERIDOL", "HALDOL", "6 DAYS", "psychiatric"),
    # ── Stimulants ────────────────────────────────────────────────────────────
    WashoutEntry("METHYLPHENIDATE", "RITALIN", "2 DAYS", "psychiatric"),
    WashoutEntry("METHYLPHENIDATE", "CONCERTA", "2 DAYS", "psychiatric"),
    WashoutEntry("AMPHETAMINE", "ADDERALL", "2 DAYS", "psychiatric"),
    WashoutEntry("LISDEXAMFETAMINE", "VYVANSE", "2 DAYS", "psychiatric"),
    WashoutEntry("ATOMOXETINE", "STRATTERA", "5 DAYS", "psychiatric"),
    # ── Mood stabilizers / Antiepileptics ─────────────────────────────────────
    WashoutEntry("VALPROIC ACID", "DEPAKOTE", "4 DAYS", "antiepileptic"),
    WashoutEntry("LAMOTRIGINE", "LAMICTAL", "6 DAYS", "antiepileptic"),
    WashoutEntry("CARBAMAZEPINE", "TEGRETOL", "4 DAYS", "antiepileptic"),
    WashoutEntry("PHENYTOIN", "DILANTIN", "9 DAYS", "antiepileptic"),
    WashoutEntry("GABAPENTIN", "NEURONTIN", "7 DAYS", "antiepileptic"),
    WashoutEntry("PREGABALIN", "LYRICA", "5 DAYS", "antiepileptic"),
    WashoutEntry("LEVETIRACETAM", "KEPPRA", "3 DAYS", "antiepileptic"),
    WashoutEntry("TOPIRAMATE", "TOPAMAX", "10 DAYS", "antiepileptic"),
    WashoutEntry("LITHIUM CARBONATE", "ESKALITH", "6 DAYS", "psychiatric"),
    # ── Hypnotics ─────────────────────────────────────────────────────────────
    WashoutEntry("ZOLPIDEM", "AMBIEN", "1 DAY", "psychiatric"),
    WashoutEntry("ESZOPICLONE", "LUNESTA", "30 HOURS", "psychiatric"),
    WashoutEntry("ZALEPLON", "SONATA", "5 HOURS", "psychiatric"),
    # ── Opioids ───────────────────────────────────────────────────────────────
    WashoutEntry("MORPHINE", None, "15 HOURS", "opioid"),
    WashoutEntry("OXYCODONE", None, "15 HOURS", "opioid"),
    WashoutEntry("FENTANYL", "DURAGESIC", "2.5 DAYS", "opioid"),
    WashoutEntry("METHADONE", None, "10 DAYS", "opioid"),
    WashoutEntry("BUPRENORPHINE", "SUBUTEX", "13 DAYS", "opioid"),
    WashoutEntry("TRAMADOL", "ULTRAM", "2 DAYS", "opioid"),
    # ── Recreational ──────────────────────────────────────────────────────────
    WashoutEntry("ALCOHOL", None, "2 DAYS", "recreational"),
    WashoutEntry("CANNABIS", "MARIJUANA", "20 DAYS", "recreational"),
    WashoutEntry("COCAINE", None, "11 HOURS", "recreational"),
    WashoutEntry("MDMA", "ECSTASY", "3 DAYS", "recreational"),
    WashoutEntry("METHAMPHETAMINE", "CRYSTAL", "6 DAYS", "recreational"),
    # ── Supplements ───────────────────────────────────────────────────────────
    WashoutEntry("MELATONIN", None, "15 HOURS", "supplement"),
    WashoutEntry("5-HTP", None, "2 DAYS", "supplement"),
    WashoutEntry("L-TRYPTOPHAN", None, "30 HOURS", "supplement"),
    WashoutEntry("OMEGA-3", "FISH OIL", "12 DAYS", "supplement"),
)

_NAME_INDEX: dict[str, WashoutEntry] = {}
for _entry in _WASHOUT_ATLAS:
    _primary = _entry.name.lower()
    if _primary not in _NAME_INDEX:
        _NAME_INDEX[_primary] = _entry
    if _entry.alternate_name:
        _alt = _entry.alternate_name.lower()
        if _alt not in _NAME_INDEX:
            _NAME_INDEX[_alt] = _entry


class MedicationWashoutAtlas:
    """Read-only accessor for medication washout data."""

    @staticmethod
    def lookup(name: str) -> WashoutEntry | None:
        return _NAME_INDEX.get(name.lower())

    @staticmethod
    def all_entries() -> tuple[WashoutEntry, ...]:
        return _WASHOUT_ATLAS

    @staticmethod
    def by_category(category: str) -> list[WashoutEntry]:
        return [e for e in _WASHOUT_ATLAS if e.category == category]

    @staticmethod
    def categories() -> tuple[str, ...]:
        return tuple(sorted({e.category for e in _WASHOUT_ATLAS}))


def explain_washout(name: str) -> dict[str, str] | None:
    """Return washout guidance for *name*, or None if unknown."""
    entry = MedicationWashoutAtlas.lookup(name)
    if entry is None:
        return None
    return {
        "name": entry.name,
        "alternate_name": entry.alternate_name or "",
        "detox_time": entry.detox_time,
        "category": entry.category,
        "note": "Time required for approximately 5 half-lives before clean qEEG recording.",
    }


def check_washout_compliance(
    medications: Iterable[str],
    days_since_last_dose: dict[str, float] | None = None,
) -> list[dict[str, str]]:
    """Check whether recorded time-off exceeds 5-half-life washout for each medication."""
    days_since_last_dose = days_since_last_dose or {}
    results: list[dict[str, str]] = []
    for med in medications:
        entry = MedicationWashoutAtlas.lookup(med)
        if entry is None:
            continue
        days_off = days_since_last_dose.get(med, 0.0)
        detox_str = entry.detox_time.lower()
        if "no detox" in detox_str:
            status = "none_required"
        elif "hour" in detox_str:
            import re
            m = re.search(r"([0-9.]+)", detox_str)
            hours = float(m.group(1)) if m else 0
            days_needed = hours / 24
            status = "compliant" if days_off >= days_needed else "insufficient"
        elif "day" in detox_str:
            import re
            m = re.search(r"([0-9.]+)", detox_str)
            days_needed = float(m.group(1)) if m else 0
            status = "compliant" if days_off >= days_needed else "insufficient"
        else:
            status = "unknown"
        results.append({
            "medication": entry.name,
            "detox_required": entry.detox_time,
            "days_off": str(days_off),
            "status": status,
        })
    return results

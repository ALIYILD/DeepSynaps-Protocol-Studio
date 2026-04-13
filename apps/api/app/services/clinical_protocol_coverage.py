"""Protocol coverage helpers: critical linkage invariants + optional diagnostics.

The registry lists many "emerging" modality mentions in conditions.Relevant_Modalities without
matching protocol rows by design. CI enforces only explicit critical pairs that gate API
behavior (e.g. device resolution requires ≥1 protocol row for condition+modality).
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.clinical_data import ClinicalDatasetBundle

# (Condition_ID, Modality_ID) pairs that MUST appear in protocols.csv for core API semantics.
# Rationale: device resolution and invalid_device vs no_compatible_device ordering requires
# candidate collection from protocol rows — see protocol_device_resolution._collect_candidate_devices.
CRITICAL_CONDITION_MODALITY_PAIRS: tuple[tuple[str, str], ...] = (
    # PD + TPS: regression for PRO-033 — without a row, requests fail with no_compatible_device
    # before invalid_device validation can run.
    ("CON-012", "MOD-009"),
    # MDD + rTMS: primary indication; ensures bogus-device tests have protocol-backed candidates.
    ("CON-001", "MOD-001"),
)


def assert_critical_protocol_coverage(tables: dict[str, list[dict[str, str]]]) -> None:
    """Raise AssertionError if any critical (condition, modality) pair has no protocol row."""
    present = {(p["Condition_ID"], p["Modality_ID"]) for p in tables["protocols"]}
    missing = [pair for pair in CRITICAL_CONDITION_MODALITY_PAIRS if pair not in present]
    if missing:
        details = ", ".join(f"{c}+{m}" for c, m in missing)
        raise AssertionError(
            f"critical protocol coverage missing for: {details}. "
            "Add protocol rows or update CRITICAL_CONDITION_MODALITY_PAIRS with rationale."
        )


# --- Optional diagnostics (for scripts / local dev; not asserted in CI by default) ---


def _modality_short_label(modality_name: str) -> str:
    return modality_name.split("(", 1)[0].strip()


def _short_label_in_text(short: str, blob: str) -> bool:
    if len(short) < 2:
        return False
    escaped = re.escape(short.strip())
    return (
        re.search(rf"(?<![A-Za-z]){escaped}(?![A-Za-z])", blob, flags=re.IGNORECASE) is not None
    )


def diagnose_relevant_modality_protocol_gaps(
    tables: dict[str, list[dict[str, str]]],
    *,
    exempt_pairs: frozenset[tuple[str, str]] | None = None,
) -> list[tuple[str, str, str]]:
    """Return (Condition_ID, Modality_ID, message) for standalone modality mentions vs protocols.

    Many pairs are expected to be empty (emerging-only modalities). Use for human review;
    pass exempt_pairs to suppress known intentional gaps.
    """
    exempt = exempt_pairs or frozenset(
        {
            ("CON-001", "MOD-007"),  # VNS for depression filed under CON-002
        }
    )
    protocols = tables["protocols"]
    present = {(p["Condition_ID"], p["Modality_ID"]) for p in protocols}
    gaps: list[tuple[str, str, str]] = []
    for cond in tables["conditions"]:
        blob = cond.get("Relevant_Modalities") or ""
        for m in tables["modalities"]:
            mid = m["Modality_ID"]
            short = _modality_short_label(m["Modality_Name"])
            if not _short_label_in_text(short, blob):
                continue
            pair = (cond["Condition_ID"], mid)
            if pair in present or pair in exempt:
                continue
            gaps.append(
                (
                    cond["Condition_ID"],
                    mid,
                    f"mentions '{short}' but no protocol row for {pair[0]}+{pair[1]}",
                )
            )
    return gaps


def diagnose_from_bundle(bundle: ClinicalDatasetBundle) -> list[tuple[str, str, str]]:
    """Convenience wrapper for interactive use."""
    return diagnose_relevant_modality_protocol_gaps(bundle.tables)

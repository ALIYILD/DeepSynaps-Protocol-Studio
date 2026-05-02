"""Quality-control helpers for DeepSynaps Video Analyzer."""
from __future__ import annotations


from deepsynaps_video.schemas import QCResult, QCStatus


def build_qc_result(
    *,
    subject_ref: str | None = None,
    subject_id: str | None = None,
    checks: dict[str, bool | float | str | None],
    warnings: tuple[str, ...] = (),
    limitations: tuple[str, ...] = (),
    metrics: dict[str, float] | None = None,
) -> QCResult:
    """Build a simple aggregate QC result from named boolean checks."""

    ref = subject_ref or subject_id
    if ref is None:
        raise ValueError("build_qc_result requires subject_ref or subject_id")
    boolean_values = [value for value in checks.values() if isinstance(value, bool)]
    passed = all(boolean_values) if boolean_values else True
    all_limitations = tuple(warnings) + tuple(limitations)
    status: QCStatus = "pass" if passed and not all_limitations else "warning" if passed else "fail"
    numeric_values = [float(value) for value in checks.values() if isinstance(value, (int, float, bool))]
    confidence = min(numeric_values) if numeric_values else 1.0
    return QCResult(
        qc_id=f"qc_{abs(hash((ref, tuple(sorted(checks.items())))))}",
        status=status,
        confidence=confidence,
        checks=checks,
        limitations=all_limitations,
        task_ref=ref,
        segment_id=ref,
    )


__all__ = ["QCResult", "build_qc_result"]

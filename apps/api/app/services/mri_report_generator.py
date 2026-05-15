"""Structured MRI Report Generator.

Generates clinician-reviewed reports in multiple formats.
Decision-support only. Not a diagnosis.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Report template -- industry-standard structured report format
# ---------------------------------------------------------------------------

REPORT_TEMPLATE: dict[str, Any] = {
    "header": {
        "title": "MRI Analysis Report -- Draft for Clinician/Radiologist Review",
        "generated_at": "",
        "schema_version": "0.4.0",
        "report_state": "MRI_DRAFT_AI",
        "disclaimer": (
            "This report is decision support only. "
            "Not a diagnosis or treatment recommendation."
        ),
    },
    "patient_info": {},
    "scan_info": {},
    "safety_cockpit": {},
    "biomarkers": {},
    "ai_findings": [],
    "target_plans": [],
    "evidence_links": [],
    "limitations": [],
    "footer": {
        "signature_required": True,
        "radiology_review_required": True,
    },
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_structured_report(
    analysis_id: str,
    patient_id: str,
    age: Optional[int],
    sex: Optional[str],
    condition: Optional[str],
    modality: Optional[str],
    scan_date: Optional[datetime],
    biomarkers: dict[str, Any],
    findings: list[dict[str, Any]],
    safety_cockpit: dict[str, Any],
    target_plans: Optional[list[dict[str, Any]]] = None,
    evidence_links: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Generate a full structured report from analysis data.

    Parameters
    ----------
    analysis_id:
        Unique analysis identifier (UUID).
    patient_id:
        Patient identifier (UUID).
    age:
        Patient age in years.
    sex:
        Patient sex (M/F/O/U).
    condition:
        Clinical condition code (e.g. ``mdd``, ``ptsd``).
    modality:
        MRI modality (e.g. ``T1w``, ``FLAIR``, ``DTI``).
    scan_date:
        Date/time of the MRI scan.
    biomarkers:
        Computed biomarker panel (z-scores, volumes, etc.).
    findings:
        AI-generated findings list.
    safety_cockpit:
        Safety cockpit payload (red flags, warnings, overall status).
    target_plans:
        Optional stimulation target plans.
    evidence_links:
        Optional evidence citation links.

    Returns
    -------
    dict
        Complete structured report conforming to the template schema.
    """
    report: dict[str, Any] = _deep_copy(REPORT_TEMPLATE)
    report["header"]["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Patient demographics
    report["patient_info"] = {
        "patient_id": patient_id,
        "age": age,
        "sex": sex,
        "condition": condition,
    }

    # Scan metadata
    report["scan_info"] = {
        "analysis_id": analysis_id,
        "modality": modality,
        "scan_date": scan_date.isoformat() if scan_date else None,
        "generated_at": report["header"]["generated_at"],
    }

    # Clinical content
    report["biomarkers"] = biomarkers
    report["ai_findings"] = findings
    report["safety_cockpit"] = safety_cockpit
    report["target_plans"] = target_plans or []
    report["evidence_links"] = evidence_links or []

    # Mandatory limitations (safety framing)
    report["limitations"] = [
        "AI analysis is decision support only.",
        "All findings require radiologist/clinician review.",
        "No calibrated prediction model is available.",
        "Correlations shown are temporal associations, not causal proof.",
        "Biomarker reference ranges are population-level approximations.",
        "Atlas registration accuracy affects target coordinate precision.",
    ]

    _log.info(
        "Structured report generated: analysis_id=%s findings=%d biomarkers=%s",
        analysis_id,
        len(findings),
        list(biomarkers.keys()),
    )

    return report


def generate_patient_friendly_summary(report: dict[str, Any]) -> str:
    """Generate a patient-friendly plain-text summary from a structured report.

    Parameters
    ----------
    report:
        Structured report dict (output of :func:`generate_structured_report`).

    Returns
    -------
    str
        Plain-text summary suitable for patient-facing display.
    """
    lines: list[str] = []
    lines.append("MRI Scan Summary (Patient-Friendly)")
    lines.append("")

    scan_info = report.get("scan_info") or {}
    lines.append(f"Scan Date: {scan_info.get('scan_date') or 'Unknown'}")
    lines.append("")
    lines.append("This is an automated summary of your MRI scan. It is NOT a diagnosis.")
    lines.append("Your doctor will review these results and discuss them with you.")
    lines.append("")

    # Biomarker summary
    biomarkers = report.get("biomarkers") or {}
    abnormal = biomarkers.get("abnormal_count", 0)
    total = biomarkers.get("total_count", 0)

    if isinstance(abnormal, (int, float)) and abnormal > 0:
        lines.append(
            f"The scan found {int(abnormal)} area(s) that may need further review "
            f"out of {int(total)} checked."
        )
    else:
        lines.append(
            f"No significant abnormalities were detected in {int(total or 0)} areas checked."
        )

    # Safety notes
    safety = report.get("safety_cockpit") or {}
    red_flags = safety.get("red_flags") or []
    if red_flags:
        lines.append("")
        lines.append("Important Notes:")
        for flag in red_flags:
            flag_msg = flag.get("message") or flag.get("code") or "Safety note"
            lines.append(f"- {flag_msg}")

    # Findings summary (high-level only)
    findings = report.get("ai_findings") or []
    if findings:
        lines.append("")
        lines.append("Findings Summary:")
        for finding in findings[:5]:  # Cap at 5 for patient-friendly brevity
            region = finding.get("region") or finding.get("anatomical_label") or "Unknown region"
            status = finding.get("status") or finding.get("severity") or "Noted"
            lines.append(f"- {region}: {status}")

    lines.append("")
    lines.append("Next Steps:")
    lines.append("- Your doctor will review this report")
    lines.append("- A radiologist may provide additional interpretation")
    lines.append("- Follow-up tests may be recommended if needed")
    lines.append("")
    lines.append("Questions? Contact your clinic for more information.")

    return "\n".join(lines)


def generate_fhir_diagnostic_report(
    report: dict[str, Any],
    fhir_patient_ref: str,
) -> dict[str, Any]:
    """Generate a FHIR R4 DiagnosticReport resource from a structured report.

    Parameters
    ----------
    report:
        Structured report dict.
    fhir_patient_ref:
        FHIR Patient reference (e.g. ``Patient/{id}``).

    Returns
    -------
    dict
        FHIR R4 DiagnosticReport resource.
    """
    scan_info = report.get("scan_info") or {}
    patient_info = report.get("patient_info") or {}
    header = report.get("header") or {}

    # Build conclusion text
    findings = report.get("ai_findings") or []
    conclusion_parts: list[str] = []
    for finding in findings[:10]:
        region = finding.get("region") or finding.get("anatomical_label") or "Unknown"
        note = finding.get("note") or finding.get("status") or "Noted"
        conclusion_parts.append(f"{region}: {note}")

    # Limitations as footer
    limitations = report.get("limitations") or []
    if limitations:
        conclusion_parts.append("")
        conclusion_parts.append("Limitations:")
        for lim in limitations:
            conclusion_parts.append(f"- {lim}")

    fhir_report: dict[str, Any] = {
        "resourceType": "DiagnosticReport",
        "status": "preliminary",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                        "code": "RAD",
                        "display": "Radiology",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "18748-4",
                    "display": "Diagnostic imaging study",
                }
            ]
        },
        "subject": {"reference": fhir_patient_ref},
        "effectiveDateTime": scan_info.get("scan_date"),
        "issued": header.get("generated_at"),
        "conclusion": "\n".join(conclusion_parts) if conclusion_parts else "No findings recorded.",
        "conclusionCode": [
            {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/uv/radiology/CodeSystem/radiology-codes",
                        "code": "ai-analysis",
                        "display": "AI-assisted analysis",
                    }
                ]
            }
        ],
        "identifier": [
            {
                "system": "https://deepsynaps.io/mri-analysis-id",
                "value": scan_info.get("analysis_id", "unknown"),
            }
        ],
    }

    return fhir_report


def generate_report_comparison(
    baseline_report: dict[str, Any],
    followup_report: dict[str, Any],
) -> dict[str, Any]:
    """Compare two structured reports (baseline vs followup).

    Parameters
    ----------
    baseline_report:
        The earlier structured report.
    followup_report:
        The later structured report.

    Returns
    -------
    dict
        Comparison result with change highlights.
    """
    comparison: dict[str, Any] = {
        "baseline_analysis_id": (baseline_report.get("scan_info") or {}).get("analysis_id"),
        "followup_analysis_id": (followup_report.get("scan_info") or {}).get("analysis_id"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "biomarker_changes": [],
        "new_findings": [],
        "resolved_findings": [],
        "stable_findings": [],
        "overall_assessment": "",
        "safety_note": (
            "Longitudinal comparison is decision support only. "
            "Requires clinician review."
        ),
    }

    # Compare biomarkers
    baseline_bio = (baseline_report.get("biomarkers") or {}).get("regions", {})
    followup_bio = (followup_report.get("biomarkers") or {}).get("regions", {})

    all_regions = set(baseline_bio.keys()) | set(followup_bio.keys())
    for region in sorted(all_regions):
        b_val = baseline_bio.get(region, {}).get("z_score") if isinstance(baseline_bio.get(region), dict) else None
        f_val = followup_bio.get(region, {}).get("z_score") if isinstance(followup_bio.get(region), dict) else None
        if b_val is not None and f_val is not None:
            delta = float(f_val) - float(b_val)
            comparison["biomarker_changes"].append({
                "region": region,
                "baseline_z": b_val,
                "followup_z": f_val,
                "delta": round(delta, 3),
                "direction": "improved" if abs(float(f_val)) < abs(float(b_val)) else "worsened" if abs(delta) > 0.5 else "stable",
            })

    # Compare findings
    baseline_findings = baseline_report.get("ai_findings") or []
    followup_findings = followup_report.get("ai_findings") or []
    baseline_regions = {f.get("region") or f.get("anatomical_label") for f in baseline_findings}
    followup_regions = {f.get("region") or f.get("anatomical_label") for f in followup_findings}

    new_regions = followup_regions - baseline_regions
    resolved_regions = baseline_regions - followup_regions
    stable_regions = baseline_regions & followup_regions

    for region in new_regions:
        if region:
            comparison["new_findings"].append({"region": region, "note": "New finding in followup"})
    for region in resolved_regions:
        if region:
            comparison["resolved_findings"].append({"region": region, "note": "Not detected in followup"})
    for region in stable_regions:
        if region:
            comparison["stable_findings"].append({"region": region, "note": "Present in both scans"})

    # Overall assessment
    total_changes = len(comparison["biomarker_changes"])
    significant_changes = sum(1 for c in comparison["biomarker_changes"] if abs(c.get("delta", 0)) > 1.0)
    comparison["overall_assessment"] = (
        f"{significant_changes} of {total_changes} biomarkers show significant change. "
        f"{len(comparison['new_findings'])} new finding(s), "
        f"{len(comparison['resolved_findings'])} resolved."
    )

    return comparison


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _deep_copy(obj: Any) -> Any:
    """Deep-copy a JSON-serialisable object."""
    import json
    return json.loads(json.dumps(obj, default=str))

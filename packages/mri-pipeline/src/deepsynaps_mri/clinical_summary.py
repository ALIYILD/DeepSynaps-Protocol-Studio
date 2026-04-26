"""Clinical-readiness summaries for MRI/fMRI analyzer reports."""
from __future__ import annotations

from typing import Any

from .schemas import MRIReport


METHOD_CITATIONS: list[dict[str, str]] = [
    {
        "id": "mriqc",
        "label": "MRIQC",
        "purpose": "No-reference image-quality metrics and reportable QC envelope.",
        "url": "https://mriqc.readthedocs.io/",
    },
    {
        "id": "nifti_bids",
        "label": "NIfTI / BIDS-style processing",
        "purpose": "Standardized neuroimaging ingest and derivative interoperability.",
        "url": "https://bids.neuroimaging.io/",
    },
    {
        "id": "region_norms",
        "label": "Region-level normative outputs",
        "purpose": "Clinician-reviewable volumetric/thickness z-scores and percentiles.",
        "url": "https://www.cortechs.ai/neuroquant/",
    },
]


def build_clinical_summary(report: MRIReport) -> dict[str, Any]:
    """Build a cautious, machine-readable MRI decision-support block."""
    quality_flags = _quality_flags(report)
    confidence = _confidence_from_report(report, quality_flags)
    observed = _observed_findings(report)
    derived = _derived_interpretations(report, confidence)

    return {
        "module": "MRI / fMRI Analyzer",
        "patient_context": {
            "age": report.patient.age,
            "sex": report.patient.sex.value if report.patient.sex else None,
            "chief_complaint": report.patient.chief_complaint,
        },
        "data_quality": {
            "confidence": confidence,
            "flags": quality_flags,
            "modalities_present": [m.value for m in report.modalities_present],
            "qc_warnings": list(report.qc_warnings or []),
            "mriqc": report.qc.mriqc.model_dump(mode="json") if report.qc.mriqc else None,
            "incidental": (
                report.qc.incidental.model_dump(mode="json") if report.qc.incidental else None
            ),
        },
        "observed_findings": observed,
        "derived_interpretations": derived,
        "limitations": [
            "MRI-derived measures depend on acquisition quality, preprocessing, segmentation, and atlas coverage.",
            "Brain-age and targeting outputs are model-derived decision-support features, not standalone clinical determinations.",
            "Incidental-finding screening is triage support only; radiology review remains the authority.",
        ],
        "recommended_review_items": _review_items(quality_flags, observed, report),
        "method_provenance": {
            "pipeline_version": report.pipeline_version,
            "norm_db_version": report.norm_db_version,
            "structural_atlas": report.structural.atlas if report.structural else None,
            "functional_atlas": report.functional.atlas if report.functional else None,
            "medrag_findings": [
                item.model_dump(mode="json") for item in report.medrag_query.findings
            ],
            "citations": METHOD_CITATIONS,
        },
        "safety_statement": (
            "Decision support only. Observed imaging metrics, model-derived brain-age, "
            "and neuromodulation planning targets require clinician and radiology review."
        ),
    }


def _quality_flags(report: MRIReport) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    if not report.modalities_present:
        flags.append({
            "severity": "high",
            "code": "no_modalities_present",
            "message": "No analyzable MRI modalities were present in the report.",
        })
    if report.qc.mriqc and report.qc.mriqc.status == "ok" and not report.qc.mriqc.passes_threshold:
        flags.append({
            "severity": "medium",
            "code": "mriqc_threshold_review",
            "message": "MRIQC image-quality metrics fell outside review thresholds.",
        })
    if report.qc.incidental and report.qc.incidental.status == "ok" and report.qc.incidental.any_flagged:
        flags.append({
            "severity": "high",
            "code": "radiology_review_advised",
            "message": "Incidental-finding triage flagged at least one candidate for radiology review.",
        })
    if report.qc.segmentation_failed_regions:
        flags.append({
            "severity": "medium",
            "code": "segmentation_partial",
            "message": "Some regions failed segmentation and should not be overinterpreted.",
        })
    if report.functional and report.qc.fmri_framewise_displacement_mean_mm is not None:
        if report.qc.fmri_framewise_displacement_mean_mm > 0.5:
            flags.append({
                "severity": "medium",
                "code": "fmri_motion",
                "message": "Mean fMRI framewise displacement exceeds common review threshold.",
            })
    if report.structural is None and report.functional is None and report.diffusion is None:
        flags.append({
            "severity": "high",
            "code": "no_metric_blocks",
            "message": "No structural, functional, or diffusion metric block was produced.",
        })
    return flags


def _confidence_from_report(
    report: MRIReport,
    flags: list[dict[str, str]],
) -> dict[str, Any]:
    score = 0.88
    score += 0.03 * min(len(report.modalities_present), 3)
    if report.structural:
        score += 0.03
    if report.functional:
        score += 0.02
    if report.diffusion:
        score += 0.02
    penalties = {"high": 0.22, "medium": 0.11, "low": 0.04}
    for flag in flags:
        score -= penalties.get(flag.get("severity", "low"), 0.04)
    score = max(0.15, min(0.97, score))
    if score >= 0.78:
        level = "high"
    elif score >= 0.55:
        level = "moderate"
    else:
        level = "low"
    return {
        "score": round(score, 2),
        "level": level,
        "rationale": "Derived from modality coverage, MRIQC/radiology flags, motion, segmentation, and produced metric blocks.",
    }


def _observed_findings(report: MRIReport) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if report.structural:
        for region, value in report.structural.cortical_thickness_mm.items():
            if value.flagged:
                findings.append(_normed_finding("cortical_thickness", region, value.value, value.z, value.unit))
        for region, value in report.structural.subcortical_volume_mm3.items():
            if value.flagged:
                findings.append(_normed_finding("subcortical_volume", region, value.value, value.z, value.unit))
        if report.structural.brain_age and report.structural.brain_age.status == "ok":
            gap = report.structural.brain_age.brain_age_gap_years
            if gap is not None:
                findings.append({
                    "type": "brain_age_observation",
                    "label": "brain_age_gap",
                    "value": round(float(gap), 2),
                    "unit": "years",
                    "statement": f"MRI brain-age gap was {float(gap):.1f} years.",
                })
    if report.functional and report.functional.sgACC_DLPFC_anticorrelation:
        val = report.functional.sgACC_DLPFC_anticorrelation
        findings.append({
            "type": "functional_connectivity",
            "label": "sgACC_DLPFC_anticorrelation",
            "value": val.value,
            "unit": val.unit,
            "statement": f"sgACC-DLPFC functional marker value was {val.value:.3f}.",
        })
    if report.qc.incidental and report.qc.incidental.status == "ok":
        for item in report.qc.incidental.findings:
            findings.append({
                "type": "radiology_triage",
                "label": item.finding_type,
                "value": item.volume_ml,
                "unit": "ml" if item.volume_ml is not None else None,
                "statement": (
                    f"Radiology triage flagged {item.finding_type}"
                    + (f" in {item.location_region}" if item.location_region else "")
                    + f" ({item.severity}, confidence {item.confidence:.0%})."
                ),
            })
    return findings[:12]


def _normed_finding(
    kind: str,
    region: str,
    value: float,
    z: float | None,
    unit: str | None,
) -> dict[str, Any]:
    z_text = f", z={z:.2f}" if z is not None else ""
    return {
        "type": "region_metric",
        "label": f"{kind}:{region}",
        "location": region,
        "value": value,
        "unit": unit,
        "z": z,
        "statement": f"Observed {kind.replace('_', ' ')} in {region}: {value:.3g}{unit or ''}{z_text}.",
    }


def _derived_interpretations(
    report: MRIReport,
    confidence: dict[str, Any],
) -> list[dict[str, Any]]:
    interpretations: list[dict[str, Any]] = []
    if report.stim_targets:
        interpretations.append({
            "label": "neuromodulation_planning_targets",
            "confidence": confidence["level"],
            "statement": (
                f"{len(report.stim_targets)} literature-derived planning target(s) are available; "
                "verify target choice, safety screen, and neuronavigation setup before use."
            ),
        })
    if report.medrag_query.findings:
        interpretations.append({
            "label": "evidence_retrieval_ready",
            "confidence": "depends_on_corpus_match",
            "statement": "Region/network findings were translated into MedRAG retrieval terms.",
        })
    if not interpretations:
        interpretations.append({
            "label": "no_model_interpretation_available",
            "confidence": confidence["level"],
            "statement": "No derived MRI interpretation block was produced beyond observed metrics.",
        })
    return interpretations


def _review_items(
    flags: list[dict[str, str]],
    observed: list[dict[str, Any]],
    report: MRIReport,
) -> list[str]:
    items = ["Review image quality, registration/segmentation coverage, and radiology context."]
    if flags:
        items.append("Resolve high/medium quality flags before relying on derived targeting or brain-age outputs.")
    if observed:
        items.append("Correlate region-level findings with symptoms, assessments, and longitudinal imaging.")
    if report.stim_targets:
        items.append("Verify each stimulation target against curated citations, anatomy, and safety screen.")
    return items

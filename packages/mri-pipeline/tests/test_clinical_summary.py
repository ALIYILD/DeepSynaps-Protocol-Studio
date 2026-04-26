from __future__ import annotations

from deepsynaps_mri.clinical_summary import build_clinical_summary
from deepsynaps_mri.schemas import (
    FunctionalMetrics,
    MRIQCResult,
    MRIReport,
    Modality,
    NetworkMetric,
    NormedValue,
    PatientMeta,
    QCMetrics,
    StructuralMetrics,
)


def test_mri_clinical_summary_surfaces_quality_and_regions():
    report = MRIReport(
        patient=PatientMeta(patient_id="mri-summary", age=65),
        modalities_present=[Modality.T1, Modality.RS_FMRI],
        qc=QCMetrics(
            passed=False,
            mriqc=MRIQCResult(status="ok", passes_threshold=False, snr=5.0),
        ),
        structural=StructuralMetrics(
            cortical_thickness_mm={
                "acc_l": NormedValue(value=2.1, unit="mm", z=-2.4, flagged=True)
            }
        ),
        functional=FunctionalMetrics(
            networks=[
                NetworkMetric(
                    network="DMN",
                    mean_within_fc=NormedValue(value=0.42, unit="r", z=2.1, flagged=True),
                )
            ]
        ),
    )

    summary = build_clinical_summary(report)

    assert summary["module"] == "MRI / fMRI Analyzer"
    assert summary["data_quality"]["flags"]
    assert any(item["region"] == "acc_l" for item in summary["region_level_findings"])
    assert any(item["network"] == "DMN" for item in summary["network_findings"])
    assert summary["confidence"]["level"] in {"moderate", "low"}
    assert summary["decision_support_only"] is True

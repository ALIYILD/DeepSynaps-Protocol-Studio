"""QEEGBrainMapReport — canonical contract for the brain-map report payload.

This module is the single source of truth that downstream surfaces consume:
  - Patient + clinician frontend renderers (Phase 1)
  - Protocol Studio "From qEEG" suggestions (Phase 2)
  - Reports Hub PDF export (Phase 2)
  - Brain Map Planner z-score overlay (Phase 2)
  - Course pre/post comparison (Phase 2)

The pipeline output (from ``services.qeeg_pipeline.run_pipeline_safe``) is
mapped into this shape via :func:`from_pipeline_result`. The result is
persisted as JSON in ``QEEGAIReport.report_payload`` (migration 064).

All user-facing strings follow regulatory copy rules from
``packages/qeeg-pipeline/CLAUDE.md``: research/wellness use only, never
"diagnosis"/"diagnostic"/"treatment recommendation".
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

_log = logging.getLogger(__name__)

REPORT_SCHEMA_VERSION = "1.0.0"
DEFAULT_DISCLAIMER = (
    "Research and wellness use only. This brain map summary is informational "
    "and is not a medical diagnosis or treatment recommendation. Discuss any "
    "findings with a qualified clinician."
)

_NARRATIVE_BANK_PATH = Path(__file__).resolve().parent.parent / "data" / "dk_atlas_narrative.json"

# DK 68 = 34 ROIs per hemisphere
DK_ROIS_PER_HEMISPHERE: tuple[str, ...] = (
    "bankssts", "caudalanteriorcingulate", "caudalmiddlefrontal", "cuneus",
    "entorhinal", "frontalpole", "fusiform", "inferiorparietal",
    "inferiortemporal", "insula", "isthmuscingulate", "lateraloccipital",
    "lateralorbitofrontal", "lingual", "medialorbitofrontal", "middletemporal",
    "paracentral", "parahippocampal", "parsopercularis", "parsorbitalis",
    "parstriangularis", "pericalcarine", "postcentral", "posteriorcingulate",
    "precentral", "precuneus", "rostralanteriorcingulate",
    "rostralmiddlefrontal", "superiorfrontal", "superiorparietal",
    "superiortemporal", "supramarginal", "temporalpole", "transversetemporal",
)
assert len(DK_ROIS_PER_HEMISPHERE) == 34


# ── Narrative bank loader ────────────────────────────────────────────────────


_narrative_bank_cache: Optional[dict[str, Any]] = None


def load_narrative_bank() -> dict[str, Any]:
    """Load the DK ROI narrative reference bank from disk (cached)."""
    global _narrative_bank_cache
    if _narrative_bank_cache is None:
        with _NARRATIVE_BANK_PATH.open("r", encoding="utf-8") as f:
            _narrative_bank_cache = json.load(f)
    return _narrative_bank_cache


# ── Pydantic models ──────────────────────────────────────────────────────────


class ReportHeader(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_name: Optional[str] = None
    sex: Optional[str] = None
    dob: Optional[str] = None  # ISO date
    age_years: Optional[float] = None
    eeg_acquisition_date: Optional[str] = None  # ISO date
    eyes_condition: Optional[str] = None  # "eyes_closed" | "eyes_open" | "both"


class IndicatorValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: Optional[float] = None
    unit: Optional[str] = None
    percentile: Optional[float] = None
    band: Optional[str] = None  # "low" | "typical" | "high" | "flag"


class Indicators(BaseModel):
    """The 5 cover indicators that drive the patient-facing summary."""
    model_config = ConfigDict(extra="forbid")
    tbr: Optional[IndicatorValue] = Field(None, description="Theta/Beta ratio (frontal)")
    occipital_paf: Optional[IndicatorValue] = Field(None, description="Peak alpha frequency (Hz, occipital)")
    alpha_reactivity: Optional[IndicatorValue] = Field(None, description="EO/EC alpha ratio")
    brain_balance: Optional[IndicatorValue] = Field(None, description="Inter-hemispheric connectivity laterality")
    ai_brain_age: Optional[IndicatorValue] = Field(None, description="AI-estimated brain age (years)")


class LobeSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lt_percentile: Optional[float] = None
    rt_percentile: Optional[float] = None
    lt_band: Optional[str] = None  # "balanced" | "low" | "high"
    rt_band: Optional[str] = None


class LobeBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")
    frontal: LobeSummary = Field(default_factory=LobeSummary)
    temporal: LobeSummary = Field(default_factory=LobeSummary)
    parietal: LobeSummary = Field(default_factory=LobeSummary)
    occipital: LobeSummary = Field(default_factory=LobeSummary)


class BrainFunctionScore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score_0_100: Optional[float] = None
    formula_version: str = "phase0_placeholder_v1"
    scatter_dots: list[dict[str, Any]] = Field(default_factory=list)


class ROIZScore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    roi: str  # e.g. "rostralmiddlefrontal"
    hemisphere: str  # "lh" | "rh"
    z_score: Optional[float] = None
    band: Optional[str] = None  # spectral band the z is computed against


class SourceMap(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topomap_url: Optional[str] = None
    dk_roi_zscores: list[ROIZScore] = Field(default_factory=list)


class DKRegion(BaseModel):
    """One row of the per-region drill-down (68 entries total)."""
    model_config = ConfigDict(extra="forbid")
    code: str  # e.g. "F5"
    roi: str  # DK key, e.g. "rostralmiddlefrontal"
    name: str  # display name
    lobe: str
    hemisphere: str  # "lh" | "rh"
    lt_percentile: Optional[float] = None
    rt_percentile: Optional[float] = None
    z_score: Optional[float] = None
    functions: list[str] = Field(default_factory=list)
    decline_symptoms: list[str] = Field(default_factory=list)


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str
    severity: Optional[str] = None  # "info" | "watch" | "flag"
    related_rois: list[str] = Field(default_factory=list)


class ProtocolRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    modality: Optional[str] = None
    target: Optional[str] = None
    rationale: Optional[str] = None
    fit_score: Optional[float] = None


class AINarrative(BaseModel):
    model_config = ConfigDict(extra="forbid")
    executive_summary: Optional[str] = None
    findings: list[Finding] = Field(default_factory=list)
    protocol_recommendations: list[ProtocolRecommendation] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)


class ReportQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")
    n_clean_epochs: Optional[int] = None
    channels_used: list[str] = Field(default_factory=list)
    qc_flags: list[str] = Field(default_factory=list)
    confidence: dict[str, Any] = Field(default_factory=dict)
    method_provenance: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)


class ReportProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str = REPORT_SCHEMA_VERSION
    pipeline_version: Optional[str] = None
    norm_db_version: Optional[str] = None
    file_hash: Optional[str] = None
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class QEEGBrainMapReport(BaseModel):
    """Canonical brain-map report payload. See module docstring."""
    model_config = ConfigDict(extra="forbid")

    header: ReportHeader = Field(default_factory=ReportHeader)
    indicators: Indicators = Field(default_factory=Indicators)
    brain_function_score: BrainFunctionScore = Field(default_factory=BrainFunctionScore)
    lobe_summary: LobeBreakdown = Field(default_factory=LobeBreakdown)
    source_map: SourceMap = Field(default_factory=SourceMap)
    dk_atlas: list[DKRegion] = Field(default_factory=list)
    ai_narrative: AINarrative = Field(default_factory=AINarrative)
    quality: ReportQuality = Field(default_factory=ReportQuality)
    provenance: ReportProvenance = Field(default_factory=ReportProvenance)
    disclaimer: str = DEFAULT_DISCLAIMER


# ── Computation helpers (Phase 0 placeholders, refined in later phases) ──────


def compute_brain_function_score(features: dict[str, Any]) -> float:
    """Phase-0 placeholder: mean of 4-lobe percentiles, clamped 0–100.

    The iSyncBrain sample reports a "Standardized Brain Function Score 59.1"
    with a methodology that is not publicly specified. We approximate by
    averaging the lobe-aggregate percentiles (frontal/temporal/parietal/
    occipital, both hemispheres). Phase 1+ will refine to a published norm.
    """
    lobe = features.get("lobe_percentiles") or {}
    vals: list[float] = []
    for name in ("frontal", "temporal", "parietal", "occipital"):
        block = lobe.get(name) or {}
        for side in ("lt", "rt"):
            v = block.get(side)
            if isinstance(v, (int, float)):
                vals.append(float(v))
    if not vals:
        return 0.0
    score = sum(vals) / len(vals)
    return max(0.0, min(100.0, score))


def _percentile_to_band(p: Optional[float]) -> Optional[str]:
    if p is None:
        return None
    if p < 16:
        return "low"
    if p > 84:
        return "high"
    return "balanced"


def compute_indicators(features: dict[str, Any]) -> Indicators:
    """Compute the 5 cover indicators from the pipeline feature dict."""
    spec = features.get("spectral") or {}
    asymmetry = features.get("asymmetry") or {}
    aperiodic = features.get("aperiodic") or {}

    tbr_value = spec.get("theta_beta_ratio")
    tbr_pct = spec.get("theta_beta_ratio_percentile")
    paf_hz = spec.get("peak_alpha_frequency_hz")
    paf_pct = spec.get("peak_alpha_frequency_percentile")

    return Indicators(
        tbr=IndicatorValue(
            value=_to_float(tbr_value),
            unit="ratio",
            percentile=_to_float(tbr_pct),
            band=_percentile_to_band(_to_float(tbr_pct)),
        ),
        occipital_paf=IndicatorValue(
            value=_to_float(paf_hz),
            unit="Hz",
            percentile=_to_float(paf_pct),
            band=_percentile_to_band(_to_float(paf_pct)),
        ),
        alpha_reactivity=IndicatorValue(
            value=_to_float(spec.get("alpha_reactivity_ratio")),
            unit="EO/EC",
            percentile=_to_float(spec.get("alpha_reactivity_percentile")),
            band=_percentile_to_band(_to_float(spec.get("alpha_reactivity_percentile"))),
        ),
        brain_balance=IndicatorValue(
            value=_to_float(asymmetry.get("hemisphere_laterality_index")),
            unit="laterality",
            percentile=_to_float(asymmetry.get("hemisphere_laterality_percentile")),
            band=_percentile_to_band(_to_float(asymmetry.get("hemisphere_laterality_percentile"))),
        ),
        ai_brain_age=IndicatorValue(
            value=_to_float(aperiodic.get("ai_estimated_brain_age_years")),
            unit="years",
            percentile=None,
            band=None,
        ),
    )


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _build_dk_atlas(
    features: dict[str, Any],
    zscores: dict[str, Any],
    narrative_bank: dict[str, Any],
) -> list[DKRegion]:
    """Build the 68 DKRegion rows from pipeline ROI output + narrative bank."""
    roi_features = (features.get("source") or {}).get("roi_band_power") or {}
    roi_zscores = zscores.get("roi") or {}

    rows: list[DKRegion] = []
    for roi in DK_ROIS_PER_HEMISPHERE:
        meta = narrative_bank.get(roi) or {}
        for hemi in ("lh", "rh"):
            key = f"{hemi}.{roi}"
            roi_block = roi_features.get(key) or {}
            roi_z = roi_zscores.get(key) or {}
            rows.append(
                DKRegion(
                    code=meta.get("code", roi),
                    roi=roi,
                    name=meta.get("display_name", roi.replace("_", " ").title()),
                    lobe=meta.get("lobe", "unknown"),
                    hemisphere=hemi,
                    lt_percentile=_to_float(roi_block.get("percentile_lt")) if hemi == "lh" else None,
                    rt_percentile=_to_float(roi_block.get("percentile_rt")) if hemi == "rh" else None,
                    z_score=_to_float(roi_z.get("z") if isinstance(roi_z, dict) else roi_z),
                    functions=list(meta.get("functions") or []),
                    decline_symptoms=list(meta.get("decline_symptoms") or []),
                )
            )
    return rows


def _build_source_map(zscores: dict[str, Any]) -> SourceMap:
    roi_z = zscores.get("roi") or {}
    rows: list[ROIZScore] = []
    for roi in DK_ROIS_PER_HEMISPHERE:
        for hemi in ("lh", "rh"):
            key = f"{hemi}.{roi}"
            block = roi_z.get(key)
            if block is None:
                continue
            if isinstance(block, dict):
                z = _to_float(block.get("z"))
                band = block.get("band")
            else:
                z = _to_float(block)
                band = None
            rows.append(ROIZScore(roi=roi, hemisphere=hemi, z_score=z, band=band))
    return SourceMap(topomap_url=zscores.get("topomap_url"), dk_roi_zscores=rows)


def _build_lobe_breakdown(features: dict[str, Any]) -> LobeBreakdown:
    lobe = features.get("lobe_percentiles") or {}
    out = LobeBreakdown()
    for name in ("frontal", "temporal", "parietal", "occipital"):
        block = lobe.get(name) or {}
        lt = _to_float(block.get("lt"))
        rt = _to_float(block.get("rt"))
        setattr(
            out,
            name,
            LobeSummary(
                lt_percentile=lt,
                rt_percentile=rt,
                lt_band=_percentile_to_band(lt),
                rt_band=_percentile_to_band(rt),
            ),
        )
    return out


def _file_hash(file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None
    p = Path(file_path)
    if not p.exists() or not p.is_file():
        return None
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Public factory ───────────────────────────────────────────────────────────


def from_pipeline_result(
    pipeline_dict: dict[str, Any],
    patient_meta: Optional[dict[str, Any]] = None,
    narrative_bank: Optional[dict[str, Any]] = None,
    *,
    file_path: Optional[str] = None,
) -> QEEGBrainMapReport:
    """Map ``run_pipeline_safe`` output into a QEEGBrainMapReport.

    Parameters
    ----------
    pipeline_dict
        The dict returned by ``services.qeeg_pipeline.run_pipeline_safe``.
        Expected top-level keys: features, zscores, flagged_conditions,
        quality, qc_flags, confidence, method_provenance, limitations.
        Missing keys are tolerated — fields default to None / empty.
    patient_meta
        Optional patient context: client_name, sex, dob, age_years,
        eeg_acquisition_date, eyes_condition.
    narrative_bank
        DK narrative bank dict (defaults to :func:`load_narrative_bank`).
    file_path
        Optional path to the source EDF/EEG file, used to compute file_hash
        for provenance.

    Returns
    -------
    QEEGBrainMapReport
        A validated Pydantic model. Call ``.model_dump(mode="json")`` to
        persist as JSON in ``QEEGAIReport.report_payload``.
    """
    if narrative_bank is None:
        try:
            narrative_bank = load_narrative_bank()
        except FileNotFoundError:
            _log.warning("DK narrative bank not found at %s", _NARRATIVE_BANK_PATH)
            narrative_bank = {}

    features = pipeline_dict.get("features") or {}
    zscores = pipeline_dict.get("zscores") or {}
    quality_in = pipeline_dict.get("quality") or {}
    method = pipeline_dict.get("method_provenance") or {}

    header = ReportHeader(**(patient_meta or {}))
    indicators = compute_indicators(features)
    score = compute_brain_function_score(features)
    lobes = _build_lobe_breakdown(features)
    source_map = _build_source_map(zscores)
    dk_atlas = _build_dk_atlas(features, zscores, narrative_bank)

    flagged = pipeline_dict.get("flagged_conditions") or []
    findings = [Finding(description=str(c), severity="watch") for c in flagged]

    quality = ReportQuality(
        n_clean_epochs=quality_in.get("n_clean_epochs"),
        channels_used=list(quality_in.get("channels_used") or []),
        qc_flags=list(pipeline_dict.get("qc_flags") or []),
        confidence=dict(pipeline_dict.get("confidence") or {}),
        method_provenance=dict(method),
        limitations=list(pipeline_dict.get("limitations") or []),
    )

    provenance = ReportProvenance(
        pipeline_version=method.get("pipeline_version"),
        norm_db_version=method.get("norm_db_version"),
        file_hash=_file_hash(file_path),
    )

    return QEEGBrainMapReport(
        header=header,
        indicators=indicators,
        brain_function_score=BrainFunctionScore(
            score_0_100=score,
            formula_version="phase0_placeholder_v1",
            scatter_dots=[],
        ),
        lobe_summary=lobes,
        source_map=source_map,
        dk_atlas=dk_atlas,
        ai_narrative=AINarrative(findings=findings),
        quality=quality,
        provenance=provenance,
    )


__all__ = [
    "REPORT_SCHEMA_VERSION",
    "DEFAULT_DISCLAIMER",
    "DK_ROIS_PER_HEMISPHERE",
    "load_narrative_bank",
    "compute_brain_function_score",
    "compute_indicators",
    "from_pipeline_result",
    "QEEGBrainMapReport",
    "ReportHeader",
    "Indicators",
    "IndicatorValue",
    "LobeBreakdown",
    "LobeSummary",
    "BrainFunctionScore",
    "SourceMap",
    "ROIZScore",
    "DKRegion",
    "AINarrative",
    "Finding",
    "ProtocolRecommendation",
    "Citation",
    "ReportQuality",
    "ReportProvenance",
]

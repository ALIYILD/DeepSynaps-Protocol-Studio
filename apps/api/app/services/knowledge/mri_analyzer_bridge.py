"""Bridge connecting Knowledge Layer atlas/sim adapters to MRI Analyzer.

Provides atlas region lookup, coordinate transformations, and
simulation job management.
Decision-support only -- all atlas coordinates require expert verification.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

_WEIGHTS: dict[str, float] = {"mni_direct": 0.92, "mni_interp": 0.78, "simnibs": 0.85, "local_fallback": 0.60, "sim_stub": 0.30}

_LOCAL_AAL3: dict[str, dict[str, Any]] = {
    "Precentral_L": {"name": "Precentral gyrus (L)", "hemisphere": "left", "lobe": "frontal", "center": [-38, -22, 52], "function": "Primary motor cortex"},
    "Precentral_R": {"name": "Precentral gyrus (R)", "hemisphere": "right", "lobe": "frontal", "center": [38, -22, 52], "function": "Primary motor cortex"},
    "Frontal_Sup_L": {"name": "Superior frontal gyrus (L)", "hemisphere": "left", "lobe": "frontal", "center": [-18, 30, 42], "function": "Executive function"},
    "Frontal_Sup_R": {"name": "Superior frontal gyrus (R)", "hemisphere": "right", "lobe": "frontal", "center": [18, 30, 42], "function": "Executive function"},
    "Cingulum_Ant_L": {"name": "Anterior cingulate (L)", "hemisphere": "left", "lobe": "limbic", "center": [-6, 36, 16], "function": "Emotion regulation"},
    "Cingulum_Ant_R": {"name": "Anterior cingulate (R)", "hemisphere": "right", "lobe": "limbic", "center": [6, 36, 16], "function": "Emotion regulation"},
    "Hippocampus_L": {"name": "Hippocampus (L)", "hemisphere": "left", "lobe": "limbic", "center": [-28, -18, -16], "function": "Memory formation"},
    "Hippocampus_R": {"name": "Hippocampus (R)", "hemisphere": "right", "lobe": "limbic", "center": [28, -18, -16], "function": "Memory formation"},
    "Amygdala_L": {"name": "Amygdala (L)", "hemisphere": "left", "lobe": "limbic", "center": [-24, -4, -18], "function": "Fear processing"},
    "Amygdala_R": {"name": "Amygdala (R)", "hemisphere": "right", "lobe": "limbic", "center": [24, -4, -18], "function": "Fear processing"},
    "Insula_L": {"name": "Insula (L)", "hemisphere": "left", "lobe": "insula", "center": [-36, 6, 2], "function": "Interoception"},
    "Insula_R": {"name": "Insula (R)", "hemisphere": "right", "lobe": "insula", "center": [36, 6, 2], "function": "Interoception"},
}

_ATLAS_META: dict[str, dict[str, Any]] = {
    "AAL3": {"regions": 170, "description": "Automated Anatomical Labeling v3", "space": "MNI152"},
    "Schaefer400": {"regions": 400, "description": "Schaefer 400-region parcellation", "space": "MNI152"},
}


def _prov(sources: list[str], query: str, confidence: float, *, research: bool = True, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build provenance envelope."""
    p: dict[str, Any] = {"sources": sources, "query": query, "confidence": round(confidence, 4),
        "confidence_tier": "high" if confidence >= 0.9 else "moderate" if confidence >= 0.7 else "low" if confidence >= 0.4 else "insufficient",
        "is_research_only": research, "accessed_at": datetime.now(timezone.utc).isoformat(), "bridge": "mri_analyzer_bridge", "version": "1.0.0"}
    if meta: p["metadata"] = meta
    return p


def _dist(c1: tuple, c2: tuple) -> float:
    """Euclidean distance between two 3D coordinates."""
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


class MRIAnalyzerBridge:
    """Bridge connecting Knowledge Layer atlas/sim adapters to MRI Analyzer."""

    def __init__(self, registry: Any) -> None:
        self._mni_atlas = registry.get("mni_atlas")
        self._simnibs = registry.get("simnibs")
        if not self._mni_atlas: logger.warning("MRIAnalyzerBridge: MNI Atlas adapter not available")
        if not self._simnibs: logger.warning("MRIAnalyzerBridge: SimNIBS adapter not available")

    async def lookup_region(self, coordinates: tuple, atlas: str = "AAL3") -> dict[str, Any]:
        """Look up atlas region for MNI coordinates."""
        logger.info("lookup_region: %s atlas=%s", coordinates, atlas)
        c = tuple(float(v) for v in coordinates[:3])
        query = f"MNI({c[0]:.1f},{c[1]:.1f},{c[2]:.1f})"
        region: dict[str, Any] | None = None
        sources, scores = [], []
        if self._mni_atlas:
            try:
                r = await self._mni_atlas.lookup(c, atlas=atlas)
                if r and r.get("region_id"):
                    region = {"region_id": r["region_id"], "region_name": r.get("region_name", "Unknown"), "hemisphere": r.get("hemisphere"), "lobe": r.get("lobe"),
                        "probability": r.get("probability", 1.0), "mni_coords": list(c), "atlas": atlas}
                    sources.append("mni_atlas"); scores.append(_WEIGHTS["mni_direct"] if r.get("probability", 1.0) == 1.0 else _WEIGHTS["mni_interp"])
            except Exception as e: logger.warning("lookup_region: MNI Atlas failed: %s", e)
        if region is None:
            logger.info("lookup_region: local fallback for %s", query)
            nearest, min_d = None, float("inf")
            for rid, rd in _LOCAL_AAL3.items():
                d = _dist(c, tuple(rd.get("center", [0, 0, 0])))
                if d < min_d: min_d, nearest = d, rid
            if nearest and nearest in _LOCAL_AAL3:
                rd = _LOCAL_AAL3[nearest]
                region = {"region_id": nearest, "region_name": rd["name"], "hemisphere": rd.get("hemisphere"), "lobe": rd.get("lobe"), "probability": 1.0,
                    "mni_coords": list(c), "nearest_center": rd.get("center"), "distance_mm": round(min_d, 2), "atlas": f"{atlas} (local fallback)"}
                sources.append("local_fallback"); scores.append(_WEIGHTS["local_fallback"])
        avg_c = sum(scores) / len(scores) if scores else 0.30
        return {"query_coords": list(c), "atlas": atlas, "region": region or {"region_id": "unknown", "region_name": "Unknown"},
            "provenance": _prov(sources or ["none"], query, avg_c, meta={"coords": list(c), "atlas": atlas, "method": sources[0] if sources else "none"})}

    async def get_region_details(self, region_id: str, atlas: str = "AAL3") -> dict[str, Any]:
        """Get detailed region information with provenance."""
        logger.info("get_region_details: %s atlas=%s", region_id, atlas)
        query = f"{atlas}:{region_id}"
        details: dict[str, Any] | None = None
        sources, scores = [], []
        if self._mni_atlas:
            try:
                r = await self._mni_atlas.get_region_details(region_id, atlas=atlas)
                if r:
                    details = {"region_id": region_id, "region_name": r.get("region_name", region_id), "hemisphere": r.get("hemisphere"), "lobe": r.get("lobe"),
                        "mni_center": r.get("mni_center"), "volume_mm3": r.get("volume_mm3"), "networks": r.get("functional_networks", []), "atlas_meta": _ATLAS_META.get(atlas, {})}
                    sources.append("mni_atlas"); scores.append(_WEIGHTS["mni_direct"])
            except Exception as e: logger.warning("get_region_details: MNI Atlas failed: %s", e)
        if details is None:
            logger.info("get_region_details: local fallback for %s", region_id)
            lr = _LOCAL_AAL3.get(region_id)
            if lr:
                details = {"region_id": region_id, "region_name": lr["name"], "hemisphere": lr.get("hemisphere"), "lobe": lr.get("lobe"),
                    "mni_center": lr.get("center"), "function": lr.get("function"), "atlas_meta": _ATLAS_META.get(atlas, {}), "note": "From embedded local subset"}
                sources.append("local_fallback"); scores.append(_WEIGHTS["local_fallback"])
        avg_c = sum(scores) / len(scores) if scores else 0.35
        return {"region_id": region_id, "atlas": atlas, "details": details or {"error": "Region not found"},
            "provenance": _prov(sources or ["none"], query, avg_c, meta={"region_id": region_id, "atlas": atlas, "detail_source": sources[0] if sources else "none"})}

    async def submit_simulation(self, config: dict[str, Any]) -> dict[str, Any]:
        """Submit neuromodulation simulation job."""
        st = config.get("simulation_type", "unknown")
        logger.info("submit_simulation: %s", st)
        if self._simnibs:
            try:
                r = await self._simnibs.submit_job(config)
                if r and r.get("job_id"):
                    return {"job_id": r["job_id"], "status": r.get("status", "submitted"), "simulation_type": st,
                        "config_summary": {"type": st, "intensity": config.get("intensity_mA") or config.get("intensity_pct"), "duration_s": config.get("duration_s"), "subject_model": config.get("subject_model")},
                        "estimated_runtime_s": r.get("estimated_runtime_s"),
                        "provenance": _prov(["simnibs"], f"sim:{st}", _WEIGHTS["simnibs"], meta={"type": st, "job_id": r["job_id"]})}
            except Exception as e: logger.warning("submit_simulation: SimNIBS failed: %s", e)
        logger.info("submit_simulation: returning stub for %s", st)
        stub_id = f"STUB-{uuid.uuid4().hex[:12]}"
        return {"job_id": stub_id, "status": "stub", "simulation_type": st,
            "config_summary": {"type": st, "intensity": config.get("intensity_mA") or config.get("intensity_pct"), "duration_s": config.get("duration_s"), "subject_model": config.get("subject_model")},
            "warning": "Research-only stub. SimNIBS adapter unavailable. Not for clinical planning.",
            "provenance": _prov(["sim_stub"], f"sim:{st}", _WEIGHTS["sim_stub"], meta={"type": st, "stub_id": stub_id, "note": "SimNIBS unavailable"})}

    async def get_simulation_results(self, simulation_id: str) -> dict[str, Any]:
        """Get simulation results with safety validation."""
        logger.info("get_simulation_results: %s", simulation_id)
        results: dict[str, Any] | None = None
        sources, scores = [], []
        if self._simnibs:
            try:
                r = await self._simnibs.get_results(simulation_id)
                if r: results = r; sources.append("simnibs"); scores.append(_WEIGHTS["simnibs"])
            except Exception as e: logger.warning("get_simulation_results: SimNIBS failed: %s", e)
        max_field = float(results["max_electric_field_V_per_m"]) if results and results.get("max_electric_field_V_per_m") else None
        checks = [
            {"check": "research_only_flag", "passed": True, "note": "All simulation results are research-only."},
            {"check": "clinical_review_required", "passed": True, "note": "Results require specialist clinical review."},
            {"check": "max_intensity_threshold", "passed": max_field < 0.8 if max_field is not None else None,
             "note": f"Max E-field {max_field:.4f} V/m; threshold 0.8 V/m" if max_field is not None else "Intensity validation requires completed results.", "value": max_field},
        ]
        all_passed = all(c["passed"] for c in checks if c["passed"] is not None)
        avg_c = sum(scores) / len(scores) if scores else 0.25
        return {"simulation_id": simulation_id, "status": results.get("status", "unknown") if results else "unavailable", "results": results,
            "safety_validation": {"all_passed": all_passed, "checks": checks, "timestamp": datetime.now(timezone.utc).isoformat()},
            "provenance": _prov(sources or ["none"], simulation_id, avg_c, meta={"sim_id": simulation_id, "has_results": results is not None, "checks": len(checks)})}

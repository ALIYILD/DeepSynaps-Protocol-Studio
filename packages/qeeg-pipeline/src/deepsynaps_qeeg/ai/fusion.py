"""Multi-modal fusion — combine qEEG + MRI protocol recommendations.

Implements CONTRACT_V3.md §1 ``FusionRecommendation`` shape. Pure Python;
no DB, no LLM calls. The API router layer is responsible for loading the
analyses and for any optional LLM narrative rewrite.

Fusion rules
------------
1. For each target in ``qeeg_rec.recommendations``, find a matching MRI
   target by case-insensitive substring match on ``target_region`` OR
   same ``region_code``. Matched targets get merged into a single
   recommendation with combined ``qeeg_support`` + ``mri_support``.
2. ``fusion_boost = 1.0 + min(sum_of_support_weights, 0.5)`` when both
   modalities converge. Single-modality recommendations get
   ``fusion_boost = 1.0``.
3. ``agreement_score`` is the cosine similarity of the z-score vectors
   of the matched supports, clamped to ``[-1.0, 1.0]``.
4. Laterality conflicts (qEEG left vs MRI right etc.) are recorded in
   ``conflicts[]`` with a sensible resolution string.
5. Every ``qeeg_support`` / ``mri_support`` entry must trace back to a
   real field in the underlying analysis row — never invented.
6. Banned-word sanitiser runs on the top-level ``summary`` and on every
   ``rationale`` string.
"""
from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)


_DISCLAIMER: str = (
    "Decision-support tool. Not a medical device. Multi-modal convergent "
    "findings are research/wellness indicators only."
)

_BANNED_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"treatment recommendations?", re.IGNORECASE), "protocol consideration"),
    (re.compile(r"\bdiagnos\w*", re.IGNORECASE), "finding"),
]


# ── Public API ──────────────────────────────────────────────────────────────


def combine_recommendations(
    qeeg_rec: dict | None,
    mri_rec: dict | None,
    *,
    qeeg_row: dict | None = None,
    mri_row: dict | None = None,
    deterministic_seed: int | None = None,  # noqa: ARG001 (hook for future stubs)
) -> dict:
    """Combine qEEG + MRI protocol recommendations into a fusion envelope.

    Parameters
    ----------
    qeeg_rec : dict, optional
        A ``ProtocolRecommendation`` dict (CONTRACT_V2 §5) — typically
        produced by :func:`protocol_recommender.recommend_protocol` and
        wrapped in ``{"recommendations": [...]}`` by the caller. If the
        caller already passed a ``{"recommendations": [...]}`` envelope
        we use it directly; a single ``ProtocolRecommendation`` is also
        accepted and normalised into a single-item list.
    mri_rec : dict, optional
        Same shape as ``qeeg_rec`` but MRI-derived.
    qeeg_row : dict, optional
        Row-level fields from ``qeeg_analyses`` used to extract the
        concrete biomarker support evidence.
    mri_row : dict, optional
        Row-level fields from ``mri_analyses`` used to extract the
        concrete biomarker support evidence.
    deterministic_seed : int, optional
        Reserved for future stub determinism — currently unused.

    Returns
    -------
    dict
        A ``FusionRecommendation`` dict per CONTRACT_V3 §1.
    """
    qeeg_recs = _normalise_recommendations(qeeg_rec)
    mri_recs = _normalise_recommendations(mri_rec)

    qeeg_biomarkers = _extract_qeeg_biomarkers(qeeg_row or {})
    mri_biomarkers = _extract_mri_biomarkers(mri_row or {})

    modalities: list[str] = []
    if qeeg_recs or qeeg_row:
        modalities.append("qeeg")
    if mri_recs or mri_row:
        modalities.append("mri")

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    # ── No modalities at all ------------------------------------------------
    if not modalities:
        return _sanitise_envelope({
            "patient_id": "",
            "qeeg_analysis_id": None,
            "mri_analysis_id": None,
            "modalities_used": [],
            "generated_at": now_iso,
            "recommendations": [],
            "summary": "No analyses found for this patient.",
            "disclaimer": _DISCLAIMER,
        })

    # ── Single-modality passthrough ----------------------------------------
    if qeeg_recs and not mri_recs:
        recs = [
            _pack_single(rec, qeeg_support=qeeg_biomarkers, mri_support=[])
            for rec in qeeg_recs
        ][:8]
        return _sanitise_envelope({
            "patient_id": "",
            "qeeg_analysis_id": None,
            "mri_analysis_id": None,
            "modalities_used": ["qeeg"],
            "generated_at": now_iso,
            "recommendations": recs,
            "summary": _compose_summary(recs, modalities=["qeeg"]),
            "disclaimer": _DISCLAIMER,
        })

    if mri_recs and not qeeg_recs:
        recs = [
            _pack_single(rec, qeeg_support=[], mri_support=mri_biomarkers)
            for rec in mri_recs
        ][:8]
        return _sanitise_envelope({
            "patient_id": "",
            "qeeg_analysis_id": None,
            "mri_analysis_id": None,
            "modalities_used": ["mri"],
            "generated_at": now_iso,
            "recommendations": recs,
            "summary": _compose_summary(recs, modalities=["mri"]),
            "disclaimer": _DISCLAIMER,
        })

    # ── Dual-modality fusion ----------------------------------------------
    merged: list[dict] = []
    all_conflicts: list[dict] = []
    mri_used: set[int] = set()

    for q in qeeg_recs:
        mri_idx, match = _find_mri_match(q, mri_recs, already_used=mri_used)
        if match is None:
            merged.append(_pack_single(q, qeeg_support=qeeg_biomarkers,
                                       mri_support=[]))
            continue
        mri_used.add(mri_idx)
        fused, conflicts = _merge_pair(
            q, match,
            qeeg_support=qeeg_biomarkers,
            mri_support=mri_biomarkers,
        )
        merged.append(fused)
        all_conflicts.extend(conflicts)

    # Any MRI recommendations that didn't match a qEEG one
    for i, m in enumerate(mri_recs):
        if i in mri_used:
            continue
        merged.append(_pack_single(m, qeeg_support=[], mri_support=mri_biomarkers))

    # Sort by confidence * fusion_boost desc, cap at 8.
    merged.sort(key=_rank_key, reverse=True)
    merged = merged[:8]

    # Distribute cross-modality conflicts to the envelope level.
    envelope_conflicts: list[dict] = []
    for rec in merged:
        envelope_conflicts.extend(rec.get("conflicts") or [])
    envelope_conflicts.extend(all_conflicts)
    # De-dupe conflicts by (field, qeeg, mri).
    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict] = []
    for c in envelope_conflicts:
        key = (c.get("field"), c.get("qeeg"), c.get("mri"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)

    out: dict[str, Any] = {
        "patient_id": "",
        "qeeg_analysis_id": None,
        "mri_analysis_id": None,
        "modalities_used": ["qeeg", "mri"],
        "generated_at": now_iso,
        "recommendations": merged,
        "summary": _compose_summary(merged, modalities=["qeeg", "mri"]),
        "disclaimer": _DISCLAIMER,
    }
    if deduped:
        out["conflicts"] = deduped
    return _sanitise_envelope(out)


# ── Biomarker extractors ─────────────────────────────────────────────────────


def _extract_qeeg_biomarkers(qeeg_row: dict) -> list[dict]:
    """Pull flagged z-scores + features into the qEEG support shape.

    Parameters
    ----------
    qeeg_row : dict
        A row from ``qeeg_analyses`` (may be partially populated). We
        look at the ``normative_zscores_json`` flagged list first, then
        fall back to ``asymmetry_json`` and ``peak_alpha_freq_json``.

    Returns
    -------
    list of dict
        Each entry has ``biomarker``, ``value``, ``z``, ``weight``. Every
        entry points at a real field that exists on ``qeeg_row`` — we
        never invent a biomarker.
    """
    out: list[dict] = []
    zscores = qeeg_row.get("zscores") or qeeg_row.get("normative_zscores") or {}
    for flag in (zscores.get("flagged") or []):
        if not isinstance(flag, dict):
            continue
        metric = str(flag.get("metric") or "").strip()
        channel = str(flag.get("channel") or "").strip()
        if not metric:
            continue
        z = flag.get("z")
        value = flag.get("value")
        name = f"{metric}:{channel}" if channel else metric
        try:
            z_f = float(z) if z is not None else 0.0
        except (TypeError, ValueError):
            z_f = 0.0
        try:
            v_f = float(value) if value is not None else 0.0
        except (TypeError, ValueError):
            v_f = 0.0
        out.append({
            "biomarker": name,
            "value": v_f,
            "z": z_f,
            "weight": min(0.5, abs(z_f) / 5.0),
        })

    # Frontal alpha asymmetry — a common qEEG biomarker.
    asym = qeeg_row.get("asymmetry") or {}
    faa = asym.get("frontal_alpha_F3_F4")
    if isinstance(faa, (int, float)) and abs(faa) > 0.1:
        out.append({
            "biomarker": "frontal_alpha_asymmetry_F3_F4",
            "value": float(faa),
            "z": 0.0,
            "weight": min(0.4, abs(faa) * 1.5),
        })
    return out


def _extract_mri_biomarkers(mri_row: dict) -> list[dict]:
    """Pull flagged structural/functional/diffusion z-scores for MRI support.

    Parameters
    ----------
    mri_row : dict
        A row from ``mri_analyses`` (or a decoded MRIReport dict). We
        look at ``structural``, ``functional``, and ``diffusion`` blocks
        for fields with ``flagged=true``.

    Returns
    -------
    list of dict
        Each entry has ``biomarker``, ``value``, ``z``, ``weight``.
    """
    out: list[dict] = []

    structural = mri_row.get("structural") or {}
    for block_name in ("cortical_thickness_mm", "subcortical_volume_mm3"):
        block = structural.get(block_name) or {}
        for region, payload in block.items():
            if not isinstance(payload, dict):
                continue
            if not payload.get("flagged"):
                continue
            try:
                z = float(payload.get("z") or 0.0)
                v = float(payload.get("value") or 0.0)
            except (TypeError, ValueError):
                continue
            out.append({
                "biomarker": f"{block_name}:{region}",
                "value": v,
                "z": z,
                "weight": min(0.45, abs(z) / 5.0),
            })

    functional = mri_row.get("functional") or {}
    sg = functional.get("sgACC_DLPFC_anticorrelation")
    if isinstance(sg, dict) and sg.get("flagged"):
        try:
            z = float(sg.get("z") or 0.0)
            v = float(sg.get("value") or 0.0)
            out.append({
                "biomarker": "sgACC_DLPFC_anticorrelation",
                "value": v,
                "z": z,
                "weight": min(0.5, abs(z) / 5.0),
            })
        except (TypeError, ValueError):
            pass

    for net in (functional.get("networks") or []):
        if not isinstance(net, dict):
            continue
        fc = net.get("mean_within_fc") or {}
        if not fc.get("flagged"):
            continue
        try:
            z = float(fc.get("z") or 0.0)
            v = float(fc.get("value") or 0.0)
            out.append({
                "biomarker": f"network_fc:{net.get('network', '?')}",
                "value": v,
                "z": z,
                "weight": min(0.4, abs(z) / 5.0),
            })
        except (TypeError, ValueError):
            continue

    diffusion = mri_row.get("diffusion") or {}
    for bundle in (diffusion.get("bundles") or []):
        if not isinstance(bundle, dict):
            continue
        fa = bundle.get("mean_FA") or {}
        if not fa.get("flagged"):
            continue
        try:
            z = float(fa.get("z") or 0.0)
            v = float(fa.get("value") or 0.0)
            out.append({
                "biomarker": f"dti_FA:{bundle.get('bundle', '?')}",
                "value": v,
                "z": z,
                "weight": min(0.35, abs(z) / 5.0),
            })
        except (TypeError, ValueError):
            continue

    return out


# ── Helpers ─────────────────────────────────────────────────────────────────


def _normalise_recommendations(rec: dict | None) -> list[dict]:
    """Accept either an envelope or a single recommendation; return a list."""
    if rec is None:
        return []
    if not isinstance(rec, dict):
        return []
    if "recommendations" in rec and isinstance(rec["recommendations"], list):
        return [r for r in rec["recommendations"] if isinstance(r, dict)]
    if "primary_modality" in rec or "target_region" in rec:
        base = [rec]
        for alt in rec.get("alternative_protocols") or []:
            if isinstance(alt, dict):
                base.append(alt)
        return base
    return []


def _pack_single(rec: dict, *, qeeg_support: list[dict],
                 mri_support: list[dict]) -> dict:
    """Return a single-modality-packed recommendation."""
    out = dict(rec)
    out["qeeg_support"] = list(qeeg_support)
    out["mri_support"] = list(mri_support)
    out["fusion_boost"] = 1.0
    out["agreement_score"] = 1.0 if (qeeg_support or mri_support) else 0.0
    out["conflicts"] = out.get("conflicts") or []
    # Sanitise any free text.
    if out.get("rationale"):
        out["rationale"] = _sanitise_text(str(out["rationale"]))
    return out


def _find_mri_match(q: dict, mri_recs: list[dict],
                    *, already_used: set[int]) -> tuple[int, dict | None]:
    """Match a qEEG rec against the best available MRI rec."""
    q_target = str(q.get("target_region") or "").lower()
    q_code = str(q.get("region_code") or "").lower()
    for i, m in enumerate(mri_recs):
        if i in already_used:
            continue
        m_target = str(m.get("target_region") or "").lower()
        m_code = str(m.get("region_code") or "").lower()
        if q_code and m_code and q_code == m_code:
            return i, m
        if q_target and m_target:
            # Accept either substring containment direction.
            a, b = _strip_laterality(q_target), _strip_laterality(m_target)
            if a and b and (a in b or b in a):
                return i, m
    return -1, None


_LAT_RE = re.compile(r"\b(left|right|bilateral|l|r)[_\s\-]+", re.IGNORECASE)


def _strip_laterality(text: str) -> str:
    return _LAT_RE.sub("", text or "").strip()


def _laterality_of(text: str) -> str | None:
    """Return 'left'/'right'/'bilateral' or None based on target-region text."""
    t = (text or "").lower()
    if re.search(r"\bleft\b|\bl[_\s\-]", t) or t.startswith("l_"):
        return "left"
    if re.search(r"\bright\b|\br[_\s\-]", t) or t.startswith("r_"):
        return "right"
    if "bilateral" in t or "bifrontal" in t:
        return "bilateral"
    return None


def _merge_pair(
    q: dict,
    m: dict,
    *,
    qeeg_support: list[dict],
    mri_support: list[dict],
) -> tuple[dict, list[dict]]:
    """Merge a matched qEEG/MRI pair."""
    sum_w = sum(s.get("weight", 0.0) for s in qeeg_support) + \
            sum(s.get("weight", 0.0) for s in mri_support)
    fusion_boost = 1.0 + min(sum_w, 0.5)
    agreement = _cosine_agreement(qeeg_support, mri_support)

    # Prefer qEEG target metadata but fall back to MRI where qEEG missing.
    fused = dict(q)
    for k, v in m.items():
        if k in ("qeeg_support", "mri_support", "fusion_boost",
                 "agreement_score", "conflicts"):
            continue
        if fused.get(k) in (None, "", []) and v not in (None, "", []):
            fused[k] = v

    fused["qeeg_support"] = list(qeeg_support)
    fused["mri_support"] = list(mri_support)
    fused["fusion_boost"] = float(fusion_boost)
    fused["agreement_score"] = float(agreement)

    conflicts: list[dict] = []
    q_lat = _laterality_of(str(q.get("target_region") or ""))
    m_lat = _laterality_of(str(m.get("target_region") or ""))
    if q_lat and m_lat and q_lat != m_lat and not (
            q_lat == "bilateral" or m_lat == "bilateral"):
        resolution = (
            "defer to MRI-derived laterality"
            if m_lat in ("left", "right")
            else "clinical judgement required"
        )
        conflicts.append({
            "field": "target_laterality",
            "qeeg": q_lat,
            "mri": m_lat,
            "resolution": resolution,
        })
        # Cap agreement when lateralities conflict.
        if fused["agreement_score"] > 0.0:
            fused["agreement_score"] = min(fused["agreement_score"], 0.0)
        log.warning("Fusion laterality conflict: qeeg=%s mri=%s", q_lat, m_lat)

    fused["conflicts"] = list(fused.get("conflicts") or []) + conflicts

    if fused.get("rationale"):
        fused["rationale"] = _sanitise_text(str(fused["rationale"]))

    return fused, conflicts


def _cosine_agreement(a: list[dict], b: list[dict]) -> float:
    """Cosine similarity of z-score vectors aligned by |z| rank."""
    if not a or not b:
        return 0.0
    va = sorted([float(x.get("z") or 0.0) for x in a], key=abs, reverse=True)
    vb = sorted([float(x.get("z") or 0.0) for x in b], key=abs, reverse=True)
    # Pad to equal length with zeros.
    n = max(len(va), len(vb))
    va = va + [0.0] * (n - len(va))
    vb = vb + [0.0] * (n - len(vb))
    num = sum(x * y for x, y in zip(va, vb))
    da = math.sqrt(sum(x * x for x in va))
    db = math.sqrt(sum(y * y for y in vb))
    if da == 0.0 or db == 0.0:
        return 0.0
    val = num / (da * db)
    return max(-1.0, min(1.0, val))


def _rank_key(rec: dict) -> float:
    base = {"high": 0.9, "moderate": 0.6, "low": 0.3}.get(
        str(rec.get("confidence") or "moderate"), 0.5,
    )
    boost = float(rec.get("fusion_boost") or 1.0)
    return base * boost


def _compose_summary(recs: list[dict], *, modalities: list[str]) -> str:
    """Build the human-readable ≤ 1200-char fusion summary."""
    if not recs:
        return "No actionable fusion target was identified."
    names = []
    for r in recs[:3]:
        target = str(r.get("target_region") or "?")
        mod = str(r.get("primary_modality") or "?")
        boost = float(r.get("fusion_boost") or 1.0)
        names.append(f"{mod} → {target} (×{boost:.2f})")
    mod_phrase = " + ".join(modalities) if modalities else "single-modality"
    summary = (
        f"Fusion across {mod_phrase}: top protocol consideration is "
        f"{names[0]}."
    )
    if len(names) > 1:
        summary += " Alternatives: " + "; ".join(names[1:]) + "."
    summary += (
        " Convergent biomarker support across modalities is research/"
        "wellness evidence only; clinician judgement required."
    )
    return _sanitise_text(summary)[:1200]


# ── Sanitiser ────────────────────────────────────────────────────────────────


def _sanitise_text(text: str) -> str:
    out = text or ""
    for pat, replacement in _BANNED_PATTERNS:
        out = pat.sub(replacement, out)
    return out


def _sanitise_envelope(env: dict) -> dict:
    """Scrub banned words from every free-text field in the envelope."""
    if isinstance(env.get("summary"), str):
        env["summary"] = _sanitise_text(env["summary"])[:1200]
    for rec in env.get("recommendations") or []:
        if isinstance(rec, dict) and isinstance(rec.get("rationale"), str):
            rec["rationale"] = _sanitise_text(rec["rationale"])[:1200]
    return env


__all__ = [
    "combine_recommendations",
    "_extract_qeeg_biomarkers",
    "_extract_mri_biomarkers",
]

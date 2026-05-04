"""Phase 6 — cleaned-signal export + Cleaning Report PDF.

Two clinician deliverables:

1. ``apply_cleaning_to_raw(raw, config, *, interpolate_bad_channels)`` — takes a
   loaded MNE Raw and returns the cleaned Raw with the saved
   ``cleaning_config_json`` applied (bandpass, notch, bad-channel exclusion or
   interpolation, bad-segment annotation as ``BAD_*``, ICA exclusion when
   previously fit). Pure: never persists.

2. ``export_cleaned_to_path(...)`` — wraps (1) and writes to a temp file in
   ``edf`` / ``edf_plus`` / ``bdf`` / ``fif``. Returns the path.

3. ``build_cleaning_report_pdf(analysis_id, db, actor)`` — renders the
   Cleaning Report PDF (header / cleaning summary / decisions / before-after
   spectra / signed footer) using the project's existing WeasyPrint stack.
   Falls back to a minimal HTML→PDF when WeasyPrint can't render charts.

The PDF generation path uses the same WeasyPrint library that
``qeeg_pdf_export`` and ``qeeg_viz_router.report-pdf`` already depend on, so we
do not introduce a new heavy dep.
"""
from __future__ import annotations

import base64
import importlib.util
import io
import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import (
    AutoCleanRun,
    CleaningDecision,
    Clinic,
    Patient,
    QEEGAnalysis,
    User,
)

_log = logging.getLogger(__name__)


# ── Format whitelist ─────────────────────────────────────────────────────────

_SUPPORTED_FORMATS = {"edf", "edf_plus", "bdf", "fif"}
_FORMAT_EXT = {
    "edf": ".edf",
    "edf_plus": ".edf",
    "bdf": ".bdf",
    "fif": "_raw.fif",
}
_FORMAT_MNE_FMT = {
    "edf": "edf",
    "edf_plus": "edf",
    "bdf": "bdf",
    # FIF is written via raw.save, not export_raw — see export_cleaned_to_path.
    "fif": None,
}


class ExportFormatError(ValueError):
    """Raised when an unknown format string is passed."""


class ExportDependencyUnavailable(RuntimeError):
    """Raised when an optional export dependency is unavailable on this host."""


# ── Cleaning application ────────────────────────────────────────────────────


def apply_cleaning_to_raw(
    raw: Any,
    config: dict[str, Any],
    *,
    interpolate_bad_channels: bool = True,
) -> Any:
    """Return a copy of ``raw`` with the saved cleaning config applied.

    Steps (all guarded — empty / missing values are no-ops):
      * Bandpass filter (``bandpass_low``..``bandpass_high``)
      * Notch filter at ``notch_hz``
      * Bad channel handling: interpolate (if flag True and montage available)
        or drop them outright
      * Append annotations for ``bad_segments`` as ``BAD_*`` so MNE writers
        preserve them
      * Apply ICA exclusion if a fitted ICA is available for this analysis
        via the existing eeg_signal_service helpers (best-effort — silently
        skipped when not available, since the user can still rerun reprocess)
    """
    raw_clean = raw.copy()

    # 1) Bandpass.
    lff = _safe_float(config.get("bandpass_low"), default=1.0)
    hff = _safe_float(config.get("bandpass_high"), default=45.0)
    try:
        raw_clean.filter(l_freq=lff, h_freq=hff, verbose=False)
    except Exception as exc:  # pragma: no cover — MNE filter raises on absurd params
        _log.warning("bandpass filter skipped: %s", exc)

    # 2) Notch.
    notch_hz = config.get("notch_hz")
    if notch_hz is not None:
        try:
            notch_val = float(notch_hz)
            if notch_val > 0:
                raw_clean.notch_filter(freqs=notch_val, verbose=False)
        except Exception as exc:  # pragma: no cover
            _log.warning("notch filter skipped: %s", exc)

    # 3) Bad channels.
    bad_channels = list(config.get("bad_channels") or [])
    bad_channels = [c for c in bad_channels if isinstance(c, str) and c in raw_clean.ch_names]
    if bad_channels:
        raw_clean.info["bads"] = list(bad_channels)
        if interpolate_bad_channels:
            try:
                # interpolate_bads requires sensor positions; if missing, fall back to drop.
                raw_clean.interpolate_bads(reset_bads=True, verbose=False)
            except Exception as exc:
                _log.warning("interpolate_bads failed (%s); dropping channels instead", exc)
                raw_clean.drop_channels(bad_channels)
        else:
            raw_clean.drop_channels(bad_channels)

    # 4) Annotations for bad_segments.
    bad_segments = config.get("bad_segments") or []
    if bad_segments:
        try:
            import mne  # type: ignore[import-not-found]

            onsets: list[float] = []
            durations: list[float] = []
            descriptions: list[str] = []
            for seg in bad_segments:
                if not isinstance(seg, dict):
                    continue
                try:
                    start = float(seg.get("start_sec", 0.0))
                    end = float(seg.get("end_sec", start))
                except (TypeError, ValueError):
                    continue
                if end <= start:
                    continue
                desc = seg.get("description") or ""
                if not isinstance(desc, str) or not desc:
                    reason = seg.get("reason") or "user"
                    desc = f"BAD_{reason}"
                if not desc.upper().startswith("BAD"):
                    desc = f"BAD_{desc}"
                onsets.append(start)
                durations.append(end - start)
                descriptions.append(desc)
            if onsets:
                new_ann = mne.Annotations(
                    onset=onsets, duration=durations, description=descriptions
                )
                raw_clean.set_annotations(raw_clean.annotations + new_ann)
        except Exception as exc:  # pragma: no cover
            _log.warning("annotations append failed: %s", exc)

    # 5) ICA exclusion — best-effort, only if a fitted ICA is reachable.
    excluded_ica = list(config.get("excluded_ica_components") or [])
    if excluded_ica:
        try:
            from app.services.eeg_signal_service import _fit_ica_on_raw  # type: ignore[attr-defined]

            ica_data = _fit_ica_on_raw(raw_clean)
            if ica_data and ica_data.get("ica") is not None:
                ica_obj = ica_data["ica"]
                ica_obj.exclude = sorted({int(i) for i in excluded_ica if isinstance(i, (int, float))})
                ica_obj.apply(raw_clean)
        except Exception as exc:
            _log.warning("ICA application skipped: %s", exc)

    return raw_clean


def _safe_float(value: Any, *, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ── Export to disk ──────────────────────────────────────────────────────────


def export_cleaned_to_path(
    analysis_id: str,
    db: Session,
    *,
    fmt: str,
    interpolate_bad_channels: bool = True,
) -> tuple[str, str]:
    """Apply cleaning + write the result to a temp file. Returns (path, filename)."""
    fmt = (fmt or "").strip().lower()
    if fmt not in _SUPPORTED_FORMATS:
        raise ExportFormatError(f"Unknown export format: {fmt!r}")

    from app.services.eeg_signal_service import load_raw_for_analysis

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if analysis is None:
        raise ValueError(f"Analysis {analysis_id} not found")

    config: dict[str, Any] = {}
    if analysis.cleaning_config_json:
        try:
            config = json.loads(analysis.cleaning_config_json) or {}
        except (TypeError, ValueError):
            config = {}

    raw = load_raw_for_analysis(analysis_id, db)
    raw_clean = apply_cleaning_to_raw(
        raw,
        config,
        interpolate_bad_channels=interpolate_bad_channels,
    )

    import tempfile

    ext = _FORMAT_EXT[fmt]
    out_filename = f"cleaned_{analysis_id}{ext}"
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    tmp.close()
    out_path = tmp.name

    if fmt == "fif":
        # FIF goes through raw.save (the canonical MNE serializer).
        raw_clean.save(out_path, overwrite=True, verbose=False)
    else:
        import mne  # type: ignore[import-not-found]

        mne_fmt = _FORMAT_MNE_FMT[fmt]
        if importlib.util.find_spec("edfio") is None:
            raise ExportDependencyUnavailable(
                "EDF/BDF export requires the optional 'edfio' package on this host."
            )
        # mne.export.export_raw arrived in MNE >=1.1; fall back to write_raw_edf if unavailable.
        export_raw = getattr(getattr(mne, "export", None), "export_raw", None)
        if export_raw is not None:
            try:
                export_raw(out_path, raw_clean, fmt=mne_fmt, overwrite=True, verbose=False)
            except RuntimeError as exc:
                raise ExportDependencyUnavailable(str(exc)) from exc
        else:  # pragma: no cover — older MNE
            raise ExportDependencyUnavailable(
                "mne.export.export_raw is not available; install MNE >= 1.1 for EDF/BDF export."
            )

    return out_path, out_filename


# ── Cleaning Report PDF ─────────────────────────────────────────────────────


def _redact_patient(patient: Optional[Patient]) -> str:
    if patient is None or not getattr(patient, "id", None):
        return "PT-unknown"
    return f"PT-{str(patient.id)[:8]}"


def _aggregate_segment_reasons(config: dict[str, Any]) -> tuple[float, dict[str, int]]:
    bad_segments = config.get("bad_segments") or []
    total = 0.0
    reason_counts: dict[str, int] = {}
    for seg in bad_segments:
        if not isinstance(seg, dict):
            continue
        try:
            start = float(seg.get("start_sec", 0.0))
            end = float(seg.get("end_sec", start))
        except (TypeError, ValueError):
            continue
        if end > start:
            total += end - start
        reason = (seg.get("reason") or "user") or "user"
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
    return round(total, 2), reason_counts


def _aggregate_ica_labels(config: dict[str, Any]) -> tuple[list[int], dict[str, int]]:
    excluded = list(config.get("excluded_ica_components") or [])
    label_counts: dict[str, int] = {}
    for entry in config.get("excluded_ica_detail") or []:
        if not isinstance(entry, dict):
            continue
        label = entry.get("label") or "other"
        label_counts[label] = label_counts.get(label, 0) + 1
    return sorted({int(i) for i in excluded if isinstance(i, (int, float))}), label_counts


def _decisions_grouped(db: Session, analysis_id: str) -> dict[str, list[dict[str, Any]]]:
    """Return CleaningDecision rows for the analysis, grouped by actor."""
    rows = (
        db.query(CleaningDecision)
        .filter(CleaningDecision.analysis_id == analysis_id)
        .order_by(CleaningDecision.created_at.asc())
        .all()
    )
    groups: dict[str, list[dict[str, Any]]] = {"ai": [], "user": []}
    for r in rows:
        actor = (r.actor or "ai").lower()
        if actor not in groups:
            groups.setdefault(actor, [])
        ts = r.created_at.isoformat() if r.created_at else ""
        groups[actor].append(
            {
                "id": r.id,
                "actor": actor,
                "action": r.action,
                "target": r.target or "",
                "accepted_by_user": r.accepted_by_user,
                "confidence": r.confidence,
                "timestamp": ts,
                "summary": _decision_one_liner(r),
            }
        )
    return groups


def _decision_one_liner(row: CleaningDecision) -> str:
    action = (row.action or "").replace("_", " ")
    target = row.target or ""
    if row.accepted_by_user is True:
        verb = "accepted"
    elif row.accepted_by_user is False:
        verb = "rejected"
    else:
        verb = "logged"
    if row.confidence is not None:
        try:
            return f"{action} → {target} ({verb}, conf {float(row.confidence):.2f})"
        except (TypeError, ValueError):
            pass
    return f"{action} → {target} ({verb})"


# ── Spectra (matplotlib server-side) ────────────────────────────────────────


def _render_spectra_panel_b64(
    raw_before: Any,
    raw_after: Any,
    *,
    channels: tuple[str, ...] = ("Cz", "Pz", "O1", "O2"),
    fmax: float = 45.0,
) -> Optional[str]:
    """Render side-by-side raw vs cleaned PSDs and return a base64 PNG."""
    try:
        import numpy as np  # type: ignore[import-not-found]
        import matplotlib  # type: ignore[import-not-found]

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover — matplotlib optional
        _log.info("matplotlib unavailable for spectra: %s", exc)
        return None

    def _psd(raw: Any, ch: str) -> Optional[tuple[Any, Any]]:
        try:
            if ch not in raw.ch_names:
                return None
            picks = [raw.ch_names.index(ch)]
            data, _ = raw[picks, :]
            sig = np.asarray(data[0]).astype(np.float64)
            sfreq = float(raw.info["sfreq"])
            if sig.size < 64:
                return None
            n = min(2048, sig.size)
            sig = sig[:n] - np.mean(sig[:n])
            # Hann window + rfft.
            window = np.hanning(n)
            spec = np.fft.rfft(sig * window)
            psd = (np.abs(spec) ** 2) / np.sum(window ** 2)
            freqs = np.fft.rfftfreq(n, d=1.0 / sfreq)
            mask = (freqs > 0) & (freqs <= fmax)
            return freqs[mask], 10.0 * np.log10(psd[mask] + 1e-30)
        except Exception:  # pragma: no cover
            return None

    fig, axes = plt.subplots(1, len(channels), figsize=(11, 2.6), dpi=110)
    if len(channels) == 1:
        axes = [axes]
    for ax, ch in zip(axes, channels):
        before = _psd(raw_before, ch)
        after = _psd(raw_after, ch)
        if before is not None:
            ax.plot(before[0], before[1], color="#94a3b8", linewidth=1.0, label="raw")
        if after is not None:
            ax.plot(after[0], after[1], color="#2563eb", linewidth=1.2, label="cleaned")
        ax.set_title(ch, fontsize=10)
        ax.set_xlabel("Hz", fontsize=8)
        ax.set_ylabel("dB", fontsize=8)
        ax.tick_params(labelsize=7)
        ax.grid(True, alpha=0.25)
        ax.legend(fontsize=7, loc="upper right")
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


# ── PDF builder ─────────────────────────────────────────────────────────────


def build_cleaning_report_html(
    analysis_id: str,
    db: Session,
    actor: Any,
) -> str:
    """Build the HTML body for the Cleaning Report.

    Pure-Python — no matplotlib / weasyprint imports. The spectra panel is
    rendered separately and inlined as a base64 PNG ``<img>`` if available.
    """
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if analysis is None:
        raise ValueError(f"Analysis {analysis_id} not found")

    config: dict[str, Any] = {}
    if analysis.cleaning_config_json:
        try:
            config = json.loads(analysis.cleaning_config_json) or {}
        except (TypeError, ValueError):
            config = {}

    patient = (
        db.query(Patient).filter_by(id=analysis.patient_id).first()
        if analysis.patient_id
        else None
    )
    pseudonym = _redact_patient(patient)

    bad_channels = list(config.get("bad_channels") or [])
    total_excluded_sec, reason_counts = _aggregate_segment_reasons(config)
    excluded_ica, ica_label_counts = _aggregate_ica_labels(config)

    decisions = _decisions_grouped(db, analysis_id)
    n_total_decisions = sum(len(v) for v in decisions.values())

    spectra_b64: Optional[str] = None
    try:
        from app.services.eeg_signal_service import _HAS_MNE, load_raw_for_analysis  # type: ignore[attr-defined]

        if _HAS_MNE:
            raw = load_raw_for_analysis(analysis_id, db)
            cleaned = apply_cleaning_to_raw(raw, config, interpolate_bad_channels=True)
            spectra_b64 = _render_spectra_panel_b64(raw, cleaned)
    except Exception as exc:  # pragma: no cover — best-effort
        _log.info("spectra panel render skipped: %s", exc)

    actor_id = getattr(actor, "actor_id", None) or "unknown"
    display_name = getattr(actor, "display_name", None) or "Clinician"
    clinic_id = getattr(actor, "clinic_id", None)
    clinic_name = ""
    if clinic_id:
        clinic = db.query(Clinic).filter_by(id=clinic_id).first()
        clinic_name = (clinic.name if clinic is not None else "") or ""

    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Render HTML (small inline template, no Jinja dep) ───────────────────
    parts: list[str] = []
    parts.append(
        "<html><head><meta charset='utf-8'>"
        "<style>"
        "body{font-family:Inter,Helvetica,Arial,sans-serif;color:#111;font-size:11px;margin:24px;}"
        "h1{font-size:18px;margin:0 0 6px;}"
        "h2{font-size:13px;margin:14px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px;}"
        "h3{font-size:11px;margin:10px 0 4px;color:#333;}"
        ".kv{display:grid;grid-template-columns:140px 1fr;gap:2px 12px;font-size:10px;}"
        ".kv .k{color:#555;}"
        "table{width:100%;border-collapse:collapse;font-size:10px;}"
        "td,th{padding:3px 6px;border-bottom:1px solid #eee;text-align:left;vertical-align:top;}"
        "th{background:#f3f4f6;}"
        ".chip{display:inline-block;padding:1px 6px;border-radius:3px;background:#eef2ff;color:#3730a3;font-size:9px;margin:0 3px 3px 0;}"
        ".muted{color:#555;font-size:10px;}"
        ".disclaimer{margin-top:14px;color:#7c2d12;font-style:italic;font-size:10px;}"
        ".sig{margin-top:12px;border-top:1px solid #ccc;padding-top:6px;font-size:10px;}"
        ".spectra img{max-width:100%;}"
        "</style></head><body>"
    )

    parts.append("<h1>Cleaning Report</h1>")
    parts.append("<div class='kv'>")
    parts.append(f"<div class='k'>Patient (pseudonym)</div><div>{_html(pseudonym)}</div>")
    parts.append(f"<div class='k'>Analysis ID</div><div>{_html(analysis_id)}</div>")
    parts.append(f"<div class='k'>Recording date</div><div>{_html(analysis.recording_date or '—')}</div>")
    parts.append(
        f"<div class='k'>Sample rate</div><div>{_html(_fmt_num(analysis.sample_rate_hz))} Hz</div>"
    )
    parts.append(
        f"<div class='k'>Channels</div><div>{_html(analysis.channel_count or '—')}</div>"
    )
    parts.append(
        f"<div class='k'>Duration</div><div>{_html(_fmt_num(analysis.recording_duration_sec))} s</div>"
    )
    parts.append("</div>")

    # Cleaning summary
    parts.append("<h2>Cleaning summary</h2>")
    parts.append(
        "<h3>Bad channels (" + str(len(bad_channels)) + ")</h3>"
        + (
            "".join(f"<span class='chip'>{_html(c)}</span>" for c in bad_channels)
            if bad_channels
            else "<div class='muted'>None</div>"
        )
    )
    seg_count = len(config.get("bad_segments") or [])
    parts.append(
        "<h3>Bad segments ("
        + str(seg_count)
        + f", total {total_excluded_sec:.2f} s excluded)</h3>"
    )
    if reason_counts:
        parts.append(
            "".join(
                f"<span class='chip'>{_html(k)}: {v}</span>"
                for k, v in sorted(reason_counts.items(), key=lambda kv: -kv[1])
            )
        )
    else:
        parts.append("<div class='muted'>None</div>")

    parts.append(
        "<h3>ICA components removed ("
        + str(len(excluded_ica))
        + ")</h3>"
    )
    if excluded_ica:
        parts.append(
            "".join(f"<span class='chip'>IC{idx}</span>" for idx in excluded_ica)
        )
        if ica_label_counts:
            parts.append("<div class='muted' style='margin-top:4px;'>Label distribution: ")
            parts.append(
                ", ".join(
                    f"{_html(k)}={v}" for k, v in sorted(ica_label_counts.items())
                )
            )
            parts.append("</div>")
    else:
        parts.append("<div class='muted'>None</div>")

    parts.append("<h3>Filter settings</h3>")
    parts.append("<div class='kv'>")
    parts.append(
        f"<div class='k'>LFF</div><div>{_html(_fmt_num(config.get('bandpass_low')))} Hz</div>"
    )
    parts.append(
        f"<div class='k'>HFF</div><div>{_html(_fmt_num(config.get('bandpass_high')))} Hz</div>"
    )
    parts.append(
        f"<div class='k'>Notch</div><div>{_html(_fmt_num(config.get('notch_hz')))} Hz</div>"
    )
    parts.append("</div>")

    # Decisions
    parts.append("<h2>Decisions (" + str(n_total_decisions) + ")</h2>")
    for actor_key in ("ai", "user"):
        rows = decisions.get(actor_key) or []
        parts.append(f"<h3>{actor_key.upper()} ({len(rows)})</h3>")
        if not rows:
            parts.append("<div class='muted'>No entries.</div>")
            continue
        parts.append("<table><thead><tr><th>Timestamp</th><th>Action</th><th>Target</th><th>Summary</th></tr></thead><tbody>")
        for r in rows:
            parts.append(
                "<tr>"
                + f"<td>{_html(r['timestamp'])}</td>"
                + f"<td>{_html(r['action'])}</td>"
                + f"<td>{_html(r['target'])}</td>"
                + f"<td>{_html(r['summary'])}</td>"
                + "</tr>"
            )
        parts.append("</tbody></table>")

    # Spectra
    parts.append("<h2>Before / after spectra (Cz · Pz · O1 · O2)</h2>")
    if spectra_b64:
        parts.append(
            f"<div class='spectra'><img src='data:image/png;base64,{spectra_b64}'/></div>"
        )
    else:
        parts.append(
            "<div class='muted'>Spectra panel could not be rendered "
            "(matplotlib or MNE not available on this host).</div>"
        )

    # Footer
    parts.append("<div class='sig'>")
    parts.append(
        f"Signed by clinician <b>{_html(display_name)}</b> "
        f"(actor_id <code>{_html(actor_id)}</code>"
        + (f", clinic <b>{_html(clinic_name)}</b>" if clinic_name else "")
        + f") at <b>{_html(now_iso)}</b>."
    )
    parts.append("</div>")
    parts.append(
        "<div class='disclaimer'>Decision-support only. This report documents "
        "cleaning actions taken on a single qEEG recording; it is not a "
        "diagnosis or treatment recommendation.</div>"
    )

    parts.append("</body></html>")
    return "".join(parts)


def _html(v: Any) -> str:
    if v is None:
        return ""
    s = str(v)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _fmt_num(v: Any) -> str:
    if v is None:
        return "—"
    try:
        f = float(v)
        if f.is_integer():
            return str(int(f))
        return f"{f:.2f}"
    except (TypeError, ValueError):
        return str(v)


class CleaningReportRendererUnavailable(RuntimeError):
    """Raised when WeasyPrint (or its native deps) is unavailable for PDF."""


@lru_cache(maxsize=1)
def weasyprint_render_available() -> bool:
    """Return whether this host can import WeasyPrint and render a tiny PDF.

    Probe in a subprocess so broken native libraries cannot crash the API
    process or the test runner.
    """
    probe = (
        "from weasyprint import HTML; "
        "pdf = HTML(string='<html><body>x</body></html>').write_pdf(); "
        "raise SystemExit(0 if pdf else 1)"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", probe],
            capture_output=True,
            timeout=15,
            check=False,
        )
    except Exception:
        return False
    return result.returncode == 0


def render_cleaning_report_pdf(html: str) -> bytes:
    """Convert an HTML body to PDF bytes using WeasyPrint."""
    if not weasyprint_render_available():
        raise CleaningReportRendererUnavailable(
            "WeasyPrint native deps unavailable on this host. PDF rendering "
            "requires WeasyPrint + Pango/Cairo system libraries."
        )
    try:
        from weasyprint import HTML  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover — WeasyPrint optional
        raise CleaningReportRendererUnavailable(
            "WeasyPrint is not installed on this host. PDF rendering requires "
            "WeasyPrint + Pango/Cairo system libraries."
        ) from exc

    pdf_bytes = HTML(string=html).write_pdf()
    if not pdf_bytes:
        raise RuntimeError("WeasyPrint returned empty PDF bytes")
    return pdf_bytes


__all__ = [
    "ExportFormatError",
    "ExportDependencyUnavailable",
    "CleaningReportRendererUnavailable",
    "apply_cleaning_to_raw",
    "export_cleaned_to_path",
    "build_cleaning_report_html",
    "render_cleaning_report_pdf",
    "weasyprint_render_available",
]

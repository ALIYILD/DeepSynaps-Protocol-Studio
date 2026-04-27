"""
MNE report builder with Plotly SVG exports for the qEEG analyzer.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

try:
    import mne
    from mne import Report
except Exception:  # pragma: no cover
    mne = None
    Report = None  # type: ignore

try:
    import plotly.graph_objects as go
    import plotly.io as pio
except Exception:  # pragma: no cover
    go = None
    pio = None

try:
    from weasyprint import HTML
except Exception:  # pragma: no cover
    HTML = None


BAND_ORDER = ["delta", "theta", "alpha", "beta", "gamma"]
BAND_RANGES_HZ = {
    "delta": (1, 4),
    "theta": (4, 8),
    "alpha": (8, 13),
    "beta": (13, 30),
    "gamma": (30, 45),
}


def _topomap_figure(
    ch_names: list[str],
    pos_xy: np.ndarray,
    values: np.ndarray,
    title: str,
    symmetric: bool,
) -> "go.Figure":
    if go is None:
        raise RuntimeError("plotly not installed")

    grid_n = 80
    xs = np.linspace(-1, 1, grid_n)
    ys = np.linspace(-1, 1, grid_n)
    xx, yy = np.meshgrid(xs, ys)
    mask = xx**2 + yy**2 > 1.02

    zz = np.zeros_like(xx, dtype=float)
    wsum = np.zeros_like(xx, dtype=float)
    for index in range(pos_xy.shape[0]):
        d2 = (xx - pos_xy[index, 0]) ** 2 + (yy - pos_xy[index, 1]) ** 2 + 1e-6
        weight = 1.0 / (d2**2)
        zz += weight * values[index]
        wsum += weight
    zz = zz / wsum
    zz[mask] = np.nan

    abs_max = max(1e-6, float(np.nanmax(np.abs(values))))
    zmin, zmax = (-abs_max, abs_max) if symmetric else (0.0, abs_max)

    fig = go.Figure()
    fig.add_trace(
        go.Contour(
            x=xs,
            y=ys,
            z=zz,
            colorscale="RdBu_r" if symmetric else "viridis",
            zmin=zmin,
            zmax=zmax,
            reversescale=symmetric,
            contours=dict(coloring="heatmap", showlabels=False),
            showscale=True,
        )
    )
    fig.add_trace(
        go.Scatter(
            x=pos_xy[:, 0],
            y=pos_xy[:, 1],
            mode="markers+text",
            text=ch_names,
            textposition="top center",
            marker=dict(color="#111", size=6, line=dict(color="white", width=1)),
            textfont=dict(size=9),
            hoverinfo="text",
            showlegend=False,
        )
    )
    theta = np.linspace(0, 2 * np.pi, 256)
    fig.add_trace(
        go.Scatter(
            x=np.cos(theta),
            y=np.sin(theta),
            mode="lines",
            line=dict(color="#111", width=2),
            hoverinfo="skip",
            showlegend=False,
        )
    )
    fig.update_layout(
        title=title,
        width=360,
        height=360,
        margin=dict(l=8, r=8, t=40, b=8),
        plot_bgcolor="white",
        paper_bgcolor="white",
        xaxis=dict(visible=False, range=[-1.15, 1.15]),
        yaxis=dict(visible=False, range=[-1.15, 1.25], scaleanchor="x"),
    )
    return fig


def _bandpower_bar(zscores: dict[str, np.ndarray]) -> "go.Figure":
    if go is None:
        raise RuntimeError("plotly not installed")
    mean_z = [float(np.nanmean(zscores[band])) for band in BAND_ORDER]
    colors = ["#c93b3b" if abs(value) > 2 else "#2a6df4" for value in mean_z]
    fig = go.Figure(go.Bar(x=BAND_ORDER, y=mean_z, marker_color=colors))
    fig.add_hline(y=2, line=dict(dash="dash", color="#aaa"))
    fig.add_hline(y=-2, line=dict(dash="dash", color="#aaa"))
    fig.update_layout(
        title="Global band-power z-score",
        yaxis_title="z vs normative db",
        template="simple_white",
        width=720,
        height=320,
        margin=dict(l=50, r=20, t=40, b=40),
    )
    return fig


def _brainring_payload(
    fc_matrix: np.ndarray,
    roi_labels: list[str],
    networks: list[str] | None,
    threshold: float = 0.3,
) -> dict[str, Any]:
    assert fc_matrix.shape[0] == fc_matrix.shape[1] == len(roi_labels)
    nodes = [
        {
            "id": index,
            "label": roi_labels[index],
            "network": networks[index] if networks else None,
        }
        for index in range(len(roi_labels))
    ]
    edges = []
    size = fc_matrix.shape[0]
    for left in range(size):
        for right in range(left + 1, size):
            weight = float(fc_matrix[left, right])
            if abs(weight) >= threshold:
                edges.append(
                    {
                        "source": left,
                        "target": right,
                        "weight": abs(weight),
                        "sign": 1 if weight >= 0 else -1,
                    }
                )
    return {
        "type": "brainring/load",
        "atlas": f"Schaefer-{size}" if size in (100, 200, 400) else f"Custom-{size}",
        "nodes": nodes,
        "edges": edges,
        "threshold": threshold,
    }


def build_report(
    case_id: str,
    raw: "mne.io.BaseRaw",
    bandpower: dict[str, np.ndarray],
    zscores: dict[str, np.ndarray],
    fc_matrix: np.ndarray | None = None,
    roi_labels: list[str] | None = None,
    networks: list[str] | None = None,
    out_dir: Path | str = "./out",
) -> dict[str, Path]:
    if Report is None:
        raise RuntimeError("mne is required for mne_report_builder")
    if pio is None:
        raise RuntimeError("plotly and kaleido are required for mne_report_builder")

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    info = raw.info.copy().pick("eeg")
    ch_names = info["ch_names"]
    pos3d = np.array([info["chs"][idx]["loc"][:3] for idx in range(len(ch_names))])
    radial = np.linalg.norm(pos3d[:, :2], axis=1) + 1e-9
    pos_xy = pos3d[:, :2] / max(radial.max(), 1e-9)

    report = Report(title=f"qEEG report - {case_id}", subject=case_id, verbose=False)
    report.add_raw(raw=raw, title="Raw QA", psd=True)

    for band in BAND_ORDER:
        power_fig = _topomap_figure(
            ch_names,
            pos_xy,
            bandpower[band],
            f"{band.title()} power ({BAND_RANGES_HZ[band][0]}-{BAND_RANGES_HZ[band][1]} Hz)",
            symmetric=False,
        )
        z_fig = _topomap_figure(
            ch_names,
            pos_xy,
            zscores[band],
            f"{band.title()} z-score",
            symmetric=True,
        )
        power_path = out / f"topo_{band}_power.svg"
        z_path = out / f"topo_{band}_z.svg"
        power_path.write_bytes(pio.to_image(power_fig, format="svg"))
        z_path.write_bytes(pio.to_image(z_fig, format="svg"))
        report.add_image(
            image=power_path,
            title=f"{band} power",
            caption=f"{band} band absolute power",
            section="Topomaps",
        )
        report.add_image(
            image=z_path,
            title=f"{band} z",
            caption=f"{band} band z-score vs normative db",
            section="Topomaps",
        )

    bar_path = out / "bandpower_bar.svg"
    bar_path.write_bytes(pio.to_image(_bandpower_bar(zscores), format="svg"))
    report.add_image(image=bar_path, title="Band-power z-summary", section="Summary")

    brainring_path = out / "brainring_payload.json"
    if fc_matrix is not None and roi_labels is not None:
        payload = _brainring_payload(fc_matrix, roi_labels, networks)
        brainring_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        if go is not None:
            fc_fig = go.Figure(
                go.Heatmap(
                    z=fc_matrix,
                    x=roi_labels,
                    y=roi_labels,
                    colorscale="RdBu_r",
                    zmin=-1,
                    zmax=1,
                    reversescale=True,
                )
            )
            fc_fig.update_layout(
                title="Functional connectivity (source-level)",
                width=600,
                height=600,
                margin=dict(l=60, r=20, t=40, b=60),
            )
            fc_path = out / "fc_matrix.svg"
            fc_path.write_bytes(pio.to_image(fc_fig, format="svg"))
            report.add_image(image=fc_path, title="FC matrix", section="Connectivity")

    html_path = out / "qeeg_report.html"
    report.save(html_path, overwrite=True, open_browser=False)

    pdf_path = out / "qeeg_report.pdf"
    if HTML is not None:
        HTML(filename=str(html_path)).write_pdf(str(pdf_path))

    return {
        "html": html_path,
        "pdf": pdf_path,
        "brainring_payload": brainring_path,
    }

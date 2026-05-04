"""Report document JSON → printable HTML (internal PDF path)."""

from __future__ import annotations

from typing import Any

from app.report.resolve import resolve_placeholders


def _plain(s: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", s)


def document_to_html(doc: dict[str, Any], ctx: dict[str, Any]) -> str:
    """Turn studio ReportDocument JSON into a full HTML page."""
    title = str(doc.get("title") or "EEG Report")
    title_res = resolve_txt(title, ctx)
    blocks = doc.get("blocks") or []
    parts: list[str] = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        f"<title>{_esc(_plain(title_res))}</title>",
        "<style>",
        "body{font-family:Segoe UI,Roboto,Arial,sans-serif;margin:24px;line-height:1.45;}",
        ".block{border:1px solid #ddd;border-radius:6px;padding:12px;margin:12px 0;}",
        ".ds-missing-var{color:#b91c1c;background:#fef2f2;padding:0 4px;}",
        "h1{font-size:20px;} h2{font-size:16px;} table{border-collapse:collapse;width:100%;}",
        "td,th{border:1px solid #ccc;padding:6px;font-size:12px;}",
        "</style></head><body>",
        f"<h1>{title_res}</h1>",
    ]

    for b in blocks:
        bt = b.get("type")
        if bt == "heading":
            lvl = min(3, max(1, int(b.get("level") or 2)))
            parts.append(f"<h{lvl}>{_esc(resolve_txt(b.get('text') or '', ctx))}</h{lvl}>")
        elif bt == "paragraph":
            parts.append(f"<p>{resolve_txt(b.get('text') or '', ctx)}</p>")
        elif bt == "patientCard":
            inner = _patient_card_html(ctx)
            parts.append(f"<div class='block'><h2>Patient</h2>{inner}</div>")
        elif bt == "findings":
            t = resolve_txt(b.get("text") or "", ctx)
            parts.append(f"<div class='block'><h2>EEG Findings</h2><p>{t}</p></div>")
        elif bt == "spectraGrid":
            parts.append(
                "<div class='block'><h2>Spectral topomaps</h2>"
                "<p><em>Figure grid placeholder — export from Spectra viewer.</em></p></div>"
            )
        elif bt == "indicesTable":
            parts.append("<div class='block'><h2>Indices</h2>" + _indices_table_html(ctx) + "</div>")
        elif bt == "erpFigure":
            parts.append(
                "<div class='block'><h2>ERP</h2><p><em>ERP figure placeholder.</em></p></div>"
            )
        elif bt == "sourceFigure":
            parts.append(
                "<div class='block'><h2>Source localization</h2>"
                "<p><em>Source figure placeholder (M10).</em></p></div>"
            )
        elif bt == "spikeSummary":
            parts.append(
                "<div class='block'><h2>Spike summary</h2>"
                "<p><em>Spike table placeholder (M11).</em></p></div>"
            )
        elif bt == "conclusion":
            t = resolve_txt(b.get("text") or "", ctx)
            parts.append(f"<div class='block'><h2>Conclusion</h2><p>{t}</p></div>")
        elif bt == "recommendation":
            t = resolve_txt(b.get("text") or "", ctx)
            parts.append(f"<div class='block'><h2>Recommendation</h2><p>{t}</p></div>")
        elif bt == "signature":
            t = resolve_txt(b.get("text") or "", ctx)
            parts.append(f"<div class='block'><p>{t}</p></div>")
        elif bt == "pageBreak":
            parts.append("<div style='page-break-after:always'></div>")
        elif bt == "figure":
            cap = resolve_txt(b.get("caption") or "Figure", ctx)
            src = b.get("src") or ""
            if src:
                parts.append(
                    f"<div class='block'><figure><img src='{_esc(src)}' style='max-width:100%'/>"
                    f"<figcaption>{cap}</figcaption></figure></div>"
                )
            else:
                parts.append(f"<div class='block'><p><em>{cap}</em></p></div>")
        else:
            parts.append(f"<div class='block'><pre>{_esc(str(b))}</pre></div>")

    parts.append("</body></html>")
    return "".join(parts)


def resolve_txt(s: str, ctx: dict[str, Any]) -> str:
    return resolve_placeholders(s, ctx)


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _patient_card_html(ctx: dict[str, Any]) -> str:
    p = ctx.get("patient") or {}
    rows = [
        ("First name", p.get("firstName")),
        ("Last name", p.get("lastName")),
        ("DOB", p.get("dob")),
        ("Gender", p.get("gender")),
    ]
    tr = "".join(
        f"<tr><th>{_esc(str(a))}</th><td>{_esc(str(b or ''))}</td></tr>" for a, b in rows
    )
    return f"<table>{tr}</table>"


def _indices_table_html(ctx: dict[str, Any]) -> str:
    nz = (ctx.get("indices") or {}).get("normativeZ")
    if not isinstance(nz, dict) or not nz:
        return "<p><em>No normative indices stored on this analysis.</em></p>"
    rows = "".join(
        f"<tr><td>{_esc(str(k))}</td><td>{_esc(str(v))}</td></tr>" for k, v in list(nz.items())[:24]
    )
    return f"<table><tr><th>Metric</th><th>Value</th></tr>{rows}</table>"

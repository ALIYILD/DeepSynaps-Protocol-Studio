"""Minimal RTF export (legacy WinEEG path)."""

from __future__ import annotations

from typing import Any

from app.report.resolve import resolve_placeholders


def _rtf_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def document_to_rtf(doc: dict[str, Any], ctx: dict[str, Any]) -> str:
    """RTF 1.5 subset — readable in Word / LibreOffice."""
    parts: list[str] = [
        r"{\rtf1\ansi\deff0{\fonttbl{\f0 Calibri;}}",
        r"\f0\fs22",
    ]
    title = str(doc.get("title") or "EEG Report")
    parts.append(r"{\b\fs28 " + _rtf_escape(title) + r"}\par\par")

    for b in doc.get("blocks") or []:
        bt = b.get("type")
        if bt == "heading":
            t = _rtf_escape(resolve_placeholders(str(b.get("text") or ""), ctx))
            parts.append(r"{\b\fs26 " + t + r"}\par")
        elif bt in ("paragraph", "findings", "conclusion", "recommendation", "signature"):
            plain = resolve_placeholders(str(b.get("text") or ""), ctx)
            import re

            plain = re.sub(r"<[^>]+>", "", plain)
            parts.append(_rtf_escape(plain) + r"\par")
        elif bt == "pageBreak":
            parts.append(r"\page")
        else:
            parts.append(_rtf_escape(str(bt)) + r"\par")

    parts.append("}")
    return "".join(parts)

"""HTML → PDF via WeasyPrint (internal renderer)."""

from __future__ import annotations


def html_to_pdf_bytes(html: str) -> bytes:
    from weasyprint import HTML

    return HTML(string=html).write_pdf()


def redact_phi_html(html: str) -> str:
    """Strip obvious email/phone patterns for email-ready PDF."""
    import re

    out = re.sub(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        "[REDACTED]",
        html,
    )
    out = re.sub(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b", "[REDACTED]", out)
    return out

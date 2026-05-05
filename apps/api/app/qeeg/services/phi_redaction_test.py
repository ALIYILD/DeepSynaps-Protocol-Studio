from __future__ import annotations

from app.qeeg.services.phi_redaction import redact_phi


def test_redact_phi_removes_common_identifiers_en_and_tr() -> None:
    text = (
        "Patient: John Smith, DOB: 1992-03-04, Address: 12 Baker St.\n"
        "Hasta: Ahmet Yılmaz, Doğum Tarihi: 04.03.1992, Adres: İstiklal Cd. 12\n"
        "Phone: +90 555 123 45 67, Email: ahmet@example.com\n"
        "TCKN: 10000000146\n"
    )
    out = redact_phi(text)
    redacted = out.redacted_text
    assert "[REDACTED:DATE]" in redacted
    assert "[REDACTED:EMAIL]" in redacted
    assert "[REDACTED:PHONE]" in redacted
    assert "[REDACTED:ID]" in redacted
    assert "1992-03-04" not in redacted
    assert "04.03.1992" not in redacted
    assert "ahmet@example.com" not in redacted
    assert "555 123 45 67" not in redacted
    assert "10000000146" not in redacted


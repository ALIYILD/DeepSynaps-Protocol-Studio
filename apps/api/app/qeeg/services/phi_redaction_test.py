from __future__ import annotations

import pytest

from app.qeeg.services.phi_redaction import redact_phi


@pytest.mark.parametrize(
    "text, must_remove, must_include_token, expected_categories",
    [
        # EN: ISO date + email + phone
        (
            "Patient John Smith DOB 1992-03-04 email john.smith@example.com phone +1 415-555-1212",
            ["1992-03-04", "john.smith@example.com", "415-555-1212"],
            ["[REDACTED:DATE]", "[REDACTED:EMAIL]", "[REDACTED:PHONE]"],
            {"date", "email", "phone"},
        ),
        # EN: alt date separators + phone without country code
        (
            "DOB: 03.04.1992 Phone 555 123 45 67",
            ["03.04.1992", "555 123 45 67"],
            ["[REDACTED:DATE]", "[REDACTED:PHONE]"],
            {"date", "phone"},
        ),
        # TR: dotted date + TR phone + email + TCKN
        (
            "Hasta: Ahmet Yılmaz, Doğum Tarihi: 04.03.1992, Tel: +90 555 123 45 67, Email: ahmet@example.com, TCKN: 10000000146",
            ["04.03.1992", "555 123 45 67", "ahmet@example.com", "10000000146"],
            ["[REDACTED:DATE]", "[REDACTED:PHONE]", "[REDACTED:EMAIL]", "[REDACTED:ID]"],
            {"date", "phone", "email", "national_id"},
        ),
        # TR: phone with leading 0 and parentheses
        (
            "Telefon: 0 (532) 123 45 67",
            ["0 (532) 123 45 67", "532) 123 45 67"],
            ["[REDACTED:PHONE]"],
            {"phone"},
        ),
        # EN: multiple emails
        (
            "Emails: a@example.com; b.smith+test@foo.bar",
            ["a@example.com", "b.smith+test@foo.bar"],
            ["[REDACTED:EMAIL]"],
            {"email"},
        ),
        # EN: obvious TC-like 11 digits should redact as national_id (best-effort)
        (
            "TCKN 10000000146 is recorded.",
            ["10000000146"],
            ["[REDACTED:ID]"],
            {"national_id"},
        ),
        # MRN / patient id labels
        (
            "MRN: 12345678, Patient ID: 987654, Protocol No: 11223344",
            ["MRN: 12345678", "Patient ID: 987654", "Protocol No: 11223344"],
            ["MRN: [REDACTED:MRN]"],
            {"mrn"},
        ),
        # TR MRN label variants
        (
            "Hasta No: 123456; Protokol No: 99999999",
            ["123456", "99999999"],
            ["MRN: [REDACTED:MRN]"],
            {"mrn"},
        ),
        # TR tax id (VKN) with label
        (
            "VKN: 1234567890; Vergi Numarası: 0987654321",
            ["1234567890", "0987654321"],
            ["VKN: [REDACTED:TAX_ID]"],
            {"tax_id"},
        ),
        # TR tax id label without colon
        (
            "Vergi no 1234567890",
            ["1234567890"],
            ["VKN: [REDACTED:TAX_ID]"],
            {"tax_id"},
        ),
        # IP address
        (
            "Client IP 192.168.1.10 connected.",
            ["192.168.1.10"],
            ["[REDACTED:IP]"],
            {"ip_address"},
        ),
        # IP in Turkish
        (
            "IP adresi: 10.0.0.1",
            ["10.0.0.1"],
            ["[REDACTED:IP]"],
            {"ip_address"},
        ),
        # Mixed formats + separators
        (
            "DOB 15/01/1980 and 15-01-1980. Phone: (212) 555 12 12. email: a.b+c@foo.co.uk",
            ["15/01/1980", "15-01-1980", "212) 555 12 12", "a.b+c@foo.co.uk"],
            ["[REDACTED:DATE]", "[REDACTED:PHONE]", "[REDACTED:EMAIL]"],
            {"date", "phone", "email"},
        ),
        # EN: two dates + MRN label
        (
            "Visit dates: 2024-01-15, 2024-02-01. MRN: 12345678",
            ["2024-01-15", "2024-02-01", "MRN: 12345678"],
            ["[REDACTED:DATE]", "MRN: [REDACTED:MRN]"],
            {"date", "mrn"},
        ),
        # EN: protocol no label with hash sign
        (
            "Protocol No #11223344",
            ["11223344"],
            ["MRN: [REDACTED:MRN]"],
            {"mrn"},
        ),
        # EN: phone with +90 variant (should redact)
        (
            "Call +90 212 555 12 12 for details.",
            ["+90 212 555 12 12", "212 555 12 12"],
            ["[REDACTED:PHONE]"],
            {"phone"},
        ),
        # EN: ensure empty input returns low risk
        (
            "",
            [],
            [],
            set(),
        ),
        # EN: date only should set medium residual risk
        (
            "DOB 1980-01-15",
            ["1980-01-15"],
            ["[REDACTED:DATE]"],
            {"date"},
        ),
        # EN: email only should set high residual risk (structured identifier)
        (
            "Email me at x@y.com",
            ["x@y.com"],
            ["[REDACTED:EMAIL]"],
            {"email"},
        ),
    ],
)
def test_redact_phi_fixtures(
    text: str,
    must_remove: list[str],
    must_include_token: list[str],
    expected_categories: set[str],
) -> None:
    out = redact_phi(text)
    redacted = out.redacted_text

    for raw in must_remove:
        assert raw not in redacted
    for token in must_include_token:
        assert token in redacted

    assert set(out.categories_detected).issuperset(expected_categories)
    assert out.replacement_count >= len(expected_categories)
    assert out.residual_risk in {"low", "medium", "high"}


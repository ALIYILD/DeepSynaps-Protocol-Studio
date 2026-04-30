"""Regression tests for documents_router upload hardening.

Pre-fix the document upload route in
``apps/api/app/routers/documents_router.py`` had three gaps:

* Trusted ``file.content_type`` (client-controlled HTTP header) as
  the only MIME check — a clinician could upload arbitrary binary
  tagged ``application/pdf`` and the router happily wrote it to
  disk, then served it back with that MIME on download.
* Took the on-disk extension from
  ``file.filename.rsplit(".", 1)[-1]`` with only an
  ``isalnum() and len(ext) <= 8`` guard. ``audio.php`` would land
  as ``…/audio.php`` because ``php`` is alphanumeric.
* ``_validate_document_file_ref`` only checked
  ``startswith("documents/")``. ``documents/../../etc/passwd``
  would pass that prefix gate; only the second-line
  ``target.resolve()`` + root-prefix check on download was a real
  guard. A future refactor that drops the resolve() check would be
  RCE-adjacent.

Pydantic body models also had no ``Field(max_length=...)`` caps —
a clinician could write a 10MB title or notes string.

Post-fix:

* ``_looks_like_document`` magic-byte sniff at the upload boundary
  (PDF / OLE / ZIP / JPEG / PNG / WebP signatures + printable-ASCII
  heuristic for ``text/plain``).
* ``_safe_doc_ext`` maps the validated MIME to a fixed-set
  extension (pdf / doc / docx / jpg / png / webp / txt; unknown
  falls back to ``bin``).
* ``_DOC_FILE_REF_RE`` regex pins ``documents/<uuid>.<ext>``.
* ``DocumentCreate`` and ``DocumentUpdate`` have ``max_length``
  caps on every string field.
"""
from __future__ import annotations

import pytest

from app.routers import documents_router as docs


# ---------------------------------------------------------------------------
# _safe_doc_ext — extension pinning
# ---------------------------------------------------------------------------
def test_safe_doc_ext_maps_known_mimes() -> None:
    assert docs._safe_doc_ext("application/pdf") == "pdf"
    assert docs._safe_doc_ext("application/msword") == "doc"
    assert (
        docs._safe_doc_ext(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        == "docx"
    )
    assert docs._safe_doc_ext("image/jpeg") == "jpg"
    assert docs._safe_doc_ext("image/png") == "png"
    assert docs._safe_doc_ext("image/webp") == "webp"
    assert docs._safe_doc_ext("text/plain") == "txt"


def test_safe_doc_ext_rejects_arbitrary_mime() -> None:
    """An attacker-controlled MIME like ``application/x-php`` must
    NOT be reflected back as the extension. Falls back to bin."""
    assert docs._safe_doc_ext("application/x-php") == "bin"
    assert docs._safe_doc_ext("text/html") == "bin"
    assert docs._safe_doc_ext(None) == "bin"
    assert docs._safe_doc_ext("") == "bin"


# ---------------------------------------------------------------------------
# _looks_like_document — magic-byte sniff
# ---------------------------------------------------------------------------
def test_looks_like_document_accepts_pdf() -> None:
    assert docs._looks_like_document(b"%PDF-1.7\n" + b"\x00" * 24, "application/pdf")


def test_looks_like_document_accepts_png() -> None:
    assert docs._looks_like_document(
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 24, "image/png"
    )


def test_looks_like_document_accepts_jpeg() -> None:
    assert docs._looks_like_document(b"\xff\xd8\xff\xe0" + b"\x00" * 28, "image/jpeg")


def test_looks_like_document_accepts_docx() -> None:
    """DOCX is a ZIP container — magic header is PK\\x03\\x04."""
    assert docs._looks_like_document(
        b"PK\x03\x04" + b"\x00" * 28,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def test_looks_like_document_accepts_webp() -> None:
    assert docs._looks_like_document(b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 16, "image/webp")


def test_looks_like_document_accepts_legacy_doc() -> None:
    """Legacy .doc is OLE compound — D0 CF 11 E0 A1 B1 1A E1."""
    assert docs._looks_like_document(
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 24, "application/msword"
    )


def test_looks_like_document_accepts_plain_text() -> None:
    """text/plain has no magic header — accepted only when the head
    is mostly printable ASCII."""
    assert docs._looks_like_document(b"Hello world\nthis is a clinical note.", "text/plain")


def test_looks_like_document_rejects_shell_script() -> None:
    """Pre-fix `#!/bin/sh\\nrm -rf /` tagged ``application/pdf`` would
    have been written to disk."""
    assert not docs._looks_like_document(b"#!/bin/sh\nrm -rf /", "application/pdf")
    assert not docs._looks_like_document(b"<?php system($_GET[c]); ?>", "application/pdf")


def test_looks_like_document_rejects_binary_as_text() -> None:
    """Random binary bytes tagged ``text/plain`` must NOT pass the
    printable-ASCII heuristic."""
    binary = bytes(range(256))  # 50% non-printable
    assert not docs._looks_like_document(binary, "text/plain")


def test_looks_like_document_rejects_empty() -> None:
    assert not docs._looks_like_document(b"", "application/pdf")


# ---------------------------------------------------------------------------
# _validate_document_file_ref — strict regex
# ---------------------------------------------------------------------------
def test_validate_file_ref_accepts_uuid_path() -> None:
    docs._validate_document_file_ref("documents/12345678-1234-1234-1234-123456789abc.pdf")
    docs._validate_document_file_ref(None)  # None passes (no file attached)


def test_validate_file_ref_rejects_traversal() -> None:
    """Pre-fix this only checked startswith("documents/")."""
    from app.errors import ApiServiceError

    for hostile in (
        "documents/../../etc/passwd",
        "documents/../secrets.txt",
        "documents/foo/../../etc/passwd",
        "etc/passwd",
        "../etc/passwd",
        "documents/foo bar.pdf",   # space rejected
        "documents/foo.tar.gz",    # double extension — would persist arbitrary suffix
    ):
        with pytest.raises(ApiServiceError) as exc:
            docs._validate_document_file_ref(hostile)
        assert exc.value.status_code == 422


# ---------------------------------------------------------------------------
# Pydantic Field caps
# ---------------------------------------------------------------------------
def test_document_create_caps_oversized_title() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        docs.DocumentCreate(title="x" * 256)


def test_document_create_caps_oversized_notes() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        docs.DocumentCreate(title="ok", notes="x" * 10_001)


def test_document_update_caps_oversized_notes() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        docs.DocumentUpdate(notes="x" * 10_001)

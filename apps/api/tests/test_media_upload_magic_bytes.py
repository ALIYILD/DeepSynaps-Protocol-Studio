"""Regression tests for the media-upload magic-byte + extension fixes.

Pre-fix the patient-upload routes:

* Trusted ``file.content_type`` (client-controlled HTTP header) as the
  only MIME check — a user could upload arbitrary binary tagged as
  ``audio/webm``.
* Took the on-disk extension from
  ``file.filename.rsplit(".", 1)[-1]`` with no allowlist — so a
  filename of ``audio.php`` would write ``…/audio.php`` to disk.

Post-fix the routes:

* Call ``media_storage.looks_like_audio`` /
  ``media_storage.looks_like_video`` on the body bytes and refuse 422
  on mismatch.
* Pin the on-disk extension via ``safe_audio_ext(mime)`` /
  ``safe_video_ext(mime)`` so the filename suffix is always one of a
  fixed set.
"""
from __future__ import annotations

from app.services import media_storage


# ---------------------------------------------------------------------------
# safe_audio_ext / safe_video_ext — extension pinning
# ---------------------------------------------------------------------------
def test_safe_audio_ext_maps_known_mimes() -> None:
    assert media_storage.safe_audio_ext("audio/webm") == "webm"
    assert media_storage.safe_audio_ext("audio/mp4") == "m4a"
    assert media_storage.safe_audio_ext("audio/mpeg") == "mp3"
    assert media_storage.safe_audio_ext("audio/ogg") == "ogg"
    assert media_storage.safe_audio_ext("audio/wav") == "wav"


def test_safe_audio_ext_rejects_arbitrary_mime() -> None:
    """An attacker-controlled MIME like ``application/x-php`` must
    NOT be reflected back as the extension. Falls back to webm."""
    assert media_storage.safe_audio_ext("application/x-php") == "webm"
    assert media_storage.safe_audio_ext("text/html") == "webm"
    assert media_storage.safe_audio_ext(None) == "webm"
    assert media_storage.safe_audio_ext("") == "webm"


def test_safe_video_ext_maps_known_mimes() -> None:
    assert media_storage.safe_video_ext("video/mp4") == "mp4"
    assert media_storage.safe_video_ext("video/webm") == "webm"


def test_safe_video_ext_rejects_arbitrary_mime() -> None:
    assert media_storage.safe_video_ext("application/x-shellscript") == "webm"


# ---------------------------------------------------------------------------
# looks_like_audio / looks_like_video — magic-byte sniffing
# ---------------------------------------------------------------------------
def test_looks_like_audio_accepts_webm_signature() -> None:
    # EBML / Matroska header
    assert media_storage.looks_like_audio(b"\x1a\x45\xdf\xa3" + b"\x00" * 30)


def test_looks_like_audio_accepts_ogg_signature() -> None:
    assert media_storage.looks_like_audio(b"OggS" + b"\x00" * 28)


def test_looks_like_audio_accepts_wav_signature() -> None:
    assert media_storage.looks_like_audio(b"RIFF\x00\x00\x00\x00WAVE" + b"\x00" * 16)


def test_looks_like_audio_accepts_mp3_id3() -> None:
    assert media_storage.looks_like_audio(b"ID3\x03\x00\x00\x00" + b"\x00" * 25)


def test_looks_like_audio_accepts_mp4_ftyp() -> None:
    # ISO BMFF — 4 bytes of size, then 'ftyp'
    assert media_storage.looks_like_audio(b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 16)


def test_looks_like_audio_rejects_shell_script() -> None:
    """A clinical bug bar: an attacker uploads `#!/bin/sh\\nrm -rf /`
    tagged as audio/webm. Pre-fix this would write `audio.webm` to
    disk; the magic-byte sniff catches it now."""
    assert not media_storage.looks_like_audio(b"#!/bin/sh\nrm -rf /")
    assert not media_storage.looks_like_audio(b"<?php system($_GET[c]); ?>")
    assert not media_storage.looks_like_audio(b"<html><body>x</body></html>")
    assert not media_storage.looks_like_audio(b"")
    assert not media_storage.looks_like_audio(b"abc")


def test_looks_like_video_rejects_shell_script() -> None:
    assert not media_storage.looks_like_video(b"#!/bin/sh\nrm -rf /")
    assert not media_storage.looks_like_video(b"<?php phpinfo(); ?>")


def test_looks_like_video_accepts_mp4_signature() -> None:
    assert media_storage.looks_like_video(b"\x00\x00\x00\x20ftypisom" + b"\x00" * 16)


def test_looks_like_video_accepts_webm_signature() -> None:
    assert media_storage.looks_like_video(b"\x1a\x45\xdf\xa3" + b"\x00" * 30)

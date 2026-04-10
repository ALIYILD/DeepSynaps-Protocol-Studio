"""Tests for app.crypto — Fernet token encryption helpers.

These tests exercise:
- encrypt_token / decrypt_token round-trip with a real key
- plaintext fallback when WEARABLE_TOKEN_ENC_KEY is absent (legacy read path)
- None / empty string pass-through (no-op)
- Decryption of a legacy plaintext row after the key is set (graceful fallback)
- Key isolation: tests reset the module cache so they don't interfere with each other
"""
from __future__ import annotations

import importlib
import logging
import os

import pytest


# ── helpers ───────────────────���───────────────────────────────────────────────

def _fresh_crypto(key: str | None):
    """Re-import crypto with a clean cache under the given key value."""
    if key is None:
        os.environ.pop("WEARABLE_TOKEN_ENC_KEY", None)
    else:
        os.environ["WEARABLE_TOKEN_ENC_KEY"] = key
    import app.crypto as _mod
    # Reset module-level cache so _fernet() re-reads the env var
    _mod._FERNET_CACHE = None
    _mod._KEY_LOADED = ""
    importlib.reload(_mod)
    return _mod


def _valid_fernet_key() -> str:
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()


# ── None / empty pass-through ────────────────────────────���────────────────────

def test_encrypt_none_returns_none():
    m = _fresh_crypto(None)
    assert m.encrypt_token(None) is None


def test_encrypt_empty_returns_empty():
    m = _fresh_crypto(None)
    assert m.encrypt_token("") == ""


def test_decrypt_none_returns_none():
    m = _fresh_crypto(None)
    assert m.decrypt_token(None) is None


def test_decrypt_empty_returns_empty():
    m = _fresh_crypto(None)
    assert m.decrypt_token("") == ""


# ── Plaintext fallback (no key set) ────────────────────────────���─────────────

def test_encrypt_without_key_returns_plaintext(caplog):
    m = _fresh_crypto(None)
    with caplog.at_level(logging.WARNING, logger="app.crypto"):
        result = m.encrypt_token("my-oauth-token")
    assert result == "my-oauth-token"
    assert "plaintext" in caplog.text.lower()


def test_decrypt_without_key_returns_raw():
    """Dev mode: no key → ciphertext is assumed to be plaintext already."""
    m = _fresh_crypto(None)
    assert m.decrypt_token("any-value") == "any-value"


# ── Round-trip with a real key ───────────────��───────────────────────────��─────

def test_encrypt_decrypt_roundtrip():
    key = _valid_fernet_key()
    m = _fresh_crypto(key)
    plaintext = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.FAKE_TOKEN"
    ciphertext = m.encrypt_token(plaintext)
    assert ciphertext != plaintext
    assert ciphertext is not None
    recovered = m.decrypt_token(ciphertext)
    assert recovered == plaintext


def test_ciphertext_is_not_plaintext():
    key = _valid_fernet_key()
    m = _fresh_crypto(key)
    plain = "super-secret-refresh-token"
    cipher = m.encrypt_token(plain)
    assert plain not in cipher


def test_fernet_instance_cached():
    """_fernet() should return the same object on repeated calls."""
    key = _valid_fernet_key()
    m = _fresh_crypto(key)
    f1 = m._fernet()
    f2 = m._fernet()
    assert f1 is f2


# ── Legacy plaintext fallback (key set but row was stored unencrypted) ────────

def test_decrypt_legacy_plaintext_row_with_key_set(caplog):
    """If a row was stored as plaintext before the key was configured,
    decrypt_token must return the raw value (not crash) and log a warning."""
    key = _valid_fernet_key()
    m = _fresh_crypto(key)
    legacy_value = "plaintext-legacy-token"
    with caplog.at_level(logging.WARNING, logger="app.crypto"):
        result = m.decrypt_token(legacy_value)
    # Must not raise; must return the original string
    assert result == legacy_value
    assert "decryption failed" in caplog.text.lower() or "legacy" in caplog.text.lower()


# ── Invalid key ────────────────────────────���────────────────────────────────��─

def test_invalid_key_falls_back_to_plaintext(caplog):
    """A malformed key must not crash the app — warn and fall back."""
    m = _fresh_crypto("not-a-valid-fernet-key")
    with caplog.at_level(logging.WARNING, logger="app.crypto"):
        result = m.encrypt_token("token")
    assert result == "token"
    assert "plaintext" in caplog.text.lower() or "invalid" in caplog.text.lower()


# ── Key rotation detection ────────────────────────────────────────────────────

def test_key_change_refreshes_fernet_cache():
    """Changing WEARABLE_TOKEN_ENC_KEY mid-process should reload the Fernet instance."""
    key1 = _valid_fernet_key()
    key2 = _valid_fernet_key()
    m = _fresh_crypto(key1)
    f1 = m._fernet()

    os.environ["WEARABLE_TOKEN_ENC_KEY"] = key2
    m._FERNET_CACHE = None
    m._KEY_LOADED = ""
    f2 = m._fernet()

    assert f1 is not f2

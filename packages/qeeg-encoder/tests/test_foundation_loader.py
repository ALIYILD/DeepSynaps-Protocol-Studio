"""Tests for the foundation-weights SHA256 loader."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from qeeg_encoder.foundation.loader import (
    WeightsVerificationError,
    find_weights_file,
    verify_sha256,
)


def test_verify_sha256_match(tmp_path: Path):
    f = tmp_path / "pytorch_model.bin"
    f.write_bytes(b"hello world")
    expected = hashlib.sha256(b"hello world").hexdigest()
    actual = verify_sha256(f, expected)
    assert actual == expected


def test_verify_sha256_mismatch(tmp_path: Path):
    f = tmp_path / "pytorch_model.bin"
    f.write_bytes(b"hello world")
    with pytest.raises(WeightsVerificationError):
        verify_sha256(f, "0" * 64)


def test_find_weights_file_pytorch(tmp_path: Path):
    f = tmp_path / "pytorch_model.bin"
    f.write_bytes(b"x")
    assert find_weights_file(tmp_path) == f


def test_find_weights_file_safetensors(tmp_path: Path):
    f = tmp_path / "model.safetensors"
    f.write_bytes(b"x")
    assert find_weights_file(tmp_path) == f


def test_find_weights_file_missing(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        find_weights_file(tmp_path)


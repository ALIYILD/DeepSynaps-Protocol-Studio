"""Tests for the torch deserialization safety wrapper.

Covers CVE-2025-32434 mitigation. See
docs/security/torch-deserialization-audit.md for the full callsite audit.
"""
from __future__ import annotations

import pathlib
import re
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# load_state_dict_safely — must always pass weights_only=True
# ---------------------------------------------------------------------------


def test_load_state_dict_safely_passes_weights_only_true(tmp_path):
    """`load_state_dict_safely` must call torch.load with weights_only=True."""
    from deepsynaps_qeeg._safe_torch import load_state_dict_safely

    fake_torch = MagicMock()
    fake_torch.load.return_value = {"layer.weight": "fake-tensor"}

    with patch.dict("sys.modules", {"torch": fake_torch}):
        result = load_state_dict_safely(tmp_path / "fake.pt", map_location="cpu")

    assert result == {"layer.weight": "fake-tensor"}
    fake_torch.load.assert_called_once()
    call_kwargs = fake_torch.load.call_args.kwargs
    assert call_kwargs["weights_only"] is True, (
        "load_state_dict_safely MUST pass weights_only=True — that is the "
        "whole point of the helper (CVE-2025-32434)."
    )
    assert call_kwargs["map_location"] == "cpu"


def test_load_state_dict_safely_roundtrip(tmp_path):
    """End-to-end smoke: write a real state_dict, read it back."""
    torch = pytest.importorskip("torch")
    from deepsynaps_qeeg._safe_torch import load_state_dict_safely

    expected = {"w": torch.tensor([1.0, 2.0, 3.0]), "b": torch.tensor([0.5])}
    path = tmp_path / "state.pt"
    torch.save(expected, path)

    got = load_state_dict_safely(path)

    assert set(got.keys()) == {"w", "b"}
    assert torch.equal(got["w"], expected["w"])
    assert torch.equal(got["b"], expected["b"])


# ---------------------------------------------------------------------------
# load_trusted_full_checkpoint — must require a justified reason
# ---------------------------------------------------------------------------


def test_load_trusted_full_checkpoint_passes_weights_only_false(tmp_path):
    """Trusted-pickle path must call torch.load with weights_only=False explicitly."""
    from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint

    fake_torch = MagicMock()
    fake_torch.load.return_value = {"encoder": "fake-module"}

    with patch.dict("sys.modules", {"torch": fake_torch}):
        result = load_trusted_full_checkpoint(
            tmp_path / "ckpt.pt",
            reason="vendored deploy-time mount, never user-uploaded",
        )

    assert result == {"encoder": "fake-module"}
    call_kwargs = fake_torch.load.call_args.kwargs
    assert call_kwargs["weights_only"] is False, (
        "Trusted-checkpoint path must state weights_only=False EXPLICITLY so "
        "the behaviour does not silently change when torch is bumped to >=2.6."
    )


@pytest.mark.parametrize("bad_reason", ["", "x", "trusted", "ok", "1234567890123456"[:15]])
def test_load_trusted_full_checkpoint_rejects_trivial_reason(tmp_path, bad_reason):
    """Empty or short `reason=` must raise — forces caller to think."""
    from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint

    fake_torch = MagicMock()
    with patch.dict("sys.modules", {"torch": fake_torch}):
        with pytest.raises(ValueError, match="non-trivial `reason="):
            load_trusted_full_checkpoint(
                tmp_path / "ckpt.pt",
                reason=bad_reason,
            )

    # torch.load must NOT have been called when validation fails.
    fake_torch.load.assert_not_called()


def test_load_trusted_full_checkpoint_accepts_real_reason(tmp_path):
    """A reason >= 16 chars must be accepted."""
    from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint

    fake_torch = MagicMock()
    fake_torch.load.return_value = "ok"

    with patch.dict("sys.modules", {"torch": fake_torch}):
        load_trusted_full_checkpoint(
            tmp_path / "ckpt.pt",
            reason="this is a sixteen-character explanation of trust",
        )

    fake_torch.load.assert_called_once()


# ---------------------------------------------------------------------------
# Static regression: audited callsites must not silently use the unsafe default
# ---------------------------------------------------------------------------


# Files that load torch checkpoints. If you add a new one, audit it and add
# it here so the regression test below covers it.
_AUDITED_FILES = (
    "packages/qeeg-pipeline/src/deepsynaps_qeeg/models/inference.py",
    "packages/qeeg-pipeline/src/deepsynaps_qeeg/ml/brain_age.py",
    "packages/qeeg-pipeline/src/deepsynaps_qeeg/ml/foundation_embedding.py",
    "packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/risk_scores.py",
    "packages/qeeg-encoder/src/qeeg_encoder/foundation/labram.py",
    "packages/mri-pipeline/src/deepsynaps_mri/models/brain_age.py",
)


def _repo_root() -> pathlib.Path:
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".git").exists() or (parent / "apps" / "api").exists():
            return parent
    raise RuntimeError("repo root not found")


def test_no_audited_torch_load_uses_unsafe_default():
    """Regression: every torch.load() in audited files must be safety-explicit.

    Each call must satisfy ONE of:
      - goes through `load_state_dict_safely(` (weights_only=True helper)
      - goes through `load_trusted_full_checkpoint(` (weights_only=False helper
        with required `reason=`)
      - is a raw torch.load(...) call that EXPLICITLY passes weights_only=
        (e.g. labram.py already does this)

    If this test fails after adding a new torch.load call, route the new call
    through `deepsynaps_qeeg._safe_torch` instead of suppressing the test.
    """
    root = _repo_root()
    naked_calls: list[str] = []
    naked_re = re.compile(r"\btorch\.load\s*\(")
    weights_only_re = re.compile(r"weights_only\s*=")

    for rel in _AUDITED_FILES:
        text = (root / rel).read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines(), start=1):
            if not naked_re.search(line):
                continue
            # Look at this line plus the next 12 lines (call args may wrap)
            window_lines = text.splitlines()[i - 1 : i + 12]
            window = "\n".join(window_lines)
            if weights_only_re.search(window):
                continue
            naked_calls.append(f"{rel}:{i}  {line.strip()}")

    assert not naked_calls, (
        "Found torch.load() calls without explicit weights_only= in audited "
        "files — route them through deepsynaps_qeeg._safe_torch instead:\n  "
        + "\n  ".join(naked_calls)
    )


def test_audit_doc_lists_all_callsites():
    """Regression: every audited file must appear in the security audit doc."""
    root = _repo_root()
    doc_path = root / "docs" / "security" / "torch-deserialization-audit.md"
    assert doc_path.exists(), (
        f"Security audit doc missing at {doc_path}. "
        "If you added a torch.load callsite, update both the doc and _AUDITED_FILES."
    )
    doc_text = doc_path.read_text(encoding="utf-8")
    missing = [rel for rel in _AUDITED_FILES if rel not in doc_text]
    assert not missing, (
        "Audited files not mentioned in torch-deserialization-audit.md:\n  "
        + "\n  ".join(missing)
    )

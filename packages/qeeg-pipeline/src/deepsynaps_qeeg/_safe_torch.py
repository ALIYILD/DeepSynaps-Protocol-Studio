"""Deserialization safety wrapper for torch.load.

Background
----------
``torch.load`` uses Python pickle under the hood. Loading a checkpoint with
the torch<2.6 default (``weights_only=False``) allows arbitrary code
execution via a crafted pickle — CVE-2025-32434 (CRITICAL).

The fix in torch 2.6.0 flips the default to ``weights_only=True``. This
module makes both the safe path and the (rare, justified) unsafe path
explicit and audit-able so the eventual torch bump is a one-line change
in pyproject.toml + Dockerfile, not a surprise behavioural break.

Usage
-----
Loading a state_dict (preferred — the common case):

    >>> from deepsynaps_qeeg._safe_torch import load_state_dict_safely
    >>> state = load_state_dict_safely("/path/to/weights.pt")
    >>> model.load_state_dict(state)

Loading a checkpoint that contains pickled ``nn.Module`` instances (legacy
checkpoint format), where the path is provably NOT user-controlled:

    >>> from deepsynaps_qeeg._safe_torch import load_trusted_full_checkpoint
    >>> state = load_trusted_full_checkpoint(
    ...     "/opt/models/labram-base/encoder.pt",
    ...     reason="vendored deploy-time mount; never user-uploaded",
    ... )

This module deliberately does NOT silence the CVE — it makes the unsafe
paths visible to ``grep`` and to security review.

See ``docs/security/torch-deserialization-audit.md`` for the per-callsite
audit and the trust justification for each ``load_trusted_full_checkpoint``
caller.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Union

_PathLike = Union[str, Path]

_MIN_REASON_LEN = 16


def load_state_dict_safely(
    path: _PathLike,
    *,
    map_location: str = "cpu",
) -> Any:
    """Load a state_dict checkpoint with ``weights_only=True``.

    Use for any checkpoint that holds only tensor data (the common case).
    Works on both torch<2.6 (explicit kwarg) and torch>=2.6 (also the
    default). Rejects checkpoints that contain non-tensor pickled
    objects — that's the whole point.

    Parameters
    ----------
    path : str or pathlib.Path
        Filesystem path to the checkpoint.
    map_location : str
        Forwarded to ``torch.load``. Defaults to ``"cpu"``.

    Returns
    -------
    Any
        The deserialized state_dict (typically a ``dict[str, Tensor]``).
    """
    import torch  # local import: torch is an optional heavy dep

    return torch.load(str(path), map_location=map_location, weights_only=True)


def load_trusted_full_checkpoint(
    path: _PathLike,
    *,
    map_location: str = "cpu",
    reason: str,
) -> Any:
    """Load a checkpoint with ``weights_only=False`` — UNSAFE WITHOUT TRUST.

    Unpickles arbitrary Python objects. Only call this when:

    * the path is provably non-user-controlled (vendored model weights
      mounted by the operator, fixed cache locations populated only by
      trusted code), AND
    * the checkpoint format requires pickle (e.g. it stores ``nn.Module``
      instances rather than a plain state_dict).

    Pass ``reason`` to document the trust assumption at the callsite — it
    appears in the source diff, is greppable for security review, and
    forces the caller to think about why this is safe.

    Parameters
    ----------
    path : str or pathlib.Path
        Filesystem path to the checkpoint. MUST NOT come from a request
        body, query string, header, or any other user-influenced channel.
    map_location : str
        Forwarded to ``torch.load``. Defaults to ``"cpu"``.
    reason : str
        Free-text trust justification. Must be at least 16 characters —
        a placeholder like ``"trusted"`` will be rejected.

    Returns
    -------
    Any
        The deserialized object (typically a ``dict`` containing pickled
        ``nn.Module`` instances).

    Raises
    ------
    ValueError
        If ``reason`` is empty or shorter than 16 characters.
    """
    if not reason or len(reason) < _MIN_REASON_LEN:
        raise ValueError(
            "load_trusted_full_checkpoint requires a non-trivial `reason=` "
            "argument documenting why this path is trusted "
            "(see CVE-2025-32434 and docs/security/torch-deserialization-audit.md)."
        )

    import torch  # local import: torch is an optional heavy dep

    # weights_only=False is the torch<2.6 default. Stating it explicitly so
    # the behaviour does not silently flip when torch is bumped to >=2.6,
    # AND so this callsite remains visible to grep.
    return torch.load(str(path), map_location=map_location, weights_only=False)


__all__ = ["load_state_dict_safely", "load_trusted_full_checkpoint"]

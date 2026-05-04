"""Electrode naming normalization and Laplacian neighbor graphs (10–20-centric).

Supports loading simple .sfp / .elc text formats (MNE-style coordinates optional).
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Iterable

# Common alternate labels (older clinical naming ↔ newer MNE defaults).
ALIASES: dict[str, tuple[str, ...]] = {
    "T3": ("T7", "T3"),
    "T4": ("T8", "T4"),
    "T5": ("P7", "T5"),
    "T6": ("P8", "T6"),
    "Cb1": ("O1",),
    "Cb2": ("O2",),
    "A1": ("M1",),
    "A2": ("M2",),
}

# Small Laplacian: subtract mean of listed spatial neighbors (Hjorth-style local surface).
LAP_NEIGHBORS_SMALL: dict[str, tuple[str, ...]] = {
    "Fp1": ("Fpz", "F7", "F3"),
    "Fp2": ("Fpz", "F8", "F4"),
    "Fpz": ("Fp1", "Fp2", "Fz"),
    "F7": ("Fp1", "T7", "F3"),
    "F8": ("Fp2", "T8", "F4"),
    "F3": ("Fp1", "Fz", "C3"),
    "F4": ("Fp2", "Fz", "C4"),
    "Fz": ("F3", "F4", "Cz"),
    "T7": ("F7", "P7", "C3"),
    "T8": ("F8", "P8", "C4"),
    "C3": ("F3", "Cz", "P3"),
    "C4": ("F4", "Cz", "P4"),
    "Cz": ("C3", "C4", "Pz"),
    "P7": ("T7", "O1", "P3"),
    "P8": ("T8", "O2", "P4"),
    "P3": ("C3", "Pz", "O1"),
    "P4": ("C4", "Pz", "O2"),
    "Pz": ("P3", "P4", "O1", "O2"),
    "O1": ("P7", "P3", "Oz"),
    "O2": ("P8", "P4", "Oz"),
    "Oz": ("O1", "O2", "Pz"),
}

def _expand_neighbors(small: dict[str, tuple[str, ...]]) -> dict[str, tuple[str, ...]]:
    """Add neighbors-of-neighbors for a wider Laplacian kernel."""
    large: dict[str, tuple[str, ...]] = {}
    for k, neigh in small.items():
        bag: set[str] = set(neigh)
        for n in neigh:
            for nn in small.get(n, ()):
                if nn != k:
                    bag.add(nn)
        large[k] = tuple(sorted(bag))
    return large


LAP_NEIGHBORS_LARGE = _expand_neighbors(LAP_NEIGHBORS_SMALL)


def strip_prefix(name: str) -> str:
    n = name.strip()
    for prefix in ("EEG ", "EEG-", "eeg "):
        if n.upper().startswith(prefix.upper()):
            n = n[len(prefix) :].strip()
    return n


def normalize_for_match(name: str) -> str:
    return strip_prefix(name).upper().replace(" ", "")


def resolve_electrode(name: str, available_normalized: dict[str, str]) -> str | None:
    """Map logical electrode name to actual channel key present in ``available_normalized``."""
    key = normalize_for_match(name)
    if key in available_normalized:
        return available_normalized[key]
    for alt in ALIASES.get(name, ()) + ALIASES.get(key, ()):  # type: ignore[operator]
        k2 = normalize_for_match(alt)
        if k2 in available_normalized:
            return available_normalized[k2]
    for cand in (name, key):
        for ak, av in available_normalized.items():
            if cand in ak or ak.startswith(cand):
                return av
    return None


def load_sfp_elc_positions(path: Path) -> dict[str, tuple[float, float, float]]:
    """Parse simple three-column .sfp / Cartesian .elc blocks (name x y z per line)."""
    text = path.read_text(encoding="utf-8", errors="replace")
    out: dict[str, tuple[float, float, float]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = re.split(r"[\s,]+", line)
        if len(parts) < 4:
            continue
        label, xs, ys, zs = parts[0], parts[1], parts[2], parts[3]
        try:
            out[strip_prefix(label)] = (float(xs), float(ys), float(zs))
        except ValueError:
            continue
    return out


def spherical_neighbors(
    positions: dict[str, tuple[float, float, float]],
    names: Iterable[str],
    *,
    k: int = 4,
) -> dict[str, tuple[str, ...]]:
    """Return k nearest-neighbor sets by Euclidean distance in the coord file."""
    names_list = [strip_prefix(n) for n in names if strip_prefix(n) in positions]
    out: dict[str, tuple[str, ...]] = {}
    for a in names_list:
        pa = positions.get(a)
        if pa is None:
            continue
        dists: list[tuple[float, str]] = []
        for b in names_list:
            if a == b:
                continue
            pb = positions[b]
            d = math.sqrt(sum((x - y) ** 2 for x, y in zip(pa, pb)))
            dists.append((d, b))
        dists.sort(key=lambda t: t[0])
        out[a] = tuple(b for _, b in dists[:k])
    return out

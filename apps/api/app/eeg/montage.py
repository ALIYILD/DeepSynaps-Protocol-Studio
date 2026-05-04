"""Derivation matrix for Studio montages: D @ X  (derivations × electrodes)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, Sequence

import numpy as np

from app.eeg.electrode_positions import (
    ALIASES,
    LAP_NEIGHBORS_LARGE,
    LAP_NEIGHBORS_SMALL,
    normalize_for_match,
)

_log = logging.getLogger(__name__)

MontageKind = Literal[
    "raw",
    "linear",
    "car",
    "laplacian_small",
    "laplacian_large",
    "rest",
    "source_placeholder",
]


@dataclass
class LinearDerivation:
    label: str
    plus: list[tuple[str, float]]
    minus: list[tuple[str, float]]


def _column_for_electrode(name: str, ch_names: Sequence[str]) -> int | None:
    """Resolve an electrode label to a column index using aliases."""
    want = normalize_for_match(strip_simple(name))
    ch_norm = [normalize_for_match(c) for c in ch_names]

    def find_key(k: str) -> int | None:
        for i, cn in enumerate(ch_norm):
            if cn == k:
                return i
        return None

    hit = find_key(want)
    if hit is not None:
        return hit

    # Search alias map (canonical key ↔ alternate names).
    for canon, alts in ALIASES.items():
        canon_k = normalize_for_match(canon)
        alt_keys = {normalize_for_match(a) for a in alts}
        alt_keys.add(canon_k)
        if want in alt_keys:
            for i, cn in enumerate(ch_norm):
                if cn in alt_keys:
                    return i
        if want == canon_k:
            for i, cn in enumerate(ch_norm):
                if cn in alt_keys:
                    return i
    return None


def _resolve_term(
    name: str,
    weight: float,
    ch_names: Sequence[str],
) -> tuple[int, float] | None:
    col = _column_for_electrode(name, ch_names)
    if col is None:
        return None
    return col, weight


def strip_simple(name: str) -> str:
    n = name.strip()
    if n.upper().startswith("EEG "):
        n = n[4:].strip()
    return n


def build_linear_matrix(
    derivations: list[LinearDerivation],
    ch_names: Sequence[str],
) -> tuple[np.ndarray, list[str], list[str]]:
    """Return D (n_deriv × n_ch), output labels, warnings."""
    n_ch = len(ch_names)
    rows: list[np.ndarray] = []
    labels: list[str] = []
    warns: list[str] = []

    for d in derivations:
        row = np.zeros(n_ch, dtype=np.float64)
        ok = True
        for name, w in d.plus:
            r = _resolve_term(name, float(w), ch_names)
            if r is None:
                ok = False
                warns.append(f"missing + electrode {name} for {d.label}")
                break
            row[r[0]] += r[1]
        if ok:
            for name, w in d.minus:
                r = _resolve_term(name, float(w), ch_names)
                if r is None:
                    ok = False
                    warns.append(f"missing − electrode {name} for {d.label}")
                    break
                row[r[0]] -= r[1]
        if ok:
            rows.append(row)
            labels.append(d.label)
        else:
            warns.append(f"skipped derivation {d.label}")

    if not rows:
        return np.zeros((0, n_ch)), [], warns
    return np.vstack(rows), labels, warns


def build_car_matrix(
    ch_names: Sequence[str],
    bad: set[str],
) -> tuple[np.ndarray, list[str], list[str]]:
    """Average reference over good channels only; bad channels pass through."""
    bad_norm = {normalize_for_match(b) for b in bad}
    good_idx = [
        i
        for i, c in enumerate(ch_names)
        if normalize_for_match(c) not in bad_norm
    ]
    warns: list[str] = []
    if len(good_idx) < 2:
        warns.append("CAR needs ≥2 good channels; returning raw")
        return np.eye(len(ch_names)), list(ch_names), warns

    n = len(ch_names)
    D = np.zeros((n, n), dtype=np.float64)
    labels: list[str] = []
    invg = 1.0 / len(good_idx)
    for i in range(n):
        nm = strip_simple(ch_names[i])
        labels.append(f"CAR({nm})")
        if i not in good_idx:
            D[i, i] = 1.0
            continue
        D[i, i] = 1.0
        for j in good_idx:
            D[i, j] -= invg
    return D, labels, warns


def build_laplacian_matrix(
    ch_names: Sequence[str],
    bad: set[str],
    *,
    large: bool,
) -> tuple[np.ndarray, list[str], list[str]]:
    neigh = LAP_NEIGHBORS_LARGE if large else LAP_NEIGHBORS_SMALL
    bad_norm = {normalize_for_match(b) for b in bad}
    rows: list[np.ndarray] = []
    labels: list[str] = []
    warns: list[str] = []
    n = len(ch_names)

    for i, ch in enumerate(ch_names):
        nm = strip_simple(ch)
        key = normalize_for_match(ch)
        row = np.zeros(n)
        if key in bad_norm:
            row[i] = 1.0
            rows.append(row)
            labels.append(f"{nm} (bad)")
            continue
        nbr_names = neigh.get(nm, neigh.get(nm.upper(), ()))
        use_idx: list[int] = []
        for nb in nbr_names:
            col = _column_for_electrode(nb, ch_names)
            if col is None:
                continue
            if normalize_for_match(ch_names[col]) in bad_norm:
                continue
            use_idx.append(col)
        if not use_idx:
            warns.append(f"Laplacian: no neighbors for {nm}; passthrough")
            row[i] = 1.0
            rows.append(row)
            labels.append(nm)
            continue
        row[i] = 1.0
        k = len(use_idx)
        for j in use_idx:
            row[j] -= 1.0 / k
        rows.append(row)
        labels.append(f"Lap-{nm}")

    return np.vstack(rows), labels, warns


def apply_matrix(
    D: np.ndarray,
    data_rows: list[list[float]] | list[np.ndarray],
) -> list[np.ndarray]:
    """Apply D to channel-major rows (same layout as extract_signal_window)."""
    X = np.asarray([np.asarray(r, dtype=np.float64) for r in data_rows], dtype=np.float64)
    if X.ndim != 2:
        raise ValueError("expected 2-D channel data")
    if D.shape[1] != X.shape[0]:
        raise ValueError(f"D cols {D.shape[1]} != channels {X.shape[0]}")
    Y = D @ X
    return [Y[i].astype(np.float32) for i in range(Y.shape[0])]


# ── Built-in presets (IDs mirror frontend ``montagePresets.ts``) ────────────


def preset_double_banana() -> list[LinearDerivation]:
    """Classic longitudinal bipolar chains (aliases resolved at runtime)."""
    pairs = [
        ("Fp1-F7", "Fp1", "F7"),
        ("F7-T7", "F7", "T7"),
        ("T7-P7", "T7", "P7"),
        ("P7-O1", "P7", "O1"),
        ("Fp2-F8", "Fp2", "F8"),
        ("F8-T8", "F8", "T8"),
        ("T8-P8", "T8", "P8"),
        ("P8-O2", "P8", "O2"),
    ]
    return [LinearDerivation(lab, [(a, 1.0)], [(b, 1.0)]) for lab, a, b in pairs]


def preset_transverse() -> list[LinearDerivation]:
    return [
        LinearDerivation("Fp1-Fp2", [("Fp1", 1.0)], [("Fp2", 1.0)]),
        LinearDerivation("F7-F8", [("F7", 1.0)], [("F8", 1.0)]),
        LinearDerivation("T7-T8", [("T7", 1.0)], [("T8", 1.0)]),
        LinearDerivation("T3-T4", [("T3", 1.0)], [("T4", 1.0)]),
        LinearDerivation("P7-P8", [("P7", 1.0)], [("P8", 1.0)]),
        LinearDerivation("O1-O2", [("O1", 1.0)], [("O2", 1.0)]),
    ]


def preset_circle() -> list[LinearDerivation]:
    """Simplified circumferential belt."""
    return [
        LinearDerivation("Fp1-Fp2", [("Fp1", 1.0)], [("Fp2", 1.0)]),
        LinearDerivation("Fp2-F8", [("Fp2", 1.0)], [("F8", 1.0)]),
        LinearDerivation("F8-T8", [("F8", 1.0)], [("T8", 1.0)]),
        LinearDerivation("T8-O2", [("T8", 1.0)], [("O2", 1.0)]),
        LinearDerivation("O2-O1", [("O2", 1.0)], [("O1", 1.0)]),
        LinearDerivation("O1-T7", [("O1", 1.0)], [("T7", 1.0)]),
        LinearDerivation("T7-F7", [("T7", 1.0)], [("F7", 1.0)]),
        LinearDerivation("F7-Fp1", [("F7", 1.0)], [("Fp1", 1.0)]),
    ]


def preset_monopolar_linked_mastoids() -> list[LinearDerivation]:
    """Re-reference each named scalp channel to linked mastoids (not exhaustive)."""
    scalp = [
        "Fp1",
        "Fp2",
        "F7",
        "F8",
        "T7",
        "T8",
        "P7",
        "P8",
        "O1",
        "O2",
        "F3",
        "F4",
        "C3",
        "C4",
        "P3",
        "P4",
        "Cz",
        "Pz",
        "Oz",
        "Fpz",
        "Fz",
    ]
    return [
        LinearDerivation(
            f"{s}-(A1+A2)/2",
            [(s, 1.0)],
            [("A1", 0.5), ("A2", 0.5)],
        )
        for s in scalp
    ]


PRESET_SPECS: dict[str, dict[str, Any]] = {
    "builtin:raw": {"kind": "raw"},
    "builtin:banana": {"kind": "linear", "derivations": preset_double_banana()},
    "builtin:transverse": {"kind": "linear", "derivations": preset_transverse()},
    "builtin:circle": {"kind": "linear", "derivations": preset_circle()},
    "builtin:mono-linked": {
        "kind": "linear",
        "derivations": preset_monopolar_linked_mastoids(),
    },
    "builtin:car": {"kind": "car"},
    "builtin:laplacian-small": {"kind": "laplacian_small"},
    "builtin:laplacian-large": {"kind": "laplacian_large"},
    "builtin:rest": {"kind": "rest"},
    "builtin:source": {"kind": "source_placeholder"},
}


def apply_montage_to_window(
    *,
    ch_names: list[str],
    data_rows: list[list[float]],
    montage_id: str,
    bad_channels: set[str],
    user_spec: dict[str, Any] | None,
) -> tuple[list[str], list[list[float]], list[str], dict[str, Any]]:
    """Apply montage; returns (out_channels, out_data, warnings, meta)."""
    warns: list[str] = []
    meta: dict[str, Any] = {"montageId": montage_id}

    spec: dict[str, Any] | None = PRESET_SPECS.get(montage_id)
    if spec is None and user_spec is not None:
        spec = user_spec
    if spec is None:
        warns.append(f"unknown montage {montage_id}; returning raw")
        return ch_names, data_rows, warns, meta

    kind: MontageKind = spec.get("kind", "linear")  # type: ignore[assignment]

    if kind == "raw":
        return ch_names, data_rows, warns, meta

    if kind == "source_placeholder":
        warns.append("source montage placeholder — passing raw channels")
        return ch_names, data_rows, warns, meta

    if kind == "rest":
        warns.append("REST must be applied in streaming pipeline — raw returned here")
        return ch_names, data_rows, warns, meta

    if kind == "car":
        D, labels, w = build_car_matrix(ch_names, bad_channels)
        warns.extend(w)
        out = apply_matrix(D, data_rows)
        return labels, [r.tolist() for r in out], warns, meta

    if kind == "laplacian_small":
        D, labels, w = build_laplacian_matrix(ch_names, bad_channels, large=False)
        warns.extend(w)
        out = apply_matrix(D, data_rows)
        return labels, [r.tolist() for r in out], warns, meta

    if kind == "laplacian_large":
        D, labels, w = build_laplacian_matrix(ch_names, bad_channels, large=True)
        warns.extend(w)
        out = apply_matrix(D, data_rows)
        return labels, [r.tolist() for r in out], warns, meta

    if kind == "linear":
        derivations = spec.get("derivations")
        if not derivations:
            warns.append("empty linear montage")
            return ch_names, data_rows, warns, meta
        if isinstance(derivations[0], dict):
            dlist = [
                LinearDerivation(
                    d["label"],
                    [(p["name"], float(p.get("weight", 1))) for p in d.get("plus", [])],
                    [(m["name"], float(m.get("weight", 1))) for m in d.get("minus", [])],
                )
                for d in derivations
            ]
        else:
            dlist = derivations  # type: ignore[assignment]
        D, labels, w = build_linear_matrix(dlist, ch_names)  # type: ignore[arg-type]
        warns.extend(w)
        if D.shape[0] == 0:
            return ch_names, data_rows, warns, meta
        out = apply_matrix(D, data_rows)
        return labels, [r.tolist() for r in out], warns, meta

    warns.append(f"unhandled kind {kind}")
    return ch_names, data_rows, warns, meta


def list_builtin_metadata() -> list[dict[str, str]]:
    rows = []
    for mid in PRESET_SPECS:
        fam = PRESET_SPECS[mid].get("kind", "linear")  # type: ignore[union-attr]
        rows.append(
            {
                "id": mid,
                "name": mid.replace("builtin:", "").replace("-", " ").title(),
                "family": str(fam),
            },
        )
    return sorted(rows, key=lambda r: r["id"])

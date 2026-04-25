"""Web payload builder for the qEEG 3D brain viewer.

Contract (v1):
  - A single combined cortex mesh (LH + RH) with:
      positions: flat list[float] length 3*N (RAS mm, FreeSurfer surface coords)
      indices:   flat list[int] length 3*M (triangle indices)
  - Per-band scalar arrays aligned to the combined vertex order (LH then RH)
  - Two color LUTs (viridis for power, RdBu_r for z-like overlay)

Design goals:
  - Cache the static fsaverage mesh once per process. Only scalars vary.
  - Keep the payload small enough to be <~5MB gzipped in typical runs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final

import math

import numpy as np

DEFAULT_SUBJECT: Final[str] = "fsaverage"
DEFAULT_SURF: Final[str] = "pial"
TARGET_FACES: Final[int] = 30_000
LUT_SIZE: Final[int] = 256


@dataclass(frozen=True)
class _Mesh:
    positions: np.ndarray  # (N, 3) float32
    indices: np.ndarray  # (M, 3) int32
    n_lh: int
    n_rh: int


_MESH_CACHE: dict[tuple[str, str, str], _Mesh] = {}
_LABEL_CACHE: dict[tuple[str, str], dict[str, tuple[np.ndarray, np.ndarray]]] = {}


def build_brain_payload(stc_dict: dict[str, Any], subjects_dir: str | None, subject: str) -> dict[str, Any]:
    """Build a JSON-serialisable payload for the web 3D brain viewer.

    Parameters
    ----------
    stc_dict
        Band -> scalar source payload. Supported shapes:
          - Vertex scalars:
              {band: {"lh": array_like[n_lh], "rh": array_like[n_rh]}}
          - ROI map (Desikan-Killiany aparc labels):
              {band: { "bankssts-lh": 0.12, ..., "insula-rh": 0.07 }}
            (values are projected to vertices via label membership)
    subjects_dir
        FreeSurfer SUBJECTS_DIR. If None, fsaverage is fetched via MNE.
    subject
        FreeSurfer subject name. Defaults to fsaverage; mesh uses fsaverage surfaces
        but is aggressively decimated for web delivery (target ~30k faces).
    """
    mesh, subjects_dir_eff = _get_or_load_mesh(subjects_dir, subject=subject, surf=DEFAULT_SURF)
    luts = _build_luts()

    bands_out: dict[str, dict[str, Any]] = {}
    for band, payload in (stc_dict or {}).items():
        if payload is None:
            continue
        power = _band_to_vertex_scalars(payload, mesh=mesh, subjects_dir=subjects_dir_eff, subject=subject)
        power = _sanitize_scalars(power)
        z = _within_subject_z(power)
        bands_out[str(band)] = {
            "power": power.tolist(),
            "z": z.tolist(),
            "power_scale": {"min": float(np.nanmin(power)), "max": float(np.nanmax(power))},
            "z_scale": {"min": float(np.nanmin(z)), "max": float(np.nanmax(z))},
        }

    payload_out: dict[str, Any] = {
        "version": 1,
        "subject": subject,
        "mesh": {
            "surf": DEFAULT_SURF,
            "positions": _pack_positions(mesh.positions),
            "indices": _pack_indices(mesh.indices),
            "n_lh": int(mesh.n_lh),
            "n_rh": int(mesh.n_rh),
        },
        "bands": bands_out,
        "luts": luts,
    }

    _estimate_payload_bytes(payload_out)
    return payload_out


def _get_or_load_mesh(subjects_dir: str | None, *, subject: str, surf: str) -> tuple[_Mesh, str]:
    subjects_dir_eff = _ensure_subjects_dir(subjects_dir)
    key = (subjects_dir_eff, subject, surf)
    cached = _MESH_CACHE.get(key)
    if cached is not None:
        return cached, subjects_dir_eff

    verts_lh, faces_lh = _read_surf(subjects_dir_eff, subject=subject, hemi="lh", surf=surf)
    verts_rh, faces_rh = _read_surf(subjects_dir_eff, subject=subject, hemi="rh", surf=surf)

    n_lh = int(verts_lh.shape[0])
    n_rh = int(verts_rh.shape[0])

    faces_rh = faces_rh.astype(np.int32, copy=False) + n_lh
    positions = np.vstack([verts_lh, verts_rh]).astype(np.float32, copy=False)
    indices = np.vstack([faces_lh, faces_rh]).astype(np.int32, copy=False)

    indices = _decimate_faces(indices, target_faces=TARGET_FACES)
    positions = _quantize_positions(positions)

    mesh = _Mesh(positions=positions, indices=indices, n_lh=n_lh, n_rh=n_rh)
    _MESH_CACHE[key] = mesh
    return mesh, subjects_dir_eff


def _ensure_subjects_dir(subjects_dir: str | None) -> str:
    if subjects_dir:
        return str(subjects_dir)
    try:
        import mne  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"mne is required to fetch fsaverage subjects_dir: {exc}") from exc
    fs_dir = mne.datasets.fetch_fsaverage(verbose="WARNING")
    from pathlib import Path

    return str(Path(fs_dir).parent)


def _read_surf(subjects_dir: str, *, subject: str, hemi: str, surf: str) -> tuple[np.ndarray, np.ndarray]:
    from pathlib import Path

    surf_path = Path(subjects_dir) / subject / "surf" / f"{hemi}.{surf}"
    if not surf_path.exists():  # pragma: no cover
        raise FileNotFoundError(f"Surface not found: {surf_path}")

    try:
        from nibabel.freesurfer.io import read_geometry  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"nibabel is required to read FreeSurfer surfaces: {exc}") from exc

    verts, faces = read_geometry(str(surf_path))
    return np.asarray(verts, dtype=np.float32), np.asarray(faces, dtype=np.int32)


def _decimate_faces(faces: np.ndarray, *, target_faces: int) -> np.ndarray:
    n_faces = int(faces.shape[0])
    if n_faces <= target_faces:
        return faces
    step = int(math.ceil(n_faces / max(1, target_faces)))
    dec = faces[::step]
    # Keep deterministic length close to target
    if int(dec.shape[0]) > target_faces:
        dec = dec[:target_faces]
    return dec


def _quantize_positions(pos: np.ndarray, *, decimals: int = 3) -> np.ndarray:
    if decimals < 0:
        return pos
    scale = float(10**decimals)
    return (np.round(pos * scale) / scale).astype(np.float32, copy=False)


def _pack_positions(pos: np.ndarray) -> list[float]:
    # Flat arrays are smaller in JSON than nested [x,y,z] lists.
    return [float(x) for x in pos.reshape(-1)]


def _pack_indices(idx: np.ndarray) -> list[int]:
    return [int(x) for x in idx.reshape(-1)]


def _band_to_vertex_scalars(payload: Any, *, mesh: _Mesh, subjects_dir: str, subject: str) -> np.ndarray:
    # Vertex-scalar form
    if isinstance(payload, dict) and "lh" in payload and "rh" in payload:
        lh = np.asarray(payload.get("lh"), dtype=np.float32).reshape(-1)
        rh = np.asarray(payload.get("rh"), dtype=np.float32).reshape(-1)
        if lh.shape[0] != mesh.n_lh or rh.shape[0] != mesh.n_rh:
            raise ValueError(
                f"Scalar length mismatch: lh={lh.shape[0]} rh={rh.shape[0]} expected {mesh.n_lh}/{mesh.n_rh}"
            )
        return np.concatenate([lh, rh], axis=0)

    # ROI map form (Desikan-Killiany aparc labels, with -lh/-rh suffixes)
    if isinstance(payload, dict):
        roi_map = {str(k): float(v) for k, v in payload.items() if v is not None}
        return _project_roi_map_to_vertices(roi_map, mesh=mesh, subjects_dir=subjects_dir, subject=subject)

    raise TypeError(f"Unsupported stc_dict band payload type: {type(payload)!r}")


def _project_roi_map_to_vertices(
    roi_map: dict[str, float],
    *,
    mesh: _Mesh,
    subjects_dir: str,
    subject: str,
    parc: str = "aparc",
) -> np.ndarray:
    labels = _get_or_load_label_vertices(subjects_dir, subject=subject, parc=parc)
    out = np.zeros((mesh.n_lh + mesh.n_rh,), dtype=np.float32)

    for label_name, value in roi_map.items():
        hemi = "lh" if label_name.endswith("-lh") else "rh" if label_name.endswith("-rh") else None
        if hemi is None:
            continue
        base_name = label_name[:-3]
        label_key = f"{base_name}-{hemi}"
        verts_lh, verts_rh = labels.get(label_key, (None, None))
        if hemi == "lh" and verts_lh is not None and verts_lh.size:
            out[verts_lh.astype(np.int64)] = float(value)
        elif hemi == "rh" and verts_rh is not None and verts_rh.size:
            out[(mesh.n_lh + verts_rh.astype(np.int64))] = float(value)

    return out


def _get_or_load_label_vertices(
    subjects_dir: str,
    *,
    subject: str,
    parc: str,
) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    key = (subjects_dir, parc)
    cached = _LABEL_CACHE.get(key)
    if cached is not None:
        return cached
    try:
        import mne  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"mne is required to read annotation labels: {exc}") from exc

    labels = mne.read_labels_from_annot(subject, parc=parc, subjects_dir=subjects_dir, verbose="WARNING")
    out: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for lab in labels:
        name = str(getattr(lab, "name", ""))
        if "unknown" in name.lower():
            continue
        hemi = getattr(lab, "hemi", None)
        verts = np.asarray(getattr(lab, "vertices", np.array([], dtype=int)), dtype=np.int32)
        base = name.split("-")[0]
        key_name = f"{base}-{hemi}"
        existing = out.get(key_name)
        if existing is None:
            out[key_name] = (verts if hemi == "lh" else np.array([], dtype=np.int32),
                             verts if hemi == "rh" else np.array([], dtype=np.int32))
        else:
            lh_v, rh_v = existing
            if hemi == "lh":
                out[key_name] = (verts, rh_v)
            elif hemi == "rh":
                out[key_name] = (lh_v, verts)

    _LABEL_CACHE[key] = out
    return out


def _sanitize_scalars(arr: np.ndarray) -> np.ndarray:
    out = np.asarray(arr, dtype=np.float32).reshape(-1)
    # Replace NaNs/Infs with 0 to keep the WebGL pipeline happy.
    bad = ~np.isfinite(out)
    if np.any(bad):
        out = out.copy()
        out[bad] = 0.0
    return out


def _within_subject_z(power: np.ndarray) -> np.ndarray:
    mu = float(np.mean(power))
    sd = float(np.std(power))
    if not math.isfinite(sd) or sd <= 1e-12:
        return np.zeros_like(power, dtype=np.float32)
    z = (power - mu) / sd
    # Clip for stable color scaling.
    return np.clip(z, -4.0, 4.0).astype(np.float32, copy=False)


def _build_luts() -> dict[str, Any]:
    return {
        "power": {"name": "viridis", "rgba256": _lut_rgba256("viridis")},
        "z": {"name": "RdBu_r", "rgba256": _lut_rgba256("RdBu_r")},
    }


def _lut_rgba256(cmap_name: str) -> list[int]:
    try:
        import matplotlib  # type: ignore
    except Exception:
        return _fallback_lut(cmap_name)

    # Avoid deprecated matplotlib.cm.get_cmap.
    cmap = matplotlib.colormaps.get_cmap(cmap_name).resampled(LUT_SIZE)
    rgba = (np.asarray([cmap(i) for i in range(LUT_SIZE)]) * 255.0).astype(np.uint8)
    rgba[:, 3] = 255
    return [int(x) for x in rgba.reshape(-1)]


def _fallback_lut(cmap_name: str) -> list[int]:
    # Simple gradients if matplotlib isn't present.
    out = np.zeros((LUT_SIZE, 4), dtype=np.uint8)
    out[:, 3] = 255
    if cmap_name.lower() == "viridis":
        # dark blue -> green -> yellow
        t = np.linspace(0.0, 1.0, LUT_SIZE)
        out[:, 0] = (255 * np.clip(1.6 * (t - 0.4), 0, 1)).astype(np.uint8)
        out[:, 1] = (255 * np.clip(1.6 * t, 0, 1)).astype(np.uint8)
        out[:, 2] = (255 * np.clip(1.2 * (1 - t), 0, 1)).astype(np.uint8)
    else:
        # blue -> white -> red
        t = np.linspace(-1.0, 1.0, LUT_SIZE)
        out[:, 0] = (255 * np.clip((t + 1) / 2, 0, 1)).astype(np.uint8)
        out[:, 2] = (255 * np.clip((1 - t) / 2, 0, 1)).astype(np.uint8)
        out[:, 1] = (255 * (1 - np.abs(t))).astype(np.uint8)
    return [int(x) for x in out.reshape(-1)]


def _estimate_payload_bytes(payload: dict[str, Any]) -> None:
    # Best-effort guardrail: measure approximate JSON size and warn by exception
    # only if it's wildly off (callers can catch and decide).
    import json

    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    # We can't gzip here without pulling extra deps; use a conservative heuristic.
    if len(raw) > 40_000_000:  # pragma: no cover
        raise ValueError(f"brain payload too large ({len(raw)/1e6:.1f}MB json); check decimation/quantization")


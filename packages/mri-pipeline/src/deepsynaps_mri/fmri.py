"""
fMRI analysis — resting-state + task fMRI.

Implements the Tier-2 pipeline described in docs/MRI_ANALYZER.md:

* Motion + confound regression (Friston-24 + WM/CSF + optional GSR)
* Scrubbing at FD > 0.5 mm
* Bandpass 0.01 - 0.1 Hz
* Network extraction via DiFuMo-1024 or Yeo-17 / Schaefer-400
* Whole-brain FC matrix via ConnectivityMeasure(kind="correlation")
* Seed-based FC (sgACC -> whole brain) for personalised DLPFC targeting
* Personalised left-DLPFC target = voxel of strongest negative sgACC-FC
  inside DLPFC_L_SEARCH_ROI_MNI_BBOX from constants.py (Fox 2012 / Cash 2021)

All computations happen in MNI152NLin2009cAsym space. Inputs are assumed to
be fMRIPrep-style BOLD + confounds TSV (see pipeline.py for the wrapper).
This module is heavy on IO but does not write artefacts itself — it
returns numpy/nibabel objects and a FunctionalMetrics schema object.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np

from .constants import (
    DLPFC_L_SEARCH_ROI_MNI_BBOX,
    SGACC_SEED_MNI,
    SGACC_SEED_RADIUS_MM,
)
from .schemas import FunctionalMetrics, NetworkMetric, NormedValue

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------
@dataclass
class CleanedBold:
    """Container for a cleaned, standardised BOLD time-series."""
    img: object                              # nibabel Nifti1Image (4D)
    fd_mean_mm: float
    outlier_vol_pct: float
    confounds_used: list[str]
    tr: float


def preprocess_rsfmri(
    bold_path: str | Path,
    t1_path: str | Path | None = None,
    confounds_tsv: str | Path | None = None,
    *,
    smoothing_fwhm_mm: float = 6.0,
    low_pass: float = 0.1,
    high_pass: float = 0.01,
    fd_threshold_mm: float = 0.5,
    use_gsr: bool = True,
    strategy: Literal["simple", "scrubbing", "compcor"] = "scrubbing",
) -> CleanedBold:
    """Motion / confound regression + bandpass + standardisation.

    Implementation uses ``nilearn.interfaces.fmriprep.load_confounds_strategy``
    so it plugs directly into an fMRIPrep derivatives tree. Skull-stripped
    MNI-space BOLD is expected (fMRIPrep ``*_space-MNI152NLin2009cAsym_desc-preproc_bold.nii.gz``).

    Parameters
    ----------
    bold_path : preprocessed BOLD NIfTI (4D, MNI space).
    t1_path   : preprocessed T1 NIfTI (used for brain mask if provided).
    confounds_tsv : fMRIPrep confounds TSV. If None, nilearn autodetects.
    strategy  : "scrubbing" = Friston-24 + WM/CSF + motion outliers scrubbed.

    Returns
    -------
    CleanedBold with the cleaned NIfTI image and QC stats.
    """
    from nilearn.interfaces.fmriprep import load_confounds_strategy
    from nilearn.image import clean_img, load_img

    bold_img = load_img(str(bold_path))
    tr = float(bold_img.header.get_zooms()[-1])

    if strategy == "scrubbing":
        confounds, sample_mask = load_confounds_strategy(
            str(bold_path),
            denoise_strategy="scrubbing",
            fd_threshold=fd_threshold_mm,
            std_dvars_threshold=1.5,
            motion="full",
            wm_csf="basic",
            global_signal="basic" if use_gsr else None,
        )
    elif strategy == "compcon" or strategy == "compcor":
        confounds, sample_mask = load_confounds_strategy(
            str(bold_path),
            denoise_strategy="compcor",
            motion="full",
            n_compcor=5,
        )
    else:
        confounds, sample_mask = load_confounds_strategy(
            str(bold_path),
            denoise_strategy="simple",
            motion="full",
            wm_csf="basic",
            global_signal="basic" if use_gsr else None,
        )

    n_vols = bold_img.shape[-1]
    outlier_vol_pct = 0.0
    if sample_mask is not None:
        outlier_vol_pct = 100.0 * (1.0 - len(sample_mask) / n_vols)

    fd_col = "framewise_displacement"
    fd_mean = float(confounds[fd_col].mean()) if fd_col in confounds.columns else float("nan")

    clean = clean_img(
        bold_img,
        confounds=confounds,
        sample_mask=sample_mask,
        standardize="zscore_sample",
        detrend=True,
        low_pass=low_pass,
        high_pass=high_pass,
        t_r=tr,
    )
    # Smoothing is applied downstream by the masker (it respects the BOLD mask).

    return CleanedBold(
        img=clean,
        fd_mean_mm=fd_mean,
        outlier_vol_pct=outlier_vol_pct,
        confounds_used=list(confounds.columns),
        tr=tr,
    )


# ---------------------------------------------------------------------------
# Network extraction
# ---------------------------------------------------------------------------
NetworkAtlas = Literal["DiFuMo1024", "DiFuMo256", "Yeo17", "Schaefer400"]


def extract_networks(
    clean_bold: CleanedBold,
    atlas: NetworkAtlas = "DiFuMo256",
    smoothing_fwhm_mm: float = 6.0,
) -> dict[str, np.ndarray]:
    """Return per-network timeseries.

    Uses nilearn's fetch_atlas_* helpers. For DiFuMo we use the
    probabilistic NiftiMapsMasker; for hard-parcel atlases we use
    NiftiLabelsMasker. We do not hard-code the number of networks
    here — caller decides which atlas.

    The return dict maps ``network_label -> (n_timepoints,) ndarray``.
    For DiFuMo and Schaefer, 'labels' are component names.
    """
    from nilearn.maskers import NiftiLabelsMasker, NiftiMapsMasker
    from nilearn import datasets

    if atlas.startswith("DiFuMo"):
        dim = 1024 if atlas == "DiFuMo1024" else 256
        ds = datasets.fetch_atlas_difumo(dimension=dim, resolution_mm=2, legacy_format=False)
        masker = NiftiMapsMasker(
            maps_img=ds["maps"],
            smoothing_fwhm=smoothing_fwhm_mm,
            standardize="zscore_sample",
            detrend=False,        # already done
            memory="nilearn_cache",
            verbose=0,
        )
        ts = masker.fit_transform(clean_bold.img)      # (T, K)
        labels = [str(n) for n in ds["labels"]["Difumo_names"]]
    elif atlas == "Yeo17":
        ds = datasets.fetch_atlas_yeo_2011()
        masker = NiftiLabelsMasker(
            labels_img=ds["thick_17"],
            smoothing_fwhm=smoothing_fwhm_mm,
            standardize="zscore_sample",
            detrend=False,
            memory="nilearn_cache",
            verbose=0,
        )
        ts = masker.fit_transform(clean_bold.img)
        labels = [f"Yeo17_{i+1:02d}" for i in range(ts.shape[1])]
    elif atlas == "Schaefer400":
        ds = datasets.fetch_atlas_schaefer_2018(
            n_rois=400, yeo_networks=17, resolution_mm=2,
        )
        masker = NiftiLabelsMasker(
            labels_img=ds["maps"],
            labels=ds["labels"],
            smoothing_fwhm=smoothing_fwhm_mm,
            standardize="zscore_sample",
            detrend=False,
            memory="nilearn_cache",
            verbose=0,
        )
        ts = masker.fit_transform(clean_bold.img)
        labels = [str(x) for x in ds["labels"]]
    else:
        raise ValueError(f"Unknown atlas {atlas!r}")

    return {label: ts[:, i] for i, label in enumerate(labels)}


def compute_fc_matrix(
    timeseries_dict: dict[str, np.ndarray],
    kind: Literal["correlation", "partial correlation", "tangent"] = "correlation",
) -> tuple[np.ndarray, list[str]]:
    """Stack per-component timeseries and compute FC matrix.

    Returns (fc_matrix, ordered_labels) where fc_matrix is (K, K).
    """
    from nilearn.connectome import ConnectivityMeasure

    labels = list(timeseries_dict.keys())
    ts = np.stack([timeseries_dict[k] for k in labels], axis=1)    # (T, K)

    cm = ConnectivityMeasure(kind=kind, standardize="zscore_sample")
    fc = cm.fit_transform([ts])[0]
    return fc, labels


# ---------------------------------------------------------------------------
# Seed-based FC — sgACC -> whole brain for personalised DLPFC targeting
# ---------------------------------------------------------------------------
def seed_based_fc(
    clean_bold: CleanedBold,
    seed_mni: tuple[float, float, float] = SGACC_SEED_MNI,
    radius_mm: float = SGACC_SEED_RADIUS_MM,
    *,
    smoothing_fwhm_mm: float = 6.0,
):
    """Compute whole-brain FC z-map for the given seed.

    Returns a nibabel Nifti1Image in the same space as ``clean_bold.img``
    where voxel value = Fisher-z Pearson correlation between each voxel
    and the seed-sphere average timeseries.
    """
    from nilearn.maskers import NiftiMasker, NiftiSpheresMasker

    seed_masker = NiftiSpheresMasker(
        seeds=[seed_mni],
        radius=radius_mm,
        standardize="zscore_sample",
        detrend=False,
        smoothing_fwhm=smoothing_fwhm_mm,
        memory="nilearn_cache",
        verbose=0,
    )
    seed_ts = seed_masker.fit_transform(clean_bold.img)         # (T, 1)

    brain_masker = NiftiMasker(
        standardize="zscore_sample",
        detrend=False,
        smoothing_fwhm=smoothing_fwhm_mm,
        memory="nilearn_cache",
        verbose=0,
    )
    brain_ts = brain_masker.fit_transform(clean_bold.img)       # (T, V)

    # Pearson r per voxel
    s = seed_ts[:, 0]
    s = (s - s.mean()) / (s.std() + 1e-12)
    bn = (brain_ts - brain_ts.mean(0)) / (brain_ts.std(0) + 1e-12)
    r = (bn * s[:, None]).mean(0)                                # (V,)
    # Fisher-z
    r = np.clip(r, -0.999999, 0.999999)
    z = np.arctanh(r).astype(np.float32)

    fc_img = brain_masker.inverse_transform(z)
    return fc_img


def find_personalized_dlpfc_target(
    fc_map,
    roi_bbox_mni: dict[str, tuple[float, float]] = DLPFC_L_SEARCH_ROI_MNI_BBOX,
) -> tuple[tuple[float, float, float], float]:
    """Return MNI coord of strongest negative sgACC-FC within the DLPFC search ROI.

    Implements Fox 2012 / Cash 2021 personalised DLPFC algorithm:
      target = argmin_voxel { FC(voxel, sgACC_seed) | voxel in DLPFC_L_SEARCH_ROI }

    Parameters
    ----------
    fc_map    : nibabel Nifti1Image — output of ``seed_based_fc``.
    roi_bbox_mni : bounding box in MNI mm.

    Returns
    -------
    (mni_xyz, min_z) : chosen target and its Fisher-z FC with sgACC.
    """
    import numpy as np
    from nibabel.affines import apply_affine

    data = np.asarray(fc_map.get_fdata(), dtype=np.float32)
    affine = fc_map.affine
    inv = np.linalg.inv(affine)

    # Build voxel bounding box from MNI bbox
    corners_mni = np.array([
        [roi_bbox_mni["x"][i], roi_bbox_mni["y"][j], roi_bbox_mni["z"][k]]
        for i in (0, 1) for j in (0, 1) for k in (0, 1)
    ])
    corners_vox = apply_affine(inv, corners_mni)
    lo = np.floor(corners_vox.min(0)).astype(int)
    hi = np.ceil(corners_vox.max(0)).astype(int)
    lo = np.maximum(lo, 0)
    hi = np.minimum(hi, np.array(data.shape[:3]) - 1)

    sub = data[lo[0]:hi[0] + 1, lo[1]:hi[1] + 1, lo[2]:hi[2] + 1]
    if sub.size == 0 or not np.isfinite(sub).any():
        raise RuntimeError("Empty or non-finite DLPFC search ROI.")

    rel_idx = np.unravel_index(np.nanargmin(sub), sub.shape)
    vox = np.array(rel_idx) + lo
    mni = apply_affine(affine, vox)
    return (float(mni[0]), float(mni[1]), float(mni[2])), float(sub[rel_idx])


# ---------------------------------------------------------------------------
# Assemble FunctionalMetrics
# ---------------------------------------------------------------------------
# Mapping: DiFuMo / Schaefer component name substrings → canonical network code.
_NETWORK_KEYWORDS: dict[str, tuple[str, ...]] = {
    "DMN":      ("default", "DMN", "posterior cingulate", "precuneus", "PCC", "mPFC"),
    "SN":       ("salience", "insula", "anterior insula", "dACC"),
    "CEN":      ("frontoparietal", "control", "DLPFC", "dorsolateral"),
    "SMN":      ("somatomotor", "motor", "M1", "sensorimotor"),
    "Language": ("language", "broca", "wernicke", "temporal superior"),
    "Visual":   ("visual", "occipital", "V1", "V2"),
    "DAN":      ("dorsal attention", "FEF", "intraparietal"),
    "VAN":      ("ventral attention", "TPJ", "temporoparietal"),
}


def _classify_network(label: str) -> str | None:
    low = label.lower()
    for net, keys in _NETWORK_KEYWORDS.items():
        if any(k.lower() in low for k in keys):
            return net
    return None


def build_functional_metrics(
    clean_bold: CleanedBold,
    timeseries_dict: dict[str, np.ndarray],
    fc_matrix: np.ndarray,
    fc_labels: list[str],
    sgacc_dlpfc_r: float | None = None,
    atlas_name: str = "DiFuMo-256",
) -> FunctionalMetrics:
    """Summarise whole-brain FC into canonical networks (DMN / SN / CEN / ...)."""
    nets: list[NetworkMetric] = []
    buckets: dict[str, list[int]] = {}
    for i, lab in enumerate(fc_labels):
        net = _classify_network(lab)
        if net:
            buckets.setdefault(net, []).append(i)

    for net, idxs in buckets.items():
        if len(idxs) < 2:
            continue
        sub = fc_matrix[np.ix_(idxs, idxs)]
        iu = np.triu_indices_from(sub, k=1)
        mean_within = float(np.nanmean(sub[iu]))
        top_hubs = sorted(
            idxs, key=lambda k: float(np.nanmean(fc_matrix[k, idxs])), reverse=True
        )[:5]
        top_hub_names = [fc_labels[k] for k in top_hubs]
        nets.append(
            NetworkMetric(
                network=net,  # type: ignore[arg-type]
                mean_within_fc=NormedValue(value=mean_within, unit="r"),
                top_hubs=top_hub_names,
            )
        )

    sgacc_norm = None
    if sgacc_dlpfc_r is not None:
        sgacc_norm = NormedValue(
            value=float(sgacc_dlpfc_r),
            unit="fisher_z",
            flagged=sgacc_dlpfc_r > -0.05,   # weak/absent anticorrelation
        )

    return FunctionalMetrics(
        networks=nets,
        sgACC_DLPFC_anticorrelation=sgacc_norm,
        fc_matrix_shape=tuple(fc_matrix.shape),  # type: ignore[arg-type]
        atlas=atlas_name,
    )


# ---------------------------------------------------------------------------
# Task fMRI — minimal GLM hook (Tier-4; optional)
# ---------------------------------------------------------------------------
def run_task_glm(
    bold_path: str | Path,
    events_tsv: str | Path,
    confounds_tsv: str | Path | None = None,
    *,
    tr: float | None = None,
    smoothing_fwhm_mm: float = 6.0,
    contrasts: dict[str, str] | None = None,
) -> dict[str, object]:
    """Very light wrapper around nilearn FirstLevelModel for task fMRI.

    Returns ``{contrast_name: z_map_nifti}``. Intended as a hook for future
    task paradigms (motor mapping, emotion regulation, n-back) — task GLM
    is explicitly Tier-4 in the v1 spec.
    """
    from nilearn.glm.first_level import FirstLevelModel
    import pandas as pd

    events = pd.read_csv(events_tsv, sep="\t")
    confounds = None
    if confounds_tsv is not None:
        confounds = pd.read_csv(confounds_tsv, sep="\t")

    model = FirstLevelModel(
        t_r=tr,
        noise_model="ar1",
        hrf_model="spm + derivative",
        smoothing_fwhm=smoothing_fwhm_mm,
        standardize=False,
        signal_scaling=0,
        minimize_memory=True,
    )
    model = model.fit(str(bold_path), events=events, confounds=confounds)

    contrasts = contrasts or {}
    return {name: model.compute_contrast(expr, output_type="z_score")
            for name, expr in contrasts.items()}

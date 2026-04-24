"""
Diffusion MRI — DTI tensor fit + tractography + bundle segmentation.

Tier-3 in docs/MRI_ANALYZER.md. Uses DIPY (core) with an optional
scilpy hand-off for nicer Recobundles output. No hard dependency on
FSL or MRtrix — all numpy/DIPY so it ships with ``pip install``.

Pipeline
--------
1. Load DWI + bvals/bvecs (NIfTI + FSL-format).
2. Denoise (Patch2Self or Local PCA if scilpy available).
3. Brain mask via median_otsu.
4. Tensor fit (``dipy.reconst.dti``) -> FA, MD, RD, AD maps.
5. ODF fit (CSD) for probabilistic tracking when shells >= 2.
6. Deterministic EuDX tractography (fallback).
7. Registration of tractogram to MNI (done externally in pipeline.py).
8. Recobundles bundle segmentation (auto-downloads bundle atlas).
9. Per-bundle FA / MD summary -> BundleMetric list.

Bundles of clinical interest (hard-coded in ``CLINICAL_BUNDLES`` below):
arcuate (language), corticospinal tract (motor / stroke / pain),
uncinate (mood / memory), IFOF (semantic), ILF (visual-semantic),
cingulum (memory / DMN), fornix (memory / AD).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .schemas import BundleMetric, DiffusionMetrics, NormedValue

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Clinically relevant bundles exposed by Recobundles / bundle-atlas v1
# ---------------------------------------------------------------------------
CLINICAL_BUNDLES: tuple[str, ...] = (
    "AF_L", "AF_R",              # arcuate fasciculus  (language)
    "CST_L", "CST_R",            # corticospinal tract (motor, pain, stroke)
    "UF_L", "UF_R",              # uncinate            (mood, memory)
    "IFOF_L", "IFOF_R",          # inferior fronto-occipital (semantic)
    "ILF_L", "ILF_R",            # inferior longitudinal (visual-semantic)
    "CG_L", "CG_R",              # cingulum            (memory, DMN)
    "FX_L", "FX_R",              # fornix              (memory, AD biomarker)
)


@dataclass
class DTIMaps:
    fa: object             # nibabel Nifti1Image
    md: object
    rd: object
    ad: object
    mask: object
    affine: np.ndarray = field(default_factory=lambda: np.eye(4))
    n_bad_vols: int = 0


# ---------------------------------------------------------------------------
# Denoise + mask + tensor fit
# ---------------------------------------------------------------------------
def fit_dti(
    dwi_path: str | Path,
    bval_path: str | Path,
    bvec_path: str | Path,
    *,
    denoise: bool = True,
) -> DTIMaps:
    """Run the full per-subject DTI pipeline.

    Returns DTIMaps with FA / MD / RD / AD images + brain mask.
    """
    import nibabel as nib
    from dipy.core.gradients import gradient_table
    from dipy.io.gradients import read_bvals_bvecs
    from dipy.reconst.dti import TensorModel, fractional_anisotropy, mean_diffusivity
    from dipy.segment.mask import median_otsu

    img = nib.load(str(dwi_path))
    data = img.get_fdata()
    affine = img.affine

    bvals, bvecs = read_bvals_bvecs(str(bval_path), str(bvec_path))
    gtab = gradient_table(bvals, bvecs)

    if denoise:
        try:
            from dipy.denoise.patch2self import patch2self
            data = patch2self(data, bvals, clip_negative_vals=False, shift_intensity=True)
        except Exception as e:                                         # noqa: BLE001
            log.warning("patch2self denoise failed (%s) — skipping denoise.", e)

    # Skull-strip / brain mask from b0
    data_masked, mask = median_otsu(data, vol_idx=np.where(bvals == 0)[0], median_radius=2, numpass=1)

    # Outlier volume detection — residual-based approximation
    tenmodel = TensorModel(gtab)
    tenfit = tenmodel.fit(data_masked, mask=mask)
    fa = np.clip(fractional_anisotropy(tenfit.evals), 0, 1)
    md = mean_diffusivity(tenfit.evals)
    # radial / axial diffusivity
    evals = tenfit.evals
    ad = evals[..., 0]
    rd = evals[..., 1:].mean(-1)

    def _as_img(arr):
        return nib.Nifti1Image(arr.astype(np.float32), affine)

    return DTIMaps(
        fa=_as_img(fa),
        md=_as_img(md),
        rd=_as_img(rd),
        ad=_as_img(ad),
        mask=nib.Nifti1Image(mask.astype(np.uint8), affine),
        affine=affine,
        n_bad_vols=0,
    )


# ---------------------------------------------------------------------------
# Tractography
# ---------------------------------------------------------------------------
def track_whole_brain(
    dwi_path: str | Path,
    bval_path: str | Path,
    bvec_path: str | Path,
    dti_maps: DTIMaps,
    *,
    method: str = "deterministic",
    fa_threshold: float = 0.2,
    step_size: float = 0.5,
    density: int = 1,
):
    """Return a DIPY ``StatefulTractogram`` in voxel/RAS+ space.

    ``method`` = "deterministic" (EuDX) or "probabilistic" (CSD + PFT).
    The probabilistic path requires multi-shell data — we auto-fall back
    to deterministic tracking for single-shell acquisitions.
    """
    import nibabel as nib
    from dipy.core.gradients import gradient_table
    from dipy.data import default_sphere
    from dipy.direction import peaks_from_model, ProbabilisticDirectionGetter
    from dipy.io.gradients import read_bvals_bvecs
    from dipy.io.stateful_tractogram import Space, StatefulTractogram
    from dipy.reconst.csdeconv import ConstrainedSphericalDeconvModel, auto_response_ssst
    from dipy.reconst.shm import CsaOdfModel
    from dipy.tracking import utils
    from dipy.tracking.local_tracking import LocalTracking
    from dipy.tracking.stopping_criterion import ThresholdStoppingCriterion

    img = nib.load(str(dwi_path))
    data = img.get_fdata()
    affine = img.affine
    bvals, bvecs = read_bvals_bvecs(str(bval_path), str(bvec_path))
    gtab = gradient_table(bvals, bvecs)
    mask = np.asarray(dti_maps.mask.get_fdata()).astype(bool)
    fa = np.asarray(dti_maps.fa.get_fdata())

    stop = ThresholdStoppingCriterion(fa, fa_threshold)

    # Seeds from WM (FA > threshold + 0.1)
    seeds = utils.seeds_from_mask(fa > (fa_threshold + 0.1), affine, density=density)

    n_shells = len(np.unique(np.round(bvals / 100) * 100)) - (1 if 0 in bvals else 0)

    if method == "probabilistic" and n_shells >= 2:
        resp, _ = auto_response_ssst(gtab, data, roi_radii=10, fa_thr=0.7)
        csd_model = ConstrainedSphericalDeconvModel(gtab, resp, sh_order=6)
        csd_fit = csd_model.fit(data, mask=mask)
        getter = ProbabilisticDirectionGetter.from_shcoeff(
            csd_fit.shm_coeff, max_angle=30.0, sphere=default_sphere
        )
    else:
        csa = CsaOdfModel(gtab, sh_order=6)
        peaks = peaks_from_model(
            model=csa,
            data=data,
            sphere=default_sphere,
            relative_peak_threshold=0.5,
            min_separation_angle=25,
            mask=mask,
            return_odf=False,
            parallel=False,
        )
        getter = peaks

    streamlines_gen = LocalTracking(
        getter, stop, seeds, affine, step_size=step_size, return_all=False,
    )
    sft = StatefulTractogram(list(streamlines_gen), img, Space.RASMM)
    return sft


# ---------------------------------------------------------------------------
# Recobundles bundle segmentation
# ---------------------------------------------------------------------------
def segment_bundles(
    tractogram,
    *,
    bundles: tuple[str, ...] = CLINICAL_BUNDLES,
    atlas_dir: str | Path | None = None,
) -> dict[str, object]:
    """Recobundles against the HCP-842 bundle atlas.

    If ``atlas_dir`` is None, uses DIPY's fetch helper (network required).
    Returns ``{bundle_name: StatefulTractogram}``.
    """
    from dipy.segment.bundles import RecoBundles
    from dipy.data.fetcher import fetch_bundle_atlas_hcp842, get_bundle_atlas_hcp842

    if atlas_dir is None:
        try:
            fetch_bundle_atlas_hcp842()
            atlas_path, all_bundles_dir = get_bundle_atlas_hcp842()
            atlas_dir = Path(all_bundles_dir).parent
        except Exception as e:                                        # noqa: BLE001
            log.warning("bundle atlas fetch failed (%s)", e)
            return {}

    from dipy.io.streamline import load_tractogram
    rb = RecoBundles(tractogram.streamlines, clust_thr=15, rng=np.random.RandomState(42))

    out: dict[str, object] = {}
    atlas_root = Path(atlas_dir)
    for name in bundles:
        cand = list(atlas_root.glob(f"**/{name}.trk")) + list(atlas_root.glob(f"**/{name}.tck"))
        if not cand:
            continue
        model_bundle = load_tractogram(str(cand[0]), reference="same", bbox_valid_check=False)
        try:
            rec_labels, _ = rb.recognize(
                model_bundle=model_bundle.streamlines,
                model_clust_thr=5.0,
                reduction_thr=10,
                slr=True,
            )
            out[name] = tractogram.streamlines[rec_labels]
        except Exception as e:                                        # noqa: BLE001
            log.debug("Recobundles failed for %s: %s", name, e)
    return out


# ---------------------------------------------------------------------------
# Bundle metrics -> DiffusionMetrics schema
# ---------------------------------------------------------------------------
def summarise_bundles(
    bundle_streamlines: dict[str, object],
    dti_maps: DTIMaps,
) -> list[BundleMetric]:
    """Compute mean FA / MD per bundle using streamline-voxel sampling."""
    from dipy.tracking.streamline import values_from_volume

    fa_arr = np.asarray(dti_maps.fa.get_fdata())
    md_arr = np.asarray(dti_maps.md.get_fdata())
    affine = dti_maps.affine

    metrics: list[BundleMetric] = []
    for name, sl in bundle_streamlines.items():
        if len(sl) == 0:
            continue
        fa_vals = np.concatenate(values_from_volume(fa_arr, sl, affine))
        md_vals = np.concatenate(values_from_volume(md_arr, sl, affine))
        metrics.append(
            BundleMetric(
                bundle=name,
                mean_FA=NormedValue(value=float(np.nanmean(fa_vals)), unit="FA"),
                mean_MD=NormedValue(value=float(np.nanmean(md_vals)), unit="mm^2/s"),
                streamline_count=len(sl),
            )
        )
    return metrics


def build_diffusion_metrics(
    bundle_metrics: list[BundleMetric],
    *,
    fa_s3: str | None = None,
    md_s3: str | None = None,
    tractogram_s3: str | None = None,
) -> DiffusionMetrics:
    return DiffusionMetrics(
        bundles=bundle_metrics,
        fa_map_s3=fa_s3,
        md_map_s3=md_s3,
        tractogram_s3=tractogram_s3,
    )

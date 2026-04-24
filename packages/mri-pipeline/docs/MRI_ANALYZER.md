# DeepSynaps MRI / fMRI Analyzer — Full Specification

**Module:** `deepsynaps_mri_analyzer`
**Dashboard page:** MRI Analyzer (sidebar: **Neuroimaging → MRI**)
**Status:** Scaffold + spec (v0.1.0)
**Sibling modules:** `deepsynaps_qeeg_analyzer/` (qEEG + MedRAG), `deepsynaps_db/` (literature)

---

## 1. Purpose

Clinicians upload patient neuroimaging (structural T1, resting-state fMRI, DTI, optionally task fMRI or FLAIR). The portal returns:

1. A **structural biomarker report** — cortical thickness, subcortical volumes, white-matter hyperintensity burden, with normative z-scores.
2. **Functional network maps** — DMN, Salience, Central Executive, Sensorimotor, Language — derived from rs-fMRI.
3. **Stim-target coordinates** — for TPS, tFUS, rTMS — in MNI152 and patient space, with cortical depth, coil orientation (for TMS), and derated pressure/intensity (for tFUS).
4. **Colored overlay** on the patient's own T1 showing the stim targets as heatmaps.
5. **MedRAG evidence chain** — cited protocols from the shared 87k-paper DB, retrieved via the hypergraph layer (`kg_hyperedges`) with new `stim_target_for` and `atrophy_in_region` relations.
6. **PDF + HTML report** — clinician-ready.

The module is designed to **drop into the existing DeepSynaps Studio clinical dashboard** as a sibling to the qEEG analyzer, sharing the same Postgres DB, MedRAG layer, user accounts, and S3 storage.

---

## 2. Scope — Tiers 1 – 4

| Tier | Modality | What we produce | v1.0? |
|---|---|---|---|
| 1 | **T1 structural** | Cortical parcellation (Desikan-Killiany + Schaefer-400), subcortical volumetry, cortical thickness, FLAIR/WMH burden | ✅ |
| 2 | **Resting-state fMRI** | DMN/SN/CEN/SMN/Language networks, functional connectivity matrices, **sgACC-anticorrelation DLPFC target** (Fox method) | ✅ |
| 3 | **DTI (diffusion)** | FA/MD/RD/AD maps, deterministic + probabilistic tractography (DIPY), canonical bundle extraction (arcuate, corticospinal, uncinate, IFOF, ILF) | ✅ |
| 4 | **Task fMRI** | Language lateralization, motor mapping — optional | ✅ |
| 5 | MR spectroscopy | (future) GABA / glutamate quantitation | ❌ v2 |
| 5 | Perfusion (ASL) | (future) CBF maps — TPS Alzheimer protocol biomarker | ❌ v2 |

---

## 3. Pipeline

```
  DICOM / NIfTI upload
       │
       ▼
  io.py                         [ingest + deid + dcm2niix]
       │
       ├──► registration.py     [T1 → MNI152 via ANTs SyN; inverse warp saved]
       │
       ├──► structural.py       [FastSurfer (GPU) | SynthSeg (CPU) auto-fallback
       │                         → thickness, volumes, WMH, Desikan-Killiany, Schaefer-400]
       │
       ├──► fmri.py             [motion correction, confound regression, bandpass 0.01-0.1 Hz,
       │                         DiFuMo/Yeo-17 network extraction, FC matrices, sgACC seed FC]
       │
       ├──► dmri.py             [eddy correction (FSL or DIPY), tensor fit, FA/MD, fODF,
       │                         deterministic tracking, Recobundles bundle segmentation]
       │
       ▼
  targeting.py                  [condition-specific target engine → list[StimTarget]]
       │
       ▼
  overlay.py                    [nilearn plot_stat_map + plot_glass_brain → PNG + HTML + MNI coords]
       │
       ▼
  db.py                         [INSERT mri_analyses row; bridge to MedRAG kg_entities]
       │
       ▼
  MedRAG retrieval              [evidence chain from 87k papers for each target/biomarker]
       │
       ▼
  report.py                     [Jinja2 → HTML → weasyprint PDF]
       │
       ▼
  api.py returns JSON + signed S3 URLs
```

---

## 4. Stack — library choices and rationale

| Task | Primary | Fallback | Why |
|---|---|---|---|
| DICOM → NIfTI | `dcm2niix` (subprocess) | `dicom2nifti` Python | [dcm2niix](https://github.com/rordenlab/dcm2niix) is the gold standard; BIDS-compatible sidecar JSON; handles enhanced DICOM + CSA headers |
| DICOM anonymization | `deid` (pydicom) | manual tag removal | [`deid`](https://pydicom.github.io/deid/) is a best-effort HIPAA-compatible de-identifier; blacklist/whitelist/graylist modes |
| Structural segmentation | **FastSurfer** (GPU) | **SynthSeg+** (CPU) | FastSurfer ~5 min with CUDA, SOTA cortical parcellation accuracy. [SynthSeg+](https://www.pnas.org/doi/10.1073/pnas.2216399120) (Billot et al., PNAS 2023) runs on **any MR contrast + resolution**, CPU in <1 min, robust to clinical artifacts — essential for real-world 1.5T / heterogeneous scanners. The auto-fallback gives best-of-both. |
| Registration | `antspyx` | — | ANTs SyN is the gold standard non-linear registration; antspyx is the Python binding |
| fMRI preproc | `fMRIPrep` (Docker) | `nilearn` minimal | fMRIPrep is the community gold standard (BIDS-in/out). For inline low-friction runs, nilearn's built-in confound regression per [Wang et al. 2024](https://journals.plos.org/ploscompbiol/article?id=10.1371%2Fjournal.pcbi.1011942) is sufficient for FC analysis |
| Networks | `nilearn` DiFuMo + Yeo-17 | Schaefer-400 | DiFuMo-1024 gives soft-assignment functional atlases; Yeo-17 is the canonical network reference |
| Diffusion | `DIPY` | `scilpy` | DIPY = core algorithms (tensor, fODF, CSD, tractography). [scilpy](https://apertureneuro.org/article/154022-tractography-analysis-with-the-scilpy-toolbox) complements with post-tractography (Recobundles, bundle segmentation) |
| Rendering | `nilearn.plotting` + `plotly` | — | nilearn's `plot_stat_map` + `view_img` gives static PNG + interactive HTML overlays |
| Report | Jinja2 + weasyprint | — | Matches qEEG analyzer stack |

---

## 5. Targeting atlas — the clinical heart of the module

The file `src/deepsynaps_mri/constants.py` contains the curated target atlas. Every entry is evidence-anchored.

### 5.1 rTMS targets for MDD (left DLPFC — multiple methods)

| Method | MNI (x, y, z) | Paper | Notes |
|---|---|---|---|
| Fox sgACC-anticorrelation (group-avg) | (−38, +44, +26) | [Fox et al. 2012](https://pubmed.ncbi.nlm.nih.gov/22524225/); reaffirmed in [Frontiers NeuroImaging 2026](https://www.frontiersin.org/journals/neuroimaging/articles/10.3389/fnimg.2025.1703198/full) | Group target with strong sgACC-negative connectivity |
| BA9 (dorsal) | (−36, +39, +43) | multi-study (see [bioRxiv 2023](https://www.biorxiv.org/content/10.1101/2023.03.09.531726v1.full-text)) | Anatomical dorsal DLPFC |
| BA46 | (−44, +40, +29) | multi-study | Ventro-lateral DLPFC |
| F3 Beam (group-avg) | (−37, +26, +49) | [Beam et al. 2009](https://pubmed.ncbi.nlm.nih.gov/18801479/) | 10-20 EEG F3 projected to cortex |
| "5 cm rule" | (−41, +16, +54) | Pascual-Leone 1996 | Legacy — lower efficacy than imaging-guided |
| sgACC group target (Cash) | (−42, +44, +30) | [bioRxiv 2023](https://www.biorxiv.org/content/10.1101/2023.03.09.531726v1.full-text) | Used by SAINT / Nolan Williams lab |
| **Personalized sgACC-anticorrelation** | per-subject | — | Computed at run time from patient's rs-fMRI (see §5.1.1) |

### 5.1.1 Personalized DLPFC target algorithm (the big win)

```
1. Register patient T1 → MNI152NLin2009cAsym via ANTs SyN
2. Preprocess rs-fMRI (fMRIPrep minimal or nilearn)
3. Place 10 mm sphere seed at sgACC (MNI −6, +16, −10)
4. Compute voxel-wise FC map (Pearson r of sgACC mean timeseries with all voxels)
5. Within the left DLPFC ROI (BA9/BA46/middle frontal gyrus mask), find the voxel
   with the **most-negative** FC to sgACC
6. Report that voxel in MNI + patient space, project to cortical surface, compute depth
7. Cite: Fox et al. 2012; Cash et al. 2021; Weigand et al. 2018
```

### 5.2 TPS targets for Alzheimer's (Neurolith / Storz Medical)

Based on [Beisteiner et al. 2020](https://pubmed.ncbi.nlm.nih.gov/31951100/) and [TPS-AD functional specificity study 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9338196/). ROI volumes and pulse counts are clinical reference values.

| ROI | Pulses/hemisphere | Volume (cm³) | Rationale |
|---|---|---|---|
| Bilateral frontal cortex (DLPFC + inferior frontal incl. Broca) | 2 × 800 | 136–164 | Memory / attention / language |
| Bilateral lateral parietal cortex (incl. Wernicke) | 2 × 400 | 122–147 | Language comprehension |
| Extended precuneus (bilateral) | 2 × 600 | 66–92 | DMN hub; early AD atrophy target |

TPS delivers 0.2–0.25 mJ/mm² with ~3 µs ultrashock pulses at 4-5 Hz. Spatial resolution ~5 mm FWHM, penetration depth up to 8 cm (entire cortical mantle).

### 5.3 tFUS targets

| Target | MNI | Condition | Source |
|---|---|---|---|
| Subcallosal cingulate (SCC) | (+4, +20, −12) | TRD | [Riis et al. 2023, NCT05301036](https://pmc.ncbi.nlm.nih.gov/articles/PMC11026350/) — depression resolved within 24h post-tFUS |
| L hippocampus | (−26, −22, −12) | Epilepsy, MCI | [Brinker et al. 2020, NCT03868293](https://pmc.ncbi.nlm.nih.gov/articles/PMC11026350/) |
| L M1 (hand) | (−37, −21, +58) | Motor, pain | Legon et al. 2018 |
| R IFG | (+48, +20, +20) | Mood, inhibitory control | [Sanguinetti 2020, Fine 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC11026350/) |
| L V1 | (−6, −92, 0) | Vision | Lee et al. 2016 |
| L thalamic VPL | (−18, −20, +6) | Sensory | Kim 2023 |
| L globus pallidus | (−22, −4, 0) | Movement | Cain 2021 |

**Derated in-situ parameters (Pr, I_SPPA, I_SPTA, MI)** are generated from the atlas entry × pseudo-CT skull attenuation model ([Siddiqi pseudo-CT tool](https://www.brainstimjrnl.com/)) so the coil-surface parameters account for skull attenuation at the target. FDA limits: I_SPTA.3 ≤ 720 mW/cm², MI ≤ 1.9 (diagnostic). Clinical tFUS typically uses 500 kHz, 0.1–1 MPa Pr, 10-50 % duty cycle.

### 5.4 TMS targets for other conditions

| Condition | Target | MNI | Method |
|---|---|---|---|
| PTSD | R DLPFC | (+42, +40, +26) | inhibitory 1 Hz / cTBS |
| OCD | bilateral DMPFC / pre-SMA | (0, +50, +30) / (0, +18, +58) | HF rTMS or dTMS (H7 coil) |
| Chronic pain | L M1 | (−37, −21, +58) | HF rTMS over hand M1 |
| Tinnitus | L auditory cortex (A1) | (−52, −20, +6) | 1 Hz rTMS |
| Stroke rehab (contralesional inhibition) | R M1 | (+37, −21, +58) | 1 Hz rTMS |
| ADHD | R DLPFC + R IFG | (+42, +40, +26) / (+48, +20, +20) | HF rTMS |

Every entry ships with a list of at least 2 DOIs from the 87k-paper DB.

---

## 6. Structural biomarkers — normative z-scores

| Biomarker | Atlas | Normative source |
|---|---|---|
| Cortical thickness (Desikan-Killiany 68 ROI) | FreeSurfer DK | Habes et al. 2021 ISTAGING (N=10k) |
| Hippocampal volume | Aseg left/right hippocampus | ADNI + UK Biobank trajectories |
| Subcortical volumes (caudate, putamen, thalamus, amygdala, NAcc) | Aseg | UK Biobank |
| WMH burden | SynthSeg+ | ARIC-NCS |
| Ventricular volume | Aseg | UK Biobank |

All z-scores are computed from age + sex + ICV + scanner-field-strength-adjusted normative curves.

---

## 7. Output JSON contract (MedRAG-compatible)

```jsonc
{
  "analysis_id": "uuid",
  "patient": { "age": 35, "sex": "F", "handedness": "R" },
  "modalities_present": ["T1", "rs_fMRI", "DTI"],
  "segmentation_engine": "fastsurfer",     // or "synthseg"
  "qc": {
    "t1_snr": 18.3,
    "fmri_framewise_displacement_mean_mm": 0.18,
    "dti_outlier_volumes": 2
  },
  "structural": {
    "cortical_thickness_mm": { "DK.lh.DLPFC": { "value": 2.14, "z": -1.8 }, "...": {} },
    "subcortical_volume_mm3": { "lh_hippocampus": { "value": 3512, "z": -2.4 }, "...": {} },
    "wmh_volume_ml": { "value": 4.8, "z": 1.1 }
  },
  "functional": {
    "networks": {
      "DMN":      { "mean_within_fc": 0.42, "z": -1.9 },
      "SN":       { "mean_within_fc": 0.38, "z":  0.3 },
      "CEN":      { "mean_within_fc": 0.41, "z": -0.5 },
      "SMN":      { "mean_within_fc": 0.55, "z":  0.1 },
      "Language": { "mean_within_fc": 0.48, "z": -0.2 }
    },
    "sgACC_DLPFC_anticorrelation": { "value": -0.31, "z": -0.8 }
  },
  "diffusion": {
    "bundles": {
      "arcuate_L":       { "mean_FA": 0.48, "z":  0.2 },
      "corticospinal_L": { "mean_FA": 0.55, "z":  0.1 },
      "uncinate_L":      { "mean_FA": 0.41, "z": -1.2 }
    }
  },
  "stim_targets": [
    {
      "target_id": "rTMS_MDD_personalized",
      "modality": "rtms",
      "condition": "mdd",
      "mni_xyz":     [-41.2, 43.8, 27.4],
      "patient_xyz": [-39.6, 41.2, 25.1],
      "cortical_depth_mm": 18.3,
      "method": "sgACC_anticorrelation_personalized",
      "method_reference_dois": ["10.1016/j.biopsych.2012.04.028"],
      "suggested_parameters": {
        "protocol": "iTBS",
        "sessions": 30,
        "pulses_per_session": 600,
        "intensity_pct_rmt": 120
      },
      "coil_orientation_deg": 45,
      "supporting_paper_ids_from_medrag": [12345, 67890, 23456]
    },
    {
      "target_id": "TPS_AD_frontal_bilateral",
      "modality": "tps",
      "condition": "alzheimers",
      "mni_xyz": [-38, 40, 26],
      "roi_volume_cm3": 150,
      "pulses_per_hemisphere": 800,
      "method_reference_dois": ["10.1002/alz.12093"]
    }
  ],
  "medrag_query": {
    "findings": [
      { "type": "region_metric", "value": "thickness_dlpfc_l", "zscore": -1.8 },
      { "type": "network_metric", "value": "sgACC_DLPFC_anticorr", "zscore": -0.8 },
      { "type": "condition", "value": "mdd" }
    ]
  }
}
```

This JSON is consumed by `deepsynaps_qeeg_analyzer/medrag/src/retrieval.py` — same `MedRAG.retrieve()` call path as the qEEG pipeline.

---

## 8. MedRAG extensions

The MRI module adds these to the existing hypergraph schema:

### New entity types in `kg_entities`
- `region_metric` — e.g. `thickness_dlpfc_l`, `volume_hippocampus_l`, `wmh_burden`
- `network_metric` — e.g. `sgACC_DLPFC_anticorr`, `DMN_within_fc`, `SN_within_fc`

### New relations in `kg_relations`
- `atrophy_in_region` — (condition, region_metric) — e.g. AD ⟷ hippocampal_atrophy
- `connectivity_altered` — (condition, network_metric, polarity)
- `stim_target_for` — (modality, region, condition) — anchors the canonical target atlas
- `mri_biomarker_for` — (region_metric | network_metric, condition)

### Migration
`medrag_extensions/04_migration_mri.sql` adds:
- `mri_analyses` table (mirrors `qeeg_analyses` shape; UUID PK, JSONB `structural`, `functional`, `diffusion`, `stim_targets`; `embedding vector(200)` for an eventual MRI foundation model)
- New row types in `kg_entities`
- New relations in `kg_relations`

Seed via `medrag_extensions/05_seed_mri_entities.py`.

---

## 9. Colored overlay rendering

`overlay.py` produces three artefacts per stim target:

1. **Static PNG triplet** — axial / coronal / sagittal slices through the target voxel via `nilearn.plotting.plot_stat_map`. Heatmap uses `viridis` for thickness z-scores, `RdBu_r` for FC deviation.
2. **Glass brain** — `plot_glass_brain` showing all targets on one canvas.
3. **Interactive HTML** — `nilearn.plotting.view_img` embedded in the report (user can scroll/rotate).

For each target, the overlay legend includes:
- MNI + patient-space coordinates
- Cortical depth
- Target type (rTMS / TPS / tFUS)
- Evidence chain summary

---

## 10. Dashboard integration — the MRI Analyzer page

### Sidebar location
`Neuroimaging → MRI Analyzer` (sibling to the existing `Neuroimaging → qEEG Analyzer`).

### Page layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Upload panel            │  Patient info + consent + modality checkboxes  │
│ (DICOM zip, NIfTI, BIDS)│                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ QC panel                │  SNR, motion, outlier volumes                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Structural tab │ Functional tab │ Diffusion tab │ Stim Targets tab │ Rpt │
└──────────────────────────────────────────────────────────────────────────┘

Stim Targets tab (the money shot):
 ┌──────────────────────────────────────┬───────────────────────────────────┐
 │ Interactive glass brain              │ Target list (scrollable):         │
 │ (plotly overlay on MNI152)           │ ● rTMS MDD — personalized DLPFC   │
 │                                      │   MNI: -41.2, 43.8, 27.4          │
 │                                      │   Depth: 18.3 mm  Conf: high       │
 │                                      │   ▸ 3 cited protocols             │
 │                                      │ ● TPS AD — bilateral frontal       │
 │                                      │ ● tFUS MDD — SCC                  │
 └──────────────────────────────────────┴───────────────────────────────────┘
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ MedRAG evidence for selected target                                      │
 │ [paper #12345] SAINT Protocol for TRD (Cole et al. 2022)                 │
 │   └─ stim_target_for: rTMS + DLPFC + MDD  (support=1247, high)          │
 │   └─ biomarker_for: sgACC-DLPFC-anticorr + MDD  (support=89)            │
 │   doi: 10.1176/... → [Open PDF]                                          │
 └──────────────────────────────────────────────────────────────────────────┘
```

### API endpoints (FastAPI)
- `POST /api/mri/upload` — multipart DICOM zip or NIfTI; returns `analysis_id`
- `GET  /api/mri/{analysis_id}` — poll status
- `GET  /api/mri/{analysis_id}/report.json` — full report
- `GET  /api/mri/{analysis_id}/report.pdf` — signed S3 URL
- `GET  /api/mri/{analysis_id}/overlay/{target_id}.png` — static overlay
- `GET  /api/mri/{analysis_id}/overlay/{target_id}.html` — interactive overlay
- `GET  /api/mri/{analysis_id}/evidence/{target_id}` — MedRAG chain

See `portal_integration/api_contract.md` for full schemas.

---

## 11. Regulatory positioning

Automated neuroimaging analysis that informs clinical stimulation is a **regulated medical device**:

- **EU (MDR 2017/745):** Class IIa likely (decision support). Needs CE-marking, QMS (ISO 13485), risk management (ISO 14971), clinical evaluation.
- **US (FDA):** Software as a Medical Device (SaMD); pathway = 510(k) with a predicate like Cortechs icobrain or Siemens NEURO, OR de novo. Some vendors (Cortechs, Combinostics, QMENTA) have cleared structural MRI quantification tools.

**For v1.0 — decision-support-only positioning:**

Every stim target ships with the label:

> *"Reference target coordinates derived from peer-reviewed literature. Not a substitute for clinician judgment. No device is controlled or actuated by this report. Coordinates are for neuronavigation planning only."*

This keeps the module in a decision-support / research-use category while you pursue proper 510(k) / MDR pathway for a commercial release. The backend already supports locking coordinate output behind a clinician-signoff flag (`mri_analyses.clinician_reviewed_at`).

**Deletion / retention policies:**
- DICOM retention: 24h max in hot storage; NIfTI after deid is retained per clinic policy.
- Face-stripping (`mri_deface` / `pydeface`) is applied on ingest before any non-clinician sees the data.
- Full HIPAA audit trail for PHI access.

---

## 12. Runtime estimates

| Step | GPU (A100) | CPU (16-core) |
|---|---|---|
| DICOM → NIfTI + deid | 15 s | 15 s |
| T1 registration to MNI (ANTs SyN) | 3 min | 15 min |
| Segmentation — FastSurfer | 5 min | n/a |
| Segmentation — SynthSeg+ | 2 min | 1 min |
| rs-fMRI preproc (fMRIPrep minimal) | 10 min | 30 min |
| rs-fMRI network extraction (nilearn) | 30 s | 2 min |
| DTI preproc + tensor fit | 5 min | 20 min |
| Tractography (DIPY, 1M streamlines, probabilistic) | 8 min | 45 min |
| Targeting + overlay + MedRAG | 30 s | 30 s |
| **Total end-to-end (full Tier 1-4)** | **~30 min** | **~2 h** |

Without DTI + tractography, total drops to ~15 min on GPU, ~45 min on CPU.

---

## 13. Roadmap

- **v1.1** — MR spectroscopy (GABA/Glx for tFUS protocols)
- **v1.2** — Arterial Spin Labeling (ASL perfusion) for TPS AD protocols
- **v1.3** — LaBraM-MRI analog (EEG-foundation-model equivalent for MRI embeddings) — replace dimension-200 placeholder in `mri_analyses.embedding` with a real MRI FM embedding
- **v2.0** — 510(k) submission
- **v2.1** — Longitudinal patient tracking (treatment-response curves per biomarker)
- **v2.2** — Auto-generated personalized protocol document (plugs into `sozo-clinical-protocol-builder` skill)

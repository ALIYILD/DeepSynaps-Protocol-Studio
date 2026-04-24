# DeepSynaps Studio — qEEG Analyzer Tech Stack

**Goal:** Users upload `.edf` or `.eeg` (BrainVision) files → portal returns a clinical-grade qEEG report (power spectra, topographical maps, connectivity, z-score deviations vs. norms, source localization, AI interpretation).

This document is the decision record and integration blueprint. It is deliberately opinionated — ranked by production-readiness.

---

## TL;DR — The recommended stack

| Layer | Library | License | Why |
|---|---|---|---|
| **Core I/O + processing** | **MNE-Python** | BSD-3 | Industry standard. Reads EDF, EDF+, BrainVision (`.vhdr/.vmrk/.eeg`), BDF, FIF, EEGLAB, EGI, CNT. 200+ contributors, used in thousands of papers ([MNE docs](https://mne.tools/stable/)) |
| **Artifact rejection (automated)** | **autoreject** + **MNE-ICALabel** + **PyPREP** | BSD-3 | `autoreject` finds per-channel peak-to-peak thresholds, `MNE-ICALabel` auto-classifies ICA components (brain/eye/muscle/heart/line-noise/channel-noise), `PyPREP` ports the PREP bad-channel / robust re-reference standard ([autoreject paper](https://pubmed.ncbi.nlm.nih.gov/28645840/), [MNE-ICALabel](https://mne.tools/mne-icalabel/)) |
| **Spectral / qEEG features** | **MNE + SciPy + FOOOF/SpecParam** | BSD-3 / Apache-2.0 | PSD via Welch / multitaper, absolute + relative band power (δ θ α β γ), 1/f aperiodic slope via [SpecParam/FOOOF](https://fooof-tools.github.io/fooof/), peak alpha frequency, band ratios (θ/β for ADHD), peak individual alpha |
| **Connectivity** | **MNE-Connectivity** | BSD-3 | Coherence, imaginary coherence, wPLI, PLV, PLI, AEC, DTF, granger. Required for default-mode / salience network qEEG ([mne-connectivity](https://mne.tools/mne-connectivity/)) |
| **Sleep / event detection** | **YASA** | BSD-3 | If Insomnia is a SOZO condition, YASA gives spindle detection, slow-wave detection, automatic staging, spectrogram plots ([YASA](https://github.com/raphaelvallat/yasa)) |
| **Source localization** | **MNE** + **fsaverage** template | BSD-3 | Exact-LORETA, sLORETA, dSPM, MNE — all implemented. `fsaverage` template MRI means no subject MRI needed ([source localization tutorial](https://mne.tools/stable/auto_tutorials/inverse/30_mne_dspm_loreta.html)) |
| **Full turnkey pipeline** | **EEG-Pype** or **DISCOVER-EEG** or **PyLossless** | Apache-2.0 / MIT | Pre-built MNE-based workflows you can copy architecture from ([EEG-Pype](https://github.com/yorbenlodema/EEG-Pype), [PyLossless](https://github.com/scott-huberty/pylossless)) |
| **Data standard** | **MNE-BIDS** + **MNE-BIDS-Pipeline** | BSD-3 | Store everything BIDS-compliant from day one. You'll thank yourself at CE/FDA audit time ([MNE-BIDS-Pipeline](https://github.com/mne-tools/mne-bids-pipeline)) |
| **Normative database** | **Roll your own** on public datasets + link to qEEG-Pro if a clinical customer needs it | — | Commercial normative DBs (NeuroGuide, qEEG-Pro, HBI, BrainDX) are **$3,500–$6,000+** each and license-locked. See "Normative DB strategy" below |
| **AI reporting** | **Claude Code CLI** orchestrating the pipeline + RAG over your literature DB | — | Your 87k-paper DeepSynaps DB becomes the citation backbone for narrative reports. Matches the exact architecture in the Sept 2025 qEEG-RAG paper ([researchopenworld.com PDF](https://researchopenworld.com/wp-content/uploads/2025/09/JCRM-8-831.pdf)) |

**Bottom line:** Build on MNE-Python. Everything else in the Python EEG ecosystem is either built on it or being replaced by it. Commercial tools (NeuroGuide, qEEG-Pro) exist mainly for their normative databases — not their math.

---

## The canonical DeepSynaps qEEG pipeline

This is the end-to-end flow to implement. Each stage maps to a specific library.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. UPLOAD & INGEST                                                      │
│    User uploads .edf / .vhdr / .eeg                                     │
│    → mne.io.read_raw_edf() / read_raw_brainvision()                     │
│    → validate sampling rate, channel names (10-20 mapping)              │
│    → mne_bids.write_raw_bids()  [standardize to BIDS]                   │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. PREPROCESSING                                                        │
│    PyPREP: robust detrend + bad-channel detection + robust reference    │
│    Bandpass filter 1-45 Hz (0.5-80 for HD-EEG)                          │
│    Notch 50 Hz (UK) or 60 Hz (US)                                       │
│    Resample to 250 Hz                                                   │
│    Interpolate bad channels (spherical spline)                          │
│    Common-average reference                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. ARTIFACT REJECTION                                                   │
│    ICA (infomax or picard, n_components=0.99 explained variance)        │
│    MNE-ICALabel: auto-label → drop eye/muscle/heart/line/channel        │
│    autoreject (local) on epoched data → per-channel thresholds          │
│    Output: clean Epochs (2s windows, 50% overlap for resting state)     │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. qEEG FEATURE EXTRACTION                                              │
│    Per channel × per band (δ 1-4, θ 4-8, α 8-13, β 13-30, γ 30-45):     │
│      • absolute power (µV²/Hz) via Welch                                │
│      • relative power (% of total)                                      │
│      • peak alpha frequency (individual α)                              │
│      • 1/f aperiodic slope (SpecParam)                                  │
│      • band ratios (θ/β, α/β, theta-beta ratio)                         │
│    Asymmetry indices (F3/F4, F7/F8, frontal α)                          │
│    Coherence matrix (intra-band, all-pairs)                             │
│    wPLI connectivity (19×19 per band)                                   │
│    Graph metrics (clustering coef, path length, small-worldness) via    │
│      NetworkX on the connectivity matrix                                │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. SOURCE LOCALIZATION (optional, adds depth to report)                 │
│    fsaverage template + BEM + forward model                             │
│    eLORETA inverse → ROI-level power (Desikan-Killiany atlas, 68 ROIs)  │
│    Map to 10 functional networks (DMN, salience, CEN, SMN, visual …)    │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. NORMATIVE Z-SCORING                                                  │
│    Compare each feature to age/sex-matched norms → z-scores             │
│    Flag |z| > 1.96 (95%) and |z| > 2.58 (99%)                           │
│    Color-coded topomaps (red = excess, blue = deficit)                  │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. REPORT GENERATION (AI-assisted)                                      │
│    Structured features → JSON                                           │
│    RAG over DeepSynaps literature DB (your 87k-paper Postgres)          │
│    LLM narrative report: findings, SOZO condition likelihoods,          │
│      recommended neuromodulation protocols, citations                   │
│    Export: PDF (clinical) + HTML (interactive) + BIDS derivatives       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed library decisions

### 1. File I/O — MNE-Python (non-negotiable)

```python
# EDF (standard European Data Format)
raw = mne.io.read_raw_edf("patient.edf", preload=True)

# BrainVision (.vhdr + .vmrk + .eeg triplet)
raw = mne.io.read_raw_brainvision("patient.vhdr", preload=True)

# EEGLAB .set
raw = mne.io.read_raw_eeglab("patient.set", preload=True)
```

MNE also reads BDF, FIF, CNT, EGI, Nicolet, Persyst, CTF — covering effectively every device you'll encounter ([MNE I/O docs](https://mne.tools/stable/overview/implementation.html#supported-data-formats)). Handles annotations, events, and digital montages automatically.

### 2. Preprocessing — PyPREP ports the PREP standard

[PyPREP](https://github.com/sappelhoff/pyprep) implements the PREP pipeline from Bigdely-Shamlo et al. — the de-facto standard for resting-state qEEG bad-channel detection and robust reference. Installs with `pip install pyprep`, one-line integration into MNE workflows.

### 3. Artifact rejection — layered approach

**MNE-ICALabel** is the game-changer here. It ports the gold-standard MATLAB ICLabel classifier to Python with the same neural network. Labels every IC as one of 7 classes: `brain | eye | muscle | heart | line_noise | channel_noise | other`. You just drop everything that isn't brain with probability > 0.7 ([MNE-ICALabel docs](https://mne.tools/mne-icalabel/)).

```python
from mne_icalabel import label_components
ic_labels = label_components(raw, ica, method="iclabel")
exclude = [i for i, label in enumerate(ic_labels["labels"])
           if label not in ("brain", "other") and ic_labels["y_pred_proba"][i] > 0.7]
ica.apply(raw, exclude=exclude)
```

Then **autoreject** catches remaining bad segments ([autoreject](https://autoreject.github.io/)).

### 4. qEEG spectral — MNE + SpecParam

MNE covers Welch and multitaper PSDs. **SpecParam (formerly FOOOF)** decomposes the PSD into periodic (oscillatory bumps) and aperiodic (1/f background) components — critical because true alpha power ≠ alpha-band power when the aperiodic slope changes with arousal or medication. This is now considered best practice for any modern qEEG ([SpecParam docs](https://fooof-tools.github.io/fooof/)).

### 5. Connectivity — MNE-Connectivity

Separate package, part of the MNE ecosystem. Supports coherence, imaginary coherence, PLV, PLI, wPLI (weighted phase lag index — the current gold standard for volume-conduction-robust connectivity), AEC (amplitude envelope correlation), and directed measures (DTF, PDC, Granger). ([mne-connectivity](https://mne.tools/mne-connectivity/)).

### 6. Source localization — MNE + fsaverage

**Key point:** you do NOT need subject MRIs. MNE ships with the `fsaverage` FreeSurfer template and a pre-computed BEM model. For standard 10-20 electrode placement, a template head model is clinically acceptable and what NeuroGuide/LORETA Key use too.

```python
fs_dir = mne.datasets.fetch_fsaverage()
# setup_source_space → make_bem_solution → make_forward_solution
# make_inverse_operator(method="eLORETA") → apply_inverse(stc)
```

### 7. Pre-built pipelines you can copy from

Don't start from zero. Three open-source reference architectures:

| Pipeline | Focus | Link |
|---|---|---|
| **EEG-Pype** | GUI + resting-state qEEG, Apache-2.0 | [github.com/yorbenlodema/EEG-Pype](https://github.com/yorbenlodema/EEG-Pype) |
| **PyLossless** | Non-destructive, BIDS, continuous integration | [github.com/scott-huberty/pylossless](https://github.com/scott-huberty/pylossless) |
| **DISCOVER-EEG** | Full auto resting-state (MATLAB, but clear architecture) | [Nature paper](https://www.nature.com/articles/s41597-023-02525-0) |
| **MNE-BIDS-Pipeline** | Config-driven, batch, parallel | [github.com/mne-tools/mne-bids-pipeline](https://github.com/mne-tools/mne-bids-pipeline) |
| **qEEG-RAG (Sept 2025)** | **Exactly your architecture**: MNE → features → Europe PMC RAG → LLM report | [PDF](https://researchopenworld.com/wp-content/uploads/2025/09/JCRM-8-831.pdf) |

The Sept-2025 qEEG-RAG paper is striking — it is almost identical to what you're building. Read it carefully; the methods section is a de-facto spec.

---

## Normative database strategy (the hard problem)

Every commercial qEEG product's real moat is its normative database. You have three paths:

### Path A — Build your own from public datasets (open-source, slow)
Aggregate resting-state EEG from [OpenNeuro](https://openneuro.org/), [LEMIP-MIPDB](https://fcon_1000.projects.nitrc.org/indi/cmi_eeg/), [HBN-EEG](http://fcon_1000.projects.nitrc.org/indi/cmi_healthy_brain_network/), [TUH EEG Corpus](https://isip.piconepress.com/projects/nedc/html/tuh_eeg/) — tens of thousands of recordings, many with demographics. Bin by age/sex, compute mean+SD per feature per bin, z-score patient data against it. Not FDA-cleared but defensible for research/wellness positioning.

### Path B — License a commercial DB (fast, expensive)
| DB | Cost (approx) | Notes |
|---|---|---|
| [NeuroGuide](https://appliedneuroscience.com/) | $3,500–6,000 | Most widely cited. Lifespan 0–82 yrs. Industry incumbent |
| [qEEG-Pro](https://qeeg.pro/) | ~$1,500+ | Client-based DB (1,482 EC / 1,231 EO). Newer, aggressive pricing |
| [HBImed](https://www.hbimed.com/) | ~$4,000+ | European, strong in neurofeedback |
| [BrainDX](https://www.braindx.net/) | ~$3,000+ | Delta/theta/alpha/beta only |

Comparison study ([BrainMaster PDF](https://brainmaster.com/wp-content/uploads/2017/08/DatabaseComparisons_for_website-1.pdf)) shows all four agree for δ/θ/α; β diverges. For clinical deployment in Europe under CE, NeuroGuide or qEEG-Pro have the deepest validation literature.

### Path C — Hybrid (recommended for DeepSynaps)
Ship v1 with a **HBN-EEG + LEMIP-derived norm** for wellness/research tier. For clinical tier, partner with or license NeuroGuide/qEEG-Pro — both offer OEM APIs. Be transparent in the UI about which DB is in use for each report.

---

## Hosted API alternatives (skip if you're building your own)

If you want to *not* build this yourself, there are turnkey cloud services — though they have less flexibility and per-scan costs:

- **[iMediSync / iSyncBrain](https://www.imedisync.com/)** — cloud qEEG service, upload EDF → PDF report in ~10 min. Age/sex-matched norm DB. Closest to "just an API" for your use case.
- **[Neurosity MCP](https://neurosity.co/guides/neurofeedback-software-compared)** — newer, AI-native, has a Model Context Protocol bridge for Claude/ChatGPT. Hardware-tied but their SDK is open.
- **Emotiv Cortex / NeuroSky / g.tec / Nexstem** — all hardware-vendor APIs; good for realtime streams, weaker for offline clinical qEEG. ([comparison](https://www.emotiv.com/blogs/news/best-eeg-api-for-developers))

**For DeepSynaps I strongly recommend self-hosting on MNE.** A hosted API makes you dependent on a black-box vendor at exactly the layer that should be your clinical differentiator.

---

## Claude Code CLI integration plan

This is the part you asked about. Here's how to structure the repo so Claude Code CLI can build and iterate efficiently:

```
deepsynaps-qeeg-analyzer/
├── CLAUDE.md                          ← ★ Claude Code CLI memory file
├── README.md
├── pyproject.toml                     ← dependencies pinned
├── src/
│   └── deepsynaps_qeeg/
│       ├── __init__.py
│       ├── io.py                      ← read_edf, read_brainvision, validators
│       ├── preprocess.py              ← PyPREP + filter + resample + reref
│       ├── artifacts.py               ← ICA + MNE-ICALabel + autoreject
│       ├── features/
│       │   ├── spectral.py            ← Welch, multitaper, band power, SpecParam
│       │   ├── connectivity.py        ← MNE-Connectivity wrappers
│       │   ├── asymmetry.py           ← frontal alpha asymmetry etc.
│       │   └── graph.py               ← NetworkX metrics
│       ├── source/
│       │   └── eloreta.py             ← fsaverage template + eLORETA
│       ├── normative/
│       │   ├── database.py            ← norm bins loader
│       │   └── zscore.py              ← feature → z-score
│       ├── report/
│       │   ├── generate.py            ← JSON → markdown → PDF
│       │   ├── rag.py                 ← query the 87k-paper Postgres DB
│       │   └── templates/             ← Jinja2 PDF/HTML templates
│       └── pipeline.py                ← orchestrator: run_full_pipeline(edf_path)
├── tests/
│   ├── fixtures/                      ← small EDF samples (OpenNeuro)
│   └── test_pipeline.py
├── scripts/
│   ├── run_single.py                  ← CLI: python -m deepsynaps_qeeg file.edf
│   └── build_normative_db.py
├── api/
│   ├── app.py                         ← FastAPI: POST /upload → job_id → GET /report/{id}
│   └── worker.py                      ← Celery/RQ worker calling pipeline.run_full_pipeline
└── deploy/
    ├── Dockerfile
    └── docker-compose.yml
```

### `CLAUDE.md` — the memory file that makes Claude Code CLI effective

Create this at the repo root. Claude Code reads it on every session. Put the spec, constraints, and architectural decisions here so you don't repeat yourself:

```markdown
# DeepSynaps qEEG Analyzer — Claude Code memory

## Product
Web portal where clinicians/users upload resting-state EEG (.edf or BrainVision .vhdr) and get a qEEG report with band power topomaps, connectivity, eLORETA sources, normative z-scores, and an AI narrative grounded in the DeepSynaps Studio literature DB.

## Non-negotiable stack
- MNE-Python (≥1.7) for all I/O, preprocessing, source localization
- PyPREP for bad-channel + robust reference
- MNE-ICALabel for automatic IC classification (drop non-brain)
- autoreject (local) for residual epoch rejection
- MNE-Connectivity for wPLI / coherence
- SpecParam (fooof) for 1/f decomposition
- BIDS-first — use mne-bids for every write
- Postgres `deepsynaps` database already exists (see deepsynaps_db/ project) — use `paper_conditions` and abstracts for RAG

## Channels & montage
- Accept any 10-20 subset (min 19 channels F, T, P, O, C, Fp)
- Auto-detect montage, fall back to `standard_1020`
- Reject if < 16 channels after bad-channel removal

## Frequency bands (use these exact definitions)
delta 1–4, theta 4–8, alpha 8–13, beta 13–30, gamma 30–45 Hz

## Epoching
Resting state: 2 s epochs, 50% overlap, discard first 10 s and last 5 s

## Testing
Every feature module needs a test with a fixture EDF from OpenNeuro ds004446 (sample included in tests/fixtures/)

## Do NOT
- Add MATLAB dependencies (FieldTrip, EEGLAB wrappers)
- Use proprietary file readers — everything through MNE
- Hard-code electrode positions — use `mne.channels.make_standard_montage`
- Trust the raw file's metadata blindly — validate sfreq, channel names, units
```

### How to drive Claude Code CLI to build it

A realistic build order — feed these to Claude Code one at a time:

```bash
# Step 1 — scaffold
claude-code "Create the src/deepsynaps_qeeg package scaffold per CLAUDE.md. 
  Add pyproject.toml with mne, mne-bids, mne-icalabel, mne-connectivity, 
  pyprep, autoreject, fooof, yasa, networkx, fastapi, celery. Add pytest config."

# Step 2 — I/O layer
claude-code "Implement src/deepsynaps_qeeg/io.py: read_edf() and read_brainvision() 
  that return an mne.io.Raw. Validate sfreq >= 128, >= 16 channels, apply 
  standard_1020 montage. Write tests using a fixture EDF."

# Step 3 — preprocessing
claude-code "Implement preprocess.py using PyPREP for bad-channel detection 
  and robust average reference. Then bandpass 1-45 Hz, notch 50 Hz, resample to 250 Hz. 
  Return clean mne.io.Raw."

# Step 4 — artifact rejection
claude-code "Implement artifacts.py: run ICA (picard, n_components=0.99), 
  label with MNE-ICALabel, drop components that are non-brain/non-other with 
  proba > 0.7, then autoreject on 2s epochs."

# Step 5 — features
claude-code "Implement features/spectral.py: compute absolute + relative band 
  power per channel per band using Welch (4s window, 50% overlap). Add SpecParam 
  fit for aperiodic slope and peak alpha frequency."

# ...continue for connectivity, source, normative, report
```

### Why Claude Code CLI works well here

- **Deterministic scaffolding**: Each module is small and testable. Claude Code excels when you can verify output with a test.
- **CLAUDE.md memory**: prevents drift on stack choices across long sessions.
- **Your existing Postgres DB**: the RAG step becomes `claude-code "implement report/rag.py that queries the deepsynaps Postgres DB for papers matching the flagged conditions and top-3 modalities"` — a clean, bounded task.

---

## Deployment shape for the DeepSynaps portal

```
[ Next.js / React portal ]
           │
           ▼  signed S3 URL upload
[ S3 bucket: raw EEG files ]
           │
           ▼  SQS / Redis queue event
[ FastAPI /upload → Celery worker ]
           │
           ▼  GPU optional (ICA + eLORETA benefit)
[ deepsynaps_qeeg.pipeline.run_full_pipeline() ]
           │
           ├── writes BIDS derivatives to S3
           ├── writes features JSON to Postgres (new `qeeg_analyses` table)
           ├── calls RAG over your existing `papers`/`paper_conditions` tables
           └── renders PDF via Jinja + WeasyPrint
           │
           ▼
[ Portal polls GET /report/{id} → serves PDF + interactive HTML ]
```

Expect a single 10-minute resting-state recording to process in **~2–5 minutes** on a modest worker (CPU is fine; GPU gives ~3× on ICA + eLORETA if you batch).

---

## Risk callouts

1. **Regulatory**: A qEEG analyzer that gives clinical interpretation is a medical device under EU MDR and FDA. Before you market this for clinical decision support, you need either CE Class IIa clearance or a "wellness/research" scope carve-out in your ToS. The **exact same MNE math** is used in CE-marked products — your gap is the clinical validation file, not the code.
2. **Normative DB liability**: Never claim a norm comparison is diagnostic if you're using a home-grown DB. Label explicitly.
3. **GDPR / PHI**: EEG data is special-category personal data under GDPR. Encrypt at rest, time-boxed signed URLs, explicit consent on upload.
4. **ICLabel limits**: MNE-ICALabel was trained on specific paradigms; performance degrades on very low channel counts (<16). Have a manual review path for edge cases.

---

## Recommended first sprint (2 weeks, solo)

- **Week 1**: Build `io.py`, `preprocess.py`, `artifacts.py`, `features/spectral.py` + tests. Validate on 3 public EDFs from OpenNeuro. Ship a CLI that prints a feature JSON.
- **Week 2**: Add `features/connectivity.py`, `source/eloreta.py`, a minimal FastAPI wrapper (sync endpoint, no queue yet), and a Jinja HTML report template. Ship behind `/qeeg-beta` on the DeepSynaps portal for internal testing.

Normative DB, Celery workers, PDF polish, and RAG reporting slot into sprints 3–4.

---

## Key references

- [MNE-Python](https://mne.tools/stable/) — BSD-3, the core
- [MNE-ICALabel](https://mne.tools/mne-icalabel/) — IC auto-classification
- [autoreject](https://autoreject.github.io/) — peak-to-peak thresholds ([paper](https://pubmed.ncbi.nlm.nih.gov/28645840/))
- [PyPREP](https://github.com/sappelhoff/pyprep) — PREP pipeline
- [MNE-Connectivity](https://mne.tools/mne-connectivity/) — wPLI, coherence, Granger
- [SpecParam / FOOOF](https://fooof-tools.github.io/fooof/) — 1/f decomposition
- [YASA](https://github.com/raphaelvallat/yasa) — sleep + events
- [EEG-Pype](https://github.com/yorbenlodema/EEG-Pype) — GUI reference impl
- [PyLossless](https://github.com/scott-huberty/pylossless) — non-destructive pipeline
- [MNE-BIDS-Pipeline](https://github.com/mne-tools/mne-bids-pipeline) — batch auto-processing
- [DISCOVER-EEG (Nature)](https://www.nature.com/articles/s41597-023-02525-0) — architecture reference
- [qEEG-RAG case-study generation (2025)](https://researchopenworld.com/wp-content/uploads/2025/09/JCRM-8-831.pdf) — ★ effectively your architecture
- [qEEG database comparison (BrainMaster)](https://brainmaster.com/wp-content/uploads/2017/08/DatabaseComparisons_for_website-1.pdf) — norm DB landscape
- [iSyncBrain cloud qEEG](https://www.imedisync.com/) — hosted alternative if you change your mind

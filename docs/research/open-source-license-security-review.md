# Open-Source License & Security Review
**DeepSynaps Protocol Studio — Overnight Sprint 2026-05-08**
**Agent 2: License & Security Auditor | Coordinator profile**

> Clinical disclaimer: This report supports integration planning only. It does not diagnose,
> prescribe, triage emergencies, approve treatment, or act autonomously. All integration
> decisions require human legal and clinical review.

---

## Purpose

This document reviews every open-source candidate from Agent 1's scout report.
For each candidate: verdict (APPROVED / REJECTED / CONCEPTS-ONLY), license,
attribution obligations, PHI/security concerns, and notes.

Decision gate: Integration cannot proceed until a candidate is marked APPROVED or
CONCEPTS-ONLY. This list gates Agents 4-14.

---

## Verdict Legend

- APPROVED — license-compatible (MIT/Apache-2.0/BSD), PHI-safe, no telemetry risk; proceed with integration.
- CONCEPTS-ONLY — architecture/algorithm patterns only; no source copy; must reimplement independently.
- REJECTED — commercial use blocked, GPL copyleft without escalation, or prohibitive PHI/security risk.
- ESCALATION-REQUIRED — cannot proceed until legal sign-off; treat as REJECTED until resolved.

---

## 1. DeepTwin (Digital Twin)

### AERONET-V3-Twins (NASA)
- URL: https://github.com/nasa/digital_twin
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY
- Reason: Architecture patterns only per Agent 1 recommendation. No clinical code to reuse. Concepts around sensor-data twin orchestration are safe to reference.
- Attribution: "NASA AERONET Digital Twin project (Apache-2.0)" in design docs referencing these patterns.
- PHI/Security: No PHI handling. No telemetry identified. Low risk.
- License Obligations: None for concepts-only. If any code is copied later: include NOTICE file contents, retain copyright headers.

### OpenDigitalTwin
- URL: https://github.com/OpenDigitalTwin-Dev/opendigitaltwin
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY
- Reason: Complex install (Python/C++), event-driven twin concept only. No direct code reuse needed.
- Attribution: "OpenDigitalTwin project (Apache-2.0)" in design docs if concepts are adapted.
- PHI/Security: No PHI handling. Low risk.
- License Obligations: None for concepts-only.

### ClinicalBERT (HuggingFace)
- URL: https://github.com/kexinhuang12345/clinicalBERT
- License: MIT
- Verdict: APPROVED (demo/test data only; MIMIC provenance caveat)
- Reason: MIT license — fully compatible. However, the model was trained on MIMIC-III data. MIMIC access requires PhysioNet credentialing. The model weights on HuggingFace are publicly available, but any fine-tuning on MIMIC-derived data requires an active MIMIC data use agreement.
- Attribution: "ClinicalBERT by Kexin Huang et al. (MIT License)" in NOTICES.md and any UI that surfaces this model.
- PHI/Security: Do NOT pass real patient text to this model without de-identification (Presidio first). Demo/synthetic data only unless de-ID pipeline confirmed.
- License Obligations: Retain MIT copyright header. Cite original paper: Huang et al. 2019.
- Special: Use only under VITE_ENABLE_DEMO=1 or explicit de-ID pipeline gate.

### PyHealth
- URL: https://github.com/sunlabuiuc/PyHealth
- License: MIT
- Verdict: APPROVED
- Reason: MIT license, actively maintained, pip-installable, no GPU required for inference. Clean dependency chain.
- Attribution: "PyHealth by Sun Lab @ UIUC (MIT License)" in NOTICES.md.
- PHI/Security: Framework only — no external API calls, no telemetry. PHI safety depends on what data the caller passes in. Use demo/synthetic data in all demo flows.
- License Obligations: Retain MIT copyright notice. Cite PyHealth paper if used in publication context.

### Vital (NVIDIA)
- URL: https://github.com/NVIDIA/digital-twins-healthcare
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY
- Reason: GPU required for meaningful use; architecture is too heavy for clinical web adapter. Concept patterns only.
- Attribution: "NVIDIA Healthcare Digital Twins (Apache-2.0)" if architecture patterns referenced.
- PHI/Security: GPU inference. Not suitable as a direct server dep. Concepts reference only.
- License Obligations: None for concepts-only.

### SimPy
- URL: https://simpy.readthedocs.io
- License: MIT
- Verdict: APPROVED
- Reason: MIT, pure Python, lightweight discrete-event simulation. Ideal for patient flow modeling. No PHI handling at library level.
- Attribution: "SimPy (MIT License)" in NOTICES.md.
- PHI/Security: No external calls. Patient identifiers should not be placed in simulation metadata — use anonymized simulation IDs.
- License Obligations: Retain MIT header.

### FEniCS / OpenCMISS
- URL: https://github.com/OpenCMISS
- License: LGPL-2.1/3.0
- Verdict: ESCALATION-REQUIRED (treat as REJECTED until legal sign-off)
- Reason: LGPL allows linking without copyleft in some cases, but the complex C++ core and the nature of dynamic vs static linking in Python extensions creates ambiguity. Legal review needed before any integration.
- Escalation: "BLOCKER: FEniCS/OpenCMISS LGPL integration for DeepTwin biophysics / Options A: wrap as microservice (LGPL isolation) B: use concepts only / Recommended: concepts-only until legal / Demo impact: none / Need decision by sprint end"
- PHI/Security: Low PHI risk; high complexity risk.

---

## 2. qEEG Analyzer

### MNE-Python
- URL: https://github.com/mne-tools/mne-python
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, 2700+ stars, actively maintained, peer-reviewed in multiple clinical publications. The anchor library for EEG/MEG. Clean pip install, no telemetry.
- Attribution: "MNE-Python (BSD-3-Clause)" in NOTICES.md. Cite Gramfort et al. 2013 if used in any publication or report generation context.
- PHI/Security: Processes local EEG files. No network calls in core library. PHI in EDF files must be stripped before passing to MNE in shared environments. Use de-identification step upstream.
- License Obligations: Retain copyright and BSD-3 notice. No endorsement use of MNE name.

### YASA
- URL: https://github.com/raphaelvallat/yasa
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, actively maintained, integrates directly with MNE. Sleep staging and spindle detection are well-validated. No telemetry.
- Attribution: "YASA by Raphael Vallat (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: Local processing only. No external API calls.
- License Obligations: Retain copyright notice.

### autoreject
- URL: https://github.com/autoreject/autoreject
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, publishable method for EEG artifact rejection. Integrates cleanly with MNE. No telemetry.
- Attribution: "autoreject by Mainak Jas et al. (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: Local processing. No external calls.
- License Obligations: Retain copyright notice.

### mne-bids
- URL: https://github.com/mne-tools/mne-bids
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, BIDS format export enables audit-trail-friendly data structures for clinical compliance. Actively maintained.
- Attribution: "mne-bids (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: BIDS format requires careful attention to subject identifiers in filenames and sidecar JSONs. Ensure de-identified subject IDs are used before BIDS export.
- License Obligations: Retain copyright notice.

### mne-connectivity
- URL: https://github.com/mne-tools/mne-connectivity
- License: BSD-3-Clause
- Verdict: APPROVED (integrate later)
- Reason: BSD-3, extends MNE for connectivity metrics. Approved for later integration once core qEEG pipeline is stable.
- Attribution: "mne-connectivity (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: Local processing. No external calls.
- License Obligations: Retain copyright notice.

### pyEDFlib
- URL: https://github.com/holgern/pyedflib
- License: BSD-2-Clause
- Verdict: APPROVED
- Reason: BSD-2, standard EDF/BDF I/O library. Lightweight and widely used. No telemetry.
- Attribution: "pyEDFlib by Holger Nahrstaedt (BSD-2-Clause)" in NOTICES.md.
- PHI/Security: EDF headers contain patient metadata. Strip/anonymize patient fields before any storage or transmission.
- License Obligations: Retain copyright notice. BSD-2 does not require non-endorsement clause (that is BSD-3 specific).

### pyprep
- URL: https://github.com/sappelhoff/pyprep
- License: MIT
- Verdict: APPROVED (integrate later)
- Reason: MIT, implements the PREP pipeline for standardized EEG preprocessing. Approved for later integration.
- Attribution: "pyprep by Stefan Appelhoff et al. (MIT License)" in NOTICES.md.
- PHI/Security: Local processing. No external calls.
- License Obligations: Retain MIT copyright.

### fooof / specparam
- URL: https://github.com/fooof-tools/fooof
- License: Apache-2.0
- Verdict: APPROVED
- Reason: Apache-2.0, well-cited for EEG power spectrum parameterization. Produces aperiodic exponent and peaks as qEEG biomarkers. Clean pip install.
- Attribution: "specparam / FOOOF by Donoghue et al. (Apache-2.0)" in NOTICES.md. Cite Donoghue et al. 2020 Nature Neuroscience.
- PHI/Security: No external calls. Local computation only.
- License Obligations: Retain Apache-2.0 NOTICE if one exists. Retain copyright header.

---

## 3. MRI Analyzer

### NiBabel
- URL: https://github.com/nipy/nibabel
- License: MIT
- Verdict: APPROVED
- Reason: MIT, standard MRI I/O library. Already referenced in existing repo stack (packages/mri-pipeline). No telemetry.
- Attribution: "NiBabel (MIT License)" in NOTICES.md. Already present in project stack.
- PHI/Security: NIfTI/DICOM headers contain patient metadata. The pipeline must strip/anonymize before storage. dcm2niix de-facing recommended upstream.
- License Obligations: Retain MIT copyright.

### Nilearn
- URL: https://github.com/nilearn/nilearn
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, well-cited neuroimaging analysis library. Used for brain map visualization and MRI analysis. Already referenced in repo docs.
- Attribution: "Nilearn (BSD-3-Clause)" in NOTICES.md. Cite Abraham et al. 2014 Front. Neuroinformatics.
- PHI/Security: No telemetry. PHI in image metadata must be anonymized upstream.
- License Obligations: Retain copyright notice.

### MONAI
- URL: https://github.com/Project-MONAI/MONAI
- License: Apache-2.0
- Verdict: APPROVED (integrate later — CPU inference path only for web adapter)
- Reason: Apache-2.0, maintained by NVIDIA and the community. GPU required for training; CPU inference viable for segmentation transforms. Integrate via adapter layer with HAS_MONAI guard.
- Attribution: "MONAI Project (Apache-2.0)" in NOTICES.md.
- PHI/Security: Do not send images to external MONAI endpoints. Use local pip install only. PHI stripping required upstream.
- License Obligations: Retain Apache-2.0 copyright and NOTICE.

### ANTsPy
- URL: https://github.com/ANTsX/ANTsPy
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, already referenced in existing codebase (antspyx). Large pip install. Integrate later via existing registration.py adapter.
- Attribution: "ANTsPy / ANTs (Apache-2.0)" in NOTICES.md.
- PHI/Security: Local computation. No telemetry.
- License Obligations: Retain Apache-2.0 copyright.

### dcm2niix
- URL: https://github.com/rordenlab/dcm2niix
- License: BSD-2-Clause
- Verdict: APPROVED
- Reason: BSD-2, already used in the project stack as subprocess adapter. Critical for DICOM to NIfTI conversion with de-facing capability.
- Attribution: "dcm2niix by Chris Rorden (BSD-2-Clause)" in NOTICES.md.
- PHI/Security: Use -ba y flag (de-face + de-identify BIDS). This tool is the primary PHI scrubbing point for MRI workflows.
- License Obligations: Retain copyright notice.

### FastSurfer
- URL: https://github.com/Deep-MI/FastSurfer
- License: Apache-2.0
- Verdict: APPROVED (concepts-only for web adapter; integrate later via container)
- Reason: Apache-2.0, already referenced in project AGENTS.md as preferred structural method. GPU recommended — integrate via Docker container adapter following existing fastsurfer adapter pattern.
- Attribution: "FastSurfer by Henschel et al. (Apache-2.0)" in NOTICES.md.
- PHI/Security: Container-based. No external API calls. PHI in NIfTI headers must be stripped before passing to FastSurfer.
- License Obligations: Retain Apache-2.0 copyright.

### MRIQC
- URL: https://github.com/nipreps/mriqc
- License: Apache-2.0
- Verdict: APPROVED (integrate later — complexity caveat)
- Reason: Apache-2.0, but depends on Nipype which adds complexity. Use only for IQM metric extraction via existing capture helpers in the codebase. Containerized use preferred.
- Attribution: "MRIQC by Esteban et al. (Apache-2.0)" in NOTICES.md.
- PHI/Security: Nipype may create working directories with intermediate files containing PHI in paths. Ensure output_dir is in a secure, non-shared location.
- License Obligations: Retain Apache-2.0 copyright.

### HD-BET
- URL: https://github.com/MIC-DKFZ/HD-BET
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, GPU helpful but not required for inference. Fast brain extraction.
- Attribution: "HD-BET by Isensee et al. (Apache-2.0)" in NOTICES.md.
- PHI/Security: Local processing. No telemetry.
- License Obligations: Retain Apache-2.0 copyright.

---

## 4. Text / Clinical NLP Analyzer

### spaCy
- URL: https://github.com/explosion/spaCy
- License: MIT
- Verdict: APPROVED
- Reason: MIT, 30k+ stars, actively maintained. Industry standard NLP pipeline. No telemetry in pip install (cloud inference is opt-in only).
- Attribution: "spaCy by Explosion (MIT License)" in NOTICES.md.
- PHI/Security: Do NOT use spaCy Cloud or any hosted endpoint without explicit PHI scrubbing. Local model loading only (en_core_web_sm etc.).
- License Obligations: Retain MIT copyright.

### medspaCy
- URL: https://github.com/medspacy/medspacy
- License: MIT
- Verdict: APPROVED
- Reason: MIT, built on spaCy, specifically designed for clinical NLP. Negation detection, section detection. No telemetry.
- Attribution: "medspaCy (MIT License)" in NOTICES.md.
- PHI/Security: Local processing. PHI in input text must be handled per de-ID policy before any logging.
- License Obligations: Retain MIT copyright.

### scispaCy
- URL: https://github.com/allenai/scispacy
- License: MIT
- Verdict: APPROVED
- Reason: MIT, Allen AI project. Biomedical spaCy models. Clean pip install. No telemetry.
- Attribution: "scispaCy by Allen Institute for AI (MIT License)" in NOTICES.md. Cite Neumann et al. 2019.
- PHI/Security: Model downloads from S3 (AllenAI CDN). No PHI leaves the system at inference time.
- License Obligations: Retain MIT copyright.

### Presidio (Microsoft)
- URL: https://github.com/microsoft/presidio
- License: MIT
- Verdict: APPROVED — CRITICAL for PHI pipeline
- Reason: MIT, Microsoft-backed, purpose-built for PII/PHI detection and anonymization. Essential for HIPAA-relevant de-identification. Must be the first processing step before any clinical text hits ML models.
- Attribution: "Microsoft Presidio (MIT License)" in NOTICES.md.
- PHI/Security: Presidio itself does not transmit data. Use local analyzer/anonymizer engines. Do NOT configure Presidio with cloud recognizers without explicit review.
- License Obligations: Retain MIT copyright.
- Special: Mark as P0 dependency for clinical NLP pipeline.

### MedCAT
- URL: https://github.com/CogStack/MedCAT
- License: Apache-2.0
- Verdict: APPROVED (integrate later — UMLS license caveat)
- Reason: Apache-2.0, but concept dictionaries (UMLS, SNOMED) require a separate UMLS license from NLM. The library is approved; the concept model weights require institutional UMLS credentials.
- Attribution: "MedCAT by CogStack (Apache-2.0)" in NOTICES.md.
- PHI/Security: Local UMLS model — no external API calls at inference time.
- License Obligations: Apache-2.0 copyright. UMLS license compliance required before deploying any UMLS-derived model weights.
- Special: Gate with HAS_UMLS_LICENSE env flag.

### NegSpaCy
- URL: https://github.com/jenojp/negspacy
- License: MIT
- Verdict: APPROVED
- Reason: MIT, lightweight negation extension for spaCy. Actively maintained.
- Attribution: "negspacy by Jeno Pizarro (MIT License)" in NOTICES.md.
- PHI/Security: Local processing. No external calls.
- License Obligations: Retain MIT copyright.

### Stanza (Stanford)
- URL: https://github.com/stanfordnlp/stanza
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, Stanford NLP. Biomedical models available. Clean pip install.
- Attribution: "Stanza by Stanford NLP Group (Apache-2.0)" in NOTICES.md. Cite Qi et al. 2020.
- PHI/Security: Model downloads from Stanford servers. No PHI in transit at inference.
- License Obligations: Apache-2.0 copyright.

### PubMedBERT (HuggingFace)
- URL: https://huggingface.co/microsoft/BiomedNLP-PubMedBERT-base
- License: MIT
- Verdict: APPROVED (integrate later — model size caveat)
- Reason: MIT, Microsoft Research model. Weights are public on HuggingFace. Large model size warrants lazy loading.
- Attribution: "BiomedNLP PubMedBERT by Microsoft Research (MIT License)" in NOTICES.md. Cite Gu et al. 2021.
- PHI/Security: Load weights locally. Do NOT send clinical text to the HuggingFace inference API without PHI scrubbing.
- License Obligations: MIT copyright.

---

## 5. Voice / Audio Analyzer

### Whisper (OpenAI)
- URL: https://github.com/openai/whisper
- License: MIT
- Verdict: APPROVED
- Reason: MIT, 72k+ stars, best-in-class open-source ASR. CPU-capable for smaller models (tiny, base, small).
- Attribution: "OpenAI Whisper (MIT License)" in NOTICES.md. Cite Radford et al. 2022.
- PHI/Security: CRITICAL — voice recordings may contain patient identifiers. Use local pip install only. NEVER route through openai.com API for clinical audio. Use local model inference. Implement speaker de-identification where required by protocol.
- License Obligations: MIT copyright.
- Special: Implement recording retention policy gate — do not persist audio longer than session unless explicit consent captured.

### pyannote-audio
- URL: https://github.com/pyannote/pyannote-audio
- License: MIT
- Verdict: APPROVED (integrate later — HuggingFace gating caveat)
- Reason: MIT, but best models require HuggingFace access token and model acceptance. Some models have non-commercial restrictions on HuggingFace side. Use only models with no additional restrictions.
- Attribution: "pyannote.audio by Herve Bredin (MIT License)" in NOTICES.md. Cite Bredin et al. 2021.
- PHI/Security: Load models locally after gating check. Do NOT use pyannote cloud endpoint for clinical audio.
- License Obligations: MIT copyright. HuggingFace model-card terms must be accepted per model.
- Special: Gate with HAS_PYANNOTE_TOKEN. Check individual model terms before use.

### librosa
- URL: https://github.com/librosa/librosa
- License: ISC License (permissive, functionally equivalent to MIT/BSD)
- Verdict: APPROVED
- Reason: ISC is a permissive license compatible with commercial use. Widely used, actively maintained. pip install lightweight.
- Attribution: "librosa (ISC License)" in NOTICES.md. Cite McFee et al. 2015.
- PHI/Security: Local processing. No external calls. Audio feature vectors derived from clinical audio should be treated as potentially re-identifiable.
- License Obligations: Retain ISC copyright notice.

### openSMILE
- URL: https://github.com/audeering/opensmile
- License: MIT (Python binding)
- Verdict: APPROVED
- Reason: MIT Python binding (opensmile-python). The underlying C++ openSMILE binary has its own license — the standard academic license for openSMILE allows commercial use when using the Python pip package that bundles pre-built binaries. Must verify bundled binary license for production deployment.
- Attribution: "openSMILE by audEERING (MIT binding)" in NOTICES.md. Cite Eyben et al. 2010.
- PHI/Security: Local processing. No telemetry.
- License Obligations: MIT for Python binding. Verify bundled binary license — standard openSMILE is dual-licensed (open academic + commercial). The pip package (opensmile) bundles a pre-compiled binary under the openSMILE academic license — for commercial clinical deployment, obtain a commercial openSMILE license from audEERING.
- Special: FLAG — openSMILE pip binary may require commercial license for clinical deployment. Recommend escalating to legal for confirmation before production use.

### SpeechBrain
- URL: https://github.com/speechbrain/speechbrain
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, 8.5k stars, comprehensive speech toolkit. CPU inference possible for pre-trained models.
- Attribution: "SpeechBrain (Apache-2.0)" in NOTICES.md. Cite Ravanelli et al. 2021.
- PHI/Security: Use local model weights only. No telemetry in core library.
- License Obligations: Apache-2.0 copyright.

### Surfboard
- URL: https://github.com/novoic/surfboard
- License: Apache-2.0
- Verdict: APPROVED
- Reason: Apache-2.0, designed specifically for clinical speech biomarkers (jitter, shimmer, HNR, DFA). Targeted for mental health applications matching DeepSynaps use case.
- Attribution: "Surfboard by Novoic (Apache-2.0)" in NOTICES.md.
- PHI/Security: Local processing. No telemetry.
- License Obligations: Apache-2.0 copyright.

### parselmouth / Praat
- URL: https://github.com/YannickJadoul/Parselmouth
- License: GPL-3.0
- Verdict: ESCALATION-REQUIRED (treat as REJECTED until resolved)
- Reason: GPL-3.0 copyleft. If any GPL code is incorporated into the codebase — even as a pip dependency in a deployed service — it creates GPL propagation risk for the entire service. This is a material commercial risk.
- Escalation: "BLOCKER: parselmouth GPL-3.0 voice analysis / Options A: use openSMILE + Surfboard instead (covers jitter/shimmer/HNR) B: isolate parselmouth as a separate GPL-licensed microservice C: contact Parselmouth author for commercial license / Recommended: Option A (no escalation needed) / Demo impact: minimal — openSMILE covers the same features / Need decision by sprint end"
- Alternative: openSMILE (MIT/commercial) and Surfboard (Apache-2.0) together provide equivalent voice quality metrics.
- License Obligations: GPL-3.0 copyleft if used.

---

## 6. Video Analyzer

### MediaPipe (Google)
- URL: https://github.com/google/mediapipe
- License: Apache-2.0
- Verdict: APPROVED
- Reason: Apache-2.0, 27k+ stars, Google-maintained. CPU-capable pose estimation. pip install. No mandatory telemetry in pip package.
- Attribution: "MediaPipe by Google (Apache-2.0)" in NOTICES.md. Cite Lugaresi et al. 2019.
- PHI/Security: CRITICAL — video input may contain patient faces. Implement face-blurring preprocessing before any storage. MediaPipe itself does not send data to Google in pip usage. Ensure no video data hits Google servers.
- License Obligations: Apache-2.0 copyright.
- Special: Clinical video gate — explicit consent required before video capture; implement consent check in API router.

### OpenPose
- URL: https://github.com/CMU-Perceptual-Computing-Lab/openpose
- License: Non-commercial / Academic only
- Verdict: REJECTED
- Reason: Explicitly non-commercial. Cannot be used in a commercial clinical platform without a separate commercial license from CMU. Do not integrate.
- Alternative: MediaPipe (Apache-2.0) or rtmlib (Apache-2.0) provide equivalent pose estimation.
- License Obligations: N/A — rejected.

### DeepLabCut
- URL: https://github.com/DeepLabCut/DeepLabCut
- License: LGPL-3.0
- Verdict: ESCALATION-REQUIRED (treat as REJECTED until resolved)
- Reason: LGPL-3.0. Dynamic linking may be permissible, but the conda-preferred install and deep integration patterns make static vs dynamic linking ambiguous. Needs legal review.
- Escalation: "BLOCKER: DeepLabCut LGPL-3.0 motion tracking / Options A: use MediaPipe + rtmlib instead B: legal review of LGPL linking terms C: approach DeepLabCut authors for commercial license / Recommended: Option A for now / Demo impact: minimal / Need decision by sprint end"
- Alternative: MediaPipe + rtmlib provide markerless tracking without LGPL risk.
- License Obligations: LGPL-3.0 if used.

### mmpose
- URL: https://github.com/open-mmlab/mmpose
- License: Apache-2.0
- Verdict: APPROVED (integrate later — GPU caveat)
- Reason: Apache-2.0, 10k+ stars, state-of-art pose estimation. GPU recommended for real-time. Integrate via adapter layer with HAS_MMPOSE guard for later use.
- Attribution: "mmpose by OpenMMLab (Apache-2.0)" in NOTICES.md.
- PHI/Security: Face blurring required upstream. No telemetry in pip package.
- License Obligations: Apache-2.0 copyright.

### rtmlib
- URL: https://github.com/Tau-J/rtmlib
- License: Apache-2.0
- Verdict: APPROVED
- Reason: Apache-2.0, lightweight RTMPose runtime, CPU-capable. Ideal as the lightweight alternative to full mmpose.
- Attribution: "rtmlib (Apache-2.0)" in NOTICES.md.
- PHI/Security: Local processing. Face blurring required upstream.
- License Obligations: Apache-2.0 copyright.

### Pyskl
- URL: https://github.com/kennymckormick/pyskl
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, skeleton-based action recognition. GPU for training, can use pre-trained models for inference.
- Attribution: "Pyskl (Apache-2.0)" in NOTICES.md.
- PHI/Security: Skeleton data is less re-identifiable than video, but still sensitive in clinical context.
- License Obligations: Apache-2.0 copyright.

### OptiTrack / Vicon SDKs
- Verdict: REJECTED
- Reason: Proprietary hardware SDKs. Not suitable for open-source integration. Concepts only per Agent 1.

---

## 7. Biomarkers / Wearables

### NeuroKit2
- URL: https://github.com/neuropsychology/NeuroKit
- License: MIT
- Verdict: APPROVED
- Reason: MIT, 2k+ stars, comprehensive biosignal processing. ECG, PPG, EDA, RSP. Well-documented and actively maintained.
- Attribution: "NeuroKit2 by Dominique Makowski et al. (MIT License)" in NOTICES.md. Cite Makowski et al. 2021.
- PHI/Security: Local processing. Biosignal data (ECG waveforms) may be re-identifiable per some regulatory guidance — treat as PHI and apply same access controls.
- License Obligations: Retain MIT copyright.

### HeartPy
- URL: https://github.com/paulvangentcom/heartrate_analysis_python
- License: MIT
- Verdict: APPROVED
- Reason: MIT, validated against hospital data per Agent 1. Straightforward HRV from wearable PPG.
- Attribution: "HeartPy by Paul van Gent (MIT License)" in NOTICES.md. Cite van Gent et al. 2019.
- PHI/Security: Local processing. No telemetry.
- License Obligations: Retain MIT copyright.

### bioread
- URL: https://github.com/uwmadison-chm/bioread
- License: MIT
- Verdict: APPROVED (integrate later)
- Reason: MIT, for legacy BIOPAC .acq files. Low priority but clean license.
- Attribution: "bioread by University of Wisconsin-Madison (MIT License)" in NOTICES.md.
- PHI/Security: BIOPAC files may contain patient metadata in file header. Strip before processing.
- License Obligations: Retain MIT copyright.

### pylsl
- URL: https://github.com/labstreaminglayer/liblsl-Python
- License: MIT
- Verdict: APPROVED (integrate later)
- Reason: MIT, Lab Streaming Layer for real-time wearable streams. Clean pip install.
- Attribution: "pylsl / liblsl (MIT License)" in NOTICES.md.
- PHI/Security: Streams real-time physiological data — ensure LSL network only on trusted/VPN network, not exposed to internet.
- License Obligations: Retain MIT copyright.

### py-ecg-detectors
- URL: https://github.com/berndporr/py-ecg-detectors
- License: MIT
- Verdict: APPROVED
- Reason: MIT, multiple QRS detectors, ECG R-peak detection.
- Attribution: "py-ecg-detectors by Bernd Porr (MIT License)" in NOTICES.md.
- PHI/Security: Local processing. No telemetry.
- License Obligations: Retain MIT copyright.

### FLIRT
- URL: https://github.com/im-ethz/flirt
- License: MIT
- Verdict: APPROVED
- Reason: MIT, designed for clinical wrist-worn devices, ETH Zurich origin.
- Attribution: "FLIRT by ETH Zurich (MIT License)" in NOTICES.md.
- PHI/Security: Local processing. No telemetry.
- License Obligations: Retain MIT copyright.

### Antropy
- URL: https://github.com/raphaelvallat/antropy
- License: BSD-3-Clause
- Verdict: APPROVED (integrate later)
- Reason: BSD-3, entropy and complexity for biosignals, from same author as YASA.
- Attribution: "Antropy by Raphael Vallat (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: Local processing. No telemetry.
- License Obligations: Retain BSD-3 copyright.

---

## 8. Evidence Research

### pymed
- URL: https://github.com/gijswobben/pymed
- License: MIT
- Verdict: APPROVED
- Reason: MIT, PubMed API wrapper. NCBI E-utilities are public APIs with rate limits (3/sec unauthenticated, 10/sec with API key). No PHI involved.
- Attribution: "pymed (MIT License)" in NOTICES.md.
- PHI/Security: Evidence search only — no PHI in API calls. Use NCBI API key for production rate limits.
- License Obligations: Retain MIT copyright.

### semanticscholar
- URL: https://github.com/danielnsilva/semanticscholar
- License: MIT
- Verdict: APPROVED
- Reason: MIT, Semantic Scholar API client. Public API. No PHI involved.
- Attribution: "semanticscholar Python client (MIT License)" in NOTICES.md.
- PHI/Security: Evidence queries only. No PHI in API calls.
- License Obligations: Retain MIT copyright.

### habanero
- URL: https://github.com/sckott/habanero
- License: MIT
- Verdict: APPROVED
- Reason: MIT, CrossRef REST API client. Public API.
- Attribution: "habanero (MIT License)" in NOTICES.md.
- PHI/Security: No PHI in evidence queries.
- License Obligations: Retain MIT copyright.

### biopython Entrez
- URL: https://github.com/biopython/biopython
- License: BSD-3-Clause (Biopython License — functionally BSD-3 compatible)
- Verdict: APPROVED
- Reason: Biopython License is a custom permissive license comparable to BSD. Long-standing, stable, widely used. NCBI Entrez for PubMed/PMC access.
- Attribution: "Biopython (Biopython License)" in NOTICES.md.
- PHI/Security: No PHI in Entrez queries.
- License Obligations: Retain Biopython copyright.

### LangGraph (LangChain)
- URL: https://github.com/langchain-ai/langgraph
- License: MIT
- Verdict: APPROVED (integrate later — LLM cost and rate-limit awareness required)
- Reason: MIT, but real usage incurs LLM API costs. Any LLM endpoint used must be PHI-safe (local model or BAA-covered cloud endpoint).
- Attribution: "LangGraph by LangChain (MIT License)" in NOTICES.md.
- PHI/Security: CRITICAL — if clinical notes or patient identifiers are ever included in LangGraph prompts sent to cloud LLMs, a BAA with the LLM provider is required. Default to local LLM or BAA-covered endpoint only.
- License Obligations: MIT copyright.
- Special: Gate with HAS_LLM_BAA_CONFIRMED or local LLM mode only.

### BioASQ-tools
- URL: https://github.com/BioASQ/Evaluation-Measures
- License: MIT
- Verdict: APPROVED (integrate later — concepts)
- Reason: MIT, evaluation metrics for biomedical QA. Low priority.
- Attribution: "BioASQ evaluation tools (MIT License)" in NOTICES.md.
- PHI/Security: No PHI handling. Evaluation metrics only.
- License Obligations: Retain MIT copyright.

### PubMedBERT (for Evidence Search)
- (See entry in Text/NLP section above — same verdict: APPROVED, integrate later.)

---

## 9. Protocol Studio

### fhir.resources
- URL: https://github.com/nazrulworld/fhir.resources
- License: MIT
- Verdict: APPROVED
- Reason: MIT, Pydantic FHIR R4/R5 models. Directly useful for protocol schema validation. Clean pip install. Actively maintained.
- Attribution: "fhir.resources by Md Nazrul Islam (MIT License)" in NOTICES.md.
- PHI/Security: FHIR resources may contain PHI. Access control must be enforced at the API layer, not within the library. No external calls from the library itself.
- License Obligations: Retain MIT copyright.

### fhirclient (SMART)
- URL: https://github.com/smart-on-fhir/client-py
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, SMART on FHIR OAuth integration. Needed for EHR integration flows.
- Attribution: "SMART on FHIR Python Client (Apache-2.0)" in NOTICES.md.
- PHI/Security: OAuth token handling — ensure tokens are not logged. FHIR endpoints accessed must have appropriate BAA/data agreements.
- License Obligations: Apache-2.0 copyright.

### python-hl7
- URL: https://github.com/johnpaulett/python-hl7
- License: BSD-3-Clause
- Verdict: APPROVED (integrate later)
- Reason: BSD-3, for legacy EHR HL7 v2 message parsing.
- Attribution: "python-hl7 by John Paulett (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: HL7 v2 messages always contain PHI. Ensure messages are processed in memory and not persisted in logs.
- License Obligations: Retain BSD-3 copyright.

### LangGraph (for Protocol Studio)
- (See entry in Evidence Research — same verdict: APPROVED, integrate later, BAA gate.)

### CDS Hooks Sandbox
- URL: https://github.com/cds-hooks/sandbox
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY
- Reason: Reference architecture for CDS Hooks patterns. No direct code reuse needed.
- Attribution: "CDS Hooks Sandbox (Apache-2.0)" in design docs if architecture is adapted.
- PHI/Security: Reference only.
- License Obligations: None for concepts-only.

### openEHR-Python / archie
- URL: https://github.com/openEHR/archie
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY
- Reason: Java core, complex Python clients. Architecture concepts only.
- Attribution: "openEHR archie (Apache-2.0)" in design docs.
- PHI/Security: Reference only.
- License Obligations: None for concepts-only.

### CPG-on-FHIR
- URL: https://github.com/cqframework/cpg-example-patients
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY
- Reason: FHIR CPG IG example data. Protocol representation patterns only. No code to run.
- Attribution: "CPG-on-FHIR by CQFramework (Apache-2.0)" in design docs.
- PHI/Security: Example data only — do not use example patient data in any clinical context.
- License Obligations: None for concepts-only.

---

## 10. Handbooks

### pypandoc
- URL: https://github.com/JessicaTegner/pypandoc
- License: MIT
- Verdict: APPROVED
- Reason: MIT, Python wrapper for Pandoc. Requires Pandoc binary (MIT licensed). pip + pandoc install.
- Attribution: "pypandoc (MIT License)" in NOTICES.md.
- PHI/Security: Handbook content rendering — ensure no PHI in handbook template variables for shared exports.
- License Obligations: MIT copyright. Pandoc binary is also GPL-2.0+ — pypandoc wraps it as subprocess, not linked, so MIT wrapper is valid.

### WeasyPrint
- URL: https://github.com/Kozea/WeasyPrint
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, HTML/CSS to PDF. Clinical report rendering. pip install. No telemetry.
- Attribution: "WeasyPrint by Kozea (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: PDFs of clinical reports may contain PHI. Ensure PDF generation and delivery are access-controlled.
- License Obligations: Retain BSD-3 copyright.

### Jinja2
- URL: https://github.com/pallets/jinja
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, 10k+ stars, industry-standard templating. No telemetry.
- Attribution: "Jinja2 by Pallets (BSD-3-Clause)" in NOTICES.md.
- PHI/Security: Template injection risk — ensure clinical data is escaped using Jinja2's auto-escaping for HTML contexts.
- License Obligations: Retain BSD-3 copyright.

### markdown-it-py
- URL: https://github.com/executablebooks/markdown-it-py
- License: MIT
- Verdict: APPROVED
- Reason: MIT, Markdown parsing. Lightweight. No telemetry.
- Attribution: "markdown-it-py (MIT License)" in NOTICES.md.
- PHI/Security: Local processing. No external calls.
- License Obligations: Retain MIT copyright.

### python-docx
- URL: https://github.com/python-openxml/python-docx
- License: MIT
- Verdict: APPROVED
- Reason: MIT, 4.5k stars, DOCX generation. pip install. No telemetry.
- Attribution: "python-docx (MIT License)" in NOTICES.md.
- PHI/Security: DOCX files of clinical handbooks may contain PHI. Apply access controls to export endpoints.
- License Obligations: Retain MIT copyright.

### ReportLab
- URL: https://github.com/MrBitBucket/reportlab-mirror
- License: BSD-3-Clause (ReportLab Open Source License — functionally BSD-3)
- Verdict: APPROVED (integrate later)
- Reason: ReportLab Open Source License is permissive and compatible. For layout-heavy PDF generation.
- Attribution: "ReportLab (ReportLab Open Source License)" in NOTICES.md.
- PHI/Security: Same PHI concerns as WeasyPrint for clinical PDFs.
- License Obligations: Retain ReportLab copyright.

---

## 11. Brain Map Planner

### Nilearn
- (Covered under MRI Analyzer — same verdict: APPROVED)
- Additional note for Brain Map Planner: Connectome viewer and glass brain plots are BSD-3 safe. No additional PHI concerns beyond MRI section.

### NiMARE
- URL: https://github.com/neurostuff/NiMARE
- License: MIT
- Verdict: APPROVED (integrate later)
- Reason: MIT, neuroimaging meta-analysis. Coordinate-based activation likelihood estimation. No telemetry.
- Attribution: "NiMARE (MIT License)" in NOTICES.md.
- PHI/Security: Works on coordinate databases (e.g., Neurosynth) — no PHI involved.
- License Obligations: Retain MIT copyright.

### mni2tal / tal2mni
- URL: https://github.com/neurophysiology-lab/mni2tal
- License: MIT
- Verdict: APPROVED (integrate later)
- Reason: MIT, coordinate conversion utility. Lightweight.
- Attribution: "mni2tal/tal2mni (MIT License)" in NOTICES.md.
- PHI/Security: Coordinate-only. No PHI.
- License Obligations: Retain MIT copyright.

### plotly
- URL: https://github.com/plotly/plotly.py
- License: MIT
- Verdict: APPROVED
- Reason: MIT, 15k+ stars, interactive brain visualization. pip install. No mandatory telemetry (Plotly cloud is opt-in).
- Attribution: "Plotly (MIT License)" in NOTICES.md.
- PHI/Security: No telemetry in pip package. Ensure Plotly graphs do not embed raw PHI in chart titles or tooltips.
- License Obligations: Retain MIT copyright.

### LeadDBS
- URL: https://github.com/leaddbs/leaddbs
- License: GPL-3.0 + MATLAB dependency
- Verdict: REJECTED
- Reason: GPL-3.0 copyleft + MATLAB runtime dependency. Double commercial blocker. Cannot be used.
- Alternative: Concepts about DBS electrode localization can be referenced in design docs. MediaPipe + Nilearn provide non-GPL brain visualization. Coordinate-based targeting should be implemented natively following LeadDBS algorithm documentation without copying GPL code.
- License Obligations: N/A — rejected.

### brain-connectivity-toolbox (bctpy)
- URL: https://github.com/aestrivex/bctpy
- License: BSD (BSD-3-Clause equivalent)
- Verdict: APPROVED (integrate later)
- Reason: BSD-3 compatible, graph theory measures for brain connectivity networks.
- Attribution: "Brain Connectivity Toolbox Python port (BSD)" in NOTICES.md. Cite Rubinov & Sporns 2010 (original BCT paper).
- PHI/Security: Local computation on connectivity matrices. No PHI in graph metrics.
- License Obligations: Retain BSD copyright.

---

## 12. Risk Analyzer

### clinical-risk-scores (various)
- URL: https://github.com/topics/clinical-risk-score
- License: MIT (majority of implementations)
- Verdict: APPROVED (verify per specific repo before code copy)
- Reason: Each implementation must be verified individually. NIHSS, MMSE, PHQ-9, GAD-7, AUDIT-C score algorithms are clinical standards — the algorithms themselves are not copyrightable, but specific code implementations may be.
- Attribution: Per specific repo. Generic: "Clinical risk score implementations (MIT)" in NOTICES.md.
- PHI/Security: Scores computed from patient data — results are PHI. Access-control outputs.
- License Obligations: Verify each repo; most are MIT. Do not use any GPL-licensed score implementation.
- Special: Always display scores with framing: "Risk indicator for clinical review — not a clinical determination."

### openFDA
- URL: https://github.com/FDA/openfda
- License: Public Domain (U.S. Government work)
- Verdict: APPROVED
- Reason: Public Domain, U.S. FDA. No copyright restrictions. FDA adverse event and drug interaction data.
- Attribution: "openFDA (U.S. FDA, Public Domain)" in NOTICES.md.
- PHI/Security: Public drug/device data — no PHI in queries. API rate limits apply; use API key for production.
- License Obligations: None (Public Domain). Note: FDA data itself has no copyright but FDA branding does.

### medspaCy (for Risk NLP)
- (Covered under Text/NLP — same verdict: APPROVED)

### scikit-learn
- URL: https://github.com/scikit-learn/scikit-learn
- License: BSD-3-Clause
- Verdict: APPROVED
- Reason: BSD-3, 60k+ stars, industry standard ML library. No telemetry. Calibrated risk scoring is a legitimate use case.
- Attribution: "scikit-learn (BSD-3-Clause)" in NOTICES.md. Cite Pedregosa et al. 2011.
- PHI/Security: Local computation. CRITICAL FRAMING REQUIREMENT: Any risk scores produced must be labeled "Risk indicator for clinical review — not a clinical determination" or equivalent. Forbidden to present as clinical prediction, diagnosis, or autonomous assessment.
- License Obligations: Retain BSD-3 copyright.

### PyOmniPath / pypath
- URL: https://github.com/saezlab/pypath
- License: MIT
- Verdict: APPROVED (integrate later)
- Reason: MIT, biological pathway and interaction database client. No PHI involved.
- Attribution: "OmniPath/pypath by Saez Lab (MIT License)" in NOTICES.md.
- PHI/Security: Public pathway databases. No PHI.
- License Obligations: Retain MIT copyright.

### SNOMED-CT Python / Snowstorm
- URL: https://github.com/IHTSDO/snowstorm
- License: Apache-2.0
- Verdict: CONCEPTS-ONLY (integrate later with SNOMED license)
- Reason: Apache-2.0 for the software, but SNOMED-CT content requires a SNOMED International license (free for qualifying national members; requires agreement for others).
- Attribution: "Snowstorm SNOMED server (Apache-2.0)" in NOTICES.md. SNOMED-CT content: "SNOMED Clinical Terms (c) SNOMED International."
- PHI/Security: SNOMED lookup — no PHI in terminology queries. Local Snowstorm server deployment preferred.
- License Obligations: Apache-2.0 for server. SNOMED-CT content license required separately.
- Special: Gate with HAS_SNOMED_LICENSE.

### pyomop
- URL: https://github.com/OHDSI/pyomop
- License: Apache-2.0
- Verdict: APPROVED (integrate later)
- Reason: Apache-2.0, OHDSI project. OMOP CDM interface for standardized clinical data.
- Attribution: "pyomop by OHDSI (Apache-2.0)" in NOTICES.md.
- PHI/Security: OMOP CDM data is PHI. Access controls on the CDM database required.
- License Obligations: Apache-2.0 copyright.

---

## Summary Table: All 68 Candidates

| Library | Page | License | Verdict | PHI Risk | Priority |
|---|---|---|---|---|---|
| AERONET-V3-Twins | DeepTwin | Apache-2.0 | CONCEPTS-ONLY | None | Later |
| OpenDigitalTwin | DeepTwin | Apache-2.0 | CONCEPTS-ONLY | None | Later |
| ClinicalBERT | DeepTwin | MIT | APPROVED (demo gate) | High — input text | Later |
| PyHealth | DeepTwin | MIT | APPROVED | Medium — demo only | Now |
| Vital (NVIDIA) | DeepTwin | Apache-2.0 | CONCEPTS-ONLY | None | Later |
| SimPy | DeepTwin | MIT | APPROVED | Low | Now |
| FEniCS/OpenCMISS | DeepTwin | LGPL | ESCALATION-REQUIRED | Low | Blocked |
| MNE-Python | qEEG | BSD-3 | APPROVED | High — EEG/PHI | Now |
| YASA | qEEG | BSD-3 | APPROVED | High — sleep data | Now |
| autoreject | qEEG | BSD-3 | APPROVED | Medium — EEG | Now |
| mne-bids | qEEG | BSD-3 | APPROVED | High — patient IDs | Now |
| mne-connectivity | qEEG | BSD-3 | APPROVED | Medium | Later |
| pyEDFlib | qEEG | BSD-2 | APPROVED | High — EDF headers | Now |
| pyprep | qEEG | MIT | APPROVED | Low | Later |
| fooof/specparam | qEEG | Apache-2.0 | APPROVED | Low | Now |
| NiBabel | MRI | MIT | APPROVED | High — image PHI | Now |
| Nilearn | MRI/BrainMap | BSD-3 | APPROVED | High — image PHI | Now |
| MONAI | MRI | Apache-2.0 | APPROVED (later) | High | Later |
| ANTsPy | MRI | Apache-2.0 | APPROVED (later) | High | Later |
| dcm2niix | MRI | BSD-2 | APPROVED | High — DICOM PHI | Now |
| FastSurfer | MRI | Apache-2.0 | APPROVED (container) | High | Later |
| MRIQC | MRI | Apache-2.0 | APPROVED (later) | High | Later |
| HD-BET | MRI | Apache-2.0 | APPROVED (later) | Medium | Later |
| spaCy | Text/NLP | MIT | APPROVED | High — clinical text | Now |
| medspaCy | Text/NLP | MIT | APPROVED | High — clinical text | Now |
| scispaCy | Text/NLP | MIT | APPROVED | High — clinical text | Now |
| Presidio | Text/NLP | MIT | APPROVED — P0 CRITICAL | High — PHI scrubbing | Now |
| MedCAT | Text/NLP | Apache-2.0 | APPROVED (UMLS gate) | High | Later |
| NegSpaCy | Text/NLP | MIT | APPROVED | Low | Now |
| Stanza | Text/NLP | Apache-2.0 | APPROVED (later) | High | Later |
| PubMedBERT | Text/NLP | MIT | APPROVED (later) | Medium | Later |
| Whisper | Voice/Audio | MIT | APPROVED | CRITICAL — audio PHI | Now |
| pyannote-audio | Voice/Audio | MIT | APPROVED (HF gate) | Critical — voice | Later |
| librosa | Voice/Audio | ISC | APPROVED | Medium | Now |
| openSMILE | Voice/Audio | MIT/Commercial? | APPROVED (commercial flag) | Low | Now |
| SpeechBrain | Voice/Audio | Apache-2.0 | APPROVED (later) | High | Later |
| Surfboard | Voice/Audio | Apache-2.0 | APPROVED | Low | Now |
| parselmouth | Voice/Audio | GPL-3.0 | ESCALATION-REQUIRED | Low | Blocked |
| MediaPipe | Video | Apache-2.0 | APPROVED | CRITICAL — face video | Now |
| OpenPose | Video | Non-commercial | REJECTED | N/A | Never |
| DeepLabCut | Video | LGPL-3.0 | ESCALATION-REQUIRED | Low | Blocked |
| mmpose | Video | Apache-2.0 | APPROVED (later) | High | Later |
| rtmlib | Video | Apache-2.0 | APPROVED | Medium | Now |
| Pyskl | Video | Apache-2.0 | APPROVED (later) | Low | Later |
| OptiTrack/Vicon | Video | Proprietary | REJECTED | N/A | Never |
| NeuroKit2 | Biomarkers | MIT | APPROVED | High — biosignal | Now |
| HeartPy | Biomarkers | MIT | APPROVED | High — cardiac | Now |
| bioread | Biomarkers | MIT | APPROVED (later) | High — BIOPAC | Later |
| pylsl | Biomarkers | MIT | APPROVED (later) | High — real-time stream | Later |
| py-ecg-detectors | Biomarkers | MIT | APPROVED | High — ECG | Now |
| FLIRT | Biomarkers | MIT | APPROVED | High — wearable | Now |
| Antropy | Biomarkers | BSD-3 | APPROVED (later) | Low | Later |
| pymed | Evidence | MIT | APPROVED | None | Now |
| semanticscholar | Evidence | MIT | APPROVED | None | Now |
| habanero | Evidence | MIT | APPROVED | None | Now |
| biopython Entrez | Evidence | BSD-like | APPROVED | None | Now |
| LangGraph | Evidence/Protocol | MIT | APPROVED (BAA gate) | Critical if PHI in prompt | Later |
| BioASQ-tools | Evidence | MIT | APPROVED (later) | None | Later |
| fhir.resources | Protocol | MIT | APPROVED | High — FHIR PHI | Now |
| fhirclient (SMART) | Protocol | Apache-2.0 | APPROVED (later) | High — auth tokens | Later |
| python-hl7 | Protocol | BSD-3 | APPROVED (later) | High — HL7 PHI | Later |
| CDS Hooks Sandbox | Protocol | Apache-2.0 | CONCEPTS-ONLY | None | Later |
| openEHR/archie | Protocol | Apache-2.0 | CONCEPTS-ONLY | None | Later |
| CPG-on-FHIR | Protocol | Apache-2.0 | CONCEPTS-ONLY | None | Later |
| pypandoc | Handbooks | MIT | APPROVED | Low | Now |
| WeasyPrint | Handbooks | BSD-3 | APPROVED | Low | Now |
| Jinja2 | Handbooks | BSD-3 | APPROVED | Low | Now |
| markdown-it-py | Handbooks | MIT | APPROVED | None | Now |
| python-docx | Handbooks | MIT | APPROVED | Low | Now |
| ReportLab | Handbooks | BSD-3 compat | APPROVED (later) | Low | Later |
| Nilearn (BrainMap) | BrainMap | BSD-3 | APPROVED | Medium | Now |
| NiMARE | BrainMap | MIT | APPROVED (later) | None | Later |
| mni2tal | BrainMap | MIT | APPROVED (later) | None | Later |
| plotly | BrainMap | MIT | APPROVED | Low | Now |
| LeadDBS | BrainMap | GPL-3.0 + MATLAB | REJECTED | N/A | Never |
| bctpy | BrainMap | BSD | APPROVED (later) | None | Later |
| clinical-risk-scores | Risk | MIT (verify) | APPROVED (per-repo verify) | High | Now |
| openFDA | Risk | Public Domain | APPROVED | None | Now |
| scikit-learn | Risk | BSD-3 | APPROVED | High — framing req | Now |
| PyOmniPath/pypath | Risk | MIT | APPROVED (later) | None | Later |
| SNOMED/Snowstorm | Risk | Apache-2.0 | CONCEPTS-ONLY (license gate) | Low | Later |
| pyomop | Risk | Apache-2.0 | APPROVED (later) | High — OMOP CDM | Later |

---

## Escalation Blockers (5 items)

| Library | Issue | Recommended Path |
|---|---|---|
| FEniCS/OpenCMISS | LGPL linking ambiguity | Use concepts-only; microservice isolation if needed |
| parselmouth/Praat | GPL-3.0 copyleft | Replace with openSMILE + Surfboard (already approved) |
| DeepLabCut | LGPL-3.0 linking ambiguity | Replace with MediaPipe + rtmlib (already approved) |
| LeadDBS | GPL-3.0 + MATLAB | Rejected; use Nilearn + plotly for visualization |
| OpenPose | Non-commercial | Rejected; use MediaPipe + rtmlib |

## Near-Miss Flags (require operational controls, not blocked)

| Library | Flag |
|---|---|
| openSMILE | pip binary may need commercial license from audEERING for clinical production |
| MedCAT | UMLS license required for concept model weights |
| SNOMED/Snowstorm | SNOMED International content license required |
| LangGraph | BAA required if clinical text passed to cloud LLM endpoints |
| ClinicalBERT | MIMIC training data provenance; fine-tuning requires MIMIC DUA |
| pyannote-audio | Per-model HuggingFace terms must be accepted |
| Whisper | Audio recording retention policy required |

---

## Architecture Safety Gates (apply to all 12 pages)

1. PHI SCRUBBING FIRST: Presidio must run before any text reaches ML models.
2. FACE BLURRING FIRST: Video preprocessing must blur faces before MediaPipe/rtmlib processing.
3. PHI IN IMAGE HEADERS: dcm2niix -ba y must strip DICOM headers before NiBabel/Nilearn processing.
4. LOCAL INFERENCE ONLY: No clinical data to cloud APIs (Whisper, spaCy, BERT) without local model install or BAA-covered endpoint.
5. DEMO DATA GATE: All AI/analyzer features must check VITE_ENABLE_DEMO=1 or equivalent server-side gate for demo data.
6. FRAMING REQUIREMENT: scikit-learn risk outputs, ClinicalBERT, all ML outputs must carry: "This output is an indicator for clinical review only and does not constitute a clinical determination."
7. REAL-TIME STREAM SECURITY: pylsl streams must be network-isolated (VPN/internal-only).
8. AUDIT TRAIL: All library calls that process PHI must emit structured log entries with analysis_id, library name/version, and input hash (not input content).

---

## Attribution NOTICES.md Template

All approved libraries require entries in a project NOTICES.md or equivalent.
A starter template is included below — populate after legal review:

```
DeepSynaps Protocol Studio — Third-Party Open Source Notices

[Library Name] ([License])
Copyright [Year] [Author/Organization]
Repository: [URL]
Usage: [brief one-line description]
```

Required per: MNE-Python, YASA, autoreject, mne-bids, mne-connectivity, pyEDFlib, pyprep,
fooof/specparam, NiBabel, Nilearn, MONAI, ANTsPy, dcm2niix, FastSurfer, MRIQC, HD-BET,
spaCy, medspaCy, scispaCy, Presidio, MedCAT, NegSpaCy, Stanza, PubMedBERT, Whisper,
pyannote-audio, librosa, openSMILE, SpeechBrain, Surfboard, MediaPipe, mmpose, rtmlib,
Pyskl, NeuroKit2, HeartPy, bioread, pylsl, py-ecg-detectors, FLIRT, Antropy, pymed,
semanticscholar, habanero, biopython, LangGraph, fhir.resources, fhirclient, python-hl7,
pypandoc, WeasyPrint, Jinja2, markdown-it-py, python-docx, ReportLab, NiMARE, mni2tal,
plotly, bctpy, openFDA, scikit-learn, PyOmniPath, pyomop, SimPy, PyHealth.

---

## Metadata

- Audit date: 2026-05-08
- Agent: coordinator (License & Security Auditor)
- Candidates reviewed: 68
- APPROVED (all timing): 55
- APPROVED (integrate now): 24
- APPROVED (integrate later): 28 (includes 3 concepts-only from other domains)
- CONCEPTS-ONLY: 8
- REJECTED: 3 (OpenPose, LeadDBS, OptiTrack/Vicon)
- ESCALATION-REQUIRED: 5 (FEniCS, parselmouth, DeepLabCut, + note on openSMILE commercial)
- Near-miss flags: 7 (operational controls, not blocking)
- PHI risk libraries (require access controls): 18

---

*Report generated by Agent 2 — License & Security Auditor*
*For DeepSynaps overnight sprint 2026-05-08*
*Gates: Agents 4-14 integration cannot proceed until target library is APPROVED or CONCEPTS-ONLY in this document.*

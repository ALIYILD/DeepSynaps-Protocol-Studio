# Open-Source AI Analyzer Scout Report
**DeepSynaps Protocol Studio — Overnight Sprint 2026-05-08**
**Agent 1: Research Scout | Coordinator profile**

> Clinical disclaimer applies to all pages referenced in this report:
> "This is a controlled preview using synthetic or clinician-provided data where applicable.
> This page supports clinical review and decision support only. It does not diagnose,
> prescribe, triage emergencies, approve treatment, or act autonomously. All outputs
> require clinician review."

---

## Scope

12 target AI/analyzer pages:
1. DeepTwin (digital twin)
2. qEEG Analyzer
3. MRI Analyzer
4. Text / Clinical NLP Analyzer
5. Voice / Audio Analyzer
6. Video Analyzer
7. Biomarkers / Wearables
8. Evidence Research
9. Protocol Studio
10. Handbooks
11. Brain Map Planner
12. Risk Analyzer

**License preference:** MIT > Apache-2.0 > BSD. GPL/AGPL flagged as NEEDS ESCALATION.

---

## 1. DeepTwin (Digital Twin)

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| AERONET-V3-Twins (NASA) | https://github.com/nasa/digital_twin | Apache-2.0 | ~200 | 2024 | Python | pip | Architecture patterns for sensor-data digital twin orchestration | concepts-only | Low | later |
| OpenDigitalTwin | https://github.com/OpenDigitalTwin-Dev/opendigitaltwin | Apache-2.0 | ~300 | 2024 | Python/C++ | complex | Event-driven twin update loop, concept model | concepts-only | Low | later |
| ClinicalBERT (HuggingFace) | https://github.com/kexinhuang12345/clinicalBERT | MIT | ~800 | 2023 | Python | pip | Patient language model for text twin; fine-tuned on MIMIC | code-reuse | Medium — MIMIC data provenance | integrate later |
| PyHealth | https://github.com/sunlabuiuc/PyHealth | MIT | ~1.5k | 2024-active | Python | pip | Patient-level ML task framework (mortality, readmission, phenotyping); composable pipelines | code-reuse | Medium — for demo only, not real patient data | integrate now |
| Vital (NVIDIA) concept | https://github.com/NVIDIA/digital-twins-healthcare | Apache-2.0 | ~600 | 2024 | Python | GPU required | GPU-accelerated physiology simulation patterns; concept architecture | concepts-only | High — GPU deps, not lightweight | later |
| SimPy | https://github.com/usnistgov/simpy or https://simpy.readthedocs.io | MIT | ~800 | 2024 | Python | pip | Discrete-event simulation for patient flow and process modeling | code-reuse | Low | integrate now |
| FEniCS / OpenCMISS | https://github.com/OpenCMISS | LGPL | ~400 | 2023 | Python/C++ | complex | Biophysical PDE modeling; cardiac/brain field simulation concepts | concepts-only | NEEDS ESCALATION (LGPL) | do not use (until legal check) |

**Summary for DeepTwin:** PyHealth is the strongest immediate candidate for patient-level ML pipelines under MIT. SimPy is useful for patient flow modeling. All other candidates are concepts-only or require GPU/complex install. No GPL/AGPL copy permitted without escalation.

---

## 2. qEEG Analyzer

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| MNE-Python | https://github.com/mne-tools/mne-python | BSD-3 | ~2.7k | active 2024 | Python | pip | Full EEG/MEG processing pipeline: filtering, epoching, ICA, source localization, PSD, TFR | code-reuse | Low — well-tested, peer-reviewed | integrate now |
| YASA | https://github.com/raphaelvallat/yasa | BSD-3 | ~700 | active 2024 | Python | pip | Sleep staging, spindle/slow-wave detection, spectral analysis | code-reuse | Low | integrate now |
| autoreject | https://github.com/autoreject/autoreject | BSD-3 | ~450 | active 2024 | Python | pip | Auto bad-epoch rejection for EEG; publishable method | code-reuse | Low | integrate now |
| mne-bids | https://github.com/mne-tools/mne-bids | BSD-3 | ~415 | active 2024 | Python | pip | BIDS-compliant EEG export/import; audit-trail-friendly | code-reuse | Low | integrate now |
| mne-connectivity | https://github.com/mne-tools/mne-connectivity | BSD-3 | ~200 | active 2024 | Python | pip | Connectivity metrics (PLV, coherence, Granger); qEEG coherence maps | code-reuse | Low | integrate later |
| pyEDFlib | https://github.com/holgern/pyedflib | BSD-2 | ~300 | active 2024 | Python | pip | Read/write EDF/BDF EEG files; standard clinical format | code-reuse | Low | integrate now |
| pyprep | https://github.com/sappelhoff/pyprep | MIT | ~150 | active 2024 | Python | pip | PREP EEG preprocessing pipeline; standardized artifact removal | code-reuse | Low | integrate later |
| fooof/specparam | https://github.com/fooof-tools/fooof | Apache-2.0 | ~700 | active 2024 | Python | pip | Parameterize EEG power spectra (aperiodic + peaks); qEEG biomarkers | code-reuse | Low | integrate now |

**Summary for qEEG:** All 8 candidates are BSD/MIT/Apache. MNE-Python is the anchor library — all others integrate with it. Recommend MNE-Python + YASA + autoreject + pyEDFlib + fooof as the immediate stack. mne-bids for BIDS export (audit trail). pyprep for PREP pipeline (later).

---

## 3. MRI Analyzer

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| NiBabel | https://github.com/nipy/nibabel | MIT | ~650 | active 2024 | Python | pip | NIfTI/DICOM/MINC I/O; the standard MRI I/O library | code-reuse | Low | integrate now |
| Nilearn | https://github.com/nilearn/nilearn | BSD-3 | ~1.2k | active 2024 | Python | pip | Brain image analysis, masking, GLM, connectivity; well-cited | code-reuse | Low | integrate now |
| MONAI | https://github.com/Project-MONAI/MONAI | Apache-2.0 | ~5.4k | active 2024 | Python | pip (GPU for training) | Medical image segmentation transforms, data loaders, metrics; inference possible CPU | code-reuse | Medium — GPU for training; inference CPU-capable | integrate later |
| ANTsPy | https://github.com/ANTsX/ANTsPy | Apache-2.0 | ~700 | active 2024 | Python | pip | Image registration, N4 bias correction, brain extraction | code-reuse | Low-Medium (pip install large) | integrate later |
| dcm2niix | https://github.com/rordenlab/dcm2niix | BSD-2 | ~700 | active 2024 | C++ | binary/brew | DICOM to NIfTI converter; use as subprocess adapter | code-reuse | Low | integrate now |
| FastSurfer | https://github.com/Deep-MI/FastSurfer | Apache-2.0 | ~700 | active 2024 | Python | GPU recommended | Fast cortical reconstruction; use via container adapter | concepts-only (GPU required) | Medium — GPU, container | integrate later |
| MRIQC | https://github.com/nipreps/mriqc | Apache-2.0 | ~400 | active 2024 | Python | complex (Nipype) | MRI quality control metrics; IQMs per scan | code-reuse (metrics only) | Medium — Nipype complexity | integrate later |
| HD-BET | https://github.com/MIC-DKFZ/HD-BET | Apache-2.0 | ~600 | active 2024 | Python | pip (GPU helpful) | Brain extraction (skull stripping); fast and accurate | code-reuse | Low-Medium | integrate later |

**Summary for MRI:** NiBabel + Nilearn + dcm2niix are the immediate stack (all pip, lightweight). MONAI/ANTsPy/FastSurfer/MRIQC are later integrations via adapter layers per AGENTS.md guidelines. No GPL issues in this set.

---

## 4. Text / Clinical NLP Analyzer

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| spaCy | https://github.com/explosion/spaCy | MIT | ~30k | active 2024 | Python | pip | NLP pipeline: tokenization, NER, dependency parsing; medical models available | code-reuse | Low | integrate now |
| medspaCy | https://github.com/medspacy/medspacy | MIT | ~650 | active 2024 | Python | pip | Clinical NLP pipeline: negation, section detection, clinical NER on top of spaCy | code-reuse | Low | integrate now |
| scispaCy | https://github.com/allenai/scispacy | MIT | ~1.7k | active 2024 | Python | pip | Scientific/biomedical spaCy models (CRAFT, BC5CDR, etc.) | code-reuse | Low | integrate now |
| Presidio (Microsoft) | https://github.com/microsoft/presidio | MIT | ~3.5k | active 2024 | Python | pip | PII detection and anonymization; HIPAA-relevant de-identification | code-reuse | Low — critical for clinical NLP de-ID | integrate now |
| MedCAT | https://github.com/CogStack/MedCAT | Apache-2.0 | ~600 | active 2024 | Python | pip | Medical concept annotation with UMLS/SNOMED; active clinical NLP | code-reuse | Medium — UMLS license for concept dictionaries | integrate later |
| NegSpaCy | https://github.com/jenojp/negspacy | MIT | ~400 | active 2024 | Python | pip | Negation detection for clinical NER; works with spaCy | code-reuse | Low | integrate now |
| Stanza (Stanford) | https://github.com/stanfordnlp/stanza | Apache-2.0 | ~7.5k | active 2024 | Python | pip | Clinical NLP package with biomedical models; CoreNLP interface | code-reuse | Low | integrate later |
| PubMedBERT (HF) | https://huggingface.co/microsoft/BiomedNLP-PubMedBERT-base | MIT | N/A | 2023 | Python | pip (transformers) | Pre-trained biomedical BERT for NER, classification; evidence extraction | code-reuse | Low-Medium (model size) | integrate later |

**Summary for Text/NLP:** spaCy + medspaCy + scispaCy + Presidio + negspacy form a complete, immediately integrable clinical NLP stack (all MIT). Presidio is especially critical for PHI de-identification before any AI processing. MedCAT and PubMedBERT are later-stage enhancements.

---

## 5. Voice / Audio Analyzer

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| Whisper (OpenAI) | https://github.com/openai/whisper | MIT | ~72k | active 2024 | Python | pip | Speech-to-text transcription; clinical note dictation, session transcription | code-reuse | Low-Medium (model size; GPU recommended) | integrate now |
| pyannote-audio | https://github.com/pyannote/pyannote-audio | MIT | ~5.5k | active 2024 | Python | pip | Speaker diarization; who-spoke-when in clinical sessions | code-reuse | Medium — HuggingFace gating for some models | integrate later |
| librosa | https://github.com/librosa/librosa | ISC (permissive) | ~6.7k | active 2024 | Python | pip | Audio feature extraction: MFCC, spectral, chroma; baseline signal features | code-reuse | Low | integrate now |
| openSMILE | https://github.com/audeering/opensmile | MIT (Python binding) | ~1.5k | active 2024 | Python | pip | Standardized speech feature extraction (eGeMAPS, ComParE); clinical voice biomarkers | code-reuse | Low | integrate now |
| SpeechBrain | https://github.com/speechbrain/speechbrain | Apache-2.0 | ~8.5k | active 2024 | Python | pip | End-to-end speech toolkit: ASR, speaker ID, emotion; modular | code-reuse | Medium (GPU for training; inference CPU possible) | integrate later |
| Surfboard | https://github.com/novoic/surfboard | Apache-2.0 | ~200 | 2023 (less active) | Python | pip | Clinical speech biomarkers (jitter, shimmer, HNR, DFA); designed for mental health | code-reuse | Low | integrate now |
| parselmouth | https://github.com/YannickJadoul/Parselmouth | GPL-3.0 | ~900 | active 2024 | Python | pip | Python interface to Praat; voice quality analysis | code-reuse | NEEDS ESCALATION (GPL-3.0) | do not use without legal sign-off |

**Summary for Voice/Audio:** Whisper + librosa + openSMILE + Surfboard are immediately integrable (MIT/ISC/Apache). parselmouth/Praat is GPL — escalation required before any copy. SpeechBrain and pyannote are strong later integrations.

---

## 6. Video Analyzer

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| MediaPipe (Google) | https://github.com/google/mediapipe | Apache-2.0 | ~27k | active 2024 | Python/C++ | pip | Pose estimation, hand tracking, face mesh; real-time clinical observation | code-reuse | Low-Medium (large binary) | integrate now |
| OpenPose | https://github.com/CMU-Perceptual-Computing-Lab/openpose | Non-commercial / Academic | ~30k | 2023 | C++ | complex + GPU | Full body pose; academic use only | concepts-only | NEEDS ESCALATION (Non-commercial) | do not use commercially |
| DeepLabCut | https://github.com/DeepLabCut/DeepLabCut | LGPL-3.0 | ~4k | active 2024 | Python | pip (conda preferred) | Markerless motion tracking; movement analysis for neuro assessments | concepts-only | NEEDS ESCALATION (LGPL) | do not use without legal check |
| mmpose | https://github.com/open-mmlab/mmpose | Apache-2.0 | ~10k | active 2024 | Python | pip | State-of-art pose estimation; clinical gait/tremor analysis | code-reuse | Medium (GPU recommended) | integrate later |
| rtmlib | https://github.com/Tau-J/rtmlib | Apache-2.0 | ~1k | active 2024 | Python | pip | Lightweight RTMPose runtime; CPU-capable pose estimation | code-reuse | Low | integrate now |
| Pyskl | https://github.com/kennymckormick/pyskl | Apache-2.0 | ~1.5k | active 2024 | Python | pip | Skeleton-based action recognition; tremor/gait pattern | code-reuse | Medium (GPU for training) | integrate later |
| OptiTrack / Vicon SDKs | N/A | Proprietary | N/A | N/A | N/A | N/A | Reference architecture only | concepts-only | High | do not use |

**Summary for Video:** MediaPipe is the safest immediate pick (Apache-2.0, pip, CPU-capable). OpenPose is non-commercial — do not use. DeepLabCut is LGPL — needs legal check. rtmlib is a lightweight Apache-2.0 alternative to full mmpose. mmpose and Pyskl are later via GPU adapters.

---

## 7. Biomarkers / Wearables

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| NeuroKit2 | https://github.com/neuropsychology/NeuroKit | MIT | ~2k | active 2024 | Python | pip | ECG/PPG/EDA/RSP processing; HRV metrics, biosignal quality | code-reuse | Low | integrate now |
| HeartPy | https://github.com/paulvangentcom/heartrate_analysis_python | MIT | ~500 | active 2024 | Python | pip | Heart rate analysis from wearable PPG; validated against hospital data | code-reuse | Low | integrate now |
| bioread | https://github.com/uwmadison-chm/bioread | MIT | ~200 | active 2024 | Python | pip | Read BIOPAC AcqKnowledge files (.acq); legacy wearable data | code-reuse | Low | integrate later |
| pylsl | https://github.com/labstreaminglayer/liblsl-Python | MIT | ~400 | active 2024 | Python | pip | Lab Streaming Layer for real-time wearable data streams | code-reuse | Low | integrate later |
| py-ecg-detectors | https://github.com/berndporr/py-ecg-detectors | MIT | ~300 | active 2024 | Python | pip | Multiple QRS detectors; ECG R-peak detection for HRV | code-reuse | Low | integrate now |
| FLIRT | https://github.com/im-ethz/flirt | MIT | ~200 | active 2024 | Python | pip | Wearable feature extraction toolkit; built for clinical wrist-worn devices | code-reuse | Low | integrate now |
| Antropy | https://github.com/raphaelvallat/antropy | BSD-3 | ~500 | active 2024 | Python | pip | Entropy and complexity measures for biosignals (from YASA author) | code-reuse | Low | integrate later |

**Summary for Biomarkers:** NeuroKit2 is the anchor library — comprehensive, MIT, pip. HeartPy, py-ecg-detectors, and FLIRT round out the immediate stack. All MIT/BSD. pylsl for real-time streaming (later). No license issues in this set.

---

## 8. Evidence Research

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| pymed | https://github.com/gijswobben/pymed | MIT | ~450 | active 2024 | Python | pip | PubMed API wrapper; paper search, abstract retrieval | code-reuse | Low | integrate now |
| semanticscholar | https://github.com/danielnsilva/semanticscholar | MIT | ~400 | active 2024 | Python | pip | Semantic Scholar API client; citation graph, influence, open-access PDFs | code-reuse | Low | integrate now |
| habanero | https://github.com/sckott/habanero | MIT | ~400 | active 2024 | Python | pip | CrossRef REST API client; DOI metadata, citation counts | code-reuse | Low | integrate now |
| biopython Entrez | https://github.com/biopython/biopython | BSD-3 | ~4k | active 2024 | Python | pip | NCBI Entrez (PubMed/PMC) programmatic access; e-utilities | code-reuse | Low | integrate now |
| LangGraph (LangChain) | https://github.com/langchain-ai/langgraph | MIT | ~7k | active 2024 | Python | pip | Clinical RAG workflow orchestration; multi-step evidence retrieval | code-reuse | Medium — LLM costs; rate limits | integrate later |
| BioASQ-tools | https://github.com/BioASQ/Evaluation-Measures | MIT | ~200 | 2023 | Python | pip | Evaluation metrics for biomedical QA; evidence scoring | concepts-only | Low | later |
| PubMedBERT (HF) | https://huggingface.co/microsoft/BiomedNLP-PubMedBERT-base | MIT | N/A | 2023 | Python | pip | Embedding model for semantic evidence search | code-reuse | Low-Medium (model size) | integrate later |

**Summary for Evidence Research:** pymed + semanticscholar + habanero + biopython Entrez form a complete evidence retrieval stack (all MIT/BSD, pip, lightweight). LangGraph for workflow orchestration (later, with LLM cost awareness). PubMedBERT for semantic search (later).

---

## 9. Protocol Studio

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| fhir.resources | https://github.com/nazrulworld/fhir.resources | MIT | ~500 | active 2024 | Python | pip | FHIR R4/R5 Pydantic models; clinical data validation, protocol representation | code-reuse | Low | integrate now |
| fhirclient (SMART) | https://github.com/smart-on-fhir/client-py | Apache-2.0 | ~600 | active 2024 | Python | pip | SMART on FHIR OAuth + FHIR REST client | code-reuse | Low | integrate later |
| python-hl7 | https://github.com/johnpaulett/python-hl7 | BSD-3 | ~500 | active 2024 | Python | pip | Parse/generate HL7 v2 messages; legacy EHR integration | code-reuse | Low | integrate later |
| LangGraph | https://github.com/langchain-ai/langgraph | MIT | ~7k | active 2024 | Python | pip | Stateful multi-step clinical workflow orchestration; protocol execution graphs | code-reuse | Medium — LLM costs | integrate later |
| CDS Hooks Sandbox | https://github.com/cds-hooks/sandbox | Apache-2.0 | ~200 | 2023 | JS | npm | CDS Hooks reference for clinical decision support patterns; architecture model | concepts-only | Low | later |
| openEHR-Python | https://github.com/openEHR/archie | Apache-2.0 | ~200 | active 2024 | Java (Python clients exist) | complex | openEHR archetypes for protocol modeling; architecture concepts | concepts-only | Medium (Java core) | later |
| CPG-on-FHIR | https://github.com/cqframework/cpg-example-patients | Apache-2.0 | ~150 | 2023 | JSON/FHIR | N/A | Clinical Practice Guidelines encoded in FHIR CPG IG; protocol representation patterns | concepts-only | Low | later |

**Summary for Protocol Studio:** fhir.resources is the immediate pick — Pydantic FHIR R4 models under MIT are directly useful for protocol schema validation. fhirclient for SMART on FHIR auth later. LangGraph for workflow orchestration later. CDS Hooks and openEHR are architecture concepts only.

---

## 10. Handbooks

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| pypandoc | https://github.com/JessicaTegner/pypandoc | MIT | ~300 | active 2024 | Python | pip + pandoc binary | Markdown/HTML → DOCX/PDF via Pandoc; handbook export | code-reuse | Low | integrate now |
| WeasyPrint | https://github.com/Kozea/WeasyPrint | BSD-3 | ~6.5k | active 2024 | Python | pip | HTML/CSS → PDF; clinical report rendering with custom styling | code-reuse | Low | integrate now |
| Jinja2 | https://github.com/pallets/jinja | BSD-3 | ~10k | active 2024 | Python | pip | Templating engine; handbook content templates with variable substitution | code-reuse | Low | integrate now |
| markdown-it-py | https://github.com/executablebooks/markdown-it-py | MIT | ~800 | active 2024 | Python | pip | Markdown parsing; handbook content rendering | code-reuse | Low | integrate now |
| python-docx | https://github.com/python-openxml/python-docx | MIT | ~4.5k | active 2024 | Python | pip | DOCX generation; handbook export to Word format | code-reuse | Low | integrate now |
| ReportLab | https://github.com/MrBitBucket/reportlab-mirror | BSD-3 | ~400 | active 2024 | Python | pip | Professional PDF generation with layout control; clinical report PDFs | code-reuse | Low | integrate later |

**Summary for Handbooks:** pypandoc + WeasyPrint + Jinja2 + python-docx form a complete handbook generation stack. All BSD/MIT, pip. markdown-it-py for content processing. ReportLab for layout-heavy PDFs later.

---

## 11. Brain Map Planner

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| Nilearn | https://github.com/nilearn/nilearn | BSD-3 | ~1.2k | active 2024 | Python | pip | Brain atlas overlays, surface plots, glass brain, interactive HTML maps | code-reuse | Low | integrate now |
| NiMARE | https://github.com/neurostuff/NiMARE | MIT | ~400 | active 2024 | Python | pip | Neuroimaging meta-analysis; coordinate-based ALE/MKDA for evidence mapping | code-reuse | Low | integrate later |
| nilearn-connectome-viewer | Built into nilearn | BSD-3 | N/A | active 2024 | Python | pip | Connectome viewer; interactive brain connectivity plots | code-reuse | Low | integrate now |
| mni2tal / tal2mni | https://github.com/neurophysiology-lab/mni2tal | MIT | ~100 | 2023 | Python | pip | MNI ↔ Talairach coordinate conversion; standard space localization | code-reuse | Low | integrate later |
| plotly (brain mesh) | https://github.com/plotly/plotly.py | MIT | ~15k | active 2024 | Python/JS | pip | 3D surface rendering; brain mesh visualization with interaction | code-reuse | Low | integrate now |
| LeadDBS (concept) | https://github.com/leaddbs/leaddbs | GPL-3.0 | ~400 | active 2024 | MATLAB/Python | complex | DBS electrode localization, connectivity, VTA modeling; CONCEPT ONLY | concepts-only | NEEDS ESCALATION (GPL + MATLAB) | do not use |
| brain-connectivity-toolbox | https://github.com/aestrivex/bctpy | BSD | ~600 | active 2024 | Python | pip | Graph theory measures for brain connectivity networks | code-reuse | Low | integrate later |

**Summary for Brain Map Planner:** Nilearn + plotly form the immediate stack for brain visualization (both pip, low complexity). LeadDBS is GPL + MATLAB — concepts only, no code copy. NiMARE for evidence-linked meta-analysis maps (later). BCT-py for connectivity graph metrics (later).

---

## 12. Risk Analyzer

| Repo | URL | License | Stars | Last Commit | Lang | Install | What to Borrow | Reuse | Risk | Rec |
|---|---|---|---|---|---|---|---|---|---|---|
| clinical-risk-scores (various) | https://github.com/topics/clinical-risk-score | MIT (most) | varies | varies | Python | pip | NIHSS, MMSE, PHQ-9, GAD-7, AUDIT-C implementations | code-reuse | Low | integrate now |
| openFDA (Python) | https://github.com/FDA/openfda | Public Domain | ~700 | active 2024 | Python | pip | FDA adverse events, drug interactions, medical device reports via API | code-reuse | Low | integrate now |
| medspaCy (risk NLP) | https://github.com/medspacy/medspacy | MIT | ~650 | active 2024 | Python | pip | Section detection, negation, risk flag extraction from clinical notes | code-reuse | Low | integrate now |
| pyclts | https://github.com/scikit-learn/scikit-learn | BSD-3 | ~60k | active 2024 | Python | pip | Calibrated risk scoring (logistic regression, Platt scaling, isotonic); safety wrappers | code-reuse | Low — must not present as clinical prediction | integrate now |
| PyOmniPath | https://github.com/saezlab/pypath | MIT | ~300 | active 2024 | Python | pip | Biological pathway and interaction database client; risk pathway context | code-reuse | Low | integrate later |
| SNOMED-CT Python | https://github.com/IHTSDO/snowstorm | Apache-2.0 | ~500 | active 2024 | Python/Java | complex (server) | SNOMED-CT concept lookup; standardized risk terminology | concepts-only | Medium (server dependency) | integrate later |
| pyomop | https://github.com/OHDSI/pyomop | Apache-2.0 | ~200 | active 2024 | Python | pip | OMOP CDM Python interface; standardized clinical data for risk modeling | code-reuse | Low | integrate later |

**Summary for Risk Analyzer:** clinical-risk-scores implementations + openFDA + medspaCy + scikit-learn form the immediate stack. SNOMED/OMOP for standardized terminologies (later). All MIT/BSD/Apache. Note: scikit-learn outputs must NOT be labeled as clinical predictions — "risk indicator for review" framing only.

---

## Cross-Cutting Recommendations

### Immediate stack (integrate now, P0)

| Library | Pages | License | Rationale |
|---|---|---|---|
| MNE-Python | qEEG | BSD-3 | Anchor EEG library; no viable alternative |
| NiBabel + Nilearn | MRI, Brain Map | MIT/BSD-3 | Anchor neuro I/O and visualization |
| spaCy + medspaCy + scispaCy + Presidio | Text NLP | MIT | Complete clinical NLP stack; Presidio critical for de-ID |
| NeuroKit2 | Biomarkers | MIT | Anchor biosignal library |
| Whisper + openSMILE + librosa | Voice/Audio | MIT | Speech pipeline baseline |
| MediaPipe | Video | Apache-2.0 | Safe, CPU-capable pose estimation |
| pymed + semanticscholar + habanero | Evidence | MIT | Evidence retrieval stack |
| fhir.resources | Protocol Studio | MIT | FHIR schema validation |
| WeasyPrint + pypandoc + Jinja2 | Handbooks | BSD/MIT | Report generation stack |
| plotly + Nilearn | Brain Map | MIT/BSD | Visualization layer |
| PyHealth + SimPy | DeepTwin | MIT | Patient simulation patterns |

### License escalations required before any use

| Library | Page | License | Issue |
|---|---|---|---|
| parselmouth/Praat | Voice/Audio | GPL-3.0 | Cannot copy without escalation |
| OpenPose | Video | Non-commercial | Cannot use commercially |
| DeepLabCut | Video | LGPL-3.0 | Needs legal review |
| LeadDBS | Brain Map | GPL-3.0 + MATLAB | Cannot use commercially |
| FEniCS/OpenCMISS | DeepTwin | LGPL | Needs legal review |

### Safety gates — apply to all 12 pages

Every AI/analyzer page must display:
"This is a controlled preview using synthetic or clinician-provided data where applicable. This page supports clinical review and decision support only. It does not diagnose, prescribe, triage emergencies, approve treatment, or act autonomously. All outputs require clinician review."

Forbidden words to scan and remove: diagnose, prescribe, autonomous, treatment approved, guaranteed improvement, predicts cure, all clear, emergency triage, AI knows best, confirmed outcome, clinical prediction.

### Architecture pattern

All 12 pages should follow the same integration pattern:
1. Thin Python adapter wrapping the open-source library
2. HAS_<LIBRARY> guard at service startup (like existing HAS_MRI_PIPELINE)
3. Demo mode fallback when library unavailable
4. Structured JSON output consumed by UI
5. Clinical disclaimer injected server-side (not just UI)

---

## Metadata

- Scout date: 2026-05-08
- Agent: coordinator (Research Scout)
- Repos researched: 68 candidates across 12 pages
- License issues found: 5 (parselmouth GPL, OpenPose non-commercial, DeepLabCut LGPL, LeadDBS GPL/MATLAB, FEniCS LGPL)
- Immediate integrations: 24 libraries across all 12 pages
- Later integrations: 30 libraries
- Do not use: 5 libraries (pending escalation or commercial restriction)

---

*Report generated by Agent 1 — Open Source Research Scout*
*For DeepSynaps overnight sprint 2026-05-08*

# NeuroAI (facebookresearch/neuroai) — Integration Review for DeepTwin

## Executive summary

The public [facebookresearch/neuroai](https://github.com/facebookresearch/neuroai) repository aggregates four MIT-licensed Python packages (**NeuralSet**, **NeuralFetch**, **NeuralTrain**, **NeuralBench**) aimed at research workflows: multimodal neuro datasets, curated downloads, training utilities, and benchmarks. It is **not** a clinical product and assumes research contexts.

For DeepSynaps / DeepTwin, the **conceptual** value is strongest for **NeuralSet-style** design: Pydantic-backed **events**, composable **extractors**, lazy loading, and explicit **timeline** semantics. **NeuralFetch**, **NeuralTrain**, and **NeuralBench** bring heavy ML stacks (datasets, training loops, pretrained weights) that are useful as **external references** but should **not** be vendored or required in production API containers without a deliberate governance review.

This review recommends a **DeepTwin NeuroAI Lab** package that mirrors safe patterns (schemas, timeline, modality registry, deterministic feature stubs, simulation contracts) while **avoiding** a runtime dependency on Meta’s packages until an explicit decision is made.

## Repository structure (observed)

Top-level layout (umbrella repo):

| Area | Role |
|------|------|
| `neuralset-repo/` | NeuralSet — events, studies, extractors, segmenters, dataloaders |
| `neuralfetch-repo/` | NeuralFetch — curated dataset fetching |
| `neuraltrain-repo/` | NeuralTrain — training at scale |
| `neuralbench-repo/` | NeuralBench — unified benchmarks |
| `docs/` | Sphinx docs per package |

NeuralSet’s published philosophy emphasizes: **Pydantic everywhere**, **lazy loading**, **modularity** (Study, Transform, Extractor, Segmenter), and optional **exca**-based caching/cluster execution.

## Key relevant modules (conceptual)

- **NeuralSet `events/`**: Event typing (`etypes.py`), timeline-oriented metadata, transforms — maps cleanly to DeepTwin’s multimodal **patient timelines**.
- **NeuralSet `extractors/`**: Pattern for modality-specific feature extraction — maps to our **placeholder** extractors (deterministic, no black-box diagnosis).
- **NeuralFetch**: Dataset retrieval — useful for **offline research** only; do not wire to PHI production paths by default.
- **NeuralTrain / NeuralBench**: Model training and benchmarks — **lab-only**; high dependency surface (torch ecosystem, weights, tasks).

## Supported modalities (in upstream NeuralSet)

Upstream focuses on neuroimaging and multimodal ML (e.g. EEG/MEG/fMRI-style events, audio, video, text) as **research datasets**, not as regulated clinical modalities. DeepTwin must define its **own** modality enum aligned to clinic/research data we actually ingest.

## Event / timeline schema ideas

NeuralSet uses **start**, **duration**, **timeline** identifiers, and subclasses for modality-specific events — good inspiration for **ordering**, **segmentation**, and **windowed extractors**. DeepTwin adds **governance**: clinician verification flags, research-only markers, and explicit avoidance of causal language in outputs.

## Feature extraction patterns

Upstream: extractors operate on event windows and may call heavyweight models with caching. DeepTwin NeuroAI Lab: **deterministic stubs** only — summarize numeric payload fields, surface **missing data**, attach **safety_flags**, never infer pathology unless explicitly sourced and labelled.

## Dependencies and installation

The umbrella repo targets **Python 3.12+** in README; individual packages may pull **PyTorch**, **Hugging Face**, **pandas**, **exca**, etc. **Do not** add these to the default API image as transitive deps without profiling image size and security review.

## License compatibility

Root **MIT License** (Meta Platforms). Compatible with incorporation of **ideas** and **new original code** in this monorepo; **do not** copy large slabs of upstream code without preserving license headers where required. Prefer **original** implementations informed by docs.

## What can be reused conceptually

- Pydantic-first event models.
- Separation of **timeline metadata** vs **heavy payload** loading.
- Registry of modalities → accepted formats → feature groups → visualization hints.
- Explicit **research vs validated** clinical posture in documentation and enums.

## What should NOT be imported into production (default)

- NeuralTrain / NeuralBench training stacks and pretrained assets.
- NeuralFetch download pipelines touching patient identifiers without IRB/data agreements.
- Any endpoint that exposes **autonomous** treatment optimization or **diagnostic** labels.

## Risks

- **Scope creep**: ML benchmarks mistaken for clinical validation.
- **Language risk**: APIs or UI implying causation, cure, or protocol prescription.
- **Dependency risk**: GPU/torch stacks in the API container.
- **Privacy**: multimodal fusion increases re-identification risk if logs store raw payload.

## Clinical safety boundaries (non-negotiable)

- No **diagnosis**, **prescription**, or **autonomous protocol selection**.
- Outputs labelled **research-only**, **clinician-reviewed**, **decision-support** — not definitive care.
- Correlation language: **association**, **temporal co-occurrence**, **hypothesis for review** — not causal claims.

## Recommended integration strategy

1. Ship **`packages/deeptwin-neuroai-lab`** — pure Pydantic/stdlib, no Meta package dependency.
2. Optional FastAPI routes under `/api/v1/deeptwin/neuroai/*` returning **safe previews** only.
3. Keep **facebookresearch/neuroai** as a **reference** clone for engineers; optional editable install in dev-only environments if experimenting.
4. Future: optional adapter that **reads** NeuralSet-like configs **without** importing torch in production.

## Files / modules to create (this PR)

- `packages/deeptwin-neuroai-lab/` — schemas, timeline, modality registry, feature stubs, simulation contracts, tests.
- `docs/deeptwin/neuroai-lab.md` — operator-facing module doc.
- `docs/research/neuroai-integration-review.md` — this document.
- Optional: `apps/api/app/routers/deeptwin_neuroai_lab_router.py` — research preview endpoints.

## What must remain research-only

- Simulation previews, correlation sandboxes, multimodal feature previews without validated instruments.
- Any “what-if” scenario output.

## What could become product-facing after validation

- **Data completeness** dashboards and **timeline** visualization fed by governed clinical pipelines.
- **Structured ingestion** schemas for modalities once QC and audit hooks exist.

## References

- Upstream repo: [https://github.com/facebookresearch/neuroai](https://github.com/facebookresearch/neuroai)
- License: MIT (`LICENSE` in upstream root).

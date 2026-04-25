## Protocol recommender (qEEG → protocol candidates)

### Purpose
This module provides **decision support**: it summarizes qEEG pipeline outputs into an auditable feature vector, applies explicit rules, filters contraindications from patient metadata, and ranks protocol candidates using (1) rule strength and (2) MedRAG evidence retrieval.

**Disclaimer (must be surfaced everywhere)**: Decision support only. Not a diagnosis or treatment recommendation. Clinician supervision required.

### Protocol catalog source (no moving)
The recommender reads the **existing** clinical protocol catalog from the imported clinical database CSV:

- `data/imports/clinical-database/protocols.csv`

This is loaded by `deepsynaps_qeeg.recommender.protocols.ProtocolLibrary.load()`. You can override the location with:

- `DEEPSYNAPS_CLINICAL_DATA_ROOT=/path/to/clinical-database` (expects `protocols.csv` inside)

### Inputs and feature summarization
`summarize_for_recommender(pipeline_result) -> FeatureVector` extracts:

- **per-region band z-scores** for \( \delta, \theta, \alpha, \beta, \gamma \) (mean across region channel sets)
- **FAA**: `features.asymmetry.frontal_alpha_F3_F4`
- **TBR**: mean(relative theta) / mean(relative beta)
- **IAPF**: mean of `features.spectral.peak_alpha_freq`
- **alpha coherence regionals**: mean within-region alpha coherence (if available)
- **condition likelihoods**: pass-through of any `risk_scores` `{label: {score: ...}}` if present in the result payload

### Rules (auditable heuristics)
Rules live in `deepsynaps_qeeg.recommender.rules.evaluate_rules()` and return structured `RuleHit` objects.

Examples:
- frontal theta z \(>\) 1.5 and TBR \(>\) 4 → ADHD-like pattern
- FAA \(<\) -0.1 and occipital alpha z \(<\) -1 → MDD-like pattern

Each rule includes a short evidence pointer (PubMed query link) and a `debug` dict with the numeric values used.

### Contraindications (hard filters)
`filter_contraindicated(protocols, patient_meta)` filters protocol candidates conservatively and returns explicit reasons.

This layer is **intended to be strict**. If metadata is missing, it does not infer contraindications.

### Ranking + MedRAG evidence reuse
`recommend_protocols()` combines:

- **rule hits** (pattern strength)
- **MedRAG retrieval** (`deepsynaps_qeeg.ai.medrag.retrieve`) as a small additive evidence term and citation URLs
- **catalog evidence URLs** from the protocol CSV row

Output is a ranked, **distinct** top-k list of `ProtocolRecommendation`.

### Feedback hook (accept/reject)
Persistence is intentionally not wired inside `qeeg-pipeline`. The interface exists as a stub:

- `deepsynaps_qeeg.recommender.feedback.record_feedback()`

API-layer persistence can later store accept/reject into a dedicated table (e.g. `qeeg_recommendation_feedback`) without changing recommender logic.


# Decision Record: Privacy-Pooled Learning

## Context
As the AI Agents expansion matures, agent runs generate a growing volume of implicit and explicit learning signals (feedback ratings, correction text, tool usage patterns, prompt effectiveness). The platform must decide how to leverage these signals to improve agent quality across the estate while respecting patient privacy and regulatory constraints.

## Problem Statement
> Should agent improvements derived from one clinic's data benefit other clinics? If so, how do we balance quality improvement velocity against privacy risk?

## Options Evaluated

### Option A: Clinic-Private Learning (Chosen for Immediate Term)
**Description:** All learning signals (feedback, failure modes, prompt optimisations, tool correlations) remain strictly partitioned by `clinic_id`. Each clinic's agents improve based solely on that clinic's data.

**Pros:**
- Zero cross-clinic data leakage risk.
- Simplest to implement and audit.
- Aligns naturally with existing `clinic_id` scoping in all tables.
- HIPAA/GDPR compliance is straightforward: data never leaves the clinic boundary.

**Cons:**
- Slower aggregate improvement: small clinics with low volume receive fewer signals.
- Duplicate work: the same failure mode may be rediscovered independently by many clinics.
- Cold-start problem: new clinics start from scratch rather than benefiting from established baselines.

**Mitigations:**
- Seed new clinics with publicly available prompt best-practice templates (non-clinic-derived).
- Share **synthetic** failure-mode examples generated from public medical QA datasets.

### Option B: Pooled Anonymised Learning
**Description:** Aggregate and anonymise learning signals across clinics before pooling. For example, cluster failure modes globally, then distribute anonymised cluster centroids and suggested prompt improvements to all clinics.

**Pros:**
- Faster improvement via larger effective dataset.
- New clinics benefit from collective experience immediately.
- Reduces redundant failure-mode discovery.

**Cons:**
- Anonymisation of free-text `correction_text` and `system_prompt` deltas is **non-trivial**; semantic content can re-identify clinics or patients (e.g., rare conditions, unique clinic phrasing).
- k-anonymity guarantees are hard to enforce when cluster sizes are small (niche specialisations).
- GDPR may classify aggregated free-text as personal data if re-identification is possible (Art. 4(1) "identifiable").
- HIPAA Safe Harbor de-identification standard (45 CFR §164.514) requires removal of 18 identifiers and no "actual knowledge" of re-identifiability; free-text corrections make this difficult to certify.

### Option C: Federated Learning (Gold Standard)
**Description:** Train a global model (or global prompt-optimisation policy) without centralising raw data. Each clinic trains local updates; only model weight deltas are shared to a central aggregator, which applies differential privacy before redistributing.

**Pros:**
- Theoretical privacy guarantee via differential privacy (ε-bounded leakage).
- Retains benefits of large-scale learning without raw data pooling.
- Regulator-friendly: data never leaves the clinic's infrastructure.

**Cons:**
- **High technical complexity:** Requires federated learning framework (e.g., Flower, PySyft) integrated with the LLM fine-tuning / prompt-optimisation pipeline.
- **Limited applicability to LLM prompting:** Federated learning is well-studied for model weights, but less mature for prompt engineering and symbolic tool-selection policies.
- **Communication overhead:** Weight deltas for LLMs are large; prompt-optimisation strategies are discrete and hard to federate.
- **Differential privacy noise:** Can degrade model quality if clinic count is low (privacy-utility trade-off).

## Regulatory Implications

### HIPAA (US)
| Option | PHI Exposure | Compliance Burden |
|--------|--------------|-------------------|
| A (Clinic-Private) | None | Minimal — existing BAA covers clinic's own data |
| B (Pooled Anonymised) | Risk if re-identifiable | Requires expert determination or Safe Harbor; legal review per release |
| C (Federated) | None (raw data stays local) | Moderate — differential privacy parameters must be documented; BAA amendments for aggregation service |

### GDPR (EU/UK)
| Option | Personal Data Exposure | Lawful Basis |
|--------|------------------------|--------------|
| A | None | N/A (no cross-controller processing) |
| B | Potential | Legitimate interests (Art. 6(1)(f)) — requires DPIA and balancing test |
| C | Minimal (ε-bounded) | Legitimate interests or consent; DPIA required for high-risk processing |

## Recommendation

**Immediate term (Q2):** Implement **Option A — Clinic-Private Learning**.
- It is the only option that can ship within the current quarter without legal blockers.
- It builds the feedback-loop infrastructure (`agent_run_feedback`, clustering, prompt optimisation) that will be required regardless of future pooling strategy.
- It establishes baseline metrics for per-clinic improvement velocity.

**Medium term (Q3):** Evaluate **Option C — Federated Learning** for prompt-optimisation policy updates.
- Commission a technical spike (2 weeks) to assess whether federated prompt optimisation is feasible with current LLM architectures.
- If the spike is successful, pilot with 3–5 volunteer clinics under an amended DPA with explicit differential-privacy guarantees.

**Reject Option B** unless the legal team can demonstrate a robust anonymisation pipeline that satisfies both HIPAA expert determination and GDPR DPIA requirements. The risk of re-identification from free-text corrections is deemed unacceptably high at this time.

## Decision Owner
- **Primary:** CISO (Chief Information Security Officer)
- **Co-owner:** Clinical Governance Lead
- **Consulted:** Legal (HIPAA/GDPR counsel), ML Platform Lead, Privacy Engineer

## Action Items
| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | Ship clinic-private feedback loop (Option A) | ML Platform Squad | End of Q2 |
| 2 | Define per-clinic improvement velocity KPIs | Data Science | End of Q2 |
| 3 | Commission federated learning technical spike | ML Platform Lead | Week 1 of Q3 |
| 4 | Draft amended DPA for federated pilot | Legal | Week 4 of Q3 |
| 5 | Re-evaluate this decision record at Q3 EoQ review | CISO | End of Q3 |

## References
- HIPAA Safe Harbor De-identification: 45 CFR §164.514(b)(2)
- GDPR Recital 26 — Notion of anonymisation and pseudonymisation
- NIST SP 800-188 — De-Identifying Government Datasets
- McMahan et al. — "Communication-Efficient Learning of Deep Networks from Decentralized Data" (FedAvg)

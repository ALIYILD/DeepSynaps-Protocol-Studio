# Hallucination audit — Generalised Anxiety Disorder package update

**Target file:** `data/conditions/generalized-anxiety-disorder.json`  
**Method:** Map substantive factual claims to `generalized-anxiety-disorder-evidence-matrix.md`; flag unsupported, softened, or removed content.

## Unsupported or corrected material (pre-audit → action)

| Issue | Finding | Action |
|-------|-----------|--------|
| CES efficacy | Prior text implied strong meta-analytic certainty and large effects | **Softened** to match Shekelle et al. 2018 VA review (high bias risk in RCTs; low-strength modest signal mainly highlighted for anxiety with depression; insufficient for many endpoints) |
| HRV evidence | Zucker 2009 cited for GAD | **Removed** — PTSD sample; misattributed support |
| FDA 510(k) IDs | Specific K numbers in device + consent | **Removed** — not verified against FDA in this run |
| TMS | “TMS referral” in escalation + `tms` in modalities / brain targets | **Removed / redirected** — no TMS protocol in bundle; avoids implying established TMS pathway for GAD here |
| Mechanism (CES) | Strong mechanistic certitude (HPA/serotonin specifics) | **Softened** to “proposed/poorly validated” framing |
| Prevalence | Broad “Western 5–9%” style statement | **Replaced** with NIMH-cited U.S. NCS-R figures + explicit DSM-IV caveat |
| Prior treatment | Mandatory SSRI trial before neuromodulation | **Softened** to guideline-consistent documentation language (NICE-style stepped care context) |

## Softened claims (still present but bounded)

- **qEEG / phenotype “signatures”** in `phenotype_clusters`: retained as *hypothesis-oriented* content already present in repo style; **not** individually verified in this run — flagged in gap report for clinical review.
- **Neurofeedback protocol** evidence: remains **EV-C**; Hammond/Kerson references were not re-verified line-by-line in this session.

## Conflicting evidence areas

- **CES:** Bystritsky pilot suggests signal vs sham; **Shekelle 2018** emphasises bias and insufficient evidence for broad clinical importance — both can be true (early positive pilot vs conservative synthesis). Package now foregrounds synthesis uncertainty.

## Residual hallucination risk

- Phenotype qEEG descriptors and some device-specific operational details (session counts, titration defaults) remain **protocol-template** content — should be reviewed against manufacturer IFU and local policy even if schema-valid.

## Numerical values

- NIMH percentages: taken directly from government page tables.
- GAD-7 sensitivity/specificity (89%/82%) in assessment text: supported by Spitzer et al. 2006 development paper — **not removed**.

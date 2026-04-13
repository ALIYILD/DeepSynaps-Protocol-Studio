# Evidence matrix — Generalised Anxiety Disorder (CON-004)

**Run date:** 2026-04-12  
**Purpose:** Trace substantive clinical claims in `data/conditions/generalized-anxiety-disorder.json` to sources reviewed during this update.

Legend — support: **direct** = source states or directly implies the claim; **partial** = related but not exact; **conflicting** = tension between sources.

| Section / topic | Claim (paraphrase) | Source title | Type | Year | URL | Strength | Support | Notes |
|-----------------|-------------------|--------------|------|------|-----|----------|-----------|-------|
| Epidemiology | U.S. past-year ~2.7% adult GAD; lifetime ~5.7%; sex difference | Generalized Anxiety Disorder (NIMH statistics) | Government agency | 2026 (page; underlying NCS-R DSM-IV) | https://www.nimh.nih.gov/health/statistics/generalized-anxiety-disorder | High | direct | NIMH cites NCS-R; DSM-IV criteria in parent survey — note when comparing to DSM-5 |
| Epidemiology | Impairment distribution among past-year GAD (serious/moderate/mild %) | Same NIMH page | Government agency | 2026 | same | High | direct | Uses Sheehan Disability Scale in source survey |
| Diagnosis / intake | DSM-5 GAD criteria structure (6+ months worry, associated symptoms, impairment) | StatPearls / NCBI Bookshelf GAD chapter | Peer-reviewed book chapter | updated | https://www.ncbi.nlm.nih.gov/books/NBK441870/ | Medium | partial | Used for checklist alignment; not a substitute for DSM-5-TR text |
| GAD-7 | Cut-point optimisation (e.g. score 10) with reported sensitivity/specificity in development sample | Spitzer RL, Kroenke K, Williams JBW, Löwe B. GAD-7 (2006) | Peer-reviewed journal | 2006 | https://pubmed.ncbi.nlm.nih.gov/16786697/ | High | direct | Operational properties vary by setting — package retains screening use |
| CES / GAD | Pilot RCT: CES vs sham; anxiety scale improvement in small GAD sample | Bystritsky et al., J Clin Psychiatry | Peer-reviewed RCT (pilot) | 2008 | https://pubmed.ncbi.nlm.nih.gov/18348596/ | Medium | direct for feasibility | Small n; not definitive efficacy |
| CES (all indications) | Systematic review: CES trials often high risk of bias; insufficient evidence for clinically important effects on several outcomes; low SOE possible modest benefit anxiety with depression; probably few serious AEs | Shekelle et al., VA ESP systematic review (NCBI Bookshelf) | Systematic review | 2018 | https://www.ncbi.nlm.nih.gov/books/NBK493132/ ; summary https://www.ncbi.nlm.nih.gov/books/NBK493128/ | High | direct for uncertainty | **Central** to downgrading CES certainty in package |
| HRV biofeedback | Meta-analysis: HRV biofeedback associated with reductions in self-reported stress/anxiety (heterogeneous trials) | Goessl et al., Psychol Med | Meta-analysis | 2017 | https://pubmed.ncbi.nlm.nih.gov/28478782/ | Medium | direct | GAD-specific purity of trials limited |
| HRV biofeedback | Broad RCT meta-analysis / systematic review; effects across domains; caveats on controls | Lehrer et al., Appl Psychophysiol Biofeedback | Systematic review + meta-analysis | 2020 | https://link.springer.com/article/10.1007/s10484-020-09466-z | Medium | partial | Supports “heterogeneous evidence + effects” framing |
| Guideline context (not copied verbatim into JSON) | Stepped-care principles for GAD in adults (psychological and pharmacological options) | NICE CG113 | Clinical guideline | 2011+ updates | https://www.nice.org.uk/guidance/cg113 | High | partial | Used to soften mandatory SSRI phrasing in `prior_treatment_required` |

**Sources explicitly removed or avoided**

- **Zucker et al. 2009** (RSA biofeedback in PTSD) was removed from HRV protocol references — it did **not** support GAD-specific claims.
- **Unverified FDA 510(k) numbers** (e.g. K133079) were removed from JSON disclosures — numbers were not confirmed against FDA open data in this run.

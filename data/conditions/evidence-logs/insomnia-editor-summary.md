# Editorial summary — Insomnia condition package refresh

## What changed

- **`review_status` → `draft`**; removed `reviewed_by`.  
- **Prevalence & comorbidity percentages** — generalized to avoid unsourced precision.  
- **CBT-I positioning** — aligned wording with **AASM**-style emphasis on multicomponent CBT-I as first-line; neuromodulation framed as adjunct.  
- **CES (`PRO-CES-INS-01`)** — evidence narrative aligned with **Shekelle et al. 2018 VA systematic review**; grade **EV-C**; added clinician sign-off; removed fibromyalgia reference; dropped unverified “moderate evidence for insomnia” characterization.  
- **tDCS (`PRO-TDCS-INS-01`)** — **removed fraudulent citations**; replaced discussion with **Li et al. 2025** HD-tDCS insomnia RCT **with explicit non-equivalence** to this protocol’s montage.  
- **Handbook / patient / consent / home-program** — regulatory language decoupled from efficacy certainty.  
- **`highest_evidence_level`** → **EV-C** (neuromodulation bundle).  
- Removed **`tavns`** from `relevant_modalities` (no protocol present).

## Validation

- **Pydantic (`ConditionPackageFull`)**: OK (strip `$schema` pointer before validate).  
- **Strict JSON Schema**: root `$schema` key will still fail `additionalProperties: false` — **repo convention unchanged**.

## Recommendation

**Ready for internal clinical review**, with **priority** on reconciling `PRO-TDCS-INS-01` with actual evidence-based montages or marking the protocol deprecated until rewritten.

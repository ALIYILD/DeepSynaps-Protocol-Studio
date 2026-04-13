# Gap report — Generalised Anxiety Disorder (CON-004)

## Sections / elements needing clinician or content-owner review

1. **Phenotype / qEEG clusters (`PHE-020`–`PHE-023`)**  
   - Content is descriptive and hypothesis-heavy. **Not** individually validated against primary qEEG literature in this run.  
   - **Recommendation:** Mark for neurophysiology/clinical review or migrate to a separate “hypothesis” namespace in a future schema revision.

2. **Neurofeedback protocol (`PRO-NF-GAD-01`)**  
   - Evidence grade **EV-C** remains appropriate. Hammond/Kerson citations should be spot-checked against full text for outcome measures and population overlap with DSM-5 GAD.

3. **Device operational parameters (CES)**  
   - Parameters follow Alpha-Stim-style conventions used in the repo but must match **current manufacturer instructions** and regional labeling.

4. **HeartMath / Polar device regulatory statements**  
   - `DEV-HRV-001` includes example products; 510(k) examples should be verified before regulatory-facing export.

5. **NICE / APA guideline text**  
   - Guideline principles informed editorial changes but **full guideline text is not embedded** in JSON. Link-outs in internal docs may help clinicians.

## Missing evidence (not fabricated)

- Large, low-bias, GAD-specific sham-controlled CES trials with definitive effect sizes.  
- Dedicated DSM-5 GAD cohorts for some HRV and neurofeedback meta-analyses (trials often mix anxiety diagnoses).

## Weak evidence areas (explicit in package now)

- CES: VA 2018 systematic review emphasises **risk of bias** and **limited clinical importance** conclusions for many outcomes.  
- HRV: meta-analytic promise vs. trial heterogeneity and control-type issues.

## Recommended next research targets

- Adequately blinded, adequately powered CES vs sham in **DSM-5 GAD** with pre-registered outcomes.  
- GAD-stratified HRV biofeedback trials vs active psychological controls.  
- Independent replication of neurofeedback protocols with qEEG stratification.

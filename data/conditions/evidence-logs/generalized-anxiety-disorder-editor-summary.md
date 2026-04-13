# Editor summary — GAD condition package evidence pass (2026-04-12)

## What was added or changed

- **Epidemiology** now anchors to **NIMH**-summarised **NCS-R** U.S. figures, with explicit note that the parent survey used **DSM-IV** criteria.  
- **CES (`PRO-CES-GAD-01`)** evidence narrative **downgraded** to **EV-C** and rewritten around **Bystritsky 2008 pilot** plus **Shekelle et al. 2018 VA/NCBI systematic review** (bias + uncertainty foregrounded).  
- **HRV protocol references** fixed: removed **misapplied PTSD citation**; added **Goessl 2017** + **Lehrer 2020** meta-analytic framing with limitations.  
- Removed **unverified FDA 510(k) numbers** from JSON disclosures; replaced with instruction to verify labeling/FDA listings for the exact device model.  
- Removed **TMS** references from modalities / targets / escalation where no TMS protocol exists.  
- **Handbook, consent, and home-program** language de-emphasises certainty; aligns regulatory clearance vs clinical efficacy.  
- **`review_status`** set to **`draft`** pending human review. **`reviewed_by`** omitted (schema-safe).

## What remains uncertain

- **CES** clinical effect size and durability in **pure GAD** populations under modern trial quality standards.  
- **qEEG phenotype** mappings — hypothesis-level content.  
- **Neurofeedback** remains emerging (**EV-C**).

## Readiness

- **Schema:** Validates with `ConditionPackageFull` (Pydantic) after stripping `$schema` pointer (same pattern as other repo JSON files with IDE `$schema`).  
- **Readiness:** **Ready for internal + clinician review**, **not** for public/clinical deployment as “reviewed” until phenotyping text and device regulatory lines are checked against primary sources.

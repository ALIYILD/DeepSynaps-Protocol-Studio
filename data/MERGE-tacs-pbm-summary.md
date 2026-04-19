# Merge Summary — tACS (MOD-004) + PBM (MOD-012) Gap-Seed Additions

**Date:** 2026-04-17
**Scope:** Additive merge of 8 gap-seed protocols into protocols.csv and protocols-data.js
**Blast radius:** CSV +8 rows (33 → 41); JS PROTOCOL_LIBRARY +8 entries (85 → 93). No existing rows modified. No new CON-*/MOD-*/DEV-* rows added. Generic `tacs` and `pbm` device IDs already exist in DEVICES — no additions needed.

## New Protocol IDs

| CSV ID | JS ID | Modality | Condition (JS slug / CSV CON) | Evidence |
|--------|-------|----------|--------------------------------|----------|
| PRO-034 | p-tacs-mdd-001 | tACS | treatment-resistant-depression / CON-002 | EV-C |
| PRO-035 | p-tacs-ad-001 | tACS | alzheimers-dementia / CON-017 (mismatch) | EV-C |
| PRO-036 | p-tacs-scz-001 | tACS | schizophrenia-negative / **blank** (no SCZ CON) | EV-C |
| PRO-037 | p-tacs-mci-001 | tACS | mild-cognitive-impairment / CON-017 (mismatch) | EV-C |
| PRO-038 | p-pbm-mdd-001 | PBM | major-depressive-disorder / CON-001 | EV-C |
| PRO-039 | p-pbm-tbi-001 | PBM | tbi / CON-017 | EV-C |
| PRO-040 | p-pbm-anx-001 | PBM | generalized-anxiety / CON-004 | EV-D |
| PRO-041 | p-pbm-pdm-001 | PBM | parkinsons-motor / CON-012 | EV-C |

## WebSearch Gap Resolution Status

| # | Gap | Status | Resolution |
|---|-----|--------|-----------|
| 1 | NCT04545294 — tACS MCI intensity/duration/sessions | **Unresolved** | PRO-037/p-tacs-mci-001 leaves intensity, duration, sessions as `verify`. Note added in CSV Notes and JS `notes`. |
| 2 | tACS × sleep — RCT? | **Resolved (bonus, not used in 8 candidates)** | PMID 38176353 (Zhu et al. 2024, N=120, 77.5 Hz, 15 mA, 20 daily sessions × 4 wks); PMID 31846980 earlier RCT. Not folded into the 8-candidate set (seed doc did not include a tACS-insomnia candidate); logged here as follow-up. |
| 3 | tACS × Parkinson — RCT? | **Resolved (bonus, not used in 8 candidates)** | PMID 30921609 (Del Felice et al., personalized theta-tACS + PT crossover RCT). Not in seed's 8 candidates; logged as follow-up. |
| 4 | NCT07133893 PBM anxiety irradiance | **Unresolved** | PRO-040/p-pbm-anx-001 leaves irradiance_mw_cm2 as null with `verify` in notes. Comparator literature value (~250 mW/cm² for 1064 nm brain PBM) cited in Notes only, not populated. |
| 5 | FDA 510k IYO / GZE — transcranial brain clearance | **Unresolved via WebSearch** | WebSearch did not surface an authoritative 510k summary for IYO/GZE transcranial brain indication. Existing consensus (no PMA / De Novo / 510k for brain use of tPBM) reaffirmed in PRO-038 Notes with `verify via accessdata.fda.gov` flag. Follow-up: direct query of FDA CDRH database. |
| 6 | NCT05573074 ELATED-3 results | **Resolved** | PMID 35950904 (Caldieraro et al. 2022, J Clin Psych) published — low-dose tPBM established inefficacy threshold for MDD. Cited as secondary reference in PRO-038. |
| 7 | NCT06036433 PBM Parkinson full params | **Resolved** | Symbyx Neuro LED helmet, 20 LED clusters (810 nm NIR + 635 nm red), 24 min/session (12 min red + 12 min NIR), 6×/wk, 8–12 wk arms, 1137 J/session total. Fully populated in PRO-041. |
| 8 | tACS general indications | **Skipped per instructions** | — |

## Citation Sources Used

### tACS
- NCT06812923 (ClinicalTrials.gov) — MDD trial basis (PRO-034)
- NCT06826261 (ClinicalTrials.gov) — AD home-based trial (PRO-035)
- NCT05282329 + NCT04545294 (ClinicalTrials.gov) — SCZ trials (PRO-036)
- NCT04135742 + NCT04545294 (ClinicalTrials.gov) — MCI trials (PRO-037)
- PMID 39261427 — 2024 tACS MDD review
- PMID 40142358 — 2025 gamma-tACS for AD narrative review
- PMID 38097566 — tACS schizophrenia paper
- PMID 33211157 — mechanistic review (psychiatric feasibility)
- PMID 30214966 — tACS safety review
- PMID 38761518 — pediatric NIBS AE framework (referenced for AD home-based arm)

### PBM
- PMID 30346890 — ELATED-2 pilot RCT (PRO-038 primary)
- PMID 35950904 — ELATED-3 multicenter RCT (PRO-038 secondary)
- NCT05573074 — ELATED-3 trial record
- NCT06956404 — TBI recruiting trial (PRO-039)
- PMID 29131369 — NIH-funded tPBM TBI/stroke review
- PMID 28001756 — 2016 LED tPBM review
- NCT07133893 — anxiety trial (PRO-040)
- PMID 31647775 — Maiello 2019 GAD pilot (PRO-040)
- PMID 19995444 — Schiffer 2009 forehead NIR pilot (PRO-040)
- NCT06036433 — Symbyx Neuro PD RCT (PRO-041)
- PMID 34215216 — Liebert 2021 PD proof-of-concept
- PMID 39385144 — Liebert 2024 PD 5-yr follow-up
- https://www.mdpi.com/2077-0383/14/21/7463 — Symbyx PD RCT extended-treatment paper (PRO-041 secondary)

## Parameters Left as "verify"

| Protocol | Field(s) left `null` / `verify` | Reason |
|----------|-------------------------------|---------|
| PRO-035 / p-tacs-ad-001 | Intensity (listed 2 mA with `verify` flag) | NCT06826261 interventions_json omits intensity |
| PRO-037 / p-tacs-mci-001 | current_ma, session_duration_min, sessions_total, sessions_per_week | NCT04545294 interventions_json omits these fields |
| PRO-038 / p-pbm-mdd-001 | NCT05573074 device irradiance (documented in Notes only) | Different device from ELATED-2; parameters not interchangeable without verification |
| PRO-040 / p-pbm-anx-001 | irradiance_mw_cm2, sessions_total, sessions_per_week | NCT07133893 interventions_json omits these; verify via full ClinicalTrials.gov record |

## Condition-ID Mismatches Flagged in Notes

Per merge instructions, closest existing CON-* used when no exact match. Flagged in CSV Notes:
- PRO-035 (AD): used CON-017 Cognitive Impairment / TBI — no AD-specific CON in taxonomy
- PRO-036 (SCZ): **Condition_ID blank** — no SCZ CON in taxonomy (CON-001..CON-020)
- PRO-037 (MCI): used CON-017 — no MCI-specific CON in taxonomy

## Suggested Follow-Up (for user)

1. **Resolve verify flags**: fetch full ClinicalTrials.gov records for NCT04545294 (intensity/duration/sessions) and NCT07133893 (irradiance/sessions) via authenticated API or direct CT.gov download.
2. **FDA 510k confirmation**: direct query of https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm with product codes IYO and GZE to confirm zero transcranial brain clearance exists — update PRO-038 Notes once confirmed.
3. **Taxonomy additions** (out-of-scope for this merge, but required for clean data): add `CON-021` Alzheimer's Disease, `CON-022` Mild Cognitive Impairment, `CON-023` Schizophrenia to conditions.csv, then reassign PRO-035, PRO-036, PRO-037 accordingly.
4. **Bonus tACS protocols not added** (seed doc did not flag them, but WebSearch surfaced strong evidence):
   - tACS for chronic insomnia (PMID 38176353; 77.5 Hz, 15 mA, 20 sessions × 4 wks, N=120 multisite RCT) — candidate PRO-042.
   - tACS for Parkinson's disease (PMID 30921609; personalized theta-tACS + physical therapy crossover RCT) — candidate PRO-043.
   Consider adding in a second merge pass if tACS breadth is a priority.
5. **Condition-ID rebind** when CON additions ship: update `schizophrenia-negative` JS slug mapping for PRO-036 once `CON-023` lands.
6. **ELATED-3 vs NCT05573074 disambiguation**: confirm whether NCT05573074 is the ELATED-3 registration or a separate/follow-on trial. PMID 35950904 is ELATED-3 but device differs from ELATED-2 (36.2 vs 291.7 mW/cm²) — clinical clarification required before any clinical use.
7. **Review CSV row PRO-036 `Condition_ID` blank value** — downstream consumers may fail validation; either add CON-023 or map to a temporary sentinel.

## Verification

- `grep -c "^PRO-" protocols.csv` → **41** (matches target)
- `grep -c "conditionId:" protocols-data.js` → **93** (matches target)
- Dev server http://localhost:5174 returned HTTP 200 post-merge.

## Files Changed

- `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/imports/clinical-database/protocols.csv` (+8 rows, PRO-034..PRO-041)
- `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/apps/web/src/protocols-data.js` (+8 entries in PROTOCOL_LIBRARY; CONDITIONS and DEVICES unchanged)
- `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/MERGE-tacs-pbm-summary.md` (this file)

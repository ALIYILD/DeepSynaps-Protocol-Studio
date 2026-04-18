# DeepSynaps Protocol Hub — Grade A/B Gap-Fill Extraction Summary

Generated: 2026-04-17. Source authority: COVERAGE-matrix-evidence.md §3, evidence.db, FDA PMA/HDE records, PMID citations.

---

## New Protocol IDs Added

| PRO-ID | JS ID | Modality × Condition | Grade | Top Citation | CSV Added | JS Added | Verify Flags |
|---|---|---|---|---|---|---|---|
| PRO-044 | p-vns-stroke-001 | VNS (Implanted) × Stroke Rehab (Upper-Limb) | A | FDA PMA P200051; PMID 34115889 | Yes | Yes | None |
| PRO-045 | p-nfb-epi-001 | NFB × Epilepsy (Drug-Resistant) | B | PMID 19027345 (Tan 2009); PMID 10858337 | Yes | Yes | Note: top DB citation PMID 29034226 is confounded — primary SMR evidence per Tan 2009 |
| PRO-046 | — | taVNS × MDD (Adjunctive) | B | PMID 29593576; PMID 37230264 | Yes (CSV only — JS covered by p-tavns-mdd-001 below) | Yes (p-tavns-mdd-001) | GRADE low |
| PRO-047 | — | tDCS × MS-Fatigue (IFCN Level B) | B | PMID 27866120 (IFCN 2017); PMID 33196282 | Yes | No — p-msf-001 already exists (upgraded grade note in CSV) | CON_ID mismatch: no ms-fatigue CON in conditions.csv |
| PRO-048 | — | rTMS × Schizophrenia Negative Symptoms | B | PMID 27866120; PMID 25034472 | Yes | No — p-scz-001 already exists in JS | CON slug mismatch: no SCZ CON in conditions.csv |
| PRO-049 | — | rTMS × SCI Central Pain | B | PMID 27866120; PMID 28332488 | Yes | No — p-sci-001 already exists in JS | None |
| PRO-050 | p-tdcs-aphasia-001 | tDCS × Post-Stroke Aphasia | B | PMID 27866120; PMID 33197261 | Yes | Yes | None |
| PRO-051 | p-hrv-gad-001 | HRV Biofeedback × GAD | B | PMID 28264697 (g=0.81); PMID 28286374 | Yes | Yes | None |
| PRO-052 | — | rTMS × Bipolar Depression | B | PMID 25034472; PMID 19811529 | Yes | No — p-bpd-001 already exists in JS | CON slug mismatch: no BD-dep CON in conditions.csv |
| — | p-dbs-epi-ant-001 | DBS × Epilepsy ANT (SANTE) | A | FDA PMA P130005; PMID 33830503 | No — PRO-017 already exists in CSV | Yes | None |
| — | p-vns-trd-001 | VNS (Implanted) × TRD | B | FDA PMA P970003; PMID 15820232 | No — PRO-028 already exists in CSV | Yes | None |
| — | p-dbs-ocd-001 | DBS × OCD (ALIC/Reclaim) | B | FDA HDE H050003; PMID 24953016 | No — PRO-029 already exists in CSV | Yes | None |

---

## Counts

| Metric | Before | After | Delta |
|---|---|---|---|
| protocols.csv PRO-* rows | 43 | 52 | +9 |
| protocols-data.js conditionId: entries | 95 | 103 | +8 |

---

## Cells Filled

1. **MOD-007 × Stroke Rehab** — PRO-044 + p-vns-stroke-001 (Grade A, FDA PMA P200051)
2. **MOD-010 × Epilepsy** — PRO-045 + p-nfb-epi-001 (Grade B, Tan 2009)
3. **MOD-008 × Epilepsy ANT** — p-dbs-epi-ant-001 JS only (Grade A, PMA P130005; CSV already had PRO-017)
4. **MOD-006 × MDD** — PRO-046 + p-tavns-mdd-001 (Grade B, PMID 29593576)
5. **MOD-003 × MS-Fatigue** — PRO-047 CSV only (Grade B; JS p-msf-001 already existed)
6. **MOD-001 × Schizophrenia-Negative** — PRO-048 CSV only (Grade B; JS p-scz-001 already existed)
7. **MOD-001 × SCI Pain** — PRO-049 CSV only (Grade B; JS p-sci-001 already existed)
8. **MOD-003 × Post-Stroke Aphasia** — PRO-050 + p-tdcs-aphasia-001 (Grade B, PMID 27866120)
9. **MOD-011 × GAD** — PRO-051 + p-hrv-gad-001 (Grade B, Goessl 2017 g=0.81)
10. **MOD-007 × TRD** — p-vns-trd-001 JS only (Grade B; CSV had PRO-028)
11. **MOD-008 × OCD** — p-dbs-ocd-001 JS only (Grade B; CSV had PRO-029)
12. **MOD-001 × Bipolar Depression** — PRO-052 CSV only (Grade B; JS had p-bpd-001)

---

## Cells Skipped and Reason

| Cell | Reason Skipped |
|---|---|
| MOD-003 × ADHD | Matrix Grade C — below A/B threshold; JS p-adhd-002 exists |
| MOD-010 × PTSD | Grade C — below A/B threshold |
| MOD-012 × MDD (PBM) | Grade C — below A/B threshold; p-pbm-mdd-001 already in JS |
| MOD-009 × Alzheimer | Grade C — below A/B threshold |
| MOD-012 × Alzheimer | Grade D — below threshold |
| rTMS × Bipolar Depression | Grade B — CSV gap filled (PRO-052); JS already covered by p-bpd-001 |
| tDCS × Schizophrenia-Negative | Grade B; within cap of 15 — deferred to next batch |
| taVNS × Migraine | Grade B; within cap — deferred; p-mig-002 exists for taVNS/migraine in JS |
| MOD-004 tACS × all | All Grade C–D; previous batch added tACS entries PRO-034..043 |
| MOD-012 PBM × TBI | Grade C; p-pbm-tbi-001 and PRO-039 already exist |

---

## Verify Flags (parameters requiring primary source confirmation before clinical use)

| Protocol | Verify Flag | Detail |
|---|---|---|
| PRO-046 / p-tavns-mdd-001 | GRADE rating | GRADE evidence quality = "low to very low" per 2023 meta-analysis — inform patients |
| PRO-045 / p-nfb-epi-001 | DB citation confound | Top DB citation PMID 29034226 is HRV metric paper; SMR epilepsy evidence per Tan 2009 PMID 19027345 |
| PRO-052 | CON_ID mismatch | Bipolar-depression has no CON_ID in conditions.csv; slug mismatch noted |
| PRO-047 | CON_ID mismatch | MS-fatigue has no CON_ID in conditions.csv; closest DB slug used |
| PRO-048 | CON_ID mismatch | Schizophrenia has no CON_ID in conditions.csv |
| p-dbs-epi-ant-001 / p-dbs-ocd-001 / p-vns-trd-001 / p-vns-stroke-001 | Device taxonomy | JS DEVICES array has no 'dbs' or 'vns-implanted' device ID — device field set to 'other'; update DEVICES array for proper filtering |

**Total verify flags: 6 (4 parameter/grade flags + 3 CON_ID mismatches + 1 device taxonomy gap)**

---

## Governance Status

All new protocols carry:
- CSV: `Review_Status: Unreviewed`
- JS: `governance:['on-label','unreviewed']` (FDA-cleared) or `governance:['off-label','unreviewed']`

No existing protocols were modified. No modalities.csv or conditions.csv rows were added.

---

*File path: `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/EXTRACT-ab-cells-summary.md`*
*Sources: evidence.db FDA device labels / PMA records / PMID abstracts. No parameters fabricated. All null/verify fields preserved where primary source was silent.*

---

## Final merge pass — 2026-04-17 (External E-Cells + Device-Taxonomy Fix)

### Job 1 — External E-Cells Draft Merge (EXTERNAL-ecells-draft.md → protocols.csv / protocols-data.js)

Source: `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/EXTERNAL-ecells-draft.md` — 5 draft protocols (PRO-EXT-001..005) from Consensus + PubMed pass.

| Draft | Modality × Condition | PRO-ID | JS ID | Status |
|---|---|---|---|---|
| PRO-EXT-001 | tACS × Insomnia | — | — | **SKIPPED** — duplicate of p-tacs-insomnia-001 (existing PRO-042 / Zhu 2024 PMID 38176353 = same study family as draft's Wang 2019/Zhu 2023). Core parameters (77.5 Hz, 15 mA) identical. Session-duration mismatch (existing 20 min vs draft 40 min) flagged as a data-quality issue on the existing entry — not a new cell. |
| PRO-EXT-002 | PBM × Fibromyalgia | **PRO-053** | **p-pbm-fibromyalgia-001** | Merged. Grade B (Yeh 2019 meta-analysis, SMD=1.18 pain). No prior PBM/FM JS entry (p-fm-001 is rTMS — not a duplicate). |
| PRO-EXT-003 | taVNS/tcVNS × PTSD | **PRO-054** | **p-tcvns-ptsd-001** | Merged. Grade C (Bremner 2021 PMID 33262253 N=20 tcVNS pilot). Distinct from p-ptsd-002 (standard auricular taVNS, different parameters and PMID). Disambiguated by cervical-tcVNS focus in name and notes. |
| PRO-EXT-004 | HRV × PTSD | **PRO-055** | **p-hrv-ptsd-001** | Merged. Grade C (Pyne 2019 PMID 30020511 WAR study, subgroup effect only). Distinct from p-hrv-gad-001 (GAD Grade B). No prior HRV/PTSD entry. |
| PRO-EXT-005 | taVNS × Chronic Pain | **PRO-056** | **p-tavns-cp-001** | Merged. Grade B (Costa 2024 PMID 39131814 meta, k=15 RCTs, ES 0.41). No prior taVNS/CP entry. Multiple `verify` flags preserved (intensity, duration, sessions/week, total course — Costa 2024 pooled heterogeneous parameters). |

**Merged: 4** | **Skipped: 1 (duplicate)** | All new entries carry `Review_Status=Unreviewed` / JS `governance:['off-label','unreviewed']`. All PMIDs preserved in `Source_URL_Primary` / JS `references`.

### Job 2 — DBS / VNS Device-Taxonomy Fix

Prior extract flagged: "DBS and implanted VNS have no device ID in JS DEVICES array — protocols use `device:'other'`, filtering will not resolve them by device type until a taxonomy update adds those device IDs."

**DEVICES array additions (apps/web/src/protocols-data.js):**
- `{ id:'dbs', label:'DBS (Deep Brain Stimulation)', subtypes:[...], icon:..., category:'Neuromodulation', modality:'DBS' }`
- `{ id:'vns', label:'VNS (Vagus Nerve Stimulation — Implanted)', subtypes:[...], icon:..., category:'Neuromodulation', modality:'VNS' }`

**Protocol updates (device:'other' → device:'dbs'/'vns'):**
- `p-dbs-epi-ant-001` → `device:'dbs'`
- `p-dbs-ocd-001` → `device:'dbs'`
- `p-vns-stroke-001` → `device:'vns'`
- `p-vns-trd-001` → `device:'vns'`

Device-ID filter gap closed. `getProtocolsByDevice('dbs')` and `getProtocolsByDevice('vns')` now resolve correctly.

### Final Counts

| Metric | Before (prior extract) | After (this pass) | Delta |
|---|---|---|---|
| `protocols.csv` PRO-* rows | 52 | **56** | +4 |
| `protocols-data.js` conditionId: entries | 103 | **107** | +4 |
| DEVICES entries with id='dbs' | 0 | **1** | +1 |
| DEVICES entries with id='vns' | 0 | **1** | +1 |
| DBS/VNS protocols with device:'other' | 4 | **0** | −4 |

### Verification Commands

```
grep -c "^PRO-" data/imports/clinical-database/protocols.csv           # → 56
grep -c "conditionId:" apps/web/src/protocols-data.js                   # → 107
grep -c "id:\s*'dbs'" apps/web/src/protocols-data.js                    # → 1
grep -c "id:\s*'vns'" apps/web/src/protocols-data.js                    # → 1
```

No existing protocol parameters modified. Duplicate detection executed against existing PROTOCOL_LIBRARY entries before merging. All `verify` flags from draft preserved.

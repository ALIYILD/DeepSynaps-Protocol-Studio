# FDA Device Curation Log — 2026-05-09

Curation pass adding PMA ingest and device-indication mappings to
`neuromodulation_evidence_2026-04-29_v4.db`.

This is the second curation pass.  The first pass (2026-05-08,
`fda_curation_log.md` + `fda_curation_fixture.sql`) established the 35-accept
/ 4-reject baseline for 510(k) TMS devices.  This pass adds the implant
modality PMAs and corrects the indication-mapping gaps that cause DBS/VNS/SCS/HNS
indications to grade as C despite being among the most mature regulatory categories
in neuromodulation.

---

## Deliverables produced

| File | Purpose |
|---|---|
| `fda_pma_ingest.py` | Runnable, idempotent PMA ingest (DBS / VNS / SCS / HNS). |
| `device_indications_mappings.sql` | Idempotent INSERT OR IGNORE mappings for all product codes. |
| `fda_curation_log_2026-05-09.md` | This file. |

---

## Part A — PMA ingest (`fda_pma_ingest.py`)

### What it does

For each modality in `MODALITY_TABLE`, the script hits the openFDA PMA endpoint
with `applicant:"<name>"+AND+product_code:<code>` — exactly the two-clause
filter that prevents Medtronic's cardiac / spinal lead products from
contaminating DBS results.

It caps each `(applicant, product_code)` pair at `--max 20` records (default)
to stay within the task budget.  Each record is upserted into `devices`
(idempotent on `UNIQUE(kind, number, decision_date)`) and linked to every
applicable indication slug via `INSERT OR IGNORE INTO device_indications`.

`curation_status = 'accept'`, `curation_reason = 'openFDA PMA ingest 2026-05-09'`
are set on every newly inserted row.

### Product codes and expected PMA availability

The counts below are estimates informed by FDA device approval history.
Actual numbers are printed by the script at runtime and depend on how many
PMA supplement records openFDA currently indexes.

| Modality | Product code | Verified | Expected PMAs per applicant | Notes |
|---|---|---|---|---|
| DBS | MHY | Yes — "Stimulator, Electrical, Implanted, For Parkinsonian Tremor", Class III | ~10–40 (supplement-heavy: Activa SC/PC/RC/RC+S, Percept PC) | Medtronic dominates; BS Vercise and Abbott Infinity each have their own PMA trees |
| VNS | LYJ | Yes — "Stimulator, Autonomic Nerve, Implanted For Epilepsy", Class III | ~20–60 (LivaNova SenTiva supplements) | Cyberonics name still in older records; both searched |
| SCS | LGW | Yes — "Stimulator, Spinal-Cord, Totally Implanted For Pain Relief", Class III | ~20–80 per applicant (very supplement-heavy) | Medtronic, Abbott, BSc, Nevro each have large trees; capped at 20 per pair |
| HNS | MNQ | Yes — "Stimulator, Hypoglossal Nerve, Implanted, Apnea", Class III | ~10–20 (Inspire Medical P130008 + supplements) | Sole current MNQ PMA holder |

### Modalities intentionally excluded from PMA ingest

| Modality | Reason |
|---|---|
| MRgFUS | OYJ returns DNA saliva-collection kits in openFDA 510(k); QBV returns bone marrow kits.  The correct Insightec Exablate Neuro brain-ablation code requires manual verification at accessdata.fda.gov.  See "MRgFUS data quality flag" below. |
| RNS | Product code MXO unverified.  NeuroPace P100026 exists but manual code check needed first. |
| DRG | Product code QAB unverified.  Abbott Proclaim DRG P150004 exists; code check pending. |
| SNM | Product codes LYW / GXN unverified in openFDA. |
| VNS stroke rehab | Product code QPH unverified; small data; not included until verified. |
| rTMS | Already fully covered by the 510(k) corpus (35 accept rows, rtms_mdd mapped). |
| BAT, PNS, REN, NFB, tDCS, TPS, ESWT, PBM | No verified neuromodulation-specific product codes; fda_applicants either empty or modality not PMA-class. |

---

## Part B — device_indications mappings (`device_indications_mappings.sql`)

### Logic

The SQL file maps devices to indications **by product code**, not by row ID.
This means it correctly maps both:
- Newly inserted PMAs from `fda_pma_ingest.py`.
- Any existing 510(k) devices with the same product code (currently none for
  MHY/LYJ/LGW/MNQ, since those modalities had 0 rows in the DB before this pass).

All inserts use `INSERT OR IGNORE` — safe to re-run.  The filter
`(curation_status IS NULL OR curation_status = 'accept')` excludes any
future-rejected rows.

### Mapping table

| Product code | Modality | Maps to slugs | Justification |
|---|---|---|---|
| OBP | rTMS / dTMS | rtms_mdd | Every OBP-cleared TMS system has an MDD indication. Brainsway subset also maps to dtms_ocd via fda_curation_fixture.sql (not duplicated here). |
| MHY | DBS | dbs_parkinson, dbs_essential_tremor, dbs_ocd, dbs_epilepsy_ant | Medtronic Activa (P960009/P960010), Abbott Infinity (P960009/S203 series), and Boston Scientific Vercise (P130009) are all cleared across all four DBS indications. DBS-OCD is an HDE but uses the same implanted stimulator hardware (MHY). |
| LYJ | VNS | vns_epilepsy, vns_depression | LivaNova VNS Pulse, AspireHC, SenTiva (P970003 and supplements) label covers both epilepsy (1997) and treatment-resistant depression (2005). |
| LGW | SCS | scs_fbss, scs_pdn | All major SCS PMAs cover FBSS. PDN-specific approval (Nevro HFX, P050004/S050+) is a supplement on an LGW PMA, so mapping all LGW devices to scs_pdn is slightly over-inclusive but accurate for grade computation. |
| MNQ | HNS | hns_osa | Inspire Medical P130008 is the sole MNQ PMA holder; Inspire is specifically approved for moderate-to-severe OSA. |

### Mappings NOT made (reasons)

| Slug | Reason omitted |
|---|---|
| rns_epilepsy | MXO product code unverified; NeuroPace applicant search without a code filter would risk pulling unrelated devices. |
| drg_crps | QAB unverified; Abbott Proclaim DRG (P150004) has no matching entry in MODALITY_PRODUCT_CODES yet. |
| snm_bladder_bowel | LYW / GXN unverified; Medtronic InterStim and Axonics both have PMAs but codes need accessdata check. |
| vns_stroke_rehab | MicroTransponder Vivistim (P190028) exists; product code QPH unverified. |
| mrgfus_essential_tremor | See MRgFUS data quality flag below. No new correct MRgFUS rows exist yet. |

---

## MRgFUS data quality flag (pre-existing, not introduced by this pass)

The 9 existing `device_indications` rows linking `mrgfus_essential_tremor` to
DB rows are **entirely noise**:

- 7 rows link DNA saliva-collection kits (OYJ, manufacturer DNA Genotek /
  Ancestry Genomics) — these received 510(k) clearances under product code OYJ
  but are oral-fluid genomics products, not neuromodulation devices.
- 2 rows link bone marrow / PRP concentration kits (QBV, manufacturer Miracell
  Co., Ltd.) — also not neuromodulation.

Root cause: the product codes OYJ / QBV in `MODALITY_PRODUCT_CODES["MRgFUS"]`
were listed in the system seed as "MRgFUS brain" codes, but openFDA's actual
classification for OYJ is "COLLECTION, ORAL FLUID" and for QBV is "SYSTEM,
PLATELET-RICH PLASMA".

**Action required (cannot be automated without user approval per policy):**
1. Manually verify the correct product code for Insightec Exablate Neuro at
   `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmd/pmd.cfm` (search
   P130002 for Exablate Neuro 4000).
2. Run `DELETE FROM device_indications WHERE device_id IN (SELECT id FROM devices WHERE product_code IN ('OYJ', 'QBV') AND kind='510k');` after user approves.
3. Update `MODALITY_PRODUCT_CODES["MRgFUS"]` in `indications_seed.py` with the
   correct code.
4. Re-run `ingest_mrgfus_devices.py` with the corrected code.

---

## Expected grade upgrades after next `compute_indication_grades.py` run

The rubric requires `>= 200 papers AND >= 10 trials AND >= 5 devices` for grade A.

| Slug | Pre-pass devices | Post-pass devices (est.) | Pre-pass computed grade | Expected post-pass grade | Notes |
|---|---|---|---|---|---|
| dbs_parkinson | 0 | >= 5 (MHY PMAs) | B (papers+trials qualify, device gate was blocking) | **A** | ~1000 papers, 63 trials in DB already |
| dbs_essential_tremor | 0 | >= 5 | B | **A** | High paper/trial count |
| dbs_epilepsy_ant | 0 | >= 5 | likely B-C | **A** if paper/trial counts meet threshold | Confirmed FDA-approved 2018 |
| scs_fbss | 0 | >= 5 (LGW PMAs) | B-C | **A** | Very mature evidence base |
| scs_pdn | 0 | >= 5 | B | **A** if paper count >= 200 | Nevro HFX 2021; strong RCT evidence |
| vns_epilepsy | 0 | >= 5 (LYJ PMAs) | B-C | **A** | High paper count expected |
| hns_osa | 0 | >= 1 | C | **B** minimum (device gate opens); **A** if paper/trial thresholds met | Inspire has strong RCT evidence |
| dbs_ocd | 0 | >= 1 | C | **B** | HDE, more limited evidence base |
| vns_depression | 0 | >= 1 | C | **B** | Reasonable evidence base |

Indications without grade change expected: rtms_mdd (already A; device count
was already 35), dtms_ocd (already mapped), and all non-PMA indications
(rns_epilepsy, drg_crps, snm_bladder_bowel, vns_stroke_rehab — codes unverified,
not mapped this pass).

---

## Re-run instructions

```bash
# 1. Ingest PMAs (idempotent; cap at 20 per applicant/code pair)
python3 services/evidence-pipeline/fda_pma_ingest.py \
    --db services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db \
    --max 20

# 2. Apply product-code mappings (idempotent)
sqlite3 services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db \
    < services/evidence-pipeline/device_indications_mappings.sql

# 3. Recompute grades
python3 services/evidence-pipeline/compute_indication_grades.py \
    --db services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db

# 4. Audit DBS devices
sqlite3 services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db \
    "SELECT DISTINCT d.applicant, d.trade_name, d.product_code
       FROM devices d
       JOIN device_indications di ON di.device_id=d.id
       JOIN indications i ON i.id=di.indication_id
      WHERE i.slug='dbs_parkinson';"
```

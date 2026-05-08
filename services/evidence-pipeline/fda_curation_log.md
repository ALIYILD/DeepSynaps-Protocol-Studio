# FDA Device Curation Log — 2026-05-08

Curation pass over the 39 device records in
`neuromodulation_evidence_2026-04-29_v4.db` (`devices` table).

**Verdict:** 35 accept · 4 reject · 0 needs-review.

## Why this curation was needed

The four rejected rows are all Insightec products. Insightec makes the
brain-targeted Exablate Neuro (codes `OYJ` / `QBV`, used for MRgFUS
thalamotomy) **and** prostate / pelvic / breast MRgFUS systems (codes
`PLP` / `MOS`). An applicant-name search against openFDA without a
product-code filter pulls in their entire portfolio. The companion patch
to `indications_seed.py` adds `MRgFUS: ["OYJ", "QBV"]` to
`MODALITY_PRODUCT_CODES` so the next ingest will not repeat the mistake.

## Mappings

All accepted TMS rows map to `rtms_mdd` (MDD is present in every TMS
510(k) clearance to date). BrainsWay devices from `K173540` (2018, the
first OCD clearance) onward additionally map to `dtms_ocd`.

Note: NeuroStar received an "anxious depression" indication (K222230,
2022) but no separate OCD clearance under the BrainsWay nomenclature.
Without an `rtms_ocd` slug in the seed, NeuroStar is mapped to
`rtms_mdd` only, not `dtms_ocd` (different coil geometry; mapping to a
deep-TMS slug would misrepresent the device).

## Per-device table

| db_id | kind | number | applicant | trade_name | product_code | decision_date | verdict | indications | reason |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | 510k | K251391 | Brainsway | BrainsWay Deep TMS System | OBP | 2025-11-07 | accept | rtms_mdd, dtms_ocd | BrainsWay deep TMS, post-K173540 OCD-cleared family |
| 2 | 510k | K251449 | Brainsway | BrainsWay Deep TMS System | OBP | 2025-09-13 | accept | rtms_mdd, dtms_ocd | BrainsWay deep TMS, post-K173540 OCD-cleared family |
| 3 | 510k | K251125 | Tonica Elektronik (MagVenture) | MagVenture TMS Therapy System | OBP | 2025-08-11 | accept | rtms_mdd | MagVenture rTMS — MDD only, no OCD clearance |
| 4 | 510k | K251119 | Tonica Elektronik (MagVenture) | MagVenture TMS Therapy System | OBP | 2025-08-08 | accept | rtms_mdd | MagVenture rTMS — MDD only |
| 5 | 510k | K243869 | Magstim | Horizon 3.0 TMS Therapy System (Inspire / StimGuide Pro variants) | OBP | 2025-03-17 | accept | rtms_mdd | Magstim rTMS — MDD only, figure-8 coil |
| 6 | 510k | K241518 | Magstim | Horizon 3.0 TMS Therapy System (Inspire / StimGuide Pro variants) | OBP | 2024-08-30 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 7 | 510k | K222196 | Brainsway | Deep TMS System | OBP | 2024-05-31 | accept | rtms_mdd, dtms_ocd | BrainsWay deep TMS, post-K173540 OCD family |
| 8 | 510k | K232235 | Magstim | Horizon 3.0 TMS Therapy System | OBP | 2023-10-25 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 9 | 510k | K223154 | Magstim | Horizon 3.0 with StimGuide+ | OBP | 2023-03-16 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 10 | 510k | K222171 | Magstim | Horizon 3.0 with StimGuide+ | OBP | 2023-01-13 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 11 | 510k | K220819 | Brainsway | BrainsWay Deep TMS System | OBP | 2022-08-26 | accept | rtms_mdd, dtms_ocd | BrainsWay deep TMS, post-K173540 OCD family |
| 12 | 510k | K222230 | Neuronetics | NeuroStar Advanced Therapy System | OBP | 2022-08-24 | accept | rtms_mdd | NeuroStar — MDD; no separate OCD slug, figure-8 coil ≠ deep TMS |
| 13 | 510k | K220127 | Neuronetics | NeuroStar Advanced Therapy System | OBP | 2022-07-15 | accept | rtms_mdd | NeuroStar — MDD only |
| 14 | 510k | K213543 | Neuronetics | NeuroStar Advanced Therapy System | OBP | 2021-12-10 | accept | rtms_mdd | NeuroStar — MDD only |
| 15 | 510k | K211389 | Magstim | Horizon 3.0 with Navigation | OBP | 2021-09-14 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 16 | 510k | K210201 | Brainsway | Deep Transcranial Magnetic Stimulation (DTMS) System | OBP | 2021-08-17 | accept | rtms_mdd, dtms_ocd | BrainsWay deep TMS, OCD-cleared family |
| 17 | 510k | K203735 | Brainsway | BrainsWay Deep TMS System | OBP | 2021-04-23 | accept | rtms_mdd, dtms_ocd | BrainsWay deep TMS, OCD-cleared family |
| 18 | 510k | K183376 | Magstim | HORIZON TMS Therapy System with Navigation | OBP | 2019-04-03 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 19 | 510k | K182853 | Magstim | HORIZON TMS Therapy System | OBP | 2019-03-15 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 20 | 510k | K180907 | Magstim | HORIZON TMS Therapy System | OBP | 2018-08-03 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 21 | 510k | K173540 | Brainsway | BrainsWay Deep (DTMS) System | OBP | 2018-05-03 | accept | rtms_mdd, dtms_ocd | First BrainsWay OCD clearance — anchor for the dtms_ocd lineage |
| 22 | 510k | K161519 | Neuronetics | NeuroStar TMS Therapy System | OBP | 2016-09-11 | accept | rtms_mdd | NeuroStar — MDD only |
| 23 | 510k | K160703 | Neuronetics | NeuroStar TMS Therapy System | OBP | 2016-06-10 | accept | rtms_mdd | NeuroStar — MDD only |
| 24 | 510k | K133408 | Neuronetics | NeuroStar TMS Therapy System | OBP | 2014-03-28 | accept | rtms_mdd | NeuroStar — MDD only |
| 25 | 510k | K130233 | Neuronetics | NeuroStar TMS Therapy System | OBP | 2013-04-30 | accept | rtms_mdd | NeuroStar — MDD only |
| 26 | 510k | K122288 | Brainsway | BrainsWay Deep TMS System | OBP | 2013-01-07 | accept | rtms_mdd | First BrainsWay MDD clearance — pre-OCD era, MDD only |
| 27 | 510k | K083538 | Neuronetics | NeuroStar TMS Therapy System, Model 1.1 | OBP | 2008-12-16 | accept | rtms_mdd | NeuroStar — MDD only |
| 28 | 510k | DEN070003 | Neuronetics | NeuroStar TMS System | OBP | 2008-10-07 | accept | rtms_mdd | First de-novo for NeuroStar — MDD only |
| 29 | 510k | K231378 | Insightec | Exablate Prostate System (Model 2100V1, MRgFUS) | PLP | 2023-10-30 | reject | — | MRgFUS prostate ablation; product code PLP is not neuromodulation |
| 30 | 510k | K212150 | Insightec | Exablate Prostate System | PLP | 2021-11-23 | reject | — | MRgFUS prostate ablation; product code PLP is not neuromodulation |
| 31 | 510k | K071966 | Insightec-Txsonics | 1.5T MRGFUS Pelvic Coil | MOS | 2007-09-05 | reject | — | MRI receive coil for FUS pelvic system; not a stimulator |
| 32 | 510k | K061715 | Insightec Txsonics | MRGFUS General Purpose and Breast Coil | MOS | 2006-07-28 | reject | — | MRI receive coil for FUS breast system; not a stimulator |
| 33 | 510k | K231926 | Neuronetics | NeuroStar Advanced Therapy System (all previously cleared models) | OBP | 2024-03-22 | accept | rtms_mdd | NeuroStar — MDD only |
| 34 | 510k | K233621 | Neuronetics | NeuroStar Advanced Therapy System (Version 3.8) | OBP | 2023-12-13 | accept | rtms_mdd | NeuroStar — MDD only |
| 35 | 510k | K230029 | Neuronetics | NeuroStar Advanced Therapy System (Version 3.7) | OBP | 2023-04-04 | accept | rtms_mdd | NeuroStar — MDD only |
| 36 | 510k | K201158 | Neuronetics | NeuroStar Advanced Therapy | OBP | 2020-11-20 | accept | rtms_mdd | NeuroStar — MDD only |
| 37 | 510k | K171051 | Magstim | HORIZON Therapy System | OBP | 2017-09-13 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 38 | 510k | K162935 | Magstim | Rapid2 Therapy System | OBP | 2017-03-10 | accept | rtms_mdd | Magstim rTMS — MDD only |
| 39 | 510k | K143531 | Magstim | Rapid Therapy System | OBP | 2015-05-08 | accept | rtms_mdd | Magstim rTMS — MDD only |

## Open follow-ups

1. **`rtms_ocd` slug.** NeuroStar's K222230 mentions "anxious depression"
   in the trade-name string; if that clearance carries OCD or
   adjacent-anxiety language in the actual decision summary, we should
   add an `rtms_ocd` indication and remap NeuroStar K222230 / K220127 /
   K213543 / K231926 / K233621 / K230029 / K201158 accordingly. Flagged
   here, not actioned.
2. **Missing modalities.** No PMA records for DBS / VNS / SCS / HNS /
   DRG / RNS are in this corpus. The next FDA ingest should pull those
   product codes (`MHY`, `LYJ`, `LGW`, `MNQ`, etc., already listed in
   `indications_seed.MODALITY_PRODUCT_CODES`).
3. **MRgFUS Neuro brain devices.** With `OYJ` / `QBV` now in the
   product-code filter, the next ingest should pick up Insightec's
   Exablate Neuro 4000 (essential tremor and Parkinson tremor
   indications) and surface them under `mrgfus_essential_tremor`.

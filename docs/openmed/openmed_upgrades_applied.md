# OpenMed Upgrades Applied

## New code

| Path | Purpose |
|---|---|
| `apps/api/app/services/openmed/__init__.py` | Package facade |
| `apps/api/app/services/openmed/schemas.py` | Pydantic schemas (the contract) |
| `apps/api/app/services/openmed/adapter.py` | Backend-dispatch facade |
| `apps/api/app/services/openmed/backends/__init__.py` | Backend exports |
| `apps/api/app/services/openmed/backends/heuristic.py` | Regex fallback backend |
| `apps/api/app/services/openmed/backends/http.py` | HTTP client to OpenMed REST |
| `apps/api/app/routers/clinical_text_router.py` | 4 new endpoints |
| `apps/api/tests/test_openmed_adapter.py` | 9 unit tests |
| `apps/api/tests/test_clinical_text_router.py` | 7 integration tests |

## Modified

| Path | Change |
|---|---|
| `apps/api/app/main.py` | Import + register `clinical_text_router` |
| `apps/api/app/routers/media_router.py` | `clinician_note_text` response now includes `openmed` block |

## New endpoints

| Method | Path | Auth | Rate limit |
|---|---|---|---|
| GET | `/api/v1/clinical-text/health` | clinician | — |
| POST | `/api/v1/clinical-text/analyze` | clinician | 30/min |
| POST | `/api/v1/clinical-text/extract-pii` | clinician | 30/min |
| POST | `/api/v1/clinical-text/deidentify` | clinician | 30/min |

## Backend coverage (heuristic)

| Category | Entries |
|---|---|
| Medication | sertraline, fluoxetine, escitalopram, paroxetine, citalopram, venlafaxine, duloxetine, bupropion, mirtazapine, trazodone, amitriptyline, nortriptyline, lithium, lamotrigine, valproate, carbamazepine, topiramate, gabapentin, pregabalin, clonazepam, lorazepam, diazepam, alprazolam, temazepam, zolpidem, olanzapine, risperidone, quetiapine, aripiprazole, haloperidol, clozapine, methylphenidate, atomoxetine, amphetamine, lisdexamfetamine, propranolol, prazosin, hydroxyzine, buspirone, naltrexone, disulfiram |
| Diagnosis | MDD, GAD, panic, PTSD, OCD, bipolar I/II, schizophrenia, schizoaffective, ADHD, ASD, insomnia, narcolepsy, sleep apnea, AUD, SUD, migraine, epilepsy, stroke, TBI, HTN, T2DM, hyperlipidemia |
| Symptom | anhedonia, hopelessness, suicidal ideation, panic attacks, flashbacks, nightmares, hypervigilance, avoidance, rumination, intrusive thoughts, dissociation, etc. |
| Procedure | rTMS, TMS, tDCS, tACS, ECT, CBT, DBT, EMDR, exposure therapy, qEEG, EEG, MRI, fMRI, PET, polysomnography |
| Lab / scale | TSH, T3, T4, CBC, CMP, HbA1c, vitamin D, B12, folate, cortisol, PHQ-9, GAD-7, MoCA, MMSE, HAM-D, HAM-A, YBOCS |
| PII | email, phone, MRN, SSN, IP, URL, date, person name (with title), address, NHS number |

## Behaviour properties verified by tests

- Returns char-level spans; round-trip exact-match with original text
- Empty input → 422 (Pydantic constraint)
- 200 KB input → handled without crash
- PHI tokens replaced with `[LABEL]` placeholders in deidentified output
- Clinical content preserved through deidentification
- Auth gate enforced on all endpoints (including `/health`)
- Schema IDs versioned for downstream stability

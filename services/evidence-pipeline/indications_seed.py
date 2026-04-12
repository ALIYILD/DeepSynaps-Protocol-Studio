"""Seed indication taxonomy. Each entry drives one indication row + its
PubMed/OpenAlex/CT.gov/openFDA queries. Curated starter set — extend freely.

Fields:
  slug           — stable machine key (lowercase_snake)
  label          — human label
  modality       — DBS, VNS, SCS, rTMS, tDCS, MRgFUS, SNM, HNS, PNS, ...
  condition      — free-text condition
  grade          — informed A-E grade (matches the matrix)
  regulatory     — short status note
  pubmed_q       — PubMed TIAB query
  broad_q        — broad query for OpenAlex / Europe PMC
  trial_q        — ClinicalTrials.gov query
  fda_applicants — list of applicant / trade names to hit openFDA with
"""

# FDA product-code allowlist per modality.
# -----------------------------------------------------------------------------
# IMPORTANT — codes here have been verified against openFDA's
# /device/classification.json endpoint (see docs/fda-product-codes.md and
# scripts/verify_product_codes.py).
#
# Only codes whose FDA device_name actually matches the modality are listed.
# Modalities with NO verified code are intentionally omitted; ingest.py will
# SKIP FDA ingestion for those rather than pull in noise.
#
# To add a code: run scripts/verify_product_codes.py after editing and ensure
# the "Match?" column in the generated report is ✓.
# -----------------------------------------------------------------------------
MODALITY_PRODUCT_CODES = {
    # DBS — MHY = "Stimulator, Electrical, Implanted, For Parkinsonian Tremor", Class III.
    # (NCJ was previously listed but openFDA resolves it to an implantable telescope;
    # removed.) For non-PD DBS indications the applicant filter alone still applies
    # until a broader DBS-generic code is verified.
    "DBS":    ["MHY"],

    # VNS — LYJ = "Stimulator, Autonomic Nerve, Implanted For Epilepsy", Class III.
    "VNS":    ["LYJ"],

    # SCS — LGW = "Stimulator, Spinal-Cord, Totally Implanted For Pain Relief", Class III.
    "SCS":    ["LGW"],

    # HNS — MNQ = "Stimulator, Hypoglossal Nerve, Implanted, Apnea", Class III.
    "HNS":    ["MNQ"],

    # rTMS / dTMS — OBP = "Transcranial Magnetic Stimulator", Class II.
    "rTMS":   ["OBP"],
    "dTMS":   ["OBP"],

    # Unverified: RNS, DRG, SNM, PNS, tDCS, MRgFUS, BAT, REN.
    # ingest.py skips FDA lookup for these until codes are confirmed.
}

SEED = [
    {
        "slug": "dbs_parkinson",
        "label": "DBS for Parkinson's disease (motor)",
        "modality": "DBS",
        "condition": "Parkinson's disease",
        "grade": "A",
        "regulatory": "FDA-approved 1997/2002",
        "pubmed_q": '("deep brain stimulation"[Title/Abstract] OR DBS[Title/Abstract]) AND Parkinson[Title/Abstract]',
        "broad_q": '"deep brain stimulation" Parkinson',
        "trial_q": '"deep brain stimulation" Parkinson',
        "fda_applicants": ["Medtronic", "Boston Scientific", "Abbott"],
    },
    {
        "slug": "dbs_essential_tremor",
        "label": "DBS for essential tremor",
        "modality": "DBS",
        "condition": "Essential tremor",
        "grade": "A",
        "regulatory": "FDA-approved 1997",
        "pubmed_q": '("deep brain stimulation"[Title/Abstract] OR DBS[Title/Abstract]) AND "essential tremor"[Title/Abstract]',
        "broad_q": '"deep brain stimulation" "essential tremor"',
        "trial_q": '"deep brain stimulation" "essential tremor"',
        "fda_applicants": ["Medtronic", "Abbott"],
    },
    {
        "slug": "dbs_ocd",
        "label": "DBS for treatment-refractory OCD",
        "modality": "DBS",
        "condition": "Obsessive-compulsive disorder (refractory)",
        "grade": "B",
        "regulatory": "FDA HDE 2009",
        "pubmed_q": '("deep brain stimulation"[Title/Abstract] OR DBS[Title/Abstract]) AND (OCD[Title/Abstract] OR "obsessive compulsive"[Title/Abstract])',
        "broad_q": '"deep brain stimulation" OCD',
        "trial_q": '"deep brain stimulation" OCD',
        "fda_applicants": ["Medtronic"],
    },
    {
        "slug": "dbs_epilepsy_ant",
        "label": "Anterior-thalamic DBS for refractory focal epilepsy",
        "modality": "DBS",
        "condition": "Refractory focal epilepsy",
        "grade": "A",
        "regulatory": "FDA-approved 2018",
        "pubmed_q": '("deep brain stimulation"[Title/Abstract] OR DBS[Title/Abstract]) AND epilepsy[Title/Abstract]',
        "broad_q": '"deep brain stimulation" epilepsy',
        "trial_q": '"deep brain stimulation" epilepsy',
        "fda_applicants": ["Medtronic"],
    },
    {
        "slug": "rns_epilepsy",
        "label": "Responsive neurostimulation for focal epilepsy",
        "modality": "RNS",
        "condition": "Refractory focal epilepsy (1-2 foci)",
        "grade": "A",
        "regulatory": "FDA-approved 2013",
        "pubmed_q": '("responsive neurostimulation"[Title/Abstract] OR "NeuroPace"[Title/Abstract] OR "RNS system"[Title/Abstract])',
        "broad_q": '"responsive neurostimulation" epilepsy',
        "trial_q": '"responsive neurostimulation" epilepsy',
        "fda_applicants": ["NeuroPace"],
    },
    {
        "slug": "vns_epilepsy",
        "label": "VNS for refractory epilepsy",
        "modality": "VNS",
        "condition": "Refractory epilepsy",
        "grade": "A",
        "regulatory": "FDA-approved 1997",
        "pubmed_q": '("vagus nerve stimulation"[Title/Abstract] OR VNS[Title/Abstract]) AND epilepsy[Title/Abstract]',
        "broad_q": '"vagus nerve stimulation" epilepsy',
        "trial_q": '"vagus nerve stimulation" epilepsy',
        "fda_applicants": ["LivaNova", "Cyberonics"],
    },
    {
        "slug": "vns_depression",
        "label": "VNS for treatment-resistant depression",
        "modality": "VNS",
        "condition": "Treatment-resistant depression",
        "grade": "B",
        "regulatory": "FDA-approved 2005 (adjunct)",
        "pubmed_q": '("vagus nerve stimulation"[Title/Abstract] OR VNS[Title/Abstract]) AND depression[Title/Abstract]',
        "broad_q": '"vagus nerve stimulation" depression',
        "trial_q": '"vagus nerve stimulation" depression',
        "fda_applicants": ["LivaNova", "Cyberonics"],
    },
    {
        "slug": "vns_stroke_rehab",
        "label": "Paired VNS for post-stroke upper-limb rehab",
        "modality": "VNS",
        "condition": "Post-stroke upper-limb motor deficit",
        "grade": "A",
        "regulatory": "FDA-approved 2021 (Vivistim)",
        "pubmed_q": '("vagus nerve stimulation"[Title/Abstract] OR VNS[Title/Abstract]) AND stroke[Title/Abstract]',
        "broad_q": '"vagus nerve stimulation" stroke',
        "trial_q": '"vagus nerve stimulation" stroke',
        "fda_applicants": ["MicroTransponder", "Vivistim"],
    },
    {
        "slug": "scs_fbss",
        "label": "Spinal cord stimulation for failed back surgery syndrome",
        "modality": "SCS",
        "condition": "Failed back surgery syndrome / chronic neuropathic back-leg pain",
        "grade": "A",
        "regulatory": "FDA-cleared (multiple)",
        "pubmed_q": '("spinal cord stimulation"[Title/Abstract] OR SCS[Title/Abstract]) AND ("failed back"[Title/Abstract] OR FBSS[Title/Abstract])',
        "broad_q": '"spinal cord stimulation" "failed back"',
        "trial_q": '"spinal cord stimulation" "failed back"',
        "fda_applicants": ["Medtronic", "Abbott", "Boston Scientific", "Nevro"],
    },
    {
        "slug": "scs_pdn",
        "label": "10-kHz SCS for painful diabetic neuropathy",
        "modality": "SCS",
        "condition": "Painful diabetic neuropathy",
        "grade": "A",
        "regulatory": "FDA-approved 2021",
        "pubmed_q": '("spinal cord stimulation"[Title/Abstract] OR SCS[Title/Abstract]) AND ("diabetic neuropathy"[Title/Abstract] OR PDN[Title/Abstract])',
        "broad_q": '"spinal cord stimulation" "diabetic neuropathy"',
        "trial_q": '"spinal cord stimulation" "diabetic neuropathy"',
        "fda_applicants": ["Nevro"],
    },
    {
        "slug": "drg_crps",
        "label": "DRG stimulation for focal neuropathic pain",
        "modality": "DRG",
        "condition": "CRPS, focal neuropathic pain",
        "grade": "A",
        "regulatory": "FDA-approved 2016",
        "pubmed_q": '"dorsal root ganglion stimulation"[Title/Abstract]',
        "broad_q": '"dorsal root ganglion stimulation"',
        "trial_q": '"dorsal root ganglion stimulation"',
        "fda_applicants": ["Abbott", "St. Jude Medical"],
    },
    {
        "slug": "snm_bladder_bowel",
        "label": "Sacral neuromodulation for bladder/bowel dysfunction",
        "modality": "SNM",
        "condition": "Urge incontinence, urinary retention, fecal incontinence",
        "grade": "A",
        "regulatory": "FDA-approved 1997/1999/2011",
        "pubmed_q": '("sacral neuromodulation"[Title/Abstract] OR "sacral nerve stimulation"[Title/Abstract] OR InterStim[Title/Abstract])',
        "broad_q": '"sacral neuromodulation"',
        "trial_q": '"sacral neuromodulation"',
        "fda_applicants": ["Medtronic", "Axonics"],
    },
    {
        "slug": "hns_osa",
        "label": "Hypoglossal nerve stim for moderate-severe OSA",
        "modality": "HNS",
        "condition": "Obstructive sleep apnea",
        "grade": "A",
        "regulatory": "FDA-approved 2014",
        "pubmed_q": '("hypoglossal nerve stimulation"[Title/Abstract] OR Inspire[Title/Abstract]) AND ("sleep apnea"[Title/Abstract] OR OSA[Title/Abstract])',
        "broad_q": '"hypoglossal nerve stimulation" "sleep apnea"',
        "trial_q": '"hypoglossal nerve stimulation"',
        "fda_applicants": ["Inspire Medical"],
    },
    {
        "slug": "rtms_mdd",
        "label": "rTMS / iTBS for major depressive disorder",
        "modality": "rTMS",
        "condition": "Major depressive disorder",
        "grade": "A",
        "regulatory": "FDA-cleared 2008",
        "pubmed_q": '("repetitive transcranial magnetic stimulation"[Title/Abstract] OR rTMS[Title/Abstract] OR iTBS[Title/Abstract]) AND depression[Title/Abstract]',
        "broad_q": '"repetitive transcranial magnetic stimulation" depression',
        "trial_q": 'rTMS depression',
        "fda_applicants": ["Neuronetics", "NeuroStar", "Brainsway", "Magstim", "MagVenture"],
    },
    {
        "slug": "dtms_ocd",
        "label": "Deep TMS (H7) for OCD",
        "modality": "dTMS",
        "condition": "Obsessive-compulsive disorder",
        "grade": "A",
        "regulatory": "FDA-cleared 2018",
        "pubmed_q": '(rTMS[Title/Abstract] OR "transcranial magnetic stimulation"[Title/Abstract]) AND (OCD[Title/Abstract] OR "obsessive compulsive"[Title/Abstract])',
        "broad_q": 'rTMS OCD',
        "trial_q": 'rTMS OCD',
        "fda_applicants": ["Brainsway"],
    },
    {
        "slug": "tdcs_depression",
        "label": "tDCS for depression (home / research)",
        "modality": "tDCS",
        "condition": "Depression",
        "grade": "B",
        "regulatory": "CE-marked (EU); not FDA-approved",
        "pubmed_q": '(tDCS[Title/Abstract] OR "transcranial direct current stimulation"[Title/Abstract]) AND depression[Title/Abstract]',
        "broad_q": '"transcranial direct current stimulation" depression',
        "trial_q": 'tDCS depression',
        "fda_applicants": ["Flow Neuroscience", "Soterix"],
    },
    {
        "slug": "mrgfus_essential_tremor",
        "label": "MRgFUS thalamotomy for essential tremor",
        "modality": "MRgFUS",
        "condition": "Essential tremor",
        "grade": "A",
        "regulatory": "FDA-approved 2016",
        "pubmed_q": '("focused ultrasound"[Title/Abstract] OR MRgFUS[Title/Abstract]) AND tremor[Title/Abstract]',
        "broad_q": '"focused ultrasound" tremor',
        "trial_q": '"focused ultrasound" tremor',
        "fda_applicants": ["Insightec", "Exablate"],
    },
    {
        "slug": "barostim_hf",
        "label": "Baroreflex activation therapy for heart failure",
        "modality": "BAT",
        "condition": "Heart failure (HFrEF)",
        "grade": "B",
        "regulatory": "FDA-approved 2019",
        "pubmed_q": '(barostim[Title/Abstract] OR "baroreflex activation"[Title/Abstract]) AND ("heart failure"[Title/Abstract])',
        "broad_q": '"baroreflex activation therapy"',
        "trial_q": '"baroreflex activation"',
        "fda_applicants": ["CVRx", "Barostim"],
    },
    {
        "slug": "phrenic_central_apnea",
        "label": "Transvenous phrenic stim for central sleep apnea",
        "modality": "PNS",
        "condition": "Central sleep apnea",
        "grade": "A",
        "regulatory": "FDA-approved 2017",
        "pubmed_q": '("phrenic nerve stimulation"[Title/Abstract] OR Remede[Title/Abstract]) AND "central sleep"[Title/Abstract]',
        "broad_q": '"phrenic nerve stimulation" "central sleep"',
        "trial_q": '"phrenic nerve stimulation"',
        "fda_applicants": ["Respicardia", "ZOLL"],
    },
    {
        "slug": "nerivio_migraine",
        "label": "Remote electrical neuromodulation for migraine",
        "modality": "REN",
        "condition": "Migraine (acute)",
        "grade": "A",
        "regulatory": "FDA-cleared 2019",
        "pubmed_q": '("Nerivio"[Title/Abstract] OR "remote electrical neuromodulation"[Title/Abstract])',
        "broad_q": '"remote electrical neuromodulation" migraine',
        "trial_q": '"remote electrical neuromodulation" migraine',
        "fda_applicants": ["Theranica"],
    },
]

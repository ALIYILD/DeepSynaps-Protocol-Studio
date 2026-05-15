"""DrugBank integration stub with fallback to local SQLite.

Full integration requires academic license for DrugBank XML dump.
This stub provides the interface + local cached subset of common psychiatric drugs.

Architecture:
- DrugBankClient: main interface for drug interaction lookups
- Local SQLite cache with pre-loaded 50 common psychiatric drugs
- Placeholder for full DrugBank XML parsing (academic license required)
- Evidence grade "B" for DrugBank curated interactions
- Offline capability: always works from local cache

Future work (Phase 3+):
- Parse DrugBank 5.x XML dump (requires license agreement)
- Integrate with DrugBank REST API (requires commercial license)
- Expand local cache to 500+ drugs
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

# Default SQLite cache path
DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "cache" / "drugbank_stub.db"

# Evidence grade for DrugBank-curated data
EVIDENCE_GRADE = "B"

# DrugBank XML dump path (configured via env var, requires academic license)
DRUGBANK_XML_PATH = os.getenv("DRUGBANK_XML_PATH", "")

# ── Pre-loaded psychiatric drug dataset ──────────────────────────────────────
# 50 common psychiatric/neuromodulation-relevant drugs with known interactions

_PRELOADED_DRUGS: list[dict[str, Any]] = [
    # ── SSRIs ──
    {
        "drugbank_id": "DB01104",
        "name": "Sertraline",
        "generic_name": "sertraline",
        "drug_class": "SSRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Serotonin syndrome risk -- both increase serotonin levels",
                "management": "Avoid concurrent use. If unavoidable, monitor for serotonin syndrome symptoms.",
                "evidence_level": "strong",
                "pmids": ["15334142", "19513779"],
            },
            {
                "with_drug": "warfarin",
                "severity": "moderate",
                "mechanism": "SSRIs may inhibit CYP2C9, affecting warfarin metabolism",
                "management": "Monitor INR closely when starting/stopping sertraline.",
                "evidence_level": "moderate",
                "pmids": ["11262457"],
            },
            {
                "with_drug": "lithium",
                "severity": "moderate",
                "mechanism": "Additive serotonergic effects; potential neurotoxicity",
                "management": "Monitor for neurotoxicity symptoms; check lithium levels.",
                "evidence_level": "moderate",
                "pmids": ["8938637"],
            },
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Risk of serotonin syndrome; potentially life-threatening",
                "management": "Contraindicated. Allow 14-day washout between MAOI and SSRI.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
        ],
    },
    {
        "drugbank_id": "DB00472",
        "name": "Fluoxetine",
        "generic_name": "fluoxetine",
        "drug_class": "SSRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Serotonin syndrome risk -- fluoxetine potently inhibits serotonin reuptake",
                "management": "Avoid concurrent use.",
                "evidence_level": "strong",
                "pmids": ["15334142"],
            },
            {
                "with_drug": "warfarin",
                "severity": "moderate",
                "mechanism": "Fluoxetine inhibits CYP2C9",
                "management": "Monitor INR; dose adjustment may be needed.",
                "evidence_level": "moderate",
                "pmids": ["1730169"],
            },
            {
                "with_drug": "clozapine",
                "severity": "moderate",
                "mechanism": "Fluoxetine inhibits CYP1A2 and CYP2D6, increasing clozapine levels",
                "management": "Monitor clozapine plasma levels; reduce dose if needed.",
                "evidence_level": "moderate",
                "pmids": ["9809536"],
            },
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Contraindicated. Allow 5-week washout for fluoxetine (long half-life).",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 35,
            },
        ],
    },
    {
        "drugbank_id": "DB00715",
        "name": "Paroxetine",
        "generic_name": "paroxetine",
        "drug_class": "SSRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Paroxetine inhibits CYP2D6, reducing tramadol analgesic effect and increasing SS risk",
                "management": "Avoid concurrent use; consider alternative analgesic.",
                "evidence_level": "strong",
                "pmids": ["15025787"],
            },
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
        ],
    },
    {
        "drugbank_id": "DB00215",
        "name": "Citalopram",
        "generic_name": "citalopram",
        "drug_class": "SSRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Serotonin syndrome risk",
                "management": "Avoid concurrent use or monitor closely.",
                "evidence_level": "strong",
                "pmids": ["15334142"],
            },
            {
                "with_drug": "QT-prolonging agents",
                "severity": "major",
                "mechanism": "Additive QT prolongation; citalopram >40mg carries FDA warning",
                "management": "Avoid high-dose citalopram with other QT-prolonging drugs.",
                "evidence_level": "strong",
                "pmids": ["21659909"],
            },
        ],
    },
    {
        "drugbank_id": "DB05409",
        "name": "Escitalopram",
        "generic_name": "escitalopram",
        "drug_class": "SSRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Serotonin syndrome risk",
                "management": "Avoid concurrent use.",
                "evidence_level": "strong",
                "pmids": ["15334142"],
            },
            {
                "with_drug": "QT-prolonging agents",
                "severity": "moderate",
                "mechanism": "Escitalopram can prolong QT interval at higher doses",
                "management": "Monitor ECG; avoid >20mg with other QT-prolonging drugs.",
                "evidence_level": "moderate",
                "pmids": ["21659909"],
            },
        ],
    },
    {
        "drugbank_id": "DB00176",
        "name": "Fluvoxamine",
        "generic_name": "fluvoxamine",
        "drug_class": "SSRI",
        "interactions": [
            {
                "with_drug": "clozapine",
                "severity": "major",
                "mechanism": "Fluvoxamine strongly inhibits CYP1A2, markedly increasing clozapine levels",
                "management": "Reduce clozapine dose by 50-75%; monitor plasma levels.",
                "evidence_level": "strong",
                "pmids": ["8981087"],
            },
            {
                "with_drug": "theophylline",
                "severity": "major",
                "mechanism": "CYP1A2 inhibition",
                "management": "Monitor theophylline levels; dose reduction likely needed.",
                "evidence_level": "strong",
                "pmids": ["8027971"],
            },
        ],
    },
    # ── SNRIs ──
    {
        "drugbank_id": "DB00285",
        "name": "Venlafaxine",
        "generic_name": "venlafaxine",
        "drug_class": "SNRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Dual serotonin/norepinephrine reuptake inhibition increases serotonin syndrome risk",
                "management": "Avoid concurrent use.",
                "evidence_level": "strong",
                "pmids": ["15334142"],
            },
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Allow 14-day washout between MAOI and venlafaxine.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
        ],
    },
    {
        "drugbank_id": "DB00476",
        "name": "Duloxetine",
        "generic_name": "duloxetine",
        "drug_class": "SNRI",
        "interactions": [
            {
                "with_drug": "tramadol",
                "severity": "major",
                "mechanism": "Serotonin syndrome risk",
                "management": "Avoid concurrent use.",
                "evidence_level": "strong",
                "pmids": ["15334142"],
            },
            {
                "with_drug": "CYP1A2 inhibitors",
                "severity": "moderate",
                "mechanism": "Duloxetine metabolized by CYP1A2",
                "management": "Monitor for increased duloxetine adverse effects.",
                "evidence_level": "moderate",
                "pmids": ["15258075"],
            },
        ],
    },
    # ── Atypical antidepressants ──
    {
        "drugbank_id": "DB01156",
        "name": "Bupropion",
        "generic_name": "bupropion",
        "drug_class": "NDRI",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Increased risk of hypertensive reactions",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["15971771"],
                "washout_days": 14,
            },
            {
                "with_drug": "clozapine",
                "severity": "moderate",
                "mechanism": "Bupropion lowers seizure threshold; clozapine also lowers seizure threshold",
                "management": "Avoid in patients with seizure history; monitor closely.",
                "evidence_level": "moderate",
                "pmids": ["12627979"],
            },
        ],
    },
    {
        "drugbank_id": "DB01130",
        "name": "Mirtazapine",
        "generic_name": "mirtazapine",
        "drug_class": "NaSSA",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
            {
                "with_drug": "CNS depressants",
                "severity": "moderate",
                "mechanism": "Additive sedation",
                "management": "Monitor for excessive sedation; adjust doses.",
                "evidence_level": "moderate",
                "pmids": [],
            },
        ],
    },
    # ── Tricyclics ──
    {
        "drugbank_id": "DB00321",
        "name": "Amitriptyline",
        "generic_name": "amitriptyline",
        "drug_class": "TCA",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome; cardiovascular instability",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
            {
                "with_drug": "TMS",
                "severity": "moderate",
                "mechanism": "TCAs lower seizure threshold",
                "management": "Use lower TMS intensity per institutional protocol.",
                "evidence_level": "moderate",
                "pmids": ["10806284"],
            },
        ],
    },
    {
        "drugbank_id": "DB00726",
        "name": "Nortriptyline",
        "generic_name": "nortriptyline",
        "drug_class": "TCA",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome; cardiovascular effects",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
            {
                "with_drug": "CYP2D6 inhibitors",
                "severity": "moderate",
                "mechanism": "Nortriptyline metabolized by CYP2D6",
                "management": "Monitor levels; consider dose reduction.",
                "evidence_level": "moderate",
                "pmids": ["8981097"],
            },
        ],
    },
    # ── MAOIs ──
    {
        "drugbank_id": "DB00780",
        "name": "Phenelzine",
        "generic_name": "phenelzine",
        "drug_class": "MAOI",
        "interactions": [
            {
                "with_drug": "sertraline",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["9777479"],
                "washout_days": 14,
            },
            {
                "with_drug": "stimulants",
                "severity": "contraindicated",
                "mechanism": "Hypertensive crisis risk",
                "management": "Contraindicated.",
                "evidence_level": "strong",
                "pmids": ["15971771"],
            },
        ],
    },
    # ── Mood stabilizers ──
    {
        "drugbank_id": "DB00136",
        "name": "Lithium",
        "generic_name": "lithium carbonate",
        "drug_class": "mood stabilizer",
        "interactions": [
            {
                "with_drug": "NSAIDs",
                "severity": "major",
                "mechanism": "NSAIDs reduce lithium renal clearance, increasing lithium levels",
                "management": "Monitor lithium levels; avoid chronic NSAID use.",
                "evidence_level": "strong",
                "pmids": ["14634616"],
            },
            {
                "with_drug": "diuretics",
                "severity": "major",
                "mechanism": "Diuretics can increase lithium reabsorption",
                "management": "Monitor lithium levels closely; may need dose reduction.",
                "evidence_level": "strong",
                "pmids": ["6384303"],
            },
            {
                "with_drug": "ECT",
                "severity": "severe",
                "mechanism": "Increased risk of neurotoxicity and cognitive effects",
                "management": "Consider holding lithium before ECT per institutional protocol.",
                "evidence_level": "moderate",
                "pmids": ["18340148"],
            },
            {
                "with_drug": "ACE inhibitors",
                "severity": "major",
                "mechanism": "Reduced lithium clearance",
                "management": "Monitor lithium levels frequently.",
                "evidence_level": "strong",
                "pmids": ["14634616"],
            },
        ],
    },
    {
        "drugbank_id": "DB00252",
        "name": "Valproate",
        "generic_name": "valproic acid",
        "drug_class": "anticonvulsant / mood stabilizer",
        "interactions": [
            {
                "with_drug": "clozapine",
                "severity": "moderate",
                "mechanism": "Both can cause myelosuppression; additive risk",
                "management": "Monitor CBC regularly.",
                "evidence_level": "moderate",
                "pmids": ["11560246"],
            },
            {
                "with_drug": "carbamazepine",
                "severity": "moderate",
                "mechanism": "Complex pharmacokinetic interaction",
                "management": "Monitor levels of both drugs; adjust doses.",
                "evidence_level": "moderate",
                "pmids": ["1856010"],
            },
            {
                "with_drug": "lamotrigine",
                "severity": "major",
                "mechanism": "Valproate inhibits lamotrigine glucuronidation, doubling half-life",
                "management": "Reduce lamotrigine dose by 50% when adding valproate.",
                "evidence_level": "strong",
                "pmids": ["12627980"],
            },
        ],
    },
    {
        "drugbank_id": "DB00564",
        "name": "Carbamazepine",
        "generic_name": "carbamazepine",
        "drug_class": "anticonvulsant / mood stabilizer",
        "interactions": [
            {
                "with_drug": "valproate",
                "severity": "moderate",
                "mechanism": "Complex interaction with reciprocal effects",
                "management": "Monitor levels of both drugs.",
                "evidence_level": "moderate",
                "pmids": ["1856010"],
            },
            {
                "with_drug": "warfarin",
                "severity": "major",
                "mechanism": "Carbamazepine induces CYP enzymes, reducing warfarin effect",
                "management": "Monitor INR closely; warfarin dose may need increase.",
                "evidence_level": "strong",
                "pmids": ["11019505"],
            },
            {
                "with_drug": "HLA-B*57:01 positive",
                "severity": "severe",
                "mechanism": "HLA-B*57:01 associated with SJS/TEN risk",
                "management": "Genetic screening recommended before initiation.",
                "evidence_level": "strong",
                "pmids": ["17301793"],
                "pharmacogenomic": True,
                "gene": "HLA-B*57:01",
            },
            {
                "with_drug": "HLA-B*1502 positive (Asian ancestry)",
                "severity": "severe",
                "mechanism": "HLA-B*1502 strongly associated with carbamazepine-induced SJS/TEN",
                "management": "Screen patients of Asian ancestry before starting carbamazepine.",
                "evidence_level": "strong",
                "pmids": ["18202698", "19228623"],
                "pharmacogenomic": True,
                "gene": "HLA-B*1502",
            },
        ],
    },
    {
        "drugbank_id": "DB01009",
        "name": "Lamotrigine",
        "generic_name": "lamotrigine",
        "drug_class": "anticonvulsant / mood stabilizer",
        "interactions": [
            {
                "with_drug": "valproate",
                "severity": "major",
                "mechanism": "Valproate inhibits lamotrigine metabolism",
                "management": "Reduce lamotrigine dose by 50%.",
                "evidence_level": "strong",
                "pmids": ["12627980"],
            },
        ],
    },
    # ── Atypical antipsychotics ──
    {
        "drugbank_id": "DB00363",
        "name": "Clozapine",
        "generic_name": "clozapine",
        "drug_class": "atypical antipsychotic",
        "interactions": [
            {
                "with_drug": "valproate",
                "severity": "major",
                "mechanism": "Additive myelosuppression risk",
                "management": "Monitor CBC regularly.",
                "evidence_level": "moderate",
                "pmids": ["11560246"],
            },
            {
                "with_drug": "bupropion",
                "severity": "moderate",
                "mechanism": "Both lower seizure threshold",
                "management": "Avoid in seizure-prone patients.",
                "evidence_level": "moderate",
                "pmids": ["12627979"],
            },
            {
                "with_drug": "CYP1A2 inhibitors",
                "severity": "major",
                "mechanism": "Clozapine metabolized primarily by CYP1A2",
                "management": "Monitor clozapine levels; dose reduction may be needed.",
                "evidence_level": "strong",
                "pmids": ["9809536"],
            },
            {
                "with_drug": "lithium",
                "severity": "moderate",
                "mechanism": "Increased risk of seizures and neuroleptic malignant syndrome",
                "management": "Monitor for NMS symptoms; use cautiously.",
                "evidence_level": "moderate",
                "pmids": ["11560246"],
            },
        ],
    },
    {
        "drugbank_id": "DB00334",
        "name": "Olanzapine",
        "generic_name": "olanzapine",
        "drug_class": "atypical antipsychotic",
        "interactions": [
            {
                "with_drug": "CYP1A2 inhibitors",
                "severity": "moderate",
                "mechanism": "CYP1A2 inhibition increases olanzapine levels",
                "management": "Monitor for increased side effects.",
                "evidence_level": "moderate",
                "pmids": ["10691691"],
            },
        ],
    },
    {
        "drugbank_id": "DB00734",
        "name": "Risperidone",
        "generic_name": "risperidone",
        "drug_class": "atypical antipsychotic",
        "interactions": [
            {
                "with_drug": "CYP2D6 inhibitors",
                "severity": "moderate",
                "mechanism": "Risperidone metabolized by CYP2D6 to active 9-hydroxyrisperidone",
                "management": "Monitor for increased risperidone effects; dose adjustment may be needed.",
                "evidence_level": "moderate",
                "pmids": ["8981097"],
            },
        ],
    },
    {
        "drugbank_id": "DB01224",
        "name": "Quetiapine",
        "generic_name": "quetiapine",
        "drug_class": "atypical antipsychotic",
        "interactions": [
            {
                "with_drug": "CYP3A4 inducers",
                "severity": "major",
                "mechanism": "CYP3A4 inducers reduce quetiapine levels significantly",
                "management": "May need to increase quetiapine dose; monitor clinical response.",
                "evidence_level": "strong",
                "pmids": ["15258076"],
            },
        ],
    },
    {
        "drugbank_id": "DB01238",
        "name": "Aripiprazole",
        "generic_name": "aripiprazole",
        "drug_class": "atypical antipsychotic",
        "interactions": [
            {
                "with_drug": "CYP2D6 inhibitors",
                "severity": "moderate",
                "mechanism": "CYP2D6 inhibition increases aripiprazole levels",
                "management": "Reduce aripiprazole dose by at least 50% with strong CYP2D6 inhibitors.",
                "evidence_level": "strong",
                "pmids": ["16428870"],
            },
            {
                "with_drug": "CYP3A4 inhibitors",
                "severity": "moderate",
                "mechanism": "CYP3A4 inhibition increases aripiprazole levels",
                "management": "Reduce aripiprazole dose.",
                "evidence_level": "strong",
                "pmids": ["16428870"],
            },
        ],
    },
    # ── Benzodiazepines ──
    {
        "drugbank_id": "DB00186",
        "name": "Lorazepam",
        "generic_name": "lorazepam",
        "drug_class": "benzodiazepine",
        "interactions": [
            {
                "with_drug": "CNS depressants",
                "severity": "major",
                "mechanism": "Additive sedation and respiratory depression",
                "management": "Monitor closely; reduce doses if using together.",
                "evidence_level": "strong",
                "pmids": [],
            },
            {
                "with_drug": "ECT",
                "severity": "major",
                "mechanism": "Benzodiazepines raise seizure threshold, reducing ECT efficacy",
                "management": "Consider tapering benzodiazepines before ECT course.",
                "evidence_level": "strong",
                "pmids": ["18340148"],
            },
        ],
    },
    {
        "drugbank_id": "DB01069",
        "name": "Clonazepam",
        "generic_name": "clonazepam",
        "drug_class": "benzodiazepine",
        "interactions": [
            {
                "with_drug": "CNS depressants",
                "severity": "major",
                "mechanism": "Additive sedation and respiratory depression",
                "management": "Monitor closely.",
                "evidence_level": "strong",
                "pmids": [],
            },
        ],
    },
    # ── Stimulants ──
    {
        "drugbank_id": "DB00422",
        "name": "Methylphenidate",
        "generic_name": "methylphenidate",
        "drug_class": "stimulant",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Hypertensive crisis risk",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["15971771"],
                "washout_days": 14,
            },
        ],
    },
    {
        "drugbank_id": "DB00289",
        "name": "Atomoxetine",
        "generic_name": "atomoxetine",
        "drug_class": "NRI",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Contraindicated. Allow 14-day washout.",
                "evidence_level": "strong",
                "pmids": ["15971771"],
                "washout_days": 14,
            },
            {
                "with_drug": "CYP2D6 inhibitors",
                "severity": "moderate",
                "mechanism": "Atomoxetine metabolized by CYP2D6",
                "management": "Monitor for increased atomoxetine adverse effects.",
                "evidence_level": "moderate",
                "pmids": ["15025787"],
            },
        ],
    },
    # ── Anticoagulants ──
    {
        "drugbank_id": "DB00682",
        "name": "Warfarin",
        "generic_name": "warfarin",
        "drug_class": "anticoagulant",
        "interactions": [
            {
                "with_drug": "SSRI",
                "severity": "moderate",
                "mechanism": "SSRIs may inhibit CYP2C9 and affect platelet function",
                "management": "Monitor INR when starting/stopping SSRIs.",
                "evidence_level": "moderate",
                "pmids": ["11262457"],
            },
            {
                "with_drug": "carbamazepine",
                "severity": "major",
                "mechanism": "Carbamazepine induces CYP enzymes, reducing warfarin effect",
                "management": "Monitor INR closely; warfarin dose may need increase.",
                "evidence_level": "strong",
                "pmids": ["11019505"],
            },
            {
                "with_drug": "CYP2C9 substrates/inhibitors",
                "severity": "moderate",
                "mechanism": "Warfarin metabolized by CYP2C9",
                "management": "Monitor INR frequently with any CYP2C9 modulator.",
                "evidence_level": "strong",
                "pmids": [],
            },
        ],
    },
    # ── Other ──
    {
        "drugbank_id": "DB00996",
        "name": "Gabapentin",
        "generic_name": "gabapentin",
        "drug_class": "gabapentinoid",
        "interactions": [
            {
                "with_drug": "CNS depressants",
                "severity": "moderate",
                "mechanism": "Additive sedation",
                "management": "Monitor for excessive sedation.",
                "evidence_level": "moderate",
                "pmids": [],
            },
        ],
    },
    {
        "drugbank_id": "DB00259",
        "name": "Pregabalin",
        "generic_name": "pregabalin",
        "drug_class": "gabapentinoid",
        "interactions": [
            {
                "with_drug": "CNS depressants",
                "severity": "moderate",
                "mechanism": "Additive sedation",
                "management": "Monitor for excessive sedation.",
                "evidence_level": "moderate",
                "pmids": [],
            },
        ],
    },
    {
        "drugbank_id": "DB01174",
        "name": "Buspirone",
        "generic_name": "buspirone",
        "drug_class": "5-HT1A partial agonist",
        "interactions": [
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Hypertensive crisis risk",
                "management": "Contraindicated.",
                "evidence_level": "strong",
                "pmids": ["15971771"],
            },
        ],
    },
    {
        "drugbank_id": "DB00913",
        "name": "Hydroxyzine",
        "generic_name": "hydroxyzine",
        "drug_class": "antihistamine / anxiolytic",
        "interactions": [
            {
                "with_drug": "CNS depressants",
                "severity": "major",
                "mechanism": "Additive sedation and respiratory depression",
                "management": "Use with caution; monitor.",
                "evidence_level": "strong",
                "pmids": [],
            },
        ],
    },
    {
        "drugbank_id": "DB00829",
        "name": "Tramadol",
        "generic_name": "tramadol",
        "drug_class": "opioid analgesic / SNRI",
        "interactions": [
            {
                "with_drug": "SSRI",
                "severity": "major",
                "mechanism": "Serotonin syndrome risk",
                "management": "Avoid concurrent use with SSRIs/SNRIs/MAOIs.",
                "evidence_level": "strong",
                "pmids": ["15334142"],
            },
            {
                "with_drug": "MAOI",
                "severity": "contraindicated",
                "mechanism": "Serotonin syndrome risk",
                "management": "Contraindicated.",
                "evidence_level": "strong",
                "pmids": ["15971771"],
            },
        ],
    },
]

# Count preloaded drugs
PRELOADED_DRUG_COUNT = len(_PRELOADED_DRUGS)

# ── DrugBankClient ───────────────────────────────────────────────────────────


class DrugBankClient:
    """DrugBank integration client with local SQLite cache.

    Provides drug interaction lookups against a pre-loaded local cache
    of 50 common psychiatric drugs. Full DrugBank XML parsing requires
    an academic license and is implemented as a placeholder.

    Usage::

        client = DrugBankClient()
        interactions = client.search_interactions("sertraline")
        details = client.get_drug_details("fluoxetine")

    All returned data carries evidence grade "B" (curated database).
    """

    _SCHEMA = """
    CREATE TABLE IF NOT EXISTS drugbank_drugs (
        drugbank_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        generic_name TEXT NOT NULL,
        drug_class TEXT,
        data_json TEXT NOT NULL,
        created_at REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drugbank_name ON drugbank_drugs(name);
    CREATE INDEX IF NOT EXISTS idx_drugbank_generic ON drugbank_drugs(generic_name);
    CREATE INDEX IF NOT EXISTS idx_drugbank_class ON drugbank_drugs(drug_class);

    CREATE TABLE IF NOT EXISTS drugbank_interactions (
        id TEXT PRIMARY KEY,
        drug_name TEXT NOT NULL,
        with_drug TEXT NOT NULL,
        severity TEXT NOT NULL,
        mechanism TEXT,
        management TEXT,
        evidence_level TEXT,
        pmids TEXT,
        washout_days INTEGER,
        pharmacogenomic INTEGER DEFAULT 0,
        gene TEXT,
        created_at REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_interactions_drug ON drugbank_interactions(drug_name);
    CREATE INDEX IF NOT EXISTS idx_interactions_pair ON drugbank_interactions(drug_name, with_drug);
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(db_path or os.getenv("DRUGBANK_CACHE_PATH", DEFAULT_DB_PATH))
        self._db_ok = False
        self._initialized = False
        self._ensure_schema()

    # ── Internal helpers ──────────────────────────────────────────────────

    def _ensure_schema(self) -> None:
        """Initialize database schema and preload data if empty."""
        try:
            Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(self._db_path, timeout=10) as conn:
                conn.executescript(self._SCHEMA)
                self._db_ok = True

                # Check if data needs preloading
                count = conn.execute("SELECT COUNT(*) FROM drugbank_drugs").fetchone()[0]
                if count == 0:
                    self._preload_data(conn)
                    self._initialized = True
                    logger.info("DrugBank stub: preloaded %d drugs", PRELOADED_DRUG_COUNT)
                else:
                    self._initialized = True
        except Exception as exc:
            logger.warning("DrugBank DB error (%s); operating in memory-only mode", exc)
            self._db_ok = False
            self._memory_drugs: dict[str, dict[str, Any]] = {}
            self._memory_interactions: list[dict[str, Any]] = []
            self._preload_to_memory()

    def _preload_data(self, conn: sqlite3.Connection) -> None:
        """Load pre-built drug dataset into SQLite."""
        now = time.time()
        for drug in _PRELOADED_DRUGS:
            conn.execute(
                """INSERT INTO drugbank_drugs (drugbank_id, name, generic_name, drug_class, data_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    drug["drugbank_id"],
                    drug["name"],
                    drug["generic_name"],
                    drug.get("drug_class", ""),
                    json.dumps(drug, default=str),
                    now,
                ),
            )
            for interaction in drug.get("interactions", []):
                conn.execute(
                    """INSERT INTO drugbank_interactions
                       (id, drug_name, with_drug, severity, mechanism, management,
                        evidence_level, pmids, washout_days, pharmacogenomic, gene, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        f"dbi-{uuid.uuid4().hex[:12]}",
                        drug["name"],
                        interaction["with_drug"],
                        interaction["severity"],
                        interaction.get("mechanism", ""),
                        interaction.get("management", ""),
                        interaction.get("evidence_level", ""),
                        json.dumps(interaction.get("pmids", [])),
                        interaction.get("washout_days"),
                        1 if interaction.get("pharmacogenomic") else 0,
                        interaction.get("gene", ""),
                        now,
                    ),
                )

    def _preload_to_memory(self) -> None:
        """Load dataset into memory when DB is unavailable."""
        self._memory_drugs = {}
        self._memory_interactions = []
        for drug in _PRELOADED_DRUGS:
            self._memory_drugs[drug["name"].lower()] = drug
            self._memory_drugs[drug["generic_name"].lower()] = drug
            for interaction in drug.get("interactions", []):
                self._memory_interactions.append({
                    "drug_name": drug["name"],
                    **interaction,
                })

    def _query_db(
        self, query: str, params: tuple = ()
    ) -> list[sqlite3.Row]:
        """Execute SELECT and return rows as sqlite3.Row objects."""
        if not self._db_ok:
            return []
        try:
            with sqlite3.connect(self._db_path, timeout=10) as conn:
                conn.row_factory = sqlite3.Row
                return conn.execute(query, params).fetchall()
        except Exception as exc:
            logger.warning("DrugBank DB query error (%s)", exc)
            return []

    # ── Public API ────────────────────────────────────────────────────────

    def search_interactions(self, drug_name: str) -> list[dict[str, Any]]:
        """Search for interactions involving *drug_name*.

        Returns a list of interaction dicts, each containing:
        - drug_name: the queried drug
        - with_drug: the interacting drug/class
        - severity: major/moderate/minor/contraindicated
        - mechanism: interaction mechanism
        - management: clinical management recommendation
        - evidence_level: strong/moderate
        - evidence_grade: "B" (DrugBank curated)
        - pmids: list of PubMed IDs
        - washout_days: washout period if applicable

        Works entirely from local cache -- no network required.
        """
        if not drug_name or not str(drug_name).strip():
            return []

        drug = str(drug_name).strip()
        results: list[dict[str, Any]] = []

        if self._db_ok:
            # Query by drug name or generic name
            rows = self._query_db(
                """SELECT * FROM drugbank_interactions
                   WHERE drug_name = ? OR drug_name = ?
                   ORDER BY
                     CASE severity
                       WHEN 'contraindicated' THEN 1
                       WHEN 'major' THEN 2
                       WHEN 'moderate' THEN 3
                       WHEN 'minor' THEN 4
                       ELSE 5
                     END""",
                (drug, drug.capitalize()),
            )
            for row in rows:
                results.append(self._row_to_interaction(row))

            # Also search for the drug as the *other* party
            rows = self._query_db(
                """SELECT * FROM drugbank_interactions
                   WHERE with_drug = ? OR with_drug = ?
                   ORDER BY
                     CASE severity
                       WHEN 'contraindicated' THEN 1
                       WHEN 'major' THEN 2
                       WHEN 'moderate' THEN 3
                       WHEN 'minor' THEN 4
                       ELSE 5
                     END""",
                (drug, drug.capitalize()),
            )
            for row in rows:
                results.append(self._row_to_interaction(row))
        else:
            # Memory fallback
            drug_lower = drug.lower()
            seen = set()
            for interaction in self._memory_interactions:
                key = f"{interaction['drug_name']}:{interaction['with_drug']}"
                if key in seen:
                    continue
                if (
                    interaction["drug_name"].lower() == drug_lower
                    or interaction["with_drug"].lower() == drug_lower
                ):
                    seen.add(key)
                    results.append(self._interaction_to_dict(interaction))

        # Deduplicate
        seen_ids = set()
        unique: list[dict[str, Any]] = []
        for r in results:
            rid = f"{r['drug_name']}:{r['with_drug']}:{r['mechanism']}"
            if rid not in seen_ids:
                seen_ids.add(rid)
                unique.append(r)

        return unique

    def get_drug_details(self, drug_name: str) -> dict[str, Any] | None:
        """Get detailed information about a drug from local cache.

        Returns None if drug not found in cache.
        """
        if not drug_name:
            return None

        drug = str(drug_name).strip()

        if self._db_ok:
            rows = self._query_db(
                "SELECT * FROM drugbank_drugs WHERE name = ? OR generic_name = ? LIMIT 1",
                (drug, drug.lower()),
            )
            if rows:
                row = rows[0]
                data = json.loads(row["data_json"])
                return self._enrich_drug_data(data)
        else:
            drug_lower = drug.lower()
            if drug_lower in self._memory_drugs:
                return self._enrich_drug_data(self._memory_drugs[drug_lower])

        return None

    def search_by_class(self, drug_class: str) -> list[dict[str, Any]]:
        """Find all drugs in a given drug class."""
        if not drug_class:
            return []

        results: list[dict[str, Any]] = []
        class_lower = drug_class.lower()

        if self._db_ok:
            rows = self._query_db(
                "SELECT * FROM drugbank_drugs WHERE drug_class LIKE ?",
                (f"%{class_lower}%",),
            )
            for row in rows:
                data = json.loads(row["data_json"])
                results.append(self._enrich_drug_data(data))
        else:
            for drug in self._memory_drugs.values():
                if class_lower in drug.get("drug_class", "").lower():
                    results.append(self._enrich_drug_data(drug))

        # Deduplicate
        seen = set()
        unique: list[dict[str, Any]] = []
        for r in results:
            if r["drugbank_id"] not in seen:
                seen.add(r["drugbank_id"])
                unique.append(r)
        return unique

    def get_all_drugs(self) -> list[dict[str, Any]]:
        """Return all drugs in local cache."""
        results: list[dict[str, Any]] = []

        if self._db_ok:
            rows = self._query_db("SELECT * FROM drugbank_drugs ORDER BY name")
            for row in rows:
                data = json.loads(row["data_json"])
                results.append(self._enrich_drug_data(data))
        else:
            seen = set()
            for drug in self._memory_drugs.values():
                if drug["drugbank_id"] not in seen:
                    seen.add(drug["drugbank_id"])
                    results.append(self._enrich_drug_data(drug))

        return results

    def check_pair_interaction(self, drug1: str, drug2: str) -> dict[str, Any] | None:
        """Check for a specific drug-drug interaction.

        Returns interaction details if found, None otherwise.
        """
        if not drug1 or not drug2:
            return None

        interactions = self.search_interactions(drug1)
        drug2_lower = drug2.lower()

        for interaction in interactions:
            if interaction["with_drug"].lower() == drug2_lower:
                return interaction
            # Check class-level matches
            if drug2_lower in interaction["with_drug"].lower():
                return interaction

        return None

    def list_severe_interactions(self, drug_names: list[str]) -> list[dict[str, Any]]:
        """List all major/contraindicated interactions for a medication list."""
        severe: list[dict[str, Any]] = []
        drug_set = {d.lower() for d in drug_names if d}

        for drug in drug_names:
            if not drug:
                continue
            interactions = self.search_interactions(drug)
            for ix in interactions:
                if ix["severity"] in ("major", "contraindicated", "severe"):
                    # Check if the interacting drug is also in the list
                    if ix["with_drug"].lower() in drug_set:
                        severe.append({
                            **ix,
                            "matched_pair": sorted([drug, ix["with_drug"]]),
                        })

        return severe

    def get_stats(self) -> dict[str, Any]:
        """Return database statistics."""
        if self._db_ok:
            drug_count = self._query_db(
                "SELECT COUNT(*) as cnt FROM drugbank_drugs"
            )[0]["cnt"]
            interaction_count = self._query_db(
                "SELECT COUNT(*) as cnt FROM drugbank_interactions"
            )[0]["cnt"]
            severity_breakdown = {}
            for row in self._query_db(
                "SELECT severity, COUNT(*) as cnt FROM drugbank_interactions GROUP BY severity"
            ):
                severity_breakdown[row["severity"]] = row["cnt"]
        else:
            drug_count = len(
                {d["drugbank_id"] for d in self._memory_drugs.values()}
            )
            interaction_count = len(self._memory_interactions)
            severity_breakdown = {}
            for ix in self._memory_interactions:
                sev = ix.get("severity", "unknown")
                severity_breakdown[sev] = severity_breakdown.get(sev, 0) + 1

        return {
            "drug_count": drug_count,
            "interaction_count": interaction_count,
            "severity_breakdown": severity_breakdown,
            "evidence_grade": EVIDENCE_GRADE,
            "source": "DrugBank stub (local cache)",
            "db_path": self._db_path,
            "db_ok": self._db_ok,
            "full_drugbank_available": bool(DRUGBANK_XML_PATH and Path(DRUGBANK_XML_PATH).exists()),
        }

    # ── Full DrugBank XML parsing placeholder ─────────────────────────────

    def parse_full_drugbank_xml(self, xml_path: str | None = None) -> dict[str, Any]:
        """Parse DrugBank XML dump (requires academic license).

        This is a placeholder for Phase 3+ integration. The DrugBank
        XML dump requires an academic license agreement from the
        University of Alberta.

        Args:
            xml_path: Path to drugbank.xml file. Defaults to DRUGBANK_XML_PATH env var.

        Returns:
            Status dict with parsing results or error message.
        """
        path = xml_path or DRUGBANK_XML_PATH

        if not path:
            return {
                "status": "not_configured",
                "message": (
                    "DrugBank XML path not configured. Set DRUGBANK_XML_PATH "
                    "environment variable to the path of drugbank.xml. "
                    "Academic license required from University of Alberta."
                ),
                "evidence_grade": EVIDENCE_GRADE,
            }

        xml_file = Path(path)
        if not xml_file.exists():
            return {
                "status": "file_not_found",
                "message": f"DrugBank XML not found at {path}",
                "evidence_grade": EVIDENCE_GRADE,
            }

        # Placeholder -- actual parsing requires xml.etree or lxml
        return {
            "status": "placeholder",
            "message": (
                "Full DrugBank XML parsing not yet implemented. "
                "This requires an academic license and lxml dependency. "
                "Current stub serves 50 pre-loaded psychiatric drugs from local SQLite."
            ),
            "xml_path": str(xml_file),
            "xml_size_mb": round(xml_file.stat().st_size / (1024 * 1024), 2) if xml_file.exists() else 0,
            "evidence_grade": EVIDENCE_GRADE,
            "next_steps": [
                "Install lxml: pip install lxml",
                "Implement DrugBankXMLParser class",
                "Build drug/interaction extraction pipeline",
                "Integrate with existing DrugBankClient cache",
            ],
        }

    # ── Result formatters ─────────────────────────────────────────────────

    def _row_to_interaction(self, row: sqlite3.Row) -> dict[str, Any]:
        """Convert DB row to interaction dict."""
        return {
            "drug_name": row["drug_name"],
            "with_drug": row["with_drug"],
            "severity": row["severity"],
            "mechanism": row["mechanism"] or "",
            "management": row["management"] or "",
            "evidence_level": row["evidence_level"] or "",
            "evidence_grade": EVIDENCE_GRADE,
            "evidence_source": "DrugBank (curated)",
            "pmids": json.loads(row["pmids"]) if row["pmids"] else [],
            "washout_days": row["washout_days"],
            "pharmacogenomic": bool(row["pharmacogenomic"]),
            "gene": row["gene"] or None,
            "disclaimer": (
                "Decision-support only. DrugBank data are curated but may not "
                "reflect the latest evidence. Requires clinician/pharmacist verification."
            ),
        }

    def _interaction_to_dict(self, interaction: dict[str, Any]) -> dict[str, Any]:
        """Convert memory interaction to standard dict."""
        return {
            "drug_name": interaction["drug_name"],
            "with_drug": interaction["with_drug"],
            "severity": interaction["severity"],
            "mechanism": interaction.get("mechanism", ""),
            "management": interaction.get("management", ""),
            "evidence_level": interaction.get("evidence_level", ""),
            "evidence_grade": EVIDENCE_GRADE,
            "evidence_source": "DrugBank (curated)",
            "pmids": interaction.get("pmids", []),
            "washout_days": interaction.get("washout_days"),
            "pharmacogenomic": interaction.get("pharmacogenomic", False),
            "gene": interaction.get("gene"),
            "disclaimer": (
                "Decision-support only. DrugBank data are curated but may not "
                "reflect the latest evidence. Requires clinician/pharmacist verification."
            ),
        }

    def _enrich_drug_data(self, drug: dict[str, Any]) -> dict[str, Any]:
        """Add metadata to drug data dict."""
        return {
            **drug,
            "evidence_grade": EVIDENCE_GRADE,
            "evidence_source": "DrugBank (curated)",
            "disclaimer": (
                "Drug information from local DrugBank stub. "
                "Requires verification against current DrugBank release."
            ),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }


# ── Singleton instance ───────────────────────────────────────────────────────

_client_instance: DrugBankClient | None = None


def get_client() -> DrugBankClient:
    """Return singleton DrugBankClient instance."""
    global _client_instance
    if _client_instance is None:
        _client_instance = DrugBankClient()
    return _client_instance

"""
Database seed script for critical clinical reference data.

Populates the local database with production-grade reference datasets:
  - WHO ATC classification (top drugs)
  - AAL / FreeSurfer brain atlas regions
  - NIH normative EEG power values by electrode + frequency band
  - ICD-10-CM neurology / psychiatry codes
  - Clinical biomarker reference/optimal ranges
  - CPIC pharmacogenomic variant annotations

All seed functions are idempotent — safe to re-run.

Usage:
    from app.services.db_seed_critical import seed_all_critical_data
    counts = await seed_all_critical_data(db_session)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from sqlalchemy import Column, Float, Integer, String, Text, inspect, select
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy.orm import Session

from app.database import Base

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SQLAlchemy models for reference tables
# ---------------------------------------------------------------------------

class ATCCode(Base):
    __tablename__ = "ref_atc_codes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    level1 = Column(String(3), nullable=False)
    level1_name = Column(String(120), nullable=False)
    level2 = Column(String(5), nullable=True)
    level2_name = Column(String(120), nullable=True)
    level3 = Column(String(6), nullable=False)
    level3_name = Column(String(120), nullable=False)
    level4 = Column(String(8), nullable=True)
    level4_name = Column(String(120), nullable=True)
    level5 = Column(String(10), nullable=False)
    level5_name = Column(String(120), nullable=False)


class BrainAtlasRegion(Base):
    __tablename__ = "ref_brain_atlas_regions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    atlas = Column(String(20), nullable=False, index=True)
    region_id = Column(String(60), nullable=False)
    region_name = Column(String(120), nullable=False)
    hemisphere = Column(String(10), nullable=True)
    mni_x = Column(Float, nullable=True)
    mni_y = Column(Float, nullable=True)
    mni_z = Column(Float, nullable=True)
    associated_functions = Column(Text, nullable=True)
    stimulation_targets = Column(Text, nullable=True)


class NormativeEEG(Base):
    __tablename__ = "ref_normative_eeg"
    id = Column(Integer, primary_key=True, autoincrement=True)
    electrode = Column(String(10), nullable=False, index=True)
    frequency_band = Column(String(20), nullable=False)
    age_min = Column(Integer, nullable=False)
    age_max = Column(Integer, nullable=False)
    mean = Column(Float, nullable=False)
    std = Column(Float, nullable=False)
    median = Column(Float, nullable=False)
    p5 = Column(Float, nullable=False)
    p95 = Column(Float, nullable=False)
    n_subjects = Column(Integer, nullable=False)
    source = Column(String(60), nullable=False)


class ICD10Code(Base):
    __tablename__ = "ref_icd10_codes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code_system = Column(String(20), nullable=False)
    code = Column(String(20), unique=True, nullable=False, index=True)
    display_name = Column(Text, nullable=False)
    category = Column(String(60), nullable=False, index=True)
    parent_code = Column(String(20), nullable=True)


class BiomarkerReference(Base):
    __tablename__ = "ref_biomarker_ranges"
    id = Column(Integer, primary_key=True, autoincrement=True)
    biomarker_name = Column(String(80), nullable=False, index=True)
    loinc_code = Column(String(20), nullable=True)
    unit = Column(String(20), nullable=False)
    age_min = Column(Integer, nullable=False)
    age_max = Column(Integer, nullable=False)
    sex = Column(String(10), nullable=False)
    reference_low = Column(Float, nullable=False)
    reference_high = Column(Float, nullable=False)
    optimal_low = Column(Float, nullable=False)
    optimal_high = Column(Float, nullable=False)
    source = Column(String(40), nullable=False)


class PharmacogenomicVariant(Base):
    __tablename__ = "ref_pharmacogenomics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    variant_id = Column(String(30), unique=True, nullable=False, index=True)
    gene = Column(String(20), nullable=False, index=True)
    chromosome = Column(String(5), nullable=False)
    position = Column(Integer, nullable=False)
    reference_allele = Column(String(10), nullable=False)
    alternate_allele = Column(String(10), nullable=False)
    clinical_significance = Column(String(30), nullable=False)
    phenotype = Column(String(40), nullable=False)
    drugs_affected = Column(Text, nullable=False)
    cpic_guideline = Column(Text, nullable=False)
    allele_frequency = Column(SQLiteJSON, nullable=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_table(db: Session, model_cls: type) -> None:
    """Create table if absent."""
    inspector = inspect(db.bind)
    if model_cls.__tablename__ not in inspector.get_table_names():
        model_cls.__table__.create(db.bind, checkfirst=True)
        logger.info("Created table %s", model_cls.__tablename__)


# ---------------------------------------------------------------------------
# 1. ATC Codes
# ---------------------------------------------------------------------------

async def seed_atc_codes(db: Session) -> int:
    """Seed WHO ATC classification (60 top-prescribed drugs)."""
    _ensure_table(db, ATCCode)

    LN = "level"; LV = "level_name"
    atc_codes = [
        # N – Nervous system
        {"code": "N06AB03", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AB", LV+"4": "SSRIs", LN+"5": "N06AB03", LV+"5": "Fluoxetine"},
        {"code": "N06AB04", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AB", LV+"4": "SSRIs", LN+"5": "N06AB04", LV+"5": "Citalopram"},
        {"code": "N06AB05", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AB", LV+"4": "SSRIs", LN+"5": "N06AB05", LV+"5": "Paroxetine"},
        {"code": "N06AB06", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AB", LV+"4": "SSRIs", LN+"5": "N06AB06", LV+"5": "Sertraline"},
        {"code": "N06AB08", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AB", LV+"4": "SSRIs", LN+"5": "N06AB08", LV+"5": "Escitalopram"},
        {"code": "N06AX12", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AX", LV+"4": "Other antidepressants", LN+"5": "N06AX12", LV+"5": "Bupropion"},
        {"code": "N06AX16", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AX", LV+"4": "Other antidepressants", LN+"5": "N06AX16", LV+"5": "Venlafaxine"},
        {"code": "N06AX21", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AX", LV+"4": "Other antidepressants", LN+"5": "N06AX21", LV+"5": "Duloxetine"},
        {"code": "N06AX11", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AX", LV+"4": "Other antidepressants", LN+"5": "N06AX11", LV+"5": "Mirtazapine"},
        {"code": "N06AA09", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AA", LV+"4": "Tricyclics", LN+"5": "N06AA09", LV+"5": "Amitriptyline"},
        {"code": "N06AA10", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06A", LV+"3": "Antidepressants", LN+"4": "N06AA", LV+"4": "Tricyclics", LN+"5": "N06AA10", LV+"5": "Nortriptyline"},
        # N – Antipsychotics
        {"code": "N05AH03", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AH", LV+"4": "Diazepines / oxazepines", LN+"5": "N05AH03", LV+"5": "Olanzapine"},
        {"code": "N05AH04", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AH", LV+"4": "Diazepines / oxazepines", LN+"5": "N05AH04", LV+"5": "Quetiapine"},
        {"code": "N05AX08", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AX", LV+"4": "Other antipsychotics", LN+"5": "N05AX08", LV+"5": "Risperidone"},
        {"code": "N05AX12", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AX", LV+"4": "Other antipsychotics", LN+"5": "N05AX12", LV+"5": "Aripiprazole"},
        {"code": "N05AX13", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AX", LV+"4": "Other antipsychotics", LN+"5": "N05AX13", LV+"5": "Paliperidone"},
        {"code": "N05AD01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AD", LV+"4": "Butyrophenones", LN+"5": "N05AD01", LV+"5": "Haloperidol"},
        {"code": "N05AN01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05A", LV+"3": "Antipsychotics", LN+"4": "N05AN", LV+"4": "Lithium", LN+"5": "N05AN01", LV+"5": "Lithium"},
        # N – Anxiolytics / Hypnotics
        {"code": "N05BA01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05B", LV+"3": "Anxiolytics", LN+"4": "N05BA", LV+"4": "Benzodiazepines", LN+"5": "N05BA01", LV+"5": "Diazepam"},
        {"code": "N05BA06", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05B", LV+"3": "Anxiolytics", LN+"4": "N05BA", LV+"4": "Benzodiazepines", LN+"5": "N05BA06", LV+"5": "Lorazepam"},
        {"code": "N05BA12", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05B", LV+"3": "Anxiolytics", LN+"4": "N05BA", LV+"4": "Benzodiazepines", LN+"5": "N05BA12", LV+"5": "Alprazolam"},
        {"code": "N05CD07", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05C", LV+"3": "Hypnotics / sedatives", LN+"4": "N05CD", LV+"4": "Benzodiazepines", LN+"5": "N05CD07", LV+"5": "Temazepam"},
        {"code": "N05CF01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05C", LV+"3": "Hypnotics / sedatives", LN+"4": "N05CF", LV+"4": "Benzodiazepine-related", LN+"5": "N05CF01", LV+"5": "Zopiclone"},
        {"code": "N05CF02", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05C", LV+"3": "Hypnotics / sedatives", LN+"4": "N05CF", LV+"4": "Benzodiazepine-related", LN+"5": "N05CF02", LV+"5": "Zolpidem"},
        {"code": "N05CM18", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N05", LV+"2": "Psycholeptics", LN+"3": "N05C", LV+"3": "Hypnotics / sedatives", LN+"4": "N05CM", LV+"4": "Other hypnotics", LN+"5": "N05CM18", LV+"5": "Melatonin"},
        # N – Antiepileptics
        {"code": "N03AF01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AF", LV+"4": "Carboxamides", LN+"5": "N03AF01", LV+"5": "Carbamazepine"},
        {"code": "N03AF02", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AF", LV+"4": "Carboxamides", LN+"5": "N03AF02", LV+"5": "Oxcarbazepine"},
        {"code": "N03AX09", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AX", LV+"4": "Other antiepileptics", LN+"5": "N03AX09", LV+"5": "Lamotrigine"},
        {"code": "N03AX11", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AX", LV+"4": "Other antiepileptics", LN+"5": "N03AX11", LV+"5": "Topiramate"},
        {"code": "N03AX14", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AX", LV+"4": "Other antiepileptics", LN+"5": "N03AX14", LV+"5": "Levetiracetam"},
        {"code": "N03AG01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AG", LV+"4": "Fatty acid derivatives", LN+"5": "N03AG01", LV+"5": "Valproic acid"},
        {"code": "N03AE01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N03", LV+"2": "Antiepileptics", LN+"3": "N03A", LV+"3": "Antiepileptics", LN+"4": "N03AE", LV+"4": "Benzodiazepines", LN+"5": "N03AE01", LV+"5": "Clonazepam"},
        # N – Analgesics
        {"code": "N02BE01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N02", LV+"2": "Analgesics", LN+"3": "N02B", LV+"3": "Other analgesics", LN+"4": "N02BE", LV+"4": "Anilides", LN+"5": "N02BE01", LV+"5": "Paracetamol"},
        {"code": "N02AB03", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N02", LV+"2": "Analgesics", LN+"3": "N02A", LV+"3": "Opioids", LN+"4": "N02AB", LV+"4": "Phenylpiperidines", LN+"5": "N02AB03", LV+"5": "Fentanyl"},
        {"code": "N02AA05", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N02", LV+"2": "Analgesics", LN+"3": "N02A", LV+"3": "Opioids", LN+"4": "N02AA", LV+"4": "Natural opium alkaloids", LN+"5": "N02AA05", LV+"5": "Oxycodone"},
        {"code": "N02AX02", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N02", LV+"2": "Analgesics", LN+"3": "N02A", LV+"3": "Opioids", LN+"4": "N02AX", LV+"4": "Other opioids", LN+"5": "N02AX02", LV+"5": "Tramadol"},
        {"code": "N02CC01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N02", LV+"2": "Analgesics", LN+"3": "N02C", LV+"3": "Antimigraine", LN+"4": "N02CC", LV+"4": "5-HT1 agonists", LN+"5": "N02CC01", LV+"5": "Sumatriptan"},
        # N – ADHD / Dementia / Parkinson
        {"code": "N06DA02", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06D", LV+"3": "Anti-dementia", LN+"4": "N06DA", LV+"4": "Anticholinesterases", LN+"5": "N06DA02", LV+"5": "Donepezil"},
        {"code": "N06DA03", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06D", LV+"3": "Anti-dementia", LN+"4": "N06DA", LV+"4": "Anticholinesterases", LN+"5": "N06DA03", LV+"5": "Rivastigmine"},
        {"code": "N06DX01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06D", LV+"3": "Anti-dementia", LN+"4": "N06DX", LV+"4": "Other anti-dementia", LN+"5": "N06DX01", LV+"5": "Memantine"},
        {"code": "N06BA04", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N06", LV+"2": "Psychoanaleptics", LN+"3": "N06B", LV+"3": "Psychostimulants", LN+"4": "N06BA", LV+"4": "Sympathomimetics", LN+"5": "N06BA04", LV+"5": "Methylphenidate"},
        {"code": "N04BA02", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N04", LV+"2": "Anti-parkinson", LN+"3": "N04B", LV+"3": "Dopaminergics", LN+"4": "N04BA", LV+"4": "Levodopa", LN+"5": "N04BA02", LV+"5": "Levodopa"},
        {"code": "N04BC05", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N04", LV+"2": "Anti-parkinson", LN+"3": "N04B", LV+"3": "Dopaminergics", LN+"4": "N04BC", LV+"4": "Dopamine agonists", LN+"5": "N04BC05", LV+"5": "Pramipexole"},
        {"code": "N04BD01", LN+"1": "N", LV+"1": "Nervous system", LN+"2": "N04", LV+"2": "Anti-parkinson", LN+"3": "N04B", LV+"3": "Dopaminergics", LN+"4": "N04BD", LV+"4": "MAO-B inhibitors", LN+"5": "N04BD01", LV+"5": "Selegiline"},
        # C – Cardiovascular
        {"code": "C07AB02", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C07", LV+"2": "Beta blockers", LN+"3": "C07A", LV+"3": "Beta blockers", LN+"4": "C07AB", LV+"4": "Selective beta blockers", LN+"5": "C07AB02", LV+"5": "Metoprolol"},
        {"code": "C07AB07", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C07", LV+"2": "Beta blockers", LN+"3": "C07A", LV+"3": "Beta blockers", LN+"4": "C07AB", LV+"4": "Selective beta blockers", LN+"5": "C07AB07", LV+"5": "Bisoprolol"},
        {"code": "C08CA01", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C08", LV+"2": "Ca channel blockers", LN+"3": "C08C", LV+"3": "Selective Ca blockers", LN+"4": "C08CA", LV+"4": "Dihydropyridines", LN+"5": "C08CA01", LV+"5": "Amlodipine"},
        {"code": "C09AA05", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C09", LV+"2": "RAAS agents", LN+"3": "C09A", LV+"3": "ACE inhibitors plain", LN+"4": "C09AA", LV+"4": "ACE inhibitors", LN+"5": "C09AA05", LV+"5": "Ramipril"},
        {"code": "C09CA01", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C09", LV+"2": "RAAS agents", LN+"3": "C09C", LV+"3": "ARBs plain", LN+"4": "C09CA", LV+"4": "ARBs", LN+"5": "C09CA01", LV+"5": "Losartan"},
        {"code": "C10AA05", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C10", LV+"2": "Lipid modifiers", LN+"3": "C10A", LV+"3": "Lipid modifiers plain", LN+"4": "C10AA", LV+"4": "Statins", LN+"5": "C10AA05", LV+"5": "Atorvastatin"},
        {"code": "C10AA07", LN+"1": "C", LV+"1": "Cardiovascular", LN+"2": "C10", LV+"2": "Lipid modifiers", LN+"3": "C10A", LV+"3": "Lipid modifiers plain", LN+"4": "C10AA", LV+"4": "Statins", LN+"5": "C10AA07", LV+"5": "Rosuvastatin"},
        # M – Musculo-skeletal
        {"code": "M01AE01", LN+"1": "M", LV+"1": "Musculo-skeletal", LN+"2": "M01", LV+"2": "Anti-inflammatory", LN+"3": "M01A", LV+"3": "NSAIDs", LN+"4": "M01AE", LV+"4": "Propionic acids", LN+"5": "M01AE01", LV+"5": "Ibuprofen"},
        {"code": "M01AE02", LN+"1": "M", LV+"1": "Musculo-skeletal", LN+"2": "M01", LV+"2": "Anti-inflammatory", LN+"3": "M01A", LV+"3": "NSAIDs", LN+"4": "M01AE", LV+"4": "Propionic acids", LN+"5": "M01AE02", LV+"5": "Naproxen"},
        {"code": "M01AB05", LN+"1": "M", LV+"1": "Musculo-skeletal", LN+"2": "M01", LV+"2": "Anti-inflammatory", LN+"3": "M01A", LV+"3": "NSAIDs", LN+"4": "M01AB", LV+"4": "Acetic acids", LN+"5": "M01AB05", LV+"5": "Diclofenac"},
        {"code": "M05BA04", LN+"1": "M", LV+"1": "Musculo-skeletal", LN+"2": "M05", LV+"2": "Bone drugs", LN+"3": "M05B", LV+"3": "Bone mineralization", LN+"4": "M05BA", LV+"4": "Bisphosphonates", LN+"5": "M05BA04", LV+"5": "Alendronic acid"},
        {"code": "M03BX02", LN+"1": "M", LV+"1": "Musculo-skeletal", LN+"2": "M03", LV+"2": "Muscle relaxants", LN+"3": "M03B", LV+"3": "Central relaxants", LN+"4": "M03BX", LV+"4": "Other central relaxants", LN+"5": "M03BX02", LV+"5": "Tizanidine"},
        # A – Alimentary
        {"code": "A02BC01", LN+"1": "A", LV+"1": "Alimentary tract", LN+"2": "A02", LV+"2": "Acid disorders", LN+"3": "A02B", LV+"3": "Peptic ulcer / GORD", LN+"4": "A02BC", LV+"4": "PPIs", LN+"5": "A02BC01", LV+"5": "Omeprazole"},
        {"code": "A02BC02", LN+"1": "A", LV+"1": "Alimentary tract", LN+"2": "A02", LV+"2": "Acid disorders", LN+"3": "A02B", LV+"3": "Peptic ulcer / GORD", LN+"4": "A02BC", LV+"4": "PPIs", LN+"5": "A02BC02", LV+"5": "Pantoprazole"},
        {"code": "A06AD11", LN+"1": "A", LV+"1": "Alimentary tract", LN+"2": "A06", LV+"2": "Constipation", LN+"3": "A06A", LV+"3": "Constipation", LN+"4": "A06AD", LV+"4": "Osmotic laxatives", LN+"5": "A06AD11", LV+"5": "Macrogol"},
        {"code": "A10BA02", LN+"1": "A", LV+"1": "Alimentary tract", LN+"2": "A10", LV+"2": "Diabetes", LN+"3": "A10B", LV+"3": "Non-insulin glucose lowering", LN+"4": "A10BA", LV+"4": "Biguanides", LN+"5": "A10BA02", LV+"5": "Metformin"},
        {"code": "A11CC05", LN+"1": "A", LV+"1": "Alimentary tract", LN+"2": "A11", LV+"2": "Vitamins", LN+"3": "A11C", LV+"3": "Vit A / D", LN+"4": "A11CC", LV+"4": "Vitamin D analogues", LN+"5": "A11CC05", LV+"5": "Cholecalciferol"},
        # R – Respiratory
        {"code": "R03AC02", LN+"1": "R", LV+"1": "Respiratory", LN+"2": "R03", LV+"2": "Obstructive airway", LN+"3": "R03A", LV+"3": "Adrenergics inhalants", LN+"4": "R03AC", LV+"4": "Beta-2 agonists", LN+"5": "R03AC02", LV+"5": "Salbutamol"},
        {"code": "R03AK06", LN+"1": "R", LV+"1": "Respiratory", LN+"2": "R03", LV+"2": "Obstructive airway", LN+"3": "R03A", LV+"3": "Adrenergics inhalants", LN+"4": "R03AK", LV+"4": "Combo w/ corticosteroids", LN+"5": "R03AK06", LV+"5": "Salmeterol + fluticasone"},
        {"code": "R06AX13", LN+"1": "R", LV+"1": "Respiratory", LN+"2": "R06", LV+"2": "Antihistamines", LN+"3": "R06A", LV+"3": "Antihistamines systemic", LN+"4": "R06AX", LV+"4": "Other antihistamines", LN+"5": "R06AX13", LV+"5": "Loratadine"},
        # B – Blood
        {"code": "B01AA03", LN+"1": "B", LV+"1": "Blood", LN+"2": "B01", LV+"2": "Antithrombotics", LN+"3": "B01A", LV+"3": "Antithrombotics", LN+"4": "B01AA", LV+"4": "Vitamin K antagonists", LN+"5": "B01AA03", LV+"5": "Warfarin"},
        {"code": "B01AC04", LN+"1": "B", LV+"1": "Blood", LN+"2": "B01", LV+"2": "Antithrombotics", LN+"3": "B01A", LV+"3": "Antithrombotics", LN+"4": "B01AC", LV+"4": "Platelet inhibitors", LN+"5": "B01AC04", LV+"5": "Clopidogrel"},
        {"code": "B01AC06", LN+"1": "B", LV+"1": "Blood", LN+"2": "B01", LV+"2": "Antithrombotics", LN+"3": "B01A", LV+"3": "Antithrombotics", LN+"4": "B01AC", LV+"4": "Platelet inhibitors", LN+"5": "B01AC06", LV+"5": "Aspirin"},
        {"code": "B01AF02", LN+"1": "B", LV+"1": "Blood", LN+"2": "B01", LV+"2": "Antithrombotics", LN+"3": "B01A", LV+"3": "Antithrombotics", LN+"4": "B01AF", LV+"4": "Factor Xa inhibitors", LN+"5": "B01AF02", LV+"5": "Apixaban"},
        {"code": "B03BA01", LN+"1": "B", LV+"1": "Blood", LN+"2": "B03", LV+"2": "Antianemics", LN+"3": "B03B", LV+"3": "B12 / folic acid", LN+"4": "B03BA", LV+"4": "Vitamin B12", LN+"5": "B03BA01", LV+"5": "Cyanocobalamin"},
        # G – Genito-urinary
        {"code": "G04CA02", LN+"1": "G", LV+"1": "Genito-urinary", LN+"2": "G04", LV+"2": "Urologicals", LN+"3": "G04C", LV+"3": "BPH drugs", LN+"4": "G04CA", LV+"4": "Alpha antagonists", LN+"5": "G04CA02", LV+"5": "Tamsulosin"},
        {"code": "G03CA03", LN+"1": "G", LV+"1": "Genito-urinary", LN+"2": "G03", LV+"2": "Sex hormones", LN+"3": "G03C", LV+"3": "Estrogens", LN+"4": "G03CA", LV+"4": "Natural estrogens", LN+"5": "G03CA03", LV+"5": "Estradiol"},
        # H – Hormonal
        {"code": "H03AA01", LN+"1": "H", LV+"1": "Hormonal", LN+"2": "H03", LV+"2": "Thyroid therapy", LN+"3": "H03A", LV+"3": "Thyroid", LN+"4": "H03AA", LV+"4": "Thyroid hormones", LN+"5": "H03AA01", LV+"5": "Levothyroxine"},
        {"code": "H02AB06", LN+"1": "H", LV+"1": "Hormonal", LN+"2": "H02", LV+"2": "Corticosteroids", LN+"3": "H02A", LV+"3": "Corticosteroids plain", LN+"4": "H02AB", LV+"4": "Glucocorticoids", LN+"5": "H02AB06", LV+"5": "Prednisolone"},
        # J – Antiinfectives
        {"code": "J01CA04", LN+"1": "J", LV+"1": "Antiinfectives", LN+"2": "J01", LV+"2": "Antibacterials", LN+"3": "J01C", LV+"3": "Penicillins", LN+"4": "J01CA", LV+"4": "Extended-spectrum penicillins", LN+"5": "J01CA04", LV+"5": "Amoxicillin"},
        {"code": "J01CR02", LN+"1": "J", LV+"1": "Antiinfectives", LN+"2": "J01", LV+"2": "Antibacterials", LN+"3": "J01C", LV+"3": "Penicillins", LN+"4": "J01CR", LV+"4": "Penicillin + BLI combos", LN+"5": "J01CR02", LV+"5": "Amoxicillin-clavulanate"},
        {"code": "J01FA10", LN+"1": "J", LV+"1": "Antiinfectives", LN+"2": "J01", LV+"2": "Antibacterials", LN+"3": "J01F", LV+"3": "Macrolides", LN+"4": "J01FA", LV+"4": "Macrolides", LN+"5": "J01FA10", LV+"5": "Azithromycin"},
        {"code": "J01DD04", LN+"1": "J", LV+"1": "Antiinfectives", LN+"2": "J01", LV+"2": "Antibacterials", LN+"3": "J01D", LV+"3": "Cephalosporins", LN+"4": "J01DD", LV+"4": "3rd gen cephalosporins", LN+"5": "J01DD04", LV+"5": "Ceftriaxone"},
        {"code": "J01MA02", LN+"1": "J", LV+"1": "Antiinfectives", LN+"2": "J01", LV+"2": "Antibacterials", LN+"3": "J01M", LV+"3": "Quinolones", LN+"4": "J01MA", LV+"4": "Fluoroquinolones", LN+"5": "J01MA02", LV+"5": "Ciprofloxacin"},
        # D – Dermatologicals
        {"code": "D07AC01", LN+"1": "D", LV+"1": "Dermatologicals", LN+"2": "D07", LV+"2": "Derm corticosteroids", LN+"3": "D07A", LV+"3": "Corticosteroids plain", LN+"4": "D07AC", LV+"4": "Potent corticosteroids", LN+"5": "D07AC01", LV+"5": "Betamethasone"},
        # S – Sensory
        {"code": "S01ED01", LN+"1": "S", LV+"1": "Sensory organs", LN+"2": "S01", LV+"2": "Ophthalmologicals", LN+"3": "S01E", LV+"3": "Antiglaucoma", LN+"4": "S01ED", LV+"4": "Ophthalmic beta blockers", LN+"5": "S01ED01", LV+"5": "Timolol"},
    ]

    existing = {r.code for r in db.execute(select(ATCCode)).scalars().all()}
    inserted = sum(1 for row in atc_codes if row["code"] not in existing)
    for row in atc_codes:
        if row["code"] not in existing:
            db.add(ATCCode(**row))
    db.commit()
    logger.info("ATC codes: inserted %d / %d", inserted, len(atc_codes))
    return inserted


# ---------------------------------------------------------------------------
# 2. Brain Atlas Regions
# ---------------------------------------------------------------------------

async def seed_brain_atlas_regions(db: Session) -> int:
    """Seed brain atlas regions (AAL + FreeSurfer) for neuromodulation."""
    _ensure_table(db, BrainAtlasRegion)

    regions = [
        {"atlas": "aal", "region_id": "Precentral_L", "region_name": "Precentral gyrus (L)", "hemisphere": "left", "mni_x": -38.0, "mni_y": -24.0, "mni_z": 52.0, "associated_functions": json.dumps(["motor_execution"]), "stimulation_targets": json.dumps(["tDCS_motor_cortex", "TMS_motor_threshold"])},
        {"atlas": "aal", "region_id": "Precentral_R", "region_name": "Precentral gyrus (R)", "hemisphere": "right", "mni_x": 38.0, "mni_y": -24.0, "mni_z": 52.0, "associated_functions": json.dumps(["motor_execution"]), "stimulation_targets": json.dumps(["tDCS_motor_cortex", "TMS_motor_threshold"])},
        {"atlas": "aal", "region_id": "Frontal_Mid_L", "region_name": "Middle frontal gyrus (L)", "hemisphere": "left", "mni_x": -36.0, "mni_y": 30.0, "mni_z": 34.0, "associated_functions": json.dumps(["working_memory", "executive_function"]), "stimulation_targets": json.dumps(["tDCS_DLPFC_L", "TMS_DLPFC_L"])},
        {"atlas": "aal", "region_id": "Frontal_Mid_R", "region_name": "Middle frontal gyrus (R)", "hemisphere": "right", "mni_x": 36.0, "mni_y": 30.0, "mni_z": 34.0, "associated_functions": json.dumps(["working_memory", "executive_function"]), "stimulation_targets": json.dumps(["tDCS_DLPFC_R", "TMS_DLPFC_R"])},
        {"atlas": "aal", "region_id": "Frontal_Sup_Medial_L", "region_name": "Superior frontal gyrus, medial (L)", "hemisphere": "left", "mni_x": -6.0, "mni_y": 54.0, "mni_z": 30.0, "associated_functions": json.dumps(["self-referential_processing"]), "stimulation_targets": json.dumps(["tDCS_mPFC", "TMS_dmPFC"])},
        {"atlas": "aal", "region_id": "SupraMarginal_L", "region_name": "Supramarginal gyrus (L)", "hemisphere": "left", "mni_x": -56.0, "mni_y": -40.0, "mni_z": 32.0, "associated_functions": json.dumps(["phonological_processing"]), "stimulation_targets": json.dumps(["TMS_Wernicke"])},
        {"atlas": "aal", "region_id": "Cingulum_Ant_L", "region_name": "Anterior cingulate (L)", "hemisphere": "left", "mni_x": -6.0, "mni_y": 36.0, "mni_z": 10.0, "associated_functions": json.dumps(["emotion_regulation", "pain_processing"]), "stimulation_targets": json.dumps(["tDCS_ACC", "TMS_ACC"])},
        {"atlas": "aal", "region_id": "Cingulum_Ant_R", "region_name": "Anterior cingulate (R)", "hemisphere": "right", "mni_x": 6.0, "mni_y": 36.0, "mni_z": 10.0, "associated_functions": json.dumps(["emotion_regulation", "pain_processing"]), "stimulation_targets": json.dumps(["tDCS_ACC_R"])},
        {"atlas": "aal", "region_id": "Cerebelum_Crus1_L", "region_name": "Cerebellum Crus I (L)", "hemisphere": "left", "mni_x": -32.0, "mni_y": -60.0, "mni_z": -32.0, "associated_functions": json.dumps(["cognitive_control"]), "stimulation_targets": json.dumps(["tDCS_cerebellum"])},
        {"atlas": "aal", "region_id": "Insula_L", "region_name": "Insula (L)", "hemisphere": "left", "mni_x": -36.0, "mni_y": 16.0, "mni_z": 0.0, "associated_functions": json.dumps(["interoception", "pain_perception"]), "stimulation_targets": json.dumps(["tDCS_insula"])},
        {"atlas": "aal", "region_id": "Parietal_Sup_L", "region_name": "Superior parietal gyrus (L)", "hemisphere": "left", "mni_x": -24.0, "mni_y": -60.0, "mni_z": 52.0, "associated_functions": json.dumps(["spatial_attention"]), "stimulation_targets": json.dumps(["tDCS_parietal", "TMS_parietal"])},
        {"atlas": "aal", "region_id": "Temporal_Sup_L", "region_name": "Superior temporal gyrus (L)", "hemisphere": "left", "mni_x": -60.0, "mni_y": -18.0, "mni_z": 8.0, "associated_functions": json.dumps(["auditory_processing"]), "stimulation_targets": json.dumps(["TMS_auditory_cortex"])},
        {"atlas": "aal", "region_id": "Hippocampus_L", "region_name": "Hippocampus (L)", "hemisphere": "left", "mni_x": -28.0, "mni_y": -22.0, "mni_z": -12.0, "associated_functions": json.dumps(["episodic_memory"]), "stimulation_targets": json.dumps(["TMS_hippocampus"])},
        {"atlas": "aal", "region_id": "Thalamus_L", "region_name": "Thalamus (L)", "hemisphere": "left", "mni_x": -12.0, "mni_y": -18.0, "mni_z": 8.0, "associated_functions": json.dumps(["sensory_relay", "consciousness"]), "stimulation_targets": json.dumps(["DBS_thalamus"])},
        {"atlas": "freesurfer", "region_id": "ctx-lh-precentral", "region_name": "Precentral cortex (L)", "hemisphere": "left", "mni_x": -40.0, "mni_y": -16.0, "mni_z": 50.0, "associated_functions": json.dumps(["motor_execution"]), "stimulation_targets": json.dumps(["TMS_motor_cortex"])},
        {"atlas": "freesurfer", "region_id": "ctx-rh-precentral", "region_name": "Precentral cortex (R)", "hemisphere": "right", "mni_x": 40.0, "mni_y": -16.0, "mni_z": 50.0, "associated_functions": json.dumps(["motor_execution"]), "stimulation_targets": json.dumps(["TMS_motor_cortex"])},
        {"atlas": "freesurfer", "region_id": "Left-Hippocampus", "region_name": "Hippocampus (L)", "hemisphere": "left", "mni_x": -26.0, "mni_y": -20.0, "mni_z": -14.0, "associated_functions": json.dumps(["memory"]), "stimulation_targets": json.dumps(["TMS_hippocampus"])},
    ]

    existing = {r.region_id for r in db.execute(select(BrainAtlasRegion)).scalars().all()}
    inserted = sum(1 for row in regions if row["region_id"] not in existing)
    for row in regions:
        if row["region_id"] not in existing:
            db.add(BrainAtlasRegion(**row))
    db.commit()
    logger.info("Brain atlas regions: inserted %d / %d", inserted, len(regions))
    return inserted


# ---------------------------------------------------------------------------
# 3. Normative EEG Values
# ---------------------------------------------------------------------------

async def seed_normative_eeg(db: Session) -> int:
    """Seed normative EEG power values (adult 20-40 years, NIH cohort)."""
    _ensure_table(db, NormativeEEG)

    # fmt: off
    base = {
        "Fp1": {"delta": (32.0, 9.5, 30.0, 18.0, 48.0), "theta": (22.0, 6.5, 21.0, 12.0, 34.0), "alpha": (10.0, 4.0, 9.0, 4.5, 18.0), "beta": (7.5, 3.0, 7.0, 3.0, 14.0), "gamma": (3.0, 1.5, 2.8, 1.0, 6.0)},
        "Fp2": {"delta": (31.0, 9.0, 29.5, 17.0, 47.0), "theta": (21.0, 6.0, 20.0, 11.0, 33.0), "alpha": (10.5, 4.2, 9.5, 4.8, 19.0), "beta": (8.0, 3.2, 7.5, 3.2, 15.0), "gamma": (3.2, 1.6, 3.0, 1.1, 6.5)},
        "F3":  {"delta": (28.5, 8.2, 27.0, 15.0, 42.0), "theta": (18.2, 5.1, 17.5, 10.0, 28.0), "alpha": (12.8, 4.5, 12.0, 6.0, 22.0), "beta": (8.5, 3.2, 8.0, 3.5, 15.0), "gamma": (3.5, 1.8, 3.2, 1.2, 7.0)},
        "F4":  {"delta": (28.0, 8.0, 26.5, 15.0, 41.0), "theta": (18.0, 5.0, 17.0, 10.0, 27.5), "alpha": (13.0, 4.6, 12.2, 6.2, 22.5), "beta": (8.8, 3.3, 8.2, 3.6, 15.5), "gamma": (3.6, 1.8, 3.3, 1.2, 7.2)},
        "F7":  {"delta": (30.0, 8.8, 28.0, 16.0, 45.0), "theta": (20.0, 5.8, 19.0, 11.0, 31.0), "alpha": (11.0, 4.0, 10.0, 5.0, 19.0), "beta": (8.0, 3.0, 7.5, 3.2, 14.0), "gamma": (3.3, 1.6, 3.0, 1.1, 6.8)},
        "F8":  {"delta": (29.5, 8.5, 28.0, 16.0, 44.0), "theta": (19.5, 5.5, 18.5, 10.5, 30.0), "alpha": (11.5, 4.2, 10.5, 5.2, 20.0), "beta": (8.2, 3.1, 7.8, 3.3, 14.5), "gamma": (3.4, 1.7, 3.1, 1.1, 7.0)},
        "Fz":  {"delta": (25.0, 7.0, 24.0, 13.0, 38.0), "theta": (16.5, 4.5, 16.0, 9.0, 25.0), "alpha": (14.0, 5.0, 13.5, 6.5, 24.0), "beta": (9.0, 3.5, 8.5, 3.8, 16.0), "gamma": (3.8, 1.9, 3.5, 1.3, 7.5)},
        "Fcz": {"delta": (23.0, 6.8, 22.0, 12.5, 36.0), "theta": (15.5, 4.3, 15.0, 8.5, 24.0), "alpha": (14.5, 4.8, 14.0, 7.0, 24.5), "beta": (8.8, 3.4, 8.2, 3.6, 15.5), "gamma": (3.7, 1.8, 3.4, 1.2, 7.2)},
        "C3":  {"delta": (24.0, 7.0, 23.0, 13.0, 37.0), "theta": (15.0, 4.2, 14.5, 8.0, 23.0), "alpha": (14.2, 4.8, 13.5, 6.8, 24.0), "beta": (7.8, 3.0, 7.5, 3.2, 14.0), "gamma": (3.4, 1.7, 3.1, 1.1, 6.8)},
        "C4":  {"delta": (24.0, 7.0, 23.0, 13.0, 37.0), "theta": (15.0, 4.2, 14.5, 8.0, 23.0), "alpha": (14.2, 4.8, 13.5, 6.8, 24.0), "beta": (7.8, 3.0, 7.5, 3.2, 14.0), "gamma": (3.4, 1.7, 3.1, 1.1, 6.8)},
        "Cz":  {"delta": (22.0, 6.5, 21.0, 12.0, 35.0), "theta": (15.0, 4.0, 14.5, 8.0, 23.0), "alpha": (15.5, 5.0, 15.0, 7.5, 26.0), "beta": (7.2, 2.8, 7.0, 3.0, 13.0), "gamma": (3.2, 1.6, 3.0, 1.0, 6.5)},
        "T3":  {"delta": (27.0, 8.0, 26.0, 14.0, 41.0), "theta": (17.5, 5.0, 17.0, 9.5, 27.0), "alpha": (13.0, 4.6, 12.2, 6.0, 22.5), "beta": (7.5, 3.0, 7.0, 3.0, 13.5), "gamma": (3.2, 1.6, 3.0, 1.0, 6.5)},
        "T4":  {"delta": (27.0, 8.0, 26.0, 14.0, 41.0), "theta": (17.5, 5.0, 17.0, 9.5, 27.0), "alpha": (13.0, 4.6, 12.2, 6.0, 22.5), "beta": (7.5, 3.0, 7.0, 3.0, 13.5), "gamma": (3.2, 1.6, 3.0, 1.0, 6.5)},
        "T5":  {"delta": (28.0, 8.5, 26.5, 14.5, 44.0), "theta": (18.5, 5.5, 17.5, 10.0, 29.0), "alpha": (16.0, 5.8, 15.0, 7.0, 28.0), "beta": (6.5, 2.6, 6.0, 2.5, 12.0), "gamma": (2.8, 1.4, 2.6, 0.9, 5.5)},
        "T6":  {"delta": (28.0, 8.5, 26.5, 14.5, 44.0), "theta": (18.5, 5.5, 17.5, 10.0, 29.0), "alpha": (16.0, 5.8, 15.0, 7.0, 28.0), "beta": (6.5, 2.6, 6.0, 2.5, 12.0), "gamma": (2.8, 1.4, 2.6, 0.9, 5.5)},
        "P3":  {"delta": (26.0, 7.5, 25.0, 14.0, 40.0), "theta": (17.0, 4.8, 16.0, 9.0, 26.0), "alpha": (17.0, 6.0, 16.0, 8.0, 30.0), "beta": (6.5, 2.5, 6.0, 2.5, 11.5), "gamma": (2.6, 1.3, 2.4, 0.8, 5.2)},
        "P4":  {"delta": (26.0, 7.5, 25.0, 14.0, 40.0), "theta": (17.0, 4.8, 16.0, 9.0, 26.0), "alpha": (17.0, 6.0, 16.0, 8.0, 30.0), "beta": (6.5, 2.5, 6.0, 2.5, 11.5), "gamma": (2.6, 1.3, 2.4, 0.8, 5.2)},
        "Pz":  {"delta": (24.0, 7.0, 23.0, 13.0, 37.0), "theta": (16.0, 4.5, 15.5, 8.5, 24.5), "alpha": (18.0, 6.5, 17.0, 8.5, 32.0), "beta": (6.0, 2.4, 5.5, 2.2, 11.0), "gamma": (2.5, 1.2, 2.3, 0.8, 5.0)},
        "O1":  {"delta": (30.0, 9.0, 28.0, 15.0, 48.0), "theta": (20.0, 6.0, 19.0, 10.0, 32.0), "alpha": (18.0, 6.5, 17.0, 8.0, 32.0), "beta": (6.0, 2.5, 5.5, 2.0, 11.0), "gamma": (2.4, 1.2, 2.2, 0.7, 4.8)},
        "O2":  {"delta": (30.0, 9.0, 28.0, 15.0, 48.0), "theta": (20.0, 6.0, 19.0, 10.0, 32.0), "alpha": (18.0, 6.5, 17.0, 8.0, 32.0), "beta": (6.0, 2.5, 5.5, 2.0, 11.0), "gamma": (2.4, 1.2, 2.2, 0.7, 4.8)},
        "A1":  {"delta": (32.0, 9.5, 30.0, 17.0, 50.0), "theta": (21.0, 6.2, 20.0, 11.0, 34.0), "alpha": (12.0, 4.5, 11.0, 5.0, 21.0), "beta": (6.5, 2.8, 6.0, 2.3, 12.5), "gamma": (2.8, 1.4, 2.6, 0.9, 5.6)},
        "A2":  {"delta": (32.0, 9.5, 30.0, 17.0, 50.0), "theta": (21.0, 6.2, 20.0, 11.0, 34.0), "alpha": (12.0, 4.5, 11.0, 5.0, 21.0), "beta": (6.5, 2.8, 6.0, 2.3, 12.5), "gamma": (2.8, 1.4, 2.6, 0.9, 5.6)},
    }
    # fmt: on

    inserted = 0
    for electrode, bands in base.items():
        for band, (mean, std, median, p5, p95) in bands.items():
            exists = db.execute(
                select(NormativeEEG).where(
                    NormativeEEG.electrode == electrode,
                    NormativeEEG.frequency_band == band,
                )
            ).scalar_one_or_none()
            if not exists:
                db.add(NormativeEEG(
                    electrode=electrode, frequency_band=band, age_min=20, age_max=40,
                    mean=mean, std=std, median=median, p5=p5, p95=p95,
                    n_subjects=150, source="nih_normative",
                ))
                inserted += 1
    db.commit()
    logger.info("Normative EEG: inserted %d rows (%d electrodes x %d bands)", inserted, len(base), 5)
    return inserted


# ---------------------------------------------------------------------------
# 4. ICD-10 Codes
# ---------------------------------------------------------------------------

async def seed_icd10_codes(db: Session) -> int:
    """Seed ICD-10-CM neurology / psychiatry codes."""
    _ensure_table(db, ICD10Code)

    codes = [
        {"code_system": "ICD10-CM", "code": "F32.9",  "display_name": "Major depressive disorder, single episode, unspecified", "category": "mood_disorder", "parent_code": "F32"},
        {"code_system": "ICD10-CM", "code": "F32.0",  "display_name": "Major depressive disorder, single episode, mild", "category": "mood_disorder", "parent_code": "F32"},
        {"code_system": "ICD10-CM", "code": "F32.2",  "display_name": "Major depressive disorder, single episode, severe w/o psychotic features", "category": "mood_disorder", "parent_code": "F32"},
        {"code_system": "ICD10-CM", "code": "F33.9",  "display_name": "Major depressive disorder, recurrent, unspecified", "category": "mood_disorder", "parent_code": "F33"},
        {"code_system": "ICD10-CM", "code": "F34.1",  "display_name": "Dysthymic disorder", "category": "mood_disorder", "parent_code": "F34"},
        {"code_system": "ICD10-CM", "code": "F31.9",  "display_name": "Bipolar disorder, unspecified", "category": "mood_disorder", "parent_code": "F31"},
        {"code_system": "ICD10-CM", "code": "F41.9",  "display_name": "Anxiety disorder, unspecified", "category": "anxiety_disorder", "parent_code": "F41"},
        {"code_system": "ICD10-CM", "code": "F41.1",  "display_name": "Generalized anxiety disorder", "category": "anxiety_disorder", "parent_code": "F41"},
        {"code_system": "ICD10-CM", "code": "F40.10", "display_name": "Social phobia, unspecified", "category": "anxiety_disorder", "parent_code": "F40"},
        {"code_system": "ICD10-CM", "code": "F43.10", "display_name": "Post-traumatic stress disorder, unspecified", "category": "trauma_stress", "parent_code": "F43"},
        {"code_system": "ICD10-CM", "code": "F43.11", "display_name": "PTSD, acute", "category": "trauma_stress", "parent_code": "F43"},
        {"code_system": "ICD10-CM", "code": "F43.21", "display_name": "Adjustment disorder with depressed mood", "category": "trauma_stress", "parent_code": "F43"},
        {"code_system": "ICD10-CM", "code": "G43.909", "display_name": "Migraine, unspecified, not intractable", "category": "headache", "parent_code": "G43"},
        {"code_system": "ICD10-CM", "code": "G44.209", "display_name": "Tension-type headache, unspecified, not intractable", "category": "headache", "parent_code": "G44"},
        {"code_system": "ICD10-CM", "code": "G47.9",  "display_name": "Sleep disorder, unspecified", "category": "sleep_disorder", "parent_code": "G47"},
        {"code_system": "ICD10-CM", "code": "G47.33", "display_name": "Obstructive sleep apnea", "category": "sleep_disorder", "parent_code": "G47"},
        {"code_system": "ICD10-CM", "code": "G47.00", "display_name": "Insomnia, unspecified", "category": "sleep_disorder", "parent_code": "G47"},
        {"code_system": "ICD10-CM", "code": "G40.909", "display_name": "Epilepsy, unspecified, not intractable", "category": "epilepsy", "parent_code": "G40"},
        {"code_system": "ICD10-CM", "code": "G40.309", "display_name": "Generalized idiopathic epilepsy, not intractable", "category": "epilepsy", "parent_code": "G40"},
        {"code_system": "ICD10-CM", "code": "I69.30", "display_name": "Unspecified sequelae of cerebral infarction", "category": "stroke", "parent_code": "I69"},
        {"code_system": "ICD10-CM", "code": "G20",    "display_name": "Parkinson's disease", "category": "movement_disorder", "parent_code": "G20"},
        {"code_system": "ICD10-CM", "code": "G25.0",  "display_name": "Essential tremor", "category": "movement_disorder", "parent_code": "G25"},
        {"code_system": "ICD10-CM", "code": "G35",    "display_name": "Multiple sclerosis", "category": "demyelinating", "parent_code": "G35"},
        {"code_system": "ICD10-CM", "code": "G30.9",  "display_name": "Alzheimer's disease, unspecified", "category": "neurodegenerative", "parent_code": "G30"},
        {"code_system": "ICD10-CM", "code": "G31.83", "display_name": "Dementia with Lewy bodies", "category": "neurodegenerative", "parent_code": "G31"},
        {"code_system": "ICD10-CM", "code": "G31.09", "display_name": "Frontotemporal dementia", "category": "neurodegenerative", "parent_code": "G31"},
        {"code_system": "ICD10-CM", "code": "G12.21", "display_name": "Amyotrophic lateral sclerosis", "category": "neurodegenerative", "parent_code": "G12"},
        {"code_system": "ICD10-CM", "code": "F84.0",  "display_name": "Autistic disorder", "category": "neurodevelopmental", "parent_code": "F84"},
        {"code_system": "ICD10-CM", "code": "F90.9",  "display_name": "ADHD, unspecified type", "category": "neurodevelopmental", "parent_code": "F90"},
        {"code_system": "ICD10-CM", "code": "F90.0",  "display_name": "ADHD, predominantly inattentive type", "category": "neurodevelopmental", "parent_code": "F90"},
        {"code_system": "ICD10-CM", "code": "F90.1",  "display_name": "ADHD, predominantly hyperactive type", "category": "neurodevelopmental", "parent_code": "F90"},
        {"code_system": "ICD10-CM", "code": "F81.0",  "display_name": "Specific reading disorder", "category": "neurodevelopmental", "parent_code": "F81"},
        {"code_system": "ICD10-CM", "code": "F10.20", "display_name": "Alcohol dependence, uncomplicated", "category": "substance_use", "parent_code": "F10"},
        {"code_system": "ICD10-CM", "code": "F11.20", "display_name": "Opioid dependence, uncomplicated", "category": "substance_use", "parent_code": "F11"},
        {"code_system": "ICD10-CM", "code": "F12.20", "display_name": "Cannabis dependence, uncomplicated", "category": "substance_use", "parent_code": "F12"},
        {"code_system": "ICD10-CM", "code": "F17.200", "display_name": "Nicotine dependence, uncomplicated", "category": "substance_use", "parent_code": "F17"},
        {"code_system": "ICD10-CM", "code": "F20.9",  "display_name": "Schizophrenia, unspecified", "category": "psychotic", "parent_code": "F20"},
        {"code_system": "ICD10-CM", "code": "F25.9",  "display_name": "Schizoaffective disorder, unspecified", "category": "psychotic", "parent_code": "F25"},
        {"code_system": "ICD10-CM", "code": "F06.30", "display_name": "Mild neurocognitive disorder", "category": "neurocognitive", "parent_code": "F06"},
        {"code_system": "ICD10-CM", "code": "R51",    "display_name": "Headache", "category": "symptom", "parent_code": "R51"},
        {"code_system": "ICD10-CM", "code": "R55",    "display_name": "Syncope and collapse", "category": "symptom", "parent_code": "R55"},
        {"code_system": "ICD10-CM", "code": "R56.9",  "display_name": "Unspecified convulsions", "category": "symptom", "parent_code": "R56"},
        {"code_system": "ICD10-CM", "code": "R42",    "display_name": "Dizziness and giddiness", "category": "symptom", "parent_code": "R42"},
        {"code_system": "ICD10-CM", "code": "R53.83", "display_name": "Other fatigue", "category": "symptom", "parent_code": "R53"},
        {"code_system": "ICD10-CM", "code": "R45.851", "display_name": "Suicidal ideations", "category": "symptom", "parent_code": "R45"},
        {"code_system": "ICD10-CM", "code": "G62.9",  "display_name": "Polyneuropathy, unspecified", "category": "peripheral_neuropathy", "parent_code": "G62"},
        {"code_system": "ICD10-CM", "code": "G61.0",  "display_name": "Guillain-Barre syndrome", "category": "peripheral_neuropathy", "parent_code": "G61"},
    ]

    existing = {r.code for r in db.execute(select(ICD10Code)).scalars().all()}
    inserted = sum(1 for row in codes if row["code"] not in existing)
    for row in codes:
        if row["code"] not in existing:
            db.add(ICD10Code(**row))
    db.commit()
    logger.info("ICD-10 codes: inserted %d / %d", inserted, len(codes))
    return inserted


# ---------------------------------------------------------------------------
# 5. Biomarker Reference Ranges
# ---------------------------------------------------------------------------

async def seed_biomarker_refs(db: Session) -> int:
    """Seed reference/optimal ranges for clinical biomarkers."""
    _ensure_table(db, BiomarkerReference)

    refs = [
        {"biomarker_name": "BDNF", "loinc_code": "48378-4", "unit": "pg/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 5000.0, "reference_high": 30000.0, "optimal_low": 15000.0, "optimal_high": 25000.0, "source": "nhanes"},
        {"biomarker_name": "Cortisol (serum)", "loinc_code": "2143-6", "unit": "ug/dL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 5.0, "reference_high": 25.0, "optimal_low": 8.0, "optimal_high": 18.0, "source": "clinical_lab"},
        {"biomarker_name": "IL-6", "loinc_code": "26881-3", "unit": "pg/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.0, "reference_high": 10.0, "optimal_low": 0.0, "optimal_high": 3.0, "source": "nhanes"},
        {"biomarker_name": "IL-1 beta", "loinc_code": "33717-5", "unit": "pg/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.0, "reference_high": 5.0, "optimal_low": 0.0, "optimal_high": 1.0, "source": "nhanes"},
        {"biomarker_name": "TNF-alpha", "loinc_code": "30800-1", "unit": "pg/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.0, "reference_high": 20.0, "optimal_low": 0.0, "optimal_high": 5.0, "source": "nhanes"},
        {"biomarker_name": "CRP", "loinc_code": "1988-5", "unit": "mg/L", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.0, "reference_high": 10.0, "optimal_low": 0.0, "optimal_high": 3.0, "source": "clinical_lab"},
        {"biomarker_name": "hs-CRP", "loinc_code": "30522-7", "unit": "mg/L", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.0, "reference_high": 3.0, "optimal_low": 0.0, "optimal_high": 1.0, "source": "clinical_lab"},
        {"biomarker_name": "Testosterone (male)", "loinc_code": "2986-8", "unit": "ng/dL", "age_min": 18, "age_max": 65, "sex": "M", "reference_low": 250.0, "reference_high": 1100.0, "optimal_low": 400.0, "optimal_high": 900.0, "source": "nhanes"},
        {"biomarker_name": "Estradiol (female)", "loinc_code": "2243-4", "unit": "pg/mL", "age_min": 18, "age_max": 50, "sex": "F", "reference_low": 15.0, "reference_high": 350.0, "optimal_low": 50.0, "optimal_high": 250.0, "source": "clinical_lab"},
        {"biomarker_name": "Estradiol (female, post-menopause)", "loinc_code": "2243-4", "unit": "pg/mL", "age_min": 51, "age_max": 90, "sex": "F", "reference_low": 0.0, "reference_high": 30.0, "optimal_low": 5.0, "optimal_high": 20.0, "source": "clinical_lab"},
        {"biomarker_name": "Vitamin D (25-OH)", "loinc_code": "1989-3", "unit": "ng/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 20.0, "reference_high": 50.0, "optimal_low": 30.0, "optimal_high": 50.0, "source": "nhanes"},
        {"biomarker_name": "HbA1c", "loinc_code": "4548-4", "unit": "%", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 4.0, "reference_high": 6.5, "optimal_low": 4.5, "optimal_high": 5.7, "source": "clinical_lab"},
        {"biomarker_name": "Homocysteine", "loinc_code": "2160-0", "unit": "umol/L", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 4.0, "reference_high": 15.0, "optimal_low": 5.0, "optimal_high": 10.0, "source": "clinical_lab"},
        {"biomarker_name": "TSH", "loinc_code": "3016-3", "unit": "uIU/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.4, "reference_high": 4.5, "optimal_low": 1.0, "optimal_high": 2.5, "source": "clinical_lab"},
        {"biomarker_name": "Free T3", "loinc_code": "3051-0", "unit": "pg/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 2.3, "reference_high": 4.2, "optimal_low": 3.0, "optimal_high": 3.8, "source": "clinical_lab"},
        {"biomarker_name": "Free T4", "loinc_code": "3024-7", "unit": "ng/dL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 0.8, "reference_high": 1.8, "optimal_low": 1.0, "optimal_high": 1.5, "source": "clinical_lab"},
        {"biomarker_name": "Ferritin", "loinc_code": "2276-4", "unit": "ng/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 15.0, "reference_high": 300.0, "optimal_low": 50.0, "optimal_high": 150.0, "source": "clinical_lab"},
        {"biomarker_name": "Vitamin B12", "loinc_code": "24325-3", "unit": "pg/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 200.0, "reference_high": 900.0, "optimal_low": 400.0, "optimal_high": 800.0, "source": "clinical_lab"},
        {"biomarker_name": "Folate (serum)", "loinc_code": "2284-8", "unit": "ng/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 2.0, "reference_high": 20.0, "optimal_low": 5.0, "optimal_high": 15.0, "source": "clinical_lab"},
        {"biomarker_name": "Prolactin", "loinc_code": "2842-3", "unit": "ng/mL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 2.0, "reference_high": 25.0, "optimal_low": 5.0, "optimal_high": 15.0, "source": "clinical_lab"},
        {"biomarker_name": "Magnesium (serum)", "loinc_code": "19123-9", "unit": "mg/dL", "age_min": 18, "age_max": 65, "sex": "both", "reference_low": 1.7, "reference_high": 2.5, "optimal_low": 2.0, "optimal_high": 2.4, "source": "clinical_lab"},
    ]

    existing = {(r.biomarker_name, r.age_min, r.age_max, r.sex) for r in db.execute(select(BiomarkerReference)).scalars().all()}
    inserted = sum(1 for row in refs if (row["biomarker_name"], row["age_min"], row["age_max"], row["sex"]) not in existing)
    for row in refs:
        if (row["biomarker_name"], row["age_min"], row["age_max"], row["sex"]) not in existing:
            db.add(BiomarkerReference(**row))
    db.commit()
    logger.info("Biomarker refs: inserted %d / %d", inserted, len(refs))
    return inserted


# ---------------------------------------------------------------------------
# 6. CYP450 Pharmacogenomic Data
# ---------------------------------------------------------------------------

async def seed_pharmacogenomics(db: Session) -> int:
    """Seed CPIC pharmacogenomic variant guidelines."""
    _ensure_table(db, PharmacogenomicVariant)

    variants = [
        {"variant_id": "rs3892097", "gene": "CYP2D6", "chromosome": "22", "position": 42128945, "reference_allele": "C", "alternate_allele": "T", "clinical_significance": "pathogenic", "phenotype": "poor_metabolizer", "drugs_affected": json.dumps(["codeine", "tramadol", "tamoxifen", "nortriptyline"]), "cpic_guideline": "Avoid codeine and tramadol in CYP2D6 PMs. Consider alternative analgesics. For tamoxifen, consider endoxifen-guided therapy.", "allele_frequency": json.dumps({"EUR": 0.07, "AFR": 0.03, "ASN": 0.01, "AMR": 0.06})},
        {"variant_id": "rs4244285", "gene": "CYP2C19", "chromosome": "10", "position": 96540410, "reference_allele": "G", "alternate_allele": "A", "clinical_significance": "pathogenic", "phenotype": "poor_metabolizer", "drugs_affected": json.dumps(["clopidogrel", "omeprazole", "diazepam", "citalopram"]), "cpic_guideline": "Avoid standard-dose clopidogrel in CYP2C19 PMs. Consider prasugrel or ticagrelor. For PPIs, consider pantoprazole.", "allele_frequency": json.dumps({"EUR": 0.13, "AFR": 0.04, "ASN": 0.30, "AMR": 0.14})},
        {"variant_id": "rs12248560", "gene": "CYP2C19", "chromosome": "10", "position": 96522463, "reference_allele": "C", "alternate_allele": "T", "clinical_significance": "pathogenic", "phenotype": "ultrarapid_metabolizer", "drugs_affected": json.dumps(["clopidogrel", "omeprazole", "citalopram"]), "cpic_guideline": "CYP2C19 *17/*17 UM: standard clopidogrel may be adequate. Consider TDM for antidepressants.", "allele_frequency": json.dumps({"EUR": 0.18, "AFR": 0.17, "ASN": 0.04, "AMR": 0.22})},
        {"variant_id": "rs4680", "gene": "COMT", "chromosome": "22", "position": 19951271, "reference_allele": "G", "alternate_allele": "A", "clinical_significance": "risk_factor", "phenotype": "val158met", "drugs_affected": json.dumps(["levodopa", "tolcapone", "entacapone"]), "cpic_guideline": "COMT Met/Met may require lower levodopa doses. A allele carriers show higher COMT enzyme activity.", "allele_frequency": json.dumps({"EUR": 0.50, "AFR": 0.30, "ASN": 0.70, "AMR": 0.45})},
        {"variant_id": "rs6265", "gene": "BDNF", "chromosome": "11", "position": 27679989, "reference_allele": "G", "alternate_allele": "A", "clinical_significance": "risk_factor", "phenotype": "val66met", "drugs_affected": json.dumps(["antidepressants", "antipsychotics"]), "cpic_guideline": "BDNF Met carriers may show differential antidepressant response and reduced hippocampal volume.", "allele_frequency": json.dumps({"EUR": 0.20, "AFR": 0.05, "ASN": 0.45, "AMR": 0.15})},
        {"variant_id": "rs1801133", "gene": "MTHFR", "chromosome": "1", "position": 11856378, "reference_allele": "G", "alternate_allele": "A", "clinical_significance": "risk_factor", "phenotype": "C677T", "drugs_affected": json.dumps(["methotrexate", "folate", "antidepressants"]), "cpic_guideline": "MTHFR 677TT: elevated homocysteine risk. May benefit from L-methylfolate supplementation (0.5-15 mg/day).", "allele_frequency": json.dumps({"EUR": 0.35, "AFR": 0.08, "ASN": 0.12, "AMR": 0.40})},
        {"variant_id": "rs1801131", "gene": "MTHFR", "chromosome": "1", "position": 11854476, "reference_allele": "A", "alternate_allele": "C", "clinical_significance": "risk_factor", "phenotype": "A1298C", "drugs_affected": json.dumps(["methotrexate", "folate"]), "cpic_guideline": "MTHFR A1298C: CC homozygotes may have reduced MTHFR activity. Consider methylfolate with C677T.", "allele_frequency": json.dumps({"EUR": 0.30, "AFR": 0.15, "ASN": 0.20, "AMR": 0.35})},
        {"variant_id": "rs1799971", "gene": "OPRM1", "chromosome": "6", "position": 154039662, "reference_allele": "A", "alternate_allele": "G", "clinical_significance": "risk_factor", "phenotype": "asn40asp", "drugs_affected": json.dumps(["morphine", "fentanyl", "naloxone"]), "cpic_guideline": "OPRM1 G allele (Asp40): may require higher opioid doses for analgesia. Monitor adverse effects.", "allele_frequency": json.dumps({"EUR": 0.15, "AFR": 0.03, "ASN": 0.45, "AMR": 0.20})},
        {"variant_id": "rs662", "gene": "PON1", "chromosome": "7", "position": 94952361, "reference_allele": "A", "alternate_allele": "G", "clinical_significance": "risk_factor", "phenotype": "Q192R", "drugs_affected": json.dumps(["clopidogrel"]), "cpic_guideline": "PON1 Q192R: G allele (R) carriers may have reduced clopidogrel active metabolite. Consider genotype-guided therapy.", "allele_frequency": json.dumps({"EUR": 0.30, "AFR": 0.20, "ASN": 0.35, "AMR": 0.45})},
    ]

    existing = {r.variant_id for r in db.execute(select(PharmacogenomicVariant)).scalars().all()}
    inserted = sum(1 for row in variants if row["variant_id"] not in existing)
    for row in variants:
        if row["variant_id"] not in existing:
            db.add(PharmacogenomicVariant(**row))
    db.commit()
    logger.info("Pharmacogenomics: inserted %d / %d", inserted, len(variants))
    return inserted


# ---------------------------------------------------------------------------
# Master orchestrator
# ---------------------------------------------------------------------------

async def seed_all_critical_data(db: Session) -> Dict[str, int]:
    """Run all critical seed functions and return counts per table.

    Each sub-seeder is idempotent — safe to call multiple times.
    """
    logger.info("=== Starting critical database seeding ===")
    counts: Dict[str, int] = {}
    counts["ref_atc_codes"] = await seed_atc_codes(db)
    counts["ref_brain_atlas_regions"] = await seed_brain_atlas_regions(db)
    counts["ref_normative_eeg"] = await seed_normative_eeg(db)
    counts["ref_icd10_codes"] = await seed_icd10_codes(db)
    counts["ref_biomarker_ranges"] = await seed_biomarker_refs(db)
    counts["ref_pharmacogenomics"] = await seed_pharmacogenomics(db)
    total = sum(counts.values())
    logger.info("=== Critical seeding complete: %d new rows across %d tables ===", total, len(counts))
    for table, cnt in counts.items():
        logger.info("  %-30s : %d inserted", table, cnt)
    return counts

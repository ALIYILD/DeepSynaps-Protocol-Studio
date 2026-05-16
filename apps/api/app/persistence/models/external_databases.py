"""External database local cache — DrugBank, RxNorm, ClinVar, PubMed, NIH, USDA, ICD-10, etc.

Each table serves as a *cache layer*: authoritative data always lives upstream,
but hot-path reads (medication interactions, genetic variants, normative EEG,
atlas lookups, evidence retrieval) avoid round-trips to external APIs by
serving local rows.  ``cached_at`` columns drive TTL-based invalidation.

Tables:
  - cached_drugs              (DrugBank, RxNorm, OpenFDA)
  - cached_genetic_variants   (ClinVar, PharmGKB)
  - brain_atlas_regions       (AAL, FreeSurfer, Brodmann)
  - normative_eeg_values      (NIH Normative, NeuroGuide)
  - cached_evidence_items     (PubMed, Cochrane)
  - cached_clinical_trials    (ClinicalTrials.gov)
  - cached_outcome_norms      (NIH PROMIS, NCH norms)
  - cached_biomarker_refs     (NHANES, clinical lab)
  - cached_food_items         (USDA FoodData Central)
  - cached_medical_codes      (ICD-10-CM, SNOMED CT, LOINC)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)

from ._base import (
    Base,
    Boolean,
    DateTime,
    Integer,
    Mapped,
    mapped_column,
    timezone,
    uuid,
)


# ── 1. Drug Databases ────────────────────────────────────────────────────────

class CachedDrug(Base):
    """Local cache of drug monographs (DrugBank, RxNorm, OpenFDA, etc.).

    Brand names, ATC/NDC codes, indications and interactions are stored as
    JSON arrays/objects so multi-source records can normalise to one row.
    """

    __tablename__ = "cached_drugs"
    __table_args__ = (
        Index("ix_cached_drugs_source_name", "source", "name"),
        UniqueConstraint("drugbank_id", "source", name="uq_cached_drugs_drugbank_source"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    drugbank_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    rxnorm_cui: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    name: Mapped[Optional[str]] = mapped_column(String(512), index=True)
    generic_name: Mapped[Optional[str]] = mapped_column(String(512))
    brand_names: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    atc_codes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    ndc_codes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    mechanism: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    indications: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    contraindications: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    side_effects: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    drug_interactions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    dosage_forms: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    categories: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(32))
    evidence_grade: Mapped[str] = mapped_column(String(8), default="B")
    provenance: Mapped[str] = mapped_column(String(32), default="external")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 2. Genetic / Pharmacogenomic ────────────────────────────────────────────

class CachedGeneticVariant(Base):
    """Local cache of genetic variant annotations (ClinVar, PharmGKB).

    Allele frequencies are stored as JSON objects keyed by population code
    (e.g. ``{"EUR": 0.15, "AFR": 0.25}``) for flexible multi-source
    ingestion.
    """

    __tablename__ = "cached_genetic_variants"
    __table_args__ = (
        Index(
            "ix_cached_genetic_variants_gene_clin",
            "gene",
            "clinical_significance",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    variant_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    gene: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    chromosome: Mapped[Optional[str]] = mapped_column(String(8))
    position: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    reference_allele: Mapped[Optional[str]] = mapped_column(String(16))
    alternate_allele: Mapped[Optional[str]] = mapped_column(String(16))
    clinical_significance: Mapped[Optional[str]] = mapped_column(String(32))
    phenotype: Mapped[Optional[str]] = mapped_column(String(255))
    drugs_affected: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    cpic_guideline: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    allele_frequency: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(32))
    evidence_grade: Mapped[str] = mapped_column(String(8), default="B")
    provenance: Mapped[str] = mapped_column(String(32), default="external")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 3. Neuroimaging Atlases ─────────────────────────────────────────────────

class BrainAtlasRegion(Base):
    """Brain atlas region definitions (AAL, FreeSurfer, Brodmann, etc.).

    Stores MNI coordinates, volumetrics, associated cognitive functions and
    neuromodulation targets so the DeepSynaps stim planner can resolve
    atlas-to-target mappings offline.
    """

    __tablename__ = "brain_atlas_regions"
    __table_args__ = (
        Index("ix_brain_atlas_region_atlas_hemi", "atlas", "hemisphere"),
        UniqueConstraint(
            "atlas", "region_id", name="uq_brain_atlas_region_atlas_rid"
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    atlas: Mapped[str] = mapped_column(String(32), index=True)
    region_id: Mapped[str] = mapped_column(String(32), index=True)
    region_name: Mapped[Optional[str]] = mapped_column(String(512))
    hemisphere: Mapped[Optional[str]] = mapped_column(String(16))
    mni_x: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    mni_y: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    mni_z: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    volume_mm3: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    associated_functions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    stimulation_targets: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(64))
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 4. Normative EEG ────────────────────────────────────────────────────────

class NormativeEEGValue(Base):
    """Normative EEG amplitude / power values stratified by age band.

    One row per (electrode × frequency_band × age_min … age_max) cohort.
    Percentiles (p5, p95) are stored alongside mean/std for non-parametric
    outlier detection in QEEG comparison pipelines.
    """

    __tablename__ = "normative_eeg_values"
    __table_args__ = (
        Index(
            "ix_normative_eeg_elec_band_age",
            "electrode",
            "frequency_band",
            "age_min",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    electrode: Mapped[str] = mapped_column(String(8), index=True)
    frequency_band: Mapped[str] = mapped_column(String(16), index=True)
    age_min: Mapped[int] = mapped_column(Integer())
    age_max: Mapped[int] = mapped_column(Integer())
    mean: Mapped[float] = mapped_column(Float())
    std: Mapped[float] = mapped_column(Float())
    median: Mapped[float] = mapped_column(Float())
    p5: Mapped[float] = mapped_column(Float())
    p95: Mapped[float] = mapped_column(Float())
    n_subjects: Mapped[int] = mapped_column(Integer())
    source: Mapped[str] = mapped_column(String(64))
    evidence_grade: Mapped[str] = mapped_column(String(8), default="B")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 5. Evidence ─────────────────────────────────────────────────────────────

class CachedEvidenceItem(Base):
    """Local cache of literature evidence (PubMed, Cochrane Library).

    ``relevance_score`` is a composite float (DeepSynaps ranking) while
    ``decay_status`` drives automatic archival of stale cache rows.
    """

    __tablename__ = "cached_evidence_items"
    __table_args__ = (
        Index("ix_cached_evidence_year_grade", "year", "evidence_grade"),
        Index("ix_cached_evidence_relevance", "relevance_score"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    evidence_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    title: Mapped[Optional[str]] = mapped_column(String(1024))
    authors: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    journal: Mapped[Optional[str]] = mapped_column(String(512))
    year: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    doi: Mapped[Optional[str]] = mapped_column(String(256), index=True)
    pmid: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_grade: Mapped[str] = mapped_column(String(8), default="B")
    study_type: Mapped[Optional[str]] = mapped_column(String(64))
    modalities: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    conditions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    interventions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    outcomes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    relevance_score: Mapped[float] = mapped_column(Float(), default=0.0)
    decay_status: Mapped[str] = mapped_column(String(16), default="current")
    source: Mapped[str] = mapped_column(String(32), default="pubmed")
    provenance: Mapped[str] = mapped_column(String(32), default="external")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 6. Clinical Trials ──────────────────────────────────────────────────────

class CachedClinicalTrial(Base):
    """Local cache of ClinicalTrials.gov trial records.

    ``results_available`` is a boolean flag populated when the trial has
    posted results on ClinicalTrials.gov so the evidence pipeline can
    prefer completed trials with data.
    """

    __tablename__ = "cached_clinical_trials"
    __table_args__ = (
        Index("ix_cached_trials_status_phase", "status", "phase"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    nct_id: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[Optional[str]] = mapped_column(String(1024))
    status: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    phase: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    conditions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    interventions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    modality: Mapped[Optional[str]] = mapped_column(String(64))
    enrollment_count: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    primary_outcome: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    results_available: Mapped[bool] = mapped_column(Boolean(), default=False)
    source: Mapped[str] = mapped_column(String(32), default="clinicaltrials.gov")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 7. Outcome Measures ─────────────────────────────────────────────────────

class CachedOutcomeNorm(Base):
    """Normative values for rehabilitation / neuropsych outcome measures.

    Rows capture (measure × age band × population) cohort statistics so
    DeepSynaps can auto-flag patient scores as within/outside normal
    ranges during assessment interpretation.
    """

    __tablename__ = "cached_outcome_norms"
    __table_args__ = (
        Index(
            "ix_cached_outcome_norms_measure_pop_age",
            "measure_name",
            "population",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    measure_name: Mapped[str] = mapped_column(String(128), index=True)
    measure_code: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    age_min: Mapped[int] = mapped_column(Integer())
    age_max: Mapped[int] = mapped_column(Integer())
    population: Mapped[str] = mapped_column(String(64))
    mean: Mapped[float] = mapped_column(Float())
    std: Mapped[float] = mapped_column(Float())
    min_value: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    max_value: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    n_subjects: Mapped[int] = mapped_column(Integer())
    source: Mapped[str] = mapped_column(String(64))
    evidence_grade: Mapped[str] = mapped_column(String(8), default="B")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 8. Biomarker Reference ──────────────────────────────────────────────────

class CachedBiomarkerRef(Base):
    """Reference / optimal ranges for neuro-related biomarkers.

    Typical analytes: BDNF, cortisol, hs-CRP, homocysteine, vitamin D, etc.
    Age, sex and population stratification allow precise flagging in the
    Labs Analyzer.
    """

    __tablename__ = "cached_biomarker_refs"
    __table_args__ = (
        Index(
            "ix_cached_biomarker_name_age_sex",
            "biomarker_name",
            "age_min",
            "sex",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    biomarker_name: Mapped[str] = mapped_column(String(128), index=True)
    loinc_code: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32))
    age_min: Mapped[int] = mapped_column(Integer())
    age_max: Mapped[int] = mapped_column(Integer())
    sex: Mapped[str] = mapped_column(String(8))
    reference_low: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    reference_high: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    optimal_low: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    optimal_high: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    source: Mapped[str] = mapped_column(String(64))
    evidence_grade: Mapped[str] = mapped_column(String(8), default="B")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 9. Nutrition Database ───────────────────────────────────────────────────

class CachedFoodItem(Base):
    """Nutrition data cache from USDA FoodData Central.

    The ``nutrients`` column stores a JSON object keyed by nutrient name
    with gram/mg/µg values (e.g. ``{"protein": 25.0, "fat": 10.0}``).
    """

    __tablename__ = "cached_food_items"
    __table_args__ = (
        Index("ix_cached_food_category", "food_category"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    fdc_id: Mapped[int] = mapped_column(Integer(), index=True)
    name: Mapped[str] = mapped_column(String(512), index=True)
    food_category: Mapped[Optional[str]] = mapped_column(String(128))
    nutrients: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    portion_size: Mapped[Optional[str]] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(32), default="usda")
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── 10. Medical Coding ──────────────────────────────────────────────────────

class CachedMedicalCode(Base):
    """Medical coding standards (ICD-10-CM, SNOMED CT, LOINC).

    Parent-code references build navigable code hierarchies so the
    autocomplete and cross-mapping pipelines can traverse trees offline.
    """

    __tablename__ = "cached_medical_codes"
    __table_args__ = (
        Index("ix_cached_medical_codes_system_code", "code_system", "code"),
        Index("ix_cached_medical_codes_parent", "parent_code"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    code_system: Mapped[str] = mapped_column(String(32), index=True)
    code: Mapped[str] = mapped_column(String(64), index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(512))
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    parent_code: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    category: Mapped[Optional[str]] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(64))
    cached_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )

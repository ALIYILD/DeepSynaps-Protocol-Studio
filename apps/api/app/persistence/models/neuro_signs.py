"""
NeuroSign Models — clinical education and structured reporting module.

Three core tables:
1. NeuroSign — master library of MRI signs
2. CaseNeuroSign — clinician selections on patient MRI cases
3. NeuroSignAnnotation — SVG overlay coordinates for future ML
"""

from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, ForeignKey, JSON, Index,
    UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from ._base import Base


class NeuroSign(Base):
    """Master library of classic MRI neuro signs."""
    __tablename__ = 'neuro_signs'

    # Identity
    id = Column(String(128), primary_key=True, index=True)
    slug = Column(String(256), unique=True, nullable=False, index=True)
    name = Column(String(256), nullable=False, index=True)
    
    # Categorization
    category = Column(String(64), nullable=False, index=True)  # neurodegenerative, demyelinating, vascular, etc.
    modality = Column(String(64), nullable=False)  # MRI, CT, angiography
    
    # Medical context (JSON arrays for flexibility)
    sequences = Column(JSON, nullable=True)  # ["T1", "T2", "FLAIR", ...]
    anatomy = Column(JSON, nullable=True)  # ["midbrain", "pons", ...]
    aliases = Column(JSON, nullable=True)  # ["penguin sign", "king penguin sign"]
    
    # Conditions
    primary_conditions = Column(JSON, nullable=True)  # ["progressive supranuclear palsy"]
    associated_conditions = Column(JSON, nullable=True)  # other relevant conditions
    
    # Clinical narrative
    visual_description = Column(Text, nullable=True)
    pathophysiology_explanation = Column(Text, nullable=True)
    # SAFETY-FIX C-006: differential_diagnosis renamed to clinical_observations — clinical observation only
    clinical_observations = Column(Text, nullable=True)
    reporting_phrase = Column(Text, nullable=True)
    clinical_caveat = Column(Text, nullable=True)
    evidence_notes = Column(Text, nullable=True)
    
    # Evidence/sources
    source_refs = Column(JSON, nullable=True)  # [{"title": "...", "url": "...", "year": 2024}, ...]
    
    # Media
    image_url = Column(String(512), nullable=True)
    thumbnail_url = Column(String(512), nullable=True)
    image_license = Column(String(128), nullable=True)  # CC0, CC-BY, public domain, etc.
    
    # Publication
    is_published = Column(Boolean, default=True, index=True)
    
    # Audit
    created_by = Column(String(128), nullable=True)
    updated_by = Column(String(128), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    case_signs = relationship("CaseNeuroSign", back_populates="neuro_sign", cascade="all, delete-orphan")
    annotations = relationship("NeuroSignAnnotation", back_populates="neuro_sign", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_neuro_signs_category_published', 'category', 'is_published'),
        Index('ix_neuro_signs_name_published', 'name', 'is_published'),
    )


class CaseNeuroSign(Base):
    """Clinician selection of signs attached to a patient MRI case."""
    __tablename__ = 'case_neuro_signs'

    # Identity
    id = Column(String(128), primary_key=True, index=True)
    case_id = Column(String(128), nullable=False, index=True)  # FK to patient study/case
    
    # Sign reference
    neuro_sign_id = Column(String(128), ForeignKey('neuro_signs.id'), nullable=False, index=True)
    
    # Clinician context
    clinician_id = Column(String(128), nullable=True, index=True)
    
    # Clinical judgment
    confidence = Column(
        String(32),
        nullable=False,
        default='possible',
        index=True,
        # Enum-like: possible, probable, characteristic, ruled_out
    )
    note = Column(Text, nullable=True)  # Clinician's free-text annotation
    
    # Image reference
    image_series_id = Column(String(128), nullable=True)  # DICOM series UID if applicable
    slice_index = Column(Integer, nullable=True)  # slice number if applicable
    annotation_id = Column(String(128), ForeignKey('neuro_sign_annotations.id'), nullable=True)
    
    # Report integration
    inserted_into_report = Column(Boolean, default=False, index=True)
    
    # Audit
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    neuro_sign = relationship("NeuroSign", back_populates="case_signs")
    
    __table_args__ = (
        UniqueConstraint('case_id', 'neuro_sign_id', 'clinician_id', name='uq_case_sign_clinician'),
        Index('ix_case_neuro_signs_case_created', 'case_id', 'created_at'),
        CheckConstraint(
            "confidence IN ('possible', 'probable', 'characteristic', 'ruled_out')",
            name='ck_case_neuro_signs_confidence'
        ),
    )


class NeuroSignAnnotation(Base):
    """SVG overlay annotations for sign reference images (future ML support)."""
    __tablename__ = 'neuro_sign_annotations'

    # Identity
    id = Column(String(128), primary_key=True, index=True)
    neuro_sign_id = Column(String(128), ForeignKey('neuro_signs.id'), nullable=False, index=True)
    
    # Image reference
    image_url = Column(String(512), nullable=True)
    
    # Annotation shape (SVG-friendly)
    shape_type = Column(String(32), nullable=False)  # polygon, rectangle, ellipse, arrow, point
    coordinates = Column(JSON, nullable=False)  # [[x%, y%], ...] percentages for responsiveness
    label = Column(String(256), nullable=True)
    color = Column(String(32), nullable=True)  # hex or CSS color
    
    # Audit
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    neuro_sign = relationship("NeuroSign", back_populates="annotations")
    
    __table_args__ = (
        Index('ix_neuro_sign_annotations_sign', 'neuro_sign_id'),
        CheckConstraint(
            "shape_type IN ('polygon', 'rectangle', 'ellipse', 'arrow', 'point')",
            name='ck_annotation_shape_type'
        ),
    )

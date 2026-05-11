"""
Pydantic schemas for NeuroSign API endpoints.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class NeuroSignSourceRef(BaseModel):
    """Evidence source reference."""
    title: str
    url: Optional[str] = None
    year: Optional[int] = None
    
    class Config:
        frozen = True


class NeuroSignBase(BaseModel):
    """Base schema for NeuroSign (shared between create/update/response)."""
    name: str
    slug: str
    category: str  # neurodegenerative, demyelinating, vascular, etc.
    modality: str  # MRI, CT, angiography
    
    sequences: Optional[List[str]] = Field(default=None)  # ["T1", "T2", ...]
    anatomy: Optional[List[str]] = Field(default=None)  # ["midbrain", "pons"]
    aliases: Optional[List[str]] = Field(default=None)
    
    primary_conditions: Optional[List[str]] = Field(default=None)
    associated_conditions: Optional[List[str]] = Field(default=None)
    
    visual_description: Optional[str] = None
    pathophysiology_explanation: Optional[str] = None
    differential_diagnosis: Optional[str] = None
    reporting_phrase: Optional[str] = None
    clinical_caveat: Optional[str] = None
    evidence_notes: Optional[str] = None
    
    source_refs: Optional[List[NeuroSignSourceRef]] = Field(default=None)
    
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    image_license: Optional[str] = None
    
    is_published: bool = Field(default=True)


class NeuroSignCreate(NeuroSignBase):
    """Schema for creating a new sign (admin only)."""
    pass


class NeuroSignUpdate(BaseModel):
    """Schema for updating an existing sign (admin only, partial)."""
    name: Optional[str] = None
    category: Optional[str] = None
    modality: Optional[str] = None
    
    sequences: Optional[List[str]] = None
    anatomy: Optional[List[str]] = None
    aliases: Optional[List[str]] = None
    
    primary_conditions: Optional[List[str]] = None
    associated_conditions: Optional[List[str]] = None
    
    visual_description: Optional[str] = None
    pathophysiology_explanation: Optional[str] = None
    differential_diagnosis: Optional[str] = None
    reporting_phrase: Optional[str] = None
    clinical_caveat: Optional[str] = None
    evidence_notes: Optional[str] = None
    
    source_refs: Optional[List[NeuroSignSourceRef]] = None
    
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    image_license: Optional[str] = None
    
    is_published: Optional[bool] = None


class NeuroSignResponse(NeuroSignBase):
    """Schema for responding with a sign detail."""
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    
    class Config:
        from_attributes = True


class CaseNeuroSignCreate(BaseModel):
    """Schema for attaching a sign to a case."""
    neuro_sign_id: str
    confidence: str = Field(default='possible')  # possible, probable, characteristic, ruled_out
    note: Optional[str] = None
    clinician_id: Optional[str] = None
    image_series_id: Optional[str] = None
    slice_index: Optional[int] = None


class CaseNeuroSignUpdate(BaseModel):
    """Schema for updating a case sign attachment."""
    confidence: Optional[str] = None
    note: Optional[str] = None
    inserted_into_report: Optional[bool] = None


class CaseNeuroSignResponse(BaseModel):
    """Schema for responding with a case sign."""
    id: str
    case_id: str
    neuro_sign_id: str
    clinician_id: Optional[str] = None
    confidence: str
    note: Optional[str] = None
    image_series_id: Optional[str] = None
    slice_index: Optional[int] = None
    inserted_into_report: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class NeuroSignAnnotationCreate(BaseModel):
    """Schema for creating an annotation."""
    neuro_sign_id: str
    shape_type: str  # polygon, rectangle, ellipse, arrow, point
    coordinates: List[List[float]]  # [[x%, y%], ...]
    label: Optional[str] = None
    color: Optional[str] = None


class NeuroSignAnnotationResponse(BaseModel):
    """Schema for responding with an annotation."""
    id: str
    neuro_sign_id: str
    shape_type: str
    coordinates: List[List[float]]
    label: Optional[str] = None
    color: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class NeuroSignListResponse(BaseModel):
    """Schema for list endpoint response."""
    items: List[NeuroSignResponse]
    total: int
    skip: int
    limit: int

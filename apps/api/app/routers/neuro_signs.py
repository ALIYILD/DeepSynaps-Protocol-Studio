"""
Neuro MRI Signs API routes.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
import uuid

from app.database import get_db
from app.persistence.models.neuro_signs import (
    NeuroSign, CaseNeuroSign, NeuroSignAnnotation
)
from app.schemas.neuro_signs import (
    NeuroSignCreate, NeuroSignUpdate, NeuroSignResponse, NeuroSignListResponse,
    CaseNeuroSignCreate, CaseNeuroSignUpdate, CaseNeuroSignResponse,
    NeuroSignAnnotationCreate, NeuroSignAnnotationResponse
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/neuro-signs", tags=["neuro-signs"])


def _is_admin(current_user) -> bool:
    """Check if current user is admin."""
    return getattr(current_user, 'is_admin', False) or getattr(current_user, 'role', None) == 'admin'


# ==============================================================================
# LIST & SEARCH
# ==============================================================================

@router.get("/", response_model=NeuroSignListResponse)
async def list_neuro_signs(
    q: Optional[str] = Query(None, description="Search term (name, aliases, conditions)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    anatomy: Optional[str] = Query(None, description="Filter by anatomy"),
    modality: Optional[str] = Query(None, description="Filter by modality"),
    sequence: Optional[str] = Query(None, description="Filter by MRI sequence"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    List neuro signs with optional search and filters.
    """
    query = db.query(NeuroSign).filter(NeuroSign.is_published == True)
    
    # Full-text search
    if q:
        search_term = f"%{q}%"
        query = query.filter(
            or_(
                NeuroSign.name.ilike(search_term),
                NeuroSign.visual_description.ilike(search_term),
                NeuroSign.pathophysiology_explanation.ilike(search_term),
                # For JSON arrays, use text-based search (approximate)
                NeuroSign.aliases.cast(str).ilike(search_term),
                NeuroSign.primary_conditions.cast(str).ilike(search_term),
            )
        )
    
    # Faceted filters
    if category:
        query = query.filter(NeuroSign.category == category)
    if modality:
        query = query.filter(NeuroSign.modality == modality)
    
    # For JSON array filters, use text-based matching
    if anatomy:
        query = query.filter(NeuroSign.anatomy.cast(str).ilike(f"%{anatomy}%"))
    if sequence:
        query = query.filter(NeuroSign.sequences.cast(str).ilike(f"%{sequence}%"))
    
    total = query.count()
    signs = query.order_by(NeuroSign.name).offset(skip).limit(limit).all()
    
    return NeuroSignListResponse(
        items=[NeuroSignResponse.from_orm(s) for s in signs],
        total=total,
        skip=skip,
        limit=limit,
    )


# ==============================================================================
# DETAIL
# ==============================================================================

@router.get("/{sign_id}", response_model=NeuroSignResponse)
async def get_neuro_sign(
    sign_id: str,
    db: Session = Depends(get_db),
):
    """
    Get full detail for a sign by ID or slug.
    """
    sign = db.query(NeuroSign).filter(
        or_(NeuroSign.id == sign_id, NeuroSign.slug == sign_id)
    ).first()
    
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    
    if not sign.is_published:
        raise HTTPException(status_code=404, detail="Sign not published")
    
    return NeuroSignResponse.from_orm(sign)


# ==============================================================================
# CREATE (ADMIN ONLY)
# ==============================================================================

@router.post("/", response_model=NeuroSignResponse, status_code=status.HTTP_201_CREATED)
async def create_neuro_sign(
    payload: NeuroSignCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new sign. Admin only.
    """
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify slug is unique
    existing = db.query(NeuroSign).filter(NeuroSign.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Slug already exists")
    
    sign = NeuroSign(
        id=str(uuid.uuid4()),
        **payload.dict(),
        created_by=getattr(current_user, 'id', None),
        updated_by=getattr(current_user, 'id', None),
    )
    db.add(sign)
    db.commit()
    db.refresh(sign)
    
    return NeuroSignResponse.from_orm(sign)


# ==============================================================================
# UPDATE (ADMIN ONLY)
# ==============================================================================

@router.put("/{sign_id}", response_model=NeuroSignResponse)
async def update_neuro_sign(
    sign_id: str,
    payload: NeuroSignUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update an existing sign. Admin only.
    """
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sign = db.query(NeuroSign).filter(
        or_(NeuroSign.id == sign_id, NeuroSign.slug == sign_id)
    ).first()
    
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    
    # Update only provided fields
    update_data = payload.dict(exclude_unset=True)
    update_data['updated_by'] = getattr(current_user, 'id', None)
    
    for key, value in update_data.items():
        setattr(sign, key, value)
    
    db.commit()
    db.refresh(sign)
    
    return NeuroSignResponse.from_orm(sign)


# ==============================================================================
# CASE INTEGRATION
# ==============================================================================

@router.post("/case/{case_id}/attach", response_model=CaseNeuroSignResponse, status_code=status.HTTP_201_CREATED)
async def attach_sign_to_case(
    case_id: str,
    payload: CaseNeuroSignCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Attach a sign to a patient MRI case.
    """
    # Verify sign exists
    sign = db.query(NeuroSign).filter(NeuroSign.id == payload.neuro_sign_id).first()
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    
    clinician_id = payload.clinician_id or getattr(current_user, 'id', None)
    
    # Check for duplicate (same clinician + sign + case)
    existing = db.query(CaseNeuroSign).filter(
        CaseNeuroSign.case_id == case_id,
        CaseNeuroSign.neuro_sign_id == payload.neuro_sign_id,
        CaseNeuroSign.clinician_id == clinician_id,
    ).first()
    
    if existing:
        raise HTTPException(status_code=409, detail="Sign already attached to case by this clinician")
    
    case_sign = CaseNeuroSign(
        id=str(uuid.uuid4()),
        case_id=case_id,
        neuro_sign_id=payload.neuro_sign_id,
        clinician_id=clinician_id,
        confidence=payload.confidence,
        note=payload.note,
        image_series_id=payload.image_series_id,
        slice_index=payload.slice_index,
    )
    db.add(case_sign)
    db.commit()
    db.refresh(case_sign)
    
    return CaseNeuroSignResponse.from_orm(case_sign)


@router.get("/case/{case_id}", response_model=List[CaseNeuroSignResponse])
async def get_case_neuro_signs(
    case_id: str,
    db: Session = Depends(get_db),
):
    """
    Get all signs attached to a case.
    """
    case_signs = db.query(CaseNeuroSign).filter(
        CaseNeuroSign.case_id == case_id
    ).order_by(CaseNeuroSign.created_at.desc()).all()
    
    return [CaseNeuroSignResponse.from_orm(cs) for cs in case_signs]


@router.put("/case/{case_sign_id}", response_model=CaseNeuroSignResponse)
async def update_case_neuro_sign(
    case_sign_id: str,
    payload: CaseNeuroSignUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update a case sign attachment (confidence, note, etc.).
    """
    case_sign = db.query(CaseNeuroSign).filter(CaseNeuroSign.id == case_sign_id).first()
    
    if not case_sign:
        raise HTTPException(status_code=404, detail="Case sign not found")
    
    # Update only provided fields
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(case_sign, key, value)
    
    db.commit()
    db.refresh(case_sign)
    
    return CaseNeuroSignResponse.from_orm(case_sign)


@router.delete("/case/{case_sign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_sign_from_case(
    case_sign_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a sign from a case.
    """
    case_sign = db.query(CaseNeuroSign).filter(CaseNeuroSign.id == case_sign_id).first()
    
    if not case_sign:
        raise HTTPException(status_code=404, detail="Case sign not found")
    
    db.delete(case_sign)
    db.commit()
    
    return None


@router.post("/case/{case_id}/insert-report", response_model=dict)
async def insert_report_phrase(
    case_id: str,
    payload: dict,  # {case_sign_id, custom_text?}
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Insert a sign's reporting phrase into the case report draft.
    Marks the case sign as inserted_into_report.
    """
    case_sign = db.query(CaseNeuroSign).filter(
        CaseNeuroSign.id == payload.get("case_sign_id")
    ).first()
    
    if not case_sign:
        raise HTTPException(status_code=404, detail="Case sign not found")
    
    # Get the sign
    sign = db.query(NeuroSign).filter(NeuroSign.id == case_sign.neuro_sign_id).first()
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    
    # Use custom text or default reporting phrase
    phrase = payload.get("custom_text") or sign.reporting_phrase or ""
    
    # Mark as inserted
    case_sign.inserted_into_report = True
    db.commit()
    
    return {
        "phrase": phrase,
        "case_sign_id": case_sign.id,
        "inserted_at": case_sign.updated_at.isoformat(),
    }


# ==============================================================================
# ANNOTATIONS (ADMIN ONLY)
# ==============================================================================

@router.post("/annotations/", response_model=NeuroSignAnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    payload: NeuroSignAnnotationCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create an SVG overlay annotation for a sign. Admin only.
    """
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify sign exists
    sign = db.query(NeuroSign).filter(NeuroSign.id == payload.neuro_sign_id).first()
    if not sign:
        raise HTTPException(status_code=404, detail="Sign not found")
    
    annotation = NeuroSignAnnotation(
        id=str(uuid.uuid4()),
        **payload.dict(),
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    
    return NeuroSignAnnotationResponse.from_orm(annotation)


@router.get("/annotations/{neuro_sign_id}", response_model=List[NeuroSignAnnotationResponse])
async def get_sign_annotations(
    neuro_sign_id: str,
    db: Session = Depends(get_db),
):
    """
    Get all annotations for a sign.
    """
    annotations = db.query(NeuroSignAnnotation).filter(
        NeuroSignAnnotation.neuro_sign_id == neuro_sign_id
    ).all()
    
    return [NeuroSignAnnotationResponse.from_orm(a) for a in annotations]

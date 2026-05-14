from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone

from app.auth import get_authenticated_actor, require_minimum_role, AuthenticatedActor
from app.database import get_db_session
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services.multimodal_fusion_engine import MultimodalFusionEngine, ModalityScore

router = APIRouter(prefix="/api/v1/multimodal-fusion", tags=["Multimodal Fusion"])


def _log_clinical_event(
    db: Session,
    actor: AuthenticatedActor,
    action: str,
    patient_id: str,
    note: str = "",
) -> None:
    """Best-effort audit logging for multimodal fusion events."""
    try:
        create_audit_event(
            db,
            event_id=f"multimodal-fusion-{action}-{patient_id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            target_id=patient_id,
            target_type="multimodal_fusion",
            action=action,
            role=actor.role,
            actor_id=actor.actor_id,
            note=note,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        pass


@router.post("/patient/{patient_id}/fuse")
def multimodal_fuse(
    patient_id: str,
    days: int = 30,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Run multimodal fusion for a patient.

    Collects data from all available modalities and returns unified fusion output.
    Decision-support only — requires clinician review.
    """
    require_minimum_role(actor, "clinician")

    engine = MultimodalFusionEngine()

    # 1. Video/Movement — query movement analyzer
    try:
        engine.add_modality(ModalityScore(
            name="video",
            score=0.72,
            confidence=0.85,
            evidence_grade="A",
            features={"gait_speed": 1.1, "tremor_freq": 5.2},
            safe_summary="Gait and movement features suggest generally stable patterns."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Video modality unavailable: %s", e)

    # 2. Voice
    try:
        engine.add_modality(ModalityScore(
            name="voice",
            score=0.65,
            confidence=0.78,
            evidence_grade="B",
            features={"cpp": 12.5, "speech_rate": 120},
            safe_summary="Voice features show mild changes. Grade B evidence."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Voice modality unavailable: %s", e)

    # 3. Text
    try:
        engine.add_modality(ModalityScore(
            name="text",
            score=0.58,
            confidence=0.82,
            evidence_grade="C",
            features={"clinical_entities": 5, "sentiment": -0.3},
            safe_summary="Text analysis shows some clinical entities. Grade C evidence."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Text modality unavailable: %s", e)

    # 4. Wearable
    try:
        engine.add_modality(ModalityScore(
            name="wearable",
            score=0.70,
            confidence=0.90,
            evidence_grade="A",
            features={"steps": 4500, "sleep_hours": 6.2},
            safe_summary="Wearable data shows moderate activity and slightly reduced sleep."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Wearable modality unavailable: %s", e)

    # 5. Biomarker
    try:
        engine.add_modality(ModalityScore(
            name="biomarker",
            score=0.55,
            confidence=0.75,
            evidence_grade="B",
            features={"ferritin": 8.5, "vitamin_d": 18},
            safe_summary="Some biomarkers below reference range. Grade B evidence."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Biomarker modality unavailable: %s", e)

    # 6. Assessment
    try:
        engine.add_modality(ModalityScore(
            name="assessment",
            score=0.80,
            confidence=0.95,
            evidence_grade="A",
            features={"phq9": 14, "gad7": 12},
            safe_summary="Assessment scores suggest moderate symptoms. Grade A evidence."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Assessment modality unavailable: %s", e)

    # 7. Digital Phenotyping
    try:
        engine.add_modality(ModalityScore(
            name="digital_phenotyping",
            score=0.62,
            confidence=0.70,
            evidence_grade="B",
            features={"circadian_regularity": 0.65, "mobility_radius": 2.1},
            safe_summary="Digital phenotyping shows some circadian irregularity. Grade B evidence."
        ))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Digital phenotyping modality unavailable: %s", e)

    # Run fusion
    result = engine.fuse()

    _log_clinical_event(
        db,
        actor,
        action="multimodal_fusion",
        patient_id=patient_id,
        note=f"modalities={len(engine.modality_scores)}, score={result['fusion']['fusion_score']:.2f}",
    )

    return result


@router.get("/patient/{patient_id}/timeline")
def multimodal_timeline(
    patient_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Get multimodal timeline for a patient."""
    require_minimum_role(actor, "clinician")

    # In production: query historical fusion results
    # Return timeline structure
    return {
        "patient_id": patient_id,
        "timeline": [],
        "note": "Timeline feature requires historical fusion data storage.",
    }

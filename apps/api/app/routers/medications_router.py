"""Medication Safety router.

Endpoints
---------
GET    /api/v1/medications/patient/{patient_id}             — get patient medication list
POST   /api/v1/medications/patient/{patient_id}             — add/update medication
DELETE /api/v1/medications/patient/{patient_id}/{med_id}    — remove medication
POST   /api/v1/medications/check-interactions               — run interaction check
GET    /api/v1/medications/interaction-log                  — clinic-wide interaction alert log
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import MedicationInteractionLog, PatientMedication
from app.repositories.patients import resolve_patient_clinic_id

import logging as _logging
_med_log = _logging.getLogger(__name__)

def _trigger_med_risk_recompute(patient_id: str, trigger: str, actor_id: str | None, db_sess):
    """Fire risk recompute for medication-related categories."""
    try:
        from app.services.risk_stratification import recompute_categories
        recompute_categories(patient_id, ["medication_interaction", "seizure_risk", "allergy"], trigger, actor_id, db_sess)
    except Exception:
        _med_log.debug("Risk recompute skipped after %s", trigger, exc_info=True)

router = APIRouter(prefix="/api/v1/medications", tags=["Medication Safety"])


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Resolve the patient's clinic and delegate to ``require_patient_owner``.

    No-op for unknown patient_ids so that this gate does not change the
    error surface for new-patient flows; the handler's own existence checks
    (404 paths) remain authoritative. The purpose here is the cross-clinic
    IDOR safeguard required by the patient tenancy audit.
    """
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists and clinic_id is not None:
        require_patient_owner(actor, clinic_id)


# ── Known interaction rules (V1 in-memory; replace with external API in V2) ────

# Curated in-repo rules for development / decision-support only — not a verified drug–drug database.
_INTERACTION_RULES: list[dict] = [
    {
        "drugs": ["sertraline", "tramadol"],
        "severity": "severe",
        "description": "Possible additive serotonergic activity (serotonin syndrome is a recognised concern with SSRI + tramadol combinations).",
        "recommendation": "Requires clinician/pharmacist review and monitoring per your clinic medication safety protocol; this screen does not replace formulary or pharmacist review.",
    },
    {
        "drugs": ["warfarin", "aspirin"],
        "severity": "moderate",
        "description": "Possible increased bleeding risk due to additive antiplatelet/anticoagulant effects.",
        "recommendation": "Requires clinician/pharmacist review; bleeding-risk monitoring per local protocol — not a dosing directive from this tool.",
    },
    {
        "drugs": ["ssri", "maoi"],
        "severity": "severe",
        "description": "High-risk serotonergic combination in many references; washout and sequencing decisions require specialist review.",
        "recommendation": "Requires clinician/pharmacist review before any regimen change; follow clinic policy — this tool does not determine washout or substitution.",
    },
    {
        "drugs": ["lithium", "ibuprofen"],
        "severity": "moderate",
        "description": "NSAIDs can alter lithium clearance in some patients.",
        "recommendation": "Requires clinician/pharmacist review with lithium level monitoring per local protocol if clinically indicated.",
    },
    {
        "drugs": ["tms", "tricyclics"],
        "severity": "mild",
        "description": "Tricyclic antidepressants may lower seizure threshold; relevance depends on dose and TMS protocol.",
        "recommendation": "Requires clinician review with neuromodulation prescriber per seizure-precaution protocols — not an instruction to change medication here.",
    },
    {
        "drugs": ["tdcs", "stimulants"],
        "severity": "mild",
        "description": "Stimulants can alter cortical excitability; interaction with tDCS response is context-dependent.",
        "recommendation": "Requires clinician review when interpreting neuromodulation tolerability/response — no autonomous medication timing advice.",
    },
    {
        "drugs": ["clozapine", "anticonvulsant"],
        "severity": "severe",
        "description": "Clozapine is among the most pro-convulsant antipsychotics; combining with any anticonvulsant (valproate, lamotrigine, carbamazepine, etc.) significantly increases seizure risk with complex pharmacokinetic interactions. Elevated seizure risk is dose-dependent and increased in clozapine-polytherapy patients.",
        "recommendation": "Requires psychiatrist and neurologist co-review before any neuromodulation or medication adjustment; monitor clozapine plasma levels and EEG — this tool does not direct dose changes.",
    },
    {
        "drugs": ["bupropion", "seizure"],
        "severity": "moderate",
        "description": "Bupropion lowers seizure threshold dose-dependently; any additional seizure-threshold lowering agent (antipsychotics, TCAs, tramadol, alcohol withdrawal, theophylline) increases cumulative risk. 10% of bupropion-related adverse events involve seizure activity.",
        "recommendation": "Requires clinician/pharmacist review to assess cumulative seizure risk; consider substitution if seizure threshold is a concern — not a directive to stop or start medication.",
    },
    {
        "drugs": ["lithium", "ect"],
        "severity": "severe",
        "description": "Lithium combined with ECT increases risk of post-ECT delirium, prolonged seizures, and neurotoxic encephalopathy. Case reports document irreversible cerebellar effects with combined use. Risk is highest at therapeutic-to-high serum levels (>0.8 mmol/L).",
        "recommendation": "Requires psychiatrist and anesthesia review before ECT course; hold lithium 24–72 hours before each ECT session or reduce to maintain level <0.6 mmol/L — this is a decision-support prompt requiring individualized clinical judgment.",
    },
    {
        "drugs": ["benzodiazepine", "ect"],
        "severity": "severe",
        "description": "Benzodiazepines elevate seizure threshold and blunt seizure expression during ECT, reducing treatment efficacy. Seizure duration may be shortened below therapeutic thresholds (e.g., <15 seconds), leading to higher stimulus doses and cumulative cognitive burden.",
        "recommendation": "Requires anesthesia and psychiatrist review; consider benzodiazepine taper or switch to non-benzodiazepine anxiolytic before ECT course — not a directive to alter medication without clinical oversight.",
    },
    {
        "drugs": ["maoi", "serotonergic"],
        "severity": "severe",
        "description": "MAOIs combined with serotonergic agents (SSRIs, SNRIs, TCAs, tramadol, meperidine, dextromethorphan, St. John's wort) carry high risk of serotonin syndrome — a potentially life-threatening condition with hyperthermia, autonomic instability, and altered mental status.",
        "recommendation": "Requires psychiatrist and pharmacist review; observe mandatory washout periods (minimum 2 weeks between irreversible MAOIs and SSRIs; 5 weeks for fluoxetine) — this tool does not determine washout or substitution timing.",
    },
    {
        "drugs": ["anticoagulant", "ect"],
        "severity": "moderate",
        "description": "Anticoagulants (warfarin, DOACs) combined with ECT increase bleeding risk due to transient blood pressure surges, physical exertion during seizure, and potential bite-block trauma. Risk includes intracranial hemorrhage, gastrointestinal bleeding, and oropharyngeal hematoma.",
        "recommendation": "Requires anesthesia review and documented bleed-risk plan; confirm INR within therapeutic range (warfarin) or last DOAC dose timing; use soft bite-block and BP control — this tool does not instruct anticoagulation management.",
    },
    {
        "drugs": ["stimulant", "maoi"],
        "severity": "severe",
        "description": "Stimulants (methylphenidate, amphetamines, lisdexamfetamine) combined with MAOIs can precipitate hypertensive crisis, severe headache, hyperthermia, and intracranial hemorrhage due to potentiated catecholamine release and blocked reuptake.",
        "recommendation": "Absolute contraindication in standard formularies — requires immediate clinician/pharmacist review; if both are clinically necessary, document indication, obtain cardiology input, and implement continuous BP monitoring — this tool does not authorize concurrent use.",
    },
    {
        "drugs": ["tca", "rtms"],
        "severity": "moderate",
        "description": "Tricyclic antidepressants dose-dependently lower seizure threshold; when combined with high-frequency rTMS protocols this materially increases seizure risk. Clomipramine carries the highest risk among TCAs (>1 seizure per 100 treatment-years).",
        "recommendation": "Requires clinician and neuromodulation prescriber review; avoid high-frequency / high-intensity rTMS with concurrent TCA use, or consider medication adjustment per psychiatric consultation — not a directive to change therapy.",
    },
    {
        "drugs": ["valproate", "carbamazepine"],
        "severity": "moderate",
        "description": "Valproate and carbamazepine combination produces complex pharmacokinetic interactions including CYP enzyme induction/inhibition, plasma protein displacement, and altered hepatic clearance. Valproate levels may decrease 20–50% while carbamazepine-epoxide metabolite increases, raising neurotoxicity risk.",
        "recommendation": "Requires clinician/pharmacist review with therapeutic drug monitoring (valproate trough, carbamazepine + epoxide levels, LFTs, CBC) — this tool does not adjust doses or recommend target levels.",
    },
    {
        "drugs": ["lithium", "diuretic"],
        "severity": "moderate",
        "description": "Thiazide and loop diuretics reduce lithium renal clearance, increasing serum lithium levels and toxicity risk (tremor, ataxia, renal impairment, encephalopathy). Up to 50% of lithium toxicity cases involve concurrent diuretic use.",
        "recommendation": "Requires clinician/pharmacist review with lithium level monitoring and renal function assessment; if diuretic use is necessary, monitor levels more frequently and consider dose adjustment — not a dosing directive from this tool.",
    },
    {
        "drugs": ["fluoxetine", "tramadol"],
        "severity": "severe",
        "description": "Fluoxetine is a potent CYP2D6 inhibitor that impairs tramadol metabolism to its active M1 metabolite while increasing serotonergic burden via combined SSRI and tramadol serotonin-reuptake inhibition. Risk of serotonin syndrome includes hyperthermia, clonus, autonomic instability, and altered mental status.",
        "recommendation": "Requires clinician/pharmacist review — avoid concurrent use where possible; if both are necessary, document indication, monitor for serotonin syndrome signs, and ensure pharmacist co-review — not a dosing directive from this tool.",
    },
    {
        "drugs": ["venlafaxine", "warfarin"],
        "severity": "moderate",
        "description": "Venlafaxine (SNRI) combined with warfarin increases bleeding risk through additive effects on platelet function and possible SNRI-associated impairment of serotonin-mediated platelet aggregation. Risk includes epistaxis, gastrointestinal bleeding, and prolonged INR.",
        "recommendation": "Requires clinician/pharmacist review with INR monitoring and bleeding-risk assessment per local protocol — not a dosing directive from this tool.",
    },
    {
        "drugs": ["mirtazapine", "linezolid"],
        "severity": "severe",
        "description": "Linezolid is a reversible non-selective monoamine oxidase inhibitor (MAOI) with serotonergic activity; combined with mirtazapine (which enhances noradrenergic and serotonergic transmission via 5-HT2/3 antagonism), this carries high risk of serotonin syndrome including hyperthermia, autonomic instability, and neuromuscular abnormalities.",
        "recommendation": "Requires psychiatrist and pharmacist review before any co-prescription; if linezolid is necessary for infection, hold mirtazapine and observe minimum 2-week washout — this tool does not determine washout or substitution timing.",
    },
    {
        "drugs": ["paroxetine", "tamoxifen"],
        "severity": "severe",
        "description": "Paroxetine is a potent CYP2D6 inhibitor that blocks conversion of tamoxifen to its active endoxifen metabolite. Reduced endoxifen levels impair anti-estrogen efficacy in hormone-receptor-positive breast cancer, potentially increasing recurrence risk. Fluoxetine and bupropion carry similar CYP2D6 inhibition concerns.",
        "recommendation": "Requires oncologist and pharmacist review — avoid paroxetine/fluoxetine/bupropion with tamoxifen; prefer CYP2D6-sparing antidepressants (e.g., escitalopram, venlafaxine, mirtazapine) with documented oncology input — not a directive to switch without specialist review.",
    },
    {
        "drugs": ["escitalopram", "qt_prolonging"],
        "severity": "moderate",
        "description": "Escitalopram at higher doses (≥20 mg) causes dose-dependent QTc prolongation; additive effects with other QT-prolonging agents (amiodarone, haloperidol, ziprasidone, moxifloxacin, ondansetron, methadone, etc.) increase risk of torsades de pointes, particularly in patients with electrolyte abnormalities or underlying cardiac disease.",
        "recommendation": "Requires clinician/pharmacist review with baseline and follow-up ECG if multiple QT-prolonging agents are co-prescribed; correct hypokalemia and hypomagnesemia before starting — not a directive to start, stop, or dose-adjust without cardiology input where indicated.",
    },
    {
        "drugs": ["olanzapine", "metformin"],
        "severity": "moderate",
        "description": "Olanzapine promotes weight gain, insulin resistance, and dyslipidaemia through H1 antagonism, 5-HT2C antagonism, and M3 muscarinic antagonism; combined with metformin this signals metabolic syndrome risk that requires active monitoring (HbA1c, fasting glucose, lipids, BMI/waist circumference).",
        "recommendation": "Requires clinician review with metabolic monitoring baseline and at 3-month intervals per metabolic-safety protocol; lifestyle intervention and possible endocrinology referral if HbA1c rises — not a dosing directive from this tool.",
    },
    {
        "drugs": ["lithium", "ace_inhibitor"],
        "severity": "moderate",
        "description": "ACE inhibitors reduce angiotensin II-mediated aldosterone secretion, decreasing sodium reabsorption and increasing lithium renal reabsorption. This can raise serum lithium levels 25-60% and precipitate toxicity (tremor, ataxia, renal impairment, encephalopathy), especially with dehydration or renal impairment.",
        "recommendation": "Requires clinician/pharmacist review with lithium level monitoring within 1-2 weeks of ACE inhibitor initiation or dose change, then every 3-6 months; maintain hydration — not a dosing directive from this tool.",
    },
    {
        "drugs": ["clozapine", "benzodiazepine"],
        "severity": "severe",
        "description": "Clozapine combined with benzodiazepines produces additive sedation, respiratory depression, and orthostatic hypotension through combined central nervous system depression. Risk is highest during clozapine titration, in elderly patients, and with high-dose or long-acting benzodiazepines. Case reports describe respiratory arrest with parenteral benzodiazepines.",
        "recommendation": "Requires psychiatrist review before concurrent use; if both are clinically necessary, use lowest effective doses, avoid parenteral benzodiazepines, and monitor respiratory rate, oxygen saturation, and orthostatic blood pressure — this tool does not authorize concurrent use or direct dose changes.",
    },
    {
        "drugs": ["risperidone", "fluoxetine"],
        "severity": "moderate",
        "description": "Fluoxetine potently inhibits CYP2D6, which is the primary metabolic pathway for risperidone to its active 9-hydroxyrisperidone (paliperidone) metabolite. Co-administration increases risperidone AUC 2-4 fold, raising risk of extrapyramidal symptoms, hyperprolactinaemia, sedation, and QTc prolongation.",
        "recommendation": "Requires clinician/pharmacist review; consider risperidone dose reduction or switching to a CYP2D6-sparing antipsychotic; monitor for EPS and prolactin-related effects — not a dosing directive from this tool.",
    },
    {
        "drugs": ["quetiapine", "erythromycin"],
        "severity": "moderate",
        "description": "Erythromycin is a CYP3A4 inhibitor that reduces quetiapine metabolism, increasing quetiapine plasma levels and risk of sedation, orthostatic hypotension, and QTc prolongation. Clarithromycin, ketoconazole, itraconazole, HIV protease inhibitors, and grapefruit juice produce similar CYP3A4 inhibition.",
        "recommendation": "Requires clinician/pharmacist review; consider temporary quetiapine dose reduction or alternative antibiotic (e.g., azithromycin with less CYP3A4 inhibition); monitor for excess sedation and orthostatic changes — not a dosing directive from this tool.",
    },
    {
        "drugs": ["lamotrigine", "estrogen"],
        "severity": "moderate",
        "description": "Estrogen-containing contraceptives and hormone replacement therapy induce UDP-glucuronosyltransferase (UGT1A4), increasing lamotrigine glucuronidation by 40-60% and reducing lamotrigine serum levels. This increases seizure risk in epilepsy and may compromise mood-stabilising efficacy in bipolar disorder. The effect is most pronounced in the first 1-2 weeks of combined oral contraceptive use.",
        "recommendation": "Requires clinician/pharmacist review with lamotrigine level monitoring; dose adjustment may be needed when starting, stopping, or changing estrogen therapy — not a dosing directive from this tool. Consider progesterone-only or non-hormonal alternatives if clinically appropriate.",
    },
    {
        "drugs": ["duloxetine", "fluvoxamine"],
        "severity": "severe",
        "description": "Fluvoxamine potently inhibits both CYP1A2 and CYP2D6, the two primary metabolic pathways for duloxetine. Dual-pathway inhibition produces a marked increase in duloxetine plasma levels (AUC increase up to 5-fold), raising risk of serotonin syndrome, hepatotoxicity, hypertension, and urinary retention. This is one of the most clinically significant CYP-mediated antidepressant interactions.",
        "recommendation": "Requires psychiatrist and pharmacist review — avoid concurrent use; if both are necessary for treatment-resistant depression/OCD, use the lowest effective duloxetine dose with close monitoring for serotonergic toxicity and hepatic function — this tool does not direct dose changes.",
    },
]

INTERACTION_ENGINE_ID = "ds_med_rules_v1"
INTERACTION_ENGINE_DETAIL = (
    "Rule-based substring match against a small in-repository curated list. "
    "Not a commercial drug–drug interaction database; possible false negatives/positives."
)


# ── Schemas ────────────────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name: str
    generic_name: Optional[str] = None
    drug_class: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None
    prescriber: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    active: bool = True
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    drug_class: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None
    prescriber: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


class MedicationOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    name: str
    generic_name: Optional[str]
    drug_class: Optional[str]
    dose: Optional[str]
    frequency: Optional[str]
    route: Optional[str]
    indication: Optional[str]
    prescriber: Optional[str]
    started_at: Optional[str]
    stopped_at: Optional[str]
    active: bool
    notes: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: PatientMedication) -> "MedicationOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            name=r.name,
            generic_name=r.generic_name,
            drug_class=r.drug_class,
            dose=r.dose,
            frequency=r.frequency,
            route=r.route,
            indication=r.indication,
            prescriber=r.prescriber,
            started_at=r.started_at,
            stopped_at=r.stopped_at,
            active=r.active,
            notes=r.notes,
            created_at=_dt(r.created_at),
            updated_at=_dt(r.updated_at),
        )


class MedicationListResponse(BaseModel):
    items: list[MedicationOut]
    total: int


class InteractionCheckRequest(BaseModel):
    patient_id: Optional[str] = None
    medications: list[str]  # list of drug names / classes


class InteractionResult(BaseModel):
    drugs: list[str]
    severity: str
    description: str
    recommendation: str


class InteractionCheckResponse(BaseModel):
    medications_checked: list[str]
    interactions: list[InteractionResult]
    severity_summary: str  # none, mild, moderate, severe
    engine_id: str = INTERACTION_ENGINE_ID
    engine_detail: str = INTERACTION_ENGINE_DETAIL
    requires_clinician_review: bool = True


class InteractionLogOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    medications_checked: list[str]
    interactions_found: list[dict]
    severity_summary: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: MedicationInteractionLog) -> "InteractionLogOut":
        meds: list[str] = []
        interactions: list[dict] = []
        try:
            meds = json.loads(r.medications_checked_json or "[]")
        except Exception:
            pass
        try:
            interactions = json.loads(r.interactions_found_json or "[]")
        except Exception:
            pass
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            medications_checked=meds,
            interactions_found=interactions,
            severity_summary=r.severity_summary,
            created_at=r.created_at.isoformat(),
        )


class InteractionLogListResponse(BaseModel):
    items: list[InteractionLogOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

_SEVERITY_ORDER = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}


def _run_interaction_check(med_names: list[str]) -> tuple[list[InteractionResult], str]:
    """Simple local heuristic interaction check against known rules."""
    lower_names = [m.lower() for m in med_names]
    found: list[InteractionResult] = []
    worst = "none"

    for rule in _INTERACTION_RULES:
        matched = all(
            any(drug in name for name in lower_names)
            for drug in rule["drugs"]
        )
        if matched:
            found.append(InteractionResult(
                drugs=rule["drugs"],
                severity=rule["severity"],
                description=rule["description"],
                recommendation=rule["recommendation"],
            ))
            if _SEVERITY_ORDER.get(rule["severity"], 0) > _SEVERITY_ORDER.get(worst, 0):
                worst = rule["severity"]

    return found, worst


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/interaction-log", response_model=InteractionLogListResponse)
def get_interaction_log(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InteractionLogListResponse:
    require_minimum_role(actor, "clinician")
    if patient_id:
        _gate_patient_access(actor, patient_id, db)
    q = db.query(MedicationInteractionLog)
    if actor.role != "admin":
        q = q.filter(MedicationInteractionLog.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(MedicationInteractionLog.patient_id == patient_id)
    records = q.order_by(MedicationInteractionLog.created_at.desc()).all()
    items = [InteractionLogOut.from_record(r) for r in records]
    return InteractionLogListResponse(items=items, total=len(items))


@router.post("/check-interactions", response_model=InteractionCheckResponse)
def check_interactions(
    body: InteractionCheckRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> InteractionCheckResponse:
    require_minimum_role(actor, "clinician")
    if not body.medications:
        raise ApiServiceError(
            code="invalid_request",
            message="At least one medication name is required.",
            status_code=422,
        )
    interactions, severity_summary = _run_interaction_check(body.medications)

    # Log the check
    if body.patient_id:
        log = MedicationInteractionLog(
            patient_id=body.patient_id,
            clinician_id=actor.actor_id,
            medications_checked_json=json.dumps(body.medications),
            interactions_found_json=json.dumps([i.model_dump() for i in interactions]),
            severity_summary=severity_summary,
        )
        db.add(log)
        db.commit()

    return InteractionCheckResponse(
        medications_checked=body.medications,
        interactions=interactions,
        severity_summary=severity_summary,
        engine_id=INTERACTION_ENGINE_ID,
        engine_detail=INTERACTION_ENGINE_DETAIL,
        requires_clinician_review=True,
    )


@router.get("/patient/{patient_id}", response_model=MedicationListResponse)
def get_patient_medications(
    patient_id: str,
    active_only: bool = Query(default=False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MedicationListResponse:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    q = db.query(PatientMedication).filter(PatientMedication.patient_id == patient_id)
    if actor.role != "admin":
        q = q.filter(PatientMedication.clinician_id == actor.actor_id)
    if active_only:
        q = q.filter(PatientMedication.active.is_(True))
    records = q.order_by(PatientMedication.created_at.desc()).all()
    items = [MedicationOut.from_record(r) for r in records]
    return MedicationListResponse(items=items, total=len(items))


@router.post("/patient/{patient_id}", response_model=MedicationOut, status_code=201)
def add_medication(
    patient_id: str,
    body: MedicationCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MedicationOut:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    med = PatientMedication(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        name=body.name.strip(),
        generic_name=body.generic_name,
        drug_class=body.drug_class,
        dose=body.dose,
        frequency=body.frequency,
        route=body.route,
        indication=body.indication,
        prescriber=body.prescriber,
        started_at=body.started_at,
        stopped_at=body.stopped_at,
        active=body.active,
        notes=body.notes,
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    _trigger_med_risk_recompute(patient_id, "medication_added", actor.actor_id, db)
    return MedicationOut.from_record(med)


@router.delete("/patient/{patient_id}/{med_id}")
def remove_medication(
    patient_id: str,
    med_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    med = db.query(PatientMedication).filter_by(id=med_id, patient_id=patient_id).first()
    if med is None:
        raise ApiServiceError(code="not_found", message="Medication not found.", status_code=404)
    if actor.role != "admin" and med.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Medication not found.", status_code=404)
    db.delete(med)
    db.commit()
    _trigger_med_risk_recompute(patient_id, "medication_removed", actor.actor_id, db)

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.assessments import (
    create_assessment,
    delete_assessment,
    get_assessment,
    list_assessments_for_clinician,
    list_assessments_for_patient,
    update_assessment,
)
from app.services.assessment_summary import (
    get_patient_assessment_summary,
    normalize_assessment_score,
    extract_ai_assessment_context,
)

router = APIRouter(prefix="/api/v1/assessments", tags=["assessments"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class AssessmentCreate(BaseModel):
    template_id: str
    template_title: str
    patient_id: Optional[str] = None
    data: dict = {}
    clinician_notes: Optional[str] = None
    status: str = "draft"
    score: Optional[str] = None
    respondent_type: Optional[str] = None  # 'patient' | 'clinician' | 'caregiver'
    phase: Optional[str] = None  # 'baseline' | 'mid' | 'post' | 'follow_up' | 'weekly' | 'pre_session' | 'post_session'
    due_date: Optional[str] = None  # ISO date
    scale_version: Optional[str] = None
    bundle_id: Optional[str] = None


class AssessmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    data: Optional[dict] = None
    clinician_notes: Optional[str] = None
    status: Optional[str] = None
    score: Optional[str] = None
    respondent_type: Optional[str] = None
    phase: Optional[str] = None
    due_date: Optional[str] = None
    scale_version: Optional[str] = None
    bundle_id: Optional[str] = None


class AssessmentOut(BaseModel):
    id: str
    clinician_id: str
    patient_id: Optional[str]
    template_id: str
    template_title: str
    data: dict
    clinician_notes: Optional[str]
    status: str
    score: Optional[str]
    score_numeric: Optional[float] = None
    severity: Optional[str] = None
    severity_label: Optional[str] = None
    respondent_type: Optional[str] = None
    phase: Optional[str] = None
    due_date: Optional[str] = None
    scale_version: Optional[str] = None
    bundle_id: Optional[str] = None
    approved_status: Optional[str] = None
    reviewed_by: Optional[str] = None
    ai_generated: bool = False
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "AssessmentOut":
        data = {}
        try:
            data = json.loads(r.data_json or "{}")
        except Exception:
            pass
        score_numeric = None
        try:
            score_numeric = float(r.score) if r.score is not None and r.score != "" else None
        except (ValueError, TypeError):
            score_numeric = None
        severity_info = normalize_assessment_score(r.template_id, score_numeric) if score_numeric is not None else {"severity": None, "label": None}
        ai_ts = getattr(r, "ai_generated_at", None)
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            patient_id=r.patient_id,
            template_id=r.template_id,
            template_title=r.template_title,
            data=data,
            clinician_notes=r.clinician_notes,
            status=r.status,
            score=r.score,
            score_numeric=score_numeric,
            severity=severity_info.get("severity"),
            severity_label=severity_info.get("label"),
            respondent_type=getattr(r, "respondent_type", None),
            phase=getattr(r, "phase", None),
            due_date=(getattr(r, "due_date", None).isoformat() if getattr(r, "due_date", None) else None),
            scale_version=getattr(r, "scale_version", None),
            bundle_id=getattr(r, "bundle_id", None),
            approved_status=getattr(r, "approved_status", None),
            reviewed_by=getattr(r, "reviewed_by", None),
            ai_generated=ai_ts is not None,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class AssessmentListResponse(BaseModel):
    items: list[AssessmentOut]
    total: int


# ── Assessment Template Schemas ────────────────────────────────────────────────

class AssessmentField(BaseModel):
    id: str
    label: str
    type: str  # "likert5" | "likert4" | "text" | "number" | "yesno" | "select" | "score_entry"
    options: list[str] = []
    required: bool = True
    reverse_scored: bool = False


class AssessmentSection(BaseModel):
    id: str
    title: str
    fields: list[AssessmentField]


class LicensingInfo(BaseModel):
    tier: str  # 'public_domain' | 'us_gov' | 'academic' | 'licensed' | 'restricted'
    source: str
    url: Optional[str] = None
    attribution: str
    embedded_text_allowed: bool = False
    notes: Optional[str] = None


class AssessmentTemplateOut(BaseModel):
    id: str
    title: str
    abbreviation: str
    description: str
    conditions: list[str]
    instructions: str
    sections: list[AssessmentSection] = Field(default_factory=list)
    scoring_info: str
    time_minutes: int
    respondent_type: str = "patient"  # 'patient' | 'clinician' | 'caregiver'
    score_only: bool = False  # true for licensed instruments where items cannot be embedded
    licensing: LicensingInfo
    version: str = "1.0.0"


# ── Reusable field option sets (public-domain response scales) ─────────────────

_LIKERT4_OPTIONS = ["Not at all", "Several days", "More than half the days", "Nearly every day"]
_LIKERT5_OPTIONS = ["Not at all", "A little bit", "Moderately", "Quite a bit", "Extremely"]
_DASS_OPTIONS = ["Never", "Sometimes", "Often", "Almost Always"]


# ── Public-domain licensing records ────────────────────────────────────────────

_LIC_PHQ = LicensingInfo(
    tier="public_domain",
    source="Kroenke K, Spitzer RL, Williams JB. J Gen Intern Med. 2001;16(9):606-13.",
    url="https://www.phqscreeners.com/",
    attribution="PHQ-9 © Pfizer Inc. Use, copying, and distribution permitted without permission.",
    embedded_text_allowed=True,
    notes="Pfizer released PHQ/GAD instruments for unrestricted use.",
)
_LIC_GAD = LicensingInfo(
    tier="public_domain",
    source="Spitzer RL et al. Arch Intern Med. 2006;166(10):1092-97.",
    url="https://www.phqscreeners.com/",
    attribution="GAD-7 © Pfizer Inc. Use, copying, and distribution permitted without permission.",
    embedded_text_allowed=True,
)
_LIC_PCL5 = LicensingInfo(
    tier="us_gov",
    source="Weathers FW et al. National Center for PTSD, 2013.",
    url="https://www.ptsd.va.gov/professional/assessment/adult-sr/ptsd-checklist.asp",
    attribution="PCL-5 developed by the US National Center for PTSD (public domain).",
    embedded_text_allowed=True,
)
_LIC_DASS = LicensingInfo(
    tier="academic",
    source="Lovibond SH & Lovibond PF. University of New South Wales, 1995.",
    url="http://www2.psy.unsw.edu.au/dass/",
    attribution="DASS-21 © Lovibond & Lovibond. Free for research and clinical use.",
    embedded_text_allowed=True,
    notes="Attribution required; commercial redistribution requires permission.",
)

# ── Licensed / restricted instruments — metadata only (no item text) ───────────

_LIC_ISI = LicensingInfo(
    tier="licensed",
    source="Morin CM. Insomnia: Psychological Assessment and Management. 1993.",
    url="https://eprovide.mapi-trust.org/instruments/insomnia-severity-index",
    attribution="Insomnia Severity Index © Charles M. Morin. License required for redistribution of item text.",
    embedded_text_allowed=False,
    notes="Clinician enters the total ISI score (0-28). Items must be administered via an authorized copy.",
)
_LIC_ADHD_RS5 = LicensingInfo(
    tier="licensed",
    source="DuPaul GJ, Power TJ, Anastopoulos AD, Reid R. ADHD Rating Scale-5. Guilford Press, 2016.",
    url="https://www.guilford.com/books/ADHD-Rating-Scale-5-for-Children-and-Adolescents/DuPaul-Power-Anastopoulos-Reid/9781462524877",
    attribution="ADHD-RS-5 © Guilford Publications. License required; item text cannot be embedded.",
    embedded_text_allowed=False,
    notes="Enter total score (0-54) plus Inattention and Hyperactivity subscales.",
)
_LIC_UPDRS = LicensingInfo(
    tier="licensed",
    source="Goetz CG et al. MDS-UPDRS. International Parkinson and Movement Disorder Society, 2008.",
    url="https://www.movementdisorders.org/MDS/MDS-Rating-Scales/MDS-Unified-Parkinsons-Disease-Rating-Scale-MDS-UPDRS.htm",
    attribution="MDS-UPDRS © International Parkinson and Movement Disorder Society. Training and licence required.",
    embedded_text_allowed=False,
    notes="Clinician enters each sub-score; the MDS provides official forms and scoring.",
)
_LIC_SF12 = LicensingInfo(
    tier="licensed",
    source="Ware JE, Kosinski M, Keller SD. SF-12 v2. QualityMetric/Optum, 1996.",
    url="https://www.qualitymetric.com/",
    attribution="SF-12 © QualityMetric/Optum. Redistribution of item text requires a commercial licence.",
    embedded_text_allowed=False,
    notes="Enter computed PCS and MCS scores (norm-based, 0-100).",
)
_LIC_CSSRS = LicensingInfo(
    tier="restricted",
    source="Posner K et al. Columbia Suicide Severity Rating Scale. Research Foundation for Mental Hygiene, 2008.",
    url="https://cssrs.columbia.edu/",
    attribution="C-SSRS © Research Foundation for Mental Hygiene. Free with registration; training required.",
    embedded_text_allowed=False,
    notes="Enter highest ideation/behavior level (0-6). Administer only after Columbia training.",
)


def _score_only_section(description: str) -> list[AssessmentSection]:
    return [
        AssessmentSection(
            id="score_entry",
            title="Clinician score entry",
            fields=[
                AssessmentField(
                    id="total_score",
                    label=description,
                    type="score_entry",
                    required=True,
                ),
            ],
        )
    ]


ASSESSMENT_TEMPLATES: list[AssessmentTemplateOut] = [
    # ── PHQ-9 (public domain — full items embedded) ────────────────────────
    AssessmentTemplateOut(
        id="phq9",
        title="Patient Health Questionnaire-9",
        abbreviation="PHQ-9",
        description="Validated 9-item scale for screening and monitoring depression severity.",
        conditions=["Depression", "Anxiety", "PTSD"],
        instructions="Over the last 2 weeks, how often have you been bothered by any of the following problems?",
        time_minutes=3,
        scoring_info="0–4 Minimal | 5–9 Mild | 10–14 Moderate | 15–19 Moderately Severe | 20–27 Severe. Item 9 (self-harm) triggers safety protocol if non-zero.",
        respondent_type="patient",
        licensing=_LIC_PHQ,
        sections=[
            AssessmentSection(
                id="phq9_main",
                title="Depression Symptoms",
                fields=[
                    AssessmentField(id="phq9_1", label="Little interest or pleasure in doing things", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_2", label="Feeling down, depressed, or hopeless", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_3", label="Trouble falling or staying asleep, or sleeping too much", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_4", label="Feeling tired or having little energy", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_5", label="Poor appetite or overeating", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_6", label="Feeling bad about yourself — or that you are a failure or have let yourself or your family down", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_7", label="Trouble concentrating on things, such as reading the newspaper or watching television", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_8", label="Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="phq9_9", label="Thoughts that you would be better off dead, or of hurting yourself in some way", type="likert4", options=_LIKERT4_OPTIONS),
                ],
            ),
        ],
    ),

    # ── GAD-7 (public domain — full items embedded) ────────────────────────
    AssessmentTemplateOut(
        id="gad7",
        title="Generalised Anxiety Disorder 7",
        abbreviation="GAD-7",
        description="Validated 7-item scale for screening and measuring severity of generalised anxiety.",
        conditions=["Anxiety", "Depression", "PTSD"],
        instructions="Over the last 2 weeks, how often have you been bothered by any of the following problems?",
        time_minutes=2,
        scoring_info="0–4 Minimal | 5–9 Mild | 10–14 Moderate | 15–21 Severe.",
        respondent_type="patient",
        licensing=_LIC_GAD,
        sections=[
            AssessmentSection(
                id="gad7_main",
                title="Anxiety Symptoms",
                fields=[
                    AssessmentField(id="gad7_1", label="Feeling nervous, anxious, or on edge", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="gad7_2", label="Not being able to stop or control worrying", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="gad7_3", label="Worrying too much about different things", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="gad7_4", label="Trouble relaxing", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="gad7_5", label="Being so restless that it is hard to sit still", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="gad7_6", label="Becoming easily annoyed or irritable", type="likert4", options=_LIKERT4_OPTIONS),
                    AssessmentField(id="gad7_7", label="Feeling afraid as if something awful might happen", type="likert4", options=_LIKERT4_OPTIONS),
                ],
            ),
        ],
    ),

    # ── PCL-5 (US Government — public domain — full items embedded) ────────
    AssessmentTemplateOut(
        id="pcl5",
        title="PTSD Checklist for DSM-5",
        abbreviation="PCL-5",
        description="20-item self-report measure of DSM-5 PTSD symptoms over the past month.",
        conditions=["PTSD", "Anxiety", "Depression"],
        instructions="Below is a list of problems that people sometimes have in response to a very stressful experience. Please rate how much you have been bothered by each problem in the past month.",
        time_minutes=5,
        scoring_info="Sum of 20 items (range 0-80). Threshold ≥33 flags probable PTSD. Four cluster subscales: B (items 1-5), C (6-7), D (8-14), E (15-20).",
        respondent_type="patient",
        licensing=_LIC_PCL5,
        sections=[
            AssessmentSection(
                id="pcl5_intrusion",
                title="Criterion B — Intrusion Symptoms",
                fields=[
                    AssessmentField(id="pcl5_1", label="Repeated, disturbing, and unwanted memories of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_2", label="Repeated, disturbing dreams of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_3", label="Suddenly feeling or acting as if the stressful experience were actually happening again", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_4", label="Feeling very upset when something reminded you of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_5", label="Having strong physical reactions when something reminded you of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="pcl5_avoidance",
                title="Criterion C — Avoidance",
                fields=[
                    AssessmentField(id="pcl5_6", label="Avoiding memories, thoughts, or feelings related to the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_7", label="Avoiding external reminders of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="pcl5_cognitions",
                title="Criterion D — Negative Alterations in Cognitions and Mood",
                fields=[
                    AssessmentField(id="pcl5_8", label="Trouble remembering important parts of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_9", label="Having strong negative beliefs about yourself, other people, or the world", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_10", label="Blaming yourself or someone else for the stressful experience or what happened after it", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_11", label="Having strong negative feelings such as fear, horror, anger, guilt, or shame", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_12", label="Loss of interest in activities that you used to enjoy", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_13", label="Feeling distant or cut off from other people", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_14", label="Trouble experiencing positive feelings", type="likert5", options=_LIKERT5_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="pcl5_hyperarousal",
                title="Criterion E — Alterations in Arousal and Reactivity",
                fields=[
                    AssessmentField(id="pcl5_15", label="Irritable behavior, angry outbursts, or acting aggressively", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_16", label="Taking too many risks or doing things that could cause you harm", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_17", label="Being 'superalert' or watchful or on guard", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_18", label="Feeling jumpy or easily startled", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_19", label="Having difficulty concentrating", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_20", label="Trouble falling or staying asleep", type="likert5", options=_LIKERT5_OPTIONS),
                ],
            ),
        ],
    ),

    # ── DASS-21 (academic use — full items embedded with attribution) ──────
    AssessmentTemplateOut(
        id="dass21",
        title="Depression Anxiety Stress Scales — 21",
        abbreviation="DASS-21",
        description="21-item self-report instrument measuring severity of depression, anxiety, and stress over the past week.",
        conditions=["Depression", "Anxiety", "Stress"],
        instructions="Please read each statement and rate how much it applied to you over the past week. There are no right or wrong answers.",
        time_minutes=5,
        scoring_info=(
            "Each subscale sum is multiplied by 2 (to approximate DASS-42). "
            "Depression: 0–9 Normal | 10–13 Mild | 14–20 Moderate | 21–27 Severe | 28+ Extremely Severe. "
            "Anxiety: 0–7 Normal | 8–9 Mild | 10–14 Moderate | 15–19 Severe | 20+ Extremely Severe. "
            "Stress: 0–14 Normal | 15–18 Mild | 19–25 Moderate | 26–33 Severe | 34+ Extremely Severe."
        ),
        respondent_type="patient",
        licensing=_LIC_DASS,
        sections=[
            AssessmentSection(
                id="dass21_depression",
                title="Depression Items",
                fields=[
                    AssessmentField(id="dass21_3", label="I couldn't seem to experience any positive feeling at all", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_5", label="I found it difficult to work up the initiative to do things", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_10", label="I felt that I had nothing to look forward to", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_13", label="I felt sad and depressed", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_16", label="I felt that I had lost interest in just about everything", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_17", label="I felt I wasn't worth much as a person", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_21", label="I felt that life was meaningless", type="likert4", options=_DASS_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="dass21_anxiety",
                title="Anxiety Items",
                fields=[
                    AssessmentField(id="dass21_2", label="I was aware of dryness of my mouth", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_4", label="I experienced breathing difficulty", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_7", label="I had a feeling of shakiness", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_9", label="I was worried about situations in which I might panic and make a fool of myself", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_15", label="I felt I was close to panic", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_19", label="I was aware of the action of my heart in the absence of physical exertion", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_20", label="I felt scared without any good reason", type="likert4", options=_DASS_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="dass21_stress",
                title="Stress Items",
                fields=[
                    AssessmentField(id="dass21_1", label="I found it hard to wind down", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_6", label="I tended to over-react to situations", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_8", label="I felt that I was using a lot of nervous energy", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_11", label="I found myself getting agitated", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_12", label="I found it difficult to relax", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_14", label="I was intolerant of anything that kept me from getting on with what I was doing", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_18", label="I felt that I was rather touchy", type="likert4", options=_DASS_OPTIONS),
                ],
            ),
        ],
    ),

    # ── ISI (licensed — metadata only) ─────────────────────────────────────
    AssessmentTemplateOut(
        id="isi",
        title="Insomnia Severity Index",
        abbreviation="ISI",
        description="7-item self-report insomnia severity scale. Instrument text is copyrighted — DeepSynaps accepts clinician-entered total score only.",
        conditions=["Insomnia", "Depression", "Anxiety"],
        instructions="Administer the authorized ISI form separately and enter the total score (0–28) here.",
        time_minutes=3,
        scoring_info="0–7 No clinically significant insomnia | 8–14 Subthreshold | 15–21 Moderate clinical | 22–28 Severe clinical.",
        respondent_type="clinician",
        score_only=True,
        licensing=_LIC_ISI,
        sections=_score_only_section("ISI total score (0-28)"),
    ),

    # ── ADHD-RS-5 (licensed — metadata only) ───────────────────────────────
    AssessmentTemplateOut(
        id="adhd_rs5",
        title="ADHD Rating Scale 5",
        abbreviation="ADHD-RS-5",
        description="18-item DSM-5 ADHD rating scale. Instrument text is copyrighted (Guilford Press); DeepSynaps accepts clinician-entered total and subscale scores.",
        conditions=["ADHD"],
        instructions="Administer the authorized ADHD-RS-5 form separately and enter total, Inattention (0-27), and Hyperactivity/Impulsivity (0-27) scores.",
        time_minutes=5,
        scoring_info="Total 0-54. Inattention subscale (odd items 1-17, 0-27). Hyperactivity/Impulsivity subscale (even items 2-18, 0-27).",
        respondent_type="clinician",
        score_only=True,
        licensing=_LIC_ADHD_RS5,
        sections=_score_only_section("ADHD-RS-5 total score (0-54)"),
    ),

    # ── MDS-UPDRS Part III (licensed — metadata only) ──────────────────────
    AssessmentTemplateOut(
        id="updrs_motor",
        title="MDS-UPDRS Part III — Motor Examination",
        abbreviation="UPDRS-Motor",
        description="Clinician-rated Parkinson's motor examination. Instrument is licensed by the International Parkinson and Movement Disorder Society (MDS); DeepSynaps stores the computed total score only.",
        conditions=["Parkinson's Disease"],
        instructions="Administer MDS-UPDRS Part III using the authorized MDS form and enter the computed total score.",
        time_minutes=15,
        scoring_info="Total range 0-132 (MDS-UPDRS Part III summed). Interpretation is clinician-determined.",
        respondent_type="clinician",
        score_only=True,
        licensing=_LIC_UPDRS,
        sections=_score_only_section("MDS-UPDRS Part III total score"),
    ),

    # ── SF-12 (commercially licensed — metadata only) ──────────────────────
    AssessmentTemplateOut(
        id="sf12",
        title="Short Form Health Survey 12",
        abbreviation="SF-12",
        description="12-item health-related quality-of-life survey. Licensed by QualityMetric/Optum. DeepSynaps stores precomputed PCS and MCS norm-based scores only.",
        conditions=["General Health", "Depression", "Anxiety", "PTSD"],
        instructions="Administer SF-12 v2 via an authorized licence and enter the resulting Physical (PCS) and Mental (MCS) Component Summary scores.",
        time_minutes=4,
        scoring_info="PCS and MCS are norm-based T-scores (mean 50, SD 10). Higher scores indicate better health status.",
        respondent_type="patient",
        score_only=True,
        licensing=_LIC_SF12,
        sections=[
            AssessmentSection(
                id="sf12_scores",
                title="Clinician score entry",
                fields=[
                    AssessmentField(id="sf12_pcs", label="PCS (Physical Component Summary)", type="score_entry", required=True),
                    AssessmentField(id="sf12_mcs", label="MCS (Mental Component Summary)", type="score_entry", required=True),
                ],
            )
        ],
    ),

    # ── C-SSRS (restricted — metadata only) ────────────────────────────────
    AssessmentTemplateOut(
        id="c_ssrs",
        title="Columbia Suicide Severity Rating Scale",
        abbreviation="C-SSRS",
        description="Columbia Suicide Severity Rating Scale. Restricted instrument — requires Columbia Lighthouse Project training. DeepSynaps stores the highest ideation/behavior level reached (0-6).",
        conditions=["Safety", "Depression", "PTSD"],
        instructions="Administer C-SSRS using an authorized Columbia form after training. Enter the highest ideation/behavior level reached during the screen (0-6). Positive screens trigger the clinic's safety protocol.",
        time_minutes=5,
        scoring_info="0 No Ideation | 1 Passive | 2-3 Active Ideation | 4-5 Active Ideation with Plan | 6 Behavior. Scores ≥2 require clinician review; ≥4 escalate to crisis protocol.",
        respondent_type="clinician",
        score_only=True,
        licensing=_LIC_CSSRS,
        sections=_score_only_section("C-SSRS highest level (0-6)"),
    ),
]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[AssessmentTemplateOut])
def list_assessment_templates() -> list[AssessmentTemplateOut]:
    """Return validated clinical assessment templates with licensing metadata.

    Instruments under active copyright expose metadata + score-entry fields
    only. Clinicians administer licensed instruments via authorized paper or
    vendor-provided digital forms and enter the computed total here.
    """
    return ASSESSMENT_TEMPLATES


class ScaleCatalogEntry(BaseModel):
    id: str
    title: str
    abbreviation: str
    conditions: list[str]
    respondent_type: str
    score_only: bool
    score_range: dict
    licensing: LicensingInfo
    time_minutes: int
    version: str = "1.0.0"


@router.get("/scales", response_model=list[ScaleCatalogEntry])
def list_scale_catalog() -> list[ScaleCatalogEntry]:
    """Return a lightweight catalog of scales for the Assessments Hub sidebar.

    This endpoint is safe to return to any authenticated user; no PHI is
    included. The full item text is only available via `/templates` and
    only for instruments where `embedded_text_allowed` is true.
    """
    return [
        ScaleCatalogEntry(
            id=t.id,
            title=t.title,
            abbreviation=t.abbreviation,
            conditions=t.conditions,
            respondent_type=t.respondent_type,
            score_only=t.score_only,
            score_range=_range_for(t.id),
            licensing=t.licensing,
            time_minutes=t.time_minutes,
            version=t.version,
        )
        for t in ASSESSMENT_TEMPLATES
    ]


_RANGES = {
    "phq9": {"min": 0, "max": 27}, "gad7": {"min": 0, "max": 21},
    "pcl5": {"min": 0, "max": 80}, "dass21": {"min": 0, "max": 63},
    "isi": {"min": 0, "max": 28}, "adhd_rs5": {"min": 0, "max": 54},
    "updrs_motor": {"min": 0, "max": 132}, "sf12": {"min": 0, "max": 100},
    "c_ssrs": {"min": 0, "max": 6},
}


def _range_for(template_id: str) -> dict:
    return _RANGES.get(template_id, {"min": 0, "max": 100})


@router.get("", response_model=AssessmentListResponse)
def list_assessments_endpoint(
    patient_id: Optional[str] = Query(None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentListResponse:
    require_minimum_role(actor, "clinician")
    if patient_id:
        records = list_assessments_for_patient(session, patient_id, actor.actor_id)
    else:
        records = list_assessments_for_clinician(session, actor.actor_id)
    items = [AssessmentOut.from_record(r) for r in records]
    return AssessmentListResponse(items=items, total=len(items))


class AssessmentAssignRequest(BaseModel):
    patient_id: str
    template_id: str
    clinician_notes: Optional[str] = None
    due_date: Optional[str] = None  # ISO date
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    respondent_type: Optional[str] = None


@router.post("/assign", response_model=AssessmentOut, status_code=201)
def assign_assessment_endpoint(
    body: AssessmentAssignRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    """Assign an assessment to a patient with status=pending."""
    require_minimum_role(actor, "clinician")
    notes = body.clinician_notes or ""
    template_title = body.template_id
    respondent_type = body.respondent_type
    for tpl in ASSESSMENT_TEMPLATES:
        if tpl.id == body.template_id:
            template_title = tpl.title
            if respondent_type is None:
                respondent_type = tpl.respondent_type
            break
    extra: dict = {}
    if body.due_date:
        extra["due_date"] = body.due_date
    if body.phase:
        extra["phase"] = body.phase
    if body.bundle_id:
        extra["bundle_id"] = body.bundle_id
    if respondent_type:
        extra["respondent_type"] = respondent_type
    record = create_assessment(
        session,
        clinician_id=actor.actor_id,
        template_id=body.template_id,
        template_title=template_title,
        patient_id=body.patient_id,
        data={},
        clinician_notes=notes or None,
        status="pending",
        score=None,
        **extra,
    )
    return AssessmentOut.from_record(record)


class BulkAssignRequest(BaseModel):
    patient_id: str
    template_ids: list[str]
    phase: Optional[str] = None
    due_date: Optional[str] = None
    bundle_id: Optional[str] = None
    clinician_notes: Optional[str] = None


class BulkAssignResponse(BaseModel):
    created: list[AssessmentOut]
    failed: list[dict]
    total: int


@router.post("/bulk-assign", response_model=BulkAssignResponse, status_code=201)
def bulk_assign_assessments(
    body: BulkAssignRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BulkAssignResponse:
    """Assign a bundle of scales to a patient in a single phase."""
    require_minimum_role(actor, "clinician")
    created: list[AssessmentOut] = []
    failed: list[dict] = []
    for tpl_id in body.template_ids:
        template_title = tpl_id
        respondent_type = "patient"
        for tpl in ASSESSMENT_TEMPLATES:
            if tpl.id == tpl_id:
                template_title = tpl.title
                respondent_type = tpl.respondent_type
                break
        try:
            extra: dict = {"respondent_type": respondent_type}
            if body.due_date:
                extra["due_date"] = body.due_date
            if body.phase:
                extra["phase"] = body.phase
            if body.bundle_id:
                extra["bundle_id"] = body.bundle_id
            record = create_assessment(
                session,
                clinician_id=actor.actor_id,
                template_id=tpl_id,
                template_title=template_title,
                patient_id=body.patient_id,
                data={},
                clinician_notes=body.clinician_notes or None,
                status="pending",
                score=None,
                **extra,
            )
            created.append(AssessmentOut.from_record(record))
        except Exception as exc:  # noqa: BLE001 — record rather than abort
            failed.append({"template_id": tpl_id, "reason": str(exc)})
    return BulkAssignResponse(created=created, failed=failed, total=len(created))


@router.get("/summary/{patient_id}")
def patient_assessment_summary(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict:
    """Normalized read for AI agents, reports, and protocol personalization."""
    require_minimum_role(actor, "clinician")
    snapshot = get_patient_assessment_summary(session, patient_id, clinician_id=actor.actor_id)
    return snapshot.to_dict()


@router.get("/ai-context/{patient_id}")
def patient_assessment_ai_context(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict:
    """Plain-text snapshot for LLM prompt context. Clinician-authored only."""
    require_minimum_role(actor, "clinician")
    text = extract_ai_assessment_context(session, patient_id, clinician_id=actor.actor_id)
    return {"patient_id": patient_id, "context": text}


@router.post("", response_model=AssessmentOut, status_code=201)
def create_assessment_endpoint(
    body: AssessmentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    require_minimum_role(actor, "clinician")
    payload = body.model_dump(exclude_none=True)
    record = create_assessment(session, clinician_id=actor.actor_id, **payload)
    return AssessmentOut.from_record(record)


@router.get("/{assessment_id}", response_model=AssessmentOut)
def get_assessment_endpoint(
    assessment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    require_minimum_role(actor, "clinician")
    record = get_assessment(session, assessment_id, actor.actor_id)
    if record is None:
        raise ApiServiceError(code="not_found", message="Assessment not found.", status_code=404)
    return AssessmentOut.from_record(record)


@router.patch("/{assessment_id}", response_model=AssessmentOut)
def update_assessment_endpoint(
    assessment_id: str,
    body: AssessmentUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    require_minimum_role(actor, "clinician")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    record = update_assessment(session, assessment_id, actor.actor_id, **updates)
    if record is None:
        raise ApiServiceError(code="not_found", message="Assessment not found.", status_code=404)
    return AssessmentOut.from_record(record)


class AssessmentApproveRequest(BaseModel):
    approved: bool = True
    review_notes: Optional[str] = None


@router.post("/{assessment_id}/approve", response_model=AssessmentOut)
def approve_assessment_endpoint(
    assessment_id: str,
    body: AssessmentApproveRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    """Mark an assessment as clinician-reviewed. Records reviewer + timestamp."""
    require_minimum_role(actor, "clinician")
    updates: dict = {
        "approved_status": "approved" if body.approved else "rejected",
        "reviewed_by": actor.actor_id,
    }
    if body.review_notes:
        updates["clinician_notes"] = body.review_notes
    record = update_assessment(session, assessment_id, actor.actor_id, **updates)
    if record is None:
        raise ApiServiceError(code="not_found", message="Assessment not found.", status_code=404)
    return AssessmentOut.from_record(record)


@router.delete("/{assessment_id}", status_code=204)
def delete_assessment_endpoint(
    assessment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    deleted = delete_assessment(session, assessment_id, actor.actor_id)
    if not deleted:
        raise ApiServiceError(code="not_found", message="Assessment not found.", status_code=404)

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
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


class AssessmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    data: Optional[dict] = None
    clinician_notes: Optional[str] = None
    status: Optional[str] = None
    score: Optional[str] = None


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
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "AssessmentOut":
        data = {}
        try:
            data = json.loads(r.data_json or "{}")
        except Exception:
            pass
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
    type: str  # "likert5" | "likert4" | "text" | "number" | "yesno" | "select"
    options: list[str] = []
    required: bool = True
    reverse_scored: bool = False

class AssessmentSection(BaseModel):
    id: str
    title: str
    fields: list[AssessmentField]

class AssessmentTemplateOut(BaseModel):
    id: str
    title: str
    abbreviation: str
    description: str
    conditions: list[str]
    instructions: str
    sections: list[AssessmentSection]
    scoring_info: str
    time_minutes: int


# ── Assessment Template Data ───────────────────────────────────────────────────

_LIKERT4_OPTIONS = ["Not at all", "Several days", "More than half the days", "Nearly every day"]
_LIKERT5_OPTIONS = ["Not at all", "A little bit", "Moderately", "Quite a bit", "Extremely"]
_ADHD_OPTIONS = ["Never/Rarely", "Sometimes", "Often", "Very Often"]
_DASS_OPTIONS = ["Never", "Sometimes", "Often", "Almost Always"]
_UPDRS_OPTIONS = ["Normal", "Slight", "Mild", "Moderate", "Severe"]
_ISI_SEVERITY_OPTIONS = ["None", "Mild", "Moderate", "Severe", "Very Severe"]
_ISI_SATISFIED_OPTIONS = ["Very satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very dissatisfied"]
_ISI_NOTICEABLE_OPTIONS = ["Not at all noticeable", "A little", "Somewhat", "Much", "Very much noticeable"]
_ISI_WORRIED_OPTIONS = ["Not at all worried", "A little", "Somewhat", "Much", "Very much worried"]
_ISI_INTERFERE_OPTIONS = ["Not at all interfering", "A little", "Somewhat", "Much", "Very much interfering"]


ASSESSMENT_TEMPLATES = [
    # ── PHQ-9 ──────────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="phq9",
        title="Patient Health Questionnaire-9",
        abbreviation="PHQ-9",
        description="Validated 9-item scale for screening and monitoring depression severity.",
        conditions=["Depression", "Anxiety", "PTSD"],
        instructions="Over the last 2 weeks, how often have you been bothered by any of the following problems?",
        time_minutes=3,
        scoring_info="0–4: Minimal depression | 5–9: Mild | 10–14: Moderate | 15–19: Moderately Severe | 20–27: Severe",
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

    # ── GAD-7 ──────────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="gad7",
        title="Generalised Anxiety Disorder 7",
        abbreviation="GAD-7",
        description="Validated 7-item scale for screening and measuring severity of generalised anxiety disorder.",
        conditions=["Anxiety", "Depression", "PTSD"],
        instructions="Over the last 2 weeks, how often have you been bothered by any of the following problems?",
        time_minutes=2,
        scoring_info="0–4: Minimal anxiety | 5–9: Mild | 10–14: Moderate | 15–21: Severe",
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

    # ── PCL-5 ──────────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="pcl5",
        title="PTSD Checklist for DSM-5",
        abbreviation="PCL-5",
        description="20-item self-report measure assessing DSM-5 PTSD symptoms over the past month.",
        conditions=["PTSD", "Anxiety", "Depression"],
        instructions="Below is a list of problems that people sometimes have in response to a very stressful experience. Please read each problem carefully and then circle one of the numbers to the right to indicate how much you have been bothered by that problem in the past month.",
        time_minutes=5,
        scoring_info="0–31: Below probable PTSD threshold | 32–80: Probable PTSD. Subscale cutoffs vary by cluster.",
        sections=[
            AssessmentSection(
                id="pcl5_intrusion",
                title="Criterion B — Intrusion Symptoms",
                fields=[
                    AssessmentField(id="pcl5_1", label="Repeated, disturbing, and unwanted memories of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_2", label="Repeated, disturbing dreams of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_3", label="Suddenly feeling or acting as if the stressful experience were actually happening again (as if you were actually back there reliving it)", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_4", label="Feeling very upset when something reminded you of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_5", label="Having strong physical reactions when something reminded you of the stressful experience (for example, heart pounding, trouble breathing, sweating)", type="likert5", options=_LIKERT5_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="pcl5_avoidance",
                title="Criterion C — Avoidance",
                fields=[
                    AssessmentField(id="pcl5_6", label="Avoiding memories, thoughts, or feelings related to the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_7", label="Avoiding external reminders of the stressful experience (for example, people, places, conversations, activities, objects, or situations)", type="likert5", options=_LIKERT5_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="pcl5_cognitions",
                title="Criterion D — Negative Alterations in Cognitions and Mood",
                fields=[
                    AssessmentField(id="pcl5_8", label="Trouble remembering important parts of the stressful experience", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_9", label="Having strong negative beliefs about yourself, other people, or the world (for example, having thoughts such as: I am bad, there is something seriously wrong with me, no one can be trusted, the world is completely dangerous)", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_10", label="Blaming yourself or someone else for the stressful experience or what happened after it", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_11", label="Having strong negative feelings such as fear, horror, anger, guilt, or shame", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_12", label="Loss of interest in activities that you used to enjoy", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_13", label="Feeling distant or cut off from other people", type="likert5", options=_LIKERT5_OPTIONS),
                    AssessmentField(id="pcl5_14", label="Trouble experiencing positive feelings (for example, being unable to feel happiness or love for people close to you)", type="likert5", options=_LIKERT5_OPTIONS),
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

    # ── ADHD-RS-5 ──────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="adhd_rs5",
        title="ADHD Rating Scale 5",
        abbreviation="ADHD-RS-5",
        description="18-item scale based on DSM-5 ADHD criteria, covering inattention and hyperactivity/impulsivity subscales.",
        conditions=["ADHD"],
        instructions="Please rate how often each of the following symptoms has occurred during the past 6 months.",
        time_minutes=5,
        scoring_info="Inattention subscale (items 1–9, odd-numbered): 0–9 low, 10–18 high. Hyperactivity/Impulsivity subscale (items 2–18, even-numbered): 0–9 low, 10–18 high. Total: 0–54.",
        sections=[
            AssessmentSection(
                id="adhd_rs5_inattention",
                title="Inattention",
                fields=[
                    AssessmentField(id="adhd_rs5_1", label="Fails to give close attention to details or makes careless mistakes in schoolwork, work, or during other activities", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_3", label="Has difficulty sustaining attention in tasks or play activities (e.g., has difficulty remaining focused during lectures, conversations, or lengthy reading)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_5", label="Does not seem to listen when spoken to directly (e.g., mind seems elsewhere, even in the absence of any obvious distraction)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_7", label="Does not follow through on instructions and fails to finish schoolwork, chores, or duties in the workplace (e.g., starts tasks but quickly loses focus and is easily sidetracked)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_9", label="Has difficulty organizing tasks and activities (e.g., difficulty managing sequential tasks; difficulty keeping materials and belongings in order)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_11", label="Avoids, dislikes, or is reluctant to engage in tasks that require sustained mental effort (e.g., schoolwork or homework; for older adolescents and adults, preparing reports, completing forms, reviewing lengthy papers)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_13", label="Loses things necessary for tasks or activities (e.g., school materials, pencils, books, tools, wallets, keys, paperwork, eyeglasses, mobile telephones)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_15", label="Is easily distracted by extraneous stimuli (for older adolescents and adults, may include unrelated thoughts)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_17", label="Is forgetful in daily activities (e.g., doing chores, running errands; for older adolescents and adults, returning calls, paying bills, keeping appointments)", type="likert4", options=_ADHD_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="adhd_rs5_hyperactivity",
                title="Hyperactivity / Impulsivity",
                fields=[
                    AssessmentField(id="adhd_rs5_2", label="Fidgets with or taps hands or feet, or squirms in seat", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_4", label="Leaves seat in situations when remaining seated is expected (e.g., leaves their place in the classroom, office or other workplace)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_6", label="Runs about or climbs in situations where it is not appropriate (in adolescents or adults, may be limited to feeling restless)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_8", label="Unable to play or engage in leisure activities quietly", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_10", label="Is 'on the go,' acting as if 'driven by a motor' (e.g., is unable to be or uncomfortable being still for extended time)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_12", label="Talks excessively", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_14", label="Blurts out an answer before a question has been completed (e.g., completes people's sentences; cannot wait for turn in conversation)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_16", label="Has difficulty waiting their turn (e.g., while waiting in line)", type="likert4", options=_ADHD_OPTIONS),
                    AssessmentField(id="adhd_rs5_18", label="Interrupts or intrudes on others (e.g., butts into conversations, games, or activities; may start using other people's things without asking or receiving permission)", type="likert4", options=_ADHD_OPTIONS),
                ],
            ),
        ],
    ),

    # ── ISI ────────────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="isi",
        title="Insomnia Severity Index",
        abbreviation="ISI",
        description="7-item self-report questionnaire assessing the nature, severity, and impact of insomnia.",
        conditions=["Insomnia", "Depression", "Anxiety"],
        instructions="For each question, please rate the current (i.e., last 2 weeks) severity of your insomnia problem.",
        time_minutes=3,
        scoring_info="0–7: No clinically significant insomnia | 8–14: Sub-threshold insomnia | 15–21: Moderate clinical insomnia | 22–28: Severe clinical insomnia",
        sections=[
            AssessmentSection(
                id="isi_severity",
                title="Insomnia Severity",
                fields=[
                    AssessmentField(id="isi_1a", label="Difficulty falling asleep — Severity", type="likert5", options=_ISI_SEVERITY_OPTIONS),
                    AssessmentField(id="isi_1b", label="Difficulty staying asleep — Severity", type="likert5", options=_ISI_SEVERITY_OPTIONS),
                    AssessmentField(id="isi_1c", label="Problem waking up too early — Severity", type="likert5", options=_ISI_SEVERITY_OPTIONS),
                ],
            ),
            AssessmentSection(
                id="isi_impact",
                title="Sleep Satisfaction and Impact",
                fields=[
                    AssessmentField(id="isi_2", label="How satisfied/dissatisfied are you with your current sleep pattern?", type="likert5", options=_ISI_SATISFIED_OPTIONS),
                    AssessmentField(id="isi_3", label="How noticeable to others do you think your sleep problem is in terms of impairing the quality of your life?", type="likert5", options=_ISI_NOTICEABLE_OPTIONS),
                    AssessmentField(id="isi_4", label="How worried/distressed are you about your current sleep problem?", type="likert5", options=_ISI_WORRIED_OPTIONS),
                    AssessmentField(id="isi_5", label="To what extent do you consider your sleep problem to interfere with your daily functioning (e.g., daytime fatigue, mood, ability to function at work/daily chores, concentration, memory, mood)?", type="likert5", options=_ISI_INTERFERE_OPTIONS),
                ],
            ),
        ],
    ),

    # ── UPDRS Motor ────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="updrs_motor",
        title="MDS-UPDRS Part III — Motor Examination (Simplified)",
        abbreviation="UPDRS-Motor",
        description="Clinician-rated 13-item motor examination section of the MDS-UPDRS, assessing motor signs of Parkinson's disease.",
        conditions=["Parkinson's Disease"],
        instructions="Rate each item based on direct examination of the patient. Score 0 (normal) to 4 (severe).",
        time_minutes=15,
        scoring_info="0: Normal | 1: Slight (detectable but not impairing) | 2: Mild (detectable, minimal impairment) | 3: Moderate (substantial impairment but manageable) | 4: Severe (cannot perform or requires assistance). Total range 0–52.",
        sections=[
            AssessmentSection(
                id="updrs_motor_main",
                title="Motor Signs",
                fields=[
                    AssessmentField(id="updrs_m_1", label="Speech — Rate intelligibility, hypophonia, and dysarthria", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_2", label="Facial Expression — Rate hypomimia, reduced blinking, and masked facies", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_3a", label="Rigidity — Neck: Assess cogwheel or lead-pipe resistance to passive movement", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_3b", label="Rigidity — Right Upper Extremity: Cogwheel or lead-pipe resistance at wrist/elbow", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_3c", label="Rigidity — Left Upper Extremity: Cogwheel or lead-pipe resistance at wrist/elbow", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_3d", label="Rigidity — Right Lower Extremity: Resistance at knee/ankle", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_3e", label="Rigidity — Left Lower Extremity: Resistance at knee/ankle", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_4", label="Finger Tapping — Right hand: Tap index finger to thumb rapidly and fully (10 seconds)", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_5", label="Hand Movements — Right hand: Open and close fist rapidly and fully (10 seconds)", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_6", label="Pronation-Supination Movements of Hands — Alternating supination/pronation both hands simultaneously (10 seconds)", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_7", label="Toe Tapping — Right foot: Tap heel on floor while keeping it there, rapidly and fully (10 seconds)", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_8", label="Leg Agility — Right leg: Lift leg off floor and tap rapidly (10 seconds)", type="likert5", options=_UPDRS_OPTIONS),
                    AssessmentField(id="updrs_m_9", label="Gait — Observe walking: stride length, arm swing, festination, freezing, turning", type="likert5", options=_UPDRS_OPTIONS),
                ],
            ),
        ],
    ),

    # ── DASS-21 ────────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="dass21",
        title="Depression Anxiety Stress Scales — 21",
        abbreviation="DASS-21",
        description="21-item self-report instrument measuring severity of depression, anxiety, and stress states over the past week.",
        conditions=["Depression", "Anxiety", "Stress"],
        instructions="Please read each statement and circle a number 0, 1, 2 or 3 which indicates how much the statement applied to you over the past week. There are no right or wrong answers. Do not spend too much time on any statement.",
        time_minutes=5,
        scoring_info=(
            "Multiply each subscale sum by 2 to get the conventional DASS-42 equivalent. "
            "Depression: 0–9 Normal | 10–13 Mild | 14–20 Moderate | 21–27 Severe | 28+ Extremely Severe. "
            "Anxiety: 0–7 Normal | 8–9 Mild | 10–14 Moderate | 15–19 Severe | 20+ Extremely Severe. "
            "Stress: 0–14 Normal | 15–18 Mild | 19–25 Moderate | 26–33 Severe | 34+ Extremely Severe."
        ),
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
                    AssessmentField(id="dass21_4", label="I experienced breathing difficulty (e.g., excessively rapid breathing, breathlessness in the absence of physical exertion)", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_7", label="I had a feeling of shakiness (e.g., legs going to give way)", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_9", label="I was worried about situations in which I might panic and make a fool of myself", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_15", label="I felt I was close to panic", type="likert4", options=_DASS_OPTIONS),
                    AssessmentField(id="dass21_19", label="I was aware of the action of my heart in the absence of physical exertion (e.g., sense of heart rate increase, heart missing a beat)", type="likert4", options=_DASS_OPTIONS),
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

    # ── SF-12 ──────────────────────────────────────────────────────────────────
    AssessmentTemplateOut(
        id="sf12",
        title="Short Form Health Survey 12",
        abbreviation="SF-12",
        description="12-item generic health survey measuring physical and mental health composite scores.",
        conditions=["Depression", "Anxiety", "Parkinson's Disease", "ADHD", "Insomnia", "PTSD", "General Health"],
        instructions="This survey asks for your views about your health. This information will help keep track of how you feel and how well you are able to do your usual activities. Answer every question by marking the answer as indicated. If you are unsure about how to answer a question, please give the best answer you can.",
        time_minutes=4,
        scoring_info=(
            "Scored using norm-based methods. Physical Component Summary (PCS) and Mental Component Summary (MCS) "
            "are norm-referenced to a mean of 50 (SD=10) in the general US population. "
            "Higher scores indicate better health status."
        ),
        sections=[
            AssessmentSection(
                id="sf12_general",
                title="General Health",
                fields=[
                    AssessmentField(
                        id="sf12_1",
                        label="In general, would you say your health is:",
                        type="select",
                        options=["Excellent", "Very good", "Good", "Fair", "Poor"],
                    ),
                ],
            ),
            AssessmentSection(
                id="sf12_physical_limitations",
                title="Physical Limitations",
                fields=[
                    AssessmentField(
                        id="sf12_2a",
                        label="The following activities might be things you do during a typical day. Does your health now limit you in MODERATE ACTIVITIES such as moving a table, pushing a vacuum cleaner, bowling, or playing golf?",
                        type="select",
                        options=["Yes, limited a lot", "Yes, limited a little", "No, not limited at all"],
                    ),
                    AssessmentField(
                        id="sf12_2b",
                        label="Does your health now limit you in CLIMBING SEVERAL FLIGHTS OF STAIRS?",
                        type="select",
                        options=["Yes, limited a lot", "Yes, limited a little", "No, not limited at all"],
                    ),
                ],
            ),
            AssessmentSection(
                id="sf12_role_physical",
                title="Role Limitations — Physical Health",
                fields=[
                    AssessmentField(
                        id="sf12_3a",
                        label="During the past 4 weeks, how much of the time have you accomplished LESS than you would like as a result of your PHYSICAL HEALTH?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                    AssessmentField(
                        id="sf12_3b",
                        label="During the past 4 weeks, were you LIMITED in the KIND of work or other activities you do as a result of your PHYSICAL HEALTH?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                ],
            ),
            AssessmentSection(
                id="sf12_role_emotional",
                title="Role Limitations — Emotional Problems",
                fields=[
                    AssessmentField(
                        id="sf12_4a",
                        label="During the past 4 weeks, how much of the time have you accomplished LESS than you would like as a result of any EMOTIONAL PROBLEMS (such as feeling depressed or anxious)?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                    AssessmentField(
                        id="sf12_4b",
                        label="During the past 4 weeks, did you do work or other activities LESS CAREFULLY than usual as a result of any EMOTIONAL PROBLEMS?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                ],
            ),
            AssessmentSection(
                id="sf12_pain",
                title="Bodily Pain",
                fields=[
                    AssessmentField(
                        id="sf12_5",
                        label="During the past 4 weeks, how much did PAIN interfere with your normal work (including both work outside the home and housework)?",
                        type="select",
                        options=["Not at all", "A little bit", "Moderately", "Quite a bit", "Extremely"],
                    ),
                ],
            ),
            AssessmentSection(
                id="sf12_mental_health",
                title="Mental Health and Vitality",
                fields=[
                    AssessmentField(
                        id="sf12_6a",
                        label="How much of the time during the past 4 weeks have you felt CALM AND PEACEFUL?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                    AssessmentField(
                        id="sf12_6b",
                        label="How much of the time during the past 4 weeks did you have a lot of ENERGY?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                    AssessmentField(
                        id="sf12_6c",
                        label="How much of the time during the past 4 weeks have you felt DOWNHEARTED AND BLUE?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                ],
            ),
            AssessmentSection(
                id="sf12_social",
                title="Social Functioning",
                fields=[
                    AssessmentField(
                        id="sf12_7",
                        label="During the past 4 weeks, how much of the time has your PHYSICAL HEALTH OR EMOTIONAL PROBLEMS interfered with your social activities (like visiting with friends, relatives, etc.)?",
                        type="select",
                        options=["All of the time", "Most of the time", "Some of the time", "A little of the time", "None of the time"],
                    ),
                ],
            ),
        ],
    ),
]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[AssessmentTemplateOut])
def list_assessment_templates() -> list[AssessmentTemplateOut]:
    """Returns all built-in validated clinical assessment templates."""
    return ASSESSMENT_TEMPLATES


@router.get("", response_model=AssessmentListResponse)
def list_assessments_endpoint(
    patient_id: Optional[str] = None,
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
    due_date: Optional[str] = None  # ISO date string; stored in notes until migration adds column


@router.post("/assign", response_model=AssessmentOut, status_code=201)
def assign_assessment_endpoint(
    body: AssessmentAssignRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    """Assign an assessment to a patient with status=pending."""
    require_minimum_role(actor, "clinician")
    notes = body.clinician_notes or ""
    if body.due_date:
        notes = f"{notes}\nDue: {body.due_date}".strip()
    template_title = next(
        (t["id"] for t in [{"id": body.template_id}]),
        body.template_id,
    )
    # Resolve a human-readable title from the template list if available
    for tpl in ASSESSMENT_TEMPLATES:
        if hasattr(tpl, "id") and tpl.id == body.template_id:
            template_title = getattr(tpl, "title", body.template_id)
            break
        if isinstance(tpl, dict) and tpl.get("id") == body.template_id:
            template_title = tpl.get("title", body.template_id)
            break
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
    )
    return AssessmentOut.from_record(record)


@router.post("", response_model=AssessmentOut, status_code=201)
def create_assessment_endpoint(
    body: AssessmentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AssessmentOut:
    require_minimum_role(actor, "clinician")
    record = create_assessment(session, clinician_id=actor.actor_id, **body.model_dump())
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

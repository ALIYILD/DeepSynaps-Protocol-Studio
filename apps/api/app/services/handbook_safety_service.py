"""
handbook_safety_service.py -- AI Safety Service for DeepSynaps Handbooks
========================================================================
Phase 4.  Six safety subsystems:
1. ForbiddenContentScanner      -- flags disallowed clinical claims
2. ReadabilityScorer            -- FKGL / SMOG / Coleman-Liau
3. CitationGroundingChecker     -- evidence-backed claim verification
4. HITLCheckpointWorkflow       -- human-in-the-loop gating
5. HealthLiteracyEnforcer       -- enforce patient-health-literacy standards
6. SafetyRulesEngine            -- declarative rule registry
"""

from __future__ import annotations
import math
import re
import time
from typing import Dict, List, Optional, Any
from typing_extensions import TypedDict


# ===========================================================================
# DATA MODELS
# ===========================================================================

class SafetyScanResult(TypedDict):
    passed: bool
    forbidden_found: List[Dict[str, Any]]
    suggestions: List[str]
    risk_score: float


class ReadabilityScore(TypedDict):
    flesch_kincaid_grade: float
    flesch_reading_ease: float
    smog_index: float
    coleman_liau_index: float
    avg_words_per_sentence: float
    avg_syllables_per_word: float
    complex_word_count: int
    total_words: int
    recommended_level: str


class GroundingReport(TypedDict):
    grounded_claims: List[Dict[str, Any]]
    ungrounded_claims: List[Dict[str, Any]]
    citation_gaps: List[str]
    grounding_score: float


class CheckpointStatus(TypedDict):
    checkpoint: int
    name: str
    status: str
    reviewer: Optional[str]
    timestamp: Optional[str]
    notes: Optional[str]
    blocking: bool


class HealthLiteracyResult(TypedDict):
    is_compliant: bool
    suggestions: List[str]
    violations: List[str]
    readability: ReadabilityScore


# ===========================================================================
# INTERNAL HELPER TYPES
# ===========================================================================

class HandbookSection:
    def __init__(self, section_id: str, title: str, body: str, section_type: str = "") -> None:
        self.section_id = section_id
        self.title = title
        self.body = body
        self.section_type = section_type


class EvidenceItem:
    def __init__(self, evidence_id: str, title: str, grade: str, year: int,
                 keywords: List[str], excerpt: str = "") -> None:
        self.evidence_id = evidence_id
        self.title = title
        self.grade = grade
        self.year = year
        self.keywords = [k.lower() for k in keywords]
        self.excerpt = excerpt


# ===========================================================================
# SYLLABLE COUNTER (rule-based, zero external deps)
# ===========================================================================

_VOWELS = "aeiouy"
_VOWEL_RE = re.compile(r"[aeiouy]+", re.IGNORECASE)
_SILENT_E = re.compile(r"e$", re.IGNORECASE)
_SILENT_ED = re.compile(r"ed$", re.IGNORECASE)


def _count_syllables(word: str) -> int:
    w = word.lower().strip(".,;:!?--'\"")
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    groups = _VOWEL_RE.findall(w)
    count = len(groups)
    if count > 1 and _SILENT_E.search(w):
        if not w.endswith("le") or (len(w) > 2 and w[-3] not in _VOWELS):
            count -= 1
    if count > 1 and _SILENT_ED.search(w) and len(w) > 3 and w[-3] not in _VOWELS:
        count -= 1
    return max(count, 1)


# ===========================================================================
# SAFETY RULES ENGINE -- declarative configuration
# ===========================================================================

SAFETY_RULES: Dict[str, Any] = {
    "mandatory_disclaimer": (
        "Draft for clinician review. Educational decision-support only. "
        "Not a diagnosis, prescription, or emergency guidance."
    ),
    "forbidden_phrases": [
        {"pattern": r"(?i)stop taking your medication", "severity": "critical",
         "suggestion": "Discuss medication changes with your prescribing clinician"},
        {"pattern": r"(?i)don't need to see (a doctor|your clinician)", "severity": "critical",
         "suggestion": "Continue regular appointments with your care team"},
        {"pattern": r"(?i)(will |guaranteed to )cure", "severity": "critical",
         "suggestion": "May help manage symptoms (evidence varies)"},
        {"pattern": r"(?i)100% safe", "severity": "critical",
         "suggestion": "Has established safety profile with known risks"},
        {"pattern": r"(?i)no side effects", "severity": "high",
         "suggestion": "Side effects are generally mild and transient"},
        {"pattern": r"(?i)skip your next appointment", "severity": "critical",
         "suggestion": "Attend all scheduled appointments"},
        {"pattern": r"(?i)self-administer.*without", "severity": "critical",
         "suggestion": "Must be administered under clinical supervision"},
        {"pattern": r"(?i)emergency.*not needed", "severity": "critical",
         "suggestion": "Seek emergency care if experiencing severe symptoms"},
        {"pattern": r"(?i)never (see|visit) (a|your) (doctor|physician|clinician)", "severity": "critical",
         "suggestion": "Maintain regular contact with your care team"},
        {"pattern": r"(?i)always safe", "severity": "high",
         "suggestion": "Generally well-tolerated with known risk profile"},
        {"pattern": r"(?i)completely risk[- ]free", "severity": "high",
         "suggestion": "Risks exist and should be discussed with your clinician"},
        {"pattern": r"(?i)cancel your (appointment|visit)", "severity": "critical",
         "suggestion": "Attend all scheduled appointments unless advised otherwise"},
    ],
    "absolute_qualifier_patterns": [
        r"\b(always|never|every|all|none|completely|totally|absolutely)\b",
    ],
    "required_sections": {
        "clinician": ["overview", "indications", "contraindications", "safety_checklist",
                       "evidence_appendix", "limitations"],
        "patient": ["what_is_this", "what_to_expect", "risks_benefits", "contacts"],
        "staff_sop": ["purpose", "procedure", "safety_protocols", "documentation"],
    },
}

# Pre-compile regex objects at module level for speed
_COMPILED_FORBIDDEN: List[Dict[str, Any]] = []
for _rule in SAFETY_RULES["forbidden_phrases"]:
    _COMPILED_FORBIDDEN.append({
        "regex": re.compile(_rule["pattern"]),
        "severity": _rule["severity"],
        "suggestion": _rule["suggestion"],
        "pattern_str": _rule["pattern"],
    })

_COMPILED_ABSOLUTE = [re.compile(p) for p in SAFETY_RULES["absolute_qualifier_patterns"]]


# ===========================================================================
# 1. FORBIDDEN CONTENT SCANNER
# ===========================================================================

async def scan_for_forbidden_content(content: str, context: str = "handbook") -> SafetyScanResult:
    """Scan generated content for forbidden clinical claims.

    Returns: passed, forbidden_found, suggestions, risk_score (0-1).
    """
    forbidden_found: List[Dict[str, Any]] = []
    suggestions: List[str] = []
    critical_count = 0
    high_count = 0

    # Literal forbidden-phrase scan
    for rule in _COMPILED_FORBIDDEN:
        for match in rule["regex"].finditer(content):
            hit = {
                "phrase": match.group(),
                "position": (match.start(), match.end()),
                "severity": rule["severity"],
                "suggestion": rule["suggestion"],
            }
            forbidden_found.append(hit)
            if hit["severity"] == "critical":
                critical_count += 1
            else:
                high_count += 1
            suggestions.append(
                f"[{hit['severity'].upper()}] \"{hit['phrase']}\" -> \"{hit['suggestion']}\""
            )

    # Absolute-statement heuristic scan
    for abs_re in _COMPILED_ABSOLUTE:
        for match in abs_re.finditer(content):
            start = max(match.start() - 40, 0)
            end = min(match.end() + 40, len(content))
            snippet = content[start:end].lower()
            prescriptive = ["should", "must", "need to", "have to", "do not", "you can"]
            if any(h in snippet for h in prescriptive):
                hit = {
                    "phrase": match.group(),
                    "position": (match.start(), match.end()),
                    "severity": "high",
                    "suggestion": "Add qualifier (e.g., 'usually', 'often', 'in many cases')",
                }
                forbidden_found.append(hit)
                high_count += 1
                suggestions.append(
                    f"[HIGH] Absolute qualifier \"{hit['phrase']}\" in prescriptive context"
                )

    # Prescription / diagnosis claim heuristics
    _rx = re.compile(
        r"(?i)\b(take\s+\d+\s*(mg|mcg|g|ml)\s+(of\s+)?[a-z]+)|"
        r"(\b(you are diagnosed with|your diagnosis is)\b)"
    )
    for match in _rx.finditer(content):
        hit = {
            "phrase": match.group(),
            "position": (match.start(), match.end()),
            "severity": "critical",
            "suggestion": "Prescriptive / diagnostic language must be reviewed by a clinician",
        }
        forbidden_found.append(hit)
        critical_count += 1
        suggestions.append(f"[CRITICAL] Prescriptive claim: \"{hit['phrase']}\"")

    # Composite risk score
    risk_score = min(1.0, critical_count * 0.25 + high_count * 0.10)
    if context == "patient_guide" and (critical_count > 0 or high_count > 2):
        risk_score = min(1.0, risk_score + 0.15)
    passed = critical_count == 0 and risk_score < 0.4

    return SafetyScanResult(
        passed=passed,
        forbidden_found=forbidden_found,
        suggestions=suggestions,
        risk_score=round(risk_score, 3),
    )


# ===========================================================================
# 2. READABILITY SCORER
# ===========================================================================

def score_readability(content: str) -> ReadabilityScore:
    """Calculate FKGL, Flesch Reading Ease, SMOG, Coleman-Liau indices.

    FKGL <= 8.0  -> simple       |  8.0-12.0  -> standard
    12.0-16.0    -> advanced     |  > 16.0    -> professional
    """
    if not content or not content.strip():
        return ReadabilityScore(
            flesch_kincaid_grade=0.0, flesch_reading_ease=0.0, smog_index=0.0,
            coleman_liau_index=0.0, avg_words_per_sentence=0.0,
            avg_syllables_per_word=0.0, complex_word_count=0,
            total_words=0, recommended_level="unknown",
        )

    sentences = [s.strip() for s in re.split(r"[.!?]+\s+", content.strip()) if s.strip()]
    total_sentences = max(len(sentences), 1)
    words = re.findall(r"\b[a-zA-Z']+\b", content)
    total_words = max(len(words), 1)

    total_syllables = 0
    complex_word_count = 0
    total_letters = 0
    for w in words:
        sc = _count_syllables(w)
        total_syllables += sc
        total_letters += len(w)
        if sc > 2:
            complex_word_count += 1

    aws = total_words / total_sentences
    asw = total_syllables / total_words

    fkg = 0.39 * aws + 11.8 * asw - 15.59
    fre = 206.835 - 1.015 * aws - 84.6 * asw
    smog = (1.043 * math.sqrt(complex_word_count * (30 / total_sentences)) + 3.1291
            if total_sentences >= 3 else fkg)
    lp100 = (total_letters / total_words) * 100
    sp100 = (total_sentences / total_words) * 100
    cli = 0.0588 * lp100 - 0.296 * sp100 - 15.8

    fkg_clamped = max(fkg, 0.0)
    if fkg_clamped <= 8.0:
        level = "simple"
    elif fkg_clamped <= 12.0:
        level = "standard"
    elif fkg_clamped <= 16.0:
        level = "advanced"
    else:
        level = "professional"

    return ReadabilityScore(
        flesch_kincaid_grade=round(fkg_clamped, 2),
        flesch_reading_ease=round(fre, 2),
        smog_index=round(smog, 2),
        coleman_liau_index=round(cli, 2),
        avg_words_per_sentence=round(aws, 2),
        avg_syllables_per_word=round(asw, 2),
        complex_word_count=complex_word_count,
        total_words=total_words,
        recommended_level=level,
    )


# ===========================================================================
# 3. CITATION GROUNDING CHECKER
# ===========================================================================

def _extract_claims(section_body: str) -> List[str]:
    """Naive factual-claim extractor."""
    sentences = re.split(r"[.!?]+\s+", section_body.strip())
    claims: List[str] = []
    for s in sentences:
        s = s.strip()
        if re.search(r"\d+(\.\d+)?%|\b(study|trial|meta-analysis|RCT|patients|efficacy|"
                     r"safety|mortality|adverse|event|dosage|mg|mcg)\b", s, re.IGNORECASE):
            claims.append(s)
        elif len(s) > 20:
            claims.append(s)
    return claims


def _claim_grounded(claim: str, evidence: EvidenceItem) -> bool:
    claim_words = set(re.findall(r"\b[a-z]{4,}\b", claim.lower()))
    overlap = claim_words.intersection(set(evidence.keywords))
    return len(overlap) >= 2


async def verify_citation_grounding(
    sections: List[HandbookSection], evidence_items: List[EvidenceItem]
) -> GroundingReport:
    """Verify every clinical claim is grounded in evidence.

    A claim is grounded if it shares 2+ key terms with an evidence item
    graded A/B/C and published within the last 10 years.
    """
    current_year = 2025
    valid_evidence = [ev for ev in evidence_items
                      if ev.grade.upper() in ("A", "B", "C")
                      and (current_year - ev.year) <= 10]
    grounded_claims: List[Dict[str, Any]] = []
    ungrounded_claims: List[Dict[str, Any]] = []
    citation_gaps: List[str] = []
    total_claims = 0
    grounded_count = 0

    for section in sections:
        for claim in _extract_claims(section.body):
            total_claims += 1
            matched = False
            for ev in valid_evidence:
                if _claim_grounded(claim, ev):
                    grounded_claims.append({
                        "section_id": section.section_id,
                        "claim": claim,
                        "evidence_id": ev.evidence_id,
                        "evidence_title": ev.title,
                        "grade": ev.grade,
                    })
                    grounded_count += 1
                    matched = True
                    break
            if not matched:
                ungrounded_claims.append({
                    "section_id": section.section_id,
                    "claim": claim,
                    "reason": "No matching evidence found",
                })
                citation_gaps.append(f"[{section.section_id}] {claim[:80]}...")

    return GroundingReport(
        grounded_claims=grounded_claims,
        ungrounded_claims=ungrounded_claims,
        citation_gaps=citation_gaps,
        grounding_score=round(grounded_count / max(total_claims, 1), 3),
    )


# ===========================================================================
# 4. HITL CHECKPOINT WORKFLOW
# ===========================================================================

_CHECKPOINT_NAMES = {
    1: "Generation complete",
    2: "Safety scan passed",
    3: "Evidence grounded",
    4: "Readability verified",
    5: "Clinician review complete",
    6: "Sign-off complete",
}

_hitl_store: Dict[str, Dict[int, CheckpointStatus]] = {}


class HITLCheckpoint:
    """Human-in-the-Loop checkpoint manager with 6 sequential gates.

    Gates: Gen -> Safety -> Grounding -> Readability -> Review -> Sign-off.
    A failed gate blocks all downstream gates.
    """

    def __init__(self, store: Optional[Dict[str, Dict[int, CheckpointStatus]]] = None) -> None:
        self._db = store if store is not None else _hitl_store

    def _ensure_pipeline(self, handbook_id: str) -> Dict[int, CheckpointStatus]:
        if handbook_id not in self._db:
            pipeline: Dict[int, CheckpointStatus] = {}
            for i in range(1, 7):
                pipeline[i] = CheckpointStatus(
                    checkpoint=i, name=_CHECKPOINT_NAMES[i], status="pending",
                    reviewer=None, timestamp=None, notes=None, blocking=(i == 1),
                )
            self._db[handbook_id] = pipeline
        return self._db[handbook_id]

    def get_checkpoint_status(self, handbook_id: str, checkpoint: int) -> CheckpointStatus:
        pipeline = self._ensure_pipeline(handbook_id)
        if checkpoint not in pipeline:
            raise ValueError(f"Invalid checkpoint {checkpoint} (valid 1-6)")
        return pipeline[checkpoint]

    def advance_checkpoint(self, handbook_id: str, checkpoint: int, reviewer: str,
                           notes: str = "", decision: str = "pass") -> bool:
        """Pass/fail/waive a checkpoint. Returns True if accepted."""
        pipeline = self._ensure_pipeline(handbook_id)
        if checkpoint not in pipeline:
            raise ValueError(f"Invalid checkpoint {checkpoint}")
        if checkpoint > 1 and not self.can_proceed(handbook_id, checkpoint):
            return False
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        status_map = {"pass": "passed", "fail": "failed", "waive": "waived"}
        new_status = status_map.get(decision, "passed")
        pipeline[checkpoint] = CheckpointStatus(
            checkpoint=checkpoint, name=_CHECKPOINT_NAMES[checkpoint],
            status=new_status, reviewer=reviewer, timestamp=now,
            notes=notes, blocking=(new_status in ("pending", "failed")),
        )
        if new_status in ("passed", "waived"):
            for i in range(checkpoint + 1, 7):
                cp = pipeline[i]
                if cp["status"] == "pending":
                    pipeline[i] = CheckpointStatus(
                        checkpoint=i, name=_CHECKPOINT_NAMES[i], status="pending",
                        reviewer=None, timestamp=None, notes=None, blocking=False,
                    )
        elif new_status == "failed":
            for i in range(checkpoint + 1, 7):
                cp = pipeline[i]
                if cp["status"] == "pending":
                    pipeline[i] = CheckpointStatus(
                        checkpoint=i, name=_CHECKPOINT_NAMES[i], status="pending",
                        reviewer=None, timestamp=None,
                        notes=f"Blocked -- checkpoint {checkpoint} failed", blocking=True,
                    )
        return True

    def can_proceed(self, handbook_id: str, next_checkpoint: int) -> bool:
        """Return True if all prior checkpoints are passed or waived."""
        if next_checkpoint <= 1:
            return True
        pipeline = self._ensure_pipeline(handbook_id)
        return all(pipeline[i]["status"] in ("passed", "waived")
                   for i in range(1, next_checkpoint))

    def get_full_pipeline(self, handbook_id: str) -> List[CheckpointStatus]:
        pipeline = self._ensure_pipeline(handbook_id)
        return [pipeline[i] for i in range(1, 7)]

    def reset_pipeline(self, handbook_id: str) -> None:
        if handbook_id in self._db:
            del self._db[handbook_id]
        self._ensure_pipeline(handbook_id)


# ===========================================================================
# 5. HEALTH LITERACY ENFORCER
# ===========================================================================

def enforce_health_literacy(content: str, target_audience: str = "patient") -> HealthLiteracyResult:
    """Enforce health-literacy standards.

    Patient: FKGL <= 8.0, sentences <= 15 words, active voice,
    defined terms, bullet points. Returns compliance + suggestions.
    """
    readability = score_readability(content)
    suggestions: List[str] = []
    violations: List[str] = []
    is_compliant = True

    max_fkgl = {"patient": 8.0, "clinician": 16.0, "staff": 12.0}.get(target_audience, 8.0)

    if readability["flesch_kincaid_grade"] > max_fkgl:
        violations.append(f"FKGL {readability['flesch_kincaid_grade']} exceeds target {max_fkgl}")
        suggestions.append(f"Simplify vocabulary (FKGL -> <= {max_fkgl})")
        is_compliant = False

    sentences = [s.strip() for s in re.split(r"[.!?]+\s+", content.strip()) if s.strip()]
    max_sw = 15 if target_audience == "patient" else 25
    long_sents = sum(1 for s in sentences if len(re.findall(r"\b\w+\b", s)) > max_sw)
    if long_sents > 0:
        violations.append(f"{long_sents} sentence(s) exceed {max_sw} words")
        suggestions.append(f"Break long sentences into <= {max_sw} words each")
        if target_audience == "patient":
            is_compliant = False

    passive_hits = sum(len(re.findall(p, content))
                       for p in [r"\b(is|are|was|were|be|been|being)\s+\w+ed\b",
                                 r"\b(has|have|had)\s+been\s+\w+ed\b"])
    if passive_hits > 2:
        suggestions.append(f"Rewrite {passive_hits} passive-voice phrases in active voice")
        if target_audience == "patient" and passive_hits > 4:
            violations.append(f"{passive_hits} passive-voice constructions")
            is_compliant = False

    med_terms = re.findall(
        r"\b([a-z]{6,}itis|[a-z]{6,}ectomy|[a-z]{6,}scopy|[a-z]{6,}emia|"
        r"hypertension|diabetes|arrhythmia|bronchodilator|anticoagulant)\b",
        content, re.IGNORECASE)
    for term in set(med_terms):
        ctxs = re.findall(rf"[^.]*\b{re.escape(term)}\b[^.]*", content, re.IGNORECASE)
        if not any(re.search(r"\(.*\)|means|is a|refers to", c, re.IGNORECASE) for c in ctxs):
            if target_audience == "patient":
                violations.append(f"Undefined term: {term}")
                is_compliant = False
    if violations and any("Undefined term" in v for v in violations):
        suggestions.append("Add plain-language definitions for technical medical terms")

    if target_audience == "patient":
        if content.count("\n-") < 2 and content.count("\n*") < 2:
            suggestions.append("Add bullet-point lists to improve scannability")
        if readability["complex_word_count"] > readability["total_words"] * 0.15:
            suggestions.append("Replace multi-syllable words with simpler synonyms")
            is_compliant = False

    return HealthLiteracyResult(
        is_compliant=is_compliant,
        suggestions=suggestions,
        violations=violations,
        readability=readability,
    )


# ===========================================================================
# 6. DEMO DATA & TEST CASES
# ===========================================================================

DEMO_EVIDENCE: List[EvidenceItem] = [
    EvidenceItem("ev-001", "RCT of metformin in T2DM", "A", 2022,
                 ["metformin", "diabetes", "glucose", "hba1c", "insulin", "patients"],
                 "Metformin reduced HbA1c by 1.2% in 320 patients over 24 weeks."),
    EvidenceItem("ev-002", "Meta-analysis of GLP-1 agonists and CV outcomes", "A", 2023,
                 ["glp-1", "agonist", "cardiovascular", "mace", "semaglutide", "liraglutide"],
                 "GLP-1 agonists demonstrated 14% RR reduction in MACE."),
    EvidenceItem("ev-003", "Safety profile of SGLT2 inhibitors", "B", 2021,
                 ["sglt2", "empagliflozin", "dapagliflozin", "safety", "genital", "infection"],
                 "Genital infections 6.4% vs 1.8% placebo; DKA rare (0.1%)."),
    EvidenceItem("ev-004", "Outdated observational study", "C", 2012,
                 ["old", "observational", "retrospective"],
                 "Retrospective chart review, n=45."),
]

DEMO_SECTIONS: List[HandbookSection] = [
    HandbookSection("sec-01", "Pharmacologic Management",
        "Metformin remains first-line therapy for type 2 diabetes, reducing "
        "HbA1c by approximately 1.2% over 24 weeks in the landmark RCT. "
        "GLP-1 receptor agonists such as semaglutide provide additional "
        "cardiovascular protection, with a 14% relative risk reduction in MACE. "
        "SGLT2 inhibitors offer renal benefits but carry a 6.4% risk of genital infections."),
    HandbookSection("sec-02", "Unsubstantiated Claim",
        "Magnet therapy has been shown to reverse pancreatic beta-cell failure "
        "in 95% of patients within two weeks, representing a paradigm shift in care."),
]

TEST_CONTENT_SAFE = (
    "Patients taking metformin should continue regular follow-up with their "
    "healthcare team. Discuss any medication changes with your clinician."
)

TEST_CONTENT_UNSAFE = (
    "You should stop taking your medication immediately. You don't need to see "
    "a doctor anymore. This treatment will cure your condition and is 100% safe "
    "with no side effects. You can skip your next appointment."
)

TEST_CONTENT_PATIENT = (
    "Diabetes means your blood sugar is too high. Metformin is a pill that helps "
    "lower your blood sugar. Take it with food. Call your care team if you feel sick."
)

TEST_CONTENT_COMPLEX = (
    "The pharmacological management of type 2 diabetes mellitus necessitates a "
    "multifactorial approach encompassing glycemic control, cardiovascular risk "
    "stratification, and nephroprotective interventions, with particular attention "
    "to the heterogeneous pathophysiological mechanisms underlying insulin resistance."
)

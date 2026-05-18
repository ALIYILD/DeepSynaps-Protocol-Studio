#!/usr/bin/env python3
"""
OTseeker Adapter  –  Occupational Therapy Systematic Reviews
=============================================================

* Data source : https://otseeker.com/  (web-only, no public API)
* Records     : 10 000+ systematic reviews and RCTs
* Format      : HTML search results (no bulk download)
* Confidence  : B (curated evidence database)

Implementation strategy
-----------------------
Because OTseeker has **no public API or bulk-download endpoint**, this
adapter returns **representative mock data** that mirrors the schema
and cardinality of the live database.

The mock corpus covers the major OT intervention domains:
- Stroke rehabilitation
- Autism spectrum / sensory integration
- Hand therapy / splinting
- Mental health (depression, anxiety)
- Dementia / cognitive rehab
- Paediatric developmental disorders
- Chronic pain / arthritis
- Traumatic brain injury

Canonical output
----------------
Each record becomes an :class:`EvidenceEntry` with OT-specific
interventions, conditions and quality scores.
"""

from __future__ import annotations

import copy
import logging
import random
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from .base_adapter import BaseAdapter, logger
from .models import (
    ConfidenceTier,
    EvidenceEntry,
    EvidenceType,
    Provenance,
)

logger = logging.getLogger("batch_c.otseeker")


# ---------------------------------------------------------------------------
# Mock data constants
# ---------------------------------------------------------------------------

MOCK_JOURNALS = [
    "American Journal of Occupational Therapy",
    "Australian Occupational Therapy Journal",
    "British Journal of Occupational Therapy",
    "Canadian Journal of Occupational Therapy",
    "Occupational Therapy International",
    "Physical & Occupational Therapy in Pediatrics",
    "Scandinavian Journal of Occupational Therapy",
    "OTJR: Occupation, Participation and Health",
]

MOCK_AUTHORS_POOL = [
    "Smith J", "Taylor R", "Brown A", "Wilson M", "Chen L",
    "Garcia P", "Anderson K", "Thompson D", "White S", "Lee H",
    "Martin B", "Clark E", "Walker N", "Robinson F", "Rodriguez G",
    "Lewis J", "Harris M", "Young T", "Hall P", "King C",
]

# Domain-specific mock records
_MOCK_RECORDS: List[Dict[str, Any]] = [
    # ── Stroke ──────────────────────────────────────────────────────────
    {
        "title": "Occupational therapy for motor rehabilitation in stroke: a systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review_with_meta_analysis",
        "sample_size": 2847, "quality_score": 4.5,
        "interventions": ["task-oriented training", "mirror therapy", "robot-assisted therapy"],
        "conditions": ["stroke", "hemiparesis"],
        "outcomes": ["Fugl-Meyer Assessment", "Barthel Index", "motor function"],
    },
    {
        "title": "CIMT for upper extremity function post-stroke: a randomised controlled trial",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 120, "quality_score": 7,
        "interventions": ["constraint-induced movement therapy", "conventional therapy"],
        "conditions": ["stroke", "upper limb dysfunction"],
        "outcomes": ["Wolf Motor Function Test", "Motor Activity Log"],
    },
    {
        "title": "Mirror therapy versus mental imagery for stroke rehabilitation",
        "year": 2021, "evidence_type": "RCT",
        "study_design": "crossover_rct",
        "sample_size": 64, "quality_score": 6,
        "interventions": ["mirror therapy", "mental imagery"],
        "conditions": ["stroke"],
        "outcomes": ["Fugl-Meyer upper extremity", " Box and Block Test"],
    },
    # ── Autism / Sensory ────────────────────────────────────────────────
    {
        "title": "Sensory integration therapy for children with autism spectrum disorder",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review",
        "sample_size": 456, "quality_score": 3.5,
        "interventions": ["sensory integration therapy", "Ayres Sensory Integration"],
        "conditions": ["autism spectrum disorder", "sensory processing dysfunction"],
        "outcomes": ["Sensory Profile scores", "adaptive behaviour", "attention"],
    },
    {
        "title": "Social skills training for adolescents with ASD: an RCT",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 89, "quality_score": 6.5,
        "interventions": ["PEERS social skills group", "waitlist control"],
        "conditions": ["autism spectrum disorder", "social communication disorder"],
        "outcomes": ["Social Responsiveness Scale", "friendship quality"],
    },
    {
        "title": "Weighted blankets for sleep in children with ASD and ADHD",
        "year": 2023, "evidence_type": "RCT",
        "study_design": "crossover_rct",
        "sample_size": 120, "quality_score": 7,
        "interventions": ["weighted blanket", "control blanket"],
        "conditions": ["autism spectrum disorder", "attention deficit hyperactivity disorder"],
        "outcomes": ["total sleep time", "sleep onset latency", "night wakings"],
    },
    # ── Hand Therapy ────────────────────────────────────────────────────
    {
        "title": "Splinting for carpal tunnel syndrome: systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review",
        "sample_size": 612, "quality_score": 4,
        "interventions": ["night splinting", "nerve gliding exercises", "ultrasound therapy"],
        "conditions": ["carpal tunnel syndrome"],
        "outcomes": ["Boston Carpal Tunnel Questionnaire", "nerve conduction velocity"],
    },
    {
        "title": "Custom versus prefabricated splints for distal radius fractures",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 96, "quality_score": 6,
        "interventions": ["custom thermoplastic splint", "prefabricated splint"],
        "conditions": ["distal radius fracture"],
        "outcomes": ["grip strength", "wrist range of motion", "DASH score"],
    },
    # ── Mental Health ───────────────────────────────────────────────────
    {
        "title": "Occupational therapy for depression in adults: a systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review_with_meta_analysis",
        "sample_size": 1340, "quality_score": 4,
        "interventions": ["behavioural activation", "mindfulness-based OT", "goal management training"],
        "conditions": ["major depressive disorder", "persistent depressive disorder"],
        "outcomes": ["PHQ-9", "HAM-D", "quality of life"],
    },
    {
        "title": "Mindfulness-based occupational therapy for anxiety disorders",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 78, "quality_score": 5.5,
        "interventions": ["mindfulness-based OT group", "relaxation training"],
        "conditions": ["generalised anxiety disorder"],
        "outcomes": ["GAD-7", "SF-36", "occupational performance"],
    },
    {
        "title": "Community gardening for wellbeing in adults with mental illness",
        "year": 2021, "evidence_type": "clinical_trial",
        "study_design": "prospective_cohort",
        "sample_size": 45, "quality_score": 4,
        "interventions": ["therapeutic gardening programme", "standard care"],
        "conditions": ["schizophrenia", "bipolar disorder"],
        "outcomes": ["Warwick-Edinburgh Mental Wellbeing Scale", "social connectedness"],
    },
    # ── Dementia ────────────────────────────────────────────────────────
    {
        "title": "Cognitive stimulation therapy for dementia: an OT perspective",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review_with_meta_analysis",
        "sample_size": 892, "quality_score": 4.5,
        "interventions": ["cognitive stimulation therapy", "reality orientation", "reminiscence therapy"],
        "conditions": ["Alzheimer disease", "vascular dementia", "mixed dementia"],
        "outcomes": ["MMSE", "ADL performance", "quality of life"],
    },
    {
        "title": "Multisensory environments (Snoezelen) for agitation in dementia",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "cluster_rct",
        "sample_size": 144, "quality_score": 5,
        "interventions": ["Snoezelen room sessions", "standard activity programme"],
        "conditions": ["dementia", "behavioural and psychological symptoms of dementia"],
        "outcomes": ["Cohen-Mansfield Agitation Inventory", "engagement"],
    },
    {
        "title": "Adaptive equipment for ADL independence in early-stage dementia",
        "year": 2021, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 68, "quality_score": 5.5,
        "interventions": ["compensatory strategy training", "home modification"],
        "conditions": ["Alzheimer disease"],
        "outcomes": ["Bristol ADL Scale", "carer burden"],
    },
    # ── Paediatrics ─────────────────────────────────────────────────────
    {
        "title": "School-based OT for handwriting difficulties: systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review",
        "sample_size": 534, "quality_score": 3.5,
        "interventions": ["handwriting intervention", "fine motor training", "sensory-motor approach"],
        "conditions": ["developmental coordination disorder", "dysgraphia"],
        "outcomes": ["Test of Handwriting Skills", "legibility", "writing speed"],
    },
    {
        "title": "Prewriting interventions for preschool children: a cluster RCT",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "cluster_rct",
        "sample_size": 180, "quality_score": 6,
        "interventions": ["occupational prewriting programme", "classroom as usual"],
        "conditions": ["developmental delay", "school readiness difficulties"],
        "outcomes": ["Developmental Test of Visual Perception", "Beery VMI"],
    },
    {
        "title": "Parent-mediated OT for toddlers with developmental delay",
        "year": 2023, "evidence_type": "clinical_trial",
        "study_design": "single_blind_rct",
        "sample_size": 72, "quality_score": 5.5,
        "interventions": ["parent coaching programme", "direct therapist intervention"],
        "conditions": ["developmental delay", "prematurity sequelae"],
        "outcomes": ["Bayley-III", "Pediatric Evaluation of Disability Inventory"],
    },
    # ── Chronic Pain / Arthritis ────────────────────────────────────────
    {
        "title": "Joint protection education for rheumatoid arthritis: Cochrane review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "cochrane_systematic_review",
        "sample_size": 1034, "quality_score": 5,
        "interventions": ["joint protection training", "arthritis self-management"],
        "conditions": ["rheumatoid arthritis"],
        "outcomes": ["DAS28", "HAQ-DI", "grip strength"],
    },
    {
        "title": "Hand exercise programmes for hand osteoarthritis: an RCT",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 130, "quality_score": 6,
        "interventions": ["standardised hand exercise", "usual care"],
        "conditions": ["hand osteoarthritis"],
        "outcomes": ["AUSCAN", "grip strength", "pinch strength"],
    },
    {
        "title": "Energy conservation programmes for fibromyalgia",
        "year": 2021, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 86, "quality_score": 5.5,
        "interventions": ["energy conservation education", "pacing programme"],
        "conditions": ["fibromyalgia", "chronic fatigue"],
        "outcomes": ["FIQ", "6-Minute Walk Test", "self-efficacy"],
    },
    # ── Traumatic Brain Injury ──────────────────────────────────────────
    {
        "title": "Cognitive rehabilitation after TBI: systematic review by OT focus",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review_with_meta_analysis",
        "sample_size": 1567, "quality_score": 4,
        "interventions": ["compensatory cognitive training", "metacognitive strategy instruction", "errorless learning"],
        "conditions": ["traumatic brain injury", "cognitive impairment"],
        "outcomes": ["Goal Management Training", "Functional Independence Measure", "community integration"],
    },
    {
        "title": "Community integration programmes for moderate-severe TBI",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 98, "quality_score": 5,
        "interventions": ["community-based OT programme", "standard outpatient rehabilitation"],
        "conditions": ["traumatic brain injury"],
        "outcomes": ["Community Integration Questionnaire", "Participation Objective Participation Subjective"],
    },
    {
        "title": "Driving rehabilitation after acquired brain injury: a cohort study",
        "year": 2021, "evidence_type": "cohort_study",
        "study_design": "prospective_cohort",
        "sample_size": 56, "quality_score": 4,
        "interventions": ["on-road driving assessment", "simulator training"],
        "conditions": ["acquired brain injury", "stroke"],
        "outcomes": ["on-road pass rate", "Drivescope metrics"],
    },
    # ── Vocational / Work Rehabilitation ────────────────────────────────
    {
        "title": "Return-to-work programmes after orthopaedic injury: systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review",
        "sample_size": 2340, "quality_score": 3.5,
        "interventions": ["work hardening", "graded return-to-work", "workplace modifications"],
        "conditions": ["work-related musculoskeletal disorder", "upper limb injury"],
        "outcomes": ["return-to-work status", "days lost", "job retention"],
    },
    {
        "title": "Supported employment for adults with serious mental illness",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 156, "quality_score": 6,
        "interventions": ["Individual Placement and Support", "vocational rehabilitation"],
        "conditions": ["serious mental illness", "schizophrenia", "bipolar disorder"],
        "outcomes": ["competitive employment rate", "job tenure", "earnings"],
    },
    # ── Home Modifications / Falls Prevention ───────────────────────────
    {
        "title": "Home modification for fall prevention in older adults: systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "systematic_review_with_meta_analysis",
        "sample_size": 3789, "quality_score": 5,
        "interventions": ["home hazard assessment", "installation of grab rails", "lighting improvements", "removal of trip hazards"],
        "conditions": ["fall risk", "frailty"],
        "outcomes": ["rate of falls", "fall-related injuries", "Fear of Falling Avoidance Behaviour Questionnaire"],
    },
    {
        "title": "Bathroom modifications for independence in bathing: an RCT",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 112, "quality_score": 5.5,
        "interventions": ["occupational therapist home assessment", "adaptive equipment provision"],
        "conditions": ["functional decline", "osteoarthritis"],
        "outcomes": ["Barthel Index bathing item", "Canadian Occupational Performance Measure"],
    },
    # ── Sensory Processing ──────────────────────────────────────────────
    {
        "title": "Sensory-based interventions for adults with schizophrenia",
        "year": 2023, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 84, "quality_score": 5,
        "interventions": ["sensory modulation programme", "relaxation group"],
        "conditions": ["schizophrenia", "sensory processing difficulties"],
        "outcomes": ["Sensory Profile Adult", "Positive and Negative Syndrome Scale"],
    },
    {
        "title": "Alerting programmes for attention in children with ADHD",
        "year": 2021, "evidence_type": "clinical_trial",
        "study_design": "single_blind_rct",
        "sample_size": 62, "quality_score": 4.5,
        "interventions": ["How Does Your Engine Run? programme", "standard classroom strategies"],
        "conditions": ["attention deficit hyperactivity disorder"],
        "outcomes": ["Conners 3", "Behaviour Rating Inventory of Executive Function"],
    },
    # ── Palliative Care / Oncology ──────────────────────────────────────
    {
        "title": "Occupational therapy in oncology palliative care: a systematic review",
        "year": 2023, "evidence_type": "systematic_review",
        "study_design": "scoping_review",
        "sample_size": 456, "quality_score": 3,
        "interventions": ["fatigue management", "energy conservation", "ADL maintenance", "meaningful activity"],
        "conditions": ["cancer-related fatigue", "advanced cancer"],
        "outcomes": ["Piper Fatigue Scale", "EORTC QLQ-C30", "occupational participation"],
    },
    {
        "title": "Lymphedema self-management education after breast cancer surgery",
        "year": 2022, "evidence_type": "RCT",
        "study_design": "parallel_group_rct",
        "sample_size": 140, "quality_score": 6,
        "interventions": ["OT-led self-management programme", "information leaflet"],
        "conditions": ["breast cancer-related lymphedema"],
        "outcomes": ["arm circumference", "LYMQOL", "self-efficacy"],
    },
]


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class OtseekerAdapter(BaseAdapter):
    """Return representative mock data for OTseeker systematic reviews.

    Because OTseeker has no public API, :meth:`fetch` returns the static
    mock corpus.  The transform layer still normalises each dict into an
    :class:`EvidenceEntry`, keeping the adapter interface identical to
    every other Batch-C adapter.
    """

    source_name = "otseeker"
    source_url = "https://otseeker.com/"
    confidence_tier = "B"
    cache_subdir = "otseeker"
    cache_file_raw = "raw.pkl"
    cache_file_canonical = "canonical.json.gz"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._mock_data: List[Dict[str, Any]] = copy.deepcopy(_MOCK_RECORDS)

    # ------------------------------------------------------------------
    # fetch  →  returns mock records (no HTTP)
    # ------------------------------------------------------------------
    def fetch(self) -> List[Dict[str, Any]]:
        """Return the static mock corpus (no HTTP)."""
        cached = self._load_raw_cache()
        if cached is not None:
            return cached  # type: ignore[return-value]

        logger.info(
            "[%s] Using mock corpus (%d representative records)",
            self.source_name, len(self._mock_data),
        )
        self._save_raw_to_cache(self._mock_data)
        return self._mock_data

    def _save_raw_to_cache(self, data: List[Dict[str, Any]]) -> None:
        import pickle
        try:
            with open(self._raw_cache_path, "wb") as fh:
                pickle.dump(data, fh, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception as exc:
            logger.warning("[%s] Failed to write raw cache: %s", self.source_name, exc)

    # ------------------------------------------------------------------
    # transform
    # ------------------------------------------------------------------
    def transform(self, raw: List[Dict[str, Any]]) -> List[EvidenceEntry]:
        """Convert mock dicts → EvidenceEntry objects."""
        entries: List[EvidenceEntry] = []
        prov = Provenance(
            source=self.source_name,
            source_url=self.source_url,
            confidence_tier=ConfidenceTier.FILTERED,
        )

        for idx, row in enumerate(raw):
            try:
                entry = self._dict_to_evidence(row, prov, idx)
            except Exception as exc:
                logger.debug("[%s] Skipping malformed mock row %d: %s", self.source_name, idx, exc)
                continue
            entries.append(entry)

        logger.info("[%s] Transformed %d mock records → EvidenceEntry", self.source_name, len(entries))
        return entries

    def _dict_to_evidence(
        self,
        row: Dict[str, Any],
        prov: Provenance,
        idx: int,
    ) -> EvidenceEntry:
        """Populate an EvidenceEntry from a mock dict."""
        # assign semi-realistic metadata
        authors = random.sample(MOCK_AUTHORS_POOL, k=random.randint(2, 5))
        journal = random.choice(MOCK_JOURNALS)

        # evidence type
        et_raw = row.get("evidence_type", "unknown")
        try:
            ev_type = EvidenceType(et_raw)
        except ValueError:
            ev_type = EvidenceType.UNKNOWN

        entry = EvidenceEntry(
            title=row["title"],
            authors=authors,
            year=row.get("year"),
            journal=journal,
            abstract=f"Mock abstract for: {row['title']}",
            external_id=f"OTSEEKER-MOCK-{idx:05d}",
            evidence_type=ev_type,
            study_design=row.get("study_design", ""),
            sample_size=row.get("sample_size"),
            quality_score=row.get("quality_score"),
            interventions=list(row.get("interventions", [])),
            conditions=list(row.get("conditions", [])),
            outcomes=list(row.get("outcomes", [])),
            language="en",
            url=f"{self.source_url}abstract/{idx}",
            provenance=Provenance(
                source=prov.source,
                source_url=prov.source_url,
                confidence_tier=prov.confidence_tier,
            ),
        )
        return entry

    # ------------------------------------------------------------------
    # validation
    # ------------------------------------------------------------------
    def _validate_one(self, record: EvidenceEntry) -> tuple[bool, Optional[str]]:
        if not record.title or len(record.title) < 10:
            return False, "title too short or missing"
        if not record.conditions:
            return False, "no conditions listed"
        if not record.interventions:
            return False, "no interventions listed"
        return True, None

    # ------------------------------------------------------------------
    # helpers for downstream consumers
    # ------------------------------------------------------------------
    def search_by_condition(self, condition_query: str) -> List[EvidenceEntry]:
        """Return entries whose conditions match *condition_query* (case-insensitive)."""
        q = condition_query.lower()
        results = []
        for entry in self.transform(self.fetch()):
            if any(q in c.lower() for c in entry.conditions):
                results.append(entry)
        return results

    def search_by_intervention(self, intervention_query: str) -> List[EvidenceEntry]:
        """Return entries whose interventions match *intervention_query*."""
        q = intervention_query.lower()
        results = []
        for entry in self.transform(self.fetch()):
            if any(q in i.lower() for i in entry.interventions):
                results.append(entry)
        return results


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    adapter = OtseekerAdapter()
    summary = adapter.run()
    print(summary)
    # demo search
    print("\n--- Sample search: 'stroke' ---")
    for e in adapter.search_by_condition("stroke")[:3]:
        print(f"  {e.year} | {e.title[:60]}…")


if __name__ == "__main__":
    main()

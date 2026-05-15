"""Analyzer v2 service — demo data generators for cognitive, fNIRS, neurophysiology,
PET, and sleep analyzers.

Provides realistic clinical demo data with evidence grades and provenance labels
for all 5 analyzer types. Each generator returns 10-15 items with clinically
plausible values, ready for use as demo data fallbacks in the analyzer v2 router.

All patient identifiers are redacted to protect PHI.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional


# ── Helpers ────────────────────────────────────────────────────────────────────

def _generate_id(prefix: str) -> str:
    """Generate a consistent prefixed ID."""
    return f"{prefix}_{uuid.uuid4().hex[:6]}"


def _past_date(days_ago: int = 0) -> str:
    """Return an ISO timestamp for a date in the past."""
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return dt.isoformat()


# ═══════════════════════════════════════════════════════════════════════════════
# Cognitive assessment demo data
# ═══════════════════════════════════════════════════════════════════════════════

COGNITIVE_TEMPLATES = [
    ("MoCA", "Montreal Cognitive Assessment", "cognitive_screening", 0, 30, 26),
    ("RBANS", "Repeatable Battery for Neuropsychological Status", "cognitive_battery", 200, 600, 400),
    ("CVLT-II", "California Verbal Learning Test II", "memory", 0, 80, 50),
    ("Trail Making A", "Trail Making Test Part A", "attention", 0, 150, 30),
    ("Trail Making B", "Trail Making Test Part B", "executive", 0, 300, 75),
    ("Stroop", "Stroop Color-Word Test", "inhibition", 0, 120, 45),
    ("N-Back (2-back d')", "N-Back Working Memory", "working_memory", 0, 4.0, 2.5),
    ("Rey Complex Figure", "Rey-Osterrieth Complex Figure", "visuospatial", 0, 36, 28),
    ("WAIS-IV Digit Span", "WAIS-IV Digit Span", "working_memory", 0, 25, 16),
    ("WCST Categories", "Wisconsin Card Sorting Test", "executive", 0, 6, 4),
    ("COWAT FAS", "Controlled Oral Word Association", "verbal_fluency", 0, 80, 40),
    ("Hopkins Verbal Learning", "HVLT-R", "verbal_memory", 0, 36, 24),
]


def get_cognitive_demo_data() -> list[dict[str, Any]]:
    """Generate realistic cognitive assessment demo data.

    Returns 12 cognitive assessment records spanning screening batteries,
    memory tests, executive function, and attention measures. All scores
    are clinically plausible for a mixed clinical population.
    """
    assessments = []
    for i, (template_id, title, category, score_min, score_max, population_mean) in enumerate(COGNITIVE_TEMPLATES):
        score = round(random.uniform(max(score_min, population_mean * 0.6), min(score_max, population_mean * 1.3)), 1)
        z_score = round((score - population_mean) / (population_mean * 0.25), 2)

        percentile = max(1, min(99, int(50 + z_score * 15)))

        sub_tests = []
        if template_id == "MoCA":
            sub_tests = [
                {"subtest": "Visuospatial/Executive", "score": random.randint(2, 5), "max": 5},
                {"subtest": "Naming", "score": random.randint(2, 3), "max": 3},
                {"subtest": "Memory (learning)", "score": random.randint(3, 5), "max": 5},
                {"subtest": "Attention", "score": random.randint(4, 6), "max": 6},
                {"subtest": "Language", "score": random.randint(2, 3), "max": 3},
                {"subtest": "Abstraction", "score": random.randint(1, 2), "max": 2},
                {"subtest": "Delayed Recall", "score": random.randint(2, 5), "max": 5},
                {"subtest": "Orientation", "score": random.randint(5, 6), "max": 6},
            ]
        elif template_id == "RBANS":
            sub_tests = [
                {"subtest": "Immediate Memory", "score": random.randint(60, 120), "max": 160},
                {"subtest": "Visuospatial/Constructional", "score": random.randint(70, 110), "max": 160},
                {"subtest": "Language", "score": random.randint(75, 115), "max": 160},
                {"subtest": "Attention", "score": random.randint(65, 110), "max": 160},
                {"subtest": "Delayed Memory", "score": random.randint(60, 105), "max": 160},
            ]
        elif "Trail Making" in title:
            sub_tests = [
                {"subtest": "Completion time (seconds)", "score": round(score, 1), "max": score_max},
                {"subtest": "Errors", "score": random.randint(0, 3), "max": None},
                {"subtest": "Interference score", "score": round(random.uniform(0.5, 1.5), 2), "max": 3.0},
            ]

        normative = {
            "population": "age_matched_healthy",
            "mean": population_mean,
            "sd": round(population_mean * 0.25, 1),
            "patient_z_score": z_score,
            "patient_percentile": percentile,
            "interpretation": "below_average" if percentile < 25 else "average" if percentile < 75 else "above_average",
        }

        status = random.choice(["complete", "complete", "complete", "flagged", "pending_review"])

        assessment = {
            "id": _generate_id("cog"),
            "patient_id": f"pat_{100 + i:03d}",
            "patient_name": "[REDACTED]",
            "template_id": template_id,
            "title": title,
            "category": category,
            "score": str(score),
            "score_numeric": score,
            "score_min": score_min,
            "score_max": score_max,
            "percentile": percentile,
            "z_score": z_score,
            "sub_tests": sub_tests,
            "normative_comparison": normative,
            "administered_at": _past_date(days_ago=random.randint(1, 90)),
            "clinician_id": random.choice(["usr_001", "usr_002", "usr_003", "usr_005"]),
            "status": status,
            "notes": "Score consistent with mild cognitive impairment pattern." if percentile < 25 else "Scores within normal limits." if percentile > 50 else "Borderline performance on some subtests.",
            "evidence_grade": "B",
            "provenance": "measured",
        }
        assessments.append(assessment)

    return assessments


# ═══════════════════════════════════════════════════════════════════════════════
# fNIRS demo data
# ═══════════════════════════════════════════════════════════════════════════════

FNIRS_TASKS = [
    ("resting", "Resting State", "eyes_closed"),
    ("nback", "N-Back Task (2-back)", "working_memory"),
    ("stroop", "Stroop Task", "inhibition"),
    ("verbal_fluency", "Verbal Fluency (COWAT)", "language"),
    ("finger_tapping", "Finger Tapping (Sequential)", "motor"),
    ("tower_of_london", "Tower of London", "planning"),
]


def get_fnirs_demo_data() -> list[dict[str, Any]]:
    """Generate realistic fNIRS recording demo data.

    Returns 12 fNIRS recordings with HbO/HbR concentrations, channel-level
    data, and contrast patterns across common neuropsychological tasks.
    """
    recordings = []
    for i in range(12):
        task_type, task_label, cognitive_domain = random.choice(FNIRS_TASKS)

        n_channels = random.choice([16, 24, 32, 44])
        channels = []
        for ch in range(n_channels):
            hbo_change = round(random.uniform(-0.5, 2.5), 3) if task_type != "resting" else round(random.uniform(-0.2, 0.2), 3)
            hbr_change = round(random.uniform(-1.0, 0.5), 3) if task_type != "resting" else round(random.uniform(-0.1, 0.1), 3)
            channels.append({
                "channel_id": ch + 1,
                "source_detector": f"S{ch//4 + 1}-D{ch%4 + 1}",
                "region": random.choice(["left_dlpfc", "right_dlpfc", "left_ifg", "right_ifg", "prefrontal_cortex", "motor_cortex"]),
                "wavelength_nm": random.choice([780, 830]),
                "hbo_delta_mm": hbo_change,
                "hbr_delta_mm": hbr_change,
                "signal_quality": round(random.uniform(0.75, 0.98), 2),
            })

        contrasts = []
        if task_type != "resting":
            contrasts = [
                {"contrast": f"{task_type}_vs_baseline", "region": "left_dlpfc", "hbo_t": round(random.uniform(2.5, 5.0), 2), "p_fdr": round(random.uniform(0.001, 0.05), 3)},
                {"contrast": f"{task_type}_vs_baseline", "region": "right_dlpfc", "hbo_t": round(random.uniform(1.5, 4.0), 2), "p_fdr": round(random.uniform(0.01, 0.08), 3)},
                {"contrast": f"{task_type}_vs_baseline", "region": "left_ifg", "hbo_t": round(random.uniform(2.0, 4.5), 2), "p_fdr": round(random.uniform(0.005, 0.05), 3)},
            ]

        quality = {
            "scalp_coupling_index": round(random.uniform(0.82, 0.98), 2),
            "motion_artifacts_pct": round(random.uniform(0.5, 8.0), 1),
            "signal_to_noise_db": round(random.uniform(15, 35), 1),
            "bad_channels": random.randint(0, 3),
            "probe_placement": "10-20_system",
        }

        recording = {
            "id": _generate_id("fnirs"),
            "patient_id": f"pat_{200 + i:03d}",
            "patient_name": "[REDACTED]",
            "task_type": task_type,
            "task_label": task_label,
            "cognitive_domain": cognitive_domain,
            "recording_duration_sec": random.choice([180, 300, 420, 600]),
            "sampling_rate_hz": random.choice([7.81, 10.0, 50.0]),
            "device": random.choice(["NIRScout", "fNIRs 1100", "Artinis OxyMon", "Shimadzu LABNIRS"]),
            "channels": channels,
            "contrasts": contrasts,
            "quality_metrics": quality,
            "recorded_at": _past_date(days_ago=random.randint(1, 60)),
            "clinician_id": random.choice(["usr_001", "usr_002", "usr_003"]),
            "status": random.choice(["complete", "complete", "complete", "flagged"]),
            "notes": f"Good quality recording. {task_label} completed without issues." if quality["motion_artifacts_pct"] < 5 else f"Moderate motion artifacts during {task_label}.",
            "evidence_grade": "B",
            "provenance": "measured",
        }
        recordings.append(recording)

    return recordings


# ═══════════════════════════════════════════════════════════════════════════════
# Neurophysiology demo data (EP / EMG / NCV)
# ═══════════════════════════════════════════════════════════════════════════════

NEUROPHYS_TYPES = [
    ("ep", "Visual Evoked Potential (VEP)", "visual_pathway", [
        {"wave": "P100", "latency_ms": 105, "amplitude_uv": 10, "side": "bilateral"},
    ]),
    ("ep", "Brainstem Auditory Evoked Potential (BAEP)", "auditory_pathway", [
        {"wave": "I", "latency_ms": 1.8, "amplitude_uv": 0.3, "side": "bilateral"},
        {"wave": "III", "latency_ms": 3.8, "amplitude_uv": 0.25, "side": "bilateral"},
        {"wave": "V", "latency_ms": 5.7, "amplitude_uv": 0.5, "side": "bilateral"},
    ]),
    ("ep", "Somatosensory Evoked Potential (SSEP)", "somatosensory_pathway", [
        {"wave": "N20", "latency_ms": 19.5, "amplitude_uv": 2.5, "side": "left"},
        {"wave": "P37", "latency_ms": 37.0, "amplitude_uv": 1.8, "side": "right"},
    ]),
    ("ep", "Event-Related Potential (P300)", "cognitive_processing", [
        {"wave": "P300", "latency_ms": 320, "amplitude_uv": 12, "side": "midline"},
    ]),
    ("emg", "Needle EMG - Right APB", "motor_unit", [
        {"finding": "Increased insertional activity", "severity": "mild"},
        {"finding": "Fibrillation potentials", "severity": "rare"},
        {"finding": "Normal motor unit morphology", "severity": "none"},
    ]),
    ("emg", "Needle EMG - Left Tibialis Anterior", "motor_unit", [
        {"finding": "Normal insertional activity", "severity": "none"},
        {"finding": "Normal recruitment pattern", "severity": "none"},
    ]),
    ("ncv", "Median Nerve Motor NCV", "peripheral_motor", [
        {"parameter": "CMAP amplitude", "value": 8.5, "unit": "mV", "side": "right"},
        {"parameter": "Distal latency", "value": 3.8, "unit": "ms", "side": "right"},
        {"parameter": "Conduction velocity", "value": 55, "unit": "m/s", "side": "right"},
    ]),
    ("ncv", "Sural Nerve Sensory NCV", "peripheral_sensory", [
        {"parameter": "SNAP amplitude", "value": 12.0, "unit": "uV", "side": "left"},
        {"parameter": "Conduction velocity", "value": 48, "unit": "m/s", "side": "left"},
    ]),
    ("ep", "Motor Evoked Potential (MEP)", "corticospinal_tract", [
        {"wave": "MEP", "latency_ms": 21.5, "amplitude_mv": 1.2, "side": "right"},
    ]),
    ("emg", "Repetitive Nerve Stimulation (RNS)", "neuromuscular_junction", [
        {"parameter": "CMAP amplitude (stim 1)", "value": 8.0, "unit": "mV", "side": "right"},
        {"parameter": "CMAP amplitude (stim 5)", "value": 7.2, "unit": "mV", "side": "right"},
        {"parameter": "Decrement", "value": 10.0, "unit": "%", "side": "right"},
    ]),
    ("ncv", "F-Wave Study - Ulnar Nerve", "proximal_conduction", [
        {"parameter": "F-wave latency", "value": 28.5, "unit": "ms", "side": "left"},
        {"parameter": "F-wave persistence", "value": 95, "unit": "%", "side": "left"},
    ]),
    ("ep", "Transcranial Magnetic Stimulation MEP", "corticospinal_tract", [
        {"wave": "MEP hand", "latency_ms": 20.5, "amplitude_mv": 1.8, "side": "left"},
        {"wave": "MEP leg", "latency_ms": 32.0, "amplitude_mv": 0.8, "side": "left"},
    ]),
]


def get_neurophysiology_demo_data() -> list[dict[str, Any]]:
    """Generate realistic neurophysiology demo data.

    Returns 12 neurophysiology studies covering EP, EMG, NCV, and repetitive
    stimulation paradigms with waveform-level detail and clinical interpretation.
    """
    studies = []
    for i, (study_type, test_name, pathway, waveforms) in enumerate(NEUROPHYS_TYPES):
        processed_waveforms = []
        for wf in waveforms:
            base_latency = wf.get("latency_ms", 0)
            if base_latency > 0:
                actual_latency = round(base_latency * random.uniform(0.9, 1.15), 1)
                latency_status = "normal" if 0.9 <= actual_latency / base_latency <= 1.1 else "prolonged"
            else:
                actual_latency = None
                latency_status = "N/A"

            actual_amplitude = round(wf.get("amplitude_uv", wf.get("amplitude_mv", 0)) * random.uniform(0.7, 1.3), 2) if "amplitude" in str(wf) else None

            processed_waveforms.append({
                **wf,
                "measured_latency_ms": actual_latency,
                "measured_amplitude": actual_amplitude,
                "latency_status": latency_status,
            })

        interpretations = {
            "visual_pathway": "P100 latency within normal limits. No evidence of optic pathway demyelination.",
            "auditory_pathway": "BAEP waveforms with normal I-III-V interpeak intervals. Brainstem auditory pathway intact.",
            "somatosensory_pathway": "SSEP responses present bilaterally with normal latencies. No evidence of dorsal column dysfunction.",
            "cognitive_processing": f"P300 latency {'prolonged' if i % 3 == 0 else 'within normal limits'}. {'Suggestive of cognitive processing slowing.' if i % 3 == 0 else ''}",
            "motor_unit": "Mild chronic neurogenic changes in distal muscles. Consistent with mild radiculopathy or early neuropathy." if "Increased" in str(waveforms) else "Normal insertional and spontaneous activity.",
            "peripheral_motor": "Median nerve motor conduction within normal limits. No evidence of focal demyelination.",
            "peripheral_sensory": "Sural SNAP amplitude preserved. No evidence of length-dependent axonal loss.",
            "corticospinal_tract": "MEP responses elicited with normal latencies and central motor conduction times.",
            "neuromuscular_junction": f"{'Borderline decrement noted on RNS. Consider myasthenia gravis workup.' if i % 4 == 0 else 'No significant decrement on repetitive stimulation.'}",
            "proximal_conduction": "F-wave latencies and persistence within normal limits.",
        }

        study = {
            "id": _generate_id("nphys"),
            "patient_id": f"pat_{300 + i:03d}",
            "patient_name": "[REDACTED]",
            "study_type": study_type,
            "test_name": test_name,
            "pathway": pathway,
            "waveforms": processed_waveforms,
            "interpretation": interpretations.get(pathway, "Study completed. Results pending final review."),
            "clinical_correlation": "Correlate with MRI findings and clinical presentation.",
            "performed_at": _past_date(days_ago=random.randint(1, 45)),
            "physiologist_id": random.choice(["usr_001", "usr_002", "usr_004"]),
            "status": random.choice(["final", "final", "final", "pending_review"]),
            "evidence_grade": "B",
            "provenance": "measured",
        }
        studies.append(study)

    return studies


# ═══════════════════════════════════════════════════════════════════════════════
# PET scan demo data
# ═══════════════════════════════════════════════════════════════════════════════

PET_TRACERS = [
    ("fdg", "[18F]FDG", "glucose_metabolism"),
    ("amyloid", "[18F]Florbetapir", "amyloid_deposition"),
    ("tau", "[18F]Flortaucipir", "tau_deposition"),
    ("dopamine", "[18F]DOPA", "dopaminergic_function"),
]

PET_REGIONS = [
    "frontal_cortex", "temporal_cortex", "parietal_cortex", "occipital_cortex",
    "anterior_cingulate", "posterior_cingulate", "precuneus", "hippocampus",
    "amygdala", "insula", "striatum", "thalamus", "cerebellum", "pons",
]


def get_pet_demo_data() -> list[dict[str, Any]]:
    """Generate realistic PET scan demo data.

    Returns 12 PET scan records with regional SUVr values, composite indices,
    and tracer-specific interpretations for common clinical indications.
    """
    scans = []
    for i in range(12):
        tracer, tracer_name, biomarker = random.choice(PET_TRACERS)

        regional_suvr = {}
        for region in PET_REGIONS:
            if tracer == "fdg":
                base = random.uniform(0.7, 1.4)
            elif tracer == "amyloid":
                base = random.uniform(0.8, 2.5)
            elif tracer == "tau":
                base = random.uniform(0.9, 2.8)
            else:
                base = random.uniform(0.6, 1.8)
            regional_suvr[region] = round(base, 3)

        composite_indices = {}
        if tracer == "amyloid":
            composite_indices = {
                "centiloid": round(random.uniform(-20, 120), 1),
                "composite_suvr": round(random.uniform(0.9, 2.2), 3),
                "positive_threshold": 1.11,
                "interpretation": random.choice(["amyloid_positive", "amyloid_negative", "amyloid_negative"]),
            }
        elif tracer == "tau":
            composite_indices = {
                "meta_tau_roi_suvr": round(random.uniform(0.9, 3.0), 3),
                "braak_stage": random.choice(["0", "I_II", "III_IV", "V_VI"]),
                "positive_threshold": 1.25,
                "interpretation": random.choice(["tau_positive_braak_V_VI", "tau_positive_braak_III_IV", "tau_negative"]),
            }
        elif tracer == "fdg":
            composite_indices = {
                "global_cmr_glu": round(random.uniform(4.0, 8.5), 2),
                "posterior_cingulate_temporal_ratio": round(random.uniform(0.7, 1.2), 2),
                "pattern": random.choice(["normal", "temporo_parietal_hypometabolism", "diffuse_hypometabolism", "frontal_hypometabolism"]),
            }
        elif tracer == "dopamine":
            composite_indices = {
                "striatal_ki": round(random.uniform(0.8, 2.5), 3),
                "putamen_caudate_ratio": round(random.uniform(0.6, 1.2), 2),
                "pattern": random.choice(["normal", "posterior_putamen_reduction", "uniform_striatal_reduction"]),
            }

        clinical_indications = {
            "fdg": random.choice(["Cognitive decline evaluation", "Dementia differential", "Epilepsy focus localization"]),
            "amyloid": random.choice(["Alzheimer disease evaluation", "MCI biomarker assessment", "Dementia etiology"]),
            "tau": random.choice(["Alzheimer disease staging", "FTD differential", "Progressive supranuclear palsy"]),
            "dopamine": random.choice(["Parkinson disease evaluation", "Atypical parkinsonism", "DLB assessment"]),
        }

        scan = {
            "id": _generate_id("pet"),
            "patient_id": f"pat_{400 + i:03d}",
            "patient_name": "[REDACTED]",
            "tracer": tracer,
            "tracer_name": tracer_name,
            "biomarker": biomarker,
            "clinical_indication": clinical_indications.get(tracer, "Research scan"),
            "regional_suvr": regional_suvr,
            "composite_indices": composite_indices,
            "reference_region": "cerebellar_cortex" if tracer != "dopamine" else "occipital_cortex",
            "scanner": random.choice(["Siemens Biograph Vision", "GE Discovery MI", "Philips Vereos"]),
            "reconstruction": "OSEM + PSF + TOF",
            "injected_dose_mbq": round(random.uniform(150, 370), 1),
            "uptake_time_min": random.choice([30, 50, 60, 90]),
            "scanned_at": _past_date(days_ago=random.randint(1, 90)),
            "radiologist_id": random.choice(["usr_001", "usr_004", "usr_005"]),
            "status": random.choice(["final", "final", "final", "pending_review"]),
            "evidence_grade": "A",
            "provenance": "measured",
        }
        scans.append(scan)

    return scans


# ═══════════════════════════════════════════════════════════════════════════════
# Sleep study demo data (PSG / HST)
# ═══════════════════════════════════════════════════════════════════════════════

SLEEP_STUDY_TYPES = [
    ("psg", "In-Lab Polysomnography", "full_montage"),
    ("hstat", "Home Sleep Apnea Test", "limited_channel"),
    ("mslt", "Multiple Sleep Latency Test", "nap_protocol"),
    ("mwt", "Maintenance of Wakefulness Test", "wakefulness"),
]


def get_sleep_demo_data() -> list[dict[str, Any]]:
    """Generate realistic sleep study demo data.

    Returns 12 sleep study records with sleep staging percentages,
    respiratory event indices, cardiac events, and AHI-based severity
    classifications for in-lab and home-based studies.
    """
    studies = []
    for i in range(12):
        study_type, study_label, recording_type = random.choice(SLEEP_STUDY_TYPES)

        total_sleep_time_min = random.randint(180, 420)
        sleep_efficiency = round(random.uniform(55, 92), 1)

        n1_pct = round(random.uniform(5, 25), 1)
        n2_pct = round(random.uniform(35, 60), 1)
        n3_pct = round(random.uniform(5, 30), 1)
        rem_pct = round(random.uniform(5, 25), 1)
        wake_pct = round(100 - (n1_pct + n2_pct + n3_pct + rem_pct), 1)

        stages = {
            "wake_pct": max(0, wake_pct),
            "n1_pct": n1_pct,
            "n2_pct": n2_pct,
            "n3_pct": n3_pct,
            "rem_pct": rem_pct,
            "sleep_efficiency_pct": sleep_efficiency,
            "sleep_onset_latency_min": round(random.uniform(5, 75), 1),
            "rem_latency_min": round(random.uniform(45, 180), 1) if study_type != "mwt" else None,
            "waso_min": round(random.uniform(10, 120), 1),
            "arousal_index": round(random.uniform(5, 45), 1),
        }

        ahi = round(random.uniform(1.0, 85.0), 1)
        if ahi < 5:
            severity = "normal"
        elif ahi < 15:
            severity = "mild"
        elif ahi < 30:
            severity = "moderate"
        else:
            severity = "severe"

        respiratory = {
            "ahi": ahi,
            "ahi_supine": round(ahi * random.uniform(1.0, 1.8), 1),
            "ahi_non_supine": round(ahi * random.uniform(0.4, 1.0), 1),
            "rdi": round(ahi * random.uniform(1.1, 1.4), 1),
            "odi": round(ahi * random.uniform(0.8, 1.2), 1),
            "apnea_index": round(ahi * random.uniform(0.2, 0.6), 1),
            "hypopnea_index": round(ahi * random.uniform(0.4, 0.8), 1),
            "central_apnea_index": round(random.uniform(0, ahi * 0.3), 1),
            "obstructive_apnea_index": round(random.uniform(0, ahi * 0.5), 1),
            "mixed_apnea_index": round(random.uniform(0, ahi * 0.1), 1),
            "mean_spO2_pct": round(random.uniform(88, 97), 1),
            "min_spO2_pct": round(random.uniform(72, 92), 1),
            "spO2_dip_pct": round(random.uniform(2, 15), 1),
            "time_below_90_pct": round(random.uniform(0.1, 45.0), 1),
        }

        cardiac = {
            "mean_hr_bpm": round(random.uniform(55, 85), 1),
            "min_hr_bpm": round(random.uniform(42, 58), 1),
            "max_hr_bpm": round(random.uniform(90, 130), 1),
            "sinus_arrhythmia": random.choice([True, False]),
            "bradycardia_events": random.randint(0, 25),
            "tachycardia_events": random.randint(0, 10),
            "asystole_events": random.randint(0, 2),
        }

        leg_movements = {
            "plm_index": round(random.uniform(0, 55), 1),
            "plm_arousal_index": round(random.uniform(0, 20), 1),
            "plm_with_respiratory_events": random.randint(0, 15),
        }

        clinical_notes = {
            "normal": "Sleep architecture within normal limits. No significant sleep-disordered breathing.",
            "mild": "Mild sleep apnea noted. Consider lifestyle modifications and positional therapy.",
            "moderate": "Moderate OSA with significant respiratory events. CPAP titration recommended.",
            "severe": "Severe OSA with marked desaturation. Urgent CPAP initiation recommended.",
        }

        study = {
            "id": _generate_id("sleep"),
            "patient_id": f"pat_{500 + i:03d}",
            "patient_name": "[REDACTED]",
            "study_type": study_type,
            "study_label": study_label,
            "recording_type": recording_type,
            "total_sleep_time_min": total_sleep_time_min,
            "time_in_bed_min": round(total_sleep_time_min / (sleep_efficiency / 100), 0),
            "sleep_stages_pct": stages,
            "respiratory_events": respiratory,
            "cardiac_events": cardiac,
            "leg_movements": leg_movements,
            "severity": severity,
            "scored_at": _past_date(days_ago=random.randint(1, 30)),
            "scorer_id": random.choice(["usr_001", "usr_002", "usr_005"]),
            "status": random.choice(["final", "final", "final", "pending_review"]),
            "clinical_note": clinical_notes.get(severity, "Study completed."),
            "evidence_grade": "B",
            "provenance": "measured",
        }
        studies.append(study)

    return studies

"""
rehab_service.py — Rehab / Physiotherapy intervention service.

Provides:
- Exercise prescription library (100+ exercises with metadata)
- 10 protocol templates for common rehab conditions
- Assessment scoring: Fugl-Meyer, Berg Balance, TUG, 6MWT, 10MWT, MAS, ROM, MMT
- Session logging, progress tracking, and goal management
- Evidence-graded content with clinical safety disclaimers

All clinical data is scoped to clinic_id for multi-tenancy.
Audit logging is performed via the caller (router layer).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy.orm import Session


# ──────────────────────────────────────────────────────────────────────────────
# Constants & enums
# ──────────────────────────────────────────────────────────────────────────────

REHAB_ASSESSMENT_TYPES = [
    "fugl_meyer",
    "berg_balance",
    "timed_up_and_go",
    "six_minute_walk",
    "ten_meter_walk",
    "modified_ashworth",
    "rom_goniometry",
    "manual_muscle_test",
]

REHAB_PHASES = ["acute", "subacute", "chronic", "maintenance", "prehab"]

REHAB_GOAL_STATUSES = ["active", "achieved", "discontinued", "on_hold"]

REHAB_BODY_PARTS = [
    "shoulder", "elbow", "wrist", "hand", "hip", "knee",
    "ankle", "foot", "cervical_spine", "thoracic_spine",
    "lumbar_spine", "pelvis", "whole_body",
]

REHAB_EQUIPMENT = [
    "none", "resistance_band", "dumbbell", "theraband", "foam_roller",
    "balance_board", "stability_ball", "parallel_bars", "treadmill",
    "exercise_bike", "rowing_machine", "pulley_system", "wobble_board",
    "ankle_weights", "medicine_ball", "step_platform", "cuff_weights",
    "therapy_putty", "pegboard", "wall_bars", "tilt_table",
]

EXERCISE_CATEGORIES = [
    "strengthening", "stretching", "balance", "gait", "cardio",
    "neuromuscular", "coordination", "functional", "breathing",
    "vestibular", "pediatric",
]

DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"]

EVIDENCE_GRADES = ["A", "B", "C", "D", "E"]


# ──────────────────────────────────────────────────────────────────────────────
# Exercise Database (100+ exercises)
# ──────────────────────────────────────────────────────────────────────────────

EXERCISE_LIBRARY: list[dict[str, Any]] = [
    # ── Strengthening ──
    {"id": "ex-001", "name": "Quad Sets", "category": "strengthening", "body_parts": ["knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Isometric quadriceps contraction with knee extended. Hold 5-10s.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Add ankle weight 0.5-1kg", "contraindications": ["Acute knee inflammation", "Patellar fracture"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "quad_sets.gif"},
    {"id": "ex-002", "name": "Straight Leg Raise", "category": "strengthening", "body_parts": ["hip", "knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Supine hip flexion with knee extended. Lift leg 30-45cm, hold 3s.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Add ankle weight", "contraindications": ["Lumbar radiculopathy"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "slr.gif"},
    {"id": "ex-003", "name": "Short Arc Quads", "category": "strengthening", "body_parts": ["knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Knee extension over towel roll 0-30 degrees.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Increase range to 45 degrees", "contraindications": ["Recent knee arthroplasty without clearance"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "saq.gif"},
    {"id": "ex-004", "name": "Heel Raises", "category": "strengthening", "body_parts": ["ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "Bilateral then unilateral calf raises. Rise onto toes, hold 2s, lower slowly.", "sets_reps": "3 sets x 15 reps", "frequency": "Daily", "progression": "Single leg, then add weight", "contraindications": ["Achilles tendon rupture repair <12 weeks"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "heel_raises.gif"},
    {"id": "ex-005", "name": "Hip Abduction Sidelying", "category": "strengthening", "body_parts": ["hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Side-lying, top leg lifts 30-45 degrees with slight hip extension.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Add theraband around ankles", "contraindications": ["Total hip precautions"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "hip_abd.gif"},
    {"id": "ex-006", "name": "Hip Extension Prone", "category": "strengthening", "body_parts": ["hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Prone lying, lift one leg keeping knee straight. Hold 3s.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Add ankle weight", "contraindications": ["Spinal stenosis extension bias"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "hip_ext_prone.gif"},
    {"id": "ex-007", "name": "Bridging", "category": "strengthening", "body_parts": ["hip", "lumbar_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Supine with knees flexed, lift pelvis to neutral. Hold 5s.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Single leg bridge, then add march", "contraindications": ["Acute lumbar disc herniation"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "bridging.gif"},
    {"id": "ex-008", "name": "Wall Squats", "category": "strengthening", "body_parts": ["knee", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Back against wall, slide down to 45-90 degrees. Hold 10-30s.", "sets_reps": "3 sets x 5 holds", "frequency": "Daily", "progression": "Deeper angle, longer hold, single leg", "contraindications": ["Patellofemoral pain syndrome (shallow angle only)"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "wall_squat.gif"},
    {"id": "ex-009", "name": "Mini Squats", "category": "strengthening", "body_parts": ["knee", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Partial squat 0-45 degrees. Controlled eccentric.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Full squat, then add resistance", "contraindications": ["ACL reconstruction <6 weeks"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "mini_squat.gif"},
    {"id": "ex-010", "name": "Step-Ups", "category": "strengthening", "body_parts": ["knee", "hip"], "equipment": ["step_platform"], "difficulty": "intermediate", "description": "Step up 10-20cm platform, controlled step down. Lead with affected leg.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Increase height, add dumbbells", "contraindications": ["Poor balance"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "step_up.gif"},
    {"id": "ex-011", "name": "Lunges", "category": "strengthening", "body_parts": ["knee", "hip"], "equipment": ["none"], "difficulty": "intermediate", "description": "Forward or reverse lunge. Knee tracks over 2nd toe.", "sets_reps": "3 sets x 10 reps each leg", "frequency": "Daily", "progression": "Walking lunges, add weight", "contraindications": ["Meniscus repair <12 weeks"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "lunge.gif"},
    {"id": "ex-012", "name": "Single Leg Romanian Deadlift", "category": "strengthening", "body_parts": ["hip", "knee", "ankle"], "equipment": ["dumbbell"], "difficulty": "advanced", "description": "Hip hinge on single leg with light dumbbell. Maintain neutral spine.", "sets_reps": "3 sets x 8 reps", "frequency": "3x/week", "progression": "Increase weight", "contraindications": ["Poor balance", "Hamstring strain"], "evidence_grade": "B", "duration_min": 8, "image_placeholder": "slrdl.gif"},
    {"id": "ex-013", "name": "Shoulder External Rotation", "category": "strengthening", "body_parts": ["shoulder"], "equipment": ["resistance_band"], "difficulty": "beginner", "description": "Elbow at side 90 degrees, rotate forearm outward against band.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Increase band resistance", "contraindications": ["Rotator cuff repair <6 weeks"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sh_er.gif"},
    {"id": "ex-014", "name": "Shoulder Flexion", "category": "strengthening", "body_parts": ["shoulder"], "equipment": ["dumbbell"], "difficulty": "beginner", "description": "Lift arm forward and upward to 90-180 degrees.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Increase weight", "contraindications": ["Subacromial impingement acute phase"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sh_flex.gif"},
    {"id": "ex-015", "name": "Shoulder Abduction", "category": "strengthening", "body_parts": ["shoulder"], "equipment": ["dumbbell"], "difficulty": "beginner", "description": "Lift arm sideways to 90 degrees, thumb up.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Increase weight", "contraindications": ["Superior labrum tear"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sh_abd.gif"},
    {"id": "ex-016", "name": "Scapular Retraction", "category": "strengthening", "body_parts": ["shoulder", "thoracic_spine"], "equipment": ["resistance_band"], "difficulty": "beginner", "description": "Squeeze shoulder blades together. Hold 3s.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Increase band resistance", "contraindications": ["Thoracic outlet syndrome"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "scap_ret.gif"},
    {"id": "ex-017", "name": "Rows", "category": "strengthening", "body_parts": ["shoulder", "elbow"], "equipment": ["resistance_band"], "difficulty": "intermediate", "description": "Pull band toward torso, squeeze scapulae. Elbow stays close to body.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Increase resistance", "contraindications": ["Biceps tendonitis"], "evidence_grade": "A", "duration_min": 6, "image_placeholder": "rows.gif"},
    {"id": "ex-018", "name": "Push-Ups (Modified)", "category": "strengthening", "body_parts": ["shoulder", "elbow"], "equipment": ["none"], "difficulty": "intermediate", "description": "Wall or knee push-ups. Full range of motion.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Standard push-ups, then decline", "contraindications": ["AC joint injury"], "evidence_grade": "A", "duration_min": 6, "image_placeholder": "pushup_mod.gif"},
    {"id": "ex-019", "name": "Bicep Curls", "category": "strengthening", "body_parts": ["elbow"], "equipment": ["dumbbell"], "difficulty": "beginner", "description": "Elbow flexion with dumbbell. Controlled eccentric 3s.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Increase weight", "contraindications": ["Distal biceps repair <12 weeks"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "bicep_curl.gif"},
    {"id": "ex-020", "name": "Tricep Extensions", "category": "strengthening", "body_parts": ["elbow"], "equipment": ["dumbbell"], "difficulty": "beginner", "description": "Overhead or supine elbow extension. Control lowering.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Increase weight", "contraindications": ["Ulnar nerve entrapment"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "tricep_ext.gif"},
    {"id": "ex-021", "name": "Wrist Flexion/Extension", "category": "strengthening", "body_parts": ["wrist"], "equipment": ["dumbbell"], "difficulty": "beginner", "description": "Forearm supported, wrist flexion and extension with light weight.", "sets_reps": "3 sets x 15 reps each direction", "frequency": "Daily", "progression": "Increase weight", "contraindications": ["Carpal tunnel syndrome (avoid excessive flexion)"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "wrist_flex_ext.gif"},
    {"id": "ex-022", "name": "Grip Squeeze", "category": "strengthening", "body_parts": ["hand"], "equipment": ["therapy_putty"], "difficulty": "beginner", "description": "Squeeze therapy putty or ball. Hold 5s.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Firmer putty", "contraindications": ["Recent hand fracture"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "grip_squeeze.gif"},
    {"id": "ex-023", "name": "Prone Y-T-W", "category": "strengthening", "body_parts": ["shoulder", "thoracic_spine"], "equipment": ["none"], "difficulty": "intermediate", "description": "Prone, lift arms in Y, T, and W positions. Activate lower trapezius.", "sets_reps": "2 sets x 8 each position", "frequency": "Daily", "progression": "Add light dumbbells", "contraindications": ["Rotator cuff tear"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "prone_ytw.gif"},
    {"id": "ex-024", "name": "Clamshells", "category": "strengthening", "body_parts": ["hip"], "equipment": ["resistance_band"], "difficulty": "beginner", "description": "Side-lying, knees flexed 90 degrees, open top knee. Keep feet together.", "sets_reps": "3 sets x 15 reps", "frequency": "Daily", "progression": "Add band above knees", "contraindications": ["Total hip precautions"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "clamshell.gif"},
    {"id": "ex-025", "name": "Terminal Knee Extension", "category": "strengthening", "body_parts": ["knee"], "equipment": ["resistance_band"], "difficulty": "beginner", "description": "Band around knee and anchor, pull knee into full extension.", "sets_reps": "3 sets x 15 reps", "frequency": "Daily", "progression": "Stronger band", "contraindications": ["Knee hyperextension >5 degrees"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "tke.gif"},
    {"id": "ex-026", "name": "Hip Flexion Standing", "category": "strengthening", "body_parts": ["hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Standing, march in place bringing knee toward chest.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Add ankle weight", "contraindications": ["Poor standing balance"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "hip_flex_stand.gif"},
    {"id": "ex-027", "name": "Hamstring Curls", "category": "strengthening", "body_parts": ["knee"], "equipment": ["ankle_weights"], "difficulty": "beginner", "description": "Prone or standing, flex knee bringing heel toward buttock.", "sets_reps": "3 sets x 12 reps", "frequency": "Daily", "progression": "Add ankle weight", "contraindications": ["Hamstring strain <6 weeks"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "ham_curl.gif"},
    {"id": "ex-028", "name": "Calf Raises on Step", "category": "strengthening", "body_parts": ["ankle"], "equipment": ["step_platform"], "difficulty": "intermediate", "description": "Heels off edge of step, rise onto toes, lower below step level.", "sets_reps": "3 sets x 15 reps", "frequency": "Daily", "progression": "Single leg", "contraindications": ["Achilles tendinopathy"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "calf_raise_step.gif"},
    {"id": "ex-029", "name": "Dead Bug", "category": "strengthening", "body_parts": ["lumbar_spine"], "equipment": ["none"], "difficulty": "intermediate", "description": "Supine, opposite arm and leg extension while maintaining neutral spine.", "sets_reps": "3 sets x 8 each side", "frequency": "Daily", "progression": "Add resistance band", "contraindications": ["Spondylolisthesis"], "evidence_grade": "A", "duration_min": 6, "image_placeholder": "dead_bug.gif"},
    {"id": "ex-030", "name": "Bird Dog", "category": "strengthening", "body_parts": ["lumbar_spine", "hip", "shoulder"], "equipment": ["none"], "difficulty": "intermediate", "description": "Quadruped, extend opposite arm and leg. Hold 5s.", "sets_reps": "3 sets x 8 each side", "frequency": "Daily", "progression": "Add light cuff weights", "contraindications": ["Acute spondylolysis"], "evidence_grade": "A", "duration_min": 6, "image_placeholder": "bird_dog.gif"},
    # ── Stretching ──
    {"id": "ex-031", "name": "Hamstring Stretch Supine", "category": "stretching", "body_parts": ["knee", "hip"], "equipment": ["resistance_band"], "difficulty": "beginner", "description": "Supine, band around foot, straighten knee. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Increase range", "contraindications": ["Sciatica with stretch provocation"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "hamstring_stretch.gif"},
    {"id": "ex-032", "name": "Quadriceps Stretch Prone", "category": "stretching", "body_parts": ["knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Prone, bend knee, grasp ankle, pull toward buttock. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Increase flexion range", "contraindications": ["Recent ACL reconstruction <12 weeks"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "quad_stretch.gif"},
    {"id": "ex-033", "name": "Calf Stretch Standing", "category": "stretching", "body_parts": ["ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "Hands on wall, affected leg back, heel down. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Lower stance angle", "contraindications": ["Achilles rupture repair"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "calf_stretch.gif"},
    {"id": "ex-034", "name": "Hip Flexor Stretch Half-Kneel", "category": "stretching", "body_parts": ["hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Half-kneeling, shift weight forward. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Add posterior pelvic tilt", "contraindications": ["Total hip replacement anterior approach <6 weeks"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "hip_flex_stretch.gif"},
    {"id": "ex-035", "name": "Piriformis Stretch Supine", "category": "stretching", "body_parts": ["hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Supine figure-4 stretch. Ankle over opposite knee, pull thigh toward chest.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Deeper stretch position", "contraindications": ["Hip osteoarthritis"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "piriformis_stretch.gif"},
    {"id": "ex-036", "name": "Shoulder Cross-Body Stretch", "category": "stretching", "body_parts": ["shoulder"], "equipment": ["none"], "difficulty": "beginner", "description": "Bring arm across chest, apply gentle pressure. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Increase ROM", "contraindications": ["AC joint injury"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sh_cross_stretch.gif"},
    {"id": "ex-037", "name": "Doorway Pectoral Stretch", "category": "stretching", "body_parts": ["shoulder"], "equipment": ["none"], "difficulty": "beginner", "description": "Forearm on doorframe, step through. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Increase stretch angle", "contraindications": ["Anterior shoulder instability"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "pec_stretch.gif"},
    {"id": "ex-038", "name": "Triceps Overhead Stretch", "category": "stretching", "body_parts": ["elbow", "shoulder"], "equipment": ["none"], "difficulty": "beginner", "description": "Reach arm overhead, bend elbow, gently push with other hand.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Increase elbow flexion", "contraindications": ["Posterior impingement"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "tricep_stretch.gif"},
    {"id": "ex-039", "name": "Wrist Flexor Stretch", "category": "stretching", "body_parts": ["wrist"], "equipment": ["none"], "difficulty": "beginner", "description": "Extend elbow, palm up, gently extend wrist with other hand. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Increase wrist extension", "contraindications": ["Lateral elbow tendinopathy during stretch"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "wrist_flex_stretch.gif"},
    {"id": "ex-040", "name": "Neck Rotation Stretch", "category": "stretching", "body_parts": ["cervical_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Gentle rotation to each side. Hold 20s.", "sets_reps": "3 x 20s hold each side", "frequency": "Daily", "progression": "Increase range", "contraindications": ["Vertebral artery insufficiency", "Acute cervical radiculopathy"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "neck_rot_stretch.gif"},
    {"id": "ex-041", "name": "Upper Trapezius Stretch", "category": "stretching", "body_parts": ["cervical_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Side-bend head, gently apply overpressure. Hold 30s.", "sets_reps": "3 x 30s each side", "frequency": "Daily", "progression": "Increase side-bend range", "contraindications": ["Acute cervical disc"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "trap_stretch.gif"},
    {"id": "ex-042", "name": "Levator Scapulae Stretch", "category": "stretching", "body_parts": ["cervical_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Rotate head 45 degrees, look down, gently depress scapula. Hold 30s.", "sets_reps": "3 x 30s each side", "frequency": "Daily", "progression": "Increase stretch", "contraindications": ["Cervical radiculopathy"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "levator_stretch.gif"},
    {"id": "ex-043", "name": "Cat-Cow", "category": "stretching", "body_parts": ["lumbar_spine", "thoracic_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Quadruped, alternate spinal flexion and extension. 10 repetitions.", "sets_reps": "2 sets x 10 reps", "frequency": "Daily", "progression": "Add breathing coordination", "contraindications": ["Acute lumbar disc herniation"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "cat_cow.gif"},
    {"id": "ex-044", "name": "Child's Pose", "category": "stretching", "body_parts": ["lumbar_spine", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Kneel, sit back on heels, extend arms forward. Hold 30s.", "sets_reps": "3 x 30s hold", "frequency": "Daily", "progression": "Walk hands to one side", "contraindications": ["Knee joint replacement <8 weeks"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "child_pose.gif"},
    {"id": "ex-045", "name": "Knee-to-Chest", "category": "stretching", "body_parts": ["lumbar_spine", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Supine, bring one knee then both toward chest. Hold 20s.", "sets_reps": "3 x 20s hold", "frequency": "Daily", "progression": "Rock gently side to side", "contraindications": ["Acute lumbar disc herniation"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "knee_chest.gif"},
    {"id": "ex-046", "name": "Spinal Rotation Supine", "category": "stretching", "body_parts": ["lumbar_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Supine, drop both knees to one side while rotating head opposite. Hold 20s.", "sets_reps": "3 x 20s each side", "frequency": "Daily", "progression": "Increase range", "contraindications": ["Spinal fusion"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "spinal_rot.gif"},
    {"id": "ex-047", "name": "Gastrocnemius/Soleus Wall Stretch", "category": "stretching", "body_parts": ["ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "Wall stretch with knee straight (gastroc) and bent (soleus). Hold 30s each.", "sets_reps": "3 x 30s each position", "frequency": "Daily", "progression": "Increase distance from wall", "contraindications": ["Achilles repair"], "evidence_grade": "A", "duration_min": 6, "image_placeholder": "gastroc_soleus.gif"},
    {"id": "ex-048", "name": "IT Band Stretch Standing", "category": "stretching", "body_parts": ["hip", "knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Cross one leg behind, side-bend toward front leg. Hold 30s.", "sets_reps": "3 x 30s each side", "frequency": "Daily", "progression": "Increase side-bend", "contraindications": ["Lateral meniscus pathology"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "itb_stretch.gif"},
    # ── Balance ──
    {"id": "ex-049", "name": "Single Leg Stand", "category": "balance", "body_parts": ["ankle", "hip", "knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Stand on one leg near support. Hold 10-30s. Eyes open then closed.", "sets_reps": "3 x 30s each leg", "frequency": "Daily", "progression": "Eyes closed, foam pad, head turns", "contraindications": ["Fall risk without support"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sls.gif"},
    {"id": "ex-050", "name": "Tandem Stance", "category": "balance", "body_parts": ["ankle", "hip", "knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Heel-to-toe standing. Hold 30s.", "sets_reps": "3 x 30s", "frequency": "Daily", "progression": "Eyes closed, on foam", "contraindications": ["Severe balance deficit"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "tandem_stance.gif"},
    {"id": "ex-051", "name": "Tandem Walk", "category": "balance", "body_parts": ["ankle", "hip", "knee"], "equipment": ["none"], "difficulty": "intermediate", "description": "Heel-to-toe walking 10m. Turn and repeat.", "sets_reps": "3 x 10m", "frequency": "Daily", "progression": "Eyes closed, backward", "contraindications": ["High fall risk"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "tandem_walk.gif"},
    {"id": "ex-052", "name": "Semi-Tandem Stance", "category": "balance", "body_parts": ["ankle", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Heel of one foot beside big toe of other. Hold 30s.", "sets_reps": "3 x 30s each foot forward", "frequency": "Daily", "progression": "Full tandem", "contraindications": ["Severe balance deficit"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "semi_tandem.gif"},
    {"id": "ex-053", "name": "Weight Shift Side-to-Side", "category": "balance", "body_parts": ["ankle", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Shift weight from one foot to other. Controlled, near support.", "sets_reps": "3 x 20 reps", "frequency": "Daily", "progression": "Increase amplitude, reduce support", "contraindications": ["Poor standing balance"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "weight_shift.gif"},
    {"id": "ex-054", "name": "Balance Board Training", "category": "balance", "body_parts": ["ankle", "knee", "hip"], "equipment": ["balance_board"], "difficulty": "intermediate", "description": "Maintain balance on wobble board. Hold 30s.", "sets_reps": "3 x 30s", "frequency": "Daily", "progression": "Single leg, eyes closed", "contraindications": ["Severe balance deficit", "Recent ankle fracture"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "balance_board.gif"},
    {"id": "ex-055", "name": "Stepping in Place", "category": "balance", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "High marching on spot. Controlled, near support if needed.", "sets_reps": "3 x 30s", "frequency": "Daily", "progression": "Eyes closed, on foam", "contraindications": ["Severe balance deficit"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "step_place.gif"},
    {"id": "ex-056", "name": "Reach and Grab", "category": "balance", "body_parts": ["hip", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Reach for objects at varying heights and directions while standing.", "sets_reps": "3 x 10 reps each direction", "frequency": "Daily", "progression": "Single leg reach", "contraindications": ["High fall risk"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "reach_grab.gif"},
    {"id": "ex-057", "name": "4-Square Step Test", "category": "balance", "body_parts": ["ankle", "hip", "knee"], "equipment": ["none"], "difficulty": "intermediate", "description": "Step over low obstacles in sequence. Timed.", "sets_reps": "3 trials", "frequency": "2x/week", "progression": "Increase speed, higher obstacles", "contraindications": ["Recent lower limb fracture"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "4square.gif"},
    {"id": "ex-058", "name": "Sit-to-Stand", "category": "balance", "body_parts": ["knee", "hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Rise from chair without using arms. Controlled descent.", "sets_reps": "3 sets x 10 reps", "frequency": "Daily", "progression": "Lower chair, single leg", "contraindications": ["Recent knee surgery"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sit_stand.gif"},
    {"id": "ex-059", "name": "Reactive Balance Training", "category": "balance", "body_parts": ["ankle", "hip", "knee"], "equipment": ["none"], "difficulty": "advanced", "description": "Lean and release from support, recover balance. Perturbation-based.", "sets_reps": "3 x 10 releases", "frequency": "Daily", "progression": "Unexpected release, multidirectional", "contraindications": ["Severe osteoporosis", "High fall risk without harness"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "reactive_balance.gif"},
    {"id": "ex-060", "name": "Clock Reach", "category": "balance", "body_parts": ["hip", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Single leg stance, reach foot to clock positions 12, 3, 6, 9.", "sets_reps": "2 sets x 4 reaches each leg", "frequency": "Daily", "progression": "Further reach, eyes closed", "contraindications": ["Poor single leg balance"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "clock_reach.gif"},
    # ── Gait ──
    {"id": "ex-061", "name": "Treadmill Walking", "category": "gait", "body_parts": ["hip", "knee", "ankle"], "equipment": ["treadmill"], "difficulty": "beginner", "description": "Belt walking with handrails as needed. Progress speed and time.", "sets_reps": "10-20 minutes", "frequency": "Daily", "progression": "Increase speed, reduce support, add incline", "contraindications": ["Unstable cardiac status"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "treadmill_walk.gif"},
    {"id": "ex-062", "name": "Overground Walking", "category": "gait", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "Community or corridor walking. Vary surfaces and distances.", "sets_reps": "10-30 minutes", "frequency": "Daily", "progression": "Uneven terrain, hills, carrying items", "contraindications": ["Unstable weight-bearing status"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "overground_walk.gif"},
    {"id": "ex-063", "name": "Backward Walking", "category": "gait", "body_parts": ["knee", "hip"], "equipment": ["none"], "difficulty": "intermediate", "description": "Walk backward in safe corridor or on treadmill. Short steps.", "sets_reps": "5-10 minutes", "frequency": "Daily", "progression": "Increase speed, add resistance", "contraindications": ["Poor proprioception"], "evidence_grade": "B", "duration_min": 8, "image_placeholder": "backward_walk.gif"},
    {"id": "ex-064", "name": "Side-Stepping", "category": "gait", "body_parts": ["hip", "knee"], "equipment": ["none"], "difficulty": "beginner", "description": "Lateral stepping with slight hip and knee flexion.", "sets_reps": "3 x 10m each direction", "frequency": "Daily", "progression": "Add resistance band", "contraindications": ["Poor lateral stability"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "sidestep.gif"},
    {"id": "ex-065", "name": "Crossover Walking", "category": "gait", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Step across midline in alternating pattern.", "sets_reps": "3 x 10m", "frequency": "Daily", "progression": "Faster speed, eyes closed", "contraindications": ["Severe balance deficit"], "evidence_grade": "B", "duration_min": 8, "image_placeholder": "crossover_walk.gif"},
    {"id": "ex-066", "name": "Walk with Head Turns", "category": "gait", "body_parts": ["cervical_spine", "whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Walk while turning head side to side and up/down.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Faster turns, multitask", "contraindications": ["Vestibular disorder (start slowly)"], "evidence_grade": "A", "duration_min": 10, "image_placeholder": "walk_headturns.gif"},
    {"id": "ex-067", "name": "Obstacle Course Walking", "category": "gait", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "advanced", "description": "Navigate cones, thresholds, and varied surfaces.", "sets_reps": "3 trials", "frequency": "3x/week", "progression": "Add cognitive dual-task", "contraindications": ["High fall risk"], "evidence_grade": "A", "duration_min": 12, "image_placeholder": "obstacle_walk.gif"},
    {"id": "ex-068", "name": "Stair Climbing", "category": "gait", "body_parts": ["knee", "hip", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Step up and down, leading with affected leg ascending, unaffected descending.", "sets_reps": "3 sets x 10 steps", "frequency": "Daily", "progression": "Increase speed, no handrail", "contraindications": ["Poor knee control", "Severe balance deficit"], "evidence_grade": "A", "duration_min": 10, "image_placeholder": "stair_climb.gif"},
    {"id": "ex-069", "name": "Parallel Bars Walking", "category": "gait", "body_parts": ["hip", "knee", "ankle"], "equipment": ["parallel_bars"], "difficulty": "beginner", "description": "Supported gait re-education in parallel bars.", "sets_reps": "10-15 minutes", "frequency": "Daily", "progression": "Reduce upper limb support", "contraindications": ["Upper limb non-weight bearing"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "parallel_bars.gif"},
    {"id": "ex-070", "name": "Hemiplegic Gait Training", "category": "gait", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Weight shift, heel strike, toe-off emphasis. Mirror feedback.", "sets_reps": "15-20 minutes", "frequency": "Daily", "progression": "Remove assistive device", "contraindications": ["Non-weight bearing status"], "evidence_grade": "A", "duration_min": 20, "image_placeholder": "hemi_gait.gif"},
    # ── Cardio ──
    {"id": "ex-071", "name": "Stationary Cycling", "category": "cardio", "body_parts": ["knee", "hip"], "equipment": ["exercise_bike"], "difficulty": "beginner", "description": "Upright or recumbent cycling. Low resistance, comfortable cadence.", "sets_reps": "10-20 minutes", "frequency": "Daily", "progression": "Increase resistance and duration", "contraindications": ["Recent ACL reconstruction <6 weeks (avoid >90 deg flexion)"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "stationary_cycle.gif"},
    {"id": "ex-072", "name": "Rowing Machine", "category": "cardio", "body_parts": ["whole_body"], "equipment": ["rowing_machine"], "difficulty": "intermediate", "description": "Low resistance rowing. Full stroke with proper form.", "sets_reps": "10-15 minutes", "frequency": "3x/week", "progression": "Increase resistance and duration", "contraindications": ["Lumbar disc herniation"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "rowing.gif"},
    {"id": "ex-073", "name": "Arm Ergometer", "category": "cardio", "body_parts": ["shoulder", "elbow"], "equipment": ["none"], "difficulty": "beginner", "description": "Seated arm cycling for upper body cardio.", "sets_reps": "10-15 minutes", "frequency": "Daily", "progression": "Increase resistance", "contraindications": ["Shoulder instability"], "evidence_grade": "B", "duration_min": 15, "image_placeholder": "arm_erg.gif"},
    {"id": "ex-074", "name": "Aquatic Walking", "category": "cardio", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "Chest-deep water walking. Reduced joint loading.", "sets_reps": "15-20 minutes", "frequency": "Daily", "progression": "Increase speed, arm swing, water depth", "contraindications": ["Open wounds", "Incontinence"], "evidence_grade": "A", "duration_min": 20, "image_placeholder": "aquatic_walk.gif"},
    {"id": "ex-075", "name": "Interval Walking", "category": "cardio", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Alternate fast and slow walking periods.", "sets_reps": "20 minutes (1:1 ratio)", "frequency": "3x/week", "progression": "Increase fast intervals, decrease rest", "contraindications": ["Unstable angina"], "evidence_grade": "A", "duration_min": 20, "image_placeholder": "interval_walk.gif"},
    {"id": "ex-076", "name": "Elliptical Trainer", "category": "cardio", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Low-impact elliptical motion. Arm and leg coordination.", "sets_reps": "15-20 minutes", "frequency": "3x/week", "progression": "Increase resistance and incline", "contraindications": ["Severe balance deficit"], "evidence_grade": "A", "duration_min": 20, "image_placeholder": "elliptical.gif"},
    # ── Neuromuscular ──
    {"id": "ex-077", "name": "Proprioceptive Neuromuscular Facilitation (PNF) D2 Flexion", "category": "neuromuscular", "body_parts": ["shoulder"], "equipment": ["none"], "difficulty": "intermediate", "description": "Diagonal pattern: shoulder extension-adduction-internal rotation to flexion-abduction-external rotation.", "sets_reps": "2 sets x 10 reps", "frequency": "Daily", "progression": "Add resistance", "contraindications": ["Acute shoulder pain"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "pnf_d2.gif"},
    {"id": "ex-078", "name": "PNF Lower Extremity D1 Flexion", "category": "neuromuscular", "body_parts": ["hip", "knee"], "equipment": ["none"], "difficulty": "intermediate", "description": "Diagonal pattern: hip extension-abduction-internal rotation to flexion-adduction-external rotation.", "sets_reps": "2 sets x 10 reps", "frequency": "Daily", "progression": "Add resistance", "contraindications": ["Acute hip pain"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "pnf_le_d1.gif"},
    {"id": "ex-079", "name": "Rhythmic Stabilization", "category": "neuromuscular", "body_parts": ["shoulder"], "equipment": ["none"], "difficulty": "intermediate", "description": "Isometric holds against alternating resistance in multiple directions.", "sets_reps": "2 sets x 8 directions", "frequency": "Daily", "progression": "Increase resistance amplitude", "contraindications": ["Acute subluxation"], "evidence_grade": "B", "duration_min": 8, "image_placeholder": "rhythmic_stab.gif"},
    {"id": "ex-080", "name": "Agonist Reversal", "category": "neuromuscular", "body_parts": ["elbow"], "equipment": ["none"], "difficulty": "intermediate", "description": "Concentric flexion followed by eccentric extension. No rest between.", "sets_reps": "2 sets x 10 reps", "frequency": "Daily", "progression": "Add resistance", "contraindications": ["Muscle strain"], "evidence_grade": "B", "duration_min": 6, "image_placeholder": "agonist_rev.gif"},
    {"id": "ex-081", "name": "Weight Bearing Through Affected Arm", "category": "neuromuscular", "body_parts": ["shoulder", "elbow", "wrist"], "equipment": ["none"], "difficulty": "beginner", "description": "Quadruped or sitting, shift weight onto affected upper limb.", "sets_reps": "3 x 30s holds", "frequency": "Daily", "progression": "Increase duration, decrease support", "contraindications": ["Subluxation", "Complex regional pain syndrome"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "wb_arm.gif"},
    {"id": "ex-082", "name": "Mirror Therapy", "category": "neuromuscular", "body_parts": ["hand", "wrist"], "equipment": ["none"], "difficulty": "beginner", "description": "Mirror box: observe unaffected hand reflection while attempting movement with affected hand.", "sets_reps": "15 minutes", "frequency": "Daily", "progression": "Complex grasp and release tasks", "contraindications": ["Severe visual impairment"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "mirror_therapy.gif"},
    {"id": "ex-083", "name": "Constraint-Induced Movement Therapy (CIMT)", "category": "neuromuscular", "body_parts": ["hand", "wrist", "elbow"], "equipment": ["none"], "difficulty": "advanced", "description": "Restrain unaffected limb, intensive task practice with affected limb. 6 hours/day.", "sets_reps": "6 hours shaping practice", "frequency": "2 weeks intensive", "progression": "Home maintenance program", "contraindications": ["Severe spasticity", "Cognitive impairment", "Shoulder pain"], "evidence_grade": "A", "duration_min": 360, "image_placeholder": "cimt.gif"},
    {"id": "ex-084", "name": "Task-Oriented Training (Upper)", "category": "neuromuscular", "body_parts": ["shoulder", "elbow", "wrist", "hand"], "equipment": ["none"], "difficulty": "intermediate", "description": "Repetitive practice of functional tasks: reaching, grasping, manipulation.", "sets_reps": "100-300 reps/task", "frequency": "Daily", "progression": "Increase complexity, reduce support", "contraindications": ["Severe neglect"], "evidence_grade": "A", "duration_min": 30, "image_placeholder": "task_upper.gif"},
    {"id": "ex-085", "name": "Task-Oriented Training (Lower)", "category": "neuromuscular", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "intermediate", "description": "Repetitive practice of sit-to-stand, stepping, turning.", "sets_reps": "50-100 reps/task", "frequency": "Daily", "progression": "Vary context, dual-task", "contraindications": ["Unstable weight-bearing status"], "evidence_grade": "A", "duration_min": 30, "image_placeholder": "task_lower.gif"},
    {"id": "ex-086", "name": "Virtual Reality Balance Training", "category": "neuromuscular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "VR-based balance and coordination games.", "sets_reps": "20 minutes", "frequency": "3x/week", "progression": "Increase game difficulty", "contraindications": ["Motion sickness"], "evidence_grade": "B", "duration_min": 20, "image_placeholder": "vr_balance.gif"},
    {"id": "ex-087", "name": "Electrical Stimulation + Active Movement", "category": "neuromuscular", "body_parts": ["shoulder", "elbow", "wrist"], "equipment": ["none"], "difficulty": "intermediate", "description": "NMES combined with voluntary movement attempt.", "sets_reps": "30 min session", "frequency": "Daily", "progression": "Decrease stimulation as strength improves", "contraindications": ["Pacemaker", "Seizure disorder", "Open skin"], "evidence_grade": "A", "duration_min": 30, "image_placeholder": "nmes_active.gif"},
    {"id": "ex-088", "name": "Bobath / NDT Handling", "category": "neuromuscular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Inhibitory and facilitatory handling techniques for tone management and movement preparation.", "sets_reps": "30 min session", "frequency": "Daily", "progression": "Functional integration", "contraindications": ["None specific"], "evidence_grade": "B", "duration_min": 30, "image_placeholder": "bobath.gif"},
    {"id": "ex-089", "name": "Proprioceptive Training Ankle", "category": "neuromuscular", "body_parts": ["ankle"], "equipment": ["wobble_board"], "difficulty": "intermediate", "description": "Single leg balance on unstable surface with perturbations.", "sets_reps": "3 x 30s each leg", "frequency": "Daily", "progression": "Eyes closed, foam, ball toss", "contraindications": ["Recent ankle fracture <8 weeks"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "proprio_ankle.gif"},
    {"id": "ex-090", "name": "Dual-Task Training", "category": "neuromuscular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "advanced", "description": "Combine motor task with cognitive task (counting, naming, decision-making).", "sets_reps": "15 minutes", "frequency": "Daily", "progression": "Increase cognitive load", "contraindications": ["Severe cognitive impairment"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "dual_task.gif"},
    # ── Coordination ──
    {"id": "ex-091", "name": "Finger-to-Nose", "category": "coordination", "body_parts": ["elbow", "shoulder"], "equipment": ["none"], "difficulty": "beginner", "description": "Alternate touching nose and examiner's finger at varying positions.", "sets_reps": "3 x 10 reps", "frequency": "Daily", "progression": "Increase speed, vary target position", "contraindications": ["Severe ataxia"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "finger_nose.gif"},
    {"id": "ex-092", "name": "Heel-to-Shin", "category": "coordination", "body_parts": ["hip", "knee", "ankle"], "equipment": ["none"], "difficulty": "beginner", "description": "Slide heel along shin from knee to ankle.", "sets_reps": "3 x 10 reps", "frequency": "Daily", "progression": "Eyes closed", "contraindications": ["Severe spasticity"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "heel_shin.gif"},
    {"id": "ex-093", "name": "Pegboard Activities", "category": "coordination", "body_parts": ["hand", "wrist"], "equipment": ["pegboard"], "difficulty": "beginner", "description": "Place and remove pegs from pegboard. Timed.", "sets_reps": "3 minutes", "frequency": "Daily", "progression": "Smaller pegs, timed challenges", "contraindications": ["Severe fine motor deficit"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "pegboard.gif"},
    {"id": "ex-094", "name": "Cup Stacking", "category": "coordination", "body_parts": ["hand", "wrist", "elbow"], "equipment": ["none"], "difficulty": "beginner", "description": "Stack and unstack plastic cups in specific patterns.", "sets_reps": "3 minutes", "frequency": "Daily", "progression": "Complex patterns, speed", "contraindications": ["None"], "evidence_grade": "C", "duration_min": 5, "image_placeholder": "cup_stack.gif"},
    {"id": "ex-095", "name": "Beading/Stringing", "category": "coordination", "body_parts": ["hand"], "equipment": ["none"], "difficulty": "intermediate", "description": "Thread beads onto string. Fine motor and bilateral coordination.", "sets_reps": "5 minutes", "frequency": "Daily", "progression": "Smaller beads", "contraindications": ["Severe tremor"], "evidence_grade": "C", "duration_min": 5, "image_placeholder": "beading.gif"},
    {"id": "ex-096", "name": "Balloon Volleyball", "category": "coordination", "body_parts": ["shoulder", "elbow", "hand"], "equipment": ["none"], "difficulty": "intermediate", "description": "Keep balloon in air using hands. Eye-hand coordination.", "sets_reps": "5 minutes", "frequency": "Daily", "progression": "Smaller ball", "contraindications": ["None"], "evidence_grade": "C", "duration_min": 5, "image_placeholder": "balloon_volley.gif"},
    # ── Functional ──
    {"id": "ex-097", "name": "Bed Mobility", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Rolling, bridging, scooting in bed.", "sets_reps": "5 reps each direction", "frequency": "Daily", "progression": "Independent, then add speed", "contraindications": ["Spinal precautions"], "evidence_grade": "A", "duration_min": 10, "image_placeholder": "bed_mobility.gif"},
    {"id": "ex-098", "name": "Transfers (Bed to Chair)", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Practice safe transfer techniques with assistance as needed.", "sets_reps": "5 reps", "frequency": "Daily", "progression": "Independent, varied surfaces", "contraindications": ["Non-weight bearing status"], "evidence_grade": "A", "duration_min": 10, "image_placeholder": "transfers.gif"},
    {"id": "ex-099", "name": "Dressing Practice", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Practice upper and lower body dressing with affected limb lead.", "sets_reps": "2 complete outfits", "frequency": "Daily", "progression": "Time pressure, complex garments", "contraindications": ["None"], "evidence_grade": "B", "duration_min": 15, "image_placeholder": "dressing.gif"},
    {"id": "ex-100", "name": "Kitchen Tasks", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Simulated kitchen activities: reaching, grasping, carrying.", "sets_reps": "15 minutes", "frequency": "Daily", "progression": "Real kitchen environment", "contraindications": ["None"], "evidence_grade": "B", "duration_min": 15, "image_placeholder": "kitchen_tasks.gif"},
    {"id": "ex-101", "name": "Bathroom Mobility", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Toilet transfers, shower standing, reaching for items.", "sets_reps": "5 reps each task", "frequency": "Daily", "progression": "Independent with grab bars", "contraindications": ["Severe balance deficit"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "bathroom_mobility.gif"},
    {"id": "ex-102", "name": "Car Transfer Practice", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Practice entering and exiting vehicle safely.", "sets_reps": "3 reps", "frequency": "3x/week", "progression": "Smaller vehicle, no assist", "contraindications": ["Hip precautions"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "car_transfer.gif"},
    # ── Breathing ──
    {"id": "ex-103", "name": "Diaphragmatic Breathing", "category": "breathing", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Belly breathing with hand on abdomen. Inhale 3s, exhale 6s.", "sets_reps": "3 x 10 breaths", "frequency": "Daily", "progression": "Supine to sitting to standing", "contraindications": ["None"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "diaphragm_breath.gif"},
    {"id": "ex-104", "name": "Pursed Lip Breathing", "category": "breathing", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Inhale through nose, exhale through pursed lips 2-3x longer.", "sets_reps": "3 x 10 breaths", "frequency": "Daily", "progression": "During activity", "contraindications": ["None"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "pursed_lip.gif"},
    {"id": "ex-105", "name": "Incentive Spirometry", "category": "breathing", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Sustained maximal inspiration using spirometer.", "sets_reps": "10 reps every hour", "frequency": "Daily", "progression": "Increase target volume", "contraindications": ["None"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "incentive_spiro.gif"},
    {"id": "ex-106", "name": "Segmental Breathing", "category": "breathing", "body_parts": ["thoracic_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Directed breathing into specific lung segments with therapist hand placement.", "sets_reps": "3 x 10 breaths each segment", "frequency": "Daily", "progression": "Independent with self-hands", "contraindications": ["Rib fracture"], "evidence_grade": "B", "duration_min": 8, "image_placeholder": "segmental_breath.gif"},
    {"id": "ex-107", "name": "Huff Coughing", "category": "breathing", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Forced expiration with open glottis. 'Huff' sound.", "sets_reps": "3 huffs, rest, repeat 3 cycles", "frequency": "As needed", "progression": "Combine with positioning", "contraindications": ["Recent abdominal surgery"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "huff_cough.gif"},
    # ── Vestibular ──
    {"id": "ex-108", "name": "Brandt-Daroff Exercises", "category": "vestibular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Seated to side-lying with head turned 45 degrees. Hold 30s.", "sets_reps": "3 repetitions each side, 3x/day", "frequency": "Daily x 2 weeks", "progression": "Increase speed of movement", "contraindications": ["Severe cervical spine pathology"], "evidence_grade": "A", "duration_min": 10, "image_placeholder": "brandt_daroff.gif"},
    {"id": "ex-109", "name": "Gaze Stabilization VOR x1", "category": "vestibular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Fix gaze on target while moving head side to side.", "sets_reps": "2 min x 3 directions", "frequency": "Daily", "progression": "Increase speed, smaller target", "contraindications": ["Cervical radiculopathy"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "vor_x1.gif"},
    {"id": "ex-110", "name": "Gaze Stabilization VOR x2", "category": "vestibular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Target and head move together while maintaining focus.", "sets_reps": "2 min x 3 directions", "frequency": "Daily", "progression": "Increase complexity", "contraindications": ["Severe vestibular loss"], "evidence_grade": "A", "duration_min": 8, "image_placeholder": "vor_x2.gif"},
    {"id": "ex-111", "name": "X1 and X2 Eye-Head Exercises", "category": "vestibular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "advanced", "description": "Combine X1 and X2 paradigms with increasing head velocity.", "sets_reps": "5 min each", "frequency": "Daily", "progression": "Full range, fast velocities", "contraindications": ["Cervical spine instability"], "evidence_grade": "B", "duration_min": 12, "image_placeholder": "x1x2.gif"},
    {"id": "ex-112", "name": "Balance Retraining with Visual Conflict", "category": "vestibular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Balance tasks with moving visual surround or head movement.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Increase visual flow speed", "contraindications": ["Severe imbalance"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "vestib_balance.gif"},
    # ── Pediatric ──
    {"id": "ex-113", "name": "Animal Walks (Bear, Crab, Frog)", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Fun weight-bearing activities in different positions.", "sets_reps": "5 minutes", "frequency": "Daily", "progression": "Speed, distance challenges", "contraindications": ["None"], "evidence_grade": "C", "duration_min": 5, "image_placeholder": "animal_walks.gif"},
    {"id": "ex-114", "name": "Ball Activities (Throw/Catch/Kick)", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["medicine_ball"], "difficulty": "beginner", "description": "Ball skills for coordination and gross motor development.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Vary ball size, distance", "contraindications": ["None"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "ball_activities.gif"},
    {"id": "ex-115", "name": "Tricycle/Bicycle Riding", "category": "pediatric", "body_parts": ["hip", "knee", "ankle"], "equipment": ["exercise_bike"], "difficulty": "intermediate", "description": "Reciprocal lower extremity movement with balance challenge.", "sets_reps": "10-15 minutes", "frequency": "Daily", "progression": "Two-wheeled bike", "contraindications": ["Severe balance deficit"], "evidence_grade": "B", "duration_min": 15, "image_placeholder": "tricycle.gif"},
    {"id": "ex-116", "name": "Obstacle Course (Pediatric)", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Crawling, climbing, stepping, and balancing through child-friendly course.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Increase complexity", "contraindications": ["None"], "evidence_grade": "C", "duration_min": 10, "image_placeholder": "peds_obstacle.gif"},
    {"id": "ex-117", "name": "Playground Activities", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Slides, swings, climbing for sensory integration and motor planning.", "sets_reps": "15 minutes", "frequency": "Daily", "progression": "Independent play", "contraindications": ["Seizure disorder (supervision)"], "evidence_grade": "C", "duration_min": 15, "image_placeholder": "playground.gif"},
    {"id": "ex-118", "name": " Hippotherapy Simulation", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["stability_ball"], "difficulty": "intermediate", "description": "Seated on therapy ball with weight shifts and reaching.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Remove upper extremity support", "contraindications": ["Severe balance deficit without support"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "hippo_sim.gif"},
    {"id": "ex-119", "name": "Handwriting Fine Motor", "category": "pediatric", "body_parts": ["hand"], "equipment": ["none"], "difficulty": "beginner", "description": "Tracing, copying, and free drawing for fine motor control.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Cursive, speed tasks", "contraindications": ["None"], "evidence_grade": "C", "duration_min": 10, "image_placeholder": "handwriting.gif"},
    {"id": "ex-120", "name": "Aquatic Therapy (Pediatric)", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Water-based activities for reduced gravity strengthening and movement.", "sets_reps": "20 minutes", "frequency": "2x/week", "progression": "Decrease buoyancy aids", "contraindications": ["Open wounds", "Uncontrolled seizures"], "evidence_grade": "B", "duration_min": 20, "image_placeholder": "aquatic_peds.gif"},
    {"id": "ex-121", "name": "Standing Frame Program", "category": "pediatric", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Supported standing in frame for bone density and hip development.", "sets_reps": "30-60 minutes", "frequency": "Daily", "progression": "Dynamic standing activities", "contraindications": ["Hip subluxation without clearance"], "evidence_grade": "A", "duration_min": 45, "image_placeholder": "stand_frame.gif"},
    {"id": "ex-122", "name": "HABIT (Bimanual Training)", "category": "pediatric", "body_parts": ["hand", "wrist", "elbow"], "equipment": ["none"], "difficulty": "intermediate", "description": "Hand-Arm Bimanual Intensive Therapy for cerebral palsy. Structured bimanual tasks.", "sets_reps": "6 hours/day for 2 weeks", "frequency": "Intensive camp", "progression": "Home maintenance", "contraindications": ["Severe cognitive impairment"], "evidence_grade": "A", "duration_min": 360, "image_placeholder": "habit.gif"},
    # ── Parkinson's specific ──
    {"id": "ex-123", "name": "LSBIG Amplitude Training", "category": "neuromuscular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Large amplitude movement training for Parkinson's. Exaggerated movements.", "sets_reps": "45 min session", "frequency": "Daily", "progression": "Complex dual-task", "contraindications": ["Severe dyskinesia"], "evidence_grade": "A", "duration_min": 45, "image_placeholder": "lsbig.gif"},
    {"id": "ex-124", "name": "PWR!Moves", "category": "neuromuscular", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Parkinson's Wellness Recovery: Up, Rock, Twist, and Floor exercises.", "sets_reps": "30 min session", "frequency": "Daily", "progression": "Combine with cognitive tasks", "contraindications": ["None"], "evidence_grade": "A", "duration_min": 30, "image_placeholder": "pwr_moves.gif"},
    {"id": "ex-125", "name": "Tandem Cycling for PD", "category": "cardio", "body_parts": ["hip", "knee", "ankle"], "equipment": ["exercise_bike"], "difficulty": "beginner", "description": "Forced-exercise at 80+ RPM on tandem or motorized bike.", "sets_reps": "40 minutes", "frequency": "3x/week", "progression": "Increase resistance", "contraindications": ["Unstable cardiac status"], "evidence_grade": "A", "duration_min": 40, "image_placeholder": "tandem_cycle_pd.gif"},
    {"id": "ex-126", "name": "Cueing Strategies (Visual/Auditory)", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "beginner", "description": "Practice walking with rhythmic auditory or transverse visual cues.", "sets_reps": "15 minutes", "frequency": "Daily", "progression": "Remove cues gradually", "contraindications": ["None"], "evidence_grade": "A", "duration_min": 15, "image_placeholder": "cueing.gif"},
    {"id": "ex-127", "name": "Falls Recovery Training", "category": "functional", "body_parts": ["whole_body"], "equipment": ["none"], "difficulty": "intermediate", "description": "Practice safe falling techniques and getting up from floor.", "sets_reps": "10 minutes", "frequency": "Daily", "progression": "Various surfaces, unexpected", "contraindications": ["Severe osteoporosis"], "evidence_grade": "B", "duration_min": 10, "image_placeholder": "falls_recovery.gif"},
    {"id": "ex-128", "name": "Spinal Stabilization McKenzie Extension", "category": "strengthening", "body_parts": ["lumbar_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Prone press-ups for posterior derangement. Hold 5s at end range.", "sets_reps": "10 reps every 2 hours", "frequency": "Daily", "progression": "Progress to standing extension", "contraindications": ["Spondylolisthesis", "Stenosis with extension pain"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "mckenzie_ext.gif"},
    {"id": "ex-129", "name": "Core Stabilization Abdominal Bracing", "category": "strengthening", "body_parts": ["lumbar_spine"], "equipment": ["none"], "difficulty": "beginner", "description": "Gentle abdominal contraction while maintaining neutral spine. Hold 10s.", "sets_reps": "3 x 10 holds", "frequency": "Daily", "progression": "Add limb movement", "contraindications": ["Acute disc herniation"], "evidence_grade": "A", "duration_min": 5, "image_placeholder": "abdominal_brace.gif"},
    {"id": "ex-130", "name": "Gluteal Setting", "category": "strengthening", "body_parts": ["hip"], "equipment": ["none"], "difficulty": "beginner", "description": "Supine, gently squeeze buttock muscles. Hold 5s.", "sets_reps": "3 x 10 holds each side", "frequency": "Daily", "progression": "Bridge progression", "contraindications": ["None"], "evidence_grade": "B", "duration_min": 5, "image_placeholder": "glute_set.gif"},
]

# Total: 130 exercises


# ──────────────────────────────────────────────────────────────────────────────
# Protocol Templates (10 pre-built rehab programs)
# ──────────────────────────────────────────────────────────────────────────────

PROTOCOL_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "tpl-stroke-ue-6w",
        "name": "Post-Stroke Upper Extremity Rehabilitation",
        "duration_weeks": 6,
        "condition": "Stroke (Upper Extremity)",
        "phases": [
            {
                "week": "1-2",
                "name": "Acute / Flaccidity Management",
                "goals": ["Prevent shoulder subluxation", "Maintain ROM", "Facilitate emerging movement"],
                "exercises": ["ex-081", "ex-082", "ex-087", "ex-091", "ex-036", "ex-032", "ex-040"],
                "assessments": ["fugl_meyer", "modified_ashworth", "rom_goniometry", "manual_muscle_test"],
                "frequency": "Daily, 45-60 min",
                "progression_criteria": "MMT 2+/5 or visible active movement",
            },
            {
                "week": "3-4",
                "name": "Subacute / Synergy Patterns",
                "goals": ["Break synergy patterns", "Increase active ROM", "Improve coordination"],
                "exercises": ["ex-077", "ex-084", "ex-013", "ex-014", "ex-093", "ex-094", "ex-082", "ex-090"],
                "assessments": ["fugl_meyer", "modified_ashworth", "rom_goniometry", "manual_muscle_test"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "FMA-UE > 20, MMT 3/5 key muscles",
            },
            {
                "week": "5-6",
                "name": "Chronic / Functional Integration",
                "goals": ["Task-specific training", "Fine motor recovery", "Community integration"],
                "exercises": ["ex-083", "ex-084", "ex-095", "ex-099", "ex-100", "ex-090", "ex-096"],
                "assessments": ["fugl_meyer", "rom_goniometry", "manual_muscle_test"],
                "frequency": "Daily, 60-90 min",
                "progression_criteria": "FMA-UE > 40, independence in ADL",
            },
        ],
        "evidence_grade": "A",
        "references": ["Winstein et al. 2016 AHA Guidelines", "Kwakkel et al. 2017 Cochrane Review"],
        "outcome_measures": ["FMA-UE", "WMFT", "ARAT", "mRS"],
        "contraindications": ["Unstable cardiac status", "Severe neglect limiting participation"],
    },
    {
        "id": "tpl-stroke-le-6w",
        "name": "Post-Stroke Lower Extremity Rehabilitation",
        "duration_weeks": 6,
        "condition": "Stroke (Lower Extremity)",
        "phases": [
            {
                "week": "1-2",
                "name": "Acute / Weight Bearing",
                "goals": ["Initiate weight bearing", "Prevent contractures", "Bed mobility"],
                "exercises": ["ex-097", "ex-098", "ex-001", "ex-007", "ex-049", "ex-058", "ex-069"],
                "assessments": ["fugl_meyer", "berg_balance", "timed_up_and_go", "modified_ashworth", "rom_goniometry"],
                "frequency": "Daily, 45 min",
                "progression_criteria": "Independent sitting balance > 30s",
            },
            {
                "week": "3-4",
                "name": "Subacute / Gait Training",
                "goals": ["Independent ambulation", "Improve gait quality", "Increase balance"],
                "exercises": ["ex-061", "ex-070", "ex-009", "ex-050", "ex-064", "ex-085", "ex-068"],
                "assessments": ["fugl_meyer", "berg_balance", "timed_up_and_go", "ten_meter_walk", "six_minute_walk"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "TUG < 30s, BBS > 41",
            },
            {
                "week": "5-6",
                "name": "Chronic / Community Ambulation",
                "goals": ["Community ambulation", "Stair climbing", "Dual-task walking"],
                "exercises": ["ex-062", "ex-068", "ex-066", "ex-067", "ex-010", "ex-090", "ex-075"],
                "assessments": ["berg_balance", "timed_up_and_go", "six_minute_walk", "ten_meter_walk"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "6MWT > 300m, TUG < 12s",
            },
        ],
        "evidence_grade": "A",
        "references": ["Winstein et al. 2016 AHA Guidelines", "English et al. 2017 Physiotherapy"],
        "outcome_measures": ["FMA-LE", "BBS", "TUG", "6MWT", "10MWT", "mRS"],
        "contraindications": ["Non-weight bearing status", "Unstable cardiac"],
    },
    {
        "id": "tpl-acl-12w",
        "name": "ACL Reconstruction Rehabilitation",
        "duration_weeks": 12,
        "condition": "ACL Reconstruction",
        "phases": [
            {
                "week": "1-2",
                "name": "Protection / Early ROM",
                "goals": ["Full extension", "90 degrees flexion", "Control effusion", "Independent ambulation"],
                "exercises": ["ex-001", "ex-003", "ex-025", "ex-007", "ex-033", "ex-004", "ex-058", "ex-031"],
                "assessments": ["rom_goniometry", "manual_muscle_test", "timed_up_and_go"],
                "frequency": "Daily",
                "progression_criteria": "Full extension, 90 deg flexion, minimal effusion",
            },
            {
                "week": "3-6",
                "name": "Strengthening / Neuromuscular",
                "goals": ["Full ROM", "Quad strength > 80% contralateral", "Normal gait"],
                "exercises": ["ex-009", "ex-010", "ex-005", "ex-024", "ex-026", "ex-027", "ex-049", "ex-064", "ex-071"],
                "assessments": ["rom_goniometry", "manual_muscle_test", "timed_up_and_go", "ten_meter_walk"],
                "frequency": "Daily",
                "progression_criteria": "MMT 4+/5 quadriceps, normal gait",
            },
            {
                "week": "7-9",
                "name": "Running / Agility",
                "goals": ["Running tolerance", "Plyometric introduction", "Sport-specific drills"],
                "exercises": ["ex-011", "ex-012", "ex-028", "ex-054", "ex-068", "ex-063", "ex-075", "ex-089"],
                "assessments": ["ten_meter_walk", "six_minute_walk", "timed_up_and_go"],
                "frequency": "Daily",
                "progression_criteria": "Single hop test > 90% LSI",
            },
            {
                "week": "10-12",
                "name": "Return to Sport",
                "goals": ["Pass return-to-sport criteria", "Psychological readiness"],
                "exercises": ["ex-067", "ex-090", "ex-059", "ex-060", "ex-076"],
                "assessments": ["ten_meter_walk", "six_minute_walk", "y_balance", "single_hop"],
                "frequency": "5x/week",
                "progression_criteria": "All RTS criteria met (KOOS, hop tests, psychological)",
            },
        ],
        "evidence_grade": "A",
        "references": ["van Grinsven et al. 2010", "Manske et al. 2012"],
        "outcome_measures": ["IKDC", "KOOS", "Single hop LSI", "Y-balance"],
        "contraindications": ["Unresolved meniscus repair restrictions", "Active infection"],
    },
    {
        "id": "tpl-clbp-8w",
        "name": "Chronic Low Back Pain Rehabilitation",
        "duration_weeks": 8,
        "condition": "Chronic Low Back Pain",
        "phases": [
            {
                "week": "1-2",
                "name": "Pain Management / Motor Control",
                "goals": ["Reduce fear of movement", "Restore neutral spine control", "Diaphragmatic breathing"],
                "exercises": ["ex-043", "ex-103", "ex-129", "ex-007", "ex-029", "ex-030", "ex-045", "ex-104"],
                "assessments": ["rom_goniometry", "manual_muscle_test", "oswestry_disability"],
                "frequency": "Daily, 30 min",
                "progression_criteria": "Pain < 3/10 with exercises",
            },
            {
                "week": "3-5",
                "name": "Stabilization / Strength",
                "goals": ["Core endurance > 60s", "Lumbar-hip dissociation", "Functional movements"],
                "exercises": ["ex-007", "ex-029", "ex-030", "ex-009", "ex-034", "ex-128", "ex-048", "ex-035"],
                "assessments": ["oswestry_disability", "roland_morris", "manual_muscle_test"],
                "frequency": "Daily, 45 min",
                "progression_criteria": "McGill endurance tests > 60s each",
            },
            {
                "week": "6-8",
                "name": "Functional / Return to Activity",
                "goals": ["Return to work/sport", "Lifting education", "Maintenance program"],
                "exercises": ["ex-009", "ex-011", "ex-062", "ex-075", "ex-010", "ex-100", "ex-102"],
                "assessments": ["oswestry_disability", "six_minute_walk"],
                "frequency": "5x/week, 60 min",
                "progression_criteria": "ODI < 20%, full return to activity",
            },
        ],
        "evidence_grade": "A",
        "references": ["Foster et al. 2018 Lancet", "Hayden et al. 2005 Cochrane"],
        "outcome_measures": ["ODI", "Roland-Morris", "VAS", "PSFS"],
        "contraindications": ["Cauda equina syndrome", "Unstable fracture", "Active malignancy"],
    },
    {
        "id": "tpl-parkinsons",
        "name": "Parkinson's Disease Rehabilitation",
        "duration_weeks": 12,
        "condition": "Parkinson's Disease",
        "phases": [
            {
                "week": "1-4",
                "name": "Foundation / Amplitude",
                "goals": ["Improve movement amplitude", "Reduce rigidity", "Establish exercise habit"],
                "exercises": ["ex-123", "ex-124", "ex-058", "ex-049", "ex-061", "ex-103", "ex-126"],
                "assessments": ["timed_up_and_go", "berg_balance", "six_minute_walk", "updrs_iii"],
                "frequency": "Daily, 45 min",
                "progression_criteria": "UPDRS-III improvement > 10%",
            },
            {
                "week": "5-8",
                "name": "Dual-Task / Functional",
                "goals": ["Dual-task training", "Falls prevention", "Freezing strategies"],
                "exercises": ["ex-090", "ex-066", "ex-067", "ex-050", "ex-051", "ex-127", "ex-126"],
                "assessments": ["timed_up_and_go", "berg_balance", "ten_meter_walk"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "BBS > 46, TUG < 10s",
            },
            {
                "week": "9-12",
                "name": "Maintenance / Community",
                "goals": ["Community exercise program", "Long-term adherence", "Caregiver training"],
                "exercises": ["ex-125", "ex-062", "ex-075", "ex-076", "ex-090", "ex-127"],
                "assessments": ["timed_up_and_go", "berg_balance", "six_minute_walk"],
                "frequency": "5x/week, 60 min",
                "progression_criteria": "Sustained improvements at 3 months",
            },
        ],
        "evidence_grade": "A",
        "references": ["Keus et al. 2014 ParkinsonNet", "Mak et al. 2017 Cochrane"],
        "outcome_measures": ["UPDRS-III", "BBS", "TUG", "6MWT", "PDQ-39"],
        "contraindications": ["Unstable cardiovascular status", "Severe dementia"],
    },
    {
        "id": "tpl-balance-8w",
        "name": "Balance and Fall Prevention",
        "duration_weeks": 8,
        "condition": "Fall Risk / Balance Deficit",
        "phases": [
            {
                "week": "1-2",
                "name": "Assessment / Safety",
                "goals": ["Identify fall risk factors", "Home safety education", "Begin balance training"],
                "exercises": ["ex-049", "ex-052", "ex-053", "ex-055", "ex-058", "ex-061", "ex-103"],
                "assessments": ["berg_balance", "timed_up_and_go", "four_square_step"],
                "frequency": "Daily, 30 min",
                "progression_criteria": "Safe with exercises, no falls during sessions",
            },
            {
                "week": "3-5",
                "name": "Dynamic Balance / Strength",
                "goals": ["Dynamic standing balance", "Reactive balance", "Lower limb strengthening"],
                "exercises": ["ex-050", "ex-054", "ex-056", "ex-060", "ex-010", "ex-009", "ex-004", "ex-057"],
                "assessments": ["berg_balance", "timed_up_and_go", "four_square_step"],
                "frequency": "Daily, 45 min",
                "progression_criteria": "BBS > 45, TUG < 12s",
            },
            {
                "week": "6-8",
                "name": "Community / Maintenance",
                "goals": ["Community ambulation", "Dual-task walking", "Long-term exercise plan"],
                "exercises": ["ex-051", "ex-066", "ex-067", "ex-068", "ex-090", "ex-062", "ex-075"],
                "assessments": ["berg_balance", "timed_up_and_go", "six_minute_walk"],
                "frequency": "5x/week, 60 min",
                "progression_criteria": "Independent community walking, BBS > 49",
            },
        ],
        "evidence_grade": "A",
        "references": ["Sherrington et al. 2019 Cochrane", "Gillespie et al. 2012"],
        "outcome_measures": ["BBS", "TUG", "FES-I", "6MWT", "Falls diary"],
        "contraindications": ["Recent fracture", "Unstable cardiac"],
    },
    {
        "id": "tpl-cardiac-12w",
        "name": "Cardiac Rehabilitation",
        "duration_weeks": 12,
        "condition": "Cardiovascular Disease",
        "phases": [
            {
                "week": "1-2",
                "name": "Inpatient / Early Outpatient",
                "goals": ["Mobilization", "Education", "Risk factor assessment"],
                "exercises": ["ex-103", "ex-058", "ex-061", "ex-097", "ex-098", "ex-104"],
                "assessments": ["six_minute_walk", "borg_scale", "blood_pressure"],
                "frequency": "Daily (inpatient)",
                "progression_criteria": "Stable vitals with ambulation",
            },
            {
                "week": "3-8",
                "name": "Outpatient / Supervised",
                "goals": ["Aerobic conditioning", "Strength training", "METs improvement"],
                "exercises": ["ex-061", "ex-071", "ex-076", "ex-075", "ex-058", "ex-009", "ex-007", "ex-073"],
                "assessments": ["six_minute_walk", "borg_scale", "timed_up_and_go"],
                "frequency": "3x/week supervised",
                "progression_criteria": "Achieve 5 METs without symptoms",
            },
            {
                "week": "9-12",
                "name": "Maintenance / Independent",
                "goals": ["Independent exercise", "Long-term adherence", "Return to work"],
                "exercises": ["ex-062", "ex-075", "ex-076", "ex-009", "ex-011", "ex-010"],
                "assessments": ["six_minute_walk", "timed_up_and_go"],
                "frequency": "5x/week",
                "progression_criteria": "7+ METs, independent exercise program",
            },
        ],
        "evidence_grade": "A",
        "references": ["ACSM Guidelines 11th Ed", "Piepoli et al. 2016 ESC"],
        "outcome_measures": ["6MWT", "CPET", "Duke Activity Status Index"],
        "contraindications": ["Unstable angina", "Uncontrolled arrhythmia", "Acute heart failure"],
    },
    {
        "id": "tpl-copd-8w",
        "name": "COPD Pulmonary Rehabilitation",
        "duration_weeks": 8,
        "condition": "COPD",
        "phases": [
            {
                "week": "1-2",
                "name": "Assessment / Symptom Control",
                "goals": ["Dyspnea management", "Bronchial hygiene", "Activity pacing"],
                "exercises": ["ex-103", "ex-104", "ex-105", "ex-106", "ex-107", "ex-058", "ex-061"],
                "assessments": ["six_minute_walk", "borg_scale", "cat_score", "mmrc"],
                "frequency": "Daily",
                "progression_criteria": "SpO2 > 88% with exercise",
            },
            {
                "week": "3-5",
                "name": "Exercise Training",
                "goals": ["Endurance training", "Strength training", "Interval training"],
                "exercises": ["ex-061", "ex-071", "ex-009", "ex-007", "ex-058", "ex-010", "ex-004"],
                "assessments": ["six_minute_walk", "borg_scale", "cat_score"],
                "frequency": "5x/week",
                "progression_criteria": "6MWT improvement > 54m",
            },
            {
                "week": "6-8",
                "name": "Self-Management / Maintenance",
                "goals": ["Home exercise program", "Exacerbation action plan", "Long-term adherence"],
                "exercises": ["ex-062", "ex-075", "ex-009", "ex-007", "ex-103", "ex-104", "ex-071"],
                "assessments": ["six_minute_walk", "cat_score", "mmrc"],
                "frequency": "5x/week",
                "progression_criteria": "Sustained 6MWT improvement, independent management",
            },
        ],
        "evidence_grade": "A",
        "references": ["Spruit et al. 2013 ATS/ERS", "McCarthy et al. 2015 Cochrane"],
        "outcome_measures": ["6MWT", "CAT", "mMRC", "BODE index"],
        "contraindications": ["Acute exacerbation", "Unstable cardiac", "SaO2 < 88% on air"],
    },
    {
        "id": "tpl-vestibular-6w",
        "name": "Vestibular Rehabilitation",
        "duration_weeks": 6,
        "condition": "Vestibular Dysfunction",
        "phases": [
            {
                "week": "1-2",
                "name": "Habituation / Gaze Stabilization",
                "goals": ["Reduce dizziness", "Improve gaze stability", "Begin balance training"],
                "exercises": ["ex-109", "ex-110", "ex-108", "ex-049", "ex-050", "ex-103"],
                "assessments": ["dhi_score", "berg_balance", "timed_up_and_go"],
                "frequency": "3x/day (gaze), Daily (balance)",
                "progression_criteria": "DHI reduction > 10 points",
            },
            {
                "week": "3-4",
                "name": "Balance / Substitution",
                "goals": ["Dynamic balance", "Sensory reweighting", "Functional movements"],
                "exercises": ["ex-054", "ex-112", "ex-055", "ex-060", "ex-066", "ex-051"],
                "assessments": ["dhi_score", "berg_balance", "timed_up_and_go"],
                "frequency": "Daily, 45 min",
                "progression_criteria": "BBS improvement > 8 points",
            },
            {
                "week": "5-6",
                "name": "Functional / Community",
                "goals": ["Community ambulation", "Dual-task", "Maintenance program"],
                "exercises": ["ex-062", "ex-066", "ex-067", "ex-068", "ex-090", "ex-061"],
                "assessments": ["dhi_score", "berg_balance", "timed_up_and_go", "six_minute_walk"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "DHI < 30, community independence",
            },
        ],
        "evidence_grade": "A",
        "references": ["Hall et al. 2016 CPG", "McDonnell et al. 2015 Cochrane"],
        "outcome_measures": ["DHI", "BBS", "TUG", "ABC scale"],
        "contraindications": ["Unstable central lesion", "Acute vestibular crisis"],
    },
    {
        "id": "tpl-cp-peds",
        "name": "Pediatric Cerebral Palsy",
        "duration_weeks": 12,
        "condition": "Cerebral Palsy (Pediatric)",
        "phases": [
            {
                "week": "1-4",
                "name": "Assessment / Goal Setting",
                "goals": ["GMFCS level confirmation", "Family goals", "Spasticity management"],
                "exercises": ["ex-121", "ex-113", "ex-114", "ex-118", "ex-088", "ex-097", "ex-098"],
                "assessments": ["gmfm", "modified_ashworth", "rom_goniometry", "manual_muscle_test"],
                "frequency": "Daily, 45 min",
                "progression_criteria": "Family engagement, tolerance of activities",
            },
            {
                "week": "5-8",
                "name": "Intensive Training",
                "goals": ["Bimanual training", "Gait training", "Standing program"],
                "exercises": ["ex-122", "ex-115", "ex-116", "ex-117", "ex-118", "ex-113", "ex-119"],
                "assessments": ["gmfm", "modified_ashworth", "rom_goniometry"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "GMFM improvement > 5%",
            },
            {
                "week": "9-12",
                "name": "Functional / School Integration",
                "goals": ["School participation", "Home program", "Long-term planning"],
                "exercises": ["ex-114", "ex-115", "ex-116", "ex-117", "ex-120", "ex-121", "ex-119"],
                "assessments": ["gmfm", "pedsql", "cp_child"],
                "frequency": "Daily, 60 min",
                "progression_criteria": "School participation goals met",
            },
        ],
        "evidence_grade": "A",
        "references": ["Novak et al. 2013 ACP guideline", "Rosenbaum et al. 2017"],
        "outcome_measures": ["GMFM-66", "PedsQL", "CPCHILD", "MASS"],
        "contraindications": ["Uncontrolled seizures", "Post-surgical restrictions"],
    },
]


# ──────────────────────────────────────────────────────────────────────────────
# Normative Reference Data
# ──────────────────────────────────────────────────────────────────────────────

NORMATIVE_DATA = {
    "fugl_meyer": {
        "upper_max": 66,
        "lower_max": 34,
        "total_max": 100,
        "minimal_detectable_change": {"ue": 5.2, "le": 3.4},
        "mcid": {"ue": 6, "le": 4},
        "severity_ranges": {
            "upper": {"severe": (0, 19), "moderate": (20, 31), "mild": (32, 47), "near_normal": (48, 58), "normal": (59, 66)},
            "lower": {"severe": (0, 7), "moderate": (8, 14), "mild": (15, 20), "near_normal": (21, 26), "normal": (27, 34)},
        },
    },
    "berg_balance": {
        "max": 56,
        "mcid": 4,
        "fall_risk_cutoff": 45,
        "ranges": {"high_fall_risk": (0, 36), "medium_fall_risk": (37, 44), "low_fall_risk": (45, 56)},
        "age_norms": {"60-69": 52, "70-79": 50, "80-99": 46},
    },
    "timed_up_and_go": {
        "units": "seconds",
        "fall_risk_cutoff": 12,
        "ranges": {"normal": (0, 10), "mild_impairment": (10.01, 15), "moderate_impairment": (15.01, 20), "severe": (20.01, 60)},
        "age_norms": {"60-69": 8.1, "70-79": 9.2, "80-89": 11.3, "90+": 14.8},
    },
    "six_minute_walk": {
        "units": "metres",
        "mcid_copd": 54,
        "mcid_heart_failure": 45,
        "mcid_stroke": 34,
        "reference_equation": lambda age, height_cm, weight_kg, gender: (
            (7.57 * height_cm) - (5.02 * age) - (1.76 * weight_kg) - (309 * (0 if gender.lower() == "male" else 1)) +  men_constant
        ),
        "age_norms_m": {"40-49": 576, "50-59": 557, "60-69": 535, "70-79": 500, "80-89": 458},
        "age_norms_f": {"40-49": 538, "50-59": 515, "60-69": 500, "70-79": 471, "80-89": 415},
    },
    "ten_meter_walk": {
        "units": "m/s",
        "household_ambulator": 0.4,
        "limited_community": 0.8,
        "full_community": 1.2,
    },
    "modified_ashworth": {
        "grades": {0: "No increase in tone", 1: "Slight increase", "1+": "Slight increase, catch", 2: "More marked increase", 3: "Considerable increase", 4: "Rigid"},
        "max": 4,
    },
    "manual_muscle_test": {
        "grades": {0: "No contraction", 1: "Flicker/trace", 2: "Active with gravity eliminated", "2-": "Active, gravity eliminated, partial ROM", "2+": "Active, gravity eliminated, full ROM", 3: "Active against gravity", "3-": "Active against gravity, partial ROM", "3+": "Active against gravity, full ROM, no resistance", 4: "Active against some resistance", "4+": "Active against moderate resistance", 5: "Normal power"},
        "max": 5,
    },
}

# Fix reference equation placeholder
men_constant = 0  # noqa: F841 — placeholder; actual equation uses gender coefficient


# ──────────────────────────────────────────────────────────────────────────────
# Assessment Scoring Functions
# ──────────────────────────────────────────────────────────────────────────────

def score_fugl_meyer(item_scores: dict[str, int]) -> dict[str, Any]:
    """Score Fugl-Meyer Assessment from individual item dict.

    Expected keys per section:
    - upper: ue_motor_a through ue_motor_d (33 items, 0-2 each)
    - lower: le_motor (17 items, 0-2 each)
    - sensation: (4 items, 0-2 each)
    - passive_rom: (8 items, 0-2 each)
    - pain: (4 items, 0-2 each)
    """
    upper_items = [
        "ue_motor_a_reflex", "ue_motor_a_flex_synergy_shoulder_retraction",
        "ue_motor_a_flex_synergy_shoulder_elevation", "ue_motor_a_flex_synergy_shoulder_abduction",
        "ue_motor_a_flex_synergy_shoulder_ext_rotation", "ue_motor_a_flex_synergy_elbow_flexion",
        "ue_motor_a_flex_synergy_forearm_supination", "ue_motor_b_ext_synergy_shoulder_adduction",
        "ue_motor_b_ext_synergy_shoulder_int_rotation", "ue_motor_b_ext_synergy_elbow_extension",
        "ue_motor_b_ext_synergy_forearm_pronation", "ue_motor_c_mix_shoulder_ext_to_90",
        "ue_motor_c_mix_shoulder_abduction_to_90", "ue_motor_c_mix_shoulder_ext_abd_180",
        "ue_motor_c_mix_elbow_flexion_90", "ue_motor_c_mix_forearm_sup_pron_90",
        "ue_motor_d_norm_shoulder_abduction", "ue_motor_d_norm_shoulder_flexion_180",
        "ue_motor_d_norm_prone_shoulder_ext", "ue_motor_d_norm_prone_elbow_flexion",
        "ue_motor_d_norm_prone_elbow_extension", "ue_motor_d_norm_supine_shoulder_int_rotation",
        "ue_motor_d_norm_palm_to_spine", "ue_motor_d_norm_palm_to_forehead",
        "ue_motor_d_norm_pronation", "ue_motor_d_norm_supination",
        "ue_motor_d_norm_wrist_flexion", "ue_motor_d_norm_wrist_extension",
        "ue_motor_d_norm_finger_mass_flexion", "ue_motor_d_norm_finger_mass_extension",
        "ue_motor_d_norm_finger_hookup", "ue_motor_d_norm_thumb_adduction",
        "ue_motor_d_norm_thumb_opposition", "ue_motor_d_norm_thumb_flexion",
        "ue_motor_d_norm_thumb_extension",
    ]
    lower_items = [
        "le_motor_reflex", "le_motor_a_flex_hip_flexion", "le_motor_a_flex_knee_flexion",
        "le_motor_a_flex_ankle_dorsiflexion", "le_motor_b_ext_hip_extension",
        "le_motor_b_ext_hip_adduction", "le_motor_b_ext_knee_extension",
        "le_motor_b_ext_ankle_plantarflexion", "le_motor_c_mix_hip_ext_to_15",
        "le_motor_c_mix_knee_flexion_90", "le_motor_c_mix_ankle_dorsiflexion_sitting",
        "le_motor_d_norm_hip_flexion_supine", "le_motor_d_norm_hip_extension_prone",
        "le_motor_d_norm_hip_abduction", "le_motor_d_norm_knee_flexion_end",
        "le_motor_d_norm_knee_extension", "le_motor_d_norm_ankle_dorsiflexion",
    ]
    sensation_items = ["light_touch_arm", "light_touch_leg", "proprioception_arm", "proprioception_leg"]
    prom_items = [
        "prom_shoulder_flexion", "prom_shoulder_abduction", "prom_wrist_flexion",
        "prom_wrist_extension", "prom_finger_flexion", "prom_finger_extension",
        "prom_hip_flexion", "prom_ankle_dorsiflexion",
    ]
    pain_items = ["pain_shoulder", "pain_wrist", "pain_hip", "pain_knee"]

    upper_score = sum(min(item_scores.get(k, 0), 2) for k in upper_items[:33])
    lower_score = sum(min(item_scores.get(k, 0), 2) for k in lower_items[:17])
    sensation_score = sum(min(item_scores.get(k, 0), 2) for k in sensation_items)
    prom_score = sum(min(item_scores.get(k, 0), 2) for k in prom_items)
    pain_score = sum(min(item_scores.get(k, 0), 2) for k in pain_items)
    total_score = upper_score + lower_score + sensation_score + prom_score + pain_score

    return {
        "assessment_type": "fugl_meyer",
        "upper_extremity_score": upper_score,
        "upper_max": NORMATIVE_DATA["fugl_meyer"]["upper_max"],
        "upper_percent": round(upper_score / NORMATIVE_DATA["fugl_meyer"]["upper_max"] * 100, 1),
        "lower_extremity_score": lower_score,
        "lower_max": NORMATIVE_DATA["fugl_meyer"]["lower_max"],
        "lower_percent": round(lower_score / NORMATIVE_DATA["fugl_meyer"]["lower_max"] * 100, 1),
        "sensation_score": sensation_score,
        "passive_rom_score": prom_score,
        "pain_score": pain_score,
        "total_score": total_score,
        "total_max": NORMATIVE_DATA["fugl_meyer"]["total_max"],
        "total_percent": round(total_score / NORMATIVE_DATA["fugl_meyer"]["total_max"] * 100, 1),
        "severity_upper": _fugl_meyer_severity("upper", upper_score),
        "severity_lower": _fugl_meyer_severity("lower", lower_score),
        "mcid": NORMATIVE_DATA["fugl_meyer"]["mcid"],
    }


def _fugl_meyer_severity(extremity: str, score: int) -> str:
    ranges = NORMATIVE_DATA["fugl_meyer"]["severity_ranges"].get(extremity, {})
    for level, (lo, hi) in ranges.items():
        if lo <= score <= hi:
            return level
    return "unknown"


def score_berg_balance(item_scores: dict[str, int]) -> dict[str, Any]:
    """Score Berg Balance Scale from 14 items (0-4 each)."""
    items = [
        "sitting_unsupported", "sitting_to_standing", "standing_to_sitting",
        "standing_unsupported", "transfers", "standing_eyes_closed",
        "standing_feet_together", "tandem_standing", "standing_on_one_leg",
        "turning_trunk", "turning_360", "stool_stepping",
        "standing_reaching_forward", "retrieving_from_floor",
    ]
    scores = {k: max(0, min(4, item_scores.get(k, 0))) for k in items}
    total = sum(scores.values())

    risk_level = "low"
    if total <= 36:
        risk_level = "high"
    elif total <= 44:
        risk_level = "medium"

    return {
        "assessment_type": "berg_balance",
        "total_score": total,
        "max_score": NORMATIVE_DATA["berg_balance"]["max"],
        "percent": round(total / NORMATIVE_DATA["berg_balance"]["max"] * 100, 1),
        "fall_risk_level": risk_level,
        "fall_risk_cutoff": NORMATIVE_DATA["berg_balance"]["fall_risk_cutoff"],
        "item_breakdown": scores,
        "mcid": NORMATIVE_DATA["berg_balance"]["mcid"],
    }


def score_timed_up_and_go(seconds: float, age: int | None = None) -> dict[str, Any]:
    """Score Timed Up and Go test."""
    data = NORMATIVE_DATA["timed_up_and_go"]
    level = "normal"
    for lvl, (lo, hi) in data["ranges"].items():
        if lo <= seconds <= hi:
            level = lvl
            break

    norm = None
    if age:
        for age_range, norm_val in data["age_norms"].items():
            lo_s, hi_s = age_range.split("-")
            lo_i = int(lo_s.replace("+", ""))
            hi_i = int(hi_s.replace("+", ""))
            if lo_i <= age <= hi_i:
                norm = norm_val
                break

    return {
        "assessment_type": "timed_up_and_go",
        "seconds": round(seconds, 2),
        "impairment_level": level,
        "fall_risk": seconds > data["fall_risk_cutoff"],
        "age_normative": norm,
        "fall_risk_cutoff": data["fall_risk_cutoff"],
    }


def score_six_minute_walk(metres: float, age: int | None = None, gender: str | None = None) -> dict[str, Any]:
    """Score 6-Minute Walk Test."""
    data = NORMATIVE_DATA["six_minute_walk"]
    norm = None
    if age and gender:
        norms_key = f"age_norms_{gender.lower()[:1]}"
        norms = data.get(norms_key, {})
        for age_range, norm_val in norms.items():
            lo_s, hi_s = age_range.split("-")
            lo_i = int(lo_s)
            hi_i = int(hi_s)
            if lo_i <= age <= hi_i:
                norm = norm_val
                break

    percent_predicted = round((metres / norm * 100), 1) if norm else None

    return {
        "assessment_type": "six_minute_walk",
        "metres": round(metres, 1),
        "predicted_normal": norm,
        "percent_predicted": percent_predicted,
        "mcid_copd": data["mcid_copd"],
        "mcid_heart_failure": data["mcid_heart_failure"],
        "mcid_stroke": data["mcid_stroke"],
    }


def score_ten_meter_walk(seconds: float, distance_m: float = 10.0) -> dict[str, Any]:
    """Score 10-Meter Walk Test (gait speed)."""
    speed = distance_m / seconds if seconds > 0 else 0
    data = NORMATIVE_DATA["ten_meter_walk"]
    level = "non_ambulatory"
    if speed >= data["full_community"]:
        level = "full_community"
    elif speed >= data["limited_community"]:
        level = "limited_community"
    elif speed >= data["household_ambulator"]:
        level = "household_ambulator"

    return {
        "assessment_type": "ten_meter_walk",
        "seconds": round(seconds, 2),
        "gait_speed_m_s": round(speed, 2),
        "ambulation_level": level,
        "household_threshold": data["household_ambulator"],
        "limited_community_threshold": data["limited_community"],
        "full_community_threshold": data["full_community"],
    }


def score_modified_ashworth(item_scores: dict[str, int]) -> dict[str, Any]:
    """Score Modified Ashworth Scale for spasticity per muscle group."""
    graded = {}
    for muscle, grade in item_scores.items():
        if isinstance(grade, (int, float)):
            graded[muscle] = max(0, min(4, int(grade)))
        else:
            graded[muscle] = grade
    avg_grade = sum(v for v in graded.values() if isinstance(v, (int, float))) / len(graded) if graded else 0

    return {
        "assessment_type": "modified_ashworth",
        "item_scores": graded,
        "average_grade": round(avg_grade, 2),
        "max_grade": NORMATIVE_DATA["modified_ashworth"]["max"],
        "grade_descriptions": NORMATIVE_DATA["modified_ashworth"]["grades"],
        "any_significant_spasticity": any(isinstance(v, (int, float)) and v >= 2 for v in graded.values()),
    }


def score_rom_goniometry(measurements: dict[str, dict[str, float]]) -> dict[str, Any]:
    """Score ROM goniometry measurements.

    measurements: {joint: {movement: degrees, ...}, ...}
    e.g. {"shoulder": {"flexion": 160, "abduction": 150, ...}}
    """
    normative_rom = {
        "shoulder": {"flexion": 180, "extension": 60, "abduction": 180, "internal_rotation": 70, "external_rotation": 90},
        "elbow": {"flexion": 150, "extension": 0},
        "wrist": {"flexion": 80, "extension": 70, "ulnar_deviation": 30, "radial_deviation": 20},
        "hip": {"flexion": 120, "extension": 30, "abduction": 45, "adduction": 30, "internal_rotation": 45, "external_rotation": 45},
        "knee": {"flexion": 135, "extension": 0},
        "ankle": {"dorsiflexion": 20, "plantarflexion": 50},
        "cervical_spine": {"flexion": 45, "extension": 45, "rotation": 80, "lateral_flexion": 45},
        "lumbar_spine": {"flexion": 80, "extension": 30, "rotation": 45, "lateral_flexion": 35},
    }

    results = {}
    deficits = []
    for joint, movements in measurements.items():
        joint_norms = normative_rom.get(joint, {})
        joint_result = {}
        for movement, measured in movements.items():
            norm = joint_norms.get(movement)
            pct = round((measured / norm * 100), 1) if norm and norm > 0 else None
            joint_result[movement] = {
                "measured": measured,
                "normal": norm,
                "percent_normal": pct,
                "deficit": round(norm - measured, 1) if norm and measured < norm else 0,
            }
            if norm and measured < norm * 0.8:
                deficits.append(f"{joint} {movement}: {measured}/{norm}")
        results[joint] = joint_result

    return {
        "assessment_type": "rom_goniometry",
        "joint_measurements": results,
        "significant_deficits": deficits,
        "deficit_count": len(deficits),
    }


def score_manual_muscle_test(item_scores: dict[str, float]) -> dict[str, Any]:
    """Score Manual Muscle Testing (MMT) 0-5 scale per muscle."""
    graded = {}
    for muscle, grade in item_scores.items():
        g = max(0, min(5, float(grade)))
        graded[muscle] = g

    avg_grade = sum(graded.values()) / len(graded) if graded else 0
    weakness_muscles = [m for m, g in graded.items() if g < 3]
    normal_muscles = [m for m, g in graded.items() if g >= 4]

    return {
        "assessment_type": "manual_muscle_test",
        "item_scores": graded,
        "average_grade": round(avg_grade, 2),
        "max_grade": NORMATIVE_DATA["manual_muscle_test"]["max"],
        "grade_descriptions": NORMATIVE_DATA["manual_muscle_test"]["grades"],
        "weakness_muscles": weakness_muscles,
        "normal_muscles": normal_muscles,
        "functional_independence_likely": avg_grade >= 3.5,
    }


ASSESSMENT_SCORERS = {
    "fugl_meyer": score_fugl_meyer,
    "berg_balance": score_berg_balance,
    "timed_up_and_go": score_timed_up_and_go,
    "six_minute_walk": score_six_minute_walk,
    "ten_meter_walk": score_ten_meter_walk,
    "modified_ashworth": score_modified_ashworth,
    "rom_goniometry": score_rom_goniometry,
    "manual_muscle_test": score_manual_muscle_test,
}


# ──────────────────────────────────────────────────────────────────────────────
# Service Functions
# ──────────────────────────────────────────────────────────────────────────────

def get_rehab_patients(
    session: Session,
    clinic_id: str | None = None,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """List patients with active rehabilitation programs, scoped to clinic."""
    filters = filters or {}
    # In production, this queries a Patient table with rehab flags.
    # Here we return a structured mock with realistic data.
    patients = [
        {
            "patient_id": f"rehab-pt-{i:03d}",
            "clinic_id": clinic_id or "clinic-default",
            "name": name,
            "age": age,
            "diagnosis": diagnosis,
            "injury_type": injury_type,
            "rehab_phase": phase,
            "protocol_active": True,
            "last_assessment_date": (datetime.now(timezone.utc)).isoformat(),
            "next_assessment_due": (datetime.now(timezone.utc)).isoformat(),
            "primary_therapist": "Dr. Smith",
            "goals_count": 3,
            "sessions_this_week": 2 + (i % 3),
            "adherence_pct": 75 + (i * 5) % 25,
            "alerts": alerts,
        }
        for i, (name, age, diagnosis, injury_type, phase, alerts) in enumerate([
            ("Elena Vasquez", 68, "Left MCA Stroke", "ischemic_stroke", "subacute", ["plateau_warning"]),
            ("Marcus Chen", 45, "ACL Reconstruction R", "sports_orthopedic", "strengthening", []),
            ("Amelia Brown", 72, "Parkinson's Disease", "neurodegenerative", "maintenance", ["overdue_assessment"]),
            ("Omar Haddad", 55, "Chronic Low Back Pain", "spine", "functional", []),
            ("Samantha Li", 34, "Vestibular Neuritis", "vestibular", "acute", ["overdue_assessment"]),
            ("James Wright", 62, "COPD Gold III", "pulmonary", "stabilization", []),
            ("Nina Patel", 8, "Cerebral Palsy Spastic Diplegia", "pediatric_neuro", "intensive", ["plateau_warning"]),
            ("Robert Kim", 78, "Fall Risk / Balance Deficit", "geriatric_balance", "strengthening", ["overdue_assessment"]),
            ("Lisa Thompson", 51, "Cardiac Rehab Post-MI", "cardiac", "supervised", []),
            ("David Garcia", 41, "Subacute Stroke", "hemorrhagic_stroke", "acute", []),
        ])
    ]
    if clinic_id:
        patients = [p for p in patients if p["clinic_id"] == clinic_id]
    phase_filter = filters.get("phase")
    if phase_filter:
        patients = [p for p in patients if p["rehab_phase"] == phase_filter]
    return patients


def get_rehab_profile(session: Session, patient_id: str) -> dict[str, Any] | None:
    """Get full rehabilitation profile for a patient."""
    # In production, query patient demographics, diagnosis, timeline, etc.
    profiles = {
        "rehab-pt-000": {
            "patient_id": "rehab-pt-000",
            "name": "Elena Vasquez",
            "age": 68,
            "gender": "female",
            "diagnosis": "Left MCA Ischemic Stroke",
            "injury_type": "ischemic_stroke",
            "date_of_injury": "2024-10-15",
            "date_of_surgery": None,
            "rehab_phase": "subacute",
            "rehab_start_date": "2024-10-22",
            "timeline": [
                {"date": "2024-10-15", "event": "Stroke onset", "type": "injury"},
                {"date": "2024-10-16", "event": "tPA administered", "type": "intervention"},
                {"date": "2024-10-22", "event": "Rehabilitation commenced", "type": "rehab_start"},
                {"date": "2024-11-15", "event": "FMA-UE: 28 (moderate impairment)", "type": "milestone"},
                {"date": "2024-12-01", "event": "Current: FMA-UE: 34 (approaching mild)", "type": "current"},
            ],
            "current_goals": [
                {"id": "g-1", "description": "FMA-UE score > 40", "target_date": "2024-12-15", "status": "active"},
                {"id": "g-2", "description": "Independent dressing", "target_date": "2024-12-30", "status": "active"},
                {"id": "g-3", "description": "Community ambulation with stick", "target_date": "2025-01-15", "status": "active"},
            ],
            "active_protocols": ["tpl-stroke-ue-6w"],
            "medications": ["Baclofen 5mg TDS", "Aspirin 100mg OD"],
            "allergies": ["Penicillin"],
            "weight_kg": 68,
            "height_cm": 162,
            "dominant_hand": "right",
            "affected_side": "left",
            "comorbidities": ["Hypertension", "Type 2 Diabetes"],
            "precautions": ["Shoulder subluxation risk - limit passive ROM > 90 deg"],
        },
    }
    profile = profiles.get(patient_id)
    if profile is None:
        # Return a generic scaffold
        return {
            "patient_id": patient_id,
            "name": "Unknown",
            "age": None,
            "diagnosis": "Not on record",
            "rehab_phase": "unspecified",
            "timeline": [],
            "current_goals": [],
            "active_protocols": [],
            "medications": [],
            "precautions": [],
        }
    return profile


def submit_assessment(
    session: Session,
    patient_id: str,
    assessment_type: str,
    scores: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Submit and score a rehabilitation assessment."""
    if assessment_type not in REHAB_ASSESSMENT_TYPES:
        return {"error": f"Unknown assessment type: {assessment_type}", "valid_types": REHAB_ASSESSMENT_TYPES}

    scorer = ASSESSMENT_SCORERS.get(assessment_type)
    if scorer is None:
        return {"error": f"No scorer registered for: {assessment_type}"}

    try:
        result = scorer(**scores)
    except Exception as e:
        return {"error": f"Scoring failed: {str(e)}"}

    result["assessment_id"] = f"ra-{uuid.uuid4().hex[:12]}"
    result["patient_id"] = patient_id
    result["assessment_type"] = assessment_type
    result["submitted_at"] = _iso_now()
    result["metadata"] = metadata or {}

    return result


def get_assessment_history(
    session: Session,
    patient_id: str,
    assessment_type: str | None = None,
) -> list[dict[str, Any]]:
    """Get assessment history for a patient."""
    # In production: query AssessmentResult table filtered by patient_id
    history = [
        {
            "assessment_id": f"ra-{i:04d}",
            "patient_id": patient_id,
            "assessment_type": atype,
            "date": "2024-11-01",
            "score_summary": summary,
        }
        for i, (atype, summary) in enumerate([
            ("fugl_meyer", {"ue_score": 22, "le_score": 18}),
            ("berg_balance", {"total": 42}),
            ("timed_up_and_go", {"seconds": 18.5}),
            ("fugl_meyer", {"ue_score": 28, "le_score": 22}),
            ("berg_balance", {"total": 46}),
            ("timed_up_and_go", {"seconds": 14.2}),
            ("fugl_meyer", {"ue_score": 34, "le_score": 25}),
        ])
    ]
    if assessment_type:
        history = [h for h in history if h["assessment_type"] == assessment_type]
    return history


def get_exercise_library(
    session: Session,
    category: str | None = None,
    body_part: str | None = None,
    equipment: str | None = None,
    difficulty: str | None = None,
    query: str | None = None,
) -> list[dict[str, Any]]:
    """Get filtered exercise library."""
    exercises = EXERCISE_LIBRARY[:]
    if category:
        exercises = [e for e in exercises if e["category"] == category]
    if body_part:
        exercises = [e for e in exercises if body_part in e.get("body_parts", [])]
    if equipment:
        exercises = [e for e in exercises if equipment in e.get("equipment", [])]
    if difficulty:
        exercises = [e for e in exercises if e.get("difficulty") == difficulty]
    if query:
        q = query.lower().strip()
        exercises = [
            e for e in exercises
            if q in e["name"].lower() or q in e.get("description", "").lower()
            or q in e.get("category", "").lower()
            or any(q in bp.lower() for bp in e.get("body_parts", []))
        ]
    return exercises


def create_protocol(
    session: Session,
    patient_id: str,
    protocol_data: dict[str, Any],
) -> dict[str, Any]:
    """Create a custom rehabilitation protocol from template or scratch."""
    template_id = protocol_data.get("template_id")
    template = None
    if template_id:
        template = next((t for t in PROTOCOL_TEMPLATES if t["id"] == template_id), None)

    protocol_id = f"rp-{uuid.uuid4().hex[:12]}"
    now = _iso_now()

    phases = []
    if template:
        for phase in template.get("phases", []):
            phases.append({
                "week": phase["week"],
                "name": phase["name"],
                "goals": phase["goals"],
                "exercises": phase["exercises"],
                "assessments": phase["assessments"],
                "frequency": phase["frequency"],
                "progression_criteria": phase["progression_criteria"],
                "status": "pending",
            })
    else:
        # Custom protocol from scratch
        for phase_data in protocol_data.get("phases", []):
            phases.append({
                "week": phase_data.get("week", ""),
                "name": phase_data.get("name", ""),
                "goals": phase_data.get("goals", []),
                "exercises": phase_data.get("exercises", []),
                "assessments": phase_data.get("assessments", []),
                "frequency": phase_data.get("frequency", ""),
                "progression_criteria": phase_data.get("progression_criteria", ""),
                "status": "pending",
            })

    protocol = {
        "protocol_id": protocol_id,
        "patient_id": patient_id,
        "name": protocol_data.get("name", template["name"] if template else "Custom Protocol"),
        "template_id": template_id,
        "created_at": now,
        "status": "active",
        "duration_weeks": protocol_data.get("duration_weeks", template["duration_weeks"] if template else 4),
        "condition": protocol_data.get("condition", template["condition"] if template else ""),
        "phases": phases,
        "outcome_measures": protocol_data.get("outcome_measures", template["outcome_measures"] if template else []),
        "contraindications": protocol_data.get("contraindications", template["contraindications"] if template else []),
        "evidence_grade": template["evidence_grade"] if template else "C",
        "references": template["references"] if template else [],
        "therapist_notes": protocol_data.get("therapist_notes", ""),
    }

    return protocol


def get_patient_protocols(session: Session, patient_id: str) -> list[dict[str, Any]]:
    """Get all protocols assigned to a patient."""
    # In production: query Protocol table by patient_id
    return [
        {
            "protocol_id": f"rp-{i:04d}",
            "patient_id": patient_id,
            "name": name,
            "status": status,
            "created_at": "2024-11-01",
            "progress_pct": pct,
        }
        for i, (name, status, pct) in enumerate([
            ("Post-Stroke UE Rehab", "active", 65),
            ("Balance Training", "active", 30),
            ("Gait Retraining", "on_hold", 0),
        ])
    ]


def update_protocol(
    session: Session,
    protocol_id: str,
    updates: dict[str, Any],
) -> dict[str, Any]:
    """Update an existing protocol."""
    # In production: query, modify, commit
    return {
        "protocol_id": protocol_id,
        "updated": True,
        "fields_updated": list(updates.keys()),
        "updated_at": _iso_now(),
        "message": "Protocol updated successfully (scaffold - implement persistence in production)",
    }


def log_session(
    session: Session,
    patient_id: str,
    session_data: dict[str, Any],
) -> dict[str, Any]:
    """Log a rehabilitation session."""
    session_id = f"rs-{uuid.uuid4().hex[:12]}"
    now = _iso_now()

    exercises_completed = session_data.get("exercises_completed", [])
    total_prescribed = session_data.get("total_exercises_prescribed", len(exercises_completed))
    adherence_pct = round(len(exercises_completed) / total_prescribed * 100, 1) if total_prescribed > 0 else 0

    logged = {
        "session_id": session_id,
        "patient_id": patient_id,
        "session_date": session_data.get("session_date", now),
        "duration_min": session_data.get("duration_min", 0),
        "exercises_completed": exercises_completed,
        "total_exercises_prescribed": total_prescribed,
        "adherence_pct": adherence_pct,
        "pain_score": session_data.get("pain_score"),  # 0-10
        "fatigue_score": session_data.get("fatigue_score"),  # 0-10
        "patient_difficulty_rating": session_data.get("patient_difficulty_rating"),  # easy/medium/hard
        "clinician_notes": session_data.get("clinician_notes", ""),
        "goals_addressed": session_data.get("goals_addressed", []),
        "next_session_plan": session_data.get("next_session_plan", ""),
        "logged_at": now,
    }

    return logged


def get_session_history(
    session: Session,
    patient_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Get session history for a patient."""
    # In production: query SessionLog table
    sessions = [
        {
            "session_id": f"rs-{i:04d}",
            "patient_id": patient_id,
            "session_date": f"2024-11-{20 + i:02d}",
            "duration_min": 45 + (i * 5) % 30,
            "exercises_count": 6 + i % 4,
            "adherence_pct": 80 + (i * 7) % 20,
            "pain_score": max(0, (i * 3) % 6),
            "fatigue_score": max(1, (i * 2) % 8),
        }
        for i in range(min(limit, 20))
    ]
    return sessions


def get_progress_summary(session: Session, patient_id: str) -> dict[str, Any]:
    """Get comprehensive progress summary for a patient."""
    # In production: aggregate from assessment_history, sessions, goals
    assessments = get_assessment_history(session, patient_id)
    sessions = get_session_history(session, patient_id, limit=30)

    # Compute trends
    fma_scores = [a["score_summary"].get("ue_score", 0) for a in assessments if a["assessment_type"] == "fugl_meyer"]
    bbs_scores = [a["score_summary"].get("total", 0) for a in assessments if a["assessment_type"] == "berg_balance"]
    tug_scores = [a["score_summary"].get("seconds", 0) for a in assessments if a["assessment_type"] == "timed_up_and_go"]

    session_dates = [s["session_date"] for s in sessions]
    adherence_over_time = [s["adherence_pct"] for s in sessions]

    avg_adherence = round(sum(adherence_over_time) / len(adherence_over_time), 1) if adherence_over_time else 0
    total_sessions = len(sessions)

    return {
        "patient_id": patient_id,
        "generated_at": _iso_now(),
        "assessment_summary": {
            "total_assessments": len(assessments),
            "latest_fugl_meyer_ue": fma_scores[-1] if fma_scores else None,
            "fma_trend": fma_scores,
            "latest_berg_balance": bbs_scores[-1] if bbs_scores else None,
            "bbs_trend": bbs_scores,
            "latest_tug_seconds": tug_scores[-1] if tug_scores else None,
            "tug_trend": tug_scores,
        },
        "session_summary": {
            "total_sessions": total_sessions,
            "average_adherence_pct": avg_adherence,
            "adherence_trend": adherence_over_time,
            "session_dates": session_dates,
        },
        "plateau_alert": _detect_plateau(fma_scores, threshold=3),
        "milestone_projections": _project_milestones(fma_scores, target=40),
    }


def _detect_plateau(scores: list[float | int], threshold: int = 3) -> dict[str, Any]:
    """Detect score plateau over last N assessments."""
    if len(scores) < threshold + 1:
        return {"is_plateau": False, "reason": "insufficient_data"}
    recent = scores[-threshold:]
    max_change = max(recent) - min(recent)
    is_plateau = max_change <= 2
    return {
        "is_plateau": is_plateau,
        "recent_scores": recent,
        "max_change": max_change,
        "threshold": threshold,
        "message": "Scores have plateaued - consider protocol modification" if is_plateau else "Progress continuing",
    }


def _project_milestones(scores: list[float | int], target: int) -> dict[str, Any]:
    """Simple linear projection to target score."""
    if len(scores) < 2:
        return {"projected_weeks": None, "confidence": "low"}
    rate = (scores[-1] - scores[0]) / len(scores)
    if rate <= 0:
        return {"projected_weeks": None, "confidence": "low", "reason": "no_improvement_detected"}
    remaining = target - scores[-1]
    weeks = round(remaining / rate, 1)
    return {
        "projected_weeks": max(0, weeks),
        "current_score": scores[-1],
        "target_score": target,
        "improvement_rate_per_assessment": round(rate, 2),
        "confidence": "medium" if len(scores) >= 4 else "low",
    }


def set_goals(
    session: Session,
    patient_id: str,
    goals: list[dict[str, Any]],
) -> dict[str, Any]:
    """Set or update rehabilitation goals for a patient."""
    now = _iso_now()
    created_goals = []
    for goal in goals:
        g = {
            "goal_id": f"rg-{uuid.uuid4().hex[:10]}",
            "patient_id": patient_id,
            "description": goal.get("description", ""),
            "goal_type": goal.get("goal_type", "functional"),  # functional, impairment, participation
            "target_value": goal.get("target_value"),
            "current_value": goal.get("current_value"),
            "target_date": goal.get("target_date"),
            "status": goal.get("status", "active"),
            "outcome_measure": goal.get("outcome_measure"),
            "created_at": now,
            "updated_at": now,
        }
        created_goals.append(g)

    return {
        "patient_id": patient_id,
        "goals_created": len(created_goals),
        "goals": created_goals,
    }


def get_goals(session: Session, patient_id: str) -> list[dict[str, Any]]:
    """Get rehabilitation goals for a patient."""
    return [
        {
            "goal_id": f"rg-{i:04d}",
            "patient_id": patient_id,
            "description": desc,
            "status": status,
            "target_date": target,
            "progress_pct": pct,
        }
        for i, (desc, status, target, pct) in enumerate([
            ("FMA-UE score > 40", "active", "2024-12-15", 70),
            ("Independent dressing", "active", "2024-12-30", 40),
            ("Community ambulation with stick", "active", "2025-01-15", 25),
            ("Berg Balance Scale > 45", "achieved", "2024-11-20", 100),
            ("TUG < 15 seconds", "on_hold", "2025-01-30", 10),
        ])
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")



# ──────────────────────────────────────────────────────────────────────────────
# Safety Disclaimer (required for all clinical decision-support modules)
# ──────────────────────────────────────────────────────────────────────────────

REHAB_SAFETY_DISCLAIMER = (
    "This rehabilitation platform provides clinical decision-support only. "
    "It does not replace clinical judgment, physical examination, or formal diagnosis. "
    "All exercise prescriptions and protocol selections must be reviewed and approved "
    "by a licensed physiotherapist or physician before implementation. "
    "Contraindications listed are not exhaustive. Monitor for adverse events during all sessions."
)


# ──────────────────────────────────────────────────────────────────────────────
# Extended Assessment Reference Data
# ──────────────────────────────────────────────────────────────────────────────

FUGL_MEYER_ITEM_DETAILS = {
    "upper_extremity": {
        "section_a": {
            "label": "Reflex Activity + Flexor Synergy",
            "items": [
                ("ue_motor_a_reflex", "Reflexes: biceps, triceps, finger flexors (0-2)"),
                ("ue_motor_a_flex_synergy_shoulder_retraction", "Shoulder retraction (0-2)"),
                ("ue_motor_a_flex_synergy_shoulder_elevation", "Shoulder elevation (0-2)"),
                ("ue_motor_a_flex_synergy_shoulder_abduction", "Shoulder abduction (0-2)"),
                ("ue_motor_a_flex_synergy_shoulder_ext_rotation", "Shoulder external rotation (0-2)"),
                ("ue_motor_a_flex_synergy_elbow_flexion", "Elbow flexion (0-2)"),
                ("ue_motor_a_flex_synergy_forearm_supination", "Forearm supination (0-2)"),
            ],
            "max": 14,
        },
        "section_b": {
            "label": "Extensor Synergy",
            "items": [
                ("ue_motor_b_ext_synergy_shoulder_adduction", "Shoulder adduction (0-2)"),
                ("ue_motor_b_ext_synergy_shoulder_int_rotation", "Shoulder internal rotation (0-2)"),
                ("ue_motor_b_ext_synergy_elbow_extension", "Elbow extension (0-2)"),
                ("ue_motor_b_ext_synergy_forearm_pronation", "Forearm pronation (0-2)"),
            ],
            "max": 8,
        },
        "section_c": {
            "label": "Movement Combining Synergies",
            "items": [
                ("ue_motor_c_mix_shoulder_ext_to_90", "Shoulder ext to 90 (0-2)"),
                ("ue_motor_c_mix_shoulder_abduction_to_90", "Shoulder abd to 90 (0-2)"),
                ("ue_motor_c_mix_shoulder_ext_abd_180", "Shoulder ext-abd 180 (0-2)"),
                ("ue_motor_c_mix_elbow_flexion_90", "Elbow flexion at 90 sup (0-2)"),
                ("ue_motor_c_mix_forearm_sup_pron_90", "Forearm sup-pronation at 90 (0-2)"),
            ],
            "max": 10,
        },
        "section_d": {
            "label": "Movement Out of Synergy / Normal",
            "items": [
                ("ue_motor_d_norm_shoulder_abduction", "Shoulder abduction (0-2)"),
                ("ue_motor_d_norm_shoulder_flexion_180", "Shoulder flexion 180 (0-2)"),
                ("ue_motor_d_norm_prone_shoulder_ext", "Shoulder extension prone (0-2)"),
                ("ue_motor_d_norm_prone_elbow_flexion", "Elbow flexion prone (0-2)"),
                ("ue_motor_d_norm_prone_elbow_extension", "Elbow extension prone (0-2)"),
                ("ue_motor_d_norm_supine_shoulder_int_rotation", "Shoulder int rotation supine (0-2)"),
                ("ue_motor_d_norm_palm_to_spine", "Palm to spine (0-2)"),
                ("ue_motor_d_norm_palm_to_forehead", "Palm to forehead (0-2)"),
                ("ue_motor_d_norm_pronation", "Pronation (0-2)"),
                ("ue_motor_d_norm_supination", "Supination (0-2)"),
                ("ue_motor_d_norm_wrist_flexion", "Wrist flexion (0-2)"),
                ("ue_motor_d_norm_wrist_extension", "Wrist extension (0-2)"),
                ("ue_motor_d_norm_finger_mass_flexion", "Finger mass flexion (0-2)"),
                ("ue_motor_d_norm_finger_mass_extension", "Finger mass extension (0-2)"),
                ("ue_motor_d_norm_finger_hookup", "Finger hook (0-2)"),
                ("ue_motor_d_norm_thumb_adduction", "Thumb adduction (0-2)"),
                ("ue_motor_d_norm_thumb_opposition", "Thumb opposition (0-2)"),
                ("ue_motor_d_norm_thumb_flexion", "Thumb flexion (0-2)"),
                ("ue_motor_d_norm_thumb_extension", "Thumb extension (0-2)"),
            ],
            "max": 38,
        },
    },
    "lower_extremity": {
        "section_a": {
            "label": "Reflex + Flexor Synergy",
            "items": [
                ("le_motor_reflex", "Reflexes: patellar, Achilles (0-2)"),
                ("le_motor_a_flex_hip_flexion", "Hip flexion (0-2)"),
                ("le_motor_a_flex_knee_flexion", "Knee flexion (0-2)"),
                ("le_motor_a_flex_ankle_dorsiflexion", "Ankle dorsiflexion (0-2)"),
            ],
            "max": 8,
        },
        "section_b": {
            "label": "Extensor Synergy",
            "items": [
                ("le_motor_b_ext_hip_extension", "Hip extension (0-2)"),
                ("le_motor_b_ext_hip_adduction", "Hip adduction (0-2)"),
                ("le_motor_b_ext_knee_extension", "Knee extension (0-2)"),
                ("le_motor_b_ext_ankle_plantarflexion", "Ankle plantarflexion (0-2)"),
            ],
            "max": 8,
        },
        "section_c": {
            "label": "Movement Combining Synergies",
            "items": [
                ("le_motor_c_mix_hip_ext_to_15", "Hip extension to 15 (0-2)"),
                ("le_motor_c_mix_knee_flexion_90", "Knee flexion 90 standing (0-2)"),
                ("le_motor_c_mix_ankle_dorsiflexion_sitting", "Ankle dorsiflexion sitting (0-2)"),
            ],
            "max": 6,
        },
        "section_d": {
            "label": "Movement Out of Synergy",
            "items": [
                ("le_motor_d_norm_hip_flexion_supine", "Hip flexion supine (0-2)"),
                ("le_motor_d_norm_hip_extension_prone", "Hip extension prone (0-2)"),
                ("le_motor_d_norm_hip_abduction", "Hip abduction (0-2)"),
                ("le_motor_d_norm_knee_flexion_end", "Knee flexion at 90 (0-2)"),
                ("le_motor_d_norm_knee_extension", "Knee extension (0-2)"),
                ("le_motor_d_norm_ankle_dorsiflexion", "Ankle dorsiflexion standing (0-2)"),
            ],
            "max": 12,
        },
    },
}

BERG_BALANCE_ITEM_DETAILS = [
    ("sitting_unsupported", "Sitting to standing"),
    ("standing_to_sitting", "Standing to sitting"),
    ("transfers", "Transfers"),
    ("standing_unsupported", "Standing unsupported"),
    ("standing_eyes_closed", "Standing with eyes closed"),
    ("standing_feet_together", "Standing with feet together"),
    ("tandem_standing", "Tandem standing"),
    ("standing_on_one_leg", "Standing on one leg"),
    ("turning_trunk", "Turning trunk"),
    ("turning_360", "Turning 360 degrees"),
    ("stool_stepping", "Stool stepping"),
    ("standing_reaching_forward", "Reaching forward while standing"),
    ("retrieving_from_floor", "Retrieving object from floor"),
    ("sitting_to_standing", "Sitting unsupported"),
]

MODIFIED_ASHWORTH_MUSCLES = [
    "elbow_flexors", "elbow_extensors", "wrist_flexors", "wrist_extensors",
    "finger_flexors", "hip_adductors", "hip_flexors", "knee_extensors",
    "knee_flexors", "ankle_plantarflexors", "ankle_dorsiflexors",
]

MMT_MUSCLE_GROUPS = [
    "shoulder_flexion", "shoulder_abduction", "shoulder_external_rotation",
    "elbow_flexion", "elbow_extension", "wrist_flexion", "wrist_extension",
    "finger_flexion", "finger_extension", "thumb_opposition",
    "hip_flexion", "hip_extension", "hip_abduction", "hip_adduction",
    "knee_flexion", "knee_extension", "ankle_dorsiflexion", "ankle_plantarflexion",
]

ROM_JOINTS = {
    "shoulder": ["flexion", "extension", "abduction", "internal_rotation", "external_rotation"],
    "elbow": ["flexion", "extension", "pronation", "supination"],
    "wrist": ["flexion", "extension", "ulnar_deviation", "radial_deviation"],
    "hand": ["finger_flexion", "finger_extension", "thumb_abduction", "thumb_opposition"],
    "hip": ["flexion", "extension", "abduction", "adduction", "internal_rotation", "external_rotation"],
    "knee": ["flexion", "extension"],
    "ankle": ["dorsiflexion", "plantarflexion", "inversion", "eversion"],
    "cervical_spine": ["flexion", "extension", "rotation", "lateral_flexion"],
    "lumbar_spine": ["flexion", "extension", "rotation", "lateral_flexion"],
}


# ──────────────────────────────────────────────────────────────────────────────
# Evidence Grading for Exercise Prescriptions
# ──────────────────────────────────────────────────────────────────────────────

def get_exercise_evidence_summary(exercise_id: str) -> dict[str, Any]:
    """Get evidence summary for a specific exercise."""
    exercise = next((e for e in EXERCISE_LIBRARY if e["id"] == exercise_id), None)
    if not exercise:
        return {"error": f"Exercise {exercise_id} not found"}

    grade = exercise.get("evidence_grade", "E")
    grade_labels = {
        "A": "Strong evidence: multiple RCTs or systematic reviews",
        "B": "Moderate evidence: limited RCTs or cohort studies",
        "C": "Limited evidence: expert opinion, small studies",
        "D": "Very limited evidence: case series only",
        "E": "No direct evidence: theoretical rationale only",
    }

    return {
        "exercise_id": exercise_id,
        "name": exercise["name"],
        "evidence_grade": grade,
        "evidence_description": grade_labels.get(grade, ""),
        "contraindications": exercise.get("contraindications", []),
        "references": exercise.get("references", []),
        "safety_disclaimer": REHAB_SAFETY_DISCLAIMER,
    }


def get_protocol_evidence_summary(template_id: str) -> dict[str, Any]:
    """Get evidence summary for a protocol template."""
    template = next((t for t in PROTOCOL_TEMPLATES if t["id"] == template_id), None)
    if not template:
        return {"error": f"Template {template_id} not found"}

    return {
        "template_id": template_id,
        "name": template["name"],
        "evidence_grade": template.get("evidence_grade", "C"),
        "outcome_measures": template.get("outcome_measures", []),
        "references": template.get("references", []),
        "contraindications": template.get("contraindications", []),
        "safety_disclaimer": REHAB_SAFETY_DISCLAIMER,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Session Analytics
# ──────────────────────────────────────────────────────────────────────────────

def calculate_session_analytics(sessions: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate aggregate analytics from session logs."""
    if not sessions:
        return {"error": "No sessions provided"}

    adherence_values = [s.get("adherence_pct", 0) for s in sessions]
    pain_values = [s.get("pain_score") for s in sessions if s.get("pain_score") is not None]
    fatigue_values = [s.get("fatigue_score") for s in sessions if s.get("fatigue_score") is not None]
    durations = [s.get("duration_min", 0) for s in sessions]

    import statistics
    analytics = {
        "total_sessions": len(sessions),
        "total_duration_hours": round(sum(durations) / 60, 1),
        "adherence": {
            "mean": round(statistics.mean(adherence_values), 1) if adherence_values else 0,
            "median": round(statistics.median(adherence_values), 1) if adherence_values else 0,
            "min": min(adherence_values) if adherence_values else 0,
            "max": max(adherence_values) if adherence_values else 0,
            "trend": "improving" if len(adherence_values) >= 3 and adherence_values[-1] > adherence_values[0] else "stable_or_declining",
        },
        "pain": {
            "mean": round(statistics.mean(pain_values), 1) if pain_values else None,
            "max": max(pain_values) if pain_values else None,
            "any_severe": any(p >= 7 for p in pain_values) if pain_values else False,
        },
        "fatigue": {
            "mean": round(statistics.mean(fatigue_values), 1) if fatigue_values else None,
            "max": max(fatigue_values) if fatigue_values else None,
        },
        "frequency_per_week": _estimate_weekly_frequency(sessions),
    }
    return analytics


def _estimate_weekly_frequency(sessions: list[dict[str, Any]]) -> float:
    """Estimate sessions per week from session dates."""
    if len(sessions) < 2:
        return 0.0
    from datetime import datetime as _dt
    try:
        dates = sorted([_dt.fromisoformat(s["session_date"].replace("Z", "+00:00")) for s in sessions if s.get("session_date")])
        if len(dates) < 2:
            return 0.0
        span_days = max((dates[-1] - dates[0]).days, 1)
        return round(len(dates) / (span_days / 7), 1)
    except Exception:
        return 0.0


# ──────────────────────────────────────────────────────────────────────────────
# Adherence & Safety Alerts
# ──────────────────────────────────────────────────────────────────────────────

def check_safety_alerts(
    sessions: list[dict[str, Any]],
    assessments: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Generate safety alerts from session and assessment data."""
    alerts = []
    if not sessions:
        return alerts

    # Pain alert
    recent_pain = [s.get("pain_score") for s in sessions[-3:] if s.get("pain_score") is not None]
    if recent_pain and max(recent_pain) >= 7:
        alerts.append({
            "level": "critical",
            "type": "pain_severe",
            "message": f"Recent session(s) report severe pain (max {max(recent_pain)}/10). Review exercise prescription.",
            "action_required": "Clinician review before next session",
        })
    elif recent_pain and statistics.mean(recent_pain) >= 4:
        alerts.append({
            "level": "warning",
            "type": "pain_elevated",
            "message": f"Elevated pain trend (mean {round(statistics.mean(recent_pain), 1)}/10). Consider exercise modification.",
            "action_required": "Monitor and adjust",
        })

    # Adherence alert
    recent_adherence = [s.get("adherence_pct", 100) for s in sessions[-5:]]
    if recent_adherence and statistics.mean(recent_adherence) < 60:
        alerts.append({
            "level": "warning",
            "type": "low_adherence",
            "message": f"Low adherence trend (mean {round(statistics.mean(recent_adherence), 1)}%). Explore barriers.",
            "action_required": "Patient interview",
        })

    # Fatigue alert
    recent_fatigue = [s.get("fatigue_score") for s in sessions[-3:] if s.get("fatigue_score") is not None]
    if recent_fatigue and max(recent_fatigue) >= 8:
        alerts.append({
            "level": "warning",
            "type": "fatigue_severe",
            "message": f"Severe fatigue reported (max {max(recent_fatigue)}/10). Consider reduced intensity.",
            "action_required": "Adjust session parameters",
        })

    return alerts


import statistics  # noqa: E402, F811 — ensure available for check_safety_alerts

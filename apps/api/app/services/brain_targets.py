"""Brain target registry — deterministic resolver for the Brain Map Planner.

Maps canonical clinical targets (DLPFC-L, mPFC, M1-L, etc.) to anchor 10-20
electrodes, MNI coordinates, Brodmann areas, indications, and evidence grades.
This is the source of truth the Brain Map Planner uses; no AI inference, no
fabrication. The registry mirrors `BMP_REGION_SITES`/`BMP_MNI`/`BMP_BA` in
`apps/web/src/pages-clinical-tools.js` so frontend + backend agree on every
target's anchor electrode.

Exposed at `/api/v1/brain-targets` and `/api/v1/brain-targets/{target_id}`.
"""

from __future__ import annotations

from typing import Optional

# ── Static registry ──────────────────────────────────────────────────────────
# Each entry is the canonical clinical target. Keys mirror the planner UI's
# `BMP_REGION_SITES` keys exactly so the closing-the-loop UI integration stays
# deterministic. Coordinates are MNI from standard 10-20 atlases; Brodmann
# areas are the most-cited match for that anchor electrode.
#
# `evidence_grade` is the strongest grade across the indications listed (A > B >
# C > D). `indications` is the plain-English condition list a clinician would
# expect for this target.
#
# Adding a new target REQUIRES:
#   * primary_anchor — a 10-20 site with an MNI coordinate
#   * indications + evidence_grade — anchor it to a real clinical use case
#   * literature note — a short, citable rationale
#
# Do NOT add targets that lack a deterministic anchor electrode.
_REGISTRY: list[dict] = [
    {
        "id": "DLPFC-L",
        "label": "Dorsolateral Prefrontal Cortex (Left)",
        "primary_anchor": "F3",
        "reference_anchor": "Fp2",
        "alt_anchors": ["AF3", "F1", "FC1"],
        "mni": [-46, 36, 20],
        "brodmann_area": "BA9/46",
        "indications": ["MDD", "TRD", "PTSD", "ADHD", "Anxiety", "Bipolar Depression"],
        "evidence_grade": "A",
        "modalities": ["TMS/rTMS", "iTBS", "tDCS", "Deep TMS", "tACS"],
        "literature": "FDA-cleared rTMS target for MDD (10 Hz) and iTBS-SAINT. Strongest A-grade evidence in neuromodulation.",
    },
    {
        "id": "DLPFC-R",
        "label": "Dorsolateral Prefrontal Cortex (Right)",
        "primary_anchor": "F4",
        "reference_anchor": "Fp1",
        "alt_anchors": ["AF4", "F2", "FC2"],
        "mni": [46, 36, 20],
        "brodmann_area": "BA9/46",
        "indications": ["Anxiety", "Depression (inhibitory LF)", "OCD", "Addiction"],
        "evidence_grade": "B",
        "modalities": ["TMS/rTMS", "iTBS", "cTBS", "tDCS"],
        "literature": "Inhibitory LF-rTMS R-DLPFC studied for anxiety, addiction, and treatment-resistant depression alternates.",
    },
    {
        "id": "DLPFC-B",
        "label": "Dorsolateral Prefrontal Cortex (Bilateral)",
        "primary_anchor": "F3",
        "reference_anchor": "F4",
        "alt_anchors": ["Fz"],
        "mni": [-46, 36, 20],
        "brodmann_area": "BA9/46",
        "indications": ["MDD (severe)", "TRD"],
        "evidence_grade": "B",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Bilateral DLPFC stimulation studied as an alternative for non-responders to unilateral L-DLPFC.",
    },
    {
        "id": "M1-L",
        "label": "Primary Motor Cortex (Left)",
        "primary_anchor": "C3",
        "reference_anchor": "C4",
        "alt_anchors": ["FC3", "CP3"],
        "mni": [-52, -2, 50],
        "brodmann_area": "BA4",
        "indications": ["Chronic Pain", "Fibromyalgia", "Stroke Rehabilitation", "Parkinson Disease"],
        "evidence_grade": "A",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "M1 anodal tDCS and HF-rTMS A-grade for neuropathic pain (Lefaucheur 2017).",
    },
    {
        "id": "M1-R",
        "label": "Primary Motor Cortex (Right)",
        "primary_anchor": "C4",
        "reference_anchor": "C3",
        "alt_anchors": ["FC4", "CP4"],
        "mni": [52, -2, 50],
        "brodmann_area": "BA4",
        "indications": ["Right-side motor recovery", "Stroke (left hemisphere lesion)", "Chronic Pain"],
        "evidence_grade": "B",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Mirror M1 stimulation for cross-hemispheric motor rehabilitation.",
    },
    {
        "id": "M1-B",
        "label": "Primary Motor Cortex (Bilateral)",
        "primary_anchor": "C3",
        "reference_anchor": "Cz",
        "alt_anchors": ["C4", "FC3", "FC4"],
        "mni": [-52, -2, 50],
        "brodmann_area": "BA4",
        "indications": ["Bilateral motor rehab", "Chronic Pain"],
        "evidence_grade": "B",
        "modalities": ["tDCS", "TMS/rTMS"],
        "literature": "Bilateral M1 montage used in stroke rehab and bilateral chronic pain cases.",
    },
    {
        "id": "SMA",
        "label": "Supplementary Motor Area",
        "primary_anchor": "FCz",
        "reference_anchor": "Fz",
        "alt_anchors": ["FC1", "FC2", "Cz"],
        "mni": [0, 16, 62],
        "brodmann_area": "BA6",
        "indications": ["OCD (rituals)", "Tourette Syndrome", "Motor planning disorders"],
        "evidence_grade": "B",
        "modalities": ["TMS/rTMS", "Deep TMS"],
        "literature": "Pre-SMA cTBS shows symptom reduction in OCD; H7-coil deep TMS FDA-cleared at this midline target for OCD.",
    },
    {
        "id": "mPFC",
        "label": "Medial Prefrontal Cortex",
        "primary_anchor": "Fz",
        "reference_anchor": "Pz",
        "alt_anchors": ["AFz", "FCz"],
        "mni": [0, 24, 58],
        "brodmann_area": "BA8/32",
        "indications": ["Depression (midline)", "Self-referential rumination"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "tDCS", "Neurofeedback"],
        "literature": "Midline mPFC explored as DMN modulation target; emerging evidence.",
    },
    {
        "id": "DMPFC",
        "label": "Dorsomedial Prefrontal Cortex",
        "primary_anchor": "Fz",
        "reference_anchor": "Oz",
        "alt_anchors": ["FCz", "AF4"],
        "mni": [0, 30, 50],
        "brodmann_area": "BA8/9",
        "indications": ["OCD", "Depression"],
        "evidence_grade": "B",
        "modalities": ["Deep TMS", "TMS/rTMS"],
        "literature": "Brainsway H7-coil DMPFC FDA-cleared for OCD; DMPFC also studied in MDD non-responders.",
    },
    {
        "id": "VMPFC",
        "label": "Ventromedial Prefrontal Cortex",
        "primary_anchor": "Fpz",
        "reference_anchor": "Pz",
        "alt_anchors": ["Fp1", "Fp2"],
        "mni": [0, 50, -8],
        "brodmann_area": "BA10/11",
        "indications": ["PTSD", "Anxiety", "Fear extinction"],
        "evidence_grade": "C",
        "modalities": ["tDCS", "LIFU"],
        "literature": "VMPFC DBS targeted for TRD; non-invasive tDCS preliminary for fear extinction.",
    },
    {
        "id": "OFC",
        "label": "Orbitofrontal Cortex",
        "primary_anchor": "Fp1",
        "reference_anchor": "Pz",
        "alt_anchors": ["Fp2", "AF3", "AF4"],
        "mni": [0, 50, -16],
        "brodmann_area": "BA10/11",
        "indications": ["Addiction", "OCD", "Compulsive behaviour"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Lateral OFC implicated in cue-reactivity for addiction; deep TMS variants in trial.",
    },
    {
        "id": "ACC",
        "label": "Anterior Cingulate Cortex",
        "primary_anchor": "FCz",
        "reference_anchor": "Pz",
        "alt_anchors": ["Cz", "Fz"],
        "mni": [0, 22, 30],
        "brodmann_area": "BA24/32",
        "indications": ["Pain affect", "Depression", "Conflict-monitoring deficits"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "Deep TMS"],
        "literature": "Subgenual ACC = Cg25 DBS target for TRD; non-invasive deep TMS reaches dorsal ACC.",
    },
    {
        "id": "IFG-L",
        "label": "Inferior Frontal Gyrus (Left, Broca)",
        "primary_anchor": "F7",
        "reference_anchor": "F8",
        "alt_anchors": ["FT7", "FC3"],
        "mni": [-52, 22, 8],
        "brodmann_area": "BA45/47",
        "indications": ["Aphasia (post-stroke)", "Speech production"],
        "evidence_grade": "B",
        "modalities": ["tDCS", "TMS/rTMS"],
        "literature": "Left IFG tDCS/rTMS for post-stroke aphasia rehab; meta-analyses show modest improvement.",
    },
    {
        "id": "IFG-R",
        "label": "Inferior Frontal Gyrus (Right)",
        "primary_anchor": "F8",
        "reference_anchor": "F7",
        "alt_anchors": ["FT8", "FC4"],
        "mni": [52, 22, 8],
        "brodmann_area": "BA45/47",
        "indications": ["Response inhibition", "ADHD", "Disinhibition"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Right IFG critical for inhibitory control; LF-rTMS used in ADHD research.",
    },
    {
        "id": "PPC-L",
        "label": "Posterior Parietal Cortex (Left)",
        "primary_anchor": "P3",
        "reference_anchor": "F4",
        "alt_anchors": ["CP3", "P5"],
        "mni": [-46, -58, 46],
        "brodmann_area": "BA40",
        "indications": ["Working memory deficits", "Left neglect"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Left PPC explored for working-memory enhancement in cognitive ageing and post-stroke deficits.",
    },
    {
        "id": "PPC-R",
        "label": "Posterior Parietal Cortex (Right)",
        "primary_anchor": "P4",
        "reference_anchor": "F3",
        "alt_anchors": ["CP4", "P6"],
        "mni": [46, -58, 46],
        "brodmann_area": "BA40",
        "indications": ["Spatial neglect (post-stroke)"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Right PPC stimulation for hemispatial neglect rehab in stroke patients.",
    },
    {
        "id": "TEMPORAL-L",
        "label": "Superior Temporal Gyrus (Left)",
        "primary_anchor": "T7",
        "reference_anchor": "T8",
        "alt_anchors": ["TP7", "FT7"],
        "mni": [-72, -24, 4],
        "brodmann_area": "BA21/22",
        "indications": ["Auditory hallucinations", "Schizophrenia", "Tinnitus"],
        "evidence_grade": "B",
        "modalities": ["TMS/rTMS"],
        "literature": "LF-rTMS over left TPJ reduces auditory verbal hallucinations in schizophrenia (Slotema 2014 meta).",
    },
    {
        "id": "TEMPORAL-R",
        "label": "Superior Temporal Gyrus (Right)",
        "primary_anchor": "T8",
        "reference_anchor": "T7",
        "alt_anchors": ["TP8", "FT8"],
        "mni": [72, -24, 4],
        "brodmann_area": "BA21/22",
        "indications": ["Right-side tinnitus", "Right temporal disorders"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS"],
        "literature": "Right temporal cortex used in tinnitus protocols; mixed evidence.",
    },
    {
        "id": "S1",
        "label": "Primary Somatosensory Cortex",
        "primary_anchor": "C3",
        "reference_anchor": "C4",
        "alt_anchors": ["CP3", "FC3"],
        "mni": [-46, -28, 50],
        "brodmann_area": "BA1/2/3",
        "indications": ["Chronic pain", "Sensory processing"],
        "evidence_grade": "C",
        "modalities": ["tDCS", "TMS/rTMS"],
        "literature": "S1 anodal tDCS studied for chronic pain alongside M1; modest evidence.",
    },
    {
        "id": "V1",
        "label": "Primary Visual Cortex",
        "primary_anchor": "Oz",
        "reference_anchor": "Cz",
        "alt_anchors": ["O1", "O2"],
        "mni": [0, -100, 12],
        "brodmann_area": "BA17",
        "indications": ["Migraine prophylaxis", "Cortical excitability research"],
        "evidence_grade": "C",
        "modalities": ["TMS/rTMS", "tDCS"],
        "literature": "Cathodal tDCS over V1 explored for migraine; visual cortex TMS used in research paradigms.",
    },
    {
        "id": "CEREBELLUM",
        "label": "Cerebellum",
        "primary_anchor": "Oz",
        "reference_anchor": "Cz",
        "alt_anchors": ["O1", "O2", "POz"],
        "mni": [0, -60, -30],
        "brodmann_area": "—",
        "indications": ["Ataxia", "Motor coordination", "Cognitive cerebellum"],
        "evidence_grade": "C",
        "modalities": ["tDCS", "TMS/rTMS"],
        "literature": "Cerebellar tDCS for ataxia and motor learning; emerging evidence base.",
    },
    {
        "id": "Cz",
        "label": "Vertex (Cz)",
        "primary_anchor": "Cz",
        "reference_anchor": "Fz",
        "alt_anchors": ["FC1", "FC2", "CP1", "CP2"],
        "mni": [0, -2, 62],
        "brodmann_area": "BA4",
        "indications": ["Sensorimotor neurofeedback (SMR)", "ADHD"],
        "evidence_grade": "C",
        "modalities": ["Neurofeedback", "tDCS"],
        "literature": "Cz SMR neurofeedback for ADHD; meta-analyses show small-to-moderate effects.",
    },
    {
        "id": "Pz",
        "label": "Parietal Midline (Pz)",
        "primary_anchor": "Pz",
        "reference_anchor": "Fz",
        "alt_anchors": ["CPz", "POz"],
        "mni": [0, -62, 56],
        "brodmann_area": "BA7",
        "indications": ["Anxiety (alpha-theta NFB)", "Memory"],
        "evidence_grade": "C",
        "modalities": ["Neurofeedback", "tDCS"],
        "literature": "Alpha-theta neurofeedback at Pz used in anxiety, PTSD adjunct; clinical evidence variable.",
    },
    {
        "id": "Fz",
        "label": "Frontal Midline (Fz)",
        "primary_anchor": "Fz",
        "reference_anchor": "Pz",
        "alt_anchors": ["FCz", "AFz"],
        "mni": [0, 24, 58],
        "brodmann_area": "BA8/32",
        "indications": ["ADHD (frontal NFB)", "Cognition NFB"],
        "evidence_grade": "C",
        "modalities": ["Neurofeedback", "tDCS"],
        "literature": "Fz neurofeedback (theta/beta ratio) studied in ADHD; gamma protocols emerging in cognitive research.",
    },
]


def _by_id() -> dict:
    return {entry["id"]: entry for entry in _REGISTRY}


def list_brain_targets() -> dict:
    """Return the full target registry (FastAPI auto-encodes the dict)."""
    return {"items": list(_REGISTRY), "total": len(_REGISTRY)}


def get_brain_target(target_id: str) -> Optional[dict]:
    """Resolve one target id (e.g. ``DLPFC-L``) → registry entry, or None."""
    return _by_id().get(target_id)


def resolve_target_anchor(target_id: str) -> Optional[str]:
    """Map a target id to its primary 10-20 anchor electrode (deterministic)."""
    entry = get_brain_target(target_id)
    return entry["primary_anchor"] if entry else None

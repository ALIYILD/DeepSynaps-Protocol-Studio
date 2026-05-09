"""Large-scale brain network profiles derived from QEEG courseware (Neuroanatomy Pt 2).

Covers the Default Mode Network (DMN), Salience Network, and Executive
Control Network — their anatomy, functional roles, clinical correlates,
and neurofeedback training implications. Advisory only.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class NetworkProfile:
    """A single large-scale brain network with anatomy and clinical correlates."""

    network_name: str
    full_name: str
    key_regions: tuple[str, ...]
    hub_regions: tuple[str, ...]
    function_summary: str
    clinical_correlates: str
    neurofeedback_targets: tuple[str, ...]
    eeg_signature: str


_ATLAS: tuple[NetworkProfile, ...] = (
    NetworkProfile(
        network_name="dmn",
        full_name="Default Mode Network (DMN)",
        key_regions=(
            "Posterior Cingulate Cortex (PCC)",
            "Precuneus",
            "Ventromedial Prefrontal Cortex (VMPFC)",
            "Medial Temporal Lobe",
            "Angular Gyrus",
        ),
        hub_regions=("Posterior Cingulate Cortex (PCC)", "Precuneus"),
        function_summary=(
            "Utilized when the brain is not performing a specific task — resting, visually fixated, or eyes closed. "
            "Represents a 'task-negative' or idle mode. Self-referential properties include evaluating information "
            "from the body and world, understanding desires and beliefs of others, remembering the past, and planning the future."
        ),
        clinical_correlates=(
            "ADHD: Less-mature connections between DMN and task-positive networks; kids with ADHD display lagged "
            "connection development, contributing to distractibility. "
            "Depression: Ongoing toggling from rest to task state persists even when trying to maintain task-positive state; "
            "seen as decreased attention and apathy. Hyperconnectivity between prefrontal cortex and PCC. "
            "PTSD: Hypoactivation of DMN leads to re-experiencing memories/flashbacks and dissociation. "
            "Psychosis: Decrease in internal structure and intra-communication; networks bleed into each other, "
            "resulting in delusions, hallucinations, and inability to distinguish internal thoughts from external environment."
        ),
        neurofeedback_targets=(
            "F3 or Fz — prefrontal cortex training can indirectly target DMN",
            "Fpz — anterior prefrontal targeting",
            "P3 — posterior cingulate/precuneus region",
            "Two-channel sum training (Fpz, Fz, F3, P3, T3) to increase DMN connectivity",
            "Alpha-Theta training for posterior alpha rhythm normalization",
        ),
        eeg_signature=(
            "During rest: dominant alpha and theta over posterior regions. "
            "Task engagement: suppression of posterior alpha (task-negative deactivation). "
            "DMN dysfunction: abnormal alpha coherence between PCC and prefrontal sites; "
            "failure to suppress DMN during task states."
        ),
    ),
    NetworkProfile(
        network_name="salience",
        full_name="Salience Network",
        key_regions=(
            "Anterior Cingulate Cortex (ACC)",
            "Anterior Insula",
            "Amygdala",
            "Ventral Striatum",
        ),
        hub_regions=("Anterior Cingulate Cortex (ACC)", "Anterior Insula"),
        function_summary=(
            "Detects internal and external stimuli and directs attention internally or externally. "
            "Regulates changes between the DMN (rest) and Executive Control Network (task). "
            "Contains the Dorsal Attention Network (DAN) which is associated with controlled, effortful processing."
        ),
        clinical_correlates=(
            "PTSD: Hyperactivation of Salience Network leads to hypervigilance and threat detection. "
            "Anxiety: High connectivity to ACC correlated with increased stressor-induced anticipatory anxiety. "
            "TBI: Salience network integrity predicts default mode network function after injury. "
            "Depression: Altered salience-DMN toggling contributes to rumination and emotional dysregulation."
        ),
        neurofeedback_targets=(
            "Fz/Cz — anterior cingulate training for salience regulation",
            "F3/F4 — prefrontal asymmetry training to modulate threat detection",
            "SMR (12-15 Hz) at C3/C4 to enhance calm, regulated attention",
        ),
        eeg_signature=(
            "Elevated beta (19-25 Hz) over anterior cingulate (Fz/Cz) during anxiety states. "
            "Reduced frontal alpha asymmetry. High theta/beta ratio at frontocentral sites. "
            "Excessive frontal gamma during threat processing."
        ),
    ),
    NetworkProfile(
        network_name="executive",
        full_name="Executive Control Network (ECN / Central Executive Network)",
        key_regions=(
            "Dorsolateral Prefrontal Cortex (DLPFC)",
            "Posterior Parietal Cortex",
            "Frontal Eye Fields",
        ),
        hub_regions=("Dorsolateral Prefrontal Cortex (DLPFC)", "Posterior Parietal Cortex"),
        function_summary=(
            "Execution of tasks including recognizing patterns, working memory, mental flexibility, "
            "rapid visual processing, and focused attention. Represents the 'task-positive' state. "
            "Actively engaged during goal-directed behavior and cognitive control."
        ),
        clinical_correlates=(
            "ADHD: Reduced activation and connectivity within the ECN during sustained attention tasks. "
            "Depression: Weakened DLPFC-parietal connections reduce cognitive control over negative thoughts. "
            "Schizophrenia: Disrupted ECN-DMN anti-correlation; failure to activate task-positive network during demands. "
            "Healthy cognition requires fluid toggling between ECN (task) and DMN (rest) states."
        ),
        neurofeedback_targets=(
            "F3/F4 — DLPFC training for working memory and cognitive control",
            "P3/P4 — parietal training for attention networks",
            "Beta enhancement (15-20 Hz) at Fz for sustained attention",
            "Z-score training at F3, F4, P3, P4 for global executive network optimization",
        ),
        eeg_signature=(
            "Task engagement: increased frontoparietal beta and gamma coherence. "
            "Rest: suppression of frontoparietal beta (anti-correlated with DMN). "
            "Dysfunction: reduced beta at DLPFC sites (F3/F4); poor frontoparietal phase synchronization."
        ),
    ),
    NetworkProfile(
        network_name="sensorimotor",
        full_name="Sensorimotor Network (SMN)",
        key_regions=(
            "Primary Motor Cortex (M1)",
            "Primary Somatosensory Cortex (S1)",
            "Supplementary Motor Area (SMA)",
            "Premotor Cortex",
        ),
        hub_regions=("Primary Motor Cortex (M1)", "Primary Somatosensory Cortex (S1)"),
        function_summary=(
            "Responsible for motor execution, sensory processing, and movement planning. "
            "The sensorimotor rhythm (SMR, 12-15 Hz) is the idling rhythm of this network. "
            "Active during movement preparation and execution; suppressed during actual movement."
        ),
        clinical_correlates=(
            "ADHD: Reduced SMR over sensorimotor cortex correlates with motor hyperactivity and poor inhibition. "
            "Epilepsy: SMR enhancement training has anti-epileptogenic effects. "
            "Sleep-onset insomnia: Low SMR amplitude correlates with difficulty initiating sleep. "
            "Autism: Atypical mu rhythm (8-13 Hz) suppression during action observation."
        ),
        neurofeedback_targets=(
            "C3/C4/Cz — SMR (12-15 Hz) enhancement training",
            "Mu rhythm (8-13 Hz) training for social cognition and action observation",
            "Beta/SMR ratio training for motor control",
        ),
        eeg_signature=(
            "SMR (12-15 Hz) dominant at C3/C4/Cz during quiet alertness. "
            "Mu rhythm (8-13 Hz) arch-like activity over sensorimotor cortex. "
            "Both attenuate with motor imagery, movement, or action observation."
        ),
    ),
)

_NAME_INDEX: dict[str, NetworkProfile] = {}
for _entry in _ATLAS:
    _NAME_INDEX[_entry.network_name] = _entry


class NetworkAtlas:
    """Read-only accessor for large-scale brain network profiles."""

    @staticmethod
    def lookup(network_name: str) -> NetworkProfile | None:
        return _NAME_INDEX.get(network_name)

    @staticmethod
    def all_profiles() -> tuple[NetworkProfile, ...]:
        return _ATLAS


def explain_network(network_name: str) -> dict[str, str] | None:
    """Return a dict describing *network_name*, or None if unknown."""
    profile = NetworkAtlas.lookup(network_name)
    if profile is None:
        return None
    return {
        "network_name": profile.network_name,
        "full_name": profile.full_name,
        "key_regions": "; ".join(profile.key_regions),
        "hub_regions": "; ".join(profile.hub_regions),
        "function_summary": profile.function_summary,
        "clinical_correlates": profile.clinical_correlates,
        "neurofeedback_targets": "; ".join(profile.neurofeedback_targets),
        "eeg_signature": profile.eeg_signature,
    }


def suggest_network_training(
    symptoms: Iterable[str],
) -> dict[str, list[dict[str, str]]]:
    """Suggest network-targeted neurofeedback protocols based on symptoms.

    Parameters
    ----------
    symptoms : iterable of str
        Free-text symptom descriptors (e.g. ``["distractibility", "rumination"]``).

    Returns
    -------
    dict
        Keys ``primary_targets``, ``supporting_targets``. Each is a list of
        dicts with keys ``network``, ``rationale``, ``placement``, ``protocol``.
    """
    text = " ".join(symptoms or []).lower()
    primary: list[dict[str, str]] = []
    supporting: list[dict[str, str]] = []

    if any(w in text for w in ("adhd", "distract", "inattentive", "hyperactive", "focus")):
        primary.append({
            "network": "DMN",
            "rationale": "Immature DMN-ECN toggling is characteristic of ADHD.",
            "placement": "F3, Fz, P3",
            "protocol": "SMR enhancement + theta/beta ratio reduction",
        })
        supporting.append({
            "network": "Sensorimotor",
            "rationale": "Reduced SMR correlates with motor hyperactivity.",
            "placement": "C3, C4",
            "protocol": "SMR (12-15 Hz) enhancement",
        })

    if any(w in text for w in ("depression", "rumination", "apathy", "sad", "anhedonia")):
        primary.append({
            "network": "DMN",
            "rationale": "Hyperconnectivity between PCC and prefrontal cortex in depression.",
            "placement": "F3, P3, Fpz",
            "protocol": "Alpha asymmetry training + DMN coherence modulation",
        })
        supporting.append({
            "network": "Salience",
            "rationale": "Altered salience-DMN toggling contributes to rumination.",
            "placement": "Fz, Cz",
            "protocol": "Beta inhibition over ACC",
        })

    if any(w in text for w in ("ptsd", "flashback", "hypervigilance", "trauma", "dissociation")):
        primary.append({
            "network": "Salience",
            "rationale": "Hyperactivation of salience network produces hypervigilance.",
            "placement": "Fz, Cz, F3, F4",
            "protocol": "Alpha-Theta training + SMR enhancement",
        })
        supporting.append({
            "network": "DMN",
            "rationale": "Hypoactivation of DMN leads to re-experiencing and dissociation.",
            "placement": "P3, Fpz",
            "protocol": "Alpha coherence training for PCC-vmPFC",
        })

    if any(w in text for w in ("psychosis", "hallucination", "delusion", "schizophrenia")):
        primary.append({
            "network": "DMN",
            "rationale": "Network bleeding and loss of internal structure in psychosis.",
            "placement": "F3, F4, P3, P4",
            "protocol": "Z-score coherence training to normalize network boundaries",
        })
        supporting.append({
            "network": "Executive",
            "rationale": "Disrupted ECN-DMN anti-correlation in schizophrenia.",
            "placement": "F3, F4, P3, P4",
            "protocol": "Beta enhancement at DLPFC + frontoparietal coherence",
        })

    if any(w in text for w in ("memory", "cognitive", "executive", "planning", "working memory")):
        primary.append({
            "network": "Executive",
            "rationale": "DLPFC and parietal regions underlie working memory and cognitive control.",
            "placement": "F3, F4, P3, P4",
            "protocol": "Beta enhancement (15-20 Hz) at DLPFC + frontoparietal coherence",
        })

    if not primary:
        primary.append({
            "network": "General",
            "rationale": "No specific network match for the provided symptoms.",
            "placement": "F3, F4, C3, C4, P3, P4, O1, O2",
            "protocol": "Comprehensive z-score assessment-based training",
        })

    return {"primary_targets": primary, "supporting_targets": supporting}

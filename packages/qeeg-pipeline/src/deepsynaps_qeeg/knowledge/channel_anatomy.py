"""10-20 channel → functional anatomy and Brodmann area mappings.

Links each scalp EEG electrode to:
- Underlying cortical regions (gyri / sulci)
- Approximate Brodmann areas
- Functional networks (DMN, DAN, FPN, SAL, VAN, LIM)
- Common artifact sources
- Typical clinical relevance

This is approximate — scalp EEG spatial resolution is coarse (~6 cm² minimum)
and individual anatomy varies. Use these mappings as probabilistic guidance,
not deterministic localization.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ChannelAnatomy:
    """Anatomical and functional mapping for a single 10-20 channel."""

    channel: str
    cortical_region: str
    brodmann_areas: tuple[str, ...]
    functional_networks: tuple[str, ...]
    common_artifacts: tuple[str, ...]
    clinical_relevance: str
    notes: str


# ── Channel anatomy atlas ─────────────────────────────────────────────────

_CHANNEL_ATLAS: tuple[ChannelAnatomy, ...] = (
    ChannelAnatomy(
        channel="Fp1",
        cortical_region="Left inferior frontal gyrus (pars orbitalis) / anterior prefrontal",
        brodmann_areas=("BA 10", "BA 11", "BA 47"),
        functional_networks=("Default Mode Network (anterior node)", "Frontoparietal Control Network"),
        common_artifacts=("eye_blink", "myogenic_frontal", "electrical_interference"),
        clinical_relevance="Executive function, emotional regulation, working memory. Focal dysfunction may reflect left frontal lobe lesions, depression (FAA), or ADHD (theta excess).",
        notes="End-of-chain in bipolar double banana; phase reversals may be incomplete.",
    ),
    ChannelAnatomy(
        channel="Fp2",
        cortical_region="Right inferior frontal gyrus (pars orbitalis) / anterior prefrontal",
        brodmann_areas=("BA 10", "BA 11", "BA 47"),
        functional_networks=("Default Mode Network (anterior node)", "Frontoparietal Control Network"),
        common_artifacts=("eye_blink", "myogenic_frontal", "electrical_interference"),
        clinical_relevance="Executive function, approach/avoidance behavior. Right frontal hypoactivation (less alpha = more activation) is linked to approach motivation and depression research.",
        notes="End-of-chain in bipolar double banana; phase reversals may be incomplete.",
    ),
    ChannelAnatomy(
        channel="F7",
        cortical_region="Left inferior frontal gyrus (pars triangularis / opercularis) — Broca's area vicinity",
        brodmann_areas=("BA 44", "BA 45", "BA 47"),
        functional_networks=("Ventral Attention Network", "Language Network"),
        common_artifacts=("lateral_eye_movement", "myogenic_frontal", "chewing"),
        clinical_relevance="Language production (Broca's area), speech motor planning. Focal slowing or epileptiform activity may affect speech output. Note: F7 overlies anterior temporal region, not purely frontal.",
        notes="Despite 'F' label, F7 is over the anterior temporal lobe. Discharges here may be temporal, not frontal.",
    ),
    ChannelAnatomy(
        channel="F8",
        cortical_region="Right inferior frontal gyrus — homologue of Broca's area",
        brodmann_areas=("BA 44", "BA 45", "BA 47"),
        functional_networks=("Ventral Attention Network", "Language Network (prosody)"),
        common_artifacts=("lateral_eye_movement", "myogenic_frontal", "chewing"),
        clinical_relevance="Emotional prosody, social cognition, response inhibition. Right frontal dysfunction can produce behavioral disinhibition.",
        notes="Despite 'F' label, F8 is over the anterior temporal lobe. Discharges here may be temporal, not frontal.",
    ),
    ChannelAnatomy(
        channel="F3",
        cortical_region="Left middle frontal gyrus / dorsolateral prefrontal cortex (DLPFC)",
        brodmann_areas=("BA 9", "BA 46"),
        functional_networks=("Frontoparietal Control Network", "Dorsal Attention Network"),
        common_artifacts=("myogenic_frontal", "eye_blink"),
        clinical_relevance="Working memory, cognitive control, executive function. Primary rTMS target for depression (10 Hz L-DLPFC). Focal slowing suggests left frontal structural lesion.",
        notes="Classic L-DLPFC neuromodulation target. Asymmetry with F4 is used in FAA depression biomarker.",
    ),
    ChannelAnatomy(
        channel="F4",
        cortical_region="Right middle frontal gyrus / dorsolateral prefrontal cortex (DLPFC)",
        brodmann_areas=("BA 9", "BA 46"),
        functional_networks=("Frontoparietal Control Network", "Dorsal Attention Network"),
        common_artifacts=("myogenic_frontal", "eye_blink"),
        clinical_relevance="Working memory, sustained attention, motor planning. Right DLPFC is a common TBS target for depression and anxiety.",
        notes="Compare with F3 for frontal alpha asymmetry (FAA) calculations.",
    ),
    ChannelAnatomy(
        channel="Fz",
        cortical_region="Superior frontal gyrus / supplementary motor area (SMA) / pre-SMA",
        brodmann_areas=("BA 6", "BA 8", "BA 9"),
        functional_networks=("Sensorimotor Network", "Frontoparietal Control Network"),
        common_artifacts=("myogenic_frontal", "eye_blink"),
        clinical_relevance="Motor planning, response inhibition, voluntary eye movement control. Vertex-adjacent — minimal muscle artifact here makes fast activity more suspicious.",
        notes="Central midline. Mu rhythm may be seen here during motor idling.",
    ),
    ChannelAnatomy(
        channel="T7",
        cortical_region="Left superior temporal gyrus / auditory cortex vicinity",
        brodmann_areas=("BA 21", "BA 22", "BA 41", "BA 42"),
        functional_networks=("Language Network (Wernicke's)", "Auditory Network"),
        common_artifacts=("myogenic_temporal", "chewing", "ecg"),
        clinical_relevance="Auditory processing, language comprehension (Wernicke's area). TIRDA here is epileptogenic and suggests left temporal lesion. Sleep spindles may appear in Stage II.",
        notes="Previously labeled T3. Overlies lateral temporal convexity.",
    ),
    ChannelAnatomy(
        channel="T8",
        cortical_region="Right superior temporal gyrus / auditory cortex vicinity",
        brodmann_areas=("BA 21", "BA 22", "BA 41", "BA 42"),
        functional_networks=("Language Network (prosody)", "Auditory Network"),
        common_artifacts=("myogenic_temporal", "chewing", "ecg"),
        clinical_relevance="Auditory processing, emotional prosody comprehension. Right temporal dysfunction can impair music and voice emotion recognition.",
        notes="Previously labeled T4. Overlies lateral temporal convexity.",
    ),
    ChannelAnatomy(
        channel="C3",
        cortical_region="Left precentral / postcentral gyrus (sensorimotor cortex)",
        brodmann_areas=("BA 1", "BA 2", "BA 3", "BA 4"),
        functional_networks=("Sensorimotor Network", "Dorsal Attention Network"),
        common_artifacts=("myogenic_frontal", "ecg", "electrode_pop"),
        clinical_relevance="Primary motor and somatosensory cortex for right body. Mu rhythm (7–11 Hz arch-like) is the idling rhythm here. Focal slowing suggests contralateral structural lesion.",
        notes="Classic mu rhythm location. Recedes with actual or imagined right-hand movement.",
    ),
    ChannelAnatomy(
        channel="C4",
        cortical_region="Right precentral / postcentral gyrus (sensorimotor cortex)",
        brodmann_areas=("BA 1", "BA 2", "BA 3", "BA 4"),
        functional_networks=("Sensorimotor Network", "Dorsal Attention Network"),
        common_artifacts=("myogenic_frontal", "ecg", "electrode_pop"),
        clinical_relevance="Primary motor and somatosensory cortex for left body. Mu rhythm recedes with actual or imagined left-hand movement.",
        notes="Mirror of C3. Compare C3/C4 for sensorimotor symmetry.",
    ),
    ChannelAnatomy(
        channel="Cz",
        cortical_region="Paracentral lobule / supplementary motor area / primary motor leg area",
        brodmann_areas=("BA 4", "BA 6"),
        functional_networks=("Sensorimotor Network",),
        common_artifacts=("electrode_pop", "vertex_waves"),
        clinical_relevance="Lower extremity motor/sensory representation. Vertex waves in sleep are normal here. Myogenic artifact is minimal — fast activity at Cz warrants scrutiny.",
        notes="True vertex. Sleep vertex waves and spindles are maximal here. Mu rhythm may also be seen.",
    ),
    ChannelAnatomy(
        channel="P7",
        cortical_region="Left supramarginal gyrus / angular gyrus / posterior temporal-parietal junction",
        brodmann_areas=("BA 39", "BA 40"),
        functional_networks=("Default Mode Network", "Language Network"),
        common_artifacts=("ecg", "electrode_pop", "sweat_artifact"),
        clinical_relevance="Semantic language processing, reading, spatial attention. Left temporoparietal dysfunction can produce Wernicke's aphasia or neglect.",
        notes="Previously labeled T5. Overlies posterior temporal-inferior parietal region.",
    ),
    ChannelAnatomy(
        channel="P8",
        cortical_region="Right supramarginal gyrus / angular gyrus / posterior temporal-parietal junction",
        brodmann_areas=("BA 39", "BA 40"),
        functional_networks=("Default Mode Network", "Ventral Attention Network"),
        common_artifacts=("ecg", "electrode_pop", "sweat_artifact"),
        clinical_relevance="Visuospatial attention, facial recognition, emotional memory. Right temporoparietal dysfunction can produce left hemispatial neglect.",
        notes="Previously labeled T6. Overlies posterior temporal-inferior parietal region.",
    ),
    ChannelAnatomy(
        channel="P3",
        cortical_region="Left superior parietal lobule / precuneus vicinity",
        brodmann_areas=("BA 7", "BA 39"),
        functional_networks=("Dorsal Attention Network", "Default Mode Network"),
        common_artifacts=("sweat_artifact", "ecg"),
        clinical_relevance="Spatial attention, sensorimotor integration, mental imagery. Parietal slowing can indicate posterior circulation stroke or degenerative disease.",
        notes="Part of the dorsal attention network. Source of some posterior slow waves of youth in children.",
    ),
    ChannelAnatomy(
        channel="P4",
        cortical_region="Right superior parietal lobule / precuneus vicinity",
        brodmann_areas=("BA 7", "BA 39"),
        functional_networks=("Dorsal Attention Network", "Default Mode Network"),
        common_artifacts=("sweat_artifact", "ecg"),
        clinical_relevance="Visuospatial attention, sensory integration. Right parietal dysfunction produces left-sided neglect and anosognosia.",
        notes="Mirror of P3. Important for visuospatial network integrity.",
    ),
    ChannelAnatomy(
        channel="Pz",
        cortical_region="Precuneus / posterior cingulate cortex vicinity",
        brodmann_areas=("BA 7", "BA 23", "BA 31"),
        functional_networks=("Default Mode Network (hub)",),
        common_artifacts=("sweat_artifact", "lambda_waves"),
        clinical_relevance="Self-referential processing, episodic memory, consciousness. Pz is the functional hub of the DMN. Alpha is typically maximal here during eyes-closed rest.",
        notes="Core DMN hub. Posterior dominant rhythm (PDR) is maximal in parietal-occipital region including Pz.",
    ),
    ChannelAnatomy(
        channel="O1",
        cortical_region="Left primary visual cortex (calcarine sulcus) / cuneus / lingual gyrus",
        brodmann_areas=("BA 17", "BA 18", "BA 19"),
        functional_networks=("Visual Network",),
        common_artifacts=("lambda_waves", "electrode_pop", "end_of_chain_effect"),
        clinical_relevance="Primary and secondary visual processing. PDR originates here. Focal occipital slowing or epileptiform activity suggests structural or irritative occipital lesion.",
        notes="End-of-chain in bipolar double banana. Occipital discharges may lack phase reversal; verify with circumferential or referential montage.",
    ),
    ChannelAnatomy(
        channel="O2",
        cortical_region="Right primary visual cortex (calcarine sulcus) / cuneus / lingual gyrus",
        brodmann_areas=("BA 17", "BA 18", "BA 19"),
        functional_networks=("Visual Network",),
        common_artifacts=("lambda_waves", "electrode_pop", "end_of_chain_effect"),
        clinical_relevance="Visual processing. PDR asymmetry >1 Hz or >50% amplitude between O1 and O2 is abnormal. Occipital intermittent rhythmic delta (OIRDA) in children is often epileptogenic.",
        notes="End-of-chain in bipolar double banana. Lambda waves during reading are normal here.",
    ),
)

# Build indexes at import time.
_BY_CHANNEL: dict[str, ChannelAnatomy] = {}
_BY_NETWORK: dict[str, list[ChannelAnatomy]] = {}
_BY_BRODMANN: dict[str, list[ChannelAnatomy]] = {}
for _ca in _CHANNEL_ATLAS:
    _BY_CHANNEL[_ca.channel.upper()] = _ca
    for _net in _ca.functional_networks:
        _BY_NETWORK.setdefault(_net.lower(), []).append(_ca)
    for _ba in _ca.brodmann_areas:
        _BY_BRODMANN.setdefault(_ba.lower(), []).append(_ca)


class ChannelAtlas:
    """Read-only accessor for channel → anatomy mappings."""

    @staticmethod
    def lookup(channel: str) -> ChannelAnatomy | None:
        """Return anatomy for *channel* (case-insensitive)."""
        return _BY_CHANNEL.get(channel.upper())

    @staticmethod
    def by_network(network: str) -> list[ChannelAnatomy]:
        """Return all channels belonging to *network* (case-insensitive)."""
        return list(_BY_NETWORK.get(network.lower(), []))

    @staticmethod
    def by_brodmann(area: str) -> list[ChannelAnatomy]:
        """Return all channels overlying *Brodmann area*."""
        return list(_BY_BRODMANN.get(area.lower(), []))

    @staticmethod
    def all_channels() -> tuple[str, ...]:
        """Return all 19 channel names."""
        return tuple(_BY_CHANNEL.keys())

    @staticmethod
    def all_profiles() -> tuple[ChannelAnatomy, ...]:
        """Return the full atlas."""
        return _CHANNEL_ATLAS


def explain_channel(channel: str) -> dict[str, str] | None:
    """Return a plain-dict explanation for *channel*, or None if unknown."""
    ca = ChannelAtlas.lookup(channel)
    if ca is None:
        return None
    return {
        "channel": ca.channel,
        "cortical_region": ca.cortical_region,
        "brodmann_areas": ", ".join(ca.brodmann_areas),
        "functional_networks": ", ".join(ca.functional_networks),
        "common_artifacts": ", ".join(ca.common_artifacts),
        "clinical_relevance": ca.clinical_relevance,
        "notes": ca.notes,
    }


def channels_for_artifact(artifact_type: str) -> list[str]:
    """Return all channels where *artifact_type* commonly appears."""
    out: list[str] = []
    for ca in _CHANNEL_ATLAS:
        if artifact_type.lower() in [a.lower() for a in ca.common_artifacts]:
            out.append(ca.channel)
    return out

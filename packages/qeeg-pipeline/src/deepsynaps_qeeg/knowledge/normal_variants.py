"""Normal EEG variants that can be mistaken for pathology.

Catalogs benign patterns to prevent false-positive flagging in qEEG
analysis. Each variant includes differentiation guidance from truly
pathological findings.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NormalVariant:
    name: str
    aliases: tuple[str, ...]
    frequency_hz: str
    primary_location: str
    morphology: str
    reactivity: str
    clinical_note: str
    differentiation_from_pathology: str
    typical_age_range: str | None
    state_context: str  # e.g., "sleep", "wake", "drowsy", "any"


# ── Atlas entries (deterministic, evidence-based) ────────────────────────────

_VARIANTS: tuple[NormalVariant, ...] = (
    NormalVariant(
        name="mu_rhythm",
        aliases=("mu", "sensorimotor rhythm"),
        frequency_hz="8-10",
        primary_location="C3, C4, Cz",
        morphology="Arch-shaped, comb-like waveforms",
        reactivity="Attenuates with contralateral limb movement or intention to move",
        clinical_note=(
            "Normal variant over sensorimotor cortex. Can be unilateral. "
            "Must not be mistaken for epileptiform activity."
        ),
        differentiation_from_pathology=(
            "Mu has arch/comb morphology, is reactive to movement, "
            "and lacks aftergoing slow wave."
        ),
        typical_age_range=None,
        state_context="wake",
    ),
    NormalVariant(
        name="wicket_waves",
        aliases=("wicket", "benign temporal rhythm"),
        frequency_hz="6-11",
        primary_location="T7, T8",
        morphology="Sharp monophasic or diphasic waves, often in runs",
        reactivity="None specific",
        clinical_note=(
            "Benign temporal rhythm that can mimic spikes. "
            "Distinguished by lack of aftergoing slow wave and inconsistent morphology."
        ),
        differentiation_from_pathology=(
            "No aftergoing slow wave; occurs in trains; not time-locked to epileptiform field."
        ),
        typical_age_range=None,
        state_context="any",
    ),
    NormalVariant(
        name="lambda_waves",
        aliases=("lambda",),
        frequency_hz="4-7",
        primary_location="O1, O2, Pz",
        morphology="Positive sharp waves or sawtooth patterns",
        reactivity="Present during active visual scanning/reading; absent eyes closed",
        clinical_note=(
            "Normal visual evoked response during active looking. "
            "Absent when eyes are closed or in darkness."
        ),
        differentiation_from_pathology=(
            "Lambda occurs in wakefulness with eyes open; POSTS occur in sleep."
        ),
        typical_age_range=None,
        state_context="wake",
    ),
    NormalVariant(
        name="rmtd",
        aliases=("rhythmic mid-temporal theta of drowsiness", "psychomotor variant"),
        frequency_hz="5-7",
        primary_location="T7, T8",
        morphology="Rhythmic trains of theta activity",
        reactivity="Appears in drowsiness; disappears in deeper sleep or full wakefulness",
        clinical_note="Also called 'psychomotor variant'. Benign rhythm of drowsiness.",
        differentiation_from_pathology=(
            "Does not evolve in frequency/amplitude; remains monomorphic without post-ictal slowing."
        ),
        typical_age_range=None,
        state_context="drowsy",
    ),
    NormalVariant(
        name="bets",
        aliases=("benign epileptiform transients of sleep", "small sharp spikes", "sss"),
        frequency_hz="sharp transients (not truly rhythmic)",
        primary_location="T7, T8, F7, F8",
        morphology="Small sharp waves, often bilateral but asynchronous",
        reactivity="Only in sleep",
        clinical_note=(
            "Also called 'small sharp spikes' or SSS. "
            "Normal finding in sleep, especially in elderly."
        ),
        differentiation_from_pathology=(
            "Very low amplitude, no aftergoing slow wave, no clinical correlate, only in sleep."
        ),
        typical_age_range=None,
        state_context="sleep",
    ),
    NormalVariant(
        name="fourteen_hz_positive_spikes",
        aliases=("14 Hz positive spikes", "cthers"),
        frequency_hz="13-17 (typically 14)",
        primary_location="Posterior temporal/occipital (T5/T6 or P3/P4 area)",
        morphology="Small positive arc-like spikes in brief trains",
        reactivity="During drowsiness or light sleep",
        clinical_note=(
            "Normal variant of adolescence and young adults. "
            "Has no clinical significance."
        ),
        differentiation_from_pathology=(
            "Positive polarity (unlike epileptiform spikes which are typically negative); "
            "very brief trains."
        ),
        typical_age_range="adolescence-young adult",
        state_context="sleep",
    ),
    NormalVariant(
        name="six_hz_positive_spikes",
        aliases=("6 Hz positive spikes", "phantom spike and wave"),
        frequency_hz="5-7 (typically 6)",
        primary_location="Posterior head regions",
        morphology="Bursts of positive spikes",
        reactivity="During drowsiness or light sleep",
        clinical_note=(
            "Also called 'phantom spike and wave'. "
            "Historically controversial but now considered benign."
        ),
        differentiation_from_pathology=(
            "Positive polarity, occurs in drowsiness, no clinical correlate."
        ),
        typical_age_range=None,
        state_context="drowsy",
    ),
    NormalVariant(
        name="posts",
        aliases=("positive occipital sharp transients of sleep",),
        frequency_hz="mix (sharp transients)",
        primary_location="O1, O2",
        morphology="Positive sharp waves during sleep",
        reactivity="Stage I-II sleep",
        clinical_note=(
            "Normal sleep phenomenon. Can be mistaken for epileptiform discharges."
        ),
        differentiation_from_pathology=(
            "Positive polarity, occurs in sleep, no aftergoing slow wave, "
            "bilateral and synchronous."
        ),
        typical_age_range=None,
        state_context="sleep",
    ),
    NormalVariant(
        name="vertex_waves",
        aliases=("vertex sharp transients",),
        frequency_hz="broad (not rhythmic)",
        primary_location="Cz, Fz",
        morphology="High-amplitude negative sharp wave",
        reactivity="Stage I sleep",
        clinical_note=(
            "Normal sleep transients. Can be confused with epileptiform activity if asymmetric."
        ),
        differentiation_from_pathology=(
            "Normal in stage I sleep; bilateral and synchronous; no aftergoing slow wave."
        ),
        typical_age_range=None,
        state_context="sleep",
    ),
    NormalVariant(
        name="sleep_spindles",
        aliases=("spindles", "sigma activity"),
        frequency_hz="12-14",
        primary_location="Cz, C3, C4",
        morphology="Waxing and waning 12-14 Hz bursts",
        reactivity="Stage II sleep",
        clinical_note=(
            "Hallmark of stage II sleep. Frontally predominant in children, central in adults."
        ),
        differentiation_from_pathology=(
            "Regular 12-14 Hz frequency, waxing-waning envelope, only in sleep."
        ),
        typical_age_range=None,
        state_context="sleep",
    ),
    NormalVariant(
        name="k_complexes",
        aliases=("k-complex",),
        frequency_hz="broad (sharp wave followed by slow wave)",
        primary_location="Fz, Cz, C3, C4",
        morphology="High-amplitude biphasic slow wave with superimposed spindle",
        reactivity="Stage II sleep; can be evoked by sensory stimulus",
        clinical_note=(
            "Normal stage II sleep transients. "
            "May be mistaken for epileptiform discharges if isolated."
        ),
        differentiation_from_pathology=(
            "Much broader and slower than epileptiform spike; normal sleep context."
        ),
        typical_age_range=None,
        state_context="sleep",
    ),
    NormalVariant(
        name="posterior_slow_waves_of_youth",
        aliases=("posterior slow waves", "youth slow waves"),
        frequency_hz="2-4",
        primary_location="O1, O2, P3, P4",
        morphology="High-amplitude slow waves superimposed on normal alpha",
        reactivity="Present in children and adolescents; attenuates with eye opening",
        clinical_note=(
            "Normal variant in children 2-21 years. "
            "Must not be mistaken for posterior slowing from pathology."
        ),
        differentiation_from_pathology=(
            "Present only in youth; superimposed on normal PDR; attenuates with alerting."
        ),
        typical_age_range="2-21 years",
        state_context="wake",
    ),
)

# ── Build indexes ────────────────────────────────────────────────────────────

_BY_NAME: dict[str, NormalVariant] = {}
_BY_LOCATION: dict[str, list[NormalVariant]] = {}
_BY_STATE: dict[str, list[NormalVariant]] = {}

for _v in _VARIANTS:
    _BY_NAME[_v.name.lower()] = _v
    for _alias in _v.aliases:
        _BY_NAME[_alias.lower()] = _v

    # Index by each comma-separated location token
    for _loc in _v.primary_location.replace(" or ", ", ").split(","):
        _loc_clean = _loc.strip().lower()
        if not _loc_clean:
            continue
        # Handle region prefixes like "posterior temporal/occipital"
        # by also indexing the channel codes if present
        _BY_LOCATION.setdefault(_loc_clean, []).append(_v)
        # Extract channel codes (e.g., C3, T7) from the location string
        for _token in _loc_clean.replace("/", " ").replace("(", " ").replace(")", " ").split():
            if _token.upper() in {
                "FP1", "FP2", "F7", "F3", "FZ", "F4", "F8",
                "T7", "C3", "CZ", "C4", "T8",
                "P7", "P3", "PZ", "P4", "P8",
                "O1", "O2",
            }:
                _BY_LOCATION.setdefault(_token, []).append(_v)

    _state = _v.state_context.lower()
    _BY_STATE.setdefault(_state, []).append(_v)

# Deduplicate location lists
for _key in _BY_LOCATION:
    _BY_LOCATION[_key] = list(dict.fromkeys(_BY_LOCATION[_key]))


class NormalVariantAtlas:
    """Read-only atlas for normal EEG variant lookup."""

    @staticmethod
    def lookup(name: str) -> NormalVariant | None:
        """Return the variant matching *name* or an alias (case-insensitive)."""
        return _BY_NAME.get(name.lower())

    @staticmethod
    def for_location(location: str) -> list[NormalVariant]:
        """Return all variants associated with the given location token."""
        return list(_BY_LOCATION.get(location.lower(), []))

    @staticmethod
    def for_state(state: str) -> list[NormalVariant]:
        """Return all variants associated with the given state (e.g. ``sleep``)."""
        return list(_BY_STATE.get(state.lower(), []))

    @staticmethod
    def all_variants() -> tuple[NormalVariant, ...]:
        """Return every defined normal variant."""
        return _VARIANTS


def flag_potential_false_positive(
    pattern_name: str,
    location: str,
    age_months: int | None = None,
    state: str = "unspecified",
) -> dict[str, str] | None:
    """Check if a detected pattern might be a normal variant.

    Returns a dict with keys: ``variant_name``, ``confidence``, ``explanation``
    or ``None`` if no matching variant is found.
    """
    variant = NormalVariantAtlas.lookup(pattern_name)
    if variant is None:
        return None

    # Check location overlap
    loc_tokens = {t.strip().lower() for t in location.replace(",", " ").split()}
    variant_locs = set()
    for loc in variant.primary_location.replace(" or ", ", ").split(","):
        variant_locs.add(loc.strip().lower())
        for token in loc.strip().lower().replace("/", " ").replace("(", " ").replace(")", " ").split():
            if token.upper() in {
                "FP1", "FP2", "F7", "F3", "FZ", "F4", "F8",
                "T7", "C3", "CZ", "C4", "T8",
                "P7", "P3", "PZ", "P4", "P8",
                "O1", "O2",
            }:
                variant_locs.add(token)

    location_match = bool(loc_tokens & variant_locs)

    # Check state overlap
    state_match = (
        variant.state_context.lower() == state.lower()
        or state.lower() == "unspecified"
        or variant.state_context.lower() == "any"
    )

    # Check age
    age_match = True
    if age_months is not None and variant.typical_age_range is not None:
        age_range = variant.typical_age_range.lower()
        # Try to parse numeric ranges like "2-21 years" or "12-18"
        import re

        _range_match = re.search(r"(\d+)\s*-\s*(\d+)", age_range)
        if _range_match:
            _min_years = int(_range_match.group(1))
            _max_years = int(_range_match.group(2))
            if not (_min_years * 12 <= age_months <= _max_years * 12):
                age_match = False
        elif "youth" in age_range or "children" in age_range or "adolescence" in age_range:
            # 2-21 years = 24-252 months
            if not (24 <= age_months <= 252):
                age_match = False
        elif "adult" in age_range and age_months < 216:
            age_match = False

    if not location_match or not state_match or not age_match:
        return None

    confidence = "high" if (location_match and state_match) else "moderate"

    parts = [variant.clinical_note]
    if variant.differentiation_from_pathology:
        parts.append(f"Differentiation: {variant.differentiation_from_pathology}")

    return {
        "variant_name": variant.name,
        "confidence": confidence,
        "explanation": " ".join(parts),
    }

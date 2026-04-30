# LearningEEG.com → DeepSynaps qEEG Integration Guide

**Scope:** Inject structured clinical EEG domain knowledge into the existing qEEG pipeline without breaking safety architecture or changing z-score thresholds.

---

## What Was Added

A new subpackage: `deepsynaps_qeeg.knowledge`

```
packages/qeeg-pipeline/src/deepsynaps_qeeg/knowledge/
├── __init__.py
├── artifact_atlas.py       # Channel-specific artifact profiles
├── encyclopedia.py         # Domain concepts for copilot tool calls
├── findings_enhancer.py    # Enrich raw findings before narrative
└── normative.py            # Age/state-aware normative annotations
```

All modules are:
- **Deterministic** — no LLM calls, no randomness
- **Import-safe** — no heavy dependencies
- **PHI-free** — only age, band, channel, metric path
- **Advisory only** — findings are enriched, never suppressed

---

## Integration Steps

### Step 1 — Wire `enhance_findings` into the report pipeline

**File:** `packages/qeeg-pipeline/src/deepsynaps_qeeg/report/generate.py`

After `extract_findings()` is called, pass the list through `enhance_findings()` before sending to `compose_narrative()`.

```python
from deepsynaps_qeeg.knowledge import enhance_findings  # NEW

# OLD:
# findings = extract_findings(pipeline_result)

# NEW:
raw_findings = extract_findings(pipeline_result)
findings = enhance_findings(
    raw_findings,
    age_months=patient_age_months,        # from patient_meta
    recording_state=recording_state,      # e.g. "awake_ec"
)
```

The `findings` list now contains dicts with extra keys:
- `artifact_flags` — possible confounds
- `normative_context` — age/state interpretation
- `clinical_note` — one-sentence synthesis

### Step 2 — Teach the narrative composer about enriched findings

**File:** `packages/qeeg-pipeline/src/deepsynaps_qeeg/narrative/compose.py`

Update `_prompt_for()` to include the new fields in the prompt so the LLM (or mock provider) can reference them.

```python
def _prompt_for(findings, citations, patient_meta):
    ...
    # Add after the existing prompt text:
    enriched_notes = "\n".join(
        f"- {f.get('clinical_note', '')}"
        for f in findings if isinstance(f, dict) and f.get("clinical_note")
    )

    return (
        "You are generating the Discussion section for a clinician-facing qEEG report.\n"
        ...
        f"Findings (JSON): {findings_json}\n"
        f"Artifact and normative context:\n{enriched_notes}\n"
        ...
    )
```

### Step 3 — Add copilot tool for domain concepts

**File:** `packages/qeeg-pipeline/src/deepsynaps_qeeg/ai/copilot.py`

Add a fifth tool that queries `DOMAIN_ENCYCLOPEDIA`:

```python
from deepsynaps_qeeg.knowledge import explain_domain_concept  # NEW

def tool_explain_domain_concept(concept_slug: str) -> dict[str, str]:
    """Explain an EEG domain concept (frequency band, normal variant, artifact, etc.)."""
    entry = explain_domain_concept(concept_slug)
    if entry is None:
        return {"error": f"Unknown concept: {concept_slug}"}
    return {
        "name": entry["name"],
        "definition": entry["definition"],
        "clinical_relevance": entry["clinical_relevance"],
        "normal_range": entry["normal_range"],
    }
```

Then expose it in the tool dispatcher and system prompt.

### Step 4 — Update the copilot system prompt

Add a paragraph to `SYSTEM_PROMPT_TEMPLATE`:

```
When interpreting findings, consider:
- Frontal findings at Fp1/Fp2 may be confounded by eye blinks.
- Temporal very-fast activity may be chewing or myogenic artifact.
- Delta in awake adults is abnormal; theta is abnormal if predominant.
- Pediatric norms differ dramatically from adult norms (PDR 4–5 Hz at 6 months, 10 Hz by 10 years).
```

### Step 5 — Wire artifact awareness into streaming quality checks (optional)

**File:** `packages/qeeg-pipeline/src/deepsynaps_qeeg/streaming/quality.py`

Use `ArtifactAtlas.lookup(channel)` to annotate live quality warnings:

```python
from deepsynaps_qeeg.knowledge import ArtifactAtlas

for ch in flagged_channels:
    profiles = ArtifactAtlas.lookup(ch)
    if profiles:
        warnings.append(f"{ch}: watch for {profiles[0].artifact_type}")
```

---

## Data Flow After Integration

```
Raw EEG
   │
   ▼
Preprocess / pipeline
   │
   ▼
extract_findings() ──► z-score flagged deviations
   │
   ▼
enhance_findings() ──► + artifact flags + normative context + clinical_note
   │
   ▼
retrieve evidence (MedRAG) ──► literature citations
   │
   ▼
compose_narrative() ──► prompt includes enriched findings
   │
   ▼
safety.gate() ──► consistency check
   │
   ▼
HTML / PDF report
```

---

## Testing

Run the existing test suite to ensure nothing is broken:

```bash
uv run --no-project --with pytest --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m pytest apps/api/tests -q
```

Add a new test for the knowledge layer:

```python
def test_enhance_findings_flags_frontal_eyeblinks():
    from deepsynaps_qeeg.knowledge import enhance_findings
    from deepsynaps_qeeg.narrative.types import Finding

    f = Finding(region="Fp1", band="delta", metric="spectral.bands.delta.absolute_uv2",
                value=150.0, z=2.5, direction="elevated", severity="significant")
    enriched = enhance_findings([f], age_months=300, recording_state="awake_ec")
    assert any(a["artifact_type"] == "eye_blink" for a in enriched[0]["artifact_flags"])
```

---

## Content Coverage

The knowledge base encodes **~60 structured facts** from learningeeg.com:

| Domain | Facts |
|--------|-------|
| Frequency bands | 5 bands × 4 context states |
| Artifacts | 10 profiles with channel priors |
| Normal variants | 6 variants (mu, wickets, RMTD, lambda, BETS, 14&6) |
| Pediatric norms | PDR progression 0–216 months |
| Neonatal norms | IBI maxima by PMA weeks |
| Montage concepts | Phase reversal, end-of-chain, AP gradient |
| Physiology | Bell's phenomenon, polarity rules |

---

## Safety Notes

1. **No finding suppression** — artifact flags are advisory; clinicians see everything.
2. **No PHI in knowledge layer** — only age (months), band, channel, metric.
3. **No LLM in knowledge layer** — all synthesis is deterministic string templating.
4. **Fallback behavior** — if `enhance_findings()` raises, catch and fall back to raw findings.

---

## Future Extensions

- **Medication ontology** — add drug→EEG effect mapping (benzodiazepine→excess beta, etc.)
- **Sleep staging rules** — encode spindle/vertex/POSTS criteria for automated staging
- **Seizure detection scaffold** — integrate evolution-based criteria from `learningeeg_knowledge_base.json`
- **Channel→Brodmann mapping** — link 10-20 electrodes to functional anatomy

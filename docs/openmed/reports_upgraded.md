# Reports Upgraded

## This PR

No report-generation flow was modified. Inspection in Phase 1 confirmed
that `services/report_payload.py` already separates findings, citations,
and interpretations cleanly — the structural slot for OpenMed-derived
`extracted_facts` exists, but wiring it requires a contract change to
`build_report_payload(...)` that downstream consumers (PDF/DOCX/FHIR)
must also accept. Punted to phase 2 to avoid breaking touched flows.

## Phase 2 sketch

Add to `ReportPayload`:

```python
extracted_facts: list[ExtractedClinicalEntity] = []
provenance: dict = {}  # backend, schema_id, run_at
```

Surface in PDF as a labelled "NLP extraction (verify)" section, distinct
from clinician findings. The schema is already typed; consumers just
need to handle the new optional field.

## Beta-visible report flows audited

- MRI report PDF / DOCX export — works (verified in round 2 fixes)
- qEEG report PDF / AI summary — works (no change)
- Documents Hub download — works (wired in pre-existing PR)
- DeepTwin handoff report — works
- FHIR / BIDS bundles — works (clinic-ownership-gated)

No pretend export buttons were touched in this PR.

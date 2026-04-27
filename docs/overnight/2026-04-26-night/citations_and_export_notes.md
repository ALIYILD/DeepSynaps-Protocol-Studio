# Stream 5 — Citations & Export Notes

## Citation contract (downstream consumers, please read)

Every citation in a `ReportPayload` is a `CitationRef`:

```
{
  "citation_id": "C1",                # stable within payload
  "title": "...",
  "authors": ["...", "..."],
  "year": 2020, "journal": "...",
  "doi": "10.xxxx/yyyy" | null,
  "pmid": "12345678"   | null,
  "url":  "https://..."  | null,
  "raw_text": "...original ref text..." | null,
  "evidence_level": "Grade A · Systematic review / meta-analysis" | null,
  "retrieved_at": "2026-04-26T22:55:00Z",
  "status": "verified" | "unverified" | "retracted"
}
```

**Hard rules:**

1. NEVER fabricate identifiers. If we cannot resolve a reference,
   `status="unverified"`, `raw_text` carries the original string,
   and any DOI/PMID we *parsed* from the raw text is preserved but
   the lookup-derived fields (`title`, `authors`, `journal`, `year`)
   are left empty / what the parser found.
2. `retrieved_at` is always set (UTC ISO-8601). If the citation was
   never re-checked, set it to the timestamp of payload generation.
3. `evidence_level` is the GRADE descriptor or `null` — never invent
   a level when the source has none.

## Export contract

| Format | Endpoint | Status |
|---|---|---|
| HTML | `GET /api/v1/reports/{id}/render?format=html` | Always available; `text/html`, never empty. |
| PDF  | `GET /api/v1/reports/{id}/render?format=pdf`  | Returns `application/pdf` bytes when `weasyprint` is installed; **HTTP 503** with code `pdf_renderer_unavailable` and a clear message otherwise. Never returns a blank/empty 200. |
| DOCX | (deferred — see plan item 14) | `python-docx` integration not wired tonight; lib also missing in local env. |

## Cross-stream contract for upstream callers (qEEG, MRI, Scoring)

When you publish findings into a structured report, please:

* Put **measurements / signals** in `section.observed[]`.
* Put **model-derived interpretations** in `section.interpretations[]` —
  one item per claim, each with an explicit `evidence_strength`.
* Put **decision-support suggestions** in `section.suggested_actions[]`
  (the renderer auto-prefixes "Consider:" when
  `requires_clinician_review=True`, which is the safe default).
* Always populate `cautions[]` and `limitations[]`. The renderer shows
  empty-state placeholders rather than hiding these blocks; that is
  intentional — silent absence of cautions is dangerous.
* Use `counter_evidence_refs[]` for citations that *contradict* an
  interpretation. The web view already badges them and the HTML
  renderer surfaces them under "Conflicting evidence".
* Reference citations by `citation_id` (e.g. `"C1"`); the
  `enrich_citations()` helper in
  `apps/api/app/services/report_citations.py` will turn either
  `LiteraturePaper` rows or free-text strings into `CitationRef`s
  with the right ids.

## DevOps blockers

* `weasyprint` is not installed in the local Python env on this Mac
  (verified: `python3 -c "import weasyprint"` → ModuleNotFoundError).
  The PDF endpoint correctly returns HTTP 503 in this state. The
  Docker / Fly image bundles weasyprint already (it's a hard dep of
  qEEG/MRI pipelines per their `pyproject.toml`); confirm during
  deploy verification.
* `python-docx` is also not installed locally; DOCX export is
  deferred (plan item 14) until DevOps confirms it ships in the
  container.
* No project venv on this Mac. `pytest` runs against system Python
  3.11 (Homebrew). The reports/documents tests pass against this env
  because they only need the API's lightweight stack. Heavier tests
  (qEEG/MRI) require the Docker env.

## Test results (this branch)

```
$ pytest apps/api/tests/test_documents_router.py -v 2>&1 | tail -20
... 16 passed, 1 warning in 4.18s

$ pytest apps/api/tests/test_reports_router.py -v 2>&1 | tail -20
... 16 passed, 1 warning in 4.52s

$ pytest apps/api/tests/ -k "preview or render or generation" -v 2>&1 | tail -10
... 19 passed, 839 deselected, 1 warning in 5.34s
```

All reports + documents tests green, including the new contract tests:

* Sample preview payload always returns the full structural fields
  (`observed`, `interpretations`, `cautions`, `limitations`,
  `suggested_actions`).
* Custom preview payload preserves observed-vs-interpretation
  separation; references that can't be resolved are returned
  `status="unverified"` with `raw_text` intact (no fabrication).
* Every citation carries `retrieved_at`, an identifier
  (`doi`/`pmid`/`url`) **or** `raw_text`, and either an explicit
  `evidence_level` or the `unverified` marker.
* HTML render returns `text/html`, non-empty, with the
  observed/interpretation labels and decision-support disclaimer
  visible.
* PDF render returns 503 with code `pdf_renderer_unavailable` and a
  message containing "weasyprint" when the lib is missing; returns
  real `%PDF-…` bytes when the renderer succeeds.
* Documents upload preserves declared MIME on download.

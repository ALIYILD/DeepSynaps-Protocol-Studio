# qEEG Cleaning Audit

Every mutation in the Raw EEG Cleaning Workbench appends one row to
`qeeg_cleaning_audit_events`. The table is **append-only**: rows are
never updated or deleted by application code.

## Schema

```sql
CREATE TABLE qeeg_cleaning_audit_events (
    id                  VARCHAR(36) PRIMARY KEY,
    analysis_id         VARCHAR(36) NOT NULL REFERENCES qeeg_analyses(id) ON DELETE CASCADE,
    cleaning_version_id VARCHAR(36),
    action_type         VARCHAR(40) NOT NULL,
    channel             VARCHAR(40),
    start_sec           FLOAT,
    end_sec             FLOAT,
    ica_component       INTEGER,
    previous_value_json TEXT,
    new_value_json      TEXT,
    note                TEXT,
    source              VARCHAR(30) NOT NULL DEFAULT 'clinician',
    actor_id            VARCHAR(64),
    created_at          DATETIME NOT NULL
);
```

Indexed on `analysis_id`, `cleaning_version_id`, `action_type`,
`actor_id`, and `created_at` for fast log retrieval.

## Action types

| `action_type`                            | Source     | Notes                                              |
|------------------------------------------|------------|----------------------------------------------------|
| `annotation:bad_channel`                 | clinician  | Mark / unmark a channel bad.                       |
| `annotation:bad_segment`                 | clinician  | Reject a time range.                               |
| `annotation:rejected_epoch`              | clinician  | Reject a fixed-length epoch.                       |
| `annotation:interpolated_channel`        | clinician  | Mark a channel for interpolation.                  |
| `annotation:ica_decision`                | clinician  | Accept / reject an ICA component.                  |
| `annotation:ai_suggestion`               | clinician  | Decision on an AI suggestion (accept/reject/etc.). |
| `annotation:note`                        | clinician  | Free-form clinician note.                          |
| `ai_suggestion:generated`                | ai         | AI-assistant generation event.                     |
| `cleaning_version:save`                  | clinician  | Saved cleaning version.                            |
| `cleaning_version:rerun_requested`       | clinician  | Triggered a re-run of the qEEG pipeline.           |

## Source field

- `clinician` — the action was performed (or accepted) by a logged-in
  clinician. The `actor_id` column carries the actor identity.
- `ai` — the action originated from the AI assistant. The accompanying
  annotation always begins with `decision_status='suggested'` and
  requires a clinician sibling row to become `accepted`.
- `system` — reserved for automated preprocessing pipeline events.

## Retention

Audit rows live as long as the parent `qeeg_analyses` row. Cascade
delete on the FK clears them when the analysis is purged.

## Verification (UAT)

Spot-check the audit table after running the demo script:

```sql
SELECT action_type, source, actor_id, channel, start_sec, end_sec, created_at
FROM   qeeg_cleaning_audit_events
WHERE  analysis_id = '<analysis-id>'
ORDER BY created_at;
```

Expected sequence after a typical workbench session:

| action_type                          | source    | required field |
|--------------------------------------|-----------|----------------|
| `annotation:bad_channel`             | clinician | `channel`      |
| `annotation:bad_segment`             | clinician | `start_sec`, `end_sec` |
| `ai_suggestion:generated`            | ai        | `ai_label` (in `new_value_json`) |
| `annotation:ai_suggestion`           | clinician | `decision_status` accept/reject |
| `cleaning_version:save`              | clinician | `cleaning_version_id`  |
| `cleaning_version:rerun_requested`   | clinician | `cleaning_version_id`  |

Every row carries `actor_id` and `created_at`. PHI is **not** logged —
no patient name, filename, or chat ID appears in any column.

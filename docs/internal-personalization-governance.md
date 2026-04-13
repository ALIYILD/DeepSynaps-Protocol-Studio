# Personalization governance API (internal)

These endpoints and request flags are for **reviewers and administrators**, not default clinician workflows. They do **not** change eligibility or ranking.

## Why-selected debug on protocol draft

`POST /api/v1/protocols/generate-draft`

Optional JSON body fields:

- `include_personalization_debug` (boolean, default `false`): when `true` and the request resolves to at least one eligible protocol row, the response includes `personalization_why_selected_debug` — a compact, deterministic summary (baseline vs selected, fired rule IDs, structured scores, rank order). Same protocol is always selected as when the flag is `false`.
- `include_structured_rule_matches_detail` (boolean, default `true`): when `false`, `structured_rule_matches_by_protocol` is empty to reduce payload size. Set to `true` (default) for backward-compatible behavior that includes per-protocol rule fires.

## Registry review

`GET /api/v1/personalization/rules/review?view=snapshot|report|both` (**admin role required**)

Returns a versioned JSON `snapshot` (always) and optional multi-line `report_text` when `view` is `report` or `both`. Use `view=snapshot` to omit building the text report.

## Loader diagnostics (optional)

Set environment variable `DEEPSYNAPS_PERSONALIZATION_REGISTRY_WARN=1` to emit **non-fatal** `UserWarning` on clinical dataset load when static rule diagnostics find issues. Default is off (including CI).

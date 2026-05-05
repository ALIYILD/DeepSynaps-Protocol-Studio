## Protocol Studio UX report (doctor-facing workspace)

### Scope & files inspected
- **Protocol Studio hub UI**: `apps/web/src/pages-clinical-hubs.js` (`pgProtocolHub`, legacy `pgProtocolStudio`)
- **Protocol browse/detail/builder**: `apps/web/src/pages-protocols.js` (`pgProtocolSearch`, `pgProtocolDetail`, `pgProtocolBuilderV2`)
- **Evidence UI**: `apps/web/src/live-evidence.js`, `apps/web/src/evidence-intelligence.js`, `apps/web/src/evidence-ui-live.js`
- **Route regression**: `apps/web/src/protocol-studio-route.test.js`

### Current UI map (what exists today)
- **Entry route**: `?page=protocol-studio` → `pgProtocolHub`
- **Tabs**: `conditions` / `generate` / `browse` / `drafts`
  - **Conditions**: condition grid + evidence/protocol counts + jump actions
  - **Generate**: 3 generator cards (evidence-based draft, brain-scan guided, personalized)
  - **Browse**: embeds `pgProtocolSearch` into a mount element
  - **Drafts**: lists saved protocol drafts (`/api/v1/protocols/saved`)
- **Role gating**:
  - `patient` role: shows clinician-only message
  - unauth/guest: limited browse-only behavior depending on app auth flow
- **Safety posture**: the Generate tab’s output card includes “AI-assisted draft … requires clinician review” language.

### UX gaps vs doctor-ready acceptance criteria (UI-level)
- **No stable UI automation hooks**: Protocol Studio DOM uses ids/classes but lacks the requested stable `data-testid` contract.
- **Evidence/live status placement is inconsistent**: Browse includes live evidence panel inside protocol search; Generate/Drafts don’t surface an explicit “evidence source mode” or “live unavailable” banner in a consistent place.
- **Patient context panel competes with drafting flow**: helpful, but should be collapsible and consistently located.
- **Approval wording risk**: avoid any UI wording that reads like regulatory approval; keep “practice-governance approval” explicitly scoped if shown.

### Recommended doctor-friendly layout (minimal refactor)
Use existing tab structure and modules; focus on hierarchy and testability:
- **Persistent safety banner** at top of Protocol Studio:
  - “Clinician decision-support only. Drafts require clinician review and are not autonomous prescriptions.”
- **Three-pane structure (optional)**:
  - Left: patient context + quick links
  - Center: tab content (conditions/generate/browse/drafts)
  - Right: evidence status + safety checklist (collapsible)

### Stable `data-testid` contract (requested selectors)
Add the following stable selectors with minimal markup change:

#### Protocol Studio shell
- `protocol-studio-root`
- `protocol-safety-banner`
- `protocol-mode-selector`
- `protocol-results-list`
- `protocol-generate-action`
- `protocol-draft-output`
- `protocol-evidence-links`
- `protocol-patient-context`
- `protocol-approve-action`
- `protocol-off-label-warning`

#### Browse/search UI (inside embedded `pgProtocolSearch`)
- `prot-search-input`
- `prot-filter-condition`
- `prot-filter-device`
- `prot-filter-type`
- `prot-filter-evidence`
- `prot-filter-governance`
- `prot-results-count`
- `prot-card` (with `data-protocol-id`)
- `prot-use-btn`
- `prot-live-evidence`

### Frontend tests (minimal, high-signal)
Add a Node test (`node:test`) that asserts:
- Protocol Studio route loads `pgProtocolHub` (existing test already covers basic strings).
- Required `data-testid` strings exist in `pages-clinical-hubs.js` `pgProtocolHub` markup and in `pages-protocols.js` `pgProtocolSearch` markup.
- Safety banner text is present and does not claim “approved” or “guaranteed”.

### Notes
- Do not “fake” evidence results in UI. If live evidence is unavailable, show an explicit unavailable banner and fall back to curated registry/protocol library only when labeled as such.


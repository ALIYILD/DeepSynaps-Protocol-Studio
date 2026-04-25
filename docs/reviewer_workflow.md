# Reviewer Workflow

## Overview

Generated documents pass through a review lifecycle before clinical use. The reviewer workflow tracks state, comments, and audit trail for each build.

## States

| State | Meaning |
|-------|---------|
| `DRAFT` | Just generated, not yet submitted for review |
| `NEEDS_REVIEW` | Submitted and waiting for clinical reviewer |
| `APPROVED` | Reviewer has approved for clinical use |
| `REJECTED` | Reviewer has rejected — needs fixes |
| `EXPORTED` | Approved and exported for distribution |

## Valid Transitions

```
DRAFT ──────────► NEEDS_REVIEW ──────► APPROVED ──────► EXPORTED
                       │                    │
                       ▼                    │
                   REJECTED ◄───────────────┘
                       │         (re-review)
                       ▼
                  NEEDS_REVIEW
```

## ReviewManager API

```python
from deepsynaps_studio.review.manager import ReviewManager

mgr = ReviewManager(reviews_dir=Path("outputs/reviews/"))

# Create review for a build
state = mgr.create_review(
    build_id="build-parkinsons-20260401",
    condition_slug="parkinsons",
    document_type="evidence_based_protocol",
    tier="partners",
)

# Submit for review
mgr.submit_for_review("build-parkinsons-20260401")

# Add reviewer comments
mgr.add_section_comment(
    "build-parkinsons-20260401",
    section_id="safety",
    reviewer="Dr. Smith",
    text="Need additional TPS contraindication note for cardiac patients",
)

# Approve or reject
mgr.approve("build-parkinsons-20260401", reviewer="Dr. Smith", reason="Complete and accurate")
mgr.reject("build-parkinsons-20260401", reviewer="Dr. Smith", reason="Missing TPS safety data")

# List pending reviews
pending = mgr.list_pending()
```

## CLI Usage

```bash
# List pending reviews
deepsynaps-studio review list

# Approve a build
deepsynaps-studio review approve --build-id build-parkinsons-20260401 --reviewer "Dr. Smith"

# Reject with reason
deepsynaps-studio review reject --build-id build-parkinsons-20260401 --reviewer "Dr. Smith" --reason "Insufficient evidence for TPS protocol"
```

## Audit Trail

Every state transition is recorded as a `ReviewDecision` with:
- Timestamp
- Reviewer name
- New status
- Reason text
- `consent_version` — version of the consent template in effect at the time of the decision

Per-section comments are stored in `section_notes` for granular feedback.

The audit log is hash-chained: each entry references the hash of the previous entry,
creating a tamper-evident record that cannot be silently altered or deleted.

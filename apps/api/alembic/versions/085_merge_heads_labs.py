"""Merge heads: 084_merge_heads_movement_and_reviewer_sla + 083_patient_lab_results

This branch (PR #449, Labs / Blood Biomarkers Analyzer) introduced a new
migration `083_patient_lab_results` whose parent is `082_irb_amendment_workflow`.
Meanwhile main grew `084_merge_heads_movement_and_reviewer_sla` (which already
unifies the Movement and Reviewer SLA branches descending from 082). Merging
main into this branch therefore produces TWO alembic heads — `084_merge_…` and
`083_patient_lab_results`. This empty merge migration unifies them so alembic
upgrade resolves to a single head.

Revision ID: 085_merge_heads_labs
Revises: 084_merge_heads_movement_and_reviewer_sla, 083_patient_lab_results
Create Date: 2026-05-02 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op  # noqa: F401  (kept for symmetry with sibling migrations)
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "085_merge_heads_labs"
down_revision: Union[str, Sequence[str], None] = (
    "084_merge_heads_movement_and_reviewer_sla",
    "083_patient_lab_results",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: this migration only unifies divergent heads."""
    pass


def downgrade() -> None:
    """No-op: see upgrade()."""
    pass

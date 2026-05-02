"""Merge 047_cleaning_decisions and 077_caregiver_digest_preferences heads.

Two unrelated head revisions evolved in parallel: the raw-data clinical
workstation track (047_cleaning_decisions) and the caregiver-digest /
oncall track (...→077_caregiver_digest_preferences). This empty
migration joins them so ``alembic upgrade head`` resolves to a single
head again.

Revision ID: 078_merge_cleaning_decisions_and_caregiver_digest
Revises: 047_cleaning_decisions, 077_caregiver_digest_preferences
"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision = "078_merge_cleaning_decisions_and_caregiver_digest"
down_revision = ("047_cleaning_decisions", "077_caregiver_digest_preferences")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

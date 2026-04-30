"""Merge the two parallel 053 heads (clinic_cost_cap + mri_clinical_workbench)."""

from __future__ import annotations

revision = "054_merge_053_heads"
down_revision = ("053_clinic_cost_cap", "053_mri_clinical_workbench")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

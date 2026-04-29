"""Merge the two parallel 056-tier heads.

Two migrations were authored independently against
``055_merge_054_heads`` and re-introduced the multi-head condition:

* ``056_onboarding_events`` — onboarding wizard funnel telemetry table
  (Phase 12).
* ``2663bd827e8c`` — Fusion Workbench tables (FusionCase /
  FusionCaseAudit / FusionCaseFinding).

This empty node collapses them.
"""
from __future__ import annotations

revision = "057_merge_056_heads"
down_revision = ("056_onboarding_events", "2663bd827e8c")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

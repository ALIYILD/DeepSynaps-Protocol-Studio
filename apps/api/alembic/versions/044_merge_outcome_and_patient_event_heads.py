"""Merge the outcome-events and patient-event SQLite heads.

Revision ID: 044_merge_outcome_and_patient_event_heads
Revises: 043_outcome_events, 043_patient_event_contract_sqlite
Create Date: 2026-04-24
"""
from __future__ import annotations


revision = "044_merge_outcome_and_patient_event_heads"
down_revision = ("043_outcome_events", "043_patient_event_contract_sqlite")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge-head revision; no schema changes."""


def downgrade() -> None:
    """Merge-head revision; no schema changes."""

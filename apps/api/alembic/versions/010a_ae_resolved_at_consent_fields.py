"""Add resolved_at to adverse_events; add status and expires_at to consent_records

Revision ID: 009_ae_resolved_at_consent_fields
Revises: 009_messages_extended_fields
Create Date: 2026-04-11

Changes:
  - adverse_events.resolved_at  : nullable DateTime — set when the AE is marked resolved
  - consent_records.status      : varchar(30) default 'active' — active | withdrawn | expired
  - consent_records.expires_at  : nullable DateTime — when this consent expires
"""
from alembic import op
import sqlalchemy as sa

revision = '009_ae_resolved_at_consent_fields'
down_revision = '009_messages_extended_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── adverse_events: add resolved_at ───────────────────────────────────────
    op.add_column(
        'adverse_events',
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )

    # ── consent_records: add status and expires_at ────────────────────────────
    op.add_column(
        'consent_records',
        sa.Column('status', sa.String(30), nullable=False, server_default='active'),
    )
    op.add_column(
        'consent_records',
        sa.Column('expires_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_consent_records_status', 'consent_records', ['status'])


def downgrade() -> None:
    op.drop_index('ix_consent_records_status', table_name='consent_records')
    op.drop_column('consent_records', 'expires_at')
    op.drop_column('consent_records', 'status')
    op.drop_column('adverse_events', 'resolved_at')

"""Add subject, category, thread_id, priority to messages table

Revision ID: 009_messages_extended_fields
Revises: 008_home_device_workflows
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = '009_messages_extended_fields'
down_revision = '008_home_device_workflows'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('subject', sa.String(255), nullable=True))
    op.add_column('messages', sa.Column('category', sa.String(60), nullable=True))
    op.add_column('messages', sa.Column('thread_id', sa.String(64), nullable=True))
    op.add_column('messages', sa.Column('priority', sa.String(20), nullable=True))
    op.create_index('ix_messages_thread_id', 'messages', ['thread_id'])


def downgrade() -> None:
    op.drop_index('ix_messages_thread_id', table_name='messages')
    op.drop_column('messages', 'priority')
    op.drop_column('messages', 'thread_id')
    op.drop_column('messages', 'category')
    op.drop_column('messages', 'subject')

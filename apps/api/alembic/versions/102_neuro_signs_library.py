"""Add Neuro Signs medical education library tables.

Revision ID: 102_neuro_signs
Revises: 101_merge_multiple_heads
Create Date: 2026-05-11 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '102_neuro_signs'
down_revision = '101_merge_multiple_heads'
branch_labels = None
depends_on = None


def upgrade():
    # Create neuro_signs table
    op.create_table(
        'neuro_signs',
        sa.Column('id', sa.String(128), nullable=False),
        sa.Column('slug', sa.String(256), nullable=False),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('category', sa.String(64), nullable=False),
        sa.Column('modality', sa.String(64), nullable=False),
        sa.Column('sequences', sa.JSON(), nullable=True),
        sa.Column('anatomy', sa.JSON(), nullable=True),
        sa.Column('aliases', sa.JSON(), nullable=True),
        sa.Column('primary_conditions', sa.JSON(), nullable=True),
        sa.Column('associated_conditions', sa.JSON(), nullable=True),
        sa.Column('visual_description', sa.Text(), nullable=True),
        sa.Column('pathophysiology_explanation', sa.Text(), nullable=True),
        sa.Column('differential_diagnosis', sa.Text(), nullable=True),
        sa.Column('reporting_phrase', sa.Text(), nullable=True),
        sa.Column('clinical_caveat', sa.Text(), nullable=True),
        sa.Column('evidence_notes', sa.Text(), nullable=True),
        sa.Column('source_refs', sa.JSON(), nullable=True),
        sa.Column('image_url', sa.String(512), nullable=True),
        sa.Column('thumbnail_url', sa.String(512), nullable=True),
        sa.Column('image_license', sa.String(128), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', sa.String(128), nullable=True),
        sa.Column('updated_by', sa.String(128), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index('ix_neuro_signs_slug', 'neuro_signs', ['slug'])
    op.create_index('ix_neuro_signs_name', 'neuro_signs', ['name'])
    op.create_index('ix_neuro_signs_category', 'neuro_signs', ['category'])
    op.create_index('ix_neuro_signs_is_published', 'neuro_signs', ['is_published'])
    op.create_index('ix_neuro_signs_category_published', 'neuro_signs', ['category', 'is_published'])
    op.create_index('ix_neuro_signs_name_published', 'neuro_signs', ['name', 'is_published'])

    # Create case_neuro_signs table
    op.create_table(
        'case_neuro_signs',
        sa.Column('id', sa.String(128), nullable=False),
        sa.Column('case_id', sa.String(128), nullable=False),
        sa.Column('neuro_sign_id', sa.String(128), nullable=False),
        sa.Column('clinician_id', sa.String(128), nullable=True),
        sa.Column('confidence', sa.String(32), nullable=False, server_default='possible'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('image_series_id', sa.String(128), nullable=True),
        sa.Column('slice_index', sa.Integer(), nullable=True),
        sa.Column('annotation_id', sa.String(128), nullable=True),
        sa.Column('inserted_into_report', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['neuro_sign_id'], ['neuro_signs.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('case_id', 'neuro_sign_id', 'clinician_id', name='uq_case_sign_clinician'),
        sa.CheckConstraint("confidence IN ('possible', 'probable', 'characteristic', 'ruled_out')", name='ck_case_neuro_signs_confidence'),
    )
    op.create_index('ix_case_neuro_signs_case_id', 'case_neuro_signs', ['case_id'])
    op.create_index('ix_case_neuro_signs_neuro_sign_id', 'case_neuro_signs', ['neuro_sign_id'])
    op.create_index('ix_case_neuro_signs_clinician_id', 'case_neuro_signs', ['clinician_id'])
    op.create_index('ix_case_neuro_signs_confidence', 'case_neuro_signs', ['confidence'])
    op.create_index('ix_case_neuro_signs_inserted_into_report', 'case_neuro_signs', ['inserted_into_report'])
    op.create_index('ix_case_neuro_signs_case_created', 'case_neuro_signs', ['case_id', 'created_at'])

    # Create neuro_sign_annotations table
    op.create_table(
        'neuro_sign_annotations',
        sa.Column('id', sa.String(128), nullable=False),
        sa.Column('neuro_sign_id', sa.String(128), nullable=False),
        sa.Column('image_url', sa.String(512), nullable=True),
        sa.Column('shape_type', sa.String(32), nullable=False),
        sa.Column('coordinates', sa.JSON(), nullable=False),
        sa.Column('label', sa.String(256), nullable=True),
        sa.Column('color', sa.String(32), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['neuro_sign_id'], ['neuro_signs.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("shape_type IN ('polygon', 'rectangle', 'ellipse', 'arrow', 'point')", name='ck_annotation_shape_type'),
    )
    op.create_index('ix_neuro_sign_annotations_sign', 'neuro_sign_annotations', ['neuro_sign_id'])


def downgrade():
    op.drop_index('ix_neuro_sign_annotations_sign', table_name='neuro_sign_annotations')
    op.drop_table('neuro_sign_annotations')
    
    op.drop_index('ix_case_neuro_signs_case_created', table_name='case_neuro_signs')
    op.drop_index('ix_case_neuro_signs_inserted_into_report', table_name='case_neuro_signs')
    op.drop_index('ix_case_neuro_signs_confidence', table_name='case_neuro_signs')
    op.drop_index('ix_case_neuro_signs_clinician_id', table_name='case_neuro_signs')
    op.drop_index('ix_case_neuro_signs_neuro_sign_id', table_name='case_neuro_signs')
    op.drop_index('ix_case_neuro_signs_case_id', table_name='case_neuro_signs')
    op.drop_table('case_neuro_signs')
    
    op.drop_index('ix_neuro_signs_name_published', table_name='neuro_signs')
    op.drop_index('ix_neuro_signs_category_published', table_name='neuro_signs')
    op.drop_index('ix_neuro_signs_is_published', table_name='neuro_signs')
    op.drop_index('ix_neuro_signs_category', table_name='neuro_signs')
    op.drop_index('ix_neuro_signs_name', table_name='neuro_signs')
    op.drop_index('ix_neuro_signs_slug', table_name='neuro_signs')
    op.drop_table('neuro_signs')

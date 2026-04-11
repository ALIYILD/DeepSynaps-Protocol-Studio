"""Enforce billing_status CHECK constraint on clinical_sessions

Revision ID: 012_billing_status_enum
Revises: 011_fk_constraints
Create Date: 2026-04-11

Adds a CHECK constraint to clinical_sessions.billing_status ensuring only
'unbilled', 'billed', or 'paid' are stored.  SQLite cannot add a CHECK
constraint to an existing table via ALTER; batch_alter_table recreates the
table, which lets Alembic rebuild it with the constraint baked in.

Pre-condition: any rows with non-standard values are normalised to 'unbilled'
before the table is recreated.
"""
from alembic import op
import sqlalchemy as sa

revision = '012_billing_status_enum'
down_revision = '011_fk_constraints'
branch_labels = None
depends_on = None

_VALID_STATUSES = ('unbilled', 'billed', 'paid')


def upgrade() -> None:
    # Normalise any out-of-range values before the constraint is applied.
    op.execute(
        "UPDATE clinical_sessions "
        "SET billing_status = 'unbilled' "
        "WHERE billing_status NOT IN ('unbilled', 'billed', 'paid')"
    )

    with op.batch_alter_table('clinical_sessions') as batch_op:
        batch_op.create_check_constraint(
            'ck_clinical_sessions_billing_status',
            "billing_status IN ('unbilled', 'billed', 'paid')",
        )


def downgrade() -> None:
    with op.batch_alter_table('clinical_sessions') as batch_op:
        batch_op.drop_constraint(
            'ck_clinical_sessions_billing_status',
            type_='check',
        )

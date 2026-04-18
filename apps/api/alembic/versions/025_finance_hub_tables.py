"""Clinical Finance Hub — invoices, patient payments, insurance claims.

Revision ID: 025_finance_hub_tables
Revises: 024_settings_schema
Create Date: 2026-04-18

Adds tables used by apps/web Clinical Finance Hub (apps/web/src/pages-clinical-hubs.js
`pgFinanceHub`) which previously stored everything in localStorage under
`ds_finance_v1`. Backed by apps/api/app/routers/finance_router.py
(`/api/v1/finance/...`) and apps/api/app/repositories/finance.py.

Tables:
  - invoices          : billable line items with VAT + running paid total
  - patient_payments  : payment rows (card/bacs/cash/...) optionally linked to an invoice
  - insurance_claims  : pre-auth / reimbursement lifecycle (draft → paid)

Indexes are scoped by (clinician_id, *) so multi-tenant lookups stay cheap.
"""
from alembic import op
import sqlalchemy as sa


revision = "025_finance_hub_tables"
down_revision = "024_settings_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── invoices ─────────────────────────────────────────────────────────────
    op.create_table(
        "invoices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("invoice_number", sa.String(32), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=True),
        sa.Column("patient_name", sa.String(255), nullable=False),
        sa.Column("service", sa.String(500), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("vat_rate", sa.Float(), nullable=False, server_default="0.20"),
        sa.Column("vat", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("paid", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="GBP"),
        sa.Column("issue_date", sa.String(20), nullable=False),
        sa.Column("due_date", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["patient_id"], ["patients.id"],
            name="fk_invoices_patient_id",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('draft','sent','paid','overdue','partial','void')",
            name="ck_invoices_status",
        ),
        sa.UniqueConstraint(
            "clinician_id", "invoice_number",
            name="uq_invoices_clinician_number",
        ),
    )
    op.create_index("ix_invoices_clinician_id", "invoices", ["clinician_id"])
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"])
    op.create_index("ix_invoices_patient_id", "invoices", ["patient_id"])
    op.create_index(
        "ix_invoices_clinician_status", "invoices", ["clinician_id", "status"]
    )
    op.create_index(
        "ix_invoices_clinician_issue_date",
        "invoices", ["clinician_id", "issue_date"],
    )

    # ── patient_payments ─────────────────────────────────────────────────────
    op.create_table(
        "patient_payments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("invoice_id", sa.String(36), nullable=True),
        sa.Column("patient_name", sa.String(255), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("method", sa.String(30), nullable=False, server_default="card"),
        sa.Column("reference", sa.String(64), nullable=True),
        sa.Column("payment_date", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["invoice_id"], ["invoices.id"],
            name="fk_patient_payments_invoice_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_patient_payments_clinician_id", "patient_payments", ["clinician_id"]
    )
    op.create_index(
        "ix_patient_payments_invoice_id", "patient_payments", ["invoice_id"]
    )

    # ── insurance_claims ─────────────────────────────────────────────────────
    op.create_table(
        "insurance_claims",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("claim_number", sa.String(32), nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=True),
        sa.Column("patient_name", sa.String(255), nullable=False),
        sa.Column("insurer", sa.String(120), nullable=False),
        sa.Column("policy_number", sa.String(60), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("submitted_date", sa.String(20), nullable=True),
        sa.Column("decision_date", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["patient_id"], ["patients.id"],
            name="fk_insurance_claims_patient_id",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "status IN ('draft','submitted','pending','approved','rejected','paid')",
            name="ck_insurance_status",
        ),
    )
    op.create_index(
        "ix_insurance_claims_clinician_id", "insurance_claims", ["clinician_id"]
    )
    op.create_index(
        "ix_insurance_claims_claim_number", "insurance_claims", ["claim_number"]
    )
    op.create_index(
        "ix_insurance_claims_patient_id", "insurance_claims", ["patient_id"]
    )
    op.create_index(
        "ix_insurance_claims_clinician_status",
        "insurance_claims", ["clinician_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_insurance_claims_clinician_status", table_name="insurance_claims")
    op.drop_index("ix_insurance_claims_patient_id", table_name="insurance_claims")
    op.drop_index("ix_insurance_claims_claim_number", table_name="insurance_claims")
    op.drop_index("ix_insurance_claims_clinician_id", table_name="insurance_claims")
    op.drop_table("insurance_claims")

    op.drop_index("ix_patient_payments_invoice_id", table_name="patient_payments")
    op.drop_index("ix_patient_payments_clinician_id", table_name="patient_payments")
    op.drop_table("patient_payments")

    op.drop_index("ix_invoices_clinician_issue_date", table_name="invoices")
    op.drop_index("ix_invoices_clinician_status", table_name="invoices")
    op.drop_index("ix_invoices_patient_id", table_name="invoices")
    op.drop_index("ix_invoices_invoice_number", table_name="invoices")
    op.drop_index("ix_invoices_clinician_id", table_name="invoices")
    op.drop_table("invoices")

"""pgvector extension + kg_entities MRI seed + extra KG columns.

Postgres-specific enhancements for the knowledge-graph layer:

1. Enable ``pgvector`` so embedding columns can use native ``vector(200)``
   types + HNSW indices out-of-band. The extension creation is wrapped in
   a try/except because (a) the SQLite test DB has no concept of extensions
   and (b) some managed Postgres hosts require operator-level privileges
   to ``CREATE EXTENSION``; we surface a warning rather than failing the
   migration in either case.

2. Widen ``kg_entities`` with ``canonical_name`` / ``code`` / ``label``
   columns (nullable) so the seed payload from
   ``packages/mri-pipeline/medrag_extensions/05_seed_mri_entities.py``
   matches the table shape. A unique index on (``type``, ``canonical_name``)
   is added so subsequent seeds can use ``ON CONFLICT`` idempotency — but
   only on Postgres, because SQLite's partial-index semantics differ.

3. Seed the canonical MRI-Analyzer KG entities (18 region_metric, 7
   network_metric, 3 mri_biomarker). Idempotent: each insert is guarded
   by ``ON CONFLICT DO NOTHING``.

Revision ID: 040_pgvector_mri_seed
Revises: 039_mri_analyses
Create Date: 2026-04-24
"""
from __future__ import annotations

import logging

from alembic import op
import sqlalchemy as sa


# Revision identifiers, used by Alembic.
revision = "040_pgvector_mri_seed"
down_revision = "039_mri_analyses"
branch_labels = None
depends_on = None

log = logging.getLogger(__name__)


# Canonical MRI KG entities — mirrors packages/mri-pipeline/medrag_extensions/
# 05_seed_mri_entities.py exactly. Kept inline so the migration is
# self-contained and can run without the sibling package installed.
REGION_METRICS: list[tuple[str, str, str]] = [
    ("hippocampus_volume",     "hippocampus_vol",  "Hippocampal volume"),
    ("amygdala_volume",        "amygdala_vol",     "Amygdala volume"),
    ("thalamus_volume",        "thalamus_vol",     "Thalamic volume"),
    ("caudate_volume",         "caudate_vol",      "Caudate volume"),
    ("putamen_volume",         "putamen_vol",      "Putamen volume"),
    ("ventricular_volume",     "ventricle_vol",    "Ventricular volume"),
    ("dlpfc_thickness",        "dlpfc_thick",      "Left DLPFC cortical thickness"),
    ("acc_thickness",          "acc_thick",        "Anterior cingulate cortex thickness"),
    ("entorhinal_thickness",   "entorhinal_thick", "Entorhinal cortex thickness"),
    ("precuneus_thickness",    "precuneus_thick",  "Precuneus thickness"),
    ("insula_thickness",       "insula_thick",     "Insula thickness"),
    ("wmh_volume",             "wmh_vol",          "White-matter hyperintensity burden"),
    ("icv",                    "icv",              "Intracranial volume"),
    ("AF_L_FA",                "af_l_fa",          "Left arcuate fasciculus FA"),
    ("CST_L_FA",               "cst_l_fa",         "Left corticospinal tract FA"),
    ("UF_L_FA",                "uf_l_fa",          "Left uncinate fasciculus FA"),
    ("CG_L_FA",                "cg_l_fa",          "Left cingulum FA"),
    ("FX_L_FA",                "fx_l_fa",          "Left fornix FA"),
]

NETWORK_METRICS: list[tuple[str, str, str]] = [
    ("DMN_within_fc",               "dmn_within",       "Default-mode within-network FC"),
    ("SN_within_fc",                "sn_within",        "Salience within-network FC"),
    ("CEN_within_fc",               "cen_within",       "Central-executive within-network FC"),
    ("SMN_within_fc",               "smn_within",       "Somatomotor within-network FC"),
    ("Language_within_fc",          "lang_within",      "Language within-network FC"),
    ("sgACC_DLPFC_anticorrelation", "sgacc_dlpfc_anti", "sgACC–DLPFC anticorrelation"),
    ("DMN_SN_between_fc",           "dmn_sn_between",   "DMN–SN between-network FC"),
]

MRI_BIOMARKERS: list[tuple[str, str, str]] = [
    ("global_atrophy_score", "gas",          "Global atrophy score"),
    ("amyloid_surrogate",    "amyloid_surr", "Amyloid burden surrogate (MRI-derived)"),
    ("tau_surrogate",        "tau_surr",     "Tau burden surrogate (MRI-derived)"),
]

ALL_ENTITIES: list[tuple[str, str, str, str]] = (
    [("region_metric", n, c, l)  for n, c, l in REGION_METRICS]
    + [("network_metric", n, c, l) for n, c, l in NETWORK_METRICS]
    + [("mri_biomarker", n, c, l)  for n, c, l in MRI_BIOMARKERS]
)


def upgrade() -> None:
    """Apply the pgvector + KG seed enhancements.

    Each step is individually guarded — failures in any one step produce a
    logged warning but do not abort the whole migration, because the
    application code tolerates their absence (HAS_PGVECTOR / stub RAG path).
    """
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("040 running on dialect=%s", dialect)

    # ── Step 1: pgvector extension ────────────────────────────────────────
    if dialect == "postgresql":
        try:
            op.execute("CREATE EXTENSION IF NOT EXISTS vector")
            log.info("pgvector extension enabled")
        except Exception as exc:                                  # noqa: BLE001
            log.warning(
                "CREATE EXTENSION vector failed (host may require superuser): %s",
                exc,
            )
    else:
        log.info("dialect=%s — pgvector step skipped", dialect)

    # ── Step 2: widen kg_entities ────────────────────────────────────────
    # Add canonical_name / code / label on both Postgres + SQLite. All
    # nullable so existing rows remain valid.
    for col_name, col_type in (
        ("canonical_name", sa.Text()),
        ("code",           sa.String(64)),
        ("label",          sa.Text()),
    ):
        try:
            op.add_column("kg_entities", sa.Column(col_name, col_type, nullable=True))
            log.info("added kg_entities.%s", col_name)
        except Exception as exc:                                  # noqa: BLE001
            # Column may already exist on a re-run, or the table may be
            # missing if 038 didn't land (shouldn't happen in-chain).
            log.warning("add_column kg_entities.%s skipped: %s", col_name, exc)

    # Unique (type, canonical_name) — Postgres only; SQLite rebuilds
    # tables on ALTER and we don't need this for the in-process test path.
    if dialect == "postgresql":
        try:
            op.create_index(
                "ux_kg_entities_type_canonical",
                "kg_entities",
                ["type", "canonical_name"],
                unique=True,
                postgresql_where=sa.text("canonical_name IS NOT NULL"),
            )
            log.info("unique index on (type, canonical_name) created")
        except Exception as exc:                                  # noqa: BLE001
            log.warning("unique index creation skipped: %s", exc)

    # ── Step 3: seed the MRI KG entities ─────────────────────────────────
    # Use a manual INSERT ... WHERE NOT EXISTS to stay portable. Postgres
    # could use ON CONFLICT DO NOTHING, but the conditional form also works
    # in SQLite and produces the same idempotent result.
    for etype, name, code, label in ALL_ENTITIES:
        try:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO kg_entities (type, name, canonical_name, code, label)
                    SELECT :etype, :name, :canonical_name, :code, :label
                    WHERE NOT EXISTS (
                        SELECT 1 FROM kg_entities
                        WHERE type = :etype
                          AND (canonical_name = :canonical_name
                               OR (canonical_name IS NULL AND name = :name))
                    )
                    """
                ),
                {
                    "etype": etype,
                    "name": name,
                    "canonical_name": name,
                    "code": code,
                    "label": label,
                },
            )
        except Exception as exc:                                  # noqa: BLE001
            log.warning("seed insert failed for %s/%s: %s", etype, name, exc)

    log.info("seeded %d MRI KG entities (idempotent)", len(ALL_ENTITIES))


def downgrade() -> None:
    """Reverse the seed + column widening.

    The pgvector extension itself is deliberately NOT dropped — other
    components of the stack (papers embeddings, qEEG embeddings) depend
    on it and the operator should manage the extension lifecycle.
    """
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("040 downgrade on dialect=%s", dialect)

    # Unseed.
    for etype, name, _code, _label in ALL_ENTITIES:
        try:
            bind.execute(
                sa.text(
                    "DELETE FROM kg_entities WHERE type = :etype AND "
                    "(canonical_name = :name OR name = :name)"
                ),
                {"etype": etype, "name": name},
            )
        except Exception as exc:                                  # noqa: BLE001
            log.warning("unseed %s/%s skipped: %s", etype, name, exc)

    if dialect == "postgresql":
        try:
            op.drop_index("ux_kg_entities_type_canonical", table_name="kg_entities")
        except Exception as exc:                                  # noqa: BLE001
            log.warning("drop_index skipped: %s", exc)

    for col_name in ("label", "code", "canonical_name"):
        try:
            op.drop_column("kg_entities", col_name)
        except Exception as exc:                                  # noqa: BLE001
            log.warning("drop_column kg_entities.%s skipped: %s", col_name, exc)

"""
Seed the kg_entities table with MRI-specific region/network metric entities.

Run after 04_migration_mri.sql. Idempotent (UPSERT by (type, canonical_name)).

Usage:
    DEEPSYNAPS_DSN=postgresql://... python medrag_extensions/05_seed_mri_entities.py
"""
from __future__ import annotations

import logging
import os
import sys

log = logging.getLogger("seed_mri")


# ---------------------------------------------------------------------------
# Entity catalogue
# ---------------------------------------------------------------------------
REGION_METRICS: list[tuple[str, str, str]] = [
    # (canonical_name, code, friendly_label)
    ("hippocampus_volume",       "hippocampus_vol",   "Hippocampal volume"),
    ("amygdala_volume",          "amygdala_vol",      "Amygdala volume"),
    ("thalamus_volume",          "thalamus_vol",      "Thalamic volume"),
    ("caudate_volume",           "caudate_vol",       "Caudate volume"),
    ("putamen_volume",           "putamen_vol",       "Putamen volume"),
    ("ventricular_volume",       "ventricle_vol",     "Ventricular volume"),
    ("dlpfc_thickness",          "dlpfc_thick",       "Left DLPFC cortical thickness"),
    ("acc_thickness",            "acc_thick",         "Anterior cingulate cortex thickness"),
    ("entorhinal_thickness",     "entorhinal_thick",  "Entorhinal cortex thickness"),
    ("precuneus_thickness",      "precuneus_thick",   "Precuneus thickness"),
    ("insula_thickness",         "insula_thick",      "Insula thickness"),
    ("wmh_volume",               "wmh_vol",           "White-matter hyperintensity burden"),
    ("icv",                      "icv",               "Intracranial volume"),
    # DTI bundle FA
    ("AF_L_FA",   "af_l_fa",   "Left arcuate fasciculus FA"),
    ("CST_L_FA",  "cst_l_fa",  "Left corticospinal tract FA"),
    ("UF_L_FA",   "uf_l_fa",   "Left uncinate fasciculus FA"),
    ("CG_L_FA",   "cg_l_fa",   "Left cingulum FA"),
    ("FX_L_FA",   "fx_l_fa",   "Left fornix FA"),
]

NETWORK_METRICS: list[tuple[str, str, str]] = [
    ("DMN_within_fc",                    "dmn_within",        "Default-mode within-network FC"),
    ("SN_within_fc",                     "sn_within",         "Salience within-network FC"),
    ("CEN_within_fc",                    "cen_within",        "Central-executive within-network FC"),
    ("SMN_within_fc",                    "smn_within",        "Somatomotor within-network FC"),
    ("Language_within_fc",               "lang_within",       "Language within-network FC"),
    ("sgACC_DLPFC_anticorrelation",      "sgacc_dlpfc_anti",  "sgACC–DLPFC anticorrelation"),
    ("DMN_SN_between_fc",                "dmn_sn_between",    "DMN–SN between-network FC"),
]

MRI_BIOMARKERS: list[tuple[str, str, str]] = [
    ("global_atrophy_score", "gas",            "Global atrophy score"),
    ("amyloid_surrogate",    "amyloid_surr",   "Amyloid burden surrogate (MRI-derived)"),
    ("tau_surrogate",        "tau_surr",       "Tau burden surrogate (MRI-derived)"),
]


UPSERT_SQL = """
INSERT INTO kg_entities (type, canonical_name, code, label)
VALUES (%s, %s, %s, %s)
ON CONFLICT (type, canonical_name) DO UPDATE
  SET code = EXCLUDED.code,
      label = EXCLUDED.label
RETURNING entity_id;
"""


def seed(dsn: str | None = None) -> int:
    import psycopg

    dsn = dsn or os.environ.get("DEEPSYNAPS_DSN", "postgresql://localhost:5432/deepsynaps")
    total = 0
    with psycopg.connect(dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            for name, code, label in REGION_METRICS:
                cur.execute(UPSERT_SQL, ("region_metric", name, code, label))
                total += 1
            for name, code, label in NETWORK_METRICS:
                cur.execute(UPSERT_SQL, ("network_metric", name, code, label))
                total += 1
            for name, code, label in MRI_BIOMARKERS:
                cur.execute(UPSERT_SQL, ("mri_biomarker", name, code, label))
                total += 1
        conn.commit()
    log.info("Seeded %d MRI entities.", total)
    return total


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s :: %(message)s")
    try:
        n = seed()
        print(f"seeded={n}")
    except Exception as e:                                         # noqa: BLE001
        log.error("seed failed: %s", e)
        sys.exit(1)

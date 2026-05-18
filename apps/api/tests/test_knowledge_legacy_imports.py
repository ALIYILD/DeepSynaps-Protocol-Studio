from __future__ import annotations

import importlib


def test_phase1_and_phase2_compatibility_wrappers_import() -> None:
    modules = [
        "app.knowledge.rxnorm_adapter",
        "app.knowledge.pharmgkb_adapter",
        "app.knowledge.clinvar_adapter",
        "app.knowledge.loinc_adapter",
        "app.knowledge.openfda_adapter",
        "app.knowledge.chbmp_adapter",
        "app.knowledge.mni_atlas_adapter",
        "app.knowledge.promis_adapter",
        "app.knowledge.simnibs_adapter",
        "app.knowledge.faers_adapter",
        "app.knowledge.onsides_adapter",
        "app.knowledge.allen_brain_adapter",
        "app.knowledge.schaefer_adapter",
        "app.knowledge.neurosynth_adapter",
        "app.knowledge.adni_adapter",
        "app.knowledge.abide_adapter",
    ]

    for module_name in modules:
        module = importlib.import_module(module_name)
        assert module is not None

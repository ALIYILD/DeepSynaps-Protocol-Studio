"""Slim-install import smoke test.

Mirrors the contract used by ``deepsynaps_qeeg`` and
``deepsynaps_mri``: the metadata + schema layer must import cleanly
without any of the heavy clinical extras (parselmouth, librosa,
opensmile, faster-whisper, weasyprint).
"""

from __future__ import annotations


def test_top_level_import() -> None:
    import deepsynaps_audio

    assert deepsynaps_audio.__version__


def test_schemas_import() -> None:
    from deepsynaps_audio import schemas  # noqa: F401


def test_constants_import() -> None:
    from deepsynaps_audio.constants import TASK_PROTOCOLS, QC_DEFAULTS

    assert "sustained_vowel_a" in TASK_PROTOCOLS
    assert "ddk_pataka" in TASK_PROTOCOLS
    assert QC_DEFAULTS["snr_warn_db"] > QC_DEFAULTS["snr_fail_db"]


def test_subpackage_modules_import() -> None:
    # We only exercise the import surfaces — every public function is a
    # NotImplementedError stub at this milestone.
    from deepsynaps_audio import (
        ingestion,
        quality,
        clinical_indices,
        longitudinal,
        pipeline,
        api,
        worker,
        db,
        cli,
    )
    from deepsynaps_audio import analyzers

    assert all(
        m is not None
        for m in (
            ingestion,
            quality,
            clinical_indices,
            longitudinal,
            pipeline,
            api,
            worker,
            db,
            cli,
            analyzers,
        )
    )


def test_cli_version(capsys) -> None:  # type: ignore[no-untyped-def]
    from deepsynaps_audio.cli import main

    rc = main(["version"])
    assert rc == 0
    out = capsys.readouterr().out.strip()
    assert out  # non-empty version string

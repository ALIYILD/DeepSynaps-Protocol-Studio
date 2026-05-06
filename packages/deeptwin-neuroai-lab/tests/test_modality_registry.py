from deeptwin_neuroai_lab.modality_registry import MODALITY_REGISTRY, get_entry
from deeptwin_neuroai_lab.schemas import Modality


def test_registry_covers_modalities():
    assert Modality.eeg in MODALITY_REGISTRY
    assert MODALITY_REGISTRY[Modality.video].safety_notes


def test_get_entry():
    e = get_entry(Modality.qeeg)
    assert e is not None
    assert "EDF" in e.accepted_input_formats

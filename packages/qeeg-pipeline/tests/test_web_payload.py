import sys
from pathlib import Path

import numpy as np


def test_payload_shape():
    # Ensure `src/` is importable when tests run without editable install.
    pkg_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(pkg_root / "src"))

    from deepsynaps_qeeg.viz import web_payload

    # Seed a fake cached mesh so the test is hermetic (no fsaverage downloads).
    n_lh = 6001
    n_rh = 6001
    n = n_lh + n_rh
    positions = np.random.RandomState(0).randn(n, 3).astype(np.float32)
    indices = np.random.RandomState(1).randint(0, n, size=(40000, 3), dtype=np.int32)

    mesh = web_payload._Mesh(positions=positions, indices=indices[:30000], n_lh=n_lh, n_rh=n_rh)
    web_payload._MESH_CACHE[("TEST_SUBJECTS_DIR", "fsaverage", web_payload.DEFAULT_SURF)] = mesh

    stc_dict = {
        "alpha": {"lh": np.linspace(0, 1, n_lh, dtype=np.float32), "rh": np.linspace(1, 0, n_rh, dtype=np.float32)},
        "TBR": {"lh": np.ones(n_lh, dtype=np.float32) * 0.5, "rh": np.ones(n_rh, dtype=np.float32) * 0.5},
    }

    payload = web_payload.build_brain_payload(stc_dict, subjects_dir="TEST_SUBJECTS_DIR", subject="fsaverage")

    assert payload["version"] == 1
    assert "mesh" in payload
    assert "bands" in payload
    assert "luts" in payload

    mesh_out = payload["mesh"]
    assert mesh_out["n_lh"] == n_lh
    assert mesh_out["n_rh"] == n_rh
    assert len(mesh_out["positions"]) == 3 * n
    assert len(mesh_out["indices"]) > 0
    assert mesh_out["n_lh"] + mesh_out["n_rh"] > 10_000

    alpha = payload["bands"]["alpha"]
    assert "power" in alpha and "z" in alpha
    assert len(alpha["power"]) == n
    assert len(alpha["z"]) == n


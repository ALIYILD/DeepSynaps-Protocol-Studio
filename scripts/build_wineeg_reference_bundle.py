#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXTERNAL = ROOT / "external_knowledge" / "wineeg" / "manuals"
DEFAULT_OUTPUT = ROOT / "packages" / "qeeg-pipeline" / "src" / "deepsynaps_qeeg" / "knowledge" / "wineeg_reference_manifest.json"
EXPECTED_FILES = ("WinEEGQuickStart.pdf", "WinEEGEnglish.PDF", "History3x.docx")


def build_manifest(source_dir: Path) -> dict:
    files = []
    for name in EXPECTED_FILES:
      path = source_dir / name
      files.append(
          {
              "name": name,
              "present": path.exists(),
              "size_bytes": path.stat().st_size if path.exists() else None,
          }
      )
    return {
        "source": str(source_dir),
        "expected_files": files,
        "reference_only": True,
        "native_file_ingestion": False,
        "note": "This script records presence/provenance only. It does not copy proprietary manual text or installers into the repo.",
    }


def main() -> int:
    source_dir = DEFAULT_EXTERNAL
    output_path = DEFAULT_OUTPUT
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest(source_dir)
    output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    readme_path = output_path.with_suffix(".txt")
    readme_path.write_text(
        "Place WinEEG manuals in external_knowledge/wineeg/manuals/ if you want to regenerate provenance.\n"
        "Expected files: " + ", ".join(EXPECTED_FILES) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = Path("/Users/aliyildirim/Library/CloudStorage/OneDrive-Personal/Desktop/QEEG GERMANY FILES")
BUNDLE_DATE = "2026-04-30"
IMPORT_ROOT = REPO_ROOT / "data" / "imports" / "qeeg-sessions" / BUNDLE_DATE
RUNTIME_ROOT = REPO_ROOT / "data" / "courseware" / "knowledge-kb"


def title_from_path(path: Path) -> str:
    name = path.stem
    name = re.sub(r"[_-]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:1].upper() + name[1:] if name else path.name


def anon_id(prefix: str, value: str, size: int = 10) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:size]
    return f"{prefix}-{digest}"


def parse_session_info(path: Path) -> dict[str, str]:
    parts = path.parts
    city = parts[0] if len(parts) > 0 else ""
    day = parts[1] if len(parts) > 1 else ""
    person = parts[2] if len(parts) > 2 else ""
    study = parts[3] if len(parts) > 3 else ""
    return {
        "city": city,
        "day_bucket": day,
        "person_label": person,
        "study_folder": study,
    }


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build(source_root: Path = DEFAULT_SOURCE_ROOT) -> dict:
    IMPORT_ROOT.mkdir(parents=True, exist_ok=True)
    RUNTIME_ROOT.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    session_map: dict[str, list[dict]] = defaultdict(list)
    for path in sorted(source_root.rglob("*")):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix not in {".edf", ".eeg", ".docx", ".cfg", ".par", ".exe", ".dll", ".inf"}:
            continue
        rel = path.relative_to(source_root)
        info = parse_session_info(rel)
        raw_session_key = "/".join([info["city"], info["day_bucket"], info["person_label"], info["study_folder"]]).strip("/")
        site_id = anon_id("site", info["city"] or "unknown", 8)
        day_id = anon_id("day", info["day_bucket"] or "unknown", 8)
        participant_id = anon_id("participant", info["person_label"] or "unknown", 10)
        session_id = anon_id("session", raw_session_key or str(rel.parent), 12)
        asset_label = (
            "participant-note.docx" if suffix == ".docx"
            else "recording.edf" if suffix == ".edf"
            else "recording.eeg" if suffix == ".eeg"
            else f"support{suffix}"
        )
        row = {
            "asset_id": anon_id("asset", str(rel), 12),
            "asset_label": asset_label,
            "title": title_from_path(path) if suffix not in {".docx"} else "Participant note",
            "extension": suffix,
            "bytes": path.stat().st_size,
            "site_id": site_id,
            "day_id": day_id,
            "participant_id": participant_id,
            "session_id": session_id,
            "asset_role": "participant_note" if suffix == ".docx" else "signal_recording" if suffix in {".edf", ".eeg"} else "support_file",
        }
        rows.append(row)
        session_map[session_id].append(row)

    write_csv(
        IMPORT_ROOT / "qeeg_session_assets.csv",
        ["asset_id", "asset_label", "title", "extension", "bytes", "site_id", "day_id", "participant_id", "session_id", "asset_role"],
        rows,
    )

    sessions = []
    for session_id, items in sorted(session_map.items()):
        ext_counts = Counter(item["extension"] for item in items)
        sessions.append(
            {
                "session_id": session_id,
                "site_id": items[0]["site_id"],
                "day_id": items[0]["day_id"],
                "participant_id": items[0]["participant_id"],
                "asset_count": len(items),
                "edf_count": ext_counts.get(".edf", 0),
                "eeg_count": ext_counts.get(".eeg", 0),
                "docx_count": ext_counts.get(".docx", 0),
                "support_file_count": len(items) - ext_counts.get(".edf", 0) - ext_counts.get(".eeg", 0) - ext_counts.get(".docx", 0),
                "representative_assets": [item["asset_label"] for item in items[:6]],
            }
        )

    payload = {
        "schema_version": "1.0.0",
        "resource_slug": "qeeg-germany-session-library",
        "resource_name": "qEEG Germany Session Library",
        "source_bundle_date": BUNDLE_DATE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_root": str(source_root),
        "session_count": len(sessions),
        "asset_count": len(rows),
        "site_distribution": [
            {"label": label, "count": count}
            for label, count in Counter(item["site_id"] for item in rows if item["site_id"]).most_common()
        ],
        "filetype_distribution": [
            {"label": label, "count": count}
            for label, count in Counter(item["extension"] for item in rows).most_common()
        ],
        "session_summaries": sessions[:120],
        "integration_notes": [
            "This library maps the current OneDrive QEEG GERMANY FILES tree into DeepSynaps-readable session metadata.",
            "Participant names and raw session paths are anonymized before anything is written into the repo.",
            "It is intended for qEEG raw-workbench fixtures, sample-session routing, parser testing, and analyzer-side provenance awareness.",
            "The asset registry includes EDF, EEG, DOCX, and support files bundled with each session folder.",
        ],
    }
    (RUNTIME_ROOT / "qeeg-germany-session-library.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest = {
        "bundle_name": "qeeg-germany-session-library",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_bundle": str(source_root),
        "outputs": {
            "assets": len(rows),
            "sessions": len(sessions),
        },
    }
    (IMPORT_ROOT / "qeeg_session_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    source_root = Path(__import__("sys").argv[1]).expanduser() if len(__import__("sys").argv) > 1 else DEFAULT_SOURCE_ROOT
    payload = build(source_root)
    print(json.dumps({"asset_count": payload["asset_count"], "session_count": payload["session_count"]}, indent=2))

#!/usr/bin/env python3

from __future__ import annotations

import csv
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BUNDLE_DATE = "2026-04-30"
IMPORT_ROOT = REPO_ROOT / "data" / "imports" / "courseware" / BUNDLE_DATE
RUNTIME_ROOT = REPO_ROOT / "data" / "courseware" / "knowledge-kb"
DEFAULT_SOURCE_ROOT = Path("/Users/aliyildirim/Desktop/USA COURSES/QEEG COURSE")


@dataclass(frozen=True)
class SourceAsset:
    asset_id: str
    label: str
    kind: str
    relative_path: str
    hydrated: bool
    pages: int | None
    bytes: int | None
    note: str


@dataclass(frozen=True)
class ResearchAsset:
    asset_id: str
    title: str
    kind: str
    relative_path: str
    hydrated: bool
    pages: int | None
    bytes: int | None
    year: int | None
    lead_author: str
    topical_tags: tuple[str, ...]
    analyzer_use: str
    agent_use: str
    note: str


def anon_id(prefix: str, value: str, size: int = 12) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:size]
    return f"{prefix}-{digest}"


def extract_pdf_text(path: Path) -> tuple[int | None, str]:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return None, ""
    try:
        reader = PdfReader(str(path))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        return len(reader.pages), text.replace("\x00", " ")
    except Exception:
        return None, ""


def resolve_one(pattern: str, search_root: Path) -> Path:
    matches = sorted(search_root.glob(pattern))
    if not matches:
        return search_root / pattern
    return matches[0]


def first_heading_lines(text: str, limit: int = 12) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()
    for raw in text.splitlines():
        line = " ".join(raw.split()).strip()
        if not line:
            continue
        if len(line) > 180:
            line = line[:177] + "..."
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        lines.append(line)
        if len(lines) >= limit:
            break
    return lines


def sentence_excerpt(text: str, limit: int = 2) -> str:
    cleaned = " ".join(text.replace("\x00", " ").split())
    if not cleaned:
        return ""
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    if not parts:
        return ""
    excerpt = " ".join(parts[:limit])
    words = excerpt.split()
    if len(words) > 90:
        return " ".join(words[:90]) + " ..."
    return excerpt


def normalize_stem(stem: str) -> str:
    out = re.sub(r"\s*-\s*copy\b", "", stem, flags=re.IGNORECASE)
    out = re.sub(r"\s*\(\d+\)$", "", out)
    out = re.sub(r"\s+", " ", out)
    return out.strip()


def is_teaching_or_admin_pdf(name: str) -> bool:
    lower = name.lower()
    skip_markers = (
        "pptx",
        "schedule",
        "exam",
        "contact sheet",
        "checklist",
        "manual",
        "must have manuals",
    )
    return any(marker in lower for marker in skip_markers)


def classify_research_kind(name: str) -> str:
    lower = name.lower()
    if "articlesummary" in lower:
        return "article_summary"
    if "chart" in lower or "form" in lower:
        return "reference_sheet"
    return "research_pdf"


def infer_tags_and_usage(title: str, text: str) -> tuple[tuple[str, ...], str, str]:
    blob = f"{title}\n{text}".lower()
    rules = [
        ("psychopharmacology", ("drug", "medication", "gabapentin", "carbamazepine", "stimulant", "half life", "half-life")),
        ("artifact", ("artifact", "ica", "independent eeg sources")),
        ("connectivity", ("coherence", "synchronization", "interhemispheric", "connectivity", "phase")),
        ("adhd", ("adhd", "attention deficit")),
        ("autism", ("autism", "autistic")),
        ("dementia", ("alzheimer", "cognitive impairment", "encephalopathy")),
        ("gamma", ("gamma",)),
        ("reading", ("dyslexia", "reading", "stuttering")),
        ("neurofeedback", ("neurofeedback", "neurotherapy")),
        ("reporting", ("assessment", "brain mapping", "report")),
    ]
    tags = [tag for tag, needles in rules if any(needle in blob for needle in needles)]
    if not tags:
        tags = ["general_qeeg"]

    analyzer_use = "Use when grounding analyzer explanations in local qEEG literature before making higher-level pattern claims."
    agent_use = "Use as repo-native evidence for qEEG copilot responses and workflow guardrails before falling back to external retrieval."
    if "psychopharmacology" in tags:
        analyzer_use = "Use when beta excess, slowing, or altered arousal may be medication- or stimulant-related rather than intrinsic dysfunction."
        agent_use = "Use for medication and substance-confound explanations in analyzer, raw-review, and report narratives."
    elif "artifact" in tags:
        analyzer_use = "Use when separating source-level or ICA-style artifact reasoning from brain-based findings."
        agent_use = "Use for artifact-reduction guidance when AI or staff need literature support for rejecting contaminated segments."
    elif "connectivity" in tags:
        analyzer_use = "Use when coherence, phase, or interhemispheric findings need local literature context."
        agent_use = "Use for network/connectivity explanations in copilot and reporting prompts."
    elif "dementia" in tags:
        analyzer_use = "Use when slowing or synchronization changes resemble cognitive-decline or encephalopathy literature patterns."
        agent_use = "Use for cautious dementia/MCI-style research context without turning similarity into diagnosis."
    return tuple(tags), analyzer_use, agent_use


def asset_rows(source_root: Path) -> tuple[list[SourceAsset], dict[str, tuple[int | None, str]]]:
    rels = [
        ("EEGFrequenciesandTypicalWaveforms*.pdf", "eeg-frequencies-waveforms", "eeg-frequencies-waveforms.pdf"),
        ("PsychopharmacologicalPart1*.pdf", "psychopharmacology-part-1", "psychopharmacology-part-1.pdf"),
        ("PsychopharmacologicalPart2*.pdf", "psychopharmacology-part-2", "psychopharmacology-part-2.pdf"),
        ("IdentifyingandReducingArtifacts*.pdf", "artifact-reduction", "artifact-reduction.pdf"),
        ("InterpretingqEEGTopographicMaps*.pdf", "topographic-maps", "topographic-maps.pdf"),
        ("QEEGAnalysisHowtoWriteaReport*.pdf", "qeeg-report-writing", "qeeg-report-writing.pdf"),
        ("QEEGEthicsandProfessionalConductPart1*.pdf", "ethics-part-1", "ethics-part-1.pdf"),
        ("QEEGEthicsandProfessionalConductPart2*.pdf", "ethics-part-2", "ethics-part-2.pdf"),
        ("EfficacyCriteriaforqEEG*.pdf", "efficacy-criteria", "efficacy-criteria.pdf"),
        ("AbnormalEEGPatterns*.pdf", "abnormal-eeg-patterns", "abnormal-eeg-patterns.pdf"),
    ]
    assets: list[SourceAsset] = []
    extracted: dict[str, tuple[int | None, str]] = {}
    for pattern, label, export_name in rels:
        path = resolve_one(pattern, source_root)
        hydrated = False
        pages = None
        size = None
        note = "Source file not found."
        rel = export_name
        if path.exists():
            rel = path.relative_to(source_root).as_posix()
            size = path.stat().st_size
            try:
                with path.open("rb") as handle:
                    handle.read(16)
                hydrated = True
                note = "Readable local file."
            except Exception:
                note = "Unreadable source file."
            if hydrated and path.suffix.lower() == ".pdf":
                pages, text = extract_pdf_text(path)
                extracted[label] = (pages, text)
            else:
                extracted[label] = (None, "")
        else:
            extracted[label] = (None, "")
        assets.append(
            SourceAsset(
                asset_id=anon_id("asset", label),
                label=label,
                kind="course_pdf",
                relative_path=export_name,
                hydrated=hydrated,
                pages=pages,
                bytes=size,
                note=note if not path.exists() else f"{note} Source file: {rel}",
            )
        )
    return assets, extracted


def discover_research_assets(source_root: Path) -> tuple[list[ResearchAsset], list[dict[str, object]]]:
    candidates: dict[str, Path] = {}
    for path in sorted(source_root.glob("*.pdf")):
        if is_teaching_or_admin_pdf(path.name):
            continue
        key = normalize_stem(path.stem).lower()
        chosen = candidates.get(key)
        if chosen is None:
            candidates[key] = path
            continue
        if "copy" in chosen.name.lower() and "copy" not in path.name.lower():
            candidates[key] = path
            continue
        if re.search(r"\(\d+\)\.pdf$", chosen.name, re.IGNORECASE) and not re.search(
            r"\(\d+\)\.pdf$", path.name, re.IGNORECASE
        ):
            candidates[key] = path

    assets: list[ResearchAsset] = []
    runtime_items: list[dict[str, object]] = []
    for path in candidates.values():
        hydrated = False
        pages = None
        text = ""
        size = path.stat().st_size if path.exists() else None
        note = "Unreadable source file."
        try:
            with path.open("rb") as handle:
                handle.read(16)
            hydrated = True
            note = "Readable local file."
        except Exception:
            pass
        if hydrated:
            pages, text = extract_pdf_text(path)

        headings = first_heading_lines(text, limit=10)
        title = headings[0] if headings else normalize_stem(path.stem)
        match = re.match(r"([A-Za-z]+).*?((?:19|20)\d{2})", path.stem)
        lead_author = match.group(1) if match else "Local course"
        year = int(match.group(2)) if match else None
        tags, analyzer_use, agent_use = infer_tags_and_usage(title, text)
        kind = classify_research_kind(path.name)

        asset = ResearchAsset(
            asset_id=anon_id("paper", path.name),
            title=title,
            kind=kind,
            relative_path=path.relative_to(source_root).as_posix(),
            hydrated=hydrated,
            pages=pages,
            bytes=size,
            year=year,
            lead_author=lead_author,
            topical_tags=tags,
            analyzer_use=analyzer_use,
            agent_use=agent_use,
            note=f"{note} Source file: {path.name}",
        )
        assets.append(asset)
        runtime_items.append(
            {
                "paper_id": asset.asset_id,
                "title": title,
                "kind": kind,
                "lead_author": lead_author,
                "year": year,
                "relative_path": asset.relative_path,
                "hydrated": hydrated,
                "pages": pages,
                "topical_tags": list(tags),
                "status": "extracted" if text else "indexed_only",
                "summary": sentence_excerpt(text, limit=2),
                "topic_outline": headings,
                "search_preview": " | ".join(headings[:6]),
                "clinical_use": {
                    "analyzer": analyzer_use,
                    "agents": agent_use,
                },
                "citation_hint": f"{lead_author} {year}" if year else lead_author,
            }
        )
    runtime_items.sort(
        key=lambda item: (
            -int(item.get("year") or 0),
            str(item.get("title", "")).lower(),
        )
    )
    return assets, runtime_items


def _module(
    module_id: str,
    title: str,
    text: str,
    pages: int | None,
    learning_goals: list[str],
    analyzer_use: str,
    raw_use: str,
) -> dict:
    return {
        "module_id": module_id,
        "title": title,
        "status": "extracted" if text else "indexed_only",
        "pages": pages,
        "learning_goals": learning_goals,
        "topic_outline": first_heading_lines(text, limit=14),
        "clinical_use": {
            "analyzer": analyzer_use,
            "raw_workbench": raw_use,
        },
    }


def build_runtime_payload(assets: list[SourceAsset], extracted: dict[str, tuple[int | None, str]]) -> dict:
    advanced_pages, advanced_text = extracted["eeg-frequencies-waveforms"]
    p1_pages, p1_text = extracted["psychopharmacology-part-1"]
    p2_pages, p2_text = extracted["psychopharmacology-part-2"]
    artifact_pages, artifact_text = extracted["artifact-reduction"]
    map_pages, map_text = extracted["topographic-maps"]
    report_pages, report_text = extracted["qeeg-report-writing"]
    ethics1_pages, ethics1_text = extracted["ethics-part-1"]
    ethics2_pages, ethics2_text = extracted["ethics-part-2"]
    efficacy_pages, efficacy_text = extracted["efficacy-criteria"]
    abnormal_pages, abnormal_text = extracted["abnormal-eeg-patterns"]

    teaching_modules = [
        _module(
            "eeg-frequencies-waveforms",
            "EEG frequencies and typical waveforms",
            advanced_text,
            advanced_pages,
            [
                "Identify canonical EEG bands and relate waveform shape to frequency class.",
                "Use waveform morphology as the base layer for downstream qEEG interpretation.",
                "Anchor delta, theta, alpha, beta, and mu terminology to actual trace appearance.",
            ],
            "Use for band-level interpretation guardrails before describing spectral findings in clinical language.",
            "Use when counting oscillations manually, distinguishing band classes, and aligning raw waveform shape with qEEG outputs.",
        ),
        _module(
            "psychopharmacology-part-1",
            "Psychopharmacology part 1: clinical presentation confounds",
            p1_text,
            p1_pages,
            [
                "Account for prescribed and non-prescribed substances before interpreting EEG-driven clinical presentation.",
                "Identify caffeine and nicotine as practical qEEG confounds that alter arousal and training readiness.",
            ],
            "Use before interpreting arousal or symptom-linked qEEG findings when caffeine, nicotine, or medication exposure may be present.",
            "Use as a prescan checklist so activated or dysregulated raw EEG is not misread without substance context.",
        ),
        _module(
            "psychopharmacology-part-2",
            "Psychopharmacology part 2: EEG measure confounds",
            p2_text,
            p2_pages,
            [
                "Map stimulants and illicit substances to likely alpha, theta, and beta changes on EEG.",
                "Treat drug-related band shifts as confounds before assigning pathology labels.",
            ],
            "Use when a profile shows beta excess, alpha suppression, or reduced theta that may be medication-driven.",
            "Use when generalized fast activity or altered posterior alpha may reflect stimulant exposure rather than intrinsic dysfunction.",
        ),
        _module(
            "artifact-reduction",
            "Identifying and reducing artifacts",
            artifact_text,
            artifact_pages,
            [
                "Recognize common recording artifacts before editing or reporting qEEG abnormalities.",
                "Reduce false positives during manual raw review.",
            ],
            "Use as a guardrail before treating outlier power or asymmetry as brain-based.",
            "Use directly during channel-by-channel artifact review and segment rejection.",
        ),
        _module(
            "topographic-maps-and-reporting",
            "Topographic maps and qEEG report writing",
            map_text + "\n" + report_text,
            (map_pages or 0) + (report_pages or 0) or None,
            [
                "Interpret qEEG head maps without separating them from raw EEG and clinical context.",
                "Translate findings into report language appropriate for clinicians and treatment planning.",
            ],
            "Use when summarizing map-based deviations into clinician-facing interpretations.",
            "Use after raw validation so report statements stay grounded in reviewed signal quality.",
        ),
        _module(
            "ethics-and-efficacy",
            "Ethics, professional conduct, and efficacy criteria",
            ethics1_text + "\n" + ethics2_text + "\n" + efficacy_text,
            (ethics1_pages or 0) + (ethics2_pages or 0) + (efficacy_pages or 0) or None,
            [
                "Apply ethical and professional limits to qEEG communication and treatment claims.",
                "Separate evidence-supported use cases from overreach.",
            ],
            "Use when framing uncertainty, limitations, and strength of inference in AI-facing qEEG narratives.",
            "Use as a reporting boundary so technical observations are not overstated clinically.",
        ),
        _module(
            "abnormal-patterns",
            "Abnormal EEG patterns",
            abnormal_text,
            abnormal_pages,
            [
                "Recognize non-benign EEG patterns that require escalation beyond routine qEEG coaching.",
                "Distinguish signal quality issues from clinically meaningful abnormal morphology.",
            ],
            "Use as a caution layer before benignly summarizing patterns that may warrant formal EEG review.",
            "Use during manual review when spikes, slowing, or unusual morphology need escalation.",
        ),
    ]

    return {
        "schema_version": "1.0.0",
        "resource_slug": "qeeg-certificate-course",
        "resource_name": "qEEG Certificate Course Bundle",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_bundle_date": BUNDLE_DATE,
        "course_provider": "USA qEEG Course Import",
        "program_name": "USA COURSES / QEEG COURSE",
        "material_count": len([asset for asset in assets if asset.hydrated]),
        "source_assets": [
            {
                "asset_id": asset.asset_id,
                "label": asset.label,
                "kind": asset.kind,
                "relative_path": asset.relative_path,
                "hydrated": asset.hydrated,
                "pages": asset.pages,
                "bytes": asset.bytes,
                "note": asset.note,
            }
            for asset in assets
        ],
        "teaching_modules": teaching_modules,
        "course_signals": {
            "psychopharmacology_detected": bool(p1_text or p2_text),
            "artifact_training_detected": bool(artifact_text),
            "reporting_training_detected": bool(report_text),
            "ethics_training_detected": bool(ethics1_text or ethics2_text),
        },
        "integration_notes": [
            "This bundle is intended for DeepSynaps qEEG analyzer and raw-workbench grounding, not as a replacement for clinical judgment.",
            "Local qEEG courseware is listed ahead of external learning links so the product can rely on repo-native knowledge first.",
            "Psychopharmacology content now comes from the actual local lesson PDFs rather than only certificate metadata.",
        ],
    }


def build_research_runtime_payload(
    research_assets: list[ResearchAsset],
    research_items: list[dict[str, object]],
) -> dict:
    extracted_count = len([item for item in research_items if item["status"] == "extracted"])
    tag_counts: dict[str, int] = {}
    for item in research_items:
        for tag in item["topical_tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return {
        "schema_version": "1.0.0",
        "resource_slug": "qeeg-course-research-library",
        "resource_name": "qEEG Course Research Library",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_bundle_date": BUNDLE_DATE,
        "course_provider": "USA qEEG Course Import",
        "program_name": "USA COURSES / QEEG COURSE",
        "material_count": extracted_count,
        "source_assets": [asdict(asset) for asset in research_assets],
        "research_items": research_items,
        "topical_index": [
            {"tag": tag, "count": count}
            for tag, count in sorted(tag_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        "integration_notes": [
            "This local research library is intended for repo-native qEEG copilot retrieval and analyzer grounding.",
            "Article summaries are kept alongside paper PDFs so agents can use either the condensed teaching summary or the original source excerpt.",
            "Search results should be treated as evidence support for reviewed signal and clinical context, not as stand-alone decision authority.",
        ],
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
    assets, extracted = asset_rows(source_root)
    runtime = build_runtime_payload(assets, extracted)
    research_assets, research_items = discover_research_assets(source_root)
    research_runtime = build_research_runtime_payload(research_assets, research_items)

    ai_rows = []
    for module in runtime["teaching_modules"]:
        ai_rows.append(
            {
                "resource_slug": runtime["resource_slug"],
                "module_id": module["module_id"],
                "title": module["title"],
                "status": module["status"],
                "learning_goals": " | ".join(module["learning_goals"]),
                "analyzer_use": module["clinical_use"]["analyzer"],
                "raw_workbench_use": module["clinical_use"]["raw_workbench"],
            }
        )

    write_csv(
        IMPORT_ROOT / "courseware_source_assets.csv",
        ["asset_id", "label", "kind", "relative_path", "hydrated", "pages", "bytes", "note"],
        [asdict(asset) for asset in assets],
    )
    write_csv(
        IMPORT_ROOT / "courseware_ai_ingestion_dataset.csv",
        ["resource_slug", "module_id", "title", "status", "learning_goals", "analyzer_use", "raw_workbench_use"],
        ai_rows,
    )
    write_csv(
        IMPORT_ROOT / "courseware_research_assets.csv",
        [
            "asset_id",
            "title",
            "kind",
            "relative_path",
            "hydrated",
            "pages",
            "bytes",
            "year",
            "lead_author",
            "topical_tags",
            "analyzer_use",
            "agent_use",
            "note",
        ],
        [
            {
                **asdict(asset),
                "topical_tags": " | ".join(asset.topical_tags),
            }
            for asset in research_assets
        ],
    )
    write_csv(
        IMPORT_ROOT / "courseware_research_dataset.csv",
        ["resource_slug", "paper_id", "title", "kind", "year", "topical_tags", "status", "summary", "analyzer_use", "agent_use"],
        [
            {
                "resource_slug": research_runtime["resource_slug"],
                "paper_id": item["paper_id"],
                "title": item["title"],
                "kind": item["kind"],
                "year": item["year"],
                "topical_tags": " | ".join(item["topical_tags"]),
                "status": item["status"],
                "summary": item["summary"],
                "analyzer_use": item["clinical_use"]["analyzer"],
                "agent_use": item["clinical_use"]["agents"],
            }
            for item in research_items
        ],
    )

    top_kb = {
        "resource_slug": runtime["resource_slug"],
        "resource_name": runtime["resource_name"],
        "teaching_modules": runtime["teaching_modules"],
        "course_signals": runtime["course_signals"],
    }

    (IMPORT_ROOT / "top_course_knowledge_base.json").write_text(
        json.dumps(top_kb, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (IMPORT_ROOT / "courseware_bundle_manifest.json").write_text(
        json.dumps(
            {
                "bundle_name": "courseware",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "source_root_label": "Desktop/USA COURSES/QEEG COURSE",
                "runtime_outputs": [
                    "data/courseware/knowledge-kb/index.json",
                    "data/courseware/knowledge-kb/qeeg-certificate-course.json",
                    "data/courseware/knowledge-kb/qeeg-course-research-library.json",
                ],
                "source_asset_count": len(assets),
                "research_asset_count": len(research_assets),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (RUNTIME_ROOT / "qeeg-certificate-course.json").write_text(
        json.dumps(runtime, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (RUNTIME_ROOT / "qeeg-course-research-library.json").write_text(
        json.dumps(research_runtime, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (RUNTIME_ROOT / "index.json").write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "resources": [
                    {
                        "resource_slug": "qeeg-certificate-course",
                        "resource_name": "qEEG Certificate Course Bundle",
                        "path": "data/courseware/knowledge-kb/qeeg-certificate-course.json",
                    },
                    {
                        "resource_slug": "qeeg-germany-session-library",
                        "resource_name": "qEEG Germany Session Library",
                        "path": "data/courseware/knowledge-kb/qeeg-germany-session-library.json",
                    },
                    {
                        "resource_slug": "qeeg-course-research-library",
                        "resource_name": "qEEG Course Research Library",
                        "path": "data/courseware/knowledge-kb/qeeg-course-research-library.json",
                    },
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        **runtime,
        "research_asset_count": len(research_assets),
        "research_item_count": len(research_items),
    }


if __name__ == "__main__":
    import sys

    source_root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_SOURCE_ROOT
    payload = build(source_root)
    print(
        json.dumps(
            {
                "resource_slug": payload["resource_slug"],
                "modules": len(payload["teaching_modules"]),
                "source_assets": len(payload["source_assets"]),
                "research_assets": payload["research_asset_count"],
                "research_items": payload["research_item_count"],
            },
            indent=2,
        )
    )

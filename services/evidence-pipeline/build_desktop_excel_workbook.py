from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
from pathlib import Path
from statistics import mean

import xlsxwriter


DEFAULT_BUNDLE_ROOT = Path.home() / "Desktop" / "neuromodulation_research_bundle_2026-04-22"
DEFAULT_OUTPUT_NAME = "deepsynaps-evidence-desktop-capped.xlsx"
SHEET_ROW_LIMIT = 200_000
PREVIEW_LIMIT = 25_000

SHEET_SPECS = [
    {
        "title": "Master",
        "path": "neuromodulation_master_database_enriched.csv",
        "asset_key": "neuromodulation_master_database_enriched",
        "limit": 100_000,
    },
    {
        "title": "Priority_View",
        "path": "neuromodulation_master_database_enriched.csv",
        "asset_key": "neuromodulation_master_database_enriched",
        "limit": PREVIEW_LIMIT,
    },
    {
        "title": "Clinical_Trials",
        "path": "derived/neuromodulation_clinical_trials.csv",
        "asset_key": "neuromodulation_clinical_trials",
        "limit": None,
    },
    {
        "title": "FDA_510k",
        "path": "derived/neuromodulation_fda_510k_devices.csv",
        "asset_key": "neuromodulation_fda_510k_devices",
        "limit": None,
    },
    {
        "title": "Condition_Mentions",
        "path": "derived/neuromodulation_condition_mentions.csv",
        "asset_key": "neuromodulation_condition_mentions",
        "limit": 100_000,
    },
    {
        "title": "Patient_Outcomes",
        "path": "derived/neuromodulation_patient_outcomes.csv",
        "asset_key": "neuromodulation_patient_outcomes",
        "limit": None,
    },
    {
        "title": "Evidence_Graph",
        "path": "derived/neuromodulation_evidence_graph.csv",
        "asset_key": "neuromodulation_evidence_graph",
        "legacy_path": "neuromodulation_evidence_graph.csv",
        "limit": None,
    },
    {
        "title": "Protocol_Templates",
        "path": "derived/neuromodulation_protocol_template_candidates.csv",
        "asset_key": "neuromodulation_protocol_template_candidates",
        "legacy_path": "neuromodulation_protocol_template_candidates.csv",
        "limit": None,
    },
    {
        "title": "Ind_Mod_Summary",
        "path": "derived/neuromodulation_indication_modality_summary.csv",
        "asset_key": "neuromodulation_indication_modality_summary",
        "legacy_path": "neuromodulation_indication_modality_summary.csv",
        "limit": None,
    },
]


def normalize_text(value: str | None, limit: int | None = None) -> str:
    text = " ".join((value or "").split())
    if limit and len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def safe_int(value: str | None) -> int:
    if not value:
        return 0
    try:
        return int(float(value))
    except Exception:
        return 0


def csv_fieldnames(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        return next(reader, [])


def count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        return sum(1 for _ in reader)


def load_manifest_assets(bundle_root: Path) -> dict[str, dict[str, object]]:
    manifest_path = bundle_root / "manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    assets = payload.get("assets") or []
    return {str(asset.get("asset_key")): asset for asset in assets if asset.get("asset_key")}


def resolve_bundle_asset(bundle_root: Path, spec: dict[str, object], manifest_assets: dict[str, dict[str, object]]) -> tuple[Path, str]:
    candidates: list[str] = []
    asset_key = spec.get("asset_key")
    if asset_key and asset_key in manifest_assets:
        manifest_rel = manifest_assets[asset_key].get("relative_path")
        if manifest_rel:
            candidates.append(str(manifest_rel))
    primary = str(spec["path"])
    if primary not in candidates:
        candidates.append(primary)
    legacy = spec.get("legacy_path")
    if legacy and legacy not in candidates:
        candidates.append(str(legacy))
    for rel in candidates:
        path = bundle_root / rel
        if path.exists():
            return path, rel
    return bundle_root / primary, primary


def bounded_sheet_titles(base_title: str, total_rows: int, row_limit: int) -> list[str]:
    parts = max(1, math.ceil(total_rows / row_limit))
    if parts == 1:
        return [base_title[:31]]
    titles = []
    for idx in range(parts):
        suffix = f"_{idx + 1}"
        titles.append(f"{base_title[: 31 - len(suffix)]}{suffix}")
    return titles


def apply_sheet_layout(ws, fieldnames: list[str]) -> None:
    ws.freeze_panes(1, 0)
    ws.autofilter(0, 0, 0, max(len(fieldnames) - 1, 0))
    for idx, field in enumerate(fieldnames):
        width = min(max(len(field) + 2, 14), 42)
        ws.set_column(idx, idx, width)


def append_csv_sheet(
    wb: xlsxwriter.Workbook,
    header_fmt,
    path: Path,
    rel_path: str,
    title: str,
    limit: int | None,
) -> dict[str, object]:
    if not path.exists():
        return {
            "title": title,
            "path": rel_path,
            "status": "missing",
            "rows_written": 0,
            "rows_total": 0,
            "sheet_names": [],
        }

    rows_total = count_csv_rows(path)
    rows_to_write = rows_total if limit is None else min(rows_total, limit)
    if rows_to_write <= 0:
        ws = wb.add_worksheet(title[:31])
        ws.write_row(0, 0, [f"No rows found in {rel_path}"])
        return {
            "title": title,
            "path": rel_path,
            "status": "empty",
            "rows_written": 0,
            "rows_total": rows_total,
            "sheet_names": [title[:31]],
        }

    part_limit = min(rows_to_write, SHEET_ROW_LIMIT)
    sheet_names = bounded_sheet_titles(title, rows_to_write, part_limit)
    fieldnames = csv_fieldnames(path)
    if not fieldnames:
        ws = wb.add_worksheet(title[:31])
        ws.write_row(0, 0, [f"No header found in {rel_path}"])
        return {
            "title": title,
            "path": rel_path,
            "status": "no_header",
            "rows_written": 0,
            "rows_total": rows_total,
            "sheet_names": [title[:31]],
        }

    handle = path.open("r", encoding="utf-8", newline="")
    reader = csv.DictReader(handle)
    current_sheet_index = -1
    current_rows = 0
    rows_written = 0
    ws = None
    try:
        for row in reader:
            if rows_written >= rows_to_write:
                break
            if ws is None or current_rows >= part_limit:
                current_sheet_index += 1
                ws = wb.add_worksheet(sheet_names[current_sheet_index])
                apply_sheet_layout(ws, fieldnames)
                ws.write_row(0, 0, fieldnames, header_fmt)
                current_rows = 0
            values = [normalize_text(row.get(field, ""), 32000) for field in fieldnames]
            ws.write_row(current_rows + 1, 0, values)
            current_rows += 1
            rows_written += 1
    finally:
        handle.close()

    status = "complete" if rows_written == rows_total else "truncated"
    return {
        "title": title,
        "path": rel_path,
        "status": status,
        "rows_written": rows_written,
        "rows_total": rows_total,
        "sheet_names": sheet_names,
    }


def compute_overview(bundle_root: Path) -> list[tuple[str, str]]:
    master_path = bundle_root / "neuromodulation_master_database_enriched.csv"
    abstract_path = bundle_root / "derived" / "neuromodulation_europepmc_abstracts.csv"
    trials_path = bundle_root / "derived" / "neuromodulation_clinical_trials.csv"
    fda_path = bundle_root / "derived" / "neuromodulation_fda_510k_devices.csv"
    outcomes_path = bundle_root / "derived" / "neuromodulation_patient_outcomes.csv"
    conditions_path = bundle_root / "derived" / "neuromodulation_condition_mentions.csv"

    master_rows = 0
    abstract_rows = 0
    journal_rows = 0
    summary_rows = 0
    distinct_modalities: set[str] = set()
    priority_scores: list[int] = []

    with master_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            master_rows += 1
            if row.get("abstract"):
                abstract_rows += 1
            if row.get("journal"):
                journal_rows += 1
            if row.get("research_summary"):
                summary_rows += 1
            modality = (row.get("primary_modality") or "").strip()
            if modality:
                distinct_modalities.add(modality)
            if len(priority_scores) < 5000:
                priority_scores.append(safe_int(row.get("priority_score")))

    top_conditions: Counter[str] = Counter()
    with conditions_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            top_conditions[row.get("condition_slug") or "unknown"] += safe_int(row.get("match_count"))

    top_trials = []
    if trials_path.exists():
        with trials_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for idx, row in enumerate(reader):
                if idx >= 3:
                    break
                top_trials.append(row.get("nct_id") or "")

    top_devices = []
    if fda_path.exists():
        with fda_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for idx, row in enumerate(reader):
                if idx >= 3:
                    break
                top_devices.append(row.get("clearance_number") or "")

    return [
        ("Bundle root", str(bundle_root)),
        ("Master rows", str(master_rows)),
        ("Rows with abstracts", str(abstract_rows)),
        ("Rows with journal names", str(journal_rows)),
        ("Rows with research summaries", str(summary_rows)),
        ("Distinct primary modalities", str(len(distinct_modalities))),
        ("Abstract backfill rows", str(count_csv_rows(abstract_path) if abstract_path.exists() else 0)),
        ("Condition mention rows", str(count_csv_rows(conditions_path) if conditions_path.exists() else 0)),
        ("Patient outcome rows", str(count_csv_rows(outcomes_path) if outcomes_path.exists() else 0)),
        ("Clinical trial rows", str(count_csv_rows(trials_path) if trials_path.exists() else 0)),
        ("FDA 510(k) rows", str(count_csv_rows(fda_path) if fda_path.exists() else 0)),
        ("Mean priority score preview", f"{mean(priority_scores) if priority_scores else 0:.2f}"),
        (
            "Top conditions",
            "; ".join(f"{slug}:{count}" for slug, count in top_conditions.most_common(10)),
        ),
        ("Example trial IDs", ", ".join(filter(None, top_trials))),
        ("Example FDA clearances", ", ".join(filter(None, top_devices))),
    ]


def append_overview_sheet(wb: xlsxwriter.Workbook, header_fmt, overview_rows: list[tuple[str, str]]) -> None:
    ws = wb.add_worksheet("Overview")
    fieldnames = ["Metric", "Value"]
    apply_sheet_layout(ws, fieldnames)
    ws.write_row(0, 0, fieldnames, header_fmt)
    for idx, (metric, value) in enumerate(overview_rows, start=1):
        ws.write_row(idx, 0, [metric, value])


def append_data_dictionary_sheet(wb: xlsxwriter.Workbook, header_fmt, bundle_root: Path) -> None:
    manifest_assets = load_manifest_assets(bundle_root)
    ws = wb.add_worksheet("Workbook_Index")
    fieldnames = ["Sheet", "Source CSV", "Intent", "Row limit"]
    apply_sheet_layout(ws, fieldnames)
    ws.write_row(0, 0, fieldnames, header_fmt)
    for idx, spec in enumerate(SHEET_SPECS, start=1):
        path, resolved_rel = resolve_bundle_asset(bundle_root, spec, manifest_assets)
        intent = {
            "Master": "Full enriched paper-level database for software ingestion.",
            "Priority_View": "Top-ranked slice for fast analyst review.",
            "Clinical_Trials": "Live ClinicalTrials.gov metadata matched to neuromodulation terms.",
            "FDA_510k": "Matched FDA device clearances for relevant modalities.",
            "Condition_Mentions": "NLP-derived condition mention rows from abstracts.",
            "Patient_Outcomes": "Outcome snippets and real-world-evidence flags.",
            "Evidence_Graph": "Indication-modality-target aggregate evidence edges.",
            "Protocol_Templates": "Template candidate clusters for protocol drafting.",
            "Ind_Mod_Summary": "Condition-by-modality summary rollup.",
        }.get(spec["title"], "")
        ws.write_row(
            idx,
            0,
            [
                spec["title"],
                resolved_rel if path.exists() else f"{resolved_rel} (missing)",
                intent,
                str(spec["limit"] or "full"),
            ],
        )


def build_workbook(bundle_root: Path, output_path: Path) -> dict[str, object]:
    manifest_assets = load_manifest_assets(bundle_root)
    wb = xlsxwriter.Workbook(
        str(output_path),
        {
            "constant_memory": True,
            "strings_to_urls": False,
        },
    )
    header_fmt = wb.add_format(
        {
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": "#16324F",
            "border": 1,
            "text_wrap": True,
            "valign": "top",
        }
    )
    overview_rows = compute_overview(bundle_root)
    append_overview_sheet(wb, header_fmt, overview_rows)
    append_data_dictionary_sheet(wb, header_fmt, bundle_root)

    sheet_results = []
    for spec in SHEET_SPECS:
        path, rel_path = resolve_bundle_asset(bundle_root, spec, manifest_assets)
        sheet_results.append(
            append_csv_sheet(
                wb=wb,
                header_fmt=header_fmt,
                path=path,
                rel_path=rel_path,
                title=spec["title"],
                limit=spec["limit"],
            )
        )

    wb.close()
    return {
        "workbook_path": str(output_path),
        "sheet_results": sheet_results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a stable Excel workbook from the Desktop neuromodulation bundle.")
    parser.add_argument("--bundle-root", type=Path, default=DEFAULT_BUNDLE_ROOT)
    parser.add_argument("--output-name", default=DEFAULT_OUTPUT_NAME)
    args = parser.parse_args()

    bundle_root = args.bundle_root.resolve()
    output_path = bundle_root / args.output_name
    output_path.parent.mkdir(parents=True, exist_ok=True)

    result = build_workbook(bundle_root=bundle_root, output_path=output_path)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

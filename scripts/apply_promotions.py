#!/usr/bin/env python3
"""
apply_promotions.py — fold promoted PMIDs into PROTOCOL_LIBRARY.references[].

Glue between the on-demand promote endpoint (which appends rows to
`services/evidence-pipeline/.pending-promotions.jsonl`) and the
`references[]` arrays inside `apps/web/src/protocols-data.js`.
See SPEC-live-literature-watch.md §7 for the flow.

Pipeline (per row in the pending jsonl):
  1. Parse {"protocol_id","pmid","promoted_by","promoted_at"} .
  2. Locate the matching PROTOCOL_LIBRARY entry in protocols-data.js by
     `id:'<protocol_id>'`. Append the PMID (as a string "PMID:<pmid>") to
     the entry's `references:[...]` array via regex. Create a new
     references field at the end of the object if absent. Idempotent:
     skip if the PMID already appears in the references array.
  3. In `services/evidence-pipeline/evidence.db`, mark the matching
     `literature_watch` row as `verdict='promoted'` (and stamp
     `reviewed_at` to now if unset).
  4. Write an `{"applied_at":"..."}` field back onto the row (as a new
     key on the same JSON object) and rewrite the jsonl file, preserving
     already-applied rows so we never re-apply.

Usage:
    python3 scripts/apply_promotions.py              # apply all pending
    python3 scripts/apply_promotions.py --dry-run    # report only
    python3 scripts/apply_promotions.py --pending <path> --db <path> --js <path>

Exit codes:
    0 — success (zero or more rows applied)
    1 — error (file missing, unreadable, malformed, write failure)
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PENDING = REPO_ROOT / "services" / "evidence-pipeline" / ".pending-promotions.jsonl"
DEFAULT_DB = REPO_ROOT / "services" / "evidence-pipeline" / "evidence.db"
DEFAULT_JS = REPO_ROOT / "apps" / "web" / "src" / "protocols-data.js"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _load_rows(path: Path) -> List[dict]:
    """Read JSONL. Each row is {"protocol_id","pmid",...} possibly with
    an "applied_at" key indicating it has been applied already."""
    if not path.exists():
        raise FileNotFoundError(f"pending promotions file not found: {path}")
    rows: List[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, raw in enumerate(fh, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"malformed JSON at {path}:{line_no}: {exc}") from exc
            if "protocol_id" not in obj or "pmid" not in obj:
                raise ValueError(
                    f"row at {path}:{line_no} missing protocol_id/pmid: {obj!r}"
                )
            rows.append(obj)
    return rows


def _write_rows(path: Path, rows: List[dict]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# protocols-data.js surgery — regex-only, line-level edits.
# ---------------------------------------------------------------------------

_ID_RE_TMPL = r"(?P<prefix>\n[ \t]*id:\s*['\"]){pid}(?P<suffix>['\"])"


def _find_entry_block(text: str, protocol_id: str) -> Optional[Tuple[int, int]]:
    """Return (start, end) char offsets of the object literal (`{ ... }`)
    containing `id:'<protocol_id>'`, or None."""
    m = re.search(_ID_RE_TMPL.format(pid=re.escape(protocol_id)), text)
    if not m:
        return None
    # Walk backward to the opening `{`.
    i = m.start()
    depth = 0
    start = None
    while i >= 0:
        ch = text[i]
        if ch == "}":
            depth += 1
        elif ch == "{":
            if depth == 0:
                start = i
                break
            depth -= 1
        i -= 1
    if start is None:
        return None
    # Walk forward from start to matching `}`.
    depth = 0
    j = start
    while j < len(text):
        ch = text[j]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return start, j + 1
        j += 1
    return None


_REF_LINE_RE = re.compile(
    r"(?P<indent>^[ \t]*)references:\s*\[(?P<body>.*?)\](?P<trail>\s*,?)\s*$",
    re.MULTILINE,
)


def _pmid_token(pmid: str) -> str:
    """Canonical form we append to references arrays."""
    return f"PMID:{pmid}"


def _pmid_present(references_body: str, pmid: str) -> bool:
    """True if `pmid` already appears in the raw JS array body (as bare
    PMID or as 'PMID:<pmid>' form)."""
    needle = pmid.strip()
    if not needle:
        return False
    pattern = re.compile(
        r"['\"](?:[^'\"]*?)" + re.escape(needle) + r"(?:[^'\"]*?)['\"]"
    )
    return bool(pattern.search(references_body))


def _append_to_references(block: str, pmid: str) -> Tuple[str, str]:
    """Return (new_block, action) where action is one of:
        'appended'   — added PMID to an existing references[] line
        'created'    — added a new references:[...] line
        'skipped'    — PMID already present
    """
    ref_match = _REF_LINE_RE.search(block)
    token = f"'{_pmid_token(pmid)}'"
    if ref_match:
        body = ref_match.group("body")
        if _pmid_present(body, pmid):
            return block, "skipped"
        stripped = body.strip()
        if not stripped:
            new_body = token
        else:
            trimmed = body.rstrip()
            if trimmed.endswith(","):
                new_body = trimmed + token
            else:
                new_body = trimmed + "," + token
            tail_ws = body[len(trimmed):]
            new_body = new_body + tail_ws
        new_line = (
            f"{ref_match.group('indent')}references:[{new_body}]"
            f"{ref_match.group('trail')}"
        )
        new_block = block[: ref_match.start()] + new_line + block[ref_match.end():]
        return new_block, "appended"
    # No references: line — create one just before the closing brace.
    id_indent_m = re.search(r"^(?P<indent>[ \t]*)id:", block, re.MULTILINE)
    indent = id_indent_m.group("indent") if id_indent_m else "  "
    close_idx = block.rfind("}")
    if close_idx == -1:
        return block, "skipped"
    insertion = f"{indent}references:[{token}],\n"
    prefix = block[:close_idx]
    if not prefix.endswith("\n"):
        prefix = prefix + "\n"
    new_block = prefix + insertion + block[close_idx:]
    return new_block, "created"


# ---------------------------------------------------------------------------
# SQLite verdict update.
# ---------------------------------------------------------------------------


def _mark_promoted(
    db_path: Path, protocol_id: str, pmid: str, dry_run: bool
) -> str:
    """Returns one of: 'updated', 'already-promoted', 'row-missing'."""
    if not db_path.exists():
        raise FileNotFoundError(f"evidence.db not found at {db_path}")
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute(
            "SELECT id, verdict FROM literature_watch WHERE protocol_id=? AND pmid=?",
            (protocol_id, pmid),
        )
        row = cur.fetchone()
        if not row:
            return "row-missing"
        if row[1] == "promoted":
            return "already-promoted"
        if not dry_run:
            conn.execute(
                "UPDATE literature_watch "
                "SET verdict='promoted', "
                "    reviewed_at=COALESCE(reviewed_at, CURRENT_TIMESTAMP) "
                "WHERE id=?",
                (row[0],),
            )
            conn.commit()
        return "updated"
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Orchestration.
# ---------------------------------------------------------------------------


def _apply_row(
    row: dict,
    js_text: str,
    db_path: Path,
    dry_run: bool,
) -> Tuple[str, str, str]:
    """Apply a single pending row. Returns (new_js_text, js_action, db_action)."""
    pid = row["protocol_id"]
    pmid = str(row["pmid"]).strip()
    block_range = _find_entry_block(js_text, pid)
    if block_range is None:
        return js_text, "protocol-not-found", "skipped"
    start, end = block_range
    block = js_text[start:end]
    new_block, js_action = _append_to_references(block, pmid)
    new_js_text = js_text[:start] + new_block + js_text[end:] if js_action != "skipped" else js_text
    db_action = _mark_promoted(db_path, pid, pmid, dry_run=dry_run)
    return new_js_text, js_action, db_action


def run(args: argparse.Namespace) -> int:
    pending = Path(args.pending)
    db = Path(args.db)
    js = Path(args.js)

    try:
        rows = _load_rows(pending)
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if not js.exists():
        print(f"ERROR: protocols-data.js not found at {js}", file=sys.stderr)
        return 1
    if not db.exists():
        print(f"ERROR: evidence.db not found at {db}", file=sys.stderr)
        return 1

    js_text = js.read_text(encoding="utf-8")
    original_js = js_text

    applied_count = 0
    skipped_count = 0
    error_count = 0
    new_rows: List[dict] = []

    for idx, row in enumerate(rows, 1):
        if "applied_at" in row:
            new_rows.append(row)
            skipped_count += 1
            print(
                f"[{idx}] {row.get('protocol_id')} pmid={row.get('pmid')}: "
                f"already applied at {row['applied_at']} — skipping"
            )
            continue

        try:
            js_text, js_action, db_action = _apply_row(row, js_text, db, args.dry_run)
        except Exception as exc:  # noqa: BLE001
            error_count += 1
            print(
                f"[{idx}] {row.get('protocol_id')} pmid={row.get('pmid')}: "
                f"ERROR {exc}",
                file=sys.stderr,
            )
            new_rows.append(row)
            continue

        print(
            f"[{idx}] {row['protocol_id']} pmid={row['pmid']}: "
            f"js={js_action} db={db_action}"
            f"{' (dry-run)' if args.dry_run else ''}"
        )

        if js_action == "protocol-not-found":
            error_count += 1
            new_rows.append(row)
            continue

        if not args.dry_run:
            applied_row = dict(row)
            applied_row["applied_at"] = _now_iso()
            applied_row["js_action"] = js_action
            applied_row["db_action"] = db_action
            new_rows.append(applied_row)
        else:
            new_rows.append(row)
        applied_count += 1

    if args.dry_run:
        print(
            f"\nDRY RUN: would apply {applied_count} rows, "
            f"skip {skipped_count}, errors {error_count}. "
            f"No files or DB rows modified."
        )
        if js_text != original_js:
            print("(protocols-data.js would be rewritten)")
        return 0 if error_count == 0 else 1

    try:
        if js_text != original_js:
            js.write_text(js_text, encoding="utf-8")
        _write_rows(pending, new_rows)
    except OSError as exc:
        print(f"ERROR: write failed — {exc}", file=sys.stderr)
        return 1

    print(
        f"\nDone: applied {applied_count}, "
        f"already-applied {skipped_count}, errors {error_count}."
    )
    return 0 if error_count == 0 else 1


def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="apply_promotions.py",
        description=(
            "Fold promoted PMIDs (from the on-demand promote endpoint) into "
            "PROTOCOL_LIBRARY.references[] in protocols-data.js and mark the "
            "matching literature_watch row as verdict='promoted'."
        ),
    )
    p.add_argument(
        "--pending",
        default=str(DEFAULT_PENDING),
        help=f"path to pending promotions JSONL (default: {DEFAULT_PENDING})",
    )
    p.add_argument(
        "--db",
        default=str(DEFAULT_DB),
        help=f"path to evidence.db (default: {DEFAULT_DB})",
    )
    p.add_argument(
        "--js",
        default=str(DEFAULT_JS),
        help=f"path to protocols-data.js (default: {DEFAULT_JS})",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would change without writing anything",
    )
    return p.parse_args(argv)


if __name__ == "__main__":
    try:
        sys.exit(run(_parse_args()))
    except KeyboardInterrupt:
        sys.exit(1)

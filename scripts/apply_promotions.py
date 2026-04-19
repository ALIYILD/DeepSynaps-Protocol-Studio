#!/usr/bin/env python3
"""
apply_promotions.py — fold promoted PMIDs into PROTOCOL_LIBRARY.references[].

Glue between the on-demand promote endpoint (which appends rows to
`services/evidence-pipeline/.pending-promotions.jsonl`) and the
`references[]` arrays inside `apps/web/src/protocols-data.js`.

Per unapplied JSONL row this script:
  1. Parses {"protocol_id","pmid","promoted_by","promoted_at"}.
  2. Locates the matching PROTOCOL_LIBRARY entry in protocols-data.js by
     brace-balanced scan keyed on `id:'<protocol_id>'`, then finds (or
     creates) the `references:[...]` array inside the enclosing object.
     Appends `'PMID:<pmid>'` if absent.
  3. Flips the matching literature_watch row in
     `services/evidence-pipeline/evidence.db` to verdict='promoted'.
  4. Stamps the JSONL row with "applied_at": "<utc-now>" and atomically
     rewrites the file.

Rows that already have `applied_at` are skipped (idempotent).

Usage:
  # Normal run with default paths
  python3 scripts/apply_promotions.py

  # Dry run (no writes, just report what would change)
  python3 scripts/apply_promotions.py --dry-run

  # Override any path
  python3 scripts/apply_promotions.py \
      --jsonl services/evidence-pipeline/.pending-promotions.jsonl \
      --db services/evidence-pipeline/evidence.db \
      --js apps/web/src/protocols-data.js

Exit codes:
  0  success (or nothing to do)
  1  any error
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import logging
import os
import re
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Optional

# ── repo-relative defaults ──────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSONL = REPO_ROOT / "services" / "evidence-pipeline" / ".pending-promotions.jsonl"
DEFAULT_DB = REPO_ROOT / "services" / "evidence-pipeline" / "evidence.db"
DEFAULT_JS = REPO_ROOT / "apps" / "web" / "src" / "protocols-data.js"

logger = logging.getLogger("apply_promotions")


# ── protocols-data.js scanning ──────────────────────────────────────────────
def _find_entry_span(js_text: str, protocol_id: str) -> Optional[tuple[int, int]]:
    """Return (start, end) offsets of the object containing id:'<protocol_id>'.

    Uses a brace-balanced scan. Returns None if not found.
    """
    # Match id:'p-foo' or id: "p-foo" with optional whitespace + either quote.
    pattern = re.compile(
        r"""id\s*:\s*['"]""" + re.escape(protocol_id) + r"""['"]""",
        re.MULTILINE,
    )
    m = pattern.search(js_text)
    if not m:
        return None

    # Walk backwards to find the enclosing '{'.
    depth = 0
    start = None
    for i in range(m.start() - 1, -1, -1):
        c = js_text[i]
        if c == "}":
            depth += 1
        elif c == "{":
            if depth == 0:
                start = i
                break
            depth -= 1
    if start is None:
        return None

    # Walk forwards from start to find the matching '}'.
    # Naive brace counting is enough here because protocols-data.js is
    # data-only (no string-embedded braces of significance between entries).
    depth = 0
    end = None
    in_str: Optional[str] = None
    escape = False
    for i in range(start, len(js_text)):
        c = js_text[i]
        if escape:
            escape = False
            continue
        if in_str:
            if c == "\\":
                escape = True
            elif c == in_str:
                in_str = None
            continue
        if c in ("'", '"', "`"):
            in_str = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        return None
    return (start, end)


def _references_in_block(block: str) -> Optional[tuple[int, int, str]]:
    """Locate the `references:[...]` array inside a protocol entry block.

    Returns (arr_start, arr_end, arr_text) or None if the field is missing.
    Offsets are relative to the start of `block`.
    """
    m = re.search(r"references\s*:\s*\[", block)
    if not m:
        return None
    start = m.end() - 1  # points at the '['
    depth = 0
    in_str: Optional[str] = None
    escape = False
    for i in range(start, len(block)):
        c = block[i]
        if escape:
            escape = False
            continue
        if in_str:
            if c == "\\":
                escape = True
            elif c == in_str:
                in_str = None
            continue
        if c in ("'", '"', "`"):
            in_str = c
            continue
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                return (start, end, block[start:end])
    return None


def apply_pmid_to_js(js_path: Path, protocol_id: str, pmid: str, dry_run: bool) -> tuple[bool, str]:
    """Append 'PMID:<pmid>' to the matching protocol's references[].

    Returns (changed, message).
    """
    js_text = js_path.read_text(encoding="utf-8")
    span = _find_entry_span(js_text, protocol_id)
    if span is None:
        return False, f"protocol entry id='{protocol_id}' not found in {js_path}"

    start, end = span
    block = js_text[start:end]
    pmid_token = f"'PMID:{pmid}'"

    # Cheap idempotency — already present in this entry block?
    if re.search(r"""['"]PMID:""" + re.escape(pmid) + r"""['"]""", block):
        return False, f"already present: PMID:{pmid} in {protocol_id}"

    refs = _references_in_block(block)
    if refs is not None:
        arr_start, arr_end, arr_text = refs
        inner = arr_text[1:-1]  # strip [ and ]
        # Detect trailing comma / whitespace handling.
        stripped = inner.rstrip()
        if stripped == "":
            new_arr = f"[{pmid_token}]"
        else:
            trailing_comma = stripped.endswith(",")
            sep = " " if trailing_comma else ", "
            new_arr = f"[{stripped}{sep if not trailing_comma else ''}{pmid_token}]"
            if trailing_comma:
                new_arr = f"[{stripped} {pmid_token}]"
        new_block = block[:arr_start] + new_arr + block[arr_end:]
    else:
        # No references field — inject one before the closing '}' of the entry.
        # Find the last '}' in block (it's at len(block)-1).
        insert_at = len(block) - 1
        # Step left past whitespace / trailing comma.
        j = insert_at - 1
        while j >= 0 and block[j] in (" ", "\t", "\r", "\n"):
            j -= 1
        needs_comma = j >= 0 and block[j] != ","
        # Use a simple single-line insertion with comma.
        prefix = block[: j + 1]
        suffix = block[j + 1 :]
        inject = ("," if needs_comma else "") + f"\n  references:[{pmid_token}],"
        new_block = prefix + inject + suffix

    if new_block == block:
        return False, f"no-op for {protocol_id} PMID:{pmid}"

    new_text = js_text[:start] + new_block + js_text[end:]

    if dry_run:
        return True, f"[dry-run] would add PMID:{pmid} to {protocol_id}"

    # Atomic write: tmp in same dir, then os.replace.
    fd, tmp_path = tempfile.mkstemp(
        dir=str(js_path.parent), prefix=".protocols-data.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new_text)
        os.replace(tmp_path, js_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    return True, f"added PMID:{pmid} to {protocol_id}"


# ── evidence.db flip ────────────────────────────────────────────────────────
def flip_db_verdict(db_path: Path, protocol_id: str, pmid: str, dry_run: bool) -> tuple[bool, str]:
    if not db_path.exists():
        return False, f"db not found: {db_path}"
    if dry_run:
        # Count how many rows would be flipped for honesty.
        conn = sqlite3.connect(str(db_path))
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM literature_watch WHERE protocol_id=? AND pmid=?",
                (protocol_id, pmid),
            )
            n = cur.fetchone()[0]
        finally:
            conn.close()
        return (n > 0), (
            f"[dry-run] would flip {n} row(s) to 'promoted' for {protocol_id}/{pmid}"
        )

    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE literature_watch SET verdict='promoted' "
            "WHERE protocol_id=? AND pmid=?",
            (protocol_id, pmid),
        )
        n = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return (n > 0), f"flipped {n} db row(s) to 'promoted' for {protocol_id}/{pmid}"


# ── JSONL i/o ───────────────────────────────────────────────────────────────
def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f, start=1):
            s = line.strip()
            if not s:
                continue
            try:
                rows.append(json.loads(s))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path}: invalid JSON on line {idx}: {e}") from e
    return rows


def _write_jsonl_atomic(path: Path, rows: list[dict]) -> None:
    fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent), prefix=".pending-promotions.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ── main ────────────────────────────────────────────────────────────────────
def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fold promoted PMIDs into protocol references[]."
    )
    parser.add_argument("--dry-run", action="store_true", help="no writes, just report")
    parser.add_argument("--jsonl", type=Path, default=DEFAULT_JSONL, help="pending promotions jsonl path")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="evidence.db path")
    parser.add_argument("--js", type=Path, default=DEFAULT_JS, help="protocols-data.js path")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    try:
        rows = _read_jsonl(args.jsonl)
    except Exception as e:
        logger.error("failed to read jsonl %s: %s", args.jsonl, e)
        return 1

    if not rows:
        logger.info("no pending promotions in %s", args.jsonl)
        return 0

    if not args.js.exists():
        logger.error("protocols-data.js not found: %s", args.js)
        return 1

    applied = 0
    skipped = 0
    errors = 0
    changed = False

    for i, row in enumerate(rows):
        pid = row.get("protocol_id")
        pmid = row.get("pmid")
        if not pid or not pmid:
            logger.warning("row %d missing protocol_id/pmid, skipping: %r", i, row)
            skipped += 1
            continue
        if row.get("applied_at"):
            logger.info("row %d already applied (%s / PMID:%s), skipping", i, pid, pmid)
            skipped += 1
            continue

        logger.info("row %d: applying %s / PMID:%s", i, pid, pmid)

        try:
            js_changed, js_msg = apply_pmid_to_js(args.js, pid, pmid, args.dry_run)
            logger.info("  js:  %s", js_msg)
        except Exception as e:
            logger.error("  js:  error for %s/%s: %s", pid, pmid, e)
            errors += 1
            continue

        try:
            db_changed, db_msg = flip_db_verdict(args.db, pid, pmid, args.dry_run)
            logger.info("  db:  %s", db_msg)
        except Exception as e:
            logger.error("  db:  error for %s/%s: %s", pid, pmid, e)
            errors += 1
            continue

        if not args.dry_run:
            row["applied_at"] = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            changed = True

        applied += 1

    if changed and not args.dry_run:
        try:
            _write_jsonl_atomic(args.jsonl, rows)
        except Exception as e:
            logger.error("failed to rewrite jsonl %s: %s", args.jsonl, e)
            return 1

    logger.info(
        "done: applied=%d skipped=%d errors=%d dry_run=%s",
        applied, skipped, errors, args.dry_run,
    )
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

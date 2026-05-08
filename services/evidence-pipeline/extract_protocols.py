"""Protocol extractor — pulls stim parameters out of the verbatim text stored in
`trials.interventions_json` and `devices.raw_json`. Writes to a new `protocols`
table with structured columns so the Studio can display "10 Hz, 120% MT, 3000
pulses, 20 sessions" instead of paragraph prose.

NEVER synthesises parameters. If a field isn't in the source text it stays NULL.
If multiple distinct protocols appear in one trial (e.g. active arm + sham arm),
emit multiple rows — each rooted in a single source text block.

Usage:
    python3 services/evidence-pipeline/extract_protocols.py [--dry] [--limit N]
                                                            [--csv PATH] [--all-trials]

`--all-trials` runs against every trial with a non-empty interventions_json
(falls back to text-based modality inference when trial_indications is empty,
which is the current state on the canonical DB).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import db


# ── Schema (idempotent create) ───────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS protocols (
  id                    INTEGER PRIMARY KEY,
  indication_id         INTEGER REFERENCES indications(id) ON DELETE CASCADE,
  source_type           TEXT NOT NULL,          -- ctgov | fda_pma | fda_510k | fda_hde
  source_id             TEXT NOT NULL,          -- NCT id or FDA number
  arm_label             TEXT,
  modality              TEXT,
  target_anatomy        TEXT,
  waveform              TEXT,
  frequency_hz          REAL,
  frequency_hz_max      REAL,                   -- if stated as a range
  pulse_width_us        REAL,
  amplitude_mA          REAL,
  amplitude_V           REAL,
  motor_threshold_pct   REAL,
  pulses_per_session    INTEGER,
  session_duration_min  REAL,
  sessions_per_week     INTEGER,
  total_sessions        INTEGER,
  total_pulses          INTEGER,
  paired_behavior       TEXT,
  raw_text              TEXT,                   -- the block we parsed
  confidence            TEXT,                   -- high | medium | low
  notes                 TEXT,
  UNIQUE (source_type, source_id, arm_label)
);
CREATE INDEX IF NOT EXISTS idx_protocols_indication ON protocols(indication_id);
CREATE INDEX IF NOT EXISTS idx_protocols_source     ON protocols(source_type, source_id);
"""


# ── Regexes ──────────────────────────────────────────────────────────────────
#
# These deliberately err on the conservative side. Tests to add later:
# "10 Hz", "10Hz", "10-Hz", "10 hertz", "at 10 Hz", "0.5 Hz", "1,000 pulses".

_RE_HZ = re.compile(
    r"\b(?P<v>\d{1,3}(?:[.,]\d+)?)\s*[-–]?\s*(?:hz|hertz)\b", re.IGNORECASE
)
_RE_HZ_RANGE = re.compile(
    r"\b(?P<lo>\d{1,3}(?:[.,]\d+)?)\s*[-–]\s*(?P<hi>\d{1,3}(?:[.,]\d+)?)\s*(?:hz|hertz)\b", re.IGNORECASE
)
_RE_PW = re.compile(
    r"\b(?P<v>\d{2,4})\s*(?:µs|us|microseconds?)\b", re.IGNORECASE
)
_RE_AMP_MA = re.compile(
    r"\b(?P<v>\d+(?:[.,]\d+)?)\s*(?:ma|milliamp(?:ere)?s?)\b", re.IGNORECASE
)
_RE_AMP_V = re.compile(
    r"\b(?P<v>\d+(?:[.,]\d+)?)\s*(?:v|volts?)\b(?!\s*hz)", re.IGNORECASE
)
_RE_MT = re.compile(
    r"\b(?P<v>\d{2,3})\s*%?\s*(?:MT|motor\s*threshold)\b", re.IGNORECASE
)
_RE_PULSES = re.compile(
    r"\b(?P<v>\d{1,6}(?:,\d{3})?)\s*pulses?\b", re.IGNORECASE
)
_RE_SESSIONS = re.compile(
    r"\b(?P<v>\d{1,3})\s*(?:sessions?|treatments?|visits?)\b", re.IGNORECASE
)
_RE_DURATION = re.compile(
    r"\b(?P<v>\d{1,3}(?:[.,]\d+)?)\s*(?:-?\s*)?(?:min|minutes?)\b", re.IGNORECASE
)
_RE_PER_WEEK = re.compile(
    r"\b(?P<v>\d)\s*(?:x|times)\s*(?:/|per)\s*(?:wk|week)\b", re.IGNORECASE
)
_RE_TARGET = re.compile(
    r"\b(?:L[-\s]?DLPFC|R[-\s]?DLPFC|dorsolateral prefrontal|DLPFC|"
    r"VIM|STN|GPi|GPe|ALIC|NAc|subgenual cingulate|SCC|Area\s*25|"
    r"vagus nerve|occipital nerve|S3(?:\s+foramen)?|sacral root|"
    r"hypoglossal nerve|phrenic nerve|dorsal root ganglion|DRG|"
    r"thalamic|hypothalam(?:us|ic)|M1|supraorbital|C2(?:\s+nerve)?)\b",
    re.IGNORECASE,
)


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    s = s.replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _first(rex: re.Pattern, text: str) -> str | None:
    m = rex.search(text)
    return m.group("v") if m else None


def _parse_block(text: str, modality: str | None) -> dict | None:
    if not text or len(text) < 12:
        return None
    t = text

    hz = hz_max = None
    mrange = _RE_HZ_RANGE.search(t)
    if mrange:
        hz = _num(mrange.group("lo"))
        hz_max = _num(mrange.group("hi"))
    else:
        hz = _num(_first(_RE_HZ, t))

    record = {
        "modality": modality,
        "frequency_hz": hz,
        "frequency_hz_max": hz_max,
        "pulse_width_us": _num(_first(_RE_PW, t)),
        "amplitude_mA": _num(_first(_RE_AMP_MA, t)),
        "amplitude_V": _num(_first(_RE_AMP_V, t)),
        "motor_threshold_pct": _num(_first(_RE_MT, t)),
        "pulses_per_session": int(_num(_first(_RE_PULSES, t)) or 0) or None,
        "session_duration_min": _num(_first(_RE_DURATION, t)),
        "sessions_per_week": int(_num(_first(_RE_PER_WEEK, t)) or 0) or None,
        "total_sessions": int(_num(_first(_RE_SESSIONS, t)) or 0) or None,
    }

    target_match = _RE_TARGET.search(t)
    record["target_anatomy"] = target_match.group(0) if target_match else None

    # confidence = high if ≥3 core fields found, medium if 2, low if 1, skip if 0
    core = [record["frequency_hz"], record["pulses_per_session"], record["total_sessions"],
            record["pulse_width_us"], record["motor_threshold_pct"], record["session_duration_min"]]
    n = sum(1 for v in core if v is not None)
    if n == 0:
        return None
    record["confidence"] = "high" if n >= 3 else "medium" if n == 2 else "low"
    record["raw_text"] = t[:1500]
    record["total_pulses"] = (
        record["pulses_per_session"] * record["total_sessions"]
        if record["pulses_per_session"] and record["total_sessions"] else None
    )
    return record


# ── Source readers ───────────────────────────────────────────────────────────

# Heuristic modality inference from intervention text. Used only when a trial
# has no entry in trial_indications (current state on the canonical DB; the
# curated linkage is a follow-up ingest step).
#
# Order matters — more specific patterns should appear before generic ones
# (e.g. taVNS before VNS, HD-tDCS before tDCS, dTMS before rTMS).
_MODALITY_HEURISTICS = (
    # --- TMS family (specific → generic) ---
    ("dTMS",    re.compile(r"\b(?:deep\s*tms|dtms|h[-\s]?coil|brainsway)\b", re.IGNORECASE)),
    ("rTMS",    re.compile(
        r"\b(?:r[-\s]?tms|repetitive\s+transcranial(?:\s+magnetic)?(?:\s+stim\w*)?|"
        r"transcranial\s+magnetic\s+stim\w*|magnetic\s+stimulator|"
        r"tbs|theta\s*burst|itbs|ctbs|spaced\s*tms|saint\s+protocol|"
        r"\btms\b)\b", re.IGNORECASE)),
    # --- tDCS family (HD-tDCS first; HD-tACS handled under tACS) ---
    ("HD-tDCS", re.compile(r"\b(?:hd[-\s]?t[-\s]?dcs|high[-\s]?definition\s+transcranial\s+direct)\b", re.IGNORECASE)),
    ("tDCS",    re.compile(r"\b(?:t[-\s]?dcs|transcranial\s+direct\s+current)\b", re.IGNORECASE)),
    ("tACS",    re.compile(r"\b(?:hd[-\s]?t[-\s]?acs|t[-\s]?acs|transcranial\s+alternating\s+current)\b", re.IGNORECASE)),
    ("tRNS",    re.compile(r"\b(?:t[-\s]?rns|transcranial\s+random\s+noise)\b", re.IGNORECASE)),
    # --- Temporal Interference (newer non-invasive deep-brain method) ---
    ("tI",      re.compile(r"\b(?:temporal\s+interference(?:\s+stim\w*)?|ti[-\s]?dbs)\b", re.IGNORECASE)),
    # --- Implantable + invasive ---
    ("DBS",     re.compile(r"\b(?:dbs|deep\s+brain\s+stimulation)\b", re.IGNORECASE)),
    # --- VNS family (specific → generic) ---
    ("taVNS",   re.compile(
        r"\b(?:tavns|tvns|t[-\s]?vns|"
        r"transcutaneous\s+(?:auricular\s+)?vagus|"
        r"auricular\s+vagus|"
        r"gammacore|cymba\s+conchae|vagustim)\b", re.IGNORECASE)),
    ("VNS",     re.compile(r"\b(?:vns|vagus\s+nerve\s+stim\w*)\b", re.IGNORECASE)),
    # --- SCS family ---
    ("tSCS",    re.compile(r"\b(?:tscs|transcutaneous\s+spinal\s+cord\s+stim\w*)\b", re.IGNORECASE)),
    ("SCS",     re.compile(r"\b(?:scs|spinal\s+cord\s+stim\w*|burst[-\s]?dr|hf10|nevro)\b", re.IGNORECASE)),
    # --- Peripheral / autonomic ---
    ("DRG",     re.compile(r"\b(?:drg(?:\s+stim\w*)?|dorsal\s+root\s+ganglion)\b", re.IGNORECASE)),
    ("PTNS",    re.compile(r"\b(?:ptns|ptnm|percutaneous\s+tibial\s+nerve\s+stim\w*)\b", re.IGNORECASE)),
    ("RNS",     re.compile(r"\b(?:rns|responsive\s+neurostim\w*)\b", re.IGNORECASE)),
    ("HNS",     re.compile(r"\b(?:hns|hypoglossal\s+nerve|inspire(?:\s+upper\s+airway)?)\b", re.IGNORECASE)),
    ("SNM",     re.compile(r"\b(?:snm|sacral\s+(?:nerve|neuro)\w*|interstim)\b", re.IGNORECASE)),
    # --- Focused ultrasound (MR-guided ablation + low-intensity neuromod) ---
    ("MRgFUS",  re.compile(r"\b(?:mrgfus|exablate)\b", re.IGNORECASE)),
    ("tFUS",    re.compile(r"\b(?:tfus|transcranial\s+focused\s+ultrasound|low[-\s]?intensity\s+focused\s+ultrasound|lifu(?:p)?)\b", re.IGNORECASE)),
    # FUS without "transcranial" qualifier — generic, lower priority
    ("FUS",     re.compile(r"\bfocused\s+ultrasound\b", re.IGNORECASE)),
    # --- Energy + light ---
    ("PBM",     re.compile(r"\b(?:pbm|photobiomodulation|low[-\s]?level\s+laser|near[-\s]?infrared(?:\s+light)?|llt)\b", re.IGNORECASE)),
    # --- Surface stim ---
    ("CES",     re.compile(r"\b(?:ces|cranial\s+electrotherapy\s+stim\w*|alpha-stim)\b", re.IGNORECASE)),
    ("TENS",    re.compile(r"\b(?:tens|transcutaneous\s+electrical\s+nerve\s+stim\w*)\b", re.IGNORECASE)),
    ("FES",     re.compile(r"\b(?:fes|functional\s+electrical\s+stim\w*)\b", re.IGNORECASE)),
    ("GVS",     re.compile(r"\b(?:gvs|galvanic\s+vestibular\s+stim\w*)\b", re.IGNORECASE)),
    # --- Behavioural/EEG ---
    ("NFB",     re.compile(r"\b(?:neurofeedback|nfb|eeg\s+biofeedback)\b", re.IGNORECASE)),
    # --- Acupuncture-adjacent (neuromod-relevant when paired with electrical current) ---
    ("EA",      re.compile(r"\belectroacupuncture\b", re.IGNORECASE)),
)


def _infer_modality(text: str) -> str | None:
    for label, rex in _MODALITY_HEURISTICS:
        if rex.search(text):
            return label
    return None


def _extract_from_trials(conn, limit: int | None, dry: bool, all_trials: bool = False) -> int:
    """Iterate trials and emit one row per intervention arm with extractable params.

    By default joins through trial_indications (uses the curated indication's
    modality). If `all_trials` is True (or trial_indications is empty), runs
    against every trial with a non-empty interventions_json and infers modality
    from the intervention text.
    """
    has_curated_links = conn.execute(
        "SELECT COUNT(*) FROM trial_indications"
    ).fetchone()[0] > 0

    if all_trials or not has_curated_links:
        sql = (
            "SELECT t.id AS tid, t.nct_id, t.interventions_json, "
            "NULL AS iid, NULL AS modality "
            "FROM trials t "
            "WHERE t.interventions_json IS NOT NULL "
            "  AND t.interventions_json != '' "
            "  AND t.interventions_json != '[]' "
            + (f"LIMIT {limit}" if limit else "")
        )
    else:
        sql = (
            "SELECT t.id AS tid, t.nct_id, t.interventions_json, "
            "i.id AS iid, i.modality "
            "FROM trials t "
            "JOIN trial_indications ti ON ti.trial_id = t.id "
            "JOIN indications i ON i.id = ti.indication_id "
            + (f"LIMIT {limit}" if limit else "")
        )

    rows = conn.execute(sql).fetchall()
    n = 0
    for r in rows:
        ivs = json.loads(r["interventions_json"] or "[]")
        for idx, iv in enumerate(ivs):
            desc = (iv.get("description") or "") + " " + (iv.get("name") or "")
            modality = r["modality"] or _infer_modality(desc)
            rec = _parse_block(desc, modality)
            if not rec:
                continue
            rec["indication_id"] = r["iid"]
            rec["source_type"] = "ctgov"
            rec["source_id"] = r["nct_id"]
            rec["arm_label"] = iv.get("name") or f"arm_{idx}"
            if dry:
                print(f"  ctgov {r['nct_id']} arm={rec['arm_label'][:40]} "
                      f"mod={rec['modality']} "
                      f"Hz={rec['frequency_hz']} pw={rec['pulse_width_us']} "
                      f"pulses={rec['pulses_per_session']} sessions={rec['total_sessions']} "
                      f"({rec['confidence']})")
            else:
                _upsert(conn, rec)
            n += 1
    return n


def _export_csv(conn, path: Path, limit: int | None = None) -> int:
    cols = [
        "source_type", "source_id", "arm_label", "modality", "target_anatomy",
        "frequency_hz", "frequency_hz_max", "pulse_width_us",
        "amplitude_mA", "amplitude_V", "motor_threshold_pct",
        "pulses_per_session", "session_duration_min", "sessions_per_week",
        "total_sessions", "total_pulses", "confidence",
    ]
    sql = f"SELECT {', '.join(cols)} FROM protocols ORDER BY confidence DESC, source_id"
    if limit:
        sql += f" LIMIT {limit}"
    rows = conn.execute(sql).fetchall()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            w.writerow([r[c] for c in cols])
    return len(rows)


def _extract_from_devices(conn, limit: int | None, dry: bool) -> int:
    # FDA PMA summaries aren't in this table directly (raw_json is the PMA
    # metadata); real label text usually needs device/udi endpoint or PDFs.
    # Skip for now — emit a count of zero and log. Follow-up: scrape
    # https://www.accessdata.fda.gov/cdrh_docs/pdf*/*S*.pdf per PMA number.
    if dry:
        print("  (FDA label extraction not yet implemented — requires PDF pull from accessdata.fda.gov)")
    return 0


def _upsert(conn, rec: dict) -> None:
    cols = [
        "indication_id", "source_type", "source_id", "arm_label", "modality",
        "target_anatomy", "waveform", "frequency_hz", "frequency_hz_max",
        "pulse_width_us", "amplitude_mA", "amplitude_V", "motor_threshold_pct",
        "pulses_per_session", "session_duration_min", "sessions_per_week",
        "total_sessions", "total_pulses", "paired_behavior",
        "raw_text", "confidence", "notes",
    ]
    placeholders = ", ".join(["?"] * len(cols))
    sql = (
        f"INSERT OR REPLACE INTO protocols ({', '.join(cols)}) VALUES ({placeholders})"
    )
    conn.execute(sql, [rec.get(c) for c in cols])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="Parse + print, don't write.")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--all-trials", action="store_true",
                    help="Skip trial_indications JOIN; run against every trial "
                         "with interventions_json (uses text-based modality inference).")
    ap.add_argument("--csv", type=Path, default=None,
                    help="After extraction, write the protocols table to this CSV path.")
    ap.add_argument("--csv-limit", type=int, default=None,
                    help="Cap rows in the exported CSV (default: all).")
    args = ap.parse_args()

    conn = db.connect()
    conn.executescript(SCHEMA)

    n_trials = _extract_from_trials(conn, args.limit, args.dry, args.all_trials)
    n_fda = _extract_from_devices(conn, args.limit, args.dry)
    print(f"extracted {n_trials} trial protocols, {n_fda} FDA protocols ({'dry' if args.dry else 'written'})")

    if not args.dry:
        total = conn.execute("SELECT count(*) FROM protocols").fetchone()[0]
        conf = dict(conn.execute(
            "SELECT confidence, count(*) FROM protocols GROUP BY confidence"
        ).fetchall())
        modality_breakdown = dict(conn.execute(
            "SELECT COALESCE(modality, 'unknown'), COUNT(*) FROM protocols GROUP BY modality"
        ).fetchall())
        print(f"protocols in DB: {total}  |  confidence: {conf}")
        print(f"modality breakdown: {modality_breakdown}")

    if args.csv:
        if args.dry:
            print(f"(dry run — skipping CSV export to {args.csv})")
        else:
            written = _export_csv(conn, args.csv, args.csv_limit)
            print(f"csv: wrote {written} rows to {args.csv}")


if __name__ == "__main__":
    main()

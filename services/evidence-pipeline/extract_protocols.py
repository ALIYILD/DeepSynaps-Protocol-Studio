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

Default trial extraction joins through `trial_indications`, and default paper
extraction joins through `paper_indications`, so extracted protocols stay wired
to the routed evidence graph. `--all-trials` is still available for manual
recovery passes when `trial_indications` is empty, but it should not be the
standing upkeep path.
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


def _best_indication_for_paper(conn, paper_id: int) -> tuple[int | None, str | None]:
    row = conn.execute(
        """
        SELECT pi.indication_id, i.modality
          FROM paper_indications pi
          JOIN indications i ON i.id = pi.indication_id
         WHERE pi.paper_id = ?
         ORDER BY COALESCE(pi.relevance, 0) DESC, pi.indication_id ASC
         LIMIT 1
        """,
        (paper_id,),
    ).fetchone()
    if not row:
        return None, None
    return row["indication_id"], row["modality"]


def _best_indication_for_trial(conn, trial_id: int) -> tuple[int | None, str | None]:
    row = conn.execute(
        """
        SELECT ti.indication_id, i.modality
          FROM trial_indications ti
          JOIN indications i ON i.id = ti.indication_id
         WHERE ti.trial_id = ?
         ORDER BY ti.indication_id ASC
         LIMIT 1
        """,
        (trial_id,),
    ).fetchone()
    if not row:
        return None, None
    return row["indication_id"], row["modality"]


def _backfill_protocol_indications(conn, source_type: str) -> int:
    updated = 0
    rows = conn.execute(
        """
        SELECT id, source_id
          FROM protocols
         WHERE source_type = ?
           AND indication_id IS NULL
        """,
        (source_type,),
    ).fetchall()
    for row in rows:
        indication_id = None
        if source_type == "paper":
            paper = conn.execute(
                """
                SELECT id
                  FROM papers
                 WHERE CAST(pmid AS TEXT) = CAST(? AS TEXT)
                    OR lower(CAST(doi AS TEXT)) = lower(CAST(? AS TEXT))
                 LIMIT 1
                """,
                (row["source_id"], row["source_id"]),
            ).fetchone()
            if paper:
                indication_id, _ = _best_indication_for_paper(conn, paper["id"])
        elif source_type == "ctgov":
            trial = conn.execute(
                "SELECT id FROM trials WHERE nct_id = ? LIMIT 1",
                (row["source_id"],),
            ).fetchone()
            if trial:
                indication_id, _ = _best_indication_for_trial(conn, trial["id"])
        if indication_id is None:
            continue
        cur = conn.execute(
            "UPDATE protocols SET indication_id = ? WHERE id = ?",
            (indication_id, row["id"]),
        )
        updated += cur.rowcount or 0
    return updated


def _prune_orphan_protocols(conn, source_type: str) -> int:
    if source_type == "paper":
        cur = conn.execute(
            """
            DELETE FROM protocols
             WHERE source_type = 'paper'
               AND NOT EXISTS (
                   SELECT 1
                     FROM papers p
                     JOIN paper_indications pi ON pi.paper_id = p.id
                    WHERE CAST(p.pmid AS TEXT) = CAST(protocols.source_id AS TEXT)
                       OR lower(CAST(p.doi AS TEXT)) = lower(CAST(protocols.source_id AS TEXT))
               )
            """
        )
        return cur.rowcount or 0
    if source_type == "ctgov":
        cur = conn.execute(
            """
            DELETE FROM protocols
             WHERE source_type = 'ctgov'
               AND NOT EXISTS (
                   SELECT 1
                     FROM trials t
                     JOIN trial_indications ti ON ti.trial_id = t.id
                    WHERE t.nct_id = protocols.source_id
               )
            """
        )
        return cur.rowcount or 0
    return 0


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
            "SELECT t.id AS tid, t.nct_id, t.interventions_json "
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
        linked_iid, linked_modality = (None, None)
        if all_trials or not has_curated_links:
            linked_iid, linked_modality = _best_indication_for_trial(conn, r["tid"])
        ivs = json.loads(r["interventions_json"] or "[]")
        for idx, iv in enumerate(ivs):
            desc = (iv.get("description") or "") + " " + (iv.get("name") or "")
            modality = (r["modality"] if "modality" in r.keys() else None) or linked_modality or _infer_modality(desc)
            rec = _parse_block(desc, modality)
            if not rec:
                continue
            rec["indication_id"] = (r["iid"] if "iid" in r.keys() else None) or linked_iid
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


def _extract_from_papers(conn, limit: int | None, dry: bool, min_confidence: str = "medium") -> int:
    """Extract structured protocols from paper abstracts.

    Conservative by default — `min_confidence='medium'` skips low-confidence
    one-field hits because abstracts contain a lot of incidental numbers
    (sample sizes, ages, p-values) that the regex pipeline can mistake for
    stim parameters. Re-rank on the abstract's modality hint when present
    (`modalities_json` is populated by the EuropePMC enrichment pipeline).
    """
    confidence_rank = {"high": 3, "medium": 2, "low": 1}
    threshold = confidence_rank.get(min_confidence, 2)

    # Detect optional columns added by migration 004_csv_enrichment.sql so this
    # script works against DBs where 004 was never applied (the canonical v4 DB
    # is one such — its papers table is the v1 shape).
    paper_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(papers)").fetchall()
    }
    has_modalities = "modalities_json" in paper_cols

    select_cols = "p.id, p.pmid, p.doi, p.title, p.abstract"
    if has_modalities:
        select_cols += ", p.modalities_json"

    sql = (
        f"SELECT {select_cols} FROM papers p "
        "WHERE p.abstract IS NOT NULL AND length(p.abstract) >= 100 "
        "  AND EXISTS (SELECT 1 FROM paper_indications pi WHERE pi.paper_id = p.id) "
        + (f"LIMIT {limit}" if limit else "")
    )
    rows = conn.execute(sql).fetchall()

    n = 0
    for r in rows:
        indication_id, indication_modality = _best_indication_for_paper(conn, r["id"])
        if indication_id is None:
            continue
        text = (r["abstract"] or "") + " " + (r["title"] or "")

        # If EuropePMC tagged the paper with a modality, prefer that. Otherwise
        # fall back to the regex-based heuristic.
        modality = indication_modality
        if has_modalities:
            try:
                mods = json.loads(r["modalities_json"]) if r["modalities_json"] else []
                if mods:
                    first = (mods[0] or "").lower()
                    modality = {
                        "tms": "rTMS", "rtms": "rTMS", "dtms": "dTMS",
                        "tdcs": "tDCS", "tacs": "tACS", "trns": "tRNS",
                        "dbs": "DBS", "vns": "VNS", "scs": "SCS",
                        "drg": "DRG", "rns": "RNS", "hns": "HNS", "snm": "SNM",
                        "mrgfus": "MRgFUS", "fus": "FUS", "tfus": "tFUS",
                        "pbm": "PBM", "nfb": "NFB", "ces": "CES",
                        "tens": "TENS", "fes": "FES",
                    }.get(first)
            except Exception:
                pass
        if not modality:
            modality = _infer_modality(text)

        rec = _parse_block(text, modality)
        if not rec:
            continue
        if confidence_rank.get(rec["confidence"], 0) < threshold:
            continue

        # Use pmid as primary, fall back to DOI; skip if neither is present.
        sid = r["pmid"] or r["doi"]
        if not sid:
            continue

        rec["indication_id"] = indication_id
        rec["source_type"] = "paper"
        rec["source_id"] = str(sid)
        rec["arm_label"] = "abstract"

        if dry:
            print(
                f"  paper {sid} mod={rec['modality']} "
                f"Hz={rec['frequency_hz']} mt={rec['motor_threshold_pct']} "
                f"sess={rec['total_sessions']} ({rec['confidence']})"
            )
        else:
            _upsert(conn, rec)
        n += 1
    return n


# ── FDA decision-summary PDF extraction ────────────────────────────────────
#
# The FDA hosts 510(k) summary statements + PMA decision summaries on a CDN
# at accessdata.fda.gov. URLs follow `/cdrh_docs/pdfYY/<NUMBER>.pdf` where YY
# is the 2-digit decision year (no year directory for pre-2002 records).
# openFDA exposes a `summary_statement_url` field but it's sparsely
# populated, so we ALSO try the year-derived guess as a fallback.
#
# Yield expectation is modest (10-30%): most 510(k) summaries are about
# substantial equivalence to a predicate, not new parameters. PMAs are
# richer but rarer in our corpus. Honest-empty-state friendly.

import shutil as _shutil
import subprocess as _subprocess
import time as _time
import urllib.error as _urlerr
import urllib.request as _urlreq

_FDA_CDN_BASE = "https://www.accessdata.fda.gov/cdrh_docs"
_FDA_OPENFDA_510K = "https://api.fda.gov/device/510k.json?search=k_number:"
_FDA_OPENFDA_PMA = "https://api.fda.gov/device/pma.json?search=pma_number:"
_FDA_USER_AGENT = (
    "DeepSynaps-Studio-evidence-pipeline/1.0 (mailto:dr.aliyildirim123@gmail.com)"
)
_FDA_INTER_REQ_SLEEP = 1.5  # polite — accessdata CDN is sluggish
_FDA_REQUEST_TIMEOUT = 30


def _fda_cache_dir() -> Path:
    p = Path(__file__).parent / ".fda_summaries"
    p.mkdir(exist_ok=True)
    return p


def _decision_year_dir(decision_date: str | None) -> str | None:
    """Return the FDA CDN year directory ('pdf22' for 2022) or None."""
    if not decision_date or len(decision_date) < 4:
        return None
    try:
        yyyy = int(decision_date[:4])
    except ValueError:
        return None
    if yyyy < 2002:
        return "pdf"  # pre-2002 records live in /cdrh_docs/pdf/ with no year suffix
    return f"pdf{yyyy % 100}"


def _candidate_pdf_urls(number: str, kind: str, decision_date: str | None) -> list[str]:
    urls: list[str] = []
    year_dir = _decision_year_dir(decision_date)
    if year_dir:
        urls.append(f"{_FDA_CDN_BASE}/{year_dir}/{number}.pdf")
    # Fallback to no-year directory.
    if year_dir != "pdf":
        urls.append(f"{_FDA_CDN_BASE}/pdf/{number}.pdf")
    return urls


def _http_get(url: str) -> bytes | None:
    """GET url with the polite User-Agent. Returns body bytes or None on HTTP error."""
    req = _urlreq.Request(url, headers={"User-Agent": _FDA_USER_AGENT})
    try:
        with _urlreq.urlopen(req, timeout=_FDA_REQUEST_TIMEOUT) as resp:
            return resp.read()
    except (_urlerr.HTTPError, _urlerr.URLError):
        return None


def _pdf_to_text(pdf_bytes: bytes) -> str | None:
    """Use pdftotext (poppler) to extract text. Returns None if pdftotext missing or extraction fails."""
    if not _shutil.which("pdftotext"):
        return None
    try:
        proc = _subprocess.run(
            ["pdftotext", "-layout", "-", "-"],
            input=pdf_bytes,
            capture_output=True,
            timeout=30,
        )
    except _subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.decode("utf-8", errors="replace")


def _extract_from_devices(conn, limit: int | None, dry: bool, fda_limit: int = 50) -> int:
    """Pull FDA decision-summary PDFs for accepted devices and parse stim params.

    `fda_limit` caps fresh network fetches per run so a 2h cron tick stays
    bounded; cached PDFs (under .fda_summaries/) are still parsed beyond
    that. The cache makes re-runs essentially free.
    """
    if not _shutil.which("pdftotext"):
        print(
            "  pdftotext not found on PATH (install: `brew install poppler`). "
            "Skipping FDA PDF extraction."
        )
        return 0

    # Honor curation_status only if the column exists; older DBs don't have it.
    have_curation = "curation_status" in {
        row[1] for row in conn.execute("PRAGMA table_info(devices)")
    }
    where = "WHERE curation_status='accept'" if have_curation else ""
    sql = f"""
        SELECT id, kind, number, applicant, trade_name, product_code, decision_date
        FROM devices
        {where}
        ORDER BY decision_date DESC
        {f'LIMIT {limit}' if limit else ''}
    """
    rows = conn.execute(sql).fetchall()

    cache = _fda_cache_dir()
    fetches = 0
    parsed = 0
    no_pdf = 0
    no_params = 0

    for r in rows:
        number = r["number"]
        kind = (r["kind"] or "").lower() or "510k"
        decision_date = r["decision_date"]
        cache_path = cache / f"{number}.pdf"

        # 1. Try cache first.
        pdf_bytes: bytes | None = None
        if cache_path.exists() and cache_path.stat().st_size > 0:
            pdf_bytes = cache_path.read_bytes()
        elif fetches < fda_limit:
            for url in _candidate_pdf_urls(number, kind, decision_date):
                if dry:
                    print(f"  fda dry: would GET {url}")
                    break
                body = _http_get(url)
                fetches += 1
                if body and body[:4] == b"%PDF":
                    cache_path.write_bytes(body)
                    pdf_bytes = body
                    break
                _time.sleep(_FDA_INTER_REQ_SLEEP)
            if pdf_bytes is None:
                no_pdf += 1
                continue
        else:
            # Cap reached, no cache — skip.
            continue

        if dry:
            continue

        text = _pdf_to_text(pdf_bytes)
        if not text or len(text) < 200:
            no_pdf += 1
            continue

        # Use the device's product_code / trade_name to seed modality where the
        # text doesn't say 'rTMS' explicitly (FDA PDFs often use full names).
        seed_text = f"{r['trade_name'] or ''} {r['product_code'] or ''} {text[:5000]}"
        modality = _infer_modality(seed_text)

        rec = _parse_block(text[:20000], modality)  # cap to keep regex fast
        if not rec:
            no_params += 1
            continue

        # Try to link to an indication via device_indications.
        indication_id_row = conn.execute(
            "SELECT indication_id FROM device_indications WHERE device_id = ? LIMIT 1",
            (r["id"],),
        ).fetchone()
        rec["indication_id"] = indication_id_row[0] if indication_id_row else None
        rec["source_type"] = f"fda_{kind}"
        rec["source_id"] = number
        rec["arm_label"] = "label_text"
        _upsert(conn, rec)
        parsed += 1

    print(
        f"  fda devices: rows={len(rows)} fetches={fetches} "
        f"parsed={parsed} no_pdf={no_pdf} no_params={no_params}"
    )
    return parsed


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
    ap.add_argument("--source", choices=["trials", "papers", "devices", "all"], default="all",
                    help="Which corpus to extract from (default: all).")
    ap.add_argument("--fda-limit", type=int, default=50,
                    help="Cap on fresh accessdata.fda.gov fetches per run "
                         "(cached PDFs in .fda_summaries/ still parse). Default 50.")
    ap.add_argument("--min-confidence", choices=["low", "medium", "high"], default="medium",
                    help="Minimum confidence for paper-derived rows (default: medium). "
                         "Trials are unaffected — they use the raw _parse_block confidence.")
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

    n_trials = 0
    n_papers = 0
    n_fda = 0
    if args.source in ("trials", "all"):
        n_trials = _extract_from_trials(conn, args.limit, args.dry, args.all_trials)
    if args.source in ("papers", "all"):
        n_papers = _extract_from_papers(conn, args.limit, args.dry, args.min_confidence)
    if args.source in ("devices", "all"):
        n_fda = _extract_from_devices(conn, args.limit, args.dry, args.fda_limit)
    if not args.dry and args.source in ("papers", "all"):
        _backfill_protocol_indications(conn, "paper")
        _prune_orphan_protocols(conn, "paper")
    if not args.dry and args.source in ("trials", "all"):
        _backfill_protocol_indications(conn, "ctgov")
        _prune_orphan_protocols(conn, "ctgov")
    print(
        f"extracted {n_trials} trial · {n_papers} paper · {n_fda} FDA "
        f"protocols ({'dry' if args.dry else 'written'})"
    )

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

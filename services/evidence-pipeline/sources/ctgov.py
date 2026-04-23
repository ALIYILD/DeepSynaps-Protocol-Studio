"""ClinicalTrials.gov v2 adapter. Preserves the intervention block verbatim so
stim parameters (Hz, µs, mA, session counts) survive into the DB for later parsing."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request


def search(query: str, max_records: int = 200) -> list[dict]:
    out = []
    next_token = None
    base = (
        "https://clinicaltrials.gov/api/v2/studies?query.term="
        + urllib.parse.quote(query)
        + f"&pageSize={min(max_records, 1000)}"
        + "&countTotal=true"
    )
    while len(out) < max_records:
        url = base + (f"&pageToken={urllib.parse.quote(next_token)}" if next_token else "")
        with urllib.request.urlopen(url, timeout=40) as r:
            data = json.loads(r.read().decode())
        studies = data.get("studies", [])
        out.extend(studies)
        next_token = data.get("nextPageToken")
        if not next_token or not studies:
            break
        time.sleep(0.2)
    return out[:max_records]


def _get(p, *keys, default=None):
    for k in keys:
        if p is None:
            return default
        p = p.get(k) if isinstance(p, dict) else None
    return p if p is not None else default


def upsert_trials(conn, results: list[dict], indication_id: int | None = None) -> int:
    n = 0
    for s in results:
        proto = s.get("protocolSection", {})
        idmod = _get(proto, "identificationModule") or {}
        statmod = _get(proto, "statusModule") or {}
        desc = _get(proto, "descriptionModule") or {}
        cond = _get(proto, "conditionsModule") or {}
        arms = _get(proto, "armsInterventionsModule") or {}
        outcomes = _get(proto, "outcomesModule") or {}
        design = _get(proto, "designModule") or {}
        spons = _get(proto, "sponsorCollaboratorsModule") or {}
        locs = _get(proto, "contactsLocationsModule") or {}

        nct = idmod.get("nctId")
        if not nct:
            continue
        phases = design.get("phases") or []
        interventions = arms.get("interventions") or []
        primary_outcomes = outcomes.get("primaryOutcomes") or []

        existing = conn.execute("SELECT id FROM trials WHERE nct_id=?", (nct,)).fetchone()
        payload = (
            nct,
            idmod.get("briefTitle") or idmod.get("officialTitle"),
            ", ".join(phases),
            statmod.get("overallStatus"),
            (design.get("enrollmentInfo") or {}).get("count"),
            json.dumps(cond.get("conditions") or [], ensure_ascii=False),
            json.dumps(interventions, ensure_ascii=False),
            json.dumps(primary_outcomes, ensure_ascii=False),
            desc.get("briefSummary"),
            (statmod.get("startDateStruct") or {}).get("date"),
            (statmod.get("lastUpdatePostDateStruct") or {}).get("date"),
            design.get("studyType"),
            (spons.get("leadSponsor") or {}).get("name"),
            json.dumps(locs.get("locations") or [], ensure_ascii=False),
            json.dumps(s, ensure_ascii=False),
        )
        if existing:
            conn.execute(
                "UPDATE trials SET title=?, phase=?, status=?, enrollment=?, "
                "conditions_json=?, interventions_json=?, outcomes_json=?, brief_summary=?, "
                "start_date=?, last_update=?, study_type=?, sponsor=?, locations_json=?, raw_json=? "
                "WHERE nct_id=?",
                (*payload[1:], nct),
            )
            trial_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO trials(nct_id, title, phase, status, enrollment, conditions_json, "
                "interventions_json, outcomes_json, brief_summary, start_date, last_update, "
                "study_type, sponsor, locations_json, raw_json) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                payload,
            )
            trial_id = cur.lastrowid
            n += 1
        if indication_id:
            conn.execute(
                "INSERT OR IGNORE INTO trial_indications(trial_id, indication_id) VALUES (?,?)",
                (trial_id, indication_id),
            )
    return n

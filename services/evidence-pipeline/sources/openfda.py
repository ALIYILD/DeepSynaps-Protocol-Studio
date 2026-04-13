from __future__ import annotations
"""openFDA adapter: PMA, 510(k), HDE, and MAUDE adverse events."""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

KEY = os.environ.get("OPENFDA_API_KEY", "")
BASE = "https://api.fda.gov"


def _call(path: str, search_expr: str, limit: int = 100, skip: int = 0) -> dict:
    # openFDA treats `+AND+` / `+OR+` in the raw URL as boolean operators; a
    # plain urllib.parse.quote() percent-encodes the `+` to `%2B`, breaking
    # the boolean. Preserve `+ : ( )` via the `safe` argument so filters work.
    search_encoded = urllib.parse.quote(search_expr, safe='+:()"')
    url = (
        f"{BASE}{path}?search={search_encoded}"
        f"&limit={limit}&skip={skip}"
        + (f"&api_key={KEY}" if KEY else "")
    )
    with urllib.request.urlopen(url, timeout=40) as r:
        return json.loads(r.read().decode())


def _product_code_clause(codes):
    if not codes:
        return ""
    ored = "+OR+".join(f'product_code:"{c}"' for c in codes)
    return f"+AND+({ored})"


def search_pma(applicant_or_tradename: str, max_records: int = 500, product_codes=None) -> list[dict]:
    # Narrow mega-vendors (e.g. Medtronic makes both DBS and cardiac leads)
    # via product-code allowlist.
    expr = (
        f'((applicant:"{applicant_or_tradename}")+OR+(trade_name:"{applicant_or_tradename}"))'
        + _product_code_clause(product_codes)
    )
    return _paginate("/device/pma.json", expr, max_records)


def search_510k(applicant_or_tradename: str, max_records: int = 500, product_codes=None) -> list[dict]:
    expr = (
        f'((applicant:"{applicant_or_tradename}")+OR+(device_name:"{applicant_or_tradename}"))'
        + _product_code_clause(product_codes)
    )
    return _paginate("/device/510k.json", expr, max_records)


def search_events(brand: str, max_records: int = 300) -> list[dict]:
    expr = f'device.brand_name:"{brand}"'
    return _paginate("/device/event.json", expr, max_records)


def _paginate(path: str, expr: str, max_records: int) -> list[dict]:
    out = []
    skip = 0
    while len(out) < max_records:
        try:
            data = _call(path, expr, limit=min(100, max_records - len(out)), skip=skip)
        except Exception:
            break
        res = data.get("results", [])
        out.extend(res)
        if len(res) < 100:
            break
        skip += 100
        time.sleep(0.2)
    return out


def upsert_devices(conn, pma: list[dict], k: list[dict], hde: list[dict] | None, indication_id: int | None = None) -> int:
    n = 0
    for rec in pma or []:
        n += _upsert_one(conn, "pma", rec.get("pma_number"), rec, indication_id)
    for rec in k or []:
        n += _upsert_one(conn, "510k", rec.get("k_number"), rec, indication_id)
    for rec in (hde or []):
        n += _upsert_one(conn, "hde", rec.get("hde_number"), rec, indication_id)
    return n


def _upsert_one(conn, kind: str, number: str | None, rec: dict, indication_id: int | None) -> int:
    if not number:
        return 0
    decision_date = rec.get("decision_date") or rec.get("date_received")
    existing = conn.execute(
        "SELECT id FROM devices WHERE kind=? AND number=? AND COALESCE(decision_date,'')=COALESCE(?,'')",
        (kind, number, decision_date),
    ).fetchone()
    if existing:
        device_id = existing["id"]
    else:
        cur = conn.execute(
            "INSERT INTO devices(kind, number, applicant, trade_name, generic_name, product_code, "
            "decision_date, advisory_committee, raw_json) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                kind, number,
                rec.get("applicant"),
                rec.get("trade_name") or rec.get("device_name"),
                rec.get("generic_name"),
                rec.get("product_code"),
                decision_date,
                rec.get("advisory_committee_description"),
                json.dumps(rec, ensure_ascii=False),
            ),
        )
        device_id = cur.lastrowid
    if indication_id:
        conn.execute(
            "INSERT OR IGNORE INTO device_indications(device_id, indication_id) VALUES (?,?)",
            (device_id, indication_id),
        )
    return 1


def upsert_events(conn, events: list[dict]) -> int:
    n = 0
    for ev in events:
        key = ev.get("mdr_report_key")
        if not key:
            continue
        device = (ev.get("device") or [{}])[0] if isinstance(ev.get("device"), list) else (ev.get("device") or {})
        try:
            conn.execute(
                "INSERT OR IGNORE INTO adverse_events(mdr_report_key, device_brand, device_generic, "
                "event_type, date_received, patient_outcome_json, raw_json) VALUES (?,?,?,?,?,?,?)",
                (
                    key,
                    device.get("brand_name"),
                    device.get("generic_name"),
                    ev.get("event_type"),
                    ev.get("date_received"),
                    json.dumps(ev.get("patient") or [], ensure_ascii=False),
                    json.dumps(ev, ensure_ascii=False),
                ),
            )
            n += 1
        except Exception:
            continue
    return n

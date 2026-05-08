"""One-shot live sanity check against the real v4 evidence DB.

Used during the feat/evidence-ui-wiring PR to confirm new endpoints return
plausible counts against the production-shape DB. This is NOT a test —
the underlying SQLite has data that drifts week-to-week as the curation
pipeline runs. Run with:

  ./.venv/bin/python scripts/_evidence_live_check.py

Output is printed for the human reviewer; nothing is asserted.
"""
import os
import sys

os.environ.setdefault(
    "EVIDENCE_DB_PATH",
    "/Users/aliyildirim/DeepSynaps-Protocol-Studio/services/"
    "evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db",
)

# Run from repo root.
sys.path.insert(0, os.path.join(os.getcwd(), "apps", "api"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    c = TestClient(app)
    hdr = {"Authorization": "Bearer clinician-demo-token"}

    r = c.get("/api/v1/evidence/papers?indication=rtms_mdd&limit=2", headers=hdr)
    print("OLD /papers indication=rtms_mdd status:", r.status_code, r.text[:160])

    r = c.get("/api/v1/evidence/indications/summary", headers=hdr)
    print("SUMMARY status:", r.status_code)
    if r.status_code == 200:
        body = r.json()
        print("  total slugs:", len(body))
        for row in body[:6]:
            print(
                "   ",
                row["slug"],
                "p=", row["paper_count"],
                "t=", row["trial_count"],
                "d=", row["device_count"],
                "pr=", row["protocol_count"],
            )

    r = c.get("/api/v1/evidence/indications/rtms_mdd/detail", headers=hdr)
    print("DETAIL rtms_mdd status:", r.status_code)
    if r.status_code == 200:
        b = r.json()
        print(
            "  papers:", len(b.get("papers", [])),
            " trials:", len(b.get("trials", [])),
            " devices:", len(b.get("devices", [])),
            " protocols:", len(b.get("protocols", [])),
            " fts_fallback:", b.get("fts_fallback"),
        )
        if b.get("devices"):
            d0 = b["devices"][0]
            print("  first device:", d0.get("trade_name"), d0.get("number"))

    r = c.get(
        "/api/v1/evidence/search?q=transcranial+magnetic+stimulation+depression&limit=3",
        headers=hdr,
    )
    print("SEARCH status:", r.status_code)
    if r.status_code == 200:
        b = r.json()
        print("  total:", b.get("total"))
        for h in b.get("hits", [])[:3]:
            print("   ", (h.get("title") or "")[:80], " pmid=", h.get("pmid"))


if __name__ == "__main__":
    main()

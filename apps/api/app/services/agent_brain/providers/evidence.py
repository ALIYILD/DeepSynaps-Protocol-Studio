"""EvidenceProvider — grounded literature/protocol evidence.

Tries two sources, in order:

1. The standalone evidence SQLite DB used by `routers/evidence_router.py`
   (`EVIDENCE_DB_PATH` → `services/evidence-pipeline/*.db`). When available,
   returns ranked papers with PMID/DOI/journal/year metadata.
2. The CSV-backed clinical_data evidence loader
   (`services/clinical_data.list_evidence_from_clinical_data`). Always
   available in test/dev — backed by `CLINICAL_DATA_ROOT/protocols.csv`.

If neither path returns rows, the provider returns the canonical
`INSUFFICIENT_EVIDENCE_FALLBACK` and an empty citations list. **It never
invents PMID/DOI**: a citation only appears when the underlying row had that
column populated.
"""
from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import (
    INSUFFICIENT_EVIDENCE_FALLBACK,
    safe_fallback,
)
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)


def _evidence_db_path() -> Optional[str]:
    """Mirror of `evidence_router._default_db_path` — kept local so this
    provider does not import the router (which has heavy deps)."""
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override and os.path.exists(override):
        return override
    legacy_override = os.environ.get("DEEPSYNAPS_DB")
    if legacy_override and os.path.exists(legacy_override):
        return legacy_override
    here = Path(__file__).resolve()
    pipeline_dir = here.parents[5] / "services" / "evidence-pipeline"
    v4 = pipeline_dir / "neuromodulation_evidence_2026-04-29_v4.db"
    if v4.exists():
        return str(v4)
    legacy = pipeline_dir / "evidence.db"
    if legacy.exists():
        return str(legacy)
    return None


class EvidenceProvider(AgentBrainProvider):
    name = "evidence"
    description = (
        "Grounded clinical/protocol evidence search. Returns paper or protocol "
        "rows from the local evidence DB or clinical-data CSV. Citations are "
        "only attached when the source row has them; missing IDs are reported, "
        "never fabricated."
    )
    allowed_roles = ["technician", "reviewer", "clinician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = True
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        # The CSV fallback ships in-repo, so the provider is always configured
        # at the manifest level. Health() distinguishes "DB present" vs "CSV-only".
        return True

    def health(self) -> dict[str, Any]:
        path = _evidence_db_path()
        return {
            "name": self.name,
            "status": "ok",
            "evidence_db": "present" if path else "missing",
            "evidence_db_path": path,
            "csv_fallback": "available",
        }

    # ── Query ─────────────────────────────────────────────────────────────────

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        q = (request.query or "").strip()
        condition = (request.condition or "").strip() or None

        # 1. Try the rich evidence DB.
        db_path = _evidence_db_path()
        if db_path:
            items, citations, source_meta = self._search_evidence_db(db_path, q, condition)
            if items:
                return ProviderResponse(
                    provider=self.name,
                    status="ok",
                    query=q,
                    answer=(
                        f"Found {len(items)} evidence paper(s) in local DB. "
                        "Clinician review required before use."
                    ),
                    items=items,
                    citations=citations if request.include_citations else [],
                    source_metadata=source_meta,
                    safety_flags=[
                        "requires_clinician_review",
                        "no_autonomous_diagnosis",
                    ],
                    requires_clinician_review=True,
                    patient_facing_allowed=False,
                    confidence="medium" if len(items) >= 3 else "low",
                )

        # 2. Try the CSV fallback (always present in repo).
        items, citations, source_meta = self._search_csv_evidence(q, condition)
        if items:
            return ProviderResponse(
                provider=self.name,
                status="ok",
                query=q,
                answer=(
                    f"Found {len(items)} curated protocol record(s) in "
                    "clinical-data CSV. Evidence DB not in use. Clinician "
                    "review required."
                ),
                items=items,
                citations=citations if request.include_citations else [],
                source_metadata=source_meta,
                safety_flags=[
                    "requires_clinician_review",
                    "no_autonomous_diagnosis",
                    "csv_fallback_used",
                ],
                missing_requirements=(
                    [] if db_path else ["evidence_db_not_present"]
                ),
                requires_clinician_review=True,
                patient_facing_allowed=False,
                confidence="low",
            )

        # 3. No evidence anywhere — safe fallback.
        return safe_fallback(
            provider=self.name,
            query=q,
            status="ok",
            answer=INSUFFICIENT_EVIDENCE_FALLBACK,
            safety_flags=["insufficient_local_evidence"],
            missing_requirements=["evidence_db_not_present", "csv_no_match"]
            if not db_path
            else ["csv_no_match"],
            confidence="unknown",
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _search_evidence_db(
        db_path: str,
        q: str,
        condition: str | None,
    ) -> tuple[list[dict], list[Citation], dict]:
        items: list[dict] = []
        citations: list[Citation] = []
        try:
            conn = sqlite3.connect(db_path, timeout=5)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute("PRAGMA query_only = 1")
            except sqlite3.DatabaseError:  # pragma: no cover
                pass

            terms: list[str] = []
            params: list[Any] = []
            if q:
                terms.append("(title LIKE ? OR abstract LIKE ?)")
                params += [f"%{q}%", f"%{q}%"]
            if condition:
                terms.append("(title LIKE ? OR abstract LIKE ?)")
                params += [f"%{condition}%", f"%{condition}%"]

            where = (" WHERE " + " AND ".join(terms)) if terms else ""
            sql = (
                "SELECT id, pmid, doi, title, year, journal, "
                "       cited_by_count, oa_url "
                "FROM papers" + where + " "
                "ORDER BY year DESC NULLS LAST, cited_by_count DESC NULLS LAST "
                "LIMIT 25"
            )
            try:
                rows = conn.execute(sql, params).fetchall()
            except sqlite3.OperationalError:
                # Older schemas / NULLS LAST unsupported. Retry without it.
                sql_simple = sql.replace(" NULLS LAST", "")
                rows = conn.execute(sql_simple, params).fetchall()

            for row in rows:
                d = {k: row[k] for k in row.keys()}
                items.append(d)
                # Only attach citation fields that are present — never invent.
                citations.append(
                    Citation(
                        source="evidence_db",
                        title=d.get("title"),
                        year=d.get("year"),
                        pmid=d.get("pmid"),
                        doi=d.get("doi"),
                        url=d.get("oa_url"),
                        journal=d.get("journal"),
                    )
                )
            conn.close()
        except sqlite3.DatabaseError as exc:  # pragma: no cover - defensive
            _log.warning("evidence_db_query_failed: %s", exc)
            return [], [], {"source": "evidence_db", "error": str(exc)}

        return items, citations, {"source": "evidence_db", "db_path": db_path}

    @staticmethod
    def _search_csv_evidence(
        q: str,
        condition: str | None,
    ) -> tuple[list[dict], list[Citation], dict]:
        try:
            from app.services.clinical_data import list_evidence_from_clinical_data
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("evidence_csv_loader_unavailable: %s", exc)
            return [], [], {"source": "clinical_data_csv", "error": str(exc)}

        try:
            payload = list_evidence_from_clinical_data()
        except Exception as exc:  # pragma: no cover
            _log.warning("evidence_csv_load_failed: %s", exc)
            return [], [], {"source": "clinical_data_csv", "error": str(exc)}

        rows = list(getattr(payload, "items", []) or [])
        ql = q.lower()
        cl = (condition or "").lower()

        def _match(row: object) -> bool:
            if not (q or condition):
                return True
            blob = " ".join(
                str(getattr(row, attr, "") or "")
                for attr in ("title", "summary", "condition", "modality", "evidence_strength")
            ).lower()
            if q and ql not in blob:
                return False
            if condition and cl not in blob:
                return False
            return True

        matched = [r for r in rows if _match(r)][:25]
        items: list[dict] = []
        citations: list[Citation] = []
        for r in matched:
            item = {
                "id": getattr(r, "id", None),
                "title": getattr(r, "title", None),
                "condition": getattr(r, "condition", None),
                "modality": getattr(r, "modality", None),
                "evidence_level": getattr(r, "evidence_level", None),
                "regulatory_status": getattr(r, "regulatory_status", None),
                "summary": getattr(r, "summary", None),
                "references": list(getattr(r, "references", []) or []),
            }
            items.append(item)
            for url in item["references"]:
                if url:
                    citations.append(
                        Citation(
                            source="clinical_data_csv",
                            title=item["title"],
                            url=url,
                            evidence_grade=item["evidence_level"],
                        )
                    )

        return items, citations, {"source": "clinical_data_csv", "match_count": len(matched)}

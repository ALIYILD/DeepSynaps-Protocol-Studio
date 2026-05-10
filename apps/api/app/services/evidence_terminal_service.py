from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Optional

from fastapi import HTTPException

from app.schemas.evidence_terminal import (
    EvidenceTerminalCounts,
    EvidenceTerminalGradeBucketOut,
    EvidenceTerminalGradeDistributionOut,
    EvidenceTerminalIndicationDetailOut,
    EvidenceTerminalIndicationsOut,
    EvidenceTerminalIndicationSummaryOut,
    EvidenceTerminalLinkOut,
    EvidenceTerminalMetricIndicationOut,
    EvidenceTerminalNetworkEdgeOut,
    EvidenceTerminalNetworkNodeOut,
    EvidenceTerminalNetworkOut,
    EvidenceTerminalOverviewOut,
    EvidenceTerminalPaperDetailOut,
    EvidenceTerminalPaperRefOut,
    EvidenceTerminalPaperSearchOut,
    EvidenceTerminalPaperSearchResultOut,
    EvidenceTerminalProtocolRefOut,
    EvidenceTerminalProtocolSearchOut,
    EvidenceTerminalProtocolSearchResultOut,
    EvidenceTerminalStatusOut,
    EvidenceTerminalTrialRefOut,
    EvidenceTerminalTrialSearchOut,
    EvidenceTerminalTrialSearchResultOut,
    GRADE_CAVEAT,
    PROTOCOL_CAVEAT,
    SAFETY_DISCLAIMER,
)


FLAGSHIP_INDICATIONS = (
    "dbs_parkinson",
    "rtms_mdd",
    "vns_stroke_rehab",
    "scs_pdn",
    "vns_epilepsy",
    "snm_bladder_bowel",
    "tdcs_depression",
)


def resolve_evidence_db_path() -> str:
    configured = os.getenv("EVIDENCE_DB_PATH") or os.getenv("DEEPSYNAPS_DB")
    if configured:
        return configured
    here = Path(__file__).resolve()
    pipeline_dir = here.parents[4] / "services" / "evidence-pipeline"
    v4_guess = pipeline_dir / "neuromodulation_evidence_2026-04-29_v4.db"
    if v4_guess.exists():
        return str(v4_guess)
    legacy_guess = pipeline_dir / "evidence.db"
    if legacy_guess.exists():
        return str(legacy_guess)
    return "/app/evidence.db"


def _connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def _require_db() -> sqlite3.Connection:
    path = resolve_evidence_db_path()
    if not os.path.exists(path):
        raise HTTPException(status_code=503, detail="Evidence terminal DB unavailable.")
    try:
        return _connect(path)
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail=f"Evidence terminal DB unavailable: {exc}") from exc


def _json_list(value: Any) -> list[Any]:
    try:
        data = json.loads(value or "[]")
        return data if isinstance(data, list) else []
    except (TypeError, ValueError):
        return []


def _abstract_snippet(text: Optional[str], limit: int = 320) -> Optional[str]:
    if not text:
        return None
    clean = " ".join(str(text).split())
    if len(clean) <= limit:
        return clean
    return clean[: limit - 1].rstrip() + "…"


def _source_url(row: sqlite3.Row) -> Optional[str]:
    if row["doi"]:
        return f"https://doi.org/{row['doi']}"
    if row["pmid"]:
        return f"https://pubmed.ncbi.nlm.nih.gov/{row['pmid']}/"
    if row["oa_url"]:
        return row["oa_url"]
    return None


def _source_links(row: sqlite3.Row) -> list[EvidenceTerminalLinkOut]:
    links: list[EvidenceTerminalLinkOut] = []
    if row["doi"]:
        links.append(EvidenceTerminalLinkOut(label="DOI", url=f"https://doi.org/{row['doi']}"))
    if row["pmid"]:
        links.append(EvidenceTerminalLinkOut(label="PubMed", url=f"https://pubmed.ncbi.nlm.nih.gov/{row['pmid']}/"))
    if row["oa_url"]:
        links.append(EvidenceTerminalLinkOut(label="Open access", url=row["oa_url"]))
    return links


def _normalize_grade(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    return raw if raw else "unknown"


def _has_table(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table,),
    ).fetchone()
    return bool(row)


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(r["name"]) for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _paper_count_expr(has_protocols: bool = True) -> str:
    protocol_fragment = "COALESCE(prc.protocol_count, 0) AS protocol_count, " if has_protocols else "0 AS protocol_count, "
    return (
        "COALESCE(pc.paper_count, 0) AS paper_count, "
        "COALESCE(tc.trial_count, 0) AS trial_count, "
        f"{protocol_fragment}"
        "COALESCE(ac.abstract_paper_count, 0) AS abstract_paper_count, "
        "ac.latest_year AS latest_year "
    )


def _indications_count_joins(has_protocols: bool = True) -> str:
    protocols_join = """
        LEFT JOIN (
            SELECT indication_id, COUNT(*) AS protocol_count
            FROM protocols
            GROUP BY indication_id
        ) prc ON prc.indication_id = i.id
    """ if has_protocols else ""
    return """
        LEFT JOIN (
            SELECT indication_id, COUNT(*) AS paper_count
            FROM paper_indications
            GROUP BY indication_id
        ) pc ON pc.indication_id = i.id
        LEFT JOIN (
            SELECT indication_id, COUNT(*) AS trial_count
            FROM trial_indications
            GROUP BY indication_id
        ) tc ON tc.indication_id = i.id
    """ + protocols_join + """
        LEFT JOIN (
            SELECT
                pi.indication_id,
                SUM(CASE WHEN p.abstract IS NOT NULL AND LENGTH(TRIM(p.abstract)) > 0 THEN 1 ELSE 0 END) AS abstract_paper_count,
                MAX(p.year) AS latest_year
            FROM paper_indications pi
            JOIN papers p ON p.id = pi.paper_id
            GROUP BY pi.indication_id
        ) ac ON ac.indication_id = i.id
    """


def _row_to_indication_summary(row: sqlite3.Row) -> EvidenceTerminalIndicationSummaryOut:
    paper_count = int(row["paper_count"] or 0)
    abstract_papers = int(row["abstract_paper_count"] or 0)
    abstract_coverage = round((abstract_papers / paper_count) * 100, 1) if paper_count else None
    safety_flags: list[str] = ["database_derived_evidence_support"]
    if row["computed_evidence_grade"]:
        safety_flags.append("computed_grade_review_required")
    if int(row["protocol_count"] or 0) > 0:
        safety_flags.append("protocol_relationships_require_verification")
    return EvidenceTerminalIndicationSummaryOut(
        indication_id=row["slug"],
        display_name=row["label"],
        modality=row["modality"],
        condition=row["condition"],
        paper_count=int(row["paper_count"] or 0),
        trial_count=int(row["trial_count"] or 0),
        protocol_count=int(row["protocol_count"] or 0),
        computed_evidence_grade=row["computed_evidence_grade"] or row["evidence_grade"],
        abstract_coverage_percent=abstract_coverage,
        latest_year=row["latest_year"],
        safety_flags=safety_flags,
    )


def _best_paper_grade(conn: sqlite3.Connection, paper_id: int) -> Optional[str]:
    row = conn.execute(
        """
        SELECT COALESCE(i.computed_evidence_grade, i.evidence_grade) AS grade
        FROM paper_indications pi
        JOIN indications i ON i.id = pi.indication_id
        WHERE pi.paper_id = ?
        ORDER BY
            CASE COALESCE(i.computed_evidence_grade, i.evidence_grade)
                WHEN 'A' THEN 1
                WHEN 'B' THEN 2
                WHEN 'C' THEN 3
                WHEN 'D' THEN 4
                WHEN 'E' THEN 5
                ELSE 99
            END
        LIMIT 1
        """,
        (paper_id,),
    ).fetchone()
    return row["grade"] if row else None


def _paper_indications(conn: sqlite3.Connection, paper_ids: Iterable[int]) -> dict[int, list[EvidenceTerminalIndicationSummaryOut]]:
    ids = list({int(x) for x in paper_ids})
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    has_protocols = _has_table(conn, "protocols")
    rows = conn.execute(
        f"""
        SELECT
            pi.paper_id,
            i.slug,
            i.label,
            i.modality,
            i.condition,
            i.evidence_grade,
            i.computed_evidence_grade,
            COALESCE(pc.paper_count, 0) AS paper_count,
            COALESCE(tc.trial_count, 0) AS trial_count,
            {"COALESCE(prc.protocol_count, 0)" if has_protocols else "0"} AS protocol_count,
            COALESCE(ac.abstract_paper_count, 0) AS abstract_paper_count,
            ac.latest_year AS latest_year
        FROM paper_indications pi
        JOIN indications i ON i.id = pi.indication_id
        {_indications_count_joins(has_protocols)}
        WHERE pi.paper_id IN ({placeholders})
        ORDER BY i.slug
        """,
        ids,
    ).fetchall()
    out: dict[int, list[EvidenceTerminalIndicationSummaryOut]] = {}
    for row in rows:
        out.setdefault(int(row["paper_id"]), []).append(_row_to_indication_summary(row))
    return out


def _tokenized_fts_query(q: Optional[str]) -> Optional[str]:
    tokens = re.findall(r"[A-Za-z0-9]{2,}", str(q or ""))
    if not tokens:
        return None
    return " ".join(tokens[:8])


def _build_paper_search_where(
    conn: sqlite3.Connection,
    *,
    q: Optional[str],
    indication: Optional[str],
    modality: Optional[str],
    grade: Optional[str],
    has_abstract: Optional[bool],
    has_doi: Optional[bool],
    has_pmid: Optional[bool],
    linked_to_trial: Optional[bool],
    linked_to_protocol: Optional[bool],
    year_from: Optional[int],
    year_to: Optional[int],
) -> tuple[list[str], list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if indication:
        where.append(
            "EXISTS (SELECT 1 FROM paper_indications pi JOIN indications i ON i.id = pi.indication_id "
            "WHERE pi.paper_id = p.id AND i.slug = ?)"
        )
        params.append(indication)
    if modality:
        where.append(
            "EXISTS (SELECT 1 FROM paper_indications pi JOIN indications i ON i.id = pi.indication_id "
            "WHERE pi.paper_id = p.id AND LOWER(i.modality) = LOWER(?))"
        )
        params.append(modality)
    if grade:
        if grade.lower() == "unknown":
            where.append(
                "NOT EXISTS (SELECT 1 FROM paper_indications pi JOIN indications i ON i.id = pi.indication_id "
                "WHERE pi.paper_id = p.id AND COALESCE(i.computed_evidence_grade, i.evidence_grade) IS NOT NULL)"
            )
        else:
            where.append(
                "EXISTS (SELECT 1 FROM paper_indications pi JOIN indications i ON i.id = pi.indication_id "
                "WHERE pi.paper_id = p.id AND COALESCE(i.computed_evidence_grade, i.evidence_grade) = ?)"
            )
            params.append(grade)
    if has_abstract is True:
        where.append("p.abstract IS NOT NULL AND LENGTH(TRIM(p.abstract)) > 0")
    if has_abstract is False:
        where.append("(p.abstract IS NULL OR LENGTH(TRIM(p.abstract)) = 0)")
    if has_doi is True:
        where.append("p.doi IS NOT NULL AND TRIM(p.doi) != ''")
    if has_doi is False:
        where.append("(p.doi IS NULL OR TRIM(p.doi) = '')")
    if has_pmid is True:
        where.append("p.pmid IS NOT NULL AND TRIM(p.pmid) != ''")
    if has_pmid is False:
        where.append("(p.pmid IS NULL OR TRIM(p.pmid) = '')")
    if linked_to_trial is True:
        where.append("EXISTS (SELECT 1 FROM paper_trial_links ptl WHERE ptl.paper_id = p.id AND ptl.trial_id IS NOT NULL)")
    if linked_to_trial is False:
        where.append("NOT EXISTS (SELECT 1 FROM paper_trial_links ptl WHERE ptl.paper_id = p.id AND ptl.trial_id IS NOT NULL)")
    if linked_to_protocol is True:
        where.append(
            "EXISTS (SELECT 1 FROM paper_trial_links ptl JOIN protocols pr ON pr.source_type = 'ctgov' AND pr.source_id = ptl.nct_id "
            "WHERE ptl.paper_id = p.id)"
        )
    if linked_to_protocol is False:
        where.append(
            "NOT EXISTS (SELECT 1 FROM paper_trial_links ptl JOIN protocols pr ON pr.source_type = 'ctgov' AND pr.source_id = ptl.nct_id "
            "WHERE ptl.paper_id = p.id)"
        )
    if year_from is not None:
        where.append("p.year >= ?")
        params.append(year_from)
    if year_to is not None:
        where.append("p.year <= ?")
        params.append(year_to)
    if q:
        like = f"%{q.strip()}%"
        sub_parts = [
            "p.title LIKE ?",
            "p.abstract LIKE ?",
            "p.pmid LIKE ?",
            "p.doi LIKE ?",
            "p.authors_json LIKE ?",
            "EXISTS (SELECT 1 FROM paper_indications pi JOIN indications i ON i.id = pi.indication_id "
            "WHERE pi.paper_id = p.id AND (i.slug LIKE ? OR i.label LIKE ? OR i.condition LIKE ?))",
        ]
        sub_params: list[Any] = [like, like, like, like, like, like, like, like]
        fts_query = _tokenized_fts_query(q)
        if fts_query:
            sub_parts.insert(0, "p.id IN (SELECT rowid FROM papers_fts WHERE papers_fts MATCH ?)")
            sub_params.insert(0, fts_query)
        where.append("(" + " OR ".join(sub_parts) + ")")
        params.extend(sub_params)
    return where, params


def get_terminal_status() -> EvidenceTerminalStatusOut:
    path = resolve_evidence_db_path()
    if not os.path.exists(path):
        return EvidenceTerminalStatusOut(db_available=False, db_path=path)
    try:
        conn = _connect(path)
        has_protocols = _has_table(conn, "protocols")
        counts = conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM papers) AS papers,
                (SELECT COUNT(*) FROM papers WHERE abstract IS NOT NULL AND LENGTH(TRIM(abstract)) > 0) AS papers_with_abstracts,
                (SELECT COUNT(*) FROM paper_indications) AS paper_indications,
                (SELECT COUNT(*) FROM trial_indications) AS trial_indications,
                (SELECT COUNT(*) FROM paper_trial_links) AS paper_trial_links,
                (SELECT COUNT(*) FROM paper_trial_links WHERE trial_id IS NOT NULL) AS resolved_paper_trial_links
            """
        ).fetchone()
        protocols = int(conn.execute("SELECT COUNT(*) FROM protocols").fetchone()[0]) if has_protocols else 0
        orphan_protocols = int(conn.execute("SELECT COUNT(*) FROM protocols WHERE indication_id IS NULL").fetchone()[0]) if has_protocols else 0
        last_updated_row = conn.execute("SELECT MAX(last_ingested) AS last_updated FROM papers").fetchone()
        migrations = conn.execute("SELECT COUNT(*) AS c FROM schema_migrations").fetchone()["c"] if _has_table(conn, "schema_migrations") else 0
        conn.close()
    except sqlite3.Error:
        return EvidenceTerminalStatusOut(db_available=False, db_path=path)
    papers = int(counts["papers"] or 0)
    abstracts = int(counts["papers_with_abstracts"] or 0)
    coverage = round((abstracts / papers) * 100, 1) if papers else 0.0
    return EvidenceTerminalStatusOut(
        db_available=True,
        db_path=path,
        last_updated=last_updated_row["last_updated"],
        counts=EvidenceTerminalCounts(
            papers=papers,
            papers_with_abstracts=abstracts,
            abstract_coverage_percent=coverage,
            paper_indications=int(counts["paper_indications"] or 0),
            trial_indications=int(counts["trial_indications"] or 0),
            paper_trial_links=int(counts["paper_trial_links"] or 0),
            resolved_paper_trial_links=int(counts["resolved_paper_trial_links"] or 0),
            protocols=protocols,
            orphan_protocols=orphan_protocols,
        ),
        pipeline_metadata={"schema_migration_count": int(migrations or 0)},
    )


def _top_indications(conn: sqlite3.Connection, order_by: str, limit: int = 8) -> list[EvidenceTerminalMetricIndicationOut]:
    has_protocols = _has_table(conn, "protocols")
    rows = conn.execute(
        f"""
        SELECT
            i.slug,
            i.label,
            i.modality,
            i.computed_evidence_grade,
            COALESCE(pc.paper_count, 0) AS paper_count,
            COALESCE(tc.trial_count, 0) AS trial_count,
            {"COALESCE(prc.protocol_count, 0)" if has_protocols else "0"} AS protocol_count
        FROM indications i
        {_indications_count_joins(has_protocols)}
        ORDER BY {order_by}, i.slug
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [
        EvidenceTerminalMetricIndicationOut(
            indication_id=row["slug"],
            display_name=row["label"],
            modality=row["modality"],
            computed_evidence_grade=row["computed_evidence_grade"],
            paper_count=int(row["paper_count"] or 0),
            trial_count=int(row["trial_count"] or 0),
            protocol_count=int(row["protocol_count"] or 0),
        )
        for row in rows
    ]


def get_terminal_overview() -> EvidenceTerminalOverviewOut:
    status = get_terminal_status()
    if not status.db_available:
        raise HTTPException(status_code=503, detail="Evidence terminal DB unavailable.")
    conn = _require_db()
    try:
        has_protocols = _has_table(conn, "protocols")
        grade_rows = conn.execute(
            """
            SELECT COALESCE(computed_evidence_grade, evidence_grade, 'unknown') AS grade, COUNT(*) AS count
            FROM indications
            GROUP BY COALESCE(computed_evidence_grade, evidence_grade, 'unknown')
            ORDER BY grade
            """
        ).fetchall()
        modality_rows = conn.execute(
            """
            SELECT modality AS grade, COUNT(*) AS count
            FROM indications
            WHERE modality IS NOT NULL AND TRIM(modality) != ''
            GROUP BY modality
            ORDER BY count DESC, modality
            """
        ).fetchall()
        flagship_placeholders = ",".join("?" for _ in FLAGSHIP_INDICATIONS)
        flagship_rows = conn.execute(
            f"""
            SELECT
                i.slug,
                i.label,
                i.modality,
                i.computed_evidence_grade,
                COALESCE(pc.paper_count, 0) AS paper_count,
                COALESCE(tc.trial_count, 0) AS trial_count,
                {"COALESCE(prc.protocol_count, 0)" if has_protocols else "0"} AS protocol_count
            FROM indications i
            {_indications_count_joins(has_protocols)}
            WHERE i.slug IN ({flagship_placeholders})
            ORDER BY i.slug
            """,
            FLAGSHIP_INDICATIONS,
        ).fetchall()
        top_papers = _top_indications(conn, "paper_count DESC", 10)
        top_trials = _top_indications(conn, "trial_count DESC", 10)
        top_protocols = _top_indications(conn, "protocol_count DESC", 10)
    finally:
        conn.close()
    return EvidenceTerminalOverviewOut(
        db_available=True,
        counts=status.counts,
        grade_distribution=[EvidenceTerminalGradeBucketOut(grade=_normalize_grade(r["grade"]), count=int(r["count"] or 0)) for r in grade_rows],
        modality_distribution=[EvidenceTerminalGradeBucketOut(grade=str(r["grade"]), count=int(r["count"] or 0)) for r in modality_rows],
        top_indications_by_paper_count=top_papers,
        top_indications_by_trial_count=top_trials,
        top_indications_by_protocol_count=top_protocols,
        flagship_indications=[
            EvidenceTerminalMetricIndicationOut(
                indication_id=row["slug"],
                display_name=row["label"],
                modality=row["modality"],
                computed_evidence_grade=row["computed_evidence_grade"],
                paper_count=int(row["paper_count"] or 0),
                trial_count=int(row["trial_count"] or 0),
                protocol_count=int(row["protocol_count"] or 0),
            )
            for row in flagship_rows
        ],
        relationship_counts={
            "paper_indications": status.counts.paper_indications,
            "trial_indications": status.counts.trial_indications,
            "paper_trial_links": status.counts.paper_trial_links,
            "resolved_paper_trial_links": status.counts.resolved_paper_trial_links,
            "protocols": status.counts.protocols,
        },
    )


def list_terminal_indications(
    *,
    q: Optional[str],
    modality: Optional[str],
    grade: Optional[str],
    min_papers: int,
    min_trials: int,
    min_protocols: int,
    limit: int,
    offset: int,
    sort: str,
) -> EvidenceTerminalIndicationsOut:
    conn = _require_db()
    try:
        has_protocols = _has_table(conn, "protocols")
        where = [
            "COALESCE(pc.paper_count, 0) >= ?",
            "COALESCE(tc.trial_count, 0) >= ?",
            "COALESCE(prc.protocol_count, 0) >= ?",
        ]
        params: list[Any] = [min_papers, min_trials, min_protocols]
        if q:
            like = f"%{q.strip()}%"
            where.append("(i.slug LIKE ? OR i.label LIKE ? OR i.condition LIKE ?)")
            params.extend([like, like, like])
        if modality:
            where.append("LOWER(i.modality) = LOWER(?)")
            params.append(modality)
        if grade:
            if grade.lower() == "unknown":
                where.append("COALESCE(i.computed_evidence_grade, i.evidence_grade) IS NULL")
            else:
                where.append("COALESCE(i.computed_evidence_grade, i.evidence_grade) = ?")
                params.append(grade)
        order_map = {
            "papers": "paper_count DESC, trial_count DESC, i.slug",
            "trials": "trial_count DESC, paper_count DESC, i.slug",
            "protocols": "protocol_count DESC, paper_count DESC, i.slug",
            "grade": (
                "CASE COALESCE(i.computed_evidence_grade, i.evidence_grade) "
                "WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'E' THEN 5 ELSE 99 END, "
                "paper_count DESC, i.slug"
            ),
            "name": "i.label ASC",
            "latest_year": "latest_year DESC, paper_count DESC, i.slug",
        }
        order_sql = order_map.get(sort, order_map["papers"])
        base_sql = f"""
            FROM indications i
            {_indications_count_joins(has_protocols)}
            WHERE {" AND ".join(where)}
        """
        total = conn.execute("SELECT COUNT(*) " + base_sql, params).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT
                i.slug,
                i.label,
                i.modality,
                i.condition,
                i.evidence_grade,
                i.computed_evidence_grade,
                {_paper_count_expr(has_protocols)}
            {base_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
    finally:
        conn.close()
    return EvidenceTerminalIndicationsOut(
        total=int(total or 0),
        limit=limit,
        offset=offset,
        results=[_row_to_indication_summary(row) for row in rows],
    )


def get_terminal_indication_detail(indication_id: str) -> EvidenceTerminalIndicationDetailOut:
    conn = _require_db()
    try:
        has_protocols = _has_table(conn, "protocols")
        row = conn.execute(
            f"""
            SELECT
                i.id,
                i.slug,
                i.label,
                i.modality,
                i.condition,
                i.evidence_grade,
                i.computed_evidence_grade,
                {_paper_count_expr(has_protocols)}
            FROM indications i
            {_indications_count_joins(has_protocols)}
            WHERE i.slug = ?
            """,
            (indication_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Indication not found.")
        top_papers = conn.execute(
            """
            SELECT p.id, p.title, p.year, p.journal, p.pmid, p.doi
            FROM papers p
            JOIN paper_indications pi ON pi.paper_id = p.id
            WHERE pi.indication_id = ?
            ORDER BY COALESCE(p.cited_by_count, 0) DESC, p.year DESC, p.id DESC
            LIMIT 10
            """,
            (row["id"],),
        ).fetchall()
        top_trials = conn.execute(
            """
            SELECT t.id, t.nct_id, t.title, t.status, t.phase, t.last_update
            FROM trials t
            JOIN trial_indications ti ON ti.trial_id = t.id
            WHERE ti.indication_id = ?
            ORDER BY t.last_update DESC, t.id DESC
            LIMIT 10
            """,
            (row["id"],),
        ).fetchall()
        top_protocols = conn.execute(
            """
            SELECT id, source_type, source_id, modality, arm_label, confidence, target_anatomy
            FROM protocols
            WHERE indication_id = ?
            ORDER BY
                CASE confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 99 END,
                id
            LIMIT 10
            """,
            (row["id"],),
        ).fetchall() if has_protocols else []
    finally:
        conn.close()
    summary = _row_to_indication_summary(row)
    caveats = [SAFETY_DISCLAIMER, GRADE_CAVEAT]
    if summary.protocol_count:
        caveats.append(PROTOCOL_CAVEAT)
    return EvidenceTerminalIndicationDetailOut(
        indication=summary,
        linked_papers_summary={"count": summary.paper_count},
        linked_trials_summary={"count": summary.trial_count},
        linked_protocols_summary={"count": summary.protocol_count},
        top_papers=[
            EvidenceTerminalPaperRefOut(
                paper_id=int(p["id"]),
                title=p["title"],
                year=p["year"],
                journal=p["journal"],
                pmid=p["pmid"],
                doi=p["doi"],
                computed_evidence_grade=summary.computed_evidence_grade,
            )
            for p in top_papers
        ],
        top_trials=[
            EvidenceTerminalTrialRefOut(
                trial_id=int(t["id"]),
                nct_id=t["nct_id"],
                title=t["title"],
                status=t["status"],
                phase=t["phase"],
                last_update=t["last_update"],
            )
            for t in top_trials
        ],
        top_protocols=[
            EvidenceTerminalProtocolRefOut(
                protocol_id=int(p["id"]),
                source_type=p["source_type"],
                source_id=p["source_id"],
                modality=p["modality"],
                arm_label=p["arm_label"],
                confidence=p["confidence"],
                target_anatomy=p["target_anatomy"],
            )
            for p in top_protocols
        ],
        available_modalities=[summary.modality] if summary.modality else [],
        evidence_caveats=caveats,
    )


def search_terminal_papers(
    *,
    q: Optional[str],
    indication: Optional[str],
    modality: Optional[str],
    grade: Optional[str],
    has_abstract: Optional[bool],
    has_doi: Optional[bool],
    has_pmid: Optional[bool],
    linked_to_trial: Optional[bool],
    linked_to_protocol: Optional[bool],
    year_from: Optional[int],
    year_to: Optional[int],
    limit: int,
    offset: int,
    sort: str,
) -> EvidenceTerminalPaperSearchOut:
    conn = _require_db()
    try:
        paper_columns = _table_columns(conn, "papers")
        where, params = _build_paper_search_where(
            conn,
            q=q,
            indication=indication,
            modality=modality,
            grade=grade,
            has_abstract=has_abstract,
            has_doi=has_doi,
            has_pmid=has_pmid,
            linked_to_trial=linked_to_trial,
            linked_to_protocol=linked_to_protocol,
            year_from=year_from,
            year_to=year_to,
        )
        order_map = {
            "newest": "p.year DESC, p.id DESC",
            "oldest": "p.year ASC, p.id ASC",
            "grade": (
                "CASE (SELECT COALESCE(i.computed_evidence_grade, i.evidence_grade) "
                "FROM paper_indications pi JOIN indications i ON i.id = pi.indication_id "
                "WHERE pi.paper_id = p.id "
                "ORDER BY CASE COALESCE(i.computed_evidence_grade, i.evidence_grade) "
                "WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'E' THEN 5 ELSE 99 END LIMIT 1) "
                "WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'E' THEN 5 ELSE 99 END, "
                "COALESCE(p.cited_by_count, 0) DESC, p.year DESC, p.id DESC"
            ),
            "relevance": "COALESCE(p.cited_by_count, 0) DESC, p.year DESC, p.id DESC",
        }
        order_sql = order_map.get(sort, order_map["relevance"])
        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute("SELECT COUNT(*) FROM papers p" + where_sql, params).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT
                p.id,
                p.title,
                p.abstract,
                p.year,
                p.journal,
                p.authors_json,
                p.pmid,
                p.doi,
                p.oa_url,
                p.sources_json,
                {"p.abstract_source" if "abstract_source" in paper_columns else "NULL"} AS abstract_source,
                (SELECT COUNT(*) FROM paper_trial_links ptl WHERE ptl.paper_id = p.id AND ptl.trial_id IS NOT NULL) AS linked_trials_count,
                (SELECT COUNT(*) FROM paper_trial_links ptl
                    JOIN protocols pr ON pr.source_type = 'ctgov' AND pr.source_id = ptl.nct_id
                 WHERE ptl.paper_id = p.id) AS linked_protocols_count
            FROM papers p
            {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
        indication_map = _paper_indications(conn, [row["id"] for row in rows])
        results: list[EvidenceTerminalPaperSearchResultOut] = []
        for row in rows:
            paper_id = int(row["id"])
            linked_indications = indication_map.get(paper_id, [])
            results.append(
                EvidenceTerminalPaperSearchResultOut(
                    paper_id=paper_id,
                    title=row["title"],
                    abstract_snippet=_abstract_snippet(row["abstract"]),
                    year=row["year"],
                    authors=[str(x) for x in _json_list(row["authors_json"])],
                    journal=row["journal"],
                    pmid=row["pmid"],
                    doi=row["doi"],
                    source_url=_source_url(row),
                    indications=linked_indications,
                    linked_trials_count=int(row["linked_trials_count"] or 0),
                    linked_protocols_count=int(row["linked_protocols_count"] or 0),
                    computed_evidence_grade=linked_indications[0].computed_evidence_grade if linked_indications else _best_paper_grade(conn, paper_id),
                    source_metadata={
                        "sources": _json_list(row["sources_json"]),
                        "abstract_source": row["abstract_source"],
                        "database_record": True,
                    },
                )
            )
    finally:
        conn.close()
    return EvidenceTerminalPaperSearchOut(total=int(total or 0), limit=limit, offset=offset, results=results)


def get_terminal_paper_detail(paper_id: int) -> EvidenceTerminalPaperDetailOut:
    conn = _require_db()
    try:
        paper_columns = _table_columns(conn, "papers")
        row = conn.execute(
            """
            SELECT
                p.id, p.title, p.abstract, p.year, p.journal, p.authors_json, p.pmid, p.doi,
                p.oa_url, p.sources_json, """ + ("p.abstract_source" if "abstract_source" in paper_columns else "NULL") + """ AS abstract_source
            FROM papers p
            WHERE p.id = ?
            """,
            (paper_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Paper not found.")
        indications = _paper_indications(conn, [paper_id]).get(paper_id, [])
        trials = conn.execute(
            """
            SELECT DISTINCT t.id, t.nct_id, t.title, t.status, t.phase, t.last_update
            FROM paper_trial_links ptl
            JOIN trials t ON t.id = ptl.trial_id
            WHERE ptl.paper_id = ?
            ORDER BY t.last_update DESC, t.id DESC
            """,
            (paper_id,),
        ).fetchall()
        protocols = conn.execute(
            """
            SELECT DISTINCT pr.id, pr.source_type, pr.source_id, pr.modality, pr.arm_label, pr.confidence, pr.target_anatomy, pr.raw_text
            FROM paper_trial_links ptl
            JOIN protocols pr ON pr.source_type = 'ctgov' AND pr.source_id = ptl.nct_id
            WHERE ptl.paper_id = ?
            ORDER BY pr.id
            """,
            (paper_id,),
        ).fetchall()
    finally:
        conn.close()
    linked_protocols = [
        EvidenceTerminalProtocolRefOut(
            protocol_id=int(p["id"]),
            source_type=p["source_type"],
            source_id=p["source_id"],
            modality=p["modality"],
            arm_label=p["arm_label"],
            confidence=p["confidence"],
            target_anatomy=p["target_anatomy"],
        )
        for p in protocols
    ]
    safety_caveats = [SAFETY_DISCLAIMER, GRADE_CAVEAT]
    if not row["abstract"]:
        safety_caveats.append("Abstract not available in local database")
    if linked_protocols:
        safety_caveats.append(PROTOCOL_CAVEAT)
    return EvidenceTerminalPaperDetailOut(
        paper_id=int(row["id"]),
        title=row["title"],
        abstract=row["abstract"],
        authors=[str(x) for x in _json_list(row["authors_json"])],
        journal=row["journal"],
        year=row["year"],
        pmid=row["pmid"],
        doi=row["doi"],
        source_links=_source_links(row),
        indications=indications,
        trials_linked=[
            EvidenceTerminalTrialRefOut(
                trial_id=int(t["id"]),
                nct_id=t["nct_id"],
                title=t["title"],
                status=t["status"],
                phase=t["phase"],
                last_update=t["last_update"],
            )
            for t in trials
        ],
        protocols_linked=linked_protocols,
        extracted_protocol_snippets=[_abstract_snippet(p["raw_text"], 220) for p in protocols if p["raw_text"]][:3],
        computed_evidence_grade=indications[0].computed_evidence_grade if indications else None,
        source_provenance={
            "database_record": True,
            "sources": _json_list(row["sources_json"]),
            "abstract_source": row["abstract_source"],
        },
        safety_caveats=safety_caveats,
    )


def search_terminal_trials(
    *,
    q: Optional[str],
    indication: Optional[str],
    modality: Optional[str],
    limit: int,
    offset: int,
) -> EvidenceTerminalTrialSearchOut:
    conn = _require_db()
    try:
        where: list[str] = []
        params: list[Any] = []
        if indication:
            where.append(
                "EXISTS (SELECT 1 FROM trial_indications ti JOIN indications i ON i.id = ti.indication_id "
                "WHERE ti.trial_id = t.id AND i.slug = ?)"
            )
            params.append(indication)
        if modality:
            where.append(
                "EXISTS (SELECT 1 FROM trial_indications ti JOIN indications i ON i.id = ti.indication_id "
                "WHERE ti.trial_id = t.id AND LOWER(i.modality) = LOWER(?))"
            )
            params.append(modality)
        if q:
            like = f"%{q.strip()}%"
            sub_parts = ["t.title LIKE ?", "t.brief_summary LIKE ?", "t.nct_id LIKE ?"]
            sub_params: list[Any] = [like, like, like]
            fts_query = _tokenized_fts_query(q)
            if fts_query:
                sub_parts.insert(0, "t.id IN (SELECT rowid FROM trials_fts WHERE trials_fts MATCH ?)")
                sub_params.insert(0, fts_query)
            where.append("(" + " OR ".join(sub_parts) + ")")
            params.extend(sub_params)
        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute("SELECT COUNT(*) FROM trials t" + where_sql, params).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT
                t.id, t.nct_id, t.title, t.status, t.phase, t.enrollment, t.sponsor, t.last_update
            FROM trials t
            {where_sql}
            ORDER BY t.last_update DESC, t.id DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
        results: list[EvidenceTerminalTrialSearchResultOut] = []
        for row in rows:
            has_protocols = _has_table(conn, "protocols")
            ind_rows = conn.execute(
                f"""
                SELECT
                    i.slug, i.label, i.modality, i.condition, i.evidence_grade, i.computed_evidence_grade,
                    {_paper_count_expr(has_protocols)}
                FROM trial_indications ti
                JOIN indications i ON i.id = ti.indication_id
                {_indications_count_joins(has_protocols)}
                WHERE ti.trial_id = ?
                ORDER BY i.slug
                """,
                (row["id"],),
            ).fetchall()
            results.append(
                EvidenceTerminalTrialSearchResultOut(
                    trial_id=int(row["id"]),
                    nct_id=row["nct_id"],
                    title=row["title"],
                    status=row["status"],
                    phase=row["phase"],
                    enrollment=row["enrollment"],
                    sponsor=row["sponsor"],
                    last_update=row["last_update"],
                    indications=[_row_to_indication_summary(ind) for ind in ind_rows],
                    linked_papers_count=int(
                        conn.execute("SELECT COUNT(*) FROM paper_trial_links WHERE trial_id = ?", (row["id"],)).fetchone()[0] or 0
                    ),
                    linked_protocols_count=int(
                        conn.execute("SELECT COUNT(*) FROM protocols WHERE source_type = 'ctgov' AND source_id = ?", (row["nct_id"],)).fetchone()[0] or 0
                    ),
                )
            )
    finally:
        conn.close()
    return EvidenceTerminalTrialSearchOut(total=int(total or 0), limit=limit, offset=offset, results=results)


def search_terminal_protocols(
    *,
    q: Optional[str],
    indication: Optional[str],
    modality: Optional[str],
    grade: Optional[str],
    limit: int,
    offset: int,
) -> EvidenceTerminalProtocolSearchOut:
    conn = _require_db()
    try:
        where = []
        params: list[Any] = []
        if q:
            like = f"%{q.strip()}%"
            where.append("(pr.source_id LIKE ? OR pr.arm_label LIKE ? OR pr.target_anatomy LIKE ? OR pr.raw_text LIKE ?)")
            params.extend([like, like, like, like])
        if indication:
            where.append("i.slug = ?")
            params.append(indication)
        if modality:
            where.append("LOWER(COALESCE(pr.modality, i.modality)) = LOWER(?)")
            params.append(modality)
        if grade:
            if grade.lower() == "unknown":
                where.append("COALESCE(i.computed_evidence_grade, i.evidence_grade) IS NULL")
            else:
                where.append("COALESCE(i.computed_evidence_grade, i.evidence_grade) = ?")
                params.append(grade)
        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute(
            "SELECT COUNT(*) FROM protocols pr LEFT JOIN indications i ON i.id = pr.indication_id" + where_sql,
            params,
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT
                pr.id, pr.source_type, pr.source_id, pr.modality, pr.arm_label, pr.target_anatomy,
                pr.waveform, pr.frequency_hz, pr.pulse_width_us, pr.amplitude_mA, pr.amplitude_V,
                pr.session_duration_min, pr.sessions_per_week, pr.total_sessions, pr.confidence,
                i.slug AS indication_slug, i.label AS indication_label
            FROM protocols pr
            LEFT JOIN indications i ON i.id = pr.indication_id
            {where_sql}
            ORDER BY
                CASE pr.confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 99 END,
                pr.id
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
        results: list[EvidenceTerminalProtocolSearchResultOut] = []
        for row in rows:
            linked_trial_rows = []
            linked_paper_ids: list[int] = []
            if row["source_type"] == "ctgov":
                linked_trial_rows = conn.execute("SELECT id, nct_id FROM trials WHERE nct_id = ?", (row["source_id"],)).fetchall()
                linked_paper_ids = [int(r["paper_id"]) for r in conn.execute("SELECT paper_id FROM paper_trial_links WHERE nct_id = ?", (row["source_id"],)).fetchall()]
            results.append(
                EvidenceTerminalProtocolSearchResultOut(
                    protocol_id=int(row["id"]),
                    indication_id=row["indication_slug"],
                    indication_display_name=row["indication_label"],
                    source_type=row["source_type"],
                    source_id=row["source_id"],
                    modality=row["modality"],
                    arm_label=row["arm_label"],
                    target_anatomy=row["target_anatomy"],
                    waveform=row["waveform"],
                    frequency_hz=row["frequency_hz"],
                    pulse_width_us=row["pulse_width_us"],
                    amplitude_mA=row["amplitude_mA"],
                    amplitude_V=row["amplitude_V"],
                    session_duration_min=row["session_duration_min"],
                    sessions_per_week=row["sessions_per_week"],
                    total_sessions=row["total_sessions"],
                    extracted_parameters_present=any(
                        row[key] is not None
                        for key in ("frequency_hz", "pulse_width_us", "amplitude_mA", "amplitude_V", "session_duration_min", "sessions_per_week", "total_sessions")
                    ),
                    extraction_confidence=row["confidence"],
                    linked_paper_ids=linked_paper_ids,
                    linked_trial_ids=[int(r["id"]) for r in linked_trial_rows],
                    linked_trial_nct_ids=[r["nct_id"] for r in linked_trial_rows],
                )
            )
    finally:
        conn.close()
    return EvidenceTerminalProtocolSearchOut(total=int(total or 0), limit=limit, offset=offset, results=results)


def get_terminal_network(
    *,
    indication: Optional[str],
    modality: Optional[str],
    max_nodes: int,
    min_grade: Optional[str],
) -> EvidenceTerminalNetworkOut:
    conn = _require_db()
    try:
        ind_where = []
        params: list[Any] = []
        if indication:
            ind_where.append("i.slug = ?")
            params.append(indication)
        if modality:
            ind_where.append("LOWER(i.modality) = LOWER(?)")
            params.append(modality)
        if min_grade:
            if min_grade.lower() == "unknown":
                ind_where.append("COALESCE(i.computed_evidence_grade, i.evidence_grade) IS NULL")
            else:
                ind_where.append("COALESCE(i.computed_evidence_grade, i.evidence_grade) = ?")
                params.append(min_grade)
        ind_where_sql = (" WHERE " + " AND ".join(ind_where)) if ind_where else ""
        indication_rows = conn.execute(
            f"""
            SELECT i.id, i.slug, i.label, i.modality, COALESCE(i.computed_evidence_grade, i.evidence_grade) AS grade
            FROM indications i
            {ind_where_sql}
            ORDER BY i.slug
            LIMIT ?
            """,
            params + [max(1, min(max_nodes // 4, 12))],
        ).fetchall()
        nodes: list[EvidenceTerminalNetworkNodeOut] = []
        edges: list[EvidenceTerminalNetworkEdgeOut] = []
        node_ids: set[str] = set()
        indication_ids = [int(r["id"]) for r in indication_rows]
        if not indication_ids:
            return EvidenceTerminalNetworkOut(nodes=[], edges=[], max_nodes_applied=max_nodes)
        placeholders = ",".join("?" for _ in indication_ids)
        paper_rows = conn.execute(
            f"""
            SELECT DISTINCT p.id, p.title
            FROM papers p
            JOIN paper_indications pi ON pi.paper_id = p.id
            WHERE pi.indication_id IN ({placeholders})
            ORDER BY COALESCE(p.cited_by_count, 0) DESC, p.id DESC
            LIMIT ?
            """,
            indication_ids + [max(1, min(max_nodes // 2, max_nodes))],
        ).fetchall()
        trial_rows = conn.execute(
            f"""
            SELECT DISTINCT t.id, t.nct_id, t.title
            FROM trials t
            JOIN trial_indications ti ON ti.trial_id = t.id
            WHERE ti.indication_id IN ({placeholders})
            ORDER BY t.last_update DESC, t.id DESC
            LIMIT ?
            """,
            indication_ids + [max(1, min(max_nodes // 3, max_nodes))],
        ).fetchall()
        protocol_rows = conn.execute(
            f"""
            SELECT DISTINCT id, source_type, source_id, modality
            FROM protocols
            WHERE indication_id IN ({placeholders})
            ORDER BY id DESC
            LIMIT ?
            """,
            indication_ids + [max(1, min(max_nodes // 3, max_nodes))],
        ).fetchall() if _has_table(conn, "protocols") else []
        for row in indication_rows:
            node_id = f"indication:{row['slug']}"
            node_ids.add(node_id)
            nodes.append(EvidenceTerminalNetworkNodeOut(id=node_id, type="indication", label=row["label"], meta={"modality": row["modality"], "grade": row["grade"]}))
        for row in paper_rows:
            if len(nodes) >= max_nodes:
                break
            node_id = f"paper:{row['id']}"
            node_ids.add(node_id)
            nodes.append(EvidenceTerminalNetworkNodeOut(id=node_id, type="paper", label=row["title"] or f"Paper {row['id']}"))
        for row in trial_rows:
            if len(nodes) >= max_nodes:
                break
            node_id = f"trial:{row['id']}"
            node_ids.add(node_id)
            nodes.append(EvidenceTerminalNetworkNodeOut(id=node_id, type="trial", label=row["nct_id"], meta={"title": row["title"]}))
        for row in protocol_rows:
            if len(nodes) >= max_nodes:
                break
            node_id = f"protocol:{row['id']}"
            node_ids.add(node_id)
            nodes.append(EvidenceTerminalNetworkNodeOut(id=node_id, type="protocol", label=row["source_id"], meta={"source_type": row["source_type"], "modality": row["modality"]}))
        for row in conn.execute(
            f"SELECT paper_id, indication_id FROM paper_indications WHERE indication_id IN ({placeholders}) LIMIT ?",
            indication_ids + [max_nodes * 2],
        ).fetchall():
            edge = EvidenceTerminalNetworkEdgeOut(
                source=f"indication:{next(r['slug'] for r in indication_rows if r['id'] == row['indication_id'])}",
                target=f"paper:{row['paper_id']}",
                type="paper_indication",
            )
            if edge.source in node_ids and edge.target in node_ids:
                edges.append(edge)
        for row in conn.execute(
            f"SELECT trial_id, indication_id FROM trial_indications WHERE indication_id IN ({placeholders}) LIMIT ?",
            indication_ids + [max_nodes * 2],
        ).fetchall():
            edge = EvidenceTerminalNetworkEdgeOut(
                source=f"indication:{next(r['slug'] for r in indication_rows if r['id'] == row['indication_id'])}",
                target=f"trial:{row['trial_id']}",
                type="trial_indication",
            )
            if edge.source in node_ids and edge.target in node_ids:
                edges.append(edge)
        for row in conn.execute(
            "SELECT paper_id, trial_id FROM paper_trial_links WHERE trial_id IS NOT NULL LIMIT ?",
            (max_nodes * 2,),
        ).fetchall():
            edge = EvidenceTerminalNetworkEdgeOut(source=f"paper:{row['paper_id']}", target=f"trial:{row['trial_id']}", type="paper_trial_link")
            if edge.source in node_ids and edge.target in node_ids:
                edges.append(edge)
        for row in protocol_rows:
            if row["source_type"] == "ctgov":
                trial_row = next((t for t in trial_rows if t["nct_id"] == row["source_id"]), None)
                if trial_row:
                    edge = EvidenceTerminalNetworkEdgeOut(source=f"trial:{trial_row['id']}", target=f"protocol:{row['id']}", type="protocol_source_link")
                    if edge.source in node_ids and edge.target in node_ids:
                        edges.append(edge)
    finally:
        conn.close()
    return EvidenceTerminalNetworkOut(nodes=nodes[:max_nodes], edges=edges, max_nodes_applied=max_nodes)


def get_terminal_grade_distribution() -> EvidenceTerminalGradeDistributionOut:
    conn = _require_db()
    try:
        rows = conn.execute(
            """
            SELECT COALESCE(computed_evidence_grade, evidence_grade, 'unknown') AS grade, COUNT(*) AS count
            FROM indications
            GROUP BY COALESCE(computed_evidence_grade, evidence_grade, 'unknown')
            ORDER BY grade
            """
        ).fetchall()
    finally:
        conn.close()
    return EvidenceTerminalGradeDistributionOut(
        grades=[EvidenceTerminalGradeBucketOut(grade=_normalize_grade(r["grade"]), count=int(r["count"] or 0)) for r in rows]
    )

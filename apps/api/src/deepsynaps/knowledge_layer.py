"""Phase 0-2 Knowledge Layer — governed data access with provenance and confidence.

Dialect-aware: works with both SQLite (dev/test) and PostgreSQL (production).
"""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import json
import os

from contracts import MultimodalEvent, EvidenceLink
import database


class KnowledgeLayer:
    """Governed knowledge layer with provenance, confidence, and audit tracking.

    Works with both SQLite (development / testing) and PostgreSQL (production).
    Set DATABASE_URL=postgresql://... for production, or leave unset for SQLite.
    """

    def __init__(self, db_url: Optional[str] = None, db_path: Optional[str] = None):
        """Initialize with db_url (preferred) or db_path (backward-compatible)."""
        self.db_url = db_url or db_path or database._db_url()
        self.db_path = self.db_url  # backward compatibility for tests
        self.dialect = database.check_dialect()
        self._init_db()

    def _connect(self):
        """Return a dialect-aware connection."""
        return database.connect(self.db_url)

    def _init_db(self):
        conn = self._connect()
        try:
            # Use the centralized init for tables + indexes
            database.init_all_tables(conn)
            cur = conn.cursor()
            self._seed_evidence(cur)
            conn.commit()
        finally:
            conn.close()

    def _seed_evidence(self, cursor):
        """Seed evidence database with starter citations."""
        seed = [
            ("ev_qeeg_001", "literature", "Jeste et al. 2015: qEEG delta power as predictor of cognitive decline",
             "B", 0.72, 1, 0, "https://pubmed.ncbi.nlm.nih.gov/25887717/", "qeeg", "cognitive_decline,prediction"),
            ("ev_biomarker_001", "literature", "Jack et al. 2018: NfL as biomarker for neurodegeneration",
             "B", 0.78, 1, 0, "https://pubmed.ncbi.nlm.nih.gov/29337889/", "biomarker", "neurodegeneration,biomarker"),
            ("ev_sleep_001", "literature", "Walker 2017: Sleep disruption impairs memory consolidation",
             "A", 0.85, 0, 0, "https://doi.org/10.1016/j.neuron.2017.05.038", "wearable", "sleep,cognition"),
            ("ev_medication_001", "literature", "Richardson et al. 2019: Anticholinergic burden and cognitive decline",
             "B", 0.68, 1, 0, "https://pubmed.ncbi.nlm.nih.gov/30690698/", "medication", "cognitive_decline,medication"),
            ("ev_mri_001", "literature", "Frisoni et al. 2010: Hippocampal atrophy as AD biomarker",
             "A", 0.88, 0, 0, "https://pubmed.ncbi.nlm.nih.gov/20224505/", "mri", "alzheimers,hippocampus"),
            ("ev_adherence_001", "literature", "Vrijens et al. 2012: Medication adherence and outcomes",
             "A", 0.82, 0, 0, "https://pubmed.ncbi.nlm.nih.gov/22311013/", "medication", "adherence,outcomes"),
            ("ev_voice_001", "literature", "Cummins et al. 2015: Voice analysis for depression detection",
             "C", 0.55, 1, 1, "https://pubmed.ncbi.nlm.nih.gov/26682895/", "voice", "depression,psychiatric"),
            ("ev_assessment_001", "literature", "MMSE sensitivity for mild cognitive impairment",
             "B", 0.65, 1, 1, "https://pubmed.ncbi.nlm.nih.gov/1268288/", "assessment", "cognitive_assessment,sensitivity"),
        ]
        try:
            if self.dialect == "postgresql":
                cursor.executemany(
                    "INSERT INTO evidence_db VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT (evidence_id) DO NOTHING",
                    seed
                )
            else:
                cursor.executemany(
                    "INSERT OR IGNORE INTO evidence_db VALUES (?,?,?,?,?,?,?,?,?,?)",
                    seed
                )
        except Exception:
            pass

    def get_events_for_patient(
        self,
        patient_id: str,
        modality_filter: Optional[List[str]] = None,
        date_range: Optional[Tuple[datetime, datetime]] = None,
    ) -> List[MultimodalEvent]:
        """Retrieve events for a patient with optional filtering."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            ph = "%s" if self.dialect == "postgresql" else "?"

            query = f"SELECT * FROM multimodal_events WHERE patient_id = {ph}"
            params = [patient_id]

            if modality_filter:
                placeholders = ",".join([ph] * len(modality_filter))
                query += f" AND modality IN ({placeholders})"
                params.extend(modality_filter)

            if date_range:
                query += f" AND timestamp >= {ph} AND timestamp <= {ph}"
                params.extend([date_range[0].isoformat(), date_range[1].isoformat()])

            query += " ORDER BY timestamp ASC"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            events = []
            for row in rows:
                events.append(self._row_to_event(row, cur))
            return events
        finally:
            conn.close()

    def insert_event(self, event: MultimodalEvent) -> str:
        """Insert a multimodal event into the knowledge layer."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            ph = "%s" if self.dialect == "postgresql" else "?"
            if self.dialect == "postgresql":
                cur.execute(
                    f"INSERT INTO multimodal_events "
                    f"(event_id, patient_id, event_type, modality, source_system, source_record_id, "
                    f"timestamp, value_summary, numeric_features, textual_summary, confidence, "
                    f"data_quality, provenance, evidence_links, audit_reference) "
                    f"VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph},{ph}) "
                    f"ON CONFLICT (event_id) DO UPDATE SET "
                    f"patient_id=EXCLUDED.patient_id, event_type=EXCLUDED.event_type, "
                    f"modality=EXCLUDED.modality, source_system=EXCLUDED.source_system, "
                    f"source_record_id=EXCLUDED.source_record_id, timestamp=EXCLUDED.timestamp, "
                    f"value_summary=EXCLUDED.value_summary, numeric_features=EXCLUDED.numeric_features, "
                    f"textual_summary=EXCLUDED.textual_summary, confidence=EXCLUDED.confidence, "
                    f"data_quality=EXCLUDED.data_quality, provenance=EXCLUDED.provenance, "
                    f"evidence_links=EXCLUDED.evidence_links, audit_reference=EXCLUDED.audit_reference",
                    (event.event_id, event.patient_id, event.event_type, event.modality,
                     event.source_system, event.source_record_id, event.timestamp.isoformat(),
                     event.value_summary, json.dumps(event.numeric_features), event.textual_summary,
                     event.confidence, event.data_quality, json.dumps(event.provenance),
                     json.dumps(event.evidence_links), event.audit_reference)
                )
            else:
                cur.execute(
                    "INSERT OR REPLACE INTO multimodal_events "
                    "(event_id, patient_id, event_type, modality, source_system, source_record_id, "
                    "timestamp, value_summary, numeric_features, textual_summary, confidence, "
                    "data_quality, provenance, evidence_links, audit_reference) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (event.event_id, event.patient_id, event.event_type, event.modality,
                     event.source_system, event.source_record_id, event.timestamp.isoformat(),
                     event.value_summary, json.dumps(event.numeric_features), event.textual_summary,
                     event.confidence, event.data_quality, json.dumps(event.provenance),
                     json.dumps(event.evidence_links), event.audit_reference)
                )
            conn.commit()
            # Invalidate patient cache on data mutation
            try:
                from cache_service import get_cache_service
                cache = get_cache_service()
                cache.invalidate_patient(event.patient_id)
            except Exception:
                pass  # Cache invalidation is best-effort
            return event.event_id
        finally:
            conn.close()

    def get_evidence_for_modalities(self, modalities: List[str]) -> List[EvidenceLink]:
        """Retrieve relevant evidence for given modalities."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            evidence = []
            ph = "%s" if self.dialect == "postgresql" else "?"
            for modality in modalities:
                if self.dialect == "postgresql":
                    cur.execute(
                        "SELECT * FROM evidence_db WHERE modality_scope LIKE %s OR modality_scope = %s",
                        (f"%{modality}%", modality)
                    )
                else:
                    cur.execute(
                        "SELECT * FROM evidence_db WHERE modality_scope LIKE ? OR modality_scope = ?",
                        (f"%{modality}%", modality)
                    )
                for row in cur.fetchall():
                    evidence.append(self._row_to_evidence(row, cur))
            return evidence
        finally:
            conn.close()

    def get_evidence_by_grade(self, min_grade: str = "C") -> List[EvidenceLink]:
        """Get evidence meeting minimum grade threshold."""
        grade_order = {"A": 4, "B": 3, "C": 2, "D": 1}
        min_val = grade_order.get(min_grade, 1)
        conn = self._connect()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM evidence_db")
            results = []
            for row in cur.fetchall():
                grade = self._col_value(row, cur, "evidence_grade")
                if grade_order.get(grade, 0) >= min_val:
                    results.append(self._row_to_evidence(row, cur))
            return results
        finally:
            conn.close()

    def log_audit(self, endpoint: str, clinician_id: str, clinic_id: str,
                  patient_id: str, action: str, request_hash: str = "",
                  response_status: str = ""):
        """Log an audit entry."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            ph = "%s" if self.dialect == "postgresql" else "?"
            cur.execute(
                f"INSERT INTO audit_log (endpoint, clinician_id, clinic_id, patient_id, action, request_hash, response_status) "
                f"VALUES ({ph},{ph},{ph},{ph},{ph},{ph},{ph})",
                (endpoint, clinician_id, clinic_id, patient_id, action, request_hash, response_status)
            )
            conn.commit()
            # Invalidate clinic cache on audit log (activity changes affect summaries)
            try:
                from cache_service import get_cache_service
                cache = get_cache_service()
                if clinic_id:
                    cache.invalidate_clinic(clinic_id)
            except Exception:
                pass  # Cache invalidation is best-effort
        finally:
            conn.close()

    def check_patient_access(self, patient_id: str, clinic_id: str,
                             clinician_id: str) -> Dict[str, Any]:
        """Check if clinician has access to patient."""
        conn = self._connect()
        try:
            cur = conn.cursor()
            ph = "%s" if self.dialect == "postgresql" else "?"
            cur.execute(
                f"SELECT * FROM patient_access WHERE patient_id = {ph} AND clinic_id = {ph} AND clinician_id = {ph}",
                (patient_id, clinic_id, clinician_id)
            )
            row = cur.fetchone()
            if row:
                return {
                    "has_access": True,
                    "access_level": self._col_value(row, cur, "access_level"),
                    "ai_analysis_consent": bool(self._col_value(row, cur, "ai_analysis_consent")),
                }
            return {"has_access": False, "access_level": None, "ai_analysis_consent": False}
        finally:
            conn.close()

    # ── Column value helpers (dialect-agnostic) ──────────────────

    def _col_value(self, row, cursor, name: str):
        """Get column value by name from a row."""
        if hasattr(row, name):
            return getattr(row, name)
        if hasattr(row, "__getitem__"):
            if hasattr(cursor, "description") and cursor.description:
                for i, desc in enumerate(cursor.description):
                    if desc[0] == name:
                        return row[i]
            # Fallback for psycopg2 RealDictRow
            try:
                return row[name]
            except (KeyError, TypeError):
                pass
        return None

    def _row_to_event(self, row, cursor=None) -> MultimodalEvent:
        return MultimodalEvent(
            event_id=self._col_value(row, cursor, "event_id") or "",
            patient_id=self._col_value(row, cursor, "patient_id") or "",
            event_type=self._col_value(row, cursor, "event_type") or "",
            modality=self._col_value(row, cursor, "modality") or "",
            source_system=self._col_value(row, cursor, "source_system") or "",
            source_record_id=self._col_value(row, cursor, "source_record_id") or "",
            timestamp=datetime.fromisoformat(self._col_value(row, cursor, "timestamp")),
            value_summary=self._col_value(row, cursor, "value_summary") or "",
            numeric_features=json.loads(self._col_value(row, cursor, "numeric_features") or "{}"),
            textual_summary=self._col_value(row, cursor, "textual_summary") or "",
            confidence=self._col_value(row, cursor, "confidence") or 0.0,
            data_quality=self._col_value(row, cursor, "data_quality") or "unknown",
            provenance=json.loads(self._col_value(row, cursor, "provenance") or "{}"),
            evidence_links=json.loads(self._col_value(row, cursor, "evidence_links") or "[]"),
            audit_reference=self._col_value(row, cursor, "audit_reference") or "",
        )

    def _row_to_evidence(self, row, cursor=None) -> EvidenceLink:
        return EvidenceLink(
            evidence_id=self._col_value(row, cursor, "evidence_id") or "",
            source_type=self._col_value(row, cursor, "source_type") or "",
            citation=self._col_value(row, cursor, "citation") or "",
            evidence_grade=self._col_value(row, cursor, "evidence_grade"),
            confidence=self._col_value(row, cursor, "confidence") or 0.0,
            research_only=bool(self._col_value(row, cursor, "research_only")),
            conflicting=bool(self._col_value(row, cursor, "conflicting")),
            url=self._col_value(row, cursor, "url"),
        )

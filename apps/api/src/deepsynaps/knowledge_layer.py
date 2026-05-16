"""Phase 0-2 Knowledge Layer — governed data access with provenance and confidence."""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import json
import sqlite3
import os

from contracts import MultimodalEvent, EvidenceLink


class KnowledgeLayer:
    """Governed knowledge layer with provenance, confidence, and audit tracking."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or os.environ.get("DEEPSYNAPS_DB", ":memory:")
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Events table with full provenance
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS multimodal_events (
                event_id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                modality TEXT NOT NULL,
                source_system TEXT NOT NULL,
                source_record_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                value_summary TEXT NOT NULL,
                numeric_features TEXT,
                textual_summary TEXT,
                confidence REAL DEFAULT 0.0,
                data_quality TEXT DEFAULT 'unknown',
                provenance TEXT,
                evidence_links TEXT,
                audit_reference TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Evidence database
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evidence_db (
                evidence_id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                citation TEXT NOT NULL,
                evidence_grade TEXT,
                confidence REAL DEFAULT 0.0,
                research_only INTEGER DEFAULT 1,
                conflicting INTEGER DEFAULT 0,
                url TEXT,
                modality_scope TEXT,
                clinical_tags TEXT
            )
        """)

        # Patient access control
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_access (
                patient_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                clinician_id TEXT NOT NULL,
                access_level TEXT DEFAULT 'read',
                ai_analysis_consent INTEGER DEFAULT 0,
                PRIMARY KEY (patient_id, clinic_id, clinician_id)
            )
        """)

        # Audit log
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                endpoint TEXT,
                clinician_id TEXT,
                clinic_id TEXT,
                patient_id TEXT,
                action TEXT,
                request_hash TEXT,
                response_status TEXT
            )
        """)

        # Seed sample evidence
        self._seed_evidence(cursor)

        conn.commit()
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
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = "SELECT * FROM multimodal_events WHERE patient_id = ?"
        params = [patient_id]

        if modality_filter:
            placeholders = ",".join("?" * len(modality_filter))
            query += f" AND modality IN ({placeholders})"
            params.extend(modality_filter)

        if date_range:
            query += " AND timestamp >= ? AND timestamp <= ?"
            params.extend([date_range[0].isoformat(), date_range[1].isoformat()])

        query += " ORDER BY timestamp ASC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        events = []
        for row in rows:
            events.append(self._row_to_event(row))
        return events

    def insert_event(self, event: MultimodalEvent) -> str:
        """Insert a multimodal event into the knowledge layer."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO multimodal_events
            (event_id, patient_id, event_type, modality, source_system, source_record_id,
             timestamp, value_summary, numeric_features, textual_summary, confidence,
             data_quality, provenance, evidence_links, audit_reference)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            event.event_id, event.patient_id, event.event_type, event.modality,
            event.source_system, event.source_record_id, event.timestamp.isoformat(),
            event.value_summary, json.dumps(event.numeric_features), event.textual_summary,
            event.confidence, event.data_quality, json.dumps(event.provenance),
            json.dumps(event.evidence_links), event.audit_reference,
        ))
        conn.commit()
        conn.close()
        return event.event_id

    def get_evidence_for_modalities(self, modalities: List[str]) -> List[EvidenceLink]:
        """Retrieve relevant evidence for given modalities."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        evidence = []
        for modality in modalities:
            cursor.execute(
                "SELECT * FROM evidence_db WHERE modality_scope LIKE ? OR modality_scope = ?",
                (f"%{modality}%", modality)
            )
            for row in cursor.fetchall():
                evidence.append(self._row_to_evidence(row))

        conn.close()
        return evidence

    def get_evidence_by_grade(self, min_grade: str = "C") -> List[EvidenceLink]:
        """Get evidence meeting minimum grade threshold."""
        grade_order = {"A": 4, "B": 3, "C": 2, "D": 1}
        min_val = grade_order.get(min_grade, 1)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM evidence_db")
        results = []
        for row in cursor.fetchall():
            if grade_order.get(row["evidence_grade"], 0) >= min_val:
                results.append(self._row_to_evidence(row))
        conn.close()
        return results

    def log_audit(self, endpoint: str, clinician_id: str, clinic_id: str,
                  patient_id: str, action: str, request_hash: str = "",
                  response_status: str = ""):
        """Log an audit entry."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO audit_log (endpoint, clinician_id, clinic_id, patient_id, action, request_hash, response_status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (endpoint, clinician_id, clinic_id, patient_id, action, request_hash, response_status))
        conn.commit()
        conn.close()

    def check_patient_access(self, patient_id: str, clinic_id: str,
                             clinician_id: str) -> Dict[str, Any]:
        """Check if clinician has access to patient."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM patient_access WHERE patient_id = ? AND clinic_id = ? AND clinician_id = ?
        """, (patient_id, clinic_id, clinician_id))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                "has_access": True,
                "access_level": row["access_level"],
                "ai_analysis_consent": bool(row["ai_analysis_consent"]),
            }
        return {"has_access": False, "access_level": None, "ai_analysis_consent": False}

    def _row_to_event(self, row: sqlite3.Row) -> MultimodalEvent:
        return MultimodalEvent(
            event_id=row["event_id"],
            patient_id=row["patient_id"],
            event_type=row["event_type"],
            modality=row["modality"],
            source_system=row["source_system"],
            source_record_id=row["source_record_id"],
            timestamp=datetime.fromisoformat(row["timestamp"]),
            value_summary=row["value_summary"],
            numeric_features=json.loads(row["numeric_features"] or "{}"),
            textual_summary=row["textual_summary"] or "",
            confidence=row["confidence"] or 0.0,
            data_quality=row["data_quality"] or "unknown",
            provenance=json.loads(row["provenance"] or "{}"),
            evidence_links=json.loads(row["evidence_links"] or "[]"),
            audit_reference=row["audit_reference"] or "",
        )

    def _row_to_evidence(self, row: sqlite3.Row) -> EvidenceLink:
        return EvidenceLink(
            evidence_id=row["evidence_id"],
            source_type=row["source_type"],
            citation=row["citation"],
            evidence_grade=row["evidence_grade"],
            confidence=row["confidence"] or 0.0,
            research_only=bool(row["research_only"]),
            conflicting=bool(row["conflicting"]),
            url=row["url"],
        )

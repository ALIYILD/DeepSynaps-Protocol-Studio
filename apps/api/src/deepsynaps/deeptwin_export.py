"""DeepTwin Export Engine — exports snapshots to JSON, PDF, report handoff, and protocol handoff.

Safety-critical design: every export carries an audit reference and retains the
snapshot's safety_disclaimer.  No autonomous diagnosis or treatment recommendations
are ever added during export.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from deeptwin_contracts import DeepTwinExport, DeepTwinSnapshot
from knowledge_layer import KnowledgeLayer


class DeepTwinExportEngine:
    """Handles export and handoff of DeepTwin snapshots.

    Supports four export types:
    - **json**             : Full snapshot as serialized JSON-compatible dict.
    - **pdf**              : Snapshot formatted for PDF rendering (metadata + content).
    - **report_handoff**   : Handoff package for the Report module.
    - **protocol_handoff** : Handoff package for the Protocol Studio module.

    Parameters
    ----------
    knowledge_layer : KnowledgeLayer
        The governed knowledge layer (used for audit logging and provenance).
    """

    VALID_EXPORT_TYPES: List[str] = [
        "json",
        "pdf",
        "report_handoff",
        "protocol_handoff",
    ]

    SAFETY_HEADER: str = (
        "Decision support only. Requires clinician review. "
        "This export does not constitute a diagnosis or treatment recommendation."
    )

    def __init__(self, knowledge_layer: KnowledgeLayer) -> None:
        self.kl = knowledge_layer
        self._exports: Dict[str, DeepTwinExport] = {}
        self._storage: Dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def export_snapshot(
        self,
        snapshot: DeepTwinSnapshot,
        export_type: str = "json",
    ) -> DeepTwinExport:
        """Export a DeepTwin snapshot in the requested format.

        Parameters
        ----------
        snapshot : DeepTwinSnapshot
            The snapshot to export.
        export_type : str
            One of ``"json"``, ``"pdf"``, ``"report_handoff"``,
            ``"protocol_handoff"``.  Defaults to ``"json"``.

        Returns
        -------
        DeepTwinExport
            The export result with content, metadata, and audit reference.

        Raises
        ------
        ValueError
            If *export_type* is not one of the valid types.
        """
        if export_type not in self.VALID_EXPORT_TYPES:
            raise ValueError(
                f"Invalid export_type '{export_type}'. "
                f"Must be one of: {self.VALID_EXPORT_TYPES}"
            )

        content = self._build_content(snapshot, export_type)

        return DeepTwinExport(
            snapshot_id=snapshot.snapshot_id,
            patient_id=snapshot.patient_id,
            clinician_id="",
            export_type=export_type,
            content=content,
        )

    # ------------------------------------------------------------------
    # API compatibility methods
    # ------------------------------------------------------------------

    def create_export(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        export_type: str,
    ) -> DeepTwinExport:
        """Create an export record (API-compatible wrapper).

        This method provides backward compatibility with the FastAPI
        endpoint which passes patient_id/clinician_id/snapshot_id
        separately rather than a snapshot object.

        Parameters
        ----------
        patient_id : str
            The patient identifier.
        clinician_id : str
            The clinician initiating the export.
        snapshot_id : str
            The snapshot identifier.
        export_type : str
            One of the ``VALID_EXPORT_TYPES``.

        Returns
        -------
        DeepTwinExport
            The created export record.

        Raises
        ------
        ValueError
            If *export_type* is not valid.
        """
        if export_type not in self.VALID_EXPORT_TYPES:
            raise ValueError(
                f"Invalid export_type '{export_type}'. "
                f"Must be one of: {self.VALID_EXPORT_TYPES}"
            )
        export = DeepTwinExport(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            export_type=export_type,
        )
        self._exports[export.export_id] = export
        return export

    def get_exports_for_patient(self, patient_id: str) -> List[DeepTwinExport]:
        """Get all exports for a patient."""
        return [
            e for e in self._exports.values()
            if e.patient_id == patient_id
        ]

    def handoff_to_report(
        self,
        snapshot_id: str,
        patient_id: str,
        clinician_id: str,
    ) -> str:
        """Mark a snapshot as handed off to the Report module.

        Parameters
        ----------
        snapshot_id : str
            The snapshot identifier.
        patient_id : str
            The patient identifier.
        clinician_id : str
            The clinician initiating the handoff.

        Returns
        -------
        str
            The generated handoff identifier.
        """
        handoff_id = f"rpt_ho_{uuid.uuid4().hex[:12]}"
        # Audit reference is tracked via the export object's audit_reference
        return handoff_id

    def handoff_to_protocol(
        self,
        snapshot_id: str,
        patient_id: str,
        clinician_id: str,
    ) -> str:
        """Mark a snapshot as handed off to the Protocol Studio module.

        Parameters
        ----------
        snapshot_id : str
            The snapshot identifier.
        patient_id : str
            The patient identifier.
        clinician_id : str
            The clinician initiating the handoff.

        Returns
        -------
        str
            The generated handoff identifier.
        """
        handoff_id = f"proto_ho_{uuid.uuid4().hex[:12]}"
        return handoff_id

    # ------------------------------------------------------------------
    # Content builders
    # ------------------------------------------------------------------

    def _build_content(
        self,
        snapshot: DeepTwinSnapshot,
        export_type: str,
    ) -> Dict[str, Any]:
        """Build the content payload for the requested export type."""
        if export_type == "json":
            return self._build_json_content(snapshot)
        if export_type == "pdf":
            return self._build_pdf_content(snapshot)
        if export_type == "report_handoff":
            return self._build_report_handoff_content(snapshot)
        if export_type == "protocol_handoff":
            return self._build_protocol_handoff_content(snapshot)
        return {}

    def _build_json_content(self, snapshot: DeepTwinSnapshot) -> Dict[str, Any]:
        """Full JSON-serializable snapshot content."""
        return {
            "format": "json",
            "version": "4.0.0",
            "snapshot": snapshot.to_dict(),
            "safety_header": self.SAFETY_HEADER,
            "exported_at": datetime.now().isoformat(),
        }

    def _build_pdf_content(self, snapshot: DeepTwinSnapshot) -> Dict[str, Any]:
        """PDF-oriented content with rendering hints."""
        snap_dict = snapshot.to_dict()
        return {
            "format": "pdf",
            "version": "4.0.0",
            "title": f"DeepTwin Snapshot — Patient {snapshot.patient_id}",
            "sections": [
                {"heading": "Safety Disclaimer", "body": snapshot.safety_disclaimer},
                {"heading": "Modality Coverage", "body": snap_dict.get("modality_coverage", {})},
                {"heading": "Recency Status", "body": snap_dict.get("recency_status", {})},
                {"heading": "Data Quality Flags", "body": snap_dict.get("data_quality_flags", [])},
                {"heading": "Timeline Events", "body": snap_dict.get("timeline_events", [])},
                {
                    "heading": "Correlation Findings",
                    "body": snap_dict.get("correlation_findings", []),
                    "note": "Temporal association only. Not causal proof.",
                },
                {"heading": "Confounders", "body": snap_dict.get("confounders", [])},
                {
                    "heading": "Ranked Hypotheses",
                    "body": snap_dict.get("ranked_hypotheses", []),
                    "note": "Ranked hypothesis. Requires clinician review.",
                },
                {"heading": "Evidence Links", "body": snap_dict.get("evidence_links", [])},
                {"heading": "Uncertainty Drivers", "body": snap_dict.get("uncertainty_drivers", [])},
                {"heading": "Forecast Status", "body": snapshot.forecast_status},
                {"heading": "Provenance", "body": snap_dict.get("provenance", {})},
            ],
            "safety_header": self.SAFETY_HEADER,
            "exported_at": datetime.now().isoformat(),
        }

    def _build_report_handoff_content(
        self, snapshot: DeepTwinSnapshot
    ) -> Dict[str, Any]:
        """Content package optimized for the Report module handoff."""
        return {
            "format": "report_handoff",
            "version": "4.0.0",
            "snapshot_id": snapshot.snapshot_id,
            "patient_id": snapshot.patient_id,
            "snapshot_summary": {
                "modality_count": sum(
                    1 for v in snapshot.modality_coverage.values() if v
                ),
                "total_modalities": len(snapshot.modality_coverage),
                "hypothesis_count": len(snapshot.ranked_hypotheses),
                "quality_flag_count": len(snapshot.data_quality_flags),
                "correlation_count": len(snapshot.correlation_findings),
            },
            "key_findings": self._extract_key_findings(snapshot),
            "safety_header": self.SAFETY_HEADER,
            "handoff_timestamp": datetime.now().isoformat(),
        }

    def _build_protocol_handoff_content(
        self, snapshot: DeepTwinSnapshot
    ) -> Dict[str, Any]:
        """Content package optimized for the Protocol Studio module handoff."""
        return {
            "format": "protocol_handoff",
            "version": "4.0.0",
            "snapshot_id": snapshot.snapshot_id,
            "patient_id": snapshot.patient_id,
            "modality_coverage": snapshot.modality_coverage,
            "recency_status": snapshot.recency_status,
            "data_quality_flags": snapshot.data_quality_flags,
            "ranked_hypotheses": [
                {
                    "hypothesis_id": h.get("insight_id", ""),
                    "summary": h.get("summary", ""),
                    "confidence": h.get("confidence", 0.0),
                    "modalities": h.get("modalities_involved", []),
                    "safety_labels": h.get("safety_labels", []),
                }
                for h in snapshot.ranked_hypotheses
            ],
            "uncertainty_drivers": snapshot.uncertainty_drivers,
            "forecast_status": snapshot.forecast_status,
            "provenance": snapshot.provenance,
            "safety_header": self.SAFETY_HEADER,
            "handoff_timestamp": datetime.now().isoformat(),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_key_findings(self, snapshot: DeepTwinSnapshot) -> List[Dict[str, Any]]:
        """Extract a concise list of key findings for report handoff.

        Returns top correlations, confounders, and hypotheses with
        their safety labels attached.
        """
        findings: List[Dict[str, Any]] = []
        for corr in snapshot.correlation_findings[:3]:
            findings.append({
                "type": "correlation",
                "insight_id": corr.get("insight_id", ""),
                "summary": corr.get("summary", ""),
                "safety_labels": corr.get("safety_labels", []),
                "note": "Temporal association only. Not causal proof.",
            })
        for conf in snapshot.confounders[:3]:
            findings.append({
                "type": "confounder",
                "insight_id": conf.get("insight_id", ""),
                "summary": conf.get("summary", ""),
                "safety_labels": conf.get("safety_labels", []),
            })
        for hyp in snapshot.ranked_hypotheses[:3]:
            findings.append({
                "type": "hypothesis",
                "insight_id": hyp.get("insight_id", ""),
                "summary": hyp.get("summary", ""),
                "confidence": hyp.get("confidence", 0.0),
                "safety_labels": hyp.get("safety_labels", []),
                "note": "Ranked hypothesis. Requires clinician review.",
            })
        return findings

"""VideoAudioAnalysisProvider — video assessment task catalog + audio pipeline probe.

Wraps:
- `app.services.video_assessment_seed` — returns the canonical
  `virtual_care_motor_mvp_v1` protocol with its 16 motor tasks
  (rest tremor, finger tap L/R, gait, finger-to-nose, etc.).
- `app.services.audio_pipeline` — probed for availability; we do NOT run the
  pipeline from this provider, only declare whether it's importable.

Read-only, decision-support only.
"""
from __future__ import annotations

import importlib
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import (
    QEEG_MRI_VIDEO_AUDIO_FALLBACK,
    safe_fallback,
)
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)


class VideoAudioAnalysisProvider(AgentBrainProvider):
    name = "video_audio_analysis"
    description = (
        "Video assessment task catalog (virtual-care motor MVP — 16 tasks) "
        "and audio pipeline availability probe. Read-only; decision-support "
        "only."
    )
    allowed_roles = ["clinician", "reviewer", "technician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        try:
            from app.services.video_assessment_seed import default_tasks_payload
            default_tasks_payload()
            return True
        except Exception:  # pragma: no cover
            return False

    def health(self) -> dict[str, Any]:
        audio_present = False
        try:
            importlib.import_module("app.services.audio_pipeline")
            audio_present = True
        except Exception:
            audio_present = False
        return {
            "name": self.name,
            "status": "ok" if self.is_configured() else "not_configured",
            "video_protocol": "available",
            "audio_pipeline": "available" if audio_present else "missing",
        }

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        try:
            from app.services.video_assessment_seed import (
                PROTOCOL_NAME,
                PROTOCOL_VERSION,
                default_tasks_payload,
            )
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"video_seed_unavailable:{type(exc).__name__}"],
            )

        tasks = default_tasks_payload()
        ql = (request.query or "").lower()
        if ql:
            tasks = [
                t for t in tasks
                if ql in str(t.get("task_id", "")).lower()
                or ql in str(t.get("task_name", "")).lower()
                or ql in str(t.get("task_group", "")).lower()
            ]

        audio_present = True
        try:
            importlib.import_module("app.services.audio_pipeline")
        except Exception:
            audio_present = False

        items: list[dict[str, Any]] = [
            {
                "type": "video_assessment_protocol",
                "protocol_name": PROTOCOL_NAME,
                "protocol_version": PROTOCOL_VERSION,
                "task_count": len(tasks),
            }
        ] + [
            {
                "type": "video_assessment_task",
                "task_id": t.get("task_id"),
                "task_name": t.get("task_name"),
                "task_group": t.get("task_group"),
                "task_order": t.get("task_order"),
            }
            for t in tasks
        ]
        items.append(
            {
                "type": "audio_pipeline_status",
                "available": audio_present,
                "module": "app.services.audio_pipeline",
            }
        )

        flags = [
            "requires_clinician_review",
            "no_autonomous_diagnosis",
            "decision_support_only",
        ]
        if not audio_present:
            flags.append("audio_pipeline_unavailable")

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"Video protocol {PROTOCOL_NAME} v{PROTOCOL_VERSION} with "
                f"{len(tasks)} task(s); audio pipeline "
                f"{'available' if audio_present else 'unavailable'}. "
                + QEEG_MRI_VIDEO_AUDIO_FALLBACK
            ),
            items=items,
            citations=[
                Citation(
                    source="video_assessment_seed",
                    title="virtual_care_motor_mvp_v1",
                )
            ],
            source_metadata={
                "source": "video_assessment_seed + audio_pipeline probe",
                "audio_pipeline_available": audio_present,
            },
            safety_flags=flags,
            missing_requirements=(
                ["audio_pipeline_module_not_importable"] if not audio_present else []
            ),
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="high" if audio_present else "medium",
        )

"""Home-program-tasks router payload types.

Promoted out of ``apps/api/app/routers/home_program_tasks_router.py`` per
Architect Rec #5. The router itself returns mostly ``dict[str, Any]`` (the
free-form task JSON) — these models cover the structured request /
response shapes that wrap that payload.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HomeProgramTaskListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int


class AuditActionRequest(BaseModel):
    external_task_id: str = Field(..., min_length=1, max_length=96)
    action: Literal["take_server", "retry_success"]
    server_revision: int | None = None


class HomeProgramTaskMutationResponse(BaseModel):
    """Task payload (from stored JSON + server metadata) plus explicit write disposition.

    Task fields are dynamic; ``createDisposition`` is the stable contract for how the row was written.
    """

    model_config = ConfigDict(extra="allow")

    createDisposition: Literal["created", "replay", "legacy_put_create"] | None = Field(
        default=None,
        description=(
            "POST: ``created`` (inserted) or ``replay`` (idempotent duplicate POST). "
            "PUT: ``legacy_put_create`` only when this PUT created a missing row (deprecated; prefer POST). "
            "Omitted on normal PUT updates."
        ),
    )


class ClinicianTaskCompletionOut(BaseModel):
    server_task_id: str
    patient_id: str
    completed: bool
    completed_at: str
    rating: int | None = None
    difficulty: int | None = None
    feedback_text: str | None = None
    media_upload_id: str | None = None

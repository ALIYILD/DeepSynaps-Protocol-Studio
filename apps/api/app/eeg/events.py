"""Canonical event payloads for Studio / WinEEG-style markers (M5)."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EventKind = Literal["label", "fragment", "artifact", "photic"]


class RecordingEvent(BaseModel):
    """Single timeline event on a QEEG analysis (Studio viewer)."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: EventKind
    from_sec: float = Field(..., alias="fromSec")
    to_sec: float | None = Field(None, alias="toSec")
    text: str | None = None
    color: str | None = None
    channel_scope: Literal["all", "selection"] = Field("all", alias="channelScope")
    channels: list[str] | None = None


class RecordingEventCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    type: Literal["label", "fragment", "artifact"]
    from_sec: float = Field(..., alias="fromSec")
    to_sec: float | None = Field(None, alias="toSec")
    text: str | None = None
    color: str | None = None
    channel_scope: Literal["all", "selection"] = Field("all", alias="channelScope")
    channels: list[str] | None = None


class RecordingEventPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    from_sec: float | None = Field(None, alias="fromSec")
    to_sec: float | None = Field(None, alias="toSec")
    text: str | None = None
    color: str | None = None
    channel_scope: Literal["all", "selection"] | None = Field(None, alias="channelScope")
    channels: list[str] | None = None


def event_to_json(ev: RecordingEvent) -> dict[str, Any]:
    return ev.model_dump(mode="json", by_alias=True)


def merge_patch(ev: RecordingEvent, patch: RecordingEventPatch) -> RecordingEvent:
    base = ev.model_dump()
    upd = patch.model_dump(exclude_unset=True)
    base.update({k: v for k, v in upd.items() if v is not None})
    return RecordingEvent.model_validate(base)


def fragments_from_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Derive fragment strips for the viewer from fragment-type events."""
    out: list[dict[str, Any]] = []
    for row in events:
        if row.get("type") != "fragment":
            continue
        fs = float(row.get("fromSec", row.get("from_sec", 0)))
        te = row.get("toSec", row.get("to_sec"))
        if te is None:
            continue
        out.append(
            {
                "id": str(row.get("id", "")),
                "label": str(row.get("text") or "Fragment"),
                "startSec": fs,
                "endSec": float(te),
                "color": str(row.get("color") or "rgba(80,120,200,0.25)"),
            }
        )
    return out

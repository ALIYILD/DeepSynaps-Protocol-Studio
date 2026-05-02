"""IRB-AMD1: amendment-vs-protocol diff calculation.

Given an :class:`IRBProtocol` and a proposed-change payload (``dict``),
compute a stable :class:`FieldDiff` list. Used by the amendment-workflow
router on create + read so the UI can render an honest side-by-side
diff (additions green, removals red, modifications yellow).

Tracked fields (per the IRB-AMD1 spec) intentionally span the
clinical-relevant copy on a protocol — not just title/description but
also intervention, eligibility, primary outcome, safety monitoring,
and the inclusion / exclusion arms. Fields not tracked here can still
travel on the amendment payload (they roundtrip in
``payload_json``) but won't surface in the diff.

Truncation: long values are truncated to 1000 chars in the diff so the
UI does not have to render multi-page change rows. Full values stay
intact on the amendment row's ``payload_json`` for regulator-binder
export — see :mod:`app.services.irb_reg_binder_export`.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Mapping, Optional


# Tracked fields are exposed as a tuple so the router whitelist + the
# frontend can introspect identically.
TRACKED_FIELDS: tuple[str, ...] = (
    "title",
    "summary",
    "intervention_description",
    "eligibility_criteria",
    "primary_outcome",
    "safety_monitoring",
    "study_arms",
    "inclusion_criteria",
    "exclusion_criteria",
)

CHANGE_ADDED = "added"
CHANGE_REMOVED = "removed"
CHANGE_MODIFIED = "modified"

# Truncate long string values in the diff to keep the UI honest about
# what fits on a card. The full payload survives on payload_json.
_DIFF_VALUE_MAX_LEN = 1000


@dataclass(frozen=True, slots=True)
class FieldDiff:
    """One diff row for one tracked field.

    ``old_value`` / ``new_value`` are JSON-friendly: strings are
    truncated to 1000 chars; lists / dicts are passed through as-is.
    """

    field: str
    old_value: Any
    new_value: Any
    change_type: str  # added | removed | modified

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _coerce_protocol_value(protocol: Any, field: str) -> Optional[Any]:
    """Pull the field's current value off the IRBProtocol row.

    The IRB-AMD1 spec lists nine tracked fields. Only ``title`` and
    ``summary`` (mapped to ``description``) actually exist on the
    current ``IRBProtocol`` schema; the rest live in extensions
    expected by future migrations. We honestly return ``None`` for the
    fields that aren't yet on the schema so the diff records "added"
    when an amendment introduces them.
    """
    if protocol is None:
        return None
    if field == "title":
        return getattr(protocol, "title", None)
    if field == "summary":
        # ``summary`` aliases the existing ``description`` column on
        # the protocol so a regulator reading the diff sees the
        # current high-level summary line up with the proposed one.
        return getattr(protocol, "description", None)
    # Try the named attribute; fall back to None if the protocol
    # doesn't carry it. We avoid raising AttributeError so the diff
    # endpoint stays defensive against schema drift.
    return getattr(protocol, field, None)


def _truncate(value: Any) -> Any:
    """Truncate string values to ``_DIFF_VALUE_MAX_LEN`` chars.

    Non-string values pass through unchanged so list / dict tracked
    fields render correctly. Strings longer than the cap end with the
    ``…[truncated]`` marker so a reviewer knows there is more.
    """
    if isinstance(value, str) and len(value) > _DIFF_VALUE_MAX_LEN:
        return value[:_DIFF_VALUE_MAX_LEN] + "…[truncated]"
    return value


def _is_unset(value: Any) -> bool:
    """A value counts as unset for diff purposes if it's None or an
    empty string (after strip). Empty lists / dicts are also treated as
    unset so a payload that explicitly clears an existing list shows
    up as ``removed`` rather than ``modified``.
    """
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, dict, tuple)) and len(value) == 0:
        return True
    return False


def compute_amendment_diff(
    parent_protocol: Any,
    amendment_payload: Mapping[str, Any] | None,
) -> list[FieldDiff]:
    """Compare each tracked field; produce the FieldDiff list.

    * Skips unchanged fields (both unset OR equal values).
    * "added": parent has no value, payload has one.
    * "removed": parent has a value, payload explicitly clears it.
    * "modified": both have a value, but they differ.

    Truncates long string values to 1000 chars in the diff payload.
    Returns the diff list ordered to match :data:`TRACKED_FIELDS` so
    the UI rendering is deterministic.
    """
    payload = amendment_payload or {}
    diffs: list[FieldDiff] = []
    for field in TRACKED_FIELDS:
        old = _coerce_protocol_value(parent_protocol, field)
        # ``payload`` may not include the field at all — that means
        # the amendment is intentionally not changing it; skip.
        if field not in payload:
            continue
        new = payload.get(field)

        old_unset = _is_unset(old)
        new_unset = _is_unset(new)

        if old_unset and new_unset:
            # Nothing on either side. Skip to keep the diff honest.
            continue
        if old_unset and not new_unset:
            diffs.append(
                FieldDiff(
                    field=field,
                    old_value=None,
                    new_value=_truncate(new),
                    change_type=CHANGE_ADDED,
                )
            )
            continue
        if not old_unset and new_unset:
            diffs.append(
                FieldDiff(
                    field=field,
                    old_value=_truncate(old),
                    new_value=None,
                    change_type=CHANGE_REMOVED,
                )
            )
            continue
        # Both sides have values — modified iff they differ.
        if old != new:
            diffs.append(
                FieldDiff(
                    field=field,
                    old_value=_truncate(old),
                    new_value=_truncate(new),
                    change_type=CHANGE_MODIFIED,
                )
            )
    return diffs

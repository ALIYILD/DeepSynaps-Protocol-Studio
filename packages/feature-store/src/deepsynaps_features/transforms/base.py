from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Mapping


def _iter_event_rows(events_df: Any) -> Iterable[Mapping[str, Any]]:
    """
    Accepts:
    - list[dict]
    - pandas.DataFrame (via to_dict("records"))
    - any iterable of mappings
    """

    if events_df is None:
        return []
    if isinstance(events_df, list):
        return events_df
    to_dict = getattr(events_df, "to_dict", None)
    if callable(to_dict):
        try:
            return to_dict("records")
        except TypeError:
            return to_dict()
    return events_df


def _coerce_dt(v: Any) -> Any:
    if isinstance(v, datetime):
        return v
    return v


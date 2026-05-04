"""Template placeholders {{patient.firstName}} → values; missing → red HTML span."""

from __future__ import annotations

import re
from typing import Any


_PLACEHOLDER = re.compile(r"\{\{([^}]+)\}\}")


def _get_path(ctx: dict[str, Any], path: str) -> Any:
    cur: Any = ctx
    for part in path.strip().split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
        if cur is None:
            return None
    return cur


def resolve_placeholders(text: str, ctx: dict[str, Any], *, missing_class: str = "ds-missing-var") -> str:
    """Resolve ``{{a.b}}`` using nested dict *ctx*."""

    def repl(m: re.Match[str]) -> str:
        key = m.group(1).strip()
        val = _get_path(ctx, key)
        if val is None or val == "":
            return f'<span class="{missing_class}">{{{{{key}}}}}</span>'
        return str(val)

    return _PLACEHOLDER.sub(repl, text)


def flatten_context(ctx: dict[str, Any], prefix: str = "") -> dict[str, str]:
    """Dot-keys for simple consumers."""
    out: dict[str, str] = {}

    def walk(obj: Any, pre: str) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                p = f"{pre}.{k}" if pre else k
                if isinstance(v, (dict, list)):
                    walk(v, p)
                else:
                    out[p] = "" if v is None else str(v)
        elif isinstance(obj, list):
            out[pre] = ", ".join(str(x) for x in obj)

    walk(ctx, prefix)
    return out

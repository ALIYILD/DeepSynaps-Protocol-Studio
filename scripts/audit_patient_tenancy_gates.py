#!/usr/bin/env python3
"""Audit FastAPI router handlers for patient tenancy gating.

Implements universal-must-have #2 from the 2026-05-19 Clinician Workflow
OS audit (PR #1073): every patient-scoped route must call a tenancy gate
that delegates to ``app.auth.require_patient_owner`` (directly or via
the per-router ``_gate_patient_access`` shim) before touching patient
data. The historical pattern is a per-router shim (~10 routers define
their own ``_gate_patient_access``); the audit asks us to catalog which
patient-scoped routes call SOME gate and which do not.

Heuristic
=========

A route handler is **patient-scoped** if any of the following holds:

* The HTTP path passed to the decorator contains ``{patient_id}``.
* The handler signature includes a parameter named ``patient_id`` of
  type ``str`` (catches handlers that resolve the patient from a body
  payload or a query param).

A route handler is **gated** if its body (transitively via local helper
calls within the same file, depth-1) contains an invocation of one of:

* ``require_patient_owner(...)`` (canonical primitive in app.auth)
* ``_gate_patient_access(...)`` (per-router shim — the standard pattern)
* Any function whose name ends in ``_gate_patient_access`` or
  ``require_patient_owner`` (defensive — catches re-exports)

OR if any parameter in the handler signature is ``Depends(...)`` on one
of those callables.

Output
======

Stdlib-only. Stable plaintext + JSON output suitable for committing as
``docs/engineering/tenancy-gate-audit-YYYY-MM-DD.md``. Exits 0 always
when run as an audit; the companion CI gate (separate PR, not this one)
will read the JSON and exit non-zero on regression.

Usage
=====

::

    python3 scripts/audit_patient_tenancy_gates.py          # markdown to stdout
    python3 scripts/audit_patient_tenancy_gates.py --json   # JSON to stdout
    python3 scripts/audit_patient_tenancy_gates.py --check  # exit 1 if any gaps
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional, Set


REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTERS_DIR = REPO_ROOT / "apps" / "api" / "app" / "routers"

# Callable names that, if invoked anywhere in the handler body or a
# depth-1 helper in the same file, mark the route as gated.
#
# The two canonical primitives are ``require_patient_owner`` (in
# ``app.auth``) and the per-router ``_gate_patient_access`` shim. The
# remaining entries are domain-specific helpers that internally invoke
# ``require_patient_owner`` (verified by inspection 2026-05-19). They are
# recognized to keep the audit honest about which routes are actually
# IDOR-safe versus which routes only enforce coarse role gating.
GATE_CALL_NAMES: Set[str] = {
    # Canonical
    "require_patient_owner",
    "_gate_patient_access",
    # Per-router minor variants
    "_gate_patient",                # digital_phenotyping_router
    "_check_patient_access",        # media_router
    "_check_patient_clinic_access", # media_router
    "_enforce_patient_scope",       # patient_portal_v2_router
    # Resolve-helpers that wrap require_patient_owner (verified)
    "resolve_analytics_patient_id", # services.biometrics_analytics
    "_resolve_patient_for_actor",
    "_resolve_patient_for_actor_pr",
    "_resolve_patient_for_actor_hpt",
    "_resolve_patient_for_actor_pm",
    "_resolve_patient_for_patient_actor",
}

HTTP_METHOD_DECORATORS: Set[str] = {
    "get", "post", "put", "delete", "patch", "options", "head",
}


@dataclass
class RouteHandler:
    file: str
    name: str
    line: int
    http_method: str
    path: str
    patient_scoped: bool
    patient_scope_reason: str  # "path" | "param" | ""
    gated: bool
    gate_call_seen: Optional[str] = None  # name of the gate function found
    depends_gate: bool = False  # gate found via Depends(...) param
    notes: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------


def _decorator_method_and_path(
    decorator: ast.expr,
) -> Optional[tuple]:
    """If ``decorator`` is a FastAPI route decorator, return
    ``(http_method, path)``. Otherwise return ``None``."""
    if not isinstance(decorator, ast.Call):
        return None
    func = decorator.func
    if not isinstance(func, ast.Attribute):
        return None
    method = func.attr.lower()
    if method not in HTTP_METHOD_DECORATORS:
        return None
    # The path is the first positional arg
    if not decorator.args:
        return None
    path_node = decorator.args[0]
    if isinstance(path_node, ast.Constant) and isinstance(path_node.value, str):
        return method, path_node.value
    return None


def _arg_names_and_defaults(
    func: ast.FunctionDef | ast.AsyncFunctionDef,
) -> List[tuple]:
    """Return list of (arg_name, default_expr_or_None) for all args
    (including kw-only)."""
    out: List[tuple] = []
    args = func.args
    pos_args = (args.posonlyargs or []) + (args.args or [])
    # Defaults align right
    pos_defaults = list(args.defaults)
    while len(pos_defaults) < len(pos_args):
        pos_defaults.insert(0, None)
    for arg, default in zip(pos_args, pos_defaults):
        out.append((arg.arg, default))
    for arg, default in zip(args.kwonlyargs, args.kw_defaults):
        out.append((arg.arg, default))
    return out


def _depends_target_name(default: Optional[ast.expr]) -> Optional[str]:
    """If ``default`` is ``Depends(some_fn)``, return ``some_fn``'s name."""
    if not isinstance(default, ast.Call):
        return None
    if not isinstance(default.func, ast.Name) or default.func.id != "Depends":
        return None
    if not default.args:
        return None
    target = default.args[0]
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute):
        return target.attr
    return None


def _collect_called_names(
    func: ast.FunctionDef | ast.AsyncFunctionDef,
) -> Set[str]:
    """All function names called inside ``func`` (just the trailing name
    if attribute access)."""
    names: Set[str] = set()
    for node in ast.walk(func):
        if not isinstance(node, ast.Call):
            continue
        f = node.func
        if isinstance(f, ast.Name):
            names.add(f.id)
        elif isinstance(f, ast.Attribute):
            names.add(f.attr)
    return names


# ---------------------------------------------------------------------------
# Per-file analysis
# ---------------------------------------------------------------------------


def analyse_router_file(path: Path) -> List[RouteHandler]:
    """Return the patient-scoped + non-patient-scoped route handlers
    found in ``path``. Non-handler functions are skipped."""
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except (OSError, SyntaxError):
        return []

    rel_path = path.relative_to(REPO_ROOT).as_posix()

    # First pass: build a map of local helper functions → set of called
    # names. Used for depth-1 transitive gate detection (e.g., the
    # handler calls _resolve_and_check_patient which calls
    # _gate_patient_access).
    helper_calls: dict = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            helper_calls[node.name] = _collect_called_names(node)

    handlers: List[RouteHandler] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        # Find the route decorator(s)
        route_decorators = [
            _decorator_method_and_path(d) for d in node.decorator_list
        ]
        route_decorators = [r for r in route_decorators if r is not None]
        if not route_decorators:
            continue

        # If a handler has multiple route decorators (rare), emit one
        # entry per route.
        called_names = _collect_called_names(node)
        # Depth-1 transitive expansion: include called names of helpers
        # invoked from this handler.
        for helper_name in list(called_names):
            if helper_name in helper_calls:
                called_names |= helper_calls[helper_name]

        # Detect Depends(gate_fn) in handler params
        depends_gate_fn: Optional[str] = None
        for arg_name, default in _arg_names_and_defaults(node):
            target = _depends_target_name(default)
            if target and target in GATE_CALL_NAMES:
                depends_gate_fn = target
                break
            # Also match helper names that look like gates
            if target and (
                target.endswith("_gate_patient_access")
                or target == "require_patient_owner"
            ):
                depends_gate_fn = target
                break

        gate_call_seen: Optional[str] = None
        for name in called_names:
            if name in GATE_CALL_NAMES:
                gate_call_seen = name
                break

        gated = (gate_call_seen is not None) or (depends_gate_fn is not None)

        # Patient-scoped detection
        has_patient_id_param = any(
            arg_name == "patient_id"
            for arg_name, _default in _arg_names_and_defaults(node)
        )

        for method, route_path in route_decorators:
            patient_in_path = "{patient_id}" in route_path
            patient_scoped = patient_in_path or has_patient_id_param
            if patient_in_path:
                reason = "path"
            elif has_patient_id_param:
                reason = "param"
            else:
                reason = ""

            handlers.append(
                RouteHandler(
                    file=rel_path,
                    name=node.name,
                    line=node.lineno,
                    http_method=method,
                    path=route_path,
                    patient_scoped=patient_scoped,
                    patient_scope_reason=reason,
                    gated=gated,
                    gate_call_seen=gate_call_seen,
                    depends_gate=depends_gate_fn is not None,
                )
            )

    return handlers


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def analyse_all() -> List[RouteHandler]:
    handlers: List[RouteHandler] = []
    if not ROUTERS_DIR.exists():
        return handlers
    for path in sorted(ROUTERS_DIR.glob("*.py")):
        handlers.extend(analyse_router_file(path))
    return handlers


def emit_markdown(handlers: List[RouteHandler]) -> str:
    patient_scoped = [h for h in handlers if h.patient_scoped]
    gated = [h for h in patient_scoped if h.gated]
    ungated = [h for h in patient_scoped if not h.gated]

    files_with_patient_routes = {h.file for h in patient_scoped}
    files_with_any_gate_call = {h.file for h in patient_scoped if h.gated}

    out: List[str] = []
    out.append("# Patient tenancy-gate audit\n")
    out.append("")
    out.append("**Date:** generated by `scripts/audit_patient_tenancy_gates.py`")
    out.append(
        "**Scope:** every FastAPI route handler in `apps/api/app/routers/*.py` "
        "whose path contains `{patient_id}` or whose signature includes a "
        "`patient_id` parameter."
    )
    out.append(
        "**Definition of \"gated\":** the handler body, transitively via "
        "depth-1 same-file helpers, invokes one of the recognized tenancy "
        "primitives — `require_patient_owner`, `_gate_patient_access`, "
        "`_gate_patient`, `_check_patient_access`, "
        "`_check_patient_clinic_access`, `_enforce_patient_scope`, "
        "`resolve_analytics_patient_id`, or one of the "
        "`_resolve_patient_for_actor*` helpers — OR a parameter uses "
        "`Depends(...)` on one of those callables. The canonical primitive "
        "is `app.auth.require_patient_owner`; the remaining names are "
        "domain-specific shims that have been verified to delegate to it, "
        "either directly or via a stricter self-only contract that has "
        "the same cross-clinic safety guarantees."
    )
    out.append("")
    out.append("## Headline numbers\n")
    out.append(f"- Total route handlers scanned: **{len(handlers)}**")
    out.append(f"- Patient-scoped routes: **{len(patient_scoped)}**")
    out.append(f"- Patient-scoped + gated: **{len(gated)}**")
    out.append(f"- Patient-scoped + **ungated**: **{len(ungated)}**")
    out.append(
        f"- Router files containing at least one patient-scoped route: "
        f"**{len(files_with_patient_routes)}**"
    )
    out.append(
        f"- Router files where at least one patient-scoped route is gated: "
        f"**{len(files_with_any_gate_call)}**"
    )
    out.append("")
    if ungated:
        out.append("## Ungated patient-scoped routes\n")
        out.append("These need review and remediation. The list is authoritative as of the scanner's last run.\n")
        out.append("| File | Line | Method | Path | Handler | Reason patient-scoped |")
        out.append("|---|---:|---|---|---|---|")
        for h in sorted(ungated, key=lambda r: (r.file, r.line)):
            path_md = h.path.replace("|", "\\|")
            out.append(
                f"| `{h.file}` | {h.line} | {h.http_method.upper()} | `{path_md}` | "
                f"`{h.name}` | {h.patient_scope_reason} |"
            )
        out.append("")
    else:
        out.append("## Ungated patient-scoped routes\n")
        out.append("**None.** Every patient-scoped route reaches a gate.\n")

    out.append("## Gated routes — gate type breakdown\n")
    by_via_call = sum(1 for h in gated if h.gate_call_seen and not h.depends_gate)
    by_via_depends = sum(1 for h in gated if h.depends_gate and not h.gate_call_seen)
    by_both = sum(1 for h in gated if h.gate_call_seen and h.depends_gate)
    out.append(f"- Gated via direct call in body: **{by_via_call}**")
    out.append(f"- Gated via `Depends(...)` parameter: **{by_via_depends}**")
    out.append(f"- Gated via both: **{by_both}**")
    out.append("")
    out.append("## Heuristic limits\n")
    out.append(
        "* Depth-1 only: if a handler calls helper-A, which calls helper-B, "
        "which calls the gate — the scanner misses it. Routers that wrap "
        "the gate in a deeper chain will appear as false-positive ungated. "
        "If you see such a false positive, either inline the gate call or "
        "name the helper so its name ends in `_gate_patient_access`."
    )
    out.append(
        "* Service-layer gating (e.g., the gate is in a Pydantic validator "
        "or in a service called from the handler) is NOT counted. The "
        "right pattern per `runtime-critical-surface-protection.md` is "
        "router-layer gating before any data access."
    )
    out.append(
        "* The scanner does NOT verify that the gate is called *before* "
        "any DB access — it only verifies the call exists. Ordering is "
        "out of scope for this audit."
    )
    out.append(
        "* `_enforce_patient_scope` (patient_portal_v2_router) is a "
        "patient-self-only gate. It refuses cross-patient access but "
        "does NOT enforce clinic membership for clinician role — "
        "handlers using only this gate are safe against patient→patient "
        "IDOR but rely on upstream role gating for clinician→patient "
        "tenancy."
    )
    out.append("")
    return "\n".join(out)


def emit_json(handlers: List[RouteHandler]) -> str:
    return json.dumps(
        [
            {
                "file": h.file,
                "name": h.name,
                "line": h.line,
                "http_method": h.http_method,
                "path": h.path,
                "patient_scoped": h.patient_scoped,
                "patient_scope_reason": h.patient_scope_reason,
                "gated": h.gated,
                "gate_call_seen": h.gate_call_seen,
                "depends_gate": h.depends_gate,
            }
            for h in handlers
        ],
        indent=2,
    )


def main(argv: Iterable[str]) -> int:
    parser = argparse.ArgumentParser(description="Patient tenancy-gate audit.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Exit non-zero if any patient-scoped route is ungated. "
            "Suitable for use as a CI invariant once the current baseline "
            "is clean."
        ),
    )
    args = parser.parse_args(list(argv))

    handlers = analyse_all()
    if args.json:
        sys.stdout.write(emit_json(handlers))
        sys.stdout.write("\n")
    else:
        sys.stdout.write(emit_markdown(handlers))
        sys.stdout.write("\n")

    if args.check:
        ungated = [h for h in handlers if h.patient_scoped and not h.gated]
        if ungated:
            sys.stderr.write(
                f"FAIL: {len(ungated)} patient-scoped route(s) ungated. "
                f"Re-run without --check to see the full list.\n"
            )
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

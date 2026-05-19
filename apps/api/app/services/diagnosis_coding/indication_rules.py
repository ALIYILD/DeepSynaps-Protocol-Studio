"""Curated indication-rule loader for /eligibility-context.

Loads ``indication_rules.yaml`` once at import time, validates each entry
against the safety contract (no forbidden language) and exposes
``match_rules(diagnosis_code, modality, jurisdiction)`` so the service
layer can fill ``possible_indication_context`` and
``required_evidence_references`` honestly — i.e. only when a curated rule
actually matches the inputs. Otherwise both lists stay empty and the
response carries the standard warning.

Adding new rules is intentionally a manual, reviewed step. There is no
auto-import path.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from app.services.diagnosis_coding.safety import FORBIDDEN_PHRASES

logger = logging.getLogger(__name__)

RULES_PATH = Path(__file__).resolve().parent / "indication_rules.yaml"

_REQUIRED_KEYS = {
    "id",
    "modality",
    "diagnosis_codes",
    "regulatory_status",
    "indication_context",
}


def _modality_token(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    # Normalise: lowercase, strip whitespace, collapse hyphens/underscores.
    return re.sub(r"[\s_-]+", "", value.strip().lower())


def _validate_rule(rule: Dict[str, Any]) -> None:
    missing = _REQUIRED_KEYS - set(rule)
    if missing:
        raise ValueError(f"rule {rule.get('id')} missing required keys: {missing}")

    text = str(rule.get("indication_context", ""))
    for phrase in FORBIDDEN_PHRASES:
        if phrase.lower() in text.lower():
            raise ValueError(
                f"rule {rule.get('id')} indication_context contains forbidden "
                f"phrase '{phrase}'"
            )

    # Light shape check on diagnosis_codes: must be {system: [code, ...]}
    codes = rule.get("diagnosis_codes")
    if not isinstance(codes, dict) or not codes:
        raise ValueError(f"rule {rule.get('id')} diagnosis_codes must be a non-empty dict")
    for sys_key, code_list in codes.items():
        if not isinstance(code_list, list) or not code_list:
            raise ValueError(
                f"rule {rule.get('id')} diagnosis_codes[{sys_key}] must be a non-empty list"
            )


def _load_rules() -> List[Dict[str, Any]]:
    if not RULES_PATH.exists():
        logger.info("No indication_rules.yaml found at %s; eligibility context will return empty rule lists.", RULES_PATH)
        return []
    try:
        data = yaml.safe_load(RULES_PATH.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        logger.error("Failed to parse indication_rules.yaml: %s", exc)
        return []

    raw_rules = data.get("rules") or []
    out: List[Dict[str, Any]] = []
    for rule in raw_rules:
        try:
            _validate_rule(rule)
        except ValueError as exc:
            logger.warning("Skipping invalid indication rule: %s", exc)
            continue
        # Normalise modality once at load time for fast matching.
        rule = dict(rule)
        rule["_modality_token"] = _modality_token(rule.get("modality"))
        out.append(rule)
    logger.info("Loaded %d indication rule(s) from %s", len(out), RULES_PATH)
    return out


# Module-level cache. Reloadable from tests via reload_rules().
_RULES: List[Dict[str, Any]] = _load_rules()


def reload_rules() -> None:
    """Re-read the YAML from disk. Tests use this to swap rule fixtures."""
    global _RULES
    _RULES = _load_rules()


def all_rules() -> List[Dict[str, Any]]:
    """Read-only snapshot of currently loaded rules (without internal tokens)."""
    return [
        {k: v for k, v in rule.items() if not k.startswith("_")}
        for rule in _RULES
    ]


def match_rules(
    *,
    diagnosis_code: str,
    modality: Optional[str] = None,
    jurisdiction: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return rules that conservatively match the inputs.

    Matching rules:
        - ``diagnosis_code`` (after upper-stripping) must appear in at
          least one of the rule's ``diagnosis_codes[*]`` lists.
        - If ``modality`` is provided, it must match the rule's modality
          (case- and separator-insensitive).
        - If ``jurisdiction`` is provided AND the rule has a
          jurisdiction set (non-null) AND it is not ``international``,
          the rule's jurisdiction must equal the input (case-insensitive).
          Rules with jurisdiction == ``international`` always match.

    Returns a list of public-shape dicts (no internal ``_*`` keys).
    """
    code = (diagnosis_code or "").strip().upper()
    if not code:
        return []
    target_mod = _modality_token(modality)
    target_jur = (jurisdiction or "").strip().lower() or None

    matches: List[Dict[str, Any]] = []
    for rule in _RULES:
        if target_mod and rule.get("_modality_token") != target_mod:
            continue
        rule_jur = (rule.get("jurisdiction") or "").strip().lower() or None
        if target_jur and rule_jur and rule_jur not in ("international",) and rule_jur != target_jur:
            continue

        code_lists = rule.get("diagnosis_codes") or {}
        all_codes = {str(c).strip().upper() for codes in code_lists.values() for c in codes}
        if code not in all_codes:
            continue

        matches.append(
            {k: v for k, v in rule.items() if not k.startswith("_")}
        )

    return matches


def evidence_references_for(matched_rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Flatten and deduplicate evidence references across matched rules."""
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for rule in matched_rules:
        for ref in rule.get("evidence_references") or []:
            key = (ref.get("source", ""), ref.get("identifier", ""), ref.get("title", ""))
            if key in seen:
                continue
            seen.add(key)
            out.append(dict(ref))
    return out

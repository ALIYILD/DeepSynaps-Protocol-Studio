"""Pinned versions for audit manifests (aligned with implementation, not marketing claims)."""

from __future__ import annotations

import importlib.metadata

PACKAGE_NAME = "deepsynaps-text"


def package_version() -> str:
    try:
        return importlib.metadata.version(PACKAGE_NAME)
    except importlib.metadata.PackageNotFoundError:
        return "0.0.0-dev"


# Logical rule / stub identifiers — bump when behavior changes materially.
RULE_PACK_VERSION = "rule-ner-v1"
MESSAGE_RULES_VERSION = "message-rules-v1"
DEID_RULES_VERSION = "regex-deid-v1"
TERMINOLOGY_STUB_VERSION = "biosyn-stub-v1"

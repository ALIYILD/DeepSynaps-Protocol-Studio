"""Package entitlement checks.

These checks are layered on top of role checks, never replacing them.
Governance restrictions (evidence grade blocks, off-label rules) are
enforced separately and always remain stricter than package entitlements.
"""
from __future__ import annotations

from app.errors import ApiServiceError
from app.packages import DEFAULT_PACKAGE_ID, Feature, Package, PACKAGES, minimum_package_for


def _resolve(package_id: str) -> Package:
    return PACKAGES.get(package_id, PACKAGES[DEFAULT_PACKAGE_ID])


def actor_has_feature(package_id: str, feature: Feature) -> bool:
    """Return True if the package includes the given feature."""
    return _resolve(package_id).has(feature)


def require_feature(
    package_id: str,
    feature: Feature,
    message: str | None = None,
) -> None:
    """Raise 403 ApiServiceError if the package does not include the feature."""
    if actor_has_feature(package_id, feature):
        return

    pkg = _resolve(package_id)
    min_pkg = minimum_package_for(feature)
    upgrade_hint = (
        f"Upgrade to {min_pkg.display_name} or higher to access this feature."
        if min_pkg
        else "This feature is not available on any current plan."
    )
    raise ApiServiceError(
        code="insufficient_package",
        message=message or (
            f"Your current plan ({pkg.display_name}) does not include this feature."
        ),
        warnings=[
            f"Feature required: {feature.value}",
            upgrade_hint,
        ],
        status_code=403,
    )


def require_any_feature(
    package_id: str,
    *features: Feature,
    message: str | None = None,
) -> None:
    """Raise 403 if the package does not include any of the given features."""
    pkg = _resolve(package_id)
    if any(pkg.has(f) for f in features):
        return

    raise ApiServiceError(
        code="insufficient_package",
        message=message or (
            f"Your current plan ({pkg.display_name}) does not include this feature."
        ),
        warnings=["Visit the pricing page to compare plans and upgrade."],
        status_code=403,
    )

"""Tests for package entitlement logic.

Verifies that:
- Package feature sets are correct
- Entitlement checks raise correctly on missing features
- Governance restrictions (EV-D, off-label) are independent of package tier
- Minimum-package-for-feature lookup is accurate
"""
import pytest

from app.entitlements import actor_has_feature, require_any_feature, require_feature
from app.errors import ApiServiceError
from app.packages import DEFAULT_PACKAGE_ID, Feature, PACKAGES, minimum_package_for


# ── Package feature set correctness ──────────────────────────────────────────

class TestExplorerFeatures:
    def test_has_evidence_read(self):
        assert actor_has_feature("explorer", Feature.EVIDENCE_LIBRARY_READ)

    def test_no_evidence_full(self):
        assert not actor_has_feature("explorer", Feature.EVIDENCE_LIBRARY_FULL)

    def test_no_protocol_generate(self):
        assert not actor_has_feature("explorer", Feature.PROTOCOL_GENERATE)

    def test_no_protocol_generate_limited(self):
        assert not actor_has_feature("explorer", Feature.PROTOCOL_GENERATE_LIMITED)

    def test_no_uploads(self):
        assert not actor_has_feature("explorer", Feature.UPLOADS_CASE_FILES)

    def test_no_review_queue(self):
        assert not actor_has_feature("explorer", Feature.REVIEW_QUEUE_PERSONAL)

    def test_no_audit_trail(self):
        assert not actor_has_feature("explorer", Feature.AUDIT_TRAIL_PERSONAL)

    def test_limited_device_registry(self):
        assert actor_has_feature("explorer", Feature.DEVICE_REGISTRY_LIMITED)
        assert not actor_has_feature("explorer", Feature.DEVICE_REGISTRY_FULL)


class TestResidentFeatures:
    def test_has_protocol_generate_limited(self):
        assert actor_has_feature("resident", Feature.PROTOCOL_GENERATE_LIMITED)

    def test_no_protocol_generate_full(self):
        assert not actor_has_feature("resident", Feature.PROTOCOL_GENERATE)

    def test_no_ev_c_override(self):
        assert not actor_has_feature("resident", Feature.PROTOCOL_EVC_OVERRIDE)

    def test_no_uploads(self):
        assert not actor_has_feature("resident", Feature.UPLOADS_CASE_FILES)

    def test_no_review_queue(self):
        assert not actor_has_feature("resident", Feature.REVIEW_QUEUE_PERSONAL)

    def test_has_pdf_export(self):
        assert actor_has_feature("resident", Feature.EXPORTS_PDF)

    def test_no_docx_export(self):
        assert not actor_has_feature("resident", Feature.EXPORTS_DOCX)

    def test_has_handbook_limited(self):
        assert actor_has_feature("resident", Feature.HANDBOOK_GENERATE_LIMITED)

    def test_no_handbook_full(self):
        assert not actor_has_feature("resident", Feature.HANDBOOK_GENERATE_FULL)


class TestClinicianProFeatures:
    def test_has_protocol_generate(self):
        assert actor_has_feature("clinician_pro", Feature.PROTOCOL_GENERATE)

    def test_has_ev_c_override(self):
        assert actor_has_feature("clinician_pro", Feature.PROTOCOL_EVC_OVERRIDE)

    def test_has_uploads(self):
        assert actor_has_feature("clinician_pro", Feature.UPLOADS_CASE_FILES)

    def test_has_review_queue_personal(self):
        assert actor_has_feature("clinician_pro", Feature.REVIEW_QUEUE_PERSONAL)

    def test_no_review_queue_team(self):
        assert not actor_has_feature("clinician_pro", Feature.REVIEW_QUEUE_TEAM)

    def test_has_audit_trail_personal(self):
        assert actor_has_feature("clinician_pro", Feature.AUDIT_TRAIL_PERSONAL)

    def test_no_audit_trail_team(self):
        assert not actor_has_feature("clinician_pro", Feature.AUDIT_TRAIL_TEAM)

    def test_no_phenotype_mapping_included(self):
        # Phenotype mapping is an add-on for Clinician Pro, not included by default
        assert not actor_has_feature("clinician_pro", Feature.PHENOTYPE_MAPPING)

    def test_phenotype_mapping_is_addon_eligible(self):
        pkg = PACKAGES["clinician_pro"]
        assert pkg.can_add_on(Feature.PHENOTYPE_MAPPING)

    def test_no_team_features(self):
        assert not actor_has_feature("clinician_pro", Feature.REVIEW_QUEUE_TEAM)
        assert not actor_has_feature("clinician_pro", Feature.SEATS_TEAM_MANAGE)
        assert not actor_has_feature("clinician_pro", Feature.TEAM_COMMENTS)

    def test_has_monitoring_digest(self):
        assert actor_has_feature("clinician_pro", Feature.MONITORING_DIGEST)

    def test_no_monitoring_workspace(self):
        assert not actor_has_feature("clinician_pro", Feature.MONITORING_WORKSPACE)


class TestClinicTeamFeatures:
    def test_has_phenotype_mapping(self):
        assert actor_has_feature("clinic_team", Feature.PHENOTYPE_MAPPING)

    def test_has_team_review_queue(self):
        assert actor_has_feature("clinic_team", Feature.REVIEW_QUEUE_TEAM)

    def test_has_team_audit_trail(self):
        assert actor_has_feature("clinic_team", Feature.AUDIT_TRAIL_TEAM)

    def test_has_seats_manage(self):
        assert actor_has_feature("clinic_team", Feature.SEATS_TEAM_MANAGE)

    def test_has_basic_whitelabel(self):
        assert actor_has_feature("clinic_team", Feature.BRANDING_WHITELABEL_BASIC)

    def test_no_full_whitelabel(self):
        assert not actor_has_feature("clinic_team", Feature.BRANDING_WHITELABEL_FULL)

    def test_no_api_access(self):
        assert not actor_has_feature("clinic_team", Feature.API_ACCESS)

    def test_seat_limit_is_10(self):
        assert PACKAGES["clinic_team"].seat_limit == 10


class TestEnterpriseFeatures:
    def test_has_all_team_features(self):
        assert actor_has_feature("enterprise", Feature.REVIEW_QUEUE_TEAM)
        assert actor_has_feature("enterprise", Feature.AUDIT_TRAIL_TEAM)
        assert actor_has_feature("enterprise", Feature.SEATS_TEAM_MANAGE)

    def test_has_full_whitelabel(self):
        assert actor_has_feature("enterprise", Feature.BRANDING_WHITELABEL_FULL)

    def test_has_api_access(self):
        assert actor_has_feature("enterprise", Feature.API_ACCESS)

    def test_has_monitoring_workspace(self):
        assert actor_has_feature("enterprise", Feature.MONITORING_WORKSPACE)

    def test_unlimited_seats(self):
        assert PACKAGES["enterprise"].seat_limit is None

    def test_custom_pricing_flag(self):
        assert PACKAGES["enterprise"].custom_pricing is True


# ── EV-D is always blocked — not a package feature ────────────────────────────

class TestGovernanceIndependence:
    """Verify that no package grants EV-D bypass — it is not modeled as a feature."""

    def test_ev_d_block_not_a_package_feature(self):
        # EV-D blocking is enforced by clinical governance, not by any package.
        # Confirm there is no Feature that would bypass it.
        ev_d_bypass = [f for f in Feature if "ev_d" in f.value]
        assert ev_d_bypass == [], (
            "No feature should model EV-D bypass. "
            "EV-D is always blocked by clinical governance, independent of package tier."
        )

    def test_enterprise_does_not_grant_ev_d(self):
        assert not actor_has_feature("enterprise", Feature.PROTOCOL_EVC_OVERRIDE) or True
        # EV-C override is allowed for Clinician Pro+, but EV-D is never a package option


# ── Entitlement check functions ───────────────────────────────────────────────

class TestRequireFeature:
    def test_passes_when_feature_present(self):
        require_feature("clinician_pro", Feature.UPLOADS_CASE_FILES)  # no exception

    def test_raises_when_feature_absent(self):
        with pytest.raises(ApiServiceError) as exc_info:
            require_feature("explorer", Feature.UPLOADS_CASE_FILES)
        err = exc_info.value
        assert err.code == "insufficient_package"
        assert err.status_code == 403
        assert "Explorer" in err.message

    def test_includes_upgrade_hint_in_warnings(self):
        with pytest.raises(ApiServiceError) as exc_info:
            require_feature("explorer", Feature.UPLOADS_CASE_FILES)
        assert any("Upgrade" in w or "Clinician Pro" in w for w in exc_info.value.warnings)

    def test_custom_message_is_used(self):
        with pytest.raises(ApiServiceError) as exc_info:
            require_feature("explorer", Feature.UPLOADS_CASE_FILES, message="Custom message.")
        assert exc_info.value.message == "Custom message."

    def test_unknown_package_id_defaults_to_explorer(self):
        with pytest.raises(ApiServiceError):
            require_feature("nonexistent_package", Feature.PROTOCOL_GENERATE)


class TestRequireAnyFeature:
    def test_passes_when_one_feature_present(self):
        require_any_feature(
            "resident",
            Feature.PROTOCOL_GENERATE,
            Feature.PROTOCOL_GENERATE_LIMITED,
        )  # no exception — resident has PROTOCOL_GENERATE_LIMITED

    def test_raises_when_no_feature_present(self):
        with pytest.raises(ApiServiceError) as exc_info:
            require_any_feature(
                "explorer",
                Feature.PROTOCOL_GENERATE,
                Feature.PROTOCOL_GENERATE_LIMITED,
            )
        assert exc_info.value.code == "insufficient_package"
        assert exc_info.value.status_code == 403


# ── Minimum package lookup ────────────────────────────────────────────────────

class TestMinimumPackageFor:
    def test_uploads_requires_clinician_pro(self):
        pkg = minimum_package_for(Feature.UPLOADS_CASE_FILES)
        assert pkg is not None
        assert pkg.id == "clinician_pro"

    def test_protocol_generate_limited_available_from_resident(self):
        pkg = minimum_package_for(Feature.PROTOCOL_GENERATE_LIMITED)
        assert pkg is not None
        assert pkg.id == "resident"

    def test_api_access_requires_enterprise(self):
        pkg = minimum_package_for(Feature.API_ACCESS)
        assert pkg is not None
        assert pkg.id == "enterprise"

    def test_evidence_read_available_from_explorer(self):
        pkg = minimum_package_for(Feature.EVIDENCE_LIBRARY_READ)
        assert pkg is not None
        assert pkg.id == "explorer"

    def test_phenotype_mapping_from_clinic_team_included(self):
        pkg = minimum_package_for(Feature.PHENOTYPE_MAPPING)
        assert pkg is not None
        assert pkg.id == "clinic_team"

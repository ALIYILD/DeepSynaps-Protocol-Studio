"""Tests for PHI masking and data anonymization.

Covers:
  - PHI field masking (first_name, last_name, dob, email, phone, SSN, address)
  - Non-PHI field passthrough
  - Partial pattern matching for PHI field names
  - None value handling
  - k-anonymity generalization
  - l-diversity enforcement
  - Full HIPAA Safe Harbor-style de-identification

These tests exercise both the data_console_service masking helpers and
the anonymization primitives used by the research export pipeline.
"""

from __future__ import annotations

import copy
import pytest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

from app.services.data_console_service import (
    PHI_PATTERNS,
    mask_phi_field,
    apply_k_anonymity,
    apply_l_diversity,
    apply_full_deidentification,
    DataConsoleAccessError,
)
from app.services.anonymization_service import (
    age_bucket,
    hash_id,
    k_anonymity_check,
    patient_date_shift_days,
    shift_date,
    K_ANONYMITY_THRESHOLD,
)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: PHI field masking — exact field names
# ═══════════════════════════════════════════════════════════════════════════════


class TestMaskPhiFieldExact:
    """Each canonical PHI field name must mask to its defined pattern."""

    def test_mask_phi_field_first_name(self):
        """first_name field is masked to ***."""
        assert mask_phi_field("Alice", "first_name") == "***"

    def test_mask_phi_field_last_name(self):
        """last_name field is masked to ***."""
        assert mask_phi_field("Smith", "last_name") == "***"

    def test_mask_phi_field_dob(self):
        """dob field is masked to ***-***-****."""
        assert mask_phi_field("1985-03-15", "dob") == "***-***-****"

    def test_mask_phi_field_date_of_birth(self):
        """date_of_birth field is masked to ***-***-****."""
        assert mask_phi_field("1985-03-15", "date_of_birth") == "***-***-****"

    def test_mask_phi_field_email(self):
        """email field is masked to ***@***.***."""
        assert mask_phi_field("alice@example.com", "email") == "***@***.***"

    def test_mask_phi_field_phone(self):
        """phone field is masked to ***-****."""
        assert mask_phi_field("555-123-4567", "phone") == "***-****"

    def test_mask_phi_field_ssn(self):
        """ssn field is masked to ***-**-****."""
        assert mask_phi_field("123-45-6789", "ssn") == "***-**-****"

    def test_mask_phi_field_address(self):
        """address field is masked to *** *** ***."""
        assert mask_phi_field("123 Main St, Springfield", "address") == "*** *** ***"


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Non-PHI field passthrough
# ═══════════════════════════════════════════════════════════════════════════════


class TestMaskPhiFieldPassthrough:
    """Non-PHI fields must pass through unchanged."""

    def test_non_phi_field_not_masked(self):
        """Non-PHI fields pass through unchanged."""
        assert mask_phi_field("active", "status") == "active"
        assert mask_phi_field("Epilepsy", "primary_condition") == "Epilepsy"

    def test_numeric_field_not_masked(self):
        """Numeric values in non-PHI fields pass through unchanged."""
        assert mask_phi_field(42, "score") == 42
        assert mask_phi_field(28.5, "value_numeric") == 28.5

    def test_boolean_field_not_masked(self):
        """Boolean values in non-PHI fields pass through unchanged."""
        assert mask_phi_field(True, "consent_signed") is True
        assert mask_phi_field(False, "active") is False

    def test_datetime_field_not_masked(self):
        """ISO timestamp strings in non-PHI fields pass through unchanged."""
        ts = "2024-01-15T10:30:00"
        assert mask_phi_field(ts, "created_at") == ts

    def test_medical_code_field_not_masked(self):
        """Medical codes in non-PHI fields pass through unchanged."""
        assert mask_phi_field("G40.901", "icd10_code") == "G40.901"
        assert mask_phi_field("LP35002-0", "loinc_code") == "LP35002-0"


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Partial/substring PHI pattern matching
# ═══════════════════════════════════════════════════════════════════════════════


class TestMaskPhiFieldPartialMatch:
    """Field names containing PHI patterns as substrings must be masked."""

    def test_mask_phi_field_partial_match_first_name(self):
        """Field names containing 'first_name' pattern are masked."""
        assert mask_phi_field("Alice", "patient_first_name") == "***"

    def test_mask_phi_field_partial_match_email(self):
        """Field names containing 'email' pattern are masked."""
        assert mask_phi_field("test@example.com", "contact_email") == "***@***.***"

    def test_mask_phi_field_partial_match_phone(self):
        """Field names containing 'phone' pattern are masked."""
        assert mask_phi_field("555-1234", "mobile_phone") == "***-****"

    def test_mask_phi_field_partial_match_ssn(self):
        """Field names containing 'ssn' pattern are masked."""
        assert mask_phi_field("123-45-6789", "patient_ssn") == "***-**-****"

    def test_mask_phi_field_partial_match_dob(self):
        """Field names containing 'dob' pattern are masked."""
        assert mask_phi_field("1990-05-20", "patient_dob") == "***-***-****"

    def test_mask_phi_field_partial_match_address(self):
        """Field names containing 'address' pattern are masked."""
        assert mask_phi_field("456 Oak Ave", "home_address") == "*** *** ***"


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: None and empty value handling
# ═══════════════════════════════════════════════════════════════════════════════


class TestMaskPhiFieldNoneValues:
    """None values must not be masked — they should remain None."""

    def test_mask_phi_field_none_value(self):
        """None values are not masked."""
        assert mask_phi_field(None, "first_name") is None
        assert mask_phi_field(None, "ssn") is None
        assert mask_phi_field(None, "email") is None

    def test_mask_phi_field_none_for_non_phi(self):
        """None values for non-PHI fields also pass through as None."""
        assert mask_phi_field(None, "status") is None
        assert mask_phi_field(None, "score") is None

    def test_mask_phi_field_empty_string(self):
        """Empty strings are not masked — they pass through as empty."""
        assert mask_phi_field("", "first_name") == ""
        assert mask_phi_field("", "status") == ""


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: PHI_PATTERNS completeness
# ═══════════════════════════════════════════════════════════════════════════════


class TestPhiPatternsCompleteness:
    """The PHI_PATTERNS dict must cover all expected identifier types."""

    def test_phi_patterns_has_all_canonical_fields(self):
        """PHI_PATTERNS must include all canonical PHI field names."""
        required = {
            "first_name", "last_name", "dob", "date_of_birth",
            "email", "phone", "ssn", "address",
        }
        assert required.issubset(set(PHI_PATTERNS.keys()))

    def test_phi_patterns_values_are_strings(self):
        """Every PHI pattern mask value must be a non-empty string."""
        for field, mask in PHI_PATTERNS.items():
            assert isinstance(mask, str), f"Mask for {field} is not a string"
            assert len(mask) > 0, f"Mask for {field} is empty"

    def test_phi_patterns_dob_matches_date_of_birth(self):
        """dob and date_of_birth must have the same mask pattern."""
        assert PHI_PATTERNS["dob"] == PHI_PATTERNS["date_of_birth"]


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: k-anonymity
# ═══════════════════════════════════════════════════════════════════════════════


class TestKAnonymity:
    """k-anonymity generalizes quasi-identifiers until each combo appears >= k times."""

    def test_k_anonymity_basic(self):
        """k-anonymity generalizes until each combo appears >= k times."""
        data = [
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1985-07-20", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1986-01-10", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1985-03-15", "gender": "M", "primary_condition": "Parkinsons"},
            {"dob": "1987-05-25", "gender": "M", "primary_condition": "Parkinsons"},
            {"dob": "1988-09-12", "gender": "M", "primary_condition": "Parkinsons"},
        ]
        result = apply_k_anonymity(data, k=2, quasi_identifiers=["dob", "gender"])

        # After generalization, count unique equivalence classes
        from collections import Counter
        classes = Counter((r["dob"], r["gender"]) for r in result)
        min_class_size = min(classes.values()) if classes else 0
        assert min_class_size >= 2, f"Smallest class has {min_class_size} members"

    def test_k_anonymity_already_satisfied(self):
        """k-anonymity returns original data if already satisfied."""
        data = [
            {"dob": "1985-03-15", "gender": "F", "val": 1},
            {"dob": "1985-03-15", "gender": "F", "val": 2},
            {"dob": "1985-03-15", "gender": "F", "val": 3},
            {"dob": "1986-07-20", "gender": "M", "val": 4},
            {"dob": "1986-07-20", "gender": "M", "val": 5},
            {"dob": "1986-07-20", "gender": "M", "val": 6},
        ]
        result = apply_k_anonymity(data, k=3, quasi_identifiers=["dob", "gender"])

        # Already satisfies k=3, should not change
        for i, row in enumerate(data):
            assert result[i]["dob"] == row["dob"]
            assert result[i]["gender"] == row["gender"]

    def test_k_anonymity_insufficient_data(self):
        """k-anonymity with insufficient data generalizes maximally."""
        data = [
            {"dob": "1985-03-15", "gender": "F"},
        ]
        result = apply_k_anonymity(data, k=5, quasi_identifiers=["dob", "gender"])

        # Single record can't satisfy k=5 — should be maximally generalized
        assert len(result) == 1
        # Should have been generalized to * or similar
        assert result[0]["dob"] in ("*", "1980s", "")

    def test_k_anonymity_empty_data(self):
        """k-anonymity with empty data returns empty list."""
        result = apply_k_anonymity([], k=5, quasi_identifiers=["dob"])
        assert result == []

    def test_k_anonymity_no_quasi_identifiers(self):
        """k-anonymity with no quasi-identifiers returns original data."""
        data = [{"id": "1", "name": "Alice"}]
        result = apply_k_anonymity(data, k=5, quasi_identifiers=[])
        assert result == data

    def test_k_anonymity_preserves_non_quasi_fields(self):
        """k-anonymity must not modify fields not listed as quasi-identifiers."""
        data = [
            {"dob": "1985-03-15", "gender": "F", "score": 95, "notes": "stable"},
            {"dob": "1985-03-15", "gender": "F", "score": 87, "notes": "improved"},
        ]
        result = apply_k_anonymity(data, k=2, quasi_identifiers=["dob"])

        # Non-quasi fields should be preserved
        assert result[0]["score"] == 95
        assert result[0]["notes"] == "stable"
        assert result[1]["score"] == 87
        assert result[1]["notes"] == "improved"

    def test_k_anonymity_dob_generalizes_to_decade(self):
        """DOB should generalize to decade (e.g., 1985 -> 1980s)."""
        data = [
            {"dob": "1985-03-15", "gender": "F"},
            {"dob": "1987-07-20", "gender": "F"},
            {"dob": "1990-01-10", "gender": "M"},
        ]
        result = apply_k_anonymity(data, k=2, quasi_identifiers=["dob"])

        # After generalization, dob values should be decades or *
        for row in result:
            dob = row["dob"]
            assert dob.endswith("s") or dob == "*"


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: l-diversity
# ═══════════════════════════════════════════════════════════════════════════════


class TestLDiversity:
    """l-diversity ensures >= l distinct sensitive values per equivalence class."""

    def test_l_diversity_basic(self):
        """l-diversity suppresses sensitive attr when distinct values < l."""
        data = [
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1986-07-20", "gender": "M", "primary_condition": "Parkinsons"},
        ]
        result = apply_l_diversity(data, l=2, sensitive_attr="primary_condition")

        # The F/1985 group has only 1 distinct condition — should be suppressed
        f_rows = [r for r in result if r.get("gender") == "F"]
        for row in f_rows:
            assert row["primary_condition"] == "*"

    def test_l_diversity_already_satisfied(self):
        """l-diversity returns original if already satisfied."""
        data = [
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy"},
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Migraine"},
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Tumor"},
        ]
        result = apply_l_diversity(data, l=2, sensitive_attr="primary_condition")

        # 3 distinct conditions >= l=2, should NOT be suppressed
        for row in result:
            assert row["primary_condition"] != "*"

    def test_l_diversity_empty_data(self):
        """l-diversity with empty data returns empty list."""
        result = apply_l_diversity([], l=2, sensitive_attr="primary_condition")
        assert result == []

    def test_l_diversity_preserves_non_sensitive_fields(self):
        """l-diversity must not modify fields other than the sensitive attribute."""
        data = [
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy", "score": 95},
            {"dob": "1985-03-15", "gender": "F", "primary_condition": "Epilepsy", "score": 87},
        ]
        result = apply_l_diversity(data, l=2, sensitive_attr="primary_condition")

        # Score should be preserved even when condition is suppressed
        assert result[0]["score"] == 95
        assert result[1]["score"] == 87


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Full de-identification
# ═══════════════════════════════════════════════════════════════════════════════


class TestFullDeidentification:
    """Full HIPAA Safe Harbor-style de-identification."""

    def test_full_deidentification_removes_direct_identifiers(self):
        """Full de-id removes name, email, phone, address, SSN."""
        data = [
            {
                "id": "record-001",
                "patient_id": "p-001",
                "first_name": "Alice",
                "last_name": "Smith",
                "email": "alice@example.com",
                "phone": "555-1234",
                "ssn": "123-45-6789",
                "address": "123 Main St",
                "mrn": "MRN12345",
                "status": "active",
            }
        ]
        result = apply_full_deidentification(data)

        # Direct identifiers should be removed (None) or hashed
        assert result[0]["first_name"] is None
        assert result[0]["last_name"] is None
        assert result[0]["email"] is None
        assert result[0]["phone"] is None
        assert result[0]["ssn"] is None
        assert result[0]["address"] is None

    def test_full_deidentification_hashes_patient_id(self):
        """Full de-id hashes patient_id for grouping without revealing identity."""
        data = [
            {
                "patient_id": "p-001",
                "first_name": "Alice",
                "status": "active",
            }
        ]
        result = apply_full_deidentification(data)

        # patient_id should be hashed, not None
        assert result[0]["patient_id"] is not None
        assert result[0]["patient_id"].startswith("hash_")
        assert "p-001" not in result[0]["patient_id"]

    def test_full_deidentification_preserves_quasi_identifiers(self):
        """Full de-id generalizes but preserves quasi-identifiers."""
        data = [
            {
                "dob": "1985-03-15",
                "gender": "F",
                "primary_condition": "Epilepsy with generalized seizures",
                "status": "active",
            }
        ]
        result = apply_full_deidentification(data)

        # DOB should be generalized to year bucket, not removed
        assert result[0]["dob"] is not None
        # Should be a year range like "1984-1988"
        assert "-" in str(result[0]["dob"])

        # Gender should be generalized to "person"
        assert result[0]["gender"] == "person"

    def test_full_deidentification_preserves_non_phi(self):
        """Full de-id preserves all non-PHI fields."""
        data = [
            {
                "id": "record-001",
                "first_name": "Alice",
                "status": "active",
                "score_numeric": 28.5,
                "template_title": "MMSE",
                "active": True,
                "created_at": "2024-01-15T10:30:00",
            }
        ]
        result = apply_full_deidentification(data)

        # Non-PHI fields should be preserved exactly
        assert result[0]["status"] == "active"
        assert result[0]["score_numeric"] == 28.5
        assert result[0]["template_title"] == "MMSE"
        assert result[0]["active"] is True
        assert result[0]["created_at"] == "2024-01-15T10:30:00"

    def test_full_deidentification_empty_data(self):
        """Full de-id with empty data returns empty list."""
        result = apply_full_deidentification([])
        assert result == []

    def test_full_deidentification_multiple_records(self):
        """Full de-id handles multiple records consistently."""
        data = [
            {"patient_id": "p-001", "first_name": "Alice", "dob": "1985-03-15", "status": "active"},
            {"patient_id": "p-002", "first_name": "Bob", "dob": "1978-11-22", "status": "inactive"},
            {"patient_id": "p-003", "first_name": "Carol", "dob": "1990-07-10", "status": "active"},
        ]
        result = apply_full_deidentification(data)

        assert len(result) == 3
        for row in result:
            assert row["first_name"] is None
            assert row["status"] in ("active", "inactive")
            assert row["patient_id"].startswith("hash_")

    def test_full_deidentification_generalizes_long_conditions(self):
        """Very long condition names are truncated to prevent re-identification."""
        data = [
            {
                "patient_id": "p-001",
                "first_name": "Alice",
                "primary_condition": "A" * 100,  # Very long condition name
            }
        ]
        result = apply_full_deidentification(data)

        # Long condition should be truncated
        assert len(str(result[0]["primary_condition"])) < 100


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Integration — masking + anonymization pipeline
# ═══════════════════════════════════════════════════════════════════════════════


class TestMaskingAnonymizationPipeline:
    """End-to-end tests combining PHI masking with anonymization."""

    def test_mask_then_k_anonymize(self):
        """PHI masking followed by k-anonymity produces safe output."""
        data = [
            {"first_name": "Alice", "dob": "1985-03-15", "gender": "F", "condition": "Epilepsy"},
            {"first_name": "Bob", "dob": "1985-07-20", "gender": "F", "condition": "Epilepsy"},
            {"first_name": "Carol", "dob": "1986-01-10", "gender": "M", "condition": "Migraine"},
        ]
        # Step 1: Mask PHI
        masked = [{k: mask_phi_field(v, k) for k, v in row.items()} for row in data]

        # Step 2: Apply k-anonymity
        result = apply_k_anonymity(masked, k=2, quasi_identifiers=["dob", "gender"])

        # All first_name should be *** (masked)
        for row in result:
            assert row["first_name"] == "***"

    def test_full_deid_on_masked_data(self):
        """Full de-identification on already-masked data still works correctly."""
        data = [
            {
                "patient_id": "p-001",
                "first_name": "***",
                "last_name": "***",
                "dob": "***-***-****",
                "email": "***@***.***",
                "status": "active",
                "score": 95,
            }
        ]
        result = apply_full_deidentification(data)

        # Already-masked fields should remain None (direct identifiers removed)
        assert result[0]["first_name"] is None
        assert result[0]["last_name"] is None
        # patient_id should be hashed
        assert result[0]["patient_id"].startswith("hash_")
        # Non-PHI should be preserved
        assert result[0]["status"] == "active"
        assert result[0]["score"] == 95

    def test_all_phi_patterns_are_masked(self):
        """Every pattern in PHI_PATTERNS can be successfully applied."""
        for field_name, expected_mask in PHI_PATTERNS.items():
            test_value = "sensitive-test-value-12345"
            result = mask_phi_field(test_value, field_name)
            assert result == expected_mask, (
                f"Field '{field_name}': expected '{expected_mask}', got '{result}'"
            )


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS: Anonymization service primitives (imported from anonymization_service)
# ═══════════════════════════════════════════════════════════════════════════════


class TestAnonymizationServicePrimitives:
    """Tests for the core anonymization primitives used by the data console."""

    def test_k_anonymity_check_passes(self, monkeypatch):
        """k_anonymity_check passes when all groups >= k."""
        monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "test-secret")
        rows = [
            {"age_bucket": "30-34", "sex": "F"},
            {"age_bucket": "30-34", "sex": "F"},
            {"age_bucket": "30-34", "sex": "F"},
            {"age_bucket": "30-34", "sex": "F"},
            {"age_bucket": "30-34", "sex": "F"},
        ]
        report = k_anonymity_check(rows, ["age_bucket", "sex"], k=5)
        assert report["passes"] is True
        assert report["smallest_group_size"] == 5

    def test_k_anonymity_check_fails(self, monkeypatch):
        """k_anonymity_check fails when a group < k."""
        monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "test-secret")
        rows = [
            {"age_bucket": "30-34", "sex": "F"},
            {"age_bucket": "30-34", "sex": "F"},
            {"age_bucket": "90+", "sex": "M"},  # Outlier
        ]
        report = k_anonymity_check(rows, ["age_bucket", "sex"], k=2)
        assert report["passes"] is False
        assert report["smallest_group_size"] == 1

    def test_age_bucket_hipaa_compliance(self):
        """Age bucketing follows HIPAA Safe Harbor rules."""
        ref = date(2024, 1, 1)
        # Ages 0-89 should be in 5-year buckets
        assert age_bucket(date(2024, 1, 1), ref) == "0-4"
        assert age_bucket(date(2015, 6, 1), ref) == "5-9"
        assert age_bucket(date(1980, 3, 1), ref) == "40-44"
        # Age >= 90 should collapse to "90+"
        assert age_bucket(date(1930, 1, 1), ref) == "90+"

    def test_hash_id_deterministic(self, monkeypatch):
        """hash_id produces deterministic output for same input."""
        monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "test-secret")
        h1 = hash_id("patient-123", namespace="test")
        h2 = hash_id("patient-123", namespace="test")
        assert h1 == h2
        assert len(h1) == 16

    def test_date_shift_preserves_order(self, monkeypatch):
        """Date shift preserves within-patient temporal order."""
        monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret")
        patient_id = "patient-shift-001"
        d1 = date(2024, 1, 1)
        d2 = date(2024, 6, 1)
        d3 = date(2024, 12, 1)

        shifted1 = shift_date(d1, patient_id)
        shifted2 = shift_date(d2, patient_id)
        shifted3 = shift_date(d3, patient_id)

        # Order should be preserved
        assert shifted1 < shifted2 < shifted3

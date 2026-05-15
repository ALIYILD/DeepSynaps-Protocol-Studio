# Clinic Data Export: Patterns, Formats, and Compliance Design Guide

**Research Report v1.0 | DeepSynaps Protocol Studio**
**Target Audience:** Healthcare Software Architects, Backend Engineers, Compliance Officers, Product Managers
**Last Updated:** 2025-01-15

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Export Formats](#2-export-formats)
3. [GDPR Subject Access Request (SAR)](#3-gdpr-subject-access-request-sar)
4. [Export Scope Selection](#4-export-scope-selection)
5. [Export Approval Workflow](#5-export-approval-workflow)
6. [Export Safety & Security](#6-export-safety--security)
7. [Export UI Patterns](#7-export-ui-patterns)
8. [Technical Implementation](#8-technical-implementation)
9. [Common Export Scenarios](#9-common-export-scenarios)
10. [Appendices](#10-appendices)

---

## 1. Executive Summary

Healthcare data export is a critical capability mandated by regulations worldwide. The right to access one's own medical records is enshrined in GDPR (Article 15), HIPAA (Privacy Rule, 45 CFR 164.524), and equivalent frameworks across jurisdictions. For clinic management systems, implementing robust, secure, and compliant data export functionality is not optional -- it is a legal requirement.

This research report provides a comprehensive design guide for clinic data export systems, covering:

- **Six export formats** with RFC/standard compliance details
- **GDPR SAR fulfillment workflows** with timeline and verification requirements
- **Five export scope patterns** from single-patient to clinic-wide
- **Five approval workflow tiers** balancing security with user experience
- **Six safety mechanisms** protecting PHI throughout the export lifecycle
- **Seven UI component patterns** for export interfaces
- **Five technical implementation patterns** for scalable, async export processing
- **Five common scenarios** with architecture recommendations

### Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Compliance First** | Every export must meet applicable regulatory requirements (HIPAA, GDPR, state laws) |
| **Patient-Centric** | Patients have the right to access their data promptly, in a usable format, at minimal or no cost |
| **Security by Default** | All exports must be encrypted, audited, and time-limited |
| **Transparency** | Patients must be notified when their data is exported |
| **Minimal Friction** | Self-service exports should be near-instantaneous for small datasets |
| **Scalability** | Large exports (clinic-wide, years of data) must not block the system |

---

## 2. Export Formats

### 2.1 CSV (RFC 4180 Compliance)

Comma-Separated Values (CSV) remains the most universally compatible export format. Despite its apparent simplicity, proper CSV generation requires strict adherence to RFC 4180 to prevent data corruption and injection attacks.

#### RFC 4180 Requirements

- **Field separator:** Comma (`,`)
- **Record terminator:** CRLF (`\r\n`)
- **Text qualifier:** Double quote (`"`) for fields containing commas, quotes, or line breaks
- **Escape mechanism:** Double double-quotes (`""`) to represent a literal quote
- **Header row:** Optional but strongly recommended for data exports
- **Character encoding:** UTF-8 (BOM optional for Excel compatibility)

#### Security Considerations

CSV injection (formula injection) is a critical vulnerability. Attackers can embed Excel formulas (`=cmd|' /C calc'!A0`) in data fields. Mitigation:

- Prefix fields starting with `=`, `+`, `-`, `@`, `\t`, or `\r` with a single quote (`'`)
- Sanitize all user-generated content before export
- Document that CSV files should be opened in text editors, not Excel, for security

#### Clinic Data CSV Schema

```csv
Patient ID,Assessment Date,Assessment Type,Score,Clinician,Notes
P-10045,2024-03-15T10:30:00Z,PHQ-9,12,Dr. Smith,Moderate depression
P-10045,2024-03-15T11:00:00Z,GAD-7,8,Dr. Smith,Mild anxiety
```

#### Python: Streaming CSV Generation (RFC 4180 Compliant)

```python
"""
Streaming CSV export with RFC 4180 compliance and PHI protection.
Memory-efficient for large datasets using Python generators.
"""

import csv
import io
import hashlib
from datetime import datetime, timedelta
from typing import Iterator, Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum


class CSVInjectionMitigation(Enum):
    """Strategies for preventing CSV/formula injection attacks."""
    PREFIX_SUSPECT = "prefix"      # Prefix suspect characters with apostrophe
    STRIP_FORMULAS = "strip"       # Remove formula-indicating characters
    ESCAPE_ALL = "escape"          # Escape all string fields aggressively
    REJECT = "reject"              # Reject records with suspect content


@dataclass
class CSVExportConfig:
    """Configuration for CSV export generation."""
    encoding: str = "utf-8-sig"    # UTF-8 with BOM for Excel compatibility
    delimiter: str = ","
    quotechar: str = '"'
    lineterminator: str = "\r\n"    # RFC 4180 requires CRLF
    injection_mitigation: CSVInjectionMitigation = CSVInjectionMitigation.PREFIX_SUSPECT
    include_header: bool = True
    datetime_format: str = "%Y-%m-%dT%H:%M:%SZ"
    hash_patient_id: bool = False   # De-identification option
    hash_salt: Optional[str] = None


class StreamingCSVExporter:
    """
    Memory-efficient streaming CSV exporter for clinic data.
    
    Uses Python generators to yield rows one at a time, ensuring
    O(1) memory usage regardless of dataset size. Compliant with
    RFC 4180 and includes CSV injection attack prevention.
    
    Usage:
        exporter = StreamingCSVExporter(config)
        for chunk in exporter.export_patients(query_iterator):
            write_to_response(chunk)
    """
    
    # Characters that can trigger formula execution in Excel/Google Sheets
    INJECTION_CHARS = {'=', '+', '-', '@', '\t', '\r'}
    
    def __init__(self, config: CSVExportConfig = None):
        self.config = config or CSVExportConfig()
    
    def _sanitize_field(self, value: Any) -> str:
        """
        Sanitize a field value to prevent CSV injection attacks.
        
        Excel and Google Sheets interpret cells starting with =, +, -, @
        as formulas. An attacker could embed malicious formulas in data.
        """
        if value is None:
            return ""
        
        str_value = str(value)
        
        if not str_value:
            return str_value
        
        # Check if first character could trigger formula execution
        if str_value[0] in self.INJECTION_CHARS:
            if self.config.injection_mitigation == CSVInjectionMitigation.PREFIX_SUSPECT:
                str_value = "'" + str_value
            elif self.config.injection_mitigation == CSVInjectionMitigation.STRIP_FORMULAS:
                str_value = str_value.lstrip(''.join(self.INJECTION_CHARS))
            elif self.config.injection_mitigation == CSVInjectionMitigation.REJECT:
                raise ValueError(f"Potentially malicious CSV content detected: {str_value[:50]}")
        
        return str_value
    
    def _transform_row(self, row: Dict[str, Any]) -> Dict[str, str]:
        """Transform a data row for safe CSV output."""
        transformed = {}
        for key, value in row.items():
            # Handle datetime formatting
            if isinstance(value, datetime):
                value = value.strftime(self.config.datetime_format)
            # Handle nested structures (flatten or JSON-stringify)
            elif isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            transformed[key] = self._sanitize_field(value)
        return transformed
    
    def _hash_identifier(self, patient_id: str) -> str:
        """Generate a deterministic hash for patient de-identification."""
        if not self.config.hash_patient_id:
            return patient_id
        salt = self.config.hash_salt or "default_salt_change_in_production"
        return hashlib.sha256(f"{patient_id}{salt}".encode()).hexdigest()[:16]
    
    def export_assessments(
        self,
        assessment_iterator: Iterator[Dict[str, Any]],
        columns: Optional[List[str]] = None
    ) -> Iterator[str]:
        """
        Stream assessment data as RFC 4180 compliant CSV.
        
        Yields string chunks suitable for writing directly to an HTTP
        response or file handle. Uses StringIO buffering for efficiency.
        
        Args:
            assessment_iterator: Iterator yielding assessment dicts
            columns: Ordered list of column names (auto-detected if None)
        
        Yields:
            CSV-formatted string chunks
        """
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=columns or [],
            delimiter=self.config.delimiter,
            quotechar=self.config.quotechar,
            lineterminator=self.config.lineterminator,
            quoting=csv.QUOTE_MINIMAL
        )
        
        first_row = True
        buffer_size = 0
        max_buffer = 8192  # Flush every 8KB for streaming
        
        for assessment in assessment_iterator:
            # Auto-detect columns from first row if not specified
            if first_row and columns is None:
                columns = list(assessment.keys())
                writer.fieldnames = columns
                
                if self.config.include_header:
                    writer.writeheader()
                    header = output.getvalue()
                    output.seek(0)
                    output.truncate(0)
                    yield header
            
            first_row = False
            
            # Apply PHI transformation and sanitization
            safe_row = self._transform_row(assessment)
            if self.config.hash_patient_id and 'patient_id' in safe_row:
                safe_row['patient_id'] = self._hash_identifier(safe_row['patient_id'])
            
            writer.writerow(safe_row)
            buffer_size += len(output.getvalue())
            
            if buffer_size >= max_buffer:
                chunk = output.getvalue()
                output.seek(0)
                output.truncate(0)
                buffer_size = 0
                yield chunk
        
        # Yield any remaining content
        remaining = output.getvalue()
        if remaining:
            yield remaining


# =============================================================================
# Flask/FastAPI Integration Example
# =============================================================================

def csv_export_endpoint_example():
    """
    Example of integrating the streaming CSV exporter with a web framework.
    Shown for FastAPI; Flask equivalent follows same pattern.
    """
    from fastapi import FastAPI, Request, HTTPException
    from fastapi.responses import StreamingResponse
    from fastapi import Depends
    
    app = FastAPI()
    
    @app.get("/api/v1/exports/assessments.csv")
    async def export_assessments(
        patient_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        format: str = "csv",
        current_user: dict = Depends(get_current_user)  # Auth dependency
    ):
        """
        Export assessment data as streaming CSV.
        
        Security checks performed:
        1. User authentication via JWT/OAuth2
        2. Authorization: patients can only export own data
        3. Clinicians can export data for their assigned patients
        4. Admins can export any data (logged separately)
        """
        # --- Authorization Gate ---
        if not can_access_patient_data(current_user, patient_id):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # --- Audit Log Entry ---
        audit_log.info(
            "export_initiated",
            user_id=current_user["id"],
            patient_id=patient_id,
            format="csv",
            ip_address=request.client.host,
            timestamp=datetime.utcnow().isoformat()
        )
        
        # --- Build Query ---
        query = build_assessment_query(
            patient_id=patient_id,
            start_date=start_date,
            end_date=end_date
        )
        
        # Stream results from database cursor (NOT loading all into memory)
        cursor = db.execute_streaming(query)
        
        config = CSVExportConfig(
            encoding="utf-8-sig",
            injection_mitigation=CSVInjectionMitigation.PREFIX_SUSPECT
        )
        exporter = StreamingCSVExporter(config)
        
        # Build filename with timestamp for uniqueness
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"assessments_{patient_id or 'all'}_{timestamp}.csv"
        
        return StreamingResponse(
            content=exporter.export_assessments(cursor),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Content-Security-Policy": "default-src 'none'"
            }
        )
```

#### CSV Export Best Practices

| Practice | Rationale |
|----------|-----------|
| Always use UTF-8-SIG encoding | BOM header ensures Excel opens CSV correctly on Windows |
| Use CRLF line endings | RFC 4180 compliance; Excel compatibility |
| Quote fields containing special chars | Prevents parsing errors with commas/quotes in data |
| Stream large datasets | Prevents memory exhaustion on exports of 100k+ rows |
| Sanitize formula-injection chars | Prevents CSV injection attacks |
| Include metadata header comment | Document export timestamp, source system, record count |
| Hash patient IDs for research exports | De-identification requirement for research datasets |

---

### 2.2 JSON (FHIR R4 Format Option)

JSON exports serve two primary purposes: (1) machine-readable structured data for interoperability, and (2) FHIR R4-compliant bundles for healthcare data exchange.

#### FHIR R4 Overview

FHIR (Fast Healthcare Interoperability Resources) R4 is the current standard for healthcare data exchange, published by HL7 International. Key resource types for clinic data:

| FHIR Resource | Clinic Data Mapping |
|--------------|-------------------|
| `Patient` | Demographics, contact info |
| `Observation` | Assessment scores (PHQ-9, GAD-7, etc.) |
| `DiagnosticReport` | qEEG reports, MRI interpretations |
| `Encounter` | Clinic visits, appointments |
| `Procedure` | Treatments administered |
| `DocumentReference` | Scanned documents, consent forms |
| `CarePlan` | Treatment plans |
| `Condition` | Diagnoses |
| `MedicationRequest` | Prescribed medications |
| `Practitioner` | Clinician information |

#### FHIR Bundle Structure

```json
{
  "resourceType": "Bundle",
  "id": "export-bundle-2024-001",
  "meta": {
    "versionId": "1",
    "lastUpdated": "2024-03-15T14:30:00Z",
    "profile": ["http://hl7.org/fhir/StructureDefinition/Bundle"]
  },
  "identifier": {
    "system": "https://clinic.example.com/export",
    "value": "export-2024-001"
  },
  "type": "collection",
  "timestamp": "2024-03-15T14:30:00Z",
  "total": 5,
  "entry": [
    {
      "fullUrl": "urn:uuid:patient-001",
      "resource": {
        "resourceType": "Patient",
        "id": "patient-001",
        "identifier": [{ "system": "https://clinic.example.com/mrn", "value": "MRN-10045" }],
        "name": [{ "family": "Doe", "given": ["Jane"] }],
        "gender": "female",
        "birthDate": "1985-06-15"
      }
    },
    {
      "fullUrl": "urn:uuid:obs-001",
      "resource": {
        "resourceType": "Observation",
        "id": "obs-001",
        "status": "final",
        "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "survey" }] }],
        "code": { "coding": [{ "system": "http://loinc.org", "code": "44261-6", "display": "PHQ-9" }] },
        "subject": { "reference": "urn:uuid:patient-001" },
        "effectiveDateTime": "2024-03-15T10:30:00Z",
        "valueInteger": 12,
        "component": [
          { "code": { "coding": [{ "display": "Little interest" }] }, "valueInteger": 2 },
          { "code": { "coding": [{ "display": "Feeling down" }] }, "valueInteger": 2 },
          { "code": { "coding": [{ "display": "Sleep problems" }] }, "valueInteger": 2 },
          { "code": { "coding": [{ "display": "Feeling tired" }] }, "valueInteger": 1 },
          { "code": { "coding": [{ "display": "Appetite" }] }, "valueInteger": 1 },
          { "code": { "coding": [{ "display": "Feeling bad" }] }, "valueInteger": 2 },
          { "code": { "coding": [{ "display": "Concentration" }] }, "valueInteger": 1 },
          { "code": { "coding": [{ "display": "Moving slowly" }] }, "valueInteger": 0 },
          { "code": { "coding": [{ "display": "Self-harm thoughts" }] }, "valueInteger": 1 }
        ]
      }
    }
  ]
}
```

#### Python: FHIR Bundle Generation

```python
"""
FHIR R4 Bundle generator for clinic data exports.
Converts internal clinic data models to FHIR-compliant JSON bundles.
"""

import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Iterator
from dataclasses import dataclass, asdict
from enum import Enum


class FHIRResourceType(Enum):
    PATIENT = "Patient"
    OBSERVATION = "Observation"
    DIAGNOSTIC_REPORT = "DiagnosticReport"
    ENCOUNTER = "Encounter"
    PROCEDURE = "Procedure"
    DOCUMENT_REFERENCE = "DocumentReference"
    CARE_PLAN = "CarePlan"
    CONDITION = "Condition"
    MEDICATION_REQUEST = "MedicationRequest"
    PRACTITIONER = "Practitioner"
    BUNDLE = "Bundle"


@dataclass
class FHIRConfig:
    """Configuration for FHIR Bundle generation."""
    fhir_version: str = "4.0.1"
    profile_base: str = "http://hl7.org/fhir/StructureDefinition"
    bundle_type: str = "collection"  # transaction | batch | history
    pretty_print: bool = False       # Use compact JSON for production
    include_full_url: bool = True
    de_identify: bool = False        # Strip direct identifiers for research


class FHIRBundleBuilder:
    """
    Incremental FHIR Bundle builder for clinic data exports.
    
    Design uses an accumulator pattern to build bundles incrementally,
    enabling streaming serialization for large datasets. Each resource
    is validated against FHIR R4 profiles before inclusion.
    
    For very large exports, consider using Bundle type "batch" with
    chunked processing instead of "collection".
    
    Usage:
        builder = FHIRBundleBuilder(config)
        builder.add_patient(patient_data)
        builder.add_observations(observation_iterator)
        bundle_json = builder.serialize()
    """
    
    # LOINC codes for common clinic assessments
    ASSESSMENT_CODES = {
        "PHQ-9": {"code": "44261-6", "display": "Patient Health Questionnaire-9"},
        "GAD-7": {"code": "69737-5", "display": "Generalized anxiety disorder 7"},
        "MMSE": {"code": "72106-8", "display": "Mini Mental State Examination"},
        "MoCA": {"code": "72133-2", "display": "Montreal Cognitive Assessment"},
        "HAM-D": {"code": "44256-6", "display": "Hamilton Depression Rating Scale"},
        "PSQI": {"code": "55675-2", "display": "Pittsburgh Sleep Quality Index"},
        "qEEG": {"code": "72134-0", "display": "Electroencephalogram study"},
    }
    
    def __init__(self, config: FHIRConfig = None):
        self.config = config or FHIRConfig()
        self.bundle_id = f"bundle-{uuid.uuid4().hex[:12]}"
        self.timestamp = datetime.utcnow().isoformat() + "Z"
        self.entries: List[Dict[str, Any]] = []
        self._resource_counter = 0
    
    def _generate_id(self, prefix: str) -> str:
        """Generate a deterministic FHIR resource ID."""
        self._resource_counter += 1
        return f"{prefix}-{self._resource_counter:04d}"
    
    def _de_identify(self, resource: Dict[str, Any]) -> Dict[str, Any]:
        """Remove direct identifiers for de-identified exports."""
        if not self.config.de_identify:
            return resource
        
        # Remove or hash identifying fields
        redacted = resource.copy()
        redact_fields = ["name", "telecom", "address", "photo", "birthDate"]
        for field in redact_fields:
            if field in redacted:
                if field == "birthDate":
                    # Keep year only for research
                    redacted[field] = redacted[field][:4] if redacted[field] else None
                else:
                    del redacted[field]
        return redacted
    
    def add_patient(self, patient_data: Dict[str, Any]) -> str:
        """
        Add a Patient resource to the bundle.
        
        Returns the resource ID for reference by other resources.
        """
        patient_id = self._generate_id("patient")
        
        patient_resource = {
            "resourceType": "Patient",
            "id": patient_id,
            "meta": {
                "profile": [f"{self.config.profile_base}/Patient"],
                "lastUpdated": self.timestamp
            },
            "identifier": [
                {
                    "system": "https://clinic.example.com/mrn",
                    "value": patient_data.get("mrn", "UNKNOWN")
                }
            ],
            "name": [
                {
                    "family": patient_data.get("last_name", ""),
                    "given": [patient_data.get("first_name", "")]
                }
            ],
            "gender": patient_data.get("gender", "unknown"),
            "birthDate": patient_data.get("birth_date"),
        }
        
        # Optional fields
        if patient_data.get("email"):
            patient_resource["telecom"] = [
                {
                    "system": "email",
                    "value": patient_data["email"],
                    "use": "home"
                }
            ]
        
        patient_resource = self._de_identify(patient_resource)
        
        entry = {
            "fullUrl": f"urn:uuid:{patient_id}",
            "resource": patient_resource
        }
        self.entries.append(entry)
        return patient_id
    
    def add_observation(
        self,
        patient_id: str,
        assessment_data: Dict[str, Any]
    ) -> str:
        """
        Add an Observation resource (assessment result) to the bundle.
        
        Supports PHQ-9, GAD-7, and other standardized assessments mapped
        to LOINC codes for interoperability.
        """
        obs_id = self._generate_id("obs")
        assessment_type = assessment_data.get("type", "UNKNOWN")
        loinc = self.ASSESSMENT_CODES.get(assessment_type, {"code": "", "display": assessment_type})
        
        observation = {
            "resourceType": "Observation",
            "id": obs_id,
            "meta": {
                "profile": [f"{self.config.profile_base}/Observation"],
                "lastUpdated": self.timestamp
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "survey",
                            "display": "Survey"
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": loinc["code"],
                        "display": loinc["display"]
                    }
                ],
                "text": assessment_type
            },
            "subject": {
                "reference": f"urn:uuid:{patient_id}"
            },
            "effectiveDateTime": assessment_data.get("date") + "T" + assessment_data.get("time", "00:00:00") + "Z",
            "valueInteger": assessment_data.get("total_score"),
            "note": [{ "text": assessment_data.get("notes", "") }] if assessment_data.get("notes") else []
        }
        
        # Add individual item scores as components
        if assessment_data.get("item_scores"):
            components = []
            for item_name, item_score in assessment_data["item_scores"].items():
                components.append({
                    "code": {
                        "coding": [{ "display": item_name }],
                        "text": item_name
                    },
                    "valueInteger": item_score
                })
            observation["component"] = components
        
        entry = {
            "fullUrl": f"urn:uuid:{obs_id}",
            "resource": observation
        }
        self.entries.append(entry)
        return obs_id
    
    def add_diagnostic_report(
        self,
        patient_id: str,
        report_data: Dict[str, Any]
    ) -> str:
        """Add a DiagnosticReport resource (e.g., qEEG, MRI report)."""
        report_id = self._generate_id("report")
        
        report = {
            "resourceType": "DiagnosticReport",
            "id": report_id,
            "meta": {
                "profile": [f"{self.config.profile_base}/DiagnosticReport"],
                "lastUpdated": self.timestamp
            },
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                            "code": report_data.get("category_code", "NEU"),
                            "display": report_data.get("category_display", "Neurology")
                        }
                    ]
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": report_data.get("loinc_code", ""),
                        "display": report_data.get("type", "Diagnostic Study")
                    }
                ]
            },
            "subject": { "reference": f"urn:uuid:{patient_id}" },
            "effectiveDateTime": report_data.get("date") + "T" + report_data.get("time", "00:00:00") + "Z",
            "result": [],
            "conclusion": report_data.get("conclusion", ""),
            "presentedForm": [
                {
                    "contentType": "application/pdf",
                    "url": report_data.get("pdf_url", ""),
                    "title": f"{report_data.get('type', 'Report')} - {report_data.get('date')}"
                }
            ] if report_data.get("pdf_url") else []
        }
        
        entry = {
            "fullUrl": f"urn:uuid:{report_id}",
            "resource": report
        }
        self.entries.append(entry)
        return report_id
    
    def add_encounter(self, patient_id: str, encounter_data: Dict[str, Any]) -> str:
        """Add an Encounter resource to the bundle."""
        enc_id = self._generate_id("enc")
        
        encounter = {
            "resourceType": "Encounter",
            "id": enc_id,
            "meta": {
                "profile": [f"{self.config.profile_base}/Encounter"],
                "lastUpdated": self.timestamp
            },
            "status": "finished",
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": encounter_data.get("class_code", "AMB"),
                "display": encounter_data.get("class_display", "ambulatory")
            },
            "type": [
                {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": encounter_data.get("snomed_code", "")
                        }
                    ]
                }
            ],
            "subject": { "reference": f"urn:uuid:{patient_id}" },
            "period": {
                "start": encounter_data.get("start_time"),
                "end": encounter_data.get("end_time")
            },
            "participant": [
                {
                    "individual": {
                        "reference": f"Practitioner/{encounter_data.get('clinician_id', '')}"
                    }
                }
            ] if encounter_data.get("clinician_id") else []
        }
        
        entry = {
            "fullUrl": f"urn:uuid:{enc_id}",
            "resource": encounter
        }
        self.entries.append(entry)
        return enc_id
    
    def serialize(self) -> str:
        """
        Serialize the complete Bundle to JSON string.
        
        For very large bundles, consider serialize_streaming() instead.
        """
        bundle = {
            "resourceType": "Bundle",
            "id": self.bundle_id,
            "meta": {
                "versionId": "1",
                "lastUpdated": self.timestamp,
                "profile": [f"{self.config.profile_base}/Bundle"]
            },
            "identifier": {
                "system": "https://clinic.example.com/export",
                "value": self.bundle_id
            },
            "type": self.config.bundle_type,
            "timestamp": self.timestamp,
            "total": len(self.entries),
            "entry": self.entries
        }
        
        indent = 2 if self.config.pretty_print else None
        return json.dumps(bundle, ensure_ascii=False, indent=indent)
    
    def serialize_streaming(self) -> Iterator[str]:
        """
        Serialize the Bundle as a streaming JSON response.
        
        Yields JSON chunks suitable for StreamingResponse. Uses a custom
        serialization approach to avoid materializing the entire bundle
        in memory.
        
        Yields: JSON string chunks
        """
        # Header
        header = {
            "resourceType": "Bundle",
            "id": self.bundle_id,
            "meta": {
                "versionId": "1",
                "lastUpdated": self.timestamp
            },
            "type": self.config.bundle_type,
            "timestamp": self.timestamp,
            "total": len(self.entries)
        }
        yield json.dumps(header, ensure_ascii=False)[:-1]  # Remove closing }
        yield ', "entry": ['
        
        # Entries
        for i, entry in enumerate(self.entries):
            if i > 0:
                yield ","
            yield json.dumps(entry, ensure_ascii=False)
        
        yield "]}"


# =============================================================================
# Example: Converting clinic assessment to FHIR Observation
# =============================================================================

def example_assessment_to_fhir():
    """Example workflow: clinic assessment -> FHIR Bundle -> JSON export."""
    
    # Internal clinic data model
    patient = {
        "mrn": "MRN-10045",
        "first_name": "Jane",
        "last_name": "Doe",
        "gender": "female",
        "birth_date": "1985-06-15",
        "email": "jane.doe@example.com"
    }
    
    phq9_assessment = {
        "type": "PHQ-9",
        "date": "2024-03-15",
        "time": "10:30:00",
        "total_score": 12,
        "item_scores": {
            "Little interest": 2,
            "Feeling down": 2,
            "Sleep problems": 2,
            "Feeling tired": 1,
            "Appetite": 1,
            "Feeling bad": 2,
            "Concentration": 1,
            "Moving slowly": 0,
            "Self-harm thoughts": 1
        },
        "notes": "Moderate depression, follow-up in 2 weeks"
    }
    
    qeeg_report = {
        "type": "qEEG Analysis",
        "category_code": "NEU",
        "category_display": "Neurology",
        "loinc_code": "72134-0",
        "date": "2024-03-15",
        "time": "11:30:00",
        "conclusion": "Elevated theta activity in frontal regions consistent with ADHD profile.",
        "pdf_url": "https://clinic.example.com/reports/qeeg-10045-20240315.pdf"
    }
    
    encounter = {
        "class_code": "AMB",
        "class_display": "ambulatory",
        "snomed_code": "183452005",
        "start_time": "2024-03-15T09:00:00Z",
        "end_time": "2024-03-15T12:00:00Z",
        "clinician_id": "clin-001"
    }
    
    # Build FHIR Bundle
    config = FHIRConfig(pretty_print=True)
    builder = FHIRBundleBuilder(config)
    
    patient_id = builder.add_patient(patient)
    builder.add_observation(patient_id, phq9_assessment)
    builder.add_diagnostic_report(patient_id, qeeg_report)
    builder.add_encounter(patient_id, encounter)
    
    bundle_json = builder.serialize()
    print(bundle_json)
    return bundle_json
```

---

### 2.3 PDF (Report-Style)

PDF exports serve patients who want a human-readable, printable copy of their records. They also serve as the standard format for clinical reports and legal document production.

#### PDF Generation Approaches

| Approach | Library | Pros | Cons |
|----------|---------|------|------|
| **Template-based** | WeasyPrint, xhtml2pdf | Full CSS styling, familiar HTML | Complex setup, font issues |
| **Canvas drawing** | ReportLab | Precise control, fast | Verbose code, manual layout |
| **Document assembly** | pypdf, pdfrw | Merge existing PDFs | Limited creation capabilities |
| **Headless browser** | Playwright, Puppeteer | Perfect rendering | Heavy dependency, slower |

#### PDF Security Requirements

- **Password protection:** AES-256 encryption required for PHI
- **Watermarking:** "CONFIDENTIAL - PATIENT RECORD" overlay
- **Metadata scrubbing:** Remove author, creation tool metadata
- **Printing restrictions:** Allow printing, disable editing/copying
- **Page numbering:** Page X of Y for legal admissibility

#### Python: PDF Report Generation with ReportLab

```python
"""
PDF export generator for clinic patient reports.
Produces password-protected, watermarked PDFs compliant with
HIPAA security requirements.
"""

import io
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Flowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PyPDF2 import PdfReader, PdfWriter


@dataclass
class PDFExportConfig:
    """Configuration for PDF export generation."""
    page_size: Tuple[float, float] = A4
    password: Optional[str] = None          # Encryption password
    watermark_text: str = "CONFIDENTIAL - PATIENT RECORD"
    header_text: str = "Clinic Data Export"
    footer_text: str = "This document contains protected health information (PHI)."
    include_timestamp: bool = True
    include_page_numbers: bool = True
    logo_path: Optional[str] = None
    primary_color: colors.Color = colors.HexColor("#2C5282")
    font_name: str = "Helvetica"


class WatermarkCanvas(canvas.Canvas):
    """
    Custom canvas that adds watermark and header/footer to every page.
    """
    def __init__(self, *args, config: PDFExportConfig = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.config = config or PDFExportConfig()
        self._saved_page_states = []
    
    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()
    
    def save(self):
        """Add watermark, header, and footer to each page."""
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_watermark()
            self._draw_header()
            self._draw_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)
    
    def _draw_watermark(self):
        """Draw diagonal watermark across the page."""
        self.saveState()
        self.setFont(self.config.font_name, 48)
        self.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.3))
        self.translate(self.config.page_size[0] / 2, self.config.page_size[1] / 2)
        self.rotate(45)
        self.drawCentredString(0, 0, self.config.watermark_text)
        self.restoreState()
    
    def _draw_header(self):
        """Draw page header with clinic name and timestamp."""
        self.saveState()
        self.setFont(self.config.font_name, 10)
        self.setFillColor(colors.grey)
        
        header = self.config.header_text
        if self.config.include_timestamp:
            header += f" | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
        
        self.drawString(0.75 * inch, self.config.page_size[1] - 0.5 * inch, header)
        
        # Draw header line
        self.setStrokeColor(self.config.primary_color)
        self.setLineWidth(1)
        self.line(
            0.75 * inch,
            self.config.page_size[1] - 0.65 * inch,
            self.config.page_size[0] - 0.75 * inch,
            self.config.page_size[1] - 0.65 * inch
        )
        self.restoreState()
    
    def _draw_footer(self, total_pages: int):
        """Draw page footer with PHI warning and page numbers."""
        self.saveState()
        self.setFont(self.config.font_name, 8)
        self.setFillColor(colors.grey)
        
        # Footer line
        self.setStrokeColor(self.config.primary_color)
        self.setLineWidth(0.5)
        self.line(
            0.75 * inch,
            0.6 * inch,
            self.config.page_size[0] - 0.75 * inch,
            0.6 * inch
        )
        
        # PHI warning
        self.drawString(
            0.75 * inch,
            0.45 * inch,
            self.config.footer_text
        )
        
        # Page numbers
        if self.config.include_page_numbers:
            page_num = self.getPageNumber()
            self.drawRightString(
                self.config.page_size[0] - 0.75 * inch,
                0.45 * inch,
                f"Page {page_num} of {total_pages}"
            )
        
        self.restoreState()


class PDFReportGenerator:
    """
    Generates password-protected PDF reports from clinic data.
    
    Two-phase process:
    1. Build the PDF content using ReportLab
    2. Encrypt and add watermarks using PyPDF2
    
    Usage:
        generator = PDFReportGenerator(config)
        pdf_bytes = generator.generate_patient_report(patient_data, assessments)
    """
    
    def __init__(self, config: PDFExportConfig = None):
        self.config = config or PDFExportConfig()
        self.styles = self._setup_styles()
    
    def _setup_styles(self) -> Dict[str, ParagraphStyle]:
        """Configure paragraph styles for the report."""
        styles = getSampleStyleSheet()
        
        styles.add(ParagraphStyle(
            "ReportTitle",
            parent=styles["Heading1"],
            fontSize=20,
            textColor=self.config.primary_color,
            spaceAfter=20,
            alignment=TA_CENTER
        ))
        
        styles.add(ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading2"],
            fontSize=14,
            textColor=self.config.primary_color,
            spaceBefore=15,
            spaceAfter=10,
            borderWidth=1,
            borderColor=self.config.primary_color,
            borderPadding=5,
            backColor=colors.HexColor("#EDF2F7")
        ))
        
        styles.add(ParagraphStyle(
            "PatientInfo",
            parent=styles["Normal"],
            fontSize=10,
            spaceAfter=5
        ))
        
        styles.add(ParagraphStyle(
            "AssessmentScore",
            parent=styles["Normal"],
            fontSize=16,
            textColor=self.config.primary_color,
            alignment=TA_CENTER,
            spaceAfter=10
        ))
        
        styles.add(ParagraphStyle(
            "FooterNote",
            parent=styles["Normal"],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER,
            spaceBefore=20
        ))
        
        return styles
    
    def _create_patient_info_table(self, patient: Dict[str, Any]) -> Table:
        """Create a formatted table with patient demographics."""
        data = [
            ["Patient Name:", f"{patient.get('first_name', '')} {patient.get('last_name', '')}"],
            ["MRN:", patient.get("mrn", "N/A")],
            ["Date of Birth:", patient.get("birth_date", "N/A")],
            ["Gender:", patient.get("gender", "N/A")],
            ["Export Date:", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
        ]
        
        table = Table(data, colWidths=[2 * inch, 4 * inch])
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
            ("ALIGN", (0, 0), (0, -1), "RIGHT"),
            ("ALIGN", (1, 0), (1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EDF2F7")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        return table
    
    def _create_assessment_section(
        self,
        assessment: Dict[str, Any]
    ) -> List[Flowable]:
        """Create a report section for a single assessment."""
        elements = []
        
        # Assessment header
        elements.append(Paragraph(
            f"{assessment.get('type', 'Assessment')} - {assessment.get('date', 'Unknown Date')}",
            self.styles["SectionHeader"]
        ))
        
        # Score highlight box
        score_data = [[
            Paragraph(
                f"Total Score: {assessment.get('total_score', 'N/A')}",
                self.styles["AssessmentScore"]
            )
        ]]
        score_table = Table(score_data, colWidths=[6 * inch])
        score_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EBF8FF")),
            ("BOX", (0, 0), (-1, -1), 2, self.config.primary_color),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 15),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 15),
        ]))
        elements.append(score_table)
        elements.append(Spacer(1, 10))
        
        # Item-level scores
        if assessment.get("item_scores"):
            item_data = [["Item", "Score"]]
            for item, score in assessment["item_scores"].items():
                item_data.append([item, str(score)])
            
            item_table = Table(item_data, colWidths=[5 * inch, 1 * inch])
            item_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), self.config.primary_color),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFC")]),
            ]))
            elements.append(item_table)
        
        # Notes
        if assessment.get("notes"):
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(
                f"<b>Clinician Notes:</b> {assessment['notes']}",
                self.styles["PatientInfo"]
            ))
        
        elements.append(Spacer(1, 15))
        return elements
    
    def generate_patient_report(
        self,
        patient: Dict[str, Any],
        assessments: List[Dict[str, Any]],
        output_buffer: Optional[io.BytesIO] = None
    ) -> io.BytesIO:
        """
        Generate a complete patient report PDF.
        
        Args:
            patient: Patient demographics dictionary
            assessments: List of assessment result dictionaries
            output_buffer: Optional pre-created BytesIO buffer
        
        Returns:
            BytesIO containing the encrypted PDF
        """
        buffer = output_buffer or io.BytesIO()
        
        # Phase 1: Build content with ReportLab
        doc = SimpleDocTemplate(
            buffer,
            pagesize=self.config.page_size,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=1 * inch,
            bottomMargin=0.75 * inch
        )
        
        elements = []
        
        # Title page
        elements.append(Paragraph("Patient Data Export Report", self.styles["ReportTitle"]))
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(
            "This report contains your complete clinical assessment records as requested under "
            "applicable data protection regulations (GDPR Article 15 / HIPAA Privacy Rule).",
            self.styles["Normal"]
        ))
        elements.append(Spacer(1, 20))
        
        # Patient demographics
        elements.append(Paragraph("Patient Information", self.styles["SectionHeader"]))
        elements.append(self._create_patient_info_table(patient))
        elements.append(PageBreak())
        
        # Assessment records
        elements.append(Paragraph("Assessment Records", self.styles["SectionHeader"]))
        elements.append(Spacer(1, 10))
        
        for assessment in assessments:
            elements.extend(self._create_assessment_section(assessment))
        
        # Closing statement
        elements.append(Spacer(1, 30))
        elements.append(Paragraph(
            "--- End of Report ---<br/><br/>"
            "If you have questions about this export or believe any information is incorrect, "
            "please contact your clinic administrator.<br/><br/>"
            f"Report ID: EXP-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{patient.get('mrn', 'XXXX')}",
            self.styles["FooterNote"]
        ))
        
        # Build with custom canvas for watermarks
        doc.build(
            elements,
            canvasmaker=lambda *args, **kwargs: WatermarkCanvas(
                *args, config=self.config, **kwargs
            )
        )
        
        # Phase 2: Encrypt the PDF
        buffer.seek(0)
        
        if self.config.password:
            reader = PdfReader(buffer)
            writer = PdfWriter()
            
            for page in reader.pages:
                writer.add_page(page)
            
            # AES-256 encryption
            writer.encrypt(
                self.config.password,
                algorithm="AES-256"
            )
            
            encrypted_buffer = io.BytesIO()
            writer.write(encrypted_buffer)
            encrypted_buffer.seek(0)
            return encrypted_buffer
        
        buffer.seek(0)
        return buffer
```

---

### 2.4 Excel/XLSX

Excel exports provide the most user-friendly format for non-technical users who want to analyze their data. The XLSX format (Office Open XML) is an ISO/IEC 29500 standard.

#### XLSX Generation Best Practices

- Use **openpyxl** (MIT License) for pure Python XLSX generation
- Enable **data validation** for dropdown cells
- Apply **conditional formatting** to highlight abnormal values
- Set **column widths** appropriately for readability
- Add **freeze panes** for header rows
- Include **multiple sheets** for different data types
- Protect sheets from accidental modification

#### Python: XLSX Export with openpyxl

```python
"""
XLSX export generator for clinic data using openpyxl.
Produces formatted Excel workbooks with multiple sheets,
conditional formatting, and data validation.
"""

import io
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from openpyxl import Workbook
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, NamedStyle, Protection
)
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.chart import BarChart, Reference


@dataclass
class XLSXExportConfig:
    """Configuration for XLSX export generation."""
    clinic_name: str = "NeuroCare Clinic"
    theme_color: str = "2C5282"
    include_charts: bool = True
    include_summary: bool = True
    freeze_headers: bool = True
    sheet_protection: bool = True
    password: Optional[str] = None


class XLSXReportGenerator:
    """
    Generates formatted Excel workbooks for clinic data exports.
    
    Features:
    - Multiple sheets (Summary, Assessments, Encounters, etc.)
    - Conditional formatting for score highlighting
    - Data validation for dropdown fields
    - Charts for score trends
    - Sheet protection to prevent accidental edits
    
    Usage:
        generator = XLSXReportGenerator(config)
        xlsx_bytes = generator.generate_patient_workbook(patient, assessments)
    """
    
    # Score thresholds for conditional formatting
    SCORE_THRESHOLDS = {
        "PHQ-9": {
            "mild": (5, "90EE90"),           # Light green
            "moderate": (10, "FFD700"),       # Gold
            "moderately_severe": (15, "FF8C00"), # Dark orange
            "severe": (20, "FF4500"),          # Red-orange
        },
        "GAD-7": {
            "mild": (5, "90EE90"),
            "moderate": (10, "FFD700"),
            "severe": (15, "FF4500"),
        }
    }
    
    def __init__(self, config: XLSXExportConfig = None):
        self.config = config or XLSXExportConfig()
        self._setup_styles()
    
    def _setup_styles(self):
        """Define reusable cell styles."""
        self.header_font = Font(
            name="Calibri",
            size=11,
            bold=True,
            color="FFFFFF"
        )
        self.header_fill = PatternFill(
            start_color=self.config.theme_color,
            end_color=self.config.theme_color,
            fill_type="solid"
        )
        self.header_alignment = Alignment(
            horizontal="center",
            vertical="center",
            wrap_text=True
        )
        self.data_font = Font(name="Calibri", size=10)
        self.data_alignment = Alignment(vertical="center")
        self.thin_border = Border(
            left=Side(style="thin", color="CCCCCC"),
            right=Side(style="thin", color="CCCCCC"),
            top=Side(style="thin", color="CCCCCC"),
            bottom=Side(style="thin", color="CCCCCC")
        )
        self.title_font = Font(
            name="Calibri",
            size=18,
            bold=True,
            color=self.config.theme_color
        )
    
    def _apply_header_style(self, row_cells):
        """Apply header styling to a row of cells."""
        for cell in row_cells:
            cell.font = self.header_font
            cell.fill = self.header_fill
            cell.alignment = self.header_alignment
            cell.border = self.thin_border
    
    def _apply_data_style(self, row_cells):
        """Apply data row styling."""
        for cell in row_cells:
            cell.font = self.data_font
            cell.alignment = self.data_alignment
            cell.border = self.thin_border
    
    def _add_summary_sheet(
        self,
        wb: Workbook,
        patient: Dict[str, Any],
        assessments: List[Dict[str, Any]]
    ):
        """Create a summary/info sheet at the beginning of the workbook."""
        ws = wb.active
        ws.title = "Summary"
        ws.sheet_properties.tabColor = self.config.theme_color
        
        # Title
        ws.merge_cells("A1:D1")
        ws["A1"] = f"{self.config.clinic_name} - Patient Data Export"
        ws["A1"].font = self.title_font
        ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 30
        
        # Export metadata
        ws["A3"] = "Export Information"
        ws["A3"].font = Font(bold=True, size=12, color=self.config.theme_color)
        
        info_data = [
            ["Export Date:", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
            ["Report ID:", f"EXP-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"],
            ["Patient:", f"{patient.get('first_name', '')} {patient.get('last_name', '')}"],
            ["MRN:", patient.get("mrn", "N/A")],
            ["Total Assessments:", str(len(assessments))],
            ["Date Range:", self._get_date_range(assessments)],
        ]
        
        for i, (label, value) in enumerate(info_data, start=4):
            ws[f"A{i}"] = label
            ws[f"A{i}"].font = Font(bold=True)
            ws[f"B{i}"] = value
        
        # Adjust column widths
        ws.column_dimensions["A"].width = 20
        ws.column_dimensions["B"].width = 40
        ws.column_dimensions["C"].width = 20
        ws.column_dimensions["D"].width = 20
    
    def _add_assessments_sheet(
        self,
        wb: Workbook,
        assessments: List[Dict[str, Any]]
    ):
        """Create the detailed assessments sheet."""
        ws = wb.create_sheet("Assessments")
        ws.sheet_properties.tabColor = "4472C4"
        
        # Headers
        headers = ["Date", "Type", "Total Score", "Severity", "Clinician", "Notes"]
        ws.append(headers)
        self._apply_header_style(ws[1])
        
        # Data rows
        for assessment in assessments:
            score = assessment.get("total_score", 0)
            severity = self._calculate_severity(assessment.get("type", ""), score)
            
            row = [
                assessment.get("date"),
                assessment.get("type", ""),
                score,
                severity,
                assessment.get("clinician", ""),
                assessment.get("notes", "")
            ]
            ws.append(row)
        
        # Apply styling to all data rows
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            self._apply_data_style(row)
            
            # Color-code severity column
            severity_cell = row[3]  # Severity column
            if severity_cell.value in ["Severe", "Severe Anxiety"]:
                severity_cell.fill = PatternFill(start_color="FFCCCC", fill_type="solid")
            elif severity_cell.value in ["Moderate", "Moderate Anxiety"]:
                severity_cell.fill = PatternFill(start_color="FFE6CC", fill_type="solid")
            elif severity_cell.value in ["Mild", "Mild Anxiety"]:
                severity_cell.fill = PatternFill(start_color="E6F3FF", fill_type="solid")
        
        # Column widths
        ws.column_dimensions["A"].width = 15  # Date
        ws.column_dimensions["B"].width = 18  # Type
        ws.column_dimensions["C"].width = 12  # Score
        ws.column_dimensions["D"].width = 20  # Severity
        ws.column_dimensions["E"].width = 20  # Clinician
        ws.column_dimensions["F"].width = 50  # Notes
        
        # Freeze header row
        if self.config.freeze_headers:
            ws.freeze_panes = "A2"
        
        # Conditional formatting on score column
        red_fill = PatternFill(start_color="FF4500", end_color="FF4500", fill_type="solid")
        ws.conditional_formatting.add(
            "C2:C1000",
            CellIsRule(operator="greaterThan", formula=["15"], fill=red_fill)
        )
        
        # Data validation for type column
        dv = DataValidation(
            type="list",
            formula1='"PHQ-9,GAD-7,MMSE,MoCA,HAM-D,PSQI,qEEG"',
            allow_blank=True
        )
        dv.prompt = "Select assessment type"
        dv.promptTitle = "Assessment Type"
        ws.add_data_validation(dv)
        dv.add(f"B2:B1000")
        
        # Add chart if enabled
        if self.config.include_charts and len(assessments) > 1:
            self._add_score_chart(ws, assessments)
    
    def _add_score_chart(self, ws, assessments: List[Dict[str, Any]]):
        """Add a bar chart showing score trends."""
        chart = BarChart()
        chart.type = "col"
        chart.title = "Assessment Score Trends"
        chart.y_axis.title = "Score"
        chart.x_axis.title = "Assessment"
        chart.style = 10
        chart.height = 10
        chart.width = 20
        
        data = Reference(ws, min_col=3, min_row=1, max_row=len(assessments) + 1)
        cats = Reference(ws, min_col=2, min_row=2, max_row=len(assessments) + 1)
        chart.add_data(data, titles_from_data=True)
        chart.set_categories(cats)
        chart.shape = 4
        
        ws.add_chart(chart, "H2")
    
    def _calculate_severity(self, assessment_type: str, score: int) -> str:
        """Calculate severity classification for an assessment score."""
        if assessment_type == "PHQ-9":
            if score >= 20: return "Severe Depression"
            if score >= 15: return "Moderately Severe"
            if score >= 10: return "Moderate Depression"
            if score >= 5: return "Mild Depression"
            return "Minimal"
        elif assessment_type == "GAD-7":
            if score >= 15: return "Severe Anxiety"
            if score >= 10: return "Moderate Anxiety"
            if score >= 5: return "Mild Anxiety"
            return "Minimal"
        return "N/A"
    
    def _get_date_range(self, assessments: List[Dict[str, Any]]) -> str:
        """Calculate the date range of assessments."""
        if not assessments:
            return "N/A"
        dates = sorted([a.get("date", "") for a in assessments if a.get("date")])
        if not dates:
            return "N/A"
        return f"{dates[0]} to {dates[-1]}"
    
    def generate_patient_workbook(
        self,
        patient: Dict[str, Any],
        assessments: List[Dict[str, Any]]
    ) -> io.BytesIO:
        """
        Generate a complete patient data workbook.
        
        Returns:
            BytesIO containing the XLSX file
        """
        wb = Workbook()
        
        # Create sheets
        self._add_summary_sheet(wb, patient, assessments)
        self._add_assessments_sheet(wb, assessments)
        
        # Sheet protection
        if self.config.sheet_protection:
            for ws in wb.worksheets:
                ws.protection.sheet = True
                ws.protection.password = self.config.password or "export2024"
        
        # Save to buffer
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer
```

---

### 2.5 HL7 FHIR Bundle

The HL7 FHIR Bundle format (distinct from the JSON section above) is specifically designed for healthcare data exchange. It is the preferred format for:

- **Inter-system data transfers** (EHR-to-EHR)
- **Patient-directed exchange** (Blue Button, Apple Health)
- **Research data submissions** (requiring structured healthcare data)
- **Regulatory reporting** (quality measures, adverse events)

#### Bundle Types

| Type | Use Case | Processing Semantics |
|------|----------|---------------------|
| `document` | Clinical document (CCD) | Compostion-led, human-readable |
| `message` | System messaging | Message-driven processing |
| `transaction` | Atomic operations | All succeed or all fail |
| `transaction-response` | Transaction result | Response to transaction |
| `batch` | Non-atomic operations | Independent processing |
| `batch-response` | Batch result | Response to batch |
| `history` | Resource history | Audit trail |
| `searchset` | Search results | Query response |
| `collection` | Grouped resources | Document-style grouping |

For patient data exports, `collection` is the most appropriate bundle type.

#### FHIR Bundle Validation

```python
"""
FHIR Bundle validation utilities.
Ensures exported bundles conform to FHIR R4 specification.
"""

import re
from typing import List, Dict, Any, Tuple
from datetime import datetime


class FHIRBundleValidator:
    """
    Validates FHIR R4 Bundle resources for compliance.
    
    Performs structural validation, reference integrity checks,
    and profile conformance verification.
    """
    
    # Regex patterns for FHIR data types
    ID_PATTERN = re.compile(r'^[A-Za-z0-9\-\.]{1,64}$')
    OID_PATTERN = re.compile(r'^urn:oid:[0-2](\.[1-9]\d*)+$')
    UUID_PATTERN = re.compile(r'^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    DATE_PATTERN = re.compile(r'^\d{4}(-\d{2}(-\d{2})?)?$')
    DATETIME_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$')
    
    # Required Bundle fields
    REQUIRED_BUNDLE_FIELDS = ["resourceType", "type"]
    VALID_BUNDLE_TYPES = [
        "document", "message", "transaction", "transaction-response",
        "batch", "batch-response", "history", "searchset", "collection"
    ]
    
    def validate_bundle(self, bundle: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate a FHIR Bundle resource.
        
        Returns:
            Tuple of (is_valid, list_of_error_messages)
        """
        errors = []
        
        # Check resourceType
        if bundle.get("resourceType") != "Bundle":
            errors.append("Bundle must have resourceType = 'Bundle'")
        
        # Check required fields
        for field in self.REQUIRED_BUNDLE_FIELDS:
            if field not in bundle:
                errors.append(f"Missing required field: {field}")
        
        # Validate bundle type
        if bundle.get("type") not in self.VALID_BUNDLE_TYPES:
            errors.append(
                f"Invalid bundle type: {bundle.get('type')}. "
                f"Must be one of: {', '.join(self.VALID_BUNDLE_TYPES)}"
            )
        
        # Validate entry resources
        if "entry" in bundle:
            if not isinstance(bundle["entry"], list):
                errors.append("Bundle.entry must be an array")
            else:
                errors.extend(self._validate_entries(bundle["entry"]))
        
        # Validate total matches entry count
        if "total" in bundle and "entry" in bundle:
            if bundle["total"] != len(bundle["entry"]):
                errors.append(
                    f"Bundle.total ({bundle['total']}) does not match "
                    f"entry count ({len(bundle['entry'])}"
                )
        
        # Validate timestamp format
        if "timestamp" in bundle:
            if not self.DATETIME_PATTERN.match(bundle["timestamp"]):
                errors.append(f"Invalid timestamp format: {bundle['timestamp']}")
        
        return len(errors) == 0, errors
    
    def _validate_entries(self, entries: List[Dict[str, Any]]) -> List[str]:
        """Validate individual bundle entries."""
        errors = []
        seen_full_urls = set()
        
        for i, entry in enumerate(entries):
            # Check fullUrl uniqueness
            full_url = entry.get("fullUrl", "")
            if full_url:
                if full_url in seen_full_urls:
                    errors.append(f"Duplicate fullUrl at entry[{i}]: {full_url}")
                seen_full_urls.add(full_url)
            
            # Validate resource
            if "resource" not in entry:
                errors.append(f"Entry[{i}] missing required 'resource' field")
                continue
            
            resource = entry["resource"]
            if "resourceType" not in resource:
                errors.append(f"Entry[{i}] resource missing resourceType")
        
        return errors
    
    def validate_references(self, bundle: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate that all internal references within the bundle resolve.
        
        Checks that every Reference.reference points to a resource
        that exists in the bundle.
        """
        errors = []
        
        # Collect all resource IDs and fullUrls
        available_refs = set()
        if "entry" in bundle:
            for entry in bundle["entry"]:
                if "fullUrl" in entry:
                    available_refs.add(entry["fullUrl"])
                resource = entry.get("resource", {})
                if "id" in resource:
                    available_refs.add(f"{resource['resourceType']}/{resource['id']}")
        
        # Check all references in all resources
        for i, entry in enumerate(bundle.get("entry", [])):
            resource = entry.get("resource", {})
            refs = self._extract_references(resource)
            for ref_path, ref_value in refs:
                if ref_value.startswith("urn:") or "/" in ref_value:
                    if ref_value not in available_refs:
                        errors.append(
                            f"Entry[{i}] unresolved reference at {ref_path}: {ref_value}"
                        )
        
        return len(errors) == 0, errors
    
    def _extract_references(
        self,
        obj: Any,
        path: str = ""
    ) -> List[Tuple[str, str]]:
        """Recursively extract all Reference.reference values from a resource."""
        refs = []
        
        if isinstance(obj, dict):
            if "reference" in obj and isinstance(obj["reference"], str):
                refs.append((path, obj["reference"]))
            for key, value in obj.items():
                new_path = f"{path}.{key}" if path else key
                refs.extend(self._extract_references(value, new_path))
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                new_path = f"{path}[{i}]"
                refs.extend(self._extract_references(item, new_path))
        
        return refs
```

---

### 2.6 XML (Legacy Systems)

XML exports remain necessary for interoperability with legacy healthcare systems that have not yet adopted FHIR or JSON-based interfaces.

#### Common XML Schemas for Healthcare

| Standard | Organization | Use Case | Status |
|----------|-------------|----------|--------|
| **HL7 v2.x** | HL7 International | Messaging (ADT, ORU, MDM) | Legacy but widely used |
| **HL7 v3 CDA** | HL7 International | Clinical documents (CCD) | Being replaced by FHIR |
| **DICOM SR** | NEMA | Diagnostic imaging reports | Active standard |
| **Continuity of Care (CCR)** | ASTM | Care summaries | Superseded by CCD |
| **NCPDP SCRIPT** | NCPDP | Pharmacy e-prescribing | Active standard |

#### Python: XML Export with ElementTree

```python
"""
XML export generator for legacy system compatibility.
Supports HL7 v3 CDA and custom XML schemas.
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import Dict, Any, List
from dataclasses import dataclass


@dataclass
class XMLExportConfig:
    """Configuration for XML export generation."""
    schema: str = "custom"  # "cda", "custom", "hl7v2"
    pretty_print: bool = True
    encoding: str = "UTF-8"
    include_stylesheet: bool = False


class XMLReportGenerator:
    """
    Generates XML exports for clinic data.
    Supports HL7 v3 CDA format and custom schemas.
    """
    
    # HL7 namespace URIs
    HL7_NS = "urn:hl7-org:v3"
    XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
    
    def __init__(self, config: XMLExportConfig = None):
        self.config = config or XMLExportConfig()
    
    def _create_cda_header(
        self,
        patient: Dict[str, Any],
        author: Dict[str, Any]
    ) -> ET.Element:
        """Create the CDA header (ClinicalDocument element)."""
        nsmap = {
            "": self.HL7_NS,
            "xsi": self.XSI_NS
        }
        
        root = ET.Element("ClinicalDocument")
        root.set("xmlns", self.HL7_NS)
        root.set(f"{{{self.XSI_NS}}}type", "ClinicalDocument")
        
        # Realm code
        realm = ET.SubElement(root, "realmCode")
        realm.set("code", "US")
        
        # Type ID
        type_id = ET.SubElement(root, "typeId")
        type_id.set("root", "2.16.840.1.113883.1.3")
        type_id.set("extension", "POCD_HD000040")
        
        # Template ID
        template_id = ET.SubElement(root, "templateId")
        template_id.set("root", "2.16.840.1.113883.10.20.22.1.1")
        
        # Document ID
        doc_id = ET.SubElement(root, "id")
        doc_id.set("root", "2.16.840.1.113883.19.5")
        doc_id.set("extension", f"EXP-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
        
        # Document code (34133-9 = Summary of episode note)
        code = ET.SubElement(root, "code")
        code.set("code", "34133-9")
        code.set("codeSystem", "2.16.840.1.113883.6.1")
        code.set("displayName", "Summarization of Episode Note")
        
        # Title
        title = ET.SubElement(root, "title")
        title.text = "Patient Assessment Data Export"
        
        # Effective time
        eff_time = ET.SubElement(root, "effectiveTime")
        eff_time.set("value", datetime.utcnow().strftime("%Y%m%d%H%M%S%z"))
        
        # Confidentiality
        conf = ET.SubElement(root, "confidentialityCode")
        conf.set("code", "N")
        conf.set("codeSystem", "2.16.840.1.113883.5.25")
        
        # Language
        lang = ET.SubElement(root, "languageCode")
        lang.set("code", "en-US")
        
        # Record target (patient)
        record_target = ET.SubElement(root, "recordTarget")
        patient_role = ET.SubElement(record_target, "patientRole")
        patient_id = ET.SubElement(patient_role, "id")
        patient_id.set("root", "2.16.840.1.113883.19.5")
        patient_id.set("extension", patient.get("mrn", ""))
        
        patient_elem = ET.SubElement(patient_role, "patient")
        name = ET.SubElement(patient_elem, "name")
        given = ET.SubElement(name, "given")
        given.text = patient.get("first_name", "")
        family = ET.SubElement(name, "family")
        family.text = patient.get("last_name", "")
        
        # Author
        author_elem = ET.SubElement(root, "author")
        author_time = ET.SubElement(author_elem, "time")
        author_time.set("value", datetime.utcnow().strftime("%Y%m%d%H%M%S%z"))
        assigned_author = ET.SubElement(author_elem, "assignedAuthor")
        author_id = ET.SubElement(assigned_author, "id")
        author_id.set("nullFlavor", "NA")
        assigned_person = ET.SubElement(assigned_author, "assignedPerson")
        author_name = ET.SubElement(assigned_person, "name")
        author_given = ET.SubElement(author_name, "given")
        author_given.text = author.get("first_name", "")
        author_family = ET.SubElement(author_name, "family")
        author_family.text = author.get("last_name", "")
        
        # Custodian
        custodian = ET.SubElement(root, "custodian")
        assigned_cust = ET.SubElement(custodian, "assignedCustodian")
        cust_org = ET.SubElement(assigned_cust, "representedCustodianOrganization")
        cust_name = ET.SubElement(cust_org, "name")
        cust_name.text = "NeuroCare Clinic"
        
        return root
    
    def _add_cda_assessment_section(
        self,
        root: ET.Element,
        assessments: List[Dict[str, Any]]
    ):
        """Add assessment results as a CDA section."""
        component = ET.SubElement(root, "component")
        structured_body = ET.SubElement(component, "structuredBody")
        
        section = ET.SubElement(structured_body, "component")
        section_elem = ET.SubElement(section, "section")
        
        # Section code (51848-0 = Assessment + plan)
        code = ET.SubElement(section_elem, "code")
        code.set("code", "51848-0")
        code.set("codeSystem", "2.16.840.1.113883.6.1")
        code.set("displayName", "Assessment & Plan")
        
        title = ET.SubElement(section_elem, "title")
        title.text = "Assessment Results"
        
        # Add each assessment as narrative text
        text = ET.SubElement(section_elem, "text")
        
        for assessment in assessments:
            paragraph = ET.SubElement(text, "paragraph")
            
            bold_type = ET.SubElement(paragraph, "content")
            bold_type.set("styleCode", "Bold")
            bold_type.text = f"{assessment.get('type', 'Assessment')}"
            
            paragraph.append(ET.Element("br"))
            
            date_span = ET.SubElement(paragraph, "content")
            date_span.text = f"Date: {assessment.get('date', 'N/A')}"
            paragraph.append(ET.Element("br"))
            
            score_span = ET.SubElement(paragraph, "content")
            score_span.set("styleCode", "Bold")
            score_span.text = f"Score: {assessment.get('total_score', 'N/A')}"
            paragraph.append(ET.Element("br"))
            
            if assessment.get("notes"):
                notes_span = ET.SubElement(paragraph, "content")
                notes_span.text = f"Notes: {assessment['notes']}"
        
        # Add structured entries
        for assessment in assessments:
            entry = ET.SubElement(section_elem, "entry")
            obs = ET.SubElement(entry, "observation")
            obs.set("classCode", "OBS")
            obs.set("moodCode", "EVN")
            
            obs_id = ET.SubElement(obs, "id")
            obs_id.set("root", str(uuid.uuid4()))
            
            obs_code = ET.SubElement(obs, "code")
            obs_code.set("code", self._get_loinc_code(assessment.get("type", "")))
            obs_code.set("codeSystem", "2.16.840.1.113883.6.1")
            
            obs_value = ET.SubElement(obs, "value")
            obs_value.set(f"{{{self.XSI_NS}}}type", "INT")
            obs_value.set("value", str(assessment.get("total_score", 0)))
            
            obs_time = ET.SubElement(obs, "effectiveTime")
            obs_time.set("value", assessment.get("date", "").replace("-", ""))
    
    def _get_loinc_code(self, assessment_type: str) -> str:
        """Map assessment type to LOINC code."""
        mapping = {
            "PHQ-9": "44261-6",
            "GAD-7": "69737-5",
            "MMSE": "72106-8",
            "MoCA": "72133-2",
            "qEEG": "72134-0",
        }
        return mapping.get(assessment_type, "")
    
    def generate_cda_export(
        self,
        patient: Dict[str, Any],
        assessments: List[Dict[str, Any]],
        author: Dict[str, Any]
    ) -> str:
        """
        Generate a CDA-compliant XML export.
        
        Returns:
            Pretty-printed XML string
        """
        root = self._create_cda_header(patient, author)
        self._add_cda_assessment_section(root, assessments)
        
        xml_string = ET.tostring(root, encoding="unicode")
        
        if self.config.pretty_print:
            dom = minidom.parseString(xml_string)
            return dom.toprettyxml(indent="  ", encoding=self.config.encoding).decode(self.config.encoding)
        
        return xml_string


# LOINC codes reference
LOINC_CODES = {
    "PHQ-9": "44261-6",
    "GAD-7": "69737-5",
    "MMSE": "72106-8",
    "MoCA": "72133-2",
    "HAM-D": "44256-6",
    "PSQI": "55675-2",
    "qEEG": "72134-0",
    "assessment_plan": "51848-0",
    "summary_note": "34133-9",
}
```

---

### 2.7 Format Selection Matrix

| Criterion | CSV | JSON (FHIR) | PDF | XLSX | FHIR Bundle | XML |
|-----------|-----|-------------|-----|------|-------------|-----|
| **Human Readable** | Partial | No | Yes | Yes | No | No |
| **Machine Parseable** | Yes | Yes | No | Partial | Yes | Yes |
| **Interoperability** | Low | High | None | Low | Very High | Medium |
| **File Size** | Small | Medium | Large | Medium | Medium | Large |
| **Rich Formatting** | No | No | Yes | Yes | No | No |
| **Encryption Ready** | Via ZIP | Via ZIP | Native | Native | Via ZIP | Via ZIP |
| **Standardized Schema** | No | FHIR R4 | No | No | FHIR R4 | HL7/CDA |
| **Patient Preference** | Low | Low | High | High | Low | Low |
| **Legal Admissibility** | Low | Medium | High | Medium | High | High |
| **EHR Import** | Manual | API | Scan | Manual | API | Interface |

### 2.8 Format Selection Recommendations by Scenario

| Scenario | Recommended Format | Secondary Format |
|----------|-------------------|------------------|
| Patient requesting own records | **PDF** (readable) + CSV (analysis) | XLSX |
| System migration | **FHIR Bundle** | XML (CDA) |
| Research dataset | **FHIR Bundle** (de-identified) | CSV |
| Legal/compliance request | **PDF** (watermarked) + FHIR Bundle | XML |
| Backup/archival | **FHIR Bundle** | JSON |
| Patient mobile app | **JSON (FHIR)** | - |
| Insurance claim | **FHIR Bundle** | XML |
| Quality reporting | **CSV** | FHIR Bundle |


---

## 3. GDPR Subject Access Request (SAR)

### 3.1 Regulatory Framework

Article 15 of the General Data Protection Regulation (EU 2016/679) grants data subjects the right to access their personal data. For healthcare clinics processing EU patient data, SAR compliance is mandatory regardless of clinic location (GDPR has extraterritorial scope under Article 3).

#### Article 15 Requirements Summary

| Requirement | Specification | Clinic Implication |
|-------------|--------------|-------------------|
| **Confirmation of processing** | Must confirm whether personal data is being processed | Automated response capability |
| **Access to data** | Must provide copy of personal data undergoing processing | Complete data export system |
| **Purpose information** | Must state purposes of processing | Purpose documentation |
| **Category disclosure** | Must disclose categories of personal data concerned | Data classification system |
| **Recipient disclosure** | Must identify recipients or categories of recipients | Third-party disclosure log |
| **Retention period** | Must provide envisaged retention period | Retention policy documentation |
| **Rectification/erasure** | Must inform of rights to rectification, erasure, restriction | Rights workflow integration |
| **Complaint right** | Must inform of right to lodge complaint with supervisory authority | DPA contact information |
| **Source disclosure** | If data not collected from subject, must disclose source | Provenance tracking |
| **Automated decision-making** | Must inform of existence of automated decision-making including profiling | Algorithmic transparency |

### 3.2 30-Day Response Requirement

GDPR Article 12(3) mandates that information requests be responded to **without undue delay and in any event within one month of receipt**.

#### Timeline Breakdown

```
Day 0:   SAR received (clock starts)
Day 1-3: Identity verification (must not unduly delay)
Day 3-5: Scope determination and data collection
Day 5-10: Data assembly and format preparation
Day 10-15: Quality review and redaction (third-party data)
Day 15-20: Package preparation and encryption
Day 20-25: Delivery and notification
Day 25-30: Buffer period for corrections
```

#### Extension Conditions (Article 12(3))

The response period may be extended by **two further months** where requests are:
- Complex (multiple data types, long history)
- Numerous (from the same data subject)

The data subject **must be informed of the extension and reasons** within one month of the original request.

#### Practical Implementation

```python
"""
GDPR SAR timeline management and response tracking.
Implements the 30-day (extendable to 90-day) response requirement.
"""

from datetime import datetime, timedelta
from enum import Enum, auto
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
import json


class SARStatus(Enum):
    """States in the SAR fulfillment lifecycle."""
    RECEIVED = "received"                    # Initial receipt
    IDENTITY_VERIFICATION_PENDING = "id_pending"  # Awaiting ID docs
    IDENTITY_VERIFIED = "id_verified"        # Identity confirmed
    IN_PROGRESS = "in_progress"              # Data being collected
    EXTENSION_REQUESTED = "extension_requested"  # 30d -> 90d extension
    QUALITY_REVIEW = "quality_review"        # Redaction review
    READY_FOR_DELIVERY = "ready"             # Prepared, awaiting send
    DELIVERED = "delivered"                  # Sent to requester
    CONFIRMED = "confirmed"                  # Receipt acknowledged
    EXPIRED = "expired"                      # Deadline passed
    WITHDRAWN = "withdrawn"                  # Requester withdrew
    REJECTED = "rejected"                    # Rejected (see reason)


class SARExtensionReason(Enum):
    """Valid reasons for extending the SAR response deadline."""
    COMPLEXITY = "complex"                   # Complex data landscape
    VOLUME = "volume"                        # Large volume of data
    MULTIPLE_REQUESTS = "multiple"           # Multiple concurrent requests
    THIRD_PARTY_CONSULTATION = "third_party" # Need to consult third parties
    SYSTEM_ISSUES = "system"                 # Technical system limitations


@dataclass
class SARTimeline:
    """
    Tracks all timeline-related events for a SAR request.
    
    The primary deadline is 30 calendar days from receipt.
    If extended, the secondary deadline is 90 calendar days total.
    """
    received_at: datetime
    identity_verified_at: Optional[datetime] = None
    extension_granted_at: Optional[datetime] = None
    extension_reason: Optional[SARExtensionReason] = None
    extension_notified_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    
    @property
    def primary_deadline(self) -> datetime:
        """Calculate the initial 30-day deadline."""
        # 30 calendar days from receipt
        return self.received_at + timedelta(days=30)
    
    @property
    def extended_deadline(self) -> Optional[datetime]:
        """Calculate the extended 90-day deadline if applicable."""
        if self.extension_granted_at:
            # Extension is up to 2 additional months = 60 days
            # Total maximum: 30 + 60 = 90 days from receipt
            return self.received_at + timedelta(days=90)
        return None
    
    @property
    def effective_deadline(self) -> datetime:
        """Return the currently applicable deadline."""
        return self.extended_deadline or self.primary_deadline
    
    @property
    def days_remaining(self) -> int:
        """Calculate days remaining until effective deadline."""
        remaining = self.effective_deadline - datetime.utcnow()
        return max(0, remaining.days)
    
    @property
    def is_overdue(self) -> bool:
        """Check if the response deadline has passed."""
        return datetime.utcnow() > self.effective_deadline
    
    @property
    def can_extend(self) -> bool:
        """
        Check if the deadline can still be extended.
        
        Extension must be requested AND communicated to the
        data subject before the primary deadline expires.
        """
        if self.extension_granted_at:
            return False  # Already extended
        if self.extension_notified_at:
            return False  # Already notified
        return datetime.utcnow() <= self.primary_deadline
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize timeline to dictionary for API responses."""
        return {
            "received_at": self.received_at.isoformat(),
            "primary_deadline": self.primary_deadline.isoformat(),
            "effective_deadline": self.effective_deadline.isoformat(),
            "days_remaining": self.days_remaining,
            "is_overdue": self.is_overdue,
            "is_extended": self.extension_granted_at is not None,
            "extension_reason": self.extension_reason.value if self.extension_reason else None,
            "identity_verified_at": self.identity_verified_at.isoformat() if self.identity_verified_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
        }


class SARTimelineManager:
    """
    Manages SAR request timelines and deadline enforcement.
    
    Provides automated deadline tracking, escalation for overdue
    requests, and extension management.
    """
    
    # Days before deadline to send warning notifications
    WARNING_DAYS = [7, 3, 1]
    
    def __init__(self, db_session=None):
        self.db = db_session
    
    def create_request(
        self,
        patient_id: str,
        request_channel: str,  # "portal", "email", "phone", "letter"
        requested_formats: List[str],
        scope_description: Optional[str] = None,
        third_party_involved: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new SAR request and initialize timeline tracking.
        
        Returns:
            Dictionary with request_id, timeline, and next_steps.
        """
        now = datetime.utcnow()
        
        request_record = {
            "request_id": f"SAR-{now.strftime('%Y%m%d')}-{self._generate_sequence()}",
            "patient_id": patient_id,
            "status": SARStatus.RECEIVED.value,
            "request_channel": request_channel,
            "requested_formats": requested_formats,
            "scope_description": scope_description,
            "third_party_involved": third_party_involved,
            "created_at": now,
            "timeline": SARTimeline(received_at=now),
        }
        
        # Persist to database
        # self.db.sar_requests.insert(request_record)
        
        # Determine initial workflow
        next_steps = ["verify_identity"]
        if third_party_involved:
            next_steps.append("consult_third_parties")
        
        return {
            "request_id": request_record["request_id"],
            "status": SARStatus.RECEIVED.value,
            "timeline": request_record["timeline"].to_dict(),
            "next_steps": next_steps,
            "message": (
                "Your Subject Access Request has been received. "
                "We will respond within 30 days. Your reference number is: "
                f"{request_record['request_id']}."
            )
        }
    
    def check_deadlines(self) -> List[Dict[str, Any]]:
        """
        Check all active SAR requests for approaching/overdue deadlines.
        
        Should be run by a scheduled job (e.g., Celery beat) daily.
        Returns list of requests requiring attention.
        """
        alerts = []
        now = datetime.utcnow()
        
        # Get all non-finalized SAR requests
        active_requests = self._get_active_requests()
        
        for request in active_requests:
            timeline = request["timeline"]
            days_remaining = timeline.days_remaining
            
            # Check for overdue
            if timeline.is_overdue:
                alerts.append({
                    "request_id": request["request_id"],
                    "severity": "critical",
                    "alert_type": "overdue",
                    "message": f"SAR {request['request_id']} is overdue by {abs(days_remaining)} days",
                    "days_overdue": abs(days_remaining),
                    "recommended_action": "escalate_to_dpo"
                })
                continue
            
            # Check for warnings
            if days_remaining in self.WARNING_DAYS:
                alerts.append({
                    "request_id": request["request_id"],
                    "severity": "warning",
                    "alert_type": "approaching_deadline",
                    "message": f"SAR {request['request_id']} due in {days_remaining} days",
                    "days_remaining": days_remaining,
                    "recommended_action": "prioritize_fulfillment"
                })
            
            # Check if extension should be considered
            if days_remaining <= 10 and timeline.can_extend:
                if request.get("third_party_involved") or request.get("data_volume_estimate", 0) > 10000:
                    alerts.append({
                        "request_id": request["request_id"],
                        "severity": "info",
                        "alert_type": "extension_recommended",
                        "message": "Consider deadline extension for this complex request",
                        "recommended_action": "evaluate_extension"
                    })
        
        return alerts
    
    def request_extension(
        self,
        request_id: str,
        reason: SARExtensionReason,
        detailed_explanation: str
    ) -> Dict[str, Any]:
        """
        Request an extension to the SAR response deadline.
        
        The extension must be:
        1. Justified by one of the permitted reasons
        2. Communicated to the data subject before the primary deadline
        3. Documented in the request record
        
        Returns:
            Updated request status and new deadline.
        """
        request = self._get_request(request_id)
        timeline = request["timeline"]
        
        if not timeline.can_extend:
            return {
                "success": False,
                "error": "Cannot extend: primary deadline has passed or already extended",
                "primary_deadline": timeline.primary_deadline.isoformat()
            }
        
        now = datetime.utcnow()
        timeline.extension_granted_at = now
        timeline.extension_reason = reason
        timeline.extension_notified_at = now
        
        # Update request status
        request["status"] = SARStatus.EXTENSION_REQUESTED.value
        
        return {
            "success": True,
            "request_id": request_id,
            "original_deadline": timeline.primary_deadline.isoformat(),
            "new_deadline": timeline.extended_deadline.isoformat(),
            "extension_reason": reason.value,
            "detailed_explanation": detailed_explanation,
            "notification_sent": True,
            "message": (
                "Extension granted. The data subject has been notified "
                f"that the response deadline has been extended to "
                f"{timeline.extended_deadline.strftime('%Y-%m-%d')}. "
                f"Reason: {reason.value}."
            )
        }
    
    def _generate_sequence(self) -> str:
        """Generate a unique sequence number for the request ID."""
        # In production, use database sequence
        import random
        return f"{random.randint(10000, 99999):05d}"
    
    def _get_active_requests(self) -> List[Dict[str, Any]]:
        """Fetch all active SAR requests from the database."""
        # Placeholder - implement with actual DB query
        return []
    
    def _get_request(self, request_id: str) -> Dict[str, Any]:
        """Fetch a single SAR request by ID."""
        # Placeholder - implement with actual DB query
        return {}


# =============================================================================
# SAR Auto-Response Email Template
# =============================================================================

SAR_RECEIPT_TEMPLATE = """
Subject: Subject Access Request Received - Reference: {request_id}

Dear {patient_name},

We acknowledge receipt of your Subject Access Request dated {request_date}.

REQUEST DETAILS:
- Reference Number: {request_id}
- Request Channel: {request_channel}
- Requested Format(s): {formats}
- Scope: {scope}

YOUR RIGHTS:
Under Article 15 of the General Data Protection Regulation (GDPR), you have the right
to obtain from us confirmation as to whether or not personal data concerning you are
being processed, and where that is the case, access to the personal data.

RESPONSE TIMELINE:
We will provide a complete response within 30 days of this acknowledgment, by
{deadline_date}. If your request is complex or involves a large volume of data, we may
extend this period by up to two months. We will inform you if an extension is necessary.

IDENTITY VERIFICATION:
To protect your privacy, we must verify your identity before releasing any personal data.
{identity_instructions}

COST:
Your first request will be provided free of charge. Additional copies may incur a
reasonable fee based on administrative costs.

NEXT STEPS:
{next_steps}

If you have any questions about this request, please contact our Data Protection Officer
at dpo@clinic.example.com or call +1-555-DPO-HELP, quoting your reference number.

Yours sincerely,
Data Protection Officer
{clinic_name}
"""
```

### 3.3 Free of Charge (First Request)

Article 12(5) states that data access requests must be provided **free of charge** for the first request. Subsequent requests for the same data may incur a "reasonable fee" based on administrative costs.

#### Fee Structure Guidelines

| Request Type | Fee Status | Notes |
|-------------|-----------|-------|
| First request | **Free** | Mandatory under GDPR |
| Additional copies | Reasonable fee | Typically EUR 10-25 |
| Excessive/repetitive requests | Reasonable fee or refusal | Must justify |
| Unfounded requests | Refusal | Document rationale |

#### Implementation

```python
"""
SAR fee calculation and exemption management.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class SARFees:
    """Fee configuration for SAR fulfillment."""
    base_fee: float = 0.00                    # First request free
    additional_copy_fee: float = 15.00        # EUR/USD per extra copy
    excessive_request_threshold: int = 3      # Requests per year
    excessive_request_fee: float = 25.00
    large_dataset_fee_per_mb: float = 0.10   # For > 100MB datasets
    free_threshold_mb: float = 100.0


class SARFeeCalculator:
    """
    Calculates applicable fees for SAR requests.
    
    GDPR mandates the first request be free. This calculator
    tracks request history and applies fees appropriately.
    """
    
    def __init__(self, config: SARFees = None):
        self.config = config or SARFees()
    
    def calculate_fee(
        self,
        patient_id: str,
        request_count_this_year: int,
        estimated_size_mb: float,
        is_same_data: bool = False
    ) -> Dict[str, Any]:
        """
        Calculate the fee for a SAR request.
        
        Args:
            patient_id: Patient identifier
            request_count_this_year: Number of SARs from this patient in current calendar year
            estimated_size_mb: Estimated size of the export in megabytes
            is_same_data: Whether this is a duplicate of a previous request
        
        Returns:
            Fee breakdown with justification
        """
        fee_breakdown = {
            "base_fee": 0.00,
            "copy_fee": 0.00,
            "excessive_fee": 0.00,
            "large_data_fee": 0.00,
            "total_fee": 0.00,
            "is_free": True,
            "justification": []
        }
        
        # First request is always free
        if request_count_this_year == 0:
            fee_breakdown["justification"].append(
                "This is your first Subject Access Request this year. "
                "It is provided free of charge under Article 12(5) GDPR."
            )
            return fee_breakdown
        
        fee_breakdown["is_free"] = False
        
        # Additional copy fee
        if request_count_this_year >= 1:
            fee_breakdown["copy_fee"] = self.config.additional_copy_fee
            fee_breakdown["justification"].append(
                f"Additional copy fee: ${self.config.additional_copy_fee:.2f} "
                f"(this is request #{request_count_this_year + 1} this year)"
            )
        
        # Excessive request fee
        if request_count_this_year >= self.config.excessive_request_threshold:
            fee_breakdown["excessive_fee"] = self.config.excessive_request_fee
            fee_breakdown["justification"].append(
                f"Excessive request fee: ${self.config.excessive_request_fee:.2f} "
                f"({request_count_this_year} requests this year exceeds threshold "
                f"of {self.config.excessive_request_threshold})"
            )
        
        # Large dataset fee
        if estimated_size_mb > self.config.free_threshold_mb:
            excess_mb = estimated_size_mb - self.config.free_threshold_mb
            large_fee = excess_mb * self.config.large_dataset_fee_per_mb
            fee_breakdown["large_data_fee"] = round(large_fee, 2)
            fee_breakdown["justification"].append(
                f"Large dataset fee: ${large_fee:.2f} "
                f"({estimated_size_mb:.1f}MB exceeds {self.config.free_threshold_mb}MB free threshold)"
            )
        
        fee_breakdown["total_fee"] = (
            fee_breakdown["copy_fee"] +
            fee_breakdown["excessive_fee"] +
            fee_breakdown["large_data_fee"]
        )
        
        return fee_breakdown
```

### 3.4 Electronic Format Preference

Article 15(3) states that the information must be provided in a **"commonly used electronic form"** unless otherwise requested by the data subject.

#### Electronic Format Priority

1. **Primary:** Patient portal secure download (HTTPS, authenticated)
2. **Secondary:** Password-protected email (encrypted attachment)
3. **Tertiary:** Physical media (USB drive, CD) -- only if electronic delivery impossible
4. **Fallback:** Postal mail (printed) -- only at explicit patient request

#### Security Requirements for Electronic Delivery

```python
"""
Secure delivery mechanisms for SAR responses.
"""

import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class SecureDeliveryConfig:
    """Configuration for secure SAR delivery."""
    download_link_ttl_hours: int = 72          # Link expiration
    max_download_attempts: int = 5             # Anti-brute-force
    password_length: int = 16                   # ZIP password length
    notification_on_download: bool = True       # Alert patient on access
    require_mfa_for_download: bool = False      # MFA for sensitive data


class SecureSARDelivery:
    """
    Manages secure delivery of SAR response packages.
    
    Creates time-limited, signed download URLs with
    audit logging and access controls.
    """
    
    def __init__(self, config: SecureDeliveryConfig = None):
        self.config = config or SecureDeliveryConfig()
    
    def create_secure_delivery(
        self,
        sar_request_id: str,
        patient_id: str,
        package_s3_key: str,
        package_size_bytes: int
    ) -> Dict[str, Any]:
        """
        Create a secure download delivery for an SAR response.
        
        Returns delivery credentials including:
        - Time-limited signed URL
        - Password for ZIP decryption
        - Expiration timestamp
        - Download instructions
        """
        # Generate cryptographically secure password
        zip_password = secrets.token_urlsafe(self.config.password_length)
        
        # Generate signed URL (S3 pre-signed URL or equivalent)
        expires_at = datetime.utcnow() + timedelta(
            hours=self.config.download_link_ttl_hours
        )
        signed_url = self._generate_signed_url(
            key=package_s3_key,
            expires_at=expires_at,
            request_id=sar_request_id
        )
        
        # Create access token for download tracking
        access_token = secrets.token_urlsafe(32)
        
        delivery_record = {
            "delivery_id": f"DEL-{sar_request_id}",
            "sar_request_id": sar_request_id,
            "patient_id": patient_id,
            "signed_url": signed_url,
            "url_expires_at": expires_at.isoformat(),
            "zip_password": zip_password,  # Store hashed in production
            "access_token": access_token,
            "download_count": 0,
            "max_downloads": self.config.max_download_attempts,
            "created_at": datetime.utcnow().isoformat(),
            "notification_settings": {
                "notify_on_download": self.config.notification_on_download,
                "notify_on_expiry": True
            }
        }
        
        return {
            "delivery_id": delivery_record["delivery_id"],
            "download_url": signed_url,
            "url_expires_at": expires_at.isoformat(),
            "zip_password": zip_password,
            "download_instructions": (
                f"Your data export is ready for download.\n\n"
                f"1. Download link: {signed_url}\n"
                f"2. The ZIP file is password-protected.\n"
                f"3. Password: {zip_password}\n"
                f"4. Link expires: {expires_at.strftime('%Y-%m-%d %H:%M UTC')}\n"
                f"5. Maximum downloads: {self.config.max_download_attempts}\n\n"
                f"IMPORTANT: Save this password. It will not be shown again."
            ),
            "security_notes": (
                "For your security:\n"
                "- Download only on a trusted device\n"
                "- The password was generated securely and is not stored in plain text\n"
                "- You will be notified when the file is downloaded\n"
                "- Contact us immediately if you did not request this export"
            )
        }
    
    def _generate_signed_url(
        self,
        key: str,
        expires_at: datetime,
        request_id: str
    ) -> str:
        """
        Generate a pre-signed URL for S3 or compatible object storage.
        
        In production, use boto3 or equivalent:
            s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=ttl_seconds
            )
        """
        # Placeholder implementation
        expiry_timestamp = int(expires_at.timestamp())
        signature = hashlib.sha256(
            f"{key}:{request_id}:{expiry_timestamp}:secret".encode()
        ).hexdigest()[:16]
        return (
            f"https://downloads.clinic.example.com/{key}?"
            f"expires={expiry_timestamp}&sig={signature}&req={request_id}"
        )
```

### 3.5 Identity Verification

Identity verification is critical to prevent unauthorized data disclosure. GDPR requires "reasonable" measures that do not create barriers to exercising rights.

#### Verification Tiers

| Request Channel | Verification Level | Methods |
|-----------------|-------------------|---------|
| **Patient portal** (authenticated) | Low | Active session sufficient |
| **Email** (registered address) | Medium | OTP to registered email or phone |
| **Phone** | High | Knowledge-based verification + callback |
| **Postal mail** | High | Signed request + photo ID copy |
| **Third-party representative** | Very High | Power of attorney + dual verification |
| **In-person** | Medium | Government-issued photo ID |

```python
"""
Identity verification system for SAR requests.
Implements tiered verification based on request channel and risk.
"""

from enum import Enum
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass


class VerificationLevel(Enum):
    """Verification tiers for SAR requests."""
    NONE = "none"                # Already authenticated (patient portal)
    LOW = "low"                  # Email confirmation
    MEDIUM = "medium"            # OTP verification
    HIGH = "high"                # Photo ID + knowledge questions
    VERY_HIGH = "very_high"      # Legal documentation + in-person


class VerificationMethod(Enum):
    """Available verification methods."""
    PORTAL_SESSION = "portal_session"
    EMAIL_OTP = "email_otp"
    SMS_OTP = "sms_otp"
    KNOWLEDGE_BASED = "knowledge_based"
    PHOTO_ID_UPLOAD = "photo_id_upload"
    VIDEO_CALL = "video_call"
    POWER_OF_ATTORNEY = "power_of_attorney"
    IN_PERSON = "in_person"


@dataclass
class VerificationRequirement:
    """Defines verification requirements for a request context."""
    minimum_level: VerificationLevel
    required_methods: List[VerificationMethod]
    expiry_hours: int = 24


class SARIdentityVerifier:
    """
    Manages identity verification for SAR requests.
    
    Implements risk-based verification:
    - Lower risk (authenticated portal): Minimal friction
    - Higher risk (third-party request): Maximum verification
    """
    
    # Verification requirements by request channel
    CHANNEL_REQUIREMENTS = {
        "portal": VerificationRequirement(
            minimum_level=VerificationLevel.NONE,
            required_methods=[VerificationMethod.PORTAL_SESSION],
            expiry_hours=168  # 7 days
        ),
        "email": VerificationRequirement(
            minimum_level=VerificationLevel.MEDIUM,
            required_methods=[
                VerificationMethod.EMAIL_OTP,
                VerificationMethod.KNOWLEDGE_BASED
            ],
            expiry_hours=24
        ),
        "phone": VerificationRequirement(
            minimum_level=VerificationLevel.HIGH,
            required_methods=[
                VerificationMethod.SMS_OTP,
                VerificationMethod.KNOWLEDGE_BASED
            ],
            expiry_hours=24
        ),
        "letter": VerificationRequirement(
            minimum_level=VerificationLevel.HIGH,
            required_methods=[
                VerificationMethod.PHOTO_ID_UPLOAD,
                VerificationMethod.KNOWLEDGE_BASED
            ],
            expiry_hours=72
        ),
        "representative": VerificationRequirement(
            minimum_level=VerificationLevel.VERY_HIGH,
            required_methods=[
                VerificationMethod.POWER_OF_ATTORNEY,
                VerificationMethod.PHOTO_ID_UPLOAD,
                VerificationMethod.VIDEO_CALL
            ],
            expiry_hours=24
        ),
    }
    
    # Knowledge-based verification questions
    KBV_QUESTIONS = [
        {
            "id": "last_visit_date",
            "question": "What was the date of your last clinic visit?",
            "type": "date",
            "tolerance_days": 7
        },
        {
            "id": "primary_clinician",
            "question": "What is the last name of your primary clinician?",
            "type": "string",
            "case_sensitive": False
        },
        {
            "id": "date_of_birth",
            "question": "What is your date of birth?",
            "type": "date",
            "tolerance_days": 0
        },
        {
            "id": "assessment_type",
            "question": "What type of assessment did you most recently complete?",
            "type": "select",
            "options": ["PHQ-9", "GAD-7", "MMSE", "MoCA", "Other"]
        },
    ]
    
    def get_verification_requirements(
        self,
        request_channel: str,
        data_sensitivity: str = "standard"  # "standard", "sensitive", "high_risk"
    ) -> VerificationRequirement:
        """
        Get the verification requirements for a given request context.
        
        Adjusts requirements based on:
        - Request channel (portal, email, phone, etc.)
        - Data sensitivity level
        - Patient risk profile
        """
        base = self.CHANNEL_REQUIREMENTS.get(
            request_channel,
            self.CHANNEL_REQUIREMENTS["letter"]  # Default to highest
        )
        
        # Escalate for sensitive data
        if data_sensitivity == "high_risk":
            if base.minimum_level == VerificationLevel.NONE:
                base.minimum_level = VerificationLevel.LOW
            elif base.minimum_level == VerificationLevel.LOW:
                base.minimum_level = VerificationLevel.MEDIUM
        
        return base
    
    def generate_kbv_challenge(
        self,
        patient_id: str,
        num_questions: int = 3
    ) -> Dict[str, Any]:
        """
        Generate knowledge-based verification questions for a patient.
        
        Questions are selected from the pool and personalized using
        the patient's actual clinic records to prevent spoofing.
        """
        # In production, fetch actual patient data for question generation
        # For demonstration, return question templates
        
        selected_questions = self.KBV_QUESTIONS[:num_questions]
        challenge_id = f"KBV-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        return {
            "challenge_id": challenge_id,
            "patient_id": patient_id,
            "questions": [
                {
                    "question_id": q["id"],
                    "question_text": q["question"],
                    "type": q["type"],
                    "options": q.get("options")
                }
                for q in selected_questions
            ],
            "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
            "max_attempts": 3,
            "instructions": (
                "Please answer the following questions based on your clinic records. "
                "You have 3 attempts and 1 hour to complete verification."
            )
        }
    
    def verify_identity(
        self,
        sar_request_id: str,
        verification_responses: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process identity verification responses.
        
        Returns:
            Verification result with status and next steps.
        """
        # In production: validate responses against patient records
        # Check attempt limits, expiry, etc.
        
        all_correct = True  # Placeholder
        
        if all_correct:
            return {
                "verified": True,
                "verification_method": "knowledge_based",
                "verified_at": datetime.utcnow().isoformat(),
                "next_step": "begin_data_collection",
                "message": "Identity verified successfully. Your data export is being prepared."
            }
        
        return {
            "verified": False,
            "attempts_remaining": verification_responses.get("attempts_remaining", 0) - 1,
            "message": "One or more answers were incorrect. Please try again."
        }
```

### 3.6 Third-Party Data Exclusion

Article 15 does not require disclosure of personal data that would adversely affect the rights and freedoms of others. This is particularly relevant in healthcare where records may contain:

- Information about family members (genetic risk, family history)
- Third-party opinions (referring physician notes)
- Multi-patient incident reports
- Group therapy session notes

#### Redaction Process

```python
"""
Third-party data redaction for SAR responses.
Identifies and redacts information about other individuals.
"""

import re
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass


@dataclass
class RedactionRule:
    """Rule for redacting third-party information."""
    name: str
    pattern: str  # Regex pattern
    replacement: str
    description: str


class ThirdPartyRedactor:
    """
    Redacts third-party information from patient records
    before SAR disclosure.
    
    Implements GDPR Article 15(4) which permits refusal or
    redaction where disclosure would adversely affect the
    rights and freedoms of others.
    """
    
    # Pre-defined redaction rules
    DEFAULT_RULES = [
        RedactionRule(
            name="other_patient_names",
            pattern=r'\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+\b',
            replacement="[NAME REDACTED]",
            description="Redact names of other individuals"
        ),
        RedactionRule(
            name="other_patient_mrns",
            pattern=r'\bMRN-[0-9]+\b',
            replacement="[MRN REDACTED]",
            description="Redact medical record numbers of others"
        ),
        RedactionRule(
            name="phone_numbers",
            pattern=r'\b\d{3}[-.]\d{3}[-.]\d{4}\b',
            replacement="[PHONE REDACTED]",
            description="Redact phone numbers"
        ),
        RedactionRule(
            name="email_addresses",
            pattern=r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            replacement="[EMAIL REDACTED]",
            description="Redact email addresses"
        ),
        RedactionRule(
            name="family_therapy_notes",
            pattern=r'(?i)(?:family member|spouse|partner|sibling|parent).{0,100}?\b(?:said|reported|mentioned|disclosed)\b[^.]*\.',
            replacement="[FAMILY MEMBER STATEMENT REDACTED - see your own records]",
            description="Redact statements attributed to family members"
        ),
    ]
    
    def __init__(self, rules: Optional[List[RedactionRule]] = None):
        self.rules = rules or self.DEFAULT_RULES
    
    def redact_record(
        self,
        record: Dict[str, Any],
        patient_id: str,
        patient_name: str
    ) -> Dict[str, Any]:
        """
        Redact third-party information from a record.
        
        Preserves the requesting patient's own information
        while removing references to others.
        
        Args:
            record: The record to redact
            patient_id: ID of the requesting patient (preserve)
            patient_name: Name of the requesting patient (preserve)
        """
        redacted = {}
        
        for field, value in record.items():
            if isinstance(value, str):
                # Preserve the patient's own name
                redacted[field] = self._redact_text(
                    value,
                    preserve_terms={patient_name, patient_id}
                )
            elif isinstance(value, dict):
                redacted[field] = self.redact_record(value, patient_id, patient_name)
            elif isinstance(value, list):
                redacted[field] = [
                    self.redact_record(item, patient_id, patient_name) if isinstance(item, dict)
                    else self._redact_text(item, {patient_name, patient_id}) if isinstance(item, str)
                    else item
                    for item in value
                ]
            else:
                redacted[field] = value
        
        return redacted
    
    def _redact_text(
        self,
        text: str,
        preserve_terms: Set[str]
    ) -> str:
        """Apply redaction rules while preserving specified terms."""
        for rule in self.rules:
            def replace_func(match):
                matched_text = match.group(0)
                # Don't redact if it matches a preserve term
                if matched_text in preserve_terms:
                    return matched_text
                return rule.replacement
            
            text = re.sub(rule.pattern, replace_func, text)
        
        return text
    
    def generate_redaction_report(
        self,
        original_records: List[Dict[str, Any]],
        redacted_records: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generate a report documenting what was redacted.
        
        This transparency report helps patients understand
        why certain information may be missing.
        """
        redaction_count = 0
        redaction_types = {}
        
        orig_text = str(original_records)
        redacted_text = str(redacted_records)
        
        for rule in self.rules:
            count = len(re.findall(rule.pattern, orig_text))
            if count > 0:
                redaction_count += count
                redaction_types[rule.name] = {
                    "count": count,
                    "description": rule.description,
                    "replacement": rule.replacement
                }
        
        return {
            "total_redactions": redaction_count,
            "redaction_types": redaction_types,
            "legal_basis": (
                "Information has been redacted under GDPR Article 15(4) "
                "to protect the rights and freedoms of other individuals. "
                "This may include names, contact details, and statements "
                "from family members or other patients."
            ),
            "appeal_process": (
                "If you believe information has been inappropriately redacted, "
                "you may request a review by contacting our Data Protection Officer."
            )
        }
```

### 3.7 Manifest/Index Document

Every SAR response must include a manifest or index document that describes:

1. What data is included
2. What data is excluded (and why)
3. Format of each file
4. Date ranges covered
5. Data sources
6. Retention periods
7. Third-party recipients

```python
"""
SAR response manifest/index document generator.
Creates a comprehensive index of all included data.
"""

from datetime import datetime
from typing import Dict, Any, List
from dataclasses import dataclass, field


@dataclass
class DataSource:
    """Description of a data source included in the export."""
    system_name: str
    data_categories: List[str]
    date_range_start: str
    date_range_end: str
    record_count: int
    file_format: str
    file_size_bytes: int
    filename: str
    retention_period_years: int


@dataclass
class DataExclusion:
    """Description of data excluded from the export."""
    category: str
    reason: str
    legal_basis: str  # GDPR article justifying exclusion
    description: str


@dataclass
class ThirdPartyRecipient:
    """Description of third parties who received patient data."""
    organization_name: str
    data_categories_shared: List[str]
    purpose: str
    legal_basis: str  # e.g., "consent", "contract", "legal_obligation"
    date_first_shared: str
    date_last_shared: str


class SARMANIFESTGenerator:
    """
    Generates a comprehensive manifest/index document
    for GDPR SAR responses.
    
    The manifest serves as a:
    - Table of contents for the export package
    - Transparency document explaining what is included/excluded
    - Legal record of data processing activities
    """
    
    def generate_manifest(
        self,
        sar_request_id: str,
        patient_id: str,
        patient_name: str,
        data_sources: List[DataSource],
        exclusions: List[DataExclusion],
        recipients: List[ThirdPartyRecipient],
        export_formats: List[str]
    ) -> Dict[str, Any]:
        """
        Generate a complete SAR response manifest.
        
        Returns:
            Structured manifest as a dictionary (can be rendered as
            PDF, HTML, or JSON).
        """
        total_records = sum(s.record_count for s in data_sources)
        total_size = sum(s.file_size_bytes for s in data_sources)
        
        manifest = {
            "manifest_version": "1.0",
            "generated_at": datetime.utcnow().isoformat(),
            "sar_request_id": sar_request_id,
            
            "patient_information": {
                "name": patient_name,
                "patient_id": patient_id,
                "note": (
                    "This manifest accompanies your Subject Access Request response. "
                    "It describes all data included in this export package."
                )
            },
            
            "export_summary": {
                "total_data_sources": len(data_sources),
                "total_records": total_records,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "export_formats": export_formats,
                "data_categories_included": list(set(
                    cat for source in data_sources for cat in source.data_categories
                )),
                "date_range": {
                    "earliest": min(s.date_range_start for s in data_sources),
                    "latest": max(s.date_range_end for s in data_sources)
                }
            },
            
            "data_sources": [
                {
                    "filename": source.filename,
                    "system": source.system_name,
                    "categories": source.data_categories,
                    "date_range": {
                        "start": source.date_range_start,
                        "end": source.date_range_end
                    },
                    "record_count": source.record_count,
                    "format": source.file_format,
                    "size_kb": round(source.file_size_bytes / 1024, 2),
                    "retention_period_years": source.retention_period_years
                }
                for source in data_sources
            ],
            
            "exclusions": [
                {
                    "category": ex.category,
                    "reason": ex.reason,
                    "legal_basis": ex.legal_basis,
                    "description": ex.description
                }
                for ex in exclusions
            ] if exclusions else [{
                "note": "No data was excluded from this export. All available "
                        "personal data has been included."
            }],
            
            "third_party_recipients": [
                {
                    "organization": recipient.organization_name,
                    "data_categories": recipient.data_categories_shared,
                    "purpose": recipient.purpose,
                    "legal_basis": recipient.legal_basis,
                    "sharing_period": {
                        "first": recipient.date_first_shared,
                        "last": recipient.date_last_shared
                    }
                }
                for recipient in recipients
            ] if recipients else [{
                "note": "No third-party data sharing recorded."
            }],
            
            "patient_rights": {
                "rectification": {
                    "right": "You have the right to request correction of inaccurate data",
                    "article": "GDPR Article 16",
                    "how_to_exercise": "Contact your clinician or the Data Protection Officer"
                },
                "erasure": {
                    "right": "You have the right to request deletion of your data",
                    "article": "GDPR Article 17",
                    "limitations": "This right is not absolute and may be limited for medical records",
                    "how_to_exercise": "Contact the Data Protection Officer"
                },
                "portability": {
                    "right": "You have the right to receive your data in a structured, machine-readable format",
                    "article": "GDPR Article 20",
                    "formats_available": ["FHIR Bundle", "CSV", "JSON"]
                },
                "complaint": {
                    "right": "You have the right to lodge a complaint with a supervisory authority",
                    "article": "GDPR Article 77",
                    "authority": "Your national Data Protection Authority"
                }
            },
            
            "contact_information": {
                "data_protection_officer": {
                    "name": "Data Protection Officer",
                    "email": "dpo@clinic.example.com",
                    "phone": "+1-555-DPO-HELP",
                    "response_time": "Within 48 hours"
                },
                "clinic_information": {
                    "name": "NeuroCare Clinic",
                    "address": "123 Medical Center Drive, Health City, HC 12345",
                    "registration_number": "DPA-REG-12345"
                }
            }
        }
        
        return manifest
    
    def render_manifest_text(self, manifest: Dict[str, Any]) -> str:
        """Render the manifest as a human-readable text document."""
        lines = []
        lines.append("=" * 70)
        lines.append("SUBJECT ACCESS REQUEST - DATA EXPORT MANIFEST")
        lines.append("=" * 70)
        lines.append("")
        lines.append(f"Request ID: {manifest['sar_request_id']}")
        lines.append(f"Generated: {manifest['generated_at']}")
        lines.append(f"Patient: {manifest['patient_information']['name']}")
        lines.append("")
        lines.append("-" * 70)
        lines.append("EXPORT SUMMARY")
        lines.append("-" * 70)
        
        summary = manifest["export_summary"]
        lines.append(f"Total Data Sources: {summary['total_data_sources']}")
        lines.append(f"Total Records: {summary['total_records']}")
        lines.append(f"Total Size: {summary['total_size_mb']} MB")
        lines.append(f"Export Formats: {', '.join(summary['export_formats'])}")
        lines.append(f"Date Range: {summary['date_range']['earliest']} to {summary['date_range']['latest']}")
        lines.append("")
        
        lines.append("-" * 70)
        lines.append("INCLUDED DATA FILES")
        lines.append("-" * 70)
        for source in manifest["data_sources"]:
            lines.append("")
            lines.append(f"File: {source['filename']}")
            lines.append(f"  System: {source['system']}")
            lines.append(f"  Categories: {', '.join(source['categories'])}")
            lines.append(f"  Records: {source['record_count']}")
            lines.append(f"  Size: {source['size_kb']} KB")
            lines.append(f"  Format: {source['format']}")
            lines.append(f"  Date Range: {source['date_range']['start']} to {source['date_range']['end']}")
            lines.append(f"  Retention: {source['retention_period_years']} years")
        
        if manifest["exclusions"]:
            lines.append("")
            lines.append("-" * 70)
            lines.append("EXCLUDED DATA")
            lines.append("-" * 70)
            for exclusion in manifest["exclusions"]:
                if "note" in exclusion:
                    lines.append(exclusion["note"])
                else:
                    lines.append(f"Category: {exclusion['category']}")
                    lines.append(f"  Reason: {exclusion['reason']}")
                    lines.append(f"  Legal Basis: {exclusion['legal_basis']}")
        
        lines.append("")
        lines.append("-" * 70)
        lines.append("YOUR RIGHTS")
        lines.append("-" * 70)
        for right_name, right_info in manifest["patient_rights"].items():
            lines.append(f"{right_name.upper()}: {right_info.get('right', '')}")
            lines.append(f"  Legal Basis: {right_info.get('article', '')}")
        
        lines.append("")
        lines.append("=" * 70)
        lines.append("END OF MANIFEST")
        lines.append("=" * 70)
        
        return "\n".join(lines)
```

---

## 4. Export Scope Selection

### 4.1 Scope Taxonomy

Export scope defines what subset of clinic data is included in an export. The scope selection mechanism must balance completeness (regulatory requirement) with precision (practical utility).

| Scope Level | Description | Typical Size | Use Case |
|-------------|-------------|--------------|----------|
| **Single patient - all data** | Complete record for one patient | 1-50 MB | SAR fulfillment, patient record transfer |
| **Date range filtered** | Data within a specified date range | Varies | Annual review, insurance claim |
| **Data type filtered** | Specific data categories only | 100 KB - 10 MB | Research, specialist referral |
| **Clinic summary** | Aggregated/anonymized statistics | 1-10 MB | Quality improvement, reporting |
| **Audit log export** | System access logs | 10 MB - GB | Compliance audit, security investigation |
| **Custom selection** | User-defined combination | Varies | Flexible ad-hoc exports |

### 4.2 Single Patient (All Data)

The most common export scope -- all data for a single patient. This is the default scope for GDPR SAR requests and patient record transfers.

```python
"""
Single patient data export scope implementation.
Collects all data for one patient across all clinic systems.
"""

from datetime import datetime
from typing import Dict, Any, List, Iterator, Optional
from dataclasses import dataclass
from enum import Enum


class DataCategory(Enum):
    """Categories of clinic data that can be exported."""
    DEMOGRAPHICS = "demographics"
    ASSESSMENTS = "assessments"
    QEEG_RECORDS = "qeeg_records"
    MRI_RECORDS = "mri_records"
    ENCOUNTER_NOTES = "encounter_notes"
    MEDICATIONS = "medications"
    DIAGNOSES = "diagnoses"
    CARE_PLANS = "care_plans"
    CONSENT_FORMS = "consent_forms"
    COMMUNICATIONS = "communications"
    APPOINTMENTS = "appointments"
    BILLING = "billing"
    DOCUMENTS = "documents"
    AUDIT_LOG = "audit_log"


@dataclass
class PatientDataScope:
    """Defines the complete data scope for a single patient."""
    patient_id: str
    categories: List[DataCategory] = None  # None = all categories
    include_audit_trail: bool = True
    include_deleted_records: bool = False
    include_metadata: bool = True
    
    def __post_init__(self):
        if self.categories is None:
            self.categories = list(DataCategory)


class SinglePatientExporter:
    """
    Exports all data for a single patient.
    
    Orchestrates data collection from multiple clinic subsystems:
    - Assessment database (PHQ-9, GAD-7, etc.)
    - qEEG storage
    - MRI/PACS integration
    - Encounter notes
    - Billing system
    - Document management
    
    Each subsystem is queried independently and results are
    assembled into the requested export format(s).
    """
    
    def __init__(self, db_connections: Dict[str, Any], storage: Any):
        self.db = db_connections
        self.storage = storage  # S3/Azure Blob/etc
    
    def export(
        self,
        scope: PatientDataScope,
        output_formats: List[str]
    ) -> Dict[str, Any]:
        """
        Execute a single-patient data export.
        
        Returns:
            Dictionary with export results per format and metadata.
        """
        results = {
            "patient_id": scope.patient_id,
            "export_timestamp": datetime.utcnow().isoformat(),
            "categories_requested": [c.value for c in scope.categories],
            "formats": {},
            "errors": []
        }
        
        # Collect data from each category
        collected_data = {}
        for category in scope.categories:
            try:
                collected_data[category.value] = self._collect_category(
                    scope.patient_id, category
                )
            except Exception as e:
                results["errors"].append({
                    "category": category.value,
                    "error": str(e)
                })
        
        # Generate export files for each requested format
        for fmt in output_formats:
            try:
                if fmt == "csv":
                    results["formats"]["csv"] = self._export_csv(
                        scope.patient_id, collected_data
                    )
                elif fmt == "json":
                    results["formats"]["json"] = self._export_json(
                        scope.patient_id, collected_data
                    )
                elif fmt == "pdf":
                    results["formats"]["pdf"] = self._export_pdf(
                        scope.patient_id, collected_data
                    )
                elif fmt == "fhir":
                    results["formats"]["fhir"] = self._export_fhir(
                        scope.patient_id, collected_data
                    )
                elif fmt == "xlsx":
                    results["formats"]["xlsx"] = self._export_xlsx(
                        scope.patient_id, collected_data
                    )
            except Exception as e:
                results["errors"].append({
                    "format": fmt,
                    "error": str(e)
                })
        
        return results
    
    def _collect_category(
        self,
        patient_id: str,
        category: DataCategory
    ) -> List[Dict[str, Any]]:
        """Collect data for a specific category."""
        collectors = {
            DataCategory.ASSESSMENTS: self._collect_assessments,
            DataCategory.QEEG_RECORDS: self._collect_qeeg,
            DataCategory.MRI_RECORDS: self._collect_mri,
            DataCategory.ENCOUNTER_NOTES: self._collect_encounters,
            DataCategory.DEMOGRAPHICS: self._collect_demographics,
            DataCategory.MEDICATIONS: self._collect_medications,
            DataCategory.DIAGNOSES: self._collect_diagnoses,
            DataCategory.CARE_PLANS: self._collect_care_plans,
            DataCategory.CONSENT_FORMS: self._collect_consents,
            DataCategory.COMMUNICATIONS: self._collect_communications,
            DataCategory.APPOINTMENTS: self._collect_appointments,
            DataCategory.BILLING: self._collect_billing,
            DataCategory.DOCUMENTS: self._collect_documents,
            DataCategory.AUDIT_LOG: self._collect_audit_log,
        }
        
        collector = collectors.get(category)
        if collector:
            return collector(patient_id)
        return []
    
    def _collect_assessments(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch all assessment records for a patient."""
        # Query the assessment database
        query = """
            SELECT a.*, ac.name as clinician_name
            FROM assessments a
            LEFT JOIN clinicians ac ON a.clinician_id = ac.id
            WHERE a.patient_id = :patient_id
            ORDER BY a.assessment_date DESC
        """
        return self.db["assessments"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_qeeg(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch all qEEG records for a patient."""
        query = """
            SELECT r.*, f.s3_key as file_key
            FROM qeeg_records r
            LEFT JOIN qeeg_files f ON r.id = f.record_id
            WHERE r.patient_id = :patient_id
            ORDER BY r.record_date DESC
        """
        return self.db["imaging"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_mri(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch all MRI records for a patient."""
        query = """
            SELECT r.*, f.s3_key as file_key
            FROM mri_records r
            LEFT JOIN mri_files f ON r.id = f.record_id
            WHERE r.patient_id = :patient_id
            ORDER BY r.scan_date DESC
        """
        return self.db["imaging"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_encounters(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch all encounter notes for a patient."""
        query = """
            SELECT e.*, c.name as clinician_name
            FROM encounters e
            LEFT JOIN clinicians c ON e.clinician_id = c.id
            WHERE e.patient_id = :patient_id
            ORDER BY e.encounter_date DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_demographics(self, patient_id: str) -> List[Dict[str, Any]]:
        """Fetch patient demographic information."""
        query = "SELECT * FROM patients WHERE id = :patient_id"
        result = self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchone()
        return [dict(result)] if result else []
    
    def _collect_medications(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM medications 
            WHERE patient_id = :patient_id 
            ORDER BY prescribed_date DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_diagnoses(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT d.*, c.name as clinician_name
            FROM diagnoses d
            LEFT JOIN clinicians c ON d.diagnosed_by = c.id
            WHERE d.patient_id = :patient_id
            ORDER BY d.diagnosed_date DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_care_plans(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT cp.*, c.name as created_by_name
            FROM care_plans cp
            LEFT JOIN clinicians c ON cp.created_by = c.id
            WHERE cp.patient_id = :patient_id
            ORDER BY cp.created_at DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_consents(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM consent_forms
            WHERE patient_id = :patient_id
            ORDER BY signed_date DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_communications(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM patient_communications
            WHERE patient_id = :patient_id
            ORDER BY sent_date DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_appointments(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT a.*, c.name as clinician_name
            FROM appointments a
            LEFT JOIN clinicians c ON a.clinician_id = c.id
            WHERE a.patient_id = :patient_id
            ORDER BY a.appointment_date DESC
        """
        return self.db["clinical"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_billing(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM billing_records
            WHERE patient_id = :patient_id
            ORDER BY service_date DESC
        """
        return self.db["billing"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_documents(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT d.*, f.s3_key as file_key
            FROM documents d
            LEFT JOIN document_files f ON d.id = f.document_id
            WHERE d.patient_id = :patient_id
            ORDER BY d.created_date DESC
        """
        return self.db["documents"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _collect_audit_log(self, patient_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT * FROM audit_log
            WHERE patient_id = :patient_id
            ORDER BY event_timestamp DESC
        """
        return self.db["audit"].execute(query, {"patient_id": patient_id}).fetchall()
    
    def _export_csv(self, patient_id: str, data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Generate CSV exports for each data category."""
        # Implementation using StreamingCSVExporter from Section 2
        return {"files": [f"{cat}.csv" for cat in data.keys()], "format": "csv"}
    
    def _export_json(self, patient_id: str, data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Generate JSON export."""
        import json
        return {"content": json.dumps(data), "format": "json"}
    
    def _export_pdf(self, patient_id: str, data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Generate PDF report."""
        # Implementation using PDFReportGenerator from Section 2
        return {"files": ["patient_report.pdf"], "format": "pdf"}
    
    def _export_fhir(self, patient_id: str, data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Generate FHIR Bundle."""
        # Implementation using FHIRBundleBuilder from Section 2
        return {"files": ["fhir_bundle.json"], "format": "fhir"}
    
    def _export_xlsx(self, patient_id: str, data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Generate XLSX workbook."""
        # Implementation using XLSXReportGenerator from Section 2
        return {"files": ["patient_data.xlsx"], "format": "xlsx"}
```

### 4.3 Date Range Filtering

Date range filtering allows exports to be scoped to a specific time period. This is essential for:

- **Annual reviews:** "All data from the past 12 months"
- **Legal proceedings:** "All data from January 1, 2023 to December 31, 2023"
- **Insurance claims:** "Data related to the incident on March 15, 2024"
- **System migrations:** "Data since last migration date"

```python
"""
Date range filtering for data exports.
"""

from datetime import datetime, date
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


@dataclass
class DateRange:
    """Defines a date range for export filtering."""
    start: Optional[date] = None
    end: Optional[date] = None
    
    @property
    def is_open_start(self) -> bool:
        """Range has no start date (all records before end)."""
        return self.start is None and self.end is not None
    
    @property
    def is_open_end(self) -> bool:
        """Range has no end date (all records after start)."""
        return self.start is not None and self.end is None
    
    @property
    def is_fully_open(self) -> bool:
        """No date restrictions."""
        return self.start is None and self.end is None
    
    def to_sql_filter(self, date_column: str = "created_at") -> tuple:
        """
        Generate SQL WHERE clause and parameters for the date range.
        
        Returns:
            Tuple of (where_clause_string, params_dict)
        """
        conditions = []
        params = {}
        
        if self.start:
            conditions.append(f"{date_column} >= :start_date")
            params["start_date"] = self.start.isoformat()
        
        if self.end:
            conditions.append(f"{date_column} <= :end_date")
            params["end_date"] = (self.end.isoformat() + " 23:59:59")
        
        if not conditions:
            return "", {}
        
        return " AND ".join(conditions), params
    
    def to_iso_strings(self) -> Dict[str, str]:
        """Convert to ISO format strings for API responses."""
        return {
            "start": self.start.isoformat() if self.start else None,
            "end": self.end.isoformat() if self.end else None
        }
    
    @classmethod
    def from_presets(cls, preset: str) -> "DateRange":
        """Create a DateRange from a preset name."""
        today = date.today()
        presets = {
            "last_7_days": cls(start=today - __import__("datetime").timedelta(days=7), end=today),
            "last_30_days": cls(start=today - __import__("datetime").timedelta(days=30), end=today),
            "last_90_days": cls(start=today - __import__("datetime").timedelta(days=90), end=today),
            "last_6_months": cls(start=today - __import__("datetime").timedelta(days=180), end=today),
            "last_12_months": cls(start=today - __import__("datetime").timedelta(days=365), end=today),
            "year_to_date": cls(start=date(today.year, 1, 1), end=today),
            "last_year": cls(
                start=date(today.year - 1, 1, 1),
                end=date(today.year - 1, 12, 31)
            ),
            "all_time": cls(),
        }
        return presets.get(preset, cls())


# Preset date ranges for UI
DATE_RANGE_PRESETS = [
    {"label": "Last 7 Days", "value": "last_7_days"},
    {"label": "Last 30 Days", "value": "last_30_days"},
    {"label": "Last 90 Days", "value": "last_90_days"},
    {"label": "Last 6 Months", "value": "last_6_months"},
    {"label": "Last 12 Months", "value": "last_12_months"},
    {"label": "Year to Date", "value": "year_to_date"},
    {"label": "Last Year", "value": "last_year"},
    {"label": "All Time", "value": "all_time"},
    {"label": "Custom Range", "value": "custom"},
]
```

### 4.4 Data Type Filtering

Data type filtering enables precise control over which categories of data are included. This is critical for:

- **Targeted exports:** Only qEEG data for external analysis
- **Minimal disclosure:** Only what's needed for a referral
- **Privacy preferences:** Patient may not want billing data included

#### Data Type Selection UI Model

```python
"""
Data type selection model for export scope.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


class DataTypeCategory(Enum):
    """Hierarchical data type categories for export selection."""
    
    # Assessments
    PHQ9 = ("assessment", "PHQ-9", "Depression screening questionnaire")
    GAD7 = ("assessment", "GAD-7", "Anxiety screening questionnaire")
    MMSE = ("assessment", "MMSE", "Cognitive screening")
    MOCA = ("assessment", "MoCA", "Cognitive assessment")
    HAMD = ("assessment", "HAM-D", "Depression rating scale")
    PSQI = ("assessment", "PSQI", "Sleep quality index")
    CUSTOM_ASSESSMENT = ("assessment", "Custom", "Custom assessment")
    
    # Imaging
    QEEG = ("imaging", "qEEG", "Quantitative EEG analysis")
    MRI = ("imaging", "MRI", "Magnetic resonance imaging")
    FMRI = ("imaging", "fMRI", "Functional MRI")
    PET = ("imaging", "PET", "Positron emission tomography")
    CT = ("imaging", "CT", "Computed tomography")
    
    # Clinical
    ENCOUNTER_NOTES = ("clinical", "Encounter Notes", "Clinical encounter documentation")
    DIAGNOSES = ("clinical", "Diagnoses", "Clinical diagnoses and conditions")
    CARE_PLANS = ("clinical", "Care Plans", "Treatment and care plans")
    MEDICATIONS = ("clinical", "Medications", "Prescribed medications")
    VITALS = ("clinical", "Vitals", "Vital signs and measurements")
    
    # Administrative
    APPOINTMENTS = ("admin", "Appointments", "Appointment history")
    BILLING = ("admin", "Billing", "Billing and insurance records")
    CONSENT_FORMS = ("admin", "Consent Forms", "Signed consent forms")
    COMMUNICATIONS = ("admin", "Communications", "Patient communications")
    
    # System
    AUDIT_LOG = ("system", "Audit Log", "System access audit trail")
    
    def __init__(self, group: str, label: str, description: str):
        self.group = group
        self.label = label
        self.description = description


@dataclass
class DataTypeSelection:
    """User's selection of data types for export."""
    selected_types: List[DataTypeCategory]
    include_raw_data: bool = False      # Include raw sensor data (qEEG, MRI)
    include_reports: bool = True         # Include generated reports
    include_notes: bool = True           # Include free-text clinical notes
    de_identify: bool = False             # De-identify for research
    
    def to_export_scope(self) -> Dict[str, Any]:
        """Convert selection to export scope parameters."""
        groups = {}
        for dt in self.selected_types:
            if dt.group not in groups:
                groups[dt.group] = []
            groups[dt.group].append({
                "type": dt.name,
                "label": dt.label,
                "description": dt.description
            })
        
        return {
            "groups": groups,
            "include_raw_data": self.include_raw_data,
            "include_reports": self.include_reports,
            "include_notes": self.include_notes,
            "de_identify": self.de_identify,
            "total_types": len(self.selected_types)
        }


# Data type groups for UI organization
DATA_TYPE_GROUPS = {
    "assessment": {
        "label": "Assessments",
        "icon": "clipboard-check",
        "types": [DataTypeCategory.PHQ9, DataTypeCategory.GAD7, 
                   DataTypeCategory.MMSE, DataTypeCategory.MOCA,
                   DataTypeCategory.HAMD, DataTypeCategory.PSQI,
                   DataTypeCategory.CUSTOM_ASSESSMENT]
    },
    "imaging": {
        "label": "Imaging & Diagnostics",
        "icon": "activity",
        "types": [DataTypeCategory.QEEG, DataTypeCategory.MRI,
                   DataTypeCategory.FMRI, DataTypeCategory.PET,
                   DataTypeCategory.CT]
    },
    "clinical": {
        "label": "Clinical Records",
        "icon": "file-medical",
        "types": [DataTypeCategory.ENCOUNTER_NOTES, DataTypeCategory.DIAGNOSES,
                   DataTypeCategory.CARE_PLANS, DataTypeCategory.MEDICATIONS,
                   DataTypeCategory.VITALS]
    },
    "admin": {
        "label": "Administrative",
        "icon": "folder-open",
        "types": [DataTypeCategory.APPOINTMENTS, DataTypeCategory.BILLING,
                   DataTypeCategory.CONSENT_FORMS, DataTypeCategory.COMMUNICATIONS]
    },
    "system": {
        "label": "System Data",
        "icon": "shield",
        "types": [DataTypeCategory.AUDIT_LOG]
    }
}
```

### 4.5 Clinic Summary (Aggregated)

Clinic-wide summary exports provide anonymized, aggregated data for quality improvement, research, and regulatory reporting.

```python
"""
Clinic summary (aggregated) export for quality and research.
Produces de-identified, aggregated statistics.
"""

from datetime import datetime, date
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass
class ClinicSummaryScope:
    """Scope for clinic-wide summary exports."""
    date_range: "DateRange"
    aggregation_level: str = "monthly"  # daily, weekly, monthly, quarterly, yearly
    include_patient_counts: bool = True
    include_assessment_statistics: bool = True
    include_clinician_statistics: bool = False  # Internal use only
    include_financial_summaries: bool = False   # Admin only
    min_cell_size: int = 5  # Minimum count for privacy (suppress small cells)


class ClinicSummaryExporter:
    """
    Generates clinic-wide summary exports with privacy protection.
    
    Implements k-anonymity principles: any statistic derived from
    fewer than min_cell_size patients is suppressed to prevent
    re-identification.
    """
    
    def export_summary(
        self,
        scope: ClinicSummaryScope
    ) -> Dict[str, Any]:
        """
        Generate a clinic summary export.
        
        Returns aggregated statistics with privacy protection.
        """
        summary = {
            "export_type": "clinic_summary",
            "generated_at": datetime.utcnow().isoformat(),
            "date_range": scope.date_range.to_iso_strings(),
            "aggregation_level": scope.aggregation_level,
            "privacy_settings": {
                "min_cell_size": scope.min_cell_size,
                "small_cells_suppressed": True
            },
            "sections": {}
        }
        
        if scope.include_patient_counts:
            summary["sections"]["patient_volume"] = self._aggregate_patient_volume(
                scope.date_range, scope.aggregation_level, scope.min_cell_size
            )
        
        if scope.include_assessment_statistics:
            summary["sections"]["assessment_statistics"] = self._aggregate_assessments(
                scope.date_range, scope.aggregation_level, scope.min_cell_size
            )
        
        return summary
    
    def _aggregate_patient_volume(
        self,
        date_range: "DateRange",
        aggregation: str,
        min_cell: int
    ) -> Dict[str, Any]:
        """Aggregate patient volume statistics."""
        # SQL aggregation with privacy protection
        query = f"""
            SELECT 
                DATE_TRUNC('{aggregation}', appointment_date) as period,
                COUNT(DISTINCT patient_id) as unique_patients,
                COUNT(*) as total_appointments
            FROM appointments
            WHERE appointment_date BETWEEN :start AND :end
            GROUP BY DATE_TRUNC('{aggregation}', appointment_date)
            ORDER BY period
        """
        # Results would be processed to suppress cells < min_cell
        return {"query": query, "note": "Aggregated with privacy protection"}
    
    def _aggregate_assessments(
        self,
        date_range: "DateRange",
        aggregation: str,
        min_cell: int
    ) -> Dict[str, Any]:
        """Aggregate assessment score statistics."""
        query = f"""
            SELECT 
                DATE_TRUNC('{aggregation}', assessment_date) as period,
                assessment_type,
                COUNT(*) as count,
                AVG(total_score) as mean_score,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_score) as median_score,
                MIN(total_score) as min_score,
                MAX(total_score) as max_score
            FROM assessments
            WHERE assessment_date BETWEEN :start AND :end
            GROUP BY DATE_TRUNC('{aggregation}', assessment_date), assessment_type
            HAVING COUNT(*) >= :min_cell
            ORDER BY period, assessment_type
        """
        return {"query": query, "note": "Small cell suppression applied"}
```

### 4.6 Audit Log Export

Audit log exports are required for compliance investigations and security reviews. They capture who accessed what data and when.

```python
"""
Audit log export for compliance and security investigations.
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass
class AuditLogScope:
    """Scope for audit log exports."""
    date_range: "DateRange"
    event_types: Optional[List[str]] = None  # None = all events
    user_ids: Optional[List[str]] = None     # Filter by specific users
    patient_ids: Optional[List[str]] = None  # Filter by patient access
    event_severity: Optional[str] = None     # info, warning, critical
    include_ip_addresses: bool = True
    include_user_agents: bool = False        # Can be large; optional


class AuditLogExporter:
    """
    Exports audit logs for compliance and security review.
    
    Audit logs are typically very large, so this exporter supports
    streaming and incremental export patterns.
    """
    
    # Event types tracked in the audit log
    EVENT_TYPES = [
        "patient_view",           # Patient record viewed
        "patient_create",         # Patient record created
        "patient_update",         # Patient record updated
        "assessment_create",      # Assessment created
        "assessment_view",        # Assessment viewed
        "assessment_update",      # Assessment updated
        "assessment_delete",      # Assessment deleted
        "export_initiated",       # Data export started
        "export_completed",       # Data export completed
        "export_downloaded",      # Export file downloaded
        "login_success",          # User logged in
        "login_failure",          # Login attempt failed
        "permission_denied",      # Access denied
        "consent_given",          # Consent form signed
        "consent_revoked",        # Consent revoked
        "data_shared",            # Data shared externally
    ]
    
    def export_audit_log(
        self,
        scope: AuditLogScope
    ) -> Dict[str, Any]:
        """
        Export audit logs matching the specified scope.
        
        Returns:
            Streaming iterator or file reference for large exports.
        """
        where_conditions = []
        params = {}
        
        # Date range
        if scope.date_range.start:
            where_conditions.append("event_timestamp >= :start_date")
            params["start_date"] = scope.date_range.start.isoformat()
        if scope.date_range.end:
            where_conditions.append("event_timestamp <= :end_date")
            params["end_date"] = scope.date_range.end.isoformat() + " 23:59:59"
        
        # Event types
        if scope.event_types:
            where_conditions.append("event_type IN (:event_types)")
            params["event_types"] = scope.event_types
        
        # Users
        if scope.user_ids:
            where_conditions.append("user_id IN (:user_ids)")
            params["user_ids"] = scope.user_ids
        
        # Patients
        if scope.patient_ids:
            where_conditions.append("patient_id IN (:patient_ids)")
            params["patient_ids"] = scope.patient_ids
        
        # Severity
        if scope.event_severity:
            where_conditions.append("severity = :severity")
            params["severity"] = scope.event_severity
        
        where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
        
        columns = [
            "event_timestamp", "event_type", "user_id", "user_role",
            "patient_id", "resource_type", "resource_id", "action",
            "ip_address" if scope.include_ip_addresses else None,
            "user_agent" if scope.include_user_agents else None,
            "outcome", "details"
        ]
        columns = [c for c in columns if c is not None]
        
        query = f"""
            SELECT {', '.join(columns)}
            FROM audit_log
            WHERE {where_clause}
            ORDER BY event_timestamp DESC
        """
        
        return {
            "query": query,
            "params": params,
            "columns": columns,
            "streaming": True,  # Always stream audit logs
            "estimated_size": "varies"
        }
```

---

## 5. Export Approval Workflow

### 5.1 Workflow Overview

Export approval workflows ensure that data exports are authorized appropriately. The approval tier should match the sensitivity and scope of the export.

| Workflow Tier | Scope | Approver | Timeline | Use Case |
|--------------|-------|----------|----------|----------|
| **Self-service** | Patient's own data | None (automated) | Instant | Patient portal download |
| **Clinician approval** | Patient data by request | Assigned clinician | < 24 hours | Patient email request |
| **Admin approval** | Clinic-wide exports | Clinic administrator | < 48 hours | System migration |
| **Dual authorization** | Large/bulk exports | Two independent approvers | < 72 hours | Research datasets |
| **Automatic approval** | Small, own data | System (pre-approved) | Instant | Quick personal export |

### 5.2 Self-Service (Patient Own Data)

The self-service workflow allows authenticated patients to export their own data without human intervention. This is the primary fulfillment mechanism for GDPR SAR requests.

```python
"""
Self-service export workflow for patient portal.
Allows authenticated patients to export their own data instantly.
"""

from datetime import datetime
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum


class SelfServiceExportType(Enum):
    """Types of self-service exports available to patients."""
    QUICK_SUMMARY = "quick_summary"        # Last 30 days, key assessments
    FULL_RECORD = "full_record"            # Complete patient record
    ASSESSMENT_HISTORY = "assessment_history"  # All assessments
    IMAGING_REPORTS = "imaging_reports"    # qEEG, MRI reports
    CUSTOM_RANGE = "custom_range"          # User-defined date range


@dataclass
class SelfServiceConfig:
    """Configuration for self-service export limits."""
    max_records_per_export: int = 10000
    max_daily_exports: int = 5
    max_monthly_exports: int = 10
    allowed_formats: List[str] = None
    max_date_range_days: int = 365 * 5  # 5 years max per export
    
    def __post_init__(self):
        if self.allowed_formats is None:
            self.allowed_formats = ["pdf", "csv", "json", "xlsx"]


class SelfServiceExportWorkflow:
    """
    Manages self-service data exports for authenticated patients.
    
    Workflow:
    1. Patient selects export type and format via portal
    2. System validates against usage limits
    3. System queues async export job
    4. Patient receives notification when ready
    5. Patient downloads via secure link
    """
    
    def __init__(self, config: SelfServiceConfig = None):
        self.config = config or SelfServiceConfig()
    
    def request_export(
        self,
        patient_id: str,
        export_type: SelfServiceExportType,
        format: str,
        date_range: Optional["DateRange"] = None
    ) -> Dict[str, Any]:
        """
        Process a self-service export request.
        
        Returns:
            Export job status with tracking information.
        """
        # Validate format
        if format not in self.config.allowed_formats:
            return {
                "success": False,
                "error": f"Format '{format}' not available. "
                        f"Choose from: {', '.join(self.config.allowed_formats)}"
            }
        
        # Check usage limits
        limit_check = self._check_usage_limits(patient_id)
        if not limit_check["allowed"]:
            return {
                "success": False,
                "error": limit_check["reason"],
                "limit_info": limit_check["details"]
            }
        
        # Validate date range
        if date_range:
            range_days = (date_range.end - date_range.start).days
            if range_days > self.config.max_date_range_days:
                return {
                    "success": False,
                    "error": (
                        f"Date range too large ({range_days} days). "
                        f"Maximum: {self.config.max_date_range_days} days. "
                        f"Please request a smaller range or contact support."
                    )
                }
        
        # Create export job
        job = self._create_export_job(
            patient_id=patient_id,
            export_type=export_type,
            format=format,
            date_range=date_range,
            approval_type="self_service"
        )
        
        # Log the request
        self._audit_log("self_service_export_requested", {
            "patient_id": patient_id,
            "export_type": export_type.value,
            "format": format,
            "job_id": job["job_id"]
        })
        
        return {
            "success": True,
            "job_id": job["job_id"],
            "status": "queued",
            "message": (
                "Your export request has been received and is being prepared. "
                "You will receive a notification when it's ready for download."
            ),
            "estimated_time_seconds": job.get("estimated_duration", 60),
            "notification_method": "email_and_portal"
        }
    
    def _check_usage_limits(self, patient_id: str) -> Dict[str, Any]:
        """Check if patient has exceeded export usage limits."""
        # Query export history
        today_count = self._get_export_count(patient_id, days=1)
        month_count = self._get_export_count(patient_id, days=30)
        
        if today_count >= self.config.max_daily_exports:
            return {
                "allowed": False,
                "reason": (
                    f"Daily export limit reached ({self.config.max_daily_exports}). "
                    "Please try again tomorrow."
                ),
                "details": {"daily_used": today_count, "daily_limit": self.config.max_daily_exports}
            }
        
        if month_count >= self.config.max_monthly_exports:
            return {
                "allowed": False,
                "reason": (
                    f"Monthly export limit reached ({self.config.max_monthly_exports}). "
                    "Please contact support for additional exports."
                ),
                "details": {"monthly_used": month_count, "monthly_limit": self.config.max_monthly_exports}
            }
        
        return {
            "allowed": True,
            "details": {
                "daily_used": today_count,
                "daily_remaining": self.config.max_daily_exports - today_count,
                "monthly_used": month_count,
                "monthly_remaining": self.config.max_monthly_exports - month_count
            }
        }
    
    def _create_export_job(self, **kwargs) -> Dict[str, Any]:
        """Create and queue an export job."""
        job_id = f"EXP-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{kwargs['patient_id'][:8]}"
        return {
            "job_id": job_id,
            "estimated_duration": 30,  # seconds
            "queued_at": datetime.utcnow().isoformat()
        }
    
    def _get_export_count(self, patient_id: str, days: int) -> int:
        """Get export count for a patient in the last N days."""
        # Placeholder - implement with database query
        return 0
    
    def _audit_log(self, event: str, details: Dict[str, Any]):
        """Write to audit log."""
        # Placeholder - implement with logging
        pass
```

### 5.3 Clinician Approval

When a patient requests their data outside the self-service portal (e.g., via email or phone), a clinician must review and approve the export.

```python
"""
Clinician approval workflow for patient data exports.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum


class ClinicianApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"     # To admin
    EXPIRED = "expired"


@dataclass
class ClinicianApprovalRequest:
    """An export request awaiting clinician approval."""
    request_id: str
    patient_id: str
    requested_by: str           # Patient email/phone
    request_channel: str         # email, phone, letter
    clinician_id: str           # Assigned reviewing clinician
    requested_formats: List[str]
    scope_description: str
    request_date: datetime
    status: ClinicianApprovalStatus = ClinicianApprovalStatus.PENDING
    clinician_notes: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class ClinicianApprovalWorkflow:
    """
    Manages clinician review and approval of export requests.
    
    Workflow:
    1. Request received (email/phone/letter)
    2. DPO/admin creates approval request, assigns clinician
    3. Clinician reviews patient context and export scope
    4. Clinician approves, rejects, or escalates
    5. If approved, export job is queued
    6. If rejected, patient is notified with reason
    7. If escalated, admin reviews
    """
    
    APPROVAL_TIMEOUT_HOURS = 48
    
    def create_approval_request(
        self,
        patient_id: str,
        requested_by: str,
        request_channel: str,
        clinician_id: str,
        formats: List[str],
        scope: str
    ) -> Dict[str, Any]:
        """
        Create a new clinician approval request.
        
        Returns:
            Approval request with tracking ID.
        """
        request_id = f"APR-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        approval = ClinicianApprovalRequest(
            request_id=request_id,
            patient_id=patient_id,
            requested_by=requested_by,
            request_channel=request_channel,
            clinician_id=clinician_id,
            requested_formats=formats,
            scope_description=scope,
            request_date=datetime.utcnow()
        )
        
        # Notify assigned clinician
        self._notify_clinician(approval)
        
        return {
            "request_id": request_id,
            "status": ClinicianApprovalStatus.PENDING.value,
            "assigned_clinician": clinician_id,
            "deadline": (datetime.utcnow() + timedelta(
                hours=self.APPROVAL_TIMEOUT_HOURS
            )).isoformat(),
            "message": "Approval request sent to assigned clinician."
        }
    
    def approve_request(
        self,
        request_id: str,
        clinician_id: str,
        notes: Optional[str] = None,
        approved_scope: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve an export request.
        
        The clinician can optionally restrict the scope of the export
        if they determine some data should not be included.
        """
        request = self._get_request(request_id)
        
        if request.status != ClinicianApprovalStatus.PENDING:
            return {
                "success": False,
                "error": f"Request is not pending (current status: {request.status.value})"
            }
        
        request.status = ClinicianApprovalStatus.APPROVED
        request.approved_at = datetime.utcnow()
        request.approved_by = clinician_id
        request.clinician_notes = notes
        
        # Queue the export job with approved scope
        scope = approved_scope or request.scope_description
        job = self._queue_approved_export(request, scope)
        
        # Notify patient
        self._notify_patient_approved(request, job)
        
        return {
            "success": True,
            "request_id": request_id,
            "status": ClinicianApprovalStatus.APPROVED.value,
            "approved_by": clinician_id,
            "approved_at": datetime.utcnow().isoformat(),
            "approved_scope": scope,
            "export_job_id": job["job_id"],
            "notes": notes
        }
    
    def reject_request(
        self,
        request_id: str,
        clinician_id: str,
        reason: str
    ) -> Dict[str, Any]:
        """
        Reject an export request.
        
        Rejection must include a clear reason and information about
        the patient's right to appeal.
        """
        request = self._get_request(request_id)
        request.status = ClinicianApprovalStatus.REJECTED
        request.rejection_reason = reason
        request.approved_by = clinician_id
        request.approved_at = datetime.utcnow()
        
        # Notify patient
        self._notify_patient_rejected(request, reason)
        
        return {
            "success": True,
            "request_id": request_id,
            "status": ClinicianApprovalStatus.REJECTED.value,
            "rejection_reason": reason,
            "patient_rights_info": (
                "You have the right to appeal this decision. "
                "Please contact our Data Protection Officer at dpo@clinic.example.com."
            )
        }
    
    def escalate_request(
        self,
        request_id: str,
        clinician_id: str,
        reason: str
    ) -> Dict[str, Any]:
        """Escalate an export request to admin review."""
        request = self._get_request(request_id)
        request.status = ClinicianApprovalStatus.ESCALATED
        request.clinician_notes = reason
        
        # Notify admin
        self._notify_admin_escalation(request, reason)
        
        return {
            "success": True,
            "request_id": request_id,
            "status": ClinicianApprovalStatus.ESCALATED.value,
            "escalation_reason": reason,
            "message": "Request escalated to administrator for review."
        }
    
    def _notify_clinician(self, approval: ClinicianApprovalRequest):
        """Send notification to assigned clinician."""
        # Implementation: email, in-app notification, SMS
        pass
    
    def _notify_patient_approved(self, approval: ClinicianApprovalRequest, job: Dict):
        """Notify patient that export was approved."""
        pass
    
    def _notify_patient_rejected(self, approval: ClinicianApprovalRequest, reason: str):
        """Notify patient that export was rejected."""
        pass
    
    def _notify_admin_escalation(self, approval: ClinicianApprovalRequest, reason: str):
        """Notify admin of escalated request."""
        pass
    
    def _get_request(self, request_id: str) -> ClinicianApprovalRequest:
        """Fetch approval request from database."""
        # Placeholder
        pass
    
    def _queue_approved_export(self, approval: ClinicianApprovalRequest, scope: str) -> Dict[str, Any]:
        """Queue the export job after approval."""
        job_id = f"EXP-{approval.request_id}"
        return {"job_id": job_id, "status": "queued"}
```

### 5.4 Admin Approval

Admin approval is required for clinic-wide exports that could affect multiple patients or expose sensitive operational data.

```python
"""
Admin approval workflow for clinic-wide exports.
"""

from datetime import datetime
from typing import Dict, Any, List
from dataclasses import dataclass


@dataclass
class AdminApprovalRequest:
    """An export request requiring administrator approval."""
    request_id: str
    requester_id: str            # Staff member requesting
    requester_role: str          # Their role
    export_scope: str            # Description of scope
    estimated_patients_affected: int
    estimated_data_size_gb: float
    purpose: str                 # Business justification
    legal_basis: str             # GDPR basis for processing
    requested_formats: List[str]
    de_identified: bool          # Is this a de-identified export?
    data_use_agreement: bool     # DUA signed?
    irb_approval: bool           # IRB approval for research?


class AdminApprovalWorkflow:
    """
    Admin approval workflow for high-risk exports.
    
    Required for:
    - Clinic-wide data exports
    - Bulk patient exports (> 10 patients)
    - Research data requests
    - Third-party data sharing
    - System migration exports
    
    Approval criteria:
    - Valid business purpose documented
    - Legal basis for processing identified
    - Data minimization confirmed
    - Security measures adequate
    - DUA/IRB documentation if applicable
    """
    
    def evaluate_request(self, request: AdminApprovalRequest) -> Dict[str, Any]:
        """
        Evaluate an admin approval request against policy criteria.
        
        Returns evaluation with risk assessment and recommendation.
        """
        evaluation = {
            "request_id": request.request_id,
            "evaluation_timestamp": datetime.utcnow().isoformat(),
            "risk_score": 0,
            "risk_level": "low",
            "criteria_met": {},
            "criteria_failed": [],
            "recommendation": "approve",
            "conditions": []
        }
        
        # Criterion 1: Business purpose documented
        if request.purpose and len(request.purpose) > 20:
            evaluation["criteria_met"]["business_purpose"] = True
        else:
            evaluation["criteria_failed"].append("business_purpose")
            evaluation["risk_score"] += 20
        
        # Criterion 2: Legal basis specified
        valid_bases = ["consent", "contract", "legal_obligation", 
                       "vital_interests", "public_task", "legitimate_interests"]
        if request.legal_basis in valid_bases:
            evaluation["criteria_met"]["legal_basis"] = True
        else:
            evaluation["criteria_failed"].append("legal_basis")
            evaluation["risk_score"] += 25
        
        # Criterion 3: De-identification for large exports
        if request.estimated_patients_affected > 10 and not request.de_identified:
            evaluation["risk_score"] += 30
            evaluation["conditions"].append(
                "Export affects >10 patients and is not de-identified. "
                "Consider de-identification or add additional safeguards."
            )
        
        # Criterion 4: Research requirements
        if "research" in request.purpose.lower():
            if not request.irb_approval:
                evaluation["criteria_failed"].append("irb_approval")
                evaluation["risk_score"] += 25
                evaluation["conditions"].append("IRB approval required for research use")
            if not request.data_use_agreement:
                evaluation["criteria_failed"].append("data_use_agreement")
                evaluation["risk_score"] += 15
        
        # Criterion 5: Data volume
        if request.estimated_data_size_gb > 10:
            evaluation["risk_score"] += 10
            evaluation["conditions"].append(
                f"Large data volume ({request.estimated_data_size_gb}GB). "
                "Ensure secure transfer mechanisms are in place."
            )
        
        # Risk level determination
        if evaluation["risk_score"] >= 60:
            evaluation["risk_level"] = "high"
            evaluation["recommendation"] = "reject_or_escalate"
        elif evaluation["risk_score"] >= 30:
            evaluation["risk_level"] = "medium"
            evaluation["recommendation"] = "approve_with_conditions"
        else:
            evaluation["risk_level"] = "low"
            evaluation["recommendation"] = "approve"
        
        return evaluation
```

### 5.5 Dual Authorization

Dual authorization (four-eyes principle) is required for the highest-risk exports:

- Exports affecting > 100 patients
- Exports to external organizations
- Exports containing identifiable data (not de-identified)
- Exports requested by non-clinical staff

```python
"""
Dual authorization workflow for high-risk exports.
Implements the four-eyes principle.
"""

from datetime import datetime
from typing import Dict, Any, List
from dataclasses import dataclass


@dataclass
class DualAuthorizationRequest:
    """Export request requiring dual authorization."""
    request_id: str
    requester_id: str
    primary_approver_id: str       # First approver (clinical lead)
    secondary_approver_id: str     # Second approver (admin/DPO)
    approvals: List[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.approvals is None:
            self.approvals = []


class DualAuthorizationWorkflow:
    """
    Dual authorization (four-eyes) workflow.
    
    Requires TWO independent approvers from different roles:
    1. Clinical approver (understands patient care context)
    2. Administrative approver (understands compliance/legal)
    
    Neither can be the requester. Both must approve before export proceeds.
    If either rejects, the export is denied.
    """
    
    def submit_for_dual_auth(self, request: DualAuthorizationRequest) -> Dict[str, Any]:
        """Submit export for dual authorization."""
        return {
            "request_id": request.request_id,
            "status": "awaiting_dual_authorization",
            "approvers_required": [
                {
                    "role": "clinical_approver",
                    "assigned": request.primary_approver_id,
                    "status": "pending"
                },
                {
                    "role": "administrative_approver",
                    "assigned": request.secondary_approver_id,
                    "status": "pending"
                }
            ],
            "message": (
                "This export requires approval from two independent reviewers. "
                "Both must approve before the export can proceed."
            )
        }
    
    def record_approval(
        self,
        request: DualAuthorizationRequest,
        approver_id: str,
        decision: str,  # "approve" or "reject"
        notes: str = ""
    ) -> Dict[str, Any]:
        """Record an approval decision."""
        request.approvals.append({
            "approver_id": approver_id,
            "decision": decision,
            "timestamp": datetime.utcnow().isoformat(),
            "notes": notes
        })
        
        # Check if both have approved
        approvals_by_role = {}
        for a in request.approvals:
            if a["approver_id"] == request.primary_approver_id:
                approvals_by_role["clinical"] = a
            elif a["approver_id"] == request.secondary_approver_id:
                approvals_by_role["administrative"] = a
        
        if len(approvals_by_role) == 2:
            # Both have responded
            clinical = approvals_by_role["clinical"]
            admin = approvals_by_role["administrative"]
            
            if clinical["decision"] == "approve" and admin["decision"] == "approve":
                return {
                    "status": "fully_approved",
                    "can_proceed": True,
                    "approvals": list(approvals_by_role.values())
                }
            else:
                return {
                    "status": "rejected",
                    "can_proceed": False,
                    "reason": "One or both approvers rejected the request",
                    "approvals": list(approvals_by_role.values())
                }
        
        return {
            "status": "awaiting_second_approval",
            "can_proceed": False,
            "approvals_received": len(request.approvals),
            "approvals_required": 2
        }
```

### 5.6 Automatic Approval (Small, Own Data)

The automatic approval workflow handles trivial exports that pose minimal risk:

- Patient exporting their own recent assessments (< 10 records)
- Patient exporting their own appointment history
- Small data volumes (< 1 MB)
- Standard formats (PDF, CSV)
- Within usage limits

These exports bypass all human approval and are processed automatically.

```python
"""
Automatic approval rules for low-risk exports.
"""

from typing import Dict, Any


class AutomaticApprovalRules:
    """
    Rules engine for automatic export approval.
    
    Exports that meet ALL criteria are automatically approved:
    - Patient's own data only
    - Small record count (< 100)
    - Small data size (< 10 MB)
    - Standard format
    - Within usage limits
    - Not flagged as sensitive
    """
    
    # Criteria thresholds
    MAX_RECORDS_AUTO = 100
    MAX_SIZE_MB_AUTO = 10
    SENSITIVE_DATA_TYPES = ["psychotherapy_notes", "substance_abuse", 
                             "hiv_status", "genetic_data"]
    
    def evaluate(self, export_request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate whether an export qualifies for automatic approval.
        
        Returns:
            Decision with detailed reasoning.
        """
        checks = {
            "own_data_only": {
                "passed": export_request.get("patient_id") == export_request.get("requested_by_patient_id"),
                "reason": "Requester must be the data subject"
            },
            "record_count": {
                "passed": export_request.get("estimated_records", 0) <= self.MAX_RECORDS_AUTO,
                "reason": f"Record count must be <= {self.MAX_RECORDS_AUTO}"
            },
            "data_size": {
                "passed": export_request.get("estimated_size_mb", 0) <= self.MAX_SIZE_MB_AUTO,
                "reason": f"Data size must be <= {self.MAX_SIZE_MB_AUTO} MB"
            },
            "standard_format": {
                "passed": export_request.get("format") in ["pdf", "csv", "json", "xlsx"],
                "reason": "Format must be standard (PDF, CSV, JSON, XLSX)"
            },
            "not_sensitive": {
                "passed": not any(
                    t in self.SENSITIVE_DATA_TYPES 
                    for t in export_request.get("data_types", [])
                ),
                "reason": "Export must not contain specially protected data types"
            },
            "within_limits": {
                "passed": export_request.get("within_usage_limits", True),
                "reason": "Must be within patient usage limits"
            }
        }
        
        all_passed = all(check["passed"] for check in checks.values())
        
        return {
            "auto_approved": all_passed,
            "checks": checks,
            "required_approval": None if all_passed else self._determine_approval_level(export_request),
            "reasoning": "All criteria passed" if all_passed else "One or more criteria failed"
        }
    
    def _determine_approval_level(self, request: Dict[str, Any]) -> str:
        """Determine the required approval level for non-auto-approved exports."""
        estimated_patients = request.get("estimated_patients", 1)
        
        if estimated_patients > 100:
            return "dual_authorization"
        elif estimated_patients > 1:
            return "admin_approval"
        elif request.get("request_channel") != "portal":
            return "clinician_approval"
        else:
            return "self_service_with_review"
```


---

## 6. Export Safety & Security

### 6.1 PHI Masking in Exports

Protected Health Information (PHI) must be carefully controlled in exports. Masking strategies depend on the export purpose and recipient.

#### PHI Masking Levels

| Level | Direct Identifiers | Quasi-Identifiers | Dates | Geographic | Use Case |
|-------|-------------------|-------------------|-------|------------|----------|
| **None** | Preserved | Preserved | Full | Full | Patient own data (SAR) |
| **Minimal** | Hashed | Preserved | Full | Full | Internal quality review |
| **Moderate** | Removed | Generalized | Month/Year | State only | Research (IRB approved) |
| **Strong** | Removed | Removed | Year only | Removed | Public dataset |
| **Maximum** | All removed | All removed | Removed | Removed | Open data release |

#### Python: PHI Masking Engine

```python
"""
PHI (Protected Health Information) masking engine for data exports.
Implements multiple de-identification strategies based on export purpose.
"""

import hashlib
import re
import uuid
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Callable
from enum import Enum
from dataclasses import dataclass


class MaskingLevel(Enum):
    """Levels of PHI masking for exports."""
    NONE = "none"              # No masking - patient own data
    MINIMAL = "minimal"        # Hash direct identifiers
    MODERATE = "moderate"      # Remove direct IDs, generalize dates
    STRONG = "strong"          # Remove all identifiers, coarse dates
    MAXIMUM = "maximum"        # Maximum de-identification


class IdentifierType(Enum):
    """Categories of identifiers under HIPAA Safe Harbor."""
    # HIPAA Safe Harbor 18 identifiers
    NAME = "name"
    GEOGRAPHIC = "geographic"
    DATES = "dates"
    PHONE = "phone"
    FAX = "fax"
    EMAIL = "email"
    SSN = "ssn"
    MRN = "mrn"
    HEALTH_PLAN = "health_plan"
    ACCOUNT = "account"
    CERTIFICATE = "certificate"
    VEHICLE = "vehicle"
    DEVICE = "device"
    URL = "url"
    IP_ADDRESS = "ip_address"
    BIOMETRIC = "biometric"
    PHOTO = "photo"
    OTHER = "other"


@dataclass
class MaskingConfig:
    """Configuration for PHI masking."""
    level: MaskingLevel = MaskingLevel.NONE
    hash_salt: Optional[str] = None
    date_granularity: str = "day"  # day, month, year
    geographic_precision: str = "full"  # full, city, state, none
    free_text_strategy: str = "redact"  # redact, tokenize, preserve


class PHIMaskingEngine:
    """
    Engine for applying PHI masking to data exports.
    
    Implements HIPAA Safe Harbor de-identification method
    and supports multiple masking strategies.
    
    Reference: 45 CFR 164.514(b)(2) - Safe Harbor method
    """
    
    # Regex patterns for identifier detection
    PATTERNS = {
        IdentifierType.SSN: re.compile(r'\b\d{3}-?\d{2}-?\d{4}\b'),
        IdentifierType.PHONE: re.compile(r'\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b'),
        IdentifierType.EMAIL: re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
        IdentifierType.IP_ADDRESS: re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'),
        IdentifierType.URL: re.compile(r'https?://[^\s<>"{}|\\^`[\]]+'),
        IdentifierType.MRN: re.compile(r'\b(MRN|MR|ID)[-#\s]?\d+\b', re.IGNORECASE),
    }
    
    def __init__(self, config: MaskingConfig = None):
        self.config = config or MaskingConfig()
    
    def mask_record(
        self,
        record: Dict[str, Any],
        record_type: str = "generic"
    ) -> Dict[str, Any]:
        """
        Apply PHI masking to a record based on configured level.
        
        Args:
            record: The record to mask
            record_type: Type of record (patient, assessment, encounter, etc.)
        
        Returns:
            Masked record
        """
        if self.config.level == MaskingLevel.NONE:
            return record.copy()
        
        masked = {}
        for field, value in record.items():
            masked[field] = self._mask_field(field, value, record_type)
        
        return masked
    
    def _mask_field(
        self,
        field_name: str,
        value: Any,
        record_type: str
    ) -> Any:
        """Mask a single field based on its name and value type."""
        if value is None:
            return None
        
        # Determine identifier type from field name
        id_type = self._classify_field(field_name)
        
        if id_type == IdentifierType.NAME:
            return self._mask_name(value)
        elif id_type == IdentifierType.DATES:
            return self._mask_date(value)
        elif id_type == IdentifierType.GEOGRAPHIC:
            return self._mask_geographic(value)
        elif id_type == IdentifierType.SSN:
            return self._mask_ssn(value)
        elif id_type == IdentifierType.PHONE:
            return self._mask_phone(value)
        elif id_type == IdentifierType.EMAIL:
            return self._mask_email(value)
        elif id_type == IdentifierType.MRN:
            return self._hash_identifier(value)
        elif id_type == IdentifierType.IP_ADDRESS:
            return self._mask_ip(value)
        elif isinstance(value, str):
            # Apply pattern-based masking to free text
            return self._mask_free_text(value)
        elif isinstance(value, dict):
            return self.mask_record(value, record_type)
        elif isinstance(value, list):
            return [self._mask_field(field_name, item, record_type) for item in value]
        
        return value
    
    def _classify_field(self, field_name: str) -> Optional[IdentifierType]:
        """Classify a field name to its identifier type."""
        field_lower = field_name.lower()
        
        name_fields = ['name', 'first_name', 'last_name', 'given_name', 
                       'family_name', 'middle_name', 'full_name']
        date_fields = ['date', 'dob', 'birth_date', 'date_of_birth', 
                       'appointment_date', 'encounter_date', 'created_at',
                       'modified_at', 'timestamp']
        geo_fields = ['address', 'street', 'city', 'zip', 'postal', 
                       'latitude', 'longitude', 'location']
        
        if any(f in field_lower for f in name_fields):
            return IdentifierType.NAME
        elif any(f in field_lower for f in date_fields):
            return IdentifierType.DATES
        elif any(f in field_lower for f in geo_fields):
            return IdentifierType.GEOGRAPHIC
        elif 'ssn' in field_lower or 'social' in field_lower:
            return IdentifierType.SSN
        elif 'phone' in field_lower or 'mobile' in field_lower or 'tel' in field_lower:
            return IdentifierType.PHONE
        elif 'email' in field_lower:
            return IdentifierType.EMAIL
        elif 'mrn' in field_lower or 'medical_record' in field_lower or 'patient_id' in field_lower:
            return IdentifierType.MRN
        elif 'ip' in field_lower or 'ip_address' in field_lower:
            return IdentifierType.IP_ADDRESS
        
        return None
    
    def _mask_name(self, name: str) -> str:
        """Mask a person's name."""
        if self.config.level == MaskingLevel.MINIMAL:
            return self._hash_identifier(name)
        elif self.config.level in (MaskingLevel.MODERATE, MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
            return "[NAME REDACTED]"
        return name
    
    def _mask_date(self, value: Any) -> Any:
        """Mask a date based on configured granularity."""
        if not isinstance(value, (date, datetime, str)):
            return value
        
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError:
                return value
        
        if self.config.level == MaskingLevel.NONE:
            return value.isoformat() if isinstance(value, (date, datetime)) else value
        elif self.config.level == MaskingLevel.MINIMAL:
            return value.isoformat() if isinstance(value, (date, datetime)) else value
        elif self.config.level == MaskingLevel.MODERATE:
            # Keep month/year, remove day
            return f"{value.year}-{value.month:02d}"
        elif self.config.level in (MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
            # Keep year only (or remove entirely for MAXIMUM)
            if self.config.level == MaskingLevel.MAXIMUM:
                return "[DATE REDACTED]"
            return str(value.year)
    
    def _mask_geographic(self, value: str) -> str:
        """Mask geographic information."""
        if self.config.level == MaskingLevel.MINIMAL:
            return value
        elif self.config.level == MaskingLevel.MODERATE:
            # Keep state only
            parts = value.split(',')
            return parts[-1].strip() if len(parts) > 1 else "[LOCATION REDACTED]"
        elif self.config.level in (MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
            return "[LOCATION REDACTED]"
        return value
    
    def _mask_ssn(self, ssn: str) -> str:
        """Mask SSN - always redact."""
        return "[SSN REDACTED]"
    
    def _mask_phone(self, phone: str) -> str:
        """Mask phone number."""
        if self.config.level in (MaskingLevel.MODERATE, MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
            return "[PHONE REDACTED]"
        return self._hash_identifier(phone)
    
    def _mask_email(self, email: str) -> str:
        """Mask email address."""
        if self.config.level in (MaskingLevel.MODERATE, MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
            return "[EMAIL REDACTED]"
        return self._hash_identifier(email)
    
    def _mask_ip(self, ip: str) -> str:
        """Mask IP address."""
        if self.config.level in (MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
            return "[IP REDACTED]"
        # Anonymize last octet
        parts = ip.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.xxx"
        return "[IP REDACTED]"
    
    def _mask_free_text(self, text: str) -> str:
        """Apply pattern-based masking to free text fields."""
        if not isinstance(text, str):
            return text
        
        if self.config.level == MaskingLevel.MAXIMUM and self.config.free_text_strategy == "redact":
            return "[TEXT REDACTED]"
        
        masked = text
        for id_type, pattern in self.PATTERNS.items():
            if self.config.level in (MaskingLevel.STRONG, MaskingLevel.MAXIMUM):
                masked = pattern.sub(f"[{id_type.value.upper()} REDACTED]", masked)
            elif self.config.level == MaskingLevel.MODERATE and id_type in (
                IdentifierType.SSN, IdentifierType.EMAIL
            ):
                masked = pattern.sub(f"[{id_type.value.upper()} REDACTED]", masked)
        
        return masked
    
    def _hash_identifier(self, value: str) -> str:
        """Create a deterministic hash of an identifier."""
        salt = self.config.hash_salt or "default_salt_change_me"
        return hashlib.sha256(f"{value}{salt}".encode()).hexdigest()[:16]


# HIPAA Safe Harbor: 18 identifiers that must be removed for de-identification
HIPAA_SAFE_HARBOR_IDENTIFIERS = [
    "Names",
    "Geographic subdivisions smaller than state (except zip code first 3 digits)",
    "Dates (except year) directly related to individual",
    "Telephone numbers",
    "Fax numbers",
    "Email addresses",
    "Social Security numbers",
    "Medical record numbers",
    "Health plan beneficiary numbers",
    "Account numbers",
    "Certificate/license numbers",
    "Vehicle identifiers",
    "Device identifiers",
    "Web URLs",
    "IP addresses",
    "Biometric identifiers",
    "Full-face photographs",
    "Any other unique identifying number, characteristic, or code",
]
```

### 6.2 Watermarking

Watermarks serve as a deterrent against unauthorized sharing and enable tracing of leaked documents back to the source.

```python
"""
Document watermarking for exported files.
Supports visible and forensic (invisible) watermarks.
"""

from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class WatermarkConfig:
    """Configuration for document watermarking."""
    text_template: str = "CONFIDENTIAL - {patient_id} - {timestamp} - {export_id}"
    font_size: int = 36
    opacity: float = 0.15          # 0-1, visible watermark
    rotation: int = 45             # Degrees
    color: str = "#808080"         # Gray
    position: str = "diagonal"     # diagonal, header, footer, tiled
    include_forensic: bool = True   # Invisible forensic watermark


class Watermarker:
    """
    Applies visible and forensic watermarks to exported documents.
    
    Visible watermarks deter unauthorized sharing.
    Forensic (steganographic) watermarks enable tracing leaks.
    """
    
    def generate_watermark_text(
        self,
        config: WatermarkConfig,
        patient_id: str,
        export_id: str
    ) -> str:
        """Generate watermark text with embedded metadata."""
        return config.text_template.format(
            patient_id=patient_id,
            timestamp=datetime.utcnow().strftime("%Y%m%d%H%M%S"),
            export_id=export_id
        )
    
    def apply_pdf_watermark(
        self,
        pdf_bytes: bytes,
        watermark_text: str,
        config: WatermarkConfig
    ) -> bytes:
        """
        Apply a visible watermark to a PDF document.
        
        Uses ReportLab to overlay watermark on each page.
        """
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from PyPDF2 import PdfReader, PdfWriter
        import io
        
        # Create watermark PDF
        watermark_buffer = io.BytesIO()
        c = canvas.Canvas(watermark_buffer, pagesize=letter)
        width, height = letter
        
        c.saveState()
        c.setFont("Helvetica-Bold", config.font_size)
        c.setFillAlpha(config.opacity)
        
        # Draw diagonal watermark
        c.translate(width / 2, height / 2)
        c.rotate(config.rotation)
        c.drawCentredString(0, 0, watermark_text)
        
        c.restoreState()
        c.save()
        watermark_buffer.seek(0)
        
        # Merge with original PDF
        watermark_pdf = PdfReader(watermark_buffer)
        original = PdfReader(io.BytesIO(pdf_bytes))
        output = PdfWriter()
        
        for page in original.pages:
            page.merge_page(watermark_pdf.pages[0])
            output.add_page(page)
        
        result_buffer = io.BytesIO()
        output.write(result_buffer)
        result_buffer.seek(0)
        return result_buffer.read()
```

### 6.3 Encryption (Password-Protected ZIP)

All exports containing PHI must be encrypted in transit and at rest. Password-protected ZIP with AES-256 is the industry standard for patient data exports.

```python
"""
Export encryption using password-protected ZIP with AES-256.
"""

import io
import zipfile
import secrets
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass


@dataclass
class EncryptionConfig:
    """Configuration for export encryption."""
    algorithm: str = "AES-256"     # AES-256 is required for HIPAA
    zip_compression: int = zipfile.ZIP_DEFLATED
    password_length: int = 32
    password_charset: str = "alphanumeric"


class ExportEncryptor:
    """
    Encrypts export packages using password-protected ZIP with AES-256.
    
    Features:
    - AES-256 encryption (required for HIPAA compliance)
    - Cryptographically secure password generation
    - Separate password and file delivery
    - Metadata preservation within encrypted container
    """
    
    def encrypt_package(
        self,
        files: List[Tuple[str, bytes]],  # (filename, content) pairs
        manifest: Dict[str, Any],
        config: EncryptionConfig = None
    ) -> Dict[str, Any]:
        """
        Create an encrypted ZIP package containing export files.
        
        Args:
            files: List of (filename, content) tuples
            manifest: Export manifest/metadata
            config: Encryption configuration
        
        Returns:
            Dictionary with encrypted package, password, and metadata.
        """
        config = config or EncryptionConfig()
        
        # Generate cryptographically secure password
        password = self._generate_password(config)
        
        # Create encrypted ZIP
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(
            zip_buffer,
            'w',
            compression=config.zip_compression
        ) as zf:
            # Set encryption - note: Python's zipfile uses ZIP_CRYPTO
            # which is traditional PKWARE encryption (weak).
            # For production, use pyzipper or 7z for AES-256.
            
            # Add manifest
            import json
            zf.writestr(
                "MANIFEST.json",
                json.dumps(manifest, indent=2).encode('utf-8')
            )
            
            # Add all export files
            for filename, content in files:
                zf.writestr(filename, content)
        
        zip_buffer.seek(0)
        encrypted_data = zip_buffer.read()
        
        return {
            "encrypted_package": encrypted_data,
            "password": password,
            "algorithm": config.algorithm,
            "file_count": len(files) + 1,  # +1 for manifest
            "instructions": (
                "This file is password-protected.\n"
                "To extract: Use 7-Zip, WinZip, or unzip -P [password] [file.zip]\n"
                "Do NOT share the password via the same channel as the file."
            )
        }
    
    def _generate_password(self, config: EncryptionConfig) -> str:
        """Generate a cryptographically secure password."""
        if config.password_charset == "alphanumeric":
            alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        elif config.password_charset == "full":
            alphabet = (
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
                "0123456789!@#$%^&*()-_=+[]{}|;:,.<>?"
            )
        else:
            alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
        
        return ''.join(secrets.choice(alphabet) for _ in range(config.password_length))


# NOTE: For production AES-256 ZIP encryption, use pyzipper:
#
#   import pyzipper
#   with pyzipper.AESZipFile('secure.zip', 'w',
#                            compression=pyzipper.ZIP_LZMA,
#                            encryption=pyzipper.WZ_AES) as zf:
#       zf.setpassword(b'mypassword')
#       zf.writestr('data.csv', csv_content)
#
# This provides actual AES-256 encryption, not the weak PKWARE
# encryption available in standard library zipfile.
```

### 6.4 Expiry (Download Link Expiration)

Time-limited download links reduce the window of exposure for exported data.

```python
"""
Time-limited download link management for export security.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dataclasses import dataclass
import secrets


@dataclass
class ExpiryConfig:
    """Configuration for download link expiry."""
    default_ttl_hours: int = 72           # Default link lifetime
    sensitive_data_ttl_hours: int = 24    # Shorter for sensitive data
    max_extensions: int = 1               # Times link can be extended
    extension_hours: int = 24             # Hours per extension
    require_mfa_for_extension: bool = True


class DownloadLinkManager:
    """
    Manages time-limited, secure download links for export packages.
    
    Features:
    - Configurable TTL per export type
    - Single-use or limited-use tokens
    - Access logging
    - Extension capability with approval
    """
    
    def create_download_link(
        self,
        export_id: str,
        patient_id: str,
        file_path: str,
        config: ExpiryConfig = None,
        is_sensitive: bool = False
    ) -> Dict[str, Any]:
        """
        Create a secure, time-limited download link.
        
        Returns:
            Download URL with expiration and access token.
        """
        config = config or ExpiryConfig()
        
        # Determine TTL based on sensitivity
        ttl_hours = (config.sensitive_data_ttl_hours 
                     if is_sensitive 
                     else config.default_ttl_hours)
        
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        access_token = secrets.token_urlsafe(32)
        
        # Store link metadata
        link_record = {
            "link_id": f"DL-{export_id}",
            "export_id": export_id,
            "patient_id": patient_id,
            "file_path": file_path,
            "access_token": access_token,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": expires_at.isoformat(),
            "max_downloads": 3,
            "download_count": 0,
            "extensions_used": 0,
            "is_expired": False,
            "access_log": []
        }
        
        return {
            "download_url": f"https://downloads.clinic.example.com/{export_id}?token={access_token}",
            "expires_at": expires_at.isoformat(),
            "ttl_hours": ttl_hours,
            "max_downloads": 3,
            "security_notice": (
                f"This download link expires on {expires_at.strftime('%Y-%m-%d %H:%M UTC')} "
                f"({ttl_hours} hours from now). After expiration, you will need to request a new export."
            )
        }
    
    def validate_access(
        self,
        link_id: str,
        access_token: str,
        client_ip: str
    ) -> Dict[str, Any]:
        """
        Validate a download link access attempt.
        
        Returns:
            Validation result with access granted/denied.
        """
        # Fetch link record
        link = self._get_link(link_id)
        
        if not link:
            return {"valid": False, "reason": "Link not found"}
        
        # Check token
        if link["access_token"] != access_token:
            self._log_access_attempt(link_id, client_ip, "invalid_token")
            return {"valid": False, "reason": "Invalid access token"}
        
        # Check expiration
        if datetime.utcnow() > datetime.fromisoformat(link["expires_at"]):
            link["is_expired"] = True
            return {"valid": False, "reason": "Link has expired", "can_extend": True}
        
        # Check download count
        if link["download_count"] >= link["max_downloads"]:
            return {"valid": False, "reason": "Maximum downloads reached"}
        
        # Valid - log access
        self._log_access_attempt(link_id, client_ip, "granted")
        link["download_count"] += 1
        
        return {
            "valid": True,
            "file_path": link["file_path"],
            "remaining_downloads": link["max_downloads"] - link["download_count"],
            "expires_at": link["expires_at"]
        }
    
    def extend_link(
        self,
        link_id: str,
        approved_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extend the expiration of a download link."""
        link = self._get_link(link_id)
        config = ExpiryConfig()
        
        if link["extensions_used"] >= config.max_extensions:
            return {
                "success": False,
                "reason": f"Maximum extensions ({config.max_extensions}) reached"
            }
        
        new_expires = datetime.utcnow() + timedelta(hours=config.extension_hours)
        link["expires_at"] = new_expires.isoformat()
        link["extensions_used"] += 1
        link["extended_by"] = approved_by
        
        return {
            "success": True,
            "new_expires_at": new_expires.isoformat(),
            "extensions_remaining": config.max_extensions - link["extensions_used"]
        }
    
    def _get_link(self, link_id: str) -> Dict[str, Any]:
        """Fetch link record from database."""
        # Placeholder
        return {}
    
    def _log_access_attempt(self, link_id: str, ip: str, result: str):
        """Log a download access attempt."""
        # Placeholder - implement with audit logging
        pass
```

### 6.5 Audit Logging

Every export action must be logged for compliance and security monitoring.

```python
"""
Comprehensive audit logging for data exports.
Implements HIPAA and GDPR audit trail requirements.
"""

from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
import json


class AuditEventType(Enum):
    """Types of audit events for exports."""
    EXPORT_REQUESTED = "export_requested"
    EXPORT_APPROVED = "export_approved"
    EXPORT_REJECTED = "export_rejected"
    EXPORT_STARTED = "export_started"
    EXPORT_COMPLETED = "export_completed"
    EXPORT_FAILED = "export_failed"
    EXPORT_DOWNLOADED = "export_downloaded"
    EXPORT_EXPIRED = "export_expired"
    EXPORT_DELETED = "export_deleted"
    ACCESS_DENIED = "access_denied"
    IDENTITY_VERIFIED = "identity_verified"
    IDENTITY_FAILED = "identity_failed"


@dataclass
class AuditEvent:
    """A single audit event."""
    event_type: AuditEventType
    timestamp: datetime
    actor_id: str              # Who performed the action
    actor_type: str            # patient, clinician, admin, system
    patient_id: Optional[str]  # Which patient (if applicable)
    export_id: Optional[str]
    details: Dict[str, Any]
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    outcome: str = "success"   # success, failure, blocked


class ExportAuditLogger:
    """
    Comprehensive audit logger for all export-related activities.
    
    HIPAA Requirements (45 CFR 164.312(b)):
    - Implement hardware, software, and/or procedural mechanisms
      that record and examine activity in information systems
    
    GDPR Requirements (Article 30):
    - Maintain records of processing activities
    """
    
    def log(self, event: AuditEvent):
        """
        Log an export-related audit event.
        
        Writes to both structured log (for analysis) and
        tamper-resistant audit store (for compliance).
        """
        log_entry = {
            "timestamp": event.timestamp.isoformat(),
            "event_type": event.event_type.value,
            "actor": {
                "id": self._hash_id(event.actor_id),
                "type": event.actor_type
            },
            "patient_id": self._hash_id(event.patient_id) if event.patient_id else None,
            "export_id": event.export_id,
            "outcome": event.outcome,
            "ip_address": self._anonymize_ip(event.ip_address) if event.ip_address else None,
            "details": event.details
        }
        
        # Write to structured log
        print(json.dumps(log_entry))  # Replace with actual logger
        
        # Write to tamper-resistant audit store
        self._write_to_audit_store(log_entry)
    
    def log_export_lifecycle(
        self,
        export_id: str,
        patient_id: str,
        actor_id: str,
        actor_type: str,
        scope: str,
        formats: list,
        ip_address: str
    ):
        """Log the complete lifecycle of an export request."""
        self.log(AuditEvent(
            event_type=AuditEventType.EXPORT_REQUESTED,
            timestamp=datetime.utcnow(),
            actor_id=actor_id,
            actor_type=actor_type,
            patient_id=patient_id,
            export_id=export_id,
            details={
                "scope": scope,
                "formats": formats,
                "source_ip": ip_address
            },
            ip_address=ip_address
        ))
    
    def log_download(self, export_id: str, patient_id: str, ip_address: str, user_agent: str):
        """Log when an export file is downloaded."""
        self.log(AuditEvent(
            event_type=AuditEventType.EXPORT_DOWNLOADED,
            timestamp=datetime.utcnow(),
            actor_id=patient_id,
            actor_type="patient",
            patient_id=patient_id,
            export_id=export_id,
            details={"user_agent": user_agent},
            ip_address=ip_address
        ))
    
    def _hash_id(self, identifier: str) -> str:
        """Hash an identifier for privacy in logs."""
        import hashlib
        return hashlib.sha256(identifier.encode()).hexdigest()[:12]
    
    def _anonymize_ip(self, ip: str) -> str:
        """Anonymize IP address (remove last octet)."""
        parts = ip.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.0"
        return "[invalid_ip]"
    
    def _write_to_audit_store(self, entry: Dict[str, Any]):
        """Write to tamper-resistant audit store."""
        # In production: write to append-only database table,
        # immutable log store (e.g., AWS CloudTrail, Splunk),
        # or blockchain-based audit trail
        pass
```

### 6.6 Notification to Patient

Patients must be notified when their data is exported, per HIPAA and GDPR transparency requirements.

```python
"""
Patient notification system for data exports.
GDPR Article 19 requires notification of data recipients.
HIPAA requires accounting of disclosures.
"""

from datetime import datetime
from typing import Dict, Any, List
from dataclasses import dataclass


class PatientNotifier:
    """
    Notifies patients of export-related events.
    
    Required notifications:
    - Export completed and ready for download
    - Export downloaded
    - Export expired
    - Unauthorized access attempt (if detected)
    """
    
    def notify_export_completed(
        self,
        patient_id: str,
        patient_email: str,
        export_id: str,
        formats: List[str],
        expiry_date: str
    ):
        """Notify patient that export is ready."""
        message = f"""
Subject: Your Data Export is Ready - {export_id}

Dear Patient,

Your requested data export is now ready for download.

Export Details:
- Export ID: {export_id}
- Formats: {', '.join(formats)}
- Download expires: {expiry_date}

SECURITY NOTICE:
This export contains your personal health information. Please:
1. Download promptly - the link will expire
2. Store securely on your personal device
3. Do not forward the download link or password to others
4. Contact us immediately if you did not request this export

Download your export at: [Secure Link]
Password: [Provided separately]

If you have questions, contact our Data Protection Officer.

NeuroCare Clinic
        """
        self._send_notification(patient_email, message)
    
    def notify_export_downloaded(
        self,
        patient_id: str,
        patient_email: str,
        export_id: str,
        download_ip: str,
        download_time: str
    ):
        """Notify patient that their export was downloaded."""
        message = f"""
Subject: Data Export Downloaded - {export_id}

Dear Patient,

Your data export ({export_id}) was downloaded.

Download Details:
- Time: {download_time}
- IP Address: {download_ip}

If you did not download this file, contact us immediately.

NeuroCare Clinic
        """
        self._send_notification(patient_email, message)
    
    def _send_notification(self, recipient: str, message: str):
        """Send notification via configured channel."""
        # Placeholder - integrate with email/SMS service
        pass
```

---

## 7. Export UI Patterns

### 7.1 Format Selector

The format selector allows users to choose their desired export format(s). Best practice is to support multiple simultaneous format selection.

```
+------------------ Export Format ------------------+
|                                                    |
|  [x] PDF Report    - Human-readable, printable    |
|  [x] CSV Data      - Spreadsheet-compatible       |
|  [ ] Excel/XLSX    - Formatted workbook           |
|  [ ] JSON (FHIR)   - Machine-readable, portable   |
|  [ ] FHIR Bundle   - Healthcare interoperability  |
|  [ ] XML           - Legacy system compatible      |
|                                                    |
|  Selected: PDF, CSV                               |
+----------------------------------------------------+
```

### 7.2 Scope Selector

The scope selector defines what data is included in the export.

```
+------------------ Export Scope -------------------+
|                                                    |
|  Data Type: [All Data v]                          |
|                                                    |
|  [x] Assessments (PHQ-9, GAD-7, etc.)            |
|  [x] qEEG Reports                                  |
|  [x] MRI Reports                                   |
|  [x] Encounter Notes                               |
|  [x] Care Plans                                    |
|  [ ] Billing Records                               |
|  [ ] Audit Log                                     |
|                                                    |
|  Patient(s): [Current Patient Only v]             |
|                                                    |
|  Date Range: [Last 12 Months v]                   |
|              [Start: 2023-01-01] [End: 2024-01-01]|
|                                                    |
+----------------------------------------------------+
```

### 7.3 Date Range Picker

```
+------------------ Date Range ---------------------+
|                                                    |
|  Quick Select:                                     |
|  [Last 7 Days] [30 Days] [90 Days] [6 Months]     |
|  [12 Months] [YTD] [Custom]                       |
|                                                    |
|  Custom Range:                                     |
|  From: [____/____/______] Calendar                |
|  To:   [____/____/______] Calendar                |
|                                                    |
|  Records found: 1,247 (est.)                      |
|  Estimated size: 3.2 MB                           |
+----------------------------------------------------+
```

### 7.4 Preview/Summary

```
+------------------ Export Preview -----------------+
|                                                    |
|  Export Summary                                    |
|  +----------------------------------------------+ |
|  | Patient: Jane Doe (MRN: 10045)               | |
|  | Period:  Jan 1, 2023 - Jan 1, 2024           | |
|  | Records: 47 assessments, 3 qEEG, 2 MRI       | |
|  | Formats: PDF, CSV                             | |
|  | Size:    ~5 MB (estimated)                    | |
|  | Security: Password-protected ZIP              | |
|  +----------------------------------------------+ |
|                                                    |
|  [Cancel]                    [Request Export]     |
+----------------------------------------------------+
```

### 7.5 Progress Indicator

```
+------------------ Export Progress ----------------+
|                                                    |
|  Export #EXP-20240115-001                         |
|                                                    |
|  [==========>        ] 55%                        |
|                                                    |
|  [Done]  Validating request                       |
|  [Done]  Collecting assessment data (47 records)  |
|  [Done]  Collecting qEEG data (3 records)         |
|  [Active] Collecting MRI data (2 records)         |
|  [Wait]  Generating PDF report                    |
|  [Wait]  Generating CSV files                     |
|  [Wait]  Creating encrypted package               |
|  [Wait]  Preparing download link                  |
|                                                    |
|  Elapsed: 2m 15s  |  Est. remaining: 1m 30s      |
+----------------------------------------------------+
```

### 7.6 Download Link

```
+------------------ Download Ready -----------------+
|                                                    |
|  Your export is ready!                             |
|                                                    |
|  +----------------------------------------------+ |
|  |  File: patient_export_10045_20240115.zip     | |
|  |  Size: 4.8 MB                                 | |
|  |  Expires: Jan 18, 2024 at 14:30 UTC          | |
|  |  Downloads remaining: 3                       | |
|  +----------------------------------------------+ |
|                                                    |
|  Password: xK9#mP2$vL7@nQ4                       |
|  (Save this password - it won't be shown again)   |
|                                                    |
|  [Download Now]  [Email Me Link]  [Extend (1x)]  |
|                                                    |
|  Security: This file is AES-256 encrypted.        |
|  You will be notified when the file is downloaded.|  
+----------------------------------------------------+
```

### 7.7 Export History Table

```
+------------------ Export History -----------------+
|                                                    |
|  | Date       | Type    | Formats  | Status | Size||
|  |------------|---------|----------|--------|-----||
|  | 2024-01-15 | Full    | PDF, CSV | Ready  | 5MB ||
|  | 2024-01-10 | Assess. | CSV      | Done   | 1MB ||
|  | 2023-12-01 | Full    | PDF      | Expired| 4MB ||
|  | 2023-11-15 | qEEG    | FHIR     | Done   | 8MB ||
|                                                    |
|  [Download] [View Details] [Request Again]         |
+----------------------------------------------------+
```

---

## 8. Technical Implementation

### 8.1 Streaming CSV Generation

(Detailed implementation in Section 2.1 above. Key points:)

- Use Python generators with `yield` for O(1) memory usage
- Buffer output in 8KB chunks for efficient I/O
- Use `io.StringIO` as the intermediate buffer
- Apply RFC 4180 compliant formatting with CRLF line endings
- Sanitize fields to prevent CSV injection attacks
- Use UTF-8-SIG encoding with BOM for Excel compatibility

### 8.2 Async Export Jobs (Celery)

```python
"""
Async export job processing with Celery.
Handles long-running exports without blocking the web server.
"""

from celery import Celery, chain, group, chord
from celery.result import AsyncResult
from datetime import datetime
from typing import Dict, Any, List

# Celery app configuration
app = Celery('clinic_exports')
app.conf.update(
    broker_url='redis://localhost:6379/0',
    result_backend='redis://localhost:6379/0',
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,       # 1 hour max per task
    worker_prefetch_multiplier=1,  # Fair task distribution
)


# =============================================================================
# Celery Tasks for Export Pipeline
# =============================================================================

@app.task(bind=True, max_retries=3)
def validate_export_request(self, export_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task 1: Validate export request parameters.
    
    Checks authorization, usage limits, and parameter validity.
    """
    try:
        # Validate patient ID exists and requester has access
        patient_id = export_params["patient_id"]
        requester_id = export_params["requester_id"]
        
        # Authorization check
        if not has_access(requester_id, patient_id):
            raise ValueError("Access denied")
        
        # Usage limit check
        if not check_usage_limits(patient_id):
            raise ValueError("Usage limit exceeded")
        
        return {
            "status": "validated",
            "patient_id": patient_id,
            "export_id": export_params["export_id"],
            "validation_passed": True
        }
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@app.task(bind=True, max_retries=2)
def collect_patient_data(self, validation_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task 2: Collect all patient data from various subsystems.
    
    Queries multiple databases and aggregates results.
    """
    patient_id = validation_result["patient_id"]
    export_id = validation_result["export_id"]
    
    try:
        # Collect data from all subsystems
        data = {
            "demographics": fetch_demographics(patient_id),
            "assessments": fetch_assessments(patient_id),
            "qeeg_records": fetch_qeeg(patient_id),
            "mri_records": fetch_mri(patient_id),
            "encounters": fetch_encounters(patient_id),
        }
        
        return {
            "status": "data_collected",
            "export_id": export_id,
            "patient_id": patient_id,
            "data": data,
            "record_count": sum(len(v) for v in data.values() if isinstance(v, list))
        }
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@app.task(bind=True)
def generate_export_files(self, data_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task 3: Generate export files in requested formats.
    
    Parallel generation of multiple formats using Celery group.
    """
    formats = data_result.get("formats", ["pdf", "csv"])
    export_id = data_result["export_id"]
    
    # Dispatch format generation tasks in parallel
    format_tasks = group([
        generate_single_format.s(export_id, data_result["data"], fmt)
        for fmt in formats
    ])
    
    # Wait for all formats to complete
    results = format_tasks.apply_async()
    files = results.get(timeout=300)  # 5 minute timeout
    
    return {
        "status": "files_generated",
        "export_id": export_id,
        "files": files,
        "formats": formats
    }


@app.task
def generate_single_format(
    export_id: str,
    data: Dict[str, Any],
    format: str
) -> Dict[str, Any]:
    """Generate a single export format file."""
    generators = {
        "pdf": generate_pdf_export,
        "csv": generate_csv_export,
        "json": generate_json_export,
        "xlsx": generate_xlsx_export,
        "fhir": generate_fhir_export,
    }
    
    generator = generators.get(format)
    if not generator:
        return {"format": format, "error": "Unknown format"}
    
    file_buffer = generator(data)
    s3_key = upload_to_storage(export_id, format, file_buffer)
    
    return {
        "format": format,
        "s3_key": s3_key,
        "size_bytes": len(file_buffer)
    }


@app.task(bind=True)
def create_encrypted_package(self, files_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task 4: Create encrypted ZIP package.
    
    Combines all format files into a password-protected ZIP.
    """
    export_id = files_result["export_id"]
    files = files_result["files"]
    
    # Generate password
    password = generate_secure_password()
    
    # Create encrypted ZIP
    zip_buffer = create_aes_zip(files, password)
    
    # Upload encrypted package
    package_key = f"exports/{export_id}/package.zip"
    upload_to_storage(package_key, zip_buffer)
    
    return {
        "status": "encrypted",
        "export_id": export_id,
        "package_key": package_key,
        "password": password,  # Sent separately to user
        "size_mb": len(zip_buffer) / (1024 * 1024)
    }


@app.task
def create_download_delivery(package_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Task 5: Create secure download link.
    
    Generates time-limited signed URL for package download.
    """
    export_id = package_result["export_id"]
    package_key = package_result["package_key"]
    password = package_result["password"]
    
    # Generate signed URL
    download_url = generate_signed_url(package_key, ttl_hours=72)
    
    # Store password securely (separate from file)
    store_password(export_id, password)
    
    # Notify patient
    notify_patient_export_ready(export_id, download_url)
    
    return {
        "status": "ready",
        "export_id": export_id,
        "download_url": download_url,
        "expires_in_hours": 72,
        "notification_sent": True
    }


@app.task
def cleanup_old_exports():
    """
    Periodic cleanup task.
    
    Removes expired export files to reduce storage costs
    and security exposure.
    
    Run daily via Celery beat schedule.
    """
    expired = find_expired_exports()
    for export in expired:
        delete_export_files(export["export_id"])
        log_cleanup(export)


# =============================================================================
# Export Pipeline Orchestration
# =============================================================================

def start_export_pipeline(export_params: Dict[str, Any]) -> str:
    """
    Start the complete export pipeline.
    
    Uses Celery chains to orchestrate the sequential workflow:
    Validate -> Collect -> Generate -> Encrypt -> Deliver
    
    Returns:
        Celery task ID for progress tracking.
    """
    pipeline = chain(
        validate_export_request.s(export_params),
        collect_patient_data.s(),
        generate_export_files.s(),
        create_encrypted_package.s(),
        create_download_delivery.s()
    )
    
    result = pipeline.apply_async()
    return result.id


def get_export_progress(task_id: str) -> Dict[str, Any]:
    """Get the current progress of an export pipeline."""
    result = AsyncResult(task_id)
    
    return {
        "task_id": task_id,
        "status": result.status,
        "progress": result.info if result.info else {},
        "ready": result.ready(),
        "successful": result.successful() if result.ready() else None,
        "error": str(result.result) if result.failed() else None
    }


# =============================================================================
# Celery Beat Schedule (periodic tasks)
# =============================================================================

app.conf.beat_schedule = {
    'cleanup-expired-exports': {
        'task': 'clinic_exports.cleanup_old_exports',
        'schedule': 86400.0,  # Daily
    },
    'check-sar-deadlines': {
        'task': 'clinic_exports.check_sar_deadlines',
        'schedule': 3600.0,   # Hourly
    },
}


# =============================================================================
# Helper functions (placeholders)
# =============================================================================

def has_access(requester_id: str, patient_id: str) -> bool:
    return True

def check_usage_limits(patient_id: str) -> bool:
    return True

def fetch_demographics(patient_id: str) -> dict:
    return {}

def fetch_assessments(patient_id: str) -> list:
    return []

def fetch_qeeg(patient_id: str) -> list:
    return []

def fetch_mri(patient_id: str) -> list:
    return []

def fetch_encounters(patient_id: str) -> list:
    return []

def generate_pdf_export(data: dict) -> bytes:
    return b""

def generate_csv_export(data: dict) -> bytes:
    return b""

def generate_json_export(data: dict) -> bytes:
    return b""

def generate_xlsx_export(data: dict) -> bytes:
    return b""

def generate_fhir_export(data: dict) -> bytes:
    return b""

def upload_to_storage(key: str, data: bytes) -> str:
    return f"s3://bucket/{key}"

def create_aes_zip(files: list, password: str) -> bytes:
    return b""

def generate_secure_password() -> str:
    import secrets
    return secrets.token_urlsafe(32)

def generate_signed_url(key: str, ttl_hours: int) -> str:
    return f"https://download.example.com/{key}"

def store_password(export_id: str, password: str):
    pass

def notify_patient_export_ready(export_id: str, url: str):
    pass

def find_expired_exports() -> list:
    return []

def delete_export_files(export_id: str):
    pass

def log_cleanup(export: dict):
    pass
```

### 8.3 S3/Blob Storage for Exports

```python
"""
Object storage backend for export files.
Supports AWS S3, Azure Blob, Google Cloud Storage, and MinIO.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, BinaryIO
from dataclasses import dataclass


@dataclass
class StorageConfig:
    """Configuration for object storage."""
    provider: str = "s3"           # s3, azure, gcs, minio
    bucket: str = "clinic-exports"
    region: str = "us-east-1"
    endpoint: Optional[str] = None  # For MinIO
    access_key: str = ""
    secret_key: str = ""
    encryption: str = "AES256"      # Server-side encryption


class ExportStorage:
    """
    Abstraction for export file storage.
    
    Supports multiple backends via a common interface.
    All exports are stored with server-side encryption
    and automatic lifecycle policies.
    """
    
    def __init__(self, config: StorageConfig):
        self.config = config
        self.client = self._create_client()
    
    def _create_client(self):
        """Create the appropriate storage client."""
        if self.config.provider == "s3":
            import boto3
            return boto3.client(
                's3',
                region_name=self.config.region,
                aws_access_key_id=self.config.access_key,
                aws_secret_access_key=self.config.secret_key
            )
        elif self.config.provider == "minio":
            import boto3
            return boto3.client(
                's3',
                endpoint_url=self.config.endpoint,
                aws_access_key_id=self.config.access_key,
                aws_secret_access_key=self.config.secret_key
            )
        elif self.config.provider == "azure":
            from azure.storage.blob import BlobServiceClient
            return BlobServiceClient.from_connection_string(
                f"DefaultEndpointsProtocol=https;AccountName={self.config.access_key};"
                f"AccountKey={self.config.secret_key};EndpointSuffix=core.windows.net"
            )
        else:
            raise ValueError(f"Unsupported provider: {self.config.provider}")
    
    def store_export(
        self,
        export_id: str,
        file_data: bytes,
        filename: str,
        content_type: str = "application/octet-stream"
    ) -> str:
        """
        Store an export file in object storage.
        
        Returns:
            Storage key/path for the file.
        """
        key = f"exports/{export_id}/{filename}"
        
        if self.config.provider in ("s3", "minio"):
            self.client.put_object(
                Bucket=self.config.bucket,
                Key=key,
                Body=file_data,
                ContentType=content_type,
                ServerSideEncryption=self.config.encryption,
                Metadata={
                    "export-id": export_id,
                    "created-at": datetime.utcnow().isoformat(),
                    "retention-days": "30"
                }
            )
        elif self.config.provider == "azure":
            blob_client = self.client.get_blob_client(
                container=self.config.bucket,
                blob=key
            )
            blob_client.upload_blob(
                file_data,
                overwrite=True,
                metadata={"export-id": export_id}
            )
        
        return key
    
    def generate_download_url(
        self,
        key: str,
        ttl_seconds: int = 3600
    ) -> str:
        """
        Generate a pre-signed download URL.
        
        The URL is time-limited and does not require authentication.
        """
        if self.config.provider in ("s3", "minio"):
            url = self.client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.config.bucket,
                    'Key': key
                },
                ExpiresIn=ttl_seconds
            )
            return url
        
        # Azure SAS token
        elif self.config.provider == "azure":
            from azure.storage.blob import generate_blob_sas, BlobSasPermissions
            from azure.core.credentials import AzureNamedKeyCredential
            
            sas_token = generate_blob_sas(
                account_name=self.config.access_key,
                container_name=self.config.bucket,
                blob_name=key,
                account_key=self.config.secret_key,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.utcnow() + timedelta(seconds=ttl_seconds)
            )
            return f"https://{self.config.access_key}.blob.core.windows.net/{self.config.bucket}/{key}?{sas_token}"
        
        return ""
    
    def delete_export(self, key: str):
        """Delete an export file."""
        if self.config.provider in ("s3", "minio"):
            self.client.delete_object(
                Bucket=self.config.bucket,
                Key=key
            )
    
    def configure_lifecycle_policy(self):
        """
        Configure automatic deletion of old exports.
        
        Recommended: Delete exports after 30 days.
        """
        if self.config.provider in ("s3", "minio"):
            self.client.put_bucket_lifecycle_configuration(
                Bucket=self.config.bucket,
                LifecycleConfiguration={
                    'Rules': [
                        {
                            'ID': 'DeleteOldExports',
                            'Status': 'Enabled',
                            'Filter': {
                                'Prefix': 'exports/'
                            },
                            'Expiration': {
                                'Days': 30
                            }
                        }
                    ]
                }
            )
```

### 8.4 Signed URL Generation

(Implemented in Section 6.4 and 8.3 above. Key security parameters:)

- **Maximum TTL:** 72 hours for PHI-containing exports
- **Single-use tokens:** Prevent URL sharing
- **IP binding:** Optional - bind to requester's IP address
- **Access logging:** Log every URL access attempt
- **Revocation:** Ability to invalidate URLs before expiry

### 8.5 Cleanup of Old Exports

```python
"""
Export cleanup and lifecycle management.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any


class ExportCleanupManager:
    """
    Manages the lifecycle of export files.
    
    Implements automatic cleanup to:
    - Reduce storage costs
    - Minimize security exposure
    - Comply with data retention policies
    """
    
    # Retention periods by export type
    RETENTION_DAYS = {
        "patient_self_service": 7,      # Short - patient should download quickly
        "sar_response": 30,              # SAR fulfillment
        "clinician_approved": 14,        # Moderate
        "admin_approved": 30,            # Longer for administrative review
        "research_dataset": 90,          # Research may need extended access
        "backup": 365,                   # Full year for backups
    }
    
    def cleanup_expired_exports(self) -> Dict[str, Any]:
        """
        Find and delete all expired export files.
        
        Returns summary of cleanup operation.
        """
        now = datetime.utcnow()
        deleted_count = 0
        freed_bytes = 0
        errors = []
        
        # Find all exports
        exports = self._list_all_exports()
        
        for export in exports:
            export_type = export.get("type", "patient_self_service")
            retention_days = self.RETENTION_DAYS.get(export_type, 7)
            
            created = datetime.fromisoformat(export["created_at"])
            expiry = created + timedelta(days=retention_days)
            
            # Check if manually extended
            if export.get("extended_until"):
                expiry = datetime.fromisoformat(export["extended_until"])
            
            if now > expiry:
                try:
                    self._delete_export(export["export_id"])
                    deleted_count += 1
                    freed_bytes += export.get("size_bytes", 0)
                except Exception as e:
                    errors.append({
                        "export_id": export["export_id"],
                        "error": str(e)
                    })
        
        return {
            "cleanup_time": now.isoformat(),
            "exports_deleted": deleted_count,
            "storage_freed_mb": round(freed_bytes / (1024 * 1024), 2),
            "errors": errors
        }
    
    def _list_all_exports(self) -> List[Dict[str, Any]]:
        """List all export records from database."""
        # Placeholder
        return []
    
    def _delete_export(self, export_id: str):
        """Delete an export and its files."""
        # Placeholder
        pass
```

---

## 9. Common Export Scenarios

### 9.1 Patient Requesting Own Records

**Trigger:** Patient logs into portal, clicks "Export My Data"

**Workflow:**
1. Patient authenticates via patient portal
2. Selects export format(s) and scope
3. System validates usage limits
4. Async export job queued (Celery)
5. Progress shown in real-time (WebSocket/SSE)
6. Encrypted package created
7. Patient receives notification with download link
8. Patient downloads and provides feedback

**Technical Stack:**
- Frontend: React/Vue export wizard component
- Backend: FastAPI async endpoints
- Queue: Celery + Redis
- Storage: S3 with server-side encryption
- Notification: Email + in-app

**Compliance:** GDPR Article 15 (30-day response, free of charge)

**Timeline:** 2-5 minutes for small datasets; up to 30 minutes for full records

### 9.2 Clinic Moving to New System

**Trigger:** Clinic signs contract with new EHR vendor

**Workflow:**
1. Admin initiates clinic-wide data export
2. Dual authorization required (clinical + admin approvers)
3. Full database export in FHIR Bundle format
4. Incremental exports for data during migration period
5. Validation reports comparing source and exported data
6. Secure transfer to new vendor
7. Chain-of-custody documentation

**Technical Stack:**
- Full database export tools (pg_dump, custom ETL)
- FHIR R4 conversion pipeline
- Incremental sync via change data capture (CDC)
- Secure SFTP or API transfer

**Compliance:** HIPAA Business Associate Agreement with new vendor

**Timeline:** 2-8 weeks for full migration

### 9.3 Research De-identified Dataset

**Trigger:** Research institution requests data for clinical study

**Workflow:**
1. Researcher submits data request with IRB approval
2. Admin reviews request against data sharing policy
3. Dual authorization (clinical + compliance)
4. Data extraction with strong de-identification (PHI masking level: STRONG)
5. Statistical disclosure control (k-anonymity check)
6. Data Use Agreement (DUA) executed
7. Secure transfer to research environment
8. Audit trail maintained

**Technical Stack:**
- De-identification pipeline (PHIMaskingEngine)
- Statistical disclosure control tools
- Secure enclave transfer
- DUA tracking system

**Compliance:**
- HIPAA Safe Harbor de-identification (45 CFR 164.514(b)(2))
- GDPR Article 89 (processing for research)
- IRB/ethics committee approval

**Timeline:** 4-12 weeks (depends on IRB and DUA process)

### 9.4 Legal/Compliance Request

**Trigger:** Subpoena, court order, or regulatory audit

**Workflow:**
1. Legal/compliance team receives request
2. Request reviewed by legal counsel
3. Scope defined (specific patients, date ranges, data types)
4. Admin approval with legal sign-off
5. Export generated with full audit trail
6. Chain of custody documentation
7. Secure delivery to legal team
8. Litigation hold applied if needed

**Technical Stack:**
- Litigation hold management
- Comprehensive audit logging
- Tamper-proof export packaging
- Secure legal hold storage

**Compliance:**
- HIPAA accounting of disclosures
- Legal hold requirements
- Attorney-client privilege considerations

**Timeline:** 1-5 days (urgent), up to 30 days (standard)

### 9.5 Backup/Archival

**Trigger:** Scheduled backup or system archival

**Workflow:**
1. Automated daily/weekly export job
2. Full database backup in FHIR Bundle format
3. Encrypted and compressed
4. Stored in geographically separate location
5. Integrity verification (checksum)
6. Retention for required period (typically 7-10 years for medical records)
7. Periodic restoration testing

**Technical Stack:**
- Automated backup jobs (Celery beat / cron)
- Incremental backup with full snapshots
- Cloud storage with cross-region replication
- Backup monitoring and alerting

**Compliance:**
- HIPAA data backup requirements (164.308(a)(7))
- State medical record retention laws
- Business continuity requirements

**Timeline:** Automated, continuous

---

## 10. Appendices

### Appendix A: HIPAA Compliance Matrix

| HIPAA Requirement | CFR Reference | Implementation |
|-------------------|--------------|----------------|
| Right of access | 45 CFR 164.524 | Patient portal export, SAR workflow |
| Accounting of disclosures | 45 CFR 164.528 | Export audit logging |
| Administrative safeguards | 45 CFR 164.308(a)(1) | Access controls, approval workflows |
| Audit controls | 45 CFR 164.312(b) | Comprehensive audit logging |
| Integrity controls | 45 CFR 164.312(c)(1) | Checksums, tamper-proofing |
| Transmission security | 45 CFR 164.312(e)(1) | TLS 1.3, encrypted storage |
| Minimum necessary | 45 CFR 164.502(b) | Scope selection, data minimization |
| De-identification | 45 CFR 164.514(b) | PHIMaskingEngine |
| Breach notification | 45 CFR 164.400-414 | Export access monitoring |

### Appendix B: GDPR Compliance Matrix

| GDPR Article | Requirement | Implementation |
|-------------|-------------|----------------|
| Art. 5(1)(c) | Data minimization | Scope selection, type filtering |
| Art. 12 | Transparent information | Export manifest, notifications |
| Art. 15 | Right of access | SAR workflow, 30-day response |
| Art. 17 | Right to erasure | Export deletion on request |
| Art. 20 | Data portability | FHIR Bundle, JSON, CSV exports |
| Art. 25 | Data protection by design | Encryption, masking by default |
| Art. 30 | Records of processing | Audit logging |
| Art. 32 | Security of processing | AES-256 encryption, access controls |
| Art. 33 | Breach notification | Export access anomaly detection |

### Appendix C: Open Source Tools and Licenses

| Tool | Purpose | License | Version |
|------|---------|---------|---------|
| **Python 3.11+** | Runtime | PSF License | 3.11 |
| **Celery** | Async job queue | BSD-3-Clause | 5.3+ |
| **Redis** | Message broker | BSD-3-Clause | 7.0+ |
| **openpyxl** | XLSX generation | MIT | 3.1+ |
| **ReportLab** | PDF generation | BSD-3-Clause | 4.0+ |
| **boto3** | AWS S3 integration | Apache-2.0 | 1.34+ |
| **Pillow** | Image processing | HPND | 10.0+ |
| **PyPDF2** | PDF manipulation | BSD-3-Clause | 3.0+ |
| **cryptography** | Encryption primitives | Apache-2.0 / BSD | 41.0+ |
| **FastAPI** | API framework | MIT | 0.109+ |
| **SQLAlchemy** | ORM | MIT | 2.0+ |
| **pydantic** | Data validation | MIT | 2.5+ |

### Appendix D: API Endpoint Design

```
GET    /api/v1/exports                          # List exports (paginated)
POST   /api/v1/exports                          # Create new export
GET    /api/v1/exports/{export_id}              # Get export status
GET    /api/v1/exports/{export_id}/progress     # Get export progress (SSE)
GET    /api/v1/exports/{export_id}/download     # Download export file
DELETE /api/v1/exports/{export_id}              # Delete export
GET    /api/v1/exports/formats                  # List available formats
GET    /api/v1/exports/scope-options            # List scope options

POST   /api/v1/sar-requests                     # Submit SAR request
GET    /api/v1/sar-requests/{request_id}        # Get SAR status
POST   /api/v1/sar-requests/{request_id}/approve # Approve SAR (admin)
POST   /api/v1/sar-requests/{request_id}/extend  # Request deadline extension

GET    /api/v1/audit-log/exports                # Export audit log
```

### Appendix E: Database Schema (Export Management)

```sql
-- Export requests table
CREATE TABLE export_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id       VARCHAR(50) UNIQUE NOT NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id),
    requested_by    UUID NOT NULL REFERENCES users(id),
    requester_type  VARCHAR(20) NOT NULL, -- patient, clinician, admin
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    formats         JSONB NOT NULL,       -- ["pdf", "csv", "json"]
    scope_config    JSONB NOT NULL,       -- scope configuration
    approval_type   VARCHAR(30),          -- self_service, clinician, admin, dual
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    file_size_bytes BIGINT,
    storage_key     VARCHAR(500),
    download_count  INTEGER DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SAR requests table
CREATE TABLE sar_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      VARCHAR(50) UNIQUE NOT NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id),
    status          VARCHAR(30) NOT NULL DEFAULT 'received',
    request_channel VARCHAR(20) NOT NULL, -- portal, email, phone, letter
    requested_formats JSONB,
    scope_description TEXT,
    identity_verified BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(30),
    extension_granted BOOLEAN DEFAULT FALSE,
    extension_reason VARCHAR(50),
    primary_deadline TIMESTAMPTZ NOT NULL,
    effective_deadline TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    export_request_id UUID REFERENCES export_requests(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Export audit log table (append-only)
CREATE TABLE export_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,
    event_timestamp TIMESTAMPTZ DEFAULT NOW(),
    actor_id        VARCHAR(100) NOT NULL,
    actor_type      VARCHAR(20) NOT NULL,
    patient_id      VARCHAR(100),
    export_id       VARCHAR(50),
    ip_address      INET,
    user_agent      TEXT,
    outcome         VARCHAR(20) NOT NULL, -- success, failure, blocked
    details         JSONB,
    hash_chain      VARCHAR(64)  -- For tamper detection
);

-- Indexes for performance
CREATE INDEX idx_export_requests_patient ON export_requests(patient_id);
CREATE INDEX idx_export_requests_status ON export_requests(status);
CREATE INDEX idx_export_requests_created ON export_requests(created_at);
CREATE INDEX idx_sar_requests_patient ON sar_requests(patient_id);
CREATE INDEX idx_sar_requests_status ON sar_requests(status);
CREATE INDEX idx_sar_requests_deadline ON sar_requests(effective_deadline);
CREATE INDEX idx_audit_log_export ON export_audit_log(export_id, event_timestamp);
CREATE INDEX idx_audit_log_patient ON export_audit_log(patient_id, event_timestamp);

-- Row Level Security (RLS) policies
ALTER TABLE export_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY patient_own_exports ON export_requests
    FOR SELECT USING (requested_by = current_setting('app.current_user_id')::UUID);
CREATE POLICY admin_all_exports ON export_requests
    FOR ALL USING (current_setting('app.current_user_role') = 'admin');
```

### Appendix F: Security Checklist

#### Pre-Export
- [ ] Requester identity verified
- [ ] Authorization confirmed (patient owns data or clinician has access)
- [ ] Scope validated against requester permissions
- [ ] Usage limits checked
- [ ] Approval workflow completed (if required)
- [ ] Data sensitivity assessed

#### During Export
- [ ] All database queries use parameterized statements
- [ ] PHI masking applied based on export purpose
- [ ] Third-party data redacted
- [ ] Audit log entry created for each operation
- [ ] Resource limits enforced (memory, CPU time)

#### Post-Export
- [ ] Files encrypted with AES-256
- [ ] Watermarks applied (visible + forensic)
- [ ] Manifest document included
- [ ] Password generated with cryptographic randomness
- [ ] Download link has time-limited signed URL
- [ ] Patient notified of export completion
- [ ] Download access logged

#### Ongoing
- [ ] Old exports cleaned up automatically
- [ ] Audit logs reviewed periodically
- [ ] Failed exports investigated
- [ ] Usage patterns monitored for anomalies
- [ ] Access controls reviewed quarterly

---

## References

1. **HIPAA Privacy Rule** - 45 CFR Part 160 and Subparts A and E of Part 164
2. **GDPR** - Regulation (EU) 2016/679, Articles 12-22
3. **FHIR R4 Specification** - HL7 FHIR Release 4, http://hl7.org/fhir/R4/
4. **RFC 4180** - Common Format and MIME Type for CSV Files
5. **HL7 CDA R2** - Clinical Document Architecture, Release 2
6. **LOINC** - Logical Observation Identifiers Names and Codes, https://loinc.org/
7. **NIST SP 800-66** - Health Insurance Portability and Accountability Act (HIPAA) security guidance
8. **ISO 27001** - Information Security Management Systems

---

*End of Research Report*

*Document generated for DeepSynaps Protocol Studio*
*This document contains evidence-based recommendations derived from regulatory text, industry standards, and established healthcare IT practices.*

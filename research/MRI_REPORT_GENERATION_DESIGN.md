# MRI Clinical Report Generation: The Definitive Design Guide

## DeepSynaps Protocol Studio -- Research Document

**Version:** 1.0.0
**Date:** 2025
**Scope:** MRI clinical report generation standards, templates, tooling, safety frameworks, and export governance
**Target Audience:** Radiologists, ML engineers, clinical software architects, regulatory affairs

---

## Table of Contents

1. [Report Standards & Interoperability](#1-report-standards--interoperability)
   - 1.1 DICOM SR (Structured Reporting)
   - 1.2 HL7 FHIR ImagingStudy + DiagnosticReport
   - 1.3 RSNA Reporting Templates (RadReport)
   - 1.4 RadLex Terminology
   - 1.5 IHE MRRT Profile
2. [Report Anatomy: Section-by-Section Design](#2-report-anatomy-section-by-section-design)
   - 2.1 Clinical History
   - 2.2 Technique / Sequences
   - 2.3 Findings (Organized by Anatomy)
   - 2.4 Impression
   - 2.5 Recommendations
   - 2.6 Red Flags / Urgent Findings
   - 2.7 Biomarker Appendix
   - 2.8 Comparison with Prior
3. [Report Generation Tools](#3-report-generation-tools)
   - 3.1 WeasyPrint (HTML-to-PDF)
   - 3.2 python-docx (Word)
   - 3.3 ReportLab (Programmatic PDF)
   - 3.4 Jinja2 Template Engine
4. [Safety Wording Patterns](#4-safety-wording-patterns)
   - 4.1 Critical Findings Taxonomy
   - 4.2 Liability-Shielding Language
   - 4.3 Uncertainty Quantification Phrases
   - 4.4 Comparative Temporal Language
5. [Clinician Sign-Off Workflow](#5-clinician-sign-off-workflow)
   - 5.1 Draft -> Review -> Finalize -> Sign -> Distribute
   - 5.2 Digital Signature Standards
   - 5.3 Amendment / Addendum Protocol
6. [Export Governance](#6-export-governance)
   - 6.1 Data Retention Policies
   - 6.2 Format Compliance Matrix
   - 6.3 Audit Trail Requirements
   - 6.4 Cross-Border Transfer Regulations
7. [Complete Annotated Templates](#7-complete-annotated-templates)
   - 7.1 Brain MRI (Non-Contrast & Contrast-Enhanced)
   - 7.2 Spine MRI
   - 7.3 Knee MRI (MSK)
   - 7.4 Prostate MRI (mpMRI / PI-RADS)
8. [Appendices](#8-appendices)

---

## 1. Report Standards & Interoperability

### 1.1 DICOM SR (Structured Reporting)

DICOM Structured Reporting (SR) is the foundational standard for encoding imaging observations in a machine-readable, hierarchical tree structure. For MRI reporting, DICOM SR enables:

- **Discrete data capture:** Each finding is a coded content item, not free text
- **Image referencing:** Measurements and observations link directly to DICOM image coordinates
- **Reproducibility:** Same template produces same structure across vendors
- **Interoperability:** SR documents traverse DICOM network services (C-STORE, C-FIND, C-MOVE)

#### 1.1.1 DICOM SR Object Model

```
SR Document (SOP Class: 1.2.840.10008.5.1.4.1.1.88.67)
|
+-- Patient Module (0010xxxxx) -- demographics
+-- Study Module (0020xxxxx) -- StudyInstanceUID, AccessionNumber
+-- Equipment Module (0008xxxxx) -- generating system
+-- Document Module
    |
    +-- ContentSequence (0040,A730) -- recursive tree of Content Items
        |
        +-- ContentItem (TEXT, CODE, NUM, DATETIME, PNAME, COMPOSITE, IMAGE, etc.)
            +-- ConceptNameCodeSequence -- what is being reported
            +-- RelationshipType -- HAS PROPERTIES, INFERRED FROM, etc.
            +-- (Value) -- the actual content
```

#### 1.1.2 TID 2000: Basic Diagnostic Imaging Report

TID 2000 is the top-level template for all DICOM SR diagnostic imaging reports:

| Template Element | Value Type | Description |
|------------------|------------|-------------|
| Root Content Item | CODE | Coded report title (e.g., "MRI Brain") |
| Procedure Reported | CODE | Procedure from LOINC/SNOMED (e.g., LOINC 18748-4) |
| Clinical History | TEXT | Free-text clinical indication |
| Technique | TEXT / CONTAINER | Sequences, contrast, field strength |
| Comparison Study | TEXT | Prior study references |
| Findings | CONTAINER | Hierarchical anatomy-based findings |
| Impression | TEXT | Synthesized conclusion |
| Recommendation | TEXT | Follow-up recommendations |
| Physician | PNAME | Interpreting radiologist |
| Verification | CODE | Signed / Verified status |

**DICOM SR TID 2000 Template Structure (PS3.16):**

```text
TID 2000 -- Basic Diagnostic Imaging Report
|-- 1: Title (CODE) -- DCM 126000 "Imaging Report"
|-- 2: Procedure Reported (CODE) -- from CID 100
|-- 3: Clinical History (TEXT) -- optional
|-- 4: Technique (TEXT or CONTAINER) -- optional
|-- 5: Comparison Study (TEXT) -- optional
|-- 6: Findings (CONTAINER of CONTAINERs) -- organ system sections
|-- 7: Impression (TEXT) -- required
|-- 8: Recommendation (TEXT) -- optional
|-- 9: Physician (PNAME) -- interpreting physician
|-- 10: Verification (CODE) -- verification status
|-- 11: Key Images (IMAGE) -- optional references
```

#### 1.1.3 DICOM SR for MRI: Content Items

```python
# Example: DICOM SR Content Item for an MRI finding (Python/pydicom)
from pydicom.dataset import Dataset
from pydicom.sequence import Sequence

# Content item: Brain mass finding
finding_item = Dataset()
finding_item.ValueType = "CONTAINER"
finding_item.ConceptNameCodeSequence = Sequence([Dataset()])
finding_item.ConceptNameCodeSequence[0].CodeValue = "RID3874"
finding_item.ConceptNameCodeSequence[0].CodingSchemeDesignator = "RADLEX"
finding_item.ConceptNameCodeSequence[0].CodeMeaning = "Mass"

# Sub-item: Location
location_item = Dataset()
location_item.ValueType = "CODE"
location_item.ConceptNameCodeSequence = Sequence([Dataset()])
location_item.ConceptNameCodeSequence[0].CodeValue = "RID5827"
location_item.ConceptNameCodeSequence[0].CodingSchemeDesignator = "RADLEX"
location_item.ConceptNameCodeSequence[0].CodeMeaning = "Central"
location_item.ConceptCodeSequence = Sequence([Dataset()])
location_item.ConceptCodeSequence[0].CodeValue = "RID6391"
location_item.ConceptCodeSequence[0].CodingSchemeDesignator = "RADLEX"
location_item.ConceptCodeSequence[0].CodeMeaning = "Frontal brain region"

# Sub-item: Size measurement
size_item = Dataset()
size_item.ValueType = "NUM"
size_item.ConceptNameCodeSequence = Sequence([Dataset()])
size_item.ConceptNameCodeSequence[0].CodeValue = "RID13432"
size_item.ConceptNameCodeSequence[0].CodingSchemeDesignator = "RADLEX"
size_item.ConceptNameCodeSequence[0].CodeMeaning = "Diameter"
size_item.MeasuredValueSequence = Sequence([Dataset()])
size_item.MeasuredValueSequence[0].NumericValue = "32"
size_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence = Sequence([Dataset()])
size_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence[0].CodeValue = "mm"
size_item.MeasuredValueSequence[0].MeasurementUnitsCodeSequence[0].CodingSchemeDesignator = "UCUM"

# Image reference
image_ref = Dataset()
image_ref.ValueType = "IMAGE"
image_ref.ReferencedSOPSequence = Sequence([Dataset()])
image_ref.ReferencedSOPSequence[0].ReferencedSOPClassUID = "1.2.840.10008.5.1.4.1.1.4"  # MR Image
image_ref.ReferencedSOPSequence[0].ReferencedSOPInstanceUID = "1.2.3.4.5.6.7.8.9"
```

#### 1.1.4 DICOM SR Storage & Network Services

```python
# DICOM SR C-STORE operation (using pynetdicom)
from pynetdicom import AE, evt, build_context
from pynetdicom.sop_class import BasicTextSRStorage

ae = AE()
ae.add_requested_context(BasicTextSRStorage)

assoc = ae.associate("PACS_HOST", 11112)
if assoc.is_established:
    status = assoc.send_c_store(sr_dataset)
    assoc.release()
```

#### 1.1.5 Installation (pydicom for DICOM SR)

```bash
pip install pydicom pynetdicom
```

---

### 1.2 HL7 FHIR ImagingStudy + DiagnosticReport

FHIR provides a RESTful, modern web-based framework for exchanging imaging reports. For MRI workflows, two resources are primary:

#### 1.2.1 FHIR ImagingStudy Resource

The ImagingStudy resource encapsulates the DICOM study metadata and enables image retrieval via WADO-RS.

```json
{
  "resourceType": "ImagingStudy",
  "id": "mri-brain-2025-001",
  "identifier": [
    {
      "system": "urn:dicom:uid",
      "value": "urn:oid:1.2.840.113747.20080222.83311413144566317081790268995"
    },
    {
      "system": "http://hospital.org/accession",
      "value": "ACC-2025-000123"
    }
  ],
  "status": "available",
  "modality": [
    {
      "system": "http://dicom.nema.org/resources/ontology/DCM",
      "code": "MR",
      "display": "Magnetic Resonance"
    }
  ],
  "subject": {
    "reference": "Patient/patient-001",
    "display": "John Doe"
  },
  "encounter": {
    "reference": "Encounter/enc-001"
  },
  "started": "2025-01-15T09:30:00Z",
  "basedOn": [
    {
      "reference": "ServiceRequest/sr-brain-mri-001",
      "display": "MRI Brain with and without contrast"
    }
  ],
  "referrer": {
    "reference": "Practitioner/ref-doc-001",
    "display": "Dr. Smith"
  },
  "interpreter": [
    {
      "reference": "Practitioner/radiologist-001",
      "display": "Dr. Jane Radiologist"
    }
  ],
  "endpoint": [
    {
      "reference": "Endpoint/wado-rs-001",
      "display": "WADO-RS endpoint"
    }
  ],
  "numberOfSeries": 12,
  "numberOfInstances": 384,
  "procedureCode": [
    {
      "coding": [
        {
          "system": "http://www.ama-assn.org/go/cpt",
          "code": "70553",
          "display": "MRI brain with and without contrast"
        },
        {
          "system": "http://snomed.info/sct",
          "code": "241439007",
          "display": "Magnetic resonance imaging of brain"
        }
      ]
    }
  ],
  "reasonCode": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "25064002",
          "display": "Headache"
        }
      ],
      "text": "Chronic headaches, rule out mass"
    }
  ],
  "series": [
    {
      "uid": "2.16.124.113543.6003.2588828330.45298.17418.2723805630",
      "number": 1,
      "modality": {
        "system": "http://dicom.nema.org/resources/ontology/DCM",
        "code": "MR",
        "display": "Magnetic Resonance"
      },
      "description": "SAG T1 FLAIR",
      "numberOfInstances": 32,
      "bodySite": {
        "system": "http://snomed.info/sct",
        "code": "12738006",
        "display": "Brain"
      },
      "started": "2025-01-15T09:30:00Z",
      "instance": [
        {
          "uid": "2.16.124.113543.6003.189642796.63084.16748.2599092903",
          "sopClass": {
            "system": "urn:ietf:rfc:3986",
            "code": "urn:oid:1.2.840.10008.5.1.4.1.1.4",
            "display": "MR Image Storage"
          },
          "number": 1,
          "title": "SAG T1 FLAIR - Slice 1"
        }
      ]
    }
  ]
}
```

#### 1.2.2 FHIR DiagnosticReport Resource (MRI)

The DiagnosticReport is the primary resource for the interpreted MRI report, referencing ImagingStudy for image evidence and Observation for structured findings.

```json
{
  "resourceType": "DiagnosticReport",
  "id": "mri-brain-report-001",
  "meta": {
    "profile": [
      "http://hl7.org/fhir/StructureDefinition/DiagnosticReport"
    ]
  },
  "text": {
    "status": "generated",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>MRI Brain Report...</p></div>"
  },
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "394914008",
          "display": "Radiology"
        },
        {
          "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
          "code": "RAD",
          "display": "Radiology"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "18748-4",
        "display": "Diagnostic imaging study"
      },
      {
        "system": "http://snomed.info/sct",
        "code": "241439007",
        "display": "Magnetic resonance imaging of brain"
      }
    ],
    "text": "MRI Brain with and without Contrast"
  },
  "subject": {
    "reference": "Patient/patient-001",
    "display": "John Doe"
  },
  "encounter": {
    "reference": "Encounter/enc-001"
  },
  "effectiveDateTime": "2025-01-15T09:30:00Z",
  "issued": "2025-01-15T14:45:00Z",
  "performer": [
    {
      "reference": "PractitionerRole/radiologist-role-001",
      "display": "Dr. Jane Radiologist"
    }
  ],
  "resultsInterpreter": [
    {
      "reference": "Practitioner/radiologist-001",
      "display": "Dr. Jane Radiologist"
    }
  ],
  "imagingStudy": [
    {
      "reference": "ImagingStudy/mri-brain-2025-001"
    }
  ],
  "result": [
    {
      "reference": "Observation/brain-mass-finding-001",
      "display": "Brain mass - left frontal lobe"
    },
    {
      "reference": "Observation/midline-shift-001",
      "display": "Midline shift - 4mm"
    },
    {
      "reference": "Observation/edema-grade-001",
      "display": "Vasogenic edema - moderate"
    }
  ],
  "media": [
    {
      "comment": "Axial T1 post-contrast showing enhancing mass",
      "link": {
        "reference": "DocumentReference/key-image-001",
        "display": "Key image 1"
      }
    }
  ],
  "conclusion": "Enhancing mass in the left frontal lobe measuring approximately 3.2 cm with moderate surrounding vasogenic edema and 4 mm of rightward midline shift. Findings are highly suspicious for high-grade glioma. Recommend neurosurgical consultation and biopsy.",
  "conclusionCode": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "253018009",
          "display": "Glioma"
        }
      ]
    }
  ],
  "presentedForm": [
    {
      "contentType": "application/pdf",
      "language": "en",
      "data": "<base64-encoded-PDF>",
      "title": "MRI Brain Report - John Doe"
    }
  ]
}
```

#### 1.2.3 FHIR Observation for MRI Findings

```json
{
  "resourceType": "Observation",
  "id": "brain-mass-finding-001",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "imaging",
          "display": "Imaging"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "49755003",
        "display": "Morphologically abnormal structure"
      }
    ]
  },
  "subject": {
    "reference": "Patient/patient-001"
  },
  "effectiveDateTime": "2025-01-15T09:30:00Z",
  "performer": [
    {
      "reference": "Practitioner/radiologist-001"
    }
  ],
  "valueString": "3.2 cm enhancing mass in left frontal lobe",
  "bodySite": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "12738006",
        "display": "Brain"
      }
    ],
    "text": "Left frontal lobe"
  },
  "component": [
    {
      "code": {
        "coding": [
          {
            "system": "http://dicom.nema.org/resources/ontology/DCM",
            "code": "110805",
            "display": "T2 Weighted MR Signal Intensity"
          }
        ]
      },
      "valueCodeableConcept": {
        "coding": [
          {
            "system": "http://snomed.info/sct",
            "code": "255506005",
            "display": "Hyperintense"
          }
        ]
      }
    },
    {
      "code": {
        "coding": [
          {
            "system": "http://dicom.nema.org/resources/ontology/DCM",
            "code": "113041",
            "display": "Apparent Diffusion Coefficient"
          }
        ]
      },
      "valueCodeableConcept": {
        "coding": [
          {
            "system": "http://snomed.info/sct",
            "code": "255506005",
            "display": "Low ADC (restricted diffusion)"
          }
        ]
      }
    }
  ]
}
```

#### 1.2.4 Installation (fhir.resources for Python)

```bash
pip install fhir.resources requests
```

---

### 1.3 RSNA Reporting Templates (RadReport)

The RSNA Radiology Reporting Initiative provides a free, publicly available library of best-practice report templates at radreport.org. These templates are developed by subspecialty experts and cover 29+ radiology subspecialties.

#### 1.3.1 RSNA RadReport Template Library Features

- **29+ subspecialty topics** with dedicated MRI templates
- **Available in 15+ languages**
- **Dublin Core metadata** for discoverability
- **HTML5 + IHE MRRT compliance** for vendor-neutral import
- **Feedback mechanism** to template authors
- **Free and unlicensed** -- no restrictions
- **Managed by TLAP** (Template Library Advisory Panel) -- joint RSNA/ESR committee

#### 1.3.2 MRI-Specific RSNA Templates

| Template ID | Body Region | Indication | Key Elements |
|-------------|-------------|------------|--------------|
| MR-BRAIN-001 | Brain | Tumor, stroke, headache | Sequences, anatomy, enhancement, mass characterization |
| MR-SPINE-001 | Spine | Back pain, radiculopathy | Disc levels, canal stenosis, cord signal |
| MR-KNEE-001 | Knee | Trauma, meniscal tear | Menisci, ligaments, cartilage, effusion |
| MR-PROSTATE-001 | Prostate | Elevated PSA, PI-RADS | T2, DWI, DCE, PI-RADS scoring |
| MR-BREAST-001 | Breast | Screening, biopsy follow-up | BI-RADS MRI, kinetic curves |
| MR-LIVER-001 | Liver | Lesion characterization | LI-RADS, sequences, enhancement pattern |

#### 1.3.3 RSNA Template Structure (HTML5/MRRT Format)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MRI Brain Template</title>
  <meta name="dc.title" content="MRI Brain Without Contrast">
  <meta name="dc.creator" content="RSNA Template Library">
  <meta name="dc.date" content="2025-01-01">
  <meta name="dc.identifier" content="MR-BRAIN-001">
  <meta name="mrrt.specialty" content="Neuroradiology">
</head>
<body>
  <section data-section-name="clinical_information">
    <h2>Clinical Information</h2>
    <p data-field-type="TEXT" data-field-name="indication">
      [Indication for study]
    </p>
  </section>
  
  <section data-section-name="technique">
    <h2>Technique</h2>
    <p>
      Multiplanar multi-sequence MRI of the brain performed on a 
      <span data-field-type="TEXT" data-field-name="field_strength">[1.5/3.0]</span> 
      Tesla scanner. Sequences include:
    </p>
    <ul data-field-type="LIST" data-field-name="sequences">
      <li>Sagittal T1 FLAIR</li>
      <li>Axial T2</li>
      <li>Axial FLAIR</li>
      <li>Axial DWI/ADC</li>
      <li>Axial susceptibility-weighted imaging (SWI)</li>
    </ul>
  </section>
  
  <section data-section-name="findings">
    <h2>Findings</h2>
    <div data-section-name="brain_parenchyma">
      <h3>Brain Parenchyma</h3>
      <p>
        Gray-white matter differentiation is 
        <span data-field-type="SELECT" data-field-name="gw_differentiation">
          <option>normal</option>
          <option>abnormal</option>
        </span>.
      </p>
    </div>
  </section>
  
  <section data-section-name="impression">
    <h2>Impression</h2>
    <p data-field-type="TEXTAREA" data-field-name="impression_summary">
      [Synthesize key findings and diagnosis]
    </p>
  </section>
</body>
</html>
```

---

### 1.4 RadLex Terminology

RadLex is the gold standard radiology lexicon developed by RSNA. It provides:

- **75,000+ standardized terms** covering all radiology subspecialties
- **Hierarchical ontology** with defined relationships between concepts
- **Unique RadLex IDs (RIDs)** for every concept
- **Bidirectional** human-readable and machine-readable codes
- **Continuously updated** by the RSNA RadLex Committee

#### 1.4.1 RadLex Coverage for MRI

Research on glioblastoma MRI reporting shows:

| Category | Percentage | Examples |
|----------|------------|----------|
| Verbatim RadLex match | 76.9% | "mass" (RID 3874), "necrosis" (RID 5171), "restricted diffusion" (RID 43349) |
| Synonymous/multiple equivalents | 5.6% | "maximum expansion" -> "maximum size" (RID 49883) |
| Combination of concepts | 13.1% | "perifocal edema" -> "perilesional tissue characteristics" (RID 43362) + "edema" (RID 4865) |
| No RadLex equivalent | 4.4% | Descriptive pictorial terms |

#### 1.4.2 Key RadLex Terms for MRI Reporting

| MRI Finding | RadLex ID | Code |
|-------------|-----------|------|
| Mass | RID 3874 | Mass |
| Central | RID 5827 | Spatial descriptor |
| Necrosis | RID 5171 | Pathologic finding |
| Restricted diffusion | RID 43349 | Imaging observation |
| Rim enhancement | RID 34303 | Enhancement pattern |
| Vasogenic edema | RID 4865 | Pathologic finding |
| Midline shift | RID 4751 | Anatomic displacement |
| Hydrocephalus | RID 43255 | Pathologic finding |
| Herniation | RID 43312 | Pathologic finding |
| Infarction | RID 43206 | Pathologic finding |
| Hemorrhage | RID 43208 | Pathologic finding |
| Atrophy | RID 43368 | Anatomic change |
| Enhancement | RID 34300 | Imaging observation |
| T1 weighted | RID 10794 | Sequence type |
| T2 weighted | RID 10795 | Sequence type |
| FLAIR | RID 10800 | Sequence type |
| DWI | RID 10374 | Sequence type |
| ADC | RID 49527 | Quantitative parameter |

#### 1.4.3 RadLex Hierarchy Categories

| Category | Coverage | Purpose |
|----------|----------|---------|
| Anatomical Entity | 39.0% | Location descriptors |
| RadLex Descriptor | 31.0% | Qualitative modifiers |
| Imaging Observation | 15.4% | Findings and patterns |
| Clinical Finding | 9.8% | Disease entities |
| Property | 4.1% | Physical attributes |
| Procedure | 0.8% | Examination types |

---

### 1.5 IHE MRRT Profile

The Integrating the Healthcare Enterprise (IHE) Management of Radiology Report Templates (MRRT) profile standardizes:

- **Template encoding:** HTML5 with custom data attributes (`data-field-type`, `data-field-name`)
- **Transport:** RESTful transactions for template query, retrieve, and store
- **Metadata:** Dublin Core standard for template authorship, versioning, and indexing
- **Import/export:** Vendor-agnostic template migration between reporting systems

---

## 2. Report Anatomy: Section-by-Section Design

### 2.1 Clinical History

**Purpose:** Contextualize the examination; link imaging to clinical question.

**Template:**

```
CLINICAL INFORMATION:
Indication: [Primary clinical concern from referring provider]
Relevant history: [Prior surgeries, known conditions, relevant labs]
Allergies: [Contrast / medication allergies]
Renal function: [Creatinine / eGFR if contrast planned]
Pregnancy status: [If applicable for female patients of childbearing age]
```

**FHIR mapping:** `DiagnosticReport.basedOn` (ServiceRequest.reasonCode), `ImagingStudy.reasonCode`
**DICOM SR mapping:** TID 2000 Clinical History (TEXT content item)

---

### 2.2 Technique / Sequences

**Purpose:** Document exactly what was performed for reproducibility and billing compliance.

**Standard MRI Brain Template:**

```
TECHNIQUE:
MRI of the brain was performed on a [1.5/3.0] Tesla scanner.

Sequences obtained:
- Sagittal 3D T1-weighted (MPRAGE/SPGR) [pre- and post-contrast]
- Axial T2-weighted fast spin-echo
- Axial FLAIR (Fluid-Attenuated Inversion Recovery)
- Axial diffusion-weighted imaging (DWI) with ADC map
- Axial susceptibility-weighted imaging (SWI)/gradient-recalled echo (GRE)
- Coronal T2-weighted [if performed]
- Axial T1-weighted post-contrast [if performed]
- MR angiography (time-of-flight) [if performed]
- Perfusion-weighted imaging [if performed]
- MR spectroscopy [if performed]

Contrast: [X] mL of gadolinium-based contrast agent ([agent name]) was administered intravenously.
Image quality: [Diagnostic / Limited by motion / Limited by artifact / Non-diagnostic]
```

**FHIR mapping:** `ImagingStudy.series[].modality`, `DiagnosticReport.code.coding`
**DICOM SR mapping:** Procedure Reported (CODE) + Technique (TEXT/CONTAINER)

---

### 2.3 Findings (Organized by Anatomy)

**Purpose:** Systematic anatomy-based description of all observations, positive and negative.

**Template -- Brain MRI:**

```
FINDINGS:

CEREBRAL HEMISPHERES:
- Gray-white matter differentiation: [Normal / Blurred / Lost]
- Cortical thickness and sulcal pattern: [Normal / Atrophic / Abnormal]
- Basal ganglia and thalami: [Normal / Abnormal signal]
- Internal capsule and deep white matter: [Normal / T2 hyperintensities consistent with chronic microvascular ischemic change]
- Corpus callosum: [Intact / Abnormal]

VENTRICULAR SYSTEM:
- Lateral ventricles: [Normal size / Mildly enlarged / Moderately enlarged / Hydrocephalic]
- Third ventricle: [Normal / Dilated]
- Fourth ventricle: [Normal / Dilated / Compressed]
- Midline shift: [Absent / [X] mm to the [left/right]]

EXTRA-AXIAL SPACES:
- Subarachnoid spaces: [Normal / Widened / Effaced]
- Subdural collections: [None / Acute / Subacute / Chronic / Mixed density]
- Epidural collections: [None / Present]

POSTERIOR FOSSA:
- Cerebellum: [Normal / Atrophic / Mass / Signal abnormality]
- Brainstem (midbrain, pons, medulla): [Normal / Abnormal]
- Fourth ventricle: [Normal / Dilated / Compressed]
- Cerebellopontine angles: [Normal / Mass / CSF signal cyst]

SELLA AND PARASELLAR REGION:
- Pituitary gland: [Normal / Enlarged / Mass]
- Optic chiasm: [Normal / Compressed / Displaced]
- Cavernous sinuses: [Normal / Abnormal]

VASCULAR STRUCTURES:
- Circle of Willis: [Patent / Aneurysm / Stenosis / Occlusion]
- Major venous sinuses: [Patent / Thrombosed / Hypoplastic]
- SWI/GRE: [No hemorrhagic foci / Microhemorrhages present / Hemosiderin staining]

DIFFUSION / PERFUSION (if performed):
- DWI: [No acute restricted diffusion / Acute infarct in [location] / Restricted diffusion in [lesion]]
- ADC: [Correlates with DWI / Elevated / Reduced]
- Perfusion: [Normal / Increased rCBV in [location]]

ORBITS, PARANASAL SINUSES, MASTOIDS:
- Orbits: [Normal / Mass / Optic nerve abnormality]
- Paranasal sinuses: [Clear / Mucosal thickening / Fluid level / Opacified]
- Mastoid air cells: [Clear / Opacified]

SKULL BASE AND CALVARIUM:
- Calvarial bones: [Intact / Lytic lesion / Blastic lesion / Fracture]
- Skull base: [Normal / Mass / Erosive change]
```

**FHIR mapping:** Array of `Observation` resources linked via `DiagnosticReport.result`
**DICOM SR mapping:** CONTAINER of CONTAINERs with CODE content items per finding

---

### 2.4 Impression

**Purpose:** Synthesize findings into a diagnostic conclusion. This is the section most read by referring physicians.

**Template:**

```
IMPRESSION:

1. [Most significant finding in descending order of clinical importance]
2. [Secondary finding]
3. [Normal variants / incidental findings]
4. [Correlation with clinical symptoms]

Overall assessment: [Normal / Abnormal / Critical / Urgent follow-up required]
```

**Rules:**
1. Always order by clinical significance, not anatomic sequence
2. Lead with the diagnosis when definitive; use differential when equivocal
3. Quantify: sizes, degrees, locations with precise anatomic labels
4. State what is NOT seen when relevant (e.g., "no intracranial hemorrhage")

---

### 2.5 Recommendations

**Purpose:** Guide the referring physician toward next steps.

**Template:**

```
RECOMMENDATIONS:

[ ] Clinical correlation recommended
[ ] Follow-up MRI in [timeframe] to assess for [interval change/resolution/progression]
[ ] Contrast-enhanced MRI recommended if not already performed
[ ] Neurosurgical consultation recommended
[ ] Biopsy/tissue sampling recommended for definitive diagnosis
[ ] MR spectroscopy and/or perfusion imaging recommended for further characterization
[ ] CT head for evaluation of [bone/calcification/acute hemorrhage]
[ ] No further imaging recommended at this time
[ ] Comparison with outside imaging recommended if available
```

---

### 2.6 Red Flags / Urgent Findings

**Purpose:** Ensure critical findings trigger immediate communication.

**Critical Findings Taxonomy (Yale/ACR Model):**

| Priority Level | Communication Target | Examples |
|----------------|----------------------|----------|
| Critical Result | Within 1 hour | Ruptured AAA, large PE, tension pneumothorax, intracranial hemorrhage, acute cord compression |
| Urgent Result | Within 6 hours | New DVT, new fracture, unexpected abscess, new mass |
| Next Business Day | Within 1-3 days | Possible osteomyelitis, kidney stone with hydronephrosis, uncomplicated diverticulitis |
| Non-Urgent Incidental | Within 30 days | Incidental nodule requiring follow-up, benign cyst |
| New Malignancy | Within 7 days | Unsuspected malignancy |

**Red Flag Phrases for MRI:**

```
CRITICAL: Acute epidural hematoma with mass effect and midline shift.
URGENT: Enhancing mass with significant mass effect requiring neurosurgical evaluation.
URGENT: Acute spinal cord compression at [level] with neurologic deficit.
URGENT: Acute vertebral artery dissection with [partial/complete] occlusion.
NON-URGENT: Incidental arachnoid cyst; no intervention required.
```

---

### 2.7 Biomarker Appendix

**Purpose:** Quantitative biomarkers for clinical trials, longitudinal tracking, and AI research.

**Template:**

```
QUANTITATIVE BIOMARKERS:

Lesion 1 (Left frontal lobe):
- Volume: [X.X] cm3 (semi-automated segmentation)
- ADC mean: [X.XX] x 10^-3 mm2/s
- ADC min: [X.XX] x 10^-3 mm2/s
- rCBV max: [X.XX] (relative to contralateral white matter)
- Choline/NAA ratio: [X.XX] (if spectroscopy performed)
- Enhancing fraction: [XX]%

Brain volume:
- Total intracranial volume: [XXXX] cm3
- Gray matter volume: [XXX] cm3
- White matter volume: [XXX] cm3
- CSF volume: [XXX] cm3
- Ventricular volume: [XXX] cm3

Reference ranges applied: [State normative dataset]
```

---

### 2.8 Comparison with Prior

**Purpose:** Document interval change by comparing to previous studies.

**Template:**

```
COMPARISON:

Prior study: [Modality] of [body part] dated [date] ([time interval] prior).
[Available/Not available for direct comparison.]

Interval changes:
- [Finding]: [Stable / Increased / Decreased / New / Resolved]
  - Size change: [X.X] cm -> [X.X] cm ([percent]% [increase/decrease])
  - Signal characteristics: [Stable / Changed]
  - Enhancement pattern: [Stable / Changed]
- [Additional finding]: [description of change]

No prior studies available for comparison.
```

**FHIR mapping:** `DiagnosticReport.imagingStudy[]` references multiple studies
**DICOM SR mapping:** Comparison Study (TEXT content item)

---

## 3. Report Generation Tools

### 3.1 WeasyPrint (HTML-to-PDF)

WeasyPrint converts HTML5 + CSS3 to PDF, supporting modern CSS features including flexbox, grid, and CSS paged media. It is ideal for report generation when the output needs professional typography and print-quality layout.

#### Installation

```bash
# System dependencies (Ubuntu/Debian)
sudo apt-get install weasyprint
# Or via pip
pip install weasyprint

# Verify installation
weasyprint --version
```

#### WeasyPrint MRI Report Template (Python)

```python
"""WeasyPrint MRI Report Generator
Generates clinical-quality PDF reports from HTML/CSS templates.
"""

from weasyprint import HTML, CSS
from jinja2 import Environment, FileSystemLoader
from datetime import datetime
import os

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TEMPLATES_DIR = "templates"
OUTPUT_DIR = "output"
STYLESHEET_PATH = os.path.join(TEMPLATES_DIR, "mri_report.css")

# ---------------------------------------------------------------------------
# Sample MRI report data (populated from PACS/RIS/FHIR source)
# ---------------------------------------------------------------------------
report_data = {
    "report_title": "MRI Brain with and without Contrast",
    "institution": "University Medical Center",
    "department": "Department of Radiology",
    "institution_logo": None,  # Path to logo PNG
    
    "patient": {
        "name": "Doe, John",
        "mrn": "12345678",
        "dob": "1975-03-15",
        "age": 49,
        "sex": "M",
        "allergies": "None known"
    },
    
    "exam": {
        "accession_number": "ACC-2025-000123",
        "exam_date": "January 15, 2025",
        "referring_physician": "Dr. Sarah Smith, Neurology",
        "radiologist": "Dr. Jane Radiologist, MD",
        "field_strength": "3.0",
        "contrast_agent": "Gadobutrol (Gadavist)",
        "contrast_volume_ml": 15,
        "image_quality": "Diagnostic"
    },
    
    "clinical_history": "Chronic headaches, progressively worsening over 3 months."
                       "Rule out intracranial mass.",
    
    "technique": [
        "Sagittal 3D T1-weighted MPRAGE (pre- and post-contrast)",
        "Axial T2-weighted fast spin-echo",
        "Axial FLAIR (TR 9000, TE 125, TI 2500)",
        "Axial DWI with ADC map (b=0, 1000 s/mm2)",
        "Axial susceptibility-weighted imaging (SWI)",
        "Axial T1-weighted post-contrast fat-saturated",
        "Coronal T2-weighted FLAIR"
    ],
    
    "findings": {
        "brain_parenchyma": [
            "There is a 3.2 cm heterogeneously enhancing mass in the left frontal lobe, ",
            "centered in the superior frontal gyrus. The mass demonstrates T2 hyperintensity ",
            "and T1 hypointensity with peripheral rim enhancement. Restricted diffusion is ",
            "present centrally (ADC = 0.72 x 10^-3 mm2/s). Moderate surrounding vasogenic ",
            "edema extends into the frontal white matter."
        ],
        "mass_effect": [
            "There is 4 mm of rightward midline shift with subfalcine herniation. ",
            "The left lateral ventricle is compressed. No uncal or transtentorial herniation."
        ],
        "ventricles": "Ventricular system otherwise normal in configuration.",
        "vascular": "No aneurysm or vascular malformation identified on SWI sequences.",
        "posterior_fossa": "Cerebellum and brainstem normal in signal and morphology.",
        "skull_base": "No calvarial abnormality. Paranasal sinuses clear.",
        "diffusion_perfusion": "Perfusion imaging demonstrates elevated rCBV (2.8x normal) ",
                                                "within the enhancing rim of the mass."
    },
    
    "impression": [
        "1. Large left frontal lobe enhancing mass (3.2 cm) with vasogenic edema and mass ",
        "   effect. Imaging characteristics are most consistent with high-grade glioma ",
        "   (WHO Grade III-IV).",
        "2. Moderate rightward midline shift (4 mm) with subfalcine herniation -- URGENT.",
        "3. Elevated rCBV and restricted diffusion support high-grade neoplasm.",
        "4. Recommend neurosurgical consultation and tissue diagnosis."
    ],
    
    "recommendations": [
        "Neurosurgical consultation -- URGENT",
        "Stereotactic biopsy for histopathologic diagnosis",
        "Pre-operative fMRI if surgical resection planned",
        "Follow-up post-treatment MRI in 72 hours post-surgery, then every 3 months"
    ],
    
    "red_flags": [
        {
            "level": "CRITICAL",
            "finding": "Mass effect with midline shift",
            "communication": "Verbal notification to Dr. Smith at 14:30 on 01/15/2025"
        }
    ],
    
    "comparison": "No prior imaging available for comparison.",
    
    "biomarkers": {
        "lesion_1": {
            "volume_cm3": 17.2,
            "adc_mean": 0.72,
            "adc_min": 0.45,
            "rcbv_max": 2.8,
            "choline_naa_ratio": 3.2
        }
    },
    
    "critical_result": True,
    "sign_off": {
        "radiologist": "Dr. Jane Radiologist, MD",
        "signature_date": "January 15, 2025 at 14:45",
        "signature_method": "Electronic signature with 2FA",
        "verification_status": "Final"
    }
}

# ---------------------------------------------------------------------------
# HTML Template (as string; in production, use FileSystemLoader)
# ---------------------------------------------------------------------------
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ report_title }} - {{ patient.mrn }}</title>
    <style>
        @page {
            size: A4;
            margin: 20mm 18mm 25mm 18mm;
            @bottom-center {
                content: "Page " counter(page) " of " counter(pages);
                font-size: 9pt;
                color: #666;
            }
            @top-left {
                content: "{{ institution }} | CONFIDENTIAL";
                font-size: 8pt;
                color: #999;
            }
        }
        
        * { box-sizing: border-box; }
        
        body {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #222;
        }
        
        .header {
            border-bottom: 3px solid #1a5276;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        
        .header h1 {
            font-size: 16pt;
            color: #1a5276;
            margin: 0 0 5px 0;
        }
        
        .header .subtitle {
            font-size: 10pt;
            color: #666;
        }
        
        .patient-banner {
            background: #eaf2f8;
            border-left: 4px solid #1a5276;
            padding: 10px 15px;
            margin-bottom: 15px;
        }
        
        .patient-banner .patient-name {
            font-size: 13pt;
            font-weight: bold;
            color: #1a5276;
        }
        
        .patient-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-top: 8px;
        }
        
        .patient-grid .field {
            font-size: 9.5pt;
        }
        
        .patient-grid .label {
            font-weight: bold;
            color: #555;
        }
        
        .section {
            margin-bottom: 15px;
        }
        
        .section-title {
            font-size: 12pt;
            font-weight: bold;
            color: #1a5276;
            border-bottom: 1px solid #1a5276;
            padding-bottom: 3px;
            margin-bottom: 8px;
        }
        
        .clinical-history {
            font-style: italic;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        
        .technique-list {
            margin: 5px 0;
            padding-left: 20px;
        }
        
        .technique-list li {
            font-size: 10pt;
            margin-bottom: 2px;
        }
        
        .findings-body {
            text-align: justify;
        }
        
        .impression-list {
            padding-left: 0;
            list-style: none;
        }
        
        .impression-list li {
            margin-bottom: 6px;
            padding-left: 0;
        }
        
        .recommendation-list {
            padding-left: 20px;
        }
        
        .recommendation-list li {
            margin-bottom: 4px;
        }
        
        .red-flag-banner {
            background: #fdeaea;
            border: 2px solid #c0392b;
            border-radius: 6px;
            padding: 12px;
            margin: 15px 0;
        }
        
        .red-flag-banner .flag-title {
            color: #c0392b;
            font-weight: bold;
            font-size: 12pt;
            margin-bottom: 8px;
        }
        
        .biomarker-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
        }
        
        .biomarker-table th {
            background: #1a5276;
            color: white;
            padding: 6px 8px;
            text-align: left;
        }
        
        .biomarker-table td {
            padding: 6px 8px;
            border-bottom: 1px solid #ddd;
        }
        
        .biomarker-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        
        .sign-off {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 2px solid #1a5276;
        }
        
        .sign-off .signature-line {
            margin-top: 20px;
            font-weight: bold;
        }
        
        .critical-badge {
            display: inline-block;
            background: #c0392b;
            color: white;
            font-weight: bold;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 10pt;
        }
        
        .footer-note {
            font-size: 8pt;
            color: #666;
            margin-top: 20px;
            border-top: 1px solid #ddd;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{ report_title }}</h1>
        <div class="subtitle">{{ institution }} | {{ department }}</div>
    </div>
    
    <div class="patient-banner">
        <div class="patient-name">{{ patient.name }}</div>
        <div class="patient-grid">
            <div class="field"><span class="label">MRN:</span> {{ patient.mrn }}</div>
            <div class="field"><span class="label">DOB:</span> {{ patient.dob }} (Age {{ patient.age }})</div>
            <div class="field"><span class="label">Sex:</span> {{ patient.sex }}</div>
            <div class="field"><span class="label">Accession:</span> {{ exam.accession_number }}</div>
            <div class="field"><span class="label">Date:</span> {{ exam.exam_date }}</div>
            <div class="field"><span class="label">Referrer:</span> {{ exam.referring_physician }}</div>
        </div>
    </div>
    
    {% if critical_result %}
    <div class="red-flag-banner">
        <div class="flag-title">CRITICAL RESULT -- URGENT COMMUNICATION REQUIRED</div>
        <div>This report contains findings requiring immediate clinical attention.</div>
        <div>Verbal communication documented at: {{ red_flags[0].communication }}</div>
    </div>
    {% endif %}
    
    <div class="section">
        <div class="section-title">Clinical History</div>
        <div class="clinical-history">{{ clinical_history }}</div>
    </div>
    
    <div class="section">
        <div class="section-title">Technique</div>
        <p>MRI performed on a {{ exam.field_strength }} Tesla scanner.</p>
        <ul class="technique-list">
        {% for seq in technique %}
            <li>{{ seq }}</li>
        {% endfor %}
        </ul>
        <p>
            {% if exam.contrast_volume_ml %}
            {{ exam.contrast_volume_ml }} mL of {{ exam.contrast_agent }} 
            was administered intravenously.
            {% endif %}
            Image quality: {{ exam.image_quality }}.
        </p>
    </div>
    
    <div class="section">
        <div class="section-title">Findings</div>
        <div class="findings-body">
            <p><strong>Brain Parenchyma:</strong> {{ findings.brain_parenchyma|join("") }}</p>
            <p><strong>Mass Effect:</strong> {{ findings.mass_effect|join("") }}</p>
            <p><strong>Ventricles:</strong> {{ findings.ventricles }}</p>
            <p><strong>Vascular:</strong> {{ findings.vascular }}</p>
            <p><strong>Posterior Fossa:</strong> {{ findings.posterior_fossa }}</p>
            <p><strong>Skull Base:</strong> {{ findings.skull_base }}</p>
            {% if findings.diffusion_perfusion %}
            <p><strong>Diffusion/Perfusion:</strong> {{ findings.diffusion_perfusion }}</p>
            {% endif %}
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Comparison</div>
        <p>{{ comparison }}</p>
    </div>
    
    <div class="section">
        <div class="section-title">Impression</div>
        <ol class="impression-list">
        {% for item in impression %}
            <li>{{ item }}</li>
        {% endfor %}
        </ol>
    </div>
    
    <div class="section">
        <div class="section-title">Recommendations</div>
        <ul class="recommendation-list">
        {% for rec in recommendations %}
            <li>{{ rec }}</li>
        {% endfor %}
        </ul>
    </div>
    
    <div class="section">
        <div class="section-title">Quantitative Biomarkers</div>
        <table class="biomarker-table">
            <tr><th>Parameter</th><th>Value</th><th>Unit</th></tr>
            <tr><td>Lesion Volume</td><td>{{ biomarkers.lesion_1.volume_cm3 }}</td><td>cm3</td></tr>
            <tr><td>ADC Mean</td><td>{{ biomarkers.lesion_1.adc_mean }}</td><td>10^-3 mm2/s</td></tr>
            <tr><td>ADC Minimum</td><td>{{ biomarkers.lesion_1.adc_min }}</td><td>10^-3 mm2/s</td></tr>
            <tr><td>rCBV Maximum</td><td>{{ biomarkers.lesion_1.rcbv_max }}</td><td>relative</td></tr>
            <tr><td>Choline/NAA Ratio</td><td>{{ biomarkers.lesion_1.choline_naa_ratio }}</td><td>ratio</td></tr>
        </table>
    </div>
    
    <div class="sign-off">
        <div><span class="label">Report Status:</span> 
            <span class="critical-badge">{{ sign_off.verification_status }}</span>
        </div>
        <div class="signature-line">
            Electronically signed by: {{ sign_off.radiologist }}<br>
            Date/Time: {{ sign_off.signature_date }}<br>
            Method: {{ sign_off.signature_method }}
        </div>
    </div>
    
    <div class="footer-note">
        This report was generated using structured reporting templates and has been 
        reviewed by a board-certified radiologist. This report is part of the patient's 
        legal medical record. For questions, contact the Department of Radiology at 
        [phone/email].
    </div>
</body>
</html>"""

# ---------------------------------------------------------------------------
# Generate PDF
# ---------------------------------------------------------------------------
def generate_weasyprint_report(data, output_path):
    """Generate MRI report PDF using WeasyPrint + Jinja2."""
    env = Environment()
    template = env.from_string(HTML_TEMPLATE)
    html_rendered = template.render(**data)
    
    HTML(string=html_rendered).write_pdf(output_path)
    print(f"[WeasyPrint] PDF generated: {output_path}")
    return output_path

# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_DIR, "mri_brain_report_weasyprint.pdf")
    generate_weasyprint_report(report_data, output_path)
```

---

### 3.2 python-docx (Word Document Generation)

python-docx creates native .docx files, ideal for editable reports that clinicians may modify.

#### Installation

```bash
pip install python-docx
```

#### python-docx MRI Report Template (Python)

```python
"""python-docx MRI Report Generator
Generates editable Word (.docx) reports with full formatting control.
"""

from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from datetime import datetime
import os

# ---------------------------------------------------------------------------
# Style Configuration
# ---------------------------------------------------------------------------
PRIMARY_COLOR = RGBColor(0x1A, 0x52, 0x76)    # Dark blue
CRITICAL_COLOR = RGBColor(0xC0, 0x39, 0x2B)   # Red
WARNING_COLOR = RGBColor(0xE6, 0x7E, 0x22)    # Orange
TEXT_COLOR = RGBColor(0x22, 0x22, 0x22)       # Near black

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def set_cell_shading(cell, color_hex):
    """Set background color of a table cell."""
    shading = OxmlElement('w:shd')
    shading.set(qn('w:fill'), color_hex)
    cell._tc.get_or_add_tcPr().append(shading)

def add_heading_styled(doc, text, level=1, color=PRIMARY_COLOR):
    """Add a styled heading."""
    heading = doc.add_heading(text, level=level)
    for run in heading.runs:
        run.font.color.rgb = color
        run.font.bold = True
    return heading

def add_paragraph_styled(doc, text, bold=False, italic=False, 
                          font_size=11, color=TEXT_COLOR, alignment=None):
    """Add a styled paragraph."""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(font_size)
    run.font.color.rgb = color
    run.bold = bold
    run.italic = italic
    if alignment:
        p.alignment = alignment
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    return p

def add_critical_banner(doc, findings, communication_note):
    """Add a red critical findings banner."""
    table = doc.add_table(rows=1, cols=1)
    table.style = 'Table Grid'
    cell = table.cell(0, 0)
    set_cell_shading(cell, 'FDEAEA')
    
    p = cell.paragraphs[0]
    run = p.add_run("CRITICAL RESULT -- URGENT COMMUNICATION REQUIRED")
    run.font.color.rgb = CRITICAL_COLOR
    run.font.bold = True
    run.font.size = Pt(12)
    
    p2 = cell.add_paragraph()
    run2 = p2.add_run(f"Findings: {findings}")
    run2.font.size = Pt(10)
    
    p3 = cell.add_paragraph()
    run3 = p3.add_run(f"Communication documented: {communication_note}")
    run3.font.size = Pt(10)
    run3.italic = True
    
    doc.add_paragraph()  # spacing

def add_patient_banner(doc, patient_data, exam_data):
    """Add patient information banner table."""
    table = doc.add_table(rows=2, cols=4)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Set banner background
    for row in table.rows:
        for cell in row.cells:
            set_cell_shading(cell, 'EAF2F8')
    
    # Row 1
    cells = table.rows[0].cells
    cells[0].text = f"Patient: {patient_data['name']}"
    cells[1].text = f"MRN: {patient_data['mrn']}"
    cells[2].text = f"DOB: {patient_data['dob']} (Age {patient_data['age']})"
    cells[3].text = f"Sex: {patient_data['sex']}"
    
    # Row 2
    cells = table.rows[1].cells
    cells[0].text = f"Accession: {exam_data['accession_number']}"
    cells[1].text = f"Date: {exam_data['exam_date']}"
    cells[2].text = f"Referrer: {exam_data['referring_physician']}"
    cells[3].text = f"Quality: {exam_data['image_quality']}"
    
    # Format all cells
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(2)
                for run in paragraph.runs:
                    run.font.size = Pt(9)
    
    doc.add_paragraph()

# ---------------------------------------------------------------------------
# Main Report Generator
# ---------------------------------------------------------------------------
def generate_docx_mri_report(output_path):
    """Generate a complete MRI Brain report as .docx."""
    doc = Document()
    
    # Page margins
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.0)
        section.right_margin = Cm(2.0)
    
    # ===== HEADER =====
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("MRI BRAIN WITH AND WITHOUT CONTRAST")
    run.font.size = Pt(16)
    run.font.bold = True
    run.font.color.rgb = PRIMARY_COLOR
    
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run2 = subtitle.add_run("University Medical Center | Department of Radiology")
    run2.font.size = Pt(10)
    run2.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
    
    doc.add_paragraph()  # spacer
    
    # ===== PATIENT BANNER =====
    patient_data = {
        "name": "Doe, John",
        "mrn": "12345678",
        "dob": "1975-03-15",
        "age": 49,
        "sex": "M"
    }
    exam_data = {
        "accession_number": "ACC-2025-000123",
        "exam_date": "January 15, 2025",
        "referring_physician": "Dr. Sarah Smith, Neurology",
        "image_quality": "Diagnostic"
    }
    add_patient_banner(doc, patient_data, exam_data)
    
    # ===== CRITICAL BANNER =====
    add_critical_banner(
        doc,
        "Large left frontal lobe enhancing mass with mass effect and midline shift",
        "Verbal notification to Dr. Smith at 14:30 on 01/15/2025"
    )
    
    # ===== CLINICAL HISTORY =====
    add_heading_styled(doc, "Clinical History", level=1)
    add_paragraph_styled(doc, 
        "Chronic headaches, progressively worsening over 3 months. "
        "Rule out intracranial mass.", italic=True, font_size=10)
    
    # ===== TECHNIQUE =====
    add_heading_styled(doc, "Technique", level=1)
    add_paragraph_styled(doc, 
        "MRI performed on a 3.0 Tesla scanner. Sequences obtained:", font_size=10)
    
    sequences = [
        "Sagittal 3D T1-weighted MPRAGE (pre- and post-contrast)",
        "Axial T2-weighted fast spin-echo",
        "Axial FLAIR (TR 9000, TE 125, TI 2500)",
        "Axial DWI with ADC map (b=0, 1000 s/mm2)",
        "Axial susceptibility-weighted imaging (SWI)",
        "Axial T1-weighted post-contrast fat-saturated",
        "Coronal T2-weighted FLAIR"
    ]
    for seq in sequences:
        p = doc.add_paragraph(seq, style='List Bullet')
        p.paragraph_format.space_after = Pt(2)
        for run in p.runs:
            run.font.size = Pt(10)
    
    add_paragraph_styled(doc, 
        "15 mL of gadolinium-based contrast agent (Gadobutrol/Gadavist) "
        "was administered intravenously. Image quality: Diagnostic.", font_size=10)
    
    # ===== FINDINGS =====
    add_heading_styled(doc, "Findings", level=1)
    
    findings_sections = [
        ("Brain Parenchyma", 
         "There is a 3.2 cm heterogeneously enhancing mass in the left frontal lobe, "
         "centered in the superior frontal gyrus. The mass demonstrates T2 hyperintensity "
         "and T1 hypointensity with peripheral rim enhancement. Restricted diffusion is "
         "present centrally (ADC = 0.72 x 10^-3 mm2/s). Moderate surrounding vasogenic "
         "edema extends into the frontal white matter."),
        ("Mass Effect",
         "There is 4 mm of rightward midline shift with subfalcine herniation. "
         "The left lateral ventricle is compressed. No uncal or transtentorial herniation."),
        ("Ventricular System",
         "Ventricular system otherwise normal in configuration."),
        ("Vascular Structures",
         "No aneurysm or vascular malformation identified on SWI sequences. "
         "Major venous sinuses are patent."),
        ("Posterior Fossa",
         "Cerebellum and brainstem are normal in signal and morphology."),
        ("Skull Base",
         "No calvarial abnormality. Paranasal sinuses and mastoid air cells are clear."),
        ("Diffusion / Perfusion",
         "Perfusion imaging demonstrates elevated rCBV (2.8x normal) within the "
         "enhancing rim of the mass. MR spectroscopy shows elevated choline/NAA ratio (3.2).")
    ]
    
    for title, text in findings_sections:
        p = doc.add_paragraph()
        run_title = p.add_run(f"{title}: ")
        run_title.bold = True
        run_title.font.size = Pt(10)
        run_text = p.add_run(text)
        run_text.font.size = Pt(10)
        p.paragraph_format.space_after = Pt(6)
    
    # ===== COMPARISON =====
    add_heading_styled(doc, "Comparison", level=1)
    add_paragraph_styled(doc, "No prior imaging available for comparison.", font_size=10)
    
    # ===== IMPRESSION =====
    add_heading_styled(doc, "Impression", level=1)
    impressions = [
        "Large left frontal lobe enhancing mass (3.2 cm) with vasogenic edema and mass effect. "
        "Imaging characteristics are most consistent with high-grade glioma (WHO Grade III-IV).",
        "Moderate rightward midline shift (4 mm) with subfalcine herniation -- URGENT.",
        "Elevated rCBV and restricted diffusion support high-grade neoplasm.",
        "Recommend neurosurgical consultation and tissue diagnosis."
    ]
    for i, imp in enumerate(impressions, 1):
        p = doc.add_paragraph()
        run_num = p.add_run(f"{i}. ")
        run_num.bold = True
        run_num.font.size = Pt(10)
        run_text = p.add_run(imp)
        run_text.font.size = Pt(10)
        p.paragraph_format.space_after = Pt(6)
    
    # ===== RECOMMENDATIONS =====
    add_heading_styled(doc, "Recommendations", level=1)
    recommendations = [
        "Neurosurgical consultation -- URGENT",
        "Stereotactic biopsy for histopathologic diagnosis",
        "Pre-operative fMRI if surgical resection planned",
        "Follow-up post-treatment MRI in 72 hours post-surgery, then every 3 months"
    ]
    for rec in recommendations:
        p = doc.add_paragraph(rec, style='List Bullet')
        p.paragraph_format.space_after = Pt(4)
        for run in p.runs:
            run.font.size = Pt(10)
    
    # ===== BIOMARKERS =====
    add_heading_styled(doc, "Quantitative Biomarkers", level=1)
    
    biomarker_table = doc.add_table(rows=6, cols=3)
    biomarker_table.style = 'Table Grid'
    biomarker_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Header
    hdr = biomarker_table.rows[0].cells
    hdr[0].text = "Parameter"
    hdr[1].text = "Value"
    hdr[2].text = "Unit"
    for cell in hdr:
        set_cell_shading(cell, '1A5276')
        for paragraph in cell.paragraphs:
            for run in paragraph.runs:
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                run.font.bold = True
                run.font.size = Pt(10)
    
    # Data
    biomarkers = [
        ("Lesion Volume", "17.2", "cm3"),
        ("ADC Mean", "0.72", "10^-3 mm2/s"),
        ("ADC Minimum", "0.45", "10^-3 mm2/s"),
        ("rCBV Maximum", "2.8", "relative to normal"),
        ("Choline/NAA Ratio", "3.2", "ratio")
    ]
    for i, (param, val, unit) in enumerate(biomarkers, 1):
        row = biomarker_table.rows[i].cells
        row[0].text = param
        row[1].text = val
        row[2].text = unit
        if i % 2 == 0:
            for cell in row:
                set_cell_shading(cell, 'F8F9FA')
        for cell in row:
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(10)
    
    doc.add_paragraph()
    
    # ===== SIGN-OFF =====
    add_heading_styled(doc, "Electronic Signature", level=1)
    
    sign_off_para = doc.add_paragraph()
    run_status = sign_off_para.add_run("Report Status: FINAL\n")
    run_status.font.bold = True
    run_status.font.size = Pt(11)
    run_status.font.color.rgb = PRIMARY_COLOR
    
    run_sig = sign_off_para.add_run(
        "Electronically signed by: Dr. Jane Radiologist, MD\n"
        "Date/Time: January 15, 2025 at 14:45\n"
        "Method: Electronic signature with 2-factor authentication\n"
        "Verification: Final interpretation verified by interpreting physician"
    )
    run_sig.font.size = Pt(10)
    
    # ===== FOOTER =====
    doc.add_paragraph()
    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_footer = footer.add_run(
        "--- CONFIDENTIAL MEDICAL RECORD ---\n"
        "This report is part of the patient's legal medical record. "
        "For questions, contact the Department of Radiology."
    )
    run_footer.font.size = Pt(8)
    run_footer.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
    
    # Save
    doc.save(output_path)
    print(f"[python-docx] Report generated: {output_path}")
    return output_path

# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs("output", exist_ok=True)
    output = os.path.join("output", "mri_brain_report.docx")
    generate_docx_mri_report(output)
```

---

### 3.3 ReportLab (Programmatic PDF)

ReportLab constructs PDFs programmatically with precise control over layout, ideal for reports requiring exact positioning and complex tables.

#### Installation

```bash
pip install reportlab
```

#### ReportLab MRI Report Template (Python)

```python
"""ReportLab MRI Report Generator
Constructs PDF reports programmatically with precise layout control.
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem
)
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.textlabels import Label
from datetime import datetime
import os

# ---------------------------------------------------------------------------
# Color Palette
# ---------------------------------------------------------------------------
PRIMARY_BLUE = colors.HexColor("#1A5276")
CRITICAL_RED = colors.HexColor("#C0392B")
WARNING_ORANGE = colors.HexColor("#E67E22")
LIGHT_BLUE = colors.HexColor("#EAF2F8")
LIGHT_RED = colors.HexColor("#FDEAEA")
TEXT_BLACK = colors.HexColor("#222222")
GRAY = colors.HexColor("#666666")
LIGHT_GRAY = colors.HexColor("#F8F9FA")

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
def create_styles():
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='MRITitle',
        fontSize=16,
        leading=20,
        textColor=PRIMARY_BLUE,
        alignment=TA_CENTER,
        spaceAfter=6,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='MRISubtitle',
        fontSize=10,
        leading=12,
        textColor=GRAY,
        alignment=TA_CENTER,
        spaceAfter=12,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='SectionHeader',
        fontSize=12,
        leading=14,
        textColor=PRIMARY_BLUE,
        spaceAfter=6,
        spaceBefore=10,
        fontName='Helvetica-Bold',
        borderWidth=1,
        borderColor=PRIMARY_BLUE,
        borderPadding=3,
        leftIndent=0,
        backColor=LIGHT_BLUE
    ))
    
    styles.add(ParagraphStyle(
        name='BodyText',
        fontSize=10,
        leading=13,
        textColor=TEXT_BLACK,
        alignment=TA_JUSTIFY,
        spaceAfter=6,
        fontName='Helvetica'
    ))
    
    styles.add(ParagraphStyle(
        name='BodyTextBold',
        parent=styles['BodyText'],
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='ClinicalHistory',
        fontSize=10,
        leading=13,
        textColor=TEXT_BLACK,
        alignment=TA_LEFT,
        spaceAfter=6,
        fontName='Helvetica-Oblique',
        backColor=colors.HexColor("#F5F5F5"),
        leftIndent=6,
        rightIndent=6,
        borderPadding=6
    ))
    
    styles.add(ParagraphStyle(
        name='CriticalText',
        fontSize=10,
        leading=13,
        textColor=CRITICAL_RED,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='FooterNote',
        fontSize=8,
        leading=10,
        textColor=GRAY,
        alignment=TA_CENTER,
        spaceBefore=20,
        fontName='Helvetica-Oblique'
    ))
    
    styles.add(ParagraphStyle(
        name='SignOff',
        fontSize=10,
        leading=13,
        textColor=TEXT_BLACK,
        spaceAfter=4,
        fontName='Helvetica'
    ))
    
    return styles

# ---------------------------------------------------------------------------
# Report Builder
# ---------------------------------------------------------------------------
def build_reportlab_mri_report(output_path):
    """Build MRI report PDF using ReportLab Platypus."""
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=18*mm,
        leftMargin=18*mm,
        topMargin=20*mm,
        bottomMargin=25*mm,
        title="MRI Brain Report",
        author="Department of Radiology"
    )
    
    styles = create_styles()
    story = []
    
    # ===== HEADER =====
    story.append(Paragraph("MRI BRAIN WITH AND WITHOUT CONTRAST", styles['MRITitle']))
    story.append(Paragraph("University Medical Center | Department of Radiology", 
                          styles['MRISubtitle']))
    story.append(Spacer(1, 8))
    
    # ===== PATIENT BANNER TABLE =====
    patient_data = [
        ["Patient: Doe, John", "MRN: 12345678", "DOB: 1975-03-15 (Age 49)", "Sex: M"],
        ["Accession: ACC-2025-000123", "Date: Jan 15, 2025", 
         "Referrer: Dr. Smith", "Quality: Diagnostic"]
    ]
    patient_table = Table(patient_data, colWidths=[42*mm, 42*mm, 42*mm, 42*mm])
    patient_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BLUE),
        ('GRID', (0, 0), (-1, -1), 0.5, PRIMARY_BLUE),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(patient_table)
    story.append(Spacer(1, 10))
    
    # ===== CRITICAL BANNER =====
    critical_data = [
        [Paragraph("<b>CRITICAL RESULT -- URGENT COMMUNICATION REQUIRED</b>", styles['CriticalText'])],
        [Paragraph("Finding: Large left frontal lobe mass with mass effect and midline shift", 
                  styles['BodyText'])],
        [Paragraph("<i>Communication documented: Verbal notification to Dr. Smith at 14:30 on 01/15/2025</i>",
                  styles['BodyText'])]
    ]
    critical_table = Table(critical_data, colWidths=[168*mm])
    critical_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_RED),
        ('BOX', (0, 0), (-1, -1), 2, CRITICAL_RED),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(critical_table)
    story.append(Spacer(1, 10))
    
    # ===== CLINICAL HISTORY =====
    story.append(Paragraph("Clinical History", styles['SectionHeader']))
    story.append(Paragraph(
        "Chronic headaches, progressively worsening over 3 months. "
        "Rule out intracranial mass.", styles['ClinicalHistory']))
    
    # ===== TECHNIQUE =====
    story.append(Paragraph("Technique", styles['SectionHeader']))
    story.append(Paragraph(
        "MRI performed on a <b>3.0 Tesla</b> scanner. Sequences obtained:", styles['BodyText']))
    
    sequences = [
        "Sagittal 3D T1-weighted MPRAGE (pre- and post-contrast)",
        "Axial T2-weighted fast spin-echo",
        "Axial FLAIR (TR 9000, TE 125, TI 2500)",
        "Axial DWI with ADC map (b=0, 1000 s/mm2)",
        "Axial susceptibility-weighted imaging (SWI)",
        "Axial T1-weighted post-contrast fat-saturated",
        "Coronal T2-weighted FLAIR"
    ]
    seq_items = [ListItem(Paragraph(s, styles['BodyText'])) for s in sequences]
    story.append(ListFlowable(seq_items, bulletType='bullet', leftIndent=20))
    story.append(Paragraph(
        "15 mL of gadolinium-based contrast agent (Gadobutrol/Gadavist) "
        "was administered intravenously. Image quality: Diagnostic.", styles['BodyText']))
    
    # ===== FINDINGS =====
    story.append(Paragraph("Findings", styles['SectionHeader']))
    
    findings = [
        ("<b>Brain Parenchyma:</b> ",
         "There is a 3.2 cm heterogeneously enhancing mass in the left frontal lobe, "
         "centered in the superior frontal gyrus. The mass demonstrates T2 hyperintensity "
         "and T1 hypointensity with peripheral rim enhancement. Restricted diffusion is "
         "present centrally (ADC = 0.72 x 10<sup>-3</sup> mm<sup>2</sup>/s). Moderate surrounding "
         "vasogenic edema extends into the frontal white matter."),
        ("<b>Mass Effect:</b> ",
         "There is 4 mm of rightward midline shift with subfalcine herniation. "
         "The left lateral ventricle is compressed. No uncal or transtentorial herniation."),
        ("<b>Ventricular System:</b> ", "Ventricular system otherwise normal in configuration."),
        ("<b>Vascular Structures:</b> ", 
         "No aneurysm or vascular malformation identified. Major venous sinuses are patent."),
        ("<b>Posterior Fossa:</b> ", 
         "Cerebellum and brainstem are normal in signal and morphology."),
        ("<b>Skull Base:</b> ", 
         "No calvarial abnormality. Paranasal sinuses and mastoid air cells are clear."),
        ("<b>Diffusion / Perfusion:</b> ", 
         "Perfusion imaging demonstrates elevated rCBV (2.8x normal) within the "
         "enhancing rim. MR spectroscopy shows elevated choline/NAA ratio (3.2).")
    ]
    
    for title, text in findings:
        story.append(Paragraph(f"{title}{text}", styles['BodyText']))
    
    # ===== COMPARISON =====
    story.append(Paragraph("Comparison", styles['SectionHeader']))
    story.append(Paragraph("No prior imaging available for comparison.", styles['BodyText']))
    
    # ===== IMPRESSION =====
    story.append(Paragraph("Impression", styles['SectionHeader']))
    
    impressions = [
        "Large left frontal lobe enhancing mass (3.2 cm) with vasogenic edema and mass effect. "
        "Imaging characteristics are most consistent with <b>high-grade glioma</b> (WHO Grade III-IV).",
        "Moderate rightward midline shift (4 mm) with subfalcine herniation -- <b>URGENT</b>.",
        "Elevated rCBV and restricted diffusion support high-grade neoplasm.",
        "Recommend neurosurgical consultation and tissue diagnosis."
    ]
    for i, imp in enumerate(impressions, 1):
        story.append(Paragraph(f"<b>{i}.</b> {imp}", styles['BodyText']))
    
    # ===== RECOMMENDATIONS =====
    story.append(Paragraph("Recommendations", styles['SectionHeader']))
    
    recs = [
        "Neurosurgical consultation -- URGENT",
        "Stereotactic biopsy for histopathologic diagnosis",
        "Pre-operative fMRI if surgical resection planned",
        "Follow-up post-treatment MRI in 72 hours post-surgery, then every 3 months"
    ]
    rec_items = [ListItem(Paragraph(r, styles['BodyText'])) for r in recs]
    story.append(ListFlowable(rec_items, bulletType='bullet', leftIndent=20))
    
    # ===== BIOMARKERS =====
    story.append(Paragraph("Quantitative Biomarkers", styles['SectionHeader']))
    
    biomarker_data = [
        [Paragraph("<b>Parameter</b>", styles['BodyTextBold']),
         Paragraph("<b>Value</b>", styles['BodyTextBold']),
         Paragraph("<b>Unit</b>", styles['BodyTextBold'])],
        ["Lesion Volume", "17.2", "cm3"],
        ["ADC Mean", "0.72", "10^-3 mm2/s"],
        ["ADC Minimum", "0.45", "10^-3 mm2/s"],
        ["rCBV Maximum", "2.8", "relative"],
        ["Choline/NAA Ratio", "3.2", "ratio"]
    ]
    bio_table = Table(biomarker_data, colWidths=[80*mm, 44*mm, 44*mm])
    bio_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY_BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('BACKGROUND', (0, 2), (-1, 2), LIGHT_GRAY),
        ('BACKGROUND', (0, 4), (-1, 4), LIGHT_GRAY),
    ]))
    story.append(bio_table)
    
    # ===== SIGN-OFF =====
    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>Report Status: FINAL</b>", styles['SignOff']))
    story.append(Paragraph("Electronically signed by: Dr. Jane Radiologist, MD", styles['SignOff']))
    story.append(Paragraph("Date/Time: January 15, 2025 at 14:45", styles['SignOff']))
    story.append(Paragraph("Method: Electronic signature with 2-factor authentication", styles['SignOff']))
    story.append(Paragraph("Verification: Final interpretation verified by interpreting physician", 
                          styles['SignOff']))
    
    # ===== FOOTER =====
    story.append(Paragraph(
        "--- CONFIDENTIAL MEDICAL RECORD ---<br/>"
        "This report is part of the patient's legal medical record. "
        "For questions, contact the Department of Radiology.", 
        styles['FooterNote']))
    
    # Build PDF
    doc.build(story)
    print(f"[ReportLab] PDF generated: {output_path}")
    return output_path

# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs("output", exist_ok=True)
    output = os.path.join("output", "mri_brain_reportlab.pdf")
    build_reportlab_mri_report(output)
```

---

### 3.4 Jinja2 Template Engine

Jinja2 is the templating layer that separates report content from presentation. It integrates with all three output tools above.

#### Installation

```bash
pip install Jinja2
```

#### Jinja2 MRI Report Template (Reusable)

```python
"""Jinja2 MRI Report Template Engine
Reusable template system for generating MRI reports across multiple output formats.
"""

from jinja2 import Environment, FileSystemLoader, BaseLoader
from datetime import datetime
import os

# ---------------------------------------------------------------------------
# Template Definitions
# ---------------------------------------------------------------------------

# Plain text template (for HL7 v2 ORU messages, email, etc.)
TEXT_TEMPLATE = """RADIOLOGY REPORT -- {{ report_title }}
================================================================================
Institution: {{ institution }}
Department: {{ department }}
Report Date: {{ exam.exam_date }}
Status: {{ sign_off.verification_status }}
{% if critical_result %}*** CRITICAL RESULT -- URGENT ***{% endif %}

--------------------------------------------------------------------------------
PATIENT INFORMATION
--------------------------------------------------------------------------------
Name: {{ patient.name }}
MRN: {{ patient.mrn }}
DOB: {{ patient.dob }} (Age: {{ patient.age }})
Sex: {{ patient.sex }}
Accession: {{ exam.accession_number }}
Referring Physician: {{ exam.referring_physician }}

--------------------------------------------------------------------------------
CLINICAL HISTORY
--------------------------------------------------------------------------------
{{ clinical_history }}

--------------------------------------------------------------------------------
TECHNIQUE
--------------------------------------------------------------------------------
MRI performed on {{ exam.field_strength }} Tesla scanner.
Sequences:
{% for seq in technique %}  - {{ seq }}
{% endfor %}
{% if exam.contrast_volume_ml %}
Contrast: {{ exam.contrast_volume_ml }} mL {{ exam.contrast_agent }}
{% endif %}
Image quality: {{ exam.image_quality }}

--------------------------------------------------------------------------------
FINDINGS
--------------------------------------------------------------------------------
{% for section, content in findings.items() %}
{{ section|replace('_', ' ')|title }}: {% if content is string %}{{ content }}{% else %}{{ content|join('') }}{% endif %}
{% endfor %}

--------------------------------------------------------------------------------
COMPARISON
--------------------------------------------------------------------------------
{{ comparison }}

--------------------------------------------------------------------------------
IMPRESSION
--------------------------------------------------------------------------------
{% for item in impression %}{{ loop.index }}. {{ item }}
{% endfor %}

--------------------------------------------------------------------------------
RECOMMENDATIONS
--------------------------------------------------------------------------------
{% for rec in recommendations %}- {{ rec }}
{% endfor %}

--------------------------------------------------------------------------------
QUANTITATIVE BIOMARKERS
--------------------------------------------------------------------------------
{% for lesion_id, biomarkers in biomarkers.items() %}Lesion: {{ lesion_id }}
{% for param, value in biomarkers.items() %}  {{ param }}: {{ value }}
{% endfor %}{% endfor %}

--------------------------------------------------------------------------------
SIGN-OFF
--------------------------------------------------------------------------------
Electronically signed by: {{ sign_off.radiologist }}
Date/Time: {{ sign_off.signature_date }}
Method: {{ sign_off.signature_method }}
Status: {{ sign_off.verification_status }}

================================================================================
END OF REPORT
================================================================================"""

# JSON template (for FHIR/DICOM SR/API payloads)
JSON_TEMPLATE = """{
    "resourceType": "DiagnosticReport",
    "id": "{{ exam.accession_number }}",
    "status": "final",
    "category": [{
        "coding": [{
            "system": "http://snomed.info/sct",
            "code": "394914008",
            "display": "Radiology"
        }]
    }],
    "code": {
        "coding": [{
            "system": "http://loinc.org",
            "code": "18748-4",
            "display": "Diagnostic imaging study"
        }],
        "text": "{{ report_title }}"
    },
    "subject": {
        "reference": "Patient/{{ patient.mrn }}"
    },
    "effectiveDateTime": "{{ exam.exam_date }}",
    "performer": [{
        "reference": "Practitioner/{{ exam.radiologist_id|default('unknown') }}"
    }],
    "imagingStudy": [{
        "reference": "ImagingStudy/{{ exam.accession_number }}"
    }],
    "conclusion": "{{ impression|join(' ') }}"
}"""

# ---------------------------------------------------------------------------
# Template Engine Class
# ---------------------------------------------------------------------------
class MRIReportTemplateEngine:
    """Reusable template engine for MRI report generation."""
    
    def __init__(self, template_dir=None):
        if template_dir and os.path.exists(template_dir):
            self.env = Environment(loader=FileSystemLoader(template_dir))
        else:
            self.env = Environment(loader=BaseLoader())
        self.env.filters['datetime'] = self._format_datetime
        self.env.filters['title_case'] = lambda s: s.replace('_', ' ').title()
    
    @staticmethod
    def _format_datetime(value, fmt='%Y-%m-%d %H:%M'):
        if isinstance(value, str):
            return value
        return value.strftime(fmt)
    
    def render_text(self, data):
        """Render plain text report."""
        template = self.env.from_string(TEXT_TEMPLATE)
        return template.render(**data)
    
    def render_json(self, data):
        """Render JSON/FHIR report."""
        template = self.env.from_string(JSON_TEMPLATE)
        return template.render(**data)
    
    def render_html(self, data, template_path=None):
        """Render HTML report (for WeasyPrint)."""
        if template_path:
            template = self.env.get_template(template_path)
        else:
            # Use inline HTML template
            html = self._get_default_html_template()
            template = self.env.from_string(html)
        return template.render(**data)
    
    def render_xml(self, data):
        """Render XML report (for HL7 CDA/DICOM SR transcoding)."""
        xml_template = self._get_xml_template()
        template = self.env.from_string(xml_template)
        return template.render(**data)
    
    def _get_default_html_template(self):
        """Return default HTML template for WeasyPrint integration."""
        # Returns the HTML_TEMPLATE from section 3.1
        from inspect import currentframe
        import __main__
        # This would reference the full HTML template
        return "<!-- See WeasyPrint section for full HTML template -->"
    
    def _get_xml_template(self):
        """Return HL7 CDA XML template."""
        return """<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
    <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
    <id root="{{ exam.accession_number }}"/>
    <code code="18748-4" codeSystem="2.16.840.1.113883.6.1" displayName="Diagnostic imaging study"/>
    <title>{{ report_title }}</title>
    <effectiveTime value="{{ exam.exam_date }}"/>
    <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
    <recordTarget>
        <patientRole>
            <id extension="{{ patient.mrn }}"/>
            <patient>
                <name><given>{{ patient.name.split(', ')[1] }}</given><family>{{ patient.name.split(', ')[0] }}</family></name>
                <administrativeGenderCode code="{{ patient.sex }}"/>
                <birthTime value="{{ patient.dob }}"/>
            </patient>
        </patientRole>
    </recordTarget>
    <author>
        <time value="{{ sign_off.signature_date }}"/>
        <assignedAuthor>
            <assignedPerson>
                <name>{{ sign_off.radiologist }}</name>
            </assignedPerson>
        </assignedAuthor>
    </author>
    <component>
        <structuredBody>
            <component>
                <section>
                    <code code="55111-9" displayName="Clinical History"/>
                    <text>{{ clinical_history }}</text>
                </section>
            </component>
            <component>
                <section>
                    <code code="55114-3" displayName="Impression"/>
                    <text>{{ impression|join(' ') }}</text>
                </section>
            </component>
        </structuredBody>
    </component>
</ClinicalDocument>"""

# ---------------------------------------------------------------------------
# Example Usage
# ---------------------------------------------------------------------------
def demo_jinja2_engine():
    """Demonstrate Jinja2 template engine with sample data."""
    
    data = {
        "report_title": "MRI Brain with and without Contrast",
        "institution": "University Medical Center",
        "department": "Department of Radiology",
        "patient": {
            "name": "Doe, John",
            "mrn": "12345678",
            "dob": "1975-03-15",
            "age": 49,
            "sex": "M"
        },
        "exam": {
            "accession_number": "ACC-2025-000123",
            "exam_date": "2025-01-15T09:30:00Z",
            "referring_physician": "Dr. Sarah Smith",
            "field_strength": "3.0",
            "contrast_agent": "Gadobutrol",
            "contrast_volume_ml": 15,
            "image_quality": "Diagnostic"
        },
        "clinical_history": "Chronic headaches, progressively worsening over 3 months.",
        "technique": ["Sagittal T1 MPRAGE", "Axial T2", "Axial FLAIR", "Axial DWI/ADC", "Axial SWI", "Post-contrast T1"],
        "findings": {
            "brain_parenchyma": ["3.2 cm enhancing mass in left frontal lobe."],
            "mass_effect": ["4 mm rightward midline shift."],
            "ventricles": "Normal configuration."
        },
        "impression": [
            "High-grade glioma in left frontal lobe.",
            "Midline shift requires urgent intervention."
        ],
        "recommendations": ["Neurosurgical consultation", "Biopsy"],
        "comparison": "No prior studies available.",
        "biomarkers": {
            "lesion_1": {"volume_cm3": 17.2, "adc_mean": 0.72}
        },
        "critical_result": True,
        "sign_off": {
            "radiologist": "Dr. Jane Radiologist, MD",
            "signature_date": "2025-01-15T14:45:00Z",
            "signature_method": "Electronic 2FA",
            "verification_status": "Final"
        }
    }
    
    engine = MRIReportTemplateEngine()
    
    # Render text
    text_report = engine.render_text(data)
    print("=" * 60)
    print("TEXT REPORT OUTPUT (preview)")
    print("=" * 60)
    print("\n".join(text_report.split("\n")[:30]))
    print("...\n")
    
    # Save outputs
    os.makedirs("output", exist_ok=True)
    
    with open(os.path.join("output", "mri_report_text.txt"), "w") as f:
        f.write(text_report)
    
    json_report = engine.render_json(data)
    with open(os.path.join("output", "mri_report_fhir.json"), "w") as f:
        f.write(json_report)
    
    xml_report = engine.render_xml(data)
    with open(os.path.join("output", "mri_report_cda.xml"), "w") as f:
        f.write(xml_report)
    
    print("[Jinja2] All formats generated in output/")
    return text_report, json_report, xml_report

if __name__ == "__main__":
    demo_jinja2_engine()
```

---

## 4. Safety Wording Patterns

### 4.1 Critical Findings Taxonomy

| Priority | Trigger Words | Communication SLA | Documentation |
|----------|---------------|-------------------|---------------|
| Critical (Life-threatening) | "URGENT", "CRITICAL", "EMERGENCY" | Verbal within 1 hour | Time, recipient name, method in report |
| Urgent (Same-day action) | "URGENT", "STAT", "Recommend same-day" | Electronic alert within 6 hours | Read receipt required |
| Semi-urgent | "Recommend follow-up", "Clinical correlation" | Inbox message within 1-3 days | Acknowledgment tracking |
| Incidental | "Incidental finding", "Non-urgent" | Standard report routing | Routine follow-up |

### 4.2 Liability-Shielding Language

```
SAFE PHRASES:
"Clinical correlation is recommended."
"Findings are suggestive of [diagnosis]; tissue diagnosis is required for confirmation."
"The limitations of this examination include [list]."
"If clinical concern persists, further evaluation with [modality] may be considered."
"Comparison with prior outside imaging is recommended if available."
"The interpreting radiologist was not provided with [missing clinical information]."
"These findings were discussed with [name] at [time] via [method]."
"This is a preliminary interpretation pending attending radiologist review."

AVOID:
"Normal." (without specifying what was evaluated)
"No disease." (impossible to prove negative)
"Benign." (without supporting imaging characteristics)
"The patient is fine." (beyond radiologist scope)
"No follow-up needed." (defer to referring clinician)
```

### 4.3 Uncertainty Quantification Phrases

```
Certainty Level          Phrasing
----------------         --------
Definitive               "Consistent with / Diagnostic of"
Highly likely            "Most consistent with / Highly suggestive of"
Probable                 "Suggestive of / Likely represents"
Possible                 "May represent / Cannot exclude"
Differential             "Differential diagnosis includes"
Equivocal                "Indeterminate / Nonspecific"
Normal variant           "Consistent with normal variant"
```

### 4.4 Comparative Temporal Language

```
STABLE:    "Stable compared to [date]. No significant interval change."
IMPROVED:  "Decreased in size/signal compared to [date]."
WORSENED:  "Increased in size/signal compared to [date]."
NEW:       "New finding not present on [date]."
RESOLVED:  "Previously seen [finding] on [date] has resolved."
UNCLEAR:   "Interval change cannot be assessed due to [reason]."

QUANTIFICATION:
"Decreased from 2.8 cm to 1.9 cm (32% reduction)."
"Increased from 1.2 cm to 1.8 cm (50% increase)."
"Stable in size at 2.4 cm (within measurement variability)."
```

---

## 5. Clinician Sign-Off Workflow

### 5.1 Draft -> Review -> Finalize -> Sign -> Distribute

```
+----------------+     +----------------+     +----------------+
|   DRAFT        | --> |   REVIEW       | --> |   FINALIZE     |
| (AI/Resident)  |     | (Attending)    |     | (Attending)    |
+----------------+     +----------------+     +----------------+
                                                      |
+----------------+     +----------------+            |
|  DISTRIBUTE    | <-- |    SIGN        | <----------+
| (RIS/PACS/EHR) |     | (Digital Sig)  |
+----------------+     +----------------+
```

**Stage Descriptions:**

| Stage | Actor | Duration | Output |
|-------|-------|----------|--------|
| Draft | AI / Resident / Fellow | Minutes to hours | Preliminary report |
| Review | Attending Radiologist | Minutes | Annotated draft |
| Finalize | Attending Radiologist | Minutes | Approved narrative |
| Sign | Attending + 2FA | Seconds | Legally signed report |
| Distribute | RIS/PACS/FHIR | Seconds to minutes | Report in EHR |

### 5.2 Digital Signature Standards

```python
# Electronic signature with 2FA workflow
SIGNATURE_WORKFLOW = {
    "level_1_preliminary": {
        "signer": "Resident / AI System",
        "method": "Preliminary stamp",
        "legal_weight": "Not final -- requires attending review",
        "notification": "Attending alerted for review"
    },
    "level_2_final": {
        "signer": "Board-certified radiologist",
        "method": "Electronic signature + 2FA (password + token)",
        "legal_weight": "Final, legally binding",
        "timestamp": "RFC 3339 / DTM format",
        "tamper_evidence": "SHA-256 hash of signed content stored"
    },
    "level_3_amendment": {
        "signer": "Original interpreter or designee",
        "method": "Addendum with separate signature",
        "legal_weight": "Amendment to final report",
        "requirement": "Original report must remain visible"
    }
}
```

### 5.3 Amendment / Addendum Protocol

```
ADDENDUM TEMPLATE:

ADDENDUM TO MRI BRAIN REPORT (Accession: {{ accession_number }})
Original Report Date: {{ original_date }}
Addendum Date: {{ amendment_date }}
Reason for Addendum: [Additional clinical information / Comparison imaging / 
                       Typographical correction / Additional interpretation]

Addendum Text:
[The original report stated: "..."]
[This is amended to read: "..."]
[OR: Additional findings: "..."]

Signed by: {{ radiologist_name }}
Date/Time: {{ amendment_signature_date }}

The original report remains part of the medical record.
```

---

## 6. Export Governance

### 6.1 Data Retention Policies

| Jurisdiction | Retention Period | Format | Notes |
|-------------|------------------|--------|-------|
| USA (HIPAA) | 6-7 years minimum | DICOM SR + PDF | States may require longer |
| EU (GDPR) | Duration of care + 10 years | DICOM + FHIR | Patient right to deletion limited for medical records |
| UK (NHS) | 8 years after last contact | DICOM + HL7 CDA | 25 years for pediatric records |
| Australia | Minimum 7 years | DICOM + PDF | 25 years until patient turns 25 for pediatric |
| Canada | 10 years (varies by province) | DICOM | Provincial variation |

### 6.2 Format Compliance Matrix

| Export Destination | Required Format | Standard | Notes |
|-------------------|----------------|----------|-------|
| EHR (Epic/Cerner) | FHIR R4 | HL7 FHIR | DiagnosticReport + ImagingStudy |
| PACS (GE/Siemens) | DICOM SR + PDF | DICOM PS3.16 | TID 2000 encapsulated CDA |
| National Exchange | HL7 CDA R2 + FHIR | IHE XDS-I | Cross-enterprise document sharing |
| Patient Portal | PDF + HTML | HIPAA 21 CFR Part 11 | Plain language summary |
| Research Registry | FHIR + DICOM SR | CDISC / NCI CDE | De-identified, coded findings |
| Legal / Court | PDF/A-1b | ISO 19005 | Long-term archival format |
| ACR Registry | DICOM SR + FHIR | NRDR | National Radiology Data Registry |

### 6.3 Audit Trail Requirements

```python
AUDIT_TRAIL_SCHEMA = {
    "report_id": "Unique report identifier",
    "events": [
        {
            "timestamp": "ISO 8601 timestamp",
            "actor": "User ID of actor",
            "actor_role": "Radiologist / Resident / AI / Administrator",
            "action": "CREATE / VIEW / EDIT / SIGN / DISTRIBUTE / AMEND",
            "object": "Report section or finding affected",
            "context": {
                "ip_address": "Source IP",
                "session_id": "Authentication session",
                "user_agent": "Client application"
            },
            "integrity": "SHA-256 hash of event record"
        }
    ],
    "retention": "Immutable, write-once storage",
    "compliance": "HIPAA Audit Controls (164.312(b))"
}
```

### 6.4 Cross-Border Transfer Regulations

| Regulation | Scope | Requirement |
|-----------|-------|-------------|
| HIPAA (USA) | US healthcare | BAA required, minimum necessary standard |
| GDPR (EU) | EU residents | Lawful basis, DPIA for high-risk processing |
| DCB0129 (UK) | UK health software | Clinical safety case required |
| PIPEDA (Canada) | Canadian healthcare | Consent-based, accountability principle |
| My Health Record (AU) | Australia | Registered provider, compliance framework |

---

## 7. Complete Annotated Templates

### 7.1 Brain MRI (Non-Contrast)

```
================================================================================
MRI BRAIN WITHOUT CONTRAST
================================================================================

CLINICAL HISTORY:
[Clinical indication: e.g., headache, dizziness, seizure, trauma, stroke workup]

TECHNIQUE:
Multiplanar multi-sequence MRI of the brain performed on a [1.5/3.0] Tesla
scanner without intravenous contrast administration.

Sequences obtained:
- Sagittal T1-weighted spin-echo
- Axial T2-weighted fast spin-echo
- Axial FLAIR (Fluid-Attenuated Inversion Recovery)
- Axial diffusion-weighted imaging (DWI) with ADC map
- Axial susceptibility-weighted imaging (SWI) / gradient-recalled echo (GRE)
- Coronal T2-weighted [if performed]

Image quality: [Diagnostic / Limited by motion / Limited by artifact]

FINDINGS:

CEREBRAL HEMISPHERES:
- Gray-white matter differentiation: [Normal / Abnormal -- specify]
- Cerebral cortex: [Normal / Atrophic / Focal signal abnormality in ___ gyrus]
- White matter: [Normal / T2 hyperintensities consistent with chronic microvascular
  ischemic change, scattered in the periventricular and subcortical white matter]
- Basal ganglia and thalami: [Normal / Abnormal signal]
- Internal capsule: [Normal / Abnormal]

VENTRICULAR SYSTEM:
- Lateral ventricles: [Normal size / Enlarged]
- Third ventricle: [Normal / Dilated]
- Fourth ventricle: [Normal]
- Midline shift: [Absent / Present, ___ mm to the ___]

EXTRA-AXIAL SPACES:
- Subarachnoid spaces: [Normal / Widened / Effaced]
- Subdural collections: [None / Present -- specify]
- Epidural collections: [None / Present]

POSTERIOR FOSSA:
- Cerebellum: [Normal / Atrophic]
- Brainstem: [Normal]
- Fourth ventricle: [Normal]
- Cerebellopontine angles: [Normal]

SELLA / PARASELLAR:
- Pituitary gland: [Normal in size and signal]
- Optic chiasm: [Normal / Compressed]

VASCULAR:
- Circle of Willis: [Normal flow voids]
- Venous sinuses: [Patent]
- SWI/GRE: [No hemorrhagic foci / Microhemorrhages in ___]

ORBITS / SINUSES / MASTOIDS:
- Orbits: [Normal]
- Paranasal sinuses: [Clear / Mucosal thickening in ___]
- Mastoid air cells: [Clear]

SKULL:
- Calvarium: [Intact]
- Skull base: [Normal]

DIFFUSION (DWI/ADC):
- [No acute restricted diffusion / Acute infarct in ___ / Restricted diffusion in ___]

COMPARISON:
[No prior studies / Compared to MRI dated ___: findings are stable/improved/worsened]

IMPRESSION:
1. [Normal MRI brain without contrast / Primary finding]
2. [Secondary finding]
3. [Incidental finding with recommendation if applicable]

RECOMMENDATIONS:
[ ] No further imaging recommended
[ ] Contrast-enhanced MRI recommended for further evaluation
[ ] Follow-up imaging in [timeframe]
[ ] Clinical correlation recommended

Electronically signed by: ___
Date/Time: ___
```

### 7.2 Brain MRI (Contrast-Enhanced -- High-Grade Glioma)

See Section 3 (tool implementations) for the complete high-grade glioma template with critical findings.

### 7.3 Spine MRI

```
================================================================================
MRI [CERVICAL / THORACIC / LUMBAR] SPINE [WITH / WITHOUT] CONTRAST
================================================================================

CLINICAL HISTORY:
[Neck/back pain, radiculopathy, myelopathy, trauma, post-surgical evaluation]

TECHNIQUE:
Multiplanar multi-sequence MRI of the [cervical/thoracic/lumbar] spine performed
on a [1.5/3.0] Tesla scanner [with / without] intravenous gadolinium contrast.

Sequences:
- Sagittal T1-weighted
- Sagittal T2-weighted
- Sagittal STIR [or fat-sat T2]
- Axial T2-weighted through [levels]
- [Axial / Sagittal T1-weighted post-contrast through ___]

FINDINGS:

ALIGNMENT:
- Normal / [Kyphosis / Lordosis / Scoliosis / Spondylolisthesis grade ___ at ___]

VERTEBRAL BODIES:
- Signal intensity: [Normal / T1 hypointense / T2 hyperintense at ___]
- Height: [Maintained / Compression fracture at ___ with ___% loss of height]
- Marrow edema: [None / Present at ___]

DISC SPACES:
[Level-by-level assessment for cervical: C2-C3 through C6-C7]
[Level-by-level assessment for lumbar: L1-L2 through L5-S1]

For each level:
- Disc height: [Normal / Mildly narrowed / Moderately narrowed / Severely narrowed]
- Disc signal (T2): [Normal / Desiccated (dark)]
- Disc contour: [Normal / Bulge / Protrusion / Extrusion / Sequestration]
- Central canal stenosis: [None / Mild / Moderate / Severe]
- Neural foraminal stenosis: [None / Mild / Moderate / Severe, ___ side]

SPINAL CORD / THECAL SAC:
- Spinal cord: [Normal signal / T2 hyperintensity at ___ level / Syrinx]
- Thecal sac: [Normal / Compressed at ___ level]
- CSF space anterior to cord: [Normal / Effaced]
- CSF space posterior to cord: [Normal / Effaced]

POSTERIOR ELEMENTS:
- Facet joints: [Normal / Degenerative changes / Hypertrophy at ___]
- Ligamentum flavum: [Normal / Hypertrophied at ___]

PARASPINAL SOFT TISSUES:
- [Normal / Edema / Mass / Abnormal enhancement]

PRE-/POST-CONTRAST (if performed):
- [Abnormal enhancement in ___ / No abnormal enhancement]

COMPARISON:
[No prior / Compared to ___ with ___ change]

IMPRESSION:
1. [Most significant finding -- e.g., Disc herniation, cord compression, fracture]
2. [Secondary degenerative changes by level]
3. [Recommendation for management]

RECOMMENDATIONS:
[ ] Conservative management
[ ] Epidural steroid injection
[ ] Neurosurgical / orthopedic spine consultation
[ ] [Other]

Electronically signed by: ___
Date/Time: ___
```

### 7.4 Knee MRI (MSK)

```
================================================================================
MRI [RIGHT / LEFT / BILATERAL] KNEE WITHOUT CONTRAST
================================================================================

CLINICAL HISTORY:
[Trauma, pain, swelling, instability, mechanical symptoms]

TECHNIQUE:
Multiplanar multi-sequence MRI of the [right/left] knee performed on a 
[1.5/3.0] Tesla scanner.

Sequences:
- Sagittal proton density (PD)
- Sagittal T2-weighted fat-saturated (or STIR)
- Coronal T1-weighted
- Coronal proton density fat-saturated
- Axial proton density fat-saturated

FINDINGS:

BONES:
- Distal femur: [Normal / Bone marrow edema in ___ / Contusion / Fracture]
- Proximal tibia: [Normal / Bone marrow edema / Contusion / Fracture]
- Patella: [Normal / Bone marrow edema / Chondromalacia grade ___]

ARTICULAR CARTILAGE:
- Patellofemoral compartment: [Normal / Chondral thinning / Full-thickness defect]
- Medial femorotibial compartment: [Normal / Thinning / Defect]
- Lateral femorotibial compartment: [Normal / Thinning / Defect]
- Cartilage grading (if applicable): [Outerbridge I-IV / ICRS grade]

MENISCI:
- Medial meniscus: [Normal / Degenerative signal / Tear: type ___, location ___]
- Lateral meniscus: [Normal / Degenerative signal / Tear: type ___, location ___]
- Meniscal extrusion: [None / Medial / Lateral, ___ mm]

LIGAMENTS:
- ACL (anterior cruciate): [Intact / Partial tear / Complete tear / Postsurgical]
- PCL (posterior cruciate): [Intact / Partial tear / Complete tear]
- MCL (medial collateral): [Intact / Sprain grade ___ / Tear]
- LCL (lateral collateral): [Intact / Sprain / Tear]

TENDONS:
- Patellar tendon: [Normal / Tendinosis / Partial tear / Complete tear]
- Quadriceps tendon: [Normal / Tendinosis / Tear]
- Popliteus tendon: [Normal / Tendinosis / Tear]
- Iliotibial band: [Normal / Thickening / Bursitis]

SYNOVIUM / JOINT EFFUSION:
- Joint effusion: [None / Small / Moderate / Large]
- Synovitis: [None / Mild / Moderate / Severe]
- Popliteal cyst (Baker cyst): [Absent / Present, ___ cm]

EXTENSOR MECHANISM:
- Patellar alignment: [Normal / Alta / Baja / Lateral tilt / Subluxation]
- Trochlear groove: [Normal / Dysplastic / Shallow]

COMPARISON:
[No prior / Compared to ___]

IMPRESSION:
1. [Primary finding, e.g., ACL tear, meniscal tear, fracture]
2. [Secondary findings]
3. [Cartilage status]

RECOMMENDATIONS:
[ ] Orthopedic consultation
[ ] Physical therapy
[ ] Arthroscopy
[ ] Conservative management

Electronically signed by: ___
Date/Time: ___
```

### 7.5 Prostate MRI (mpMRI / PI-RADS)

```
================================================================================
MULTIPARAMETRIC MRI OF THE PROSTATE (mpMRI)
================================================================================

CLINICAL HISTORY:
[Elevated PSA, prior biopsy, active surveillance, staging]
PSA: ___ ng/mL
PSA density: ___ ng/mL/cc [if available]
Prior biopsy: [No / Yes, date ___, cores ___, Gleason ___]

TECHNIQUE:
Multiparametric MRI of the prostate performed on a 3.0 Tesla scanner using
an [endorectal / external phased-array] coil.

Sequences:
- High-resolution T2-weighted (T2W) in axial, sagittal, and coronal planes
- Diffusion-weighted imaging (DWI) with ADC map (b=0, 1000, [1500/2000] s/mm2)
- Dynamic contrast-enhanced (DCE) MRI
- [Optional: MR spectroscopy / High b-value DWI]

Prostate volume: ___ cc (calculated from ellipsoid formula)

FINDINGS:

PROSTATE ANATOMY:
- Size: [Normal / Enlarged]
- Zonal anatomy: [Well-preserved / Indistinct transition zone]
- Capsule: [Intact / Irregular / Focal bulge]

PERIPHERAL ZONE (PZ):
- [Right / Left / Bilateral]: [Normal / Hypointense T2 lesion at ___]
- DWI: [No restricted diffusion / Restricted diffusion at ___]
- ADC: [Normal / Low at ___]
- DCE: [No early enhancement / Early enhancement at ___]

TRANSITION ZONE (TZ):
- [Normal / Enlarged with heterogeneous signal]
- [Nodule / Lesion description]

ANTERIOR FIBROMUSCULAR STROMA:
- [Normal / Lesion]

SEMINAL VESICLES:
- [Normal / Invasion suggested by ___]

NEUROVASCULAR BUNDLES:
- [Preserved / Involvement at ___]

LYMPH NODES:
- [No pathologic lymphadenopathy / Enlarged nodes at ___]

BONES:
- [No metastatic disease / Metastatic lesion at ___]

EXTRAPROSTATIC EXTENSION:
- [None / Focal / Established -- describe]

PI-RADS ASSESSMENT:
Lesion 1:
- Location: [Peripheral zone / Transition zone / Anterior fibromuscular stroma]
- Sector (PI-RADS v2.1): [e.g., PZpl (posterolateral), TZa (anterior)]
- Size: ___ mm
- T2 score: [1-5]
- DWI score: [1-5]
- DCE score: [+ / -] (for PZ) or [1-5] (for TZ)
- Overall PI-RADS score: [1 / 2 / 3 / 4 / 5]
  * PI-RADS 1-2: Clinically significant cancer unlikely
  * PI-RADS 3: Indeterminate
  * PI-RADS 4-5: Clinically significant cancer likely

COMPARISON:
[No prior / Compared to mpMRI ___: lesions stable / changed]

IMPRESSION:
1. [PI-RADS score] lesion in [location], [size] mm. [Clinical significance].
2. [Secondary findings]
3. [Extraprostatic extension assessment]

RECOMMENDATIONS:
[ ] MRI-targeted biopsy recommended (PI-RADS 4-5)
[ ] Follow-up MRI in [6-12] months (PI-RADS 3)
[ ] Routine follow-up (PI-RADS 1-2)
[ ] Active surveillance continuation
[ ] Staging workup if biopsy-proven malignancy

Electronically signed by: ___
Date/Time: ___
```

---

## 8. Appendices

### Appendix A: DICOM SOP Classes for MRI Reporting

| SOP Class | UID | Purpose |
|-----------|-----|---------|
| MR Image Storage | 1.2.840.10008.5.1.4.1.1.4 | MR image instances |
| Enhanced MR Image Storage | 1.2.840.10008.5.1.4.1.1.4.1 | Multi-frame MR |
| MR Spectroscopy Storage | 1.2.840.10008.5.1.4.1.1.4.2 | MRS data |
| Basic Text SR | 1.2.840.10008.5.1.4.1.1.88.11 | Text-based SR |
| Enhanced SR | 1.2.840.10008.5.1.4.1.1.88.22 | Structured reports with images |
| Comprehensive SR | 1.2.840.10008.5.1.4.1.1.88.33 | Full structured reporting |
| Encapsulated CDA | 1.2.840.10008.5.1.4.1.1.104.1 | HL7 CDA in DICOM wrapper |
| Key Object Selection | 1.2.840.10008.5.1.4.1.1.88.59 | Key image references |

### Appendix B: LOINC Codes for MRI

| Exam | LOINC Code | Display Name |
|------|-----------|--------------|
| MRI Brain | 18748-4 | Diagnostic imaging study |
| MRI Brain w/o contrast | 30625-9 | MR Brain without contrast |
| MRI Brain w/ contrast | 30626-7 | MR Brain with contrast |
| MRI Brain w/ & w/o | 24590-2 | MR Brain with and without contrast |
| MRI Spine Cervical | 30620-0 | MR Cervical spine |
| MRI Spine Lumbar | 30954-4 | MR Lumbar spine |
| MRI Knee | 30627-5 | MR Knee |
| MRI Prostate | 75733-5 | MR Prostate |
| MRI Breast | 30651-5 | MR Breast |
| MRI Liver | 30828-9 | MR Liver |

### Appendix C: FHIR Search Parameters for MRI

```
# Search for patient's MRI studies
GET /ImagingStudy?subject=Patient/123&modality=MR

# Search for MRI reports by date
GET /DiagnosticReport?subject=Patient/123&date=gt2025-01-01&category=RAD

# Search by accession number
GET /ImagingStudy?identifier=ACC-2025-000123

# Search for critical results
GET /DiagnosticReport?subject=Patient/123&conclusion:contains=mass

# Include imaging studies with reports
GET /DiagnosticReport?_include=DiagnosticReport:imagingStudy&subject=Patient/123
```

### Appendix D: Reference Standards Summary

| Standard | Organization | Version | Role in MRI Reporting |
|----------|-------------|---------|----------------------|
| DICOM PS3.16 | NEMA | 2024e | SR templates, TID 2000, content items |
| HL7 FHIR R4 | HL7 | 4.0.1 | ImagingStudy, DiagnosticReport, Observation |
| HL7 CDA R2 | HL7 | 2.1.0 | Document exchange, DICOM encapsulated CDA |
| RadLex | RSNA | 4.0+ | Terminology, ontology, 75,000+ terms |
| IHE MRRT | IHE | TI 2013 | Template format, transport profile |
| IHE XDS-I | IHE | 2024 | Cross-enterprise imaging document sharing |
| LOINC | Regenstrief | 2.78+ | Procedure codes |
| SNOMED CT | IHTSDO | 2024 | Clinical terminology for findings |
| ACR Practice Guidelines | ACR | 2024 | Clinical reporting standards |
| PI-RADS v2.1 | ACR/ESUR | 2.1 | Prostate MRI scoring |
| BI-RADS MRI | ACR | 5th ed | Breast MRI reporting |
| LI-RADS v2018 | ACR | 2018 | Liver MRI/CT reporting |

### Appendix E: Glossary

| Term | Definition |
|------|------------|
| ADC | Apparent Diffusion Coefficient -- quantifies water diffusion |
| DCE | Dynamic Contrast Enhancement -- time-resolved contrast uptake |
| DWI | Diffusion-Weighted Imaging -- measures Brownian motion of water |
| FLAIR | Fluid-Attenuated Inversion Recovery -- suppresses CSF signal |
| GRE | Gradient-Recalled Echo -- T2*-weighted sequence |
| MPRAGE | Magnetization-Prepared Rapid Acquisition Gradient Echo -- T1W 3D |
| rCBV | relative Cerebral Blood Volume -- perfusion metric |
| SR | Structured Reporting -- machine-readable report encoding |
| STIR | Short Tau Inversion Recovery -- fat suppression technique |
| SWI | Susceptibility-Weighted Imaging -- blood products/calcium |
| TE | Echo Time -- time between excitation and signal readout |
| TI | Inversion Time -- time between inversion pulse and excitation |
| TR | Repetition Time -- time between successive pulse cycles |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-01 | DeepSynaps Protocol Studio | Initial comprehensive design guide |

---

*This document was compiled from standards published by DICOM/NEMA, HL7 International, RSNA, ACR, IHE, and peer-reviewed radiology informatics literature. All code examples are provided for educational and implementation reference purposes. Verify regulatory compliance with local institutional policies and applicable laws (HIPAA, GDPR, etc.) before production deployment.*

*For questions or contributions, contact the DeepSynaps Protocol Studio research team.*

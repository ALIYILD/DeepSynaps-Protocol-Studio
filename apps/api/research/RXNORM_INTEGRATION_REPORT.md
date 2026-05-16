# RxNorm & Medication Ontology Integration Report
## DeepSynaps Protocol Studio -- Knowledge Layer Phase 1

**Document Version**: 1.0
**Date**: 2025-07-15
**Author**: Pharmaceutical Informatics Research Division
**Classification**: Technical Integration Specification

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [RxNorm Overview & Architecture](#2-rxnorm-overview--architecture)
3. [API Specification](#3-api-specification)
4. [Data Model Deep Dive](#4-data-model-deep-dive)
5. [ATC Mapping Strategy](#5-atc-mapping-strategy)
6. [SNOMED CT Integration](#6-snomed-ct-integration)
7. [DeepSynaps Integration Architecture](#7-deepsynaps-integration-architecture)
8. [Provenance & Confidence Model](#8-provenance--confidence-model)
9. [Licensing & Compliance](#9-licensing--compliance)
10. [Open Source Tooling](#10-open-source-tooling)
11. [Implementation Recommendations](#11-implementation-recommendations)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

### 1.1 Purpose

This report provides a comprehensive technical analysis of RxNorm and related medication normalization systems for integration into the DeepSynaps Protocol Studio Knowledge Layer. DeepSynaps is a clinical neuromodulation platform supporting tDCS, tACS, tRNS, TMS, PBM, and neurofeedback protocols. The Knowledge Layer must accurately represent patient medication profiles to support drug-device interaction assessment, contraindication checking, and protocol personalization.

### 1.2 Key Findings

| Finding | Impact | Priority |
|---|---|---|
| RxNorm is **public domain** with no licensing fees | Cost-effective integration; no legal barriers | Critical |
| RxNav API rate limit: **20 req/sec per IP** | Requires local caching or RxNav-in-a-Box | High |
| RxNav-in-a-Box Docker available for **local deployment** | Eliminates rate limits; enables offline operation | High |
| ATC covers **97% of Medicare prescriptions** via ATCPROD | Excellent coverage for neuromodulation-relevant psych meds | High |
| SNOMED CT mapping covers **~2,710 of 4,038 ingredients** (67%) | Partial coverage; requires RxNorm as primary | Medium |
| **N05 (Psycholeptics)** and **N06 (Psychoanaleptics)** are the primary ATC classes relevant to neuromodulation | Critical for antidepressant, anxiolytic, antipsychotic identification | Critical |
| medspacy + scispacy provide **Python-native NER** for medication extraction from clinical notes | Enables automated medication profile building | High |
| RxNorm supports **approximate matching** with spelling correction and abbreviation expansion | Robust against noisy medication strings | High |

### 1.3 Strategic Recommendation

**Adopt a hybrid architecture**: Use **RxNorm as the canonical medication identifier** with **ATC classification for therapeutic grouping** and **SNOMED CT for clinical semantic enrichment**. Deploy **RxNav-in-a-Box locally** for production to eliminate API rate limits and ensure data sovereignty. Implement a **multi-tier cache** with Redis for hot lookups and a local RxNorm database for cold storage.

### 1.4 Scope for DeepSynaps

The neuromodulation domain intersects critically with psychiatric and neurologic pharmacotherapy:

- **Antidepressants (N06A)**: SSRIs, SNRIs, TCAs, MAOIs -- affect serotonin/norepinephrine systems targeted by tDCS/tACS
- **Antipsychotics (N05A)**: Typical and atypical -- impact dopamine modulation relevant to TMS protocols
- **Anxiolytics (N05B)**: Benzodiazepines -- GABAergic effects relevant to tRNS
- **Hypnotics/Sedatives (N05C)**: Z-drugs, melatonin agonists -- affect sleep protocols
- **Psychostimulants (N06B)**: Methylphenidate, modafinil -- dopaminergic effects relevant to PBM and neurofeedback
- **Anti-dementia drugs (N06D)**: Cholinesterase inhibitors -- relevant for cognitive enhancement protocols

---

## 2. RxNorm Overview & Architecture

### 2.1 What is RxNorm?

RxNorm is a standardized nomenclature for clinical drugs and drug delivery devices, created and maintained by the **U.S. National Library of Medicine (NLM)**. It provides normalized names for clinical drugs and links its names to many of the drug vocabularies commonly used in pharmacy management and drug interaction software, including:

- National Drug Code (NDC)
- First DataBank (FDB)
- Medispan
- Gold Standard Drug Database
- Multum
- SNOMED CT
- ATC (Anatomical Therapeutic Chemical Classification)
- VA National Drug File

### 2.2 Core Principles

1. **Normalization**: Each clinical drug is assigned a unique **RxCUI** (RxNorm Concept Unique Identifier) regardless of source vocabulary
2. **Semantic Richness**: Concepts encode ingredient, strength, dose form, and brand name
3. **Prescribable Subset**: A curated subset of drugs currently marketed in the U.S.
4. **Monthly Updates**: New releases published monthly with current and historical data
5. **Public Domain**: No licensing fees; freely usable for research and commercial applications

### 2.3 System Architecture

```
+---------------------------------------------------------------+
|                    RxNorm DATA SOURCES                        |
|  +--------+  +---------+  +--------+  +---------+  +------+  |
|  |  NDC   |  |  FDB    |  | Medispan|  |  Multum |  | VA   |  |
|  | FDA    |  |         |  |         |  |         |  | NDF  |  |
|  +---+----+  +----+----+  +----+----+  +----+----+  +--+---+  |
|      |           |            |            |           |     |
|      v           v            v            v           v     |
|  +---------------------------------------------------------+  |
|  |              INVERSION (Data Loading)                    |  |
|  |     Source files -> Rich Release Format (RRF)           |  |
|  +-------------------------+-------------------------------+  |
|                            |                                  |
|                            v                                  |
|  +---------------------------------------------------------+  |
|  |              INSERTION (Database Loading)                |  |
|  |     RRF files -> RxNorm database (Oracle)               |  |
|  +-------------------------+-------------------------------+  |
|                            |                                  |
|                            v                                  |
|  +---------------------------------------------------------+  |
|  |              EDITING (Conflict Resolution)               |  |
|  |     Human editors resolve source conflicts               |  |
|  +-------------------------+-------------------------------+  |
|                            |                                  |
|                            v                                  |
|  +---------------------------------------------------------+  |
|  |              PRODUCTION (Release Generation)             |  |
|  |     Monthly validated releases in RRF format            |  |
|  +---------------------------------------------------------+  |
|                            |                                  |
|              +-------------+-------------+                    |
|              |                           |                    |
|              v                           v                    |
|  +-----------------------+   +----------------------+       |
|  |   RxNav Web/API       |   |   UMLS Metathesaurus |       |
|  |   (REST/SOAP)         |   |   (RXNCONSO, etc.)   |       |
|  +-----------------------+   +----------------------+       |
+---------------------------------------------------------------+
```

### 2.4 RxNorm Data Flow for DeepSynaps

```
Clinical Input (RxCUI/NDC/Drug Name)
         |
         v
+-------------------------+
|   RxNorm Resolver       |
|  (RxNav API or Local)   |
+-------------------------+
         |
    +----+----+
    |         |
    v         v
+-------+  +--------+
| RxCUI |  | Status |
|  e.g. |  | Active?|
| 308135|  |Obsolete|
+---+---+  +----+---+
    |           |
    v           v
+-------+  +------------------+
| IN    |  | Remapped RxCUI   |
| (e.g. |  | (if applicable)  |
|amiodar|  +------------------+
+---+---+         |
    |             v
    v      +--------------+
+-------+  | Historical   |
| SCD   |  | Data         |
| (e.g. |  +--------------+
|amlodipi|
|10 MG  |
+-------+--------+
                 |
    +------------+------------+
    |            |            |
    v            v            v
+-------+  +---------+  +---------+
|  ATC  |  | SNOMED  |  |   VA    |
| Class |  |   CT    |  |  Class  |
|C08CA01|  |SCT:3869 |  |CV800   |
+-------+  +---------+  +---------+
```

---

## 3. API Specification

### 3.1 Base URLs

| Service | Base URL | Format |
|---|---|---|
| RxNorm API (REST) | `https://rxnav.nlm.nih.gov/REST/` | XML, JSON |
| RxNorm API (SOAP) | `https://rxnav.nlm.nih.gov/RxNormDBService.xml` | SOAP |
| RxTerms API | `https://rxnav.nlm.nih.gov/REST/RxTerms/` | JSON |
| RxClass API | `https://rxnav.nlm.nih.gov/REST/rxclass/` | JSON |
| Prescribable RxNorm | `https://rxnav.nlm.nih.gov/REST/Prescribe/` | JSON |

**Note**: Since April 2016, all HTTP requests are redirected to HTTPS (HTTP 301). Always use `https://`.

### 3.2 Rate Limits and Authentication

```yaml
RateLimit:
  requests_per_second: 20
  scope: per IP address
  exceeded_response: HTTP 429 (Too Many Requests)
  
CachingRecommendation:
  ttl: 12-24 hours
  
Authentication:
  general_apis: "No API key required"
  proprietary_api: "UMLS license + proxy granting ticket required"
  proprietary_endpoint: "/rxcui/{rxcui}/proprietary"
  
RxNavInABox:
  local_deployment: "Eliminates rate limits entirely"
  docker_requirements: "12GB RAM, 100GB disk"
  umls_license_required: true
```

### 3.3 Core API Endpoints

#### 3.3.1 Concept Lookup by Name

```python
import requests
import json

def find_rxcui_by_name(drug_name):
    """
    Find RxCUI by drug name string.
    
    Endpoint: GET /REST/rxcui?name={name}
    """
    url = "https://rxnav.nlm.nih.gov/REST/rxcui.json"
    params = {
        "name": drug_name,
        # Optional parameters:
        # "search": 1-5 (search type: 1=exact, 2=normalized, etc.)
        # "srclist": "RXNORM" (source vocabularies)
        # "allsrc": 0/1 (whether to search all sources)
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    # Response structure:
    # {
    #   "idGroup": {
    #     "name": "Lipitor",
    #     "rxnormId": ["83367"],
    #     " conceptGroup": [
    #       {
    #         "tty": "BN",
    #         "conceptProperties": [
    #           {
    #             "rxcui": "83367",
    #             "name": "Lipitor",
    #             "synonym": "",
    #             "tty": "BN",
    #             "language": "ENG",
    #             "suppress": "N",
    #             "umlscui": "C0663242"
    #           }
    #         ]
    #       }
    #     ]
    #   }
    # }
    
    return data

# Example usage
result = find_rxcui_by_name("Lipitor")
print(json.dumps(result, indent=2))
```

#### 3.3.2 Get Drug Products

```python
def get_drugs(name):
    """
    Get drug products associated with a name.
    
    Endpoint: GET /REST/drugs.json?name={name}
    
    The name can be: ingredient, brand name, clinical dose form,
    branded dose form, clinical drug component, or branded drug component.
    """
    url = "https://rxnav.nlm.nih.gov/REST/drugs.json"
    params = {"name": name}
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    # Response contains drugGroup with conceptGroup arrays
    # organized by term type (tty): SCD, SBD, GPCK, BPCK
    
    drugs = []
    drug_group = data.get("drugGroup", {})
    concept_groups = drug_group.get("conceptGroup", [])
    
    for group in concept_groups:
        tty = group.get("tty", "")
        properties = group.get("conceptProperties", [])
        for prop in properties:
            drugs.append({
                "rxcui": prop.get("rxcui"),
                "name": prop.get("name"),
                "synonym": prop.get("synonym"),
                "tty": prop.get("tty"),
                "suppress": prop.get("suppress")
            })
    
    return drugs

# Example: Get all drug products containing fluoxetine
fluoxetine_drugs = get_drugs("fluoxetine")
print(f"Found {len(fluoxetine_drugs)} fluoxetine products")
for d in fluoxetine_drugs[:5]:
    print(f"  {d['tty']}: {d['name']} (RxCUI: {d['rxcui']})")
```

#### 3.3.3 Get All Related Information

```python
def get_all_related_info(rxcui):
    """
    Get all concepts related to a given RxCUI.
    
    Endpoint: GET /REST/rxcui/{rxcui}/allrelated.json
    
    Returns: Concepts related directly or indirectly to the specified concept,
    organized by relationship type and term type.
    """
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/allrelated.json"
    
    response = requests.get(url)
    response.raise_for_status()
    
    data = response.json()
    # Response contains allRelatedGroup with conceptGroup arrays
    # Each group has: rxcui, name, tty, relation
    
    related = {}
    all_related = data.get("allRelatedGroup", {})
    concept_groups = all_related.get("conceptGroup", [])
    
    for group in concept_groups:
        tty = group.get("tty", "")
        concepts = group.get("conceptProperties", [])
        related[tty] = []
        for concept in concepts:
            related[tty].append({
                "rxcui": concept.get("rxcui"),
                "name": concept.get("name"),
                "relation": concept.get("relation"),
                "tty": concept.get("tty")
            })
    
    return related

# Example: Get all related info for fluoxetine (RxCUI: 4493)
related = get_all_related_info("4493")
for tty, concepts in related.items():
    print(f"\n{tty} ({len(concepts)} concepts):")
    for c in concepts[:3]:
        print(f"  - {c['name']} (RxCUI: {c['rxcui']})")
```

#### 3.3.4 Get Related by Term Type

```python
def get_related_by_tty(rxcui, ttys):
    """
    Get concepts related to a given RxCUI, filtered by term types.
    
    Endpoint: GET /REST/rxcui/{rxcui}/related.json?tty={tty_list}
    
    Parameters:
        rxcui: The RxNorm concept ID
        ttys: List of term types (e.g., ['SBD', 'SBDF'])
    """
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/related.json"
    tty_param = "+".join(ttys)
    params = {"tty": tty_param}
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    return response.json()

# Example: Get branded drugs and branded drug forms for Plavix (RxCUI: 174742)
branded = get_related_by_tty("174742", ["SBD", "SBDF"])
# Returns:
# SBD: clopidogrel 75 MG Oral Tablet [Plavix] (RxCUI: 213169)
# SBD: clopidogrel 300 MG Oral Tablet [Plavix] (RxCUI: 749198)
# SBDF: clopidogrel Oral Tablet [Plavix] (RxCUI: 368301)
```

#### 3.3.5 Approximate Match (Fuzzy Search)

```python
def approximate_match(term, max_entries=20):
    """
    Find approximate matches for a potentially misspelled or abbreviated term.
    
    Endpoint: GET /REST/approximateTerm.json?term={term}&maxEntries={n}
    
    Features:
    - Word order independent
    - Case insensitive
    - Stemming (e.g., "extended" -> "extend")
    - Abbreviation expansion (e.g., "hctz" -> "hydrochlorothiazide")
    - Spelling correction for words >= 5 chars
    - Prefix extension
    """
    url = "https://rxnav.nlm.nih.gov/REST/approximateTerm.json"
    params = {
        "term": term,
        "maxEntries": max_entries,
        # Optional: "option": 1 (suppress spelling correction)
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    # Response structure:
    # {
    #   "approximateGroup": {
    #     "inputTerm": "lipitorr",
    #     "candidate": [
    #       {
    #         "rxcui": "83367",
    #         "rxaui": "1004558",
    #         "name": "Lipitor 10 MG Oral Tablet",
    #         "score": 100,
    #         "rank": 1
    #       }
    #     ]
    #   }
    # }
    
    candidates = []
    approx_group = data.get("approximateGroup", {})
    candidate_list = approx_group.get("candidate", [])
    
    # Handle single candidate (not in list)
    if isinstance(candidate_list, dict):
        candidate_list = [candidate_list]
    
    for candidate in candidate_list:
        candidates.append({
            "rxcui": candidate.get("rxcui"),
            "name": candidate.get("name"),
            "score": candidate.get("score"),
            "rank": candidate.get("rank")
        })
    
    return candidates

# Example: Misspelled drug name
candidates = approximate_match("lipitorr oral tablet")
for c in candidates[:5]:
    print(f"Score {c['score']}: {c['name']} (RxCUI: {c['rxcui']})")

# Example: Abbreviation expansion
candidates = approximate_match("olmesartan hctz tablet 40-12.5 mg")
# Finds: HYDROCHLOROTHIAZIDE 12.5MG/OLMESARTAN 40MG TAB
```

#### 3.3.6 Get NDCs for a Concept

```python
def get_ndcs(rxcui):
    """
    Get National Drug Codes associated with a concept.
    
    Endpoint: GET /REST/rxcui/{rxcui}/ndcs.json
    """
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/ndcs.json"
    
    response = requests.get(url)
    response.raise_for_status()
    
    data = response.json()
    ndc_list = data.get("ndcGroup", {}).get("ndcList", {}).get("ndc", [])
    
    # Handle single NDC (not in list)
    if isinstance(ndc_list, str):
        ndc_list = [ndc_list]
    
    return ndc_list

# Example: Get NDCs for fluoxetine 20 MG Oral Capsule (RxCUI: 1492894)
ndcs = get_ndcs("1492894")
print(f"Found {len(ndcs)} NDCs")
for ndc in ndcs[:10]:
    print(f"  {ndc}")
```

#### 3.3.7 Get Concept Properties

```python
def get_all_properties(rxcui, prop=None):
    """
    Get all properties of a concept.
    
    Endpoint: GET /REST/rxcui/{rxcui}/allProperties.json?prop={categories}
    
    Property categories:
    - CODES: All available codes
    - NAMES: All available names
    - ATTRIBUTES: Concept attributes
    - SOURCES: Source vocabularies
    - RELATIONSHIPS: Available relationships
    """
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/allProperties.json"
    params = {}
    if prop:
        params["prop"] = prop
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    return response.json()

# Example: Get properties for amlodipine (RxCUI: 17767)
props = get_all_properties("17767")
# Returns: conceptName, conceptCode, conceptType, conceptStatus,
#          conceptSource, etc.
```

#### 3.3.8 Get RxCUI History Status

```python
def get_rxcui_history_status(rxcui):
    """
    Get historical status information for a concept.
    
    Endpoint: GET /REST/rxcui/{rxcui}/historystatus.json
    
    Returns: Status (Active, Obsolete, Remapped, Quantified, NotCurrent, Unknown),
    definitional features, remapped RxCUIs, quantified forms,
    and dates of activity.
    """
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/historystatus.json"
    
    response = requests.get(url)
    response.raise_for_status()
    
    data = response.json()
    # Response contains:
    # - rxcui: The concept ID
    # - attributes: Definitional features (ingredient, dose form, etc.)
    # - statusHistory: Array of status changes with dates
    # - remappedConcept: Replacement concepts if remapped
    # - quantifiedConcept: Related quantified forms
    
    return data

# Example: Check if an RxCUI is still active
history = get_rxcui_history_status("541862")
# May show: status="Remapped", remappedRxCui="207346"
```

#### 3.3.9 RxClass API -- Drug Classification

```python
def get_class_by_rxnorm_druglist(rxcuis, rela_source="ATC"):
    """
    Get drug classes for a list of RxCUIs.
    
    Endpoint: GET /REST/rxclass/class/byRxcui.json?rxcui={rxcui}
    
    relaSource options: ATC, ATCPROD, MEDRT, FDASPL, VA, etc.
    """
    url = "https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json"
    params = {
        "rxcui": rxcuis,
        "relaSource": rela_source
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    return response.json()

# Example: Get ATC class for fluoxetine (RxCUI: 4493)
classes = get_class_by_rxnorm_druglist("4493", "ATC")
# Returns: N06AB03 (Selective serotonin reuptake inhibitors)

# Example: Get MEDRT mechanism of action
classes = get_class_by_rxnorm_druglist("4493", "MEDRT")
```

#### 3.3.10 Get Display Terms (Auto-complete)

```python
def get_display_terms():
    """
    Get all strings suitable for auto-completion UI.
    
    Endpoint: GET /REST/displaynames.json
    
    Returns ~150,000 strings. Useful for type-ahead search.
    """
    url = "https://rxnav.nlm.nih.gov/REST/displaynames.json"
    
    response = requests.get(url)
    response.raise_for_status()
    
    data = response.json()
    display_terms = data.get("displayTermsList", {}).get("term", [])
    
    return display_terms

# Example: Build auto-complete index
terms = get_display_terms()
print(f"Total display terms: {len(terms)}")
# Filter for terms starting with "fluo"
fluo_terms = [t for t in terms if t.lower().startswith("fluo")]
print(f"Terms starting with 'fluo': {fluo_terms[:10]}")
```

### 3.4 Data Format Specifications

#### 3.4.1 JSON vs XML

All RxNorm API endpoints support both JSON and XML formats:

| Format | Endpoint Suffix | Content-Type |
|---|---|---|
| XML | `.xml` appended to path | `application/xml` |
| JSON | `.json` appended to path | `application/json` |

**Recommendation**: Use JSON for all DeepSynaps integrations -- it is more compact and native to Python/JavaScript processing pipelines.

#### 3.4.2 JSON Response Structure

```json
{
  "rxnormdata": {
    "idGroup": {
      "name": "search_term",
      "rxnormId": ["rxcui_1", "rxcui_2"],
      "conceptGroup": [
        {
          "tty": "SCD",
          "conceptProperties": [
            {
              "rxcui": "308135",
              "name": "Amlodipine 10 MG Oral Tablet",
              "synonym": "",
              "tty": "SCD",
              "language": "ENG",
              "suppress": "N",
              "umlscui": "C0978317"
            }
          ]
        }
      ]
    }
  }
}
```

#### 3.4.3 Error Responses

| HTTP Status | Meaning | Action |
|---|---|---|
| 200 | Success | Process response |
| 301 | Redirected to HTTPS | Update URL to use HTTPS |
| 400 | Bad Request | Check parameters |
| 404 | Not Found | Concept does not exist |
| 429 | Too Many Requests | Back off, implement rate limiting |
| 500 | Server Error | Retry with exponential backoff |
| 503 | Service Unavailable | Retry later |

### 3.5 CORS Support

The RxNav APIs support **Cross-Origin Resource Sharing (CORS)**, enabling direct browser-based API calls for frontend applications.

---

## 4. Data Model Deep Dive

### 4.1 Concept Types (Term Types -- TTY)

RxNorm organizes drug concepts into a hierarchical type system. Each concept has a **Term Type (TTY)** that defines its semantic level.

#### 4.1.1 Core Concept Types

| TTY | Full Name | Description | Example |
|---|---|---|---|
| **IN** | Ingredient | A compound/moiety that gives the drug its clinical properties (USAN) | `Fluoxetine` |
| **PIN** | Precise Ingredient | A specified form of the ingredient (salt, isomer) | `Fluoxetine Hydrochloride` |
| **MIN** | Multiple Ingredients | Two+ ingredients in a single preparation | `Fluoxetine / Olanzapine` |
| **SCDC** | Semantic Clinical Drug Component | Ingredient + Strength | `Fluoxetine 20 MG` |
| **SCDF** | Semantic Clinical Drug Form | Ingredient + Dose Form | `Fluoxetine Oral Capsule` |
| **SCDFP** | Semantic Clinical Drug Form Precise | Precise Ingredient + Dose Form | `Fluoxetine hydrochloride Oral Capsule` |
| **SCDG** | Semantic Clinical Drug Group | Ingredient + Dose Form Group | `Fluoxetine Oral Product` |
| **SCDGP** | Semantic Clinical Drug Group Precise | Precise Ingredient + Dose Form Group | `Fluoxetine hydrochloride Oral Product` |
| **SCD** | Semantic Clinical Drug | Ingredient + Strength + Dose Form | `Fluoxetine 20 MG Oral Capsule` |
| **GPCK** | Generic Pack | Pack of generic drugs | `{24 (Drug A) / 6 (Drug B)} Pack` |
| **BN** | Brand Name | Proprietary name for a family of products | `Prozac` |
| **SBDC** | Semantic Branded Drug Component | Ingredient + Strength + Brand | `Fluoxetine 20 MG [Prozac]` |
| **SBDF** | Semantic Branded Drug Form | Ingredient + Dose Form + Brand | `Fluoxetine Oral Capsule [Prozac]` |
| **SBDFP** | Semantic Branded Drug Form Precise | Precise Ingredient + Dose Form + Brand | `Fluoxetine HCl Oral Capsule [Prozac]` |
| **SBDG** | Semantic Branded Drug Group | Brand + Dose Form Group | `Prozac Oral Product` |
| **SBD** | Semantic Branded Drug | Ingredient + Strength + Dose Form + Brand | `Fluoxetine 20 MG Oral Capsule [Prozac]` |
| **BPCK** | Brand Name Pack | Pack of branded drugs | `{...} Pack [Brand]` |
| **DF** | Dose Form | Physical form (tablet, solution, etc.) | `Oral Capsule` |
| **DFG** | Dose Form Group | Grouped dose forms by route | `Oral Product` |
| **PSN** | Prescribable Name | Short name for prescribing | `Fluoxetine 20 MG Cap` |

#### 4.1.2 Concept Hierarchy Diagram

```
                                    IN (Ingredient)
                                    "Fluoxetine"
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
                    v                    v                    v
               has_form            ingredient_of        has_tradename
                    |                    |                    |
                    v                    v                    v
               PIN               SCDC (Component)        BN (Brand)
         "Fluoxetine HCl"      "Fluoxetine 20 MG"       "Prozac"
                                     |                    |
                                     |                    |
                                     v                    v
                                     +--------+-----------+
                                              |
                                              v
                                         SCD (Clinical Drug)
                            "Fluoxetine 20 MG Oral Capsule"
                                              |
                              +---------------+---------------+
                              |                               |
                              v                               v
                    has_tradename                       has_dose_form
                              |                               |
                              v                               v
                    SBD (Branded Drug)                       DF
            "Fluoxetine 20 MG Oral Capsule [Prozac]"   "Oral Capsule"
                              |
                    +---------+---------+
                    |                   |
                    v                   v
               isa (SCDF)         isa (SCDG)
            "Fluocetine Oral    "Fluoxetine Oral
                  Capsule"            Product"
```

#### 4.1.3 Quantified Forms

Some RxNorm concepts include a time duration quantifier (e.g., "8 HR", "12 HR", "24 HR"):

| Base Form | Quantified Form |
|---|---|
| `acetaminophen 650 MG Extended Release Oral Tablet` | `8 HR acetaminophen 650 MG Extended Release Oral Tablet` |
| `nifedipine 20 MG Extended Release Oral Tablet` | `12 HR nifedipine 20 MG Extended Release Oral Tablet` |

These relationships are modeled via:
- `has_quantified_form` / `quantified_form_of`

### 4.2 Relationship Types (RELA)

RxNorm defines 28 relationship types connecting concepts:

| Relationship | Inverse | Description | Example |
|---|---|---|---|
| `ingredient_of` | `has_ingredient` | IN -> SCDC/SCDF | acetaminophen ingredient_of acetaminophen 325 MG |
| `constitutes` | `consists_of` | SCDC -> SCD | acetaminophen 325 MG constitutes acetaminophen 325 MG Oral Tablet |
| `dose_form_of` | `has_dose_form` | DF -> SCD/SBD | Oral Tablet dose_form_of acetaminophen 325 MG Oral Tablet |
| `tradename_of` | `has_tradename` | BN -> IN / SBD -> SCD | Tylenol tradename_of acetaminophen |
| `form_of` | `has_form` | PIN -> IN | fluoxetine HCl form_of fluoxetine |
| `isa` | `inverse_isa` | SCD -> SCDF / SBD -> SBDF | acetaminophen 325 MG Oral Tablet isa acetaminophen Oral Tablet |
| `contains` | `contained_in` | SCD -> BPCK/GPCK | acetaminophen 500 MG Oral Tablet contained_in Pack |
| `part_of` | `has_part` | IN -> MIN | acetaminophen part_of acetaminophen / diphenhydramine |
| `precise_ingredient_of` | `has_precise_ingredient` | PIN -> SCDC | diphenhydramine HCl precise_ingredient_of diphenhydramine HCl 25 MG |
| `boss_of` | `has_boss` | IN -> SCDFP | hydrochlorothiazide boss_of bisoprolol HCTZ Oral Tablet |
| `reformulated_to` | `reformulation_of` | BN -> BN | Ocusan reformulated_to Ocusan Reformulated Dec 2019 |
| `doseformgroup_of` | `has_doseformgroup` | DFG -> SCDG | Pill doseformgroup_of acetaminophen Pill |
| `ingredients_of` | `has_ingredients` | MIN -> SCD | acetaminophen/diphenhydramine ingredients_of acetaminophen 325 MG / diphenhydramine 50 MG Oral Tablet |
| `quantified_form_of` | `has_quantified_form` | SCD -> SCD | 8 HR acetaminophen 650 MG Extended Release Oral Tablet quantified_form_of acetaminophen 650 MG Extended Release Oral Tablet |

### 4.3 Prescribable Subset

The **Current Prescribable Content** is a curated subset of RxNorm containing drugs currently marketed in the United States. This subset:

- Excludes obsolete products
- Excludes investigational drugs not yet approved
- Excludes devices and non-drug items
- Is the recommended set for medication entry interfaces

**API Access**: Use the `/REST/Prescribe/` base path instead of `/REST/` to restrict results to prescribable content.

```python
# Get prescribable drugs only
PRESCRIBE_BASE = "https://rxnav.nlm.nih.gov/REST/Prescribe"

def get_prescribable_drugs(name):
    url = f"{PRESCRIBE_BASE}/drugs.json"
    params = {"name": name}
    return requests.get(url, params=params).json()
```

### 4.4 Historical vs Current Concepts

RxNorm maintains a full history of all concepts ever released:

| Status | Description | API Access |
|---|---|---|
| **Active** | Current, non-suppressed concept | All APIs |
| **Obsolete** | Still in dataset but marked obsolete (SUPPRESS="O") | getAllConceptsByStatus, historystatus |
| **Remapped** | Removed from current release; mapped to replacement | historystatus returns remappedRxCui |
| **Quantified** | Non-dispensable (lacks quantity factor) | historystatus returns quantifiedConcept |
| **NotCurrent** | Exists but has no RxNorm vocabulary terms | getAllConceptsByStatus |
| **Unknown** | Never existed in any release | Error response |

```python
# Handle historical concepts gracefully
def resolve_to_current(rxcui):
    """
    Resolve an RxCUI to its current equivalent.
    Handles remapped and obsolete concepts.
    """
    history = get_rxcui_history_status(rxcui)
    status_info = history.get("rxcuiStatus", {})
    status = status_info.get("status")
    
    if status == "Active":
        return {"rxcui": rxcui, "status": "Active", "resolved": rxcui}
    
    elif status == "Remapped":
        remapped = status_info.get("remappedConcept", [])
        if remapped:
            # Check if replacement is active
            new_rxcui = remapped[0].get("remappedRxCui")
            is_active = remapped[0].get("remappedActive", "NO")
            return {
                "rxcui": rxcui,
                "status": "Remapped",
                "resolved": new_rxcui,
                "resolved_active": is_active == "YES"
            }
    
    elif status == "Obsolete":
        # Concept is obsolete but still in dataset
        return {
            "rxcui": rxcui,
            "status": "Obsolete",
            "resolved": rxcui,
            "warning": "Concept is obsolete"
        }
    
    return {"rxcui": rxcui, "status": status, "resolved": None}
```

### 4.5 Data Files (RRF Format)

For bulk data loading, RxNorm releases monthly files in Rich Release Format (RRF):

| File | Description | Key Fields |
|---|---|---|
| `RXNCONSO.RRF` | Concepts and names | RXCUI, LAT, RXAUI, SAUI, SAB, TTY, CODE, STR, SUPPRESS |
| `RXNREL.RRF` | Relationships | RXCUI1, RXCUI2, REL, RELA, SAB, SUPPRESS |
| `RXNSAT.RRF` | Attributes | RXCUI, ATN, ATV (strength, dose form, etc.) |
| `RXNSTY.RRF` | Semantic types | RXCUI, TUI, STY |
| `RXNSAB.RRF` | Source information | RSAB, SON, SVER, TTYs, ATNs |
| `RXNCUI.RRF` | CUI merge history | RXCUI1, RXCUI2, VER |
| `RXNCUICHANGES.RRF` | CUI changes | RXCUI, VER, SAV, SABIN |

---

## 5. ATC Mapping Strategy

### 5.1 ATC Classification Overview

The **Anatomical Therapeutic Chemical (ATC)** classification system, developed by WHO, organizes drugs into a **5-level hierarchical code**:

```
N        -- Anatomical Main Group (1st level): Nervous System
N05      -- Therapeutic Subgroup (2nd level): Psycholeptics
N05A     -- Pharmacological Subgroup (3rd level): Antipsychotics
N05AH    -- Chemical Subgroup (4th level): Diazepines, oxazepines, thiazepines
N05AH04  -- Chemical Substance (5th level): Quetiapine
```

#### 5.1.1 ATC Level Structure

| Level | Description | Example: N05AH04 |
|---|---|---|
| 1st | **Anatomical group** (1 letter) | N = Nervous System |
| 2nd | **Therapeutic group** (2 digits) | N05 = Psycholeptics |
| 3rd | **Pharmacological group** (1 letter) | N05A = Antipsychotics |
| 4th | **Chemical subgroup** (1 letter) | N05AH = Diazepines, oxazepines... |
| 5th | **Chemical substance** (2 digits) | N05AH04 = Quetiapine |

### 5.2 Psychiatric Medication ATC Codes (Neuromodulation-Relevant)

#### 5.2.1 N05 -- Psycholeptics

```
N05A -- Antipsychotics
  N05AA -- Phenothiazines with aliphatic side-chain
    N05AA01 -- Chlorpromazine
    N05AA02 -- Levomepromazine
  N05AB -- Phenothiazines with piperazine structure
    N05AB03 -- Perphenazine
    N05AB04 -- Fluphenazine
  N05AC -- Phenothiazines with piperidine structure
    N05AC02 -- Thioridazine
  N05AD -- Butyrophenone derivatives
    N05AD01 -- Haloperidol
  N05AE -- Indole derivatives
    N05AE02 -- Risperidone
    N05AE03 -- Paliperidone
    N05AE04 -- Iloperidone
  N05AF -- Thioxanthene derivatives
    N05AF01 -- Flupentixol
    N05AF05 -- Zuclopenthixol
  N05AG -- Diphenylbutylpiperidine derivatives
    N05AG02 -- Pimozide
  N05AH -- Diazepines, oxazepines, thiazepines and oxepines
    N05AH02 -- Clozapine
    N05AH03 -- Olanzapine
    N05AH04 -- Quetiapine
    N05AH05 -- Asenapine
    N05AH06 -- Clozapine (different formulation)
  N05AL -- Benzamides
    N05AL01 -- Sulpiride
    N05AL05 -- Amisulpride
  N05AN -- Lithium
    N05AN01 -- Lithium
  N05AX -- Other antipsychotics
    N05AX08 -- Risperidone (duplicate, also N05AE02)
    N05AX12 -- Aripiprazole
    N05AX13 -- Paliperidone (duplicate)
    N05AX14 -- Cariprazine

N05B -- Anxiolytics
  N05BA -- Benzodiazepine derivatives
    N05BA01 -- Diazepam
    N05BA02 -- Chlordiazepoxide
    N05BA04 -- Oxazepam
    N05BA06 -- Lorazepam
    N05BA08 -- Bromazepam
    N05BA09 -- Clobazam
    N05BA12 -- Alprazolam
    N05BA19 -- Etizolam
  N05BE -- Azaspirodecanedione derivatives
    N05BE01 -- Buspirone

N05C -- Hypnotics and sedatives
  N05CA -- Barbiturates
    N05CA01 -- Pentobarbital
  N05CD -- Benzodiazepine derivatives
    N05CD01 -- Flurazepam
    N05CD03 -- Flunitrazepam
    N05CD07 -- Temazepam
    N05CD08 -- Midazolam
    N05CD09 -- Brotizolam
    N05CD10 -- Triazolam
  N05CE -- Aldehydes and derivatives
    N05CE01 -- Chloral hydrate
  N05CF -- Benzodiazepine-related drugs
    N05CF01 -- Zopiclone
    N05CF02 -- Zolpidem
    N05CF03 -- Zaleplon
  N05CH -- Melatonin receptor agonists
    N05CH01 -- Melatonin
    N05CH02 -- Ramelteon
  N05CM -- Other hypnotics and sedatives
    N05CM06 -- Chloralodorm
  N05CX -- Hypnotics and sedatives in combination
    N05CX01 -- Barbiturates, combinations
```

#### 5.2.2 N06 -- Psychoanaleptics

```
N06A -- Antidepressants
  N06AA -- Non-selective monoamine reuptake inhibitors (TCAs)
    N06AA02 -- Imipramine
    N06AA04 -- Clomipramine
    N06AA06 -- Trimipramine
    N06AA09 -- Amitriptyline
    N06AA10 -- Nortriptyline
    N06AA12 -- Doxepin
  N06AB -- Selective serotonin reuptake inhibitors (SSRIs)
    N06AB03 -- Fluoxetine
    N06AB04 -- Citalopram
    N06AB05 -- Paroxetine
    N06AB06 -- Sertraline
    N06AB08 -- Fluvoxamine
    N06AB10 -- Escitalopram
  N06AF -- Monoamine oxidase inhibitors, non-selective
    N06AF01 -- Isocarboxazid
    N06AF03 -- Phenelzine
    N06AF04 -- Tranylcypromine
  N06AG -- Monoamine oxidase A inhibitors
    N06AG02 -- Moclobemide
  N06AX -- Other antidepressants
    N06AX03 -- Mianserin
    N06AX05 -- Trazodone
    N06AX06 -- Nefazodone
    N06AX11 -- Mirtazapine
    N06AX12 -- Bupropion
    N06AX16 -- Venlafaxine (SNRI)
    N06AX17 -- Milnacipran (SNRI)
    N06AX18 -- Reboxetine
    N06AX21 -- Duloxetine (SNRI)
    N06AX22 -- Agomelatine
    N06AX23 -- Desvenlafaxine (SNRI)
    N06AX24 -- Vilazodone
    N06AX25 -- Hyperici herba (St. John's Wort)
    N06AX26 -- Vortioxetine
    N06AX27 -- Esketamine
    N06AX28 -- Levomilnacipran (SNRI)
    N06AX29 -- Brexanolone
    N06AX31 -- Zuranolone

N06B -- Psychostimulants, agents used for ADHD and nootropics
  N06BA -- Centrally acting sympathomimetics
    N06BA01 -- Amphetamine
    N06BA02 -- Dexamphetamine
    N06BA04 -- Methylphenidate
    N06BA07 -- Modafinil
    N06BA09 -- Atomoxetine
  N06BX -- Other psychostimulants and nootropics
    N06BX03 -- Piracetam
    N06BX06 -- Citicoline
    N06BX13 -- Idebenone

N06C -- Psycholeptics and psychoanaleptics in combination
  N06CA -- Antidepressants in combination with psycholeptics
    N06CA01 -- Amitriptyline and psycholeptics

N06D -- Anti-dementia drugs
  N06DA -- Anticholinesterases
    N06DA02 -- Donepezil
    N06DA03 -- Rivastigmine
    N06DA04 -- Galantamine
  N06DX -- Other anti-dementia drugs
    N06DX01 -- Memantine
```

### 5.3 RxNorm-to-ATC Mapping

#### 5.3.1 Two Mapping Systems

RxNorm provides **two distinct ATC mapping mechanisms**:

| Mapping | Scope | Source | Coverage |
|---|---|---|---|
| **ATC (Ingredient-level)** | IN, MIN, PIN | WHO Collaborating Centre | 49% of RxNorm ingredients map to 5th-level ATC |
| **ATCPROD (Product-level)** | SCD, SBD, GPCK, BPCK | NLM curation | >97% of Medicare Part D prescriptions |

**Recommendation**: Use **ATCPROD** as the primary mapping source for DeepSynaps, as it resolves the ingredient ambiguity problem (e.g., timolol eye drops vs. cardiovascular use).

#### 5.3.2 API Access to ATC Mappings

```python
def get_atc_classes(rxcui, rela_source="ATCPROD"):
    """
    Get ATC classification for a drug.
    
    Uses product-level mapping (ATCPROD) by default for accuracy.
    Falls back to ingredient-level mapping (ATC) if needed.
    """
    url = "https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json"
    params = {
        "rxcui": rxcui,
        "relaSource": rela_source
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    class_concepts = data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])
    
    atc_classes = []
    for info in class_concepts:
        concept = info.get("rxclassMinConceptItem", {})
        atc_classes.append({
            "class_id": concept.get("classId"),      # e.g., "N05AH04"
            "class_name": concept.get("className"),  # e.g., "quetiapine"
            "class_type": concept.get("classType"),  # e.g., "ATC1-4"
            "rela": info.get("rela"),                # e.g., "ATC"
            "rela_source": info.get("relaSource")
        })
    
    return atc_classes

# Example: Get ATC for fluoxetine 20 MG Oral Capsule (RxCUI: 1492894)
atc_classes = get_atc_classes("1492894")
for cls in atc_classes:
    print(f"  {cls['class_id']} - {cls['class_name']} ({cls['class_type']})")
# Expected: N06AB03 - fluoxetine (ATC1-4)
```

#### 5.3.3 Mapping from ATC to RxNorm

```python
def get_drugs_by_atc_class(class_id, rela_source="ATCPROD"):
    """
    Get all RxNorm drugs in a given ATC class.
    
    Endpoint: GET /REST/rxclass/classMembers.json?classId={class_id}
    """
    url = "https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json"
    params = {
        "classId": class_id,
        "relaSource": rela_source
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    data = response.json()
    members = []
    drug_member_group = data.get("drugMemberGroup", {})
    drug_member = drug_member_group.get("drugMember", [])
    
    if isinstance(drug_member, dict):
        drug_member = [drug_member]
    
    for member in drug_member:
        min_concept = member.get("minConcept", {})
        members.append({
            "rxcui": min_concept.get("rxcui"),
            "name": min_concept.get("name"),
            "tty": min_concept.get("tty")
        })
    
    return members

# Example: Get all SSRIs (N06AB)
ssris = get_drugs_by_atc_class("N06AB")
print(f"Found {len(ssris)} SSRI drugs")
for drug in ssris[:10]:
    print(f"  {drug['name']} (RxCUI: {drug['rxcui']})")
```

#### 5.3.4 Mapping Coverage Statistics

Based on published research (Bodenreider et al.):

| Metric | Value |
|---|---|
| RxNorm single ingredients mapped to 5th-level ATC | 1,552 of 3,166 (49%) |
| 5th-level ATC drugs covered by RxNorm ingredients | 1,554 of 3,904 (51%) |
| RxNorm clinical drugs with ingredient + route mapping | 7,260 of 11,422 (64%) |
| Medicare prescriptions mappable to ATC | 97.6% |
| ATCPROD coverage of active RxNorm products | >97% |

### 5.5 ATC to DeepSynaps Protocol Relevance Matrix

| ATC Class | Relevance to Neuromodulation | DeepSynaps Use Case |
|---|---|---|
| **N05A** (Antipsychotics) | **Critical** | Dopamine modulation affects TMS response; antipsychotic co-treatment impacts protocol selection |
| **N05B** (Anxiolytics) | **High** | GABAergic drugs affect cortical excitability; benzodiazepines may dampen tDCS effects |
| **N05C** (Hypnotics) | **High** | Sleep modulation protocols need awareness of hypnotic use; melatonin interactions with PBM |
| **N06A** (Antidepressants) | **Critical** | SSRIs/SNRIs modulate serotonergic pathways targeted by tDCS; TCA interactions with seizure risk |
| **N06B** (Psychostimulants) | **High** | ADHD medications affect dopamine; modafinil interactions with neurofeedback and PBM |
| **N06D** (Anti-dementia) | **Medium** | Cholinesterase inhibitors affect cortical excitability; relevant for cognitive enhancement protocols |
| **N02** (Analgesics) | **Medium** | Chronic pain patients often on opioids; opioid-induced hyperalgesia affects pain neuromodulation |
| **N03** (Antiepileptics) | **High** | Seizure threshold relevant for TMS; anticonvulsants affect cortical excitability |

---

## 6. SNOMED CT Integration

### 6.1 RxNorm to SNOMED CT Mapping

The **Unified Medical Language System (UMLS)** provides mappings between RxNorm and SNOMED CT. These mappings are available:

1. **Via UMLS Metathesaurus** (MRREL file with SAB="SNOMEDCT_US")
2. **Via RxNorm API** (returned as `umlscui` in concept properties)
3. **Via NLM map-rxnorm-to-snomed tool** (OWL-based inference)

### 6.2 Mapping Coverage

| Entity Type | RxNorm Count | Mapped to SNOMED CT | Coverage |
|---|---|---|---|
| Ingredients (IN/PIN) | 4,038 | 2,710 | 67% |
| Semantic Clinical Drugs (SCD) | 18,438 | ~2,833 | ~15% |
| Numbers (strength values) | 1,924 | 535 | 28% |
| Dose Forms | 113 | 83 | 73% |
| Units | 18 | 10 | 56% |

**Key Insight**: SNOMED CT has excellent coverage of **ingredients** (substances) but limited coverage of **clinical drug products** (strength + dose form combinations). For DeepSynaps, use RxNorm as the primary medication identifier and supplement with SNOMED CT where available.

### 6.3 Conceptual Model Differences

| Aspect | RxNorm | SNOMED CT |
|---|---|---|
| Primary focus | Drug identification and prescribing | Clinical documentation |
| Ingredient representation | Single normalized IN | Both substance and product hierarchies |
| Strength encoding | Part of concept name | Explicit attributes with values and units |
| Dose form | Simplified DF list | Rich pharmaceutical dose form hierarchy |
| Brand names | Explicit BN concepts | Limited brand representation |
| Quantified forms | Explicit (8 HR, 12 HR) | Implicit via dose form attributes |
| Qualitative distinctions | Explicit (e.g., "Sugar-Free") | Lost in mapping |
| Basis of Strength (BoSS) | Computed attribute | Not directly represented |

### 6.4 Mapping Example

```
RxNorm: Amlodipine 10 MG Oral Tablet (RxCUI: 308135)
  |
  |-- asserted SNOMED CT mapping (via UMLS)
  v
SNOMED CT: 386912005 | Product containing precisely amlodipine 10 milligram/1 each 
             conventional release oral tablet (clinical drug)
  |
  |-- Definitional attributes (OWL):
  v
  Equivalent To:
    Medicinal product (product)
    AND Has manufactured dose form (some Oral Tablet)
    AND Role group (some 
         Has basis of strength substance (some Amlodipine)
         AND Has presentation strength numerator value (some 10)
         AND Has presentation strength numerator unit (some MG)
         AND Has presentation strength denominator value (some 1)
         AND Has presentation strength denominator unit (some Tablet)
         AND Has precise active ingredient (some Amlodipine Besylate))
    AND Has unit of presentation (some Tablet)
    AND Count of base of active ingredient (some 1)
```

### 6.5 SNOMED CT Drug Model Attributes

| Attribute | Description | Example |
|---|---|---|
| `Has active ingredient` | The active moiety | Amlodipine |
| `Has precise active ingredient` | The precise salt form | Amlodipine Besylate |
| `Has basis of strength substance` | Basis for strength calculation | Amlodipine |
| `Has presentation strength numerator value` | Strength amount | 10 |
| `Has presentation strength numerator unit` | Strength unit | MG |
| `Has manufactured dose form` | Pharmaceutical dose form | Oral Tablet |
| `Has unit of presentation` | Count unit | Tablet |
| `Count of base of active ingredient` | Number of active ingredients | 1 |

### 6.6 Integration Strategy for DeepSynaps

```python
class MedicationNormalizer:
    """
    Multi-ontology medication normalization service for DeepSynaps.
    
    Primary: RxNorm (RxCUI)
    Secondary: ATC (therapeutic classification)
    Tertiary: SNOMED CT (clinical semantics)
    """
    
    def __init__(self):
        self.rxnorm_cache = {}
        self.atc_cache = {}
        self.snomed_cache = {}
    
    def normalize(self, drug_name_or_code):
        """
        Normalize any medication input to a canonical representation.
        
        Input: drug name, NDC, RxCUI, or free text
        Output: Normalized medication record with all identifiers
        """
        # Step 1: Resolve to RxCUI
        rxcui = self._resolve_to_rxcui(drug_name_or_code)
        if not rxcui:
            return {"status": "UNRESOLVED", "input": drug_name_or_code}
        
        # Step 2: Get RxNorm concept details
        rxnorm_details = self._get_rxnorm_details(rxcui)
        
        # Step 3: Get ATC classification
        atc_classes = self._get_atc_classification(rxcui)
        
        # Step 4: Get SNOMED CT mapping (if available)
        snomed_id = self._get_snomed_mapping(rxcui)
        
        # Step 5: Get NDC codes
        ndcs = self._get_ndcs(rxcui)
        
        # Step 6: Get ingredient information
        ingredients = self._get_ingredients(rxcui)
        
        return {
            "status": "RESOLVED",
            "input": drug_name_or_code,
            "canonical": {
                "rxcui": rxcui,
                "name": rxnorm_details.get("name"),
                "tty": rxnorm_details.get("tty"),
                "status": rxnorm_details.get("status"),
                "prescribable": rxnorm_details.get("prescribable", False)
            },
            "atc": atc_classes,
            "snomed_ct": {
                "concept_id": snomed_id,
                "mapped": snomed_id is not None
            },
            "ndcs": ndcs,
            "ingredients": ingredients,
            "relevance": self._assess_neuromodulation_relevance(atc_classes)
        }
    
    def _assess_neuromodulation_relevance(self, atc_classes):
        """
        Assess whether a medication is relevant to neuromodulation protocols.
        
        Returns relevance score and categories of interaction concern.
        """
        relevance = {
            "score": 0,  # 0-100
            "categories": [],
            "protocol_concerns": []
        }
        
        for atc in atc_classes:
            class_id = atc.get("class_id", "")
            
            # Critical: Antidepressants
            if class_id.startswith("N06A"):
                relevance["score"] = max(relevance["score"], 90)
                relevance["categories"].append("ANTIDEPRESSANT")
                relevance["protocol_concerns"].extend([
                    "SSRI_SNRI_SES2RISK",  # Serotonin syndrome with certain protocols
                    "CORTICAL_EXCITABILITY",  # Affects cortical excitability
                    "PROTOCOL_ADJUSTMENT_REQUIRED"
                ])
            
            # Critical: Antipsychotics
            elif class_id.startswith("N05A"):
                relevance["score"] = max(relevance["score"], 85)
                relevance["categories"].append("ANTIPSYCHOTIC")
                relevance["protocol_concerns"].extend([
                    "SEIZURE_THRESHOLD",  # Affects seizure threshold
                    "DOPAMINE_MODULATION",  # Interferes with dopaminergic neuromodulation
                    "PROTOCOL_ADJUSTMENT_REQUIRED"
                ])
            
            # High: Anxiolytics
            elif class_id.startswith("N05B"):
                relevance["score"] = max(relevance["score"], 75)
                relevance["categories"].append("ANXIOLYTIC")
                relevance["protocol_concerns"].extend([
                    "GABA_MODULATION",  # Benzodiazepines affect GABA
                    "CORTICAL_EXCITABILITY"
                ])
            
            # High: Psychostimulants
            elif class_id.startswith("N06B"):
                relevance["score"] = max(relevance["score"], 80)
                relevance["categories"].append("PSYCHOSTIMULANT")
                relevance["protocol_concerns"].extend([
                    "DOPAMINE_MODULATION",
                    "BLOOD_PRESSURE"  # Cardiovascular effects
                ])
            
            # High: Anti-dementia
            elif class_id.startswith("N06D"):
                relevance["score"] = max(relevance["score"], 60)
                relevance["categories"].append("ANTIDEMENTIA")
                relevance["protocol_concerns"].append("CHOLINERGIC_MODULATION")
        
        return relevance
```

---

## 7. DeepSynaps Integration Architecture

### 7.1 High-Level Architecture

```
+-----------------------------------------------------------------------+
|                        DeepSynaps Protocol Studio                      |
|                                                                        |
|  +------------------+    +------------------+    +------------------+ |
|  |   Protocol       |    |   Patient        |    |   Outcome        | |
|  |   Engine         |<-->|   Manager        |<-->|   Analytics      | |
|  |                  |    |                  |    |                  | |
|  |  tDCS/tACS/rTMS  |    |  Medication      |    |  Adverse Event   | |
|  |  Protocols       |    |  Profiles        |    |  Detection       | |
|  +--------+---------+    +--------+---------+    +--------+---------+ |
|           |                       |                       |           |
|           v                       v                       v           |
|  +---------------------------------------------------------------+   |
|  |              Medication Normalization Service                  |   |
|  |                (Knowledge Layer - Phase 1)                     |   |
|  +----+------------------------------------------------------+----+   |
|       |                                                      |        |
|       v                                                      v        |
|  +---------+  +---------+  +---------+  +---------+  +---------+    |
|  | RxNorm  |  |   ATC   |  | SNOMED  |  |   NDC   |  |  Drug   |    |
|  | Adapter |  | Adapter |  |  CT     |  | Adapter |  | Class   |    |
|  |         |  |         |  | Adapter |  |         |  | Adapter |    |
|  +----+----+  +----+----+  +----+----+  +----+----+  +----+----+    |
|       |            |            |            |            |         |
|       v            v            v            v            v         |
|  +----+----+  +----+----+  +----+----+  +----+----+  +----+----+    |
|  |  RxNav  |  |  RxClass |  |  UMLS   |  |  FDA    |  | MEDRT   |    |
|  |  API    |  |   API    |  |  API    |  |  NDC    |  | / FDASPL|    |
|  +----+----+  +----+----+  +----+----+  +----+----+  +----+----+    |
|       |            |            |            |            |         |
+-------+------------+------------+------------+------------+---------+
        |            |            |            |            |
        v            v            v            v            v
   +----+----+  +----+----+  +----+----+  +----+----+  +----+----+
   |  NLM    |  |  NLM    |  |  NLM    |  |  FDA    |  |  NLM    |
   |  Servers|  |  Servers|  |  Servers|  |  Servers|  |  Servers|
   +---------+  +---------+  +---------+  +---------+  +---------+
```

### 7.2 Adapter Design Pattern

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional, Dict
import requests
import redis
import json
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class MedicationConcept:
    """Canonical medication concept model for DeepSynaps."""
    source: str                          # "rxnorm", "atc", "snomed_ct"
    identifier: str                      # RxCUI, ATC code, SCT ID
    name: str
    status: str                          # "active", "obsolete", "remapped"
    term_type: Optional[str] = None      # TTY for RxNorm
    strength: Optional[str] = None       # e.g., "10 MG"
    dose_form: Optional[str] = None      # e.g., "Oral Tablet"
    brand_name: Optional[str] = None
    ingredients: List[Dict] = None
    atc_codes: List[str] = None
    snomed_ct_id: Optional[str] = None
    ndc_codes: List[str] = None
    prescribable: bool = False
    neuromod_relevance_score: int = 0
    confidence: float = 1.0
    provenance: str = ""
    resolved_at: datetime = None

# ---------------------------------------------------------------------------
# Cache Layer
# ---------------------------------------------------------------------------

class MedicationCache:
    """
    Multi-tier cache for medication lookups.
    
    Tier 1: In-memory LRU (hottest items)
    Tier 2: Redis (warm cache, 24h TTL)
    Tier 3: Local RxNorm database (cold storage)
    """
    
    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=0):
        self.redis = redis.Redis(
            host=redis_host, port=redis_port, db=redis_db,
            decode_responses=True
        )
        self.memory_cache = {}  # Simple dict for hot items
        self.memory_max = 1000
        self.ttl_seconds = 86400  # 24 hours
    
    def get(self, key: str) -> Optional[Dict]:
        # Tier 1: Memory
        if key in self.memory_cache:
            return self.memory_cache[key]
        
        # Tier 2: Redis
        cached = self.redis.get(key)
        if cached:
            data = json.loads(cached)
            # Promote to memory
            self.memory_cache[key] = data
            return data
        
        return None
    
    def set(self, key: str, value: Dict):
        # Write to memory
        if len(self.memory_cache) >= self.memory_max:
            # Evict oldest
            oldest = next(iter(self.memory_cache))
            del self.memory_cache[oldest]
        self.memory_cache[key] = value
        
        # Write to Redis with TTL
        self.redis.setex(key, self.ttl_seconds, json.dumps(value))
    
    def invalidate(self, key: str):
        self.memory_cache.pop(key, None)
        self.redis.delete(key)

# ---------------------------------------------------------------------------
# Abstract Adapter
# ---------------------------------------------------------------------------

class MedicationAdapter(ABC):
    """Abstract base class for medication ontology adapters."""
    
    def __init__(self, cache: MedicationCache):
        self.cache = cache
        self.source_name = "abstract"
    
    @abstractmethod
    def resolve(self, identifier: str) -> Optional[MedicationConcept]:
        """Resolve an identifier to a canonical concept."""
        pass
    
    @abstractmethod
    def search(self, query: str, limit: int = 10) -> List[MedicationConcept]:
        """Search for concepts matching a text query."""
        pass
    
    @abstractmethod
    def get_related(self, concept: MedicationConcept) -> List[MedicationConcept]:
        """Get related concepts (ingredients, classes, etc.)."""
        pass
    
    def _cache_key(self, identifier: str) -> str:
        return f"{self.source_name}:{identifier}"

# ---------------------------------------------------------------------------
# RxNorm Adapter
# ---------------------------------------------------------------------------

class RxNormAdapter(MedicationAdapter):
    """
    RxNorm API adapter with caching and rate limiting.
    
    Uses RxNav REST API by default; can be configured to use
    RxNav-in-a-Box for local deployment.
    """
    
    def __init__(self, cache: MedicationCache, 
                 base_url: str = "https://rxnav.nlm.nih.gov/REST",
                 rate_limit: float = 20.0):
        super().__init__(cache)
        self.source_name = "rxnorm"
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "DeepSynaps-Protocol-Studio/1.0"
        })
        self.rate_limit = rate_limit
    
    def resolve(self, identifier: str) -> Optional[MedicationConcept]:
        cache_key = self._cache_key(identifier)
        cached = self.cache.get(cache_key)
        if cached:
            return MedicationConcept(**cached)
        
        # Try resolving as RxCUI
        if identifier.isdigit():
            return self._resolve_by_rxcui(identifier)
        
        # Try resolving as name
        return self._resolve_by_name(identifier)
    
    def _resolve_by_rxcui(self, rxcui: str) -> Optional[MedicationConcept]:
        url = f"{self.base_url}/rxcui/{rxcui}/properties.json"
        response = self.session.get(url)
        
        if response.status_code == 404:
            return None
        
        response.raise_for_status()
        data = response.json()
        
        properties = data.get("properties", {})
        if not properties:
            return None
        
        concept = MedicationConcept(
            source="rxnorm",
            identifier=rxcui,
            name=properties.get("name", ""),
            status="active",  # Would need historystatus for real status
            term_type=properties.get("tty"),
            strength=self._extract_strength(rxcui),
            dose_form=self._extract_dose_form(rxcui),
            prescribable=properties.get("prescribable", "false").lower() == "true",
            provenance=f"RxNorm API ({self.base_url})",
            resolved_at=datetime.utcnow()
        )
        
        # Cache result
        self.cache.set(cache_key, concept.__dict__)
        return concept
    
    def _resolve_by_name(self, name: str) -> Optional[MedicationConcept]:
        url = f"{self.base_url}/rxcui.json"
        params = {"name": name}
        response = self.session.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        id_group = data.get("idGroup", {})
        rxcui_list = id_group.get("rxnormId", [])
        
        if not rxcui_list:
            return None
        
        # Take first (best) match
        return self._resolve_by_rxcui(rxcui_list[0])
    
    def search(self, query: str, limit: int = 10) -> List[MedicationConcept]:
        """Use approximate match for fuzzy search."""
        url = f"{self.base_url}/approximateTerm.json"
        params = {"term": query, "maxEntries": limit}
        
        response = self.session.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        approx_group = data.get("approximateGroup", {})
        candidates = approx_group.get("candidate", [])
        
        if isinstance(candidates, dict):
            candidates = [candidates]
        
        results = []
        for candidate in candidates[:limit]:
            rxcui = candidate.get("rxcui")
            if rxcui:
                concept = self._resolve_by_rxcui(rxcui)
                if concept:
                    concept.confidence = candidate.get("score", 0) / 100.0
                    results.append(concept)
        
        return results
    
    def get_ingredients(self, rxcui: str) -> List[Dict]:
        """Get ingredients for a given RxCUI."""
        url = f"{self.base_url}/rxcui/{rxcui}/allrelated.json"
        response = self.session.get(url)
        response.raise_for_status()
        
        data = response.json()
        all_related = data.get("allRelatedGroup", {})
        concept_groups = all_related.get("conceptGroup", [])
        
        ingredients = []
        for group in concept_groups:
            if group.get("tty") == "IN":
                for prop in group.get("conceptProperties", []):
                    ingredients.append({
                        "rxcui": prop.get("rxcui"),
                        "name": prop.get("name"),
                        "tty": "IN"
                    })
        
        return ingredients
    
    def get_related(self, concept: MedicationConcept) -> List[MedicationConcept]:
        # Implementation for getting related SCDs, SBDs, etc.
        pass
    
    def _extract_strength(self, rxcui: str) -> Optional[str]:
        # Use RXNSAT attributes or parse SCDC
        pass
    
    def _extract_dose_form(self, rxcui: str) -> Optional[str]:
        # Use RXNSAT or allrelated for DF
        pass

# ---------------------------------------------------------------------------
# ATC Adapter
# ---------------------------------------------------------------------------

class ATCAdapter(MedicationAdapter):
    """
    ATC classification adapter via RxClass API.
    Maps RxCUI -> ATC codes and vice versa.
    """
    
    def __init__(self, cache: MedicationCache,
                 base_url: str = "https://rxnav.nlm.nih.gov/REST/rxclass"):
        super().__init__(cache)
        self.source_name = "atc"
        self.base_url = base_url
        self.session = requests.Session()
    
    def get_atc_for_rxcui(self, rxcui: str, 
                          rela_source: str = "ATCPROD") -> List[Dict]:
        """Get ATC classes for a given RxCUI."""
        cache_key = f"atc:rxcui:{rxcui}:{rela_source}"
        cached = self.cache.get(cache_key)
        if cached:
            return cached.get("atc_classes", [])
        
        url = f"{self.base_url}/class/byRxcui.json"
        params = {"rxcui": rxcui, "relaSource": rela_source}
        
        response = self.session.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        class_info_list = data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])
        
        atc_classes = []
        for info in class_info_list:
            concept = info.get("rxclassMinConceptItem", {})
            atc_classes.append({
                "class_id": concept.get("classId"),
                "class_name": concept.get("className"),
                "class_type": concept.get("classType")
            })
        
        self.cache.set(cache_key, {"atc_classes": atc_classes})
        return atc_classes
    
    def get_drugs_for_atc_class(self, class_id: str,
                                 rela_source: str = "ATCPROD") -> List[Dict]:
        """Get all RxNorm drugs in an ATC class."""
        url = f"{self.base_url}/classMembers.json"
        params = {"classId": class_id, "relaSource": rela_source}
        
        response = self.session.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        drug_member_group = data.get("drugMemberGroup", {})
        drug_members = drug_member_group.get("drugMember", [])
        
        if isinstance(drug_members, dict):
            drug_members = [drug_members]
        
        return [
            {
                "rxcui": m["minConcept"]["rxcui"],
                "name": m["minConcept"]["name"],
                "tty": m["minConcept"]["tty"]
            }
            for m in drug_members
        ]
    
    def is_neuromodulation_relevant(self, atc_code: str) -> Dict:
        """
        Assess whether an ATC code is relevant to neuromodulation.
        
        Returns relevance assessment for protocol decision-making.
        """
        relevance_map = {
            "N05A": {
                "relevant": True,
                "category": "ANTIPSYCHOTIC",
                "concern_level": "HIGH",
                "affects_protocols": ["TMS", "tDCS", "tACS"],
                "mechanism": "DOPAMINE_MODULATION"
            },
            "N05B": {
                "relevant": True,
                "category": "ANXIOLYTIC",
                "concern_level": "MEDIUM",
                "affects_protocols": ["tDCS", "tRNS"],
                "mechanism": "GABA_MODULATION"
            },
            "N05C": {
                "relevant": True,
                "category": "HYPNOTIC",
                "concern_level": "MEDIUM",
                "affects_protocols": ["PBM", "neurofeedback"],
                "mechanism": "GABA_MODULATION"
            },
            "N06A": {
                "relevant": True,
                "category": "ANTIDEPRESSANT",
                "concern_level": "HIGH",
                "affects_protocols": ["tDCS", "tACS", "TMS"],
                "mechanism": "SEROTONIN_MODULATION"
            },
            "N06B": {
                "relevant": True,
                "category": "PSYCHOSTIMULANT",
                "concern_level": "HIGH",
                "affects_protocols": ["TMS", "neurofeedback", "PBM"],
                "mechanism": "DOPAMINE_MODULATION"
            },
            "N06D": {
                "relevant": True,
                "category": "ANTIDEMENTIA",
                "concern_level": "MEDIUM",
                "affects_protocols": ["tDCS", "tACS"],
                "mechanism": "CHOLINERGIC_MODULATION"
            }
        }
        
        # Check prefix matches
        for prefix, info in relevance_map.items():
            if atc_code.startswith(prefix):
                return info
        
        return {"relevant": False, "category": None}
    
    def resolve(self, identifier: str) -> Optional[MedicationConcept]:
        # ATC codes resolve to class concepts, not drug concepts
        pass
    
    def search(self, query: str, limit: int = 10) -> List[MedicationConcept]:
        pass
    
    def get_related(self, concept: MedicationConcept) -> List[MedicationConcept]:
        pass

# ---------------------------------------------------------------------------
# Medication Normalization Service (Facade)
# ---------------------------------------------------------------------------

class MedicationNormalizationService:
    """
    Facade providing unified medication normalization across all ontologies.
    
    This is the primary interface for DeepSynaps Protocol Engine.
    """
    
    def __init__(self, use_local_rxnav: bool = False):
        self.cache = MedicationCache()
        
        if use_local_rxnav:
            self.rxnorm = RxNormAdapter(
                self.cache,
                base_url="http://localhost:4000/REST"
            )
        else:
            self.rxnorm = RxNormAdapter(self.cache)
        
        self.atc = ATCAdapter(self.cache)
        # SNOMED CT adapter would require UMLS license
    
    def normalize_medication(self, input_str: str) -> Dict:
        """
        Normalize a medication string to all available identifiers.
        
        Pipeline:
        1. Fuzzy search via approximate match
        2. Resolve to RxCUI
        3. Get ATC classification
        4. Assess neuromodulation relevance
        5. Return normalized record
        """
        # Step 1: Search RxNorm
        results = self.rxnorm.search(input_str, limit=5)
        
        if not results:
            return {
                "status": "UNRESOLVED",
                "input": input_str,
                "message": "No matching concepts found in RxNorm"
            }
        
        best_match = results[0]
        rxcui = best_match.identifier
        
        # Step 2: Get ATC classification
        atc_classes = self.atc.get_atc_for_rxcui(rxcui)
        
        # Step 3: Get ingredients
        ingredients = self.rxnorm.get_ingredients(rxcui)
        
        # Step 4: Assess neuromodulation relevance
        relevance = {"relevant": False, "categories": [], "concerns": []}
        for atc in atc_classes:
            atc_info = self.atc.is_neuromodulation_relevant(atc["class_id"])
            if atc_info.get("relevant"):
                relevance["relevant"] = True
                relevance["categories"].append(atc_info["category"])
                relevance["concerns"].extend(atc_info.get("affects_protocols", []))
        
        # Deduplicate
        relevance["categories"] = list(set(relevance["categories"]))
        relevance["concerns"] = list(set(relevance["concerns"]))
        
        return {
            "status": "RESOLVED",
            "input": input_str,
            "normalized": {
                "rxcui": rxcui,
                "name": best_match.name,
                "term_type": best_match.term_type,
                "confidence": best_match.confidence
            },
            "atc_classification": atc_classes,
            "ingredients": ingredients,
            "neuromodulation_relevance": relevance,
            "resolution_provenance": {
                "primary_source": "RxNorm",
                "classification_source": "ATC (ATCPROD)",
                "resolved_at": datetime.utcnow().isoformat()
            }
        }
    
    def batch_normalize(self, medications: List[str]) -> List[Dict]:
        """Normalize multiple medications efficiently with batching."""
        results = []
        for med in medications:
            results.append(self.normalize_medication(med))
        return results
    
    def check_drug_interactions_with_protocol(
        self, medications: List[Dict], protocol_type: str
    ) -> List[Dict]:
        """
        Check if any medication may interact with a neuromodulation protocol.
        
        Args:
            medications: List of normalized medication records
            protocol_type: e.g., "tDCS", "TMS", "tACS", "tRNS", "PBM"
        
        Returns:
            List of interaction alerts
        """
        alerts = []
        
        for med in medications:
            relevance = med.get("neuromodulation_relevance", {})
            if not relevance.get("relevant"):
                continue
            
            affected_protocols = relevance.get("concerns", [])
            if protocol_type.upper() in [p.upper() for p in affected_protocols]:
                alerts.append({
                    "medication": med["normalized"]["name"],
                    "rxcui": med["normalized"]["rxcui"],
                    "category": relevance.get("categories", []),
                    "protocol": protocol_type,
                    "alert_level": "HIGH" if len(relevance.get("categories", [])) > 0 else "MEDIUM",
                    "recommendation": "Review protocol parameters; consider dose adjustment"
                })
        
        return alerts
```

### 7.3 Synonym Resolution Pipeline

```python
class SynonymResolutionPipeline:
    """
    Multi-stage pipeline for resolving medication synonyms to canonical forms.
    
    Handles:
    - Brand name -> Generic name
    - Misspellings -> Correct spelling
    - Abbreviations -> Full forms
    - Free text -> Structured concept
    """
    
    def __init__(self, normalization_service: MedicationNormalizationService):
        self.service = normalization_service
        self.rxnorm = normalization_service.rxnorm
    
    def resolve(self, raw_text: str) -> Dict:
        """
        Full synonym resolution pipeline.
        
        Stages:
        1. Preprocessing (normalization, tokenization)
        2. Exact match attempt
        3. Normalized match attempt
        4. Approximate/fuzzy match
        5. Ingredient extraction from free text
        6. Confidence scoring
        """
        # Stage 1: Preprocessing
        cleaned = self._preprocess(raw_text)
        
        # Stage 2-4: Progressive matching
        result = self._progressive_match(cleaned)
        
        if result:
            return self._build_result(raw_text, result, "AUTO_RESOLVED")
        
        # Stage 5: Manual review queue
        return {
            "status": "MANUAL_REVIEW_REQUIRED",
            "input": raw_text,
            "cleaned": cleaned,
            "suggestions": self._get_suggestions(cleaned)
        }
    
    def _preprocess(self, text: str) -> str:
        """Clean and normalize input text."""
        import re
        
        # Lowercase
        text = text.lower().strip()
        
        # Remove common noise
        text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
        text = re.sub(r'\(.*\)', '', text)  # Remove parentheticals
        text = re.sub(r'#\d+', '', text)  # Remove order numbers
        
        # Common abbreviation expansions
        abbreviations = {
            'tab': 'tablet',
            'tabs': 'tablets',
            'cap': 'capsule',
            'caps': 'capsules',
            'soln': 'solution',
            'susp': 'suspension',
            'inj': 'injection',
            'inh': 'inhalation',
            'cream': 'cream',
            'oint': 'ointment',
            'supp': 'suppository',
            'po': 'oral',
            'prn': 'as needed',
            'qd': 'daily',
            'bid': 'twice daily',
            'tid': 'three times daily',
            'qid': 'four times daily',
        }
        
        words = text.split()
        expanded = [abbreviations.get(w, w) for w in words]
        return ' '.join(expanded)
    
    def _progressive_match(self, text: str) -> Optional[MedicationConcept]:
        """Try progressively less precise matching strategies."""
        
        # Strategy 1: Exact name search
        results = self.rxnorm.search(text, limit=1)
        if results and results[0].confidence >= 0.95:
            return results[0]
        
        # Strategy 2: Approximate match
        results = self.rxnorm.search(text, limit=5)
        if results and results[0].confidence >= 0.80:
            return results[0]
        
        # Strategy 3: Extract core drug name (remove dose/frequency)
        core_name = self._extract_core_drug_name(text)
        if core_name and core_name != text:
            results = self.rxnorm.search(core_name, limit=5)
            if results and results[0].confidence >= 0.70:
                return results[0]
        
        return None
    
    def _extract_core_drug_name(self, text: str) -> Optional[str]:
        """Extract the core drug name from a medication string."""
        import re
        
        # Remove dose information (numbers followed by units)
        text = re.sub(r'\b\d+\s*(mg|mcg|ug|g|ml|unit|units|%|mg/ml)\b', '', text, flags=re.IGNORECASE)
        
        # Remove frequency
        text = re.sub(r'\b(daily|twice|three|four|times|weekly|monthly|q\w*|prn|as needed)\b', '', text, flags=re.IGNORECASE)
        
        # Remove route
        text = re.sub(r'\b(oral|po|iv|im|sc|topical|rectal|inhalation)\b', '', text, flags=re.IGNORECASE)
        
        # Clean up
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text if text else None
    
    def _get_suggestions(self, text: str) -> List[str]:
        """Get approximate match suggestions for manual review."""
        results = self.rxnorm.search(text, limit=5)
        return [f"{r.name} (RxCUI: {r.identifier}, confidence: {r.confidence:.2f})" 
                for r in results]
    
    def _build_result(self, raw: str, concept: MedicationConcept, 
                      resolution_type: str) -> Dict:
        return {
            "status": "RESOLVED",
            "resolution_type": resolution_type,
            "input": raw,
            "canonical": {
                "rxcui": concept.identifier,
                "name": concept.name,
                "term_type": concept.term_type,
                "confidence": concept.confidence
            }
        }
```

---

## 8. Provenance & Confidence Model

### 8.1 Data Provenance Tracking

Every medication concept in DeepSynaps carries provenance metadata:

```python
@dataclass
class ProvenanceRecord:
    """Tracks the origin and lineage of a medication concept."""
    
    source_system: str          # "rxnorm", "atc", "snomed_ct", "manual"
    source_version: str         # "RxNorm_20250106"
    source_date: datetime       # When the source data was published
    retrieval_method: str       # "api", "local_db", "cache", "manual_entry"
    retrieval_timestamp: datetime
    api_endpoint: Optional[str] # e.g., "rxnav.nlm.nih.gov/REST/rxcui"
    user_id: Optional[str]      # Who initiated the lookup
    validation_status: str      # "validated", "pending", "override"
    
    def to_dict(self) -> Dict:
        return {
            "source_system": self.source_system,
            "source_version": self.source_version,
            "source_date": self.source_date.isoformat() if self.source_date else None,
            "retrieval_method": self.retrieval_method,
            "retrieval_timestamp": self.retrieval_timestamp.isoformat(),
            "api_endpoint": self.api_endpoint,
            "user_id": self.user_id,
            "validation_status": self.validation_status
        }
```

### 8.2 Confidence Scoring

```python
class ConfidenceScorer:
    """
    Multi-factor confidence scoring for medication normalization.
    
    Score range: 0.0 - 1.0
    """
    
    def score_resolution(self, result: Dict, input_text: str) -> float:
        """Calculate confidence score for a medication resolution."""
        
        scores = {
            "match_quality": 0.0,      # How well input matches concept
            "source_authority": 0.0,    # Authority of data source
            "mapping_directness": 0.0,  # Direct vs indirect mapping
            "temporal_freshness": 0.0,  # How recent is the data
            "cross_validation": 0.0     # Agreement across sources
        }
        
        # Match quality (approximate match score)
        confidence = result.get("canonical", {}).get("confidence", 0)
        scores["match_quality"] = confidence
        
        # Source authority
        source = result.get("resolution_provenance", {}).get("primary_source", "")
        authority_scores = {
            "RxNorm": 0.95,
            "ATC": 0.90,
            "SNOMED_CT": 0.85,
            "UMLS": 0.80,
            "manual": 0.50
        }
        scores["source_authority"] = authority_scores.get(source, 0.5)
        
        # Mapping directness
        if result.get("normalized", {}).get("rxcui"):
            scores["mapping_directness"] = 1.0  # Direct RxCUI
        elif result.get("atc_classification"):
            scores["mapping_directness"] = 0.7  # ATC class-level
        else:
            scores["mapping_directness"] = 0.3  # Indirect only
        
        # Cross-validation
        has_rxnorm = bool(result.get("normalized", {}).get("rxcui"))
        has_atc = bool(result.get("atc_classification"))
        has_snomed = bool(result.get("snomed_ct", {}).get("mapped"))
        
        cross_validation_count = sum([has_rxnorm, has_atc, has_snomed])
        scores["cross_validation"] = cross_validation_count / 3.0
        
        # Weighted combination
        weights = {
            "match_quality": 0.35,
            "source_authority": 0.25,
            "mapping_directness": 0.20,
            "temporal_freshness": 0.05,
            "cross_validation": 0.15
        }
        
        final_score = sum(scores[k] * weights[k] for k in weights)
        return round(final_score, 3)
    
    def confidence_tier(self, score: float) -> str:
        """Map confidence score to decision tier."""
        if score >= 0.90:
            return "TIER_1_AUTO"      # Fully automated, no review
        elif score >= 0.75:
            return "TIER_2_LOW_RISK"  # Automated, audit trail
        elif score >= 0.50:
            return "TIER_3_REVIEW"    # Requires human review
        else:
            return "TIER_4_REJECT"    # Reject, needs manual entry
```

### 8.3 Audit Trail

```python
class MedicationAuditTrail:
    """
    Comprehensive audit trail for medication data in DeepSynaps.
    """
    
    def log_resolution(self, 
                       patient_id: str,
                       input_text: str,
                       resolution_result: Dict,
                       user_id: str,
                       context: str):
        """
        Log a medication resolution event.
        
        Args:
            patient_id: Anonymized patient identifier
            input_text: Raw medication text
            resolution_result: Normalization result
            user_id: Clinician/system that triggered resolution
            context: Where the resolution occurred (e.g., "protocol_designer")
        """
        audit_entry = {
            "event_type": "MEDICATION_RESOLUTION",
            "timestamp": datetime.utcnow().isoformat(),
            "patient_id_hash": self._hash_patient_id(patient_id),
            "input_text": input_text,
            "resolved_rxcui": resolution_result.get("normalized", {}).get("rxcui"),
            "resolved_name": resolution_result.get("normalized", {}).get("name"),
            "confidence": resolution_result.get("normalized", {}).get("confidence"),
            "atc_codes": [a.get("class_id") for a in 
                         resolution_result.get("atc_classification", [])],
            "user_id": user_id,
            "context": context,
            "tier": resolution_result.get("confidence_tier", "UNKNOWN")
        }
        
        # Write to immutable audit log
        self._write_to_audit_log(audit_entry)
        return audit_entry
    
    def _hash_patient_id(self, patient_id: str) -> str:
        import hashlib
        return hashlib.sha256(patient_id.encode()).hexdigest()[:16]
    
    def _write_to_audit_log(self, entry: Dict):
        # Implementation would write to append-only storage
        # (e.g., Kafka, immutable DB, or write-once file system)
        pass
```

---

## 9. Licensing & Compliance

### 9.1 RxNorm License

RxNorm is developed by the **U.S. National Library of Medicine** and is in the **public domain**.

```
LICENSING STATUS: Public Domain (U.S. Government Work)
Copyright: None
Usage Fee: None
```

#### 9.1.1 Terms of Service Summary

| Aspect | Requirement |
|---|---|
| **API Access** | Free, no registration required (except proprietary endpoint) |
| **Rate Limiting** | 20 requests/second per IP |
| **Attribution** | Include disclaimer statement in applications |
| **Commercial Use** | Permitted |
| **Redistribution** | Permitted |
| **Modification** | Permitted |

#### 9.1.2 Required Disclaimer

All applications using NLM data **must** include this statement:

> "This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product."

#### 9.1.3 Restrictions

1. **NLM Logo**: Developers may NOT use the NLM name and/or logo in conjunction with their applications.
2. **Proprietary API**: The `/rxcui/{rxcui}/proprietary` endpoint requires a **valid UMLS license** and proxy granting ticket.
3. **UMLS License**: Required only for:
   - RxNav-in-a-Box download
   - Access to proprietary source vocabularies
   - SNOMED CT content in RxClass

### 9.2 UMLS License

To download RxNav-in-a-Box or access full UMLS content:

| Requirement | Details |
|---|---|
| **Registration** | Free UMLS Metathesaurus License required |
| **Process** | Apply at https://www.nlm.nih.gov/databases/umls.html |
| **Approval Time** | Typically 1-2 business days |
| **Annual Recertification** | Required |
| **Commercial Use** | Permitted under license terms |
| **SNOMED CT** | Subject to SNOMED CT Affiliate License (Appendix 2 of UMLS license) |

### 9.3 SNOMED CT License

SNOMED CT content in RxClass is subject to:

| Aspect | Details |
|---|---|
| **Licensor** | SNOMED International (formerly IHTSDO) |
| **US Distribution** | National Library of Medicine |
| **License Type** | SNOMED CT Affiliate License |
| **Free in IHTSDO Member Countries** | Yes (including US, UK, Canada, Australia) |
| **Non-Member Countries** | May require fees |
| **Redistribution** | Subject to affiliate license terms |

### 9.4 ATC License

| Aspect | Details |
|---|---|
| **Maintainer** | WHO Collaborating Centre for Drug Statistics Methodology (Norway) |
| **Cost** | Free for non-commercial use |
| **Commercial Use** | May require license; contact WHO-CC |
| **Redistribution** | Permitted with attribution |

### 9.5 DeepSynaps Compliance Checklist

- [x] **RxNorm data**: Public domain -- no license needed
- [x] **RxNav API**: No license needed for REST API calls
- [ ] **RxNav-in-a-Box**: Requires UMLS license (if used)
- [ ] **SNOMED CT mappings**: Requires UMLS/SNOMED CT Affiliate license
- [ ] **ATC data**: Free for research; verify for commercial use
- [x] **Attribution**: Include NLM disclaimer in application
- [ ] **NLM Logo**: Ensure NOT used in application branding

### 9.6 Recommended Attribution Placement

```python
# Add to application settings/about page
NLM_ATTRIBUTION = (
    "This product uses publicly available data from the "
    "U.S. National Library of Medicine (NLM), National Institutes of Health, "
    "Department of Health and Human Services; NLM is not responsible for the "
    "product and does not endorse or recommend this or any other product."
)

SNOMED_ATTRIBUTION = (
    "SNOMED CT is used by permission of the International Health "
    "Terminology Standards Development Organisation (IHTSDO). "
    "All rights reserved. SNOMED CT was originally created by the "
    "College of American Pathologists."
)
```

---

## 10. Open Source Tooling

### 10.1 RxNav-in-a-Box (Docker)

**Description**: Locally-installable Docker composition of RxNav, RxClass, RxMix, and RESTful APIs.

| Attribute | Details |
|---|---|
| **Source** | National Library of Medicine |
| **License** | UMLS License required for download |
| **Requirements** | 12GB RAM, 100GB disk, Docker Desktop |
| **Installation** | Download ZIP, `docker-compose up` |
| **Port** | 4000 (default) |
| **Update Frequency** | Monthly (new RxNorm releases) |

**Installation**:
```bash
# 1. Download RxNav-in-a-Box (requires UMLS license)
#    Visit: https://lhncbc.nlm.nih.gov/RxNav/applications/RxNav-in-a-Box.html

# 2. Extract
unzip rxnav-in-a-box-YYYYMMDD.zip
cd rxnav-in-a-box-YYYYMMDD

# 3. Start (first run takes ~1 hour for DB initialization)
docker-compose up -d

# 4. Verify
# API available at: http://localhost:4000/REST/
curl http://localhost:4000/REST/version
```

### 10.2 pharmpy

**Description**: Python library for searching FDA NDC directory, ATC via RxNav, and drug interactions.

| Attribute | Details |
|---|---|
| **Repository** | https://github.com/yubin-park/pharmpy |
| **License** | Apache 2.0 |
| **Features** | NDC lookup, ATC mapping, drug interaction checking |
| **Maintenance** | Limited recent activity (last update ~2019) |
| **Recommendation** | Use as reference; build custom adapters |

```python
# Installation
# pip install git+https://github.com/yubin-park/pharmpy.git

from pharmpy.rxcui import RxcuiEngine
from pharmpy.atc import ATCEngine

# Map NDC to RxCUI
rxcui_engine = RxcuiEngine(cache_dir="./cache")
rxcui = rxcui_engine.get_rxcui("0781-5384-92")
print(f"RxCUI: {rxcui}")

# Map RxCUI to ATC
atc_engine = ATCEngine(cache_dir="./cache")
atc_classes = atc_engine.get_atc(rxcui)
print(f"ATC: {atc_classes}")
```

### 10.3 medspacy

**Description**: spaCy pipeline for medical text processing with medication extraction.

| Attribute | Details |
|---|---|
| **Repository** | https://github.com/medspacy/medspacy |
| **License** | Apache 2.0 |
| **Features** | Target matching, section detection, context analysis |
| **RxNorm Support** | Indirect (via UMLS linker or custom rules) |
| **Maintenance** | Active (regular releases) |

```python
import medspacy
from medspacy.target_matcher import TargetRule

# Load medspacy pipeline
nlp = medspacy.load()
target_matcher = nlp.get_pipe("medspacy_target_matcher")

# Define medication rules
drug_rules = [
    TargetRule("fluoxetine", "MEDICATION", 
               pattern=[{"LOWER": "fluoxetine"}]),
    TargetRule("sertraline", "MEDICATION",
               pattern=[{"LOWER": "sertraline"}]),
    TargetRule("olanzapine", "MEDICATION",
               pattern=[{"LOWER": "olanzapine"}]),
    TargetRule("quetiapine", "MEDICATION",
               pattern=[{"LOWER": "quetiapine"}]),
]

target_matcher.add(drug_rules)

# Process clinical text
text = "Patient is taking fluoxetine 20mg daily and quetiapine 25mg at bedtime."
doc = nlp(text)

for ent in doc.ents:
    if ent.label_ == "MEDICATION":
        print(f"Found: {ent.text} (span: {ent.start_char}-{ent.end_char})")
        # Next: pass to RxNorm normalization service
```

### 10.4 scispacy + UMLS Entity Linker

**Description**: spaCy models for scientific/biomedical NLP with UMLS entity linking.

| Attribute | Details |
|---|---|
| **Repository** | https://allenai.github.io/scispacy/ |
| **License** | Apache 2.0 |
| **Models** | `en_core_sci_md`, `en_ner_bc5cdr_md` |
| **UMLS Linker** | Links to UMLS CUIs (which map to RxCUIs) |
| **Maintenance** | Active (Allen Institute for AI) |

```python
import spacy
import scispacy
from scispacy.linking import EntityLinker

# Load biomedical NER model
nlp = spacy.load("en_core_sci_md")

# Add UMLS entity linker
linker = EntityLinker(
    resolve_abbreviations=True,
    name="umls",
    threshold=0.7
)
nlp.add_pipe("scispacy_linker", config={"linker_name": "umls"})

text = "The patient was started on fluoxetine 20mg and lorazepam 1mg."
doc = nlp(text)

for ent in doc.ents:
    for umls_ent in ent._.kb_ents[:3]:
        cui = umls_ent[0]
        score = umls_ent[1]
        # UMLS CUI can be mapped to RxCUI via RXNCONSO
        print(f"  Entity: {ent.text} -> UMLS CUI: {cui} (score: {score:.2f})")
```

### 10.5 DrugNorm

**Description**: Drug name normalization from brand names to generic names using UMLS/RxNorm.

| Attribute | Details |
|---|---|
| **Repository** | https://github.com/AnneDirkson/DrugNorm |
| **License** | Not specified (academic use) |
| **Requirements** | MySQL 5.5, UMLS license |
| **Language** | Python 3 |
| **Maintenance** | Limited (last update ~2018) |

### 10.6 RxNorm-to-SNOMED Mapping Tool

**Description**: NLM official tool for generating RxNorm-to-SNOMED CT mappings.

| Attribute | Details |
|---|---|
| **Repository** | https://github.com/LHNCBC/map-rxnorm-to-snomed |
| **Source** | National Library of Medicine |
| **Requirements** | Java 17, Maven, 15GB RAM, SNOMED CT RF2 files |
| **Output** | OWL files with inferred equivalences |
| **Maintenance** | Active (NLM) |

### 10.7 Spark NLP / John Snow Labs

**Description**: Commercial NLP library with pretrained RxNorm pipelines.

| Attribute | Details |
|---|---|
| **Pipeline** | `rxnorm_resolver_pipeline`, `ner_rxnorm_pipeline` |
| **License** | Licensed (commercial) |
| **Features** | End-to-end medication NER + RxNorm resolution |
| **Size** | ~1.7 GB model |

```python
from sparknlp.pretrained import PretrainedPipeline

# Load RxNorm NER pipeline
ner_pipeline = PretrainedPipeline("ner_rxnorm_pipeline", "en", "clinical/models")

result = ner_pipeline.annotate("""
The patient was prescribed Albuterol inhaler when needed. 
She was prescribed Avandia 4 mg, Coumadin 5 mg, 
Metformin 100 mg two times a day, and Lisinopril 10 mg.
""")

# Extracted entities with RxNorm codes
for chunk, entity in zip(result["chunk"], result["entities"]):
    print(f"{chunk} -> {entity}")
```

### 10.8 Tool Comparison Matrix

| Tool | License | RxNorm | ATC | SNOMED | NER | Maintenance | Recommendation |
|---|---|---|---|---|---|---|---|
| RxNav-in-a-Box | UMLS | Native | Yes | Via RxClass | No | Monthly | **Production** |
| pharmpy | Apache 2.0 | API | Yes | No | No | Low | Reference only |
| medspacy | Apache 2.0 | Indirect | No | Indirect | Yes | Active | **NER Pipeline** |
| scispacy | Apache 2.0 | Via UMLS | No | Via UMLS | Yes | Active | **NER + Linking** |
| DrugNorm | Academic | Via UMLS | No | No | No | Low | Legacy reference |
| map-rxnorm-to-snomed | Public | Native | No | Yes | No | Active | R&D |
| Spark NLP | Commercial | Yes | No | No | Yes | Active | Enterprise option |

---

## 11. Implementation Recommendations

### 11.1 Phase 1: Foundation (Weeks 1-4)

**Objective**: Establish RxNorm integration with basic normalization

1. **Set up RxNav API client**
   - Implement rate-limited HTTP client (20 req/sec)
   - Add retry logic with exponential backoff
   - Set up JSON response parsing

2. **Implement core lookup services**
   - `findRxcuiByString` for name resolution
   - `getDrugs` for product lookup
   - `approximateMatch` for fuzzy matching
   - `getAllRelatedInfo` for ingredient extraction

3. **Build caching layer**
   - Redis for warm cache (24h TTL)
   - In-memory LRU for hot items
   - Cache key scheme: `rxnorm:{rxcui}:{endpoint}`

4. **Create medication data model**
   - `MedicationConcept` dataclass
   - `ProvenanceRecord` for audit trail
   - `ConfidenceScorer` for quality assessment

### 11.2 Phase 2: Classification (Weeks 5-8)

**Objective**: Add ATC classification and neuromodulation relevance assessment

1. **Implement ATC adapter**
   - RxClass API integration
   - ATCPROD product-level mapping (primary)
   - Ingredient-level mapping (fallback)

2. **Build neuromodulation relevance engine**
   - ATC code pattern matching for N05/N06 classes
   - Protocol interaction detection
   - Alert generation for contraindications

3. **Create synonym resolution pipeline**
   - Preprocessing (abbreviation expansion, normalization)
   - Progressive matching (exact -> approximate -> ingredient extraction)
   - Manual review queue for low-confidence matches

### 11.3 Phase 3: Enrichment (Weeks 9-12)

**Objective**: Add SNOMED CT mapping and clinical context

1. **Implement SNOMED CT adapter** (requires UMLS license)
   - CUI-to-SCTID mapping via UMLS
   - Drug model attribute extraction
   - Clinical semantic enrichment

2. **Add NDC support**
   - NDC-to-RxCUI mapping
   - Package-level medication identification

3. **Build medication profile manager**
   - Patient medication list normalization
   - Drug-disease interaction checking
   - Protocol-specific contraindication alerts

### 11.4 Phase 4: Optimization (Weeks 13-16)

**Objective**: Performance optimization and production hardening

1. **Deploy RxNav-in-a-Box locally**
   - Eliminate API rate limits
   - Ensure data sovereignty
   - Reduce latency to <50ms per lookup

2. **Implement NLP pipeline**
   - medspacy for medication extraction from clinical notes
   - scispacy UMLS linker for concept resolution
   - Custom RxNorm linker for direct RxCUI mapping

3. **Production hardening**
   - Comprehensive audit logging
   - Data freshness monitoring
   - Fallback strategies for API outages
   - Monthly data update process

### 11.5 Recommended Tech Stack

```yaml
MedicationNormalizationService:
  primary_api: "RxNav REST API"
  local_deployment: "RxNav-in-a-Box (Docker)"
  
CacheLayer:
  hot_cache: "Python LRU dict (1000 items)"
  warm_cache: "Redis (24h TTL)"
  cold_storage: "Local RxNorm RRF files (PostgreSQL)"

NERPipeline:
  framework: "spaCy + medspacy"
  entity_linker: "scispacy UMLS linker"
  custom_component: "RxNorm linker"

DataStorage:
  normalized_medications: "PostgreSQL"
  audit_log: "Append-only file / Kafka"
  cache: "Redis"

Monitoring:
  api_latency: "Prometheus"
  cache_hit_rate: "Prometheus"
  data_freshness: "Custom health check"
  
Deployment:
  containerization: "Docker"
  orchestration: "Kubernetes (production)"
  api_gateway: "Kong or similar"
```

### 11.6 Configuration Template

```yaml
# config/medication_normalization.yaml
rxnorm:
  base_url: "https://rxnav.nlm.nih.gov/REST"
  # For local deployment:
  # base_url: "http://localhost:4000/REST"
  rate_limit: 20  # requests per second
  timeout: 10     # seconds
  retry:
    max_attempts: 3
    backoff_factor: 2.0

cache:
  redis:
    host: "localhost"
    port: 6379
    db: 0
    ttl: 86400  # 24 hours
  memory:
    max_items: 1000

atc:
  primary_source: "ATCPROD"  # product-level mapping
  fallback_source: "ATC"     # ingredient-level mapping

neuromodulation:
  relevant_atc_prefixes:
    - "N05A"  # Antipsychotics
    - "N05B"  # Anxiolytics
    - "N05C"  # Hypnotics
    - "N06A"  # Antidepressants
    - "N06B"  # Psychostimulants
    - "N06D"  # Anti-dementia
    - "N02"   # Analgesics
    - "N03"   # Antiepileptics
  
  protocol_concerns:
    tDCS:
      - "GABA_MODULATION"
      - "SEROTONIN_MODULATION"
      - "CORTICAL_EXCITABILITY"
    TMS:
      - "SEIZURE_THRESHOLD"
      - "DOPAMINE_MODULATION"
    tACS:
      - "SEROTONIN_MODULATION"
      - "CORTICAL_EXCITABILITY"
    PBM:
      - "GABA_MODULATION"
      - "MELATONIN_MODULATION"

provenance:
  track_all_lookups: true
  audit_log_path: "/var/log/deepsynaps/medication_audit.log"
  retention_days: 2555  # 7 years (HIPAA)
```

---

## 12. Risks & Mitigations

### 12.1 Risk Matrix

| Risk | Likelihood | Impact | Priority | Mitigation |
|---|---|---|---|---|
| **API Rate Limit Breach** | Medium | High | P1 | Deploy RxNav-in-a-Box locally |
| **API Service Outage** | Low | Critical | P1 | Local deployment + offline cache |
| **Data Staleness** | High | Medium | P2 | Automated monthly update pipeline |
| **Concept Obsolescence** | Medium | Medium | P2 | Historical concept resolution |
| **SNOMED CT License Issues** | Medium | Medium | P2 | Use RxNorm as primary; SNOMED optional |
| **Mapping Incompleteness** | High | Medium | P2 | Confidence scoring + manual review queue |
| **Patient Data Privacy** | Low | Critical | P1 | Hash all patient IDs in audit logs |
| **Multi-Ingredient Drug Ambiguity** | Medium | High | P2 | MIN term type handling + explicit parsing |
| **Brand Name Resolution Failures** | Medium | Medium | P3 | Generic fallback + tradename_of relationships |
| **International Drug Gaps** | High | Low | P3 | RxNorm is US-focused; flag non-US drugs |

### 12.2 Detailed Mitigations

#### 12.2.1 API Rate Limit Breach (P1)

**Risk**: Exceeding 20 req/sec triggers HTTP 429 errors, disrupting medication lookups.

**Mitigation**:
```python
import time
from functools import wraps

class RateLimiter:
    """Token bucket rate limiter for RxNav API."""
    
    def __init__(self, rate: float = 20.0):
        self.rate = rate
        self.tokens = rate
        self.last_update = time.time()
        self.lock = threading.Lock()
    
    def acquire(self):
        with self.lock:
            now = time.time()
            elapsed = now - self.last_update
            self.tokens = min(self.rate, self.tokens + elapsed * self.rate)
            self.last_update = now
            
            if self.tokens < 1:
                sleep_time = (1 - self.tokens) / self.rate
                time.sleep(sleep_time)
                self.tokens = 0
            else:
                self.tokens -= 1

# Apply to all API calls
rate_limiter = RateLimiter(rate=20.0)

def api_call(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        rate_limiter.acquire()
        return func(*args, **kwargs)
    return wrapper
```

**Best Solution**: Deploy RxNav-in-a-Box locally to eliminate rate limits entirely.

#### 12.2.2 API Service Outage (P1)

**Risk**: NLM servers unavailable, blocking all medication lookups.

**Mitigation Strategy**:
```
Lookup Flow:
  1. Check hot cache (memory) - <1ms
  2. Check warm cache (Redis) - <5ms
  3. Query local RxNav-in-a-Box - <50ms
  4. Query remote RxNav API - <200ms
  5. Use cached RRF data (PostgreSQL) - <100ms
  6. Return "Service Temporarily Unavailable" with last known data
```

#### 12.2.3 Data Staleness (P2)

**Risk**: Monthly RxNorm updates may change concept mappings, causing outdated classifications.

**Mitigation**:
```python
class DataFreshnessMonitor:
    """Monitor and enforce data freshness for RxNorm content."""
    
    def __init__(self, max_age_days: int = 35):
        self.max_age_days = max_age_days
    
    def check_freshness(self) -> Dict:
        """Check if local RxNorm data is current."""
        current_version = self._get_current_version()
        latest_version = self._get_latest_version()
        
        return {
            "current_version": current_version,
            "latest_version": latest_version,
            "is_current": current_version == latest_version,
            "days_behind": self._calculate_days_behind(current_version, latest_version)
        }
    
    def _get_current_version(self) -> str:
        # Check local RxNorm version file or database
        pass
    
    def _get_latest_version(self) -> str:
        # Query RxNav version endpoint
        response = requests.get("https://rxnav.nlm.nih.gov/REST/version")
        return response.json().get("version", "unknown")
```

#### 12.2.4 Mapping Incompleteness (P2)

**Risk**: Not all medications can be automatically mapped, leading to gaps in patient profiles.

**Mitigation**:
- Implement **confidence scoring** with tiered resolution
- Route low-confidence matches to **manual review queue**
- Allow **manual RxCUI entry** by trained clinicians
- Track **unresolved medications** for vocabulary enrichment feedback
- Use **approximate match** with spelling correction for common variants

#### 12.2.5 Patient Data Privacy (P1)

**Risk**: Medication data contains PHI; audit logs could leak patient information.

**Mitigation**:
```python
import hashlib
import hmac

class PrivacyGuard:
    """Privacy protection for medication audit logs."""
    
    def __init__(self, secret_key: bytes):
        self.secret_key = secret_key
    
    def pseudonymize_patient_id(self, patient_id: str) -> str:
        """Create deterministic pseudonym for patient ID."""
        return hmac.new(
            self.secret_key,
            patient_id.encode(),
            hashlib.sha256
        ).hexdigest()[:16]
    
    def redact_free_text(self, text: str) -> str:
        """Redact potential PHI from free text medication descriptions."""
        # Remove dates, phone numbers, SSN patterns
        import re
        text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[REDACTED]', text)  # SSN
        text = re.sub(r'\b\d{1,2}/\d{1,2}/\d{2,4}\b', '[DATE]', text)  # Dates
        return text
```

### 12.3 Fallback Strategy Summary

```
+-----------------------------------------+
|        Medication Lookup Pipeline        |
+-----------------------------------------+
                                          |
  +---------+  miss   +---------+  miss   |
  |  Cache  |-------->|  Local  |-------->|
  |  (Redis)|         | RxNav   |         |
  +---------+         | -in-Box |         |
       ^              +---------+         |
       |                   |  miss       |
       |                   v             |
       |              +---------+  miss  |
       |              |  Remote |------->|
       |              | RxNav   |  Error|
       |              |  API    |       |
       |              +---------+       |
       |                   |            |
       |              +----+----+       |
       |              |  Local  |       |
       +--------------|  RRF    |       |
                      |  Files  |       |
                      +----+----+       |
                           |            |
                      +----+----+       |
                      | Manual  |       |
                      | Review  |       |
                      +---------+       |
+-----------------------------------------+
```

### 12.4 Disaster Recovery

| Scenario | Recovery Action | RTO |
|---|---|---|
| Local RxNav-in-a-Box down | Failover to remote RxNav API | 5 minutes |
| Redis cache failure | Rebuild from PostgreSQL + API calls | 15 minutes |
| Database corruption | Restore from backup; re-ingest RRF files | 2 hours |
| Complete system failure | Activate read-only mode with last known data | 30 minutes |
| Monthly update failure | Rollback to previous version; retry | 1 hour |

---

## Appendix A: Complete API Endpoint Reference

| Endpoint | Method | Description |
|---|---|---|
| `/REST/rxcui.json` | GET | Find RxCUI by name |
| `/REST/rxcui/{rxcui}/properties.json` | GET | Get concept properties |
| `/REST/rxcui/{rxcui}/allrelated.json` | GET | Get all related concepts |
| `/REST/rxcui/{rxcui}/related.json` | GET | Get related by term type |
| `/REST/rxcui/{rxcui}/ndcs.json` | GET | Get NDC codes |
| `/REST/rxcui/{rxcui}/historystatus.json` | GET | Get historical status |
| `/REST/rxcui/{rxcui}/allProperties.json` | GET | Get all properties |
| `/REST/rxcui/{rxcui}/proprietary.json` | GET | Get proprietary info (UMLS req) |
| `/REST/drugs.json` | GET | Get drugs by name |
| `/REST/approximateTerm.json` | GET | Approximate (fuzzy) match |
| `/REST/displaynames.json` | GET | Get auto-complete terms |
| `/REST/relatedndc.json` | GET | Find related NDCs |
| `/REST/allstatus.json` | GET | Get concepts by status |
| `/REST/allconcepts.json` | GET | Get concepts by term type |
| `/REST/relatypes` | GET | Get relationship types |
| `/REST/version` | GET | Get RxNorm version |
| `/REST/rxclass/class/byRxcui.json` | GET | Get classes for RxCUI |
| `/REST/rxclass/classMembers.json` | GET | Get drugs in class |
| `/REST/Prescribe/drugs.json` | GET | Get prescribable drugs |

## Appendix B: ATC Prefix Quick Reference

| Prefix | Category | DeepSynaps Relevance |
|---|---|---|
| N05A | Antipsychotics | **Critical** |
| N05B | Anxiolytics | **High** |
| N05C | Hypnotics/Sedatives | **High** |
| N06A | Antidepressants | **Critical** |
| N06B | Psychostimulants | **High** |
| N06C | Psycholeptic/Psychoanaleptic combos | **High** |
| N06D | Anti-dementia drugs | **Medium** |
| N02 | Analgesics | **Medium** |
| N03 | Antiepileptics | **High** |
| N04 | Anti-parkinson drugs | **Medium** |
| N07 | Other nervous system drugs | **Low** |

## Appendix C: Glossary

| Term | Definition |
|---|---|
| **RxCUI** | RxNorm Concept Unique Identifier -- the primary identifier for RxNorm concepts |
| **TTY** | Term Type -- categorizes concepts by semantic level (IN, SCD, SBD, etc.) |
| **RELA** | Relationship Attribute -- describes the relationship between two concepts |
| **ATC** | Anatomical Therapeutic Chemical classification system |
| **NDC** | National Drug Code -- FDA product identifier |
| **SCD** | Semantic Clinical Drug -- ingredient + strength + dose form |
| **SBD** | Semantic Branded Drug -- SCD + brand name |
| **IN** | Ingredient -- active moiety of a drug |
| **BN** | Brand Name -- proprietary product name |
| **DF** | Dose Form -- physical formulation (tablet, solution, etc.) |
| **UMLS** | Unified Medical Language System -- NLM's metathesaurus |
| **SAB** | Source Abbreviation -- identifies vocabulary source |
| **BoSS** | Basis of Strength Substance -- ingredient basis for strength |

## Appendix D: Sample Code Repository Structure

```
deepsynaps-medication-service/
|-- src/
|   |-- __init__.py
|   |-- adapters/
|   |   |-- __init__.py
|   |   |-- rxnorm_adapter.py
|   |   |-- atc_adapter.py
|   |   |-- snomedct_adapter.py
|   |-- models/
|   |   |-- __init__.py
|   |   |-- medication.py
|   |   |-- provenance.py
|   |   |-- confidence.py
|   |-- pipeline/
|   |   |-- __init__.py
|   |   |-- synonym_resolution.py
|   |   |-- ner_extraction.py
|   |-- service/
|   |   |-- __init__.py
|   |   |-- normalization_service.py
|   |   |-- cache_manager.py
|   |   |-- audit_logger.py
|   |-- config/
|   |   |-- medication_normalization.yaml
|   |-- utils/
|       |-- rate_limiter.py
|       |-- privacy_guard.py
|-- tests/
|-- docker/
|   |-- Dockerfile
|   |-- docker-compose.yml
|-- docs/
|-- requirements.txt
|-- setup.py
|-- README.md
```

---

## References

1. National Library of Medicine. "RxNorm Technical Documentation." https://www.nlm.nih.gov/research/umls/rxnorm/docs/techdoc.html
2. National Library of Medicine. "RxNav API Documentation." https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html
3. National Library of Medicine. "RxNav-in-a-Box." https://lhncbc.nlm.nih.gov/RxNav/applications/RxNav-in-a-Box.html
4. National Library of Medicine. "Appendix 1 - RxNorm Relationships." https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix1.html
5. National Library of Medicine. "Appendix 5 - RxNorm Term Types." https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html
6. Bodenreider O, et al. "Analyzing U.S. prescription lists with RxNorm and the ATC/DDD Index." AMIA 2015.
7. Kury F, Bodenreider O. "Mapping U.S. FDA National Drug Codes to Anatomical-Therapeutic-Chemical Classes using RxNorm." AMIA 2017.
8. Nikiema R, Bodenreider O. "Integration process of RxNorm to SNOMED CT." NLM 2018.
9. WHO Collaborating Centre. "ATC/DDD Index." https://atcddd.fhi.no/atc_ddd_index/
10. medspacy. "Medical NLP with spaCy." https://github.com/medspacy/medspacy
11. scispacy. "A full spaCy pipeline for scientific/biomedical documents." https://allenai.github.io/scispacy/
12. National Library of Medicine. "RxNav Terms of Service." https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html
13. National Library of Medicine. "map-rxnorm-to-snomed." https://github.com/LHNCBC/map-rxnorm-to-snomed
14. ATC-to-RxNorm Mappings comparison (OHDSI vs UMLS). "Journal of Biomedical Informatics, 2025."

---

*Document End -- RxNorm & Medication Ontology Integration Report*
*Prepared for DeepSynaps Protocol Studio Knowledge Layer Phase 1*

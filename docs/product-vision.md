# Product Vision

## Mission
DeepSynaps Protocol Studio should become the canonical internal platform for generating clinically structured neuromodulation documents across conditions, modalities, and supported devices.

## Primary users
- clinicians who need fast, structured protocol generation
- clinics that need consistent assessment and patient-facing materials
- internal operators who maintain modality, device, and safety registries

## Core product outcomes
- reduce manual protocol drafting time
- improve consistency of clinician and patient documentation
- centralize safety and compatibility rules
- support reusable content generation across multiple conditions and devices

## Product principles
- one canonical internal schema across all services
- domain-first registries for conditions, modalities, and devices
- safety validation before document generation
- modular rendering so outputs can target web, DOCX, and PDF
- design for future multi-tenant SaaS, even if the first release is single-tenant internally

## MVP capabilities
- intake for condition, phenotype, modality, and device selection
- registry-backed compatibility checks
- generation of assessment packs, protocols, clinician handbooks, and patient guides
- previewable outputs with export-oriented render pipelines

## Non-goals for MVP
- customer-specific Sozo logic
- deeply automated clinical decision support
- direct EMR integrations
- advanced tenancy and billing flows

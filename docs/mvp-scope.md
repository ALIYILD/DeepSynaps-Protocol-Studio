# MVP Scope

## In scope
- condition intake for:
  - ASD
  - ADHD
  - Depression
  - Anxiety
  - Parkinson's disease
- modality support for:
  - tDCS
  - TMS
  - TPS
  - PBM
- output generation for:
  - assessment pack
  - protocol
  - clinician handbook
  - patient guide
- basic compatibility validation between selected modality and device
- modular architecture ready for future safety rules, phenotype handling, and export expansion

## First implementation milestone
- monorepo scaffold created
- API health endpoint available
- frontend intake page available
- canonical schema stubs created
- one sample condition, one sample modality, and one sample device registry entry included
- worker scaffold and task runner commands defined

## Deferred
- deep clinical rule engines
- multi-tenant account model
- audit trails
- billing
- role-based access control
- EMR and third-party integrations
- production deployment infrastructure

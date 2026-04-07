import {
  AuditEvent,
  CaseSummary,
  DeviceRecord,
  DisclaimerSet,
  EvidenceItem,
  HandbookDocumentPreview,
  HandbookGenerationResult,
  ProtocolDraft,
} from "../../types/domain";
import {
  ApiAuditEvent,
  ApiCaseSummaryResponse,
  ApiDeviceRecord,
  ApiDisclaimerSet,
  ApiEvidenceRecord,
  ApiHandbookDocument,
  ApiHandbookGenerateResponse,
  ApiProtocolDraftResponse,
} from "./types";

export function adaptDisclaimerSet(input: ApiDisclaimerSet): DisclaimerSet {
  return {
    professionalUseOnly: input.professional_use_only,
    draftSupportOnly: input.draft_support_only ?? undefined,
    clinicianJudgment: input.clinician_judgment,
    offLabelReviewRequired: input.off_label_review_required ?? undefined,
  };
}

export function adaptEvidenceRecord(input: ApiEvidenceRecord): EvidenceItem {
  return {
    id: input.id,
    title: input.title,
    condition: input.condition,
    symptomCluster: input.symptom_cluster,
    modality: input.modality,
    evidenceLevel: input.evidence_level,
    regulatoryStatus: input.regulatory_status,
    summary: input.summary,
    evidenceStrength: input.evidence_strength,
    supportedMethods: input.supported_methods,
    contraindications: input.contraindications,
    references: input.references,
    relatedDevices: input.related_devices,
    approvedNotes: input.approved_notes,
    emergingNotes: input.emerging_notes,
  };
}

export function adaptDeviceRecord(input: ApiDeviceRecord): DeviceRecord {
  return {
    id: input.id,
    name: input.name,
    manufacturer: input.manufacturer,
    modality: input.modality,
    channels: input.channels,
    useType: input.use_type,
    regions: input.regions,
    regulatoryStatus: input.regulatory_status,
    summary: input.summary,
    bestFor: input.best_for,
    constraints: input.constraints,
    sampleDataNotice: input.sample_data_notice,
  };
}

export function adaptCaseSummary(input: ApiCaseSummaryResponse): CaseSummary {
  return {
    presentingSymptoms: input.presenting_symptoms,
    relevantFindings: input.relevant_findings,
    redFlags: input.red_flags,
    possibleTargets: input.possible_targets,
    suggestedModalities: input.suggested_modalities,
    disclaimers: adaptDisclaimerSet(input.disclaimers),
  };
}

export function adaptProtocolDraft(input: ApiProtocolDraftResponse): ProtocolDraft {
  return {
    rationale: input.rationale,
    targetRegion: input.target_region,
    sessionFrequency: input.session_frequency,
    duration: input.duration,
    escalationLogic: input.escalation_logic,
    monitoringPlan: input.monitoring_plan,
    contraindications: input.contraindications,
    patientCommunicationNotes: input.patient_communication_notes,
    evidenceGrade: input.evidence_grade,
    approvalStatusBadge: input.approval_status_badge,
    offLabelReviewRequired: input.off_label_review_required,
    disclaimers: adaptDisclaimerSet(input.disclaimers),
  };
}

export function adaptHandbookDocument(input: ApiHandbookDocument): HandbookDocumentPreview {
  return {
    documentType: input.document_type,
    title: input.title,
    overview: input.overview,
    eligibility: input.eligibility,
    setup: input.setup,
    sessionWorkflow: input.session_workflow,
    safety: input.safety,
    troubleshooting: input.troubleshooting,
    escalation: input.escalation,
    references: input.references,
  };
}

export function adaptHandbookResult(input: ApiHandbookGenerateResponse): HandbookGenerationResult {
  return {
    document: adaptHandbookDocument(input.document),
    disclaimers: adaptDisclaimerSet(input.disclaimers),
    exportTargets: input.export_targets,
  };
}

export function adaptAuditEvent(input: ApiAuditEvent): AuditEvent {
  return {
    eventId: input.event_id,
    targetId: input.target_id,
    targetType: input.target_type,
    action: input.action,
    role: input.role,
    note: input.note,
    createdAt: input.created_at,
  };
}

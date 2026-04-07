import {
  AuditEvent,
  BrainRegion,
  CaseSummary,
  DeviceRecord,
  DisclaimerSet,
  EvidenceItem,
  HandbookDocumentPreview,
  HandbookGenerationResult,
  ProtocolDraft,
  QEEGBiomarker,
  QEEGConditionMap,
} from "../../types/domain";
import {
  ApiAuditEvent,
  ApiBrainRegion,
  ApiCaseSummaryResponse,
  ApiDeviceRecord,
  ApiDisclaimerSet,
  ApiEvidenceRecord,
  ApiHandbookDocument,
  ApiHandbookGenerateResponse,
  ApiProtocolDraftResponse,
  ApiQEEGBiomarker,
  ApiQEEGConditionMap,
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

export function adaptBrainRegion(input: ApiBrainRegion): BrainRegion {
  return {
    regionId: input.region_id,
    regionName: input.region_name,
    abbreviation: input.abbreviation,
    lobe: input.lobe,
    depth: input.depth,
    eegPosition: input.eeg_position_10_20,
    brodmannArea: input.brodmann_area,
    primaryFunctions: input.primary_functions,
    brainNetwork: input.brain_network,
    keyConditions: input.key_conditions,
    targetableModalities: input.targetable_modalities,
    notes: input.notes,
    reviewStatus: input.review_status,
  };
}

export function adaptQEEGBiomarker(input: ApiQEEGBiomarker): QEEGBiomarker {
  return {
    bandId: input.band_id,
    bandName: input.band_name,
    hzRange: input.hz_range,
    normalBrainState: input.normal_brain_state,
    keyRegions: input.key_regions,
    eegPositions: input.eeg_positions,
    pathologicalIncrease: input.pathological_increase,
    pathologicalDecrease: input.pathological_decrease,
    associatedDisorders: input.associated_disorders,
    clinicalSignificance: input.clinical_significance,
    reviewStatus: input.review_status,
  };
}

export function adaptQEEGConditionMap(input: ApiQEEGConditionMap): QEEGConditionMap {
  return {
    mapId: input.map_id,
    conditionId: input.condition_id,
    conditionName: input.condition_name,
    keySymptoms: input.key_symptoms,
    qeegPatterns: input.qeeg_patterns,
    keyElectrodeSites: input.key_qeeg_electrode_sites,
    affectedBrainRegions: input.affected_brain_regions,
    primaryNetworksDisrupted: input.primary_networks_disrupted,
    networkDysfunctionPattern: input.network_dysfunction_pattern,
    recommendedNeuromodTechniques: input.recommended_neuromod_techniques,
    primaryStimulationTargets: input.primary_stimulation_targets,
    stimulationRationale: input.stimulation_rationale,
    reviewStatus: input.review_status,
  };
}

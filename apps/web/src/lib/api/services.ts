import {
  AuditEvent,
  CaseSummary,
  DeviceRecord,
  EvidenceItem,
  HandbookGenerationResult,
  HandbookKindApi,
  Modality,
  ProtocolDraft,
  ReviewActionType,
  ReviewTargetType,
  SymptomCluster,
  UploadType,
  UserRole,
} from "../../types/domain";
import {
  adaptAuditEvent,
  adaptCaseSummary,
  adaptDeviceRecord,
  adaptDisclaimerSet,
  adaptEvidenceRecord,
  adaptHandbookResult,
  adaptProtocolDraft,
} from "./adapters";
import { getAuthorizationHeader } from "./auth";
import { requestJson } from "./client";
import {
  ApiAuditTrailResponse,
  ApiCaseSummaryRequest,
  ApiCaseSummaryResponse,
  ApiDeviceListResponse,
  ApiEvidenceListResponse,
  ApiHandbookGenerateRequest,
  ApiHandbookGenerateResponse,
  ApiProtocolDraftRequest,
  ApiProtocolDraftResponse,
  ApiReviewActionRequest,
  ApiReviewActionResponse,
} from "./types";

export async function fetchEvidenceLibrary(): Promise<{
  items: EvidenceItem[];
  disclaimers: ReturnType<typeof adaptDisclaimerSet>;
}> {
  const response = await requestJson<ApiEvidenceListResponse>("/api/v1/evidence");
  return {
    items: response.items.map(adaptEvidenceRecord),
    disclaimers: adaptDisclaimerSet(response.disclaimers),
  };
}

export async function fetchDeviceRegistry(): Promise<{
  items: DeviceRecord[];
  disclaimers: ReturnType<typeof adaptDisclaimerSet>;
}> {
  const response = await requestJson<ApiDeviceListResponse>("/api/v1/devices");
  return {
    items: response.items.map(adaptDeviceRecord),
    disclaimers: adaptDisclaimerSet(response.disclaimers),
  };
}

export async function generateCaseSummary(input: {
  role: UserRole;
  uploads: Array<{ type: UploadType; fileName: string; summary: string }>;
}): Promise<CaseSummary> {
  const payload: ApiCaseSummaryRequest = {
    uploads: input.uploads.map((upload) => ({
      type: upload.type,
      file_name: upload.fileName,
      summary: upload.summary,
    })),
  };
  const response = await requestJson<ApiCaseSummaryResponse>("/api/v1/uploads/case-summary", {
    method: "POST",
    headers: getAuthorizationHeader(input.role),
    body: JSON.stringify(payload),
  });
  return adaptCaseSummary(response);
}

export async function generateProtocolDraft(input: {
  role: UserRole;
  condition: string;
  symptomCluster: SymptomCluster;
  modality: Modality;
  device: string;
  setting: "Clinic" | "Home";
  evidenceThreshold: "Guideline" | "Systematic Review" | "Consensus" | "Registry";
  offLabel: boolean;
}): Promise<ProtocolDraft> {
  const payload: ApiProtocolDraftRequest = {
    condition: input.condition,
    symptom_cluster: input.symptomCluster,
    modality: input.modality,
    device: input.device,
    setting: input.setting,
    evidence_threshold: input.evidenceThreshold,
    off_label: input.offLabel,
  };
  const response = await requestJson<ApiProtocolDraftResponse>("/api/v1/protocols/generate-draft", {
    method: "POST",
    headers: getAuthorizationHeader(input.role),
    body: JSON.stringify(payload),
  });
  return adaptProtocolDraft(response);
}

export async function generateHandbook(input: {
  role: UserRole;
  handbookKind: HandbookKindApi;
  condition: string;
  modality: Modality;
}): Promise<HandbookGenerationResult> {
  const payload: ApiHandbookGenerateRequest = {
    handbook_kind: input.handbookKind,
    condition: input.condition,
    modality: input.modality,
  };
  const response = await requestJson<ApiHandbookGenerateResponse>("/api/v1/handbooks/generate", {
    method: "POST",
    headers: getAuthorizationHeader(input.role),
    body: JSON.stringify(payload),
  });
  return adaptHandbookResult(response);
}

export async function submitReviewAction(input: {
  role: UserRole;
  targetId: string;
  targetType: ReviewTargetType;
  action: ReviewActionType;
  note: string;
}): Promise<{ event: AuditEvent; disclaimers: ReturnType<typeof adaptDisclaimerSet> }> {
  const payload: ApiReviewActionRequest = {
    target_id: input.targetId,
    target_type: input.targetType,
    action: input.action,
    note: input.note,
  };
  const response = await requestJson<ApiReviewActionResponse>("/api/v1/review-actions", {
    method: "POST",
    headers: getAuthorizationHeader(input.role),
    body: JSON.stringify(payload),
  });
  return {
    event: adaptAuditEvent(response.event),
    disclaimers: adaptDisclaimerSet(response.disclaimers),
  };
}

export async function fetchAuditTrailForRole(role: UserRole): Promise<{
  items: AuditEvent[];
  disclaimers: ReturnType<typeof adaptDisclaimerSet>;
}> {
  const response = await requestJson<ApiAuditTrailResponse>("/api/v1/audit-trail", {
    headers: getAuthorizationHeader(role),
  });
  return {
    items: response.items.map(adaptAuditEvent),
    disclaimers: adaptDisclaimerSet(response.disclaimers),
  };
}

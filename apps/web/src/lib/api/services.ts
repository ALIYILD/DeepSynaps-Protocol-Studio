import {
  AuditEvent,
  BrainRegion,
  CaseSummary,
  DeviceRecord,
  EvidenceItem,
  HandbookGenerationResult,
  HandbookKindApi,
  Modality,
  ProtocolDraft,
  QEEGBiomarker,
  QEEGConditionMap,
  ReviewActionType,
  ReviewTargetType,
  SymptomCluster,
  UploadType,
  UserRole,
} from "../../types/domain";
import {
  adaptAuditEvent,
  adaptBrainRegion,
  adaptCaseSummary,
  adaptDeviceRecord,
  adaptDisclaimerSet,
  adaptEvidenceRecord,
  adaptHandbookResult,
  adaptProtocolDraft,
  adaptQEEGBiomarker,
  adaptQEEGConditionMap,
} from "./adapters";
import { getAuthorizationHeader } from "./auth";
import { ApiError, requestJson } from "./client";
import { apiBaseUrl } from "../../config/api";
import {
  ApiAuditTrailResponse,
  ApiBrainRegionListResponse,
  ApiCaseSummaryRequest,
  ApiCaseSummaryResponse,
  ApiDeviceListResponse,
  ApiEvidenceListResponse,
  ApiHandbookGenerateRequest,
  ApiHandbookGenerateResponse,
  ApiProtocolDraftRequest,
  ApiProtocolDraftResponse,
  ApiQEEGBiomarkerListResponse,
  ApiQEEGConditionMapListResponse,
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

export async function listBrainRegions(): Promise<BrainRegion[]> {
  const response = await requestJson<ApiBrainRegionListResponse>("/api/v1/brain-regions");
  return response.items.map(adaptBrainRegion);
}

export async function listQEEGBiomarkers(): Promise<QEEGBiomarker[]> {
  const response = await requestJson<ApiQEEGBiomarkerListResponse>("/api/v1/qeeg/biomarkers");
  return response.items.map(adaptQEEGBiomarker);
}

export async function listQEEGConditionMap(): Promise<QEEGConditionMap[]> {
  const response = await requestJson<ApiQEEGConditionMapListResponse>("/api/v1/qeeg/condition-map");
  return response.items.map(adaptQEEGConditionMap);
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError({
      code: "network_error",
      message: "The API could not be reached.",
      status: 0,
      warnings: error instanceof Error ? [error.message] : [],
    });
  }
  if (!response.ok) {
    throw new ApiError({
      code: "request_failed",
      message: "The export request could not be completed.",
      status: response.status,
    });
  }
  return response.blob();
}

export async function exportProtocolDocx(params: {
  condition_name: string;
  modality_name: string;
  device_name: string;
  setting?: string;
  evidence_threshold?: string;
  off_label?: boolean;
}, role: UserRole): Promise<Blob> {
  return requestBlob("/api/v1/export/protocol-docx", {
    method: "POST",
    headers: getAuthorizationHeader(role),
    body: JSON.stringify(params),
  });
}

export async function exportHandbookDocx(params: {
  condition_name: string;
  modality_name: string;
  device_name: string;
}, role: UserRole): Promise<Blob> {
  return requestBlob("/api/v1/export/handbook-docx", {
    method: "POST",
    headers: getAuthorizationHeader(role),
    body: JSON.stringify(params),
  });
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  package_id: string;
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export async function registerUser(data: {
  email: string;
  display_name: string;
  password: string;
}): Promise<AuthTokenResponse> {
  return requestJson<AuthTokenResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthTokenResponse> {
  return requestJson<AuthTokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMe(token: string): Promise<AuthUser> {
  return requestJson<AuthUser>("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

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

// ── Dashboard stat helpers ─────────────────────────────────────────────────────
// These fetch only what is needed for the workspace stats tiles (total counts).

export async function fetchEvidenceTotal(): Promise<number> {
  const response = await requestJson<ApiEvidenceListResponse>("/api/v1/evidence");
  return response.total;
}

export async function fetchDeviceTotal(): Promise<number> {
  const response = await requestJson<ApiDeviceListResponse>("/api/v1/devices");
  return response.total;
}

export async function fetchBrainRegionTotal(): Promise<number> {
  const response = await requestJson<ApiBrainRegionListResponse>("/api/v1/brain-regions");
  return response.total;
}

export async function fetchQEEGBiomarkerTotal(): Promise<number> {
  const response = await requestJson<ApiQEEGBiomarkerListResponse>("/api/v1/qeeg/biomarkers");
  return response.total;
}

// ── Assessment draft persistence (localStorage) ────────────────────────────────

export function saveAssessmentDraft(templateId: string, data: Record<string, unknown>): void {
  const key = `assessment_draft_${templateId}`;
  localStorage.setItem(key, JSON.stringify({ data, savedAt: new Date().toISOString() }));
}

export function loadAssessmentDraft(templateId: string): { data: Record<string, unknown>; savedAt: string } | null {
  const key = `assessment_draft_${templateId}`;
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as { data: Record<string, unknown>; savedAt: string }) : null;
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
  condition: string;
  modality: string;
  device: string;
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

// ── Patient CRM ────────────────────────────────────────────────────────────────

import { Patient, ClinicalSession, AssessmentRecord } from "../../types/domain";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token") ?? "clinician-demo-token";
  return { Authorization: `Bearer ${token}` };
}

export async function listPatients(): Promise<Patient[]> {
  const res = await requestJson<{ items: RawPatient[]; total: number }>("/api/v1/patients", {
    headers: authHeader(),
  });
  return res.items.map(adaptPatient);
}

export async function createPatient(data: Omit<Patient, "id" | "clinicianId" | "fullName" | "createdAt" | "updatedAt">): Promise<Patient> {
  const raw = await requestJson<RawPatient>("/api/v1/patients", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(toSnakePatient(data)),
  });
  return adaptPatient(raw);
}

export async function updatePatient(id: string, data: Partial<Omit<Patient, "id" | "clinicianId" | "fullName" | "createdAt" | "updatedAt">>): Promise<Patient> {
  const raw = await requestJson<RawPatient>(`/api/v1/patients/${id}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(toSnakePatient(data)),
  });
  return adaptPatient(raw);
}

export async function deletePatient(id: string): Promise<void> {
  await fetch(`${apiBaseUrl}/api/v1/patients/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
}

// ── Sessions ───────────────────────────────────────────────────────────────────

export async function listSessions(patientId?: string): Promise<ClinicalSession[]> {
  const qs = patientId ? `?patient_id=${patientId}` : "";
  const res = await requestJson<{ items: RawSession[]; total: number }>(`/api/v1/sessions${qs}`, {
    headers: authHeader(),
  });
  return res.items.map(adaptSession);
}

export async function createClinicalSession(data: {
  patientId: string;
  scheduledAt: string;
  durationMinutes?: number;
  modality?: string;
  protocolRef?: string;
  sessionNumber?: number;
  totalSessions?: number;
  billingCode?: string;
}): Promise<ClinicalSession> {
  const raw = await requestJson<RawSession>("/api/v1/sessions", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({
      patient_id: data.patientId,
      scheduled_at: data.scheduledAt,
      duration_minutes: data.durationMinutes ?? 60,
      modality: data.modality,
      protocol_ref: data.protocolRef,
      session_number: data.sessionNumber,
      total_sessions: data.totalSessions,
      billing_code: data.billingCode,
    }),
  });
  return adaptSession(raw);
}

export async function updateClinicalSession(id: string, data: Partial<{
  scheduledAt: string;
  durationMinutes: number;
  modality: string;
  status: string;
  outcome: string;
  sessionNotes: string;
  adverseEvents: string;
  billingCode: string;
  billingStatus: string;
}>): Promise<ClinicalSession> {
  const payload: Record<string, unknown> = {};
  if (data.scheduledAt !== undefined) payload.scheduled_at = data.scheduledAt;
  if (data.durationMinutes !== undefined) payload.duration_minutes = data.durationMinutes;
  if (data.modality !== undefined) payload.modality = data.modality;
  if (data.status !== undefined) payload.status = data.status;
  if (data.outcome !== undefined) payload.outcome = data.outcome;
  if (data.sessionNotes !== undefined) payload.session_notes = data.sessionNotes;
  if (data.adverseEvents !== undefined) payload.adverse_events = data.adverseEvents;
  if (data.billingCode !== undefined) payload.billing_code = data.billingCode;
  if (data.billingStatus !== undefined) payload.billing_status = data.billingStatus;

  const raw = await requestJson<RawSession>(`/api/v1/sessions/${id}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  return adaptSession(raw);
}

export async function deleteClinicalSession(id: string): Promise<void> {
  await fetch(`${apiBaseUrl}/api/v1/sessions/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
}

// ── Assessments ────────────────────────────────────────────────────────────────

export interface AssessmentTemplateField {
  id: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
}

export interface AssessmentTemplateSection {
  title: string;
  fields: AssessmentTemplateField[];
}

export interface AssessmentTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  sections: AssessmentTemplateSection[];
}

export async function listAssessmentTemplates(): Promise<AssessmentTemplate[]> {
  return requestJson<AssessmentTemplate[]>("/api/v1/assessments/templates", { method: "GET" });
}

export async function listAssessments(patientId?: string): Promise<AssessmentRecord[]> {
  const qs = patientId ? `?patient_id=${patientId}` : "";
  const res = await requestJson<{ items: RawAssessment[]; total: number }>(`/api/v1/assessments${qs}`, {
    headers: authHeader(),
  });
  return res.items.map(adaptAssessment);
}

export async function saveAssessmentToServer(data: {
  templateId: string;
  templateTitle: string;
  patientId?: string;
  formData: Record<string, unknown>;
  clinicianNotes?: string;
  status?: "draft" | "completed";
  score?: string;
}): Promise<AssessmentRecord> {
  const raw = await requestJson<RawAssessment>("/api/v1/assessments", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({
      template_id: data.templateId,
      template_title: data.templateTitle,
      patient_id: data.patientId ?? null,
      data: data.formData,
      clinician_notes: data.clinicianNotes ?? null,
      status: data.status ?? "draft",
      score: data.score ?? null,
    }),
  });
  return adaptAssessment(raw);
}

export async function updateAssessmentRecord(id: string, data: {
  patientId?: string;
  formData?: Record<string, unknown>;
  clinicianNotes?: string;
  status?: "draft" | "completed";
  score?: string;
}): Promise<AssessmentRecord> {
  const payload: Record<string, unknown> = {};
  if (data.patientId !== undefined) payload.patient_id = data.patientId;
  if (data.formData !== undefined) payload.data = data.formData;
  if (data.clinicianNotes !== undefined) payload.clinician_notes = data.clinicianNotes;
  if (data.status !== undefined) payload.status = data.status;
  if (data.score !== undefined) payload.score = data.score;

  const raw = await requestJson<RawAssessment>(`/api/v1/assessments/${id}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  return adaptAssessment(raw);
}

// ── AI Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  role: string;
}

export async function sendClinicianChat(messages: ChatMessage[], patientContext?: string): Promise<ChatResponse> {
  return requestJson<ChatResponse>("/api/v1/chat/clinician", {
    method: "POST",
    headers: { ...getAuthorizationHeader("clinician"), "Content-Type": "application/json" },
    body: JSON.stringify({ messages, patient_context: patientContext ?? null }),
  });
}

export async function sendPatientChat(messages: ChatMessage[]): Promise<ChatResponse> {
  return requestJson<ChatResponse>("/api/v1/chat/patient", {
    method: "POST",
    headers: { ...getAuthorizationHeader("guest"), "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

// ── Internal adapters ──────────────────────────────────────────────────────────

interface RawPatient {
  id: string; clinician_id: string; first_name: string; last_name: string;
  dob: string | null; email: string | null; phone: string | null; gender: string | null;
  primary_condition: string | null; secondary_conditions: string[];
  primary_modality: string | null; referring_clinician: string | null;
  insurance_provider: string | null; insurance_number: string | null;
  consent_signed: boolean; consent_date: string | null; status: string;
  notes: string | null; created_at: string; updated_at: string;
}

function adaptPatient(r: RawPatient): Patient {
  return {
    id: r.id, clinicianId: r.clinician_id,
    firstName: r.first_name, lastName: r.last_name,
    fullName: `${r.first_name} ${r.last_name}`,
    dob: r.dob, email: r.email, phone: r.phone, gender: r.gender,
    primaryCondition: r.primary_condition,
    secondaryConditions: r.secondary_conditions ?? [],
    primaryModality: r.primary_modality,
    referringClinician: r.referring_clinician,
    insuranceProvider: r.insurance_provider,
    insuranceNumber: r.insurance_number,
    consentSigned: r.consent_signed, consentDate: r.consent_date,
    status: r.status as Patient["status"],
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function toSnakePatient(d: Partial<Omit<Patient, "id" | "clinicianId" | "fullName" | "createdAt" | "updatedAt">>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.firstName !== undefined) out.first_name = d.firstName;
  if (d.lastName !== undefined) out.last_name = d.lastName;
  if (d.dob !== undefined) out.dob = d.dob;
  if (d.email !== undefined) out.email = d.email;
  if (d.phone !== undefined) out.phone = d.phone;
  if (d.gender !== undefined) out.gender = d.gender;
  if (d.primaryCondition !== undefined) out.primary_condition = d.primaryCondition;
  if (d.secondaryConditions !== undefined) out.secondary_conditions = d.secondaryConditions;
  if (d.primaryModality !== undefined) out.primary_modality = d.primaryModality;
  if (d.referringClinician !== undefined) out.referring_clinician = d.referringClinician;
  if (d.insuranceProvider !== undefined) out.insurance_provider = d.insuranceProvider;
  if (d.insuranceNumber !== undefined) out.insurance_number = d.insuranceNumber;
  if (d.consentSigned !== undefined) out.consent_signed = d.consentSigned;
  if (d.consentDate !== undefined) out.consent_date = d.consentDate;
  if (d.status !== undefined) out.status = d.status;
  if (d.notes !== undefined) out.notes = d.notes;
  return out;
}

interface RawSession {
  id: string; patient_id: string; clinician_id: string; scheduled_at: string;
  duration_minutes: number; modality: string | null; protocol_ref: string | null;
  session_number: number | null; total_sessions: number | null; status: string;
  outcome: string | null; session_notes: string | null; adverse_events: string | null;
  billing_code: string | null; billing_status: string; created_at: string; updated_at: string;
}

function adaptSession(r: RawSession): ClinicalSession {
  return {
    id: r.id, patientId: r.patient_id, clinicianId: r.clinician_id,
    scheduledAt: r.scheduled_at, durationMinutes: r.duration_minutes,
    modality: r.modality, protocolRef: r.protocol_ref,
    sessionNumber: r.session_number, totalSessions: r.total_sessions,
    status: r.status as ClinicalSession["status"],
    outcome: r.outcome as ClinicalSession["outcome"],
    sessionNotes: r.session_notes, adverseEvents: r.adverse_events,
    billingCode: r.billing_code,
    billingStatus: r.billing_status as ClinicalSession["billingStatus"],
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

interface RawAssessment {
  id: string; clinician_id: string; patient_id: string | null;
  template_id: string; template_title: string; data: Record<string, unknown>;
  clinician_notes: string | null; status: string; score: string | null;
  created_at: string; updated_at: string;
}

function adaptAssessment(r: RawAssessment): AssessmentRecord {
  return {
    id: r.id, clinicianId: r.clinician_id, patientId: r.patient_id,
    templateId: r.template_id, templateTitle: r.template_title,
    data: r.data ?? {}, clinicianNotes: r.clinician_notes,
    status: r.status as AssessmentRecord["status"],
    score: r.score, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── Telegram ───────────────────────────────────────────────────────────────────

export async function getTelegramLinkCode(): Promise<{ code: string; expires_in_seconds: number }> {
  return requestJson<{ code: string; expires_in_seconds: number }>("/api/v1/telegram/link-code", {
    headers: authHeader(),
  });
}

export async function sendTelegramTest(): Promise<{ sent: boolean }> {
  return requestJson<{ sent: boolean }>("/api/v1/telegram/send-test", {
    method: "POST",
    headers: authHeader(),
  });
}

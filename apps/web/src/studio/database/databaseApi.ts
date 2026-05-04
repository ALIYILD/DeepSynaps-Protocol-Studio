const prefix = () => import.meta.env?.VITE_API_BASE_URL ?? "";

function authHeaders(): HeadersInit {
  try {
    const t = localStorage.getItem("ds_access_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

function jsonHeaders(): HeadersInit {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

const base = () => `${prefix()}/api/v1/studio/eeg-database`;

export type PatientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  dob: string | null;
  externalId?: string | null;
  diagnosis: string | null;
  lastRecordingAt: string | null;
  recordingCount: number;
  status: string;
};

export type PatientCardResponse = {
  patientId: string;
  clinicianId: string;
  profile: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  status: string;
};

export type RecordingRow = {
  id: string;
  patientId: string;
  recordedAt: string | null;
  operatorName: string | null;
  equipment: string | null;
  sampleRateHz: number | null;
  durationSec: number;
  rawStorageKey: string;
  metadata: Record<string, unknown>;
  derivatives: Array<{
    id: string;
    kind: string;
    storageKey: string;
    metadata: Record<string, unknown>;
  }>;
};

export async function fetchPatientList(params: {
  q?: string;
  smart?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: PatientListItem[] }> {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.smart) q.set("smart", params.smart);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const url = `${base()}/patients?${q}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`patients ${res.status}`);
  return res.json() as Promise<{ items: PatientListItem[] }>;
}

export async function fetchPatientCard(patientId: string): Promise<PatientCardResponse> {
  const url = `${base()}/patients/${encodeURIComponent(patientId)}/card`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`card ${res.status}`);
  return res.json() as Promise<PatientCardResponse>;
}

export async function patchPatientProfile(
  patientId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const url = `${base()}/patients/${encodeURIComponent(patientId)}/profile`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ patch }),
  });
  if (!res.ok) throw new Error(`patch profile ${res.status}`);
}

export async function fetchRecordings(patientId: string): Promise<{ recordings: RecordingRow[] }> {
  const url = `${base()}/patients/${encodeURIComponent(patientId)}/recordings`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`recordings ${res.status}`);
  return res.json() as Promise<{ recordings: RecordingRow[] }>;
}

export async function icdSuggestions(q: string): Promise<{ items: { code: string; label: string }[] }> {
  const url = `${base()}/icd/suggestions?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`icd ${res.status}`);
  return res.json() as Promise<{ items: { code: string; label: string }[] }>;
}

export async function importEdf(
  patientId: string,
  file: File,
  operator?: string,
  equipment?: string,
): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  const url = new URL(
    `${base()}/patients/${encodeURIComponent(patientId)}/recordings/import-edf`,
  );
  if (operator) url.searchParams.set("operator_name", operator);
  if (equipment) url.searchParams.set("equipment", equipment);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) throw new Error(`import ${res.status}`);
}

export async function exportRecording(recordingId: string, format: "edf" | "csv" | "json"): Promise<Blob> {
  const url = `${base()}/export/recordings`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ recordingIds: [recordingId], format }),
  });
  if (!res.ok) throw new Error(`export ${res.status}`);
  return res.blob();
}

export async function mergePatients(primaryPatientId: string, duplicatePatientId: string): Promise<void> {
  const url = `${base()}/patients/merge`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ primaryPatientId, duplicatePatientId }),
  });
  if (!res.ok) throw new Error(`merge ${res.status}`);
}

export async function softDeleteRecording(recordingId: string): Promise<void> {
  const url = `${base()}/recordings/${encodeURIComponent(recordingId)}`;
  const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

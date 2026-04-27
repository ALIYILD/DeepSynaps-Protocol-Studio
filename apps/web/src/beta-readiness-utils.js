const SCHEDULE_TYPE_MAP = {
  tdcs: { appointment_type: 'session', modality: 'tdcs', label: 'tDCS' },
  rtms: { appointment_type: 'session', modality: 'rtms', label: 'rTMS' },
  tms: { appointment_type: 'session', modality: 'rtms', label: 'rTMS' },
  nf: { appointment_type: 'session', modality: 'neurofeedback', label: 'Neurofeedback' },
  neurofeedback: { appointment_type: 'session', modality: 'neurofeedback', label: 'Neurofeedback' },
  bio: { appointment_type: 'session', modality: 'biofeedback', label: 'Biofeedback' },
  biofeedback: { appointment_type: 'session', modality: 'biofeedback', label: 'Biofeedback' },
  session: { appointment_type: 'session', modality: null, label: 'Session' },
  assessment: { appointment_type: 'assessment', modality: null, label: 'Assessment' },
  assess: { appointment_type: 'assessment', modality: null, label: 'Assessment' },
  intake: { appointment_type: 'new_patient', modality: null, label: 'Intake' },
  'new-patient': { appointment_type: 'new_patient', modality: null, label: 'Intake' },
  tele: { appointment_type: 'consultation', modality: 'telehealth', label: 'Telehealth' },
  telehealth: { appointment_type: 'consultation', modality: 'telehealth', label: 'Telehealth' },
  mdt: { appointment_type: 'consultation', modality: 'mdt', label: 'MDT' },
  hw: { appointment_type: 'follow_up', modality: 'homework', label: 'Homework' },
  homework: { appointment_type: 'follow_up', modality: 'homework', label: 'Homework' },
  follow_up: { appointment_type: 'follow_up', modality: null, label: 'Follow-up' },
  'follow-up': { appointment_type: 'follow_up', modality: null, label: 'Follow-up' },
  phone: { appointment_type: 'phone', modality: 'phone', label: 'Phone' },
  consultation: { appointment_type: 'consultation', modality: null, label: 'Consultation' },
};

const CLOSED_REFERRAL_STAGES = new Set(['booked', 'dismissed', 'lost']);
const ACTIVE_REFERRAL_STAGES = ['new', 'contacted', 'qualified'];

export function getScheduleTypeSubmission(type) {
  const key = String(type || 'session').trim().toLowerCase();
  return SCHEDULE_TYPE_MAP[key] || SCHEDULE_TYPE_MAP.session;
}

export function buildSchedulingSessionPayload({
  patientId,
  clinicianId,
  type,
  scheduledAt,
  durationMinutes,
  notes = '',
  roomId = null,
  deviceId = null,
}) {
  const mapped = getScheduleTypeSubmission(type);
  const payload = {
    patient_id: patientId,
    clinician_id: clinicianId,
    appointment_type: mapped.appointment_type,
    scheduled_at: scheduledAt,
    duration_minutes: durationMinutes,
  };
  if (mapped.modality) payload.modality = mapped.modality;
  if (notes) payload.session_notes = notes;
  if (roomId) payload.room_id = roomId;
  if (deviceId) payload.device_id = deviceId;
  return payload;
}

export function parsePatientNameForCreate(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const parts = clean.split(' ');
  if (parts.length < 2) return null;
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

export function normalizeReferralLead(lead) {
  const stageRaw = String(lead?.stage || 'new').trim().toLowerCase();
  const stage = ['new', 'contacted', 'qualified', 'booked', 'dismissed', 'lost'].includes(stageRaw)
    ? stageRaw
    : 'new';
  return {
    id: lead?.id,
    name: String(lead?.name || '').trim() || 'Unnamed referral',
    email: lead?.email || '',
    phone: lead?.phone || '',
    source: String(lead?.source || 'referral').trim() || 'referral',
    condition: lead?.condition || '',
    stage,
    notes: lead?.notes || '',
    follow_up: lead?.follow_up || '',
    converted_appointment_id: lead?.converted_appointment_id || null,
    created: String(lead?.created_at || lead?.created || '').slice(0, 10),
    updated: String(lead?.updated_at || lead?.updated || '').slice(0, 10),
  };
}

export function getReferralNextStage(stage) {
  const normalized = normalizeReferralLead({ stage }).stage;
  if (normalized === 'new') return 'contacted';
  if (normalized === 'contacted') return 'qualified';
  return null;
}

export function summarizeReferralLeads(leads, todayIso = new Date().toISOString().slice(0, 10)) {
  const normalized = (leads || []).map(normalizeReferralLead);
  return normalized.reduce((summary, lead) => {
    if (!CLOSED_REFERRAL_STAGES.has(lead.stage)) summary.open += 1;
    if (lead.stage === 'booked') summary.booked += 1;
    if (lead.stage === 'dismissed' || lead.stage === 'lost') summary.closed += 1;
    if (
      !CLOSED_REFERRAL_STAGES.has(lead.stage)
      && lead.follow_up
      && String(lead.follow_up).slice(0, 10) <= todayIso
    ) {
      summary.followUpDue += 1;
    }
    if (ACTIVE_REFERRAL_STAGES.includes(lead.stage)) summary.pipeline += 1;
    return summary;
  }, {
    open: 0,
    booked: 0,
    closed: 0,
    followUpDue: 0,
    pipeline: 0,
  });
}

export function buildReportFallbackContent({
  reportType,
  scope,
  date,
  dataSummary = '',
  clinicianContext = '',
  unavailableReason = 'AI-assisted report generation is currently unavailable.',
}) {
  const lines = [
    String(reportType || 'Clinical Report'),
    `Scope: ${scope || 'Unspecified'}`,
    `Date: ${date || new Date().toLocaleDateString()}`,
    '',
    unavailableReason,
  ];
  if (clinicianContext) {
    lines.push('', 'Clinician context:', clinicianContext);
  }
  if (dataSummary) {
    lines.push('', 'Available source data summary:', dataSummary);
  } else {
    lines.push('', 'No structured source data was available for this report.');
  }
  lines.push('', 'Next steps:', '- Review the source records directly.', '- Regenerate once the AI service is available.');
  return lines.join('\n');
}

export function mergeSavedReports(backendItems, localItems) {
  const backend = (backendItems || []).map((r) => ({
    id: r.id,
    name: r.title || `${r.type || 'clinician'} report`,
    patient: r.patient_id || 'All Patients',
    type: r.type || 'clinician',
    date: String(r.date || r.created_at || '').slice(0, 10),
    status: r.status || 'generated',
    content: r.content || '',
    _source: 'backend',
  }));
  const local = (localItems || []).map((r) => ({ ...r, _source: r._source || 'local' }));
  const byId = new Map();
  backend.forEach((row) => byId.set(row.id, row));
  local.forEach((row) => {
    if (!byId.has(row.id)) byId.set(row.id, row);
  });
  const merged = Array.from(byId.values());
  merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return merged;
}

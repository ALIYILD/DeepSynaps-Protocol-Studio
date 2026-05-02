/**
 * Movement Analyzer demo fixtures — keep separate from `demo-fixtures-analyzers.js`
 * to avoid a circular import with `api.js`.
 */
const _DEMO_NAMES = {
  'demo-pt-samantha-li': 'Samantha Li',
  'demo-pt-marcus-chen': 'Marcus Chen',
  'demo-pt-elena-vasquez': 'Elena Vasquez',
};

/** Demo payload for Movement Analyzer (matches API schema v1). */
export function buildMovementAnalyzerDemoPayload(patientId) {
  const name = _DEMO_NAMES[patientId] || 'Patient';
  const generatedAt = '2026-05-02T12:00:00+00:00';
  return {
    demo: true,
    patient_id: patientId,
    generated_at: generatedAt,
    schema_version: '1',
    pipeline_version: '0.1.0-demo',
    clinical_disclaimer:
      'Decision-support only. Demo data. Not a substitute for in-person neurological examination.',
    snapshot: {
      as_of: generatedAt,
      phenotype_summary:
        `Demo workspace for ${name}: multimodal movement review combines video-derived proxies, wearable activity, and medication context.`,
      overall_concern: 'stable',
      overall_confidence: 0.62,
      data_completeness: 0.72,
      axes: {
        tremor: { level: 'mild', label: 'Simulated rest tremor band-power elevation', confidence: 0.52 },
        gait: { level: 'indirect', label: 'Cadence stable vs 14-day wearable baseline', confidence: 0.58 },
        bradykinesia: { level: 'not_assessed', label: 'Add finger-tapping task video for decrement metrics', confidence: 0.35 },
        dyskinesia: { level: 'not_assessed', label: 'No excess-movement model run (demo)', confidence: 0.35 },
        posture_balance: { level: 'within_expected', label: 'Posture score from recent video segment', confidence: 0.55 },
        activity: { level: 'moderate', label: 'Avg 4.9k steps/day (demo series)', confidence: 0.58 },
      },
    },
    signal_sources: [
      {
        source_id: 'demo-video',
        source_modality: 'video',
        passive_vs_elicited: 'elicited',
        last_received_at: '2026-04-29T14:18:00Z',
        completeness_0_1: 0.75,
        qc_flags: [],
        confidence: 0.6,
        upstream_analyzer: 'video_assessment_demo',
        upstream_entity_ids: ['demo-video-session'],
      },
      {
        source_id: 'demo-wearable',
        source_modality: 'wearable',
        passive_vs_elicited: 'passive',
        last_received_at: '2026-05-01T06:00:00Z',
        completeness_0_1: 0.7,
        qc_flags: [],
        confidence: 0.58,
        upstream_analyzer: 'wearable_daily_summaries',
        upstream_entity_ids: [],
      },
      {
        source_id: 'demo-clinician',
        source_modality: 'clinician',
        passive_vs_elicited: 'passive',
        completeness_0_1: 0.85,
        qc_flags: [],
        confidence: 0.75,
        upstream_analyzer: 'patient_chart',
        upstream_entity_ids: [],
      },
    ],
    domains: {
      gait: [
        {
          domain: 'gait',
          metric_key: 'steps_per_day_avg',
          value: 4900,
          unit: 'steps/d',
          severity_or_direction: 'neutral',
          confidence: 0.55,
          completeness: 0.65,
          timestamp: generatedAt,
          note: 'Demo: spatiotemporal gait from instrumented tests would refine this.',
        },
      ],
      tremor: [
        {
          domain: 'tremor',
          metric_key: 'dominant_frequency_hz',
          value: 5.2,
          unit: 'Hz',
          severity_or_direction: 'worse',
          confidence: 0.5,
          completeness: 0.45,
          timestamp: generatedAt,
        },
      ],
      posture_balance: [
        {
          domain: 'posture_balance',
          metric_key: 'posture_score_vc_proxy',
          value: 68,
          unit: 'score_0_100',
          severity_or_direction: 'better',
          confidence: 0.55,
          completeness: 0.6,
          timestamp: generatedAt,
        },
      ],
      activity_patterns: [
        {
          domain: 'activity_patterns',
          metric_key: 'wearable_steps_14d_avg',
          value: 4900,
          unit: 'steps/d',
          severity_or_direction: 'moderate',
          confidence: 0.58,
          completeness: 0.62,
          timestamp: generatedAt,
        },
      ],
    },
    baseline: {
      patient_id: patientId,
      established_at: '2026-04-01T00:00:00Z',
      window_used: { start: '2026-03-15T00:00:00Z', end: '2026-04-15T00:00:00Z' },
      method: 'demo_trailing_median',
      confidence: 0.45,
      per_domain: {
        activity_patterns: { mean: 4700, spread: 900, n_windows: 12 },
        gait: { mean: 1.12, spread: 0.08, n_windows: 12 },
      },
    },
    deviations: [
      {
        event_id: 'demo-dev-1',
        detected_at: '2026-04-28T08:00:00Z',
        domain: 'tremor',
        direction: 'above_baseline',
        magnitude: 0.18,
        confidence: 0.48,
        severity: 'mild',
        urgency: 'monitor',
      },
    ],
    flags: [
      {
        flag_id: 'demo-flag-trend',
        category: 'possible_fluctuation',
        title: 'Possible motor fluctuation pattern (demo)',
        detail: 'Tremor proxy elevated mid-day vs morning — correlate with dose timing if applicable.',
        confidence: 0.42,
        urgency: 'monitor',
        movement_domain: 'tremor',
        source_modalities: ['video', 'wearable'],
        evidence_link_ids: ['evidence-fluctuation'],
        linked_analyzers_impacted: ['medication-analyzer', 'video-assessments'],
      },
    ],
    recommendations: [
      {
        id: 'rec-demo-1',
        kind: 'review_video',
        rationale: 'Repeat structured gait/tremor tasks if symptoms change — demo recommendation.',
        priority: 'P1',
        confidence: 0.65,
        evidence_link_ids: ['evidence-gait-digital'],
      },
    ],
    evidence_links: [
      {
        id: 'evidence-fluctuation',
        source_type: 'literature',
        title: 'Motor fluctuations and wearable measures',
        snippet: 'Real-world sensors can track fluctuations; interpretation requires clinical timing context.',
        strength: 'moderate',
        confidence: 0.5,
        related_flag_ids: ['demo-flag-trend'],
      },
      {
        id: 'evidence-gait-digital',
        source_type: 'literature',
        title: 'Digital gait and mobility metrics',
        snippet: 'Marker-free video and wearables can support longitudinal review alongside examination.',
        strength: 'moderate',
        confidence: 0.62,
        related_flag_ids: [],
      },
    ],
    multimodal_links: [
      { analyzer_id: 'video-assessments', label: 'Video Analyzer', relation: 'kinematic_tasks', entity_ids: [] },
      { analyzer_id: 'wearables', label: 'Biometrics', relation: 'activity_and_physiology', entity_ids: [] },
      { analyzer_id: 'medication-analyzer', label: 'Medication', relation: 'dosing_and_interactions', entity_ids: [] },
      { analyzer_id: 'treatment-sessions-analyzer', label: 'Sessions', relation: 'therapy_context', entity_ids: [] },
      { analyzer_id: 'risk-analyzer', label: 'Risk', relation: 'falls_and_deterioration', entity_ids: [] },
      { analyzer_id: 'assessments-v2', label: 'Assessments', relation: 'clinical_scales', entity_ids: [] },
    ],
    completeness: {
      overall: 0.72,
      by_domain: {
        gait: 0.65,
        tremor: 0.45,
        bradykinesia: 0.3,
        dyskinesia: 0.28,
        posture_balance: 0.6,
        freezing_immobility: 0.25,
        fine_motor: 0.28,
        activity_patterns: 0.62,
      },
    },
    linked_analyzers_impacted: ['video-assessments', 'wearables', 'medication-analyzer'],
    clinical_interpretation: {
      hypotheses: [
        {
          kind: 'possible_fatigue_or_fluctuation',
          statement: 'Mid-day tremor proxy elevation may reflect timing, fatigue, or medication effect — confirm clinically.',
          confidence: 0.42,
          caveat: 'Demo scenario; not a diagnosis.',
        },
      ],
      summary:
        'Use this page to synthesise movement-related signals across modalities. Interpret with examination and patient history.',
    },
    audit_tail: [],
  };
}

export function movementDemoAudit(patientId) {
  return {
    patient_id: patientId,
    items: [
      {
        id: 'demo-audit-1',
        patient_id: patientId,
        action: 'view',
        actor_id: 'demo-clinician',
        created_at: '2026-05-02T09:00:00Z',
        detail: {},
      },
    ],
  };
}

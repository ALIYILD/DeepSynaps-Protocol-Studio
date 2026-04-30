import { api } from './api.js';

export function emptyPatientEvidenceContext(patientId = '') {
  return {
    live: false,
    patientId,
    overview: null,
    reports: [],
    reportCount: 0,
    savedCitationCount: 0,
    highlightCount: 0,
    contradictionCount: 0,
    reportCitationCount: 0,
    phenotypeTags: [],
    latestReport: null,
  };
}

export async function loadPatientEvidenceContext(patientId, { reports = null, fetchReports = false } = {}) {
  const base = emptyPatientEvidenceContext(patientId);
  if (!patientId) {
    const safeReports = Array.isArray(reports) ? reports : [];
    return {
      ...base,
      reports: safeReports,
      reportCount: safeReports.length,
      latestReport: safeReports[0] || null,
    };
  }

  const shouldFetchReports = fetchReports || !Array.isArray(reports);
  const [overviewRes, reportsRes] = await Promise.allSettled([
    api.evidencePatientOverview?.(patientId),
    shouldFetchReports ? api.listReports?.(patientId) : Promise.resolve(reports || []),
  ]);

  const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : null;
  const safeReports = reportsRes.status === 'fulfilled' && Array.isArray(reportsRes.value)
    ? reportsRes.value
    : (Array.isArray(reports) ? reports : []);
  const latestReport = safeReports[0] || null;

  return {
    ...base,
    live: !!overview || safeReports.length > 0,
    overview,
    reports: safeReports,
    reportCount: safeReports.length,
    savedCitationCount: Array.isArray(overview?.saved_citations) ? overview.saved_citations.length : 0,
    highlightCount: Array.isArray(overview?.highlights) ? overview.highlights.length : 0,
    contradictionCount: Array.isArray(overview?.contradictory_findings) ? overview.contradictory_findings.length : 0,
    reportCitationCount: Array.isArray(overview?.evidence_used_in_report) ? overview.evidence_used_in_report.length : 0,
    phenotypeTags: Array.isArray(overview?.compare_with_literature_phenotype?.matched_tags)
      ? overview.compare_with_literature_phenotype.matched_tags
      : [],
    latestReport,
  };
}

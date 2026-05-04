/**
 * Client-side helpers for BIDS trial_type → event_id_map (ERP).
 * Kept in a small module for unit tests without the full qeeg page bundle.
 */

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve BIDS upload metadata for the ERP tab: session upload wins; else persisted analysis summary.
 * @param {string} erpAnalysisId
 * @param {{ id?: string, advanced_analyses?: object } | null} currentAnalysis
 * @param {{ analysisId?: string, row_count?: number, trial_types?: string[], warnings?: string[], normalized?: boolean, sidecar_ref?: string, bytes_written?: number, uploaded_at?: string } | null | undefined} sessionUpload
 */
export function erpResolveBidsUploadMeta(erpAnalysisId, currentAnalysis, sessionUpload) {
  const sid = erpAnalysisId;
  if (sessionUpload && sessionUpload.analysisId === sid) {
    return sessionUpload;
  }
  const adv =
    currentAnalysis && currentAnalysis.id === sid && currentAnalysis.advanced_analyses;
  const summ = adv && adv.erp && adv.erp.bids_upload_summary;
  if (summ) {
    return {
      analysisId: sid,
      row_count: summ.row_count,
      trial_types: summ.trial_types || [],
      warnings: summ.warnings || [],
      normalized: !!summ.normalized,
      sidecar_ref: summ.sidecar_ref,
      bytes_written: summ.bytes_written,
      uploaded_at: summ.uploaded_at,
    };
  }
  return null;
}

/**
 * HTML for the BIDS sidecar summary card (matches ERP tab rendering).
 * @param {NonNullable<ReturnType<typeof erpResolveBidsUploadMeta>>} bm
 */
export function erpFormatBidsSummaryHtml(bm) {
  if (!bm) {
    return (
      '<p data-testid="qeeg-erp-bids-summary-empty" style="font-size:13px;color:var(--text-secondary)">Upload a BIDS sidecar above to see row counts and detected <code>trial_type</code> values.</p>'
    );
  }
  const wlist =
    bm.warnings && bm.warnings.length
      ? '<ul data-testid="qeeg-erp-bids-warnings-list" style="margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--text-secondary)">' +
        bm.warnings
          .map(function (w) {
            return '<li>' + esc(w) + '</li>';
          })
          .join('') +
        '</ul>'
      : '';
  const tt = (bm.trial_types || [])
    .map(function (t) {
      return '<code>' + esc(String(t)) + '</code>';
    })
    .join(', ');
  return (
    '<div data-testid="qeeg-erp-bids-summary">' +
    '<div style="font-size:13px"><strong>Rows:</strong> ' +
    esc(String(bm.row_count != null ? bm.row_count : '?')) +
    '</div>' +
    '<div style="font-size:13px;margin-top:6px"><strong>Detected trial_type:</strong> <span data-testid="qeeg-erp-bids-trial-types">' +
    (tt || '<em>none</em>') +
    '</span></div>' +
    '<div style="font-size:13px;margin-top:6px"><strong>Normalization:</strong> ' +
    (bm.normalized ? 'on (trim/case per upload)' : 'off (strict)') +
    '</div>' +
    (bm.sidecar_ref
      ? '<div style="font-size:12px;margin-top:6px;color:var(--text-secondary)" data-testid="qeeg-erp-bids-sidecar-ref"><strong>Stored sidecar:</strong> <code>' +
        esc(String(bm.sidecar_ref)) +
        '</code></div>'
      : '') +
    (bm.uploaded_at
      ? '<div style="font-size:12px;margin-top:6px;color:var(--text-secondary)"><strong>Last upload (server):</strong> ' +
        esc(String(bm.uploaded_at)) +
        '</div>'
      : '') +
    wlist +
    '</div>'
  );
}

/**
 * @param {Array<{ conditionKey?: string, code?: string|number }>} rows
 * @returns {Record<string, number>}
 */
export function erpApplyTrialMappingRows(rows) {
  const o = {};
  if (!Array.isArray(rows)) return o;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object') continue;
    const k = String(r.conditionKey != null ? r.conditionKey : '').trim();
    const c = parseInt(String(r.code), 10);
    if (k && !Number.isNaN(c)) o[k] = c;
  }
  return o;
}

/**
 * Non-blocking checks before ERP run when a BIDS sidecar listed trial_types.
 * @param {string[]} sidecarTrialTypes
 * @param {Record<string, number>} eventIdMap
 * @returns {string[]}
 */
export function erpValidateEventMapping(sidecarTrialTypes, eventIdMap) {
  const warnings = [];
  const tt = Array.isArray(sidecarTrialTypes)
    ? sidecarTrialTypes.filter(function (x) {
      return x != null && String(x).length > 0;
    })
    : [];
  const map =
    eventIdMap && typeof eventIdMap === 'object' && !Array.isArray(eventIdMap) ? eventIdMap : {};
  const keys = Object.keys(map);

  if (tt.length > 0 && keys.length === 0) {
    warnings.push(
      'event_id_map is empty while the last BIDS upload listed trial_types. Add matching keys or use explicit events / stim channel.'
    );
  }

  for (let i = 0; i < tt.length; i++) {
    const t = String(tt[i]);
    if (!Object.prototype.hasOwnProperty.call(map, t)) {
      warnings.push('Sidecar trial_type "' + t + '" has no matching key in event_id_map.');
    }
  }

  for (let j = 0; j < keys.length; j++) {
    const k = keys[j];
    if (tt.indexOf(k) === -1) {
      warnings.push('event_id_map key "' + k + '" was not among detected sidecar trial_types.');
    }
  }

  return warnings;
}

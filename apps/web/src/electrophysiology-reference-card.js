function _esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _chip(label, fg, bg) {
  return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:10px;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font-weight:700;letter-spacing:.02em">${_esc(label)}</span>`;
}

function _statusBg(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'catalogued') return 'rgba(74,158,255,.10)';
  if (s === 'registered') return 'rgba(74,158,255,.12)';
  if (s === 'healthy') return 'rgba(0,212,188,.10)';
  if (s === 'degraded') return 'rgba(255,181,71,.12)';
  if (s === 'disabled') return 'rgba(255,255,255,.06)';
  return 'rgba(255,255,255,.06)';
}

function _statusFg(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'catalogued' || s === 'registered') return 'var(--blue)';
  if (s === 'healthy') return 'var(--teal)';
  if (s === 'degraded') return 'var(--amber)';
  if (s === 'disabled') return 'var(--text-tertiary)';
  return 'var(--text-tertiary)';
}

export function renderElectrophysiologyReferenceCard(inventory = {}, search = null) {
  const adapters = Array.isArray(inventory.adapters) ? inventory.adapters : [];
  const statuses = adapters.reduce((acc, row) => {
    const key = String(row.lifecycle_state || row.status || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const matches = Array.isArray(search?.matching_reference_datasets) ? search.matching_reference_datasets : [];
  const query = search?.query || {};
  const disclaimer = search?.decision_support_disclaimer
    || inventory?.decision_support_disclaimer
    || 'Decision support only. Not diagnostic. Clinician review required.';

  const statusChips = Object.keys(statuses).length
    ? Object.entries(statuses).map(([status, count]) => _chip(`${count} ${status}`, _statusFg(status), _statusBg(status))).join('')
    : _chip('No catalog data', 'var(--text-tertiary)', 'rgba(255,255,255,.06)');

  const sourceCards = adapters.length
    ? adapters.map((row) => {
        const status = row.lifecycle_state || row.status || 'unknown';
        return `
          <div style="padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${_esc(row.dataset_name || row.source || row.source_id)}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${_esc(row.modality || 'EEG')} · ${_esc(row.recording_condition || 'unknown')}</div>
          </div>
          ${_chip(status, _statusFg(status), _statusBg(status))}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin-top:8px">${_esc(row.clinical_utility || '')}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin-top:8px">${_esc(row.population_context || '')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              ${_chip(row.access_type || 'unknown', 'var(--text-secondary)', 'rgba(255,255,255,.06)')}
              ${_chip(row.dataset_type || 'dataset', 'var(--blue)', 'rgba(74,158,255,.10)')}
              ${row.warnings && row.warnings.length ? _chip(`${row.warnings.length} warning${row.warnings.length > 1 ? 's' : ''}`, 'var(--amber)', 'rgba(255,181,71,.10)') : ''}
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5;margin-top:8px;border-top:1px solid var(--border);padding-top:6px">
              <div>${_esc(row.source_url || '')}</div>
            </div>
          </div>`;
      }).join('')
    : `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:var(--text-tertiary);font-size:12px">No electrophysiology sources are catalogued yet.</div>`;

  const matchCards = matches.length
    ? matches.slice(0, 4).map((row) => {
        return `
          <div style="padding:12px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${_esc(row.dataset_name || row.source || row.source_id)}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${_esc(row.match_reason || 'reference context')}</div>
              </div>
              ${_chip(`${Number(row.match_score || 0)} score`, 'var(--teal)', 'rgba(0,212,188,.10)')}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              ${_chip(row.modality || 'EEG', 'var(--blue)', 'rgba(74,158,255,.10)')}
              ${_chip(row.recording_condition || 'unknown', 'var(--text-tertiary)', 'rgba(255,255,255,.06)')}
              ${row.frequency_band ? _chip(row.frequency_band, 'var(--violet, #8b5cf6)', 'rgba(139,92,246,.10)') : ''}
            </div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin-top:8px">${_esc((row.limitations || []).join(' · '))}</div>
          </div>`;
      }).join('')
    : `<div style="padding:14px;border:1px dashed var(--border);border-radius:12px;color:var(--text-tertiary);font-size:12px">No reference matches returned for this query.</div>`;

  const querySummary = Object.values(query).filter(Boolean).map((v) => _esc(v)).join(' · ') || 'reference catalog context';

  return `
    <section style="margin-top:18px;padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card)">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);font-family:var(--font-display)">Electrophysiology reference datasets</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Decision support only. Not diagnostic. Not a treatment recommendation. External EEG datasets may not be clinical normative references.</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${statusChips}</div>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:8px">Query context: ${querySummary}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:12px">
        ${sourceCards}
      </div>
      <div style="margin-top:14px;padding:12px;border-radius:12px;border:1px solid rgba(255,181,71,.20);background:rgba(255,181,71,.06);font-size:11.5px;line-height:1.55;color:var(--text-secondary)">
        ${_esc(disclaimer)}
      </div>
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:8px">Reference search matches</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
          ${matchCards}
        </div>
      </div>
    </section>`;
}

export default renderElectrophysiologyReferenceCard;

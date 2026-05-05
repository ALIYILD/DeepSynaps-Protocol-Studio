/**
 * Biomarkers page — combines Neuro-Biomarker Reference catalog with
 * patient-linked biomarker workspace. Two tabs: Reference and Patient Workspace.
 */
import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';
import { NEURO_BIOMARKER_REFERENCE } from './neuro-biomarker-data.js';
import { renderBrainMap10_20, SITES_10_20 } from './brain-map-svg.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _patientLabel(p) {
  if (!p) return '';
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (p.name) return String(p.name);
  if (p.display_name) return String(p.display_name);
  return String(p.id || '');
}

function _fmtShortDate(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString();
}

function _statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'critical') {
    return '<span class="pill" style="background:rgba(255,107,107,0.16);color:var(--red);border:1px solid rgba(255,107,107,0.32);font-weight:700">Needs review</span>';
  }
  if (s === 'high' || s === 'low') {
    return '<span class="pill" style="background:rgba(255,176,87,0.14);color:var(--amber)">Out of range</span>';
  }
  if (s === 'normal') {
    return '<span class="pill pill-active">In range</span>';
  }
  return '<span class="pill pill-inactive">\u2014</span>';
}

/**
 * Flatten lab panels to sortable rows (exported for unit tests).
 */
export function flattenLabResults(profile) {
  const panels = Array.isArray(profile?.panels) ? profile.panels : [];
  const out = [];
  for (const pn of panels) {
    const name = pn?.name || 'Panel';
    const results = Array.isArray(pn?.results) ? pn.results : [];
    for (const r of results) {
      const refLo = r.ref_low;
      const refHi = r.ref_high;
      const ref = refLo != null && refHi != null ? `${refLo}\u2013${refHi}` : '\u2014';
      out.push({
        panel: name,
        analyte: r.analyte || '\u2014',
        value: r.value,
        unit: r.unit || '',
        ref,
        status: r.status || '',
        captured_at: r.captured_at || profile?.captured_at || '',
      });
    }
  }
  return out;
}

export function isStale(iso, staleDays = 90) {
  if (!iso) return { stale: true, days: null, reason: 'no date' };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { stale: true, days: null, reason: 'invalid date' };
  const days = (Date.now() - t) / (86400 * 1000);
  return { stale: days > staleDays, days: Math.floor(days), reason: null };
}

function _downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function _setPatientContext(patientId) {
  if (!patientId) return;
  try {
    window._selectedPatientId = patientId;
    window._profilePatientId = patientId;
    sessionStorage.setItem('ds_pat_selected_id', patientId);
  } catch { /* ignore */ }
}

// ── Neuro-Biomarker Reference rendering helpers ──────────────────────────────

const _BAND_MAP = {
  'delta': { freq: 2, amp: 0.9, label: 'Delta 0.5-4 Hz' },
  'theta': { freq: 4, amp: 0.75, label: 'Theta 4-8 Hz' },
  'alpha': { freq: 10, amp: 0.7, label: 'Alpha 8-13 Hz' },
  'beta':  { freq: 20, amp: 0.5, label: 'Beta 13-30 Hz' },
  'gamma': { freq: 40, amp: 0.35, label: 'Gamma 30-100 Hz' },
  'smr':   { freq: 13, amp: 0.55, label: 'SMR 12-15 Hz' },
  'mu':    { freq: 10, amp: 0.6, label: 'Mu 8-13 Hz' },
  'erp':   { freq: 8, amp: 0.8, label: 'ERP waveform' },
  'hrv':   { freq: 1, amp: 0.85, label: 'Heart rate' },
  'sleep': { freq: 3, amp: 0.8, label: 'Sleep cycle' },
  'bio':   { freq: 0.5, amp: 0.6, label: 'Biomarker level' },
  'cog':   { freq: 6, amp: 0.65, label: 'Cognitive task' },
  'tms':   { freq: 15, amp: 0.7, label: 'TMS-EEG' },
};

const _validSiteIds = new Set(SITES_10_20.map(s => s.id));

function _parseSites(siteStr) {
  if (!siteStr) return [];
  const tokens = siteStr.match(/\b[A-Z][a-z0-9]{1,3}\b/g) || [];
  return tokens.filter(t => _validSiteIds.has(t));
}

function _guessBand(marker, group) {
  const n = (marker.name + ' ' + marker.notation + ' ' + marker.id).toLowerCase();
  if (group.id === 'autonomic-cardiac') return 'hrv';
  if (group.id === 'sleep-architecture') return 'sleep';
  if (group.id === 'inflammatory-endocrine') return 'bio';
  if (group.id === 'cognitive-behavioral') return 'cog';
  if (group.id === 'tms-eeg') return 'tms';
  if (group.id === 'erp') return 'erp';
  if (n.includes('delta')) return 'delta';
  if (n.includes('theta')) return 'theta';
  if (n.includes('alpha') || n.includes('iaf') || n.includes('paf') || n.includes('faa')) return 'alpha';
  if (n.includes('gamma')) return 'gamma';
  if (n.includes('smr') || n.includes('sensorimotor')) return 'smr';
  if (n.includes('mu')) return 'mu';
  if (n.includes('beta') || n.includes('tbr')) return 'beta';
  if (n.includes('erp') || n.includes('p300') || n.includes('n200') || n.includes('mmn')) return 'erp';
  return 'alpha';
}

function _miniWaveformSvg(marker, group) {
  const band = _BAND_MAP[_guessBand(marker, group)];
  const w = 120, h = 48, pad = 4;
  const color = group.tone;
  const points = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = pad + t * (w - 2 * pad);
    const wave = Math.sin(t * band.freq * Math.PI) * band.amp;
    const noise = Math.sin(t * 47) * 0.08 + Math.sin(t * 23) * 0.05;
    const y = h / 2 - (wave + noise) * (h / 2 - pad);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
    <defs><linearGradient id="wg-${marker.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <polyline points="${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}" fill="url(#wg-${marker.id})" stroke="none"/>
    <line x1="${pad}" y1="${h / 2}" x2="${w - pad}" y2="${h / 2}" stroke="${color}" stroke-width="0.3" stroke-dasharray="2,3" opacity="0.3"/>
  </svg>`;
}

function _renderBiomarkerViz(marker, group) {
  const sites = _parseSites(marker.site);
  if (sites.length > 0) {
    const svg = renderBrainMap10_20({
      highlightSites: sites,
      showZones: true,
      showEarsAndNose: true,
      size: 260,
    });
    return `
      <div style="flex-shrink:0;text-align:center">
        ${svg}
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:8px">
          Sites: ${sites.join(', ')}
        </div>
      </div>`;
  }
  return `
    <div style="flex-shrink:0;width:260px;padding:20px;border-radius:14px;background:${group.tone}0a;border:1px solid ${group.tone}22;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px">
      <div style="font-size:48px;margin-bottom:12px;opacity:0.6">&#x1F9EC;</div>
      <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Measurement Type</div>
      <div style="font-size:13px;color:var(--text-primary);font-weight:600">${group.title}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:8px;line-height:1.6">${marker.site}</div>
    </div>`;
}

function _openBiomarkerModal(marker, group) {
  document.getElementById('nb-detail-overlay')?.remove();
  const viz = _renderBiomarkerViz(marker, group);

  const overlayEl = document.createElement('div');
  overlayEl.id = 'nb-detail-overlay';
  overlayEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)';

  overlayEl.innerHTML = `
    <div style="background:var(--card-bg, #1e293b);border:1px solid var(--border);border-radius:14px;width:100%;max-width:780px;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.5)">
      <div style="position:sticky;top:0;z-index:1;padding:20px 24px 16px;background:var(--card-bg, #1e293b);border-bottom:1px solid var(--border);border-radius:14px 14px 0 0">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
              <span style="font-size:10px;padding:3px 10px;border-radius:999px;background:${group.tone}18;color:${group.tone};letter-spacing:.08em;text-transform:uppercase;font-weight:600">${group.title}</span>
              <span style="font-size:10px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,0.04);color:var(--text-tertiary);border:1px solid var(--border)">${marker.evidence}</span>
            </div>
            <div style="font-size:22px;font-weight:700;color:var(--text-primary);line-height:1.2">${marker.name}</div>
            <div style="font-size:12px;color:var(--text-tertiary);font-family:var(--font-mono, monospace);margin-top:6px">${marker.notation}</div>
          </div>
          <button id="nb-modal-close" style="background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:16px;color:var(--text-tertiary);line-height:1;padding:6px 10px;flex-shrink:0;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='none'">&times;</button>
        </div>
      </div>
      <div style="padding:20px 24px 24px">
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:20px">
          ${viz}
          <div style="flex:1;min-width:240px;display:grid;gap:10px">
            <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid var(--border)">
              <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Site / Montage</div>
              <div style="font-size:12px;color:var(--text-primary);line-height:1.6">${marker.site}</div>
            </div>
            <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid var(--border)">
              <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Reference Range</div>
              <div style="font-size:12px;color:var(--text-primary);line-height:1.6">${marker.refRange}</div>
            </div>
            <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.025);border:1px solid var(--border)">
              <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Acquisition Protocol</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${marker.acquisition}</div>
            </div>
          </div>
        </div>
        <div style="padding:16px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);margin-bottom:16px">
          <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Clinical Description</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.75">${marker.measures}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
          <div style="padding:16px;border-radius:14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.18)">
            <div style="font-size:10px;color:#fca5a5;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-weight:600">Elevated / Increased</div>
            <div style="font-size:12px;color:var(--text-primary);line-height:1.7">${marker.elevated}</div>
          </div>
          <div style="padding:16px;border-radius:14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.18)">
            <div style="font-size:10px;color:#86efac;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-weight:600">Reduced / Lower</div>
            <div style="font-size:12px;color:var(--text-primary);line-height:1.7">${marker.reduced}</div>
          </div>
        </div>
        ${marker.conditions?.length ? `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Linked Conditions</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${marker.conditions.map(c => `<span style="font-size:11px;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-primary);cursor:pointer;transition:background .15s,border-color .15s" onmouseover="this.style.background='rgba(74,158,255,0.12)';this.style.borderColor='rgba(74,158,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='var(--border)'" onclick="document.getElementById('nb-detail-overlay')?.remove();document.body.style.overflow='';window._bmRefSearch&&window._bmRefSearch('${c.replace(/'/g, "\\'")}')">${c}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${marker.interventions?.length ? `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Modulating Interventions</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${marker.interventions.map(i => `<span style="font-size:11px;padding:5px 12px;border-radius:999px;background:rgba(20,184,166,0.08);border:1px solid rgba(20,184,166,0.16);color:var(--teal)">${i}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${marker.caveats?.length ? `
          <div style="padding:16px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);margin-bottom:16px">
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Caveats</div>
            <ul style="margin:0;padding-left:18px;color:var(--text-secondary);font-size:12px;line-height:1.8">
              ${marker.caveats.map(c => `<li>${c}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div style="padding:14px 16px;border-radius:12px;background:${group.tone}0a;border:1px solid ${group.tone}22;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Evidence References</div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${marker.evidence}</div>
          </div>
          <div style="font-size:11px;color:${group.tone}">Peer-reviewed literature</div>
        </div>
      </div>
    </div>
  `;

  function _closeModal() {
    overlayEl.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _escHandler);
  }
  function _escHandler(e) { if (e.key === 'Escape') _closeModal(); }

  overlayEl.addEventListener('click', function(e) { if (e.target === overlayEl) _closeModal(); });
  overlayEl.querySelector('#nb-modal-close').addEventListener('click', _closeModal);
  document.addEventListener('keydown', _escHandler);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlayEl);
}

function _renderRefMarkerCard(marker, group, idx) {
  const searchBlob = [
    marker.name, marker.notation, marker.measures, marker.site, marker.refRange,
    marker.acquisition, marker.elevated, marker.reduced,
    ...(marker.conditions || []), ...(marker.interventions || []),
    ...(marker.caveats || []), marker.evidence,
  ].join(' ').toLowerCase();

  const teaser = marker.measures.length > 120 ? marker.measures.slice(0, 120) + '...' : marker.measures;
  const condPills = (marker.conditions || []).slice(0, 3).map(c => `<span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-tertiary)">${c}</span>`).join('');
  const bandInfo = _BAND_MAP[_guessBand(marker, group)];
  const waveform = _miniWaveformSvg(marker, group);
  const sites = _parseSites(marker.site);
  const siteLabel = sites.length > 0 ? sites.slice(0, 3).join(', ') : marker.site.split(/[,(;]/)[0].trim();

  return `
    <article class="card nb-marker" data-search="${searchBlob}" style="margin-bottom:0;border:1px solid rgba(255,255,255,0.07);overflow:hidden;transition:border-color .2s,box-shadow .2s;cursor:pointer"
      onclick="window._openBmRefModal('${group.id}', ${idx})"
      onmouseover="this.style.borderColor='${group.tone}44';this.style.boxShadow='0 0 20px ${group.tone}18'"
      onmouseout="this.style.borderColor='rgba(255,255,255,0.07)';this.style.boxShadow='none'"
    >
      <div style="padding:14px 16px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))">
        <div style="display:flex;gap:14px;align-items:flex-start">
          <div style="flex-shrink:0;width:130px;border-radius:10px;background:${group.tone}08;border:1px solid ${group.tone}18;padding:8px 5px 6px;text-align:center">
            ${waveform}
            <div style="font-size:9px;color:${group.tone};margin-top:4px;letter-spacing:.04em;font-weight:600">${bandInfo.label}</div>
            <div style="font-size:8.5px;color:var(--text-tertiary);margin-top:2px">${siteLabel}</div>
          </div>
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
              <span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:${group.tone}18;color:${group.tone};letter-spacing:.08em;text-transform:uppercase">${group.title}</span>
              <span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.04);color:var(--text-tertiary);border:1px solid var(--border)">${marker.evidence}</span>
            </div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:3px;line-height:1.3">${marker.name}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary);font-family:var(--font-mono, monospace);margin-bottom:6px">${marker.notation}</div>
            <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:6px">${teaser}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${condPills}</div>
          </div>
          <div style="color:${group.tone};font-size:14px;line-height:1;flex-shrink:0;margin-top:4px;opacity:0.6">&rarr;</div>
        </div>
      </div>
    </article>`;
}

function _renderRefGroup(group) {
  return `
    <section class="nb-group" data-search="${group.title.toLowerCase()}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--text-primary)">${group.title}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">${group.markers.length} markers</div>
        </div>
        <div style="width:14px;height:14px;border-radius:50%;background:${group.tone};box-shadow:0 0 24px ${group.tone}66"></div>
      </div>
      <div style="display:grid;gap:12px">
        ${group.markers.map((marker, idx) => _renderRefMarkerCard(marker, group, idx)).join('')}
      </div>
    </section>`;
}

function _renderReferenceTab() {
  const totalMarkers = NEURO_BIOMARKER_REFERENCE.reduce((sum, group) => sum + group.markers.length, 0);
  const totalEvidenceAnchors = 6753;

  return `
    <div style="display:grid;gap:22px">
      <section class="card" style="margin-bottom:0;overflow:hidden;background:
        radial-gradient(circle at top right, rgba(74,158,255,0.18), transparent 34%),
        radial-gradient(circle at top left, rgba(0,212,188,0.14), transparent 28%),
        linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))">
        <div class="card-body" style="padding:24px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap">
            <div style="max-width:860px">
              <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--teal);margin-bottom:10px">DeepSynaps Clinical Library</div>
              <h1 style="margin:0 0 10px;font-size:32px;line-height:1.05;letter-spacing:-.03em;color:var(--text-primary)">Neuro-Biomarker Reference</h1>
              <div style="font-size:14px;color:var(--text-secondary);line-height:1.75">
                ${totalMarkers} biomarkers across ${NEURO_BIOMARKER_REFERENCE.length} categories. Structured clinical reference data covering definition, montage/site, acquisition protocol,
                adult reference range, directional interpretation, linked conditions, modulating interventions, and operational caveats.
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:10px;min-width:min(100%,320px)">
              <div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Markers</div>
                <div style="font-size:28px;font-weight:700;color:var(--text-primary)">${totalMarkers}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Categories</div>
                <div style="font-size:28px;font-weight:700;color:var(--text-primary)">${NEURO_BIOMARKER_REFERENCE.length}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">References</div>
                <div style="font-size:28px;font-weight:700;color:var(--text-primary)">${totalEvidenceAnchors.toLocaleString()}</div>
              </div>
              <div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Use</div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.45">Reference and interpretation support</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card" style="margin-bottom:0">
        <div class="card-body" style="padding:18px">
          <div style="margin-bottom:14px">
            <input id="bm-ref-search" class="form-control" style="width:100%;max-width:400px" placeholder="Search markers, conditions, interventions..." oninput="window._bmRefSearch(this.value)">
          </div>
          <div id="nb-search-summary" style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">
            Showing all ${totalMarkers} biomarkers across ${NEURO_BIOMARKER_REFERENCE.length} categories.
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
            ${NEURO_BIOMARKER_REFERENCE.map(group => `
              <div class="nb-summary-card" data-search="${group.title.toLowerCase()}" style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.025);border:1px solid var(--border);cursor:pointer" onclick="window._bmRefSearch('${group.title.split(' ')[0].toLowerCase()}')">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="width:10px;height:10px;border-radius:50%;background:${group.tone}"></span>
                  <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${group.title}</div>
                </div>
                <div style="font-size:11px;color:var(--text-tertiary)">${group.markers.length} markers</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      ${NEURO_BIOMARKER_REFERENCE.map(_renderRefGroup).join('')}
    </div>
  `;
}

function _bindReferenceTab() {
  const totalMarkers = NEURO_BIOMARKER_REFERENCE.reduce((sum, group) => sum + group.markers.length, 0);

  window._openBmRefModal = function(groupId, markerIdx) {
    const group = NEURO_BIOMARKER_REFERENCE.find(g => g.id === groupId);
    if (!group) return;
    const marker = group.markers[markerIdx];
    if (!marker) return;
    _openBiomarkerModal(marker, group);
  };

  window._bmRefSearch = function(query) {
    const q = (query || '').toLowerCase().trim();
    let visibleMarkers = 0;
    let visibleGroups = 0;

    document.querySelectorAll('.nb-marker').forEach(card => {
      const visible = !q || (card.getAttribute('data-search') || '').includes(q);
      card.style.display = visible ? '' : 'none';
      if (visible) visibleMarkers += 1;
    });

    document.querySelectorAll('.nb-group').forEach(group => {
      const hasVisibleChild = !!group.querySelector('.nb-marker:not([style*="display: none"])');
      group.style.display = hasVisibleChild ? '' : 'none';
      if (hasVisibleChild) visibleGroups += 1;
    });

    document.querySelectorAll('.nb-summary-card').forEach(card => {
      const visible = !q || (card.getAttribute('data-search') || '').includes(q);
      card.style.display = visible ? '' : 'none';
    });

    const summary = document.getElementById('nb-search-summary');
    if (summary) {
      summary.textContent = q
        ? `Showing ${visibleMarkers} matching biomarkers across ${visibleGroups} categories.`
        : `Showing all ${totalMarkers} biomarkers across ${NEURO_BIOMARKER_REFERENCE.length} categories.`;
    }

    const inp = document.getElementById('bm-ref-search');
    if (inp && inp.value !== query) inp.value = query;
  };
}

// ── Main page function ───────────────────────────────────────────────────────

export async function pgBiomarkersWorkspace(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Biomarkers',
      subtitle: 'Neuro-biomarker reference & patient workspace',
    });
  } catch {
    try { setTopbar('Biomarkers', 'Neuro-biomarker reference & patient workspace'); } catch { /* ignore */ }
  }

  const el = document.getElementById('content');
  if (!el) return;

  let activeTab = window._bmActiveTab || 'reference';

  // ── Shell with tabs ──
  el.innerHTML = `
    <div style="max-width:1180px;margin:0 auto;padding:16px 20px 56px" data-page="biomarkers">
      <nav id="bm-tabs" style="display:flex;gap:4px;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:0" role="tablist">
        <button role="tab" class="ch-tab${activeTab === 'reference' ? ' ch-tab--active' : ''}" data-tab="reference" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;color:${activeTab === 'reference' ? 'var(--text-primary)' : 'var(--text-tertiary)'};cursor:pointer;border-bottom:2px solid ${activeTab === 'reference' ? 'var(--teal, #2DD4BF)' : 'transparent'};transition:all .15s">Neuro-Biomarker Reference</button>
        <button role="tab" class="ch-tab${activeTab === 'workspace' ? ' ch-tab--active' : ''}" data-tab="workspace" style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;color:${activeTab === 'workspace' ? 'var(--text-primary)' : 'var(--text-tertiary)'};cursor:pointer;border-bottom:2px solid ${activeTab === 'workspace' ? 'var(--teal, #2DD4BF)' : 'transparent'};transition:all .15s">Patient Workspace</button>
      </nav>
      <div id="bm-tab-content">
        <div style="padding:28px;text-align:center;color:var(--text-tertiary)">Loading...</div>
      </div>
    </div>`;

  // ── Patient workspace state ──
  let patients = [];
  let selectedId =
    window._selectedPatientId
    || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ds_pat_selected_id') : '')
    || '';
  let labsProfile = null;
  let labsDemo = false;
  let wearableOut = null;
  let qeegItems = [];
  let mriItems = [];
  let loadErr = null;

  async function loadPatients() {
    try {
      const res = await api.listPatients({ limit: 200 });
      patients = res?.items || (Array.isArray(res) ? res : []) || [];
    } catch {
      patients = [];
    }
    if (!selectedId && patients[0]) selectedId = patients[0].id;
  }

  async function loadPatientData() {
    labsProfile = null;
    wearableOut = null;
    qeegItems = [];
    mriItems = [];
    labsDemo = false;
    loadErr = null;
    if (!selectedId) return;

    let labsRes = null;
    try {
      labsRes = await api.getLabsProfile(selectedId);
    } catch (e) {
      loadErr = (e && e.message) || String(e);
    }
    if (labsRes && labsRes.patient_id) {
      labsProfile = labsRes;
    } else if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.labs?.patient_profile) {
      const demo = ANALYZER_DEMO_FIXTURES.labs.patient_profile(selectedId);
      if (demo) { labsProfile = demo; labsDemo = true; }
    }

    const [wearRes, qeegRes, mriRes] = await Promise.all([
      api.getPatientWearableSummary(selectedId, 30).catch(() => null),
      api.listPatientQEEGAnalyses(selectedId, { limit: 20 }).catch(() => null),
      api.listPatientMRIAnalyses(selectedId).catch(() => null),
    ]);
    wearableOut = wearRes;
    qeegItems = qeegRes?.items || (Array.isArray(qeegRes) ? qeegRes : []) || [];
    mriItems = mriRes?.items || (Array.isArray(mriRes) ? mriRes : []) || [];

    try {
      await api.recordPatientProfileAuditEvent(selectedId, {
        event: 'biomarkers_workspace_view',
        note: 'Biomarkers workspace opened',
        using_demo_data: !!(labsDemo || isDemoSession()),
      });
    } catch { /* best-effort audit */ }
  }

  function renderWorkspaceTab() {
    const container = document.getElementById('bm-tab-content');
    if (!container) return;

    const demoBanner = isDemoSession() && labsDemo ? DEMO_FIXTURE_BANNER_HTML : '';
    const opts = patients.map((p) =>
      `<option value="${esc(p.id)}"${p.id === selectedId ? ' selected' : ''}>${esc(_patientLabel(p))}</option>`
    ).join('');

    let bodyHtml = '';
    if (!selectedId) {
      bodyHtml = `<div style="padding:24px;border:1px dashed var(--border);border-radius:14px;text-align:center;color:var(--text-secondary);font-size:13px">
        Select a patient to review biomarker-linked data. Add patients under <strong>Patients</strong> if your roster is empty.
      </div>`;
    } else {
      const p = patients.find((x) => x.id === selectedId);
      const pname = esc(_patientLabel(p) || selectedId);
      const rows = flattenLabResults(labsProfile);
      const drawIso = labsProfile?.captured_at || '';
      const stale = isStale(drawIso, 90);
      const abnormal = rows.filter((r) => r.status && String(r.status).toLowerCase() !== 'normal');
      const summaries = Array.isArray(wearableOut?.summaries) ? wearableOut.summaries : [];
      const lastWearable = summaries.length ? summaries[summaries.length - 1] : null;
      const wearStale = lastWearable?.date ? isStale(`${lastWearable.date}T12:00:00Z`, 14) : { stale: true, reason: 'no wearable summaries' };
      const readiness = wearableOut?.readiness && typeof wearableOut.readiness === 'object' ? wearableOut.readiness : null;

      bodyHtml = `
        <section aria-labelledby="bm-ctx-h" style="margin-bottom:18px;padding:14px 16px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card)">
          <div id="bm-ctx-h" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:6px">Patient context</div>
          <div style="font-size:15px;font-weight:600;color:var(--text-primary)">${pname}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
            Last lab draw (aggregated): ${_fmtShortDate(drawIso)}
            ${stale.stale ? `<span style="margin-left:8px" class="pill pill-pending">Stale (&gt;90d)</span>` : ''}
            ${!drawIso ? '<span style="margin-left:8px;color:var(--text-tertiary)">No draw date</span>' : ''}
          </div>
          ${loadErr && !labsProfile ? `<div role="alert" style="margin-top:10px;font-size:12px;color:var(--amber)">Could not load live labs (${esc(loadErr)}). ${labsDemo ? 'Showing labelled demo labs.' : 'Use Labs Analyzer or enter results when the API is available.'}</div>` : ''}
        </section>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:18px">
          <section style="padding:14px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px">Data sources</div>
            <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.55">
              <li>Labs: ${rows.length ? `${rows.length} analytes in workspace` : 'No structured labs in this summary'}</li>
              <li>Wearables: ${summaries.length ? `${summaries.length} daily summaries (30d)` : 'No wearable summaries'}</li>
              <li>qEEG analyses: ${qeegItems.length} record(s)</li>
              <li>MRI analyses: ${mriItems.length} record(s)</li>
            </ul>
            ${readiness ? `<div style="margin-top:10px;font-size:11px;color:var(--text-tertiary)">Readiness payload present \u2014 see Biometrics for detail.</div>` : ''}
          </section>
          <section style="padding:14px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px">Wearable / biometrics snapshot</div>
            ${lastWearable ? `
              <div style="font-size:12px;color:var(--text-secondary)">
                Latest day: <strong style="color:var(--text-primary)">${esc(lastWearable.date)}</strong>
                ${wearStale.stale ? '<span class="pill pill-pending" style="margin-left:6px">Stale stream</span>' : ''}
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:11px;color:var(--text-tertiary)">
                ${lastWearable.hrv_ms != null ? `<span>HRV ${esc(String(lastWearable.hrv_ms))} ms</span>` : ''}
                ${lastWearable.rhr_bpm != null ? `<span>Resting HR ${esc(String(lastWearable.rhr_bpm))} bpm</span>` : ''}
                ${lastWearable.sleep_duration_h != null ? `<span>Sleep ${esc(String(lastWearable.sleep_duration_h))} h</span>` : ''}
              </div>
              <button type="button" class="btn btn-ghost btn-sm" id="bm-open-wear" style="margin-top:10px;min-height:40px">Open Biometrics</button>
            ` : `<div style="font-size:12px;color:var(--text-tertiary)">No wearable summary for this patient. Device data may be unavailable or not synced.</div>`}
          </section>
        </div>

        <section style="margin-bottom:18px">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
            <h2 style="margin:0;font-size:14px;font-weight:650;color:var(--text-primary)">Recent laboratory biomarkers</h2>
            <button type="button" class="btn btn-primary btn-sm" id="bm-export" ${rows.length ? '' : 'disabled'} style="min-height:40px">Export summary (JSON)</button>
          </div>
          ${rows.length ? `
            <div style="overflow:auto;border:1px solid var(--border);border-radius:12px">
              <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px">
                <thead>
                  <tr style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary)">
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Panel</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Analyte</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Value</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Ref range</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Status</th>
                    <th style="padding:10px 12px;border-bottom:1px solid var(--border)">Draw</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.slice(0, 24).map((r) => `
                    <tr>
                      <td style="padding:10px 12px;border-bottom:1px solid var(--border)">${esc(r.panel)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:500">${esc(r.analyte)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums">
                        ${r.value == null || r.value === '' ? '\u2014' : esc(String(r.value))}${r.unit ? ` <span style="color:var(--text-tertiary)">${esc(r.unit)}</span>` : ' <span style="color:var(--text-tertiary)">(unit unknown)</span>'}
                      </td>
                      <td style="padding:10px 12px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${esc(r.ref)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid var(--border)">${_statusPill(r.status)}</td>
                      <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary)">${_fmtShortDate(r.captured_at)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            ${rows.length > 24 ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Showing 24 of ${rows.length}. Open Labs Analyzer for the full panel.</div>` : ''}
          ` : `
            <div style="padding:18px;border:1px dashed var(--border);border-radius:12px;font-size:12px;color:var(--text-secondary)">
              No laboratory analytes in this summary. Add results in <strong>Labs Analyzer</strong> or wait for interface ingest.
            </div>`}
        </section>

        <section style="margin-bottom:18px">
          <h2 style="margin:0 0 10px;font-size:14px;font-weight:650;color:var(--text-primary)">Abnormal or out-of-range</h2>
          ${abnormal.length ? `
            <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.55">
              ${abnormal.slice(0, 12).map((r) =>
                `<li><strong style="color:var(--text-primary)">${esc(r.analyte)}</strong> \u2014 requires clinician interpretation (${esc(r.status)})</li>`
              ).join('')}
            </ul>
          ` : `<div style="font-size:12px;color:var(--text-tertiary)">No abnormal flags in parsed labs, or reference intervals missing. Missing intervals are not shown as "normal."</div>`}
        </section>

        <section style="margin-bottom:18px">
          <h2 style="margin:0 0 10px;font-size:14px;font-weight:650;color:var(--text-primary)">Linked modules</h2>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="assessments-v2">Assessments</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="documents-v2">Documents</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="live-session">Virtual Care</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="qeeg-analysis">qEEG</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="mri-analysis">MRI</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="video-assessments">Video</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="text-analyzer">Text</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="deeptwin">DeepTwin</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="protocol-studio">Protocol Studio</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="brainmap-v2">Brain Map</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="schedule-v2">Schedule</button>
            <button type="button" class="btn btn-ghost btn-sm bm-link" data-nav="clinician-inbox">Inbox</button>
          </div>
          <p style="margin:10px 0 0;font-size:11px;color:var(--text-tertiary);max-width:820px">
            Links open the corresponding workspace with this patient selected where supported.
          </p>
        </section>

        <section style="padding:14px;border-radius:14px;border:1px solid var(--border);background:rgba(155,127,255,0.05)">
          <h2 style="margin:0 0 8px;font-size:14px;font-weight:650;color:var(--text-primary)">AI-assisted context</h2>
          <p style="margin:0;font-size:12px;line-height:1.55;color:var(--text-secondary)">
            This page does not auto-generate a biomarker diagnosis or protocol recommendation.
            Use <strong>DeepTwin</strong> or <strong>Labs Analyzer</strong> annotations for draft narratives \u2014 always label AI output as draft until reviewed.
          </p>
        </section>`;
    }

    container.innerHTML = `
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(245,158,11,0.35);background:rgba(245,158,11,0.07);margin-bottom:12px;font-size:12px;line-height:1.5;color:var(--text-secondary)" role="note">
        <strong style="color:var(--text-primary)">Decision-support only.</strong>
        Flags and ranges are heuristic or imported \u2014 confirm against source labs and local reference intervals.
      </div>
      ${demoBanner}
      <div id="bm-ws-toolbar" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary);min-width:220px;flex:1">
          <span>Patient</span>
          <select id="bm-patient-select" class="form-control" style="min-height:40px">
            <option value="">Select a patient...</option>
            ${opts}
          </select>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
          <button type="button" class="btn btn-ghost btn-sm" id="bm-open-profile" ${selectedId ? '' : 'disabled'} style="min-height:40px">Patient profile</button>
          <button type="button" class="btn btn-ghost btn-sm" id="bm-open-labs" ${selectedId ? '' : 'disabled'} style="min-height:40px">Labs Analyzer</button>
        </div>
      </div>
      <div id="bm-ws-body">${bodyHtml}</div>`;

    // Bind workspace events
    container.querySelector('#bm-patient-select')?.addEventListener('change', async (ev) => {
      selectedId = ev.target.value || '';
      _setPatientContext(selectedId);
      const body = document.getElementById('bm-ws-body');
      if (body) body.innerHTML = '<div style="padding:28px;text-align:center;color:var(--text-tertiary)">Loading...</div>';
      await loadPatientData();
      renderWorkspaceTab();
    });
    container.querySelector('#bm-open-profile')?.addEventListener('click', () => {
      if (!selectedId) return;
      _setPatientContext(selectedId);
      navigate('patient-profile');
    });
    container.querySelector('#bm-open-labs')?.addEventListener('click', () => {
      if (!selectedId) return;
      _setPatientContext(selectedId);
      navigate('labs-analyzer');
    });
    container.querySelectorAll('.bm-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-nav');
        if (!id) return;
        _setPatientContext(selectedId);
        navigate(id);
      });
    });
    container.querySelector('#bm-export')?.addEventListener('click', () => {
      const p = patients.find((x) => x.id === selectedId);
      const rows = flattenLabResults(labsProfile);
      const prefix = isDemoSession() ? 'DEMO-' : '';
      _downloadJson(`${prefix}biomarker-summary-${selectedId}.json`, {
        exported_at: new Date().toISOString(),
        patient_id: selectedId,
        patient_name: _patientLabel(p) || null,
        lab_captured_at: labsProfile?.captured_at || null,
        demo_lab_fixture: labsDemo,
        laboratory_rows: rows,
        qeeg_analysis_count: qeegItems.length,
        mri_analysis_count: mriItems.length,
        wearable_summary_days: (Array.isArray(wearableOut?.summaries) ? wearableOut.summaries : []).length,
      });
    });
    container.querySelector('#bm-open-wear')?.addEventListener('click', () => {
      _setPatientContext(selectedId);
      navigate('wearables');
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    window._bmActiveTab = tab;
    const container = document.getElementById('bm-tab-content');
    if (!container) return;

    // Update tab styling
    document.querySelectorAll('#bm-tabs [role="tab"]').forEach(btn => {
      const isActive = btn.getAttribute('data-tab') === tab;
      btn.style.color = isActive ? 'var(--text-primary)' : 'var(--text-tertiary)';
      btn.style.borderBottom = isActive ? '2px solid var(--teal, #2DD4BF)' : '2px solid transparent';
    });

    if (tab === 'reference') {
      container.innerHTML = _renderReferenceTab();
      _bindReferenceTab();
    } else {
      renderWorkspaceTab();
    }
  }

  // ── Bind tab clicks ──
  document.querySelectorAll('#bm-tabs [role="tab"]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  // ── Initial load ──
  await loadPatients();
  _setPatientContext(selectedId);
  await loadPatientData();
  switchTab(activeTab);
}

// DeepTwin TRIBE — additive Compare Protocols panel.
//
// Renders a compact protocol-comparison surface that calls
// POST /api/v1/deeptwin/compare-protocols, then displays:
//   - ranked protocol cards with response probability + confidence
//   - top-driver chips per winner
//   - safety/evidence stamps reused from the rest of the page
//
// Lives outside components.js so the existing renderAll() flow can stay
// intact and the panel is opt-in (presets only — no free-form scenario).

import { api } from '../api.js';

const ESC = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const PRESETS = [
  {
    id: 'A',
    label: 'TMS · 10 Hz · L-DLPFC · 5×/wk · 5w',
    spec: {
      protocol_id: 'A', label: 'TMS 10 Hz L-DLPFC',
      modality: 'tms', target: 'L-DLPFC',
      frequency_hz: 10, sessions_per_week: 5, weeks: 5,
      adherence_assumption_pct: 80,
    },
  },
  {
    id: 'B',
    label: 'tDCS · Fp2 · 2 mA · 5×/wk · 5w',
    spec: {
      protocol_id: 'B', label: 'tDCS Fp2 2 mA',
      modality: 'tdcs', target: 'Fp2', current_ma: 2.0,
      sessions_per_week: 5, weeks: 5,
      adherence_assumption_pct: 80,
    },
  },
  {
    id: 'C',
    label: 'Sleep + behavioural · 4w',
    spec: {
      protocol_id: 'C', label: 'Sleep + behavioural',
      modality: 'behavioural', sessions_per_week: 4, weeks: 4,
      adherence_assumption_pct: 80,
    },
  },
];

function _confidenceChip(conf) {
  const tone = conf === 'high' ? 'ok' : conf === 'moderate' ? 'warn' : 'low';
  return `<span class="dt-chip dt-chip--${tone}">confidence: ${ESC(conf)}</span>`;
}

function _evidenceChip(grade) {
  const tone = grade === 'moderate' ? 'warn' : 'low';
  return `<span class="dt-chip dt-chip--${tone}">evidence: ${ESC(grade)}</span>`;
}

function _driverChips(drivers) {
  if (!drivers?.length) return '';
  return drivers.slice(0, 3).map(d => `
    <span class="dt-chip">${ESC(d.modality)} · ${ESC(d.feature)} ${ESC(d.direction || '')}</span>
  `).join('');
}

function _renderRankingCards(comparison) {
  const ranked = comparison?.ranking || [];
  const candidatesById = Object.fromEntries(
    (comparison?.candidates || []).map(c => [c.protocol?.protocol_id, c])
  );
  if (!ranked.length) return '<div class="dt-empty"><p>No candidates returned.</p></div>';
  return ranked.map(r => {
    const cand = candidatesById[r.protocol_id] || {};
    const heads = cand.heads || {};
    const expl = cand.explanation || {};
    const responseProb = typeof heads.response_probability === 'number'
      ? heads.response_probability.toFixed(2) : '—';
    return `
      <div class="dt-rank-card">
        <div class="dt-rank-head">
          <div class="dt-rank-pos">#${r.rank}</div>
          <div>
            <div class="dt-rank-title">${ESC(r.label || r.protocol_id)}</div>
            <div class="dt-rank-sub">Response probability ${responseProb} · score ${ESC(r.score)}</div>
          </div>
        </div>
        <div class="dt-chip-row">
          ${_confidenceChip(heads.response_confidence || 'low')}
          ${_evidenceChip(expl.evidence_grade || 'low')}
          <span class="dt-chip dt-chip--low">simulation only</span>
          <span class="dt-chip dt-chip--low">requires clinician review</span>
        </div>
        <div class="dt-rank-rationale">${ESC(r.rationale || '')}</div>
        <div class="dt-chip-row">${_driverChips(expl.top_drivers)}</div>
      </div>
    `;
  }).join('');
}

export function renderTribeCompare() {
  const presetCheckboxes = PRESETS.map(p => `
    <label class="dt-preset-row">
      <input type="checkbox" data-preset-id="${ESC(p.id)}" checked />
      <span>${ESC(p.label)}</span>
    </label>
  `).join('');
  return `
    <section class="card dt-section">
      <div class="dt-section-h">
        <h3>Compare protocols (TRIBE-inspired)</h3>
        <span class="dt-section-sub">Multimodal patient latent → ranked protocol candidates with uncertainty + drivers</span>
      </div>
      <div class="dt-tribe-grid">
        <div class="dt-tribe-controls">
          <div class="dt-section-sub" style="margin-bottom:8px">Choose 2-3 protocol presets to compare:</div>
          ${presetCheckboxes}
          <div style="margin-top:10px">
            <label class="dt-section-sub">Horizon:
              <select id="dt-tribe-horizon" class="dt-select" style="margin-left:6px">
                <option value="2">2 weeks</option>
                <option value="6" selected>6 weeks</option>
                <option value="12">12 weeks</option>
              </select>
            </label>
          </div>
          <button id="dt-tribe-run" class="btn btn-primary btn-sm" style="margin-top:12px">Run comparison</button>
          <div id="dt-tribe-status" class="dt-section-sub" style="margin-top:10px"></div>
        </div>
        <div id="dt-tribe-results" class="dt-tribe-results"></div>
      </div>
    </section>
  `;
}

function _selectedPresets() {
  return Array.from(document.querySelectorAll('input[data-preset-id]:checked'))
    .map(i => PRESETS.find(p => p.id === i.dataset.presetId)?.spec)
    .filter(Boolean);
}

export function wireTribeCompare(getPatientId) {
  const btn = document.getElementById('dt-tribe-run');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const status = document.getElementById('dt-tribe-status');
    const out = document.getElementById('dt-tribe-results');
    const patientId = getPatientId();
    if (!patientId) {
      if (status) status.textContent = 'Select a patient first.';
      return;
    }
    const protocols = _selectedPresets();
    if (protocols.length < 2) {
      if (status) status.textContent = 'Pick at least two presets to compare.';
      return;
    }
    const horizon_weeks = parseInt(document.getElementById('dt-tribe-horizon')?.value || '6', 10);
    if (status) status.textContent = `Running ${protocols.length}-way comparison…`;
    if (out) out.innerHTML = '';
    try {
      const resp = await api.deeptwinCompareProtocols({
        patient_id: patientId, protocols, horizon_weeks,
      });
      if (out) out.innerHTML = _renderRankingCards(resp.comparison || {});
      if (status) {
        const top = resp.comparison?.winner || resp.comparison?.ranking?.[0]?.protocol_id || '—';
        const gap = resp.comparison?.confidence_gap ?? 0;
        status.textContent =
          `Top-ranked candidate (exploratory score): ${top} · score gap ${gap}. `
          + 'Not a treatment recommendation — clinician review required.';
      }
    } catch (e) {
      if (status) status.textContent = 'Compare failed: ' + (e.message || e);
    }
  });
}

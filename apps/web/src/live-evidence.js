// Live evidence panel — queries services/evidence-pipeline through the
// api's evidence_router. Drop-in: pass an empty container element and an
// optional default indication / compact flag.
//
// Example:
//   import { renderLiveEvidencePanel } from './live-evidence.js';
//   renderLiveEvidencePanel(document.getElementById('host'), { defaultIndication: 'rtms_mdd' });
//
// Backend state the panel tolerates:
//   * DB built        → results render
//   * DB missing      → 503 → shows "ingest not run yet" message, not an error
//   * No auth         → 401 → falls through to existing session-expired flow
import { api, downloadBlob } from './api.js';

const GRADES = [
  { v: '',  label: 'Any grade' },
  { v: 'A', label: 'Grade A — Strong RCT / meta-analysis' },
  { v: 'B', label: 'Grade B — Moderate evidence' },
  { v: 'C', label: 'Grade C — Emerging / cohort' },
  { v: 'D', label: 'Grade D — Limited / small series' },
  { v: 'E', label: 'Grade E — Research only' },
];

const _esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',
}[c]));

export async function renderLiveEvidencePanel(host, opts = {}) {
  if (!host) return;
  const { defaultIndication = '', defaultQuery = '', compact = false } = opts;

  host.innerHTML = `
    <div class="live-ev" style="background:var(--surface-1,#0d1a2b);border:1px solid var(--border,#1f2e4a);border-radius:10px;padding:${compact ? '10px' : '14px'};margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px;color:var(--text-primary,#e5edf5)">Live evidence</div>
        <div style="font-size:11px;color:var(--text-tertiary,#7a8aa5);flex:1">PubMed · OpenAlex · ClinicalTrials.gov · FDA</div>
        <button class="btn btn-sm live-ev-export"
           title="Download the full evidence matrix (Excel, ~2 MB)">↓ Matrix (Excel)</button>
      </div>
      <div role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.35);color:#e5c47a;border-radius:6px;padding:7px 10px;margin-bottom:10px;font-size:11.5px;line-height:1.45">
        <strong>Decision support only</strong> — not a substitute for clinical judgement.
        Always verify parameters against the current device label and your local protocols.
        Evidence grades and FDA product codes shown here are informed estimates and may lag current guidelines.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <select class="form-control live-ev-indication" style="flex:1;min-width:200px">
          <option value="">All indications (loading…)</option>
        </select>
        <input class="form-control live-ev-q" placeholder="FTS query (optional) e.g. rTMS NEAR depression" style="flex:2;min-width:220px" value="${_esc(defaultQuery)}">
        <select class="form-control live-ev-grade" style="width:auto">
          ${GRADES.map(g => `<option value="${g.v}">${g.label}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary,#b7c4d9)">
          <input type="checkbox" class="live-ev-oa"> open-access only
        </label>
        <button class="btn btn-primary live-ev-go" style="padding:6px 14px">Search</button>
      </div>
      <div class="live-ev-status" style="font-size:11px;color:var(--text-tertiary,#7a8aa5);margin-bottom:8px"></div>
      <div class="live-ev-results"></div>
    </div>`;

  const $ = sel => host.querySelector(sel);
  const sel = $('.live-ev-indication');
  const input = $('.live-ev-q');
  const gradeSel = $('.live-ev-grade');
  const oaCbx = $('.live-ev-oa');
  const btn = $('.live-ev-go');
  const status = $('.live-ev-status');
  const results = $('.live-ev-results');
  const exportBtn = $('.live-ev-export');

  // Export Excel via authenticated fetch + blob download (a simple <a download>
  // won't pass the Bearer token, so we go through fetch+downloadBlob).
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const originalText = exportBtn.textContent;
      exportBtn.disabled = true;
      exportBtn.textContent = 'Building…';
      try {
        const token = localStorage.getItem('ds_access_token');
        const res = await fetch('/api/v1/evidence/export.xlsx', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        downloadBlob(blob, `deepsynaps-evidence-${new Date().toISOString().slice(0,10)}.xlsx`);
        exportBtn.textContent = '✓ Downloaded';
        setTimeout(() => { exportBtn.textContent = originalText; exportBtn.disabled = false; }, 2500);
      } catch (e) {
        exportBtn.textContent = `Failed: ${e.message || e}`;
        setTimeout(() => { exportBtn.textContent = originalText; exportBtn.disabled = false; }, 3500);
      }
    });
  }

  // Load indications
  try {
    const inds = await api.evidenceIndications();
    sel.innerHTML = `<option value="">All indications</option>` + (inds || [])
      .map(i => `<option value="${_esc(i.slug)}">${_esc(i.label)} · ${_esc(i.modality)}${i.evidence_grade ? ' · ' + i.evidence_grade : ''}</option>`)
      .join('');
    if (defaultIndication) sel.value = defaultIndication;
  } catch (e) {
    if (e.status === 503) {
      status.textContent = 'Evidence database not ingested yet. Run: python3 services/evidence-pipeline/ingest.py --all';
      sel.innerHTML = `<option value="">(evidence DB not ready)</option>`;
      btn.disabled = true;
      return;
    }
    status.textContent = `Could not load indications: ${_esc(e.message || e)}`;
  }

  const doSearch = async () => {
    status.textContent = 'Searching…';
    results.innerHTML = '';
    try {
      const papers = await api.searchEvidencePapers({
        q: input.value.trim(),
        indication: sel.value,
        grade: gradeSel.value,
        oa_only: oaCbx.checked,
        limit: compact ? 8 : 20,
      });
      if (!papers || papers.length === 0) {
        results.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-tertiary,#7a8aa5);font-size:12px">No matching evidence. Widen filters or reingest the DB.</div>`;
        status.textContent = '0 results';
        return;
      }
      status.textContent = `${papers.length} result${papers.length === 1 ? '' : 's'}`;
      results.innerHTML = papers.map(p => _renderPaperCard(p)).join('');
      results.querySelectorAll('.live-ev-save').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.id;
          el.disabled = true;
          el.textContent = 'Saving…';
          try {
            const r = await api.promoteEvidencePaper(id);
            el.textContent = '✓ Saved to library';
            el.classList.add('btn-success');
          } catch (e2) {
            el.disabled = false;
            el.textContent = `Save failed: ${_esc(e2.message || e2)}`;
          }
        });
      });
    } catch (e) {
      if (e.status === 503) {
        status.textContent = 'Evidence database not ingested yet.';
      } else {
        status.textContent = `Search failed: ${_esc(e.message || e)}`;
      }
    }
  };

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  if (defaultIndication || defaultQuery) doSearch();
}

function _renderPaperCard(p) {
  const authors = Array.isArray(p.authors) ? p.authors : [];
  const byline = authors.length ? (authors.length > 3 ? `${authors[0]} et al.` : authors.join(', ')) : '';
  const pubTypes = Array.isArray(p.pub_types) ? p.pub_types : [];
  const tier = pubTypes.find(t => /Meta-Analysis|Systematic Review|Guideline/i.test(t))
            || pubTypes.find(t => /Randomized Controlled Trial|Controlled Clinical Trial/i.test(t))
            || pubTypes.find(t => /Clinical Trial|Review/i.test(t));
  const tierColor = tier && /Meta|Review|Guideline/i.test(tier) ? '#00d4bc'
                  : tier && /Randomized|Controlled/i.test(tier) ? '#4a9eff'
                  : tier ? '#f59e0b' : '#7a8aa5';
  const oaBtn = p.is_oa && p.oa_url
    ? `<a class="btn btn-sm" href="${_esc(p.oa_url)}" target="_blank" rel="noopener" style="margin-right:6px">Open PDF</a>`
    : '';
  const saveBtn = `<button class="btn btn-sm live-ev-save" data-id="${p.id}">Save to library</button>`;
  const pmid = p.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${_esc(p.pmid)}" target="_blank" rel="noopener" style="color:var(--text-tertiary,#7a8aa5);margin-right:6px">PMID ${_esc(p.pmid)}</a>` : '';
  const doi = p.doi ? `<a href="https://doi.org/${_esc(p.doi)}" target="_blank" rel="noopener" style="color:var(--text-tertiary,#7a8aa5)">DOI</a>` : '';
  const cites = (p.cited_by_count ?? null) !== null ? `<span style="color:var(--text-tertiary,#7a8aa5);margin-right:6px">${p.cited_by_count} cites</span>` : '';

  return `
    <div style="border:1px solid var(--border,#1f2e4a);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--surface-0,#0a1628)">
      <div style="display:flex;gap:10px;align-items:baseline;margin-bottom:4px">
        <div style="flex:1;font-weight:600;font-size:13px;color:var(--text-primary,#e5edf5);line-height:1.35">${_esc(p.title || '(untitled)')}</div>
        <div style="font-size:11px;color:var(--text-tertiary,#7a8aa5)">${_esc(p.year || '')}</div>
      </div>
      <div style="font-size:11.5px;color:var(--text-secondary,#b7c4d9);margin-bottom:6px">${_esc(byline)}${p.journal ? ' · ' + _esc(p.journal) : ''}</div>
      <div style="font-size:11px;color:var(--text-tertiary,#7a8aa5);display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${tier ? `<span style="color:${tierColor};font-weight:600">${_esc(tier)}</span>` : ''}
        ${cites}
        ${pmid}
        ${doi}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${oaBtn}${saveBtn}</div>
    </div>`;
}

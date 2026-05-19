import { api } from './api.js';

const PAGE_CSS = `
  .ai-fabric { max-width: 1240px; margin: 0 auto; padding: 18px 24px 48px; color: var(--text); }
  .ai-fabric__hero { position: relative; overflow: hidden; border: 1px solid var(--border); border-radius: 24px; padding: 28px; background:
    radial-gradient(circle at top right, rgba(36, 99, 235, 0.18), transparent 36%),
    radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.12), transparent 30%),
    linear-gradient(135deg, #091322 0%, #10233b 48%, #0f172a 100%);
    margin-bottom: 18px; }
  .ai-fabric__eyebrow { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #93c5fd; margin-bottom: 10px; }
  .ai-fabric__title { font-size: clamp(28px, 4vw, 44px); line-height: 1.05; margin: 0 0 12px; max-width: 11ch; color: #f8fafc; }
  .ai-fabric__lead { max-width: 62ch; color: rgba(248, 250, 252, 0.84); line-height: 1.6; font-size: 14px; margin: 0 0 18px; }
  .ai-fabric__hero-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; align-items: end; }
  .ai-fabric__notice { border: 1px solid rgba(250, 204, 21, 0.45); background: rgba(120, 53, 15, 0.2); color: #fde68a; border-radius: 16px; padding: 14px 16px; font-size: 12px; line-height: 1.55; }
  .ai-fabric__hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
  .ai-fabric__btn { border: 1px solid transparent; border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease; }
  .ai-fabric__btn:hover { transform: translateY(-1px); }
  .ai-fabric__btn--primary { background: #f8fafc; color: #0f172a; }
  .ai-fabric__btn--ghost { background: transparent; color: #e2e8f0; border-color: rgba(226, 232, 240, 0.28); }
  .ai-fabric__btn--small { padding: 8px 12px; font-size: 11px; }
  .ai-fabric__metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .ai-fabric__metric { border: 1px solid var(--border); background: linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.62)); border-radius: 18px; padding: 16px; }
  .ai-fabric__metric-value { font-size: 26px; font-weight: 800; color: #f8fafc; }
  .ai-fabric__metric-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
  .ai-fabric__grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; margin-bottom: 18px; }
  .ai-fabric__panel { border: 1px solid var(--border); border-radius: 20px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.58)); padding: 18px; }
  .ai-fabric__panel h3 { margin: 0 0 8px; font-size: 18px; }
  .ai-fabric__muted { color: var(--text-secondary); font-size: 12px; line-height: 1.55; }
  .ai-fabric__tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
  .ai-fabric__tier { border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 16px; padding: 14px; background: rgba(15, 23, 42, 0.42); }
  .ai-fabric__tier-label { font-size: 12px; color: #cbd5e1; margin-bottom: 8px; }
  .ai-fabric__tier-name { font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 6px; }
  .ai-fabric__tier-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.45; }
  .ai-fabric__arch { display: grid; gap: 10px; margin-top: 14px; }
  .ai-fabric__arch-row { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 12px; }
  .ai-fabric__arch-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #93c5fd; }
  .ai-fabric__arch-track { border: 1px solid rgba(59, 130, 246, 0.22); border-radius: 999px; padding: 8px; background: rgba(2, 6, 23, 0.45); display: flex; gap: 8px; flex-wrap: wrap; }
  .ai-fabric__arch-node { border-radius: 999px; padding: 6px 10px; font-size: 11px; color: #e2e8f0; background: linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(15, 118, 110, 0.28)); border: 1px solid rgba(96, 165, 250, 0.24); }
  .ai-fabric__consent { display: grid; gap: 10px; margin-top: 14px; }
  .ai-fabric__consent-card { border-radius: 16px; padding: 14px; border: 1px solid rgba(250, 204, 21, 0.24); background: rgba(120, 53, 15, 0.12); }
  .ai-fabric__consent-card strong { display: block; color: #fde68a; margin-bottom: 6px; }
  .ai-fabric__table-wrap { overflow: auto; margin-top: 14px; }
  .ai-fabric__table { width: 100%; border-collapse: collapse; min-width: 860px; font-size: 12px; }
  .ai-fabric__table th, .ai-fabric__table td { padding: 10px 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.14); text-align: left; vertical-align: top; }
  .ai-fabric__table th { color: #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .ai-fabric__status { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .ai-fabric__status--disabled { background: rgba(153, 27, 27, 0.18); color: #fca5a5; }
  .ai-fabric__status--configured { background: rgba(146, 64, 14, 0.16); color: #fcd34d; }
  .ai-fabric__status--active { background: rgba(22, 101, 52, 0.18); color: #86efac; }
  .ai-fabric__cap-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .ai-fabric__cap { border-radius: 999px; padding: 4px 8px; font-size: 10px; color: #dbeafe; background: rgba(37, 99, 235, 0.18); border: 1px solid rgba(96, 165, 250, 0.2); }
  .ai-fabric__links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
  .ai-fabric__link { border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.18); background: rgba(15, 23, 42, 0.38); padding: 12px 14px; min-width: 140px; cursor: pointer; }
  .ai-fabric__link strong { display: block; color: #f8fafc; margin-bottom: 4px; }
  .ai-fabric__dry-run { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; margin-top: 14px; }
  .ai-fabric__result { border-radius: 16px; padding: 14px; margin-top: 12px; background: rgba(2, 6, 23, 0.56); border: 1px solid rgba(59, 130, 246, 0.18); }
  .ai-fabric__result pre { margin: 0; font-size: 11px; color: #cbd5e1; white-space: pre-wrap; word-break: break-word; }
  .ai-fabric__error { margin-top: 12px; border-radius: 14px; padding: 12px 14px; background: rgba(127, 29, 29, 0.18); border: 1px solid rgba(248, 113, 113, 0.22); color: #fecaca; font-size: 12px; }
  @media (max-width: 900px) {
    .ai-fabric__hero-grid, .ai-fabric__grid, .ai-fabric__dry-run { grid-template-columns: 1fr; }
    .ai-fabric { padding-left: 16px; padding-right: 16px; }
  }
`;

const DEMO_MODELS = [
  { model_id: 'me-llama-13b', name: 'Me-LLaMA-13B', modality: 'text', tier: 'cloud_llm', activation_status: 'disabled', capabilities: ['narrative_synthesis', 'citation_grounding'], summary: 'Narrative drafting scaffold.' },
  { model_id: 'pubmedbert', name: 'PubMedBERT', modality: 'text', tier: 'cloud_llm', activation_status: 'disabled', capabilities: ['entity_extraction'], summary: 'Entity extraction scaffold.' },
  { model_id: 'medrag', name: 'MedRAG', modality: 'text', tier: 'cloud_llm', activation_status: 'disabled', capabilities: ['citation_grounding', 'narrative_synthesis'], summary: 'Evidence synthesis scaffold.' },
  { model_id: 'eegnet-v1', name: 'EEGNet', modality: 'EEG', tier: 'edge_realtime', activation_status: 'disabled', capabilities: ['eeg_classification'], summary: 'Edge EEG scaffold.' },
  { model_id: 'biot-v1', name: 'BIOT', modality: 'EEG', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['eeg_classification', 'eeg_feature_extraction'], summary: 'Transformer EEG scaffold.' },
  { model_id: 'fastsurfer-v1', name: 'FastSurfer', modality: 'MRI', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['mri_segmentation'], summary: 'Segmentation scaffold.' },
  { model_id: 'simnibs-v4.6', name: 'SimNIBS 4.6', modality: 'MRI', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['efield_simulation'], summary: 'E-field scaffold.' },
  { model_id: 'brain-jepa-v1', name: 'Brain-JEPA', modality: 'fMRI', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['fmri_embedding'], summary: 'Foundation fMRI scaffold.' },
  { model_id: 'cbra-mod-v1', name: 'CBraMod', modality: 'EEG', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['eeg_feature_extraction', 'eeg_quality_control'], summary: 'Cross-band EEG scaffold.' },
  { model_id: 'brain-harmony-v1', name: 'BrainHarmony', modality: 'Multimodal', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['multimodal_fusion'], summary: 'Multimodal fusion scaffold.' },
  { model_id: 'sgacc-connectivity-v1', name: 'sgACC Connectivity', modality: 'fMRI', tier: 'gpu_medical', activation_status: 'disabled', capabilities: ['fmri_embedding'], summary: 'Connectivity scaffold.' },
];

const DEMO_SUMMARY = {
  total_models: 11,
  disabled_models: 11,
  tiers: { cloud_llm: 3, edge_realtime: 1, gpu_medical: 7 },
};

const DEMO_TIERS = [
  { tier: 'edge_realtime', label: 'Edge Realtime', description: 'Near-device low-latency inference.' },
  { tier: 'gpu_medical', label: 'GPU Medical', description: 'GPU-backed imaging and biomarker workloads.' },
  { tier: 'cloud_llm', label: 'Cloud LLM', description: 'Grounded synthesis and evidence orchestration.' },
];

const DEMO_DRY_RUN = {
  model_id: 'medrag',
  synthetic: true,
  safety_copy: 'Decision-support preview only. Outputs are synthetic scaffold responses for clinician review and are not diagnostic conclusions.',
  output: {
    summary: 'MedRAG scaffold dry-run completed.',
    requested_capability: 'citation_grounding',
    limitations: ['Synthetic dry-run output only.', 'No patient-specific inference was executed.'],
  },
};

function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function prettyCapability(value) {
  return String(value || '').replace(/_/g, ' ');
}

function statusClass(status) {
  const normalized = String(status || 'disabled').toLowerCase();
  if (normalized === 'active') return 'ai-fabric__status ai-fabric__status--active';
  if (normalized === 'configured') return 'ai-fabric__status ai-fabric__status--configured';
  return 'ai-fabric__status ai-fabric__status--disabled';
}

function metricsHtml(summary) {
  return [
    { value: summary.total_models || 0, label: 'Registry Models' },
    { value: summary.disabled_models || 0, label: 'Disabled By Default' },
    { value: summary.tiers?.cloud_llm || 0, label: 'Cloud LLM' },
    { value: summary.tiers?.gpu_medical || 0, label: 'GPU Medical' },
  ].map((item) => `
    <div class="ai-fabric__metric">
      <div class="ai-fabric__metric-value">${esc(item.value)}</div>
      <div class="ai-fabric__metric-label">${esc(item.label)}</div>
    </div>
  `).join('');
}

function modelsTableHtml(models) {
  return `
    <div class="ai-fabric__table-wrap">
      <table class="ai-fabric__table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Tier</th>
            <th>Modality</th>
            <th>Status</th>
            <th>Capabilities</th>
            <th>Safety</th>
          </tr>
        </thead>
        <tbody>
          ${models.map((model) => `
            <tr>
              <td>
                <strong>${esc(model.name)}</strong><br/>
                <span class="ai-fabric__muted">${esc(model.model_id)}</span><br/>
                <span class="ai-fabric__muted">${esc(model.summary || '')}</span>
              </td>
              <td>${esc(String(model.tier || '').replace(/_/g, ' '))}</td>
              <td>${esc(model.modality)}</td>
              <td><span class="${statusClass(model.activation_status)}">${esc(model.activation_status)}</span></td>
              <td><div class="ai-fabric__cap-list">${(model.capabilities || []).map((cap) => `<span class="ai-fabric__cap">${esc(prettyCapability(cap))}</span>`).join('')}</div></td>
              <td>
                <div>Decision-support only</div>
                <div class="ai-fabric__muted">Clinician review required</div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPage(state) {
  return `
    <section class="ai-fabric" data-page="ai-fabric">
      <style>${PAGE_CSS}</style>
      <section class="ai-fabric__hero">
        <div class="ai-fabric__hero-grid">
          <div>
            <div class="ai-fabric__eyebrow">DeepSynaps AI Model Fabric v1</div>
            <h1 class="ai-fabric__title">One registry. Multiple guarded neuro models.</h1>
            <p class="ai-fabric__lead">
              AI Fabric centralizes disabled-by-default qEEG, imaging, and evidence model scaffolds behind consent checks, dry-run safety copy, and explicit clinician review boundaries.
            </p>
            <div class="ai-fabric__hero-actions">
              <button class="ai-fabric__btn ai-fabric__btn--primary" data-ai-fabric-action="dry-run">Run governed dry run</button>
              <button class="ai-fabric__btn ai-fabric__btn--ghost" data-ai-fabric-action="qeeg-launcher">Open qEEG launcher</button>
            </div>
          </div>
          <div class="ai-fabric__notice">
            <strong>Clinical safety boundary</strong><br/>
            All models remain scaffolded and disabled by default. Live inference is intentionally unavailable here; only synthetic dry-run output is exposed until consent, runtime setup, and clinical governance controls are satisfied.
          </div>
        </div>
      </section>

      <section class="ai-fabric__metrics">${metricsHtml(state.summary)}</section>

      <section class="ai-fabric__grid">
        <article class="ai-fabric__panel">
          <h3>Three-tier architecture</h3>
          <div class="ai-fabric__muted">The fabric routes language, neurophysiology, and imaging scaffolds through one governed registry instead of ad hoc model wiring.</div>
          <div class="ai-fabric__tiers">
            ${(state.tiers || []).map((tier) => `
              <div class="ai-fabric__tier">
                <div class="ai-fabric__tier-label">${esc(tier.label)}</div>
                <div class="ai-fabric__tier-name">${esc(String(tier.tier || '').replace(/_/g, ' '))}</div>
                <div class="ai-fabric__tier-desc">${esc(tier.description || '')}</div>
              </div>
            `).join('')}
          </div>
          <div class="ai-fabric__arch">
            <div class="ai-fabric__arch-row">
              <div class="ai-fabric__arch-label">Registry</div>
              <div class="ai-fabric__arch-track">
                <span class="ai-fabric__arch-node">Descriptors</span>
                <span class="ai-fabric__arch-node">Health</span>
                <span class="ai-fabric__arch-node">Provider map</span>
              </div>
            </div>
            <div class="ai-fabric__arch-row">
              <div class="ai-fabric__arch-label">Governance</div>
              <div class="ai-fabric__arch-track">
                <span class="ai-fabric__arch-node">Consent gate</span>
                <span class="ai-fabric__arch-node">Autonomous-language detector</span>
                <span class="ai-fabric__arch-node">Audit hash</span>
              </div>
            </div>
            <div class="ai-fabric__arch-row">
              <div class="ai-fabric__arch-label">Execution</div>
              <div class="ai-fabric__arch-track">
                <span class="ai-fabric__arch-node">Dry-run only</span>
                <span class="ai-fabric__arch-node">Synthetic output</span>
                <span class="ai-fabric__arch-node">No diagnosis</span>
              </div>
            </div>
          </div>
        </article>

        <article class="ai-fabric__panel">
          <h3>Consent and activation</h3>
          <div class="ai-fabric__muted">Activation is operational work, not a UI toggle. Configure the runtime, verify governance, then lift the model state intentionally.</div>
          <div class="ai-fabric__consent">
            <div class="ai-fabric__consent-card">
              <strong>Consent requirement</strong>
              AI Fabric requests require explicit consent before even synthetic clinical payloads are accepted.
            </div>
            <div class="ai-fabric__consent-card">
              <strong>Disabled-by-default</strong>
              Registry state stays red until runtime dependencies, validation, and governance review are complete.
            </div>
            <div class="ai-fabric__consent-card">
              <strong>Output boundary</strong>
              Dry-run responses carry safety copy and must not issue autonomous diagnosis or treatment directives.
            </div>
          </div>
          <div class="ai-fabric__links">
            <button class="ai-fabric__link" data-ai-fabric-action="qeeg-launcher"><strong>qEEG</strong><span class="ai-fabric__muted">Launcher and analysis flows</span></button>
            <button class="ai-fabric__link" data-ai-fabric-action="mri-analysis"><strong>MRI</strong><span class="ai-fabric__muted">Imaging analyzer surface</span></button>
            <button class="ai-fabric__link" data-ai-fabric-action="research-evidence"><strong>Evidence</strong><span class="ai-fabric__muted">Research and literature grounding</span></button>
            <button class="ai-fabric__link" data-ai-fabric-action="protocol-studio"><strong>Protocol Studio</strong><span class="ai-fabric__muted">Workflow orchestration entrypoint</span></button>
          </div>
        </article>
      </section>

      <article class="ai-fabric__panel">
        <h3>Model registry</h3>
        <div class="ai-fabric__muted">All 11 scaffolded models are visible here so activation can remain explicit, auditable, and reversible.</div>
        ${modelsTableHtml(state.models)}
      </article>

      <section class="ai-fabric__grid">
        <article class="ai-fabric__panel">
          <h3>Provider readiness</h3>
          <div class="ai-fabric__muted">Provider modules are importable, but live inference is not enabled. This surface verifies lazy loading without boot-time heavy imports.</div>
          <div class="ai-fabric__table-wrap">
            <table class="ai-fabric__table">
              <thead><tr><th>Model</th><th>Provider</th><th>Available</th></tr></thead>
              <tbody>
                ${(state.providers || []).map((row) => `
                  <tr>
                    <td>${esc(row.model_id)}</td>
                    <td>${esc(row.provider_class || row.module || '')}</td>
                    <td>${row.available ? 'Yes' : 'No'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </article>

        <article class="ai-fabric__panel">
          <h3>Governed dry run</h3>
          <div class="ai-fabric__muted">Runs a synthetic MedRAG request through consent validation and safety-copy enforcement.</div>
          <div class="ai-fabric__dry-run">
            <div class="ai-fabric__muted">No patient-specific inference is executed. The response is synthetic by design.</div>
            <button class="ai-fabric__btn ai-fabric__btn--primary ai-fabric__btn--small" data-ai-fabric-action="dry-run">Run now</button>
          </div>
          ${state.error ? `<div class="ai-fabric__error">${esc(state.error)}</div>` : ''}
          <div id="ai-fabric-dry-run-result" class="ai-fabric__result">
            <pre>${esc(JSON.stringify(state.dryRun, null, 2))}</pre>
          </div>
        </article>
      </section>
    </section>
  `;
}

async function loadState() {
  try {
    const [models, summary, providers, tiers] = await Promise.all([
      api.aiFabricModels(),
      api.aiFabricSummary(),
      api.aiFabricProviders(),
      api.aiFabricTiers(),
    ]);
    return { models, summary, providers, tiers, dryRun: DEMO_DRY_RUN, error: '' };
  } catch (error) {
    return {
      models: DEMO_MODELS,
      summary: DEMO_SUMMARY,
      providers: DEMO_MODELS.map((model) => ({
        model_id: model.model_id,
        provider_class: model.name.replace(/[^A-Za-z0-9]/g, '') + 'Provider',
        available: true,
      })),
      tiers: DEMO_TIERS,
      dryRun: DEMO_DRY_RUN,
      error: `Live AI Fabric API unavailable. Showing scaffold data instead. ${error?.message || ''}`.trim(),
    };
  }
}

function wireActions(container, navigate) {
  container.querySelectorAll('[data-ai-fabric-action]').forEach((node) => {
    node.addEventListener('click', async () => {
      const action = node.getAttribute('data-ai-fabric-action');
      if (action === 'dry-run') {
        const resultNode = container.querySelector('#ai-fabric-dry-run-result pre');
        if (resultNode) resultNode.textContent = 'Running dry run...';
        try {
          const response = await api.aiFabricDryRun({
            model_id: 'medrag',
            capability: 'citation_grounding',
            payload: { question: 'What evidence supports this protocol?' },
            consent_obtained: true,
          });
          if (resultNode) resultNode.textContent = JSON.stringify(response, null, 2);
        } catch (_) {
          if (resultNode) resultNode.textContent = JSON.stringify(DEMO_DRY_RUN, null, 2);
        }
        return;
      }
      if (typeof navigate === 'function') navigate(action);
    });
  });
}

export async function pgAIFabric(setTopbar, navigate) {
  if (typeof setTopbar === 'function') {
    setTopbar('AI Fabric', 'Governed model registry and dry-run activation surface');
  }
  const container = document.getElementById('content');
  if (!container) return;
  container.innerHTML = '<section class="ai-fabric"><style>' + PAGE_CSS + '</style><div class="ai-fabric__muted">Loading AI Fabric registry...</div></section>';
  const state = await loadState();
  container.innerHTML = renderPage(state);
  wireActions(container, navigate);
}

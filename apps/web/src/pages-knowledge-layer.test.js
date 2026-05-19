// Smoke test for pgKnowledgeLayer pharma wiring.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

function _makeEl() {
  return {
    innerHTML: '',
    style: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    remove: () => {},
    setAttribute: () => {},
  };
}

let _savedWindow;
let _savedDocument;
const _domBefore = () => {
  _savedWindow = global.window;
  _savedDocument = global.document;
  const contentEl = _makeEl();
  global.document = {
    getElementById: (id) => (id === 'content' ? contentEl : _makeEl()),
    createElement: () => _makeEl(),
    body: { appendChild: () => {} },
  };
  global.window = { location: { href: '' } };
};
const _domAfter = () => {
  global.window = _savedWindow;
  global.document = _savedDocument;
};

_domBefore();
const { pgKnowledgeLayer } = await import('./pages-knowledge-layer.js');
const { api } = await import('./api.js');
_domAfter();
const _savedApiGet = api.get;
const _savedPharmaList = api.pharmaceuticalListAdapters;
const _savedNeuromodList = api.neuromodulationListSources;

describe('pgKnowledgeLayer pharma section', () => {
  before(() => {
    _domBefore();
    api.get = async () => ({
      adapters: [
        { name: 'rxnorm', health: 'healthy', research_only: false, cached_records: 12, source_database: 'RxNorm', source_version: '1', license: 'free', provenance: { license_type: 'free', update_timestamp: '2026-05-19T00:00:00Z' } },
      ],
    });
    api.pharmaceuticalListAdapters = async () => ({
      total: 2,
      adapters: [
        {
          key: 'rxnorm',
          display_name: 'RxNorm',
          category: 'pharmaceutical',
          access_type: 'free',
          source_url: 'https://rxnav.nlm.nih.gov/REST/',
          clinical_utility: 'Drug name normalization.',
          api_key_required: false,
          enabled: true,
          registered: true,
          live_exposed: true,
          tier: 'p0',
          status: 'healthy',
          lifecycle_state: 'healthy',
          connected: true,
          api_key_configured: true,
          source_version: '1',
          license_type: 'free',
        },
        {
          key: 'dailymed',
          display_name: 'DailyMed',
          category: 'pharmaceutical',
          access_type: 'free',
          source_url: 'https://dailymed.nlm.nih.gov/api/',
          clinical_utility: 'FDA label lookup.',
          api_key_required: false,
          enabled: false,
          registered: false,
          live_exposed: false,
          tier: 'p1',
          status: 'disabled',
          lifecycle_state: 'disabled',
          connected: false,
          api_key_configured: false,
          source_version: '',
          license_type: 'free',
        },
      ],
    });
    api.neuromodulationListSources = async () => ({
      total: 2,
      sources: [
        {
          key: 'simnibs',
          display_name: 'SimNIBS',
          category: 'neuromodulation',
          access_type: 'local_compute',
          source_url: 'https://simnibs.github.io/',
          clinical_utility: 'Electric-field modelling scaffold.',
          enabled: false,
          status: 'unavailable',
          lifecycle_state: 'unavailable',
          login_required: false,
          api_key_required: false,
          source_version: 'simnibs_v4',
          lifecycle_note: 'Simulation unavailable in this environment.',
          access_notes: 'Local package/CLI availability is checked at runtime.',
        },
        {
          key: 'ieeg',
          display_name: 'iEEG.org',
          category: 'neuromodulation',
          access_type: 'register',
          source_url: 'https://www.ieeg.org/',
          clinical_utility: 'Intracranial EEG reference datasets.',
          enabled: false,
          status: 'disabled',
          lifecycle_state: 'disabled',
          login_required: true,
          api_key_required: false,
          source_version: 'login-gated',
          lifecycle_note: 'Disabled until credentials are configured.',
          access_notes: 'Login is required.',
        },
      ],
    });
  });

  after(() => {
    api.get = _savedApiGet;
    api.pharmaceuticalListAdapters = _savedPharmaList;
    api.neuromodulationListSources = _savedNeuromodList;
    _domAfter();
  });

  it('renders the pharmaceutical banner and adapter cards', async () => {
    const topbar = () => {};
    await pgKnowledgeLayer(topbar);
    const content = document.getElementById('content').innerHTML;
    assert.match(content, /Category 1 Pharmaceutical Databases/);
    assert.match(content, /Decision support only/);
    assert.match(content, /RxNorm/);
    assert.match(content, /DailyMed/);
    assert.match(content, /Category 5 Neuromodulation Sources/);
    assert.match(content, /SimNIBS/);
    assert.match(content, /iEEG\.org/);
  });
});

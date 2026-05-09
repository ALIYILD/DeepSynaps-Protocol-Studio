import test from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(ownerDocument, id = '') {
    this.ownerDocument = ownerDocument;
    this.id = id;
    this.tagName = 'DIV';
    this.parentNode = null;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.className = '';
    this.textContent = '';
    this._innerHTML = '';
    this._byClass = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this._parseHTML();
  }

  get innerHTML() {
    return this._innerHTML;
  }

  _parseHTML() {
    this.children = [];
    this._byClass = new Map();
    const tagRe = /<([a-z0-9-]+)([^>]*)>/gi;
    let match;
    while ((match = tagRe.exec(this._innerHTML))) {
      const [, tag, rawAttrs] = match;
      const attrs = rawAttrs || '';
      const child = new FakeElement(this.ownerDocument);
      child.tagName = String(tag || 'div').toUpperCase();
      child.parentNode = this;

      const idMatch = attrs.match(/\sid=(['"])(.*?)\1/i);
      if (idMatch) {
        child.id = idMatch[2];
        this.ownerDocument.elements.set(child.id, child);
      }

      const classMatch = attrs.match(/\sclass=(['"])(.*?)\1/i);
      if (classMatch) {
        child.className = classMatch[2];
        for (const cls of child.className.split(/\s+/).filter(Boolean)) {
          const rows = this._byClass.get(cls) || [];
          rows.push(child);
          this._byClass.set(cls, rows);
        }
      }

      const valueMatch = attrs.match(/\svalue=(['"])(.*?)\1/i);
      if (valueMatch) child.value = valueMatch[2];
      if (/\schecked(?:[\s>]|=)/i.test(attrs)) child.checked = true;

      this.children.push(child);
    }
  }

  querySelector(selector) {
    if (!selector) return null;
    if (selector.startsWith('#')) return this.ownerDocument.getElementById(selector.slice(1));
    if (selector.startsWith('.')) return (this._byClass.get(selector.slice(1)) || [])[0] || null;
    return null;
  }

  querySelectorAll(selector) {
    if (!selector) return [];
    if (selector.startsWith('.')) return this._byClass.get(selector.slice(1)) || [];
    return [];
  }

  addEventListener() {}

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  insertBefore(node, reference) {
    node.parentNode = this;
    const idx = this.children.indexOf(reference);
    if (idx === -1) this.children.push(node);
    else this.children.splice(idx, 0, node);
    return node;
  }

  focus() {}

  scrollIntoView() {}
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.body = new FakeElement(this, 'body');
    this.elements.set('body', this.body);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  createElement(tag) {
    const el = new FakeElement(this);
    el.tagName = String(tag || 'div').toUpperCase();
    return el;
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function setupGlobals() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
  globalThis.window = {
    location: { search: '', href: 'http://localhost/?page=research-evidence' },
    _nav() {},
    _navPublic() {},
    _dsToast() {},
  };
  globalThis.location = globalThis.window.location;
}

function setupDom() {
  const document = new FakeDocument();
  const content = new FakeElement(document, 'content');
  document.elements.set('content', content);
  document.body.appendChild(content);
  globalThis.document = document;
  return { document, content };
}

function resetEnv() {
  setupGlobals();
  return setupDom();
}

setupGlobals();
setupDom();

const evidenceModule = await import('./pages-research-evidence.js');
const { api } = await import('./api.js');
const { setCurrentUser } = await import('./auth.js');
const { resetEvidenceUiStatsCache } = await import('./evidence-ui-live.js');
const { ASSESSMENT_REGISTRY, BRAIN_TARGET_REGISTRY } = await import('./registries.js');

const {
  _renderEvidenceDbCard,
  renderEvidenceResultCard,
  renderIndicationsSpine,
  pgResearchEvidence,
} = evidenceModule;

function renderedBodyHtml() {
  return document.getElementById('re-body')?.innerHTML || '';
}

function restoreApi(stubs) {
  const originals = new Map();
  for (const [key, value] of Object.entries(stubs)) {
    originals.set(key, api[key]);
    api[key] = value;
  }
  return () => {
    for (const [key, value] of originals.entries()) api[key] = value;
  };
}

const assessment = ASSESSMENT_REGISTRY.find((row) => Array.isArray(row.conditions) && row.conditions.length) || ASSESSMENT_REGISTRY[0];
const target = BRAIN_TARGET_REGISTRY.find((row) => row.site10_20 && row.label) || BRAIN_TARGET_REGISTRY[0];

test('pages-research-evidence runtime tab coverage', async (t) => {
  const richBundleStubs = {
    getResearchSummary: async () => ({
      paper_count: 210,
      open_access_paper_count: 58,
      top_evidence_tiers: [{ key: 'A', count: 8 }, { key: 'B', count: 6 }],
      top_modalities: [{ key: 'rtms', count: 22 }, { key: 'tdcs', count: 11 }],
      top_indications: [{ key: 'mdd', count: 30 }, { key: 'ocd', count: 14 }],
      top_study_types: [{ key: 'RCT', count: 12 }],
      top_safety_tags: [{ key: 'headache', count: 4 }],
      top_evidence_links: [{ modality: 'rtms', indication: 'mdd', target: 'F3', paper_count: 24, citation_sum: 60 }],
      top_protocol_templates: [{ modality: 'rtms', indication: 'mdd', target: 'F3', paper_count: 18, template_support_score: 92 }],
      recent_safety_signals: [{ title: 'Headache signal', primary_modality: 'rtms', year: 2024, evidence_tier: 'B' }],
    }),
    evidenceStatus: async () => ({ total_papers: 210, total_trials: 19, total_fda: 5 }),
    listResearchConditions: async () => [
      {
        condition_slug: 'major-depressive-disorder',
        condition_label: 'Major Depressive Disorder',
        research_paper_count: 55,
        priority_modalities: ['rtms', 'tdcs'],
        top_safety_signals: [{ signal: 'headache', count: 3 }],
      },
    ],
    evidenceIndicationsSummary: async () => [
      { slug: 'mdd-rtms', label: 'MDD', modality: 'rTMS', paper_count: 210, trial_count: 19, device_count: 5, protocol_count: 4, computed_evidence_grade: 'A' },
    ],
    protocolCoverage: async () => ({
      rows: [
        { condition: 'mdd', modality: 'rtms', gap: 'Need replication', paper_count: 20, coverage: 81, primary_target: 'F3' },
      ],
    }),
    listResearchProtocolTemplates: async () => [
      { id: 'tpl-1', modality: 'rtms', indication: 'mdd', target: target.label || target.site10_20, paper_count: 18, evidence_tier: 'A' },
    ],
    listResearchExactProtocols: async () => [
      { id: 'proto-1', name: 'Exact rTMS protocol', indication: 'mdd', modality: 'rtms', target: 'F3', paper_count: 28, evidence_tier: 'A', on_label: true },
    ],
    listResearchSafetySignals: async () => [
      { primary_modality: 'rtms', indication_tags: ['mdd'], safety_signal_tags: ['headache'] },
    ],
    listResearchEvidenceGraph: async (opts = {}) => {
      if (opts.target) {
        return [{ modality: 'rtms', indication: 'mdd', paper_count: 12, citation_sum: 40 }];
      }
      if (opts.indication) {
        return [{ modality: 'rtms', indication: 'mdd', target: 'F3', paper_count: 9 }];
      }
      return [{ modality: 'rtms', indication: 'mdd', target: 'F3', paper_count: 16, citation_sum: 42, year_min: 2018, year_max: 2025 }];
    },
    getResearchAdjunctSummary: async () => ({
      paper_count: 14,
      top_domains: [{ key: 'nutrition', count: 5 }],
      top_topics: [{ key: 'vitamin d', count: 6 }, { key: 'ssri', count: 4 }],
    }),
    listResearchAdjunctEvidence: async () => [
      { title: 'Vitamin D and stimulation response', adjunct_topic_labels: ['vitamin d'], year: 2023 },
      { title: 'SSRI interactions', adjunct_topic_labels: ['ssri'], year: 2022 },
    ],
    getResearchAdjunctReviewTables: async () => ({
      conditions: [
        {
          condition_label: 'Depression',
          rows: [
            {
              topic_label: 'Vitamin D',
              paper_count: 4,
              domain: 'nutrition',
              latest_year: 2024,
              citation_sum: 18,
              top_relation_signal_tags: [{ key: 'confounder' }],
              example_titles: ['Vitamin D correlation review'],
            },
          ],
        },
      ],
    }),
    getResearchCondition: async () => ({
      research_stats: {
        total_papers: 55,
        open_access_papers: 12,
        year_min: 2016,
        year_max: 2025,
        modalities: [{ label: 'rtms', count: 24 }],
        study_types: [{ label: 'rct', count: 8 }],
      },
      representative_papers: [
        { title: 'Depression trial', year: 2024, journal: 'Nature', study_type: 'rct', citation_count: 15, record_url: 'https://example.org/record', doi: '10.10/dep', pmid: '12345' },
      ],
      safety_signals: [{ signal: 'headache', count: 3 }],
      protocol_personalization_notes: ['Prefer clinician review for comorbidity'],
    }),
    searchResearchPapers: async (opts = {}) => {
      if (opts.target) {
        return [{ title: 'Targeted DLPFC paper', authors: 'Team Brain', year: 2023, journal: 'Brain', record_url: 'https://example.org/brain', doi: '10.10/brain', pmid: '999' }];
      }
      return [{ title: 'Assessment-linked paper', authors: 'Scale Team', year: 2021, journal: 'JAMA', record_url: 'https://example.org/scale', doi: '10.10/scale', pmid: '222' }];
    },
    libraryExternalSearch: async () => ({
      notice: 'Brokered search active',
      provenance: 'external-fts',
      last_checked_at: '2026-05-09T00:00:00Z',
      items: [
        {
          title: 'Brokered depression paper',
          year: 2022,
          journal: 'Clinical Journal',
          authors: 'Broker Team',
          abstract: 'Brokered evidence about rTMS.',
          pmid: 'br-1',
          doi: '10.1000/brokered',
          condition: 'mdd',
          study_type: 'review',
          evidence_grade: 'B',
          url: 'https://example.org/brokered',
        },
      ],
    }),
    searchEvidenceDevices: async () => [
      { trade_name: 'NeuroStar', applicant: 'Neuronetics', kind: '510k', product_code: 'OBP', number: 'K123456', decision_date: '2024-02-02' },
    ],
  };

  const restore = restoreApi(richBundleStubs);

  try {
    await t.test('overview renders live evidence database and bundle panels', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'pt-1', role: 'patient', display_name: 'Patient Test' });
      window._resEvidenceTab = 'overview';
      window._reSearch = {};
      window._reFilter = {};
      window._reExpand = {};
      window._reSort = {};
      const topbar = [];
      await pgResearchEvidence((title, badge) => topbar.push({ title, badge }), () => {});
      assert.equal(topbar[0].title, 'Research Evidence');
      const html = renderedBodyHtml();
      assert.match(html, /Evidence Database/);
      assert.match(html, /Top Evidence Links/);
      assert.match(html, /Top Protocol Templates/);
      assert.match(html, /Recent Safety Signals/);
      assert.match(html, /Wearables &amp; passive sensing/);
      assert.match(html, /Open Devices &amp; Wearables/);
    });

    await t.test('conditions tab renders expanded live condition detail', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-1', role: 'clinician', display_name: 'Dr Test' });
      window._resEvidenceTab = 'conditions';
      window._reSearch = { conditions: '' };
      window._reFilter = { conditions: 'All' };
      window._reExpand = { 'major-depressive-disorder': true };
      window._reSort = { conditions: 'papers' };
      await pgResearchEvidence(() => {}, () => {});
      const html = renderedBodyHtml();
      assert.match(html, /Live Condition Detail/);
      assert.match(html, /Representative Papers/);
      assert.match(html, /PubMed/);
      assert.match(html, /DOI/);
      assert.match(html, /Prefer clinician review for comorbidity/);
      assert.match(html, /Live Indexed Evidence Search/);
    });

    await t.test('assessments tab renders expanded linked papers and graph rows', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-2', role: 'clinician', display_name: 'Dr Assess' });
      window._resEvidenceTab = 'assessments';
      window._reSearch = { assessments: '' };
      window._reFilter = { assessments: 'All' };
      window._reExpand = { ['a_' + assessment.id]: true };
      window._reSort = {};
      await pgResearchEvidence(() => {}, () => {});
      const html = renderedBodyHtml();
      assert.match(html, /Linked Conditions:/);
      assert.match(html, /Live Evidence Graph Links:/);
      assert.match(html, /Live Papers:/);
      assert.match(html, /Assessment-linked paper/);
      assert.match(html, /Scale Team/);
    });

    await t.test('protocols tab renders live templates, devices, coverage, safety, and graph panels', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-3', role: 'clinician', display_name: 'Dr Protocol' });
      window._resEvidenceTab = 'protocols';
      window._reSearch = { protocols: '' };
      window._reFilter = {};
      window._reExpand = {};
      window._reSort = {};
      await pgResearchEvidence(() => {}, () => {});
      const html = renderedBodyHtml();
      assert.match(html, /Protocol Templates/);
      assert.match(html, /Exact rTMS protocol/);
      assert.match(html, /NeuroStar/);
      assert.match(html, /Live Coverage Watch/);
      assert.match(html, /Live Safety Signals/);
      assert.match(html, /Evidence relationship summary \(bundle\)/);
    });

    await t.test('neuro tab renders expanded live target evidence', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-4', role: 'clinician', display_name: 'Dr Neuro' });
      window._resEvidenceTab = 'neuro';
      window._reSearch = { neuro: '' };
      window._reFilter = { neuro: 'All' };
      window._reExpand = { ['n_' + target.id]: true };
      window._reSort = {};
      await pgResearchEvidence(() => {}, () => {});
      const html = renderedBodyHtml();
      assert.match(html, /Live Evidence Graph:/);
      assert.match(html, /Live Protocol Templates:/);
      assert.match(html, /Live Papers:/);
      assert.match(html, /Targeted DLPFC paper/);
    });

    await t.test('adjunct tab renders example papers and review tables', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-5', role: 'clinician', display_name: 'Dr Adjunct' });
      window._resEvidenceTab = 'adjunct';
      window._reSearch = { adjunct: '' };
      window._reFilter = {};
      window._reExpand = {};
      window._reSort = {};
      await pgResearchEvidence(() => {}, () => {});
      const html = renderedBodyHtml();
      assert.match(html, /Adjunct Evidence Slice/);
      assert.match(html, /Vitamin D and stimulation response/);
      assert.match(html, /Condition Review Tables/);
      assert.match(html, /Vitamin D correlation review/);
    });

    await t.test('search tab renders indexed, brokered, curated, and ranked evidence results', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-6', role: 'clinician', display_name: 'Dr Search' });
      window._resEvidenceTab = 'search';
      window._reSearch = { search: 'depression rTMS' };
      window._reCuratedLitSnapshot = [
        {
          title: 'Curated depression trial',
          year: 2024,
          journal: 'Journal of Brain Stimulation',
          authors: ['A. Researcher', 'B. Clinician'],
          abstract: 'Curated abstract about rTMS.',
          pmid: 'cur-1',
          doi: '10.1000/curated',
          condition: 'mdd',
          study_type: 'RCT',
          evidence_grade: 'A',
          url: 'https://example.org/curated',
        },
      ];
      window._reEvidencePrefill = 'depression rTMS';
      window._reSearch = { search: 'depression rTMS' };
      await pgResearchEvidence(() => {}, () => {});
      const q = document.getElementById('lib-ext-q');
      const sourceSel = document.getElementById('re-ev-search-source');
      const condSel = document.getElementById('lib-ext-cond');
      const modSel = document.getElementById('re-ev-filter-modality');
      const gradeSel = document.getElementById('re-ev-filter-grade');
      const yMin = document.getElementById('re-ev-year-min');
      const yMax = document.getElementById('re-ev-year-max');
      const oaOnly = document.getElementById('re-ev-oa-only');
      const hasAbstract = document.getElementById('re-ev-has-abstract');
      const condTok = document.getElementById('re-ev-condition-token');
      q.value = 'depression rTMS';
      sourceSel.value = 'brokered';
      condSel.value = 'mdd';
      modSel.value = 'rtms';
      gradeSel.value = 'A';
      yMin.value = '2018';
      yMax.value = '2025';
      oaOnly.checked = true;
      hasAbstract.checked = true;
      condTok.value = 'mdd';
      await window._libUnifiedEvidenceSearch();
      const resultsHtml = document.getElementById('re-ev-search-results')?.innerHTML || '';
      assert.match(resultsHtml, /Brokered search/);
      assert.match(resultsHtml, /Brokered external literature service/);
      assert.match(resultsHtml, /AI-assisted draft only/);
    });

    await t.test('review tab renders live coverage review queue and search filter', async () => {
      const { content } = resetEnv();
      resetEvidenceUiStatsCache();
      setCurrentUser({ id: 'clin-7', role: 'clinician', display_name: 'Dr Review' });
      window._resEvidenceTab = 'review';
      window._reSearch = { review: 'rtms' };
      await pgResearchEvidence(() => {}, () => {});
      const html = renderedBodyHtml();
      assert.match(html, /Protocols requiring review/);
      assert.match(html, /Live protocol coverage and safety triage/);
      assert.match(html, /Search name, condition, device, citation/);
    });
  } finally {
    restore();
  }
});

test('pages-research-evidence search and indication runtime coverage', async (t) => {
  await t.test('_renderEvidenceDbCard covers unavailable and live count branches', async () => {
    resetEnv();
    let restore = restoreApi({
      evidenceIndicationsSummary: async () => {
        throw Object.assign(new Error('offline'), { status: 503 });
      },
    });
    try {
      const html = await _renderEvidenceDbCard();
      assert.match(html, /Evidence DB unavailable/);
      assert.match(html, /Open Indications/);
    } finally {
      restore();
    }

    restore = restoreApi({
      evidenceIndicationsSummary: async () => [
        { slug: 'mdd', paper_count: 184000, trial_count: 1200, device_count: 18 },
        { slug: 'ocd', paper_count: 24, trial_count: 1, device_count: 0 },
      ],
    });
    try {
      const html = await _renderEvidenceDbCard();
      assert.match(html, /184K papers/);
      assert.match(html, /1,201 trials/);
      assert.match(html, /18 cleared devices/);
    } finally {
      restore();
    }
  });

  await t.test('renderIndicationsSpine covers unavailable, fallback, and linked-detail branches', async () => {
    const { document } = resetEnv();
    const host = document.createElement('section');

    let restore = restoreApi({
      evidenceIndicationsSummary: async () => {
        throw Object.assign(new Error('forbidden'), { status: 403 });
      },
    });
    try {
      await renderIndicationsSpine(host);
      assert.match(host.innerHTML, /Indications spine unavailable/);
    } finally {
      restore();
    }

    restore = restoreApi({
      evidenceIndicationsSummary: async () => [
        {
          slug: 'rtms-mdd',
          label: 'Major Depression',
          modality: 'rTMS',
          paper_count: 12,
          trial_count: 2,
          device_count: 1,
          protocol_count: 0,
          computed_evidence_grade: 'A',
        },
      ],
      evidenceIndicationDetail: async () => ({
        indication: {
          slug: 'rtms-mdd',
          label: 'Major Depression',
          modality: 'rTMS',
          condition: 'Depression',
          paper_count: 12,
          trial_count: 2,
          device_count: 1,
          protocol_count: 0,
          computed_evidence_grade: 'A',
          evidence_grade: 'B',
        },
        fts_fallback: true,
        papers: [{ title: 'Open-label response patterns' }],
        trials: [],
        devices: [],
        protocols: [],
      }),
    });
    try {
      await renderIndicationsSpine(host);
      const detailHtml = document.getElementById('re-indication-detail').innerHTML;
      assert.match(detailHtml, /No evidence — clinician judgment required/);
      assert.match(detailHtml, /No direct identifier/);
    } finally {
      restore();
    }

    restore = restoreApi({
      evidenceIndicationsSummary: async () => [
        {
          slug: 'ocd-rtms',
          label: 'OCD',
          modality: 'rTMS',
          paper_count: 9,
          trial_count: 3,
          device_count: 2,
          protocol_count: 1,
          computed_evidence_grade: 'B',
        },
      ],
      evidenceIndicationDetail: async () => ({
        indication: {
          slug: 'ocd-rtms',
          label: 'OCD',
          modality: 'rTMS',
          condition: 'Obsessive compulsive disorder',
          regulatory: 'Investigational',
          paper_count: 9,
          trial_count: 3,
          device_count: 2,
          protocol_count: 1,
          computed_evidence_grade: 'B',
        },
        fts_fallback: false,
        papers: [
          { title: 'Sham-controlled OCD trial', pmid: '123456', doi: '10.1000/ocd', journal: 'Brain', year: 2024, cited_by_count: 5, is_oa: true },
        ],
        trials: [{ title: 'OCD Trial', nct_id: 'NCT123', phase: 'Phase 2', status: 'Recruiting', enrollment: 44 }],
        devices: [{ trade_name: 'MagVenture', kind: '510k', number: 'K123456', applicant: 'Mag', decision_date: '2024-01-01' }],
        protocols: [{ arm_label: 'Left DLPFC', modality: 'rTMS', target_anatomy: 'F3', frequency_hz: 10, amplitude_mA: 2, total_sessions: 30, confidence: 'high', source_type: 'ctgov', source_id: 'NCT123' }],
      }),
    });
    try {
      await renderIndicationsSpine(host);
      const detailHtml = document.getElementById('re-indication-detail').innerHTML;
      assert.match(detailHtml, /Evidence-linked claims/);
      assert.match(detailHtml, /PMID 123456/);
      assert.match(detailHtml, /MagVenture/);
      assert.match(detailHtml, /Left DLPFC/);
    } finally {
      restore();
    }
  });

  await t.test('renderEvidenceResultCard and search tab cover live search, ranking, detail, and promote branches', async () => {
    const card = renderEvidenceResultCard({
      id: 17,
      title: 'Indexed evidence row',
      authors: ['One', 'Two', 'Three', 'Four'],
      journal: 'Lancet',
      year: 2025,
      abstract: 'A'.repeat(500),
      pmid: '445566',
      doi: '10.10/demo',
      oa_url: 'https://example.org/open.pdf',
      europe_pmc_url: 'https://europepmc.org/demo',
      openalex_id: 'W123',
      evidence_grade: 'A',
      sample_size: 42,
      is_oa: true,
    }, 'indexed');
    assert.match(card, /Open ↗/);
    assert.match(card, /PubMed/);
    assert.match(card, /OpenAlex/);

    const { content, document } = resetEnv();
    resetEvidenceUiStatsCache();
    setCurrentUser({ id: 'clin-search', role: 'clinician', display_name: 'Dr Search' });
    window._resEvidenceTab = 'search';
    window.mountAgentBrainStatus = (host, payload) => {
      host.innerHTML = `<div data-page="${payload.page}">agent brain mounted</div>`;
    };

    let promoteMode = 'success';
    const restore = restoreApi({
      getResearchSummary: async () => ({
        paper_count: 22,
        open_access_paper_count: 8,
        top_modalities: [{ key: 'rtms', count: 12 }],
        top_indications: [{ key: 'mdd', count: 10 }],
        top_evidence_tiers: [{ key: 'A', count: 4 }],
      }),
      evidenceStatus: async () => ({ total_papers: 22, total_trials: 4, total_fda: 2 }),
      listResearchConditions: async () => [{ condition_slug: 'mdd', condition_label: 'Depression', research_paper_count: 10 }],
      libraryOverview: async () => ({
        conditions: [{ slug: 'mdd', label: 'Depression' }],
        curated_paper_count: 3,
        curated_trial_count: 2,
        evidence_db_available: true,
      }),
      listLiterature: async () => ({
        items: [
          { id: 88, title: 'Curated depression rtms record', authors: 'Clinician Team', journal: 'JAMA', year: 2023, condition: 'MDD', study_type: 'RCT', evidence_grade: 'A', pmid: '9012', doi: '10.20/curated' },
        ],
      }),
      evidenceIndications: async () => [{ slug: 'mdd', label: 'Depression', modality: 'rTMS' }],
      evidenceStats: async () => ({ total_papers: 22, total_trials: 4, total_fda: 2 }),
      searchEvidencePapers: async () => ([
        {
          id: 101,
          title: 'Indexed depression rTMS paper',
          authors: ['Ada', 'Ben'],
          journal: 'Nature',
          year: 2024,
          pmid: '777',
          doi: '10.10/indexed',
          oa_url: 'https://example.org/indexed.pdf',
          abstract: 'Indexed abstract',
          modalities: ['rtms'],
          conditions: ['depression'],
          pub_types: ['Randomized Controlled Trial'],
          is_oa: true,
        },
      ]),
      libraryExternalSearch: async () => ({
        notice: 'Brokered over ingest',
        provenance: 'router',
        last_checked_at: '2026-05-09T10:20:30Z',
        items: [
          { id: 202, title: 'Brokered depression paper', pmid: '444', review_status: 'queued', source_trust: 'high' },
          { id: 101, title: 'Indexed depression rTMS paper', pmid: '777' },
        ],
      }),
      searchResearchPapers: async () => [
        {
          title: 'Ranked neuromodulation paper',
          authors: 'Research Team',
          journal: 'Brain Stimulation',
          year: 2022,
          pmid: '555',
          doi: '10.10/ranked',
          primary_modality: 'rtms',
          indication_tags: ['mdd'],
          study_type_normalized: 'Meta-analysis',
          evidence_tier: 'A',
          research_summary: 'Ranked summary',
          open_access_flag: true,
          record_url: 'https://example.org/ranked',
        },
      ],
      listResearchEvidenceGraph: async () => ([
        { modality: 'rtms', indication: 'mdd', target: 'F3', paper_count: 6, citation_sum: 14, evidence_weight_sum: 8, open_access_count: 2, year_min: 2019, year_max: 2024 },
      ]),
      searchEvidenceTrials: async () => ([{ title: 'Depression Device Trial', nct_id: 'NCT-DEMO', status: 'Recruiting' }]),
      searchEvidenceDevices: async () => ([{ trade_name: 'NeuroStar', kind: '510k', number: 'K998877', decision_date: '2025-01-01' }]),
      evidencePaperDetail: async (paperId) => {
        if (paperId === 404) throw Object.assign(new Error('missing'), { status: 404 });
        return { title: 'Detailed indexed paper', abstract: 'Full abstract', journal: 'Nature' };
      },
      promoteEvidencePaper: async (paperId) => {
        if (promoteMode === 'fail') throw Object.assign(new Error('forbidden'), { status: 403 });
        return { ok: true, id: paperId };
      },
    });

    try {
      await pgResearchEvidence(() => {}, () => {});
      assert.match(content.innerHTML, /Live Indexed Evidence Search/);
      assert.match(document.getElementById('agent-brain-status').innerHTML, /agent brain mounted/);
      document.getElementById('re-ev-search-source').value = 'all';
      document.getElementById('lib-ext-q').value = 'depression rtms';
      await window._libUnifiedEvidenceSearch();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const resultsHtml = document.getElementById('re-ev-search-results').innerHTML;
      assert.match(document.getElementById('re-ev-expanded-note').innerHTML, /Expanded query terms used for retrieval/);
      assert.match(resultsHtml, /Indexed DB/);
      assert.match(resultsHtml, /Brokered search/);
      assert.match(resultsHtml, /Curated library/);
      assert.match(document.getElementById('re-ev-ranked-results').innerHTML, /Ranked research view/);
      assert.match(document.getElementById('re-ev-trials-devices').innerHTML, /Depression Device Trial/);

      await window._reShowEvidenceDetail(101);
      assert.equal(window._reDetailData.title, 'Detailed indexed paper');

      await window._reShowEvidenceDetail(404);
      await window._rePromoteEvidencePaper(101);
      promoteMode = 'fail';
      await window._rePromoteEvidencePaper(101);

      api.searchEvidencePapers = async () => {
        throw Object.assign(new Error('offline'), { status: 503 });
      };
      api.listResearchEvidenceGraph = async () => {
        throw new Error('graph offline');
      };
      document.getElementById('re-ev-search-source').value = 'indexed';
      document.getElementById('lib-ext-q').value = 'mdd';
      await window._libUnifiedEvidenceSearch();
      assert.match(document.getElementById('re-ev-search-results').innerHTML, /Evidence service unavailable/);
      assert.match(document.getElementById('re-ev-evidence-relationship-panel').innerHTML, /Evidence graph API unavailable/);
    } finally {
      restore();
    }
  });
});

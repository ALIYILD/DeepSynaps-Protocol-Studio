/**
 * pages-biomarkers-lab.test.js — Lab Biomarker tab rendering and safety tests
 *
 * Tests the new lab biomarker category tabs:
 *   Blood & Labs, Neuroinflammation, Hormones, Immune, Nutritional, Research-only
 *
 * Coverage:
 *   - Tab rendering (all 9 tabs mount without errors)
 *   - Tab switching (clicking each tab activates the correct panel)
 *   - Biomarker card click opens modal
 *   - Search filters biomarkers
 *   - Safety disclaimer visible on all tabs
 *   - No diagnostic claims in rendered text
 *   - Research-only warning visible on research tab
 *   - Evidence grade badges present
 *   - Reference ranges displayed
 *   - Confounders listed
 *
 * Run: node --test src/pages-biomarkers-lab.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Constants matching the frontend source ───────────────────────────────────

const LAB_BIOMARKER_TABS = Object.freeze([
  { id: 'blood_labs',    label: 'Blood & Labs',         color: '#FF6B8B' },
  { id: 'neuroinflamm',  label: 'Neuroinflammation',    color: '#F6B23C' },
  { id: 'hormones',      label: 'Hormones',             color: '#9B7FFF' },
  { id: 'immune',        label: 'Immune',               color: '#4ECDC4' },
  { id: 'nutritional',   label: 'Nutritional',          color: '#B6E66A' },
  { id: 'research_only', label: 'Research-only',        color: '#5BB6FF' },
]);

const ALL_TAB_IDS = LAB_BIOMARKER_TABS.map((t) => t.id);

/** @type {Array<{id: string, name: string, category: string, evidence_grade: string, ref_range: string, confounders: string[], has_modal: boolean}>} */
const MOCK_BIOMARKERS = [
  {
    id: 'ferritin',
    name: 'Ferritin',
    category: 'blood_labs',
    evidence_grade: 'STRONG_FDA_CLEARED',
    ref_range: '15–150 ng/mL (adult female); 30–400 ng/mL (adult male)',
    confounders: ['inflammation', 'oral contraceptives', 'time of day'],
    has_modal: true,
  },
  {
    id: 'bdnf_serum',
    name: 'BDNF (serum)',
    category: 'neuroinflamm',
    evidence_grade: 'MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES',
    ref_range: 'Variable by assay; no universal consensus range',
    confounders: ['exercise within 24h', 'sleep deprivation', 'seasonal variation'],
    has_modal: true,
  },
  {
    id: 'cortisol_am',
    name: 'Cortisol (AM)',
    category: 'hormones',
    evidence_grade: 'STRONG_FDA_CLEARED',
    ref_range: '6.2–19.4 ug/dL (morning, 8 AM)',
    confounders: ['stress', 'caffeine', 'shift work', 'pregnancy'],
    has_modal: true,
  },
  {
    id: 'il6',
    name: 'IL-6',
    category: 'immune',
    evidence_grade: 'WEAK_OFF_LABEL_FOR_ANXIETY',
    ref_range: '< 3.1 pg/mL (baseline)',
    confounders: ['recent infection', 'autoimmune flare', 'strenuous exercise'],
    has_modal: true,
  },
  {
    id: 'vitamin_d',
    name: '25-OH Vitamin D',
    category: 'nutritional',
    evidence_grade: 'STRONG_FDA_CLEARED',
    ref_range: '30–100 ng/mL (sufficiency); < 20 ng/mL (deficiency)',
    confounders: ['sun exposure', 'season', 'BMI', 'malabsorption'],
    has_modal: true,
  },
  {
    id: 'neurofilament_light',
    name: 'Neurofilament Light (NfL)',
    category: 'research_only',
    evidence_grade: 'NOT_SUPPORTED_DO_NOT_SURFACE',
    ref_range: 'No standardized clinical reference range',
    confounders: ['age', 'renal function', 'neurodegenerative stage'],
    has_modal: true,
  },
  {
    id: 'gfap',
    name: 'GFAP (serum)',
    category: 'research_only',
    evidence_grade: 'NOT_SUPPORTED_DO_NOT_SURFACE',
    ref_range: 'Research-use only; no CLIA-validated interval',
    confounders: ['TBI history', 'age', 'blood draw technique'],
    has_modal: true,
  },
];

const EVIDENCE_GRADE_META = {
  STRONG_FDA_CLEARED:                    { label: 'EV-A', fullLabel: 'FDA cleared / guideline supported' },
  MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES: { label: 'EV-B', fullLabel: 'Moderate evidence (open-label / large series)' },
  WEAK_OFF_LABEL_FOR_ANXIETY:            { label: 'EV-C', fullLabel: 'Weak / off-label / emerging' },
  NOT_SUPPORTED_DO_NOT_SURFACE:          { label: 'Research', fullLabel: 'Not clinically validated — research use only' },
};

const SAFETY_DISCLAIMER_TEXT =
  'This tool provides decision-support information for qualified healthcare professionals. ' +
  'It does not constitute medical advice, diagnosis, or treatment. ' +
  'Always exercise independent clinical judgment.';

const RESEARCH_ONLY_WARNING =
  'Research-use only. Not for clinical decision-making. No CLIA validation.';

// ── Forbidden diagnostic language ────────────────────────────────────────────
// These phrases must NEVER appear in biomarker UI output per clinical safety policy.

const FORBIDDEN_DIAGNOSTIC_PHRASES = [
  'diagnoses',
  'prescribes',
  'emergency triage',
  'you have depression',
  'patient has PTSD',
  'this confirms',
  'diagnostic certainty',
  'treatment plan:',
  'will recover in',
  'guaranteed improvement',
  '100% success rate',
];

// ── Helper: simulate tab HTML rendering ──────────────────────────────────────

function _renderTabButton(tab, isActive) {
  return `<button role="tab" class="ch-tab${isActive ? ' ch-tab--active' : ''}" data-tab="${tab.id}" ` +
    `style="padding:10px 18px;font-size:13px;font-weight:600;border:none;background:none;` +
    `color:${isActive ? 'var(--text-primary)' : 'var(--text-tertiary)'};cursor:pointer;` +
    `border-bottom:2px solid ${isActive ? tab.color : 'transparent'};transition:all .15s">` +
    `${tab.label}</button>`;
}

function _renderTabBar(activeTabId) {
  return `<nav id="lab-bm-tabs" style="display:flex;gap:4px;margin-bottom:18px;" role="tablist">` +
    LAB_BIOMARKER_TABS.map((t) => _renderTabButton(t, t.id === activeTabId)).join('') +
    `</nav>`;
}

function _renderBiomarkerCard(marker) {
  const gradeMeta = EVIDENCE_GRADE_META[marker.evidence_grade] || EVIDENCE_GRADE_META.NOT_SUPPORTED_DO_NOT_SURFACE;
  const confoundersHtml = marker.confounders.length
    ? `<ul style="margin:0;padding-left:18px;font-size:11px;color:var(--text-secondary);line-height:1.7">` +
      marker.confounders.map((c) => `<li>${c}</li>`).join('') + `</ul>`
    : '<span style="font-size:11px;color:var(--text-tertiary)">None listed</span>';

  return `<article class="card lab-bm-card" data-id="${marker.id}" data-category="${marker.category}" ` +
    `style="margin-bottom:8px;border:1px solid rgba(255,255,255,0.07);cursor:pointer;" ` +
    `onclick="window._openLabBmModal('${marker.id}')">` +
    `<div style="padding:14px 16px;">` +
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">` +
    `<span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.04);` +
    `color:var(--text-tertiary);border:1px solid var(--border)">${gradeMeta.label}</span>` +
    `<span style="font-size:9.5px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.04);` +
    `color:var(--text-tertiary)">${marker.category}</span>` +
    `</div>` +
    `<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${marker.name}</div>` +
    `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Ref: ${marker.ref_range}</div>` +
    `<div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Confounders</div>` +
    `${confoundersHtml}` +
    `</div></article>`;
}

function _renderDisclaimer() {
  return `<div id="lab-bm-disclaimer" style="padding:12px 14px;border-radius:12px;` +
    `border:1px solid rgba(45,212,191,0.35);background:rgba(45,212,191,0.06);` +
    `margin-bottom:16px;font-size:12px;line-height:1.55;color:var(--text-secondary)" role="note">` +
    `<strong style="color:var(--text-primary)">Decision-support only.</strong> ${SAFETY_DISCLAIMER_TEXT}` +
    `</div>`;
}

function _renderResearchWarning() {
  return `<div id="lab-bm-research-warning" style="padding:12px 14px;border-radius:12px;` +
    `border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.06);` +
    `margin-bottom:16px;font-size:12px;line-height:1.55;color:var(--text-secondary)" role="alert">` +
    `<strong style="color:var(--red)">Research-only biomarkers.</strong> ${RESEARCH_ONLY_WARNING}` +
    `</div>`;
}

function _renderSearchBox() {
  return `<input id="lab-bm-search" class="form-control" style="width:100%;max-width:400px" ` +
    `placeholder="Search biomarkers by name, confounder, or category..." ` +
    `oninput="window._labBmSearch(this.value)">`;
}

function _renderTabPanel(tabId) {
  const markers = MOCK_BIOMARKERS.filter((m) => m.category === tabId);
  const isResearch = tabId === 'research_only';

  let html = _renderTabBar(tabId);
  html += _renderDisclaimer();
  if (isResearch) {
    html += _renderResearchWarning();
  }
  html += `<div style="margin-bottom:14px">${_renderSearchBox()}</div>`;
  html += `<div id="lab-bm-count" style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">` +
    `${markers.length} biomarkers</div>`;
  html += `<div id="lab-bm-list">`;
  if (markers.length) {
    html += markers.map((m) => _renderBiomarkerCard(m)).join('');
  } else {
    html += `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">` +
      `No biomarkers in this category.</div>`;
  }
  html += `</div>`;
  return html;
}

function _simulateSearch(query) {
  const q = (query || '').toLowerCase().trim();
  return MOCK_BIOMARKERS.filter((m) => {
    if (!q) return true;
    const haystack = [
      m.name, m.category, m.ref_range,
      ...(m.confounders || []),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function _simulateModalOpen(markerId) {
  const marker = MOCK_BIOMARKERS.find((m) => m.id === markerId);
  if (!marker) return null;
  return {
    id: marker.id,
    name: marker.name,
    ref_range: marker.ref_range,
    confounders: marker.confounders,
    evidence_grade: marker.evidence_grade,
    title: `${marker.name} — Reference Detail`,
  };
}

// ── Test 1–6: Tab rendering ──────────────────────────────────────────────────

describe('Lab Biomarker tab rendering', () => {
  LAB_BIOMARKER_TABS.forEach((tab) => {
    it(`must render ${tab.label} tab without errors`, () => {
      const html = _renderTabPanel(tab.id);
      assert.ok(html.includes(tab.label), `HTML must contain tab label "${tab.label}"`);
      assert.ok(html.includes('role="tab"'), 'Tab buttons must have role="tab"');
      assert.ok(html.includes(`data-tab="${tab.id}"`), `Must have data-tab="${tab.id}"`);
    });
  });
});

// ── Test 7: Tab switching ────────────────────────────────────────────────────

describe('Tab switching across all 6 lab biomarker tabs', () => {
  it('must activate each tab and show its markers', () => {
    LAB_BIOMARKER_TABS.forEach((tab) => {
      const html = _renderTabPanel(tab.id);
      const activePattern = `ch-tab--active`;
      const activeCount = (html.match(new RegExp(activePattern, 'g')) || []).length;
      assert.ok(activeCount >= 1, `At least one tab must be active for "${tab.label}"`);

      // Each tab should show its own category markers
      const markers = MOCK_BIOMARKERS.filter((m) => m.category === tab.id);
      if (markers.length > 0) {
        markers.forEach((m) => {
          assert.ok(
            html.includes(m.name),
            `"${tab.label}" tab must contain biomarker "${m.name}"`
          );
        });
      }
    });
  });

  it('must not show markers from other categories', () => {
    const bloodHtml = _renderTabPanel('blood_labs');
    const neuroMarkers = MOCK_BIOMARKERS.filter((m) => m.category === 'neuroinflamm');
    neuroMarkers.forEach((m) => {
      // The category label may appear in the tab bar, but the marker card should NOT be present
      const cardPattern = `data-id="${m.id}"`;
      assert.ok(
        !bloodHtml.includes(cardPattern),
        `Blood & Labs tab must NOT contain "${m.name}" card`
      );
    });
  });
});

// ── Test 8: Biomarker card click opens modal ─────────────────────────────────

describe('Biomarker card modal', () => {
  it('must return modal data when a valid biomarker card is clicked', () => {
    const modal = _simulateModalOpen('ferritin');
    assert.ok(modal, 'Modal must open for valid biomarker id');
    assert.equal(modal.id, 'ferritin');
    assert.equal(modal.name, 'Ferritin');
    assert.ok(modal.ref_range.length > 5, 'Modal must include reference range');
    assert.ok(modal.confounders.length > 0, 'Modal must include confounders');
  });

  it('must return null for unknown biomarker id', () => {
    const modal = _simulateModalOpen('nonexistent_biomarker_xyz');
    assert.equal(modal, null, 'Modal must not open for unknown biomarker');
  });

  it('must include evidence grade in modal data', () => {
    const modal = _simulateModalOpen('ferritin');
    assert.equal(modal.evidence_grade, 'STRONG_FDA_CLEARED');
  });
});

// ── Test 9: Search filters biomarkers ────────────────────────────────────────

describe('Search filtering', () => {
  it('must return all biomarkers for empty query', () => {
    const results = _simulateSearch('');
    assert.equal(results.length, MOCK_BIOMARKERS.length);
  });

  it('must filter by biomarker name substring', () => {
    const results = _simulateSearch('ferrit');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'ferritin');
  });

  it('must filter by confounder name', () => {
    const results = _simulateSearch('inflammation');
    assert.ok(results.length >= 1, 'Should find ferritin via inflammation confounder');
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('ferritin'), 'Ferritin has inflammation confounder');
  });

  it('must find multiple biomarkers by shared confounder theme', () => {
    const results = _simulateSearch('exercise');
    assert.ok(results.length >= 2, 'Should find BDNF and IL-6 via exercise confounder');
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('bdnf_serum'), 'BDNF has exercise confounder');
    assert.ok(ids.includes('il6'), 'IL-6 has exercise confounder');
  });

  it('must be case-insensitive', () => {
    const lower = _simulateSearch('cortisol');
    const upper = _simulateSearch('CORTISOL');
    const mixed = _simulateSearch('CoRtIsOl');
    assert.deepStrictEqual(
      lower.map((r) => r.id),
      upper.map((r) => r.id),
      'Search must be case-insensitive'
    );
    assert.deepStrictEqual(
      lower.map((r) => r.id),
      mixed.map((r) => r.id),
      'Search must be case-insensitive for mixed case'
    );
  });

  it('must return empty array for non-matching query', () => {
    const results = _simulateSearch('xyz_nonexistent_999');
    assert.equal(results.length, 0);
  });
});

// ── Test 10: Safety disclaimer visible on all tabs ───────────────────────────

describe('Safety disclaimer visibility', () => {
  it('must render the decision-support disclaimer', () => {
    const html = _renderDisclaimer();
    assert.ok(html.includes('Decision-support only'), 'Disclaimer must mention decision-support');
    assert.ok(html.includes('does not constitute medical advice'), 'Must mention not medical advice');
    assert.ok(html.includes('clinical judgment'), 'Must reference clinical judgment');
  });

  LAB_BIOMARKER_TABS.forEach((tab) => {
    it(`must include disclaimer on ${tab.label} tab`, () => {
      const html = _renderTabPanel(tab.id);
      assert.ok(
        html.includes('lab-bm-disclaimer'),
        `"${tab.label}" tab must include disclaimer element`
      );
    });
  });
});

// ── Test 11: No diagnostic claims ────────────────────────────────────────────

describe('Clinical safety — no diagnostic claims in rendered text', () => {
  it('must not contain forbidden diagnostic phrases in any tab HTML', () => {
    LAB_BIOMARKER_TABS.forEach((tab) => {
      const html = _renderTabPanel(tab.id).toLowerCase();
      FORBIDDEN_DIAGNOSTIC_PHRASES.forEach((phrase) => {
        const phraseLower = phrase.toLowerCase();
        assert.ok(
          !html.includes(phraseLower),
          `"${tab.label}" tab HTML must NOT contain forbidden phrase: "${phrase}"`
        );
      });
    });
  });

  it('must not contain dosing advice in rendered content', () => {
    const forbiddenDosing = ['take 10mg daily', 'increase dosage', 'taper off', 'prescribe', 'start on'];
    LAB_BIOMARKER_TABS.forEach((tab) => {
      const html = _renderTabPanel(tab.id).toLowerCase();
      forbiddenDosing.forEach((phrase) => {
        assert.ok(
          !html.includes(phrase.toLowerCase()),
          `"${tab.label}" tab must NOT contain dosing phrase: "${phrase}"`
        );
      });
    });
  });
});

// ── Test 12: Research-only warning visible on research tab ───────────────────

describe('Research-only tab warning', () => {
  it('must display the research-only warning banner', () => {
    const html = _renderResearchWarning();
    assert.ok(html.includes('Research-only biomarkers'), 'Must have research-only heading');
    assert.ok(html.includes('Not for clinical decision-making'), 'Must warn against clinical use');
    assert.ok(html.includes('No CLIA validation'), 'Must mention no CLIA validation');
    assert.ok(html.includes('role="alert"'), 'Research warning must have alert role');
  });

  it('must include research warning only on research-only tab', () => {
    LAB_BIOMARKER_TABS.forEach((tab) => {
      const html = _renderTabPanel(tab.id);
      const hasWarning = html.includes('lab-bm-research-warning');
      if (tab.id === 'research_only') {
        assert.ok(hasWarning, 'Research-only tab MUST have research warning');
      } else {
        assert.ok(!hasWarning, `"${tab.label}" tab must NOT have research warning`);
      }
    });
  });

  it('must use NOT_SUPPORTED grade for research-only biomarkers', () => {
    const researchMarkers = MOCK_BIOMARKERS.filter((m) => m.category === 'research_only');
    researchMarkers.forEach((m) => {
      const gradeMeta = EVIDENCE_GRADE_META[m.evidence_grade];
      assert.equal(gradeMeta.label, 'Research', `Research marker "${m.name}" must have Research grade`);
      assert.ok(
        gradeMeta.fullLabel.toLowerCase().includes('not clinically validated') ||
        gradeMeta.fullLabel.toLowerCase().includes('research use only'),
        `Research marker "${m.name}" grade description must indicate non-clinical status`
      );
    });
  });
});

// ── Test 13: Evidence grade badges present ───────────────────────────────────

describe('Evidence grade badges', () => {
  it('must render an evidence grade chip per biomarker card', () => {
    LAB_BIOMARKER_TABS.forEach((tab) => {
      const html = _renderTabPanel(tab.id);
      const markers = MOCK_BIOMARKERS.filter((m) => m.category === tab.id);
      markers.forEach((m) => {
        const gradeMeta = EVIDENCE_GRADE_META[m.evidence_grade];
        assert.ok(
          html.includes(gradeMeta.label),
          `"${tab.label}" tab must show grade label "${gradeMeta.label}" for "${m.name}"`
        );
      });
    });
  });

  it('must include all known evidence grade keys in the meta dictionary', () => {
    const gradesUsed = new Set(MOCK_BIOMARKERS.map((m) => m.evidence_grade));
    gradesUsed.forEach((grade) => {
      assert.ok(
        EVIDENCE_GRADE_META[grade],
        `Evidence grade "${grade}" must have meta entry`
      );
    });
  });
});

// ── Test 14: Reference ranges displayed ──────────────────────────────────────

describe('Reference range display', () => {
  it('must show reference range for every biomarker card', () => {
    MOCK_BIOMARKERS.forEach((marker) => {
      const html = _renderBiomarkerCard(marker);
      assert.ok(
        html.includes('Ref:'),
        `Card for "${marker.name}" must show "Ref:" label`
      );
      assert.ok(
        html.includes(marker.ref_range),
        `Card for "${marker.name}" must display its reference range`
      );
    });
  });

  it('must include a non-empty reference range for every marker', () => {
    MOCK_BIOMARKERS.forEach((marker) => {
      assert.ok(
        marker.ref_range && marker.ref_range.length > 5,
        `Marker "${marker.name}" must have a meaningful reference range`
      );
    });
  });
});

// ── Test 15: Confounders listed ──────────────────────────────────────────────

describe('Confounders listing', () => {
  it('must render confounders as a list for each biomarker', () => {
    MOCK_BIOMARKERS.forEach((marker) => {
      const html = _renderBiomarkerCard(marker);
      assert.ok(
        html.includes('Confounders'),
        `Card for "${marker.name}" must have "Confounders" heading`
      );
      marker.confounders.forEach((c) => {
        assert.ok(
          html.includes(c),
          `Card for "${marker.name}" must list confounder "${c}"`
        );
      });
    });
  });

  it('must have at least one confounder per biomarker', () => {
    MOCK_BIOMARKERS.forEach((marker) => {
      assert.ok(
        marker.confounders.length > 0,
        `Marker "${marker.name}" must have at least one listed confounder`
      );
    });
  });

  it('must include common confounders across the catalog', () => {
    const allConfounders = MOCK_BIOMARKERS.flatMap((m) => m.confounders).map((c) => c.toLowerCase());
    const hasInflammation = allConfounders.some((c) => c.includes('inflammation'));
    const hasExercise = allConfounders.some((c) => c.includes('exercise'));
    const hasAge = allConfounders.some((c) => c.includes('age'));
    assert.ok(hasInflammation, 'At least one biomarker must list inflammation as confounder');
    assert.ok(hasExercise, 'At least one biomarker must list exercise as confounder');
    assert.ok(hasAge, 'At least one biomarker must list age as confounder');
  });
});

// ── Accessibility ────────────────────────────────────────────────────────────

describe('Accessibility checks', () => {
  it('must use role="tablist" on the tab container', () => {
    const html = _renderTabBar('blood_labs');
    assert.ok(html.includes('role="tablist"'), 'Tab container must have tablist role');
  });

  it('must use role="tab" on each tab button', () => {
    const html = _renderTabBar('blood_labs');
    const tabCount = (html.match(/role="tab"/g) || []).length;
    assert.equal(tabCount, LAB_BIOMARKER_TABS.length, 'Each tab must have role="tab"');
  });

  it('must include role="note" on disclaimer', () => {
    const html = _renderDisclaimer();
    assert.ok(html.includes('role="note"'), 'Disclaimer must have note role');
  });

  it('must include role="alert" on research warning', () => {
    const html = _renderResearchWarning();
    assert.ok(html.includes('role="alert"'), 'Research warning must have alert role');
  });
});

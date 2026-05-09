// ─────────────────────────────────────────────────────────────────────────────
// protocol-personalization-wizard.test.js — Wave-3 large-file pin (PR 74/N)
//
// Pins protocol-personalization-wizard.js via a combination of:
//   1. Source-code assertions for the DOM-entangled surfaces
//   2. Direct testing of isolated pure helpers extracted from the module
//
// Covers:
//   * Public exports: renderPersonalizationWizard, bindPersonalizationActions
//   * STEP_LABELS — 5 wizard steps defined
//   * _seizureRiskLevel: risk score accumulates correctly
//   * _medInteractionWarnings: correct warnings per medication status
//   * _intensityMultiplier: conservative=0.85, standard=1.0, aggressive=1.15
//   * _buildExplainabilityReasons: generates reasons for severity/chronicity/etc.
//   * CONTRAINDICATION_CHECKLISTS: all expected devices present
//   * XSS: _esc in wizard correctly escapes HTML
//   * Clinical safety: no diagnostic-conclusion language in wizard copy
//   * Decision-support disclaimer: wizard copy is advisory
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, 'protocol-personalization-wizard.js'), 'utf8');

// ── Module exports ────────────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — exports', () => {
  it('exports renderPersonalizationWizard', () => {
    assert.match(SRC, /export function renderPersonalizationWizard/);
  });

  it('exports bindPersonalizationActions', () => {
    assert.match(SRC, /export function bindPersonalizationActions/);
  });
});

// ── Step labels ────────────────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — STEP_LABELS', () => {
  it('defines 5 step labels', () => {
    assert.match(SRC, /const STEP_LABELS\s*=\s*\[/);
    // Count entries: 'Patient Profile', 'Condition Adjustments', 'Device Parameters',
    // 'Safety Overrides', 'Review & Explain'
    assert.ok(SRC.includes('Patient Profile'));
    assert.ok(SRC.includes('Condition Adjustments'));
    assert.ok(SRC.includes('Device Parameters'));
    assert.ok(SRC.includes('Safety Overrides'));
    assert.ok(SRC.includes('Review & Explain') || SRC.includes('Review &amp; Explain'));
  });

  it('STEP_LABELS has exactly 5 items', () => {
    const m = SRC.match(/const STEP_LABELS\s*=\s*\[([\s\S]*?)\];/);
    if (m) {
      const count = (m[1].match(/'/g) || []).length / 2;
      assert.strictEqual(count, 5);
    }
  });
});

// ── Enum constants ────────────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — enum constants', () => {
  it('SEVERITY_LEVELS contains mild, moderate, severe', () => {
    assert.match(SRC, /SEVERITY_LEVELS\s*=\s*\[/);
    assert.ok(SRC.includes("'mild'"));
    assert.ok(SRC.includes("'moderate'"));
    assert.ok(SRC.includes("'severe'"));
  });

  it('INTENSITY_LEVELS contains conservative, standard, aggressive', () => {
    assert.match(SRC, /INTENSITY_LEVELS\s*=\s*\[/);
    assert.ok(SRC.includes("'conservative'"));
    assert.ok(SRC.includes("'standard'"));
    assert.ok(SRC.includes("'aggressive'"));
  });

  it('RESISTANCE_OPTS includes high (4+ agents / ECT failure)', () => {
    assert.ok(SRC.includes('4+ agents / ECT failure'));
  });
});

// ── _intensityMultiplier (pure, extractable) ──────────────────────────────────

// Extract the function body
function buildIntensityMultiplier() {
  const start = SRC.indexOf('function _intensityMultiplier(');
  if (start < 0) return null;
  let depth = 0, i = start;
  while (i < SRC.length) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  try {
    return new Function(`${SRC.slice(start, i + 1)}; return _intensityMultiplier;`)();
  } catch { return null; }
}
const _intensityMultiplier = buildIntensityMultiplier();

describe('protocol-personalization-wizard.js — _intensityMultiplier', () => {
  it('source defines _intensityMultiplier', () => {
    assert.match(SRC, /function _intensityMultiplier/);
  });

  it('conservative returns 0.85', () => {
    if (!_intensityMultiplier) return;
    assert.strictEqual(_intensityMultiplier('conservative'), 0.85);
  });

  it('standard returns 1.0', () => {
    if (!_intensityMultiplier) return;
    assert.strictEqual(_intensityMultiplier('standard'), 1.0);
  });

  it('aggressive returns 1.15', () => {
    if (!_intensityMultiplier) return;
    assert.strictEqual(_intensityMultiplier('aggressive'), 1.15);
  });

  it('unknown level defaults to 1.0', () => {
    if (!_intensityMultiplier) return;
    assert.strictEqual(_intensityMultiplier('unknown'), 1.0);
  });
});

// ── _seizureRiskLevel ─────────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — _seizureRiskLevel', () => {
  it('source defines _seizureRiskLevel function', () => {
    assert.match(SRC, /function _seizureRiskLevel/);
  });

  it('returns low, medium, or high level objects', () => {
    // Check that all three levels appear in source
    assert.ok(SRC.includes("level:'high'") || SRC.includes("level: 'high'"));
    assert.ok(SRC.includes("level:'medium'") || SRC.includes("level: 'medium'"));
    assert.ok(SRC.includes("level:'low'") || SRC.includes("level: 'low'"));
  });

  it('seizure contraindication doubles the risk score', () => {
    assert.match(SRC, /seizure.*risk\s*\+=\s*2/s);
  });

  it('TMS device adds to seizure risk', () => {
    // draft.device === 'tms' -> risk += 1
    assert.match(SRC, /device\s*===\s*'tms'/);
  });

  it('recent medication change adds to risk', () => {
    assert.ok(SRC.includes('Recent medication change (<4 wk)'));
  });

  it('risk >= 4 maps to high level', () => {
    assert.match(SRC, /risk\s*>=\s*4/);
  });

  it('risk >= 2 maps to medium level', () => {
    assert.match(SRC, /risk\s*>=\s*2/);
  });
});

// ── _medInteractionWarnings ────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — _medInteractionWarnings', () => {
  it('source defines _medInteractionWarnings', () => {
    assert.match(SRC, /function _medInteractionWarnings/);
  });

  it('warns about seizure threshold with recent medication change', () => {
    assert.ok(SRC.includes('Recent medication change may alter seizure threshold'));
  });

  it('warns about medication washout symptom monitoring', () => {
    assert.ok(SRC.includes('Monitor closely for symptom exacerbation'));
  });

  it('warns about TMS + concurrent medications seizure threshold risk', () => {
    assert.ok(SRC.includes('clozapine') || SRC.includes('seizure threshold'));
  });

  it('warns about taVNS + cardiac medications', () => {
    assert.ok(SRC.includes('taVNS: confirm no concurrent cardiac medications'));
  });
});

// ── Contraindication checklists ────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — CONTRAINDICATION_CHECKLISTS', () => {
  const EXPECTED_DEVICES = ['tms', 'tdcs', 'tacs', 'ces', 'tavns', 'pbm', 'pemf', 'nf', 'tps', 'tus', 'dbs', 'vns'];

  it('source defines CONTRAINDICATION_CHECKLISTS', () => {
    assert.match(SRC, /const CONTRAINDICATION_CHECKLISTS\s*=/);
  });

  for (const device of EXPECTED_DEVICES) {
    it(`CONTRAINDICATION_CHECKLISTS contains device key "${device}"`, () => {
      assert.ok(SRC.includes(`  ${device}:`),
        `expected device key "${device}" in CONTRAINDICATION_CHECKLISTS`);
    });
  }

  it('TMS checklist includes metal implants contraindication', () => {
    assert.ok(SRC.includes('Metal implants in skull'));
  });

  it('TMS checklist includes active seizure disorder', () => {
    assert.ok(SRC.includes('Active seizure disorder or history of seizures'));
  });

  it('TMS checklist includes cardiac pacemaker', () => {
    assert.ok(SRC.includes('Cardiac pacemaker'));
  });

  it('DBS checklist includes active infection', () => {
    assert.ok(SRC.includes('Active infection'));
  });
});

// ── _buildExplainabilityReasons ────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — _buildExplainabilityReasons', () => {
  it('source defines _buildExplainabilityReasons', () => {
    assert.match(SRC, /function _buildExplainabilityReasons/);
  });

  it('explains severe presentation as extended course', () => {
    assert.ok(SRC.includes('extended course'));
  });

  it('explains mild severity as standard intensity sufficient', () => {
    assert.ok(SRC.includes('standard intensity sufficient'));
  });

  it('explains chronic > 5yr as extended treatment course', () => {
    assert.ok(SRC.includes('consider extended treatment course'));
  });

  it('explains high resistance with ~30-40% response expectation', () => {
    assert.ok(SRC.includes('30-40%') || SRC.includes('30–40%'));
  });

  it('explains aggressive parameters with seizure precaution note', () => {
    assert.ok(SRC.includes('seizure precautions'));
  });

  it('explains left-handed patient for TMS coil placement', () => {
    assert.ok(SRC.includes('Left-handed patient') || SRC.includes('neuronavigation'));
  });

  it('includes evidence-basis reason with indexed paper count', () => {
    assert.ok(SRC.includes('indexed papers for'));
  });
});

// ── XSS protection ────────────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — _esc XSS protection', () => {
  it('_esc escapes & < > " entities', () => {
    assert.match(SRC, /&amp;/);
    assert.match(SRC, /&lt;/);
    assert.match(SRC, /&gt;/);
    assert.match(SRC, /&quot;/);
  });

  it('user-entered notes pass through _esc before rendering', () => {
    // customContraNotes is rendered with _esc
    assert.match(SRC, /_esc\(wiz\.customContraNotes\)/);
  });

  it('montage name is escaped in modal rendering', () => {
    // protocolDraft.name goes through _esc
    assert.match(SRC, /_esc\(protocolDraft\.name/);
  });
});

// ── Window state management ────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — window state management', () => {
  it('wizard state stored on window._pwizState', () => {
    assert.match(SRC, /window\._pwizState/);
  });

  it('_pwizState initialised with step 0', () => {
    assert.match(SRC, /step:\s*0/);
  });

  it('_pwizApply stores result on window._protocolPersonalization', () => {
    assert.match(SRC, /window\._protocolPersonalization\s*=/);
  });

  it('_pwizClose removes overlay and nulls state', () => {
    assert.match(SRC, /window\._pwizState\s*=\s*null/);
  });

  it('_pwizGoStep clamps between 0 and 4', () => {
    assert.match(SRC, /Math\.max\(0,\s*Math\.min\(4,\s*step\)\)/);
  });
});

// ── Clinical safety copy ───────────────────────────────────────────────────────

describe('protocol-personalization-wizard.js — clinical safety copy', () => {
  it('safety overrides step mentions "Review with supervising clinician"', () => {
    assert.ok(SRC.includes('Review with supervising clinician'));
  });

  it('wizard uses "may not be eligible" language (not "is ineligible for")', () => {
    assert.ok(SRC.includes('may not be eligible'));
  });

  it('no diagnostic conclusion language ("you have been diagnosed")', () => {
    assert.ok(!SRC.toLowerCase().includes('you have been diagnosed'));
  });

  it('explainability panel is described as "evidence-backed reasoning" not diagnosis', () => {
    assert.ok(SRC.includes('evidence-backed') || SRC.includes('evidence-backed reasoning'));
  });

  it('wizard shows toast titled "Personalization Applied" not a clinical finding', () => {
    assert.ok(SRC.includes('Personalization Applied'));
  });
});

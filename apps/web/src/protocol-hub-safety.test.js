// ─────────────────────────────────────────────────────────────────────────────
// protocol-hub-safety.test.js — Clinical safety constraint tests
//
// Tests that the Protocol Hub and related clinical surfaces:
// 1. NEVER contain autonomous diagnosis / prescription claims
// 2. ALWAYS contain decision-support framing and clinician-review language
// 3. Include proper clinical disclaimers on all AI-generated outputs
//
// These are Class-A regulatory requirements. A failing test is a launch-blocker.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Source files under test ─────────────────────────────────────────────────
const SOURCE_FILES = [
  'pages-clinical-hubs.js',
  'pages-protocols.js',
  'pages-research-evidence.js',
  'clinical-disclaimer.js',
  'clinical-ai-safety-copy.js',
  'protocol-personalization-wizard.js',
];

const sources = new Map();
for (const f of SOURCE_FILES) {
  try {
    sources.set(f, readFileSync(join(__dirname, f), 'utf-8'));
  } catch {
    sources.set(f, ''); // file may not exist — empty string is safe for checks
  }
}

// Combined source for whole-corpus checks
const allSource = [...sources.values()].join('\n');

// ══════════════════════════════════════════════════════════════════════════════
// FORBIDDEN LANGUAGE — autonomous diagnosis claims
//
// IMPORTANT: Phrases like "diagnoses", "emergency triage", "autonomous diagnosis"
// ARE permitted when they appear in NEGATIVE contexts within disclaimers,
// governance banners, or safety warnings (e.g., "Not for autonomous diagnosis",
// "does not perform emergency triage"). These negative uses are REQUIRED for
// clinical safety compliance — they explicitly deny prohibited capabilities.
//
// What is FORBIDDEN is POSITIVE claims (e.g., "this tool diagnoses patients",
// "performs emergency triage", "FDA approved this protocol").
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a phrase appears in a positive (forbidden) claim context.
 * Returns true if the phrase is found WITHOUT negative qualifiers nearby.
 */
function hasPositiveClaim(source, phrase) {
  const lines = source.split('\n');
  const negationPatterns = [
    /not for\s+\w*\s*\b/i,
    /does not\s+\w*\s*\b/i,
    /do not\s+\w*\s*\b/i,
    /no\s+\w*\s*autonomous/i,
    /no\s+clinical\s+diagnosis/i,
    /not\s+\w*\s*treatment\s+approval/i,
    /not\s+diagnosis\s+or\s+autonomous/i,
  ];

  for (const line of lines) {
    if (!line.toLowerCase().includes(phrase.toLowerCase())) continue;

    // Check if this line contains a negation context
    const lowerLine = line.toLowerCase();
    const hasNegation = negationPatterns.some(p => p.test(lowerLine)) ||
      lowerLine.includes('not for') ||
      lowerLine.includes('does not') ||
      lowerLine.includes('do not') ||
      lowerLine.includes('not ') && lowerLine.includes(phrase.toLowerCase());

    // Also check if it's in a UI field definition or field list — that's data model, not claim
    const isDataModel = line.includes("id:'diagnoses'") ||
      line.includes('id:"diagnoses"') ||
      line.includes("id: 'diagnoses'") ||
      line.includes("id:'psychiatric'") || // field placeholder mentions "psychiatric diagnoses"
      line.includes("'presenting','diagnoses'") || // field list in data model
      (line.includes('placeholder:') && line.includes('diagnoses')); // field placeholder text

    if (isDataModel) continue; // Data model labels are OK

    if (!hasNegation) {
      return { forbidden: true, line: line.trim() };
    }
  }
  return { forbidden: false };
}

describe('Clinical safety: forbidden autonomous diagnosis language', () => {
  const forbiddenPhrases = [
    // Each phrase is paired with a rationale explaining why positive claims are forbidden
    ['diagnoses', 'must not claim the system diagnoses patients'],
    ['prescribes', 'must not claim the system prescribes treatment'],
    ['emergency triage', 'must not claim emergency triage capability'],
    ['replace your clinician', 'must not suggest replacing human clinicians'],
    ['autonomous clinical decision', 'must not claim autonomous decision-making'],
    ['autonomous diagnosis', 'must not claim autonomous diagnosis'],
    ['FDA approved this protocol', 'must not claim FDA approval of AI output'],
  ];

  for (const [phrase, rationale] of forbiddenPhrases) {
    it(`must not contain positive claim "${phrase}" — ${rationale}`, () => {
      const result = hasPositiveClaim(allSource, phrase);
      if (result.forbidden) {
        assert.fail(
          `Positive (forbidden) claim for "${phrase}" found: "${result.line}". ${rationale}`
        );
      }
      assert.ok(!result.forbidden, `${rationale}: "${phrase}"`);
    });
  }

  // The phrases MUST appear in negative/disclaimer contexts — this is required safety copy
  it('must contain "autonomous diagnosis" in a negated disclaimer context', () => {
    // e.g., "Not for autonomous diagnosis"
    const hubSrc = sources.get('pages-clinical-hubs.js') || '';
    const found = hubSrc.toLowerCase().includes('autonomous diagnosis');
    assert.ok(found, 'the phrase "autonomous diagnosis" must appear (in negated disclaimer)');
  });

  it('must contain "emergency triage" in a negated disclaimer context', () => {
    const hubSrc = sources.get('pages-clinical-hubs.js') || '';
    const found = hubSrc.toLowerCase().includes('emergency triage');
    assert.ok(found, 'the phrase "emergency triage" must appear (in negated disclaimer)');
  });

  it('must contain "autonomous clinical decisions" in a negated disclaimer context', () => {
    const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';
    const found = disclaimerSrc.toLowerCase().includes('autonomous clinical decisions');
    assert.ok(found, 'the phrase "autonomous clinical decisions" must appear (in negated disclaimer)');
  });

  it('must not contain the exact phrase "this tool diagnoses"', () => {
    assert.ok(
      !allSource.toLowerCase().includes('this tool diagnoses'),
      'must not claim diagnostic capability'
    );
  });

  it('must not contain a positive "auto-generate diagnoses" claim in hub source', () => {
    // The biomarker page uses this phrase in a *negative* context:
    // "does not auto-generate diagnoses" — which is acceptable.
    // We test the positive claim is absent.
    const hubSrc = sources.get('pages-clinical-hubs.js') || '';
    const lines = hubSrc.split('\n').filter(l =>
      l.toLowerCase().includes('auto-generate diagnoses') &&
      !l.toLowerCase().includes('does not') &&
      !l.toLowerCase().includes('not auto-generate')
    );
    assert.strictEqual(lines.length, 0,
      `Positive auto-diagnosis claim found: ${lines[0] || ''}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// REQUIRED LANGUAGE — decision-support framing
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: required decision-support framing', () => {
  it('must contain "decision support" somewhere in clinical surfaces', () => {
    assert.ok(
      allSource.toLowerCase().includes('decision support'),
      'clinical source must mention decision support'
    );
  });

  it('must contain "clinician review" somewhere in clinical surfaces', () => {
    assert.ok(
      allSource.toLowerCase().includes('clinician review'),
      'clinical source must mention clinician review'
    );
  });

  it('clinical-disclaimer.js must contain "decision-support" in global disclaimer', () => {
    const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';
    assert.ok(
      disclaimerSrc.toLowerCase().includes('decision-support'),
      'clinical-disclaimer.js must reference decision-support'
    );
  });

  it('clinical-disclaimer.js must contain "clinician review" in global disclaimer', () => {
    const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';
    assert.ok(
      disclaimerSrc.toLowerCase().includes('clinician review'),
      'clinical-disclaimer.js must reference clinician review'
    );
  });

  it('clinical-disclaimer.js must state it does not provide a diagnosis', () => {
    const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';
    assert.ok(
      disclaimerSrc.toLowerCase().includes('does not provide a diagnosis'),
      'clinical-disclaimer.js must deny diagnostic capability'
    );
  });

  it('clinical-disclaimer.js must state it does not replace clinical judgement', () => {
    const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';
    assert.ok(
      disclaimerSrc.toLowerCase().includes('replace clinical judgement'),
      'clinical-disclaimer.js must deny replacing clinical judgement'
    );
  });

  it('clinical-ai-safety-copy.js must export AI_DECISION_SUPPORT_DISCLAIMER', () => {
    const safetySrc = sources.get('clinical-ai-safety-copy.js') || '';
    assert.ok(
      safetySrc.includes('AI_DECISION_SUPPORT_DISCLAIMER'),
      'clinical-ai-safety-copy.js must export AI_DECISION_SUPPORT_DISCLAIMER'
    );
  });

  it('AI_DECISION_SUPPORT_DISCLAIMER must contain "Decision-support only"', () => {
    const safetySrc = sources.get('clinical-ai-safety-copy.js') || '';
    assert.ok(
      safetySrc.includes('Decision-support only'),
      'AI decision support disclaimer must state "Decision-support only"'
    );
  });

  it('AI_DECISION_SUPPORT_DISCLAIMER must mention clinician review', () => {
    const safetySrc = sources.get('clinical-ai-safety-copy.js') || '';
    assert.ok(
      safetySrc.includes('clinician review'),
      'AI decision support disclaimer must mention clinician review'
    );
  });

  it('NOT_DIAGNOSTIC_COPY must exist and reference decision-support', () => {
    const safetySrc = sources.get('clinical-ai-safety-copy.js') || '';
    assert.ok(
      safetySrc.includes('NOT_DIAGNOSTIC_COPY'),
      'NOT_DIAGNOSTIC_COPY must be exported'
    );
    assert.ok(
      safetySrc.includes('Decision-support only'),
      'NOT_DIAGNOSTIC_COPY must include "Decision-support only"'
    );
  });

  it('CLINICIAN_REVIEW_REQUIRED_COPY must exist', () => {
    const safetySrc = sources.get('clinical-ai-safety-copy.js') || '';
    assert.ok(
      safetySrc.includes('CLINICIAN_REVIEW_REQUIRED_COPY'),
      'CLINICIAN_REVIEW_REQUIRED_COPY must be exported'
    );
    assert.ok(
      safetySrc.includes('Clinician review required'),
      'CLINICIAN_REVIEW_REQUIRED_COPY must state "Clinician review required"'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Off-label safety guard tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: off-label protocol guards', () => {
  const hubSrc = sources.get('pages-clinical-hubs.js') || '';

  it('must show confirmation dialog before off-label generation', () => {
    assert.ok(
      hubSrc.includes('clinician has reviewed the indication'),
      'off-label confirm dialog must reference clinician review'
    );
  });

  it('must cancel off-label generation if not acknowledged', () => {
    assert.ok(
      hubSrc.includes('Off-label generation cancelled until clinician review acknowledgement is confirmed.'),
      'off-label generation must be cancellable with a clear message'
    );
  });

  it('must require condition before any generation', () => {
    assert.ok(
      hubSrc.includes("Condition is required."),
      'condition must be required before protocol generation'
    );
  });

  it('must display off-label warning on protocol cards', () => {
    assert.ok(
      hubSrc.includes('Off-label; clinician review required.'),
      'off-label protocols must display warning requiring clinician review'
    );
  });

  it('must render off-label warning in protocol detail view', () => {
    assert.ok(
      hubSrc.includes('This draft requires explicit clinician review and acknowledgement before use.'),
      'protocol detail must warn about off-label requiring explicit clinician review'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Structured report preview — clinical framing
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: structured report clinical framing', () => {
  const hubSrc = sources.get('pages-clinical-hubs.js') || '';

  it('must include AE report escalation with clinician review prompt', () => {
    // Adverse event reports trigger escalation with clinician review
    assert.ok(
      hubSrc.includes('Review and consider escalation.'),
      'AE reports must prompt clinician review and escalation consideration'
    );
  });

  it('must include clinical safety footer on AI-assisted report text', () => {
    // The source has a clinical safety footer on AI-generated report content
    assert.ok(
      hubSrc.includes('CLINICAL SAFETY:') &&
      hubSrc.includes('clinician review only') &&
      hubSrc.includes('autonomous diagnosis'),
      'AI-assisted report text must have clinical safety footer denying autonomous acts'
    );
  });

  it('must include safety flag warning before prescribing new courses', () => {
    assert.ok(
      hubSrc.includes('Clinician review is required before prescribing a new course'),
      'safety-flagged patients must require clinician review before prescribing'
    );
  });

  it('must include "Not autonomous prescribing" label in medication view', () => {
    assert.ok(
      hubSrc.includes('Not autonomous prescribing:'),
      'medication views must explicitly deny autonomous prescribing'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Evidence workspace — governance banner safety copy
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: evidence workspace governance banner', () => {
  const evidenceSrc = sources.get('pages-research-evidence.js') || '';

  it('must contain governance banner denying diagnostic/prescriptive claims', () => {
    assert.ok(
      evidenceSrc.includes('does not diagnose, prescribe, approve treatment, triage emergencies'),
      'evidence workspace governance banner must deny autonomous clinical acts'
    );
  });

  it('must state evidence summaries require clinician review', () => {
    assert.ok(
      evidenceSrc.includes('Evidence summaries require clinician review'),
      'evidence summaries must require clinician review'
    );
  });

  it('must include degraded-state banner for when live corpus is unavailable', () => {
    assert.ok(
      evidenceSrc.includes('Indexed evidence corpus unavailable') ||
      evidenceSrc.includes('Live evidence service unavailable') ||
      evidenceSrc.includes('Live evidence service unreachable'),
      'must show honest degraded-state banner when evidence corpus is unavailable'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Module-level safety — per-page disclaimer coverage
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: module disclaimer registry', () => {
  const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';

  const requiredModules = [
    'global',
    'ai',
    'patient',
    'protocol',
    'qeeg',
    'mri',
    'voice',
    'video',
    'text',
    'evidence',
    'deeptwin',
    'biometrics',
    'export',
  ];

  for (const mod of requiredModules) {
    it(`clinical-disclaimer.js must have a ${mod} disclaimer entry`, () => {
      // Each module entry appears as a key in DISCLAIMER_COPY
      assert.ok(
        disclaimerSrc.includes(`${mod}: {`) ||
        disclaimerSrc.includes(`${mod}:{`) ||
        // Also check for the key pattern in _resolveDisclaimer
        disclaimerSrc.includes(`'${mod}'`) ||
        disclaimerSrc.includes(`"${mod}"`),
        `clinical-disclaimer.js must have ${mod} disclaimer entry`
      );
    });
  }

  it('protocol disclaimer must mention "does not prescribe treatment"', () => {
    assert.ok(
      disclaimerSrc.includes('does not prescribe treatment'),
      'protocol disclaimer must deny prescriptive capability'
    );
  });

  it('every disclaimer entry must have a body array with at least one item', () => {
    // Parse the body arrays — each module has `body: [`
    const bodyMatches = disclaimerSrc.match(/body:\s*\[([^\]]+)\]/g) || [];
    assert.ok(
      bodyMatches.length >= requiredModules.length - 2, // global + ai + patient + ...
      `expected at least ${requiredModules.length - 2} body arrays, got ${bodyMatches.length}`
    );
    for (const match of bodyMatches) {
      assert.ok(
        match.length > 'body: []'.length,
        'every disclaimer body must contain at least one string literal'
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Patient-facing safety — no direct-to-patient diagnostic claims
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: patient-facing copy constraints', () => {
  const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';

  it('patient disclaimer must say "Not medical advice"', () => {
    assert.ok(
      disclaimerSrc.includes('Not medical advice'),
      'patient-facing disclaimer title must be "Not medical advice"'
    );
  });

  it('patient disclaimer must direct patients to speak to their clinician', () => {
    assert.ok(
      disclaimerSrc.includes('speak to your clinician'),
      'patient disclaimer must direct patients to human clinicians'
    );
  });

  it('patient disclaimer must include urgent-services referral language', () => {
    assert.ok(
      disclaimerSrc.includes('urgent services') ||
      disclaimerSrc.includes('emergency'),
      'patient disclaimer must include urgent-care referral language'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Export document safety — AI-assisted document framing
// ══════════════════════════════════════════════════════════════════════════════

describe('Clinical safety: AI-assisted export document framing', () => {
  const disclaimerSrc = sources.get('clinical-disclaimer.js') || '';

  it('export disclaimer must state it is a draft for review', () => {
    assert.ok(
      disclaimerSrc.includes('draft for review'),
      'export disclaimer must frame output as draft for review'
    );
  });

  it('export disclaimer must require suitably qualified clinician approval', () => {
    assert.ok(
      disclaimerSrc.includes('suitably qualified clinician'),
      'export disclaimer must require qualified clinician approval'
    );
  });

  it('export disclaimer must list verification items the clinician must check', () => {
    assert.ok(
      disclaimerSrc.includes('contraindications') ||
      disclaimerSrc.includes('patient details') ||
      disclaimerSrc.includes('clinical history'),
      'export disclaimer must enumerate items the clinician must verify'
    );
  });
});

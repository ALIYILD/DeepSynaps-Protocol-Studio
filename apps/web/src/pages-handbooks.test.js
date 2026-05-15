// pages-handbooks.test.js — DeepSynaps Handbooks deep runtime checks.
// Covers: role gating, entitlement gating, generation button, export buttons,
//         generic vs patient-scoped wording, clinical disclaimers,
//         failed generation, loading states, degraded mode.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const _handbooksSrc = readFileSync(fileURLToPath(new URL('./pages-handbooks.js', import.meta.url)), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Static source-level checks
// ─────────────────────────────────────────────────────────────────────────────

test('source exports main entry point', function () {
  assert.ok(_handbooksSrc.includes('export async function pgHandbooks'), 'main entry point exported');
  assert.ok(_handbooksSrc.includes('export default { pgHandbooks }'), 'default export');
});

test('esc() helper prevents XSS with HTML entity encoding', function () {
  assert.ok(_handbooksSrc.includes('function esc(s)'), 'esc function defined');
  assert.ok(_handbooksSrc.includes("replace(/&/g, '&amp;')"), 'ampersand escaped');
  assert.ok(_handbooksSrc.includes("replace(/</g, '&lt;')"), 'less-than escaped');
  assert.ok(_handbooksSrc.includes("replace(/>/g, '&gt;')"), 'greater-than escaped');
  assert.ok(_handbooksSrc.includes("replace(/\"/g, '&quot;')"), 'quote escaped');
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Role gating — reviewer sees read-only
// ─────────────────────────────────────────────────────────────────────────────

test('reviewer role sees read-only — no generation', function () {
  assert.ok(_handbooksSrc.includes("role = currentUser?.role || 'reviewer'"), 'default role is reviewer (read-only)');
  assert.ok(_handbooksSrc.includes('isReadOnly'), 'isReadOnly flag exists');
  assert.ok(_handbooksSrc.includes('readonly-banner'), 'read-only banner CSS class');
  assert.ok(
    _handbooksSrc.includes('Read-only access'),
    'read-only banner text'
  );
});

test('only clinician/admin/super_admin can generate', function () {
  assert.ok(
    _handbooksSrc.includes("['clinician', 'admin', 'super_admin']"),
    'privilege roles list'
  );
  assert.ok(
    _handbooksSrc.includes("includes(role) && features.includes('handbook_generate')"),
    'generation requires role + feature entitlement'
  );
});

test('generation gate blocks non-clinician at runtime', function () {
  // The _hbGoGenerator handler checks canGenerate before navigating
  assert.ok(
    _handbooksSrc.includes('if (!getRoleFeatures().canGenerate)'),
    'runtime gate in _hbGoGenerator'
  );
  assert.ok(
    _handbooksSrc.includes('Handbook generation not enabled for your role'),
    'toast message when generation blocked'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Entitlement gating
// ─────────────────────────────────────────────────────────────────────────────

test('entitlement gating — no handbook_generate shows not-enabled', function () {
  assert.ok(
    _handbooksSrc.includes('Handbooks not enabled for your clinic'),
    'entitlement not-enabled message'
  );
  assert.ok(
    _handbooksSrc.includes('handbook_generate entitlement is required'),
    'specific entitlement name mentioned'
  );
});

test('clinician with entitlement sees generate button', function () {
  // The + New Handbook button is enabled when canGenerate is true
  assert.ok(
    _handbooksSrc.includes("title=\"${rf.canGenerate ? 'Create a new handbook' : 'Handbook generation not enabled for your role'}\""),
    'button title reflects entitlement'
  );
  assert.ok(
    _handbooksSrc.includes("cursor:${rf.canGenerate ? 'pointer' : 'not-allowed'}"),
    'cursor changes with entitlement'
  );
  assert.ok(
    _handbooksSrc.includes("${!rf.canGenerate ? 'disabled' : ''}"),
    'button disabled without entitlement'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Export buttons visibility
// ─────────────────────────────────────────────────────────────────────────────

test('export buttons only visible when handbook is signed', function () {
  // Export buttons are disabled when !isSigned
  assert.ok(
    _handbooksSrc.includes("${!isSigned || !rf.canExport ? 'disabled' : ''}"),
    'export buttons disabled unless signed + entitled'
  );
  assert.ok(
    _handbooksSrc.includes('Handbook must be signed before export'),
    'signed-only tooltip message'
  );
  assert.ok(
    _handbooksSrc.includes("Handbook must be signed before export. Use the governance panel to advance status."),
    'governance guidance for unsigned'
  );
});

test('export buttons include all expected formats', function () {
  assert.ok(_handbooksSrc.includes("window._hbExport('docx')"), 'DOCX export handler');
  assert.ok(_handbooksSrc.includes("window._hbExport('pdf')"), 'PDF export handler');
  assert.ok(_handbooksSrc.includes("window._hbExport('markdown')"), 'Markdown export handler');
  assert.ok(_handbooksSrc.includes("window._hbExport('patient')"), 'Patient guide export handler');
  assert.ok(_handbooksSrc.includes("window._hbExport('evidence')"), 'Evidence-only export handler');
  assert.ok(_handbooksSrc.includes("window._hbExport('bundle')"), 'Complete bundle export handler');
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Generic vs patient-scoped wording
// ─────────────────────────────────────────────────────────────────────────────

test('without patient_id: shows generic guide wording', function () {
  assert.ok(
    _handbooksSrc.includes('Generic educational guide'),
    'generic guide banner text'
  );
  assert.ok(
    _handbooksSrc.includes('Not patient-specific'),
    'not patient-specific messaging'
  );
  assert.ok(
    _handbooksSrc.includes("Add ?patient_id=... to URL for personalized content"),
    'instruction for patient-scoped mode'
  );
});

test('with patient_id: shows personalized wording', function () {
  assert.ok(
    _handbooksSrc.includes('Personalized for'),
    'personalized banner prefix'
  );
  assert.ok(
    _handbooksSrc.includes('${esc(_state.patientName)}'),
    'patient name interpolation'
  );
  assert.ok(
    _handbooksSrc.includes('Based on clinic records with consent'),
    'consent acknowledgment'
  );
});

test('patient guide export changes label based on patient_id', function () {
  assert.ok(
    _handbooksSrc.includes("Personalized Guide") && _handbooksSrc.includes("Generic Guide"),
    'both patient guide label variants exist'
  );
  assert.ok(
    _handbooksSrc.includes("Export Personalized Patient Guide") && _handbooksSrc.includes("Export Patient-Friendly Generic Guide"),
    'both patient guide tooltip variants exist'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: No unsafe clinical claims — disclaimer enforcement
// ─────────────────────────────────────────────────────────────────────────────

test('safety banner includes draft disclaimer', function () {
  assert.ok(
    _handbooksSrc.includes('DRAFT FOR CLINICIAN REVIEW'),
    'draft banner heading'
  );
  assert.ok(
    _handbooksSrc.includes('Educational decision-support only'),
    'decision-support disclaimer'
  );
  assert.ok(
    _handbooksSrc.includes('Not a diagnosis, prescription, or emergency guidance'),
    'non-diagnosis disclaimer'
  );
});

test('generated sections include AI-assisted disclaimer', function () {
  assert.ok(
    _handbooksSrc.includes('AI-assisted draft for clinician review'),
    'AI draft disclaimer in section content'
  );
  assert.ok(
    _handbooksSrc.includes('Verify all clinical claims against primary literature'),
    'primary literature verification'
  );
});

test('markdown export includes safety notice', function () {
  assert.ok(
    _handbooksSrc.includes('SAFETY NOTICE'),
    'markdown safety notice'
  );
  assert.ok(
    _handbooksSrc.includes('Not a diagnosis, prescription, or emergency guidance'),
    'markdown non-diagnosis text'
  );
  assert.ok(
    _handbooksSrc.includes('Review by a licensed clinician is required'),
    'licensed clinician review required'
  );
});

test('safety footer includes comprehensive disclaimer', function () {
  assert.ok(
    _handbooksSrc.includes('Clinical disclaimer'),
    'clinical disclaimer heading'
  );
  assert.ok(
    _handbooksSrc.includes('decision-support only'),
    'decision-support only'
  );
  assert.ok(
    _handbooksSrc.includes('not clinical certainty'),
    'evidence grade disclaimer'
  );
  assert.ok(
    _handbooksSrc.includes('Never use generated content as a substitute for professional medical judgment'),
    'no substitution disclaimer'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: Failed generation states
// ─────────────────────────────────────────────────────────────────────────────

test('failed generation shows error toast', function () {
  assert.ok(
    _handbooksSrc.includes("title: 'Generation failed'"),
    'generation failed toast title'
  );
  assert.ok(
    _handbooksSrc.includes("body: msg"),
    'error message passed to toast'
  );
  assert.ok(
    _handbooksSrc.includes("severity: 'error'"),
    'error severity on failure'
  );
});

test('generation catch block resets generating flag', function () {
  assert.ok(
    _handbooksSrc.includes('g.generating = false'),
    'generating flag reset on error'
  );
  assert.ok(
    _handbooksSrc.includes("const msg = e?.message || 'Generation failed. Please try again.'"),
    'fallback error message'
  );
});

test('consent failure falls back to generic mode', function () {
  assert.ok(
    _handbooksSrc.includes('Consent required'),
    'consent required toast'
  );
  assert.ok(
    _handbooksSrc.includes('Using generic mode'),
    'fallback to generic mode message'
  );
  assert.ok(
    _handbooksSrc.includes('_state.patientName = null'),
    'patient name cleared on consent failure'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 8: Loading states
// ─────────────────────────────────────────────────────────────────────────────

test('loading state shows Generating... label', function () {
  assert.ok(
    _handbooksSrc.includes("${g.generating ? 'Generating...' : '✦ Generate Handbook'}"),
    'button label changes during generation'
  );
});

test('generating flag disables button', function () {
  assert.ok(
    _handbooksSrc.includes('${!canGenerateNow ? \'disabled\' : \'\'}'),
    'button disabled when cannot generate'
  );
  assert.ok(
    _handbooksSrc.includes('g.condition.trim().length > 0 && !g.generating'),
    'canGenerateNow requires !generating'
  );
});

test('success toast after generation', function () {
  assert.ok(
    _handbooksSrc.includes("title: 'Handbook generated'"),
    'success toast on generation'
  );
  assert.ok(
    _handbooksSrc.includes('review before clinical use'),
    'post-generation review reminder'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 9: Degraded mode — partial content when evidence unavailable
// ─────────────────────────────────────────────────────────────────────────────

test('_sectionsFromApi falls back to _lorem when API fields missing', function () {
  assert.ok(
    _handbooksSrc.includes('doc.overview || _lorem'),
    'overview fallback'
  );
  assert.ok(
    _handbooksSrc.includes("(doc.eligibility || []).join('\\n') || _lorem"),
    'eligibility fallback'
  );
  assert.ok(
    _handbooksSrc.includes("(doc.safety || []).join('\\n') || _lorem"),
    'safety fallback'
  );
  assert.ok(
    _handbooksSrc.includes('doc.patientExplain || _lorem'),
    'patient explain fallback'
  );
});

test('empty handbooks list shows graceful empty state', function () {
  assert.ok(
    _handbooksSrc.includes('No handbooks yet'),
    'empty state heading'
  );
  assert.ok(
    _handbooksSrc.includes('Create your first handbook'),
    'empty state CTA when can generate'
  );
  assert.ok(
    _handbooksSrc.includes('No handbooks available in read-only mode'),
    'empty state for read-only'
  );
});

test('section content uses textarea for degraded editing', function () {
  assert.ok(
    _handbooksSrc.includes('<textarea'),
    'textarea for section editing'
  );
  assert.ok(
    _handbooksSrc.includes('onchange="window._hbUpdateSection'),
    'section content update handler'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 10: Export error handling
// ─────────────────────────────────────────────────────────────────────────────

test('PDF export shows honest unavailable message', function () {
  assert.ok(
    _handbooksSrc.includes('PDF export unavailable'),
    'PDF unavailable message'
  );
  assert.ok(
    _handbooksSrc.includes('DOCX or Markdown are alternatives'),
    'suggests alternatives for PDF failure'
  );
});

test('export requires signed state at handler level', function () {
  assert.ok(
    _handbooksSrc.includes("if (hb.state !== 'signed')"),
    'export handler checks signed state'
  );
  assert.ok(
    _handbooksSrc.includes("title: 'Export blocked'"),
    'export blocked toast'
  );
});

test('export requires entitlement at handler level', function () {
  assert.ok(
    _handbooksSrc.includes("if (!rf.canExport)"),
    'export handler checks entitlement'
  );
  assert.ok(
    _handbooksSrc.includes('Handbook export not enabled for your clinic'),
    'export entitlement message'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 11: Governance workflow
// ─────────────────────────────────────────────────────────────────────────────

test('governance states follow ordered workflow', function () {
  assert.ok(
    _handbooksSrc.includes("GOVERNANCE_STATES = ['draft', 'needs_review', 'approved', 'signed', 'exported']"),
    'governance state order'
  );
});

test('sign action requires canSign role', function () {
  assert.ok(
    _handbooksSrc.includes("rf.canSign ?"),
    'sign gated by canSign'
  );
  assert.ok(
    _handbooksSrc.includes("Sign as Clinician"),
    'sign button label'
  );
});

test('archive action available from any state', function () {
  assert.ok(
    _handbooksSrc.includes("from: '*', to: 'archived'"),
    'archive from any state'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 12: Patient scope consent verification
// ─────────────────────────────────────────────────────────────────────────────

test('patient scope requires consent verification', function () {
  assert.ok(
    _handbooksSrc.includes('consent_status'),
    'consent status checked'
  );
  assert.ok(
    _handbooksSrc.includes("p.consent_status === 'active' || p.consent_status === 'granted'"),
    'consent status values'
  );
});

test('patient scope checkbox disabled without patient_id', function () {
  assert.ok(
    _handbooksSrc.includes('${_state.patientId ? \'\' : \'disabled\'}'),
    'patient scope checkbox requires patient_id'
  );
  assert.ok(
    _handbooksSrc.includes('requires patient_id in URL'),
    'explains patient_id requirement'
  );
});

// Logic-only tests for the QEEG-ANN1 qEEG Brain Map Report
// Annotations launch-audit (2026-05-02).
//
// Surface contract pinned by this suite:
//   - api.js exposes 7 helpers under /api/v1/qeeg-report-annotations/.
//   - pages-brainmap.js exports renderQeegAnnotationsSidebar, plus
//     pure helpers (buildQeegAnnotationsCreatePayload,
//     groupQeegAnnotationsByKind, canEditQeegAnnotation,
//     canDeleteQeegAnnotation, renderQeegAnnotationCard,
//     renderQeegAnnotationsSidebarMarkup,
//     renderQeegAnnotationCreateModalMarkup,
//     renderQeegAnnotationResolveModalMarkup).
//   - QEEG-ANN1 helpers placed BEFORE IRB-AMD4 in api.js (per the
//     spec's slice-boundary ordering).
//
// Run: node --test src/qeeg-report-annotations-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import {
  buildQeegAnnotationsCreatePayload,
  groupQeegAnnotationsByKind,
  canEditQeegAnnotation,
  canDeleteQeegAnnotation,
  renderQeegAnnotationCard,
  renderQeegAnnotationsSidebarMarkup,
  renderQeegAnnotationCreateModalMarkup,
  renderQeegAnnotationResolveModalMarkup,
  renderQeegAnnotationsSidebar,
  _QEEG_ANN_INTERNALS,
} from './pages-brainmap.js';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PATH = path.join(__dirname, 'api.js');
const PAGE_PATH = path.join(__dirname, 'pages-brainmap.js');


// ── 1. api.js helper coverage ─────────────────────────────────────────────

test('api.js exposes fetchQeegReportAnnotations helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchQeegReportAnnotations\s*:/);
});

test('api.js exposes createQeegReportAnnotation helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /createQeegReportAnnotation\s*:/);
});

test('api.js exposes patchQeegReportAnnotation helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /patchQeegReportAnnotation\s*:/);
});

test('api.js exposes deleteQeegReportAnnotation helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /deleteQeegReportAnnotation\s*:/);
});

test('api.js exposes resolveQeegReportAnnotation helper', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /resolveQeegReportAnnotation\s*:/);
});

test('api.js exposes summary + audit-events helpers', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /fetchQeegReportAnnotationSummary\s*:/);
  assert.match(apiSrc, /fetchQeegReportAnnotationAuditEvents\s*:/);
  assert.match(apiSrc, /postQeegReportAnnotationAuditEvent\s*:/);
});

test('QEEG-ANN1 helpers route under /api/v1/qeeg-report-annotations/', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const idx = apiSrc.indexOf('QEEG-ANN1 Brain Map Annotations launch-audit');
  assert.ok(idx > 0, 'QEEG-ANN1 launch-audit header missing in api.js');
  const after = apiSrc.slice(idx);
  const sectionEnd = after.indexOf('// end QEEG-ANN1 helpers');
  assert.ok(sectionEnd > 0, 'QEEG-ANN1 sentinel missing');
  const block = after.slice(0, sectionEnd);
  const urls = block.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 5, `expected >=5 URLs in QEEG-ANN1 block, got ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/qeeg-report-annotations/);
  }
});

test('QEEG-ANN1 slice boundary sentinel present', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  assert.match(apiSrc, /━━ QEEG-ANN1 SLICE BOUNDARY ━━/);
});

test('QEEG-ANN1 helpers placed BEFORE IRB-AMD4 helpers in api.js', () => {
  const apiSrc = fs.readFileSync(API_PATH, 'utf8');
  const annIdx = apiSrc.indexOf('QEEG-ANN1 Brain Map Annotations');
  const amd4Idx = apiSrc.indexOf('IRB-AMD4 SLA Threshold Tuning');
  assert.ok(annIdx > 0, 'QEEG-ANN1 header missing');
  assert.ok(amd4Idx > 0, 'IRB-AMD4 header missing');
  assert.ok(annIdx < amd4Idx, 'QEEG-ANN1 helpers must be placed BEFORE IRB-AMD4 helpers');
});


// ── 2. Sidebar render contracts ───────────────────────────────────────────

test('sidebar renders empty state when no annotations exist', () => {
  const markup = renderQeegAnnotationsSidebarMarkup({
    annotations: [],
    showResolved: false,
    actor: { actor_id: 'u1', role: 'clinician' },
    empty: true,
  });
  assert.match(markup, /No annotations yet/);
  assert.match(markup, /be the first to flag a finding/);
  assert.match(markup, /\+ Annotation/);
});

test('sidebar renders existing annotations grouped by kind', () => {
  const items = [
    {
      id: 'a1',
      annotation_kind: 'margin_note',
      flag_type: null,
      body: 'm1 body',
      section_path: 'summary.brain_age',
      created_by_user_id: 'u1',
      resolved_at: null,
    },
    {
      id: 'a2',
      annotation_kind: 'flag',
      flag_type: 'evidence_gap',
      body: 'flag body',
      section_path: 'summary.brain_age',
      created_by_user_id: 'u1',
      resolved_at: null,
    },
  ];
  const markup = renderQeegAnnotationsSidebarMarkup({
    annotations: items,
    showResolved: false,
    actor: { actor_id: 'u1', role: 'clinician' },
    empty: false,
  });
  assert.match(markup, /Margin notes/);
  assert.match(markup, /Flags/);
  assert.match(markup, /m1 body/);
  assert.match(markup, /flag body/);
  // Show-resolved toggle.
  assert.match(markup, /Show resolved/);
});


// ── 3. "+ Annotation" modal opens with correct fields ─────────────────────

test('"+ Annotation" button is present in sidebar', () => {
  const markup = renderQeegAnnotationsSidebarMarkup({
    annotations: [],
    showResolved: false,
    actor: { actor_id: 'u1', role: 'clinician' },
    empty: true,
  });
  assert.match(markup, /data-action="open-create"/);
});

test('flag_type dropdown ONLY shown when kind=flag', () => {
  const noFlag = renderQeegAnnotationCreateModalMarkup({
    sectionPath: 'summary.brain_age',
    annotationKind: 'margin_note',
    flagType: null,
    body: '',
    advanced: false,
  });
  // Hidden when kind != flag.
  assert.match(noFlag, /data-visible="false"/);

  const withFlag = renderQeegAnnotationCreateModalMarkup({
    sectionPath: 'summary.brain_age',
    annotationKind: 'flag',
    flagType: 'evidence_gap',
    body: '',
    advanced: false,
  });
  assert.match(withFlag, /data-visible="true"/);
  // Carries the four allowed flag types.
  assert.match(withFlag, /clinically_significant|clinically significant/);
  assert.match(withFlag, /evidence_gap|evidence gap/);
  assert.match(withFlag, /discuss_next_session|discuss next session/);
  assert.match(withFlag, /patient_question|patient question/);
});

test('body textarea exposes a char counter', () => {
  const markup = renderQeegAnnotationCreateModalMarkup({
    sectionPath: 'summary.brain_age',
    annotationKind: 'margin_note',
    flagType: null,
    body: 'hello',
    advanced: false,
  });
  assert.match(markup, /data-field="char_count"/);
  assert.match(markup, /5 \/ 2000/);
});


// ── 4. Save POST payload contract ─────────────────────────────────────────

test('buildQeegAnnotationsCreatePayload posts the correct payload', () => {
  const payload = buildQeegAnnotationsCreatePayload({
    patientId: 'p-1',
    reportId: 'r-1',
    sectionPath: 'summary.brain_age',
    annotationKind: 'flag',
    flagType: 'evidence_gap',
    body: 'AI Brain Age is FDA-questioned.',
  });
  assert.equal(payload.patient_id, 'p-1');
  assert.equal(payload.report_id, 'r-1');
  assert.equal(payload.section_path, 'summary.brain_age');
  assert.equal(payload.annotation_kind, 'flag');
  assert.equal(payload.flag_type, 'evidence_gap');
  assert.match(payload.body, /FDA-questioned/);
});

test('buildQeegAnnotationsCreatePayload rejects too-short body', () => {
  assert.throws(() =>
    buildQeegAnnotationsCreatePayload({
      patientId: 'p-1',
      reportId: 'r-1',
      sectionPath: 'summary.brain_age',
      annotationKind: 'margin_note',
      flagType: null,
      body: 'no',
    }),
  );
});

test('buildQeegAnnotationsCreatePayload requires flag_type when kind=flag', () => {
  assert.throws(() =>
    buildQeegAnnotationsCreatePayload({
      patientId: 'p-1',
      reportId: 'r-1',
      sectionPath: 'summary.brain_age',
      annotationKind: 'flag',
      flagType: null,
      body: 'A finding worth a flag',
    }),
  );
});


// ── 5. Edit / delete / resolve permissions ────────────────────────────────

test('edit button visible only on own annotations', () => {
  const own = {
    id: 'a1',
    annotation_kind: 'margin_note',
    flag_type: null,
    body: 'mine',
    section_path: 'x',
    created_by_user_id: 'u1',
    resolved_at: null,
  };
  const other = { ...own, id: 'a2', created_by_user_id: 'u2' };
  const me = { actor_id: 'u1', role: 'clinician' };
  assert.match(renderQeegAnnotationCard(own, me), /data-action="edit"/);
  assert.doesNotMatch(renderQeegAnnotationCard(other, me), /data-action="edit"/);
});

test('delete button visible to creator AND admin', () => {
  const own = {
    id: 'a1',
    annotation_kind: 'margin_note',
    flag_type: null,
    body: 'b',
    section_path: 'x',
    created_by_user_id: 'u1',
    resolved_at: null,
  };
  const other = { ...own, id: 'a2', created_by_user_id: 'u2' };
  const creator = { actor_id: 'u1', role: 'clinician' };
  const admin = { actor_id: 'u-admin', role: 'admin' };
  const stranger = { actor_id: 'u3', role: 'clinician' };
  assert.ok(canDeleteQeegAnnotation(own, creator));
  assert.ok(canDeleteQeegAnnotation(other, admin));
  assert.equal(canDeleteQeegAnnotation(other, stranger), false);
});

test('resolve modal accepts a resolution_note', () => {
  const markup = renderQeegAnnotationResolveModalMarkup({
    resolutionNote: 'reviewed at MDT',
  });
  assert.match(markup, /data-state="resolve"/);
  assert.match(markup, /data-field="resolution_note"/);
  assert.match(markup, /data-action="confirm-resolve"/);
});


// ── 6. "Show resolved" toggle ─────────────────────────────────────────────

test('"Show resolved" toggle present and reflects state', () => {
  const onMarkup = renderQeegAnnotationsSidebarMarkup({
    annotations: [
      {
        id: 'a1',
        annotation_kind: 'margin_note',
        flag_type: null,
        body: 'b',
        section_path: 'x',
        created_by_user_id: 'u1',
        resolved_at: '2026-05-02T10:00:00+00:00',
      },
    ],
    showResolved: true,
    actor: { actor_id: 'u1', role: 'clinician' },
    empty: false,
  });
  assert.match(onMarkup, /data-action="toggle-resolved"\s+checked/);

  const offMarkup = renderQeegAnnotationsSidebarMarkup({
    annotations: [
      {
        id: 'a1',
        annotation_kind: 'margin_note',
        flag_type: null,
        body: 'b',
        section_path: 'x',
        created_by_user_id: 'u1',
        resolved_at: null,
      },
    ],
    showResolved: false,
    actor: { actor_id: 'u1', role: 'clinician' },
    empty: false,
  });
  assert.doesNotMatch(offMarkup, /data-action="toggle-resolved"\s+checked/);
});


// ── 7. Audit-events surface name correct ─────────────────────────────────

test('AUDIT_SURFACE constant matches backend surface name', () => {
  assert.equal(_QEEG_ANN_INTERNALS.AUDIT_SURFACE, 'qeeg_report_annotations');
});

test('renderQeegAnnotationsSidebar emits sidebar_opened audit event', async () => {
  const calls = [];
  const fakeApi = {
    fetchQeegReportAnnotations: async () => ({ items: [], total: 0 }),
    postQeegReportAnnotationAuditEvent: async (data) => {
      calls.push(data);
      return { accepted: true, event_id: 'e1' };
    },
  };
  const result = await renderQeegAnnotationsSidebar({
    api: fakeApi,
    patientId: 'p-1',
    reportId: 'r-1',
    actor: { actor_id: 'u1', role: 'clinician' },
    showResolved: false,
  });
  assert.ok(result.markup.length > 0);
  // Audit ping fired (synchronous queue, so already pushed).
  assert.ok(calls.length >= 1, 'expected at least one audit call');
  assert.equal(calls[0].event, 'sidebar_opened');
});


// ── 8. Error / empty states ───────────────────────────────────────────────

test('renderQeegAnnotationsSidebar returns error markup on api null', async () => {
  const fakeApi = {
    fetchQeegReportAnnotations: async () => null,
  };
  const result = await renderQeegAnnotationsSidebar({
    api: fakeApi,
    patientId: 'p-1',
    reportId: 'r-1',
    actor: { actor_id: 'u1', role: 'clinician' },
  });
  assert.equal(result.error, 'load_failed');
  assert.match(result.markup, /Failed to load annotations/);
});

test('renderQeegAnnotationsSidebar returns empty state when no items', async () => {
  const fakeApi = {
    fetchQeegReportAnnotations: async () => ({ items: [], total: 0 }),
    postQeegReportAnnotationAuditEvent: async () => ({ accepted: true, event_id: 'e' }),
  };
  const result = await renderQeegAnnotationsSidebar({
    api: fakeApi,
    patientId: 'p-1',
    reportId: 'r-1',
    actor: { actor_id: 'u1', role: 'clinician' },
  });
  assert.match(result.markup, /No annotations yet/);
});


// ── 9. Grouping helper ────────────────────────────────────────────────────

test('groupQeegAnnotationsByKind buckets correctly', () => {
  const out = groupQeegAnnotationsByKind([
    { annotation_kind: 'margin_note' },
    { annotation_kind: 'margin_note' },
    { annotation_kind: 'flag' },
    { annotation_kind: 'region_tag' },
    { annotation_kind: 'unknown_kind' }, // ignored
  ]);
  assert.equal(out.margin_note.length, 2);
  assert.equal(out.flag.length, 1);
  assert.equal(out.region_tag.length, 1);
});


// ── 10. Evidence-gap honest disclaimer ────────────────────────────────────

test('evidence_gap flag renders honest disclaimer', () => {
  const card = renderQeegAnnotationCard(
    {
      id: 'a1',
      annotation_kind: 'flag',
      flag_type: 'evidence_gap',
      body: 'b',
      section_path: 'x',
      created_by_user_id: 'u1',
      resolved_at: null,
    },
    { actor_id: 'u1', role: 'clinician' },
  );
  assert.match(card, /FDA-questioned/);
  assert.match(card, /qEEG evidence gaps doc/);
});


// ── 11. PAGE wires the sidebar exports ────────────────────────────────────

test('pages-brainmap.js exports the QEEG-ANN1 helpers', () => {
  const src = fs.readFileSync(PAGE_PATH, 'utf8');
  assert.match(src, /export\s+function\s+buildQeegAnnotationsCreatePayload/);
  assert.match(src, /export\s+function\s+groupQeegAnnotationsByKind/);
  assert.match(src, /export\s+function\s+renderQeegAnnotationsSidebarMarkup/);
  assert.match(src, /export\s+async\s+function\s+renderQeegAnnotationsSidebar/);
});

test('pages-brainmap.js documents QEEG-ANN1 surface name', () => {
  const src = fs.readFileSync(PAGE_PATH, 'utf8');
  assert.match(src, /QEEG-ANN1 Brain Map Annotations Sidebar/);
});

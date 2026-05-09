// Tests for registries.js
// Pins: registry counts, required fields, evidence grades, ICD-10 presence,
// on-label arrays, and specific clinical safety entries.

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  CONDITION_REGISTRY,
  ASSESSMENT_REGISTRY,
  PROTOCOL_REGISTRY,
  DEVICE_REGISTRY,
  HANDBOOK_REGISTRY,
} from './registries.js';

// ── CONDITION_REGISTRY ────────────────────────────────────────────────────────
describe('CONDITION_REGISTRY', () => {
  it('has at least 50 conditions', () => {
    assert.ok(CONDITION_REGISTRY.length >= 50, `got ${CONDITION_REGISTRY.length}`);
  });

  it('every entry has id, name, icd10, cat, ev, modalities', () => {
    for (const c of CONDITION_REGISTRY) {
      assert.ok(c.id,        `missing id on ${JSON.stringify(c)}`);
      assert.ok(c.name,      `missing name on ${c.id}`);
      assert.ok(c.icd10,     `missing icd10 on ${c.id}`);
      assert.ok(c.cat,       `missing cat on ${c.id}`);
      assert.ok(c.ev,        `missing ev on ${c.id}`);
      assert.ok(Array.isArray(c.modalities), `modalities not array on ${c.id}`);
    }
  });

  it('MDD (id=mdd) has ev=A and is on-label for TMS/rTMS', () => {
    const mdd = CONDITION_REGISTRY.find(c => c.id === 'mdd');
    assert.ok(mdd, 'mdd not found');
    assert.strictEqual(mdd.ev, 'A');
    assert.ok(mdd.onLabel.includes('TMS/rTMS'), 'TMS/rTMS not in mdd.onLabel');
  });

  it('OCD (id=ocd) has seizure-check flag and is on-label for TMS/rTMS', () => {
    const ocd = CONDITION_REGISTRY.find(c => c.id === 'ocd');
    assert.ok(ocd, 'ocd not found');
    assert.ok(ocd.flags.includes('seizure-check'), 'no seizure-check flag on ocd');
    assert.ok(ocd.onLabel.includes('TMS/rTMS'), 'TMS/rTMS not in ocd.onLabel');
  });

  it('PTSD (id=ptsd) uses CAPS-5 assessment', () => {
    const ptsd = CONDITION_REGISTRY.find(c => c.id === 'ptsd');
    assert.ok(ptsd, 'ptsd not found');
    assert.ok(ptsd.assessments.includes('caps5'), 'caps5 missing from ptsd assessments');
  });

  it('all evidence grades are one of A B C D', () => {
    const valid = new Set(['A', 'B', 'C', 'D']);
    for (const c of CONDITION_REGISTRY) {
      assert.ok(valid.has(c.ev), `invalid ev "${c.ev}" on ${c.id}`);
    }
  });

  it('epilepsy entry has taVNS on-label', () => {
    const epi = CONDITION_REGISTRY.find(c => c.id === 'epilepsy');
    assert.ok(epi, 'epilepsy not found');
    assert.ok(epi.onLabel.includes('taVNS'), 'taVNS missing from epilepsy.onLabel');
  });
});

// ── ASSESSMENT_REGISTRY ───────────────────────────────────────────────────────
describe('ASSESSMENT_REGISTRY', () => {
  it('has at least 15 instruments', () => {
    assert.ok(ASSESSMENT_REGISTRY.length >= 15, `got ${ASSESSMENT_REGISTRY.length}`);
  });

  it('every entry has id, name, domain, type, items, mins, ev, scoring', () => {
    for (const a of ASSESSMENT_REGISTRY) {
      assert.ok(a.id,      `missing id: ${JSON.stringify(a)}`);
      assert.ok(a.name,    `missing name on ${a.id}`);
      assert.ok(a.domain,  `missing domain on ${a.id}`);
      assert.ok(a.type,    `missing type on ${a.id}`);
      assert.ok(a.items,   `missing items on ${a.id}`);
      assert.ok(a.mins,    `missing mins on ${a.id}`);
      assert.ok(a.ev,      `missing ev on ${a.id}`);
      assert.ok(a.scoring, `missing scoring on ${a.id}`);
    }
  });

  it('PHQ-9 (id=phq9) is self-report with 9 items', () => {
    const phq = ASSESSMENT_REGISTRY.find(a => a.id === 'phq9');
    assert.ok(phq, 'phq9 not found');
    assert.strictEqual(phq.type, 'Self-report');
    assert.strictEqual(phq.items, 9);
  });

  it('CAPS-5 is a Clinician-administered instrument', () => {
    const caps = ASSESSMENT_REGISTRY.find(a => a.id === 'caps5');
    assert.ok(caps, 'caps5 not found');
    assert.strictEqual(caps.type, 'Clinician');
    assert.ok(caps.scoring.includes('Gold standard'));
  });

  it('CGI covers all conditions (conditions includes "all")', () => {
    const cgi = ASSESSMENT_REGISTRY.find(a => a.id === 'cgi');
    assert.ok(cgi, 'cgi not found');
    assert.ok(cgi.conditions.includes('all'), 'CGI conditions should include "all"');
  });
});

// ── PROTOCOL_REGISTRY ─────────────────────────────────────────────────────────
describe('PROTOCOL_REGISTRY', () => {
  it('has at least 10 protocols', () => {
    assert.ok(PROTOCOL_REGISTRY.length >= 10, `got ${PROTOCOL_REGISTRY.length}`);
  });

  it('every entry has id, name, condition, modality, target, ev, sessions', () => {
    for (const p of PROTOCOL_REGISTRY) {
      assert.ok(p.id,       `missing id: ${JSON.stringify(p)}`);
      assert.ok(p.name,     `missing name on ${p.id}`);
      assert.ok(p.condition,`missing condition on ${p.id}`);
      assert.ok(p.modality, `missing modality on ${p.id}`);
      assert.ok(p.target,   `missing target on ${p.id}`);
      assert.ok(p.ev,       `missing ev on ${p.id}`);
      assert.ok(p.sessions, `missing sessions on ${p.id}`);
    }
  });

  it('MDD DLPFC HF-TMS protocol is on-label and ev=A', () => {
    const p = PROTOCOL_REGISTRY.find(x => x.id === 'tms-mdd-dlpfc-hf');
    assert.ok(p, 'tms-mdd-dlpfc-hf not found');
    assert.ok(p.onLabel === true, 'mdd-dlpfc-hf should be on-label');
    assert.strictEqual(p.ev, 'A');
  });

  it('taVNS epilepsy protocol has 90 sessions and is on-label', () => {
    const p = PROTOCOL_REGISTRY.find(x => x.id === 'tavns-epilepsy');
    assert.ok(p, 'tavns-epilepsy not found');
    assert.strictEqual(p.sessions, 90);
    assert.ok(p.onLabel === true);
  });
});

// ── DEVICE_REGISTRY ───────────────────────────────────────────────────────────
describe('DEVICE_REGISTRY', () => {
  it('has at least 5 devices', () => {
    assert.ok(DEVICE_REGISTRY.length >= 5, `got ${DEVICE_REGISTRY.length}`);
  });

  it('every entry has id, name, mfr, modality, clearance', () => {
    for (const d of DEVICE_REGISTRY) {
      assert.ok(d.id,        `missing id: ${JSON.stringify(d)}`);
      assert.ok(d.name,      `missing name on ${d.id}`);
      assert.ok(d.mfr,       `missing mfr on ${d.id}`);
      assert.ok(d.modality,  `missing modality on ${d.id}`);
      assert.ok(d.clearance, `missing clearance on ${d.id}`);
    }
  });

  it('BrainsWay H7 indicates OCD and is Clinic use', () => {
    const d = DEVICE_REGISTRY.find(x => x.id === 'brainsway-h7');
    assert.ok(d, 'brainsway-h7 not found');
    assert.ok(d.indication.includes('OCD'), 'brainsway-h7 should indicate OCD');
    assert.strictEqual(d.homeClinic, 'Clinic');
  });
});

// ── HANDBOOK_REGISTRY ─────────────────────────────────────────────────────────
describe('HANDBOOK_REGISTRY', () => {
  it('has at least 10 handbooks', () => {
    assert.ok(HANDBOOK_REGISTRY.length >= 10, `got ${HANDBOOK_REGISTRY.length}`);
  });

  it('Safety manual exists and covers all conditions', () => {
    const hb = HANDBOOK_REGISTRY.find(x => x.id === 'hb-safety');
    assert.ok(hb, 'hb-safety not found');
    assert.strictEqual(hb.condition, 'all');
  });
});

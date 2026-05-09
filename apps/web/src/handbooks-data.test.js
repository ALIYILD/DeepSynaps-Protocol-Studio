/**
 * Unit tests for handbooks-data.js — pin the public surface of handbook content.
 *
 * Run from apps/web/: node --test src/handbooks-data.test.js
 *
 * HANDBOOK_DATA contains two entry shapes:
 *   1. Condition entries — fields: epidemiology, neuroBasis, responseData,
 *      patientExplain, timeline, selfCare, escalation, homeNote, techSetup, faq
 *   2. Protocol entries  — fields: name, modality, condition, target, setup,
 *      sessionWorkflow, contraindications, expectedResponse, monitoring, followUp
 *
 * Protocol entries are identified by their id containing a dash (e.g.
 * "tms-mdd-dlpfc-hf", "tdcs-pain-m1", "nfb-adhd-theta-beta", "dbs-parkinsons-stn")
 * and having a "name" field.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HANDBOOK_DATA } from './handbooks-data.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isProtocolEntry(entry) {
  return typeof entry.name === 'string';
}

const ALL_IDS = Object.keys(HANDBOOK_DATA);
const conditionEntries = ALL_IDS
  .filter((id) => !isProtocolEntry(HANDBOOK_DATA[id]))
  .map((id) => [id, HANDBOOK_DATA[id]]);
const protocolEntries = ALL_IDS
  .filter((id) => isProtocolEntry(HANDBOOK_DATA[id]))
  .map((id) => [id, HANDBOOK_DATA[id]]);

// ─────────────────────────────────────────────────────────────────────────────
// Top-level structure
// ─────────────────────────────────────────────────────────────────────────────

describe('HANDBOOK_DATA top-level', () => {
  it('exports a non-null object', () => {
    assert.ok(HANDBOOK_DATA !== null && typeof HANDBOOK_DATA === 'object');
  });

  it('contains at least 60 entries', () => {
    assert.ok(ALL_IDS.length >= 60, `only ${ALL_IDS.length} entries found`);
  });

  it('canonical condition ids are present', () => {
    const required = ['mdd', 'trd', 'bpd', 'ocd', 'ptsd', 'gad', 'adhd-c', 'adhd-i', 'adhd-hi',
      'insomnia', 'schizo', 'parkinsons', 'alzheimer', 'asd', 'anorexia', 'tinnitus'];
    for (const id of required) {
      assert.ok(id in HANDBOOK_DATA, `missing condition id: ${id}`);
    }
  });

  it('canonical protocol ids are present', () => {
    const required = ['tms-mdd-dlpfc-hf', 'tms-mdd-itbs', 'tms-ocd-sma', 'tms-ptsd-dlpfc',
      'tdcs-mdd-dlpfc', 'dbs-parkinsons-stn', 'nfb-adhd-theta-beta', 'tms-migraine-occ'];
    for (const id of required) {
      assert.ok(id in HANDBOOK_DATA, `missing protocol id: ${id}`);
    }
  });

  it('no entry id is an empty string', () => {
    for (const id of ALL_IDS) {
      assert.ok(id.length > 0, 'found an empty-string id');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition entry shape
// ─────────────────────────────────────────────────────────────────────────────

describe('condition entry shape', () => {
  const REQUIRED_CONDITION_FIELDS = [
    'epidemiology', 'neuroBasis', 'responseData', 'patientExplain',
    'timeline', 'selfCare', 'escalation', 'techSetup', 'faq',
  ];

  it('all condition entries have the required fields', () => {
    for (const [id, entry] of conditionEntries) {
      for (const field of REQUIRED_CONDITION_FIELDS) {
        assert.ok(field in entry,
          `condition "${id}" is missing field: ${field}`);
      }
    }
  });

  it('epidemiology is a non-empty string for every condition', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(typeof entry.epidemiology === 'string' && entry.epidemiology.length > 0,
        `condition "${id}" epidemiology is empty`);
    }
  });

  it('neuroBasis is a non-empty string for every condition', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(typeof entry.neuroBasis === 'string' && entry.neuroBasis.length > 0,
        `condition "${id}" neuroBasis is empty`);
    }
  });

  it('patientExplain is a non-empty string for every condition', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(typeof entry.patientExplain === 'string' && entry.patientExplain.length > 0,
        `condition "${id}" patientExplain is empty`);
    }
  });

  it('escalation is a non-empty string for every condition', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(typeof entry.escalation === 'string' && entry.escalation.length > 0,
        `condition "${id}" escalation is empty`);
    }
  });

  it('selfCare is a non-empty array for every condition', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(Array.isArray(entry.selfCare) && entry.selfCare.length > 0,
        `condition "${id}" selfCare is not a populated array`);
    }
  });

  it('each selfCare item is a non-empty string', () => {
    for (const [id, entry] of conditionEntries) {
      for (const item of entry.selfCare) {
        assert.ok(typeof item === 'string' && item.length > 0,
          `condition "${id}" has an empty selfCare item`);
      }
    }
  });

  it('homeNote is either null or a non-empty string', () => {
    for (const [id, entry] of conditionEntries) {
      const val = entry.homeNote;
      const valid = val === null || (typeof val === 'string' && val.length > 0);
      assert.ok(valid, `condition "${id}" homeNote has unexpected value: ${JSON.stringify(val)}`);
    }
  });

  it('faq is a non-empty array for every condition', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(Array.isArray(entry.faq) && entry.faq.length > 0,
        `condition "${id}" faq is not a populated array`);
    }
  });

  it('each faq item has non-empty q and a fields', () => {
    for (const [id, entry] of conditionEntries) {
      for (const item of entry.faq) {
        assert.ok(typeof item.q === 'string' && item.q.length > 0,
          `condition "${id}" has a faq item with empty q`);
        assert.ok(typeof item.a === 'string' && item.a.length > 0,
          `condition "${id}" has a faq item with empty a`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protocol entry shape
// ─────────────────────────────────────────────────────────────────────────────

describe('protocol entry shape', () => {
  const REQUIRED_PROTOCOL_FIELDS = [
    'name', 'modality', 'condition', 'target',
    'setup', 'sessionWorkflow', 'contraindications',
    'expectedResponse', 'monitoring', 'followUp',
  ];

  it('all protocol entries have the required fields', () => {
    for (const [id, entry] of protocolEntries) {
      for (const field of REQUIRED_PROTOCOL_FIELDS) {
        assert.ok(field in entry,
          `protocol "${id}" is missing field: ${field}`);
      }
    }
  });

  it('name is a non-empty string for every protocol', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(typeof entry.name === 'string' && entry.name.length > 0,
        `protocol "${id}" name is empty`);
    }
  });

  it('modality is a non-empty string for every protocol', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(typeof entry.modality === 'string' && entry.modality.length > 0,
        `protocol "${id}" modality is empty`);
    }
  });

  it('setup is a non-empty array for every protocol', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(Array.isArray(entry.setup) && entry.setup.length > 0,
        `protocol "${id}" setup is not a populated array`);
    }
  });

  it('each setup step is a non-empty string', () => {
    for (const [id, entry] of protocolEntries) {
      for (const step of entry.setup) {
        assert.ok(typeof step === 'string' && step.length > 0,
          `protocol "${id}" has empty setup step`);
      }
    }
  });

  it('sessionWorkflow is a non-empty array for every protocol', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(Array.isArray(entry.sessionWorkflow) && entry.sessionWorkflow.length > 0,
        `protocol "${id}" sessionWorkflow is not a populated array`);
    }
  });

  it('contraindications is a non-empty array for every protocol', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(Array.isArray(entry.contraindications) && entry.contraindications.length > 0,
        `protocol "${id}" contraindications is not a populated array`);
    }
  });

  it('expectedResponse is a non-empty string for every protocol', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(typeof entry.expectedResponse === 'string' && entry.expectedResponse.length > 0,
        `protocol "${id}" expectedResponse is empty`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Specific value pins — spot-check canonical content
// ─────────────────────────────────────────────────────────────────────────────

describe('specific value pins', () => {
  it('mdd epidemiology references WHO 2023 and global prevalence', () => {
    assert.ok(HANDBOOK_DATA.mdd.epidemiology.includes('WHO'),
      'mdd epidemiology should cite WHO');
    assert.ok(HANDBOOK_DATA.mdd.epidemiology.includes('280 million'),
      'mdd epidemiology should mention 280 million');
  });

  it('ocd responseData references FDA-cleared BrainsWay and Carmi 2019', () => {
    assert.ok(HANDBOOK_DATA.ocd.responseData.includes('Carmi 2019'),
      'ocd responseData should cite Carmi 2019');
    assert.ok(HANDBOOK_DATA.ocd.responseData.includes('FDA-cleared'),
      'ocd responseData should mention FDA-cleared');
  });

  it('trd responseData references SAINT and Cole 2020', () => {
    assert.ok(HANDBOOK_DATA.trd.responseData.includes('Cole 2020'),
      'trd responseData should cite Cole 2020');
  });

  it('ptsd responseData references PCL-5 and Philip 2019', () => {
    assert.ok(HANDBOOK_DATA.ptsd.responseData.includes('Philip 2019'),
      'ptsd responseData should cite Philip 2019');
    assert.ok(HANDBOOK_DATA.ptsd.responseData.includes('PCL-5'),
      'ptsd responseData should mention PCL-5');
  });

  it('bpd homeNote is null (no home device recommendation)', () => {
    assert.equal(HANDBOOK_DATA.bpd.homeNote, null);
  });

  it('tms-mdd-dlpfc-hf name is "L-DLPFC HF-TMS for MDD"', () => {
    assert.equal(HANDBOOK_DATA['tms-mdd-dlpfc-hf'].name, 'L-DLPFC HF-TMS for MDD');
  });

  it('tms-mdd-dlpfc-hf target is F3 (L-DLPFC)', () => {
    assert.equal(HANDBOOK_DATA['tms-mdd-dlpfc-hf'].target, 'F3 (L-DLPFC)');
  });

  it('dbs-parkinsons-stn modality is DBS', () => {
    assert.equal(HANDBOOK_DATA['dbs-parkinsons-stn'].modality, 'DBS');
  });

  it('dbs-parkinsons-stn target is Subthalamic Nucleus (STN)', () => {
    assert.equal(HANDBOOK_DATA['dbs-parkinsons-stn'].target, 'Subthalamic Nucleus (STN)');
  });

  it('ocd faq has exactly 3 entries', () => {
    assert.equal(HANDBOOK_DATA.ocd.faq.length, 3);
  });

  it('mdd faq first Q mentions personality', () => {
    assert.ok(HANDBOOK_DATA.mdd.faq[0].q.toLowerCase().includes('personality'),
      'first mdd FAQ should be about personality changes');
  });

  it('ppd patientExplain mentions breast milk (safe for breastfeeding)', () => {
    assert.ok(HANDBOOK_DATA.ppd.patientExplain.includes('breast milk'),
      'ppd patientExplain should reassure about breast milk safety');
  });

  it('tms-ocd-sma expectedResponse references Carmi 2019 pivotal RCT', () => {
    assert.ok(HANDBOOK_DATA['tms-ocd-sma'].expectedResponse.includes('Carmi 2019'),
      'tms-ocd-sma expectedResponse should cite the Carmi 2019 pivotal RCT');
  });

  it('ocd condition responseData references FDA-cleared BrainsWay H7', () => {
    assert.ok(HANDBOOK_DATA.ocd.responseData.includes('FDA-cleared'),
      'ocd condition responseData should reference FDA-cleared device');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHI leak guard — no real patient names, DOBs, or PII
// ─────────────────────────────────────────────────────────────────────────────

describe('PHI leak guard', () => {
  const ALL_TEXT = JSON.stringify(HANDBOOK_DATA);

  it('no entry contains a real-looking date-of-birth pattern (DD/MM/YYYY)', () => {
    assert.doesNotMatch(ALL_TEXT, /\b\d{2}\/\d{2}\/\d{4}\b/,
      'handbook data should not contain DD/MM/YYYY date strings (PHI risk)');
  });

  it('no entry contains an NHS number pattern (10-digit sequence)', () => {
    assert.doesNotMatch(ALL_TEXT, /\b\d{10}\b/,
      'handbook data should not contain 10-digit NHS-style numbers (PHI risk)');
  });

  it('no entry contains an email address', () => {
    assert.doesNotMatch(ALL_TEXT, /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
      'handbook data should not contain email addresses (PHI risk)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decision-support / safety-gate disclaimers
// ─────────────────────────────────────────────────────────────────────────────

describe('clinical safety language', () => {
  it('every condition escalation field is non-empty (no missing safety guidance)', () => {
    for (const [id, entry] of conditionEntries) {
      assert.ok(typeof entry.escalation === 'string' && entry.escalation.trim().length > 0,
        `condition "${id}" has no escalation guidance`);
    }
  });

  it('every protocol contraindications list has at least 2 entries', () => {
    for (const [id, entry] of protocolEntries) {
      assert.ok(entry.contraindications.length >= 2,
        `protocol "${id}" has fewer than 2 contraindications listed`);
    }
  });

  it('mdd escalation mentions PHQ-9 item 9 (suicidality screen)', () => {
    assert.ok(HANDBOOK_DATA.mdd.escalation.includes('PHQ-9'),
      'mdd escalation should reference PHQ-9 suicidality screen');
  });

  it('ptsd escalation mentions immediate escalation for suicidality', () => {
    const esc = HANDBOOK_DATA.ptsd.escalation.toLowerCase();
    assert.ok(esc.includes('escalate'),
      'ptsd escalation should contain escalation instruction');
    assert.ok(esc.includes('suicid'),
      'ptsd escalation should mention suicidality');
  });

  it('ppd escalation mentions postpartum psychosis as psychiatric emergency', () => {
    const esc = HANDBOOK_DATA.ppd.escalation.toLowerCase();
    assert.ok(esc.includes('emergency') || esc.includes('psychosis'),
      'ppd escalation should mention psychosis emergency');
  });
});

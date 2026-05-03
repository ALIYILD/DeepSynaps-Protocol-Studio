/**
 * Virtual Care / Live Session — layout and governance strings stay stable for clinic preview.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'pages-virtualcare.js'), 'utf8');

test('Live Session workspace contains governance and honest labels', () => {
  assert.ok(SRC.includes('Live Session workspace'), 'empty-state heading');
  assert.ok(SRC.includes('decision support'), 'governance wording');
  assert.ok(SRC.includes('Clinical readiness checklist') || SRC.includes('Governance'), 'checklist / governance section');
  assert.ok(SRC.includes('virtual-care write APIs are patient-scoped'), 'API honesty comment');
});

test('route entry: live-session loads unified Virtual Care', async () => {
  const appSrc = readFileSync(join(__dirname, 'app.js'), 'utf8');
  assert.ok(appSrc.includes("case 'live-session'"));
  assert.ok(appSrc.includes('loadVirtualCare'));
});

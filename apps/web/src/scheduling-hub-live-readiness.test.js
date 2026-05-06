import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Scheduling Hub demo banner includes non-PHI + safety copy', () => {
  const srcPath = path.join(__dirname, 'pages-clinical-hubs.js');
  const js = fs.readFileSync(srcPath, 'utf8');
  assert.ok(
    js.includes('synthetic sample sessions (non-PHI)'),
    'Expected demo banner to explicitly state synthetic non-PHI sessions',
  );
  assert.ok(
    js.includes('Controlled preview: scheduling supports workflow only'),
    'Expected demo banner to include controlled preview safety statement',
  );
});

